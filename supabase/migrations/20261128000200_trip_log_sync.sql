-- Tandem Roads: logging a trip together.
--
-- Every traveller's phone keeps its own copy of the trip's log and a queue of the changes made on
-- it, so "I'm here" works with no signal. This is what those phones send and fetch. The app's side
-- is in src/tlsync.js; the whole design is in docs/trip-sync.md.
--
-- Rules added here (tests: supabase/tests/95_trip_log.sql):
--   1. Any traveller can log a stop. Whoever logged it can change or remove it. Everyone else
--      suggests a correction, which the person who logged it accepts or turns down. A stop whose
--      logger has left the trip belongs to the group, and any traveller can change it.
--   2. Anyone in the group can close a stop that is still open (the time you left), because that
--      completes it rather than changing what someone wrote. A time already there is a correction.
--   3. "I wasn't there": a traveller can take themselves off a stop someone else logged.
--   4. Times are the clock at the place, as the phones showed it there, so a day in Kyoto reads in
--      Kyoto's time for everyone, wherever they look at it from.
--   5. Removing a stop never takes anyone's photos with it: they stay on the trip, unplaced.
--   6. Every change counts up the trip's log version, so a phone fetches the log only when
--      something changed.
--   7. Viewers never get corrections or "I wasn't there". Those stay among the travellers.

-- ---------------------------------------------------------------------------------------------
-- Stops: times at the place, who may change what
-- ---------------------------------------------------------------------------------------------

alter table public.trip_stops
  alter column arrived_at type time using (arrived_at at time zone 'UTC')::time,
  alter column left_at type time using (left_at at time zone 'UTC')::time,
  -- Times worked out rather than tapped (caught up from photos, or closed an hour on).
  add column est boolean not null default false,
  add column updated_at timestamptz not null default now(),
  add constraint trip_stops_times check (
    (arrived_at is null or day is not null)
    and (left_at is null or (arrived_at is not null and left_at > arrived_at))
  ),
  add constraint trip_stops_plain_note check (
    coalesce(note, '') !~ '[\x01-\x09\x0b-\x1f\x7f-\x9f‪-‮⁦-⁩﻿]'
  );
comment on column public.trip_stops.arrived_at is 'Clock time at the place when the group arrived';
comment on column public.trip_stops.left_at is 'Clock time at the place when the group left; empty while still there';
grant insert (est) on public.trip_stops to authenticated;
grant update (est) on public.trip_stops to authenticated;

create function private.touch_stop() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger touch_stop before update on public.trip_stops
  for each row execute function private.touch_stop();

-- Only whoever logged a stop changes or removes it; a stop with no logger (they left the trip)
-- is the group's. The logger column itself cannot be changed by anyone.
drop policy trip_stops_edit on public.trip_stops;
create policy trip_stops_edit on public.trip_stops for update to authenticated
  using (
    private.is_traveller(trip_id)
    and (logged_by = (select auth.uid()) or logged_by is null)
  )
  with check (
    private.is_traveller(trip_id)
    and (logged_by = (select auth.uid()) or logged_by is null)
    and exists (select 1 from public.places p where p.id = place_id)
  );
drop policy trip_stops_remove on public.trip_stops;
create policy trip_stops_remove on public.trip_stops for delete to authenticated
  using (
    private.is_traveller(trip_id)
    and (logged_by = (select auth.uid()) or logged_by is null)
  );

-- At most 3,000 stops on a trip, the same as a phone keeps.
create function private.guard_stop_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.trip_stops s where s.trip_id = new.trip_id) >= 3000 then
    raise exception 'This trip already has 3,000 stops' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger guard_stop_count before insert on public.trip_stops
  for each row execute function private.guard_stop_count();

-- "We've left", from anyone in the group, for a stop that is still open. Returns false when
-- someone closed it first, whose time then stands.
create function public.close_stop(p_stop uuid, p_left time) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v public.trip_stops;
begin
  select * into v from public.trip_stops s where s.id = p_stop for update;
  if not found or not private.is_traveller(v.trip_id) then
    raise exception 'That stop is not on any of your trips' using errcode = 'insufficient_privilege';
  end if;
  if v.left_at is not null then
    return false;
  end if;
  if v.arrived_at is null or p_left is null or p_left <= v.arrived_at then
    raise exception 'The leaving time has to be after the arrival' using errcode = 'check_violation';
  end if;
  update public.trip_stops s set left_at = p_left where s.id = p_stop;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Places members add, and photos: plain text, and a removed stop keeps its photos
