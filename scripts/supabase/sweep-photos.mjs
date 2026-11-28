// Removes photo files that no photo points at any more. The database deletes a photo's row when
// its traveller deletes it, leaves the trip or leaves Tandem Roads, or when the whole trip is
// deleted, but the file itself can only be removed through the storage service. A phone removing
// its own photo deletes the file too; this catches everything else, so leaving really does take
// your photos with you. Files younger than a day are left alone, because a phone sends a photo's
// file a moment before its row.
//
// Run every day by .github/workflows/sweep-photos.yml. It needs either:
//   SUPABASE_URL and SUPABASE_SERVICE_KEY   a local Supabase (the end-to-end tests), or
//   SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF   the live project, whose server key is fetched
//   through the Management API for this run only and never printed.
// `--min-age-hours=N` changes the one-day wait (the tests use 0).
const env = (k) => (process.env[k] || '').trim();
const BUCKET = 'trip-photos';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const FILE = new RegExp(`^(${UUID})/(${UUID})[._]`);
const ageArg = process.argv.find((a) => a.startsWith('--min-age-hours='));
const minAge = ageArg ? Number(ageArg.split('=')[1]) : 24;
if (!Number.isFinite(minAge) || minAge < 0)
  throw new Error('--min-age-hours needs a number of hours');

async function credentials() {
  if (env('SUPABASE_URL') && env('SUPABASE_SERVICE_KEY'))
    return { url: env('SUPABASE_URL').replace(/\/$/, ''), key: env('SUPABASE_SERVICE_KEY') };
  const token = env('SUPABASE_ACCESS_TOKEN'),
    ref = env('SUPABASE_PROJECT_REF');
  if (!token || !/^[a-z]{20}$/.test(ref)) {
    console.log(
      'Accounts are not set up yet (see docs/accounts-setup.md), so there is nothing to sweep.',
    );
    process.exit(0);
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Could not read the project's keys: HTTP ${res.status}`);
  const keys = await res.json();
  const pick =
    keys.find((k) => k.type === 'secret' && k.api_key) ||
    keys.find((k) => k.type === 'legacy' && k.name === 'service_role' && k.api_key);
  if (!pick) throw new Error('The project has no server key to sweep with.');
  return { url: `https://${ref}.supabase.co`, key: pick.api_key };
}

const { url, key } = await credentials();
// A new-style secret key goes in the apikey header alone; an older service key is a token too.
const headers = { apikey: key, 'Content-Type': 'application/json' };
if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
async function call(method, route, body) {
  const res = await fetch(url + route, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${route.split('?')[0]}: HTTP ${res.status}`);
  return text ? JSON.parse(text) : null;
}

// Every photo row there is, by id.
const photos = new Set();
for (let from = 0; ; from += 1000) {
  const page = await call('GET', `/rest/v1/photos?select=id&order=id&limit=1000&offset=${from}`);
  page.forEach((p) => photos.add(p.id));
  if (page.length < 1000) break;
}
// Every file in the bucket: one folder per trip.
async function list(prefix) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await call('POST', `/storage/v1/object/list/${BUCKET}`, {
      prefix,
      limit: 1000,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}
const folders = (await list('')).filter((x) => !x.id && new RegExp(`^${UUID}$`).test(x.name));
const cutoff = Date.now() - minAge * 3600e3,
  gone = [];
let files = 0;
for (const f of folders)
  for (const x of await list(f.name + '/')) {
    if (!x.id) continue;
    files++;
    const name = `${f.name}/${x.name}`,
      m = FILE.exec(name);
    const old = Date.parse(x.created_at || x.updated_at || 0) <= cutoff;
    if (old && (!m || !photos.has(m[2]))) gone.push(name);
  }
for (let i = 0; i < gone.length; i += 100)
  await call('DELETE', `/storage/v1/object/${BUCKET}`, { prefixes: gone.slice(i, i + 100) });
console.log(
  `${files} photo files in ${folders.length} trips; ${gone.length} with no photo left, removed.`,
);
