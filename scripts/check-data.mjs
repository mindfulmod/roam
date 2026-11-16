// Checks every city file before a build: the fields the app reads, ids, pins, costs and seasons.
//   node scripts/check-data.mjs
// Errors fail the run (and the pull request check); warnings are printed only.
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGIONS, TYPES } from './add-city.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (p) => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const km = (a, b) => {
  const r = Math.PI / 180,
    h =
      Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
      Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

const meta = await readJson('data/meta.json');
const costs = await readJson('data/costs.json');
const photos = await readJson('data/photos.json');
const errors = [],
  warnings = [];
const err = (m) => errors.push(m),
  warn = (m) => warnings.push(m);

const onDisk = (await readdir(path.join(root, 'data/cities'))).map((f) => f.replace('.json', ''));
for (const id of onDisk)
  if (!meta.cityOrder.includes(id)) err(`${id}: file exists but is not in meta.cityOrder`);
if (new Set(meta.cityOrder).size !== meta.cityOrder.length) err('meta.cityOrder has duplicates');

const CITY_KEYS = [
  'id',
  'name',
  'country',
  'region',
  'lat',
  'lon',
  'wiki',
  'tagline',
  'summary',
  'days',
  'bestMonths',
  'seasonNote',
  'arrival',
  'gettingAround',
  'cashTip',
  'dailyBudget',
  'currency',
  'cashPerDay',
  'foodTip',
  'buyTip',
  'baseArea',
  'connections',
  'sources',
  'reviewSource',
  'items',
];
const ITEM_KEYS = [
  'id',
  'name',
  'kind',
  'lat',
  'lon',
  'wiki',
  'summary',
  'expect',
  'tip',
  'area',
  'duration',
  'price',
  'priceNote',
  'bestTime',
  'reservation',
  'priority',
  'sourceUrls',
  'experienceTypes',
  'whyVisit',
  'visitFlow',
  'bestFor',
  'tradeoffs',
];
const seen = new Set();
let places = 0,
  noCover = 0;
for (const id of meta.cityOrder) {
  if (!existsSync(path.join(root, `data/cities/${id}.json`))) {
    err(`${id}: in meta.cityOrder but has no file`);
    continue;
  }
  const c = await readJson(`data/cities/${id}.json`);
  if (c.id !== id) err(`${id}: file name and id differ`);
  for (const k of CITY_KEYS) if (c[k] === undefined || c[k] === null) err(`${id}: missing ${k}`);
  if (!REGIONS.includes(c.region)) err(`${id}: unknown region ${c.region}`);
  if (!costs.fx[c.currency]) err(`${id}: no exchange rate for ${c.currency}`);
  if (!costs.cities[id]?.hotel) err(`${id}: no hotel estimate in costs.json`);
  if (!/^[LSHP]{12}$/.test(costs.seasons[id] || '')) err(`${id}: no seasons in costs.json`);
  if (!(Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180)) err(`${id}: bad coordinates`);
  for (const x of c.connections || [])
    if (!meta.cityOrder.includes(x.to)) err(`${id}: connection to unknown city ${x.to}`);
  if (!photos[id]) noCover++;
  else if (!/^https?:/.test(photos[id].data) && !existsSync(path.join(root, photos[id].data)))
    err(`${id}: cover file ${photos[id].data} is missing`);
  for (const p of c.items || []) {
    places++;
    if (seen.has(p.id)) err(`${p.id}: duplicate place id`);
    seen.add(p.id);
    if (meta.cityOrder.includes(p.id)) err(`${p.id}: place id clashes with a city id`);
    for (const k of ITEM_KEYS)
      if (p[k] === undefined || p[k] === null) err(`${p.id}: missing ${k}`);
    if (!['see', 'eat', 'shop'].includes(p.kind)) err(`${p.id}: kind ${p.kind}`);
    if (!Array.isArray(p.price) || p.price.length !== 2) err(`${p.id}: price must be [low, high]`);
    for (const t of p.experienceTypes || []) if (!TYPES[t]) err(`${p.id}: unknown type ${t}`);
    if (typeof p.lat !== 'number' || typeof p.lon !== 'number') err(`${p.id}: bad pin`);
    else {
      const d = km(c, p);
      if (d > 450) err(`${p.id}: pin is ${Math.round(d)} km from ${c.name}`);
      else if (d > 60 && !p.excursion && p.duration < 6)
        warn(`${p.id}: ${Math.round(d)} km from the city but not marked as an excursion`);
    }
    const ph = photos[p.id];
    if (ph && !/^https?:/.test(ph.data) && !existsSync(path.join(root, ph.data)))
      err(`${p.id}: photo file ${ph.data} is missing`);
  }
}
for (const w of warnings) console.log('warning:', w);
for (const e of errors) console.log('ERROR:', e);
console.log(
  `${meta.cityOrder.length} cities, ${places} places, ${noCover} cities without a cover photo, ${warnings.length} warnings, ${errors.length} errors`,
);
if (errors.length) process.exit(1);
