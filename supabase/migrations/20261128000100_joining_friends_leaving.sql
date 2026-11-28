-- Tandem Roads: joining by invite, friends, blocking, reports, and leaving the app.
--
-- Tandem Roads is invite-only. A member makes an invite link. The friend who opens it signs in
-- with a code sent to their email, and finish_sign_in() makes them a member and friends with
-- whoever invited them. The first member, whoever runs the app, joins with the founder email
-- that the setup workflow stores in private.settings.
--
-- A profile is what makes an account a member. A sign-in account without one holds nothing and
-- can do nothing, because every table a member writes to points at profiles. It is removed after
-- seven days.
--
-- Rules added here (tests: supabase/tests/80_joining.sql and 90_blocks_reports_leaving.sql):
--   1. A new sign-in account needs a working invite code or the founder email (the sign-up hook).
--   2. An invite link works once, for 14 days. Only a hash of its code is kept.
--   3. You see someone's profile once you are friends, while they are asking to be your friend,
--      or when you share a trip. Asking someone to be friends needs that you already know each
--      other through a trip; everyone else connects with an invite link.
--   4. Blocking ends the friendship and stops new requests. Trips you share stay as they are.
--   5. Leaving the app hides your profile from friends at once and deletes everything after 30
--      days unless you come back. "Delete now" skips the wait.

-- ---------------------------------------------------------------------------------------------
-- Settings only the server reads
-- ---------------------------------------------------------------------------------------------

-- The founder's email, so the very first account can be made before anyone can invite.
create table private.settings (
  key text primary key check (key in ('founder_email')),
  value text not null check (char_length(value) <= 320)
);
alter table private.settings enable row level security;
revoke all on private.settings from public;

-- Accounts no longer get a profile the moment they are made. The profile now comes with joining.
drop trigger if exists on_account_created on auth.users;
drop function if exists private.on_account_created();

-- ---------------------------------------------------------------------------------------------
-- Text people type: no control characters, and none of the invisible direction marks that can
-- make one name look like another. Letters in every script, emoji and joiners are all fine.
-- ---------------------------------------------------------------------------------------------

alter table public.profiles
  add constraint profiles_plain_text check (
    display_name ~ '[^[:space:]]'
    and display_name !~ '[\x01-\x1f\x7f-\x9f‪-‮⁦-⁩﻿]'
    and coalesce(home_city, '') !~ '[\x01-\x1f\x7f-\x9f‪-‮⁦-⁩﻿]'
    and coalesce(bio, '') !~ '[\x01-\x1f\x7f-\x9f‪-‮⁦-⁩﻿]'
  );

create function private.plain_words(p_words text[]) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(bool_and(
    char_length(w) between 1 and 28
    and w !~ '[\x01-\x1f\x7f-\x9f‪-‮⁦-⁩﻿]'
  ), true)
  from unnest(p_words) w;
$$;

-- Only the account holder sees these: travel style words, app choices, and the leaving date.
alter table public.account_private
  add column travel_style text[] not null default '{}'
    check (cardinality(travel_style) <= 4 and private.plain_words(travel_style)),
  add column prefs jsonb not null default '{}'
    check (jsonb_typeof(prefs) = 'object' and pg_column_size(prefs) <= 4000),
  add column delete_after timestamptz;
grant update (travel_style, prefs) on public.account_private to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Invite links, blocks and reports
-- ---------------------------------------------------------------------------------------------

