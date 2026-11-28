// Suggests Wikipedia titles for sights whose title is missing or a disambiguation page in
// seeds/audit/report.json. Needs Wikipedia, so it runs in GitHub Actions (audit.yml,
// mode "suggest") and writes seeds/audit/suggest.json for review.
//
// For each such sight it lists articles within 2 km of the pin whose title shares a word
// with the place name, plus the top full-text search hits that have coordinates within 5 km.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'TandemRoads/2.0 (https://github.com/mindfulmod/roam)';
const API = 'https://en.wikipedia.org/w/api.php';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const km = (a, b) => {
  const r = Math.PI / 180,
    h =
      Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
      Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
let last = 0;
async function api(params, tries = 6) {
  const u = new URL(API);
  for (const [k, v] of Object.entries({ format: 'json', formatversion: 2, ...params }))
    u.searchParams.set(k, v);
  for (let i = 1; ; i++) {
    const wait = last + 120 - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const res = await fetch(u, { headers: { 'User-Agent': UA } });
    if (res.ok) return res.json();
    if (i >= tries || (res.status < 500 && res.status !== 429)) throw Error(`${res.status} ${u}`);
    await sleep(1000 * 2 ** i);
  }
}
const fold = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
const STOP = new Set(
  'the and of de la le el los las del di da do des du a an at on in to by with tour walk trip day boat ride view viewpoint sunset sunrise old town city park national museum church temple'.split(
    ' ',
  ),
);
const words = (s) =>
  fold(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

const report = JSON.parse(await readFile(path.join(root, 'seeds/audit/report.json'), 'utf8'));
const out = {};
for (const [cid, v] of Object.entries(report)) {
  if (!v.items) continue;
  const city = JSON.parse(await readFile(path.join(root, 'data/cities', cid + '.json'), 'utf8'));
  const byId = new Map(city.items.map((p) => [p.id, p]));
  for (const it of v.items) {
    const p = byId.get(it.id);
    if (!p || p.kind !== 'see' || p.noReadership) continue;
    if (it.status !== 'missing' && it.status !== 'disambiguation') continue;
    const want = new Set(words(p.name + ' ' + it.wiki));
    const cands = new Map();
    try {
      const near = await api({
        action: 'query',
        list: 'geosearch',
        gscoord: `${p.lat}|${p.lon}`,
        gsradius: 2000,
        gslimit: 100,
        gsnamespace: 0,
      });
      for (const g of near.query?.geosearch || []) {
        const hit = words(g.title).filter((w) => want.has(w)).length;
        if (hit) cands.set(g.title, { title: g.title, km: Math.round(g.dist / 100) / 10, hit });
      }
      const q = await api({
        action: 'query',
        generator: 'search',
        gsrsearch: `${p.name} ${city.name}`,
        gsrlimit: 5,
        gsrnamespace: 0,
        prop: 'coordinates',
      });
      for (const g of q.query?.pages || []) {
        const c = g.coordinates?.[0];
        if (!c || cands.has(g.title)) continue;
        const d = km(p, c);
        if (d <= 5)
          cands.set(g.title, {
            title: g.title,
            km: Math.round(d * 10) / 10,
            hit: words(g.title).filter((w) => want.has(w)).length,
            search: true,
          });
      }
    } catch (e) {
      console.warn(`${p.name}: ${e.message}`);
      continue;
    }
    const list = [...cands.values()].sort((a, b) => b.hit - a.hit || a.km - b.km).slice(0, 4);
    if (list.length)
      out[p.id] = { city: cid, name: p.name, wiki: it.wiki, status: it.status, candidates: list };
  }
  console.log(`${cid}: done`);
}
await writeFile(path.join(root, 'seeds/audit/suggest.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`Suggestions for ${Object.keys(out).length} places.`);