-- ---------------------------------------------------------------------------------------------

alter table public.places
  add constraint places_plain_text check (
    kind = 'guide' or (
      name ~ '[^[:space:]]'
      and name !~ '[\x01-\x1f\x7f-\x9f‪-‮⁦-⁩﻿]'
      and coalesce(local_name, '') !~ '[\x01-\x1f\x7f-\x9f‪-‮⁦-⁩﻿]'
    )
  ),
  add constraint places_short_refs check (
    char_length(city_id) <= 80 and char_length(country) <= 80
    and (osm_ref is null or osm_ref ~ '^(node|way|relation)/[0-9]{1,12}$')
  );

-- The clock time at the place when the photo was taken, as the camera saw it.
alter table public.photos
  alter column taken_at type timestamp using (taken_at at time zone 'UTC'),
  add constraint photos_plain_caption check (
    coalesce(caption, '') !~ '[\x01-\x1f\x7f-\x9f‪-‮⁦-⁩﻿]'
  ),
  add constraint photos_size check (
    (width is null or width between 1 and 10000) and (height is null or height between 1 and 10000)
  );
alter table public.photos drop constraint photos_trip_id_stop_id_fkey;
alter table public.photos
  add constraint photos_trip_id_stop_id_fkey foreign key (trip_id, stop_id)
    references public.trip_stops (trip_id, id) on delete set null (stop_id);

-- ---------------------------------------------------------------------------------------------
-- "I wasn't there"
-- ---------------------------------------------------------------------------------------------

-- A stop counts for the whole group unless a traveller takes themselves off it.
create table public.trip_stop_absences (
  trip_id uuid not null,
  stop_id uuid not null,
  account_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (stop_id, account_id),
  foreign key (trip_id, stop_id) references public.trip_stops (trip_id, id) on delete cascade,
  foreign key (trip_id, account_id)
    references public.trip_travellers (trip_id, account_id) on delete cascade
);
create index trip_stop_absences_trip on public.trip_stop_absences (trip_id);

-- ---------------------------------------------------------------------------------------------
-- Suggested corrections
-- ---------------------------------------------------------------------------------------------

-- "That was Kinkaku-ji, not Ginkaku-ji", "we got there at 10:40", "this wasn't a stop". Only
-- what is suggested is filled in. The person who logged the stop answers with
-- answer_stop_correction(). Leaving the trip takes your suggestions with you.
create table public.trip_stop_corrections (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null,
  stop_id uuid not null,
  proposed_by uuid not null,
  place_id text references public.places (id) on delete cascade,
  day date,
  arrived_at time,
  left_at time,
  remove boolean not null default false,
  reason text check (
    char_length(reason) <= 200 and reason !~ '[\x01-\x1f\x7f-\x9f‪-‮⁦-⁩﻿]'
  ),
  status text not null default 'open' check (status in ('open', 'accepted', 'declined')),
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (trip_id, stop_id) references public.trip_stops (trip_id, id) on delete cascade,
  foreign key (trip_id, proposed_by)
    references public.trip_travellers (trip_id, account_id) on delete cascade,
  check (remove or place_id is not null or day is not null or arrived_at is not null or left_at is not null),
  check (not remove or (place_id is null and day is null and arrived_at is null and left_at is null)),
  check (left_at is null or arrived_at is null or left_at > arrived_at)
);
create index trip_stop_corrections_stop on public.trip_stop_corrections (stop_id);
create index trip_stop_corrections_trip on public.trip_stop_corrections (trip_id, status);

-- At most 50 suggestions waiting from one person on one trip.
create function private.guard_corrections() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (
    select count(*) from public.trip_stop_corrections c
    where c.trip_id = new.trip_id and c.proposed_by = new.proposed_by and c.status = 'open'
  ) >= 50 then
    raise exception 'You already have 50 suggestions waiting on this trip'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger guard_corrections before insert on public.trip_stop_corrections
  for each row execute function private.guard_corrections();

