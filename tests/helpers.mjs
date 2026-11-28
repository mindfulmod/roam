// Shared test helpers: a tiny static server over dist/ and a browser page that never
// leaves it (map tiles, photos and fonts on other hosts are blocked, so runs are repeatable).
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const require = createRequire(import.meta.url);
export const { chromium } = require('playwright');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

export async function serveDist() {
  const server = http.createServer(async (req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(dist, url.endsWith('/') ? url + 'index.html' : url);
    if (!file.startsWith(dist)) return res.writeHead(403).end();
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        'content-type': types[path.extname(file)] || 'application/octet-stream',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

export const PHONE = { width: 390, height: 844 };

// A page on the built app. `state` is written to localStorage before the app starts.
// `allow` lists other origins the page may reach (a real local accounts project, in
// tests/e2e/browser.e2e.mjs). Collects uncaught errors in page.errors.
export async function openApp(
  browser,
  origin,
  { state, viewport = PHONE, hash = '#/', sw = false, backend, session, allow = [] } = {},
) {
  // Reduced motion turns off the page's smooth scrolling, which otherwise races Playwright's own
  // scroll-into-view and leaves clicks below the fold retrying forever.
  const context = await browser.newContext({
    viewport,
    hasTouch: viewport.width < 800,
    reducedMotion: 'reduce',
    // The offline helper is off unless a test is about it: it would answer requests that
    // tests slow down or block on purpose.
    serviceWorkers: sw ? 'allow' : 'block',
  });
  await context.route(
    (u) => u.origin !== origin && !allow.includes(u.origin),
    (r) => r.abort(),
  );
  // Accounts switched on, against the stand-in in tests/fake-backend.mjs; optionally signed in.
  if (backend) {
    const { useBackend } = await import('./fake-backend.mjs');
    await useBackend(context, backend);
  }
  if (session)
    await context.addInitScript((s) => {
      if (!sessionStorage.getItem('test-session')) {
        localStorage.setItem('tandem-session-v1', JSON.stringify(s));
        sessionStorage.setItem('test-session', '1');
      }
    }, session);
  if (state !== undefined)
    await context.addInitScript((s) => {
      if (!sessionStorage.getItem('test-seeded')) {
        localStorage.setItem('roam-atlas-v1', typeof s === 'string' ? s : JSON.stringify(s));
        sessionStorage.setItem('test-seeded', '1');
      }
    }, state);
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e.stack || e)));
  // Anything the page's security policy refuses counts as an error too.
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) page.errors.push(m.text());
  });
  await page.goto(origin + '/' + hash);
  await page.waitForFunction(() => document.querySelector('#app')?.children.length > 0);
  return page;
}

// Go to another screen of the single-page app and let it draw.
export async function go(page, hash) {
  await page.evaluate((h) => {
    location.hash = h;
  }, hash);
  await page.waitForTimeout(350);
}
