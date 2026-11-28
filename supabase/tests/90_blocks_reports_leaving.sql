-- Rules: blocking ends a friendship, and nothing from the person blocked reaches you again, but
-- trips you share stay. A block never shows: the person blocked can tell it apart from nothing. Reports go
-- to whoever runs the app. Leaving hides your profile from friends at once and deletes everything
-- after 30 days, unless you come back. Your data can be downloaded, and holds only what is yours.
begin;
select t.sample_trip() as trip \gset
select t.share_with_maya(:'trip');

-- Blocking. Maya is Alex's friend and a viewer of the trip Alex and Sam took.
select t.as('maya');
select t.refused($$insert into public.blocks (blocker_id, blocked_id) values (t.id('maya'), t.id('leo'))$$, 'you cannot block someone you do not know');
select t.refused($$insert into public.blocks (blocker_id, blocked_id) values (t.id('alex'), t.id('maya'))$$, 'you cannot block in someone else''s name');
select t.changes($$insert into public.blocks (blocker_id, blocked_id) values (t.id('maya'), t.id('alex'))$$, 1, 'Maya blocks Alex');
select t.sees($$select 1 from public.friendships where t.id('alex') in (requester_id, addressee_id)$$, 0, 'blocking ends the friendship');
select t.sees($$select 1 from public.trips$$, 1, 'trips they share stay as they are: Maya still sees the trip');
select t.is((select relation from public.my_people() where id = t.id('alex')), 'blocked', 'Maya''s list shows Alex as blocked');
select t.is((select home from public.my_people() where id = t.id('alex')), null::text, '...with the name only');
select t.as('alex');
select t.sees($$select 1 from public.blocks$$, 0, 'the person blocked never sees the block');
-- Alex can still ask (refusing would give the block away). His request waits, as if unanswered.
select t.changes($$insert into public.friendships (requester_id, addressee_id) values (t.id('alex'), t.id('maya'))$$, 1, 'the person blocked can still send a friend request, so the block does not show');
select t.sees($$select 1 from public.friendships where requester_id = t.id('alex') and status = 'pending'$$, 1, '...and sees it waiting, as with anyone who has not answered');
select public.create_friend_invite() as alex_code \gset
select t.as('maya');
select t.sees($$select 1 from public.friendships where t.id('alex') in (requester_id, addressee_id)$$, 0, 'a request from someone you blocked never reaches you');
select t.sees($$select 1 from public.my_people() where id = t.id('alex') and relation <> 'blocked'$$, 0, '...nor your list of people');
select t.changes($$update public.friendships set status = 'accepted' where requester_id = t.id('alex')$$, 0, '...and it cannot be accepted');
select t.refused($$insert into public.friendships (requester_id, addressee_id) values (t.id('maya'), t.id('alex'))$$, 'you cannot ask someone you blocked to be friends');
select t.is(public.finish_sign_in(:'alex_code') ->> 'invite', 'expired', 'an invite link from someone you blocked looks like a stopped link, so it does not say why');
select t.as_setup();
select t.is((select count(*) from public.friendships where t.id('alex') in (requester_id, addressee_id) and t.id('maya') in (requester_id, addressee_id) and status = 'accepted'), 0::bigint, '...and makes no friendship');
select t.as('maya');
select t.changes($$delete from public.blocks where blocked_id = t.id('alex')$$, 1, 'Maya can unblock Alex');
select t.sees($$select 1 from public.friendships where t.id('alex') in (requester_id, addressee_id) and status = 'accepted'$$, 0, 'unblocking does not make you friends again');
select t.sees($$select 1 from public.my_people() where id = t.id('alex') and relation = 'asks_you'$$, 1, '...and a request Alex sent meanwhile now waits for her answer');

-- Reports.
select t.as('sam');
select t.changes($$insert into public.reports (reporter_id, about_account, about_kind, reason) values (t.id('sam'), t.id('alex'), 'person', 'Testing the report button')$$, 1, 'Sam reports Alex');
select t.refused($$insert into public.reports (reporter_id, about_account, about_kind, reason) values (t.id('alex'), t.id('sam'), 'person', 'Not me')$$, 'you cannot send a report in someone else''s name');
select t.refused($$insert into public.reports (reporter_id, about_account, about_kind, reason) values (t.id('sam'), t.id('leo'), 'person', 'Who?')$$, 'you can only report someone you know');
select t.refused($$insert into public.reports (reporter_id, about_kind, reason) values (t.id('sam'), 'person', '')$$, 'a report needs a reason');
select t.sees($$select 1 from public.reports$$, 1, 'you see the reports you sent');
select t.refused($$select admin_note from public.reports$$, 'you cannot read the admin''s notes');
select t.refused($$select * from public.admin_reports()$$, 'members cannot read the report queue');
select t.as('alex');
select t.sees($$select 1 from public.reports$$, 0, 'the person reported does not see the report');
select t.as('am');
select t.sees($$select 1 from public.admin_reports() where reporter_name = 'Sam' and about_name = 'Alex'$$, 1, 'the admin sees the report, with names');
select (select id from public.admin_reports()) as report \gset
select public.admin_close_report(:'report', 'Spoke to both');
select t.sees($$select 1 from public.admin_reports('closed')$$, 1, 'the admin can close a report');
select t.sees($$select 1 from public.trips$$, 0, 'reports give the admin no way into private trips');
select t.as('sam');
select t.sees($$select 1 from public.reports where status = 'closed'$$, 1, 'the reporter sees that it was closed');
select t.refused($$select public.admin_close_report(id) from public.reports$$, 'members cannot close reports');
select t.changes($$insert into public.reports (reporter_id, about_account, about_kind, reason) select t.id('sam'), t.id('alex'), 'person', 'Again ' || n from generate_series(1, 19) n$$, 19, 'up to twenty reports a day');
select t.refused($$insert into public.reports (reporter_id, about_account, about_kind, reason) values (t.id('sam'), t.id('alex'), 'person', 'One more')$$, '...and not one more');

