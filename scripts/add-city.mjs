// Turns short city "seeds" into full city files.
//
//   node scripts/add-city.mjs                 # every seed in seeds/ that is not a city yet
//   node scripts/add-city.mjs seeds/foo.json  # only the seeds in that file
//   node scripts/add-city.mjs --force lisbon  # rebuild a city from its seed (keeps signals and fixed pins)
//
// A seed holds only what a person (or Claude) has to decide: the city facts, and for each
// place its name, rough pin, Wikipedia title and a few sentences. Everything the app needs on
// top of that (ids, notes, review placeholders, dietary blocks, sources, cost and season
// entries, the city order) is filled in here, so every city comes out in the same shape.
// See seeds/README.md for the seed format. This script needs no network; photos, exact pins
// and popularity numbers are added afterwards by scripts/enrich.mjs in GitHub Actions.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (p) => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const writeJson = (p, v) => writeFile(path.join(root, p), JSON.stringify(v, null, 2) + '\n');
const today = new Date().toISOString().slice(0, 10);

const args = process.argv.slice(2);
const force = args.includes('--force');
const wanted = args.filter((a) => !a.startsWith('--'));

export const REGIONS = ['Asia', 'Europe', 'Africa', 'South America', 'North America', 'Oceania'];
export const TYPES = {
  History: 'history and context',
  Architecture: 'architecture and design',
  Art: 'art and craft',
  Nature: 'landscapes and wildlife',
  Adventure: 'active exploration',
  Food: 'regional food',
  Shopping: 'local shopping',
  Viewpoint: 'big views',
  Spiritual: 'sacred places',
  Entertainment: 'shows and nightlife',
  Technology: 'science and technology',
};
export const slug = (s) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[æÆ]/g, 'ae')
    .replace(/[þÞ]/g, 'th')
    .replace(/[ðÐ]/g, 'd')
    .replace(/[øØ]/g, 'o')
    .replace(/[łŁ]/g, 'l')
    .replace(/[đĐ]/g, 'd')
    .replace(/[ıİ]/g, 'i')
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const km = (a, b) => {
  const r = Math.PI / 180,
    h =
      Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
      Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const q = (s) => encodeURIComponent(s);
const tripadvisor = (s) => `https://www.tripadvisor.com/Search?q=${q(s)}`;
const gmaps = (s) => `https://www.google.com/maps/search/?api=1&query=${q(s)}`;
const wikiUrl = (t) => 'https://en.wikipedia.org/wiki/' + q(t.replaceAll(' ', '_'));

const NOTES = {
  see: 'Planning estimate per adult in local currency, not a live ticket quote; check current prices and what is included.',
  eat: 'Per-person meal planning estimate in local currency, not a live menu quote; drinks, service and tax may add to the total.',
  shop: 'Planning estimate per adult in local currency; shopping is a spend allowance.',
  source:
    'Editorial selection. Durations, spending allowances and itinerary advice are planning estimates; check opening days and prices with the venue before you go.',
  areaDiet:
    'This card describes a neighbourhood, market or flexible meal experience with independent operators. No area-wide dietary standard is implied. Confirm with the stall or venue you choose.',
  venueDiet:
    'Dietary notes are editorial, from the style of menu, and are not checked with the venue. Ask the restaurant directly about halal, vegetarian and allergy needs.',
};

function fail(where, msg) {
  throw new Error(`${where}: ${msg}`);
}
function need(o, keys, where) {
  for (const k of keys)
    if (o[k] === undefined || o[k] === null || o[k] === '') fail(where, `missing "${k}"`);
}
const pair = (v, where, k) => {
  if (!Array.isArray(v) || v.length !== 2 || v.some((n) => typeof n !== 'number') || v[0] > v[1])
    fail(where, `"${k}" must be [low, high]`);
  return v;
};

export function buildItem(s, city, used) {
  const where = `${city.id} / ${s.name || '?'}`;
  need(
    s,
    [
      'name',
      'kind',
      'at',
      'wiki',
      'area',
      'summary',
      'expect',
      'tip',
      'why',
      'flow',
      'hours',
      'price',
      'best',
      'types',
    ],
    where,
  );
  if (!['see', 'eat', 'shop'].includes(s.kind)) fail(where, `kind "${s.kind}"`);
  if (
    !Array.isArray(s.at) ||
    s.at.length !== 2 ||
    Math.abs(s.at[0]) > 90 ||
    Math.abs(s.at[1]) > 180
  )
    fail(where, '"at" must be [latitude, longitude]');
  const [lat, lon] = s.at;
  const far = km(city, { lat, lon });
  if (far > (s.excursion ? 400 : 60))
    fail(
      where,
      `pin is ${Math.round(far)} km from the city${s.excursion ? '' : ' (set "excursion": true for day trips)'}`,
    );
  for (const t of s.types) if (!TYPES[t]) fail(where, `unknown type "${t}"`);
  if (!Array.isArray(s.flow) || s.flow.length < 2) fail(where, '"flow" needs two steps');
  pair(s.price, where, 'price');
  let id = `${city.id}-${slug(s.id || s.name)}`;
  if (used.has(id)) fail(where, `duplicate id ${id}`);
  used.add(id);
  const label = `${s.name}, ${city.plainName}`;
  const item = {
    id,
    name: s.name,
    kind: s.kind,
    lat,
    lon,
    wiki: s.wiki,
    summary: s.summary,
    expect: s.expect,
    tip: s.tip,
    area: s.area,
    duration: s.hours,
    price: s.price,
    priceNote: NOTES[s.kind],
    bestTime: s.best,
    reservation: s.book || 'Usually not needed',
    priority: s.p || 2,
    sourceUrls: [...(s.url ? [s.url] : []), tripadvisor(label), gmaps(label)],
    // A plain link only: Tripadvisor's terms do not allow storing its ratings or counts.
    review: { url: tripadvisor(label) },
    sourceNote: NOTES.source,
    experienceTypes: s.types,
    whyVisit: [s.summary, s.why],
    visitFlow: s.flow,
    bestFor:
      s.bestFor ||
      'Visitors interested in ' +
        s.types
          .slice(0, 2)
          .map((t) => TYPES[t])
          .join(' and '),
    tradeoffs: [s.expect, s.tip],
    // Pins start as a best guess; enrich.mjs replaces them from Wikipedia or a geocoder and clears this.
    pinApproximate: true,
  };
  if (s.excursion) item.excursion = true;
  if (s.optional) item.optional = true;
  if (s.kind === 'eat') {
    need(s, ['cuisine', 'order'], where);
    const areaLike = s.venue === 'food-area';
    item.venueType = areaLike ? 'food-area' : 'restaurant';
    item.cuisine = s.cuisine;
    item.mustOrder = s.order;
    item.dietary = {
      halal: s.halal || 'unverified',
      vegetarian: s.veg || 'unverified',
      evidence: [],
      note: areaLike ? NOTES.areaDiet : NOTES.venueDiet,
    };
  }
  return item;
}

function buildCity(s, costs) {
  const where = s.id || s.name || '?';
  need(
    s,
    [
      'id',
      'name',
      'country',
      'region',
      'at',
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
      'hotel',
      'seasons',
      'items',
    ],
    where,
  );
  if (s.id !== slug(s.id)) fail(where, 'id must be lower-case words joined by hyphens');
  if (!REGIONS.includes(s.region)) fail(where, `region must be one of ${REGIONS.join(', ')}`);
  if (!costs.fx[s.currency])
    fail(where, `currency ${s.currency} has no rate in data/costs.json "fx"`);
  if (!/^[LSHP]{12}$/.test(s.seasons))
    fail(where, '"seasons" must be 12 letters from L, S, H, P (Jan to Dec)');
  pair(s.dailyBudget, where, 'dailyBudget');
  pair(s.cashPerDay, where, 'cashPerDay');
  pair(s.hotel, where, 'hotel');
  const sees = s.items.filter((i) => i.kind === 'see').length,
    eats = s.items.filter((i) => i.kind === 'eat').length;
  if (sees < 5 || eats < 3)
    fail(where, `needs at least 5 sights and 3 food places (has ${sees} and ${eats})`);
  const city = {
    id: s.id,
    name: s.name,
    country: s.country,
    region: s.region,
    lat: s.at[0],
    lon: s.at[1],
    wiki: s.wiki,
    tagline: s.tagline,
    summary: s.summary,
    days: s.days,
    bestMonths: s.bestMonths,
    seasonNote: s.seasonNote,
    arrival: s.arrival,
    gettingAround: s.gettingAround,
    cashTip: s.cashTip,
    dailyBudget: s.dailyBudget,
    currency: s.currency,
    cashPerDay: s.cashPerDay,
    foodTip: s.foodTip,
    buyTip: s.buyTip,
    baseArea: s.baseArea,
    connections: s.connections || [],
    sources: [],
    reviewSource: tripadvisor(`${s.name.split(' · ')[0]} things to do`),
    popularity: {},
    dayClusters: null,
    budgetNote: s.budgetNote || null,
    // The article whose lead photo makes a recognisable cover (a landmark, not a collage).
    coverWiki: s.cover || null,
    added: today,
  };
  city.plainName = s.name.split(' · ')[0];
  const used = new Set();
  city.items = s.items.map((i) => buildItem(i, city, used));
  delete city.plainName;
  const plain = s.name.split(' · ')[0];
  city.sources = [
    ...(s.official
      ? [
          {
            title: 'Official visitor information',
            url: s.official,
            type: 'official',
            checked: today,
          },
        ]
      : []),
    { title: `${plain} on Wikipedia`, url: wikiUrl(s.wiki), type: 'reference', checked: today },
    {
      title: 'Tripadvisor visitor reviews',
      url: city.reviewSource,
      type: 'reviews',
      checked: today,
    },
    ...s.items
      .filter((i) => i.url)
      .map((i) => ({
        title: `${i.name} — visitor or menu information`,
        url: i.url,
        type: 'official',
        checked: today,
      })),
  ];
  const cost = { hotel: s.hotel };
  for (const k of ['hop', 'via', 'fare', 'car']) if (s[k] !== undefined) cost[k] = s[k];
  if (s.costNote) cost.note = s.costNote;
  return { city, cost, seasons: s.seasons };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const meta = await readJson('data/meta.json');
  const costs = await readJson('data/costs.json');
  const files = wanted.filter((a) => a.endsWith('.json'));
  const ids = new Set(wanted.filter((a) => !a.endsWith('.json')));
  const seedFiles = files.length
    ? files
    : (await readdir(path.join(root, 'seeds')))
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((f) => 'seeds/' + f);
  const seeds = [];
  for (const f of seedFiles) {
    const j = await readJson(f);
    for (const s of Array.isArray(j) ? j : [j]) seeds.push(s);
  }
  const known = new Set([...meta.cityOrder, ...seeds.map((s) => s.id)]);
  let added = 0;
  const pending = [];
  for (const s of seeds) {
    if (ids.size && !ids.has(s.id)) continue;
    const file = `data/cities/${s.id}.json`;
    const exists = existsSync(path.join(root, file));
    if (exists && !(force && (ids.has(s.id) || files.length))) continue;
    const { city, cost, seasons } = buildCity(s, costs);
    for (const c of city.connections)
      if (!known.has(c.to)) fail(s.id, `connection to unknown city "${c.to}"`);
    if (exists) {
      // Rebuild: keep what the enrich and refresh scripts have already found.
      const old = await readJson(file);
      const prev = new Map(old.items.map((i) => [i.id, i]));
      city.added = old.added || city.added;
      city.popularity = old.popularity || {};
      for (const i of city.items) {
        const o = prev.get(i.id);
        if (!o) continue;
        for (const k of ['signals', 'michelin']) if (o[k]) i[k] = o[k];
        if (!o.pinApproximate) {
          i.lat = o.lat;
          i.lon = o.lon;
          delete i.pinApproximate;
        }
      }
    }
    pending.push([file, city]);
    if (!meta.cityOrder.includes(s.id)) meta.cityOrder.push(s.id);
    costs.cities[s.id] = cost;
    costs.seasons[s.id] = seasons;
    added++;
    console.log(`${exists ? 'rebuilt' : 'added'} ${s.id}: ${city.items.length} places`);
  }
  // Nothing is written until every seed has passed, so a mistake never leaves half a batch behind.
  for (const [file, city] of pending) await writeJson(file, city);
  await writeJson('data/meta.json', meta);
  // costs.json is kept in prettier's layout so diffs stay small.
  let text = JSON.stringify(costs, null, 2) + '\n';
  try {
    const prettier = await import('prettier');
    const opts = await prettier.resolveConfig(path.join(root, 'data/costs.json'));
    text = await prettier.format(text, { ...opts, parser: 'json' });
  } catch {
    console.warn('prettier not installed (npm install); costs.json written unformatted');
  }
  await writeFile(path.join(root, 'data/costs.json'), text);
  console.log(`${added} cities written. Next: node scripts/check-data.mjs && npm run build`);
}
