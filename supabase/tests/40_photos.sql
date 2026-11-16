-- Rules: any traveller can hide a photo from viewers; only the person who hid it can show it
-- again; the file follows the same rules as the photo; where a photo was taken is not stored.
begin;
select t.sample_trip() as trip \gset
select t.share_with_maya(:'trip');

select t.as('maya');
select t.sees($$select 1 from public.photos$$, 2, 'viewer: sees both photos');
select t.sees($$select 1 from storage.objects$$, 2, 'viewer: can fetch both photo files');
select t.refused($$insert into public.photo_hides (photo_id, hidden_by) values (t.id('photo-alex'), t.id('maya'))$$, 'a viewer cannot hide a photo');
select t.changes($$delete from public.photos$$, 0, 'a viewer cannot delete photos');

-- Sam hides Alex's photo. No vote, no permission needed.
select t.as('sam');
select t.refused($$insert into public.photo_hides (photo_id, hidden_by) values (t.id('photo-alex'), t.id('alex'))$$, 'a traveller cannot hide a photo in someone else''s name');
select t.changes($$insert into public.photo_hides (photo_id, hidden_by) values (t.id('photo-alex'), t.id('sam'))$$, 1, 'Sam hides Alex''s photo');
select t.as('maya');
select t.sees($$select 1 from public.photos where id = t.id('photo-alex')$$, 0, 'a hidden photo disappears for viewers');
select t.sees($$select 1 from storage.objects where name like '%' || t.id('photo-alex') || '%'$$, 0, '...and its file can no longer be fetched');
select t.sees($$select 1 from public.photos$$, 1, 'the other photo is still there for viewers');
select t.sees($$select 1 from public.photo_hides$$, 0, 'a viewer cannot tell that anything was hidden');
select t.as('alex');
select t.sees($$select 1 from public.photos$$, 2, 'travellers still see a hidden photo');
select t.sees($$select 1 from public.photo_hides$$, 1, 'travellers can see that it is hidden');
select t.changes($$delete from public.photo_hides$$, 0, 'the photo''s owner cannot undo another traveller''s hide');
select t.changes($$insert into public.photo_hides (photo_id, hidden_by) values (t.id('photo-alex'), t.id('alex'))$$, 1, 'a second traveller can hide the same photo');
select t.as('sam');
select t.changes($$delete from public.photo_hides where hidden_by = t.id('sam')$$, 1, 'Sam shows the photo again');
select t.as('maya');
select t.sees($$select 1 from public.photos where id = t.id('photo-alex')$$, 0, 'still hidden while any traveller keeps it hidden');
select t.as('alex');
select t.changes($$delete from public.photo_hides where hidden_by = t.id('alex')$$, 1, 'Alex shows the photo again');
select t.as('maya');
select t.sees($$select 1 from public.photos$$, 2, 'nobody hides it any more: viewers see it again');

-- Your own photos are yours; other people's are not.
select t.as('sam');
select t.changes($$update public.photos set caption = 'Hacked' where id = t.id('photo-alex')$$, 0, 'a traveller cannot edit another traveller''s photo');
select t.changes($$delete from public.photos where id = t.id('photo-alex')$$, 0, 'a traveller cannot delete another traveller''s photo');
select t.changes($$delete from storage.objects where name like '%' || t.id('photo-alex') || '%'$$, 0, '...or its file');
select t.refused(format($$insert into public.photos (trip_id, added_by) values (%L, t.id('alex'))$$, :'trip'), 'a traveller cannot add a photo in someone else''s name');
select t.changes($$update public.photos set caption = 'Night one' where id = t.id('photo-sam')$$, 1, 'a traveller can caption their own photo');

-- Files: only travellers can put a file in the trip's folder.
select t.as('leo');
select t.refused(format($$insert into storage.objects (bucket_id, name, owner_id) values ('trip-photos', %L || '/' || gen_random_uuid() || '.jpg', t.id('leo')::text)$$, :'trip'), 'a stranger cannot put a file in a trip''s folder');
select t.as('maya');
select t.refused(format($$insert into storage.objects (bucket_id, name, owner_id) values ('trip-photos', %L || '/' || gen_random_uuid() || '.jpg', t.id('maya')::text)$$, :'trip'), 'a viewer cannot put a file in a trip''s folder');
select t.refused($$insert into storage.objects (bucket_id, name, owner_id) values ('trip-photos', 'loose-file.jpg', t.id('maya')::text)$$, 'a file outside a trip folder is refused');
select t.as('sam');
select t.changes(format($$insert into storage.objects (bucket_id, name, owner_id) values ('trip-photos', %L || '/' || gen_random_uuid() || '.jpg', t.id('sam')::text)$$, :'trip'), 1, 'a traveller can add a file to their trip');

-- A hide outlives the person who made it.
select t.changes($$insert into public.photo_hides (photo_id, hidden_by) values (t.id('photo-alex'), t.id('sam'))$$, 1, 'Sam hides Alex''s photo again');
select t.changes($$delete from public.trip_travellers where account_id = t.id('sam')$$, 1, 'Sam leaves the trip');
select t.as('maya');
select t.sees($$select 1 from public.photos where id = t.id('photo-alex')$$, 0, 'a photo hidden by someone who left stays hidden');

-- Structure: the bucket is private and no location is kept with a photo.
select t.as_setup();
select t.is((select public from storage.buckets where id = 'trip-photos'), false, 'the photo bucket is private');
select t.is(
  (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'photos'
     and column_name ~* '(lat|lon|lng|geo|gps|exif|location|coord)'),
  0::bigint, 'the photos table has no column for where a photo was taken');

-- Highlights only.
select t.as('alex');
insert into public.photos (trip_id, added_by) select :'trip', t.id('alex') from generate_series(1, 299);
select t.refused(format($$insert into public.photos (trip_id, added_by) values (%L, t.id('alex'))$$, :'trip'), 'a trip holds at most 300 photos');

select t.finish();
rollback;
