-- Tandem Roads: accounts, trips, travellers, viewers, places and photos.
--
-- The group's privacy rules live here, in the database, so no screen can get them wrong:
--   1. Accounts are required. The signed-out role ("anon") can read and do nothing.
--   2. There are no public links. A trip is seen by its travellers and by named viewers only.
--   3. The most private choice wins. Each traveller holds their own sharing choice and the trip
--      uses the most private one, so widening needs everyone and narrowing needs one person.
--   4. Every traveller approves each viewer, and any traveller can take their approval back.
--   5. Any traveller can hide a photo from viewers. Only the person who hid it can show it again.
--   6. Viewers see a trip only after it has ended, unless every traveller chose "live".
--
-- Reads are guarded by row level security. The few writes that touch more than one row
-- (creating a trip, joining one) go through functions. See docs/data-model.md.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- Supabase gives the signed-out and signed-in roles every right on new tables by default and
-- leaves row level security as the only guard. Here nothing is granted unless it is listed.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
alter default privileges revoke execute on functions from public;

-- ---------------------------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------------------------

-- Ordered from most private to least private. There is deliberately no "public" value.
create type public.trip_audience as enum ('travellers', 'viewers_after', 'viewers_live');
create type public.traveller_status as enum ('invited', 'active');
-- guide: in the Tandem Roads guide. submitted: added by a member and sent for review.
-- private: added by a member and kept to their own trips.
create type public.place_kind as enum ('guide', 'submitted', 'private');
create type public.place_review as enum ('pending', 'approved', 'rejected');
create type public.photo_source as enum ('device', 'google_photos');

-- ---------------------------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------------------------

-- What friends may see. The email address stays in auth.users and is never copied here.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_path text,
  home_city text check (char_length(home_city) <= 80),
  bio text check (char_length(bio) <= 160),
  created_at timestamptz not null default now()
);

-- What only the account holder may see.
create table public.account_private (
  id uuid primary key references public.profiles (id) on delete cascade,
  age_band text check (age_band in ('16-17', '18+')),
  updated_at timestamptz not null default now()
);

-- Who runs the app. Not readable or writable through the API at all.
create table public.app_admins (
  account_id uuid primary key references public.profiles (id) on delete cascade
);

