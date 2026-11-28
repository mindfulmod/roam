// Browser checks on the account screens, with accounts switched on against a stand-in for the
// accounts project (tests/fake-backend.mjs): signing in with an emailed code, joining with an
// invite link, friends, blocking, reports, leaving, and what a signed-out visitor sends (nothing).
// Run `npm run build` first; `npm test` does both.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium, serveDist, openApp, go, PHONE } from './helpers.mjs';
import { fakeBackend } from './fake-backend.mjs';

let browser, server, origin;
before(async () => {
  ({ server, origin } = await serveDist());
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  server?.close();
});

const text = (page) => page.evaluate(() => document.querySelector('#app').innerText);
// Waits for a toast saying `re`, and returns its text.
async function waitToast(page, re) {
  await page.waitForFunction(
    (src) =>
      [...document.querySelectorAll('.toast')].some((t) => new RegExp(src, 'i').test(t.innerText)),
    re.source,
  );
  return page.locator('.toast').innerText();
}
// Waits until a signed-in page has its data (no loading placeholder left).
const settled = (page) =>
  page.waitForFunction(() => {
    const app = document.querySelector('#app');
    return app.children.length && !app.querySelector('[aria-busy="true"]');
  });
async function signInWithCode(page, fake, email) {
  await page.fill('#acct-email', email);
  await page.click('[data-acct-form="email"] [type="submit"]');
  await page.waitForSelector('#acct-code');
  await page.fill('#acct-code', fake.codes.get(email));
  await page.click('[data-acct-form="code"] [type="submit"]');
}