-- An invite link is tandemroads.com/#/join/<code>. The code is shown once, to the person who
-- made it, and only its hash is kept, so a copy of this table cannot be used to join.
create table public.friend_invites (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  code_hash bytea not null unique,
  -- A reminder for the inviter ("for Sam"). Nobody else sees it.
  note text check (char_length(note) <= 40 and note !~ '[\x01-\x1f\x7f-\x9f‪-‮⁦-⁩﻿]'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_by uuid references public.profiles (id) on delete set null,
  used_at timestamptz,
  check (expires_at >= created_at)
);
create index friend_invites_inviter on public.friend_invites (inviter_id, created_at);

-- One row per person you blocked. The person blocked never sees it.
create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked on public.blocks (blocked_id);

-- "Something is wrong here." Read by whoever runs the app, through admin_reports().
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null,
  about_account uuid references public.profiles (id) on delete set null,
  about_kind text not null check (about_kind in ('person', 'trip', 'photo', 'place', 'comment')),
  about_id text check (char_length(about_id) <= 80),
  reason text not null check (char_length(reason) between 1 and 1000),
  status text not null default 'open' check (status in ('open', 'closed')),
  admin_note text check (char_length(admin_note) <= 1000),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index reports_reporter on public.reports (reporter_id, created_at);
create index reports_open on public.reports (created_at) where status = 'open';

-- ---------------------------------------------------------------------------------------------
-- Who may see what (additions)
-- ---------------------------------------------------------------------------------------------

create function private.is_member(p_account uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = p_account);
$$;

-- Someone who asked to leave. Their profile is hidden from friends while the 30 days run.
create function private.is_leaving(p_account uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.account_private a where a.id = p_account and a.delete_after is not null
  );
$$;

create function private.blocked_between(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b) or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

-- Whose profile the caller may open: their own; a friend's; someone asking to be their friend
-- (so they can decide); and the people they share a trip with, as before. Asking someone to be
-- your friend no longer lets you see their profile: that waits until they say yes.
create or replace function private.knows(p_other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_other = (select auth.uid())
    or (
      not private.is_leaving(p_other)
      and exists (
        select 1 from public.friendships f
        where (
            f.status = 'accepted'
            and ((f.requester_id = (select auth.uid()) and f.addressee_id = p_other)
              or (f.addressee_id = (select auth.uid()) and f.requester_id = p_other))
          )
          or (f.status = 'pending' and f.addressee_id = (select auth.uid()) and f.requester_id = p_other)
      )
    )
    or exists (
      select 1 from public.trip_travellers o
      where o.account_id = p_other
        and (private.is_on_trip(o.trip_id) or (o.status = 'active' and private.is_viewer(o.trip_id)))
    )
    or exists (
      select 1 from public.trip_viewers o
      where o.viewer_id = p_other
        and (private.is_traveller(o.trip_id) or private.is_viewer(o.trip_id))
    );
$$;

-- ---------------------------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------------------------

alter table public.friend_invites enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
revoke all on public.friend_invites, public.blocks, public.reports from anon, authenticated, public;

-- Invites: made and cancelled through functions. You can list your own, but never the code.
grant select (id, inviter_id, note, created_at, expires_at, used_by, used_at)
  on public.friend_invites to authenticated;
create policy friend_invites_read_own on public.friend_invites for select to authenticated
  using (inviter_id = (select auth.uid()));

-- Friend requests: only to someone you already know through a trip, never across a block, and
-- not while you are leaving. Invite links are how everyone else connects.
drop policy friendships_ask on public.friendships;
create policy friendships_ask on public.friendships for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and private.knows(addressee_id)
    and not private.blocked_between(requester_id, addressee_id)
    and not private.is_leaving(requester_id)
  );

-- Blocks: yours to add, see and take back. You can block anyone whose profile you can see.
grant select, delete on public.blocks to authenticated;
grant insert (blocker_id, blocked_id) on public.blocks to authenticated;
create policy blocks_read_own on public.blocks for select to authenticated
  using (blocker_id = (select auth.uid()));
create policy blocks_add on public.blocks for insert to authenticated
  with check (blocker_id = (select auth.uid()) and private.knows(blocked_id));
create policy blocks_remove on public.blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- Reports: you can send one about anyone you know, and see the ones you sent.
grant select (id, reporter_id, about_account, about_kind, about_id, reason, status, created_at, closed_at)
  on public.reports to authenticated;
grant insert (reporter_id, about_account, about_kind, about_id, reason) on public.reports to authenticated;
create policy reports_read_own on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()));
create policy reports_send on public.reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and (about_account is null or private.knows(about_account))
  );

-- ---------------------------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------------------------

-- Blocking someone ends the friendship, or the request, between you.
create function private.on_block() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.friendships f
  where (f.requester_id = new.blocker_id and f.addressee_id = new.blocked_id)
     or (f.requester_id = new.blocked_id and f.addressee_id = new.blocker_id);
  return new;
end;
$$;
create trigger on_block after insert on public.blocks
  for each row execute function private.on_block();

