'use strict';
// Light and dark themes. With no choice saved the app follows the device; the header button
// cycles device → light → dark. The choice lives in its own key so trip backups don't carry it.
const THEME_KEY = 'roam-atlas-theme';
function savedTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : '';
  } catch (e) {
    return '';
  }
}
function isDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}
function applyTheme(t = savedTheme()) {
  const root = document.documentElement;
  if (t) root.dataset.theme = t;
  else delete root.dataset.theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', isDark() ? '#0e1413' : '#165b4e');
  const b = document.querySelector('#theme-btn');
  if (b) {
    const label = t === 'dark' ? 'Dark' : t === 'light' ? 'Light' : 'Match device';
    b.innerHTML = icon(t === 'dark' ? 'moon' : t === 'light' ? 'sun' : 'contrast');
    b.setAttribute('aria-label', `Theme: ${label}. Change theme`);
    b.title = `Theme: ${label}`;
  }
  // Leaflet layers are painted with explicit colours, so redraw the outline in the new palette.
  if (typeof repaintMapTheme === 'function') repaintMapTheme();
}
function cycleTheme() {
  const order = ['', 'light', 'dark'],
    next = order[(order.indexOf(savedTheme()) + 1) % order.length];
  try {
    if (next) localStorage.setItem(THEME_KEY, next);
    else localStorage.removeItem(THEME_KEY);
  } catch (e) {}
  applyTheme(next);
  if (typeof toast === 'function')
    toast(
      next ? `${next === 'dark' ? 'Dark' : 'Light'} theme on.` : 'Theme now matches your device.',
    );
}
// Colours read from CSS so map layers follow the theme.
function themeColor(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());
