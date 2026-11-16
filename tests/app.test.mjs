// Browser checks on the built app (run `npm run build` first; `npm test` does both).
// 1. Every screen opens without an error and fits a phone.
// 2. The main journey works: open a city, save a place, find it in Saved, add the city to the trip.
// 3. Text that a person typed, or that arrives in a link or a backup file, is always shown as
//    text and never runs as code. This matters more once friends' comments and names arrive.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, serveDist, openApp, go, PHONE } from './helpers.mjs';

let browser, server, origin;
before(async () => {
  ({ server, origin } = await serveDist());
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  server?.close();
});

const SCREENS = [
  '#/',
  '#/city/tokyo',
  '#/city/tokyo?tab=food',
  '#/city/tokyo?tab=shop',
  '#/city/tokyo?tab=practical',
  '#/city/tokyo?tab=sources',
  '#/map',
  '#/map/kyoto',
  '#/saved',
  '#/trip',
  '#/budget',
  '#/choose',
  '#/guide',
  '#/story/japan-sample',
  '#/story/istanbul-sample',
  '#/feed',
  '#/me',
  '#/people/sam',
  '#/people/not-a-person',
  '#/account',
  '#/city/not-a-city',
  '#/story/not-a-story',
  '#/t/not-a-link',
  '#/nowhere',
];

test('every screen opens on a phone without errors or sideways scrolling', async () => {
  const page = await openApp(browser, origin);
  for (const hash of SCREENS) {
    await go(page, hash);
    assert.deepEqual(page.errors, [], 'error on ' + hash);
    const text = await page.evaluate(() => document.querySelector('#app').innerText.trim().length);
    assert.ok(text > 20, 'blank screen at ' + hash);
    // innerWidth grows with the overflow on emulated phones, so compare with the set width.
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(width <= PHONE.width, `${hash} is ${width}px wide on a ${PHONE.width}px phone`);
  }
  await page.context().close();
});

test('every screen opens on a desktop without errors', async () => {
  const page = await openApp(browser, origin, { viewport: { width: 1280, height: 800 } });
  for (const hash of SCREENS) {
    await go(page, hash);
    assert.deepEqual(page.errors, [], 'error on ' + hash);
  }
  await page.context().close();
});

