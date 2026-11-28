// The built site in a browser, on a real local Supabase: the owner signs in with a code read
// from the mail catcher, makes an invite link, a friend joins with it, a report reaches the
// admin, a block and an unblock, the data download, a session that refreshes itself, and
// leaving. Every call the account screens make goes to the real sign-in service and database.
//
// Run by .github/workflows/accounts.yml after data/backend.json is pointed at the local project
// and the site is built; not part of `npm test`. Needs the same settings as backend.e2e.mjs.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium, serveDist, openApp, go } from '../helpers.mjs';
import { sql, codeFor, URL_ } from './supabase.mjs';

const OWNER = 'owner@example.test';
const FRIEND = 'sam.browser@example.test';
const allow = [new URL(URL_).origin];
let browser, server, origin, owner, friend, link, ownerId, friendId;

before(async () => {
  const built = readFileSync(new URL('../../data/backend.json', import.meta.url), 'utf8');
  assert.ok(JSON.parse(built).url, 'data/backend.json does not point at the local project');
  ({ server, origin } = await serveDist());
  browser = await chromium.launch();
  // The owner of this run's site is a new address, so the first sign-in is tested here too.
  sql(
    `insert into private.settings (key, value) values ('founder_email', '${OWNER}') on conflict (key) do update set value = excluded.value`,
  );
});
after(async () => {
  await browser?.close();
  server?.close();
});

const shows = (page, re) =>
  page.waitForFunction(
    (src) => new RegExp(src).test(document.querySelector('#app')?.innerText || ''),
    re.source,
  );
const toastSays = (page, re) =>
  page.waitForFunction(
    (src) =>
      [...document.querySelectorAll('.toast')].some((t) => new RegExp(src, 'i').test(t.innerText)),
    re.source,
  );
// Waits up to ten seconds for `read()` to give `want`.
async function eventually(read, want, what) {
  for (let i = 0; i < 40 && read() !== want; i++) await new Promise((r) => setTimeout(r, 250));
  assert.equal(read(), want, what);
}
const session = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('tandem-session-v1') || 'null'));
// Sends the email form, then types in the code that arrives.
async function sendAndEnterCode(page, email) {
  const sent = Date.now() - 1000;
  await page.click('[data-acct-form="email"] [type="submit"]');
  await page.waitForSelector('#acct-code');
  await page.fill('#acct-code', await codeFor(email, { after: sent }));
  await page.click('[data-acct-form="code"] [type="submit"]');
}

test('the owner signs in on the site with a code from their email, and names themself', async () => {
  owner = await openApp(browser, origin, { allow, hash: '#/signin?next=account' });
  await owner.fill('#acct-email', OWNER);
  await sendAndEnterCode(owner, OWNER);
  await owner.waitForFunction(() => location.hash === '#/account');
  await owner.waitForSelector('#acct-f-name');
  ownerId = sql(`select id from auth.users where email = '${OWNER}'`);
  assert.equal(sql(`select count(*) from public.app_admins where account_id = '${ownerId}'`), '1');
  await owner.fill('#acct-f-name', 'Am');
  await owner.locator('#acct-f-name').dispatchEvent('change');
  await owner.waitForFunction(() => document.querySelector('.me-link')?.innerText.trim() === 'A');
  await eventually(
    () => sql(`select display_name from public.profiles where id = '${ownerId}'`),
    'Am',
    'the name was not saved',
  );
  await owner.fill('#acct-f-home', 'Toronto');
  await owner.locator('#acct-f-home').dispatchEvent('change');
  await eventually(
    () => sql(`select coalesce(home_city, '') from public.profiles where id = '${ownerId}'`),
    'Toronto',
    'the home city was not saved',
  );
  await owner.fill('#acct-f-style', 'Food, Slow mornings');
  await owner.locator('#acct-f-style').dispatchEvent('change');
  await eventually(
    () =>
      sql(
        `select array_to_string(travel_style, '|') from public.account_private where id = '${ownerId}'`,
      ),
    'Food|Slow mornings',
    'the travel style was not saved',
  );
});

