-- Rules: logging a trip together. Any traveller logs a stop; whoever logged it changes it and
-- everyone else suggests a correction; anyone can close a stop that is still open; "I wasn't
-- there" is your own; removing a stop keeps everyone's photos; times are the clock at the place;
-- every change counts up the trip's log version; viewers never get suggestions or absences.
begin;
select t.sample_trip() as trip \gset
select t.share_with_maya(:'trip');
insert into public.places (id, kind, name) values
  ('kyoto-kinkakuji', 'guide', 'Kinkaku-ji'), ('kyoto-ginkakuji', 'guide', 'Ginkaku-ji');
insert into public.places (id, name, created_by) values ('u-leos-cafe', 'Leo''s cafe', t.id('leo'));

-- ---------------------------------------------------------------- times at the place
select t.is(
  (select string_agg(column_name || ' ' || data_type, ', ' order by column_name)
   from information_schema.columns
   where table_schema = 'public' and table_name = 'trip_stops' and column_name in ('arrived_at', 'left_at')),
  'arrived_at time without time zone, left_at time without time zone',
  'stop times are clock times at the place, the same for everyone wherever they read them');
select t.is(
  (select data_type from information_schema.columns
   where table_schema = 'public' and table_name = 'photos' and column_name = 'taken_at'),
  'timestamp without time zone', 'a photo keeps the clock time it was taken at, as the camera saw it');

select t.as('alex');
select t.changes(format($$insert into public.trip_stops (id, trip_id, place_id, day, arrived_at, logged_by) values (t.id('kinkaku'), %L, 'kyoto-kinkakuji', current_date - 4, '09:30', t.id('alex'))$$, :'trip'), 1, 'Alex logs a stop at 09:30');
set local timezone = 'America/Toronto';
select t.is((select to_char(arrived_at, 'HH24:MI') from public.trip_stops where id = t.id('kinkaku')), '09:30', 'read from another time zone, it still says 09:30');
reset timezone;
select t.refused(format($$insert into public.trip_stops (trip_id, place_id, arrived_at, logged_by) values (%L, 'kyoto-kinkakuji', '09:30', t.id('alex'))$$, :'trip'), 'a time needs a day');
select t.refused(format($$insert into public.trip_stops (trip_id, place_id, day, arrived_at, left_at, logged_by) values (%L, 'kyoto-kinkakuji', current_date - 4, '10:00', '09:00', t.id('alex'))$$, :'trip'), 'a stop cannot end before it starts');
select t.refused(format($$insert into public.trip_stops (trip_id, place_id, day, arrived_at, note, logged_by) values (%L, 'kyoto-kinkakuji', current_date - 4, '11:00', 'Fine' || chr(8238) || 'txt.exe', t.id('alex'))$$, :'trip'), 'a note cannot hide a direction mark');
select t.changes(format($$insert into public.trip_stops (id, trip_id, place_id, day, arrived_at, note, logged_by) values (t.id('two-lines'), %L, 'kyoto-kinkakuji', current_date - 4, '11:00', 'Two lines' || chr(10) || 'are fine', t.id('alex'))$$, :'trip'), 1, '...but a note can have more than one line');

-- ---------------------------------------------------------------- who changes a stop
select t.changes($$update public.trip_stops set arrived_at = '09:20', note = 'Gold everywhere' where id = t.id('kinkaku')$$, 1, 'Alex changes his own stop');
select t.refused($$update public.trip_stops set logged_by = t.id('sam') where id = t.id('kinkaku')$$, 'nobody can change who logged a stop');
select t.as('sam');
select t.changes($$update public.trip_stops set arrived_at = '08:00' where id = t.id('kinkaku')$$, 0, 'Sam cannot change a stop Alex logged');
select t.changes($$update public.trip_stops set note = 'Mine now' where id = t.id('kinkaku')$$, 0, '...nor write in its note');
select t.changes($$delete from public.trip_stops where id = t.id('kinkaku')$$, 0, '...nor remove it');
select t.changes($$update public.trip_stops set note = 'Went back at night, twice.' where id = t.id('stop-sam')$$, 1, 'Sam changes his own stop');

