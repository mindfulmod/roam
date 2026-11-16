-- Three kinds of place: in the guide, added by a member and sent for review, or added by a
-- member and kept private. A private place is seen only by its maker and by the people who can
-- see a trip that stops there.
begin;
select t.sample_trip() as trip \gset
select t.share_with_maya(:'trip');

select t.as('leo');
select t.sees($$select 1 from public.places where kind = 'guide'$$, 1, 'any member can see guide places');
select t.refused($$insert into public.places (id, name, kind) values ('tokyo-fake', 'Fake', 'guide')$$, 'a member cannot create a guide place');
select t.refused($$insert into public.places (id, name, created_by) values ('tokyo-fake', 'Fake', t.id('leo'))$$, 'a member cannot claim a guide-style id');
select t.changes($$update public.places set name = 'Hacked' where id = 'tokyo-sensoji'$$, 0, 'a member cannot edit a guide place');
select t.changes($$delete from public.places where id = 'tokyo-sensoji'$$, 0, 'a member cannot delete a guide place');

-- Sam adds a ramen counter that is not in the guide.
select t.as('sam');
select t.changes($$insert into public.places (id, name, lat, lon, created_by) values ('u-ramen', 'Tiny ramen counter', 35.71, 139.79, t.id('sam'))$$, 1, 'a member adds their own place');
select t.is((select kind::text from public.places where id = 'u-ramen'), 'private', 'a member''s place starts private');
select t.refused($$insert into public.places (id, name, created_by) values ('u-other', 'Not mine', t.id('alex'))$$, 'a member cannot add a place in someone else''s name');
select t.as('alex');
select t.sees($$select 1 from public.places where id = 'u-ramen'$$, 0, 'a private place is invisible to others, even fellow travellers, until it is on a trip');
select t.refused(format($$insert into public.trip_stops (trip_id, place_id, logged_by) values (%L, 'u-ramen', t.id('alex'))$$, :'trip'), 'nobody can pull someone else''s private place onto a trip');
select t.as('am');
select t.sees($$select 1 from public.places where id = 'u-ramen'$$, 0, 'admin cannot see a private place');

-- Once Sam puts it on the trip, the people who can see the trip can see the place.
select t.as('sam');
select t.changes(format($$insert into public.trip_stops (trip_id, place_id, logged_by) values (%L, 'u-ramen', t.id('sam'))$$, :'trip'), 1, 'Sam adds the private place to the trip');
select t.as('alex');
select t.sees($$select 1 from public.places where id = 'u-ramen'$$, 1, 'fellow traveller now sees the place');
select t.changes($$update public.places set name = 'Hacked' where id = 'u-ramen'$$, 0, '...but cannot edit it');
select t.as('maya');
select t.sees($$select 1 from public.places where id = 'u-ramen'$$, 1, 'viewer of the trip sees the place');
select t.as('leo');
select t.sees($$select 1 from public.places where id = 'u-ramen'$$, 0, 'everyone else still does not');

-- Review. Members cannot mark their own place as reviewed or as part of the guide.
select t.as('sam');
select t.refused($$update public.places set kind = 'guide' where id = 'u-ramen'$$, 'a member cannot turn their place into a guide place');
select t.refused($$update public.places set review_status = 'approved' where id = 'u-ramen'$$, 'a member cannot approve their own place');
select t.refused($$select public.admin_review_place('u-ramen', true)$$, 'a member cannot use the review function');
select t.as('alex');
select t.refused($$select public.submit_place_for_review('u-ramen')$$, 'only the maker can send a place for review');
select t.as('sam');
select t.changes($$select public.submit_place_for_review('u-ramen')$$, 1, 'Sam sends the place for review');
select t.changes($$update public.places set name = 'Changed after sending' where id = 'u-ramen'$$, 0, 'a place under review cannot be edited by its maker');
select t.as('am');
select t.sees($$select 1 from public.places where kind = 'submitted' and review_status = 'pending'$$, 1, 'admin sees the review queue');
select t.sees($$select 1 from public.trips$$, 0, '...without seeing the trip it came from');
select t.changes($$select public.admin_review_place('u-ramen', false, null, 'Could not find it')$$, 1, 'admin turns it down');
select t.as('sam');
select t.is((select kind::text || '/' || review_status::text from public.places where id = 'u-ramen'), 'private/rejected', 'a place that is turned down stays as the member''s private place');
select t.sees($$select 1 from public.trip_stops where place_id = 'u-ramen'$$, 1, '...and stays on the trip');

select t.changes($$select public.submit_place_for_review('u-ramen')$$, 1, 'Sam sends it again');
select t.as_setup();
insert into public.places (id, kind, name) values ('tokyo-tiny-ramen', 'guide', 'Tiny ramen counter');
select t.as('am');
select t.changes($$select public.admin_review_place('u-ramen', true, 'tokyo-tiny-ramen')$$, 1, 'admin approves it and names the guide place it became');
select t.as('sam');
select t.is((select promoted_to from public.places where id = 'u-ramen'), 'tokyo-tiny-ramen', 'the member''s place points at the new guide place');
select t.as('leo');
select t.sees($$select 1 from public.places where id = 'tokyo-tiny-ramen'$$, 1, 'the new guide place is there for everyone');
select t.sees($$select 1 from public.places where id = 'u-ramen'$$, 0, 'the member''s own copy is still not public');

select t.finish();
rollback;
