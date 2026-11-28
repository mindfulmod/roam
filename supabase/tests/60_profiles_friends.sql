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

-- Friend requests. Nobody can ask a stranger: people connect with an invite link (80_joining),
-- or ask someone they already know through a trip.
select t.as('leo');
select t.refused($$insert into public.friendships (requester_id, addressee_id) values (t.id('maya'), t.id('leo'))$$, 'cannot send a friend request in someone else''s name');
select t.refused($$insert into public.friendships (requester_id, addressee_id) values (t.id('leo'), t.id('maya'))$$, 'cannot ask a stranger to be friends');
select t.refused($$insert into public.friendships (requester_id, addressee_id, status) values (t.id('leo'), t.id('maya'), 'accepted')$$, 'cannot create a friendship already accepted');

-- Sam and Maya know each other through the trip once Maya can view it.
select t.share_with_maya(:'trip');
select t.as('sam');
select t.changes($$insert into public.friendships (requester_id, addressee_id) values (t.id('sam'), t.id('maya'))$$, 1, 'Sam, a traveller, asks Maya, a viewer of the trip, to be friends');
select t.changes($$update public.friendships set status = 'accepted' where requester_id = t.id('sam') and addressee_id = t.id('maya')$$, 0, 'the asker cannot accept their own request');
select t.as('alex');
select t.sees($$select 1 from public.friendships where requester_id = t.id('sam') and addressee_id = t.id('maya')$$, 0, 'other people cannot see the request');

-- Asking does not open the other person's profile; only a yes does.
select t.as('sam');
select t.changes($$delete from public.trip_viewers where viewer_id = t.id('maya')$$, 1, 'Sam takes Maya off the trip''s viewers');
select t.sees($$select 1 from public.profiles where id = t.id('maya')$$, 0, 'asking someone to be friends does not let you see their profile');
select t.as('maya');
select t.sees($$select 1 from public.profiles where id = t.id('sam')$$, 1, 'the person asked can see who is asking');
select t.refused($$insert into public.friendships (requester_id, addressee_id) values (t.id('maya'), t.id('sam'))$$, 'one link per pair');
select t.changes($$update public.friendships set status = 'accepted' where requester_id = t.id('sam') and addressee_id = t.id('maya')$$, 1, 'Maya accepts');
select t.as('sam');
select t.sees($$select 1 from public.profiles where id = t.id('maya')$$, 1, 'once they say yes, both see each other''s profile');
select t.changes($$delete from public.friendships where requester_id = t.id('sam') and addressee_id = t.id('maya')$$, 1, 'either side can end a friendship');
select t.sees($$select 1 from public.profiles where id = t.id('maya')$$, 0, '...and then no longer sees the other''s profile');

select t.finish();
rollback;