-- "We've left": anyone in the group can close a stop that is still open.
select t.refused($$select public.close_stop(t.id('kinkaku'), '09:00')$$, 'a stop cannot be closed before it began');
select t.is(public.close_stop(t.id('kinkaku'), '10:45'), true, 'Sam closes the stop Alex logged, at 10:45');
select t.as('alex');
select t.is(public.close_stop(t.id('kinkaku'), '11:30'), false, 'closing it again changes nothing: the first time stands');
select t.is((select to_char(left_at, 'HH24:MI') from public.trip_stops where id = t.id('kinkaku')), '10:45', '...it still says 10:45');
select t.as('maya');
select t.refused($$select public.close_stop(t.id('two-lines'), '12:00')$$, 'a viewer cannot close a stop');
select t.as('leo');
select t.refused($$select public.close_stop(t.id('two-lines'), '12:00')$$, 'a stranger cannot close a stop');

-- ---------------------------------------------------------------- suggested corrections
select t.as('sam');
select t.changes(format($$insert into public.trip_stop_corrections (id, trip_id, stop_id, proposed_by, arrived_at, reason) values (t.id('fix-time'), %L, t.id('kinkaku'), t.id('sam'), '09:05', 'We got off the bus at nine')$$, :'trip'), 1, 'Sam suggests a different arrival time for Alex''s stop');
select t.refused(format($$insert into public.trip_stop_corrections (trip_id, stop_id, proposed_by, arrived_at) values (%L, t.id('stop-sam'), t.id('sam'), '09:00')$$, :'trip'), 'a suggestion about your own stop is refused: change it instead');
select t.refused(format($$insert into public.trip_stop_corrections (trip_id, stop_id, proposed_by, arrived_at) values (%L, t.id('kinkaku'), t.id('alex'), '09:00')$$, :'trip'), 'nobody can suggest in someone else''s name');
select t.refused(format($$insert into public.trip_stop_corrections (trip_id, stop_id, proposed_by) values (%L, t.id('kinkaku'), t.id('sam'))$$, :'trip'), 'a suggestion has to change something');
select t.refused(format($$insert into public.trip_stop_corrections (trip_id, stop_id, proposed_by, remove, arrived_at) values (%L, t.id('kinkaku'), t.id('sam'), true, '09:00')$$, :'trip'), 'removing and changing at once is refused');
select t.refused(format($$insert into public.trip_stop_corrections (trip_id, stop_id, proposed_by, arrived_at, reason) values (%L, t.id('kinkaku'), t.id('sam'), '09:00', 'ok' || chr(8238))$$, :'trip'), 'a reason cannot hide a direction mark');
select t.refused($$select public.answer_stop_correction(t.id('fix-time'), true)$$, 'Sam cannot accept his own suggestion');
select t.as('maya');
select t.sees($$select 1 from public.trip_stop_corrections$$, 0, 'a viewer never sees suggestions');
select t.refused(format($$insert into public.trip_stop_corrections (trip_id, stop_id, proposed_by, arrived_at) values (%L, t.id('kinkaku'), t.id('maya'), '09:00')$$, :'trip'), 'a viewer cannot suggest a correction');
select t.refused($$select public.answer_stop_correction(t.id('fix-time'), true)$$, 'a viewer cannot answer one');
select t.as('alex');
select t.sees($$select 1 from jsonb_array_elements(public.trip_needs() -> 'corrections') c where c ->> 'by' = 'Sam'$$, 1, 'Alex sees that Sam''s suggestion needs him');
select t.is(public.answer_stop_correction(t.id('fix-time'), true), 'accepted', 'Alex accepts it');
select t.is((select to_char(arrived_at, 'HH24:MI') from public.trip_stops where id = t.id('kinkaku')), '09:05', '...and the stop now says 09:05');
select t.is(public.answer_stop_correction(t.id('fix-time'), false), 'accepted', 'answering again changes nothing');
select t.sees($$select 1 from jsonb_array_elements(public.trip_needs() -> 'corrections')$$, 0, '...and nothing needs Alex any more');

