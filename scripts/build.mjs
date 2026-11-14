// Builds Tandem Roads from source.
//   node scripts/build.mjs           -> dist/index.html + dist/images/ (for hosting)
//   node scripts/build.mjs --single  -> dist/tandem-roads.html (one self-contained file, images inlined)
import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  for (const set of [photos, art])
    for (const v of Object.values(set)) v.data = await inline(v.data);
}

const parts = {
  cities,
  photos,
  art,
  gallery,
  popularity: await readJson('data/popularity.json'),
  costs: await readJson('data/costs.json'),
  world: await readJson('data/world.geojson'),
  stories: await readJson('data/stories.json'),
  retrieved: meta.retrieved,
  version: meta.version,
};
const DATA = Object.fromEntries(meta.keyOrder.map((k) => [k, parts[k]]));
// Escape "</" so data can never close the surrounding <script> tag.
const dataJs = 'const DATA=' + JSON.stringify(DATA).replaceAll('</', '<\\/') + ';';

const css =
  (await read('vendor/leaflet/leaflet.css')) +
  '\n' +
  (await read('src/styles.css')) +
  '\n' +
  (await read('src/story.css')) +
  '\n' +
  (await read('src/theme.css'));
const js = [
  await read('vendor/leaflet/leaflet.js'),
  dataJs,
  await read('src/budget.js'),
  await read('src/theme.js'),
  await read('src/share.js'),
  await read('src/story.js'),
  await read('src/app.js'),
];
let html = await read('src/index.html');
html = html.replace('<!-- build:css -->', () => `<style>${css}</style>`);
html = html.replace('<!-- build:js -->', () => js.map((s) => `<script>${s}</script>`).join(''));

const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
if (single) {
  await writeFile(path.join(dist, 'tandem-roads.html'), html);
} else {
  await writeFile(path.join(dist, 'index.html'), html);
  await cp(path.join(root, 'images'), path.join(dist, 'images'), { recursive: true });
}
console.log(
  `Built ${single ? 'dist/tandem-roads.html' : 'dist/index.html'} (${(Buffer.byteLength(html) / 1e6).toFixed(1)} MB HTML)`,
);
