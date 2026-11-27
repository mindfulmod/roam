// Gives every guide city and place one lasting identity and its local name.
//
//   node scripts/refresh-identity.mjs                 # every city
//   node scripts/refresh-identity.mjs --city kyoto    # one city only
//
// identity: the Wikidata item (`wikidata`, like "Q1137590") behind the place's English
// Wikipedia article. Our own ids (kyoto-fushimi) can change when a city is reworked; the
// Wikidata id does not, and OpenStreetMap tags the same id on its map objects, so a place
// a traveller finds on the map can be matched back to the guide place.
//
// local name: the item's label in the place's own language (`local: { name, lang }`), shown
// under the English name so it can be shown to a driver or matched to a street sign. It is
// kept only when it differs from the English name beyond accents and case.
//
// The article must have coordinates within MAX_KM of our pin, so an article about a dish, a
// person or another town never lends its id. Nothing is removed when a lookup fails.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const citiesDir = path.join(root, 'data/cities');
const UA = 'TandemRoads/2.0 (https://github.com/mindfulmod/roam)';
const MAX_KM = 3;
const CITY_MAX_KM = 40;
const onlyCity = process.argv.includes('--city')
  ? process.argv[process.argv.indexOf('--city') + 1]
  : null;

// The language a place's own name is written in, by country (Wikidata language codes),
// with cities whose everyday language differs from the country's first one.
const LANG = {
  Argentina: 'es',
  Armenia: 'hy',
  Australia: 'en',
  Austria: 'de',
  Azerbaijan: 'az',
  Bahamas: 'en',
  Belgium: 'nl',
  Belize: 'en',
  Bhutan: 'dz',
  Bolivia: 'es',
  'Bosnia and Herzegovina': 'bs',
  Botswana: 'en',
  Brazil: 'pt',
  Bulgaria: 'bg',
  Cambodia: 'km',
  Canada: 'en',
  Chile: 'es',
  China: 'zh-hans',
  Colombia: 'es',
  'Cook Islands': 'en',
  'Costa Rica': 'es',
  Croatia: 'hr',
  Cuba: 'es',
  Czechia: 'cs',
  Denmark: 'da',
  'Dominican Republic': 'es',
  Ecuador: 'es',
  Egypt: 'ar',
  Estonia: 'et',
  Ethiopia: 'am',
  Fiji: 'en',
  Finland: 'fi',
  France: 'fr',
  'French Polynesia': 'fr',
  Georgia: 'ka',
  Germany: 'de',
  Ghana: 'en',
  Greece: 'el',
  Guatemala: 'es',
  'Hong Kong SAR': 'zh-hant',
  Hungary: 'hu',
  Iceland: 'is',
  India: 'hi',
  Indonesia: 'id',
  Iran: 'fa',
  Iraq: 'ar',
  Ireland: 'en',
  'Israel and Palestine': 'he',
  Italy: 'it',
  Jamaica: 'en',
  Japan: 'ja',
  Jordan: 'ar',
  Kazakhstan: 'kk',
  Kenya: 'en',
  Laos: 'lo',
  Latvia: 'lv',
  Lithuania: 'lt',
  'Macau (China)': 'zh-hant',
  Madagascar: 'mg',
  Malaysia: 'ms',
  Maldives: 'dv',
  Malta: 'mt',
  Mauritius: 'en',
  Mexico: 'es',
  Montenegro: 'sr',
  Morocco: 'ar',
  Namibia: 'en',
  Nepal: 'ne',
  Netherlands: 'nl',
  'New Zealand': 'en',
  Norway: 'nb',
  Oman: 'ar',
  Panama: 'es',
  Paraguay: 'es',
  Peru: 'es',
  Philippines: 'tl',
  Poland: 'pl',
  Portugal: 'pt',
  'Puerto Rico': 'es',
  Qatar: 'ar',
  Romania: 'ro',
  Rwanda: 'rw',
  'Saudi Arabia': 'ar',
  Senegal: 'fr',
  Serbia: 'sr',
  Seychelles: 'en',
  Singapore: 'en',
  Slovakia: 'sk',
  Slovenia: 'sl',
  'South Africa': 'en',
  'South Korea': 'ko',
  Spain: 'es',
  'Sri Lanka': 'si',
  Sweden: 'sv',
  Switzerland: 'de',
  Taiwan: 'zh-hant',
  Tanzania: 'sw',
  Thailand: 'th',
  Tunisia: 'ar',
  Türkiye: 'tr',
  Uganda: 'en',
  'United Arab Emirates': 'ar',
  'United Kingdom': 'en',
  'United States': 'en',
  Uruguay: 'es',
  Uzbekistan: 'uz',
  Vietnam: 'vi',
  Zimbabwe: 'en',
};
const CITY_LANG = {
  barcelona: 'ca',
  montreal: 'fr',
  'quebec-city': 'fr',
  brussels: 'fr',
  bruges: 'nl',
  geneva: 'fr',
  lausanne: 'fr',
  lugano: 'it',
  mumbai: 'mr',
  chennai: 'ta',
  kolkata: 'bn',
  bengaluru: 'kn',
  hyderabad: 'te',
  kochi: 'ml',
  goa: 'kok',
  amritsar: 'pa',
  bethlehem: 'ar',
  'san-sebastian': 'eu',
  bilbao: 'eu',
  palma: 'ca',
  valencia: 'es',
};
const OWN_SCRIPT = new Set(
  'hy dz bg km zh-hans zh-hant am ka el hi fa ar he ja kk lo dv sr ne th ko si mr ta bn kn te ml kok pa'.split(
    ' ',
  ),
);
// Labels missing in the variant fall back to the plain language.
const FALLBACK = { 'zh-hans': ['zh-cn', 'zh'], 'zh-hant': ['zh-hk', 'zh-tw', 'zh'], nb: ['no'] };

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
const GAP_MS = 250;
let lastCall = 0;
async function getJson(url, tries = 6) {
  for (let i = 1; ; i++) {
    const wait = lastCall + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) return res.json();
    if (i >= tries || (res.status < 500 && res.status !== 429))
      throw new Error(`${res.status} ${url}`);
    const retryAfter = Number(res.headers.get('retry-after'));
    await sleep(retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** i);
  }
}

