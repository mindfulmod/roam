// Builds Tandem Roads from source.
//   node scripts/build.mjs           -> dist/index.html + dist/images/ (for hosting)
//   node scripts/build.mjs --single  -> dist/tandem-roads.html (one self-contained file, images inlined)
import { readFile, writeFile, mkdir, cp, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FEATURE_FILES, APP_FILES } from './app-files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const single = process.argv.includes('--single');
const read = (p) => readFile(path.join(root, p), 'utf8');
const readJson = async (p) => JSON.parse(await read(p));

const meta = await readJson('data/meta.json');
const cities = await Promise.all(meta.cityOrder.map((id) => readJson(`data/cities/${id}.json`)));
// Shopping guide lives in its own file so city data edits don't collide; attach it per city.
const shopping = await readJson('data/shopping.json');
for (const c of cities)
  if (shopping.cities[c.id]) c.shopping = { ...shopping.cities[c.id], checked: shopping.checked };
const photos = await readJson('data/photos.json');
// Each photo's own soft colour, shown while it loads (scripts/photo-tones.mjs).
for (const [id, tone] of Object.entries(await readJson('data/photo-tones.json')))
  if (photos[id]) photos[id].tone = tone;
const art = await readJson('data/art.json');
// Extra Wikimedia Commons photos per place; hotlinked, so never inlined (see scripts/gallery/).
const gallery = await readJson('data/gallery.json');

const mime = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
};
async function inline(file) {
  const buf = await readFile(path.join(root, file));
  return `data:${mime[path.extname(file).slice(1)]};base64,${buf.toString('base64')}`;
}
if (single) {
  // Newer place photos are hotlinked from Wikimedia Commons and stay as links.
  for (const set of [photos, art])
    for (const v of Object.values(set)) if (!/^https?:/.test(v.data)) v.data = await inline(v.data);
}

// Hosted build: each city's long text (practical notes, per-place reasons, sources, extra photos)
// goes in its own small file that the app fetches when that city or one of its places opens.
// Everything lists, search, maps, ranking and budgets need stays in the main data file.
// The single-file build keeps everything inline so it still works offline.
const CITY_DETAIL = [
  'seasonNote',
  'arrival',
  'cashTip',
  'gettingAround',
  'foodTip',
  'buyTip',
  'baseArea',
  'sources',
  'reviewSource',
  'budgetNote',
];
const ITEM_DETAIL = [
  'sourceUrls',
  'sourceNote',
  'priceNote',
  'whyVisit',
  'review',
  'tradeoffs',
  'visitFlow',
  'bestFor',
  'tip',
  'expect',
  'reservation',
  'photoCaption',
  'photoContext',
  'photoQuery',
  'imageSubject',
  'reviewHighlightsSource',
];
const hash = (t) => createHash('sha256').update(t).digest('hex').slice(0, 10);
const detailFiles = [];
let detail, galleryN;
if (!single) {
  detail = {};
  galleryN = {};
  // Gallery photos that the sample stories and feed show stay in the main file.
  const pinned = await read('data/stories.json').then(
    async (t) => t + (await read('data/social.json')),
  );
  const take = (o, keys) => {
    const out = {};
    for (const k of keys) if (k in o) ((out[k] = o[k]), delete o[k]);
    return out;
  };
  for (const c of cities) {
    const d = { c: take(c, CITY_DETAIL), i: {}, g: {} };
    for (const it of c.items) {
      const x = take(it, ITEM_DETAIL);
      // Ranking needs only the numbers; their links and dates come with the detail.
      if (it.signals) {
        x.signals = it.signals;
        it.signals = Object.fromEntries(
          Object.entries(it.signals).map(([k, v]) => [k, { views: v.views, count: v.count }]),
        );
      }
      if (Object.keys(x).length) d.i[it.id] = x;
    }
    const ids = [c.id, ...c.items.map((x) => x.id), ...(c.shopping?.spots || []).map((x) => x.id)];
    for (const id of ids)
      if (gallery[id] && !pinned.includes('"' + id + '"')) {
        d.g[id] = gallery[id];
        galleryN[id] = gallery[id].length;
        delete gallery[id];
      }
    const text = JSON.stringify(d);
    const name = `city/${c.id}.${hash(text)}.json`;
    detail[c.id] = name;
    detailFiles.push([name, text]);
  }
}

const parts = {
  cities,
  photos,
  art,
  gallery,
  popularity: await readJson('data/popularity.json'),
  countryArrivals: await readJson('data/country-arrivals.json'),
  costs: await readJson('data/costs.json'),
  world: await readJson('data/world.geojson'),
  stories: await readJson('data/stories.json'),
  social: await readJson('data/social.json'),
  retrieved: meta.retrieved,
  version: meta.version,
};
const DATA = Object.fromEntries(meta.keyOrder.map((k) => [k, parts[k]]));
if (detail) Object.assign(DATA, { detail, galleryN });
// Escape "</" so data can never close the surrounding <script> tag.
const dataJs = 'const DATA=' + JSON.stringify(DATA).replaceAll('</', '<\\/') + ';';

