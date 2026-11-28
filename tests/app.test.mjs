// Browser checks on the built app (run `npm run build` first; `npm test` does both).
// 1. Every screen opens without an error and fits a phone.
// 2. The main journey works: open a city, save a place, find it in Saved, add the city to the trip.
// 3. Text that a person typed, or that arrives in a link or a backup file, is always shown as
//    text and never runs as code. This matters more once friends' comments and names arrive.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium, serveDist, openApp, go, PHONE, root } from './helpers.mjs';

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
  '#/story/japan-sample/log',
  '#/story/japan-sample/log/catchup',
  '#/story/japan-sample/log/edit',
  '#/log',
  '#/story/my-trip',
  '#/log/2027-07-01',
  '#/story/japan-sample/edit',
  '#/story/istanbul-sample/edit',
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
    `#/story/japan-sample/log/${h}`,
    `#/story/${h}/log`,
    `#/story/istanbul-sample/log`,
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

// The logging mock is the first screen where a traveller types text that others will read
// (a place name, a note, a caption), so it gets the same hostile-text check from the start.
test('logging a trip: the three flows work and typed text is shown as text', async () => {
  const page = await openApp(browser, origin, { hash: '#/story/japan-sample/log' });
  const tap = async (sel) => {
    await page.$eval(sel, (el) => el.click());
    await page.waitForTimeout(150);
  };
  const count = (sel) => page.locator(sel).count();
  // "I'm here", then undo, then a place the guide does not have, logged with no signal.
  await tap('[data-action="lg-here"]');
  assert.equal(await count('.lg-list li'), 1, 'the tap did not log a place');
  await tap('.toast button');
  assert.equal(await count('.lg-list li'), 0, 'undo did not remove the place');
  await tap('[data-action="lg-signal"]');
  await tap('[data-action="lg-else"]');
  await page.fill('#lg-newplace', HOSTILE);
  await tap('.lg-add .btn');
  assert.equal(await count('.lg-wait'), 1, 'an offline tap is not marked as waiting');
  await tap('[data-action="lg-signal"]');
  assert.equal(await count('.lg-wait'), 0, 'coming back online did not send the place');
  assert.deepEqual(await injected(page), clean, 'a typed place name ran as code');
  // Catch up: six photos at one place is one too many, and a photo with no location asks where.
  await tap('#lg-tabs [data-id="catchup"]');
  await tap('[data-action="lg-build"]');
  assert.equal(await page.locator('[data-action="lg-commit"]').isDisabled(), true);
  await tap('.lg-group.needs [data-action="lg-unpick"]');
  await tap('.btn[data-action="lg-where"]');
  await tap('.lg-pick button');
  await tap('[data-action="lg-commit"]');
  assert.equal(await count('.lg-list li'), 5, 'the day was not built from the photos');
  // The story: it opens the editor on the story page, and is finished only when all four say yes.
  await tap('#lg-tabs [data-id="edit"]');
  assert.equal(await count('.ed-door'), 1, 'no way into the story editor');
  await tap('[data-action="lg-week"]');
  await tap('[data-action="lg-ok"]');
  assert.equal(await count('.lg-done'), 0, 'the story finished without everyone');
  await tap('[data-action="lg-jo"]');
  assert.equal(await count('.lg-done'), 1, 'the story did not finish with four yeses');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('logging your own trip: I am here, location, a place of your own, fix, undo, reload', async () => {
  const page = await openApp(browser, origin, {
    state: { trip: ['kyoto'], saved: ['kyoto-kiyomizu'] },
    hash: '#/trip',
  });
  await page.clock.install({ time: new Date('2027-07-12T09:00:00') });
  await page.context().grantPermissions(['geolocation']);
  await page.reload();
  const tap = async (sel) => {
    await page.$eval(sel, (el) => el.click());
    await page.waitForTimeout(150);
  };
  const count = (sel) => page.locator(sel).count();
  const rows = () => page.$$eval('.tl-list li', (l) => l.map((x) => x.innerText));
  await page.waitForSelector('.tripbar a[href="#/log"]');
  await tap('.tripbar a[href="#/log"]');
  await page.waitForTimeout(300);
  // With no location, the next saved place in today's city is offered.
  assert.match(await page.innerText('.lg-here'), /Next on your plan[\s\S]*Kiyomizu/i);
  await tap('[data-action="tl-here"]');
  assert.equal(await count('.tl-list li'), 1, 'the tap did not log a place');
  assert.match((await rows())[0], /09:0\d, here now/);
  // Half an hour later, near Fushimi Inari: the location suggests it, and the first stop closes.
  await page.clock.fastForward('30:00');
  await page.context().setGeolocation({ latitude: 34.9672, longitude: 135.7726 });
  await tap('[data-action="tl-left"]');
  await tap('[data-action="tl-locate"]');
  await page.waitForTimeout(300);
  assert.match(await page.innerText('.lg-here'), /You look close to[\s\S]*Fushimi/i);
  await tap('[data-action="tl-here"]');
  assert.equal(await count('.tl-list li'), 2);
  assert.match((await rows())[0], /09:0\d to 09:3\d/);
  // Undo takes the last tap back.
  await tap('.toast button');
  assert.equal(await count('.tl-list li'), 1, 'undo did not remove the place');
  // A place the guide does not have, with a typed name, then a typed note.
  await page.clock.fastForward('05:00');
  await tap('[data-action="tl-else"]');
  await page.fill('.tl-search', 'zzzz no such place');
  assert.equal(await count('.tl-none'), 1, 'search did not narrow the list');
  await page.fill('#tl-newplace', HOSTILE);
  await tap('.tl-add .btn');
  assert.equal(await count('.tl-list li'), 2);
  await tap('.tl-list li:last-child [data-action="tl-fix"]');
  await page.fill('.tl-fix textarea', HOSTILE);
  await tap('.tl-fix .btn');
  assert.deepEqual(await injected(page), clean, 'typed text ran as code');
  assert.ok((await rows())[1].includes(HOSTILE.slice(0, 12)), 'the note was not shown as text');
  // A leaving time before the arrival is refused.
  await tap('.tl-list li:first-child [data-action="tl-fix"]');
  await page.fill('.tl-fix input[name="out"]', '08:00');
  await tap('.tl-fix .btn');
  assert.equal(await count('.tl-fix'), 1, 'a leaving time before arrival was saved');
  // Everything is on the phone: it survives a reload, and the next day closes the open stop.
  await page.clock.fastForward('24:00:00');
  await page.reload();
  await page.waitForTimeout(400);
  assert.equal(await count('#tl-days .chip'), 2, 'yesterday is not listed');
  await tap('#tl-days .chip:nth-child(2)');
  assert.equal(await count('.tl-list li'), 2, 'the log did not survive a reload');
  assert.match((await rows())[1], /about/, 'yesterday’s open stop was not closed');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('logging photos: picked photos are shrunk on the phone, location dropped, five per stop', async () => {
  const page = await openApp(browser, origin, {
    state: { trip: ['kyoto'], saved: ['kyoto-kiyomizu'] },
    hash: '#/log',
  });
  const fx = (n) => path.join(root, 'tests/fixtures', n);
  const shots = ['kyoto-0930.jpg', 'kyoto-0942.jpg', 'kyoto-1410.jpg'].map(fx);
  await page.$eval('[data-action="tl-here"]', (el) => el.click());
  await page.waitForTimeout(200);
  await page.setInputFiles('.lg-card .tl-addphoto input', shots);
  await page.waitForFunction(
    () => document.querySelectorAll('.lg-card img.tl-photo[src]').length === 3,
  );
  // What is kept is a fresh JPEG: no EXIF block, so no location; the taken time was read first.
  const kept = await page.evaluate(async () => {
    const log = JSON.parse(localStorage.getItem('roam-trip-log'));
    const ph = log.stops[0].photos;
    const rec = await tlpGet(ph[0].id);
    const bytes = new Uint8Array(await rec.blob.arrayBuffer());
    const text = String.fromCharCode(...bytes.slice(0, 4096));
    return { times: ph.map((x) => x.t), exif: text.includes('Exif'), type: rec.blob.type };
  });
  assert.deepEqual(kept.times, ['09:30', '09:42', '14:10']);
  assert.equal(kept.exif, false, 'the kept photo still carries EXIF (and so location)');
  assert.equal(kept.type, 'image/jpeg');
  // Three more: only two fit, and the person is told.
  await page.setInputFiles('.lg-card .tl-addphoto input', shots);
  await page.waitForFunction(
    () => document.querySelectorAll('.lg-card img.tl-photo[src]').length === 5,
  );
  assert.match(await page.innerText('.toast'), /holds 5, so 1 was left out/);
  assert.equal(await page.locator('.lg-card .tl-addphoto input').isDisabled(), true);
  // Remove one from the fix sheet, and the photos survive a reload.
  await page.$eval('.tl-list [data-action="tl-fix"]', (el) => el.click());
  await page.waitForTimeout(200);
  await page.$eval('[data-action="tl-unphoto"]', (el) => el.click());
  await page.waitForTimeout(200);
  await page.reload();
  await page.waitForFunction(
    () => document.querySelectorAll('.lg-card img.tl-photo[src]').length === 4,
  );
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('catching up from photos: groups by time, joins a logged stop, asks where for the rest', async () => {
  const page = await openApp(browser, origin, {
    state: { trip: ['kyoto'], saved: ['kyoto-kiyomizu'], startDate: '2027-07-10' },
    hash: '#/trip',
  });
  await page.clock.install({ time: new Date('2027-07-14T20:00:00') });
  await page.evaluate(() =>
    localStorage.setItem(
      'roam-trip-log',
      JSON.stringify({
        v: 1,
        stops: [
          { uid: 'a1', date: '2027-07-12', in: '09:20', out: '10:30', place: 'kyoto-kiyomizu' },
        ],
      }),
    ),
  );
  await page.goto(origin + '/#/log');
  await page.waitForTimeout(400);
  const tap = async (sel) => {
    await page.$eval(sel, (el) => el.click());
    await page.waitForTimeout(150);
  };
  await tap('[data-action="tl-c-start"]');
  const shots = ['kyoto-0930.jpg', 'kyoto-0942.jpg', 'kyoto-1410.jpg'].map((n) =>
    path.join(root, 'tests/fixtures', n),
  );
  await page.setInputFiles('.tl-catchpick input', shots);
  await page.waitForSelector('.lg-group');
  assert.equal(await page.locator('.lg-group').count(), 2, 'photos did not fall into two places');
  assert.match(await page.innerText('.lg-group:nth-of-type(2)'), /Kiyomizu[\s\S]*join it/);
  assert.equal(await page.locator('[data-action="tl-c-commit"]').isDisabled(), true);
  await tap('.btn[data-action="tl-c-where"]');
  await page.fill('.tl-search', 'fushimi');
  await tap('#tl-pick [data-action="tl-choose"]');
  await tap('[data-action="tl-c-commit"]');
  const day = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('roam-trip-log')).stops.map((s) => [
      s.place,
      s.in,
      s.out,
      s.photos.length,
    ]),
  );
  assert.deepEqual(day, [
    ['kyoto-kiyomizu', '09:20', '10:30', 2],
    ['kyoto-fushimi', '13:55', '14:40', 1],
  ]);
  assert.equal(await page.locator('.tl-list li').count(), 2);
  await tap('.toast button');
  assert.equal(await page.locator('.tl-list li').count(), 1, 'undo did not take the catch-up back');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('your log becomes a story only you can see, with your photos and typed text as text', async () => {
  const page = await openApp(browser, origin, { state: { trip: ['kyoto'] }, hash: '#/trip' });
  await page.evaluate(
    (h) =>
      localStorage.setItem(
        'roam-trip-log',
        JSON.stringify({
          v: 1,
          stops: [
            { uid: 'a1', date: '2027-07-12', in: '09:20', out: '10:30', place: 'kyoto-kiyomizu' },
            {
              uid: 'a2',
              date: '2027-07-12',
              in: '11:00',
              out: '12:00',
              name: h,
              city: 'kyoto',
              lat: 35,
              lon: 135.77,
              note: h,
            },
            { uid: 'a3', date: '2027-07-13', in: '10:00', out: '11:30', place: 'kyoto-fushimi' },
          ],
        }),
      ),
    HOSTILE,
  );
  await go(page, '#/log/2027-07-12');
  await page.$eval('.tl-list li:first-child [data-action="tl-fix"]', (el) => el.click());
  await page.waitForTimeout(200);
  await page.setInputFiles(
    '.tl-modal .tl-addphoto input',
    path.join(root, 'tests/fixtures/kyoto-0930.jpg'),
  );
  await page.waitForFunction(() =>
    /photo added/.test(document.querySelector('.toast')?.innerText || ''),
  );
  await page.$eval('.tl-storydoor', (el) => el.click());
  await page.waitForSelector('#story-timeline');
  await page.waitForTimeout(300);
  assert.match(await page.innerText('.story-hero h1'), /Kyoto/);
  assert.equal(await page.locator('.st-day').count(), 2, 'not one day per logged date');
  assert.match(await page.innerText('.st-lock'), /Only you can see this/);
  assert.equal(
    await page.locator('.st-facts a[href$="/edit"]').count(),
    0,
    'a local story offers the shared editor',
  );
  assert.ok(
    await page.$$eval('#story-timeline img', (l) => l.some((i) => i.src.startsWith('blob:'))),
    'your photo is not in the story',
  );
  assert.deepEqual(await injected(page), clean, 'typed text ran as code in the story');
  await go(page, '#/story/my-trip/edit');
  assert.equal(
    await page.locator('.ed-banner, body.st-editing').count(),
    0,
    'the edit route opened the editor',
  );
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('with no signal the app still opens, and the log and the trip’s cities still work', async () => {
  const page = await openApp(browser, origin, {
    state: { trip: ['kyoto'] },
    hash: '#/log',
    sw: true,
  });
  await page.evaluate(() => navigator.serviceWorker.ready);
  // The first visit installs the helper; from the next one it answers, and gets the trip ready.
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await page.waitForSelector('.tl-ready', { timeout: 15000 });
  await page.context().setOffline(true);
  await page.reload();
  await page.waitForSelector('[data-action="tl-else"], [data-action="tl-here"]');
  await page.$eval('[data-action="tl-else"]', (el) => el.click());
  await page.waitForTimeout(200);
  await page.$eval('#tl-pick [data-action="tl-choose"]', (el) => el.click());
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.tl-list li').count(), 1, 'could not log with no signal');
  await go(page, '#/city/kyoto');
  await page.waitForSelector('.citypage, .city-page, h1');
  assert.doesNotMatch(
    await page.innerText('#app'),
    /didn’t load/,
    'the trip city did not open offline',
  );
  assert.deepEqual(page.errors, []);
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

// The ripple has to be plain to see: on the story, on its stops and on the map.
test('the ripple shows where a story led, and saving from a friend says so', async () => {
  const page = await openApp(browser, origin, { hash: '#/story/japan-sample' });
  assert.equal(await page.locator('.st-ripples .st-rip-card').count(), 4, 'ripple strip missing');
  assert.equal(await page.locator('.st-stop.has-rip').count(), 4, 'ripple missing on stops');
  assert.ok((await page.locator('.st-pin.rip[data-pin]').count()) >= 4, 'no ring on the map');
  await page.$eval('.st-rip-card.went', (el) => el.click());
  await page.waitForTimeout(200);
  // A place two friends went to opens as one ripple: the spread, then each visit as a post.
  assert.equal(await page.locator('.st-sheet .st-spread').count(), 1, 'the ripple did not open');
  assert.equal(await page.locator('.st-sheet .st-spread-face').count(), 2, 'faces missing');
  assert.equal(await page.locator('.st-sheet .st-rip-post.went').count(), 2, 'visits missing');
  assert.match(await page.locator('.st-sheet').textContent(), /through Maya’s photos/);
  // From the stop, the ripple is one tap away too.
  await page.$eval('.st-sheet [data-action="story-stop"]', (el) => el.click());
  await page.waitForTimeout(200);
  assert.equal(
    await page.locator('.st-sheet .st-sheet-pair').count(),
    2,
    'no then-and-later photos',
  );
  assert.equal(await page.locator('.st-sheet [data-action="story-ripple"]').count(), 1);
  await page.context().close();
  // A viewer saving a place from someone else's story is told the travellers will see it.
  const viewer = await openApp(browser, origin, { hash: '#/story/istanbul-sample' });
  assert.equal(await viewer.locator('.ed-open').count(), 0, 'a viewer was offered the editor');
  await viewer.$eval('[data-action="story-want"]', (el) => el.click());
  await viewer.waitForTimeout(150);
  assert.match(await viewer.locator('.toast').textContent(), /story sent you here/);
  assert.deepEqual(viewer.errors, []);
  await viewer.context().close();
});

test('double-tapping a stop photo loves the stop; one tap still opens the photo', async () => {
  const page = await openApp(browser, origin, { hash: '#/story/japan-sample' });
  await page.evaluate(() => storyStop(0));
  const loves = () => page.locator('.st-sheet [data-action="story-love"] span').textContent();
  const before = Number(await loves());
  const photo = page.locator('.st-sheet [data-action="story-photo"]').first();
  await photo.dblclick();
  await page.waitForTimeout(450);
  assert.equal(Number(await loves()), before + 1, 'the double tap did not love the stop');
  assert.equal(await page.locator('.viewer').count(), 0, 'a double tap opened the photo');
  await photo.dblclick();
  await page.waitForTimeout(450);
  assert.equal(Number(await loves()), before + 1, 'a second double tap took the love back');
  await photo.click();
  await page.waitForTimeout(450);
  assert.equal(await page.locator('.viewer').count(), 1, 'one tap did not open the photo');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('editing a story in place: reorder, hide, remove, add, undo, and typed text stays text', async () => {
  const page = await openApp(browser, origin, { hash: '#/story/japan-sample/edit' });
  const tap = async (sel) => {
    await page.$eval(sel, (el) => el.click());
    await page.waitForTimeout(150);
  };
  const names = () => page.$$eval('.st-stop h4', (els) => els.map((e) => e.textContent.trim()));
  const pins = () => page.locator('.st-pin[data-pin]').count();
  const changes = async () =>
    Number((await page.locator('.ed-count strong').textContent()).split(' ')[0]);
  assert.equal(await page.locator('.ed-bar').count(), 1, 'no edit bar');
  const start = await names(),
    startPins = await pins(),
    seeded = await changes();
  // Move the second stop earlier: the two swap, and the map redraws with the same pins.
  await tap('#st-stop-1 [data-action="ed-move"][data-dir="-1"]');
  const moved = await names();
  assert.deepEqual([moved[0], moved[1]], [start[1], start[0]], 'the stop did not move');
  assert.equal(await pins(), startPins, 'the map lost or kept extra pins');
  // Hide a photo, remove a stop, add a place.
  await tap('.ed-photo [data-action="ed-hide"]');
  assert.equal(await page.locator('.ed-photo.hid').count(), 1, 'the photo was not hidden');
  await tap('#st-stop-2 .ed-tools [data-action="ed-remove"]');
  assert.equal((await names()).length, start.length - 1, 'the stop was not removed');
  assert.equal(await pins(), startPins - 1, 'the removed stop is still on the map');
  await tap('[data-action="ed-add"][data-day="0"]');
  await tap('[data-action="ed-add-pick"]');
  assert.equal((await names()).length, start.length, 'the place was not added');
  assert.equal(await changes(), seeded + 4);
  // Typed text in the stop sheet, the title and a new place name is only ever text.
  await tap('#st-stop-0 [data-action="ed-stop"]');
  await page.fill('.ed-form textarea', HOSTILE);
  await page.fill('.ed-form input[name="cap0"]', HOSTILE);
  await tap('.ed-form .btn');
  await tap('[data-action="ed-title"]');
  await page.fill('.ed-form input[name="title"]', HOSTILE.slice(0, 60));
  await page.fill('.ed-form input[name="blurb"]', HOSTILE.slice(0, 120));
  await tap('.ed-form .btn');
  await tap('[data-action="ed-add"][data-day="1"]');
  await page.fill('#ed-newplace', HOSTILE.slice(0, 60));
  await tap('.ed-form[data-kind="add"] .btn');
  assert.deepEqual(await injected(page), clean, 'typed text ran as code in the editor');
  await tap('[data-action="ed-stop"]');
  assert.deepEqual(await injected(page), clean, 'typed text ran as code in the stop sheet');
  await tap('[data-action="close-modal"]');
  // Undo from the list of changes, including one someone else made.
  await tap('[data-action="ed-changes"]');
  const before = await page.locator('.ed-changes li.undone').count();
  await tap('.ed-changes li:last-child [data-action="ed-undo-one"]');
  assert.equal(await page.locator('.ed-changes li.undone').count(), before + 1, 'undo failed');
  await tap('[data-action="close-modal"]');
  // Undo every change: the stops are back as they were.
  for (let i = 0; i < 20 && !(await page.locator('[data-action="ed-undo"]').isDisabled()); i++)
    await tap('[data-action="ed-undo"]');
  assert.deepEqual(await names(), start, 'undoing everything did not restore the story');
  assert.equal(await pins(), startPins);
  await tap('[data-action="ed-done"]');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.ed-bar').count(), 0, 'the edit bar stayed after Done');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('an after-trip poll marks the group’s pick on the story, and a where-next poll can be sent', async () => {
  const page = await openApp(browser, origin, { hash: '#/feed' });
  await page.locator('[data-need="pick-best-view"] [data-k="0"]').click();
  await go(page, '#/story/japan-sample');
  const picks = await page.locator('.soc-grouppick').allTextContents();
  assert.ok(
    picks.some((t) => /best view/.test(t)),
    'no best view pick on the story',
  );
  assert.ok(
    picks.some((t) => /best meal/.test(t)),
    'no best meal pick on the story',
  );
  await go(page, '#/feed');
  await page.locator('[data-action="soc-dream"]').click();
  await page.locator('[data-action="soc-dream-go"]').click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#soc-mypolls .soc-result').count(), 3, 'poll results missing');
  // Look backs come one at a time.
  assert.equal(await page.locator('.soc-look').count(), 1);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('city details load on demand: none on the home page, then the place sheet has its full text', async () => {
  const page = await openApp(browser, origin);
  const files = [];
  page.on('request', (r) => r.url().includes('/city/') && files.push(r.url()));
  await page.waitForTimeout(300);
  assert.equal(files.length, 0, 'home page fetched city files');
  await page.locator('.vibecard').first().click();
  await page.waitForSelector('.modal [data-place]');
  assert.equal(files.length, 1);
  assert.ok((await page.locator('.modal').innerText()).length > 300, 'place sheet looks empty');
  await go(page, '#/city/lisbon?tab=practical');
  await page.waitForSelector('.cityhero');
  assert.ok(files.some((u) => u.includes('/city/lisbon.')));
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('a slow city shows its real header and grey placeholders, then the full page', async () => {
  const page = await openApp(browser, origin);
  let release;
  const held = new Promise((r) => (release = r));
  await page.route(/\/city\/lisbon\./, async (r) => {
    await held;
    await r.continue();
  });
  await page.evaluate(() => (location.hash = '#/city/lisbon'));
  await page.waitForSelector('.skel-page');
  assert.match(await page.locator('.skel-page h1').innerText(), /Lisbon/);
  assert.equal(await page.locator('.skel-page').getAttribute('aria-busy'), 'true');
  release();
  await page.waitForSelector('.citytabs');
  assert.equal(await page.locator('.skel-page').count(), 0);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('a stop keeps love, want to go and comment in reach while its page scrolls', async () => {
  const page = await openApp(browser, origin, { hash: '#/story/japan-sample' });
  await page.setViewportSize({ width: 390, height: 700 });
  await page.evaluate(() => storyStop(0));
  const foot = page.locator('.st-sheet-foot');
  await page.evaluate(() => {
    const s = document.querySelector('.st-sheet-scroll');
    s.scrollTop = s.scrollHeight;
  });
  const box = await foot.boundingBox();
  assert.ok(box && box.y + box.height <= 700 + 1, 'the action bar scrolled away');
  await foot.locator('[data-action="story-want"]').click();
  assert.equal(
    await page.locator('.st-sheet-foot [data-action="story-want"]').getAttribute('aria-pressed'),
    'true',
  );
  await page.evaluate(() => (document.querySelector('.st-sheet-scroll').scrollTop = 0));
  await page.locator('.st-sheet-foot .st-talk').click();
  await page.waitForTimeout(200);
  const talk = await page.locator('#st-sheet-talk').boundingBox();
  assert.ok(talk && talk.y < box.y, 'Comment did not bring the comments into view');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('friends with something new wear a ring in the feed, and opening their profile clears it', async () => {
  const page = await openApp(browser, origin, { hash: '#/feed' });
  const ringed = () =>
    page
      .locator('.soc-strip .soc-friend.new')
      .evaluateAll((a) => a.map((x) => x.getAttribute('href')));
  const before = await ringed();
  assert.ok(before.length > 1, 'too few rings to test');
  await page.context().close();
  // A fresh visit that opens one friend's profile before the feed: only that ring clears.
  const again = await openApp(browser, origin, { hash: before[0] });
  await again.waitForSelector('.soc-page, .soc-profile, h1');
  await go(again, '#/feed');
  const after = await again
    .locator('.soc-strip .soc-friend.new')
    .evaluateAll((a) => a.map((x) => x.getAttribute('href')));
  assert.ok(!after.includes(before[0]), 'the ring stayed after opening the profile');
  assert.ok(after.includes(before[1]), 'other friends lost their ring too');
  assert.deepEqual(again.errors, []);
  await again.context().close();
});

test('on a phone a story stop peeks at half height, then grows when scrolled', async () => {
  const page = await openApp(browser, origin, { hash: '#/story/japan-sample' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => storyStop(1));
  const sheet = page.locator('.st-sheet');
  assert.match(await sheet.getAttribute('class'), /\bpeek\b/);
  const top = async () => (await page.locator('.st-sheet-panel').boundingBox()).y;
  assert.ok((await top()) > 300, 'the peeking sheet covers the whole screen');
  assert.ok(
    await page.locator('.st-sheet h2').isVisible(),
    'the stop name is hidden while peeking',
  );
  await page.evaluate(() => (document.querySelector('.st-sheet-scroll').scrollTop = 40));
  await page.waitForTimeout(100);
  assert.doesNotMatch(await sheet.getAttribute('class'), /\bpeek\b/);
  assert.ok((await top()) < 100, 'the sheet did not grow');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('photo credits name the title, author, source, licence and our changes; MICHELIN is plain words', async () => {
  const page = await openApp(browser, origin);
  await go(page, '#/city/kyoto?tab=sources');
  await page.waitForSelector('#photo-credits');
  const credits = await page.locator('#photo-credits + p + .source-list').innerText();
  assert.match(credits, /“[^”]+” by .+ · Wikimedia Commons · CC BY/);
  assert.match(credits, /colours adjusted/);
  // Ported licences link to their own country version.
  const ported = await page.evaluate(() => licenceUrl('CC BY-SA 3.0 de'));
  assert.equal(ported, 'https://creativecommons.org/licenses/by-sa/3.0/de/');
  await go(page, '#/city/tokyo?tab=food');
  await page.evaluate(() => openPlace('tokyo-kanda'));
  await page.waitForSelector('.modal .recognition');
  const sheet = await page.locator('.modal').innerText();
  assert.match(sheet, /\d MICHELIN Stars?/);
  assert.doesNotMatch(sheet, /✦|MICHELIN pick|MICHELIN price band/);
  assert.match(sheet, /not affiliated with or endorsed by Michelin/);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('a place’s own-language name shows under its English one and can be searched', async () => {
  const page = await openApp(browser, origin, { hash: '#/city/kyoto' });
  const hero = page.locator('.cityherotext .local-name');
  assert.equal(await hero.getAttribute('lang'), 'ja');
  assert.equal(await hero.innerText(), '京都市');
  await go(page, '#/');
  await page.fill('#browse-search', '伏見稲荷');
  const hit = page.locator('#search-suggest button').first();
  assert.match(await hit.innerText(), /Fushimi Inari/);
  await hit.evaluate((b) => b.click());
  assert.match(await page.locator('.placesheet .local-name').innerText(), /伏見稲荷/);
  await page.close();
});

test('logging: the whole map finds any place, and a guide place found there stays the guide place', async () => {
  const page = await openApp(browser, origin, { state: { trip: ['kyoto'] }, hash: '#/log' });
  const asked = [];
  await page.context().route('https://nominatim.openstreetmap.org/**', (r) => {
    asked.push(new URL(r.request().url()));
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        {
          osm_type: 'way',
          osm_id: 1,
          lat: '34.9677',
          lon: '135.7792',
          name: 'Fushimi Inari-taisha',
          display_name: 'Fushimi Inari-taisha, Fushimi, Kyoto, Japan',
          namedetails: { name: '伏見稲荷大社', 'name:en': 'Fushimi Inari-taisha' },
          extratags: { wikidata: 'Q714828' },
        },
        {
          osm_type: 'node',
          osm_id: 42,
          lat: '35.0031',
          lon: '135.7681',
          name: 'Kissa Hostile',
          display_name: `${HOSTILE}, Nakagyo, Kyoto, Japan`,
          namedetails: { name: '喫茶 ' + HOSTILE.slice(0, 20), 'name:en': HOSTILE },
          extratags: {},
        },
      ]),
    });
  });
  const tap = async (sel) => {
    await page.$eval(sel, (el) => el.click());
    await page.waitForTimeout(200);
  };
  await tap('[data-action="tl-else"]');
  await page.fill('.tl-search', 'inari');
  await tap('[data-action="tl-world"]');
  assert.equal(asked.length, 1, 'the map was not searched');
  const q = asked[0].searchParams;
  assert.equal(q.get('q'), 'inari');
  assert.ok(q.get('viewbox') && !q.has('lat'), 'the search should be bounded by the city only');
  const items = await page.$$eval('#tl-world-list li', (l) => l.map((x) => x.innerText));
  assert.match(
    items[0],
    /Fushimi Inari Taisha[\s\S]*In the guide/,
    'the guide place was not matched',
  );
  // Choosing the guide place logs the guide place itself, not a copy.
  await tap('#tl-world-list li:first-child button');
  let log = await page.evaluate(() => JSON.parse(localStorage.getItem('roam-trip-log')));
  assert.equal(log.stops[0].place, 'kyoto-fushimi');
  // A place only the map knows keeps its map id and local name; its text stays text.
  await tap('[data-action="tl-else"]');
  await page.fill('.tl-search', 'kissa');
  await page.waitForTimeout(1200);
  await tap('[data-action="tl-world"]');
  await tap('#tl-world-list li:nth-child(2) button');
  log = await page.evaluate(() => JSON.parse(localStorage.getItem('roam-trip-log')));
  const own = log.stops.find((s) => !s.place);
  assert.equal(own?.osm, 'node/42');
  assert.ok(own.local.startsWith('喫茶'));
  // Typing the name of a guide place by hand also logs the guide place.
  await tap('[data-action="tl-else"]');
  await page.fill('#tl-newplace', 'nijo castle');
  await tap('.tl-add .btn');
  log = await page.evaluate(() => JSON.parse(localStorage.getItem('roam-trip-log')));
  assert.ok(
    log.stops.some((s) => s.place === 'kyoto-nijo'),
    'a typed guide name made a copy',
  );
  await go(page, '#/story/my-trip');
  await page.waitForTimeout(400);
  assert.deepEqual(await injected(page), clean, 'map text ran as code');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('the page refuses code it did not ship, and photos that fail still leave the gallery', async () => {
  const page = await openApp(browser, origin, { hash: '#/city/kyoto' });
  const csp = await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content');
  assert.match(csp, /script-src 'self' 'sha256-/);
  await page.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend', '<img src="x:y" onerror="window.__ran = 1">');
  });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__ran), undefined, 'an inline handler ran');
  assert.ok(
    page.errors.some((e) => /Content Security Policy/i.test(e)),
    'no refusal was seen',
  );
  page.errors.length = 0;
  // Commons photos cannot load in tests, so every one must drop out, not sit there broken.
  await page.evaluate(() => openPlace('kyoto-fushimi'));
  await page.waitForTimeout(1200);
  const broken = await page.$$eval('img[data-drop]', (l) => l.filter((i) => i.complete).length);
  assert.equal(broken, 0, 'failed Commons photos were left in the page');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('a one-day log reads as one day: no range, no plural, no day switcher, own orange', async () => {
  const page = await openApp(browser, origin, { state: { trip: ['kyoto'] }, hash: '#/trip' });
  await page.clock.install({ time: new Date('2027-07-12T12:00:00') });
  await page.evaluate(() =>
    localStorage.setItem(
      'roam-trip-log',
      JSON.stringify({
        v: 1,
        stops: [
          { uid: 'a1', date: '2027-07-12', in: '09:20', out: '10:30', place: 'kyoto-kiyomizu' },
        ],
      }),
    ),
  );
  await go(page, '#/log');
  assert.equal(await page.locator('#tl-days').isHidden(), true, 'one day still shows a switcher');
  assert.equal(
    await page.getByText('Times marked "about"').count(),
    0,
    'the "about" note shows with nothing marked',
  );
  await go(page, '#/story/my-trip');
  await page.waitForSelector('.st-facts');
  const facts = await page.innerText('.st-facts');
  assert.match(facts, /1\s+day\b/);
  assert.match(facts, /1\s+place\b/);
  assert.doesNotMatch(facts, /km between/, 'zero km is shown');
  assert.doesNotMatch(
    await page.innerText('.story-hero p'),
    / to /,
    'a single day shows as a range',
  );
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('the trip bar shows only where you pick places, and a failed photo shows no file name', async () => {
  const page = await openApp(browser, origin, {
    state: { trip: ['kyoto'], saved: ['kyoto-kiyomizu'] },
    hash: '#/city/kyoto',
  });
  await page.waitForTimeout(400);
  assert.equal(await page.locator('#minicart').isVisible(), true, 'no trip bar on a city');
  for (const h of ['#/feed', '#/account', '#/map']) {
    await go(page, h);
    assert.equal(await page.locator('#minicart').isVisible(), false, `trip bar covers ${h}`);
  }
  await go(page, '#/story/japan-sample');
  await page.waitForTimeout(600);
  // Photo hosts are blocked in tests, so every guide photo here has failed.
  const shown = await page.$$eval(
    'img.photo',
    (l) => l.filter((i) => getComputedStyle(i).fontSize !== '0px').length,
  );
  assert.equal(shown, 0, 'a photo that failed still shows its file name');
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('on a short phone, "I\'m here" and both alternatives sit above the tab bar', async () => {
  const page = await openApp(browser, origin, {
    viewport: { width: 375, height: 667 },
    state: { trip: ['kyoto'], saved: ['kyoto-kiyomizu'] },
    hash: '#/log',
  });
  await page.waitForSelector('[data-action="tl-locate"]');
  const navTop = await page
    .$eval('nav.nav', (n) => n.getBoundingClientRect().top)
    .catch(() => null);
  const bottom = await page.$eval(
    '[data-action="tl-locate"]',
    (b) => b.getBoundingClientRect().bottom,
  );
  assert.ok(navTop, 'no tab bar found');
  assert.ok(
    bottom <= navTop,
    `"Use my location" ends at ${bottom}, under the tab bar at ${navTop}`,
  );
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('the world map list folds a country away, and switching city tabs keeps your place', async () => {
  const page = await openApp(browser, origin, {
    viewport: { width: 1280, height: 800 },
    hash: '#/map',
  });
  const first = page.locator('.maplist-group').first();
  const country = await first.getAttribute('data-country');
  assert.equal(await first.evaluate((d) => d.open), true);
  await first.locator('summary').click();
  assert.equal(await first.evaluate((d) => d.open), false, 'the country did not fold');
  assert.equal(await first.locator('.maplistitem').first().isVisible(), false);
  // Folded countries stay folded when the list redraws.
  await page.evaluate(() => renderMapPins());
  assert.equal(
    await page.locator(`.maplist-group[data-country="${country}"]`).evaluate((d) => d.open),
    false,
  );
  await page.$eval('[data-action="map-fold-all"]', (b) => b.click());
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.maplist-group[open]').count(), 0, 'fold all left some open');
  assert.match(await page.innerText('[data-action="map-fold-all"]'), /Open all/);
  // City page on a phone: scrolled into the list, a new tab starts just under the tabs.
  await page.setViewportSize(PHONE);
  await go(page, '#/city/kyoto');
  const tabsTop = () => page.$eval('.citytabs', (t) => Math.round(t.getBoundingClientRect().top));
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.6));
  await page.waitForTimeout(100);
  const stuck = await tabsTop();
  await page.$eval('.citytabs [data-tab="food"]', (b) => b.click());
  await page.waitForTimeout(500);
  assert.ok((await page.evaluate(() => scrollY)) > 200, 'switching tabs jumped to the top');
  assert.equal(await tabsTop(), stuck, 'the tabs moved after switching');
  // Near the top, the page stays exactly where it was.
  await page.evaluate(() => window.scrollTo(0, 120));
  await page.waitForTimeout(100);
  await page.$eval('.citytabs [data-tab="places"]', (b) => b.click());
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => scrollY), 120);
  assert.deepEqual(page.errors, []);
  await page.context().close();
});

test('home stays light and keeps your place: capped rows, tabs and Back return where you were', async () => {
  const page = await openApp(browser, origin);
  await page.waitForTimeout(300);
  // Rows stop at a dozen cards and end on a See all card, so the home page stays small.
  assert.ok((await page.locator('.home .citycard').count()) < 120, 'home draws too many cards');
  assert.ok((await page.locator('.seeall-card').count()) > 0);
  await page.evaluate(() => {
    document.querySelectorAll('.hrow')[1].scrollLeft = 300;
    scrollTo(0, 1500);
  });
  await page.locator('.nav a[data-nav="saved"]').click();
  await page.waitForTimeout(300);
  await page.locator('.nav a[data-nav="explore"]').click();
  await page.waitForTimeout(400);
  const y = await page.evaluate(() => scrollY);
  assert.ok(Math.abs(y - 1500) < 60, `came back at ${y}, not near 1500`);
  assert.ok((await page.evaluate(() => document.querySelectorAll('.hrow')[1].scrollLeft)) > 200);
  // Tapping the tab you are on goes to the top.
  await page.locator('.nav a[data-nav="explore"]').click();
  await page.waitForFunction(() => scrollY === 0);
  // See all opens the region's grid, which draws more cards as you scroll.
  await page.locator('.seeall-card').first().click();
  const first = await page.locator('.citygrid .citycard').count();
  assert.ok(first <= 48, `grid drew ${first} cards at once`);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForFunction(
    (n) => document.querySelectorAll('.citygrid .citycard').length > n,
    first,
  );
  assert.deepEqual(page.errors, []);
  await page.context().close();
});