-- At most 30 friend requests waiting for an answer.
create function private.guard_friend_requests() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'pending' and (
    select count(*) from public.friendships f
    where f.requester_id = new.requester_id and f.status = 'pending'
  ) >= 30 then
    raise exception 'You already have 30 friend requests waiting for an answer'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger guard_friend_requests before insert on public.friendships
  for each row execute function private.guard_friend_requests();

-- At most 20 reports a day from one person.
create function private.guard_reports() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (
    select count(*) from public.reports r
    where r.reporter_id = new.reporter_id and r.created_at > now() - interval '1 day'
  ) >= 20 then
    raise exception 'That is enough reports for today' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger guard_reports before insert on public.reports
  for each row execute function private.guard_reports();

-- ---------------------------------------------------------------------------------------------
-- Joining
-- ---------------------------------------------------------------------------------------------

-- The profile and private row that make an account a member. Only ever called from the server.
create function private.make_member(p_account uuid, p_name text, p_age_band text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name) values (p_account, p_name)
    on conflict (id) do nothing;
  insert into public.account_private (id, age_band) values (p_account, p_age_band)
    on conflict (id) do nothing;
end;
$$;

create function private.invite_hash(p_code text) returns bytea
language sql immutable set search_path = '' as $$
  select case when p_code ~ '^[A-Za-z0-9_-]{22}$' then sha256(convert_to(p_code, 'UTF8')) end;
$$;

-- Supabase's "before user created" hook: a new sign-in account needs a working invite code
-- (sent along with the sign-in request) or the founder email. Existing accounts sign in as usual.
-- Enabled by scripts/supabase/connect.mjs (and supabase/config.toml for local runs).
create function private.before_user_created(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_email text := lower(event -> 'user' ->> 'email');
  v_code text := event -> 'user' -> 'user_metadata' ->> 'invite';
begin
  if v_email is not null
     and v_email = (select lower(s.value) from private.settings s where s.key = 'founder_email') then
    return '{}'::jsonb;
  end if;
  if exists (
    select 1 from public.friend_invites i
    where i.code_hash = private.invite_hash(v_code) and i.used_at is null and i.expires_at > now()
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Tandem Roads is invite-only for now. Ask a friend who uses it to send you an invite link.'
  ));
end;
$$;