create table public.friendships (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
-- One link per pair, whoever asked first.
create unique index friendships_pair on public.friendships
  (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee on public.friendships (addressee_id);

-- ---------------------------------------------------------------------------------------------
-- Trips, travellers and viewers
-- ---------------------------------------------------------------------------------------------

-- A trip has no owner column on purpose: every traveller has the same standing.
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  starts_on date,
  ends_on date,
  cover_photo_id uuid,
  created_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table public.trip_travellers (
  trip_id uuid not null references public.trips (id) on delete cascade,
  account_id uuid not null references public.profiles (id) on delete cascade,
  status public.traveller_status not null default 'invited',
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (trip_id, account_id)
);
create index trip_travellers_account on public.trip_travellers (account_id);

-- Each traveller's own choices. Kept apart from trip_travellers so viewers, who may see the
-- names of the travellers, never receive who chose what.
create table public.trip_traveller_settings (
  trip_id uuid not null,
  account_id uuid not null,
  audience_choice public.trip_audience not null default 'travellers',
  agrees_delete boolean not null default false,
  primary key (trip_id, account_id),
  foreign key (trip_id, account_id)
    references public.trip_travellers (trip_id, account_id) on delete cascade
);

-- "Yes, add this person to the trip", one row per traveller who agreed.
create table public.trip_traveller_approvals (
  trip_id uuid not null,
  invitee_id uuid not null,
  traveller_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (trip_id, invitee_id, traveller_id),
  foreign key (trip_id, invitee_id)
    references public.trip_travellers (trip_id, account_id) on delete cascade,
  foreign key (trip_id, traveller_id)
    references public.trip_travellers (trip_id, account_id) on delete cascade
);

create table public.trip_viewers (
  trip_id uuid not null references public.trips (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (trip_id, viewer_id)
);
create index trip_viewers_viewer on public.trip_viewers (viewer_id);

-- "Yes, this person may see the trip", one row per traveller who agreed.
create table public.trip_viewer_approvals (
  trip_id uuid not null,
  viewer_id uuid not null,
  traveller_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (trip_id, viewer_id, traveller_id),
  foreign key (trip_id, viewer_id)
    references public.trip_viewers (trip_id, viewer_id) on delete cascade,
  foreign key (trip_id, traveller_id)
    references public.trip_travellers (trip_id, account_id) on delete cascade
);

-- Things only the travellers use, such as a link to the full album in Google Photos or iCloud.
create table public.trip_private_links (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  url text not null check (url ~ '^https://' and char_length(url) <= 500),
  label text check (char_length(label) <= 80),
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index trip_private_links_trip on public.trip_private_links (trip_id);

-- ---------------------------------------------------------------------------------------------
-- Places
-- ---------------------------------------------------------------------------------------------

-- Guide places keep the ids used in data/cities (for example "tokyo-sensoji") and are written
-- only by the server. Places added by members get an id that cannot be guessed.
create table public.places (
  id text primary key default ('u-' || gen_random_uuid()),
  kind public.place_kind not null default 'private',
  name text not null check (char_length(name) between 1 and 120),
  local_name text check (char_length(local_name) <= 120),
  lat double precision check (lat between -90 and 90),
  lon double precision check (lon between -180 and 180),
  city_id text,
  country text,
  osm_ref text,
  created_by uuid references public.profiles (id) on delete set null,
  review_status public.place_review,
  review_note text,
  reviewed_at timestamptz,
  promoted_to text references public.places (id) on delete set null,
  created_at timestamptz not null default now(),
  check (kind <> 'guide' or (created_by is null and review_status is null and promoted_to is null)),
  check (kind <> 'private' or review_status is null or review_status = 'rejected'),
  check (kind <> 'submitted' or review_status in ('pending', 'approved')),
  check (promoted_to is null or review_status = 'approved')
);
create index places_created_by on public.places (created_by);
create index places_review_queue on public.places (created_at) where kind = 'submitted' and review_status = 'pending';

-- ---------------------------------------------------------------------------------------------
-- Stops and photos
-- ---------------------------------------------------------------------------------------------

create table public.trip_stops (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  place_id text not null references public.places (id),
  day date,
  arrived_at timestamptz,
  left_at timestamptz,
  position integer not null default 0,
  note text check (char_length(note) <= 1000),
  logged_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (trip_id, id)
);
create index trip_stops_trip on public.trip_stops (trip_id, day, position);
create index trip_stops_place on public.trip_stops (place_id);

-- Picked highlights only. No location columns: where a photo was taken is never stored.
-- The file lives in the private "trip-photos" bucket at <trip_id>/<photo_id>.<ext>.
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  stop_id uuid,
  added_by uuid not null references public.profiles (id) on delete cascade,
  source public.photo_source not null default 'device',
  caption text check (char_length(caption) <= 200),
  taken_at timestamptz,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  foreign key (trip_id, stop_id) references public.trip_stops (trip_id, id) on delete cascade
);
create index photos_trip on public.photos (trip_id);
create index photos_added_by on public.photos (added_by);

alter table public.trips
  add constraint trips_cover_photo foreign key (cover_photo_id) references public.photos (id) on delete set null;

-- A photo is shown to viewers only while it has no rows here. The row outlives the person
-- who made it (hidden_by becomes empty), so leaving a trip never un-hides a photo.
create table public.photo_hides (
  id bigint generated always as identity primary key,
  photo_id uuid not null references public.photos (id) on delete cascade,
  hidden_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (photo_id, hidden_by)
);

-- ---------------------------------------------------------------------------------------------
-- Who may see what. These run with the table owner's rights so that a policy on one table can
-- look at another without handing the caller that table. Each answers only about the caller.
-- ---------------------------------------------------------------------------------------------

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins a where a.account_id = (select auth.uid()));
$$;

create function private.is_traveller(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.trip_travellers t
    where t.trip_id = p_trip and t.account_id = (select auth.uid()) and t.status = 'active'
  );
$$;

-- Active or still only invited.
create function private.is_on_trip(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.trip_travellers t
    where t.trip_id = p_trip and t.account_id = (select auth.uid())
  );
$$;

-- The whole viewer rule in one place. The caller sees the trip as a viewer only when:
--   they are listed as a viewer, and
--   every current traveller has approved them, and
--   every current traveller's sharing choice allows viewers at this moment
--   (after the trip has ended: "viewers_after" or wider; before that: "viewers_live" only).
-- A traveller with no settings row counts as "travellers only".
create function private.is_viewer(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select
    exists (
      select 1 from public.trip_viewers v
      where v.trip_id = p_trip and v.viewer_id = (select auth.uid())
    )
    and exists (
      select 1 from public.trip_travellers t where t.trip_id = p_trip and t.status = 'active'
    )
    and not exists (
      select 1
      from public.trip_travellers t
      join public.trips tr on tr.id = t.trip_id
      where t.trip_id = p_trip
        and t.status = 'active'
        and (
          not exists (
            select 1 from public.trip_viewer_approvals a
            where a.trip_id = p_trip
              and a.viewer_id = (select auth.uid())
              and a.traveller_id = t.account_id
          )
          or not exists (
            select 1 from public.trip_traveller_settings s
            where s.trip_id = p_trip
              and s.account_id = t.account_id
              and s.audience_choice >= (
                case when tr.ends_on is not null and tr.ends_on < current_date
                  then 'viewers_after' else 'viewers_live' end
              )::public.trip_audience
          )
        )
    );
$$;

create function private.can_see_trip(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_traveller(p_trip) or private.is_viewer(p_trip);
$$;

create function private.is_friend(p_other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = (select auth.uid()) and f.addressee_id = p_other)
        or (f.addressee_id = (select auth.uid()) and f.requester_id = p_other))
  );
$$;

-- Whose profile the caller may open: their own, a friend's (or someone with a friend request
-- open either way), people on a trip with them, and the people on a trip they may view.
create function private.knows(p_other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_other = (select auth.uid())
    or exists (
      select 1 from public.friendships f
      where (f.requester_id = (select auth.uid()) and f.addressee_id = p_other)
         or (f.addressee_id = (select auth.uid()) and f.requester_id = p_other)
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

-- A member's own place becomes visible to the people who can see a trip that stops there.
create function private.can_see_place(p_place text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.trip_stops s
    where s.place_id = p_place and private.can_see_trip(s.trip_id)
  );
$$;

create function private.photo_trip(p_photo uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select p.trip_id from public.photos p where p.id = p_photo;
$$;

create function private.photo_hidden(p_photo uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.photo_hides h where h.photo_id = p_photo);
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.account_private enable row level security;
alter table public.app_admins enable row level security;
alter table public.friendships enable row level security;
alter table public.trips enable row level security;
alter table public.trip_travellers enable row level security;
alter table public.trip_traveller_settings enable row level security;
alter table public.trip_traveller_approvals enable row level security;
alter table public.trip_viewers enable row level security;
alter table public.trip_viewer_approvals enable row level security;
alter table public.trip_private_links enable row level security;
alter table public.places enable row level security;
alter table public.trip_stops enable row level security;
alter table public.photos enable row level security;
alter table public.photo_hides enable row level security;

-- Belt and braces: the signed-out role holds no rights on any of it.
revoke all on all tables in schema public from anon, authenticated, public;

-- Profiles ------------------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (display_name, avatar_path, home_city, bio) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated
  using (private.knows(id));
create policy profiles_edit_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

grant select on public.account_private to authenticated;
grant update (age_band) on public.account_private to authenticated;
create policy account_private_read_own on public.account_private for select to authenticated
  using (id = (select auth.uid()));
create policy account_private_edit_own on public.account_private for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- app_admins: no grants and no policies. Only the server can read or change it.

-- Friendships ---------------------------------------------------------------------------------
grant select, delete on public.friendships to authenticated;
grant insert (requester_id, addressee_id) on public.friendships to authenticated;
grant update (status) on public.friendships to authenticated;
create policy friendships_read on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
create policy friendships_ask on public.friendships for insert to authenticated
  with check (requester_id = (select auth.uid()));
create policy friendships_accept on public.friendships for update to authenticated
  using (addressee_id = (select auth.uid()) and status = 'pending')
  with check (addressee_id = (select auth.uid()) and status = 'accepted');
create policy friendships_end on public.friendships for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

-- Trips ---------------------------------------------------------------------------------------
-- Created with create_trip() and deleted only when every traveller agrees.
grant select on public.trips to authenticated;
grant update (title, starts_on, ends_on, cover_photo_id) on public.trips to authenticated;
create policy trips_read on public.trips for select to authenticated
  using (private.can_see_trip(id));
create policy trips_edit on public.trips for update to authenticated
  using (private.is_traveller(id)) with check (private.is_traveller(id));

-- Travellers ----------------------------------------------------------------------------------
grant select, delete on public.trip_travellers to authenticated;
grant insert (trip_id, account_id, status, invited_by) on public.trip_travellers to authenticated;
create policy trip_travellers_read on public.trip_travellers for select to authenticated
  using (
    account_id = (select auth.uid())
    or private.is_traveller(trip_id)
    or (status = 'active' and private.is_viewer(trip_id))
  );
-- A traveller may invite a friend. The invite becomes a place on the trip only through
-- accept_trip_invite(), once every traveller has approved it.
create policy trip_travellers_invite on public.trip_travellers for insert to authenticated
  with check (
    status = 'invited'
    and invited_by = (select auth.uid())
    and private.is_traveller(trip_id)
    and private.is_friend(account_id)
  );
-- Leave the trip or turn an invite down (your own row), or cancel an invite not yet accepted.
-- Nobody can remove another traveller.
create policy trip_travellers_leave on public.trip_travellers for delete to authenticated
  using (
    account_id = (select auth.uid())
    or (status = 'invited' and private.is_traveller(trip_id))
  );

grant select on public.trip_traveller_settings to authenticated;
grant update (audience_choice, agrees_delete) on public.trip_traveller_settings to authenticated;
create policy trip_settings_read on public.trip_traveller_settings for select to authenticated
  using (private.is_traveller(trip_id));
-- Your own choice only. This one line is what makes "widening needs all, narrowing needs one".
create policy trip_settings_edit_own on public.trip_traveller_settings for update to authenticated
  using (account_id = (select auth.uid()) and private.is_traveller(trip_id))
  with check (account_id = (select auth.uid()) and private.is_traveller(trip_id));

grant select, insert, delete on public.trip_traveller_approvals to authenticated;
create policy trip_traveller_approvals_read on public.trip_traveller_approvals for select to authenticated
  using (private.is_traveller(trip_id));
create policy trip_traveller_approvals_give on public.trip_traveller_approvals for insert to authenticated
  with check (traveller_id = (select auth.uid()) and private.is_traveller(trip_id));
create policy trip_traveller_approvals_take_back on public.trip_traveller_approvals for delete to authenticated
  using (traveller_id = (select auth.uid()));

-- Viewers -------------------------------------------------------------------------------------
grant select, delete on public.trip_viewers to authenticated;
grant insert (trip_id, viewer_id, invited_by) on public.trip_viewers to authenticated;
-- Someone proposed as a viewer learns of it only once they can actually see the trip.
create policy trip_viewers_read on public.trip_viewers for select to authenticated
  using (private.is_traveller(trip_id) or private.is_viewer(trip_id));
create policy trip_viewers_propose on public.trip_viewers for insert to authenticated
  with check (
    invited_by = (select auth.uid())
    and private.is_traveller(trip_id)
    and private.is_friend(viewer_id)
    and not exists (
      select 1 from public.trip_travellers t
      where t.trip_id = trip_viewers.trip_id and t.account_id = trip_viewers.viewer_id
    )
  );
-- Any one traveller can remove a viewer, and a viewer can remove themselves.
create policy trip_viewers_remove on public.trip_viewers for delete to authenticated
  using (private.is_traveller(trip_id) or (viewer_id = (select auth.uid()) and private.is_viewer(trip_id)));

grant select, insert, delete on public.trip_viewer_approvals to authenticated;
create policy trip_viewer_approvals_read on public.trip_viewer_approvals for select to authenticated
  using (private.is_traveller(trip_id));
create policy trip_viewer_approvals_give on public.trip_viewer_approvals for insert to authenticated
  with check (traveller_id = (select auth.uid()) and private.is_traveller(trip_id));
create policy trip_viewer_approvals_take_back on public.trip_viewer_approvals for delete to authenticated
  using (traveller_id = (select auth.uid()));

grant select, delete on public.trip_private_links to authenticated;
grant insert (trip_id, url, label, added_by) on public.trip_private_links to authenticated;
create policy trip_private_links_read on public.trip_private_links for select to authenticated
  using (private.is_traveller(trip_id));
create policy trip_private_links_add on public.trip_private_links for insert to authenticated
  with check (added_by = (select auth.uid()) and private.is_traveller(trip_id));
create policy trip_private_links_remove on public.trip_private_links for delete to authenticated
  using (private.is_traveller(trip_id));

-- Places --------------------------------------------------------------------------------------
grant select, delete on public.places to authenticated;
grant insert (id, name, local_name, lat, lon, city_id, country, osm_ref, created_by) on public.places to authenticated;
grant update (name, local_name, lat, lon, city_id, country, osm_ref) on public.places to authenticated;
create policy places_read on public.places for select to authenticated
  using (
    kind = 'guide'
    or created_by = (select auth.uid())
    or (kind = 'submitted' and private.is_admin())
    or private.can_see_place(id)
  );
-- Members can only ever create a private place. Kind and review columns are not theirs to set.
create policy places_add_own on public.places for insert to authenticated
  with check (created_by = (select auth.uid()) and kind = 'private' and id like 'u-%');
create policy places_edit_own on public.places for update to authenticated
  using (created_by = (select auth.uid()) and kind = 'private')
  with check (created_by = (select auth.uid()) and kind = 'private');
create policy places_delete_own on public.places for delete to authenticated
  using (created_by = (select auth.uid()) and kind = 'private');

-- Stops ---------------------------------------------------------------------------------------
grant select, delete on public.trip_stops to authenticated;
grant insert (id, trip_id, place_id, day, arrived_at, left_at, position, note, logged_by) on public.trip_stops to authenticated;
grant update (place_id, day, arrived_at, left_at, position, note) on public.trip_stops to authenticated;
create policy trip_stops_read on public.trip_stops for select to authenticated
  using (private.can_see_trip(trip_id));
-- The place has to be one the traveller can already see, so nobody can pull another member's
-- private place into view by pointing a stop at it.
create policy trip_stops_add on public.trip_stops for insert to authenticated
  with check (
    private.is_traveller(trip_id)
    and logged_by = (select auth.uid())
    and exists (select 1 from public.places p where p.id = place_id)
  );
create policy trip_stops_edit on public.trip_stops for update to authenticated
  using (private.is_traveller(trip_id))
  with check (
    private.is_traveller(trip_id)
    and exists (select 1 from public.places p where p.id = place_id)
  );
create policy trip_stops_remove on public.trip_stops for delete to authenticated
  using (private.is_traveller(trip_id));

-- Photos --------------------------------------------------------------------------------------
grant select, delete on public.photos to authenticated;
grant insert (id, trip_id, stop_id, added_by, source, caption, taken_at, width, height) on public.photos to authenticated;
grant update (stop_id, caption) on public.photos to authenticated;
create policy photos_read on public.photos for select to authenticated
  using (
    private.is_traveller(trip_id)
    or (private.is_viewer(trip_id) and not private.photo_hidden(id))
  );
create policy photos_add on public.photos for insert to authenticated
  with check (added_by = (select auth.uid()) and private.is_traveller(trip_id));
create policy photos_edit_own on public.photos for update to authenticated
  using (added_by = (select auth.uid()) and private.is_traveller(trip_id))
  with check (added_by = (select auth.uid()) and private.is_traveller(trip_id));
create policy photos_delete_own on public.photos for delete to authenticated
  using (added_by = (select auth.uid()));

grant select, delete on public.photo_hides to authenticated;
grant insert (photo_id, hidden_by) on public.photo_hides to authenticated;
create policy photo_hides_read on public.photo_hides for select to authenticated
  using (private.is_traveller(private.photo_trip(photo_id)));
create policy photo_hides_hide on public.photo_hides for insert to authenticated
  with check (hidden_by = (select auth.uid()) and private.is_traveller(private.photo_trip(photo_id)));
-- Only the traveller who hid a photo can show it again.
create policy photo_hides_show_again on public.photo_hides for delete to authenticated
  using (hidden_by = (select auth.uid()) and private.is_traveller(private.photo_trip(photo_id)));

-- ---------------------------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------------------------

-- A profile for every new account. The email is not copied.
create function private.on_account_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(left(trim(new.raw_user_meta_data ->> 'display_name'), 40), ''), 'Traveller'));
  insert into public.account_private (id) values (new.id);
  return new;
end;
$$;
create trigger on_account_created after insert on auth.users
  for each row execute function private.on_account_created();

-- Whoever sends an invite has approved it.
create function private.on_traveller_invited() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'invited' and new.invited_by is not null then
    insert into public.trip_traveller_approvals (trip_id, invitee_id, traveller_id)
    values (new.trip_id, new.account_id, new.invited_by)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger on_traveller_invited after insert on public.trip_travellers
  for each row execute function private.on_traveller_invited();

create function private.on_viewer_proposed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.invited_by is not null then
    insert into public.trip_viewer_approvals (trip_id, viewer_id, traveller_id)
    values (new.trip_id, new.viewer_id, new.invited_by)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger on_viewer_proposed after insert on public.trip_viewers
  for each row execute function private.on_viewer_proposed();

-- When a traveller leaves (or deletes their account): their photos and notes go and their name
-- comes off the stops, the places stay, and photos they hid stay hidden. When the last
-- traveller has gone the trip goes too.
create function private.on_traveller_removed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.trips t where t.id = old.trip_id) then
    return old; -- the whole trip is being deleted
  end if;
  if old.status = 'active' then
    delete from public.photos p where p.trip_id = old.trip_id and p.added_by = old.account_id;
    update public.trip_stops s set note = null, logged_by = null
      where s.trip_id = old.trip_id and s.logged_by = old.account_id;
    update public.photo_hides h set hidden_by = null
      where h.hidden_by = old.account_id
        and h.photo_id in (select p.id from public.photos p where p.trip_id = old.trip_id);
    update public.trip_private_links l set added_by = null
      where l.trip_id = old.trip_id and l.added_by = old.account_id;
    if not exists (
      select 1 from public.trip_travellers t where t.trip_id = old.trip_id and t.status = 'active'
    ) then
      delete from public.trips t where t.id = old.trip_id;
    end if;
  end if;
  return old;
end;
$$;
create trigger on_traveller_removed after delete on public.trip_travellers
  for each row execute function private.on_traveller_removed();

-- Deleting an account is leaving every trip. Doing the leaving first means the notes are
-- cleared while the stops still carry the person's name.
create function private.on_account_removed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.trip_travellers t where t.account_id = old.id;
  return old;
end;
$$;
create trigger on_account_removed before delete on public.profiles
  for each row execute function private.on_account_removed();

-- Deleting the whole trip needs every traveller to agree.
create function private.on_delete_vote() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.agrees_delete and not exists (
    select 1
    from public.trip_travellers t
    left join public.trip_traveller_settings s
      on s.trip_id = t.trip_id and s.account_id = t.account_id
    where t.trip_id = new.trip_id and t.status = 'active' and not coalesce(s.agrees_delete, false)
  ) then
    delete from public.trips t where t.id = new.trip_id;
  end if;
  return new;
end;
$$;
create trigger on_delete_vote after update of agrees_delete on public.trip_traveller_settings
  for each row execute function private.on_delete_vote();

-- Viewers on "after the trip" see it once the end date has passed, so one traveller must not be
-- able to end the trip early by editing the date. A trip that has not ended can only be given
-- an end date of today or later. Trips logged afterwards get their dates when they are created.
create function private.guard_trip_dates() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.ends_on is distinct from old.ends_on
     and new.ends_on is not null
     and new.ends_on < current_date
     and (old.ends_on is null or old.ends_on >= current_date) then
    raise exception 'A trip that has not ended cannot be given an end date in the past'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger guard_trip_dates before update on public.trips
  for each row execute function private.guard_trip_dates();

-- Highlights, not an album: at most 300 photos on a trip.
create function private.guard_photo_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.photos p where p.trip_id = new.trip_id) >= 300 then
    raise exception 'This trip already has 300 photos' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger guard_photo_count before insert on public.photos
  for each row execute function private.guard_photo_count();