-- A place suggested in a correction can be seen by the travellers who have to answer it.
create or replace function private.can_see_place(p_place text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
      select 1 from public.trip_stops s
      where s.place_id = p_place and private.can_see_trip(s.trip_id)
    )
    or exists (
      select 1 from public.trip_stop_corrections c
      where c.place_id = p_place and c.status = 'open' and private.is_traveller(c.trip_id)
    );
$$;

-- Accept or turn down a suggestion. Only the person who logged the stop can, or any traveller
-- once the stop has no logger. Accepting puts the suggested values on the stop.
create function public.answer_stop_correction(p_correction uuid, p_accept boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  c public.trip_stop_corrections;
  s public.trip_stops;
begin
  select * into c from public.trip_stop_corrections x where x.id = p_correction for update;
  -- Said the same way whether it never existed or is on a trip you are not on.
  if not found or not private.is_traveller(c.trip_id) then
    raise exception 'That suggestion is no longer there' using errcode = 'insufficient_privilege';
  end if;
  select * into s from public.trip_stops x where x.id = c.stop_id for update;
  if s.logged_by is distinct from v_me and s.logged_by is not null then
    raise exception 'Only the person who logged this stop can answer'
      using errcode = 'insufficient_privilege';
  end if;
  if c.status <> 'open' then
    return c.status;
  end if;
  if p_accept and c.remove then
    -- The suggestion goes with the stop it was about.
    delete from public.trip_stops x where x.id = s.id;
    return 'removed';
  end if;
  if p_accept
     and coalesce(c.left_at, s.left_at) <= coalesce(c.arrived_at, s.arrived_at) then
    raise exception 'With that change the stop would end before it starts. Fix the times instead'
      using errcode = 'check_violation';
  end if;
  if p_accept then
    update public.trip_stops x
    set place_id = coalesce(c.place_id, x.place_id),
        day = coalesce(c.day, x.day),
        arrived_at = coalesce(c.arrived_at, x.arrived_at),
        left_at = coalesce(c.left_at, x.left_at),
        est = case when c.arrived_at is not null or c.left_at is not null then false else x.est end
    where x.id = s.id;
  end if;
  update public.trip_stop_corrections x
  set status = case when p_accept then 'accepted' else 'declined' end, answered_at = now()
  where x.id = c.id;
  return case when p_accept then 'accepted' else 'declined' end;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- The log version: counts up with every change to a trip's log
-- ---------------------------------------------------------------------------------------------

alter table public.trips add column log_version bigint not null default 0;

create function private.bump_trip_log() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb;
  v_trip uuid;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;
  -- A hide has no trip of its own: it belongs to its photo's trip.
  if tg_table_name = 'photo_hides' then
    v_trip := private.photo_trip((v_row ->> 'photo_id')::uuid);
  else
    v_trip := (v_row ->> 'trip_id')::uuid;
  end if;
  if v_trip is not null then
    update public.trips t set log_version = t.log_version + 1 where t.id = v_trip;
  end if;
  return null;
end;
$$;
create trigger bump_trip_log after insert or update or delete on public.trip_stops
  for each row execute function private.bump_trip_log();
create trigger bump_trip_log after insert or update or delete on public.photos
  for each row execute function private.bump_trip_log();
create trigger bump_trip_log after insert or delete on public.photo_hides
  for each row execute function private.bump_trip_log();
create trigger bump_trip_log after insert or update or delete on public.trip_stop_corrections
  for each row execute function private.bump_trip_log();
create trigger bump_trip_log after insert or delete on public.trip_stop_absences
  for each row execute function private.bump_trip_log();
create trigger bump_trip_log after insert or update or delete on public.trip_travellers
  for each row execute function private.bump_trip_log();

-- A member renaming their own place changes how every trip that stops there reads.
create function private.bump_place_trips() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.trips t set log_version = t.log_version + 1
  where t.id in (select s.trip_id from public.trip_stops s where s.place_id = new.id);
  return null;
end;
$$;
create trigger bump_place_trips after update on public.places
  for each row when (new.kind <> 'guide') execute function private.bump_place_trips();

-- The trip's own title and dates are part of its log too.
create function private.bump_trip_itself() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.title, new.starts_on, new.ends_on, new.cover_photo_id)
     is distinct from (old.title, old.starts_on, old.ends_on, old.cover_photo_id) then
    new.log_version := old.log_version + 1;
  end if;
  return new;
end;
$$;
create trigger bump_trip_itself before update on public.trips
  for each row execute function private.bump_trip_itself();