-- A place Sam added himself, suggested for Alex's stop: Alex can read its name to decide.
select t.as('sam');
select t.changes($$insert into public.places (id, name, lat, lon, created_by) values ('u-noodles', 'Noodle bar by the gate', 35.03, 135.73, t.id('sam'))$$, 1, 'Sam adds a place of his own');
select t.changes(format($$insert into public.trip_stop_corrections (id, trip_id, stop_id, proposed_by, place_id) values (t.id('fix-place'), %L, t.id('kinkaku'), t.id('sam'), 'u-noodles')$$, :'trip'), 1, '...and suggests it for Alex''s stop');
select t.refused(format($$insert into public.trip_stop_corrections (trip_id, stop_id, proposed_by, place_id) values (%L, t.id('kinkaku'), t.id('sam'), 'u-leos-cafe')$$, :'trip'), 'a suggestion cannot point at a place Sam cannot see');
select t.as('alex');
select t.sees($$select 1 from public.places where id = 'u-noodles'$$, 1, 'Alex can see the suggested place');
select t.as('leo');
select t.sees($$select 1 from public.places where id = 'u-noodles'$$, 0, '...a stranger still cannot');
select t.as('maya');
select t.sees($$select 1 from public.places where id = 'u-noodles'$$, 0, '...nor a viewer, while it is only a suggestion');
select t.as('alex');
select t.is(public.answer_stop_correction(t.id('fix-place'), false), 'declined', 'Alex turns it down');
select t.is((select place_id from public.trip_stops where id = t.id('kinkaku')), 'kyoto-kinkakuji', '...and the stop keeps its place');
select t.sees($$select 1 from public.places where id = 'u-noodles'$$, 0, 'once answered, the suggested place is Sam''s alone again');

-- Withdrawing.
select t.as('sam');
select t.changes(format($$insert into public.trip_stop_corrections (id, trip_id, stop_id, proposed_by, left_at) values (t.id('fix-left'), %L, t.id('kinkaku'), t.id('sam'), '11:00')$$, :'trip'), 1, 'Sam suggests a leaving time');
select t.changes($$delete from public.trip_stop_corrections where id = t.id('fix-left')$$, 1, 'Sam withdraws it');
select t.changes($$delete from public.trip_stop_corrections where id = t.id('fix-time')$$, 0, 'an answered suggestion cannot be withdrawn');
select t.as('alex');
select t.changes($$delete from public.trip_stop_corrections$$, 0, 'Alex cannot delete Sam''s suggestions');

-- A suggestion that would end a stop before it starts is refused when accepted.
select t.as('sam');
select t.changes(format($$insert into public.trip_stop_corrections (id, trip_id, stop_id, proposed_by, arrived_at) values (t.id('fix-late'), %L, t.id('kinkaku'), t.id('sam'), '11:00')$$, :'trip'), 1, 'Sam suggests an arrival after the stop ended');
select t.as('alex');
select t.refused($$select public.answer_stop_correction(t.id('fix-late'), true)$$, 'accepting it is refused, in plain words');
select t.is(public.answer_stop_correction(t.id('fix-late'), false), 'declined', 'Alex turns it down instead');

-- Suggesting removal. Accepted, the stop goes; Sam's photo on it stays on the trip.
select t.as('sam');
select t.changes(format($$insert into public.photos (id, trip_id, stop_id, added_by, caption) values (t.id('photo-gold'), %L, t.id('kinkaku'), t.id('sam'), 'The gold one')$$, :'trip'), 1, 'Sam adds a photo to Alex''s stop');
select t.changes(format($$insert into public.trip_stop_corrections (id, trip_id, stop_id, proposed_by, remove, reason) values (t.id('fix-remove'), %L, t.id('kinkaku'), t.id('sam'), true, 'We only walked past')$$, :'trip'), 1, 'Sam suggests the stop was not a stop');
select t.as('alex');
select t.is(public.answer_stop_correction(t.id('fix-remove'), true), 'removed', 'Alex agrees');
select t.sees($$select 1 from public.trip_stops where id = t.id('kinkaku')$$, 0, '...and the stop is gone');
select t.is((select coalesce(stop_id::text, 'none') from public.photos where id = t.id('photo-gold')), 'none', 'Sam''s photo stays on the trip, no longer at a place');
select t.sees($$select 1 from public.photos where id = t.id('photo-gold')$$, 1, '...and the travellers still see it');

-- Removing your own stop never takes anyone else's photos with it either.
select t.as('alex');
select t.changes(format($$insert into public.trip_stops (id, trip_id, place_id, day, arrived_at, logged_by) values (t.id('ginkaku'), %L, 'kyoto-ginkakuji', current_date - 4, '14:00', t.id('alex'))$$, :'trip'), 1, 'Alex logs another stop');
select t.as('sam');
select t.changes(format($$insert into public.photos (id, trip_id, stop_id, added_by) values (t.id('photo-silver'), %L, t.id('ginkaku'), t.id('sam'))$$, :'trip'), 1, 'Sam adds a photo to it');
select t.as('alex');
select t.changes($$delete from public.trip_stops where id = t.id('ginkaku')$$, 1, 'Alex removes his stop');
select t.sees($$select 1 from public.photos where id = t.id('photo-silver')$$, 1, 'Sam''s photo is still on the trip');