test('signed out, accounts on: the sample stays, sign-in is offered, and nothing is sent', async () => {
  const fake = fakeBackend();
  const page = await openApp(browser, origin, { backend: fake });
  for (const hash of ['#/', '#/feed', '#/me', '#/account', '#/city/kyoto', '#/trip'])
    await go(page, hash);
  await go(page, '#/account');
  assert.ok(
    await page.locator('#app a[href="#/signin?next=account"]').count(),
    'no sign-in button',
  );
  assert.deepEqual(fake.calls, [], 'a signed-out visitor sent something to the accounts project');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('the owner signs in with an emailed code, becomes the first member, and names themself', async () => {
  const fake = fakeBackend();
  const page = await openApp(browser, origin, { backend: fake, hash: '#/signin' });
  await signInWithCode(page, fake, 'am@example.test');
  await page.waitForFunction(() => location.hash === '#/account');
  await page.waitForSelector('#acct-f-name');
  assert.match(await text(page), /am@example\.test/);
  const [id] = [...fake.profiles.keys()];
  assert.ok(id, 'no member was made');
  await page.fill('#acct-f-name', 'Am');
  await page.locator('#acct-f-name').dispatchEvent('change');
  await page.waitForFunction(() => document.querySelector('.me-link')?.innerText.trim() === 'A');
  assert.equal(fake.profiles.get(id).display_name, 'Am');
  // The session is kept, and a reload stays signed in.
  await page.reload();
  await page.waitForSelector('#acct-f-name');
  assert.equal(await page.inputValue('#acct-f-name'), 'Am');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('a wrong code, and a stranger without an invite, are each told plainly', async () => {
  const fake = fakeBackend();
  const page = await openApp(browser, origin, { backend: fake, hash: '#/signin' });
  await page.fill('#acct-email', 'stranger@example.test');
  await page.click('[data-acct-form="email"] [type="submit"]');
  await page.waitForSelector('.acct-problem:not([hidden])');
  assert.match(await page.locator('.acct-problem').innerText(), /invite-only/);
  await page.fill('#acct-email', 'am@example.test');
  await page.click('[data-acct-form="email"] [type="submit"]');
  await page.waitForSelector('#acct-code');
  await page.fill('#acct-code', '000000');
  await page.click('[data-acct-form="code"] [type="submit"]');
  await page.waitForSelector('.acct-problem:not([hidden])');
  assert.match(await page.locator('.acct-problem').innerText(), /wrong or has expired/);
  assert.equal(fake.profiles.size, 0);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('an invite link: made by a member, opened by a friend who joins, and then used up', async () => {
  const fake = fakeBackend();
  const am = fake.member('Am', 'am@example.test');
  const owner = await openApp(browser, origin, {
    backend: fake,
    session: fake.sessionFor(am),
    hash: '#/account',
  });
  await owner.waitForSelector('[data-action="acct-invite"]');
  await owner.click('#app [data-action="acct-invite"]');
  await owner.fill('#acct-note', 'Sam');
  await owner.click('[data-action="acct-make-invite"]');
  await owner.waitForSelector('#acct-link');
  const link = await owner.inputValue('#acct-link');
  assert.match(link, /#\/join\/[A-Za-z0-9_-]{22}$/);
  assert.equal(fake.invites[0].note, 'Sam');

  // Sam opens it on another device.
  const sam = await openApp(browser, origin, { backend: fake, hash: '#/' + link.split('#/')[1] });
  await sam.waitForSelector('#acct-name');
  await sam.fill('#acct-name', 'Sam');
  await sam.selectOption('#acct-born-m', '3');
  await sam.selectOption('#acct-born-y', '1994');
  await signInWithCode(sam, fake, 'sam@example.test');
  await sam.waitForFunction(() => location.hash.startsWith('#/people/'));
  await sam.waitForSelector('.acct-profile h1');
  assert.equal(await sam.locator('.acct-profile h1').innerText(), 'Am');
  assert.match(await text(sam), /Friends/);
  assert.ok(
    !sam.url().includes(link.split('/join/')[1]),
    'the invite code stayed in the address bar',
  );
  const samId = [...fake.users.values()].find((u) => u.email === 'sam@example.test').id;
  assert.equal(fake.profiles.get(samId).display_name, 'Sam');
  assert.equal(fake.priv.get(samId).age_band, '18+');
  assert.equal(fake.friendships.length, 1);
  await go(sam, '#/feed');
  await sam.waitForSelector('.soc-friend');
  assert.match(await sam.locator('.soc-strip').innerText(), /Am/);

  // The owner's account now shows Sam as a friend and the link as used.
  await go(owner, '#/feed');
  await go(owner, '#/account');
  await owner.waitForFunction(() => /Used by Sam/.test(document.querySelector('#app').innerText));

  // The same link, opened by someone else, no longer works.
  const kim = await openApp(browser, origin, { backend: fake, hash: '#/' + link.split('#/')[1] });
  await kim.waitForSelector('#acct-name');
  await kim.fill('#acct-name', 'Kim');
  await kim.selectOption('#acct-born-m', '5');
  await kim.selectOption('#acct-born-y', '1990');
  await kim.fill('#acct-email', 'kim@example.test');
  await kim.click('[data-acct-form="email"] [type="submit"]');
  await kim.waitForSelector('.acct-problem:not([hidden])');
  assert.match(await kim.locator('.acct-problem').innerText(), /no longer works/);
  for (const p of [owner, sam, kim]) {
    assert.deepEqual(p.errors, []);
    await p.context().close();
  }
});

test('an invite stopped while the code is on its way: told plainly, and not let in', async () => {
  const fake = fakeBackend();
  const am = fake.member('Am', 'am@example.test');
  const code = fake.invite(am);
  const page = await openApp(browser, origin, { backend: fake, hash: '#/join/' + code });
  await page.waitForSelector('#acct-name');
  await page.fill('#acct-name', 'Lee');
  await page.selectOption('#acct-born-m', '7');
  await page.selectOption('#acct-born-y', '1992');
  await page.fill('#acct-email', 'lee@example.test');
  await page.click('[data-acct-form="email"] [type="submit"]');
  await page.waitForSelector('#acct-code');
  // Am stops the link before Lee types the code in.
  fake.invites[0].expires_at = new Date().toISOString();
  await page.fill('#acct-code', fake.codes.get('lee@example.test'));
  await page.click('[data-acct-form="code"] [type="submit"]');
  assert.match(await waitToast(page, /no longer works/), /Ask your friend for a new one/);
  await page.waitForFunction(() => location.hash === '#/account');
  await page.waitForFunction(() =>
    /not a member yet/.test(document.querySelector('#app').innerText),
  );
  assert.equal(fake.profiles.size, 1, 'Lee was let in');
  assert.ok(!page.url().includes(code), 'the invite code stayed in the address bar');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('under 16 cannot join, and nothing is sent', async () => {
  const fake = fakeBackend();
  const am = fake.member('Am', 'am@example.test');
  fake.invites.push({
    id: crypto.randomUUID(),
    code: 'abcdefghijklmnopqrstuv',
    inviter_id: am,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 864e5).toISOString(),
  });
  const page = await openApp(browser, origin, {
    backend: fake,
    hash: '#/join/abcdefghijklmnopqrstuv',
  });
  await page.fill('#acct-name', 'Young');
  await page.selectOption('#acct-born-m', '1');
  await page.selectOption('#acct-born-y', String(new Date().getFullYear() - 14));
  await page.fill('#acct-email', 'young@example.test');
  await page.click('[data-acct-form="email"] [type="submit"]');
  await page.waitForFunction(() => /16 and over/.test(document.querySelector('#app').innerText));
  assert.deepEqual(fake.calls, []);
  // A link with part of it missing says so.
  await go(page, '#/join/abc');
  assert.match(await text(page), /not complete/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('other people’s names and words are shown as text, never run as code', async () => {
  const fake = fakeBackend();
  const am = fake.member('Am', 'am@example.test');
  const bad = fake.member('<img src=x onerror="window.__hacked=1">', 'bad@example.test');
  fake.profiles.get(bad).bio = '<script>window.__hacked=2</script>';
  fake.profiles.get(bad).home_city = '"><svg onload="window.__hacked=3">';
  fake.befriend(bad, am);
  const asks = fake.member('<b>Asker</b>', 'asker@example.test');
  fake.ask(asks, am);
  const page = await openApp(browser, origin, {
    backend: fake,
    session: fake.sessionFor(am),
    hash: '#/feed',
  });
  for (const hash of ['#/feed', '#/account', '#/people/' + bad, '#/people/' + asks]) {
    await go(page, hash);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__hacked), undefined, 'code ran on ' + hash);
    assert.equal(await page.locator('#app img[src="x"], #app svg[onload], #app b').count(), 0);
  }
  await go(page, '#/people/' + bad);
  await page.waitForSelector('.acct-profile h1');
  assert.match(await page.locator('.acct-profile h1').innerText(), /<img src=x/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('friend requests, block and unblock, and a report', async () => {
  const fake = fakeBackend();
  const am = fake.member('Am', 'am@example.test');
  const jo = fake.member('Jo');
  const leo = fake.member('Leo');
  fake.befriend(am, jo);
  fake.ask(leo, am);
  const page = await openApp(browser, origin, {
    backend: fake,
    session: fake.sessionFor(am),
    hash: '#/feed',
  });
  // Leo's request waits under "Needs you", with a count on the Feed tab.
  await page.waitForSelector('.acct-need');
  assert.equal(await page.locator('.feed-count').first().innerText(), '1');
  await page.click('.acct-need [data-action="acct-accept"]');
  await page.waitForFunction(() => !document.querySelector('.acct-need'));
  assert.equal(fake.friendships.filter((f) => f.status === 'accepted').length, 2);

  // Block Jo from Jo's profile: the friendship ends, and Jo shows as blocked under Account.
  await go(page, '#/people/' + jo);
  await page.click('#app [data-action="acct-person-more"]');
  await page.click('[data-action="acct-block"]');
  await page.waitForFunction(() => location.hash === '#/account');
  await page.waitForSelector('[data-action="acct-unblock"]');
  assert.equal(fake.blocks.length, 1);
  assert.ok(!fake.friendships.some((f) => [f.requester_id, f.addressee_id].includes(jo)));
  await page.click('[data-action="acct-unblock"]');
  await page.waitForFunction(() => !document.querySelector('[data-action="acct-unblock"]'));
  assert.equal(fake.blocks.length, 0);

  // Report Leo. Members never see the report queue.
  await go(page, '#/people/' + leo);
  await page.click('#app [data-action="acct-person-more"]');
  await page.click('[data-action="acct-report"]');
  await page.fill('#acct-reason', 'Testing the report button');
  await page.click('[data-action="acct-report-go"]');
  assert.match(await waitToast(page, /Sent/), /Sent/);
  assert.equal(fake.reports.length, 1);
  assert.equal(fake.reports[0].about_account, leo);
  await go(page, '#/account');
  await page.waitForSelector('.acct-account');
  assert.equal(await page.locator('.acct-reports').count(), 0, 'a member saw the reports');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('the admin sees open reports, with names, and closes one', async () => {
  const fake = fakeBackend();
  const am = fake.member('Am', 'am@example.test');
  const sam = fake.member('Sam');
  const leo = fake.member('Leo');
  fake.admins.add(am);
  fake.reports.push({
    id: crypto.randomUUID(),
    reporter_id: sam,
    about_account: leo,
    about_kind: 'person',
    reason: 'A test report',
    status: 'open',
    created_at: new Date().toISOString(),
  });
  const page = await openApp(browser, origin, {
    backend: fake,
    session: fake.sessionFor(am),
    hash: '#/account',
  });
  await page.waitForSelector('.acct-reports');
  assert.match(await page.locator('.acct-reports').innerText(), /Sam reported Leo/);
  await page.click('.acct-reports [data-action="acct-close-report"]');
  await page.waitForFunction(() =>
    /No open reports/.test(document.querySelector('.acct-reports')?.innerText),
  );
  assert.equal(fake.reports[0].status, 'closed');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('leaving: the date shows, coming back undoes it, and delete now signs you out', async () => {
  const fake = fakeBackend();
  const am = fake.member('Am', 'am@example.test');
  const page = await openApp(browser, origin, {
    backend: fake,
    session: fake.sessionFor(am),
    hash: '#/account',
  });
  await page.click('#app [data-action="acct-leave"]');
  await page.click('[data-action="acct-leave-go"]');
  await page.waitForSelector('.acct-leaving');
  assert.ok(fake.priv.get(am).delete_after);
  await page.click('.acct-leaving [data-action="acct-stay"]');
  await page.waitForFunction(() => !document.querySelector('.acct-leaving'));
  assert.equal(fake.priv.get(am).delete_after, null);
  await page.click('#app [data-action="acct-leave"]');
  await page.click('[data-action="acct-leave-go"]');
  await page.waitForSelector('[data-action="acct-delete-now"]');
  await page.click('#app [data-action="acct-delete-now"]');
  await page.click('[data-action="acct-delete-go"]');
  await page.waitForFunction(() => !localStorage.getItem('tandem-session-v1'));
  assert.equal(fake.profiles.has(am), false);
  // Signed out, the Account page is the sample again.
  await go(page, '#/account');
  assert.ok(await page.locator('#app a[href="#/signin?next=account"]').count());
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('an expired session is refreshed; a refused one signs you out', async () => {
  const fake = fakeBackend();
  const am = fake.member('Am', 'am@example.test');
  const s = fake.sessionFor(am);
  const page = await openApp(browser, origin, {
    backend: fake,
    session: { ...s, expires_at: Math.floor(Date.now() / 1000) - 10 },
    hash: '#/me',
  });
  await page.waitForSelector('.acct-profile h1');
  assert.ok(
    fake.calls.some((c) => c.path.startsWith('/auth/v1/token')),
    'no refresh',
  );
  // The service turns the refresh token down: signed out, with a note.
  fake.refresh.clear();
  fake.access.clear();
  await go(page, '#/account');
  await page.waitForFunction(() => !localStorage.getItem('tandem-session-v1'));
  assert.match(await waitToast(page, /signed out/), /signed out/i);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('the download holds the account and this device’s data, and signing out keeps your trip', async () => {
  const fake = fakeBackend();
  const am = fake.member('Am', 'am@example.test');
  const page = await openApp(browser, origin, {
    backend: fake,
    session: fake.sessionFor(am),
    hash: '#/account',
  });
  await page.waitForSelector('[data-action="acct-download"]');
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.click('[data-action="acct-download"]'),
  ]);
  const data = JSON.parse(readFileSync(await file.path(), 'utf8'));
  assert.equal(data.account.profile.display_name, 'Am');
  assert.equal(data.email, 'am@example.test');
  assert.ok(data.thisDevice.trip, 'device data missing');
  await page.click('#app [data-action="acct-signout"]');
  await page.waitForFunction(() => !localStorage.getItem('tandem-session-v1'));
  assert.ok(
    fake.calls.some((c) => c.path.startsWith('/auth/v1/logout')),
    'the service was not told',
  );
  // What this device keeps stays: the trip is still in its own storage.
  assert.ok(await page.evaluate(() => localStorage.getItem('roam-atlas-v1') !== undefined));
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('every account screen opens on a phone without errors or sideways scrolling', async () => {
  const fake = fakeBackend();
  const am = fake.member('Am', 'am@example.test');
  const sam = fake.member('Samantha Featherstonehaugh-Llewellyn');
  fake.profiles.get(sam).home_city = 'Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch';
  fake.befriend(am, sam);
  fake.ask(fake.member('Leo'), am);
  const page = await openApp(browser, origin, {
    backend: fake,
    session: fake.sessionFor(am),
    hash: '#/feed',
  });
  for (const hash of [
    '#/feed',
    '#/me',
    '#/account',
    '#/people/' + sam,
    '#/people/' + crypto.randomUUID(),
    '#/people/not-a-person',
    '#/join/abc',
  ]) {
    await go(page, hash);
    await settled(page);
    assert.deepEqual(page.errors, [], 'error on ' + hash);
    const t = await text(page);
    assert.ok(t.trim().length > 20, 'blank screen at ' + hash);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(width <= PHONE.width, `${hash} is ${width}px wide on a ${PHONE.width}px phone`);
  }
  const signin = await openApp(browser, origin, { backend: fake, hash: '#/signin' });
  const join = await openApp(browser, origin, {
    backend: fake,
    hash: '#/join/abcdefghijklmnopqrstuv',
  });
  for (const p of [signin, join]) {
    const width = await p.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(width <= PHONE.width, `${p.url()} is ${width}px wide`);
    assert.deepEqual(p.errors, []);
    await p.context().close();
  }
  await page.context().close();
});
