// Refreshes the popularity signals stored under place.signals in data/cities/*.json.
//
//   node scripts/refresh-signals.mjs                 # Wikipedia readership (no key needed)
//   GOOGLE_MAPS_API_KEY=... node scripts/refresh-signals.mjs   # also Google Maps reviews
//   node scripts/refresh-signals.mjs --city tokyo    # one city only
//
// Wikipedia: total page views over the last 12 complete months, for sights only
// (a restaurant's "wiki" title is often a dish, not the venue). The title is
// resolved through redirects and must have coordinates within MAX_KM of the
// place, so a page about something else never counts.
//
// Google: Places API (New) Text Search near the place, keeping the rating and
// review count of the best match within MAX_KM.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const citiesDir = path.join(root, 'data/cities');
const UA = 'TandemRoads/2.0 (https://github.com/mindfulmod/roam)';
const MAX_KM = 3;
const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY;
const onlyCity = process.argv.includes('--city')
  ? process.argv[process.argv.indexOf('--city') + 1]
  : null;
const today = new Date().toISOString().slice(0, 10);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function km(a, b) {
  const R = 6371,
    rad = Math.PI / 180,
    dLat = (b.lat - a.lat) * rad,
    dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// Wikimedia rate-limits bursts, so space out calls and back off on 429,
// honouring Retry-After when it is sent.
const GAP_MS = 250;
let lastCall = 0;
async function getJson(url, init = {}, tries = 6) {
  for (let i = 1; ; i++) {
    const wait = lastCall + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    const res = await fetch(url, {
      ...init,
      headers: { 'User-Agent': UA, ...(init.headers || {}) },
    });
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    if (i >= tries || (res.status < 500 && res.status !== 429))
      throw new Error(`${res.status} ${url}`);
    const retryAfter = Number(res.headers.get('retry-after'));
    await sleep(retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** i);
  }
}

// Last 12 complete months, as YYYYMMDD bounds for the pageviews API.
function lastYear() {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1));
  const f = (d) => d.toISOString().slice(0, 10).replaceAll('-', '');
  return [f(start), f(end)];
}
const [START, END] = lastYear();

// Resolve titles in batches of 50: follow redirects, drop missing pages and
// disambiguation pages, and keep coordinates for the distance check.
async function resolveTitles(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const q = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      redirects: '1',
      prop: 'coordinates|pageprops',
      ppprop: 'disambiguation',
      titles: batch.join('|'),
    });
    const j = await getJson('https://en.wikipedia.org/w/api.php?' + q);
    const norm = new Map();
    for (const n of j.query.normalized || []) norm.set(n.from, n.to);
    const redir = new Map();
    for (const r of j.query.redirects || []) redir.set(r.from, r.to);
    const pages = new Map((j.query.pages || []).map((p) => [p.title, p]));
    for (const t of batch) {
      const n = norm.get(t) || t;
      const page = pages.get(redir.get(n) || n);
      if (!page || page.missing || page.pageprops?.disambiguation !== undefined) continue;
      const c = page.coordinates?.[0];
      out.set(t, { title: page.title, coords: c ? { lat: c.lat, lon: c.lon } : null });
    }
  }
  return out;
}

async function wikipediaViews(title) {
  const t = encodeURIComponent(title.replaceAll(' ', '_'));
  const j = await getJson(
    `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${t}/monthly/${START}/${END}`,
  );
  return j ? j.items.reduce((s, x) => s + x.views, 0) : null;
}

async function googlePlace(p, city) {
  const j = await getJson('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_KEY,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.googleMapsUri',
    },
    body: JSON.stringify({
      textQuery: `${p.name}, ${city.name}`,
      maxResultCount: 3,
      locationBias: { circle: { center: { latitude: p.lat, longitude: p.lon }, radius: 2000 } },
    }),
  });
  const best = (j?.places || [])
    .map((x) => ({ ...x, d: km(p, { lat: x.location.latitude, lon: x.location.longitude }) }))
    .filter((x) => x.d <= MAX_KM && x.userRatingCount > 0)
    .sort((a, b) => a.d - b.d)[0];
  return best
    ? {
        placeId: best.id,
        rating: best.rating,
        count: best.userRatingCount,
        url: best.googleMapsUri,
        checked: today,
      }
    : null;
}

const files = (await readdir(citiesDir)).filter(
  (f) => f.endsWith('.json') && (!onlyCity || f === onlyCity + '.json'),
);
const tally = { wikipedia: 0, google: 0, skipped: 0 };
for (const file of files) {
  const fp = path.join(citiesDir, file);
  const city = JSON.parse(await readFile(fp, 'utf8'));
  const sights = city.items.filter((p) => p.kind === 'see' && p.wiki);
  const resolved = await resolveTitles([...new Set(sights.map((p) => p.wiki))]).catch((e) => {
    console.warn(
      `${city.name}: title lookup failed, keeping previous Wikipedia data (${e.message})`,
    );
    return null;
  });
  for (const p of city.items) {
    p.signals ||= {};
    if (p.kind === 'see' && p.wiki && resolved) {
      const r = resolved.get(p.wiki);
      if (r && (!r.coords || km(p, r.coords) <= MAX_KM || p.pinApproximate)) {
        // One failed lookup keeps the previous value instead of aborting the run.
        const views = await wikipediaViews(r.title).catch((e) => {
          console.warn(`wikipedia ${p.id}: ${e.message}`);
          return undefined;
        });
        if (views) {
          p.signals.wikipedia = {
            views,
            period: `${START.slice(0, 6)}-${END.slice(0, 6)}`,
            title: r.title,
            url:
              'https://en.wikipedia.org/wiki/' + encodeURIComponent(r.title.replaceAll(' ', '_')),
            checked: today,
          };
          tally.wikipedia++;
        }
      } else {
        delete p.signals.wikipedia;
        tally.skipped++;
      }
    }
    if (GOOGLE_KEY) {
      try {
        const g = await googlePlace(p, city);
        if (g) {
          p.signals.google = g;
          tally.google++;
        }
      } catch (e) {
        console.warn(`google ${p.id}: ${e.message}`);
      }
    }
    if (!Object.keys(p.signals).length) delete p.signals;
  }
  await writeFile(fp, JSON.stringify(city, null, 2) + '\n');
  console.log(`${city.name}: done`);
}
console.log(
  `Wikipedia: ${tally.wikipedia} places, skipped ${tally.skipped} (no matching article). Google: ${GOOGLE_KEY ? tally.google + ' places' : 'no key, skipped'}.`,
);