-- ---------------------------------------------------------------------------------------------
-- Row level security for the new tables
-- ---------------------------------------------------------------------------------------------

alter table public.trip_stop_absences enable row level security;
alter table public.trip_stop_corrections enable row level security;
revoke all on public.trip_stop_absences, public.trip_stop_corrections from anon, authenticated, public;

-- "I wasn't there": travellers only, your own row only, and not on a stop you logged yourself.
grant select, delete on public.trip_stop_absences to authenticated;
grant insert (trip_id, stop_id, account_id) on public.trip_stop_absences to authenticated;
create policy trip_stop_absences_read on public.trip_stop_absences for select to authenticated
  using (private.is_traveller(trip_id));
create policy trip_stop_absences_add on public.trip_stop_absences for insert to authenticated
  with check (
    account_id = (select auth.uid())
    and private.is_traveller(trip_id)
    and not exists (
      select 1 from public.trip_stops s
      where s.id = stop_id and s.logged_by = (select auth.uid())
    )
  );
create policy trip_stop_absences_remove on public.trip_stop_absences for delete to authenticated
  using (account_id = (select auth.uid()));

-- Suggestions: seen by the travellers, made about someone else's stop, withdrawn while open.
grant select, delete on public.trip_stop_corrections to authenticated;
grant insert (id, trip_id, stop_id, proposed_by, place_id, day, arrived_at, left_at, remove, reason)
  on public.trip_stop_corrections to authenticated;
create policy trip_stop_corrections_read on public.trip_stop_corrections for select to authenticated
  using (private.is_traveller(trip_id));
create policy trip_stop_corrections_suggest on public.trip_stop_corrections for insert to authenticated
  with check (
    proposed_by = (select auth.uid())
    and private.is_traveller(trip_id)
    and exists (
      select 1 from public.trip_stops s
      where s.id = stop_id and s.trip_id = trip_stop_corrections.trip_id
        and s.logged_by is not null and s.logged_by <> (select auth.uid())
    )
    and (place_id is null or exists (select 1 from public.places p where p.id = place_id))
  );
create policy trip_stop_corrections_withdraw on public.trip_stop_corrections for delete to authenticated
  using (proposed_by = (select auth.uid()) and status = 'open');

-- ---------------------------------------------------------------------------------------------
-- What the phones fetch
-- ---------------------------------------------------------------------------------------------

-- The trips you travel on, newest first.
create function public.my_trips()
returns table (id uuid, title text, starts_on date, ends_on date, version bigint, travellers bigint)
language sql stable security invoker set search_path = '' as $$
  select t.id, t.title, t.starts_on, t.ends_on, t.log_version,
    (select count(*) from public.trip_travellers x where x.trip_id = t.id and x.status = 'active')
  from public.trips t
  join public.trip_travellers me
    on me.trip_id = t.id and me.account_id = (select auth.uid()) and me.status = 'active'
  order by t.starts_on desc nulls last, t.created_at desc;
$$;

-- A trip's whole log as one answer, or only { version, same: true } when the phone already has
-- this version. It runs with the caller's own rights, so a viewer gets exactly what the rules
-- let a viewer see (no hidden photos, no corrections, no "I wasn't there"), and someone with no
-- right to the trip gets null.
create function public.trip_log(p_trip uuid, p_version bigint default null) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_trip public.trips;
  v_traveller boolean;
