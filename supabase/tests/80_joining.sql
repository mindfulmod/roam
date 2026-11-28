-- Rule: Tandem Roads is invite-only. An invite link works once, for 14 days, and joining with it
-- makes you a member and friends with whoever invited you. A sign-in account that has not joined
-- can do nothing at all.
begin;
select t.sample_trip() as trip \gset
select t.account('kim');
select t.account('noor');

-- A sign-in account that has not joined holds nothing and can do nothing.
select t.as('kim');
select t.sees($$select 1 from public.profiles$$, 0, 'not joined: has no profile and sees no one''s');
select t.sees($$select 1 from public.trips$$, 0, 'not joined: sees no trip');
select t.refused($$select public.create_trip('Somewhere')$$, 'not joined: cannot start a trip');
select t.refused($$insert into public.friendships (requester_id, addressee_id) values (t.id('kim'), t.id('alex'))$$, 'not joined: cannot ask anyone to be friends');
select t.refused($$insert into public.places (name, created_by) values ('My cafe', t.id('kim'))$$, 'not joined: cannot add a place');
select t.refused($$select public.create_friend_invite()$$, 'not joined: cannot make invite links');
select t.refused($$insert into storage.objects (bucket_id, name, owner_id) values ('trip-photos', 'x/y.jpg', t.id('kim')::text)$$, 'not joined: cannot upload a photo file');
select t.is((public.finish_sign_in() ->> 'member')::boolean, false, 'not joined: signing in without an invite does not make you a member');

-- Alex makes an invite link for Kim.
select t.as('alex');
select public.create_friend_invite('for Kim') as code \gset
select t.ok(:'code' ~ '^[A-Za-z0-9_-]{22}$', 'an invite code is 22 link-safe characters');
select t.sees($$select 1 from public.friend_invites$$, 1, 'you can list the invite links you made');
select t.refused($$select code_hash from public.friend_invites$$, 'nobody can read an invite''s code back, not even its maker');
select t.refused($$update public.friend_invites set expires_at = now() + interval '1 year'$$, 'an invite''s end date cannot be pushed back');
select t.refused($$insert into public.friend_invites (inviter_id, code_hash, expires_at) values (t.id('alex'), '\x00', now() + interval '1 day')$$, 'invites can only be made through create_friend_invite');
select t.as('sam');
select t.sees($$select 1 from public.friend_invites$$, 0, 'nobody else sees your invite links');

select t.as_setup();
select t.is((select count(*) from public.friend_invites i where i.code_hash = sha256(convert_to(:'code', 'UTF8'))), 1::bigint, 'the database keeps a hash of the code');
select t.is((select count(*) from public.friend_invites i where position(:'code' in i::text) > 0), 0::bigint, '...and never the code itself');
select t.ok((select expires_at between now() + interval '13 days 23 hours' and now() + interval '14 days' from public.friend_invites where inviter_id = t.id('alex')), 'an invite link works for 14 days');