// English Wikipedia titles to { qid, coords }, following redirects, 50 at a time.
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
      colimit: 'max',
      ppprop: 'wikibase_item|disambiguation',
      titles: batch.join('|'),
    });
    const j = await getJson('https://en.wikipedia.org/w/api.php?' + q);
    const norm = new Map((j.query.normalized || []).map((n) => [n.from, n.to]));
    const redir = new Map((j.query.redirects || []).map((r) => [r.from, r.to]));
    const pages = new Map((j.query.pages || []).map((p) => [p.title, p]));
    for (const t of batch) {
      const n = norm.get(t) || t;
      const page = pages.get(redir.get(n) || n);
      const qid = page?.pageprops?.wikibase_item;
      if (!qid || page.missing || page.pageprops.disambiguation !== undefined) continue;
      const c = page.coordinates?.[0];
      out.set(t, { qid, title: page.title, coords: c ? { lat: c.lat, lon: c.lon } : null });
    }
  }
  return out;
}
// Wikidata labels for the given ids in the given languages, 50 at a time.
async function labels(qids, langs) {
  const out = new Map();
  for (let i = 0; i < qids.length; i += 50) {
    const q = new URLSearchParams({
      action: 'wbgetentities',
      format: 'json',
      props: 'labels',
      ids: qids.slice(i, i + 50).join('|'),
      languages: langs.join('|'),
    });
    const j = await getJson('https://www.wikidata.org/w/api.php?' + q);
    for (const [id, e] of Object.entries(j.entities || {}))
      out.set(id, Object.fromEntries(Object.entries(e.labels || {}).map(([l, v]) => [l, v.value])));
  }
  return out;
}
// "Colosseo" differs from "Colosseum"; "Hôtel de Ville" does not differ from "Hotel de Ville".
const plain = (s) =>
  String(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
function localName(name, lab, lang) {
  for (const l of [lang, ...(FALLBACK[lang] || [])]) {
    const v = lab?.[l]?.trim();
    // "Ponta Negra" adds nothing under "Ponta Negra beach", and a Latin-letter label in a
    // language with its own script is a slip ("srilanka" as the Sinhala name).
    if (v && OWN_SCRIPT.has(lang) && /^[\p{Script=Latin}\p{P}\p{N}\s]+$/u.test(v)) return null;
    if (v && v.length <= 80) return plain(name).includes(plain(v)) ? null : { name: v, lang };
  }
  return null;
}
// A place shares a real word with its article's title ("Nijo Castle" and "Nijō Castle"),
// so a restaurant whose article is its town ("El Pimpi" and "Málaga") lends no identity.
const GENERIC = new Set(
  'the and of old town city de la el del di le les du das der los las'.split(' '),
);
const words = (s) =>
  String(s)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !GENERIC.has(w));
