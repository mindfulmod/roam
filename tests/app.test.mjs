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
  '#/story/japan-sample/log',
  '#/story/japan-sample/log/catchup',
  '#/story/japan-sample/log/edit',
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
