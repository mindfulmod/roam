// Works out one soft colour per local photo and keeps it in data/photo-tones.json, so a card
// shows the photo's own colour while the photo loads instead of an empty box.
// Run after adding photos: node scripts/photo-tones.mjs (only photos without a tone are read).
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const read = async (f) => JSON.parse(await readFile(path.join(root, f), 'utf8'));
const out = path.join(root, 'data/photo-tones.json');
const photos = await read('data/photos.json');
let tones = {};
try {
  tones = await read('data/photo-tones.json');
} catch {
  // First run.
}
const todo = Object.entries(photos).filter(
  ([id, p]) => !tones[id] && p.data && !/^https?:/.test(p.data),
);
const browser = await chromium.launch();
const page = await browser.newPage();
let done = 0;
for (const [id, p] of todo) {
  const type = p.data.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  let b64;
  try {
    b64 = (await readFile(path.join(root, p.data))).toString('base64');
  } catch {
    continue;
  }
  tones[id] = await page.evaluate(
    async ([b64, type]) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const img = await createImageBitmap(new Blob([bytes], { type }));
      const c = new OffscreenCanvas(4, 4),
        g = c.getContext('2d');
      g.drawImage(img, 0, 0, 4, 4);
      const d = g.getImageData(0, 0, 4, 4).data;
      let r = 0,
        gr = 0,
        b = 0;
      for (let i = 0; i < d.length; i += 4) ((r += d[i]), (gr += d[i + 1]), (b += d[i + 2]));
      // Average, then pulled a little toward the middle so text never sits on a harsh block.
      const n = d.length / 4,
        soft = (v) => Math.round((v / n) * 0.85 + 128 * 0.15);
      return '#' + [r, gr, b].map((v) => soft(v).toString(16).padStart(2, '0')).join('');
    },
    [b64, type],
  );
  done++;
}
await browser.close();
const sorted = Object.fromEntries(
  Object.keys(tones)
    .sort()
    .map((k) => [k, tones[k]]),
);
await writeFile(out, JSON.stringify(sorted, null, 2) + '\n');
console.log(`${done} new tones, ${Object.keys(sorted).length} in all`);