const sameThing = (name, title) => {
  const t = new Set(words(title));
  return words(name).some(
    (w) => t.has(w) || [...t].some((x) => x.length >= 5 && (x.startsWith(w) || w.startsWith(x))),
  );
};

const files = (await readdir(citiesDir)).filter(
  (f) => f.endsWith('.json') && (!onlyCity || f === onlyCity + '.json'),
);
const tally = { ids: 0, local: 0, noArticle: 0, far: 0, other: 0 };
for (const file of files) {
  const fp = path.join(citiesDir, file);
  const city = JSON.parse(await readFile(fp, 'utf8'));
  const lang = CITY_LANG[city.id] || LANG[city.country];
  if (!lang) console.warn(`${city.name}: no language for ${city.country}`);
  const all = [city, ...city.items].filter((p) => p.wiki);
  let resolved, lab;
  try {
    resolved = await resolveTitles([...new Set(all.map((p) => p.wiki))]);
    const qids = [...new Set([...resolved.values()].map((r) => r.qid))];
    const langs = lang ? [lang, ...(FALLBACK[lang] || [])] : [];
    lab = langs.length && lang !== 'en' ? await labels(qids, langs) : new Map();
  } catch (e) {
    console.warn(`${city.name}: lookup failed, keeping what is there (${e.message})`);
    continue;
  }
  const cityQ = resolved.get(city.wiki)?.qid,
    uses = {};
  for (const p of city.items) {
    const q = resolved.get(p.wiki)?.qid;
    if (q) uses[q] = (uses[q] || 0) + 1;
  }
  for (const p of all) {
    const r = resolved.get(p.wiki);
    delete p.wikidata;
    delete p.local;
    if (!r) {
      tally.noArticle++;
      continue;
    }
    // A town, or an article two places share, is not the identity of either.
    if (p !== city && (r.qid === cityQ || uses[r.qid] > 1 || !sameThing(p.name, r.title))) {
      tally.other++;
      continue;
    }
    // No coordinates: an idea (tango, sandboarding), not a spot on the map.
    if (!r.coords || km(p, r.coords) > (p === city ? CITY_MAX_KM : MAX_KM)) {
      tally.far++;
      continue;
    }
    p.wikidata = r.qid;
    tally.ids++;
    const loc = lang && lang !== 'en' ? localName(p.name, lab.get(r.qid), lang) : null;
    if (loc) {
      p.local = loc;
      tally.local++;
    }
  }
  await writeFile(fp, JSON.stringify(city, null, 2) + '\n');
}
console.log(
  `${tally.ids} identities, ${tally.local} local names, ${tally.noArticle} titles with no article, ${tally.far} articles too far from the pin, ${tally.other} articles about something else`,
);
