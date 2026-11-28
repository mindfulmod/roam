// End to end on a real local Supabase: the sign-up hook, codes by email, joining with an invite,
// what the API hands out, leaving, and the daily tidy-up. Run by .github/workflows/accounts.yml.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sql, auth, rest, rpc, signIn, mailCount, sleep } from './supabase.mjs';

const FOUNDER = 'founder@example.test';
let founder, inviteCode, sam;

test('the database is the one in supabase/migrations, with the daily tidy-up scheduled', () => {
  assert.equal(sql(`select count(*) from cron.job where jobname = 'tandem-housekeeping'`), '1');
  assert.equal(sql(`select count(*) from pg_proc where proname = 'before_user_created'`), '1');
  sql(
    `insert into private.settings (key, value) values ('founder_email', '${FOUNDER}') on conflict (key) do update set value = excluded.value`,
  );
});

test('a stranger cannot make an account, and is told an invite is needed', async () => {
  const email = 'stranger@example.test';
  const r = await auth('otp', { email, create_user: true });
  assert.ok(r.status >= 400 && r.status < 500, `expected a refusal, got ${r.status} ${r.text}`);
  assert.match(r.text, /invite/i);
  await sleep(1500);
  assert.equal(await mailCount(email), 0, 'no email is sent to a stranger');
  assert.equal(sql(`select count(*) from auth.users where email = '${email}'`), '0');
});

test('the founder signs in with a code from their email and becomes the admin', async () => {
  founder = await signIn(FOUNDER);
  assert.ok(founder.access_token && founder.refresh_token);
  const r = await rpc('finish_sign_in', { p_name: 'Am' }, founder.access_token);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.member, true);
  assert.equal(r.json.admin, true);
});

test('signed out, the API hands out nothing', async () => {
  for (const table of ['profiles', 'friendships', 'friend_invites', 'trips', 'photos']) {
    const r = await rest(`${table}?select=*`);
    assert.ok(!(r.ok && Array.isArray(r.json) && r.json.length), `${table}: ${r.status} ${r.text}`);
  }
  const r = await rpc('create_friend_invite', {});
  assert.ok(!r.ok, 'signed out: cannot make an invite');
});

test('a friend joins with an invite link and is friends with whoever invited them', async () => {
  const made = await rpc('create_friend_invite', { p_note: 'for Sam' }, founder.access_token);
  assert.equal(made.status, 200, made.text);
  inviteCode = made.json;
  assert.match(inviteCode, /^[A-Za-z0-9_-]{22}$/);

  sam = await signIn('sam@example.test', { invite: inviteCode });
  const r = await rpc(
    'finish_sign_in',
    { p_invite: inviteCode, p_name: 'Sam', p_age_band: '18+' },
    sam.access_token,
  );
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.member, true);
  assert.equal(r.json.invite, 'ok');
  assert.equal(r.json.friend.name, 'Am');

  const seen = await rest('profiles?select=display_name&order=display_name', {
    token: sam.access_token,
  });
  assert.deepEqual(
    seen.json.map((p) => p.display_name),
    ['Am', 'Sam'],
  );
  const people = await rpc('my_people', {}, founder.access_token);
  assert.deepEqual(
    people.json.map((p) => [p.name, p.relation]),
    [['Sam', 'friend']],
  );
});

test('invite codes cannot be read back, and a used invite makes no second account', async () => {
  const hashes = await rest('friend_invites?select=code_hash', { token: founder.access_token });
  assert.ok(!hashes.ok, 'code hashes are not readable: ' + hashes.text);
  const mine = await rest('friend_invites?select=note,used_by', { token: founder.access_token });
  assert.equal(mine.json.length, 1);
  assert.equal(mine.json[0].note, 'for Sam');
  const theirs = await rest('friend_invites?select=note', { token: sam.access_token });
  assert.deepEqual(theirs.json, []);

  const again = await auth('otp', {
    email: 'kim@example.test',
    create_user: true,
    data: { invite: inviteCode },
  });
  assert.ok(!again.ok, 'a used invite cannot make another account');
});

test('a session can be refreshed, and the profile edited through the API', async () => {
  const r = await auth('token?grant_type=refresh_token', { refresh_token: sam.refresh_token });
  assert.equal(r.status, 200, r.text);
  assert.ok(r.json.access_token);
  sam = r.json;
  const edit = await rest(`profiles?id=eq.${sam.user.id}`, {
    method: 'PATCH',
    token: sam.access_token,
    body: { home_city: 'Toronto', bio: 'Slow mornings' },
    headers: { Prefer: 'return=representation' },
  });
  assert.equal(edit.status, 200, edit.text);
  assert.equal(edit.json[0].home_city, 'Toronto');
  const hostile = await rest(`profiles?id=eq.${sam.user.id}`, {
    method: 'PATCH',
    token: sam.access_token,
    body: { display_name: 'Sam‮moc.evil' },
  });
  assert.ok(!hostile.ok, 'a hidden direction mark in a name is refused');
});

test('leaving: friends stop seeing you at once, and "delete now" removes the account', async () => {
  const left = await rpc('request_account_deletion', {}, sam.access_token);
  assert.equal(left.status, 200, left.text);
  const seen = await rest('profiles?select=display_name', { token: founder.access_token });
  assert.deepEqual(
    seen.json.map((p) => p.display_name),
    ['Am'],
  );
  const gone = await rpc('delete_account_now', {}, sam.access_token);
  assert.ok([200, 204].includes(gone.status), gone.text);
  assert.equal(sql(`select count(*) from auth.users where email = 'sam@example.test'`), '0');
  const user = await fetch(process.env.SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: process.env.SUPABASE_KEY, Authorization: `Bearer ${sam.access_token}` },
  });
  assert.ok(!user.ok, 'the deleted account cannot use its old session');
});

test('the daily tidy-up runs on real Supabase', () => {
  sql(
    `insert into auth.users (id, email, created_at) values (gen_random_uuid(), 'never-joined@example.test', now() - interval '8 days')`,
  );
  sql('select private.housekeeping()');
  assert.equal(
    sql(`select count(*) from auth.users where email = 'never-joined@example.test'`),
    '0',
  );
  assert.equal(sql(`select count(*) from auth.users where email = '${FOUNDER}'`), '1');
});
