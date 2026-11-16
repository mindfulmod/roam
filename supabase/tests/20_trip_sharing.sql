-- Rules: a trip starts travellers-only; every traveller approves each viewer; the most private
-- choice wins; widening needs every traveller and narrowing needs one; viewers see a trip only
-- after it has ended unless every traveller chose "live".
begin;
select t.sample_trip() as trip \gset

-- A new trip starts with only its travellers.
select t.as('alex');
select t.sees($$select 1 from public.trips$$, 1, 'traveller: sees the trip');
select t.is((select audience_choice::text from public.trip_traveller_settings where account_id = t.id('alex')),
  'travellers', 'a new trip starts travellers-only');
select t.as('maya');
select t.sees($$select 1 from public.trips$$, 0, 'friend of a traveller, not a viewer: sees nothing');

-- Proposing a viewer. Only travellers can, and only their own friends.
select t.as('alex');
select t.refused(format($$insert into public.trip_viewers (trip_id, viewer_id, invited_by) values (%L, t.id('leo'), t.id('alex'))$$, :'trip'),
  'a traveller cannot propose a stranger as a viewer');
select t.refused(format($$insert into public.trip_viewers (trip_id, viewer_id, invited_by) values (%L, t.id('maya'), t.id('sam'))$$, :'trip'),
  'a traveller cannot propose a viewer in another traveller''s name');
select t.changes(format($$insert into public.trip_viewers (trip_id, viewer_id, invited_by) values (%L, t.id('maya'), t.id('alex'))$$, :'trip'),
  1, 'Alex proposes Maya as a viewer');
select t.sees($$select 1 from public.trip_viewer_approvals where traveller_id = t.id('alex')$$, 1,
  'proposing a viewer counts as that traveller''s approval');
select t.as('maya');
select t.refused(format($$insert into public.trip_viewers (trip_id, viewer_id, invited_by) values (%L, t.id('maya'), t.id('maya'))$$, :'trip'),
  'nobody can add themselves as a viewer');
select t.sees($$select 1 from public.trip_viewers$$, 0, 'a proposed viewer is not told until they can see the trip');

-- Both travellers open the trip to viewers, but Sam has not approved Maya yet.
select t.as('alex');
select t.changes($$update public.trip_traveller_settings set audience_choice = 'viewers_after' where account_id = t.id('alex')$$, 1, 'Alex chooses to share after the trip');
select t.changes($$update public.trip_traveller_settings set audience_choice = 'viewers_live' where account_id = t.id('sam')$$, 0,
  'Alex cannot change Sam''s choice');
select t.refused(format($$insert into public.trip_viewer_approvals (trip_id, viewer_id, traveller_id) values (%L, t.id('maya'), t.id('sam'))$$, :'trip'),
  'Alex cannot approve a viewer on Sam''s behalf');
select t.as('maya');
select t.sees($$select 1 from public.trips$$, 0, 'one traveller sharing is not enough (widening needs all)');
select t.as('sam');
select t.changes($$update public.trip_traveller_settings set audience_choice = 'viewers_after' where account_id = t.id('sam')$$, 1, 'Sam chooses to share after the trip');
select t.as('maya');
select t.sees($$select 1 from public.trips$$, 0, 'approved by one traveller of two: still sees nothing');
select t.as('sam');
select t.changes(format($$insert into public.trip_viewer_approvals (trip_id, viewer_id, traveller_id) values (%L, t.id('maya'), t.id('sam'))$$, :'trip'), 1, 'Sam approves Maya');

-- Everyone agreed and the trip is over: Maya sees the story.
select t.as('maya');
select t.sees($$select 1 from public.trips$$, 1, 'approved by all + all sharing + trip over: viewer sees the trip');
select t.sees($$select 1 from public.trip_stops$$, 2, 'viewer: sees the stops');
select t.sees($$select 1 from public.photos$$, 2, 'viewer: sees the photos');
select t.sees($$select 1 from public.trip_travellers$$, 2, 'viewer: sees who travelled');
select t.sees($$select 1 from public.profiles where id in (t.id('alex'), t.id('sam'))$$, 2, 'viewer: can open the travellers'' profiles');

-- What a viewer never gets.
select t.sees($$select 1 from public.trip_traveller_settings$$, 0, 'viewer: cannot see who chose what');
select t.sees($$select 1 from public.trip_viewer_approvals$$, 0, 'viewer: cannot see who approved whom');
select t.changes($$update public.trips set title = 'Hacked'$$, 0, 'viewer: cannot edit the trip');
select t.changes($$update public.trip_stops set note = 'Hacked'$$, 0, 'viewer: cannot edit stops');
select t.refused(format($$insert into public.trip_stops (trip_id, place_id, logged_by) values (%L, 'tokyo-sensoji', t.id('maya'))$$, :'trip'), 'viewer: cannot add a stop');
select t.refused(format($$insert into public.photos (trip_id, added_by) values (%L, t.id('maya'))$$, :'trip'), 'viewer: cannot add a photo');
select t.refused(format($$insert into public.trip_viewers (trip_id, viewer_id, invited_by) values (%L, t.id('leo'), t.id('maya'))$$, :'trip'), 'viewer: cannot bring in another viewer');
select t.refused(format($$insert into public.trip_viewer_approvals (trip_id, viewer_id, traveller_id) values (%L, t.id('maya'), t.id('maya'))$$, :'trip'), 'viewer: cannot approve anyone');