const css =
  (await read('vendor/leaflet/leaflet.css')) +
  '\n' +
  (await read('src/styles.css')) +
  '\n' +
  (await read('src/story.css')) +
  '\n' +
  (await read('src/social.css')) +
  '\n' +
  (await read('src/log.css')) +
  '\n' +
  (await read('src/edit.css')) +
  '\n' +
  (await read('src/theme.css'));
// The app's own files are joined, in the order scripts/app-files.mjs gives, into one script.
const js = [
  await read('vendor/leaflet/leaflet.js'),
  dataJs,
  ...(await Promise.all(FEATURE_FILES.map(read))),
  // The numbered parts are joined end to end, so they read exactly as one file.
  (await Promise.all(APP_FILES.map(read))).join(''),
];
let html = await read('src/index.html');
html = html.replace('<!-- build:css -->', () => `<style>${css}</style>`);
// The hosted build links the PNG icons and the web app manifest; the single file keeps only the inline SVG favicon.
html = html.replace(
  '<!-- build:icons -->',
  single
    ? ''
    : '<link rel="apple-touch-icon" href="images/brand/apple-touch-icon.png" /><link rel="manifest" href="manifest.webmanifest" />',
);
// Hosted build: a small HTML shell that paints at once, with the data and the app code in
// their own cacheable files. The single-file build keeps everything inline.
const files = single
  ? []
  : [
      [`data.${hash(dataJs)}.js`, dataJs],
      [`app.${hash(js.filter((x) => x !== dataJs).join('\n'))}.js`, null],
    ];
if (single) {
  html = html.replace('<!-- build:js -->', () => js.map((s) => `<script>${s}</script>`).join(''));
  html = html.replace('<!-- build:boot -->', '').replace('<!-- build:preload -->', '');
} else {
  const lib = js[0],
    app = js.slice(2).join('\n;\n');
  files[1][1] = lib + '\n;\n' + app;
  files[1][0] = `app.${hash(files[1][1])}.js`;
  html = html.replace('<!-- build:js -->', () =>
    files.map(([name]) => `<script defer src="${name}"></script>`).join(''),
  );
  html = html.replace(
    '<!-- build:preload -->',
    () =>
      `<link rel="preload" as="image" href="${photos.kyoto.data}" />` +
      files.map(([name]) => `<link rel="preload" as="script" href="${name}" />`).join(''),
  );
  // What a first-time visitor sees while the data arrives: the real home headline and photo.
  html = html.replace(
    '<!-- build:boot -->',
    () =>
      `<div class="wrap home" id="boot"><section class="home-hero"><img class="photo" src="${photos.kyoto.data}" alt="" /><div class="home-hero-copy"><h1>Where to next?</h1></div></section><section class="doors"><div class="door skeleton"></div><div class="door skeleton"></div></section></div><script>if (!/^#?\\/?$/.test(location.hash)) document.getElementById('boot').remove();</script>`,
  );
}

// The hosted page's security policy: scripts only from this site plus the page's own two short
// inline scripts (by hash), so text that slips into the page can never run as code. Photos and
// map tiles come from other https sites; styles stay inline-friendly for the map library.
if (!single) {
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    (m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`,
  );
  const csp = [
    "default-src 'self'",
    `script-src 'self' ${inline.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https:",
    "font-src 'self' data:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join('; ');
  html = html.replace(
    '<meta charset="UTF-8" />',
    () =>
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
  );
}

const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
if (single) {
  await writeFile(path.join(dist, 'tandem-roads.html'), html);
} else {
  await writeFile(path.join(dist, 'index.html'), html);
  for (const [name, text] of files) await writeFile(path.join(dist, name), text);
  await mkdir(path.join(dist, 'city'));
  for (const [name, text] of detailFiles) await writeFile(path.join(dist, name), text);
  await cp(path.join(root, 'images'), path.join(dist, 'images'), { recursive: true });
  await cp(path.join(root, 'src/manifest.webmanifest'), path.join(dist, 'manifest.webmanifest'));
  // The offline helper: told this version's name and the files the page needs to open at all.
  const core = [
    './',
    'index.html',
    ...files.map(([name]) => name),
    'manifest.webmanifest',
    photos.kyoto.data,
    ...['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png'].map(
      (f) => 'images/brand/' + f,
    ),
  ];
  await writeFile(
    path.join(dist, 'sw.js'),
    (await read('src/sw.js'))
      .replace("'__VERSION__'", () => JSON.stringify(hash(html)))
      .replace('__CORE__', () => JSON.stringify(core)),
  );
}
console.log(
  `Built ${single ? 'dist/tandem-roads.html' : 'dist/index.html'} (${(Buffer.byteLength(html) / 1e6).toFixed(1)} MB HTML)`,
);