-- Make an invite link. Returns the code; it cannot be shown again.
create function public.create_friend_invite(p_note text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_code text;
begin
  if not private.is_member(v_me) or private.is_leaving(v_me) then
    raise exception 'Members only' using errcode = 'insufficient_privilege';
  end if;
  if (
    select count(*) from public.friend_invites i
    where i.inviter_id = v_me and i.used_at is null and i.expires_at > now()
  ) >= 10 then
    raise exception 'You have 10 invite links waiting to be used. Cancel one first.'
      using errcode = 'check_violation';
  end if;
  if (
    select count(*) from public.friend_invites i
    where i.inviter_id = v_me and i.created_at > now() - interval '1 day'
  ) >= 20 then
    raise exception 'That is enough invite links for today' using errcode = 'check_violation';
  end if;
  -- 122 random bits from a version 4 UUID, written as 22 link-safe characters.
  v_code := rtrim(translate(encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/', '-_'), '=');
  insert into public.friend_invites (inviter_id, code_hash, note, expires_at)
  values (v_me, private.invite_hash(v_code), nullif(btrim(p_note), ''), now() + interval '14 days');
  return v_code;
end;
$$;

-- Stop an invite link from working.
create function public.cancel_friend_invite(p_invite uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.friend_invites i set expires_at = greatest(i.created_at, now())
  where i.id = p_invite and i.inviter_id = auth.uid() and i.used_at is null;
end;
$$;

-- Called by the app straight after the emailed code is entered, with the invite code if the
-- person came through an invite link. It makes the profile for someone joining, and the
-- friendship that comes with an invite. Returns what happened, for the screen to explain:
--   member     false: signed in but not a member (no working invite)
--   created    true when this call made the profile
--   invite     ok | already_friends | used | expired | own | unknown, or null with no invite
--   friend     { id, name } of the person who invited, when the invite worked
--   leaving    the date the account will be deleted, if the person asked to leave
create function public.finish_sign_in(
  p_invite text default null, p_name text default null, p_age_band text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_created boolean := false;
  v_invite public.friend_invites;
  v_outcome text;
  v_friend uuid;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if v_me is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  select lower(u.email), u.email_confirmed_at into v_email, v_confirmed
  from auth.users u where u.id = v_me;
  if v_confirmed is null then
    raise exception 'Confirm your email first' using errcode = 'insufficient_privilege';
  end if;

  if p_invite is not null then
    select * into v_invite from public.friend_invites i
    where i.code_hash = private.invite_hash(p_invite)
    for update;
    if not found then
      v_outcome := 'unknown';
    elsif v_invite.inviter_id = v_me then
      v_outcome := 'own';
    elsif v_invite.used_at is not null then
      v_outcome := case when v_invite.used_by = v_me then 'already_friends' else 'used' end;
    elsif v_invite.expires_at <= now() then
      v_outcome := 'expired';
    elsif private.blocked_between(v_invite.inviter_id, v_me) or private.is_leaving(v_invite.inviter_id) then
      -- Said the same way as a code that does not exist, so a block is never revealed.
      v_outcome := 'unknown';
    else
      v_outcome := 'ok';
    end if;
  end if;

  if not private.is_member(v_me) then
    if v_email is not null
       and v_email = (select lower(s.value) from private.settings s where s.key = 'founder_email') then
      perform private.make_member(v_me, coalesce(v_name, 'Traveller'), p_age_band);
      insert into public.app_admins (account_id) values (v_me) on conflict do nothing;
      v_created := true;
    elsif v_outcome = 'ok' then
      if v_name is null then
        raise exception 'Add your name first' using errcode = 'check_violation';
      end if;
      if p_age_band is null or p_age_band not in ('16-17', '18+') then
        raise exception 'Tandem Roads is for people 16 and over' using errcode = 'check_violation';
      end if;
      perform private.make_member(v_me, v_name, p_age_band);
      v_created := true;
    else
      return jsonb_build_object('member', false, 'created', false, 'invite', v_outcome);
    end if;
  end if;

  if v_outcome = 'ok' then
    v_friend := v_invite.inviter_id;
    update public.friendships f set status = 'accepted'
    where ((f.requester_id = v_friend and f.addressee_id = v_me)
        or (f.requester_id = v_me and f.addressee_id = v_friend));
    if not found then
      insert into public.friendships (requester_id, addressee_id, status)
      values (v_friend, v_me, 'accepted');
    end if;
    update public.friend_invites i set used_by = v_me, used_at = now() where i.id = v_invite.id;
  elsif v_outcome = 'already_friends' then
    v_friend := v_invite.inviter_id;
  end if;

  return jsonb_build_object(
    'member', true,
    'created', v_created,
    'admin', private.is_admin(),
    'invite', v_outcome,
    'friend', (select jsonb_build_object('id', p.id, 'name', p.display_name)
               from public.profiles p where p.id = v_friend),
    'leaving', (select a.delete_after from public.account_private a where a.id = v_me)
  );
end;
$$;

-- Your people, for the account page and the feed: friends (with what friends see), people asking
-- to be your friend (they can be seen while they wait), requests you sent (name only, since they
-- have not said yes), and people you blocked (name only, so you can unblock them).
create function public.my_people()
returns table (
  id uuid, name text, home text, line text, joined timestamptz, relation text, since timestamptz
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name,
    case when f.status = 'accepted' or f.addressee_id = (select auth.uid()) then p.home_city end,
    case when f.status = 'accepted' or f.addressee_id = (select auth.uid()) then p.bio end,
    case when f.status = 'accepted' or f.addressee_id = (select auth.uid()) then p.created_at end,
    case when f.status = 'accepted' then 'friend'
         when f.addressee_id = (select auth.uid()) then 'asks_you'
         else 'you_asked' end,
    f.created_at
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester_id = (select auth.uid()) then f.addressee_id else f.requester_id end
  where (select auth.uid()) in (f.requester_id, f.addressee_id)
    and not private.is_leaving(p.id)
  union all
  select p.id, p.display_name, null, null, null, 'blocked', b.created_at
  from public.blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = (select auth.uid());
$$;

-- ---------------------------------------------------------------------------------------------
-- Leaving
-- ---------------------------------------------------------------------------------------------

-- Start leaving: the profile disappears for friends now, and everything goes in 30 days.
create function public.request_account_deletion() returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_when timestamptz;
begin
  update public.account_private a
  set delete_after = coalesce(a.delete_after, now() + interval '30 days')
  where a.id = v_me
  returning a.delete_after into v_when;
  if v_when is null then
    raise exception 'Members only' using errcode = 'insufficient_privilege';
  end if;
  update public.friend_invites i set expires_at = greatest(i.created_at, now())
  where i.inviter_id = v_me and i.used_at is null and i.expires_at > now();
  return v_when;
end;
$$;

-- Changed your mind within the 30 days.
create function public.cancel_account_deletion() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.account_private a set delete_after = null where a.id = auth.uid();
end;
$$;

-- Skip the wait. Only after leaving has been asked for, so one tap can never delete an account.
-- Deleting the sign-in account removes the profile, which takes the person off every trip
-- (their photos and notes go, the places stay; see on_traveller_removed).
create function public.delete_account_now() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
begin
  if not private.is_leaving(v_me) then
    raise exception 'Ask to delete your account first' using errcode = 'insufficient_privilege';
  end if;
  delete from auth.users u where u.id = v_me;
end;
$$;

-- Daily tidy-up (scheduled below where pg_cron is available):
--   accounts whose 30 days are over, sign-in accounts that never joined after 7 days, and invite
--   links that ended more than 60 days ago.
create function private.housekeeping() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from auth.users u
  using public.account_private a
  where a.id = u.id and a.delete_after <= now();
  delete from auth.users u
  where u.created_at < now() - interval '7 days'
    and not exists (select 1 from public.profiles p where p.id = u.id);
  delete from public.friend_invites i where i.expires_at < now() - interval '60 days';
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Your data, and reports for whoever runs the app
-- ---------------------------------------------------------------------------------------------

-- Everything the database holds about you, as one object. It runs with your own rights, so it
-- can only ever return what the rules already let you see.
create function public.export_my_data() returns jsonb
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
      ) order by st.day, st.position), '[]'::jsonb)
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
    )
  );
$$;

create function public.admin_reports(p_status text default 'open')
returns table (
  id uuid, created_at timestamptz, status text, about_kind text, about_id text, reason text,
  admin_note text, reporter_id uuid, reporter_name text, about_account uuid, about_name text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Admins only' using errcode = 'insufficient_privilege';
  end if;
  return query
    select r.id, r.created_at, r.status, r.about_kind, r.about_id, r.reason, r.admin_note,
      r.reporter_id, rp.display_name, r.about_account, ap.display_name
    from public.reports r
    left join public.profiles rp on rp.id = r.reporter_id
    left join public.profiles ap on ap.id = r.about_account
    where r.status = p_status
    order by r.created_at;
end;
$$;

create function public.admin_close_report(p_report uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Admins only' using errcode = 'insufficient_privilege';
  end if;
  update public.reports r set status = 'closed', closed_at = now(), admin_note = p_note
  where r.id = p_report;
  if not found then
    raise exception 'No report with that id' using errcode = 'no_data_found';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- The daily tidy-up, where the database has a scheduler (Supabase does; the test stand-in not)
-- ---------------------------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('tandem-housekeeping', '17 3 * * *', 'select private.housekeeping()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Who may run what
-- ---------------------------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon;
revoke execute on function
  private.make_member(uuid, text, text),
  private.before_user_created(jsonb),
  private.housekeeping(),
  private.on_block(),
  private.guard_friend_requests(),
  private.guard_reports()
from authenticated;
-- Read-only helpers that the row rules and checks above call as the signed-in member.
grant execute on function
  private.is_member(uuid),
  private.is_leaving(uuid),
  private.blocked_between(uuid, uuid),
  private.plain_words(text[]),
  private.invite_hash(text)
to authenticated;
grant execute on function
  public.create_friend_invite(text),
  public.cancel_friend_invite(uuid),
  public.finish_sign_in(text, text, text),
  public.my_people(),
  public.request_account_deletion(),
  public.cancel_account_deletion(),
  public.delete_account_now(),
  public.export_my_data(),
  public.admin_reports(text),
  public.admin_close_report(uuid, text)
to authenticated;

-- The sign-in service runs the sign-up hook, and nothing else here.
grant usage on schema private to supabase_auth_admin;
grant execute on function private.before_user_created(jsonb) to supabase_auth_admin;
