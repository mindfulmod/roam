-- Profiles are for people you know. Email never leaves the sign-in system.
begin;
select t.sample_trip() as trip \gset

select t.as('leo');
select t.sees($$select 1 from public.profiles$$, 1, 'a stranger sees only their own profile');
select t.as('maya');
select t.sees($$select 1 from public.profiles where id = t.id('alex')$$, 1, 'a friend''s profile is visible');
select t.sees($$select 1 from public.profiles where id = t.id('sam')$$, 0, 'a friend of a friend is not');
select t.as('alex');
select t.sees($$select 1 from public.profiles where id = t.id('sam')$$, 1, 'a fellow traveller''s profile is visible');
select t.changes($$update public.profiles set display_name = 'Hacked' where id = t.id('sam')$$, 0, 'nobody can edit someone else''s profile');
select t.changes($$update public.profiles set bio = 'Slow traveller' where id = t.id('alex')$$, 1, 'you can edit your own profile');
select t.sees($$select 1 from public.account_private$$, 1, 'private account details: your own only');
select t.refused($$select 1 from public.app_admins$$, 'members cannot read who the admins are');
select t.refused($$insert into public.app_admins values (t.id('alex'))$$, 'members cannot make themselves admin');

select t.as_setup();
select t.is(
  (select count(*) from information_schema.columns where table_schema = 'public' and column_name ~* '(email|phone)'),
  0::bigint, 'no table the app reads holds an email address or phone number');

-- Friend requests.
select t.as('leo');
select t.refused($$insert into public.friendships (requester_id, addressee_id) values (t.id('maya'), t.id('leo'))$$, 'cannot send a friend request in someone else''s name');
select t.refused($$insert into public.friendships (requester_id, addressee_id, status) values (t.id('leo'), t.id('maya'), 'accepted')$$, 'cannot create a friendship already accepted');
select t.changes($$insert into public.friendships (requester_id, addressee_id) values (t.id('leo'), t.id('maya'))$$, 1, 'Leo asks Maya to be friends');
select t.changes($$update public.friendships set status = 'accepted' where requester_id = t.id('leo')$$, 0, 'the asker cannot accept their own request');
select t.as('alex');
select t.sees($$select 1 from public.friendships where requester_id = t.id('leo')$$, 0, 'other people cannot see the request');
select t.as('maya');
select t.sees($$select 1 from public.profiles where id = t.id('leo')$$, 1, 'Maya can see who is asking');
select t.refused($$insert into public.friendships (requester_id, addressee_id) values (t.id('maya'), t.id('leo'))$$, 'one link per pair');
select t.changes($$update public.friendships set status = 'accepted' where requester_id = t.id('leo')$$, 1, 'Maya accepts');
select t.as('leo');
select t.changes($$delete from public.friendships where addressee_id = t.id('maya')$$, 1, 'either side can end a friendship');
select t.sees($$select 1 from public.profiles where id = t.id('maya')$$, 0, '...and then no longer sees the other''s profile');

select t.finish();
rollback;
