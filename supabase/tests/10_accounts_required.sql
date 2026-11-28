-- Rule: accounts are required and there are no public links.
begin;
select t.sample_trip() as trip \gset
select t.share_with_maya(:'trip');

-- A visitor with no account gets nothing at all, even for a trip that is shared with viewers.
select t.as_signed_out();
select t.refused('select * from public.' || tbl, 'signed out: cannot read ' || tbl)
from unnest(array[
  'profiles', 'account_private', 'app_admins', 'friendships', 'trips', 'trip_travellers',
  'trip_traveller_settings', 'trip_traveller_approvals', 'trip_viewers', 'trip_viewer_approvals',
  'trip_private_links', 'places', 'trip_stops', 'photos', 'photo_hides',
  'trip_stop_corrections', 'trip_stop_absences'
]) tbl;
select t.refused($$select public.create_trip('x')$$, 'signed out: cannot start a trip');
select t.refused($$select * from public.my_trip_invites()$$, 'signed out: cannot list invites');
select t.refused(format($$select public.trip_log(%L)$$, :'trip'), 'signed out: cannot fetch a trip''s log');
select t.refused(format($$select public.close_stop(%L, '12:00')$$, t.id('stop-alex')), 'signed out: cannot close a stop');
select t.sees($$select 1 from storage.objects$$, 0, 'signed out: cannot fetch any photo file');

-- Knowing a trip's address is worth nothing: a signed-in stranger sees none of it.
select t.as('leo');
select t.sees($$select 1 from public.trips$$, 0, 'stranger with an account: sees no trip');
select t.sees($$select 1 from public.trip_stops$$, 0, 'stranger: sees no stops');
select t.sees($$select 1 from public.photos$$, 0, 'stranger: sees no photos');
select t.sees($$select 1 from public.trip_travellers$$, 0, 'stranger: cannot see who travelled');
select t.sees($$select 1 from public.trip_viewers$$, 0, 'stranger: cannot see who views');
select t.sees($$select 1 from storage.objects$$, 0, 'stranger: cannot fetch any photo file');

-- There is no "public" or "anyone with the link" setting to choose.
select t.as_setup();
select t.is(
  (select array_agg(e.enumlabel::text order by e.enumsortorder) from pg_enum e
   where e.enumtypid = 'public.trip_audience'::regtype),
  array['travellers', 'viewers_after', 'viewers_live'],
  'the only sharing choices are travellers, viewers after the trip, viewers live');

-- The person who runs the app has no back door into private trips.
select t.as('am');
select t.sees($$select 1 from public.trips$$, 0, 'admin: sees no private trip');
select t.sees($$select 1 from public.photos$$, 0, 'admin: sees no private photos');
select t.sees($$select 1 from storage.objects$$, 0, 'admin: cannot fetch photo files');

select t.finish();
rollback;
