// Rebuilds data/gallery.json: 3-5 extra photos per city and place, so people can
// see what a place looks like before they go (the way they would flick through
// photos on a map app).
//
//   node scripts/refresh-gallery.mjs                # every city and place
//   node scripts/refresh-gallery.mjs --city kyoto   # one city only (merged into the file)
//
// Source: the photos used in each item's English Wikipedia article (its "wiki"
// title), hosted on Wikimedia Commons. Only freely licensed JPEG photographs
// are kept (CC BY, CC BY-SA, CC0, public domain), with the author and licence
// stored for the on-photo credit. Maps, logos, diagrams, artworks and small or
// oddly shaped images are skipped, as is the item's main photo.
//
// The article must be about the place: it is resolved through redirects,
// disambiguation pages are dropped, and when the article has coordinates they
// must lie within MAX_KM of the place (MAX_CITY_KM for cities). Food and
// shopping items need an article with coordinates, and food items are skipped
// when their main photo is "representative" or their article is shared with
// other items, because that article is about a dish or craft, not the venue.
//
// Images are not downloaded: the app hotlinks Commons thumbnails (500px and
// 960px) and loads them only when someone opens a place, so the repo and the
// single-file build stay small. Galleries therefore need an internet connection.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'TandemRoads/2.0 (https://github.com/mindfulmod/roam)';
const MAX_KM = 15;
const MAX_BIG_KM = 100;
const MAX_CITY_KM = 60;
const PER_ITEM = 5;
const onlyCity = process.argv.includes('--city')
  ? process.argv[process.argv.indexOf('--city') + 1]
  : null;

const BAD =
  /(map|logo|flag|icon|plan|diagram|coat[_ ]of[_ ]arms|seal|locator|location|symbol|emblem|banner|signature|chart|graph|portrait|bust|ukiyo|painting|drawing|engraving|stamp|coin|banknote|poster)/i;
// Old archive shots and photos of people (visits, portraits) don't show what a visitor will see.
const OLD = /\b(1[0-8]\d\d|19[0-8]\d)\b/;
const PEOPLE =
  /\b(President|King|Queen|Emperor|Prince|Princess|Obama|Bourdain|Minister|visit(s|ed)? by|meets|with his|with her)\b/i;
const ARCHIVE = /\(PV\d+|Musée Guimet|museum collection/i;
// Big parks and natural features have article coordinates far from any single viewpoint.
const BIG = /National Park|Conservation Area|Falls|Canyon|Valley/i;
const OK_LICENCE = /^(CC BY|CC0|Public domain|PD|Attribution)/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = async (p) => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const strip = (h) =>
  (h || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);

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
async function getJson(url, tries = 6) {
  for (let i = 1; ; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) return res.json();
    if (res.status === 404) return null;
    if (i >= tries || (res.status < 500 && res.status !== 429))
      throw new Error(`${res.status} ${url}`);
    await sleep(1500 * 2 ** i);
  }
}

// Follow redirects, drop disambiguation pages, keep coordinates.
async function resolve(title) {
  const q = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    redirects: '1',
    prop: 'coordinates|pageprops',
    ppprop: 'disambiguation',
    titles: title,
  });
  const page = (await getJson('https://en.wikipedia.org/w/api.php?' + q))?.query?.pages?.[0];
  if (!page || page.missing || page.pageprops?.disambiguation !== undefined) return null;
  const c = page.coordinates?.[0];
  return { title: page.title, coords: c ? { lat: c.lat, lon: c.lon } : null };
}