-- ---------------------------------------------------------------- "I wasn't there"
select t.as('alex');
select t.changes(format($$insert into public.trip_stops (id, trip_id, place_id, day, arrived_at, logged_by) values (t.id('arcade'), %L, 'tokyo-sensoji', current_date - 5, '20:00', t.id('alex'))$$, :'trip'), 1, 'Alex logs an evening stop for the group');
select t.refused(format($$insert into public.trip_stop_absences (trip_id, stop_id, account_id) values (%L, t.id('arcade'), t.id('alex'))$$, :'trip'), 'whoever logged a stop was there');
select t.refused(format($$insert into public.trip_stop_absences (trip_id, stop_id, account_id) values (%L, t.id('arcade'), t.id('sam'))$$, :'trip'), 'nobody can say someone else was not there');
select t.as('sam');
select t.changes(format($$insert into public.trip_stop_absences (trip_id, stop_id, account_id) values (%L, t.id('arcade'), t.id('sam'))$$, :'trip'), 1, 'Sam says he was not there');
select t.as('maya');
select t.sees($$select 1 from public.trip_stop_absences$$, 0, 'a viewer never sees who was not there');
select t.refused(format($$insert into public.trip_stop_absences (trip_id, stop_id, account_id) values (%L, t.id('arcade'), t.id('maya'))$$, :'trip'), 'a viewer cannot add one');
select t.as('alex');
select t.sees($$select 1 from public.trip_stop_absences where account_id = t.id('sam')$$, 1, 'travellers see it');
select t.changes($$delete from public.trip_stop_absences$$, 0, 'Alex cannot take it back for Sam');
select t.as('sam');
select t.changes($$delete from public.trip_stop_absences where account_id = t.id('sam')$$, 1, 'Sam can take it back');
select t.changes(format($$insert into public.trip_stop_absences (trip_id, stop_id, account_id) values (%L, t.id('arcade'), t.id('sam'))$$, :'trip'), 1, '...and say it again');

-- ---------------------------------------------------------------- the log version
select t.as('alex');
select (public.trip_log(:'trip') ->> 'version')::bigint as v0 \gset
select t.ok(:v0 > 0, 'the trip has a log version');
select t.is(public.trip_log(:'trip', :v0), jsonb_build_object('version', :v0, 'same', true), 'asked with the version it has, a phone gets only "same"');
select t.changes(format($$insert into public.trip_stops (id, trip_id, place_id, day, arrived_at, logged_by) values (t.id('late'), %L, 'tokyo-sensoji', current_date - 5, '22:00', t.id('alex'))$$, :'trip'), 1, 'Alex logs one more stop');
select t.is((public.trip_log(:'trip') ->> 'version')::bigint, (:v0 + 1)::bigint, 'a new stop counts the version up by one');
select t.as('sam');
select t.changes($$insert into public.photo_hides (photo_id, hidden_by) values (t.id('photo-alex'), t.id('sam'))$$, 1, 'Sam hides a photo');
select t.is((public.trip_log(:'trip') ->> 'version')::bigint, (:v0 + 2)::bigint, 'hiding a photo counts it up');
select t.as('alex');
select t.changes($$update public.trips set title = 'Japan, two of us' where true$$, 1, 'Alex renames the trip');
select t.is((public.trip_log(:'trip') ->> 'version')::bigint, (:v0 + 3)::bigint, 'renaming the trip counts it up');
select public.create_trip('Another trip') as other \gset
select t.changes(format($$insert into public.trip_stops (trip_id, place_id, day, arrived_at, logged_by) values (%L, 'tokyo-sensoji', current_date, '10:00', t.id('alex'))$$, :'other'), 1, 'a stop on another trip');
select t.is((public.trip_log(:'trip') ->> 'version')::bigint, (:v0 + 3)::bigint, '...does not count this trip''s version');

