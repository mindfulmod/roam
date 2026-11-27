'use strict';
const CITIES = DATA.cities,
  C = Object.fromEntries(CITIES.map((c) => [c.id, c]));
const PLACES = CITIES.flatMap((c) =>
    c.items.map((p) => ({ ...p, cityId: c.id, cityName: c.name, currency: c.currency })),
  ),
  P = Object.fromEntries(PLACES.map((p) => [p.id, p])),
  SHOPS = Object.fromEntries(
    CITIES.flatMap((c) => (c.shopping?.spots || []).map((x) => [x.id, { ...x, cityId: c.id }])),
  );
// The hosted build keeps each city's long text (practical notes, why-go reasons, sources and
// extra photos) in its own file, fetched the first time that city or one of its places opens.
// The merged fields land on the same objects (C, P, the city's items), so code that runs after
// a load sees one complete city. The single-file build has no DATA.detail: everything is inline.
const DETAIL = DATA.detail || {},
  GALLERY_N = DATA.galleryN || {},
  cityLoads = {};
const cityReady = (id) => !DETAIL[id] || cityLoads[id]?.done === true;
function mergeCity(id, d) {
  const c = C[id],
    own = Object.fromEntries(c.items.map((x) => [x.id, x]));
  Object.assign(c, d.c);
  for (const [pid, x] of Object.entries(d.i || {}))
    for (const t of [own[pid], P[pid]]) {
      if (!t) continue;
      const { signals, ...rest } = x;
      Object.assign(t, rest);
      if (signals) t.signals = signals;
    }
  for (const [gid, list] of Object.entries(d.g || {})) GALLERY[gid] = list.map(galleryEntry);
}
function loadCity(id) {
  if (cityReady(id)) return Promise.resolve();
  let job = cityLoads[id];
  if (!job || job.failed) {
    job = cityLoads[id] = { done: false };
    job.p = fetch(DETAIL[id])
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(
        (d) => {
          mergeCity(id, d);
          job.done = true;
        },
        (e) => {
          job.failed = true;
          throw e;
        },
      );
  }
  return job.p;
}
const loadCities = (ids) => Promise.all([...new Set(ids)].filter(validCity).map(loadCity));
// Runs `then` at once when the cities are here (returns true). Otherwise fetches them, shows
// `wait` meanwhile, and runs `then` once they arrive if the person is still on the same screen.
function withCities(ids, then, wait) {
  const miss = [...new Set(ids)].filter((id) => validCity(id) && !cityReady(id));
  if (!miss.length) return true;
  const at = location.hash;
  wait?.();
  loadCities(miss).then(
    () => location.hash === at && then(),
    () => {
      if (location.hash !== at) return;
      if (wait) $('#app').innerHTML = loadFailed();
      else toast('That city’s details didn’t load. Check your connection and try again.');
    },
  );
  return false;
}
// While a city's details download, show the shape of the page (grey blocks that shimmer) rather
// than an empty screen, so it feels like it is arriving, not stuck. Screen readers hear "Loading".
const skel = (cls) => `<div class="skel ${cls}"></div>`;
const skelCards = (n = 3) =>
  `<div class="skel-cards">${Array.from({ length: n }, () => `<div class="skel-card">${skel('skel-photo')}${skel('skel-line w70')}${skel('skel-line w40')}</div>`).join('')}</div>`;
const loadingPage = (head = '') =>
  `<div class="wrap skel-page" aria-busy="true"><span class="sr-only">Loading</span>${head || skel('skel-hero')}${skel('skel-line skel-title w50')}${skelCards()}${skel('skel-line w90')}${skel('skel-line w70')}</div>`;
const loadFailed = () =>
  `<div class="wrap"><div class="empty">${icon('globe')}<h2>This page didn’t load.</h2><p>Check your connection, then try again.</p><button class="btn" data-action="retry">Try again</button></div></div>`;
const PHOTO = DATA.photos,
  CHECKED = '4 November 2026';
