// Finishes cities made by add-city.mjs with what needs the internet. Run in GitHub Actions
// (.github/workflows/enrich.yml); Wikipedia is not reachable from every dev environment.
//
//   node scripts/enrich.mjs                # every city that has "added" but no "enriched" date
//   node scripts/enrich.mjs --city lisbon,porto
//
// For each city:
//   1. Pins: a sight takes the coordinates of its Wikipedia article when that article is
//      about a place nearby; restaurants and shops are looked up in OpenStreetMap by name and
//      accepted only when the result is close to the seed pin. Anything else keeps its
//      approximate pin and is listed in the report.
//   2. Photos: each sight gets the lead photo of its article (freely licensed JPEGs only,
//      hotlinked from Wikimedia Commons with author and licence). The city cover is the lead
//      photo of "coverWiki", saved to images/photos/<city>.webp.
//   3. Popularity and galleries: runs refresh-signals.mjs and refresh-gallery.mjs for the city.
//   4. Writes seeds/reports/<date>.md with everything a person should double-check.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'TandemRoads/2.0 (https://github.com/mindfulmod/roam)';
const WIKI = 'https://en.wikipedia.org/w/api.php';
const today = new Date().toISOString().slice(0, 10);
const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
const only = arg('--city')?.split(',');
const skipRefresh = process.argv.includes('--no-refresh');

const readJson = async (p) => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const writeJson = (p, v) => writeFile(path.join(root, p), JSON.stringify(v, null, 2) + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const km = (a, b) => {
  const r = Math.PI / 180,
    h =
      Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
      Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const strip = (h) =>
  String(h || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
const last = {};
async function get(url, gap = 250, tries = 6) {
  const host = new URL(url).host;
  for (let i = 1; ; i++) {
    const wait = (last[host] || 0) + gap - Date.now();
    if (wait > 0) await sleep(wait);
    last[host] = Date.now();
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) return res;
    if (res.status === 404) return null;
    if (i >= tries || (res.status < 500 && res.status !== 429)) throw new Error(`${res.status} ${url}`);
    const ra = Number(res.headers.get('retry-after'));
    await sleep(ra > 0 ? ra * 1000 : 1500 * 2 ** i);
  }
}
const getJson = async (url, gap) => (await get(url, gap))?.json();

// Titles -> { title, coords, image } following redirects; missing and disambiguation pages are dropped.
async function resolve(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const base = { action: 'query', format: 'json', formatversion: '2', redirects: '1', titles: batch.join('|') };
    const j = await getJson(
      WIKI + '?' + new URLSearchParams({ ...base, prop: 'coordinates|pageprops|pageimages', ppprop: 'disambiguation', colimit: 'max', coprimary: 'primary', piprop: 'name', pilimit: 'max', pilicense: 'free' }),
    );
    const norm = new Map((j.query.normalized || []).map((n) => [n.from, n.to]));
    const redir = new Map((j.query.redirects || []).map((r) => [r.from, r.to]));
    const pages = new Map((j.query.pages || []).map((p) => [p.title, p]));
    for (const t of batch) {
      const n = norm.get(t) || t;
      const page = pages.get(redir.get(n) || n);
      if (!page || page.missing || page.pageprops?.disambiguation !== undefined) continue;
      const c = page.coordinates?.[0];
      out.set(t, { title: page.title, coords: c ? { lat: c.lat, lon: c.lon } : null, image: page.pageimage || null });
    }
  }
  return out;
}

const BAD = /(map|logo|flag|icon|plan|diagram|coat[_ ]of[_ ]arms|seal|locator|location|symbol|emblem|banner|signature|chart|graph|portrait|bust|painting|drawing|engraving|stamp|coin|banknote|poster|montage|collage|infobox|composite)/i;
const OLD = /\b(1[0-8]\d\d|19[0-7]\d)\b/;
const FREE = /^(CC BY|CC0|Public domain|PD|Attribution)/i;
async function imageInfo(files, width) {
  const out = new Map();
  for (let i = 0; i < files.length; i += 40) {
    const batch = files.slice(i, i + 40);
    const j = await getJson(
      WIKI +
        '?' +
        new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: String(width), iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|ImageDescription', titles: batch.map((f) => 'File:' + f).join('|') }),
    );
    const norm = new Map((j?.query?.normalized || []).map((n) => [n.to, n.from]));
    for (const p of j?.query?.pages || []) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      const m = ii.extmetadata || {};
      const row = {
        file: p.title.replace(/^File:/, ''),
        width: ii.width,
        height: ii.height,
        mime: ii.mime,
        thumb: ii.thumburl,
        url: ii.descriptionurl,
        author: strip(m.Artist?.value) || 'Wikimedia Commons contributor',
        license: strip(m.LicenseShortName?.value),
        licenseUrl: m.LicenseUrl?.value || ii.descriptionurl,
      };
      out.set((norm.get(p.title) || p.title).replace(/^File:/, ''), row);
      out.set(row.file, row);
    }
  }
  return out;
}
const usable = (r, minW, minRatio, maxRatio) =>
  r &&
  r.mime === 'image/jpeg' &&
  r.thumb &&
  FREE.test(r.license) &&
  !BAD.test(r.file) &&
  !OLD.test(r.file) &&
  r.width >= minW &&
  r.width / r.height >= minRatio &&
  r.width / r.height <= maxRatio;