-- ---------------------------------------------------------------- what each person fetches
select t.as('sam');
select t.changes(format($$insert into public.trip_stop_corrections (id, trip_id, stop_id, proposed_by, arrived_at) values (t.id('fix-arcade'), %L, t.id('arcade'), t.id('sam'), '19:45')$$, :'trip'), 1, 'Sam suggests an earlier time for the evening stop');
select t.as('alex');
select public.trip_log(:'trip') as log_alex \gset
select t.is(:'log_alex'::jsonb ->> 'role', 'traveller', 'a traveller fetches the log as a traveller');
select t.is(jsonb_array_length(:'log_alex'::jsonb -> 'travellers'), 2, '...with both travellers');
select t.ok(:'log_alex'::jsonb @? '$.travellers[*] ? (@.name == "Sam")', '...named');
select t.ok(:'log_alex'::jsonb @? '$.photos[*] ? (@.hidden == true)', '...the hidden photo, marked hidden');
select t.ok(:'log_alex'::jsonb @? '$.stops[*] ? (@.in == "20:00")', '...stop times as clock times');
select t.ok(:'log_alex'::jsonb @? '$.absences[*]', '...who was not where');
select t.ok(:'log_alex'::jsonb @? '$.corrections[*] ? (@.status == "open" && @.in == "19:45")', '...and the suggestions waiting');
select t.as('sam');
select t.ok(public.trip_log(:'trip') @? '$.photos[*] ? (@.hidden_by_me == true)', 'Sam''s log says which photo he hid himself, so he can show it again');
select t.as('maya');
select public.trip_log(:'trip') as log_maya \gset
select t.is(:'log_maya'::jsonb ->> 'role', 'viewer', 'a viewer fetches the log as a viewer');
select t.ok(jsonb_array_length(:'log_maya'::jsonb -> 'stops') > 0, '...with the stops');
select t.ok(not exists (select 1 from jsonb_array_elements(:'log_maya'::jsonb -> 'photos') p where p ->> 'id' = t.id('photo-alex')::text), '...without the hidden photo');
select t.is(jsonb_array_length(:'log_maya'::jsonb -> 'corrections'), 0, '...without suggestions');
select t.is(jsonb_array_length(:'log_maya'::jsonb -> 'absences'), 0, '...and without who was not where');
select t.as('leo');
select t.is(public.trip_log(:'trip'), null::jsonb, 'a stranger fetches nothing');
select t.is((select count(*) from public.my_trips()), 0::bigint, '...and has no trips');
select t.as('maya');
select t.is((select count(*) from public.my_trips()), 0::bigint, 'a viewer travels on none of them');
select t.as('alex');
select t.is((select travellers from public.my_trips() where id = :'trip'), 2::bigint, 'Alex''s trips list the trip with its two travellers');
select t.as_signed_out();
select t.refused(format($$select public.trip_log(%L)$$, :'trip'), 'signed out: cannot fetch a log');
select t.refused($$select public.trip_needs()$$, 'signed out: cannot ask what needs them');
select t.refused($$select * from public.my_trips()$$, 'signed out: has no trips');

-- An invited person sees the invite, and nothing of the log, until they join.
select t.as('alex');
select t.changes(format($$insert into public.trip_travellers (trip_id, account_id, status, invited_by) values (%L, t.id('jo'), 'invited', t.id('alex'))$$, :'trip'), 1, 'Alex invites Jo to travel');
select t.as('jo');
select t.is(public.trip_log(:'trip'), null::jsonb, 'Jo, only invited, fetches no log');
select t.sees($$select 1 from jsonb_array_elements(public.trip_needs() -> 'invites') i where i ->> 'by' = 'Alex' and i ->> 'ready' = 'false'$$, 1, 'Jo sees the invite, waiting for Sam');
select t.as('sam');
select t.sees($$select 1 from jsonb_array_elements(public.trip_needs() -> 'approvals') a where a ->> 'name' = 'Jo'$$, 1, 'Sam sees that Jo is waiting for his yes');
select t.as('alex');
select t.sees($$select 1 from jsonb_array_elements(public.trip_needs() -> 'approvals')$$, 0, 'Alex, who invited Jo, has said yes already');
-- A viewer someone proposed waits for every traveller's yes, and says so to each of them.
select t.as_setup();
insert into public.friendships (requester_id, addressee_id, status) values (t.id('sam'), t.id('leo'), 'accepted');
select t.as('sam');
select t.changes(format($$insert into public.trip_viewers (trip_id, viewer_id, invited_by) values (%L, t.id('leo'), t.id('sam'))$$, :'trip'), 1, 'Sam proposes Leo as a viewer');
select t.sees($$select 1 from jsonb_array_elements(public.trip_needs() -> 'viewers')$$, 0, 'Sam, who proposed Leo, has said yes already');
select t.as('alex');
select t.sees($$select 1 from jsonb_array_elements(public.trip_needs() -> 'viewers') v where v ->> 'name' = 'Leo' and v ->> 'by' = 'Sam'$$, 1, 'Alex sees that Leo is waiting for his yes');
select t.changes(format($$delete from public.trip_viewers where trip_id = %L and viewer_id = t.id('leo')$$, :'trip'), 1, 'Alex says no by taking the proposal away');
select t.sees($$select 1 from jsonb_array_elements(public.trip_needs() -> 'viewers')$$, 0, '...and nothing waits for him any more');