const validCity = (id) => typeof id === 'string' && Object.hasOwn(C, id),
  validPlace = (id) => typeof id === 'string' && Object.hasOwn(P, id);
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T12:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
const $ = (s) => document.querySelector(s),
  $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const paths = {
  chat: 'M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-5 4v-4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  search: 'm21 21-4.5-4.5M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  camera:
    'M3 8a2 2 0 0 1 2-2h2.5l1.5-2h6l1.5 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2ZM15.5 13a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0',
  left: 'M19 12H5m5-5-5 5 5 5',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  map: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16m6-14v16',
  heart:
    'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  plus: 'M12 5v14M5 12h14',
  check: 'm5 12 4 4L19 6',
  clock: 'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  route:
    'M5 3v12a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4V9M8 3a3 3 0 1 1-6 0 3 3 0 0 1 6 0M22 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  compass: 'm16 8-2 6-6 2 2-6Zm6 4a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  book: 'M4 3h6a3 3 0 0 1 3 3v15a4 4 0 0 0-4-3H3V3Zm9 3a3 3 0 0 1 3-3h5v15h-4a4 4 0 0 0-4 3',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  upload: 'M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5',
  external: 'M14 3h7v7M21 3l-9 9M10 3H4v17h17v-6',
  close: 'm6 6 12 12M6 18 18 6',
  star: 'm12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4L2.8 9.7l6.4-.9Z',
  sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
  wallet: 'M3 6h17v15H3V6Zm0 0V3h14v3M20 11h-6v5h6',
  train:
    'M7 3h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3ZM4 10h16M8 15h.01M16 15h.01M7 19l-2 3m12-3 2 3',
  food: 'M4 2v6c0 3 6 3 6 0V2M7 2v20M19 2c-4 4-4 10 0 10V2Zm0 10v10',
  bag: 'M4 7h16l1 15H3Zm4 0V5a4 4 0 0 1 8 0v2',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  up: 'm6 15 6-6 6 6',
  down: 'm6 9 6 6 6-6',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  info: 'M12 11v6M12 7h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  locate: 'M12 2v3m0 14v3M2 12h3m14 0h3M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  print: 'M7 9V3h10v6M7 17H3V9h18v8h-4M7 14h10v8H7Z',
  shuffle: 'm3 5 4 0 10 14h4m-4-4 4 4-4 3M3 19h4L17 5h4m-4-3 4 3-4 4',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  expand: 'M15 3h6v6M21 3l-7 7M9 21H3v-6M3 21l7-7',
  grid: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',
  zoomin: 'm21 21-4.3-4.3M11 8v6M8 11h6M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  zoomout: 'm21 21-4.3-4.3M8 11h6M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  globe: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M2 12h20M12 2c5 5 5 15 0 20-5-5-5-15 0-20',
  moon: 'M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10Z',
  contrast: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 2v20',
  share: 'M12 15V3m-4 4 4-4 4 4M6 11H4v10h16V11h-2',
  calendar: 'M4 5h16v16H4ZM4 10h16M8 3v4m8-4v4',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  eyeoff:
    'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  pencil: 'M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4',
  ripple:
    'M12 12h.01M15.5 8.5a5 5 0 0 1 0 7M8.5 15.5a5 5 0 0 1 0-7M18.4 5.6a9 9 0 0 1 0 12.8M5.6 18.4a9 9 0 0 1 0-12.8',
  friends:
    'M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20M9 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M22 20v-1.5a4 4 0 0 0-3-3.9M15.5 3.7a3.5 3.5 0 0 1 0 6.6',
  link: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1m2 5a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
};
// The offline world outline, painted in the current theme's land and border colours.
function outlineStyle() {
  return {
    color: themeColor('--map-border', '#bbccc1'),
    weight: 1,
    fillColor: themeColor('--map-land', '#eef0df'),
    fillOpacity: 1,
  };
}
function repaintMapTheme() {
  for (const m of [map, stayMap])
    m?.eachLayer((l) => {
      if (l.feature || l instanceof L.GeoJSON) l.setStyle?.(outlineStyle());
    });
}
function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.pin}"/></svg>`;
}
const defaultState = () => ({
  saved: [],
  shops: [],
  moods: [],
  trip: [],
  days: {},
  visited: [],
  notes: {},
  startDate: '',
  pace: 'balanced',
  people: 1,
  lodging: {},
  extra: {},
  street: true,
  checklist: [],
  stays: {},
  budget: defaultBudget(),
});
let S = defaultState(),
  storageOK = true;
