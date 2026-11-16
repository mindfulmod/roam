-- Rules: joining a trip needs every traveller; a new traveller starts on the most private
-- setting; nobody can remove someone else; leaving takes your photos and notes with you and
-- leaves the places; deleting the whole trip needs every traveller.
begin;
select t.sample_trip() as trip \gset
select t.share_with_maya(:'trip');

-- Inviting a traveller.
select t.as('maya');
select t.refused(format($$insert into public.trip_travellers (trip_id, account_id, status, invited_by) values (%L, t.id('leo'), 'invited', t.id('maya'))$$, :'trip'), 'a viewer cannot invite a traveller');
select t.as('leo');
select t.refused(format($$insert into public.trip_travellers (trip_id, account_id, status, invited_by) values (%L, t.id('leo'), 'active', t.id('leo'))$$, :'trip'), 'nobody can add themselves to a trip');
select t.as('alex');
select t.refused(format($$insert into public.trip_travellers (trip_id, account_id, status, invited_by) values (%L, t.id('jo'), 'active', t.id('alex'))$$, :'trip'), 'a traveller cannot add someone directly, only invite');
select t.refused(format($$insert into public.trip_travellers (trip_id, account_id, status, invited_by) values (%L, t.id('leo'), 'invited', t.id('alex'))$$, :'trip'), 'a traveller cannot invite a stranger');
select t.changes(format($$insert into public.trip_travellers (trip_id, account_id, status, invited_by) values (%L, t.id('jo'), 'invited', t.id('alex'))$$, :'trip'), 1, 'Alex invites Jo');

-- Jo can see the invite but nothing of the trip, and cannot join until Sam agrees.
select t.as('jo');
select t.sees($$select 1 from public.my_trip_invites() where title = 'Japan, the four of us' and not ready$$, 1, 'Jo sees the invite, marked not ready');
select t.sees($$select 1 from public.trips$$, 0, 'an invited person sees nothing of the trip yet');
select t.sees($$select 1 from public.photos$$, 0, '...and no photos');
select t.refused(format($$select public.accept_trip_invite(%L)$$, :'trip'), 'Jo cannot join before every traveller approves');
select t.refused(format($$insert into public.trip_traveller_approvals (trip_id, invitee_id, traveller_id) values (%L, t.id('jo'), t.id('sam'))$$, :'trip'), 'Jo cannot approve themselves in Sam''s name');
select t.refused(format($$insert into public.trip_traveller_approvals (trip_id, invitee_id, traveller_id) values (%L, t.id('jo'), t.id('jo'))$$, :'trip'), 'Jo cannot approve themselves');
select t.as('sam');
select t.changes(format($$insert into public.trip_traveller_approvals (trip_id, invitee_id, traveller_id) values (%L, t.id('jo'), t.id('sam'))$$, :'trip'), 1, 'Sam approves Jo');
select t.as('leo');
select t.refused(format($$select public.accept_trip_invite(%L)$$, :'trip'), 'someone who was not invited cannot join');
select t.as('jo');
select t.changes(format($$select public.accept_trip_invite(%L)$$, :'trip'), 1, 'Jo joins once everyone has approved');
select t.sees($$select 1 from public.trips$$, 1, 'Jo now sees the trip');
select t.is((select audience_choice::text from public.trip_traveller_settings where account_id = t.id('jo')), 'travellers', 'a new traveller starts on the most private setting');

-- A new traveller has not agreed to anything yet, so viewers wait for them.
select t.as('maya');
select t.sees($$select 1 from public.trips$$, 0, 'a new traveller joining pauses viewers until they agree');
select t.as('jo');
select t.changes($$update public.trip_traveller_settings set audience_choice = 'viewers_after' where account_id = t.id('jo')$$, 1, 'Jo agrees to share');
select t.as('maya');
select t.sees($$select 1 from public.trips$$, 0, '...and still waits until the new traveller approves her');
select t.as('jo');
select t.changes(format($$insert into public.trip_viewer_approvals (trip_id, viewer_id, traveller_id) values (%L, t.id('maya'), t.id('jo'))$$, :'trip'), 1, 'Jo approves Maya');
select t.as('maya');
select t.sees($$select 1 from public.trips$$, 1, 'viewer sees the trip again');