-- Travellers-only material stays with travellers.
select t.as('alex');
select t.changes(format($$insert into public.trip_private_links (trip_id, url, label, added_by) values (%L, 'https://photos.app.goo.gl/example', 'Full album', t.id('alex'))$$, :'trip'), 1, 'a traveller saves the link to the full album');
select t.as('sam');
select t.sees($$select 1 from public.trip_private_links$$, 1, 'the other traveller sees the album link');
select t.as('maya');
select t.sees($$select 1 from public.trip_private_links$$, 0, 'viewer: never sees the album link');

-- Narrowing needs one: Sam alone takes the trip back to travellers-only.
select t.as('sam');
select t.changes($$update public.trip_traveller_settings set audience_choice = 'travellers' where account_id = t.id('sam')$$, 1, 'Sam goes back to travellers-only');
select t.as('maya');
select t.sees($$select 1 from public.trips$$, 0, 'one traveller narrowing hides the trip from viewers at once');
select t.sees($$select 1 from public.photos$$, 0, '...and its photos');
select t.sees($$select 1 from storage.objects$$, 0, '...and the photo files');
select t.as('alex');
select t.changes($$update public.trip_traveller_settings set audience_choice = 'viewers_live' where account_id = t.id('alex')$$, 1, 'Alex picks the widest setting');
select t.as('maya');
select t.sees($$select 1 from public.trips$$, 0, 'the most private choice still wins');
select t.as('sam');
select t.changes($$update public.trip_traveller_settings set audience_choice = 'viewers_after' where account_id = t.id('sam')$$, 1, 'Sam shares again');
select t.as('maya');
select t.sees($$select 1 from public.trips$$, 1, 'viewer sees the trip again');

-- Narrowing needs one, again: Sam alone takes back approval of this one viewer.
select t.as('alex');
select t.changes($$delete from public.trip_viewer_approvals where traveller_id = t.id('sam')$$, 0, 'Alex cannot touch Sam''s approval');
select t.as('sam');
select t.changes($$delete from public.trip_viewer_approvals where traveller_id = t.id('sam') and viewer_id = t.id('maya')$$, 1, 'Sam takes back approval of Maya');
select t.as('maya');
select t.sees($$select 1 from public.trips$$, 0, 'one traveller withdrawing approval removes that viewer');
select t.as('sam');
select t.changes(format($$insert into public.trip_viewer_approvals (trip_id, viewer_id, traveller_id) values (%L, t.id('maya'), t.id('sam'))$$, :'trip'), 1, 'Sam approves Maya again');

-- Any one traveller can remove a viewer outright; a viewer can also step away.
select t.as('maya');
select t.changes($$delete from public.trip_viewers where viewer_id = t.id('maya')$$, 1, 'a viewer can remove themselves');
select t.sees($$select 1 from public.trips$$, 0, '...and then sees nothing');
select t.as_setup();
select t.share_with_maya(:'trip');
select t.as('sam');
select t.changes($$delete from public.trip_viewers where viewer_id = t.id('maya')$$, 1, 'one traveller can remove a viewer');
select t.as_setup();
select t.is((select count(*) from public.trip_viewer_approvals), 0::bigint, 'removing a viewer clears their approvals');

-- While the trip is still going on.
select t.share_with_maya(:'trip');
update public.trips set starts_on = current_date - 2, ends_on = current_date + 5 where id = :'trip';
select t.as('maya');
select t.sees($$select 1 from public.trips$$, 0, 'trip still under way, shared "after": viewer waits');
select t.as('alex');
select t.changes($$update public.trip_traveller_settings set audience_choice = 'viewers_live' where account_id = t.id('alex')$$, 1, 'Alex agrees to live');
select t.as('maya');
select t.sees($$select 1 from public.trips$$, 0, 'live needs every traveller, one is not enough');
select t.as('sam');
select t.refused($$update public.trips set ends_on = current_date - 1$$, 'one traveller cannot end the trip early by back-dating it');
select t.changes($$update public.trips set ends_on = current_date + 1$$, 1, 'travellers can still change the end date to today or later');
select t.changes($$update public.trip_traveller_settings set audience_choice = 'viewers_live' where account_id = t.id('sam')$$, 1, 'Sam agrees to live');
select t.as('maya');
select t.sees($$select 1 from public.trips$$, 1, 'every traveller agreed to live: viewer follows along');

-- A trip with no end date counts as still under way.
select t.as_setup();
update public.trip_traveller_settings set audience_choice = 'viewers_after';
update public.trips set ends_on = null where id = :'trip';
select t.as('maya');
select t.sees($$select 1 from public.trips$$, 0, 'no end date: "after the trip" has not arrived');

select t.finish();
rollback;
