// Content audit for city guides. Needs Wikipedia, so it runs in GitHub Actions
// (.github/workflows/audit.yml) and commits seeds/audit/report.json back to the branch.
//
//   node scripts/audit-content.mjs                    # every city
//   node scripts/audit-content.mjs --city kyoto,nara  # some cities
//   (or list ids in seeds/audit/request.json as {"cities": [...]})
//
// For each city it reports:
//   items:  every sight's Wikipedia title: missing, disambiguation, redirect target, short
//           description, whether the article has coordinates (no coordinates usually means
//           a topic such as "Scuba diving", whose readership must not rank a place) and how
//           far the article's coordinates are from the pin.
//   nearby: the most-read Wikipedia articles with coordinates within 10 km of the centre
//           that no place in the city points to, as candidates for missing sights.
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
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
// Runs a query to the end, merging pages across "continue" rounds.
async function queryAll(params) {
  const pages = new Map(),
    meta = { redirects: [], normalized: [] };
  let cont = {};
  for (let round = 0; round < 40; round++) {
    const j = await api({ action: 'query', ...params, ...cont });
    for (const k of ['redirects', 'normalized']) meta[k].push(...(j.query?.[k] || []));
    for (const p of j.query?.pages || []) {
      const old = pages.get(p.title) || {};
      pages.set(p.title, {
        ...old,
        ...p,
        pageviews: { ...(old.pageviews || {}), ...(p.pageviews || {}) },
      });
    }
    if (!j.continue) break;
    cont = j.continue;
  }
  return { pages, ...meta };
}
const views = (p) => Object.values(p.pageviews || {}).reduce((s, v) => s + (v || 0), 0);

const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
let only = arg('--city')?.split(',');
if (!only) {
  const req = await readFile(path.join(root, 'seeds/audit/request.json'), 'utf8').catch(() => '');
  if (req) only = JSON.parse(req).cities?.length ? JSON.parse(req).cities : null;
}
const dir = path.join(root, 'data/cities');
const files = (await readdir(dir)).filter(
  (f) => f.endsWith('.json') && (!only || only.includes(f.slice(0, -5))),
);
const report = {};
for (const f of files.sort()) {
  const city = JSON.parse(await readFile(path.join(dir, f), 'utf8'));
  const sights = city.items.filter((p) => p.wiki);
  const titles = [...new Set([city.wiki, ...sights.map((p) => p.wiki)].filter(Boolean))];
  const resolved = new Map();
  try {
    for (let i = 0; i < titles.length; i += 50) {
      const q = await queryAll({
        titles: titles.slice(i, i + 50).join('|'),
        redirects: 1,
        prop: 'coordinates|pageprops|description|pageviews',
        ppprop: 'disambiguation',
        pvipdays: 60,
      });
      const norm = new Map(q.normalized.map((n) => [n.from, n.to])),
        redir = new Map(q.redirects.map((r) => [r.from, r.to]));
      for (const t of titles.slice(i, i + 50)) {
        const n = norm.get(t) || t,
          page = q.pages.get(redir.get(n) || n);
        resolved.set(t, page);
      }
    }
    const cityTitle = resolved.get(city.wiki)?.title;
    const items = [];
    for (const p of city.items) {
      if (!p.wiki) continue;
      const page = resolved.get(p.wiki);
      const c = page?.coordinates?.[0];
      items.push({
        id: p.id,
        kind: p.kind,
        name: p.name,
        wiki: p.wiki,
        title: page && !page.missing ? page.title : null,
        status:
          !page || page.missing
            ? 'missing'
            : page.pageprops?.disambiguation !== undefined
              ? 'disambiguation'
              : page.title === cityTitle
                ? 'city-article'
                : !c
                  ? 'no-coordinates'
                  : 'ok',
        km: c ? Math.round(km(p, c) * 10) / 10 : null,
        description: page?.description || '',
        views60: page ? views(page) : 0,
      });
    }
    const used = new Set([cityTitle, ...items.map((x) => x.title)].filter(Boolean));
    const near = await queryAll({
      generator: 'geosearch',
      ggscoord: `${city.lat}|${city.lon}`,
      ggsradius: 10000,
      ggslimit: 500,
      ggsnamespace: 0,
      prop: 'pageviews|description|coordinates',
      pvipdays: 60,
    });
    const nearby = [...near.pages.values()]
      .filter((p) => !used.has(p.title))
      .map((p) => ({
        title: p.title,
        description: p.description || '',
        views60: views(p),
        km: p.coordinates?.[0] ? Math.round(km(city, p.coordinates[0]) * 10) / 10 : null,
      }))
      .sort((a, b) => b.views60 - a.views60)
      .slice(0, 15);
    report[city.id] = {
      name: city.name,
      cityViews60: views(resolved.get(city.wiki) || {}),
      items,
      nearby,
    };
    console.log(`${city.name}: ${items.length} titles, ${nearby.length} nearby`);
  } catch (e) {
    console.warn(`${city.name}: ${e.message}`);
    report[city.id] = { name: city.name, error: e.message };
  }
}
await mkdir(path.join(root, 'seeds/audit'), { recursive: true });
await writeFile(path.join(root, 'seeds/audit/report.json'), JSON.stringify(report, null, 1) + '\n');
console.log(`Audited ${Object.keys(report).length} cities.`);