try {
  const s = JSON.parse(localStorage.getItem('roam-atlas-v1') || 'null');
  if (s) S = cleanState(s);
} catch (e) {
  storageOK = false;
}
function cleanState(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return defaultState();
  const d = defaultState();
  d.saved = [...new Set(Array.isArray(s.saved) ? s.saved : [])]
    .filter(validPlace)
    .slice(0, PLACES.length);
  d.shops = [...new Set(Array.isArray(s.shops) ? s.shops : [])].filter((id) =>
    Object.hasOwn(SHOPS, id),
  );
  d.moods = (Array.isArray(s.moods) ? s.moods : [])
    .filter((m) => ['food', 'nature', 'history', 'beach', 'bigcity', 'quiet'].includes(m))
    .slice(0, 2);
  d.trip = [...new Set(Array.isArray(s.trip) ? s.trip : [])]
    .filter(validCity)
    .slice(0, CITIES.length);
  d.visited = [...new Set(Array.isArray(s.visited) ? s.visited : [])].filter(validPlace);
  for (const id of CITIES.map((c) => c.id)) {
    if (Number.isFinite(Number(s.days?.[id])))
      d.days[id] = Math.min(21, Math.max(1, Math.round(Number(s.days[id]))));
    if (Number.isFinite(Number(s.lodging?.[id])))
      d.lodging[id] = Math.min(1e8, Math.max(0, Number(s.lodging[id])));
    if (Number.isFinite(Number(s.extra?.[id])))
      d.extra[id] = Math.min(1e9, Math.max(0, Number(s.extra[id])));
  }
  for (const id of [...CITIES.map((c) => c.id), ...PLACES.map((p) => p.id)]) {
    if (typeof s.notes?.[id] === 'string') d.notes[id] = s.notes[id].slice(0, 4000);
  }
  for (const id of CITIES.map((c) => c.id)) {
    const stay = normalStay(s.stays?.[id]);
    if (stay) d.stays[id] = stay;
  }
  d.startDate = validDate(s.startDate) ? s.startDate : '';
  d.pace = ['relaxed', 'balanced', 'full'].includes(s.pace) ? s.pace : 'balanced';
  d.people = Math.min(20, Math.max(1, Math.round(Number(s.people) || 1)));
  d.street = s.street !== false;
  d.budget = cleanBudget(s.budget);
  d.checklist = Array.isArray(s.checklist)
    ? s.checklist.filter((x) => typeof x === 'string' && x.length < 80).slice(0, 30)
    : [];
  return d;
}
function persist() {
  try {
    localStorage.setItem('roam-atlas-v1', JSON.stringify(S));
  } catch (e) {
    storageOK = false;
    toast('Browser saving is unavailable. Export your trip to keep it.');
  }
  updateCounts();
}
let browseQuery = '',
  browseRegion = 'All',
  cityFilter = 'see',
  placeSort = 'popularity',
  map = null,
  markerLayer = null,
  streetLayer = null,
  routeLayer = null,
  mapMarkers = {},
  mapCity = '',
  mapKind = 'all',
  mapQuery = '',
  mapDiet = 'all',
  modalFocus = null,
  toastTimer = null;
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function num(n) {
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function money(n, c) {
  return `${c} ${num(n)}`;
}
function range(r, c) {
  return r[0] === r[1] ? money(r[0], c) : `${c} ${num(r[0])}–${num(r[1])}`;
}
function priceLabel(p) {
  if (p.price[1] === 0)
    return /pass|admission|included|ticket/i.test(p.priceNote || '')
      ? 'Covered by entry / pass'
      : 'Free to explore';
  return range(p.price, p.currency);
}
function imageFor(id) {
  return PHOTO[id]?.data || '';
}
function photoTag(id, cls = '', lazy = true) {
  const p = PHOTO[id];
  if (p)
    return `<img src="${p.data}" alt="${esc(p.alt || p.title)}" class="photo${cls ? ' ' + cls : ''}" ${lazy ? 'loading="lazy"' : ''} decoding="async">`;
  // Newer listings may not have a vetted photo yet: show an honest placeholder, never a borrowed image.
  const x = P[id];
  if (!x) return '';
  const m = x.michelin;
  return `<div class="nophoto${cls ? ' ' + cls : ''}" role="img" aria-label="No photo yet for ${esc(x.name)}"><span>${esc(x.cuisine || x.area || x.name)}</span>${m ? `<b>${esc(michelinShort(x))}</b>` : ''}<small>No photo yet</small></div>`;
}
// MICHELIN Guide recognition is an inspector award for cooking, kept apart from popularity.
const FOOD_FILTERS = ['restaurants', 'eat', 'michelin'];
function michelinShort(p) {
  const m = p.michelin;
  if (!m) return '';
  return m.stars ? `${m.stars} MICHELIN Star${m.stars > 1 ? 's' : ''}` : 'Bib Gourmand';
}
function michelinPill(p) {
  const m = p.michelin;
  if (!m) return '';
  // Plain words in our own style: no star symbols or guide colours, so it never looks like Michelin's mark.
  return `<span class="michelin-pill" title="${esc(m.label)} · MICHELIN Guide">${esc(michelinShort(p))}</span>`;
}
const MICHELIN_MEANING = {
  3: 'exceptional cuisine, worth a special journey',
  2: 'excellent cooking, worth a detour',
  1: 'high-quality cooking',
  0: 'good quality, good value cooking',
};
function michelinRow(p) {
  const m = p.michelin;
  if (!m) return '';
  return `<div class="recognition"><div class="signal-head"><strong>MICHELIN Guide</strong>${michelinPill(p)}</div><p>${esc(m.label)}: ${esc(MICHELIN_MEANING[m.stars] || '')}. Awarded by the guide’s anonymous inspectors for the cooking. It is a quality award, not a popularity count, so it is shown alongside the rank rather than mixed into it.</p><small>${external(m.url, 'See it in the MICHELIN Guide ↗')}${m.checked ? ' · checked ' + esc(m.checked) : ''}</small><small class="michelin-note">Tandem Roads is not affiliated with or endorsed by Michelin.</small></div>`;
}
