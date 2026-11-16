-- Tandem Roads: where photo files live and who may fetch them.
--
-- One private bucket. A file is named <trip_id>/<photo_id>.<ext> (a second size may add a
-- suffix, for example <photo_id>_small.webp). The same rules as the photos table apply to the
-- file itself, so a hidden photo cannot be fetched by a viewer who kept its address.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-photos', 'trip-photos', false, 1572864, array['image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create function private.photo_file_trip(p_name text) returns uuid
language sql immutable set search_path = '' as $$
  select (substring(p_name from '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[._]'))::uuid;
$$;

create function private.photo_file_photo(p_name text) returns uuid
language sql immutable set search_path = '' as $$
  select (substring(p_name from '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})[._]'))::uuid;
$$;

-- True when the caller may see the photo this file belongs to.
create function private.can_see_photo_file(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.photos p
    where p.id = private.photo_file_photo(p_name)
      and p.trip_id = private.photo_file_trip(p_name)
      and (
        private.is_traveller(p.trip_id)
        or (private.is_viewer(p.trip_id) and not private.photo_hidden(p.id))
      )
  );
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

create policy trip_photos_read on storage.objects for select to authenticated
  using (
    bucket_id = 'trip-photos'
    and (private.can_see_photo_file(name) or owner_id = (select auth.uid())::text)
  );
-- Only a traveller can put a file in their trip's folder.
create policy trip_photos_add on storage.objects for insert to authenticated
  with check (
    bucket_id = 'trip-photos'
    and owner_id = (select auth.uid())::text
    and private.is_traveller(private.photo_file_trip(name))
  );
create policy trip_photos_remove_own on storage.objects for delete to authenticated
  using (bucket_id = 'trip-photos' and owner_id = (select auth.uid())::text);