begin
  select * into v_trip from public.trips t where t.id = p_trip;
  if not found then
    return null;
  end if;
  if p_version is not null and p_version = v_trip.log_version then
    return jsonb_build_object('version', v_trip.log_version, 'same', true);
  end if;
  v_traveller := private.is_traveller(p_trip);
  return jsonb_build_object(
    'version', v_trip.log_version,
    'trip', jsonb_build_object(
      'id', v_trip.id, 'title', v_trip.title,
      'starts_on', v_trip.starts_on, 'ends_on', v_trip.ends_on
    ),
    'role', case when v_traveller then 'traveller' else 'viewer' end,
    'travellers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', x.account_id, 'name', p.display_name, 'status', x.status
      ) order by x.created_at, x.account_id), '[]'::jsonb)
      from public.trip_travellers x
      left join public.profiles p on p.id = x.account_id
      where x.trip_id = p_trip
    ),
    'stops', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'place', s.place_id, 'day', s.day,
        'in', to_char(s.arrived_at, 'HH24:MI'), 'out', to_char(s.left_at, 'HH24:MI'),
        'est', s.est, 'note', s.note, 'by', s.logged_by, 'at', s.created_at
      ) order by s.day, s.arrived_at, s.created_at, s.id), '[]'::jsonb)
      from public.trip_stops s
      where s.trip_id = p_trip
    ),
    -- Places members added. Guide places are in the app already.
    'places', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', pl.id, 'name', pl.name, 'local', pl.local_name, 'lat', pl.lat, 'lon', pl.lon,
        'city', pl.city_id, 'osm', pl.osm_ref, 'by', pl.created_by
      ) order by pl.id), '[]'::jsonb)
      from public.places pl
      where pl.kind <> 'guide'
        and pl.id in (
          select s.place_id from public.trip_stops s where s.trip_id = p_trip
          union
          select c.place_id from public.trip_stop_corrections c
          where c.trip_id = p_trip and c.status = 'open' and c.place_id is not null
        )
    ),
    'photos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', ph.id, 'stop', ph.stop_id, 'by', ph.added_by, 'caption', ph.caption,
        'taken', to_char(ph.taken_at, 'YYYY-MM-DD"T"HH24:MI'), 'w', ph.width, 'h', ph.height,
        'hidden', exists (select 1 from public.photo_hides h where h.photo_id = ph.id),
        'hidden_by_me', exists (
          select 1 from public.photo_hides h where h.photo_id = ph.id and h.hidden_by = v_me
        )
      ) order by ph.taken_at, ph.created_at, ph.id), '[]'::jsonb)
      from public.photos ph
      where ph.trip_id = p_trip
    ),
    'corrections', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'stop', c.stop_id, 'by', c.proposed_by, 'place', c.place_id, 'day', c.day,
        'in', to_char(c.arrived_at, 'HH24:MI'), 'out', to_char(c.left_at, 'HH24:MI'),
        'remove', c.remove, 'reason', c.reason, 'status', c.status, 'at', c.created_at
      ) order by c.created_at, c.id), '[]'::jsonb)
      from public.trip_stop_corrections c
      where c.trip_id = p_trip and v_traveller
        and (c.status = 'open' or c.answered_at > now() - interval '14 days')
    ),
    'absences', (
      select coalesce(jsonb_agg(jsonb_build_object('stop', a.stop_id, 'who', a.account_id)
        order by a.stop_id, a.account_id), '[]'::jsonb)
      from public.trip_stop_absences a
      where a.trip_id = p_trip and v_traveller
    )
  );
end;
$$;

-- What is waiting for you across your trips: invites to travel, people waiting for your yes to
-- join a trip, and suggestions about stops you logged.
create function public.trip_needs() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'invites', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'trip', i.trip_id, 'title', i.title, 'by', i.invited_by_name, 'ready', i.ready
      )), '[]'::jsonb)
      from public.my_trip_invites() i
    ),
    'approvals', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'trip', x.trip_id, 'title', t.title, 'id', x.account_id, 'name', p.display_name,
        'by', ip.display_name
      ) order by x.created_at), '[]'::jsonb)
      from public.trip_travellers x
      join public.trips t on t.id = x.trip_id
      left join public.profiles p on p.id = x.account_id
      left join public.profiles ip on ip.id = x.invited_by
      where x.status = 'invited'
        and private.is_traveller(x.trip_id)
        and not exists (
          select 1 from public.trip_traveller_approvals a
          where a.trip_id = x.trip_id and a.invitee_id = x.account_id
            and a.traveller_id = (select auth.uid())
        )
    ),
    'viewers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'trip', v.trip_id, 'title', t.title, 'id', v.viewer_id, 'name', p.display_name,
        'by', ip.display_name
      ) order by v.created_at), '[]'::jsonb)
      from public.trip_viewers v
      join public.trips t on t.id = v.trip_id
      left join public.profiles p on p.id = v.viewer_id
      left join public.profiles ip on ip.id = v.invited_by
      where private.is_traveller(v.trip_id)
        and not exists (
          select 1 from public.trip_viewer_approvals a
          where a.trip_id = v.trip_id and a.viewer_id = v.viewer_id
            and a.traveller_id = (select auth.uid())
        )
    ),
    'corrections', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'trip', c.trip_id, 'title', t.title, 'stop', c.stop_id,
        'by', pp.display_name
      ) order by c.created_at), '[]'::jsonb)
      from public.trip_stop_corrections c
      join public.trip_stops s on s.id = c.stop_id
      join public.trips t on t.id = c.trip_id
      left join public.profiles pp on pp.id = c.proposed_by
      where c.status = 'open'
        and c.proposed_by <> (select auth.uid())
        and (s.logged_by = (select auth.uid()) or s.logged_by is null)
    )
  );