-- ---------------------------------------------------------------- leaving takes your part
select t.as('sam');
select t.changes(format($$insert into public.trip_stop_corrections (id, trip_id, stop_id, proposed_by, left_at) values (t.id('fix-open'), %L, t.id('late'), t.id('sam'), '23:00')$$, :'trip'), 1, 'Sam leaves a suggestion open');
select t.as_setup();
insert into public.trip_travellers (trip_id, account_id, status) values (:'trip', t.id('jo'), 'active')
  on conflict (trip_id, account_id) do update set status = 'active';
insert into public.trip_traveller_settings (trip_id, account_id) values (:'trip', t.id('jo'));
select t.as('jo');
select t.changes(format($$insert into public.trip_stop_corrections (id, trip_id, stop_id, proposed_by, arrived_at) values (t.id('fix-jo'), %L, t.id('late'), t.id('jo'), '21:50')$$, :'trip'), 1, 'Jo, now travelling too, suggests a time');
select t.as('sam');
select t.changes($$delete from public.trip_travellers where account_id = t.id('sam')$$, 1, 'Sam leaves the trip');
select t.as_setup();
select t.is((select count(*) from public.trip_stop_corrections where proposed_by = t.id('sam')), 0::bigint, 'Sam''s suggestions leave with him');
select t.is((select count(*) from public.trip_stop_absences where account_id = t.id('sam')), 0::bigint, '...and so does where he was not');
select t.is((select count(*) from public.trip_stops where id = t.id('stop-sam') and logged_by is null), 1::bigint, 'his stop stays, as the group''s');
select t.as('jo');
select t.refused($$update public.trip_stops set arrived_at = '20:30' where id = t.id('stop-sam')$$, 'a stop needs a day before it can have a time');
select t.changes($$update public.trip_stops set day = current_date - 6, arrived_at = '20:30' where id = t.id('stop-sam')$$, 1, 'any traveller can change a stop that is now the group''s');
select t.as('alex');
select t.changes(format($$delete from public.trip_travellers where account_id = t.id('alex') and trip_id = %L$$, :'trip'), 1, 'Alex leaves too');
select t.as('jo');
select t.is(public.answer_stop_correction(t.id('fix-jo'), true), 'accepted', 'Jo can answer a suggestion on a stop with no logger left');
select t.is((select to_char(arrived_at, 'HH24:MI') from public.trip_stops where id = t.id('late')), '21:50', '...and it is on the stop');

-- ---------------------------------------------------------------- places, photos, your data
select t.as('leo');
select t.refused($$insert into public.places (id, name, created_by) values ('u-' || gen_random_uuid(), 'Cafe' || chr(8238) || 'gpj', t.id('leo'))$$, 'a place''s name cannot hide a direction mark');
select t.refused($$insert into public.places (id, name, osm_ref, created_by) values ('u-' || gen_random_uuid(), 'Cafe', 'javascript:1', t.id('leo'))$$, 'a map reference has to look like one');
select t.changes($$insert into public.places (id, name, osm_ref, created_by) values ('u-' || gen_random_uuid(), 'Café Ōno', 'node/123456', t.id('leo'))$$, 1, '...and a real one is fine, in any script');
select t.as('jo');
select t.refused(format($$insert into public.photos (trip_id, added_by, caption) values (%L, t.id('jo'), 'Look' || chr(8237))$$, :'trip'), 'a caption cannot hide a direction mark');
select t.changes(format($$insert into public.photos (trip_id, added_by, taken_at) values (%L, t.id('jo'), '2027-07-12 09:30')$$, :'trip'), 1, 'a photo keeps the clock time it was taken');
select public.export_my_data() as export_jo \gset
select t.is(:'export_jo'::jsonb #>> '{corrections_you_suggested,0,arrived}', '21:50:00', 'your data includes the corrections you suggested');

select t.finish();
rollback;
