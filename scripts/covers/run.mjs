// City cover photos from Wikimedia Commons.
//   node scripts/covers/run.mjs candidates  -> scripts/covers/out/<city>.jpg contact sheets
//                                               + scripts/covers/out/candidates.json
//   node scripts/covers/run.mjs apply       -> downloads picks.json choices into
//                                               images/photos/<city>.webp and updates data/photos.json
// Needs network access to Commons (run it in GitHub Actions; see .github/workflows/covers.yml)
// and `sharp` (npm i --no-save sharp).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const here = path.join(root, 'scripts/covers');
const out = path.join(here, 'out');
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = { 'User-Agent': 'TandemRoadsCoverBot/1.0 (https://github.com/mindfulmod/roam)' };
const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (h = '') =>
  String(h)
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

async function get(url, tries = 4) {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: UA });
    if (r.ok) return r;
    if (i >= tries || ![429, 500, 502, 503, 504].includes(r.status))
      throw Error(`${r.status} ${url}`);
    await sleep(2000 * 2 ** i);
  }
}
async function api(params) {
  const u = new URL(API);
  for (const [k, v] of Object.entries({ format: 'json', formatversion: 2, ...params }))
    u.searchParams.set(k, v);
  return (await get(u)).json();
}
const FREE = /^(cc0|cc[ -]by|cc[ -]by[ -]sa|public domain|pd)/i;
function infoRow(page) {
  const ii = page.imageinfo?.[0];
  if (!ii) return null;
  const m = ii.extmetadata || {};
  const license = strip(m.LicenseShortName?.value);
  return {
    title: page.title.replace(/^File:/, ''),
    pageid: page.pageid,
    width: ii.width,
    height: ii.height,
    thumb: ii.thumburl,
    url: ii.descriptionurl,
    author: strip(m.Artist?.value) || 'Wikimedia Commons contributor',
    license,
    licenseUrl: m.LicenseUrl?.value || ii.descriptionurl,
    description: strip(m.ImageDescription?.value).slice(0, 220),
    free: FREE.test(license),
  };
}
async function search(q, quality) {
  const filter = quality
    ? ' incategory:Quality_images|Featured_pictures_on_Wikimedia_Commons|Valued_images_sorted_by_promotion_date'
    : '';
  const d = await api({
    action: 'query',
    generator: 'search',
    gsrsearch: `${q} filetype:bitmap${filter}`,
    gsrnamespace: 6,
    gsrlimit: 20,
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: 360,
  });
  return (d.query?.pages || [])
    .sort((a, b) => a.index - b.index)
    .map(infoRow)
    .filter((x) => x && x.free && x.width >= 1400 && x.width / x.height >= 1.25);
}

async function candidates() {
  const req = await readJson(path.join(here, 'requests.json'));
  await mkdir(out, { recursive: true });
  const all = {};
  for (const [city, queries] of Object.entries(req)) {
    const seen = new Set(),
      list = [];
    for (const q of queries) {
      let rows = await search(q, true);
      if (rows.length < 3) rows = rows.concat(await search(q, false));
      for (const r of rows) {
        if (seen.has(r.title) || list.length >= 12) continue;
        seen.add(r.title);
        list.push({ ...r, query: q });
      }
      await sleep(300);
    }
    all[city] = list.map(({ thumb, ...r }, i) => ({ n: i + 1, ...r }));
    // Contact sheet: 4 columns of 300x200 tiles, each numbered.
    const tiles = [];
    for (const [i, r] of list.entries()) {
      try {
        const buf = Buffer.from(await (await get(r.thumb)).arrayBuffer());
        const img = await sharp(buf).resize(300, 200, { fit: 'cover' }).toBuffer();
        const label = Buffer.from(
          `<svg width="300" height="200"><rect x="0" y="0" width="34" height="26" fill="#000" opacity="0.75"/><text x="17" y="19" font-size="18" font-family="sans-serif" fill="#fff" text-anchor="middle">${i + 1}</text></svg>`,
        );
        tiles.push({
          input: await sharp(img)
            .composite([{ input: label }])
            .toBuffer(),
          left: (i % 4) * 304,
          top: Math.floor(i / 4) * 204,
        });
      } catch (e) {
        console.warn(city, r.title, e.message);
      }
      await sleep(150);
    }
    if (tiles.length)
      await sharp({
        create: {
          width: 4 * 304,
          height: Math.ceil(list.length / 4) * 204,
          channels: 3,
          background: '#fff',
        },
      })
        .composite(tiles)
        .jpeg({ quality: 82 })
        .toFile(path.join(out, `${city}.jpg`));
    console.log(city, list.length, 'candidates');
  }
  await writeFile(path.join(out, 'candidates.json'), JSON.stringify(all, null, 1) + '\n');
}

async function apply() {
  const picks = await readJson(path.join(here, 'picks.json'));
  const photosPath = path.join(root, 'data/photos.json');
  const photos = await readJson(photosPath);
  for (const [city, pick] of Object.entries(picks)) {
    const title = typeof pick === 'string' ? pick : pick.title;
    if (photos[city]?.title === title.replace(/ /g, '_')) continue;
    const d = await api({
      action: 'query',
      titles: 'File:' + title,
      prop: 'imageinfo',
      iiprop: 'url|size|extmetadata',
      iiurlwidth: 1600,
    });
    const page = d.query.pages[0];
    const r = infoRow(page);
    if (!r?.free) throw Error(`${city}: ${title} missing or not freely licensed`);
    const buf = Buffer.from(await (await get(r.thumb)).arrayBuffer());
    const file = `images/photos/${city}.webp`;
    await sharp(buf)
      .resize(960, 640, { fit: 'cover', position: pick.position || 'centre' })
      .webp({ quality: 80 })
      .toFile(path.join(root, file));
    photos[city] = {
      id: 'commons:' + r.pageid,
      title: r.title.replace(/ /g, '_'),
      alt: pick.alt || r.description || r.title.replace(/\.[a-z]+$/i, ''),
      url: r.url,
      author: r.author,
      license: r.license,
      licenseUrl: r.licenseUrl,
      provider: 'Wikimedia Commons',
      context: false,
      caption: pick.caption || r.title.replace(/\.[a-z]+$/i, '').replace(/_/g, ' '),
      data: file,
    };
    console.log(city, '<-', r.title, '|', r.license, '|', r.author);
    await sleep(300);
  }
  await writeFile(photosPath, JSON.stringify(photos, null, 2) + '\n');
}

const mode = process.argv[2];
if (mode === 'candidates') await candidates();
else if (mode === 'apply') await apply();
else throw Error('Usage: run.mjs candidates|apply');