-- The sign-up hook: who may make a new sign-in account. Supabase's sign-in service runs it (that
-- it may, and members may not, is checked in 70_structure and by the end-to-end test).
insert into private.settings (key, value) values ('founder_email', 'Founder@Example.test');
select private.before_user_created(jsonb_build_object('user', jsonb_build_object('email', 'kim@example.test', 'user_metadata', jsonb_build_object('invite', :'code')))) as hook_invite \gset
select private.before_user_created(jsonb_build_object('user', jsonb_build_object('email', 'stranger@example.test', 'user_metadata', '{}'::jsonb))) as hook_none \gset
select private.before_user_created(jsonb_build_object('user', jsonb_build_object('email', 'stranger@example.test', 'user_metadata', jsonb_build_object('invite', 'AAAAAAAAAAAAAAAAAAAAAA')))) as hook_fake \gset
select private.before_user_created(jsonb_build_object('user', jsonb_build_object('email', 'founder@example.TEST', 'user_metadata', '{}'::jsonb))) as hook_founder \gset
select t.is(:'hook_invite'::jsonb, '{}'::jsonb, 'sign-up hook: a working invite code may make a new account');
select t.is((:'hook_none'::jsonb #>> '{error,http_code}')::int, 403, 'sign-up hook: no invite, no new account');
select t.ok((:'hook_none'::jsonb #>> '{error,message}') ~ 'invite', 'sign-up hook: the refusal explains that an invite is needed');
select t.is((:'hook_fake'::jsonb #>> '{error,http_code}')::int, 403, 'sign-up hook: a made-up code is refused');
select t.is(:'hook_founder'::jsonb, '{}'::jsonb, 'sign-up hook: the founder email may make the first account, in any letter case');
select t.as('alex');
select t.refused($$select private.before_user_created('{}'::jsonb)$$, 'members cannot run the sign-up hook');

-- Kim joins with the link.
select t.as('kim');
select public.finish_sign_in(:'code', 'Kim', '18+') as joined \gset
select t.is((:'joined'::jsonb ->> 'member')::boolean, true, 'joining with an invite makes you a member');
select t.is((:'joined'::jsonb ->> 'created')::boolean, true, '...with a new profile');
select t.is(:'joined'::jsonb ->> 'invite', 'ok', '...and the invite is used');
select t.is(:'joined'::jsonb #>> '{friend,name}', 'Alex', '...and you are told who invited you');
select t.is((:'joined'::jsonb ->> 'admin')::boolean, false, 'joining does not make you an admin');
select t.sees($$select 1 from public.profiles where id = t.id('alex') and display_name = 'Alex'$$, 1, 'Kim and Alex are friends: Kim sees Alex''s profile');
select t.sees($$select 1 from public.account_private where age_band = '18+'$$, 1, 'Kim''s age band is kept, for Kim only');
select t.as('alex');
select t.sees($$select 1 from public.profiles where id = t.id('kim') and display_name = 'Kim'$$, 1, '...and Alex sees Kim''s');
select t.sees($$select 1 from public.friend_invites where used_by = t.id('kim')$$, 1, 'Alex can see the link was used, and by whom');
select t.as('kim');
select t.is(public.finish_sign_in(:'code') ->> 'invite', 'already_friends', 'opening the same link again says you are already friends');

-- An invite works once.
select t.as('noor');
select public.finish_sign_in(:'code', 'Noor', '18+') as reused \gset
select t.is((:'reused'::jsonb ->> 'member')::boolean, false, 'a used invite does not let a second person join');
select t.is(:'reused'::jsonb ->> 'invite', 'used', '...and says it has been used');
select t.as_setup();
select private.before_user_created(jsonb_build_object('user', jsonb_build_object('email', 'noor@example.test', 'user_metadata', jsonb_build_object('invite', :'code')))) as hook_used \gset
select t.is((:'hook_used'::jsonb #>> '{error,http_code}')::int, 403, 'sign-up hook: a used invite cannot make another account');

-- Joining needs a name and an age of 16 or over, and names cannot hide direction marks.
select t.as('alex');
select public.create_friend_invite('for Noor') as code2 \gset
select t.as('noor');
select t.refused(format($$select public.finish_sign_in(%L, null, '18+')$$, :'code2'), 'joining needs a name');
select t.refused(format($$select public.finish_sign_in(%L, '   ', '18+')$$, :'code2'), 'a name of only spaces is not a name');
select t.refused(format($$select public.finish_sign_in(%L, 'Noor', null)$$, :'code2'), 'joining needs the age question answered');
select t.refused(format($$select public.finish_sign_in(%L, 'Noor', 'under-16')$$, :'code2'), 'under 16 cannot join');
select t.refused(format($$select public.finish_sign_in(%L, %L, '18+')$$, :'code2', 'Noor' || chr(8238) || 'xela'), 'a name cannot carry a hidden direction mark');
select t.refused(format($$select public.finish_sign_in(%L, %L, '18+')$$, :'code2', 'Noor' || chr(10) || 'Admin'), 'a name cannot run over two lines');
select t.is(public.finish_sign_in(:'code2', 'Noor 🌏 نور', '16-17') ->> 'invite', 'ok', 'names in any script, with emoji, are fine');
select t.sees($$select 1 from public.profiles where id = t.id('noor') and display_name = 'Noor 🌏 نور'$$, 1, '...and kept exactly');

-- A member who already has an account uses an invite to become friends.
select t.as('jo');
select public.create_friend_invite() as code3 \gset
select t.as('leo');
select t.sees($$select 1 from public.profiles where id = t.id('jo')$$, 0, 'before the invite Leo cannot see Jo');
select public.finish_sign_in(:'code3') as linked \gset
select t.is(:'linked'::jsonb ->> 'invite', 'ok', 'an existing member can use an invite link');
select t.is((:'linked'::jsonb ->> 'created')::boolean, false, '...without a new profile');
select t.sees($$select 1 from public.profiles where id = t.id('jo')$$, 1, '...and Leo and Jo are now friends');

-- Your own link, an ended link, a cancelled link, a made-up link.
select t.as('alex');
select public.create_friend_invite() as code4 \gset
select t.is(public.finish_sign_in(:'code4') ->> 'invite', 'own', 'your own link says it is yours');
select t.as('sam');
select t.is(public.finish_sign_in('AAAAAAAAAAAAAAAAAAAAAA') ->> 'invite', 'unknown', 'a made-up code is unknown');
select t.is(public.finish_sign_in('<script>') ->> 'invite', 'unknown', 'a code that is not a code is unknown');
select t.as_setup();
update public.friend_invites set created_at = now() - interval '15 days', expires_at = now() - interval '1 day'
  where code_hash = sha256(convert_to(:'code4', 'UTF8'));
select t.as('sam');
select t.is(public.finish_sign_in(:'code4') ->> 'invite', 'expired', 'after 14 days a link has ended');
select t.as('alex');
select public.create_friend_invite() as code5 \gset
select t.as_setup();
select id as invite5 from public.friend_invites where code_hash = sha256(convert_to(:'code5', 'UTF8')) \gset
select t.as('sam');
select public.cancel_friend_invite(:'invite5');
select t.as('jo');
select t.is(public.finish_sign_in(:'code5') ->> 'invite', 'ok', 'only the person who made a link can cancel it');
select t.as('alex');
select public.create_friend_invite() as code6 \gset
select t.as_setup();
select id as invite6 from public.friend_invites where code_hash = sha256(convert_to(:'code6', 'UTF8')) \gset
select t.as('alex');
select public.cancel_friend_invite(:'invite6');
select t.as('maya');
select t.is(public.finish_sign_in(:'code6') ->> 'invite', 'expired', 'a cancelled link stops working');

-- Limits: ten links waiting at once, twenty made in a day.
select t.as('sam');
select public.create_friend_invite() from generate_series(1, 10);
select t.refused($$select public.create_friend_invite()$$, 'at most ten invite links can wait to be used');
select t.as_setup();
update public.friend_invites set expires_at = now() where inviter_id = t.id('sam');
select t.as('sam');
select public.create_friend_invite() from generate_series(1, 10);
select t.as_setup();
update public.friend_invites set expires_at = now() where inviter_id = t.id('sam');
select t.as('sam');
select t.refused($$select public.create_friend_invite()$$, 'at most twenty invite links a day');

-- A sign-in account must have confirmed its email before it can join.
select t.as_setup();
insert into auth.users (id, email) values (t.id('unconfirmed'), 'unconfirmed@example.test');
select t.as('alex');
select public.create_friend_invite() as code7 \gset
select t.as('unconfirmed');
select t.refused(format($$select public.finish_sign_in(%L, 'Pat', '18+')$$, :'code7'), 'an account whose email is not confirmed cannot join');

-- The founder: the first account, made with the founder email, joins without an invite and is
-- the admin.
select t.as_setup();
insert into auth.users (id, email, email_confirmed_at) values (t.id('founder'), 'founder@example.test', now());
select t.as('founder');
select public.finish_sign_in(null, 'Ana', null) as founded \gset
select t.is((:'founded'::jsonb ->> 'member')::boolean, true, 'the founder joins without an invite');
select t.is((:'founded'::jsonb ->> 'admin')::boolean, true, '...and is the admin');
select t.sees($$select 1 from public.profiles where display_name = 'Ana'$$, 1, '...with the name they gave');

select t.finish();
rollback;