-- ---------------------------------------------------------------------------------------------
-- Functions the app calls
-- ---------------------------------------------------------------------------------------------

-- Start a trip. The caller becomes its first traveller and it starts travellers-only.
create function public.create_trip(p_title text, p_starts_on date default null, p_ends_on date default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_trip uuid;
begin
  if v_me is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;
  insert into public.trips (title, starts_on, ends_on)
  values (p_title, p_starts_on, p_ends_on) returning id into v_trip;
  insert into public.trip_travellers (trip_id, account_id, status) values (v_trip, v_me, 'active');
  insert into public.trip_traveller_settings (trip_id, account_id) values (v_trip, v_me);
  return v_trip;
end;
$$;

-- The invites waiting for the caller, with just enough to decide.
create function public.my_trip_invites()
returns table (trip_id uuid, title text, invited_by_name text, ready boolean)
language sql stable security definer set search_path = '' as $$
  select t.id, t.title, p.display_name,
    not exists (
      select 1 from public.trip_travellers a
      where a.trip_id = t.id and a.status = 'active'
        and not exists (
          select 1 from public.trip_traveller_approvals ap
          where ap.trip_id = t.id and ap.invitee_id = me.account_id and ap.traveller_id = a.account_id
        )
    )
  from public.trip_travellers me
  join public.trips t on t.id = me.trip_id
  left join public.profiles p on p.id = me.invited_by
  where me.account_id = (select auth.uid()) and me.status = 'invited';
$$;

-- Join a trip you were invited to. Works only once every traveller has approved you.
-- You join on the most private setting, which keeps viewers out until you have had your say.
create function public.accept_trip_invite(p_trip uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
begin
  if not exists (
    select 1 from public.trip_travellers t
    where t.trip_id = p_trip and t.account_id = v_me and t.status = 'invited'
  ) then
    raise exception 'No invite to accept' using errcode = 'insufficient_privilege';
  end if;
  if exists (
    select 1 from public.trip_travellers a
    where a.trip_id = p_trip and a.status = 'active'
      and not exists (
        select 1 from public.trip_traveller_approvals ap
        where ap.trip_id = p_trip and ap.invitee_id = v_me and ap.traveller_id = a.account_id
      )
  ) then
    raise exception 'Not every traveller has approved this invite yet' using errcode = 'insufficient_privilege';
  end if;
  update public.trip_travellers t set status = 'active' where t.trip_id = p_trip and t.account_id = v_me;
  insert into public.trip_traveller_settings (trip_id, account_id) values (p_trip, v_me)
    on conflict do nothing;
  delete from public.trip_traveller_approvals ap where ap.trip_id = p_trip and ap.invitee_id = v_me;
  delete from public.trip_viewers v where v.trip_id = p_trip and v.viewer_id = v_me;
end;
$$;

-- Send one of your own places to be considered for the guide.
create function public.submit_place_for_review(p_place text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.places p
    set kind = 'submitted', review_status = 'pending', review_note = null, reviewed_at = null
    where p.id = p_place and p.created_by = auth.uid() and p.kind = 'private';
  if not found then
    raise exception 'Not one of your private places' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- The review step, for whoever runs the app. Approving can name the guide place it became;
-- turning it down hands it back to the member as a private place.
create function public.admin_review_place(
  p_place text, p_approve boolean, p_guide_place text default null, p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'Admins only' using errcode = 'insufficient_privilege';
  end if;
  if p_approve then
    update public.places p
      set review_status = 'approved', reviewed_at = now(), review_note = p_note, promoted_to = p_guide_place
      where p.id = p_place and p.kind = 'submitted';
  else
    update public.places p
      set kind = 'private', review_status = 'rejected', reviewed_at = now(), review_note = p_note
      where p.id = p_place and p.kind = 'submitted';
  end if;
  if not found then
    raise exception 'No submitted place with that id' using errcode = 'no_data_found';
  end if;
end;
$$;

revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon;
grant execute on function public.create_trip(text, date, date) to authenticated;
grant execute on function public.my_trip_invites() to authenticated;
grant execute on function public.accept_trip_invite(uuid) to authenticated;
grant execute on function public.submit_place_for_review(text) to authenticated;
grant execute on function public.admin_review_place(text, boolean, text, text) to authenticated;