async function photosFor(item, maxKm, mainFile) {
  const page = await resolve(item.wiki);
  if (!page) return [];
  // Food and shopping titles are often a dish or craft; only trust them when the
  // article has coordinates near the venue.
  if (!page.coords && (item.kind === 'eat' || item.kind === 'shop')) return [];
  if (page.coords && km(item, page.coords) > maxKm) return [];
  const list = await getJson(
    'https://en.wikipedia.org/api/rest_v1/page/media-list/' +
      encodeURIComponent(page.title.replaceAll(' ', '_')),
  );
  const files = [];
  for (const it of list?.items || []) {
    if (it.type !== 'image' || it.showInGallery === false) continue;
    if (!/\.jpe?g$/i.test(it.title) || BAD.test(it.title)) continue;
    if (mainFile && it.title.replaceAll(' ', '_') === mainFile) continue;
    if (!files.includes(it.title)) files.push(it.title);
    if (files.length >= 12) break;
  }
  if (!files.length) return [];
  const q = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: '960',
    iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|ImageDescription|ObjectName',
    titles: files.join('|'),
  });
  const info = await getJson('https://en.wikipedia.org/w/api.php?' + q);
  const pages = new Map((info?.query?.pages || []).map((p) => [p.title, p]));
  const norm = new Map((info?.query?.normalized || []).map((n) => [n.from, n.to]));
  const out = [];
  for (const f0 of files) {
    const f = norm.get(f0) || f0;
    const ii = pages.get(f)?.imageinfo?.[0];
    if (!ii || ii.width < 900 || ii.height < 500) continue;
    const ratio = ii.width / ii.height;
    if (ratio < 0.65 || ratio > 2.3) continue;
    const m = ii.extmetadata || {};
    const licence = m.LicenseShortName?.value || '';
    if (!OK_LICENCE.test(licence)) continue;
    const name = f.replace(/^File:/, '');
    const desc = strip(m.ImageDescription?.value || m.ObjectName?.value);
    if (OLD.test(name) || ARCHIVE.test(name) || PEOPLE.test(name + ' ' + desc)) continue;
    // The two-character hash directory lets the app build any thumbnail width.
    const hash = ii.thumburl?.match(/\/commons\/thumb\/[0-9a-f]\/([0-9a-f]{2})\//)?.[1];
    if (!hash) continue;
    const author = strip(m.Artist?.value) || 'Wikimedia Commons contributor';
    // Stored compactly as [file, hash, width, height, author, licence].
    out.push([name, hash, ii.thumbwidth, ii.thumbheight, author, licence]);
    if (out.length >= PER_ITEM) break;
  }
  return out;
}

const meta = await readJson('data/meta.json');
const photos = await readJson('data/photos.json');
const cities = await Promise.all(meta.cityOrder.map((id) => readJson(`data/cities/${id}.json`)));
const cityWikis = new Set(cities.map((c) => c.wiki));
const wikiUses = new Map();
for (const c of cities)
  for (const p of c.items) wikiUses.set(p.wiki, (wikiUses.get(p.wiki) || 0) + 1);

const gallery = onlyCity ? await readJson('data/gallery.json') : {};
const mainFile = (id) => (photos[id]?.commonsTitle || '').replaceAll(' ', '_');
for (const c of cities) {
  if (onlyCity && c.id !== onlyCity) continue;
  const jobs = [[c, MAX_CITY_KM]];
  for (const p of c.items) {
    if (cityWikis.has(p.wiki)) continue;
    if (p.kind === 'eat' && (photos[p.id]?.context || wikiUses.get(p.wiki) > 1)) continue;
    jobs.push([p, BIG.test(p.wiki) ? MAX_BIG_KM : MAX_KM]);
  }
  let n = 0;
  for (const [item, maxKm] of jobs) {
    try {
      const g = await photosFor(item, maxKm, mainFile(item.id));
      if (g.length) {
        gallery[item.id] = g;
        n++;
      } else delete gallery[item.id];
    } catch (e) {
      console.warn(`${item.id}: ${e.message}`);
    }
    await sleep(300);
  }
  console.log(`${c.id}: ${n} of ${jobs.length} with photos`);
}
const sorted = Object.fromEntries(Object.entries(gallery).sort(([a], [b]) => a.localeCompare(b)));
const lines = Object.entries(sorted).map(
  ([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`,
);
await writeFile(path.join(root, 'data/gallery.json'), '{\n' + lines.join(',\n') + '\n}\n');
console.log(`Wrote data/gallery.json (${Object.keys(sorted).length} entries)`);