test('the owner makes an invite link', async () => {
  await owner.click('#app [data-action="acct-invite"]');
  await owner.fill('#acct-note', 'Sam');
  await owner.click('[data-action="acct-make-invite"]');
  await owner.waitForSelector('#acct-link');
  link = await owner.inputValue('#acct-link');
  assert.ok(link.startsWith(origin + '/#/join/'), link);
  assert.match(link, /#\/join\/[A-Za-z0-9_-]{22}$/);
  assert.equal(
    sql(
      `select count(*) from public.friend_invites where inviter_id = '${ownerId}' and note = 'Sam'`,
    ),
    '1',
  );
});

test('a friend opens the link, joins with a code from their email, and is friends at once', async () => {
  friend = await openApp(browser, origin, { allow, hash: '#/' + link.split('#/')[1] });
  await friend.waitForSelector('#acct-name');
  await friend.fill('#acct-name', 'Sam');
  await friend.selectOption('#acct-born-m', '3');
  await friend.selectOption('#acct-born-y', '1994');
  await friend.fill('#acct-email', FRIEND);
  await sendAndEnterCode(friend, FRIEND);
  await friend.waitForFunction(() => location.hash.startsWith('#/people/'));
  await friend.waitForSelector('.acct-profile h1');
  assert.equal(await friend.locator('.acct-profile h1').innerText(), 'Am');
  assert.ok(!friend.url().includes(link.split('/join/')[1]), 'the invite code stayed in view');
  friendId = sql(`select id from auth.users where email = '${FRIEND}'`);
  assert.equal(
    sql(
      `select count(*) from public.friendships where status = 'accepted' and '${ownerId}' in (requester_id, addressee_id) and '${friendId}' in (requester_id, addressee_id)`,
    ),
    '1',
  );
  assert.equal(sql(`select age_band from public.account_private where id = '${friendId}'`), '18+');
  await go(friend, '#/feed');
  await friend.waitForSelector('.soc-friend');
  assert.match(await friend.locator('.soc-strip').innerText(), /Am/);
});

test("the owner's account shows the link used, and Sam's profile opens", async () => {
  await go(owner, '#/feed');
  await go(owner, '#/account');
  await shows(owner, /Used by Sam/);
  await go(owner, '#/people/' + friendId);
  await owner.waitForSelector('.acct-profile h1');
  assert.equal(await owner.locator('.acct-profile h1').innerText(), 'Sam');
});

test('a report reaches the admin, with names, and the admin closes it', async () => {
  await owner.click('#app [data-action="acct-person-more"]');
  await owner.click('[data-action="acct-report"]');
  await owner.fill('#acct-reason', 'Checking the report button');
  await owner.click('[data-action="acct-report-go"]');
  await toastSays(owner, /Sent/);
  assert.equal(
    sql(
      `select count(*) from public.reports where about_account = '${friendId}' and status = 'open'`,
    ),
    '1',
  );
  await go(owner, '#/account');
  await owner.reload();
  await owner.waitForSelector('.acct-reports');
  assert.match(await owner.locator('.acct-reports').innerText(), /Am reported Sam/);
  await owner.click('.acct-reports [data-action="acct-close-report"]');
  await owner.waitForFunction(() =>
    /No open reports/.test(document.querySelector('.acct-reports')?.innerText || ''),
  );
  assert.equal(
    sql(`select status from public.reports where about_account = '${friendId}'`),
    'closed',
  );
});

test('blocking ends the friendship; unblocking does not bring it back', async () => {
  await go(owner, '#/people/' + friendId);
  await owner.waitForSelector('.acct-profile h1');
  await owner.click('#app [data-action="acct-person-more"]');
  await owner.click('[data-action="acct-block"]');
  await owner.waitForFunction(() => location.hash === '#/account');
  await owner.waitForSelector('[data-action="acct-unblock"]');
  assert.equal(sql(`select count(*) from public.blocks where blocker_id = '${ownerId}'`), '1');
  assert.equal(
    sql(
      `select count(*) from public.friendships where '${friendId}' in (requester_id, addressee_id)`,
    ),
    '0',
  );
  await owner.click('[data-action="acct-unblock"]');
  await owner.waitForFunction(() => !document.querySelector('[data-action="acct-unblock"]'));
  assert.equal(sql(`select count(*) from public.blocks where blocker_id = '${ownerId}'`), '0');
});

test('the download holds the account from the database', async () => {
  await go(owner, '#/account');
  await owner.waitForSelector('[data-action="acct-download"]');
  const [file] = await Promise.all([
    owner.waitForEvent('download'),
    owner.click('[data-action="acct-download"]'),
  ]);
  const data = JSON.parse(readFileSync(await file.path(), 'utf8'));
  assert.equal(data.account.profile.display_name, 'Am');
  assert.equal(data.email, OWNER);
});

test('an expired session is refreshed by itself', async () => {
  const was = await session(owner);
  await owner.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('tandem-session-v1'));
    s.expires_at = Math.floor(Date.now() / 1000) - 10;
    localStorage.setItem('tandem-session-v1', JSON.stringify(s));
  });
  await owner.reload();
  await go(owner, '#/me');
  await owner.waitForSelector('.acct-profile h1');
  const now = await session(owner);
  assert.notEqual(now.refresh_token, was.refresh_token, 'the session was not refreshed');
  assert.ok(now.expires_at > Date.now() / 1000 + 60);
});

test('leaving, coming back, then "delete now" removes the account', async () => {
  const leavingDate = () =>
    sql(
      `select coalesce(delete_after::text, '') from public.account_private where id = '${friendId}'`,
    );
  await go(friend, '#/account');
  await friend.waitForSelector('#app [data-action="acct-leave"]');
  await friend.click('#app [data-action="acct-leave"]');
  await friend.click('[data-action="acct-leave-go"]');
  await friend.waitForSelector('.acct-leaving');
  assert.notEqual(leavingDate(), '');
  await friend.click('.acct-leaving [data-action="acct-stay"]');
  await friend.waitForFunction(() => !document.querySelector('.acct-leaving'));
  assert.equal(leavingDate(), '');
  await friend.click('#app [data-action="acct-leave"]');
  await friend.click('[data-action="acct-leave-go"]');
  await friend.waitForSelector('[data-action="acct-delete-now"]');
  await friend.click('#app [data-action="acct-delete-now"]');
  await friend.click('[data-action="acct-delete-go"]');
  await friend.waitForFunction(() => !localStorage.getItem('tandem-session-v1'));
  assert.equal(sql(`select count(*) from auth.users where email = '${FRIEND}'`), '0');
});

test('signing out ends the session at the service, and no page had an error', async () => {
  const s = await session(owner);
  await go(owner, '#/account');
  await owner.click('#app [data-action="acct-signout"]');
  await owner.waitForFunction(() => !localStorage.getItem('tandem-session-v1'));
  // The access token lasts until it expires, as every signed token does; the session's refresh
  // token stops working at once, so the session cannot be carried on.
  const again = await fetch(URL_ + '/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    headers: { apikey: process.env.SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  });
  assert.ok(!again.ok, `the refresh token still works after signing out (${again.status})`);
  for (const page of [owner, friend]) assert.deepEqual(page.errors, []);
});