test('save a place, see it in Saved, add its city to the trip, and it survives a reload', async () => {
  const page = await openApp(browser, origin, { hash: '#/city/kyoto' });
  const stored = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('roam-atlas-v1') || '{}'));
  await page.locator('#app [data-action="save"]').first().click();
  const one = await stored();
  assert.equal(one.saved?.length, 1, 'the first heart did not save a place');

  await go(page, '#/saved');
  const savedText = await page.evaluate(() => document.querySelector('#app').innerText);
  assert.match(savedText, /Kyoto/);

  await go(page, '#/city/kyoto');
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#app button')].find(
      (x) => /add kyoto to (your )?trip/i.test(x.innerText) && x.offsetParent,
    );
    b?.click();
  });
  const two = await stored();
  assert.ok(two.trip?.includes('kyoto'), '"Add Kyoto to trip" did not add the city');

  await page.reload();
  await go(page, '#/trip');
  const tripText = await page.evaluate(() => document.querySelector('#app').innerText);
  assert.match(tripText, /Kyoto/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

// Strings that would run code or add elements if any screen pasted them in unescaped.
const HOSTILE = [
  `"><img src=x onerror="window.__ran=1"><b data-injected>`,
  `</textarea><script>window.__ran=1</script><i data-injected>`,
  `'onmouseover='window.__ran=1' data-injected='`,
].join(' ');
const injected = (page) =>
  page.evaluate(() => ({
    ran: window.__ran === 1,
    elements: document.querySelectorAll('[data-injected]').length,
  }));
const clean = { ran: false, elements: 0 };

test('hostile text in saved notes, stays and lists is shown as text on every screen', async () => {
  const state = {
    saved: ['kyoto-fushimi', HOSTILE],
    shops: [HOSTILE],
    moods: [HOSTILE],
    trip: ['kyoto', 'tokyo', HOSTILE],
    visited: [HOSTILE],
    days: { kyoto: 3, [HOSTILE]: 2 },
    notes: { kyoto: HOSTILE, tokyo: HOSTILE, 'kyoto-fushimi': HOSTILE, [HOSTILE]: HOSTILE },
    stays: {
      kyoto: { label: HOSTILE, address: HOSTILE, lat: 35.0, lon: 135.76 },
    },
    startDate: HOSTILE,
    pace: HOSTILE,
    people: HOSTILE,
    checklist: [HOSTILE.slice(0, 70), `<b data-injected>x</b>`],
    budget: { origin: HOSTILE, currency: HOSTILE, amount: HOSTILE, month: HOSTILE, days: HOSTILE },
  };
  const page = await openApp(browser, origin, { state });
  for (const hash of SCREENS) {
    await go(page, hash);
    assert.deepEqual(await injected(page), clean, 'hostile saved text ran on ' + hash);
    assert.deepEqual(page.errors, [], 'error on ' + hash);
  }
  // The note really is on screen, as text.
  await go(page, '#/city/kyoto');
  const note = await page.evaluate(
    () => document.querySelector('textarea[data-note="kyoto"]')?.value || '',
  );
  assert.ok(note.includes('data-injected'), 'the city note should be shown back as plain text');
  await page.context().close();
});

test('unreadable saved data falls back to a fresh start', async () => {
  for (const state of [
    '{not json',
    '[]',
    '"text"',
    'null',
    '{"saved":{"a":1},"trip":"x","notes":[]}',
  ]) {
    const page = await openApp(browser, origin, { state });
    for (const hash of ['#/', '#/saved', '#/trip']) await go(page, hash);
    assert.deepEqual(page.errors, [], 'error with saved data ' + state);
    await page.context().close();
  }
});

test('hostile text in the address bar is shown as text', async () => {
  const page = await openApp(browser, origin);
  const h = encodeURIComponent(HOSTILE);
  for (const hash of [
    `#/city/${h}`,
    `#/city/${HOSTILE}`,
    `#/city/tokyo?tab=${h}`,
    `#/map/${h}`,
    `#/story/${h}`,
    `#/story/japan-sample/${h}`,
    `#/choose?${h}=${h}&when=${h}&mood=${h}&budget=${h}`,
    `#/t/${h}`,
    `#/${HOSTILE}`,
  ]) {
    await go(page, hash);
    assert.deepEqual(await injected(page), clean, 'hostile link text ran on ' + hash);
    assert.deepEqual(page.errors, [], 'error on ' + hash);
  }
  await page.context().close();
});

test('hostile text inside a shared trip link is shown as text', async () => {
  const page = await openApp(browser, origin);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const links = [
    {
      v: 1,
      t: ['kyoto', HOSTILE],
      d: { kyoto: HOSTILE },
      s: [HOSTILE],
      sd: HOSTILE,
      p: HOSTILE,
      pc: HOSTILE,
    },
    { v: 1, t: [HOSTILE], d: {}, s: [] },
    { v: HOSTILE, t: HOSTILE },
    HOSTILE,
  ];
  for (const link of links) {
    await go(page, '#/t/j' + b64(link));
    await page.waitForTimeout(200);
    assert.deepEqual(await injected(page), clean, 'hostile shared link ran');
    assert.deepEqual(page.errors, []);
  }
  await page.context().close();
});

test('hostile text typed into search boxes is shown as text', async () => {
  const page = await openApp(browser, origin);
  for (const [hash, selector] of [
    ['#/', '#browse-search'],
    ['#/map', '#map-search'],
  ]) {
    await go(page, hash);
    const box = page.locator(selector).first();
    assert.equal(await box.count(), 1, 'no search box ' + selector);
    await box.fill(HOSTILE);
    await page.waitForTimeout(250);
    await box.press('Enter');
    await page.waitForTimeout(250);
    assert.deepEqual(await injected(page), clean, 'hostile search text ran on ' + hash);
    assert.deepEqual(page.errors, [], 'error on ' + hash);
  }
  await page.context().close();
});

test('hostile text in a trip backup file is shown as text after import', async () => {
  const page = await openApp(browser, origin, { hash: '#/trip' });
  const backup = {
    app: 'Tandem Roads',
    schema: 1,
    state: {
      trip: ['kyoto'],
      saved: [],
      notes: { kyoto: HOSTILE },
      stays: { kyoto: { label: HOSTILE, address: HOSTILE, lat: 35, lon: 135.76 } },
      checklist: [`<b data-injected>x</b>`],
    },
  };
  const input = page.locator('#import-file');
  assert.equal(await input.count(), 1, 'no backup file input');
  {
    await input.setInputFiles({
      name: `${HOSTILE.replaceAll('/', '')}.json`,
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await page.waitForTimeout(300);
    assert.deepEqual(await injected(page), clean, 'hostile backup ran in the import prompt');
    await page.evaluate(() => document.querySelector('[data-action="import-replace"]')?.click());
    await page.waitForTimeout(300);
    for (const hash of ['#/trip', '#/city/kyoto', '#/saved', '#/map/kyoto']) {
      await go(page, hash);
      assert.deepEqual(await injected(page), clean, 'hostile backup ran on ' + hash);
    }
    assert.deepEqual(page.errors, []);
  }
  await page.context().close();
});

test('the feed clears what needs you, and profile text a person typed is shown as text', async () => {
  const page = await openApp(browser, origin, { hash: '#/feed' });
  const needs = () => page.locator('.soc-need').count();
  const before = await needs();
  assert.ok(before > 0, 'nothing under Needs you');
  await page.locator('[data-action="soc-vote"]').first().click();
  assert.equal(await needs(), before - 1, 'answering a poll did not clear it');
  assert.equal(await page.locator('.feed-count').first().textContent(), String(before - 1));
  // People are never ranked: no item may show a heart total.
  assert.equal(await page.locator('.soc-heart span').count(), 0, 'a heart shows a number');
  await page.evaluate((text) => {
    localStorage.setItem(
      'tandem-social-v1',
      JSON.stringify({
        profile: { name: text, home: text, line: text, style: [text] },
        muted: [text],
        blocked: [text],
        hidden: [text],
        done: { [text]: text },
        next: { [text]: text },
      }),
    );
  }, HOSTILE);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#app')?.children.length > 0);
  for (const hash of ['#/me', '#/account', '#/feed', '#/people/sam']) {
    await go(page, hash);
    assert.deepEqual(await injected(page), clean, 'hostile profile text ran on ' + hash);
  }
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