$$;

-- ---------------------------------------------------------------------------------------------
-- Your data now includes what you suggested and where you were not
-- ---------------------------------------------------------------------------------------------

create or replace function public.export_my_data() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = (select auth.uid())),
    'private', (select to_jsonb(a) - 'id' from public.account_private a where a.id = (select auth.uid())),
    'people', (select coalesce(jsonb_agg(to_jsonb(m) - 'id'), '[]'::jsonb) from public.my_people() m),
    'invite_links', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'note', i.note, 'made', i.created_at, 'ends', i.expires_at, 'used', i.used_at
      ) order by i.created_at), '[]'::jsonb)
      from public.friend_invites i where i.inviter_id = (select auth.uid())
    ),
    'reports_sent', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'about', r.about_kind, 'reason', r.reason, 'status', r.status, 'sent', r.created_at
      ) order by r.created_at), '[]'::jsonb)
      from public.reports r where r.reporter_id = (select auth.uid())
    ),
    'trips', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'title', t.title, 'starts_on', t.starts_on, 'ends_on', t.ends_on,
        'your_sharing_choice', s.audience_choice
      ) order by t.starts_on), '[]'::jsonb)
      from public.trip_travellers me
      join public.trips t on t.id = me.trip_id
      left join public.trip_traveller_settings s on s.trip_id = me.trip_id and s.account_id = me.account_id
      where me.account_id = (select auth.uid()) and me.status = 'active'
    ),
    'stops_you_logged', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'trip', st.trip_id, 'place', st.place_id, 'day', st.day, 'arrived', st.arrived_at,
        'left', st.left_at, 'note', st.note
      ) order by st.day, st.arrived_at, st.position), '[]'::jsonb)
      from public.trip_stops st where st.logged_by = (select auth.uid())
    ),
    'photos_you_added', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'trip', ph.trip_id, 'caption', ph.caption, 'taken', ph.taken_at, 'added', ph.created_at
      ) order by ph.created_at), '[]'::jsonb)
      from public.photos ph where ph.added_by = (select auth.uid())
    ),
    'places_you_added', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', pl.name, 'local_name', pl.local_name, 'lat', pl.lat, 'lon', pl.lon,
        'kind', pl.kind, 'review', pl.review_status
      ) order by pl.created_at), '[]'::jsonb)
      from public.places pl where pl.created_by = (select auth.uid())
    ),
    'corrections_you_suggested', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'trip', c.trip_id, 'place', c.place_id, 'day', c.day, 'arrived', c.arrived_at,
        'left', c.left_at, 'remove', c.remove, 'reason', c.reason, 'status', c.status,
        'sent', c.created_at
      ) order by c.created_at), '[]'::jsonb)
      from public.trip_stop_corrections c where c.proposed_by = (select auth.uid())
    ),
    'stops_you_were_not_at', (
      select coalesce(jsonb_agg(jsonb_build_object('trip', a.trip_id, 'stop', a.stop_id)
        order by a.created_at), '[]'::jsonb)
      from public.trip_stop_absences a where a.account_id = (select auth.uid())
    )
  );
$$;

-- ---------------------------------------------------------------------------------------------
-- Who may run what
-- ---------------------------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon;
revoke execute on function
  private.touch_stop(),
  private.guard_stop_count(),
  private.guard_corrections(),
  private.bump_trip_log(),
  private.bump_place_trips(),
  private.bump_trip_itself()
from authenticated;
grant execute on function private.can_see_place(text) to authenticated;
grant execute on function
  public.close_stop(uuid, time),
  public.answer_stop_correction(uuid, boolean),
  public.my_trips(),
  public.trip_log(uuid, bigint),
  public.trip_needs(),
  public.export_my_data()
to authenticated;