-- Nobody can be pushed out, and nobody can promote or demote anyone.
select t.as('alex');
select t.changes($$delete from public.trip_travellers where account_id = t.id('jo')$$, 0, 'a traveller cannot remove another traveller');
select t.refused($$update public.trip_travellers set status = 'invited' where account_id = t.id('jo')$$, 'a traveller cannot change anyone''s standing');

-- A traveller cannot also be listed as a viewer.
select t.refused(format($$insert into public.trip_viewers (trip_id, viewer_id, invited_by) values (%L, t.id('jo'), t.id('alex'))$$, :'trip'), 'a traveller cannot also be a viewer');

-- Sam leaves: Sam's photo and note go, the stop stays without a name on it.
select t.as('sam');
select t.changes($$delete from public.trip_travellers where account_id = t.id('sam')$$, 1, 'Sam leaves the trip');
select t.sees($$select 1 from public.trips$$, 0, 'after leaving, Sam no longer sees the trip');
select t.as_setup();
select t.is((select count(*) from public.photos where added_by = t.id('sam')), 0::bigint, 'the leaver''s photos are removed');
select t.is((select count(*) from public.photos where added_by = t.id('alex')), 1::bigint, 'other travellers'' photos stay');
select t.is((select count(*) from public.trip_stops where id = t.id('stop-sam') and note is null and logged_by is null), 1::bigint, 'the leaver''s stop stays, without their note or name');
select t.is((select count(*) from public.trip_traveller_settings where account_id = t.id('sam')), 0::bigint, 'the leaver''s choices are removed');
select t.as('maya');
select t.sees($$select 1 from public.trips$$, 1, 'viewers approved by everyone who remains still see the trip');

-- Deleting the whole trip needs everyone who is on it.
select t.as('alex');
select t.refused($$delete from public.trips$$, 'a traveller cannot delete the trip outright');
select t.changes($$update public.trip_traveller_settings set agrees_delete = true where account_id = t.id('alex')$$, 1, 'Alex votes to delete the trip');
select t.sees($$select 1 from public.trips$$, 1, 'one vote of two does not delete the trip');
select t.changes($$update public.trip_traveller_settings set agrees_delete = true where account_id = t.id('jo')$$, 0, 'Alex cannot vote for Jo');
select t.as('jo');
select t.changes($$update public.trip_traveller_settings set agrees_delete = true where account_id = t.id('jo')$$, 1, 'Jo votes to delete the trip');
select t.as_setup();
select t.is((select count(*) from public.trips), 0::bigint, 'every traveller agreed: the trip is deleted');
select t.is((select count(*) from public.photos), 0::bigint, '...with its photos');
select t.is((select count(*) from public.trip_viewers), 0::bigint, '...and its viewers');

-- The last traveller leaving ends the trip, and deleting an account counts as leaving.
select t.as('alex');
select public.create_trip('Solo weekend') as solo \gset
select t.changes($$delete from public.trip_travellers where account_id = t.id('alex')$$, 1, 'the only traveller leaves');
select t.as_setup();
select t.is((select count(*) from public.trips), 0::bigint, 'a trip with no travellers left is deleted');

select t.as('alex');
select public.create_trip('Two of us') as duo \gset
select t.as_setup();
insert into public.trip_travellers (trip_id, account_id, status) values (:'duo', t.id('jo'), 'active');
insert into public.trip_traveller_settings (trip_id, account_id) values (:'duo', t.id('jo'));
insert into public.trip_stops (id, trip_id, place_id, note, logged_by) values (t.id('stop-jo'), :'duo', 'tokyo-sensoji', 'Mine', t.id('jo'));
insert into public.photos (id, trip_id, added_by) values (t.id('photo-jo'), :'duo', t.id('jo'));
delete from auth.users where id = t.id('jo');
select t.is((select count(*) from public.photos where id = t.id('photo-jo')), 0::bigint, 'deleting an account removes that person''s photos');
select t.is((select count(*) from public.trip_stops where id = t.id('stop-jo') and note is null and logged_by is null), 1::bigint, '...and their notes, while the stop stays');
select t.is((select count(*) from public.trips where id = :'duo'), 1::bigint, '...and the trip lives on for the others');
select t.is((select count(*) from public.profiles where id = t.id('jo')), 0::bigint, '...and their profile is gone');

select t.finish();
rollback;