-- Your data. Sam downloads everything the database holds about him.
select public.export_my_data() as export \gset
select t.is(:'export'::jsonb #>> '{profile,display_name}', 'Sam', 'the download has your profile');
select t.is(jsonb_array_length(:'export'::jsonb -> 'trips'), 1, '...your trips');
select t.is(:'export'::jsonb #>> '{trips,0,your_sharing_choice}', 'viewers_after', '...your own sharing choice on each');
select t.is(:'export'::jsonb #>> '{stops_you_logged,0,note}', 'Went back at night.', '...the notes you wrote');
select t.ok(position('Bags dropped' in :'export') = 0, '...and not the notes other people wrote');
select t.ok(jsonb_array_length(:'export'::jsonb -> 'people') >= 2, '...your friends');
select t.ok(position('@example.test' in :'export') = 0, 'the download holds no email addresses, yours included (the app adds yours)');

-- Leaving. Jo is a friend of Alex and of Sam.
select t.as('jo');
select public.create_friend_invite() as jo_code \gset
select t.refused($$select public.delete_account_now()$$, 'an account cannot be deleted in one step');
select t.ok(public.request_account_deletion() between now() + interval '29 days 23 hours' and now() + interval '30 days', 'asking to leave sets a date 30 days away');
select t.ok((public.finish_sign_in() ->> 'leaving') is not null, 'signing in again shows the date');
select t.sees($$select 1 from public.profiles where id = t.id('jo')$$, 1, 'while leaving you still see your own profile');
select t.refused($$select public.create_friend_invite()$$, 'while leaving you cannot invite anyone');
select t.as('alex');
select t.sees($$select 1 from public.profiles where id = t.id('jo')$$, 0, 'friends stop seeing your profile at once');
select t.sees($$select 1 from public.my_people() where id = t.id('jo')$$, 0, '...and you leave their list of people');
select t.as_setup();
select private.before_user_created(jsonb_build_object('user', jsonb_build_object('email', 'kim2@example.test', 'user_metadata', jsonb_build_object('invite', :'jo_code')))) as hook_jo \gset
select t.is((:'hook_jo'::jsonb #>> '{error,http_code}')::int, 403, 'invite links of someone leaving stop working');
select t.as('jo');
select public.cancel_account_deletion();
select t.as('alex');
select t.sees($$select 1 from public.profiles where id = t.id('jo')$$, 1, 'coming back within 30 days undoes it');
select t.as('jo');
select public.request_account_deletion();
select public.delete_account_now();
select t.as_setup();
select t.is((select count(*) from auth.users where id = t.id('jo')), 0::bigint, '"delete now" removes the sign-in account');
select t.is((select count(*) from public.profiles where id = t.id('jo')), 0::bigint, '...the profile');
select t.is((select count(*) from public.friendships where t.id('jo') in (requester_id, addressee_id)), 0::bigint, '...and the friendships');

-- The daily tidy-up.
select t.account('old');
select t.account('fresh');
update auth.users set created_at = now() - interval '8 days' where id in (t.id('old'), t.id('leo'));
update public.account_private set delete_after = now() - interval '1 minute' where id = t.id('maya');
select t.as('alex');
select t.refused($$select private.housekeeping()$$, 'members cannot run the tidy-up');
select t.refused($$select private.make_member(t.id('fresh'), 'Fresh', '18+')$$, 'members cannot make anyone a member');
select t.as_setup();
select private.housekeeping();
select t.is((select count(*) from auth.users where id = t.id('maya')), 0::bigint, 'tidy-up: an account whose 30 days are over is deleted');
select t.is((select count(*) from auth.users where id = t.id('old')), 0::bigint, 'tidy-up: a sign-in account that never joined goes after 7 days');
select t.is((select count(*) from auth.users where id = t.id('fresh')), 1::bigint, 'tidy-up: ...but not before');
select t.is((select count(*) from auth.users where id = t.id('leo')), 1::bigint, 'tidy-up: members stay, however old their account');

select t.finish();
rollback;
