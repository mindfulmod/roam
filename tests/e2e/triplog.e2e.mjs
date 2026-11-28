// Logging a trip together, end to end on a real local Supabase, through the same API calls the
// phones make: logging a stop (twice, as a phone resending after a lost answer does), closing it,
// a suggested correction, a photo's file and its row, what a viewer and a stranger can fetch,
// hiding a photo, the log version, leaving, and the sweep that removes files with no photo.
// Run by .github/workflows/accounts.yml; not part of `npm test`.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql, rest, rpc, signIn, URL_, KEY, DB } from './supabase.mjs';

if (!process.env.SUPABASE_SERVICE_KEY)
  throw new Error('Set SUPABASE_SERVICE_KEY too: the photo sweep runs with the local server key.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const JPEG = readFileSync(path.join(root, 'tests/fixtures/kyoto-0930.jpg'));
const FOUNDER = 'alex.trip@example.test';
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const who = {};
let trip, stop, photo, orphan;

before(async () => {
  // The guide's places, as the Connect accounts workflow writes them to the live project.
  const dir = mkdtempSync(path.join(tmpdir(), 'guide-'));
  const file = path.join(dir, 'guide-places.sql');
  writeFileSync(
    file,
    execFileSync('node', [path.join(root, 'scripts/supabase/guide-places.mjs')], {
      maxBuffer: 64 * 1024 * 1024,
    }),
  );
  execFileSync('psql', [DB, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', file]);
  sql(
    `insert into private.settings (key, value) values ('founder_email', '${FOUNDER}') on conflict (key) do update set value = excluded.value`,
  );
  // Alex runs the app here; Sam travels with Alex; Maya will view; Leo is a friend on no trip.
  const alex = await signIn(FOUNDER);
  assert.equal((await rpc('finish_sign_in', { p_name: 'Alex' }, alex.access_token)).status, 200);
  who.alex = { token: alex.access_token, id: alex.user.id };
  for (const name of ['Sam', 'Maya', 'Leo']) {
    const code = (await rpc('create_friend_invite', {}, who.alex.token)).json;
    const email = name.toLowerCase() + '.trip@example.test';
    const s = await signIn(email, { invite: code });
    const r = await rpc(
      'finish_sign_in',
      { p_invite: code, p_name: name, p_age_band: '18+' },
      s.access_token,
    );
    assert.equal(r.json?.invite, 'ok', r.text);
    who[name.toLowerCase()] = { token: s.access_token, id: s.user.id };
  }
});

const as = (p) => ({ token: who[p].token });
const insert = (table, body, p, extra = '') =>
  rest(`${table}?on_conflict=id${extra}`, {
    method: 'POST',
    body,
    token: who[p].token,
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
  });
async function storage(method, route, p, body, type) {
  const res = await fetch(`${URL_}/storage/v1/${route}`, {
    method,
    headers: {
      apikey: KEY,
      ...(p ? { Authorization: `Bearer ${who[p].token}` } : {}),
      ...(type ? { 'Content-Type': type } : {}),
    },
    body,
  });
  return { status: res.status, ok: res.ok, body: Buffer.from(await res.arrayBuffer()) };
}
const upload = (p, name) => storage('POST', `object/trip-photos/${name}`, p, JPEG, 'image/jpeg');
const download = (p, name) => storage('GET', `object/authenticated/trip-photos/${name}`, p);
// Whether the file is still in the bucket at all, asked of the database rather than the API, so
// that "cannot be fetched" and "is gone" stay two different things. Names are made of UUIDs.
const stored = (name) =>
  sql(
    `select count(*) from storage.objects where bucket_id = 'trip-photos' and name = '${name}'`,
  ) === '1';
const sweep = () =>
  execFileSync(
    'node',
    [path.join(root, 'scripts/supabase/sweep-photos.mjs'), '--min-age-hours=0'],
    {
      env: { ...process.env, SUPABASE_URL: URL_ },
      stdio: 'inherit',
    },
  );

test('Alex starts a shared trip and Sam joins it', async () => {
  const made = await rpc(
    'create_trip',
    { p_title: 'Kyoto, two of us', p_starts_on: day(-10), p_ends_on: day(-2) },
    who.alex.token,
  );
  assert.equal(made.status, 200, made.text);
  trip = made.json;
  const invited = await rest('trip_travellers', {
    method: 'POST',
    ...as('alex'),
    body: { trip_id: trip, account_id: who.sam.id, status: 'invited', invited_by: who.alex.id },
  });
  assert.equal(invited.status, 201, invited.text);
  const needs = await rpc('trip_needs', {}, who.sam.token);
  assert.deepEqual(
    needs.json.invites.map((i) => [i.title, i.by, i.ready]),
    [['Kyoto, two of us', 'Alex', true]],
  );
  assert.equal((await rpc('accept_trip_invite', { p_trip: trip }, who.sam.token)).status, 204);
  const mine = await rpc('my_trips', {}, who.sam.token);
  assert.deepEqual(
    mine.json.map((t) => [t.title, t.travellers]),
    [['Kyoto, two of us', 2]],
  );
});

test('a stop sent twice, as a phone resending after a lost answer, is logged once', async () => {
  stop = randomUUID();
  const row = {
    id: stop,
    trip_id: trip,
    place_id: 'kyoto-fushimi',
    day: day(-5),
    arrived_at: '09:30',
    logged_by: who.alex.id,
  };
  for (let i = 0; i < 2; i++) {
    const r = await insert('trip_stops', row, 'alex');
    assert.ok([200, 201].includes(r.status), r.text);
  }
  const log = await rpc('trip_log', { p_trip: trip }, who.sam.token);
  assert.equal(log.status, 200, log.text);
  assert.deepEqual(
    log.json.stops.map((s) => [s.place, s.in, s.by]),
    [['kyoto-fushimi', '09:30', who.alex.id]],
  );
  const stranger = await insert(
    'trip_stops',
    { ...row, id: randomUUID(), logged_by: who.leo.id },
    'leo',
  );
  assert.ok(!stranger.ok, 'someone not on the trip cannot log a stop');
});

test('Sam closes the stop, suggests a time, and Alex accepts it', async () => {
  const closed = await rpc('close_stop', { p_stop: stop, p_left: '11:00' }, who.sam.token);
  assert.equal(closed.json, true, closed.text);
  const edit = await rest(`trip_stops?id=eq.${stop}`, {
    method: 'PATCH',
    ...as('sam'),
    body: { arrived_at: '08:00' },
    headers: { Prefer: 'return=representation' },
  });
  assert.deepEqual(edit.json, [], 'Sam cannot change a stop Alex logged');
  const fix = randomUUID();
  const asked = await insert(
    'trip_stop_corrections',
    { id: fix, trip_id: trip, stop_id: stop, proposed_by: who.sam.id, arrived_at: '09:15' },
    'sam',
  );
  assert.ok(asked.ok, asked.text);
  const needs = await rpc('trip_needs', {}, who.alex.token);
  assert.deepEqual(
    needs.json.corrections.map((c) => c.by),
    ['Sam'],
  );
  const answer = await rpc(
    'answer_stop_correction',
    { p_correction: fix, p_accept: true },
    who.alex.token,
  );
  assert.equal(answer.json, 'accepted', answer.text);
  const log = await rpc('trip_log', { p_trip: trip }, who.alex.token);
  assert.deepEqual(
    log.json.stops.map((s) => [s.in, s.out]),
    [['09:15', '11:00']],
  );
});

test("Sam's photo: the file first, then its row; Alex can fetch it", async () => {
  photo = randomUUID();
  const name = `${trip}/${photo}.jpg`;
  const up = await upload('sam', name);
  assert.equal(up.status, 200, up.body.toString());
  const again = await upload('sam', name);
  assert.ok(
    !again.ok && /duplicate|exists/i.test(again.body.toString()),
    `a resent file is refused as already there: ${again.status} ${again.body}`,
  );
  const row = await insert(
    'photos',
    {
      id: photo,
      trip_id: trip,
      stop_id: stop,
      added_by: who.sam.id,
      caption: 'The gates',
      taken_at: `${day(-5)}T09:41:00`,
      width: 64,
      height: 48,
    },
    'sam',
  );
  assert.ok(row.ok, row.text);
  const got = await download('alex', name);
  assert.equal(got.status, 200);
  assert.ok(got.body.equals(JPEG), 'Alex gets the same bytes Sam sent');
  const log = await rpc('trip_log', { p_trip: trip }, who.alex.token);
  assert.deepEqual(
    log.json.photos.map((p) => [p.by, p.caption, p.taken, p.hidden]),
    [[who.sam.id, 'The gates', `${day(-5)}T09:41`, false]],
  );
  const notTraveller = await upload('leo', `${trip}/${randomUUID()}.jpg`);
  assert.ok(!notTraveller.ok, 'someone not on the trip cannot put a file in its folder');
});

test('a viewer sees the photo until a traveller hides it; others never do', async () => {
  const name = `${trip}/${photo}.jpg`;
  const proposed = await rest('trip_viewers', {
    method: 'POST',
    ...as('alex'),
    body: { trip_id: trip, viewer_id: who.maya.id, invited_by: who.alex.id },
  });
  assert.equal(proposed.status, 201, proposed.text);
  // Maya is Alex's friend, not Sam's, so only Alex could propose her; Sam agrees to her.
  const ok = await rest('trip_viewer_approvals', {
    method: 'POST',
    ...as('sam'),
    body: { trip_id: trip, viewer_id: who.maya.id, traveller_id: who.sam.id },
  });
  assert.equal(ok.status, 201, ok.text);
  for (const p of ['alex', 'sam']) {
    const r = await rest(`trip_traveller_settings?trip_id=eq.${trip}&account_id=eq.${who[p].id}`, {
      method: 'PATCH',
      ...as(p),
      body: { audience_choice: 'viewers_after' },
    });
    assert.ok(r.ok, r.text);
  }
  const seen = await rpc('trip_log', { p_trip: trip }, who.maya.token);
  assert.equal(seen.json.role, 'viewer');
  assert.equal(seen.json.photos.length, 1);
  assert.deepEqual(seen.json.corrections, []);
  assert.equal((await download('maya', name)).status, 200);

  const hide = await rest('photo_hides', {
    method: 'POST',
    ...as('alex'),
    body: { photo_id: photo, hidden_by: who.alex.id },
  });
  assert.equal(hide.status, 201, hide.text);
  assert.equal((await rpc('trip_log', { p_trip: trip }, who.maya.token)).json.photos.length, 0);
  assert.ok(!(await download('maya', name)).ok, 'a hidden photo cannot be fetched by a viewer');
  assert.equal((await download('sam', name)).status, 200, 'travellers still can');
  const back = await rest(`photo_hides?photo_id=eq.${photo}&hidden_by=eq.${who.alex.id}`, {
    method: 'DELETE',
    ...as('alex'),
  });
  assert.ok(back.ok, back.text);
  assert.equal((await download('maya', name)).status, 200, 'shown again, the viewer can fetch it');

  assert.equal((await rpc('trip_log', { p_trip: trip }, who.leo.token)).json, null);
  assert.ok(!(await download('leo', name)).ok, 'a friend who is not on the trip gets nothing');
  assert.ok(!(await download(null, name)).ok, 'signed out gets nothing');
});

test('the log version: unchanged means a few bytes, a change means the whole log', async () => {
  const full = await rpc('trip_log', { p_trip: trip }, who.sam.token);
  const v = full.json.version;
  const same = await rpc('trip_log', { p_trip: trip, p_version: v }, who.sam.token);
  assert.deepEqual(same.json, { version: v, same: true });
  assert.ok(same.text.length < 60);
  const absent = await rest('trip_stop_absences', {
    method: 'POST',
    ...as('sam'),
    body: { trip_id: trip, stop_id: stop, account_id: who.sam.id },
  });
  assert.equal(absent.status, 201, absent.text);
  const after = await rpc('trip_log', { p_trip: trip, p_version: v }, who.sam.token);
  assert.equal(after.json.version, v + 1);
  assert.deepEqual(after.json.absences, [{ stop, who: who.sam.id }]);
});

test('the sweep removes files no photo points at, and keeps the rest', async () => {
  orphan = `${trip}/${randomUUID()}.jpg`;
  assert.equal((await upload('alex', orphan)).status, 200);
  assert.ok(stored(orphan));
  sweep();
  assert.ok(!stored(orphan), 'the file with no photo is gone');
  assert.ok(stored(`${trip}/${photo}.jpg`), 'the photo stays');
  assert.equal((await download('alex', `${trip}/${photo}.jpg`)).status, 200);
});

test("leaving takes Sam's photo with him, file and all", async () => {
  const left = await rest(`trip_travellers?trip_id=eq.${trip}&account_id=eq.${who.sam.id}`, {
    method: 'DELETE',
    ...as('sam'),
  });
  assert.ok(left.ok, left.text);
  const log = await rpc('trip_log', { p_trip: trip }, who.alex.token);
  assert.deepEqual(log.json.photos, [], "Sam's photo row went with him");
  assert.equal(log.json.stops.length, 1, 'the stop stays');
  assert.ok(!(await download('alex', `${trip}/${photo}.jpg`)).ok, 'its file cannot be fetched');
  sweep();
  assert.ok(!stored(`${trip}/${photo}.jpg`), 'and after the sweep the file is gone too');
  assert.ok(!(await upload('sam', `${trip}/${randomUUID()}.jpg`)).ok, 'Sam can add no more');
});
