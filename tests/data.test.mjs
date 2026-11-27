// Guide data checks. These run without a browser and catch the mistakes that are easy to make
// when a city file is edited by hand or by a script.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { root } from './helpers.mjs';

const json = async (p) => JSON.parse(await readFile(path.join(root, p), 'utf8'));
const meta = await json('data/meta.json');
const files = (await readdir(path.join(root, 'data/cities'))).filter((f) => f.endsWith('.json'));
const cities = await Promise.all(files.map((f) => json('data/cities/' + f)));

test('every city file is listed once in meta.cityOrder, and nothing else is', () => {
  assert.deepEqual([...meta.cityOrder].sort(), files.map((f) => f.slice(0, -5)).sort());
  assert.equal(new Set(meta.cityOrder).size, meta.cityOrder.length);
});

test('city ids match their file names and are safe to use in links', () => {
  for (const [i, c] of cities.entries()) {
    assert.equal(c.id + '.json', files[i]);
    assert.match(c.id, /^[a-z0-9-]+$/);
  }
});

test('cities have a name, a country and coordinates on the globe', () => {
  for (const c of cities) {
    assert.ok(c.name && c.country, c.id);
    assert.ok(Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180, c.id);
    assert.ok(Array.isArray(c.items) && c.items.length > 0, c.id + ' has no places');
  }
});

test('place ids are unique across the whole guide and safe to use in links', () => {
  const seen = new Map();
  for (const c of cities)
    for (const p of c.items) {
      assert.match(String(p.id), /^[a-z0-9-]+$/, `${c.id}: ${p.id}`);
      assert.ok(!seen.has(p.id), `${p.id} is in both ${seen.get(p.id)} and ${c.id}`);
      seen.set(p.id, c.id);
    }
});

test('places have a name, a kind and coordinates near their city', () => {
  const km = (a, b) => {
    const r = Math.PI / 180,
      x = (b.lon - a.lon) * r * Math.cos(((a.lat + b.lat) / 2) * r),
      y = (b.lat - a.lat) * r;
    return Math.hypot(x, y) * 6371;
  };
  for (const c of cities)
    for (const p of c.items) {
      assert.ok(p.name && p.kind, `${c.id}: ${p.id}`);
      assert.ok(Number.isFinite(p.lat) && Number.isFinite(p.lon), `${p.id} has no coordinates`);
      // Day trips can be far out; this only catches swapped or mistyped coordinates.
      assert.ok(km(c, p) < 600, `${p.id} is ${Math.round(km(c, p))} km from ${c.id}`);
    }
});

test('links in the guide data are http(s) only', async () => {
  const bad = [];
  const walk = (v, where) => {
    if (typeof v === 'string') {
      if (/^\s*(javascript|data|vbscript):/i.test(v)) bad.push(where);
    } else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) walk(x, where + '.' + k);
  };
  for (const c of cities) walk(c, c.id);
  for (const f of ['shopping.json', 'stories.json', 'costs.json']) walk(await json('data/' + f), f);
  assert.deepEqual(bad, []);
});
