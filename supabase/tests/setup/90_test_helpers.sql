-- Small helpers for the privacy tests. Loaded after the migrations, into the test database only.
--
--   t.person('alex')            make a member's account, returns its id
--   t.account('kim')            make a sign-in account that has not joined yet
--   t.id('alex')                that account's id
--   t.as('alex')                act as that signed-in account, through row level security
--   t.as_signed_out()           act as a visitor with no account
--   t.as_setup()                back to the all-powerful test role, for arranging things
--   t.ok / t.is / t.sees        checks
--   t.refused / t.changes       run a statement and check it fails / how many rows it touched
--   t.finish()                  fail the file if any check failed

create schema t;
grant usage on schema t to anon, authenticated;

create table t.results (n serial, passed boolean not null, what text not null);
grant all on t.results to anon, authenticated;
grant all on sequence t.results_n_seq to anon, authenticated;

create function t.id(p_name text) returns uuid language sql immutable as $$
  select md5('tandem-roads-test:' || p_name)::uuid;
$$;

-- A sign-in account only: it has confirmed its email but has not joined (no profile yet).
create function t.account(p_name text) returns uuid language plpgsql as $$
begin
  insert into auth.users (id, email, email_confirmed_at)
  values (t.id(p_name), p_name || '@example.test', now());
  return t.id(p_name);
end;
$$;

-- A member: a sign-in account that has joined, as if through an invite.
create function t.person(p_name text) returns uuid language plpgsql as $$
begin
  perform t.account(p_name);
  perform private.make_member(t.id(p_name), initcap(p_name), '18+');
  return t.id(p_name);
end;
$$;

create function t.as(p_name text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', t.id(p_name), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function t.as_signed_out() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end;
$$;

create function t.as_setup() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'none', true);
end;
$$;

create function t.ok(p_passed boolean, p_what text) returns void language plpgsql as $$
begin
  insert into t.results (passed, what) values (coalesce(p_passed, false), p_what);
  raise notice '%', case when coalesce(p_passed, false) then 'ok      ' else 'NOT OK  ' end || p_what;
end;
$$;

create function t.is(p_got anyelement, p_want anyelement, p_what text) returns void language plpgsql as $$
begin
  if p_got is not distinct from p_want then
    perform t.ok(true, p_what);
  else
    perform t.ok(false, p_what || '  (got ' || coalesce(p_got::text, 'null') || ', wanted ' || coalesce(p_want::text, 'null') || ')');
  end if;
end;
$$;

-- How many rows the current person gets back from a query.
create function t.sees(p_query text, p_want bigint, p_what text) returns void language plpgsql as $$
declare v bigint;
begin
  execute 'select count(*) from (' || p_query || ') q' into v;
  perform t.is(v, p_want, p_what);
end;
$$;

-- The statement must be refused by a rule, a grant or a check.
create function t.refused(p_statement text, p_what text) returns void language plpgsql as $$
begin
  begin
    execute p_statement;
  exception
    -- Refused by a grant or a row rule (42501), a check (23514), a duplicate (23505) or a
    -- missing parent row (23503). Anything else is a broken test, not a refusal.
    when insufficient_privilege or check_violation or unique_violation or foreign_key_violation then
      perform t.ok(true, p_what);
      return;
    when others then
      perform t.ok(false, p_what || '  (unexpected error: ' || sqlerrm || ')');
      return;
  end;
  perform t.ok(false, p_what || '  (it was allowed)');
end;
$$;

-- The statement must run and touch exactly this many rows. Row level security hides rows from
-- updates and deletes without raising an error, so "0 rows" is how a blocked change shows up.
create function t.changes(p_statement text, p_want bigint, p_what text) returns void language plpgsql as $$
declare v bigint;
begin
  begin
    execute p_statement;
    get diagnostics v = row_count;
  exception when others then
    perform t.ok(false, p_what || '  (error: ' || sqlerrm || ')');
    return;
  end;
  perform t.is(v, p_want, p_what);
end;
$$;

create function t.finish() returns void language plpgsql as $$
declare v_failed int; v_total int;
begin
  perform t.as_setup();
  select count(*) filter (where not passed), count(*) into v_failed, v_total from t.results;
  if v_total = 0 then
    raise exception 'No checks ran';
  end if;
  if v_failed > 0 then
    raise exception '% of % checks failed', v_failed, v_total;
  end if;
  raise notice '% checks passed', v_total;
end;
$$;

grant execute on all functions in schema t to anon, authenticated;

-- The trip most tests start from: Alex and Sam are the travellers of a trip that ended three
-- days ago. Maya is Alex's friend (not yet a viewer), Jo is a friend of both, Leo is a stranger
-- with an account, and Am runs the app. One stop each, one photo each.
create function t.sample_trip() returns uuid language plpgsql as $$
declare v_trip uuid;
begin
  perform t.person(n) from unnest(array['alex', 'sam', 'jo', 'maya', 'leo', 'am']) n;
  insert into public.app_admins values (t.id('am'));
  insert into public.friendships (requester_id, addressee_id, status) values
    (t.id('alex'), t.id('sam'), 'accepted'),
    (t.id('alex'), t.id('maya'), 'accepted'),
    (t.id('jo'), t.id('alex'), 'accepted'),
    (t.id('jo'), t.id('sam'), 'accepted');
  insert into public.places (id, kind, name) values ('tokyo-sensoji', 'guide', 'Senso-ji');

  perform t.as('alex');
  v_trip := public.create_trip('Japan, the four of us', current_date - 12, current_date - 3);
  perform t.as_setup();

  insert into public.trip_travellers (trip_id, account_id, status) values (v_trip, t.id('sam'), 'active');
  insert into public.trip_traveller_settings (trip_id, account_id) values (v_trip, t.id('sam'));
  insert into public.trip_stops (id, trip_id, place_id, note, logged_by) values
    (t.id('stop-alex'), v_trip, 'tokyo-sensoji', 'Bags dropped, straight here.', t.id('alex')),
    (t.id('stop-sam'), v_trip, 'tokyo-sensoji', 'Went back at night.', t.id('sam'));
  insert into public.photos (id, trip_id, stop_id, added_by) values
    (t.id('photo-alex'), v_trip, t.id('stop-alex'), t.id('alex')),
    (t.id('photo-sam'), v_trip, t.id('stop-sam'), t.id('sam'));
  insert into storage.objects (bucket_id, name, owner_id) values
    ('trip-photos', v_trip || '/' || t.id('photo-alex') || '.jpg', t.id('alex')::text),
    ('trip-photos', v_trip || '/' || t.id('photo-sam') || '.jpg', t.id('sam')::text);
  return v_trip;
end;
$$;

-- Maya becomes a viewer the proper way: Alex proposes her, Sam approves, and both travellers
-- choose to share once the trip is over.
create function t.share_with_maya(p_trip uuid) returns void language plpgsql as $$
begin
  perform t.as('alex');
  insert into public.trip_viewers (trip_id, viewer_id, invited_by) values (p_trip, t.id('maya'), t.id('alex'));
  update public.trip_traveller_settings set audience_choice = 'viewers_after' where account_id = t.id('alex');
  perform t.as('sam');
  insert into public.trip_viewer_approvals (trip_id, viewer_id, traveller_id) values (p_trip, t.id('maya'), t.id('sam'));
  update public.trip_traveller_settings set audience_choice = 'viewers_after' where account_id = t.id('sam');
  perform t.as_setup();
end;
$$;

grant execute on all functions in schema t to anon, authenticated;
