// Renders the PNG app icons from the SVGs in images/brand/ (made by scripts/brand/ampersand.py).
//   node scripts/brand/make-icons.mjs
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'images', 'brand');
const jobs = [
  ['favicon.svg', 'favicon-32.png', 32],
  ['icon.svg', 'apple-touch-icon.png', 180],
  ['icon.svg', 'icon-192.png', 192],
  ['icon.svg', 'icon-512.png', 512],
  ['icon-maskable.svg', 'maskable-512.png', 512],
];
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [src, out, size] of jobs) {
  const svg = (await readFile(path.join(dir, src), 'utf8')).replace(
    '<svg ',
    `<svg width="${size}" height="${size}" `,
  );
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`,
  );
  await page.screenshot({
    path: path.join(dir, out),
    omitBackground: true,
    clip: { x: 0, y: 0, width: size, height: size },
  });
  console.log('wrote', out);
}
await browser.close();
