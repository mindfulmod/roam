// The guide's places, as rows for the database's `places` table (kind 'guide'). A stop on a
// shared trip points at a place row, so every guide place the app can log has to be there too.
// Ids are the same as in data/cities (for example "kyoto-fushimi").
//
// Used by scripts/supabase/connect.mjs, which writes them to the live project whenever the
// Connect accounts workflow runs (also after any merged change to data/cities), and by the
// end-to-end tests on a local Supabase:
//
//   node scripts/supabase/guide-places.mjs > guide-places.sql   # every batch, for psql
//
// Each batch travels as hex-encoded JSON, so no name in the guide can change the SQL. Rows are
// added or updated, never removed: a stop logged at a place the guide later drops keeps it.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = async (p) => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const ID = /^[a-z0-9][a-z0-9-]{0,118}$/;
const text = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
const coord = (v, lim) => (Number.isFinite(v) && Math.abs(v) <= lim ? v : null);

export async function guidePlaces() {
  const meta = await readJson('data/meta.json'),
    rows = new Map();
  for (const cid of meta.cityOrder) {
    const c = await readJson(`data/cities/${cid}.json`);
    for (const x of c.items || []) {
      // Member places use ids that start with "u-"; the guide never does.
      if (!ID.test(x.id || '') || x.id.startsWith('u-') || rows.has(x.id)) continue;
      const name = text(x.name, 120);
      if (!name) continue;
      rows.set(x.id, {
        id: x.id,
        name,
        local_name: text(x.local?.name, 120),
        lat: coord(x.lat, 90),
        lon: coord(x.lon, 180),
        city_id: c.id,
        country: text(c.country, 80),
      });
    }
  }
  return [...rows.values()];
}

// The rows as upserts of up to `size` places each.
export function guideSql(rows, size = 400) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) {
    const hex = Buffer.from(JSON.stringify(rows.slice(i, i + size)), 'utf8').toString('hex');
    out.push(
      `insert into public.places (id, kind, name, local_name, lat, lon, city_id, country)
select r.id, 'guide', r.name, r.local_name, r.lat, r.lon, r.city_id, r.country
from jsonb_to_recordset(convert_from(decode('${hex}', 'hex'), 'UTF8')::jsonb)
  as r(id text, name text, local_name text, lat double precision, lon double precision, city_id text, country text)
where r.id !~ '^u-'
on conflict (id) do update
  set name = excluded.name, local_name = excluded.local_name, lat = excluded.lat,
      lon = excluded.lon, city_id = excluded.city_id, country = excluded.country
  where public.places.kind = 'guide'`,
    );
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rows = await guidePlaces();
  process.stdout.write(guideSql(rows).join(';\n') + ';\n');
  console.error(`${rows.length} guide places`);
}
