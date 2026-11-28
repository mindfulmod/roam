// Adds places to cities that already exist (the city review, missing must-sees).
//   seeds/places/<batch>.json = { "<city id>": [place seed, ...] }   (place fields: seeds/README.md)
//   node scripts/add-places.mjs            # adds places whose id is new, keeps the rest
//   node scripts/add-places.mjs --force    # also replaces places that already exist
// Then run the "Enrich new cities" workflow with those city ids for pins, photos and readers.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildItem, slug } from './add-city.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const force = process.argv.includes('--force');
const dir = path.join(root, 'seeds/places');
const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith('.json')).sort();
let added = 0,
  replaced = 0;
const touched = new Set();
for (const f of files) {
  const batch = JSON.parse(await readFile(path.join(dir, f), 'utf8'));
  for (const [cityId, seeds] of Object.entries(batch)) {
    const fp = path.join(root, 'data/cities', cityId + '.json');
    const city = JSON.parse(await readFile(fp, 'utf8'));
    const ctx = { id: city.id, plainName: city.name.split(' · ')[0], lat: city.lat, lon: city.lon };
    for (const s of seeds) {
      const others = new Set(city.items.map((p) => p.id));
      const id = `${city.id}-${slug(s.id || s.name)}`;
      const at = city.items.findIndex((p) => p.id === id);
      if (at >= 0 && !force) continue;
      others.delete(id);
      const item = buildItem(s, ctx, others);
      if (at >= 0) {
        city.items[at] = item;
        replaced++;
      } else {
        // Sights go after the last sight so the list keeps its order by kind.
        const lastSee = city.items.map((p) => p.kind).lastIndexOf(s.kind);
        city.items.splice(lastSee + 1, 0, item);
        added++;
      }
      touched.add(cityId);
    }
    await writeFile(fp, JSON.stringify(city, null, 2) + '\n');
  }
}
console.log(`Added ${added}, replaced ${replaced} places in: ${[...touched].join(',')}`);
