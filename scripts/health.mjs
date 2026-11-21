// Is the live site up? Fetches the page and the two files it needs, and fails with a plain
// sentence if anything is wrong. Run by .github/workflows/health.yml every day.
//   node scripts/health.mjs [url]
const base = (process.argv[2] || process.env.SITE_URL || 'https://tandemroads.com/').replace(
  /\/?$/,
  '/',
);

async function get(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
      if (res.ok) return await res.text();
      if (attempt === 3) throw Error(`${url} answered ${res.status}`);
    } catch (e) {
      if (attempt === 3) throw Error(`${url} could not be loaded (${e.message})`);
    }
    await new Promise((r) => setTimeout(r, 15000));
  }
}

try {
  const html = await get(base);
  if (!html.includes('Tandem Roads')) throw Error(`${base} loaded but is not the app`);
  const files = [...html.matchAll(/(?:src|href)="((?:app|data)\.[0-9a-f]+\.js)"/g)].map(
    (m) => m[1],
  );
  const need = ['app', 'data'].filter((n) => !files.some((f) => f.startsWith(n + '.')));
  if (need.length) throw Error(`the page does not link its ${need.join(' and ')} file`);
  for (const f of new Set(files)) {
    const body = await get(base + f);
    if (body.length < 10000) throw Error(`${f} is only ${body.length} bytes`);
  }
  console.log(`OK: ${base} is up (${[...new Set(files)].join(', ')})`);
} catch (e) {
  console.error('Site check failed: ' + e.message);
  process.exit(1);
}