const photoEntry = (r, alt, caption, data) => ({
  id: 'commons:' + r.file,
  title: r.file.replaceAll(' ', '_'),
  commonsTitle: r.file,
  alt,
  url: r.url,
  author: r.author,
  license: r.license,
  licenseUrl: r.licenseUrl,
  provider: 'Wikimedia Commons',
  context: false,
  caption,
  data,
});

async function geocode(name, city) {
  const u =
    'https://nominatim.openstreetmap.org/search?' +
    new URLSearchParams({ q: `${name}, ${city.name.split(' · ')[0]}, ${city.country}`, format: 'jsonv2', limit: '5' });
  const j = (await getJson(u, 1200).catch(() => null)) || [];
  return j.map((x) => ({ lat: +x.lat, lon: +x.lon }));
}

const meta = await readJson('data/meta.json');
const photos = await readJson('data/photos.json');
const report = [];
const done = [];
for (const id of meta.cityOrder) {
  const file = `data/cities/${id}.json`;
  const city = await readJson(file);
  if (only ? !only.includes(id) : !(city.added && !city.enriched)) continue;
  const notes = [];
  const titles = [...new Set([city.wiki, city.coverWiki, ...city.items.map((p) => p.wiki)].filter(Boolean))];
  const pages = await resolve(titles);
  const wikiUses = new Map();
  for (const p of city.items) wikiUses.set(p.wiki, (wikiUses.get(p.wiki) || 0) + 1);

  // 1. Pins
  let fixed = 0;
  for (const p of city.items) {
    if (!p.pinApproximate) continue;
    const page = pages.get(p.wiki);
    const own = page?.coords && p.wiki !== city.wiki && wikiUses.get(p.wiki) === 1;
    if (p.kind === 'see' && !page) notes.push(`${p.name}: no Wikipedia article called "${p.wiki}" (no readership number or photo)`);
    if (own) {
      const d = km(p, page.coords);
      const limit = p.kind !== 'see' ? 3 : p.excursion || p.duration >= 6 ? 80 : 10;
      if (d <= limit) {
        p.lat = +page.coords.lat.toFixed(5);
        p.lon = +page.coords.lon.toFixed(5);
        delete p.pinApproximate;
        fixed++;
        continue;
      }
      if (p.kind === 'see') notes.push(`${p.name}: the article "${page.title}" is ${Math.round(d)} km from the seed pin; pin left approximate`);
    }
    if (p.venueType === 'food-area') continue;
    const hits = await geocode(p.name, city);
    const best = hits.map((h) => ({ ...h, d: km(p, h) })).sort((a, b) => a.d - b.d)[0];
    if (best && best.d <= 2) {
      p.lat = +best.lat.toFixed(5);
      p.lon = +best.lon.toFixed(5);
      delete p.pinApproximate;
      fixed++;
    } else if (p.kind !== 'see')
      notes.push(`${p.name}: not found on OpenStreetMap near the seed pin${best ? ` (nearest match ${best.d.toFixed(1)} km away)` : ''}; check it is still open and where it is`);
  }

  // 2. Photos
  const want = new Map();
  for (const p of city.items) {
    const page = pages.get(p.wiki);
    if (photos[p.id] || !page?.image || p.wiki === city.wiki) continue;
    if (p.kind !== 'see' && !(page.coords && km(p, page.coords) <= 3)) continue;
    if (p.kind === 'see' && page.coords && km(p, page.coords) > (p.excursion || p.duration >= 6 ? 100 : 15)) continue;
    want.set(p.id, page.image);
  }
  const coverCandidates = [city.coverWiki, ...city.items.filter((p) => p.kind === 'see').sort((a, b) => a.priority - b.priority).map((p) => p.wiki), city.wiki]
    .map((t) => pages.get(t)?.image)
    .filter(Boolean);
  const info = await imageInfo([...new Set([...want.values(), ...coverCandidates])], 960);
  const taken = new Set();
  let withPhoto = 0;
  for (const p of city.items) {
    const r = info.get(want.get(p.id));
    if (!usable(r, 900, 0.65, 2.4) || taken.has(r.file)) continue;
    taken.add(r.file);
    photos[p.id] = photoEntry(r, `${p.name}, ${city.name.split(' · ')[0]}`, p.name, r.thumb);
    withPhoto++;
  }
  if (!photos[id]) {
    const r = coverCandidates.map((f) => info.get(f)).find((x) => usable(x, 1200, 1.2, 2.4));
    if (r) {
      const sharp = (await import('sharp')).default;
      const big = (await imageInfo([r.file], 1280)).get(r.file);
      const buf = Buffer.from(await (await get(big.thumb, 400)).arrayBuffer());
      const out = `images/photos/${id}.webp`;
      await sharp(buf).resize(960, 640, { fit: 'cover' }).webp({ quality: 80 }).toFile(path.join(root, out));
      photos[id] = photoEntry(r, `${city.name.split(' · ')[0]}, ${city.country}`, r.file.replace(/\.[a-z]+$/i, '').replaceAll('_', ' '), out);
    } else notes.push('No usable cover photo found; pick one with scripts/covers (requests.json, then picks.json)');
  }
  city.enriched = today;
  await writeJson(file, city);
  await writeJson('data/photos.json', photos);
  const sights = city.items.filter((p) => p.kind === 'see').length;
  report.push(
    `## ${city.name}\n\n${fixed} of ${city.items.length} pins confirmed, ${withPhoto} of ${sights} sights with a photo, cover: ${photos[id] ? photos[id].commonsTitle : 'none'}.\n` +
      (notes.length ? '\n' + notes.map((n) => `- ${n}`).join('\n') + '\n' : ''),
  );
  console.log(`${id}: ${fixed} pins, ${withPhoto} photos, ${notes.length} notes`);
  done.push(id);
}

if (!skipRefresh)
  for (const id of done)
    for (const script of ['refresh-signals.mjs', 'refresh-gallery.mjs']) {
      try {
        execFileSync('node', [path.join(root, 'scripts', script), '--city', id], { stdio: 'inherit' });
      } catch (e) {
        report.push(`- ${id}: ${script} failed (${e.message.split('\n')[0]}); the weekly refresh will retry`);
      }
    }
if (done.length) {
  await mkdir(path.join(root, 'seeds/reports'), { recursive: true });
  const f = path.join(root, `seeds/reports/${today}.md`);
  const prev = await readFile(f, 'utf8').catch(() => `# Enrichment report, ${today}\n\nThings to double-check after adding cities. Pins that could not be confirmed stay marked approximate in the app.\n`);
  await writeFile(f, prev + '\n' + report.join('\n'));
}
console.log(`Enriched ${done.length} cities`);
