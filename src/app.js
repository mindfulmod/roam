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
  return `<div class="nophoto${m ? ' michelin' : ''}${cls ? ' ' + cls : ''}" role="img" aria-label="No photo yet for ${esc(x.name)}"><span>${esc(x.cuisine || x.area || x.name)}</span>${m ? `<b>${esc(michelinShort(x))}</b>` : ''}<small>No photo yet</small></div>`;
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
  return `<span class="michelin-pill${m.stars ? '' : ' bib'}" title="${esc(m.label)} · MICHELIN Guide">${m.stars ? '✦'.repeat(m.stars) + ' MICHELIN' : 'Bib Gourmand'}</span>`;
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
  return `<div class="recognition"><div class="signal-head"><strong>MICHELIN Guide</strong>${michelinPill(p)}</div><p>${esc(m.label)}: ${esc(MICHELIN_MEANING[m.stars] || '')}. Awarded by the guide’s anonymous inspectors for the cooking. It is a quality award, not a popularity count, so it is shown alongside the rank rather than mixed into it.</p><small>${external(m.url, 'MICHELIN Guide entry ↗')}${m.checked ? ' · checked ' + esc(m.checked) : ''}</small></div>`;
}
// Extra photos per place/city from Wikimedia Commons (hotlinked thumbnails, loaded on demand).
// data/gallery.json stores each photo as [file, hash, width, height, author, licence].
const GALLERY = Object.fromEntries(
  Object.entries(DATA.gallery || {}).map(([id, list]) => [
    id,
    list.map(([f, hh, w, h, a, l]) => ({ f, hh, w, h, a, l })),
  ]),
);
const commonsName = (f) =>
  encodeURIComponent(f.replace(/ /g, '_')).replace(
    /[!'()*]/g,
    (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase(),
  );
function licenceUrl(l) {
  const m = l.match(/^CC (BY(?:-SA)?) ([0-9.]+)/i);
  if (m) return `https://creativecommons.org/licenses/${m[1].toLowerCase()}/${m[2]}/`;
  if (/^CC0/i.test(l)) return 'https://creativecommons.org/publicdomain/zero/1.0/';
  return '';
}
function galleryFor(id) {
  return GALLERY[id] || [];
}
function galleryUrl(g, w = 960) {
  const n = commonsName(g.f);
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${g.hh[0]}/${g.hh}/${n}/${w}px-${n}`;
}
function galleryImg(g, lazy = true, sizes = '(max-width: 700px) 100vw, 760px') {
  return `<img class="photo" src="${esc(galleryUrl(g, 960))}" srcset="${esc(galleryUrl(g, 500))} 500w, ${esc(galleryUrl(g, 960))} 960w" sizes="${sizes}" width="${g.w}" height="${g.h}" alt="${esc(g.f.replace(/\.[a-z]+$/i, '').replace(/[_-]+/g, ' '))}" ${lazy ? 'loading="lazy"' : ''} decoding="async" referrerpolicy="no-referrer" onerror="this.closest('[data-gslide],.cityphoto,.gtile')?.remove()">`;
}
function galleryCredit(g) {
  const page = 'https://commons.wikimedia.org/wiki/File:' + commonsName(g.f),
    lu = licenceUrl(g.l);
  return `<a href="${esc(page)}" target="_blank" rel="noopener noreferrer">Photo: ${esc(g.a)} / Wikimedia Commons</a> · <a href="${esc(lu || page)}" target="_blank" rel="noopener noreferrer">${esc(g.l)}</a>`;
}
function photoCount(id) {
  const n = galleryFor(id).length;
  return n
    ? `<span class="photo-count" title="${n + 1} photos">${icon('camera')}${n + 1}</span>`
    : '';
}
// Photo area of a place or city sheet. Desktop gets a mosaic (one large photo and up to
// four beside it, as Airbnb and Booking do); phones get a swipeable carousel (Instagram).
// Either way, any photo opens the full-screen viewer below.
function galleryHero(id, firstSlide, label) {
  return galleryFor(id).length && !isMobile()
    ? galleryMosaic(id, firstSlide)
    : galleryCarousel(id, firstSlide, label);
}
function galleryMosaic(id, first) {
  const gal = galleryFor(id),
    n = gal.length + 1,
    shown = Math.min(n, 5);
  const tiles = gal
    .slice(0, shown - 1)
    .map(
      (g, i) =>
        `<button class="gtile" data-action="gal-open" data-id="${id}" data-i="${i + 1}" aria-label="View photo ${i + 2} of ${n} full screen">${galleryImg(g, false, '(max-width: 1100px) 25vw, 240px')}</button>`,
    )
    .join('');
  return `<div class="gmosaic n${shown}"><figure class="gtile main" id="place-visual-main" data-action="gal-open" data-id="${id}" data-i="0" role="button" tabindex="0" aria-label="View photo 1 of ${n} full screen">${first}</figure>${tiles}<button class="gall" data-action="gal-open" data-id="${id}" data-i="0">${icon('grid')} Show all ${n} photos</button></div>`;
}
// Swipeable carousel: first slide is the existing main visual, then the Commons photos.
function galleryCarousel(id, firstSlide, label) {
  const gal = galleryFor(id),
    open = (i) =>
      `data-action="gal-open" data-id="${id}" data-i="${i}" role="button" tabindex="-1" aria-label="View photo ${i + 1} full screen"`;
  const slides =
    `<figure class="gslide" data-gslide id="place-visual-main" ${open(0)}>${firstSlide}</figure>` +
    gal
      .map(
        (g, i) =>
          `<figure class="gslide" data-gslide ${open(i + 1)}>${galleryImg(g)}<figcaption class="photo-caption">${galleryCredit(g)}</figcaption></figure>`,
      )
      .join('');
  const expand = `<span class="gexpand" aria-hidden="true">${icon('expand')}</span>`;
  if (!gal.length) return `<div class="gtrack single">${slides}</div>${expand}`;
  return `<div class="gtrack" tabindex="0" aria-label="${esc(label)}" data-gtrack>${slides}</div><button class="gnav prev" data-action="gal-step" data-dir="-1" aria-label="Previous photo">${icon('left')}</button><button class="gnav next" data-action="gal-step" data-dir="1" aria-label="Next photo">${icon('arrow')}</button><span class="gcount" aria-live="polite">1 / ${gal.length + 1}</span>${expand}`;
}
function galleryScope(el) {
  return el.closest('[data-gscope]') || document;
}
function galleryGo(scope, i) {
  const t = scope.querySelector('[data-gtrack]');
  if (!t) return;
  const slides = t.querySelectorAll('[data-gslide]');
  i = Math.max(0, Math.min(slides.length - 1, i));
  t.scrollTo({ left: slides[i].offsetLeft, behavior: 'smooth' });
}
function galleryIndex(t) {
  return Math.round(t.scrollLeft / Math.max(1, t.clientWidth));
}
document.addEventListener(
  'scroll',
  (e) => {
    const t = e.target;
    if (!(t instanceof Element) || !t.matches('[data-gtrack]')) return;
    const scope = galleryScope(t),
      i = galleryIndex(t),
      n = t.querySelectorAll('[data-gslide]').length;
    const c = scope.querySelector('.gcount');
    if (c) c.textContent = `${i + 1} / ${n}`;
  },
  true,
);
document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (!(t instanceof Element) || !t.matches('[data-gtrack]')) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault();
    galleryGo(galleryScope(t), galleryIndex(t) + (e.key === 'ArrowRight' ? 1 : -1));
  }
});
function cityPhotos(c) {
  const gal = galleryFor(c.id);
  if (!gal.length) return '';
  return `<section class="cityphotos" aria-label="Photos of ${esc(c.name)}"><div class="cityphotos-head"><h3>${icon('camera')} See what to expect</h3><small>${gal.length} more photos · Wikimedia Commons</small></div><div class="cityphotos-row">${gal.map((g, i) => `<button class="cityphoto" data-action="city-photos" data-id="${c.id}" data-i="${i + 1}" aria-label="Open photo ${i + 2} of ${esc(c.name)}">${galleryImg(g, true, '(max-width: 700px) 70vw, 320px')}</button>`).join('')}</div></section>`;
}
/* ------------------------------------------------------------------
   Full-screen photo viewer (Google Photos, Instagram, Unsplash).
   Dark backdrop, the whole photo uncropped at the largest size that
   fits, a filmstrip and credit underneath. Click or double-tap to zoom
   where you point, scroll or pinch to zoom further, drag to pan. Swipe
   or arrow keys to move, swipe down / Esc / Back to close.
   ------------------------------------------------------------------ */
let VW = null;
const commonsOriginal = (g) =>
  `https://upload.wikimedia.org/wikipedia/commons/${g.hh[0]}/${g.hh}/${commonsName(g.f)}`;
function viewerItems(id, scope) {
  const name = P[id]?.name || C[id]?.name || '';
  // The first photo is whatever the sheet shows now (a place may be on its illustration).
  const main = scope?.querySelector('#place-visual-main');
  const mainImg = main?.querySelector('img');
  const first = mainImg
    ? {
        src: mainImg.currentSrc || mainImg.src,
        alt: mainImg.alt,
        vivid: mainImg.classList.contains('photo'),
        credit: main.querySelector('.photo-caption')?.innerHTML || '',
      }
    : PHOTO[id]
      ? { src: PHOTO[id].data, alt: PHOTO[id].alt || name, vivid: true, credit: photoCredit(id) }
      : ART[id]
        ? { src: ART[id].data, alt: ART[id].alt, vivid: false, credit: artCaption(id) }
        : null;
  const items = first ? [{ ...first, thumb: first.src, r: 0 }] : [];
  for (const g of galleryFor(id))
    items.push({
      g,
      src: galleryUrl(g, 1920),
      thumb: galleryUrl(g, 500),
      alt: g.f.replace(/\.[a-z]+$/i, '').replace(/[_-]+/g, ' '),
      vivid: true,
      credit: galleryCredit(g),
      r: g.w / g.h,
    });
  return { name, items };
}
function openViewer(id, start = 0, from) {
  const scope = from?.closest('[data-gscope]');
  const { name, items } = viewerItems(id, scope);
  if (!items.length) return;
  closeViewer('swap');
  const n = items.length,
    one = n < 2;
  const x = document.createElement('div');
  x.className = 'viewer' + (one ? ' one' : '');
  x.setAttribute('role', 'dialog');
  x.setAttribute('aria-modal', 'true');
  x.setAttribute('aria-label', 'Photos of ' + name);
  x.innerHTML = `<div class="vw-top"><span class="vw-count" aria-live="polite"></span><span class="vw-title">${esc(name)}</span><div class="vw-tools"><button class="vw-btn" data-vw="zoom" aria-label="Zoom in" title="Zoom (Z)">${icon('zoomin')}</button><button class="vw-btn" data-vw="close" aria-label="Close photos" title="Close (Esc)">${icon('close')}</button></div></div><div class="vw-track">${items
    .map(
      (it, i) =>
        `<div class="vw-slide" data-i="${i}"><img class="vw-img${it.vivid ? ' photo' : ''}" data-src="${esc(it.src)}" alt="${esc(it.alt)}" draggable="false" decoding="async" referrerpolicy="no-referrer"><span class="vw-miss">This photo needs an internet connection.</span></div>`,
    )
    .join(
      '',
    )}</div><button class="vw-nav prev" data-vw="prev" aria-label="Previous photo">${icon('left')}</button><button class="vw-nav next" data-vw="next" aria-label="Next photo">${icon('arrow')}</button><div class="vw-foot"><div class="vw-credit"></div>${
    one
      ? ''
      : `<div class="vw-strip" role="group" aria-label="Choose a photo">${items
          .map(
            (it, i) =>
              `<button class="vw-thumb" data-vw="go" data-i="${i}" aria-label="Photo ${i + 1} of ${n}"><img src="${esc(it.thumb)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false"></button>`,
          )
          .join('')}</div>`
  }</div>`;
  document.body.appendChild(x);
  const track = x.querySelector('.vw-track');
  VW = {
    x,
    track,
    items,
    i: -1,
    z: { s: 1, x: 0, y: 0 },
    id,
    scope,
    focus: document.activeElement,
    overflow: document.body.style.overflow,
  };
  document.body.style.overflow = 'hidden';
  x.querySelectorAll('.vw-img').forEach((img) => {
    img.addEventListener('load', () => img.parentElement.classList.add('loaded'));
    img.addEventListener('error', () => viewerImgFailed(img));
  });
  track.addEventListener(
    'scroll',
    () => {
      // While an arrow or thumbnail click is gliding to a photo, ignore the frames in between.
      if (VW?.target != null) {
        if (Math.round(track.scrollLeft / Math.max(1, track.clientWidth)) !== VW.target) return;
        VW.target = null;
      }
      viewerSync();
    },
    { passive: true },
  );
  viewerGestures(x, track);
  history.pushState({ ...(history.state || {}), roamViewer: 1 }, '');
  VW.history = true;
  requestAnimationFrame(() => {
    track.scrollLeft = start * track.clientWidth;
    viewerSync(start);
    x.classList.add('open');
    x.querySelector('[data-vw="close"]').focus({ preventScroll: true });
  });
}
// Show the 1920px rendition; if it can't load, try the original file before giving up.
function viewerImgFailed(img) {
  const it = VW?.items[+img.closest('.vw-slide').dataset.i];
  if (it?.g && img.dataset.tried !== 'orig') {
    img.dataset.tried = 'orig';
    img.src = commonsOriginal(it.g);
  } else img.parentElement.classList.add('missing');
}
function viewerLoad(i) {
  const img = VW.x.querySelectorAll('.vw-img')[i];
  if (img && !img.getAttribute('src')) img.src = img.dataset.src;
}
function viewerSync(force) {
  if (!VW) return;
  const { x, track, items } = VW;
  const i =
    force ??
    Math.max(
      0,
      Math.min(items.length - 1, Math.round(track.scrollLeft / Math.max(1, track.clientWidth))),
    );
  if (i === VW.i) return;
  if (VW.i >= 0) viewerZoom(1);
  VW.i = i;
  [i, i + 1, i - 1].forEach((k) => k >= 0 && k < items.length && viewerLoad(k));
  x.querySelector('.vw-count').textContent = items.length > 1 ? `${i + 1} / ${items.length}` : '';
  x.querySelector('.vw-credit').innerHTML = items[i].credit;
  x.querySelector('.prev').disabled = i === 0;
  x.querySelector('.next').disabled = i === items.length - 1;
  x.querySelectorAll('.vw-thumb').forEach((b) => {
    const on = +b.dataset.i === i;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'true');
    else b.removeAttribute('aria-current');
    if (on) {
      const s = b.parentElement;
      s.scrollTo({ left: b.offsetLeft - (s.clientWidth - b.offsetWidth) / 2, behavior: 'smooth' });
    }
  });
}
function viewerGo(i) {
  if (!VW) return;
  i = Math.max(0, Math.min(VW.items.length - 1, i));
  viewerZoom(1);
  VW.target = i;
  clearTimeout(VW.targetTimer);
  VW.targetTimer = setTimeout(() => VW && (VW.target = null), 900);
  VW.track.scrollTo({ left: i * VW.track.clientWidth, behavior: 'smooth' });
  viewerSync(i);
}
function closeViewer(how = 'user') {
  if (!VW) return;
  const v = VW;
  VW = null;
  v.x.remove();
  document.body.style.overflow = v.overflow;
  // Leave the sheet's carousel on the photo you were last looking at.
  const t = v.scope?.querySelector('[data-gtrack]');
  const s = t?.querySelectorAll('[data-gslide]')[v.i];
  if (s) t.scrollLeft = s.offsetLeft;
  if (how !== 'swap' && v.focus?.isConnected) v.focus.focus({ preventScroll: true });
  if (v.history && how !== 'history' && history.state?.roamViewer) history.back();
}
window.addEventListener('popstate', () => {
  if (VW && !history.state?.roamViewer) closeViewer('history');
});
// Photo credits and map credits stay behind a small "i" until asked for.
document.addEventListener(
  'click',
  (e) => {
    const c = e.target.closest?.('.hero-credit, .photo-caption');
    if (!c || !c.querySelector('a') || c.querySelector('br')) return;
    const open = c.classList.contains('open');
    if (open && e.target.closest('a')) return;
    e.preventDefault();
    e.stopPropagation();
    c.classList.toggle('open', !open);
  },
  true,
);
// The photo's on-screen box inside its slide (the image is object-fit: contain).
function viewerBox() {
  const slide = VW.x.querySelectorAll('.vw-slide')[VW.i],
    img = slide.querySelector('img'),
    W = slide.clientWidth,
    H = slide.clientHeight,
    r = img.naturalWidth ? img.naturalWidth / img.naturalHeight : VW.items[VW.i].r || W / H,
    w = Math.min(W, H * r);
  return { slide, img, W, H, w, h: w / r };
}
// Zoom to scale s, keeping the point (px, py), measured from the slide's centre, still.
function viewerZoom(s, px = 0, py = 0, animate = true) {
  if (!VW || VW.i < 0) return;
  const { img, W, H, w, h } = viewerBox(),
    z = VW.z;
  s = Math.max(1, Math.min(5, s));
  z.x = px - ((px - z.x) * s) / z.s;
  z.y = py - ((py - z.y) * s) / z.s;
  z.s = s;
  viewerPan(0, 0, { img, W, H, w, h }, animate);
  if (s > 1.6) viewerSharpen();
}
function viewerPan(dx, dy, box = viewerBox(), animate = false) {
  const z = VW.z,
    mx = Math.max(0, (box.w * z.s - box.W) / 2),
    my = Math.max(0, (box.h * z.s - box.H) / 2);
  z.x = Math.max(-mx, Math.min(mx, z.x + dx));
  z.y = Math.max(-my, Math.min(my, z.y + dy));
  if (z.s === 1) z.x = z.y = 0;
  box.img.style.transition = animate ? '' : 'none';
  box.img.style.transform = z.s === 1 ? '' : `translate(${z.x}px, ${z.y}px) scale(${z.s})`;
  const zoomed = z.s > 1;
  VW.x.classList.toggle('zoomed', zoomed);
  const b = VW.x.querySelector('[data-vw="zoom"]');
  b.innerHTML = icon(zoomed ? 'zoomout' : 'zoomin');
  b.setAttribute('aria-label', zoomed ? 'Zoom out' : 'Zoom in');
}
// Zoomed in on a Commons photo: swap in the original file so the detail is real. Commons
// upscales thumbnails wider than the file, so a bigger thumbnail wouldn't add detail.
function viewerSharpen() {
  const it = VW.items[VW.i],
    img = viewerBox().img;
  if (!it.g || img.dataset.tried || !img.complete) return;
  img.dataset.tried = 'orig';
  const big = new Image();
  big.referrerPolicy = 'no-referrer';
  big.onload = () => {
    if (big.naturalWidth > img.naturalWidth) img.src = big.src;
  };
  big.src = commonsOriginal(it.g);
}
function viewerPoint(e) {
  const r = viewerBox().slide.getBoundingClientRect();
  return [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2];
}
function viewerToggleZoom(e) {
  if (VW.z.s > 1) viewerZoom(1);
  else viewerZoom(2.5, ...(e ? viewerPoint(e) : [0, 0]));
}
function viewerGestures(x, track) {
  const pts = new Map();
  let g = null,
    lastTap = 0,
    tapTimer = 0;
  track.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.vw-slide') || !VW) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    const z = VW.z;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      g = {
        pinch: true,
        d0: Math.hypot(a[0] - b[0], a[1] - b[1]),
        s0: z.s,
        moved: true,
      };
    } else if (pts.size === 1) {
      g = { x0: e.clientX, y0: e.clientY, zx: z.x, zy: z.y, moved: false, type: e.pointerType };
      if (z.s > 1 || e.pointerType === 'mouse') track.setPointerCapture(e.pointerId);
    }
  });
  track.addEventListener('pointermove', (e) => {
    if (!g || !pts.has(e.pointerId) || !VW) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    const z = VW.z;
    if (g.pinch && pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      viewerZoom(
        (g.s0 * d) / g.d0,
        ...viewerPoint({ clientX: (a[0] + b[0]) / 2, clientY: (a[1] + b[1]) / 2 }),
        false,
      );
      return;
    }
    const dx = e.clientX - g.x0,
      dy = e.clientY - g.y0;
    if (Math.hypot(dx, dy) > 6) g.moved = true;
    if (z.s > 1) {
      z.x = g.zx;
      z.y = g.zy;
      viewerPan(dx, dy);
    } else if (g.type !== 'mouse' && (g.down || (g.moved && Math.abs(dy) > Math.abs(dx)))) {
      // Swipe down to put the photo away.
      g.down = true;
      const img = viewerBox().img;
      img.style.transition = 'none';
      img.style.transform = `translate(${dx * 0.4}px, ${Math.max(0, dy)}px) scale(${1 - Math.min(0.25, Math.max(0, dy) / 1200)})`;
      x.style.setProperty('--vw-fade', String(Math.max(0.3, 1 - Math.max(0, dy) / 400)));
    }
  });
  const end = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (!g || !VW) return;
    if (g.pinch) {
      if (!pts.size) g = null;
      return;
    }
    if (g.down) {
      const dy = e.clientY - g.y0;
      x.style.removeProperty('--vw-fade');
      if (dy > 110 && e.type === 'pointerup') return closeViewer();
      const img = viewerBox().img;
      img.style.transition = '';
      img.style.transform = '';
    } else if (!g.moved && e.type === 'pointerup') {
      if (g.type === 'mouse') {
        // Click the photo to zoom there; click the dark space around it to close.
        const [px, py] = viewerPoint(e),
          { w, h } = viewerBox();
        if (VW.z.s === 1 && (Math.abs(px) > w / 2 + 4 || Math.abs(py) > h / 2 + 4)) closeViewer();
        else viewerToggleZoom(e);
      } else {
        const now = Date.now(),
          ev = { clientX: e.clientX, clientY: e.clientY };
        if (now - lastTap < 300) {
          clearTimeout(tapTimer);
          lastTap = 0;
          viewerToggleZoom(ev);
        } else {
          lastTap = now;
          // A single tap hides the controls so the photo has the whole screen.
          tapTimer = setTimeout(() => x.classList.toggle('bare'), 300);
        }
      }
    }
    g = null;
  };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
  track.addEventListener(
    'wheel',
    (e) => {
      if (!VW) return;
      // Sideways trackpad swipes still page through photos; vertical scroll and pinch zoom.
      if (VW.z.s === 1 && !e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      const k = e.deltaMode === 1 ? 0.05 : 0.0025;
      viewerZoom(VW.z.s * Math.exp(-e.deltaY * k * (e.ctrlKey ? 4 : 1)), ...viewerPoint(e), false);
    },
    { passive: false },
  );
  x.addEventListener('dragstart', (e) => e.preventDefault());
  x.addEventListener('click', (e) => {
    const b = e.target.closest('[data-vw]');
    if (!b) {
      // Clicking the dark area around the photo (not the photo) closes, as in most lightboxes.
      if (e.target === x || e.target.classList.contains('vw-foot')) closeViewer();
      return;
    }
    const a = b.dataset.vw;
    if (a === 'close') closeViewer();
    else if (a === 'prev') viewerGo(VW.i - 1);
    else if (a === 'next') viewerGo(VW.i + 1);
    else if (a === 'go') viewerGo(+b.dataset.i);
    else if (a === 'zoom') viewerToggleZoom();
  });
}
// Runs before the sheet's own key handling, so Esc closes only the viewer.
window.addEventListener(
  'keydown',
  (e) => {
    if (!VW) return;
    const k = e.key;
    if (k === 'Escape') closeViewer();
    else if (k === 'ArrowRight' || k === 'ArrowLeft') {
      if (VW.z.s > 1) viewerPan(k === 'ArrowRight' ? -80 : 80, 0);
      else viewerGo(VW.i + (k === 'ArrowRight' ? 1 : -1));
    } else if ((k === 'ArrowUp' || k === 'ArrowDown') && VW.z.s > 1)
      viewerPan(0, k === 'ArrowDown' ? -80 : 80);
    else if (k === '+' || k === '=') viewerZoom(VW.z.s * 1.5);
    else if (k === '-') viewerZoom(VW.z.s / 1.5);
    else if (k === '0') viewerZoom(1);
    else if (k === 'z' || k === 'Z') viewerToggleZoom();
    else if (k === 'Tab') {
      const f = [...VW.x.querySelectorAll('button:not(:disabled),a[href]')].filter(
        (el) => el.offsetParent,
      );
      const at = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(at + (e.shiftKey ? -1 : 1) + f.length) % f.length]?.focus();
    } else return;
    e.preventDefault();
    e.stopPropagation();
  },
  true,
);
window.addEventListener('resize', () => {
  if (!VW) return;
  viewerZoom(1, 0, 0, false);
  VW.track.scrollLeft = VW.i * VW.track.clientWidth;
});
// Photo tiles in a sheet, the sheet carousel and the city page's photo row open the viewer.
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action="gal-open"]');
  if (!b || e.target.closest('a')) return;
  openViewer(b.dataset.id, Number(b.dataset.i) || 0, b);
});
function photoCredit(id) {
  const p = PHOTO[id];
  if (!p) return '';
  const provider = p.provider || 'Pexels';
  return `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" title="${esc(p.title)}">Photo: ${esc(p.author || provider + ' contributor')} / ${esc(provider)}</a> · <a href="${esc(p.licenseUrl || p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.license || 'Photo licence')}</a> · resized / cropped`;
}
function photoContext(id) {
  const p = PHOTO[id];
  if (!p?.context) return '';
  return (
    p.contextNote ||
    (P[id]?.kind === 'eat'
      ? 'Representative cuisine, not the named venue or proof of dietary suitability. Shown: ' +
        p.title +
        '.'
      : 'Representative location context. Shown: ' +
        p.title +
        '. The exact place is not verified in this image.')
  );
}
function contextBadge(id) {
  return PHOTO[id]?.context
    ? `<span class="photo-context" title="${esc(photoContext(id))}">Representative ${P[id]?.kind === 'eat' ? 'cuisine' : 'location'} photo</span>`
    : '';
}
function saved(id) {
  return S.saved.includes(id);
}
function inTrip(id) {
  return S.trip.includes(id);
}
function saveButton(id) {
  return `<button class="iconbtn ${saved(id) ? 'saved' : ''}" data-action="save" data-id="${id}" aria-label="${saved(id) ? 'Unsave' : 'Save'} ${esc(P[id]?.name || 'place')}" title="${saved(id) ? 'Saved' : 'Save place'}">${icon('heart')}</button>`;
}
function saveButtonWide(id) {
  return `<button class="btn light savewide ${saved(id) ? 'saved' : ''}" data-action="save" data-id="${id}" aria-pressed="${saved(id)}">${icon('heart')} ${saved(id) ? 'Saved' : 'Save'}</button>`;
}
// The one way to put a city in the trip. Wide buttons name the city ("Add Kyoto to trip");
// `short` is for rows that already show the name beside the button.
function tripLabel(id, short) {
  return inTrip(id)
    ? short
      ? 'In trip'
      : `${esc(C[id].name)} is in your trip`
    : short
      ? 'Add to trip'
      : `Add ${esc(C[id].name)} to trip`;
}
function cityAdd(id, small = false, short = false) {
  return `<button class="${small ? 'iconbtn addcity' : 'btn light small tripadd'} ${inTrip(id) ? 'saved' : ''}" data-action="trip-toggle" data-id="${id}" ${short ? 'data-short="1"' : ''} aria-label="${inTrip(id) ? 'Remove' : 'Add'} ${esc(C[id].name)} ${inTrip(id) ? 'from' : 'to'} trip">${icon(inTrip(id) ? 'check' : 'plus')}${small ? '' : tripLabel(id, short)}</button>`;
}
function mapsPin(p) {
  return (
    'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent(`${p.name}, ${p.cityName || p.name}, ${C[p.cityId]?.country || p.country}`)
  );
}
function mapsCoordinate(p) {
  return (
    'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${p.lat},${p.lon}`)
  );
}
function mapsDirections(points, mode) {
  if (!points.length) return '#';
  const q = new URLSearchParams({
    api: '1',
    destination: `${points.at(-1).lat},${points.at(-1).lon}`,
    travelmode: mode || 'walking',
  });
  if (points.length > 1) q.set('origin', `${points[0].lat},${points[0].lon}`);
  if (points.length > 2)
    q.set(
      'waypoints',
      points
        .slice(1, -1)
        .map((p) => `${p.lat},${p.lon}`)
        .join('|'),
    );
  return 'https://www.google.com/maps/dir/?' + q;
}
function external(url, text, cls = '') {
  return `<a ${cls ? `class="${cls}"` : ''} href="${esc(url)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
}
function rating(p) {
  return p.review?.rating
    ? `<span class="rating">★ ${Number(p.review.rating).toFixed(1)} <span class="muted">(${num(p.review.count || 0)})</span></span>`
    : p.michelin
      ? '<span class="muted">MICHELIN Guide</span>'
      : '<span class="muted">Curated pick</span>';
}
// One short message above the tab bar. `action` adds a single button (Undo, or the next step).
function toast(t, action, ms = 3500) {
  $('.toast')?.remove();
  const x = document.createElement('div');
  x.className = 'toast';
  x.setAttribute('role', 'status');
  const span = document.createElement('span');
  span.textContent = t;
  x.appendChild(span);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action.label;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      x.remove();
      action.run();
    });
    x.appendChild(b);
    x.classList.add('has-action');
  }
  document.body.appendChild(x);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => x.remove(), action ? Math.max(ms, 5000) : ms);
}
// The five most popular sights of a city, for "Save the top 5".
function topFive(cid) {
  return C[cid].items
    .map((x) => P[x.id])
    .filter((p) => p.kind === 'see')
    .sort((a, b) => (popularityRank(a) ?? 999) - (popularityRank(b) ?? 999))
    .slice(0, 5);
}
function savedCount() {
  return S.saved.length + S.shops.length;
}
function shopSave(id) {
  const on = S.shops.includes(id);
  return `<button class="iconbtn shopheart ${on ? 'saved' : ''}" data-action="save-shop" data-id="${id}" aria-label="${on ? 'Unsave' : 'Save'} ${esc(SHOPS[id].name)}" title="${on ? 'Saved' : 'Save shop'}">${icon('heart')}</button>`;
}
function toggleShop(id, quiet = false) {
  if (!Object.hasOwn(SHOPS, id)) return;
  const had = S.shops.includes(id),
    cid = SHOPS[id].cityId;
  S.shops = had ? S.shops.filter((x) => x !== id) : [...S.shops, id];
  persist();
  $$(`[data-action="save-shop"][data-id="${id}"]`).forEach((b) => {
    b.classList.toggle('saved', !had);
    b.classList.toggle('pop', !had);
    b.setAttribute('aria-label', (had ? 'Save ' : 'Unsave ') + SHOPS[id].name);
  });
  if (!quiet) {
    if (had) toast('Removed from Saved.', { label: 'Undo', run: () => toggleShop(id, true) });
    else {
      navigator.vibrate?.(10);
      if (inTrip(cid)) toast('Saved.', { label: 'Undo', run: () => toggleShop(id, true) });
      else
        toast(`Saved. Add ${C[cid].name} to your trip?`, {
          label: `Add ${C[cid].name}`,
          run: () => toggleTrip(cid),
        });
    }
  }
  if (location.hash.startsWith('#/saved')) renderSaved();
}
function savedIn(cid) {
  return S.saved.map((id) => P[id]).filter((p) => p && p.cityId === cid);
}
// Phones: a small "cart" above the tab bar once something is saved, so the trip is one tap away.
function updateMiniCart() {
  const el = $('#minicart');
  if (!el) return;
  const page = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  const hidden = (!S.trip.length && !savedCount()) || ['trip', 'map', 'story', 't'].includes(page);
  document.body.classList.toggle('has-minicart', !hidden);
  el.hidden = hidden;
  if (hidden) return;
  if (S.trip.length) {
    const first = C[S.trip[0]].name,
      places = S.saved.filter((id) => S.trip.includes(P[id]?.cityId)).length,
      cost = tripCost();
    el.href = '#/trip';
    el.innerHTML = `<span class="mc-text"><strong>${esc(first)}${S.trip.length > 1 ? ` +${S.trip.length - 1}` : ''}</strong><small>${places} place${places === 1 ? '' : 's'} · about ${cash(cost.est)}</small></span><span class="mc-go">View trip ${icon('arrow')}</span>`;
  } else {
    el.href = '#/saved';
    el.innerHTML = `<span class="mc-text"><strong>${savedCount()} saved</strong><small>No city in your trip yet</small></span><span class="mc-go">Add to trip ${icon('arrow')}</span>`;
  }
}
function updateCounts() {
  $$('.saved-count').forEach((e) => {
    e.textContent = savedCount();
    e.toggleAttribute('data-zero', !savedCount());
  });
  $$('.trip-count').forEach((e) => {
    e.textContent = S.trip.length;
    e.toggleAttribute('data-zero', !S.trip.length);
  });
  updateMiniCart();
}
function headerActive(page) {
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === page));
  updateCounts();
}
function footer() {
  return `<footer class="footer"><div>Tandem Roads · Made for the journey.<br>Research retrieved ${CHECKED}. Fees and availability can change.</div><div><a href="#/guide">About & sources</a> · <button class="inline-link" data-action="export">Export your trip</button><br>Guide, photos and pins work offline. Street tiles and external links need internet.</div></footer>`;
}
const TEMPLATES = [
  {
    id: 'japan',
    title: 'The Japan first-timer',
    tag: '12 city days + 2 transfer days · rail',
    cities: ['tokyo', 'kyoto', 'osaka'],
    days: [5, 4, 3],
    note: 'Tokyo → Kyoto → Osaka. Consider arriving in Tokyo and flying home from Kansai to reduce backtracking. Allow two travel days in addition to these city days.',
    highlights: 'Asakusa mornings, Kyoto temple trails and Osaka food streets.',
    warning:
      'Book popular timed attractions early. Nara is a separate day trip; compare point-to-point rail fares before buying a pass.',
  },
  {
    id: 'peru',
    title: 'Peru beyond Machu Picchu',
    tag: '12 city days + 2 transfer days',
    cities: ['lima', 'arequipa', 'cusco'],
    days: [3, 3, 6],
    note: 'Lima → Arequipa → Cusco, then Sacred Valley and Machu Picchu from Cusco. International flights commonly connect through Lima; add travel days and a return buffer.',
    highlights: 'Coastal food, white-stone Arequipa and the Sacred Valley.',
    warning:
      'Keep arrival in Cusco gentle and allow adjustment to altitude. Secure the precise Machu Picchu circuit and timed ticket before train or tour commitments. Machu Picchu needs 1–2 days.',
  },
  {
    id: 'southwest',
    title: 'The great Southwest loop',
    tag: '13 city days + 3 transfer days',
    cities: ['las-vegas', 'springdale', 'moab', 'flagstaff'],
    days: [2, 4, 4, 3],
    note: 'Las Vegas → Springdale/Zion → Moab → Flagstaff/Grand Canyon. This is an open route; add the return to Las Vegas if your rental requires it.',
    highlights: 'Zion walls, red-rock arches and Grand Canyon horizons.',
    warning:
      'Long driving days need buffers. Check road conditions, heat, trail permits and the current U.S. nonresident park fee/pass rules before buying.',
  },
  {
    id: 'italy',
    title: 'Italy by rail',
    tag: '13 city days + 3 transfer days',
    cities: ['venice', 'florence', 'rome', 'naples'],
    days: [3, 3, 4, 3],
    note: 'A north-to-south sequence with Venice, Florence, Rome and Naples. Open-jaw flights can avoid a return journey.',
    highlights: 'Canals, Renaissance art, Roman history and Neapolitan food.',
    warning:
      'Book major museums and ruins in advance. Add intercity travel time; do not schedule a timed attraction immediately after a train arrival.',
  },
  {
    id: 'greece',
    title: 'Greece: city to islands',
    tag: '11 city days + 2 transfer days',
    cities: ['athens', 'santorini', 'chania'],
    days: [3, 3, 5],
    note: 'Athens → Santorini → Crete/Chania. Ferries to Crete may arrive at Heraklion; Chania is then a separate transfer.',
    highlights: 'Classical sites, caldera paths and Cretan food.',
    warning:
      'Ferry routes are seasonal and weather-sensitive. Confirm your exact ports and sailing dates; avoid a tight island-to-international-flight connection.',
  },
  {
    id: 'southeast',
    title: 'A Southeast Asia sampler',
    tag: '12 city days + 3 transfer days',
    cities: ['bangkok', 'chiang-mai', 'siem-reap', 'hanoi'],
    days: [3, 3, 3, 3],
    note: 'Bangkok and Chiang Mai pair naturally. Continue to Siem Reap and Hanoi after checking whether flights require connections.',
    highlights: 'Temples, northern Thai food, Angkor and Old Quarter lanes.',
    warning:
      'This is a multi-country route. Check entry requirements for your passport, flight connections and seasonal smoke/rain before booking.',
  },
  {
    id: 'egypt',
    title: 'Egypt’s ancient corridor',
    tag: '8 city days + 1 transfer day',
    cities: ['cairo', 'luxor'],
    days: [4, 4],
    note: 'Cairo → Luxor. Add an optional Nile cruise or Aswan extension beyond this guide.',
    highlights: 'Pyramids, museum collections and the Valley of the Kings.',
    warning:
      'Check exactly which tombs and museum sections a ticket includes; special entries can cost extra.',
  },
  {
    id: 'east-africa',
    title: 'East Africa city & safari',
    tag: '10–14+ days · guided overland / flights',
    cities: ['nairobi', 'arusha'],
    days: [4, 5],
    note: 'Start in Nairobi, then cross into Tanzania for Arusha and an individually quoted safari. Reserve separate multi-day safari blocks.',
    highlights: 'Wildlife close to Nairobi and the northern Tanzania circuit.',
    warning:
      'Safari quotes must spell out park/concession fees, vehicle, guide, lodging and transfers. Budget substantially beyond ordinary city spending.',
  },
  {
    id: 'morocco',
    title: 'Morocco’s medinas',
    tag: '8 city days + 1 transfer day',
    cities: ['marrakech', 'fez'],
    days: [4, 4],
    note: 'Marrakech → Fez; the transfer is long. Consider a stop in Rabat or a deliberately booked desert circuit beyond the covered destinations.',
    highlights: 'Craft traditions, courtyard architecture and market food.',
    warning:
      'A Sahara trip is not a quick detour from either city. Agree prices for guides and purchases before committing.',
  },
  {
    id: 'yellowstone',
    title: 'The northern park pair',
    tag: '7+ days · rental car',
    cities: ['jackson'],
    days: [7],
    note: 'Base the Grand Teton section near Jackson, then move accommodation closer to the Yellowstone areas you plan to visit.',
    highlights: 'Teton views, geyser basins and wildlife at a distance.',
    warning:
      'Jackson is not a practical daily base for every part of Yellowstone. Seasonal road openings, wildfire conditions and lodging availability shape the route.',
  },
];
function cityTabLegacy(c, tab) {
  if (tab === 'arrival')
    return `<div class="infogrid">${[
      ['train', 'From the airport / station', c.arrival],
      ['route', 'Getting around', c.gettingAround],
      ['pin', 'Where to base yourself', c.baseArea],
      [
        'wallet',
        'Cash to carry',
        c.cashTip +
          ' Suggested accessible cash: ' +
          range(c.cashPerDay, c.currency) +
          ' per person/day. This is part of your spending budget, not an additional charge.',
      ],
      ['food', 'What to eat', c.foodTip],
      ['bag', 'What to bring home', c.buyTip],
      ['sun', 'When to go', c.seasonNote],
    ]
      .map(
        ([i, t, b]) =>
          `<section class="infocard"><h3>${icon(i)}${esc(t)}</h3><p>${esc(b)}</p></section>`,
      )
      .join(
        '',
      )}<section class="infocard wide"><h3>${icon('wallet')}Your daily planning allowance</h3><p>${range(c.dailyBudget, c.currency)} per person/day. ${esc(c.budgetNote || 'Planning estimate for food, local transport and ordinary sightseeing.')} Hotels, intercity transport, shopping and premium excursions are extra. Amounts are editorial planning ranges, not current quotes. Adjust accommodation and special-excursion allowances in your trip.</p></section></div>`;
  if (tab === 'sources')
    return `<div class="reviewstrip">${icon('star')}<p>${esc(c.reviewSummary)}<br>${external(c.reviewSource, 'Open visitor evidence ↗')}</p></div><div class="source-list">${c.sources.map((s) => `<div class="source-row"><div>${external(s.url, esc(s.title) + ' ↗')}<br><small>${esc(new URL(s.url).hostname)}</small></div><span class="pill ${s.type === 'reviews' ? 'warm' : 'gray'}">${s.type}</span></div>`).join('')}</div><div class="info-note">Retrieved ${CHECKED}. “Retrieved” is the research access date; some indexed pages and review counts may have been crawled earlier. Recheck official hours, ticket types and current visitor reviews before committing.</div><h3 style="margin-top:30px">Photography</h3><div class="source-list">${[
      c.id,
      ...c.items.map((p) => p.id),
    ]
      .map(
        (id) =>
          `<div class="source-row"><div>${esc(id === c.id ? c.name : P[id].name)}<br><small>${photoCredit(id)}${PHOTO[id]?.context ? ' · representative image' : ''}</small>${galleryFor(
            id,
          )
            .map((g) => `<br><small>Gallery · ${galleryCredit(g)}</small>`)
            .join('')}</div></div>`,
      )
      .join('')}</div>`;
  return `<div class="reviewstrip">${icon('star')}<p><strong>Why these places?</strong> ${esc(c.reviewSummary)} ${external(c.reviewSource, 'Visitor evidence ↗')}</p></div><div class="searchrow" style="justify-content:space-between;flex-wrap:wrap"><div class="chips" style="margin:0">${[
    ['all', 'All places'],
    ['see', 'See & do'],
    ['eat', 'Eat & drink'],
    ['shop', 'Shop'],
    ['saved', 'Saved'],
  ]
    .map(
      ([k, t]) =>
        `<button class="chip ${cityFilter === k ? 'active' : ''}" data-action="city-filter" data-id="${k}">${t}</button>`,
    )
    .join(
      '',
    )}</div><select id="place-sort" aria-label="Sort places" style="padding:9px;border:1px solid var(--line);border-radius:8px;color:var(--ink);background:white"><option value="recommended" ${placeSort === 'recommended' ? 'selected' : ''}>Suggested visit priority</option><option value="rating" ${placeSort === 'rating' ? 'selected' : ''}>Visitor rating snapshots</option><option value="cost" ${placeSort === 'cost' ? 'selected' : ''}>Lowest starting cost</option></select></div><div class="placegrid" id="city-places">${getCityPlaces(c).map(placeCard).join('') || '<div class="no-results">No saved places here yet. Tap a heart to keep a place.</div>'}</div>`;
}
// Phone layout breakpoint; keep in sync with the 760px media queries in styles.css.
const isMobile = () => matchMedia('(max-width: 760px)').matches;
let modalHistory = false;
function closePlaceMap() {
  if (placeMap) {
    placeMap.remove();
    placeMap = null;
  }
}
function showModal(content, label = 'Details') {
  closeStayMap();
  closePlaceMap();
  const reopening = Boolean($('.modal-backdrop'));
  if (!reopening) modalFocus = document.activeElement;
  $('.modal-backdrop')?.remove();
  const x = document.createElement('div');
  x.className = 'modal-backdrop';
  // The header bar is sticky, so Close stays in reach however far the sheet is scrolled.
  x.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-label="${esc(label)}"><div class="modal-bar"><span class="modal-grab" aria-hidden="true"></span><span class="modal-bar-title" aria-hidden="true">${esc(label)}</span><button class="iconbtn close" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button></div>${content}</section>`;
  document.body.appendChild(x);
  document.body.style.overflow = 'hidden';
  const m = x.querySelector('.modal');
  m.addEventListener('scroll', () => m.classList.toggle('scrolled', m.scrollTop > 140), {
    passive: true,
  });
  sheetSwipe(m);
  x.querySelector('.close').focus({ preventScroll: true });
  x.addEventListener('click', (e) => {
    if (e.target === x) closeModal('user');
  });
  // Give the sheet its own history entry so the phone's Back gesture closes it.
  if (!reopening && !modalHistory) {
    history.pushState({ roamModal: 1 }, '');
    modalHistory = true;
  }
}
// how: 'user' when the person dismisses the sheet (Close, backdrop, Escape, swipe), which
// also steps back past the sheet's history entry; 'history' when Back already did that.
// Anything else is a programmatic close that may navigate next, so it must not go back.
function closeModal(how = '') {
  closeStayMap();
  closePlaceMap();
  $('.modal-backdrop')?.remove();
  document.body.style.overflow = '';
  if (modalFocus?.isConnected) modalFocus.focus({ preventScroll: true });
  if (!modalHistory) return;
  modalHistory = false;
  if (how === 'history' || !history.state?.roamModal) return;
  if (how === 'user') history.back();
  else history.replaceState(null, '');
}
// Drag a sheet down from its top edge to dismiss it, as in Apple Maps and Google Maps.
function sheetSwipe(m) {
  let y0 = null,
    x0 = 0,
    dy = 0;
  m.addEventListener(
    'touchstart',
    (e) => {
      y0 = null;
      if (!isMobile() || m.scrollTop > 0 || e.touches.length > 1) return;
      if (e.target.closest('input,textarea,select,.leaflet-container')) return;
      y0 = e.touches[0].clientY;
      x0 = e.touches[0].clientX;
      dy = 0;
    },
    { passive: true },
  );
  m.addEventListener(
    'touchmove',
    (e) => {
      if (y0 === null) return;
      dy = e.touches[0].clientY - y0;
      const dx = Math.abs(e.touches[0].clientX - x0);
      if (dy <= 0 || dx > dy || m.scrollTop > 0) {
        m.style.transform = '';
        y0 = null;
        return;
      }
      e.preventDefault();
      m.style.transition = 'none';
      m.style.transform = `translateY(${dy}px)`;
    },
    { passive: false },
  );
  m.addEventListener('touchend', () => {
    m.style.transition = '';
    if (y0 !== null && dy > 110) closeModal('user');
    else m.style.transform = '';
    y0 = null;
  });
}
window.addEventListener('popstate', () => {
  if (modalHistory && !history.state?.roamModal && $('.modal-backdrop')) closeModal('history');
});
function toggleSave(id, quiet = false) {
  if (!validPlace(id)) return;
  const had = saved(id);
  S.saved = had ? S.saved.filter((x) => x !== id) : [...S.saved, id];
  persist();
  $$(`[data-action="save"][data-id="${id}"]`).forEach((b) => {
    b.classList.toggle('saved', !had);
    b.classList.toggle('pop', !had);
    b.innerHTML =
      icon('heart') + (b.classList.contains('savewide') ? (had ? ' Save' : ' Saved') : '');
    b.setAttribute('aria-label', (had ? 'Save ' : 'Unsave ') + P[id].name);
    if (b.hasAttribute('aria-pressed')) b.setAttribute('aria-pressed', String(!had));
    b.title = had ? 'Save place' : 'Saved';
  });
  if (!quiet) {
    const cid = P[id].cityId;
    if (had) toast('Removed from Saved.', { label: 'Undo', run: () => toggleSave(id, true) });
    else {
      navigator.vibrate?.(10);
      if (inTrip(cid)) toast('Saved.', { label: 'Undo', run: () => toggleSave(id, true) });
      else
        toast(`Saved. Add ${C[cid].name} to your trip?`, {
          label: `Add ${C[cid].name}`,
          run: () => toggleTrip(cid),
        });
    }
  }
  if (location.hash.startsWith('#/saved')) renderSaved();
  else if (location.hash.startsWith('#/trip')) rerenderTrip();
  else if (location.hash.startsWith('#/city') && cityFilter === 'saved') refreshCityResults();
  if (map) {
    if (mapKind === 'saved') renderMapPins(false);
    else
      mapMarkers[id]
        ?.getElement()
        ?.querySelector('.map-pin')
        ?.classList.toggle('selected', saved(id));
  }
}
function saveTopFive(cid) {
  const add = topFive(cid).filter((p) => !saved(p.id));
  if (!add.length) return;
  S.saved = [...S.saved, ...add.map((p) => p.id)];
  persist();
  add.forEach((p) =>
    $$(`[data-action="save"][data-id="${p.id}"]`).forEach((b) => b.classList.add('saved')),
  );
  if (location.hash.startsWith('#/saved')) renderSaved();
  else if (location.hash.startsWith('#/trip')) rerenderTrip();
  toast(`Saved ${add.length} place${add.length === 1 ? '' : 's'} in ${C[cid].name}.`, {
    label: 'Undo',
    run: () => {
      S.saved = S.saved.filter((x) => !add.some((p) => p.id === x));
      persist();
      route();
    },
  });
}
function toggleTrip(id, quiet = false) {
  if (!validCity(id)) return;
  const had = inTrip(id),
    at = S.trip.indexOf(id);
  S.trip = had ? S.trip.filter((x) => x !== id) : [...S.trip, id];
  if (!S.days[id]) S.days[id] = C[id].days;
  persist();
  $$(`[data-action="trip-toggle"][data-id="${id}"]`).forEach((b) => {
    if (b.closest('.reorder')) return;
    const sm = b.classList.contains('addcity');
    b.classList.toggle('saved', !had);
    b.innerHTML = icon(had ? 'plus' : 'check') + (sm ? '' : tripLabel(id, b.dataset.short));
    b.setAttribute(
      'aria-label',
      `${had ? 'Add' : 'Remove'} ${C[id].name} ${had ? 'to' : 'from'} trip`,
    );
  });
  if (location.hash.startsWith('#/trip')) rerenderTrip();
  else if (location.hash.startsWith('#/saved')) renderSaved();
  if (quiet) return;
  if (had)
    toast(`${C[id].name} removed from your trip.`, {
      label: 'Undo',
      run: () => {
        if (inTrip(id)) return;
        S.trip.splice(Math.min(at, S.trip.length), 0, id);
        persist();
        route();
      },
    });
  else if (topFive(id).some((p) => !saved(p.id)))
    toast(`${C[id].name} added to your trip.`, {
      label: 'Save the top 5',
      run: () => saveTopFive(id),
    });
  else toast(`${C[id].name} added to your trip.`);
}
function hav(a, b) {
  const r = Math.PI / 180,
    dl = (b.lat - a.lat) * r,
    dn = (b.lon - a.lon) * r;
  const x =
    Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)));
}
function routeDist(ids) {
  return ids.slice(1).reduce((s, id, i) => s + hav(C[ids[i]], C[id]), 0);
}
function optimizeRoute() {
  if (S.trip.length < 3) {
    toast('Add at least three destinations to compare the order.');
    return;
  }
  const original = [...S.trip],
    left = S.trip.slice(1),
    out = [S.trip[0]];
  while (left.length) {
    left.sort((a, b) => hav(C[out.at(-1)], C[a]) - hav(C[out.at(-1)], C[b]));
    out.push(left.shift());
  }
  let changed = true,
    rounds = 0;
  while (changed && rounds++ < 20) {
    changed = false;
    for (let i = 1; i < out.length - 1; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const cand = [...out.slice(0, i), ...out.slice(i, j + 1).reverse(), ...out.slice(j + 1)];
        if (routeDist(cand) < routeDist(out) - 0.1) {
          out.splice(0, out.length, ...cand);
          changed = true;
        }
      }
    }
  }
  if (routeDist(out) > routeDist(original)) S.trip = original;
  else S.trip = out;
  persist();
  renderTrip();
  toast('Suggested order updated. First city kept fixed; check actual transport links.');
}
function leg(a, b) {
  const known =
    a.connections?.find((x) => x.to === b.id) || b.connections?.find((x) => x.to === a.id);
  const d = hav(a, b);
  if (known)
    return { mode: known.mode, minutes: known.minutes, note: known.note, known: true, distance: d };
  return {
    mode:
      d > 850 || a.region !== b.region
        ? 'Check flights / connections'
        : 'Check rail, road or ferry',
    minutes: null,
    note: 'No verified direct transport link is stored for this pair. Geographic proximity alone does not establish a usable route.',
    known: false,
    distance: d,
  };
}
function durationLabel(m) {
  if (!m || !Number.isFinite(Number(m))) return '';
  return m >= 60
    ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + Math.round(m % 60) + ' min' : ''}`
    : `${Math.round(m)} min`;
}
function transferDays() {
  return Math.max(0, S.trip.length - 1);
}
function totalDays() {
  return S.trip.reduce((s, id) => s + (S.days[id] || C[id].days), 0);
}
function tripBudgets() {
  const out = {};
  for (const id of S.trip) {
    const c = C[id],
      d = S.days[id] || c.days,
      extra = Number(S.extra[id]) || 0,
      hotel = (Number(S.lodging[id]) || 0) * d,
      k = c.currency;
    out[k] ??= [0, 0];
    out[k][0] += (c.dailyBudget[0] * d + extra + hotel) * S.people;
    out[k][1] += (c.dailyBudget[1] * d + extra + hotel) * S.people;
  }
  return out;
}
function timeRank(p) {
  const t = (p.bestTime || '').toLowerCase();
  if (/before departure|buy.*before|prepare|supplies/.test(t)) return -1;
  if (/breakfast|sunrise|dawn|early morning|opening|early start/.test(t)) return 0;
  if (/morning/.test(t)) return 1;
  if (/lunch|midday/.test(t)) return 2;
  if (/sunset|late afternoon/.test(t)) return 4;
  if (/evening|night|dusk/.test(t)) return 5;
  if (/afternoon/.test(t)) return 3;
  return 2;
}
function plannedHours(items) {
  return (
    items.reduce((n, p) => n + p.duration, 0) +
    items.slice(1).reduce((n, p, i) => {
      const d = hav(items[i], p);
      return n + Math.max(0.2, d < 2 ? d / 4 : 0.35 + d / 22);
    }, 0)
  );
}
function citySchedule(c) {
  const days = S.days[c.id] || c.days,
    cap = S.pace === 'relaxed' ? 5 : S.pace === 'full' ? 9 : 7,
    maxStops = S.pace === 'relaxed' ? 2 : S.pace === 'full' ? 4 : 3;
  let chosen = c.items.map((p) => P[p.id]).filter((p) => saved(p.id));
  const manual = chosen.length > 0;
  if (!manual) chosen = c.items.map((p) => P[p.id]).sort((a, b) => a.priority - b.priority);
  const wanted = new Set(chosen.map((p) => p.id));
  const byTime = (items) => [...items].sort((a, b) => timeRank(a) - timeRank(b));
  let groups = [];
  if (c.dayClusters?.length) {
    groups = c.dayClusters
      .map((g) => ({
        ...g,
        curated: true,
        items: g.items.filter((id) => wanted.has(id)).map((id) => P[id]),
      }))
      .filter((g) => g.items.length);
    const grouped = new Set(groups.flatMap((g) => g.items.map((p) => p.id)));
    for (const p of chosen.filter((p) => !grouped.has(p.id)))
      groups.push({
        label: p.area,
        items: [p],
        days: p.duration > 16 ? Math.ceil(p.duration / 12) : 1,
        note: '',
      });
  } else {
    const local = chosen.filter((p) => !p.excursion && p.duration < 6 && hav(c, p) < 40);
    let left = [...local];
    while (left.length) {
      left.sort((a, b) => a.priority - b.priority || (a.kind === 'see' ? -1 : 1));
      let items = [left.shift()];
      while (items.length < maxStops && left.length) {
        const prev = items.at(-1);
        left.sort((a, b) => hav(prev, a) - hav(prev, b));
        const j = left.findIndex(
          (p) => hav(prev, p) < 5 && plannedHours(byTime([...items, p])) <= cap,
        );
        if (j < 0) break;
        items = byTime([...items, left.splice(j, 1)[0]]);
      }
      groups.push({
        label: [...new Set(items.map((p) => p.area))].join(' / '),
        items,
        days: 1,
        note: 'Check opening hours and any reserved entry slot before following this sequence.',
      });
    }
    for (const p of chosen.filter((p) => !local.includes(p)))
      groups.push({
        label: p.area,
        items: [p],
        days: p.duration > 16 ? Math.ceil(p.duration / 12) : 1,
        note:
          p.duration > 16
            ? 'Reserve consecutive days and an overnight stay.'
            : 'Dedicate this day to the excursion and confirm access/transport.',
      });
  }
  const bins = [],
    used = new Set();
  function addDay(g, items, extra = {}) {
    const hours = plannedHours(items);
    // A curated park group is an editorial day, not a bag of independent outings.
    // Keep its order. Surface a pace warning instead of secretly splitting it.
    const paceWarning = items.length > maxStops || hours > cap;
    const note = [
      g.note || '',
      paceWarning
        ? `This recommended day is longer than your ${S.pace} pace or has more stops. Shorten the visits, omit a stop, or add time; the group is kept together to avoid repeat journeys. Summed time estimates may overlap within a park excursion.`
        : '',
    ]
      .filter(Boolean)
      .join(' ');
    items.forEach((p) => used.add(p.id));
    bins.push({
      items,
      hours,
      excursion: items.some((p) => p.excursion || p.duration >= 6 || hav(c, p) > 40),
      label: g.label,
      note,
      paceWarning,
      curated: !!g.curated,
      ...extra,
    });
  }
  for (const g of groups) {
    let items = g.curated ? [...g.items] : byTime(g.items);
    const blockDays = Math.max(
      g.days || 1,
      ...items.map((p) => (p.duration > 16 ? Math.ceil(p.duration / 12) : 1)),
    );
    if (blockDays > 1) {
      if (bins.length + blockDays > days) continue;
      // Yellowstone's two basin items can be shown on separate days.
      // A single Machu Picchu/Colca item represents the whole booked excursion.
      if (items.length === blockDays && items.every((p) => p.duration <= 12)) {
        items.forEach((p, k) =>
          addDay({ ...g, label: `${g.label} · day ${k + 1} of ${blockDays}` }, [p], {
            excursion: true,
            blockDays,
            blockDay: k + 1,
          }),
        );
      } else {
        addDay(
          {
            ...g,
            note: [
              g.note || '',
              `This is a ${blockDays}-day block. Item durations and excursion prices apply to the complete trip; the following days are reserved for its continuation.`,
            ]
              .filter(Boolean)
              .join(' '),
          },
          items,
          {
            hours: Math.min(
              12,
              items.reduce((h, p) => h + p.duration, 0),
            ),
            excursion: true,
            blockDays,
            blockDay: 1,
          },
        );
        for (let k = 1; k < blockDays; k++)
          bins.push({
            items: [],
            hours: 0,
            excursion: true,
            continuation: true,
            blockDays,
            blockDay: k + 1,
            label: g.label + ' · continuation',
            note: 'Continue the same excursion and return or move onward as arranged. Do not add a full city sightseeing day here.',
          });
      }
      continue;
    }
    if (g.curated) {
      if (bins.length < days) addDay(g, items);
      continue;
    }
    while (items.length && bins.length < days) {
      const chunk = [];
      while (items.length && chunk.length < maxStops) {
        const p = items[0];
        if (chunk.length && plannedHours([...chunk, p]) > cap) break;
        chunk.push(items.shift());
        if (p.duration >= 6 || p.excursion) break;
      }
      if (!chunk.length) break;
      addDay(g, chunk);
    }
  }
  while (bins.length < days)
    bins.push({ items: [], hours: 0, excursion: false, label: 'Room to explore', note: '' });
  return { bins, manual, unplaced: chosen.filter((p) => !used.has(p.id)) };
}

function dayDirections(points, stay = null) {
  if (stay && points.length)
    return `<div class="day-origin">${icon('pin')} Start at ${esc(stay.label)} · ${external(mapsDirections([stay, points[0]], 'transit'), 'Check first leg / transit ↗')}</div><div class="actions">${external(mapsDirections([stay, ...points].slice(0, 5), 'walking'), icon('route') + ' Walk from my stay', 'btn ghost small')}</div><small class="muted">Walking route preview from your accommodation. Check transit, entrances and actual journey times in Maps.</small>`;
  if (!points.length) return '';
  if (points.length === 1) {
    const p = points[0];
    return `<div class="actions">${external(mapsPin(p), icon('pin') + ' Locate in Google Maps', 'btn ghost small')}${p.sourceUrls?.[0] ? external(p.sourceUrls[0], icon('external') + ' Check official access / source', 'btn ghost small') : ''}</div><small class="muted">Check the actual entrance, trailhead, rail/shuttle or tour meeting point. A site pin is not a driving destination.</small>`;
  }
  const maxLeg = points.slice(1).reduce((m, p, i) => Math.max(m, hav(points[i], p)), 0),
    mode = maxLeg > 2 ? 'driving' : 'walking',
    chunks = [];
  for (let i = 0; i < points.length - 1; i += 4) chunks.push(points.slice(i, i + 5));
  return `<div class="actions">${chunks.map((g, i) => external(mapsDirections(g, mode), icon('route') + ` Open ${chunks.length > 1 ? 'segment ' + (i + 1) : 'route'} in Maps`, 'btn ghost small')).join('')}</div><small class="muted">${mode === 'walking' ? 'Check walking access and entrances.' : 'Driving is a preview; compare transit or a guided transfer in Maps.'} Confirm opening hours separately.</small>`;
}
function buildDaysHtml() {
  let n = 1;
  const start = S.startDate ? new Date(S.startDate + 'T12:00:00') : null;
  function datelabel(day) {
    if (!start) return '';
    const d = new Date(start);
    d.setDate(start.getDate() + day - 1);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  let html = '';
  for (let ci = 0; ci < S.trip.length; ci++) {
    const c = C[S.trip[ci]],
      sch = citySchedule(c);
    html += `<div class="sectionhead"><div><div class="eyebrow">${esc(c.country)}</div><h2>${esc(c.name)}</h2></div><p>${sch.manual ? 'Using your saved places in this destination.' : 'A starting plan from the curated highlights. Save specific places to choose your own.'}</p></div>`;
    for (const [cityDay, day] of sch.bins.entries()) {
      const labels = day.items.map((p) => p.area).filter((x, i, a) => a.indexOf(x) === i);
      html += `<article class="daycard ${day.continuation ? 'continuation' : ''}"><div class="daytitle"><h3>Day ${n} ${datelabel(n) ? '· ' + datelabel(n) : ''}</h3><span>${day.blockDays ? `Excursion day ${day.blockDay} of ${day.blockDays}` : day.continuation ? 'Overnight trip continues' : day.excursion ? 'Dedicated excursion' : day.items.length ? `About ${Math.ceil(day.hours)} h planned` : 'A flexible day'}</span></div>${day.label ? `<h4 style="font-size:13px;margin:0 0 8px">${esc(day.label)}</h4>` : ''}${day.note ? `<p class="day-context">${esc(day.note)}</p>` : ''}${day.items.length ? `<p class="muted" style="font-size:11px">${esc(labels.join(' → '))}${c.id === 'cusco' && cityDay === 0 ? ' · keep your first day gentle' : ''}</p>` : day.continuation ? '' : '<p class="muted" style="font-size:12px">Use this day to rest, explore beyond the shortlist or add a guided excursion. No extra places have been invented to fill the schedule.</p>'}${day.items.map((p) => `<div class="day-stop"><input class="tick" type="checkbox" data-visited="${p.id}" aria-label="Mark ${esc(p.name)} visited" ${S.visited.includes(p.id) ? 'checked' : ''}>${photoTag(p.id)}<div class="stoptext"><h4><button class="inline-link" data-action="place" data-id="${p.id}">${esc(p.name)}</button></h4><p>${p.duration} h${day.blockDays > 1 && day.items.length === 1 && p.duration > 12 ? ' for the whole excursion' : ''} · ${esc(p.bestTime)} · ${priceLabel(p)}</p>${p.reservation !== 'Usually not needed' ? `<span class="pill warm">${esc(p.reservation)} booking</span>` : ''}<p>${esc(p.tip)}</p><p class="price-note-inline">${esc(p.priceNote)}</p>${S.notes[p.id] ? `<p><strong>Your note:</strong> ${esc(S.notes[p.id])}</p>` : ''}</div>${external(mapsPin(p), icon('external'), 'btn light small')}</div>`).join('')}${dayDirections(day.items, day.excursion ? null : S.stays[c.id])}</article>`;
      n++;
    }
    if (sch.unplaced.length)
      html += `<div class="info-note"><strong>${sch.unplaced.length} more option${sch.unplaced.length > 1 ? 's' : ''} not fitted into these days:</strong> ${sch.unplaced.map((p) => esc(p.name)).join(', ')}. Add days or save only your priorities. The app leaves these visible rather than silently overfilling your itinerary.</div>`;
    if (ci < S.trip.length - 1) {
      const next = C[S.trip[ci + 1]],
        l = leg(c, next);
      html += `<article class="daycard" style="background:#edf0e7"><div class="daytitle"><h3>Day ${n} ${datelabel(n) ? '· ' + datelabel(n) : ''} · Transfer buffer</h3><span>${esc(c.name)} → ${esc(next.name)}</span></div><p style="font-size:12px;color:var(--muted)">${esc(l.mode)}${l.minutes ? ' · approximate service time ' + durationLabel(l.minutes) : ''}. ${esc(l.note)} One buffer day is reserved here; long-haul connections, border formalities or limited services can need more. Short regional trips may let you reclaim part of this day.</p></article>`;
      n++;
    }
  }
  return html;
}
function cityArrivalDate(id) {
  if (!S.startDate) return null;
  const d = new Date(S.startDate + 'T12:00:00');
  const index = S.trip.indexOf(id);
  let offset = 0;
  for (let i = 0; i < index; i++) offset += (S.days[S.trip[i]] || C[S.trip[i]].days) + 1;
  d.setDate(d.getDate() + offset);
  return d;
}
function intercityLink(a, b, l) {
  if (/flight|fly|air/i.test(l.mode) || (!l.known && l.distance > 850))
    return external(
      'https://www.google.com/search?q=' +
        encodeURIComponent('flights ' + a.name + ' to ' + b.name),
      'Check flights / connections ↗',
    );
  if (/ferry|boat/i.test(l.mode))
    return external(
      'https://www.google.com/search?q=' +
        encodeURIComponent(a.name + ' ' + b.name + ' official ferry schedule'),
      'Check ferry dates and ports ↗',
    );
  if (!l.known)
    return external(
      'https://www.google.com/search?q=' +
        encodeURIComponent('how to travel from ' + a.name + ' to ' + b.name),
      'Check transport options ↗',
    );
  return external(
    mapsDirections(
      [S.stays[a.id] || a, S.stays[b.id] || b],
      /train|rail|shinkansen/i.test(l.mode) ? 'transit' : 'driving',
    ),
    'Check route options ↗',
  );
}
function parkNotice(c) {
  if (!['springdale', 'flagstaff', 'moab', 'jackson', 'mariposa', 'las-vegas'].includes(c.id))
    return c.budgetNote
      ? `<div class="info-note"><strong>Budget scope:</strong> ${esc(c.budgetNote)}</div>`
      : '';
  return `<div class="info-note"><strong>Park travel has a separate budget.</strong> ${esc(c.budgetNote || 'Rental car, fuel and admission/pass costs are extra.')} For 2026, designated parks add USD 100 per eligible non-U.S. resident aged 16+ unless covered by a valid qualifying pass. The nonresident annual pass is USD 250; coverage depends on vehicle/party rules. ${external('https://www.nps.gov/aboutus/nonresident-fees.htm', 'Read current NPS fee and eligibility rules ↗')}</div>`;
}
// The Trip page opens on the trip itself: cover, route map, the cities with what you saved in
// each, and the total. Dates, pace and travellers sit behind "Trip settings".
let tripTab = 'plan',
  tripMap = null;
function listNames(names) {
  return names.length < 3
    ? names.join(' and ')
    : names.slice(0, -1).join(', ') + ' and ' + names.at(-1);
}
function starterCard(t) {
  const o = budgetOrigin(),
    days = t.days.reduce((a, b) => a + b, 0),
    est = o ? pick(templateCost(t).total) : 0;
  return `<article class="startercard"><div class="sc-photo">${photoTag(t.cities[0])}</div><div class="sc-body"><h3>${esc(t.title)}</h3><p>${esc(listNames(t.cities.filter((id) => C[id]).map((id) => C[id].name)))}</p><small>${days} days${est ? ` · about ${cash(est)}` : ''}</small><button class="btn light small" data-action="template" data-id="${t.id}">Start with this trip</button></div></article>`;
}
function tripCityCard(id, i) {
  const c = C[id],
    l = i ? leg(C[S.trip[i - 1]], c) : null,
    mine = savedIn(id),
    arrivalDate = cityArrivalDate(id),
    m = arrivalDate ? arrivalDate.getMonth() + 1 : 0,
    days = S.days[id] || c.days;
  return `${l ? `<div class="leg"><strong>${icon('route')} ${esc(l.mode)} ${l.minutes ? '· about ' + durationLabel(l.minutes) : ''}</strong>${intercityLink(C[S.trip[i - 1]], c, l)}</div>` : ''}<article class="routecard"><div class="routecardtop"><div class="route-number">${i + 1}</div>${photoTag(id)}<div class="routeinfo"><h3>${esc(c.name)}</h3><p>${days} day${days > 1 ? 's' : ''} · ${mine.length} saved</p></div><div class="reorder"><button data-action="move" data-id="${id}" data-dir="-1" aria-label="Move ${esc(c.name)} earlier" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button><button data-action="move" data-id="${id}" data-dir="1" aria-label="Move ${esc(c.name)} later" ${i === S.trip.length - 1 ? 'disabled' : ''}>${icon('down')}</button><button data-action="trip-toggle" data-id="${id}" aria-label="Remove ${esc(c.name)} from trip">${icon('close')}</button></div></div><div class="rc-places">${mine.map((p) => `<button class="rc-place" data-action="place" data-id="${p.id}" aria-label="${esc(p.name)}">${visualTag(p.id)}<span>${esc(p.name)}</span></button>`).join('')}<a class="rc-place add" href="#/city/${id}"><i>${icon('plus')}</i><span>${mine.length ? 'Add places' : 'Choose places'}</span></a>${mine.length ? '' : `<button class="rc-place add" data-action="save-top5" data-id="${id}"><i>${icon('heart')}</i><span>Save the top 5</span></button>`}</div><div class="actions"><div class="stepper"><button data-action="days" data-id="${id}" data-dir="-1" aria-label="Fewer days in ${esc(c.name)}">−</button><strong>${days} day${days > 1 ? 's' : ''}</strong><button data-action="days" data-id="${id}" data-dir="1" aria-label="More days in ${esc(c.name)}">+</button></div></div>${m && !c.bestMonths.includes(m) ? `<p class="season-warning">${MONTHS[m - 1]} is outside the best months here. ${esc(c.seasonNote)}</p>` : ''}<details class="rc-more" data-keep="more-${id}"><summary>Hotel and extras</summary>${stayPanel(c, true)}<div class="budget-custom"><div class="field"><label>Hotel / person / night (${c.currency})</label><input type="number" min="0" data-lodging="${id}" value="${S.lodging[id] || 0}" aria-label="Hotel per person per night in ${esc(c.name)}"></div><div class="field"><label>Extras / person (${c.currency})</label><input type="number" min="0" data-extra="${id}" value="${S.extra[id] || 0}" aria-label="Extra excursion allowance in ${esc(c.name)}"></div></div></details></article>`;
}
function tripPlanTab() {
  return `<div class="tripplan"><div class="tripmapwrap"><div id="trip-map" aria-label="Route map"></div><a class="btn light small tm-open" href="#/map/trip">${icon('map')} Open map</a></div><div class="tripcities">${S.trip.map(tripCityCard).join('')}<button class="selectcities" data-action="choose-cities">${icon('plus')} Add another city</button></div></div><details class="trip-settings" data-keep="settings"><summary>${icon('sliders')} Trip settings<small>${S.startDate ? esc(S.startDate) : 'No dates yet'} · ${S.people} traveller${S.people > 1 ? 's' : ''}</small></summary><div class="trip-controls"><div class="field"><label for="trip-date">Start date</label><input type="date" id="trip-date" value="${S.startDate}"></div><div class="field"><label for="trip-pace">Daily pace</label><select id="trip-pace">${[
    ['relaxed', 'Unhurried · aim for 5 hours'],
    ['balanced', 'Balanced · aim for 7 hours'],
    ['full', 'Full days · aim for 9 hours'],
  ]
    .map(([v, l]) => `<option value="${v}" ${S.pace === v ? 'selected' : ''}>${l}</option>`)
    .join(
      '',
    )}</select></div><div class="field smallfield"><label for="trip-people">Travellers</label><input type="number" id="trip-people" min="1" max="20" value="${S.people}"></div></div>${S.trip.length > 2 ? `<button class="btn light small" data-action="optimize">${icon('shuffle')} Suggest visit order</button>` : ''}</details><div class="plan-toolbar"><h2>Day by day</h2></div><section id="day-plans">${buildDaysHtml()}</section>`;
}
function tripShareTab() {
  return `<div class="sharepanel"><h2>Share with friends</h2><p>One link shows your route, places and costs.</p><button class="btn" data-action="share">${icon('share')} Share with friends</button></div><details class="trip-more" data-keep="more"><summary>More</summary><div class="more-list"><button data-action="export">${icon('download')} Save a backup file</button><button data-action="import">${icon('upload')} Open a backup file</button><button data-action="csv">${icon('pin')} Export pins for Google My Maps</button><button data-action="print">${icon('print')} Print the plan</button></div></details>`;
}
function renderTrip() {
  headerActive('trip');
  const keep = $('.trippage') && [...$$('.trippage details[open]')].map((d) => d.dataset.keep);
  if (tripMap) {
    tripMap.remove();
    tripMap = null;
  }
  if (!S.trip.length) {
    $('#app').innerHTML =
      `<div class="wrap trippage"><div class="pagehead"><div><h1>Your trip</h1><p>Start from a ready-made trip, or pick your own cities.</p></div></div><div class="starter-grid">${TEMPLATES.slice(0, 3).map(starterCard).join('')}</div><div class="actions trip-start"><button class="btn" data-action="choose-cities">${icon('plus')} Choose my own cities</button><button class="inline-link" data-action="import">${icon('upload')} Open a backup file</button></div><details class="trip-more"><summary>More ready-made trips</summary><div class="starter-grid">${TEMPLATES.slice(3).map(starterCard).join('')}</div></details>${footer()}</div>`;
    return;
  }
  const cost = tripCost(),
    days = totalDays() + transferDays();
  $('#app').innerHTML =
    `<div class="wrap trippage"><section class="tripcover">${photoTag(S.trip[0], '', false)}<div class="tc-copy"><span class="eyebrow">YOUR TRIP</span><h1>${esc(listNames(S.trip.map((id) => C[id].name)))}</h1><p>${days} days · ${S.people} traveller${S.people > 1 ? 's' : ''}</p></div><button class="tc-total" data-action="trip-tab" data-id="cost"><small>About</small><b>${cash(cost.est)}</b></button></section><div class="tripbar"><button class="btn" data-action="share">${icon('share')} Share with friends</button></div><div class="citytabs triptabs" role="tablist">${[
      ['plan', 'Plan'],
      ['cost', 'Cost'],
      ['share', 'Share'],
    ]
      .map(
        ([k, l]) =>
          `<button role="tab" aria-selected="${tripTab === k}" class="${tripTab === k ? 'active' : ''}" data-action="trip-tab" data-id="${k}">${l}</button>`,
      )
      .join(
        '',
      )}</div><div class="triptab">${tripTab === 'cost' ? tripCostBar() + tripReceipt() : tripTab === 'share' ? tripShareTab() : tripPlanTab()}</div>${footer()}</div>`;
  (keep || []).forEach((k) => $(`.trippage details[data-keep="${k}"]`)?.setAttribute('open', ''));
  if (tripTab === 'plan') initTripMap();
}
function rerenderTrip() {
  const y = window.scrollY;
  renderTrip();
  window.scrollTo(0, y);
}
function initTripMap() {
  if (!$('#trip-map') || typeof L === 'undefined') return;
  tripMap = L.map('trip-map', {
    zoomControl: !isMobile(),
    minZoom: 1,
    maxZoom: 12,
    scrollWheelZoom: false,
    dragging: !isMobile(),
    attributionControl: true,
  });
  tripMap.createPane('offline-outline');
  tripMap.getPane('offline-outline').style.zIndex = '150';
  L.geoJSON(DATA.world, {
    pane: 'offline-outline',
    style: outlineStyle(),
    interactive: false,
  }).addTo(tripMap);
  tripMap.attributionControl.setPrefix(false);
  if (S.street && navigator.onLine)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      maxZoom: 19,
    }).addTo(tripMap);
  const pts = S.trip.map((id) => [C[id].lat, C[id].lon]);
  if (pts.length > 1)
    L.polyline(pts, { color: '#e7764b', weight: 3, dashArray: '7 7' }).addTo(tripMap);
  S.trip.forEach((id, i) =>
    L.marker(pts[i], {
      icon: L.divIcon({
        className: 'trip-pin',
        html: `<b>${i + 1}</b><span>${esc(C[id].name)}</span>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      }),
      keyboard: false,
    })
      .on('click', () => (location.hash = '#/city/' + id))
      .addTo(tripMap),
  );
  if (pts.length > 1) tripMap.fitBounds(pts, { padding: [46, 46], maxZoom: 7 });
  else tripMap.setView(pts[0], 6);
  setTimeout(() => tripMap?.invalidateSize(), 100);
}
function chooseCities() {
  showModal(
    `<div class="modalcontent"><span class="eyebrow">ONE CITY OR A GRAND ADVENTURE</span><h2>Where would you like to go?</h2><div class="searchbox" style="margin-bottom:20px">${icon('search')}<input id="choose-city-search" type="search" placeholder="Search destinations…" aria-label="Search destinations to add"></div><div class="compact-citylist" id="choose-city-list">${chooseCityList('')}</div><div class="actions" style="margin-top:20px"><button class="btn" data-action="finish-cities">See my trip ${icon('arrow')}</button></div></div>`,
    'Choose destinations',
  );
}
function chooseCityList(q) {
  return CITIES.filter((c) => (c.name + ' ' + c.country).toLowerCase().includes(q.toLowerCase()))
    .map(
      (c) =>
        `<div class="compactcity">${photoTag(c.id)}<div class="text"><h4>${esc(c.name)}</h4><p>${esc(c.country)} · ${c.days} suggested days</p></div>${cityAdd(c.id, false, true)}</div>`,
    )
    .join('');
}
function applyTemplate(id) {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) return;
  for (let i = 0; i < t.cities.length; i++) {
    const id = t.cities[i];
    if (!C[id]) continue;
    if (!inTrip(id)) {
      S.trip.push(id);
      S.days[id] = t.days[i];
    }
  }
  persist();
  closeModal();
  location.hash = '#/trip';
  if (location.hash === '#/trip') renderTrip();
  tripTab = 'plan';
  toast('Trip added.');
}
function budgetDetail() {
  showModal(
    `<div class="modalcontent"><h2>Your spending assumptions.</h2><p class="muted">Local currency amounts for ${S.people} traveller${S.people > 1 ? 's' : ''}. Cash guidance is a subset of spending, not another expense.</p><div style="overflow:auto"><table class="budgettable"><thead><tr><th>Destination</th><th>Days</th><th>Daily / person</th><th>Cash / person / day</th></tr></thead><tbody>${S.trip
      .map((id) => {
        const c = C[id];
        return `<tr><td>${esc(c.name)}</td><td>${S.days[id] || c.days}</td><td>${range(c.dailyBudget, c.currency)}</td><td>${range(c.cashPerDay, c.currency)}</td></tr>`;
      })
      .join(
        '',
      )}</tbody></table></div><div class="info-note">Do not carry the entire trip budget in cash. These are editable planning allowances. Premium excursions—especially safaris, Machu Picchu rail packages and theme-park upgrades—can materially exceed the baseline. Your exact itinerary needs a booking-by-booking budget.</div><h3>Currency totals with your entered extras</h3>${Object.entries(
      tripBudgets(),
    )
      .map(([c, r]) => `<p><strong>${range(r, c)}</strong></p>`)
      .join(
        '',
      )}<p class="muted" style="font-size:12px">The app deliberately does not add different currencies together. A zero hotel or extra allowance means those costs have not been supplied.</p></div>`,
    'Budget breakdown',
  );
}
// Three real-photo places to start from when nothing is saved yet.
function starterPlaces() {
  const out = [];
  for (const c of CITIES) {
    const p = topFive(c.id).find((x) => !ART[x.id]);
    if (p) out.push(p);
    if (out.length === 3) break;
  }
  return out;
}
function renderSaved() {
  headerActive('saved');
  const places = S.saved.map((id) => P[id]).filter(Boolean),
    shops = S.shops.map((id) => SHOPS[id]).filter(Boolean),
    cities = [...new Set([...places, ...shops].map((p) => p.cityId))];
  $('#app').innerHTML =
    `<div class="wrap savedpage"><div class="pagehead"><div><h1>Saved</h1><p>${cities.length ? 'Your places, by city. Add a city to your trip to start planning it.' : 'Tap the heart on any place to keep it here.'}</p></div></div>${
      cities.length
        ? cities
            .map((id) => {
              const mine = places.filter((p) => p.cityId === id),
                shop = shops.filter((x) => x.cityId === id);
              return `<section class="savedgroup"><div class="sg-head"><a class="sg-city" href="#/city/${id}">${photoTag(id)}<span><strong>${esc(C[id].name)}</strong><small>${mine.length + shop.length} saved</small></span></a>${cityAdd(id)}</div>${mine.length ? `<div class="placegrid">${mine.map(placeCard).join('')}</div>` : ''}${shop.length ? `<div class="shopgrid savedshops">${shop.map((x) => `<article class="shopcard">${shopSave(x.id)}<div class="shopcard-top"><span class="pill gray">${icon('bag')} Shopping</span><small>${esc(x.area)}</small></div><h4>${esc(x.name)}</h4><p>${esc(x.summary)}</p>${external(shopMapsUrl(C[id], x), icon('pin') + ' Google Maps', 'inline-link shopmap')}</article>`).join('')}</div>` : ''}</section>`;
            })
            .join('')
        : `<div class="rowhead"><h2>Start with one of these</h2></div><div class="placegrid">${starterPlaces().map(placeCard).join('')}</div><div class="actions trip-start"><a href="#/" class="btn">Explore more ${icon('arrow')}</a></div>`
    }${footer()}</div>`;
}
function sourceRecords() {
  const records = new Map();
  for (const c of CITIES) {
    for (const s of c.sources) {
      const previous = records.get(s.url),
        cities = new Set([...(previous?.cities || []), c.name]);
      records.set(s.url, { ...s, cities: [...cities] });
    }
    for (const p of c.items) {
      for (const u of [
        ...(p.sourceUrls || []),
        ...(p.review?.url ? [p.review.url] : []),
        ...(p.dietary?.evidence || []).map((e) => e.url),
      ]) {
        if (records.has(u)) {
          const r = records.get(u);
          if (!r.cities.includes(c.name)) r.cities.push(c.name);
        } else
          records.set(u, {
            title: new URL(u).hostname,
            url: u,
            type: 'reference',
            cities: [c.name],
            checked: '2026-11-04',
          });
      }
    }
  }
  return [...records.values()];
}
const CHECKLIST = [
  ['tickets', 'Book critical timed entries and permits'],
  ['transport', 'Confirm intercity routes and transfer buffers'],
  ['entry', 'Check passport, entry and transit requirements'],
  ['cash', 'Check payment options and cash access'],
  ['offline', 'Download the app and export the trip backup'],
  ['weather', 'Recheck weather, closures and seasonal roads'],
  ['insurance', 'Arrange suitable travel insurance'],
  ['bookings', 'Keep booking confirmations available offline'],
];
function renderGuide() {
  headerActive('guide');
  $('#app').innerHTML =
    `<div class="wrap"><div class="pagehead"><div><h1>About & sources</h1><p>How this guide makes its choices, where the information comes from, and how to take your plan with you.</p></div></div><div class="methodology"><h2>Start here.</h2><ol><li><strong>Compare cities.</strong> Choose a published tourism ranking or your Japan-first priorities, then open a city.</li><li><strong>Understand the places.</strong> Open any place to see why it ranks where it does, its appeal and trade-offs. Use Filters for experience type, and the Food tab for named venues with halal and vegetarian filters.</li><li><strong>Add your stay.</strong> Search an address, paste coordinates or pin the map. Sort by distance and start local routes at your accommodation.</li><li><strong>Save the places that interest you.</strong> Your saved places become that city’s day-plan inputs. With no saved picks, the planner offers a shortlist.</li><li><strong>Add cities to your trip.</strong> Set the number of days and your pace. Put your arrival city first before suggesting an order.</li><li><strong>Use the map.</strong> Tap destination or place markers, filter by activity and open a pin in Google Maps.</li><li><strong>Keep a backup.</strong> Export your trip JSON, then import it in the app on another device. Browser storage is local to each browser/origin.</li></ol><h2>What “popular” means here.</h2><p>The ${CITIES.length} destinations combine your Japan-first priorities with Asia, Europe, Africa, Latin America and six U.S. park gateways. The city comparison offers the 2025 Euromonitor overall tourism index and a separate international-arrivals view. Their scope and definitions differ. <button class="inline-link" data-action="ranking-method">Read the ranking methods and source links ↗</button></p><p>Numeric ratings and review counts are shown only where a snapshot was retrieved. They are dated, platform-specific and may reflect an earlier crawl. Missing ratings remain missing. Most-reviewed order uses descending review counts; highest-rated order uses satisfaction ratings. Category ranks compare the places covered in this guide, not every venue in the city. Unknown counts stay unranked. The separate first-visit order is editorial. “Curated pick” does not imply a verified rating.</p><p>Restaurants recognised by the ${external('https://guide.michelin.com/', 'MICHELIN Guide ↗')} carry their current distinction (one to three Stars, or Bib Gourmand for good value), linked to the guide’s own entry with the date it was checked. MICHELIN is an inspector award for cooking quality, so it is shown next to the popularity rank and never mixed into it. Unranked MICHELIN restaurants are listed after ranked places and ahead of other editorial picks. Their prices are planning estimates from the guide’s price band, not menu quotes.</p><h2>What the route planner can tell you.</h2><p>The visit-order button uses geographic distance, keeps your first city fixed and makes a local improvement pass. It is useful for spotting backtracking. It does not solve for the cheapest airfare, shortest road journey, visas, train timetables or ferry availability. Where a researched connection is available, its mode and approximate service duration appear; otherwise the app explicitly asks you to check connections.</p><p>Daily plans use researched day groups where available and otherwise group nearby places under a time budget. Authored park days stay together to avoid repeat journeys; a visible note identifies any day above your selected pace. Shorten those days or save fewer stops to adapt them. Full-day and distant excursions get separate days. Each city-to-city move receives a one-day transfer placeholder; some long-haul or limited-frequency journeys need more. Closing days and timed reservations are not automatically scheduled. Map lines show the order of stops, not navigable roads or trails.</p><h2>Costs without false precision.</h2><p>Most prices are planning ranges in the destination’s currency. An official fee is labelled when it was specifically verified. Daily spending ranges cover food, local transport and ordinary sightseeing. Hotels, international and intercity travel, transfer days, shopping and major excursions require additional allowances. The cash suggestion sits within spending and is not added to the total.</p><p>Vehicle-based park fees, nonresident supplements and multi-day passes do not behave like ordinary per-person attraction tickets. Read each park card’s price note. Group totals in the planner apply to baseline daily budgets and your own entered per-person allowances, not automatically to park tickets.</p><h2>Google Maps and offline use.</h2><p>“Open in Google Maps” launches a place search; tap <strong>Save</strong> in Google Maps to add it to your own list. This app cannot write directly to your Google account. The CSV export contains names, cities, coordinates, notes and source links. Import it at ${external('https://www.google.com/mymaps', 'Google My Maps ↗')}, choosing Latitude and Longitude for locations and Name for labels. My Maps is separate from your personal saved-place lists.</p><p>The HTML file embeds the guide, photographs, map library and a world outline, so the core app can open without a connection. Street-map tiles, external booking/review pages and Google Maps need internet. Download local Google Maps areas separately when appropriate. Location access is optional and requested only when you press “Near me” or “Use my location”. Accommodation address searches are sent to Photon only when you press Find location; no search runs as you type. Search results require your confirmation. You can use map pins and coordinates instead. Accommodation, preferences and notes are stored locally and exported with your trip backup. Coordinates are approximate planning pins, not guaranteed entrances.</p><h2>Illustrations, photography & map credits.</h2><p>Trip starters and selected signature places have original AI illustrations. They are labelled and interpretive: a trip cover may combine locations and seasons, and a place illustration is not documentary evidence of its current layout. Where an illustration is used, the place page also offers a photographic view. Restaurant imagery never verifies the food’s ingredients or dietary suitability.</p><p>Every city and place has its own image asset. Photos include photographer, source and licence links. Sources include Pexels and Wikimedia Commons; each Commons photograph retains its stated licence, including share-alike terms on the adapted image where applicable. Images are resized, cropped and converted to WebP. Where an exact venue could not be verified, the image is marked as representative dish, craft or destination context. Historical photographs do not verify current vendors or conditions. The downloadable edition embeds every image; the hosted edition bundles the same images as local assets. Many cities and places also have a swipeable gallery of up to five extra photos taken from the photos used in their Wikipedia article and hosted by Wikimedia Commons. Each one is credited with its author and licence, and only freely licensed photographs are used. Gallery photos load from Commons when you open a place, so they need a connection. Photos are displayed with a small colour and contrast boost; the source files are unchanged.</p><p>Interactive mapping uses bundled ${external('https://leafletjs.com/', 'Leaflet')} (BSD 2-Clause). Offline country outlines are ${external('https://www.naturalearthdata.com/about/terms-of-use/', 'Natural Earth public-domain data')}. Optional street tiles are © ${external('https://www.openstreetmap.org/copyright', 'OpenStreetMap contributors')}. Optional address lookup uses ${external('https://github.com/komoot/photon', 'Photon')} with OpenStreetMap data. It has no uptime guarantee; map pinning and coordinate entry remain available if it fails. No map API key or external script is needed.</p><h2>Before you go.</h2><div class="resourcebox">${CHECKLIST.map(([id, label]) => `<label class="checkrow"><input type="checkbox" data-checklist="${id}" ${S.checklist.includes(id) ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div><div class="actions"><button class="btn" data-action="export">${icon('download')} Export your trip</button><button class="btn ghost" data-action="import">${icon('upload')} Import a backup</button></div><details class="sourcebook"><summary><h2>The sourcebook</h2></summary><p>${sourceRecords().length} unique linked travel/review sources across the guide. Research retrieved ${CHECKED}. Photo-source pages are listed in each destination’s Sources tab. This static edition does not refresh itself automatically.</p><div class="sourcefilters"><select id="source-city" aria-label="Filter sourcebook by destination"><option value="">All destinations</option>${CITIES.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select><select id="source-type" aria-label="Filter sourcebook by source type"><option value="">All source types</option><option value="official">Official</option><option value="reviews">Visitor reviews</option><option value="reference">Other reference</option></select></div><div id="source-results"></div></details></div>${footer()}</div>`;
  renderSources();
}
function renderSources() {
  const cid = $('#source-city')?.value || '',
    type = $('#source-type')?.value || '';
  const records = sourceRecords().filter(
    (s) => (!cid || s.cities.includes(C[cid].name)) && (!type || s.type === type),
  );
  $('#source-results').innerHTML = records
    .map(
      (s) =>
        `<div class="source-row"><div>${external(s.url, esc(s.title) + ' ↗')}<br><small>${esc(s.cities.join(', '))} · ${esc(new URL(s.url).hostname)}</small></div><span class="pill ${s.type === 'reviews' ? 'warm' : 'gray'}">${s.type}</span></div>`,
    )
    .join('');
}
function renderMap(id = '') {
  headerActive('map');
  mapCity = id === 'trip' ? '' : validCity(id) ? id : '';
  mapKind = 'all';
  mapQuery = '';
  mapDiet = 'all';
  $('#app').innerHTML =
    `<section class="map-layout"><aside class="mapaside"><h1>Follow your curiosity.</h1><p class="muted">Find a place, open its story, then make it part of your journey.</p><select id="map-city" aria-label="Map destination"><option value="">All ${CITIES.length} destinations</option>${CITIES.map((c) => `<option value="${c.id}" ${mapCity === c.id ? 'selected' : ''}>${esc(c.name)}, ${esc(c.country)}</option>`).join('')}</select><button class="map-mobile-toggle" data-action="map-list" aria-label="Show places list">${icon('list')}</button><div class="searchbox">${icon('search')}<input id="map-search" type="search" placeholder="Search places…" aria-label="Search map places"></div><div class="chips">${[
      ['all', 'All'],
      ['see', 'See'],
      ['eat', 'Eat'],
      ['shop', 'Shop'],
      ['saved', 'Saved'],
    ]
      .map(
        ([k, t]) =>
          `<button class="chip ${k === 'all' ? 'active' : ''}" data-action="map-kind" data-id="${k}">${t}</button>`,
      )
      .join(
        '',
      )}<select id="map-diet" aria-label="Map dietary filter"><option value="all">All dietary choices</option><option value="halal">Sourced halal choices</option><option value="vegetarian">Vegetarian options</option><option value="vegan">Plant-based menus</option></select><div id="map-stay-control">${mapCity ? `<button class="btn light small" data-action="edit-stay" data-id="${mapCity}">${icon('pin')} ${S.stays[mapCity] ? 'Change my stay' : 'Add my stay'}</button>` : ''}</div></div><div id="map-card" class="map-card" hidden></div><div class="map-sheet" id="map-sheet"><button class="sheet-handle" data-action="map-list" aria-expanded="false" aria-controls="map-list"><span class="modal-grab" aria-hidden="true"></span><span class="sheet-count" id="map-count"></span><span class="sheet-hint">${icon('list')}<span>List</span></span></button><div id="map-list" class="maplist"></div></div></aside><div class="mapcanvas"><div id="atlasmap" aria-label="Interactive destination and attraction map"></div><div class="map-top"><div class="actions"><button class="btn light small" data-action="map-reset" aria-label="World overview" title="World overview">${icon('globe')}<span class="lbl"> Overview</span></button><button class="btn light small ${S.street ? 'on' : ''}" data-action="tiles" id="tile-toggle" aria-label="Street detail ${S.street ? 'on' : 'off'}" title="Street detail">${icon('map')}<span class="lbl"> Street detail: ${S.street ? 'on' : 'off'}</span></button></div><button class="btn light small" data-action="locate" aria-label="Near me" title="Near me">${icon('locate')}<span class="lbl"> Near me</span></button></div><div class="map-bottom" id="map-note">Numbered pins show review-volume ranks within each place category. Lines show order, not roads.</div></div></section>`;
  map = L.map('atlasmap', {
    zoomControl: !isMobile(),
    minZoom: 1,
    maxZoom: 18,
    worldCopyJump: true,
    attributionControl: true,
  }).setView([21, 40], 2);
  map.createPane('offline-outline');
  map.getPane('offline-outline').style.zIndex = '150';
  L.geoJSON(DATA.world, {
    pane: 'offline-outline',
    style: outlineStyle(),
    interactive: false,
  }).addTo(map);
  map.attributionControl.addAttribution(
    'Offline outline: <a href="https://www.naturalearthdata.com/">Natural Earth</a>',
  );
  markerLayer = L.layerGroup().addTo(map);
  routeLayer = L.layerGroup().addTo(map);
  map.on('click', () => hideMapCard());
  if (S.street && navigator.onLine) enableStreet();
  renderMapPins(true);
  if (id === 'trip' && S.trip.length) {
    const pts = S.trip.map((id) => [C[id].lat, C[id].lon]);
    if (pts.length > 1) {
      L.polyline(pts, { color: '#e7764b', weight: 3, dashArray: '7 7' }).addTo(routeLayer);
      map.fitBounds(pts, { padding: [50, 65], maxZoom: 6 });
    } else map.setView(pts[0], 7);
  }
  setTimeout(() => map?.invalidateSize(), 100);
}
function enableStreet() {
  if (!map) return;
  if (streetLayer) return;
  streetLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    maxZoom: 19,
    updateWhenIdle: true,
  });
  let failures = 0;
  streetLayer.on('tileerror', () => {
    failures++;
    if (failures >= 3 && $('#map-note'))
      $('#map-note').textContent =
        'Street tiles are unavailable. Embedded map outline and planning pins still work.';
  });
  streetLayer.addTo(map);
}
function mapUsesPlaces() {
  return Boolean(mapCity || mapKind !== 'all' || mapDiet !== 'all' || mapQuery.trim());
}
function mapItems() {
  const q = mapQuery.toLowerCase().trim();
  let items = mapCity
    ? C[mapCity].items.map((p) => P[p.id])
    : mapUsesPlaces()
      ? mapKind === 'saved'
        ? S.saved.map((id) => P[id])
        : PLACES
      : CITIES;
  if (!mapUsesPlaces()) return items;
  return items
    .filter(
      (p) =>
        (mapKind === 'all' || p.kind === mapKind || (mapKind === 'saved' && saved(p.id))) &&
        (!q ||
          [p.name, p.cityName, p.area, C[p.cityId].country, p.summary, ...typesFor(p)]
            .join(' ')
            .toLowerCase()
            .includes(q)) &&
        (mapDiet === 'all' ||
          (p.kind === 'eat' &&
            p.dietary?.evidence?.length &&
            (mapDiet === 'halal'
              ? ['certified', 'operator-stated', 'options'].includes(p.dietary.halal)
              : mapDiet === 'vegan'
                ? p.dietary.vegetarian === 'vegan'
                : ['fully-vegetarian', 'vegan', 'options'].includes(p.dietary.vegetarian)))),
    )
    .sort((a, b) =>
      mapCity && S.stays[mapCity]
        ? hav(S.stays[mapCity], a) - hav(S.stays[mapCity], b)
        : comparePlaces(a, b, 'popularity'),
    );
}
function popupHtml(p, isCity) {
  return `<div class="map-popup">${photoTag(p.id)}<div class="map-popup-body"><h3>${esc(p.name)}</h3><p>${esc(isCity ? p.tagline : p.area + ' · ' + priceLabel(p))}</p>${isCity ? '' : `<div class="map-popup-tags">${typeChips(p)}<span class="pill tierpill t-${tier(p).key}">${tier(p).label}</span></div>`}</div><div class="actions"><button class="btn small" data-action="${isCity ? 'map-city-open' : 'place'}" data-id="${p.id}">${isCity ? 'Explore places' : 'View details'} ${icon('arrow')}</button>${isCity ? cityAdd(p.id, true) : external(mapsPin(p), icon('pin') + '<span class="visually-hidden">Open in Google Maps</span>', 'btn light small')}</div></div>`;
}
function renderMapPins(fit = false) {
  if (!map) return;
  markerLayer.clearLayers();
  mapMarkers = {};
  const items = mapItems(),
    isCity = !mapUsesPlaces();
  items.forEach((p, i) => {
    const m = L.marker([p.lat, p.lon], {
      title: p.name,
      icon: L.divIcon({
        className: '',
        html: `<div class="map-pin ${isCity ? 'city' : p.kind} ${saved(p.id) ? 'selected' : ''}">${isCity ? '' : popularityRank(p) || '•'}</div>`,
        iconSize: isCity ? [13, 13] : [32, 32],
        iconAnchor: isCity ? [6, 6] : [16, 16],
      }),
    });
    if (isMobile())
      m.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        showMapCard(p.id);
      });
    else m.bindPopup(popupHtml(p, isCity));
    m.addTo(markerLayer);
    if (isCity && !isMobile()) m.bindTooltip(p.name, { direction: 'top', offset: [0, -5] });
    mapMarkers[p.id] = m;
  });
  $('#map-list').innerHTML = items.length
    ? items
        .map(
          (p, i) =>
            `<div class="maplistitem"><div data-action="map-focus" data-id="${p.id}" style="display:flex;align-items:center;gap:11px;flex:1;min-width:0" tabindex="0" role="button" aria-label="Find ${esc(p.name)} on the map">${photoTag(p.id)}<div class="text"><h4>${isCity ? '' : popularityRank(p) ? '#' + popularityRank(p) + ' ' : ''}${esc(p.name)}</h4><p>${esc(isCity ? p.country : (mapCity ? p.area : p.cityName) + ' · ' + p.duration + ' h')}</p></div></div>${isCity ? cityAdd(p.id, true) : saveButton(p.id)}</div>`,
        )
        .join('')
    : '<p class="muted">No matching places. Try another filter.</p>';
  if ($('#map-count'))
    $('#map-count').textContent =
      `${items.length} ${isCity ? 'destinations' : items.length === 1 ? 'place' : 'places'}` +
      (mapCity ? ' in ' + C[mapCity].name : '');
  hideMapCard();
  if (mapCity && S.stays[mapCity]) {
    const stay = S.stays[mapCity];
    L.marker([stay.lat, stay.lon], {
      icon: L.divIcon({
        className: '',
        html: '<div class="stay-pin">⌂</div>',
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      }),
    })
      .bindPopup('<strong>' + esc(stay.label) + '</strong><br>Your saved stay')
      .addTo(markerLayer);
  }
  if ($('#map-stay-control'))
    $('#map-stay-control').innerHTML = mapCity
      ? `<button class="btn light small" data-action="edit-stay" data-id="${mapCity}">${icon('pin')} ${S.stays[mapCity] ? 'Change my stay' : 'Add my stay'}</button>`
      : '';
  if (fit && items.length) {
    if (isCity) {
      map.setView([21, 35], 2);
    } else {
      map.fitBounds(
        items.map((p) => [p.lat, p.lon]),
        { padding: [50, 70], maxZoom: 13 },
      );
    }
  }
}
function setMapSheet(open) {
  $('#map-sheet')?.classList.toggle('open', open);
  $('#map-list')?.classList.toggle('visible', open);
  $('.sheet-handle')?.setAttribute('aria-expanded', String(open));
  if (open) hideMapCard();
}
// Phones get a docked preview card (Apple/Google Maps style) instead of a floating popup.
function showMapCard(id) {
  const card = $('#map-card');
  if (!card) return;
  const isCity = !P[id];
  card.innerHTML = `<button class="iconbtn close" data-action="map-card-close" aria-label="Close preview">${icon('close')}</button>${popupHtml(P[id] || C[id], isCity)}`;
  card.hidden = false;
  setMapSheet(false);
  $('.mapaside')?.classList.add('has-card');
  $$('.map-pin.focused').forEach((x) => x.classList.remove('focused'));
  const marker = mapMarkers[id];
  marker?.getElement()?.querySelector('.map-pin')?.classList.add('focused');
  if (map && marker) {
    const pt = map.latLngToContainerPoint(marker.getLatLng()),
      size = map.getSize(),
      free = size.y - card.offsetHeight - 24;
    if (pt.y > free - 30 || pt.y < 130 || pt.x < 20 || pt.x > size.x - 20)
      map.panBy([pt.x - size.x / 2, pt.y - (130 + free) / 2]);
  }
}
function hideMapCard() {
  const card = $('#map-card');
  if (!card || card.hidden) return;
  card.hidden = true;
  card.innerHTML = '';
  $('.mapaside')?.classList.remove('has-card');
  $$('.map-pin.focused').forEach((x) => x.classList.remove('focused'));
}
function setMapCity(id) {
  if (!validCity(id)) return;
  mapCity = id;
  mapKind = 'all';
  mapQuery = '';
  mapDiet = 'all';
  $('#map-diet').value = 'all';
  $('#map-city').value = id;
  $('#map-search').value = '';
  $$('[data-action="map-kind"]').forEach((b) =>
    b.classList.toggle('active', b.dataset.id === 'all'),
  );
  routeLayer.clearLayers();
  renderMapPins(true);
  setMapSheet(false);
  history.replaceState(null, '', '#/map/' + id);
}
function mapLocate() {
  if (!navigator.geolocation) {
    toast('This browser does not offer location. Choose your city instead.');
    return;
  }
  toast('Requesting your location…');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (!map) return;
      const here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      const nearest = [...CITIES].sort((a, b) => hav(here, a) - hav(here, b))[0];
      const distance = hav(here, nearest);
      if (distance < 180) {
        setMapCity(nearest.id);
        L.circleMarker([here.lat, here.lon], {
          radius: 7,
          color: '#fff',
          weight: 3,
          fillColor: '#348dc8',
          fillOpacity: 1,
        })
          .addTo(map)
          .bindPopup('Your approximate position');
        map.setView([here.lat, here.lon], Math.max(9, map.getZoom()));
        toast('Showing the nearest covered destination: ' + nearest.name);
      } else {
        map.setView([here.lat, here.lon], 4);
        toast(
          `Nearest covered destination: ${nearest.name}, about ${Math.round(distance)} km away.`,
        );
      }
    },
    () => toast('Location unavailable. Select a destination from the map menu.'),
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
  );
}
function download(name, content, type) {
  const blob = new Blob([content], { type });
  const u = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = u;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 1500);
}
function exportTrip() {
  download(
    'Tandem-Roads-Trip.json',
    JSON.stringify(
      { app: 'Tandem Roads', schema: 1, exportedAt: new Date().toISOString(), state: S },
      null,
      2,
    ),
    'application/json',
  );
  toast('Trip backup exported. Import it in this app on your other device.');
}
function exportCSV() {
  let items;
  if (location.hash.startsWith('#/trip')) {
    items = S.trip.flatMap((id) => {
      const picks = S.saved.map((pid) => P[pid]).filter((p) => p.cityId === id);
      return picks.length ? picks : C[id].items.map((p) => P[p.id]);
    });
  } else items = S.saved.map((id) => P[id]);
  if (!items.length) {
    toast('Save some places or add destinations first.');
    return;
  }
  const csvcell = (x) => {
    let v = String(x ?? '');
    if (/^[=+@]/.test(v) || (/^\-/.test(v) && !/^\-\d+(\.\d+)?$/.test(v))) v = "'" + v;
    return '"' + v.replace(/"/g, '""') + '"';
  };
  const rows = [
    [
      'Name',
      'City',
      'Country',
      'Latitude',
      'Longitude',
      'Category',
      'Notes',
      'Google Maps',
      'Source',
    ],
    ...items.map((p) => [
      p.name,
      p.cityName,
      C[p.cityId].country,
      p.lat,
      p.lon,
      typesFor(p).join(' / '),
      [p.summary, (p.mustOrder || []).join(', '), p.tip, S.notes[p.id] || ''].join(' '),
      mapsPin(p),
      p.sourceUrls?.[0] || '',
    ]),
  ];
  download(
    'Tandem-Roads-Google-My-Maps-Pins.csv',
    '\uFEFF' + rows.map((r) => r.map(csvcell).join(',')).join('\r\n'),
    'text/csv;charset=utf-8',
  );
  toast(`${items.length} pins exported. Import the CSV in Google My Maps.`);
}
function importTrip() {
  $('#import-file').click();
}
function importPreview(obj) {
  if (
    !obj ||
    !['Tandem Roads', 'Roam Atlas'].includes(obj.app) ||
    obj.schema !== 1 ||
    typeof obj.state !== 'object' ||
    obj.state === null ||
    Array.isArray(obj.state)
  )
    throw Error('This is not a supported Tandem Roads trip backup.');
  const incoming = cleanState(obj.state);
  window.pendingImport = incoming;
  showModal(
    `<div class="modalcontent"><span class="eyebrow">BRING YOUR JOURNEY WITH YOU</span><h2>Import this trip?</h2><p class="muted">This backup contains ${incoming.trip.length} destinations, ${incoming.saved.length} saved places, ${Object.keys(incoming.stays).length} stays and ${Object.keys(incoming.notes).length} notes.</p><p style="font-size:13px">Merge keeps your current destinations and saved places, and applies the imported days and notes. Replace starts from the backup.</p><div class="actions"><button class="btn" data-action="import-merge">Merge with this device</button><button class="btn light" data-action="import-replace">Replace this device’s plan</button></div></div>`,
    'Import trip backup',
  );
}
function doImport(merge) {
  const incoming = window.pendingImport;
  if (!incoming) return;
  if (merge)
    S = cleanState({
      ...incoming,
      saved: [...new Set([...S.saved, ...incoming.saved])],
      trip: [...new Set([...S.trip, ...incoming.trip])],
      visited: [...new Set([...S.visited, ...incoming.visited])],
      days: { ...S.days, ...incoming.days },
      notes: { ...S.notes, ...incoming.notes },
      lodging: { ...S.lodging, ...incoming.lodging },
      extra: { ...S.extra, ...incoming.extra },
      stays: { ...S.stays, ...incoming.stays },
      checklist: [...new Set([...S.checklist, ...incoming.checklist])],
    });
  else S = incoming;
  window.pendingImport = null;
  persist();
  closeModal();
  location.hash = '#/trip';
  renderTrip();
  toast('Your trip is ready on this device.');
}
function route() {
  closeModal();
  storyLeave();
  if (tripMap) {
    tripMap.remove();
    tripMap = null;
  }
  document.title = 'Tandem Roads — Your world, ready to explore';
  if (map) {
    map.remove();
    map = null;
    streetLayer = null;
    markerLayer = null;
    routeLayer = null;
  }
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?'),
    parts = path.split('/'),
    params = new URLSearchParams(query || '');
  window.scrollTo(0, 0);
  if (parts[0] === 'city') {
    const tab = params.get('tab') || 'places';
    if (tab === 'places' || tab === 'food') {
      cityFilter = tab === 'food' ? 'restaurants' : 'see';
      experienceFilter = 'all';
      foodHalal = 'all';
      foodVeg = 'all';
      placeQuery = '';
    }
    renderCity(parts[1], tab);
  } else if (parts[0] === 'map') renderMap(parts[1] || '');
  else if (parts[0] === 'trip') renderTrip();
  else if (parts[0] === 'saved') renderSaved();
  else if (parts[0] === 'guide') renderGuide();
  else if (parts[0] === 'budget') renderBudget();
  else if (parts[0] === 't' && parts[1]) renderShared(parts[1]);
  else if (parts[0] === 'story') renderStory(parts[1] || '');
  else renderExplore();
}
// Discovery, transparent rankings, dietary evidence and accommodation origins.
const ART = DATA.art || {},
  POP = DATA.popularity || {};
const TYPES = [
  'Nature',
  'Architecture',
  'History',
  'Technology',
  'Art',
  'Food',
  'Shopping',
  'Adventure',
  'Spiritual',
  'Viewpoint',
  'Entertainment',
];
let browseSort = 'tourism',
  experienceFilter = 'all',
  placeQuery = '',
  foodHalal = 'all',
  foodVeg = 'all',
  placeView = 'cards',
  shopTier = 'all',
  shopStyle = 'all',
  activeCityId = '';
let stayMap = null,
  stayMarker = null,
  stayDraft = null,
  stayCity = '',
  staySearchResults = [],
  staySearchAbort = null,
  staySearchTime = 0,
  staySearchSequence = 0;
const geocodeCache = new Map();
function validCoords(lat, lon) {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  );
}
function normalStay(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v) || !validCoords(v.lat, v.lon)) return null;
  return {
    label: String(v.label || 'My stay').slice(0, 180),
    address: String(v.address || '').slice(0, 350),
    lat: v.lat,
    lon: v.lon,
  };
}
function parseStayCoordinates(value) {
  const s = String(value || '').trim();
  let m = s.match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,;]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (!m) {
    try {
      const u = new URL(s);
      if (!/(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.hostname !== 'maps.google.com')
        return null;
      const pin = u.href.match(/!3d(-?[\d.]+)!4d(-?[\d.]+)/);
      m = pin || u.href.match(/@(-?[\d.]+),(-?[\d.]+)/);
      if (!m) {
        const q =
          u.searchParams.get('query') || u.searchParams.get('q') || u.searchParams.get('ll') || '';
        m = q.match(/^(-?[\d.]+),\s*(-?[\d.]+)$/);
      }
    } catch (e) {
      return null;
    }
  }
  if (!m) return null;
  const lat = Number(m[1]),
    lon = Number(m[2]);
  return validCoords(lat, lon) ? { lat, lon } : null;
}
function fromStay(p) {
  return S.stays?.[p.cityId] ? hav(S.stays[p.cityId], p) : null;
}
function distanceText(km) {
  return km < 1
    ? `${Math.round((km * 1000) / 10) * 10} m`
    : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}
function typesFor(p) {
  return Array.isArray(p.experienceTypes) && p.experienceTypes.length
    ? p.experienceTypes
    : [p.kind === 'eat' ? 'Food' : p.kind === 'shop' ? 'Shopping' : 'History'];
}
function typeChips(p) {
  return typesFor(p)
    .map((t) => `<span class="typechip type-${t.toLowerCase()}">${esc(t)}</span>`)
    .join('');
}
function artTag(id, cls = '', lazy = true) {
  const a = ART[id];
  return a
    ? `<img src="${esc(a.data)}" alt="${esc(a.alt)}" ${cls ? `class="${esc(cls)}"` : ''} ${lazy ? 'loading="lazy"' : ''} decoding="async">`
    : '';
}
// An illustration only leads when there is no real photograph of the place itself.
function leadsWithArt(id) {
  return Boolean(ART[id]) && !(PHOTO[id] && !PHOTO[id].context);
}
function visualTag(id, cls = '', lazy = true) {
  return leadsWithArt(id) ? artTag(id, cls, lazy) : photoTag(id, cls, lazy);
}
function artCaption(id) {
  return P[id]?.kind === 'eat'
    ? 'Original AI cuisine illustration · not a photograph of the venue, its current menu or proof of dietary suitability'
    : 'Original AI illustration · interpretive scene, not a documentary photograph';
}
function visualBadge(id) {
  return leadsWithArt(id)
    ? '<span class="photo-context art-badge">Original AI illustration</span>'
    : contextBadge(id);
}
function starterArt(t) {
  return `<div class="starter-art">${artTag('starter-' + t.id)}<span>Original AI illustration</span></div>`;
}
function reviewCount(p) {
  return Number.isFinite(p.review?.count) && p.review.count > 0 ? p.review.count : null;
}
function rankPool(p) {
  return C[p.cityId].items
    .map((x) => P[x.id])
    .filter(
      (x) =>
        x.kind === p.kind &&
        (p.kind !== 'eat' || (x.venueType === 'restaurant') === (p.venueType === 'restaurant')),
    );
}
// ---------------------------------------------------------------------------
// Popularity: every place is scored from whichever sources it has, so the
// rank can always be explained. Each source becomes a percentile within the
// same city and category ("pool"); the score is the weighted mean of those
// percentiles. Add a source by adding an entry to SIGNALS and the matching
// data under place.signals.<key> (or review for Tripadvisor).
// ---------------------------------------------------------------------------
const SIGNALS = [
  {
    key: 'tripadvisor',
    label: 'Tripadvisor reviews',
    short: 'Tripadvisor reviews',
    weight: 1,
    value: (p) => (p.review?.source === 'Tripadvisor' || !p.review?.source ? reviewCount(p) : null),
    display: (p) =>
      num(reviewCount(p)) +
      ' reviews' +
      (p.review?.rating ? ' · ★ ' + Number(p.review.rating).toFixed(1) : ''),
    url: (p) => p.review?.url,
    checked: (p) => p.review?.checked,
  },
  {
    key: 'google',
    label: 'Google Maps reviews',
    short: 'Google reviews',
    weight: 1,
    value: (p) => (p.signals?.google?.count > 0 ? p.signals.google.count : null),
    display: (p) =>
      num(p.signals.google.count) +
      ' reviews' +
      (p.signals.google.rating ? ' · ★ ' + Number(p.signals.google.rating).toFixed(1) : ''),
    url: (p) => p.signals?.google?.url || mapsPin(p),
    checked: (p) => p.signals?.google?.checked,
  },
  {
    key: 'wikipedia',
    label: 'Wikipedia readers, last 12 months',
    short: 'Wikipedia readers',
    weight: 0.6,
    value: (p) => (p.signals?.wikipedia?.views > 0 ? p.signals.wikipedia.views : null),
    display: (p) => num(p.signals.wikipedia.views) + ' page views',
    url: (p) => p.signals?.wikipedia?.url,
    checked: (p) => p.signals?.wikipedia?.checked,
  },
];
const poolKey = (p) =>
  p.cityId + '|' + p.kind + (p.kind === 'eat' ? '|' + (p.venueType === 'restaurant') : '');
const poolCache = new Map();
function poolStats(p) {
  const k = poolKey(p);
  if (poolCache.has(k)) return poolCache.get(k);
  const pool = rankPool(p);
  // Percentile of each place for each source: share of places in the pool
  // with that source that it beats or ties (1 = most in the pool).
  const pct = new Map(pool.map((x) => [x.id, {}]));
  for (const sig of SIGNALS) {
    const have = pool.filter((x) => sig.value(x) !== null);
    for (const x of have) {
      const v = sig.value(x);
      const beaten = have.filter((y) => sig.value(y) <= v).length;
      pct.get(x.id)[sig.key] = {
        pct: beaten / have.length,
        of: have.length,
        place: 1 + have.filter((y) => sig.value(y) > v).length,
      };
    }
  }
  const score = new Map();
  for (const x of pool) {
    const parts = pct.get(x.id);
    let w = 0,
      t = 0;
    for (const sig of SIGNALS)
      if (parts[sig.key]) {
        w += sig.weight;
        t += sig.weight * parts[sig.key].pct;
      }
    if (w) score.set(x.id, t / w + (x.review?.rating ?? 0) / 1e4); // rating only breaks ties
  }
  const ranked = [...score.keys()].sort((a, b) => score.get(b) - score.get(a));
  const stats = {
    pct,
    score,
    rank: new Map(ranked.map((id, i) => [id, i + 1])),
    ranked: ranked.length,
    size: pool.length,
  };
  poolCache.set(k, stats);
  return stats;
}
function popularityRank(p) {
  return poolStats(p).rank.get(p.id) ?? null;
}
function popularityScore(p) {
  const s = poolStats(p).score.get(p.id);
  return s === undefined ? null : s;
}
function placeSignals(p) {
  const parts = poolStats(p).pct.get(p.id) || {};
  return SIGNALS.filter((sig) => parts[sig.key]).map((sig) => ({ ...sig, ...parts[sig.key] }));
}
function rankReason(p) {
  const sigs = placeSignals(p),
    m = michelinShort(p);
  if (!sigs.length) return (m || 'Editorial pick') + ' · no comparable review counts yet';
  return [
    m,
    ...sigs
      .sort((a, b) => b.pct - a.pct)
      .map((s) => `#${s.place} of ${s.of} for ${s.short} (${compact(s.value(p))})`),
  ]
    .filter(Boolean)
    .join(' · ');
}
function rankShort(p, withMichelin = true) {
  const sigs = placeSignals(p),
    m = withMichelin ? michelinShort(p) : '';
  if (!sigs.length) return m || (p.michelin ? 'No review counts yet' : 'Editorial pick');
  return [
    m,
    ...sigs
      .sort((a, b) => b.pct - a.pct)
      .slice(0, m ? 1 : 2)
      .map((s) => `#${s.place} of ${s.of} for ${s.short}`),
  ]
    .filter(Boolean)
    .join(' · ');
}
function rankCategory(p) {
  return p.kind === 'eat'
    ? p.venueType === 'restaurant'
      ? 'listed restaurants'
      : 'listed food experiences'
    : p.kind === 'shop'
      ? 'listed shopping stops'
      : 'listed sights';
}
function comparePlaces(a, b, sort = placeSort) {
  if (sort === 'nearby') {
    const x = fromStay(a),
      y = fromStay(b);
    return (x ?? Infinity) - (y ?? Infinity) || a.priority - b.priority;
  }
  if (sort === 'rating')
    return (
      (b.review?.rating ?? -1) - (a.review?.rating ?? -1) ||
      (reviewCount(b) ?? -1) - (reviewCount(a) ?? -1)
    );
  if (sort === 'cost') return a.price[0] - b.price[0];
  if (sort === 'recommended') return a.priority - b.priority;
  // Unranked MICHELIN picks sit after ranked places but ahead of plain editorial picks.
  const fallback = (p) => (p.michelin ? -0.9 + p.michelin.stars * 0.1 : -1);
  return (
    (popularityScore(b) ?? fallback(b)) - (popularityScore(a) ?? fallback(a)) ||
    (b.review?.rating ?? -1) - (a.review?.rating ?? -1) ||
    a.priority - b.priority
  );
}
function matchesDiet(p) {
  const d = p.dietary || {},
    hasEvidence = Array.isArray(d.evidence) && d.evidence.length > 0;
  if (
    foodHalal !== 'all' &&
    (!hasEvidence ||
      !(
        foodHalal === 'certified' ? ['certified'] : ['certified', 'operator-stated', 'options']
      ).includes(d.halal))
  )
    return false;
  if (
    foodVeg !== 'all' &&
    (!hasEvidence ||
      !(
        foodVeg === 'vegan'
          ? ['vegan']
          : foodVeg === 'fully'
            ? ['fully-vegetarian', 'vegan']
            : ['fully-vegetarian', 'vegan', 'options']
      ).includes(d.vegetarian))
  )
    return false;
  return true;
}
function dietaryLabels(p) {
  const d = p.dietary || {},
    labels = [];
  if (d.halal === 'certified') labels.push(['Halal · certified', 'halal']);
  else if (d.halal === 'operator-stated') labels.push(['Halal · operator stated', 'halal']);
  else if (d.halal === 'options') labels.push(['Halal options · check dish', 'halal']);
  if (d.vegetarian === 'vegan') labels.push(['Plant-based menu', 'veggie']);
  else if (d.vegetarian === 'fully-vegetarian') labels.push(['Vegetarian menu', 'veggie']);
  else if (d.vegetarian === 'options') labels.push(['Vegetarian options', 'veggie']);
  return labels.map(([x, k]) => `<span class="dietchip ${k}">${x}</span>`).join('');
}
function dietaryDetail(p) {
  if (p.kind !== 'eat') return '';
  const d = p.dietary || {};
  return `<section class="dietary-detail"><h3>Food that fits you</h3><div class="actions">${dietaryLabels(p) || '<span class="pill gray">Dietary status unverified</span>'}</div><p>${esc(d.note || 'Ask this venue about the specific dish, ingredients and preparation. No halal or vegetarian evidence has been verified for this stop.')}</p><small>Halal: ${esc({ certified: 'certifier evidence linked', 'operator-stated': 'operator claim; no independent certification established', options: 'specific options only; verify preparation', none: 'not halal', unverified: 'not verified' }[d.halal] || 'not verified')}. Vegetarian: ${esc({ vegan: 'plant-based menu', 'fully-vegetarian': 'vegetarian menu', options: 'some dishes only', none: 'no verified options', unverified: 'not verified' }[d.vegetarian] || 'not verified')}. Vegetarian food may contain alcohol and is not automatically halal. Check sauces, stock, shared preparation and the current branch menu.</small><div class="source-links">${(d.evidence || []).map((x) => external(x.url, esc(x.label || x.title || 'Dietary source') + ' ↗') + ` <span>retrieved ${esc(x.checked || DATA.retrieved)}</span>`).join('<br>')}</div></section>`;
}
function getCityPlaces(c) {
  const q = placeQuery.trim().toLowerCase();
  return c.items
    .map((p) => P[p.id])
    .filter(
      (p) =>
        (cityFilter === 'all' ||
          p.kind === cityFilter ||
          (cityFilter === 'saved' && saved(p.id)) ||
          (cityFilter === 'restaurants' && p.kind === 'eat' && p.venueType === 'restaurant') ||
          (cityFilter === 'michelin' && p.michelin)) &&
        (experienceFilter === 'all' || typesFor(p).includes(experienceFilter)) &&
        (!(foodHalal !== 'all' || foodVeg !== 'all') || (p.kind === 'eat' && matchesDiet(p))) &&
        (!q ||
          [
            p.name,
            p.area,
            p.summary,
            p.cuisine,
            ...(p.mustOrder || []),
            p.michelin ? 'michelin star ' + p.michelin.label : '',
          ]
            .join(' ')
            .toLowerCase()
            .includes(q)),
    )
    .sort(comparePlaces);
}
function cityRanking(c, metric = browseSort) {
  if (metric === 'arrivals') {
    const a = c.popularity?.arrivals;
    return a
      ? {
          rank: a.rank,
          value: (a.count / 1e6).toFixed(1) + 'm international arrivals',
          label: 'Global arrivals rank · ' + a.year,
          source: a.url,
        }
      : null;
  }
  const a = c.popularity?.tourism;
  return a
    ? {
        rank: a.rank,
        value: 'Global tourism index · ' + a.year,
        label: 'Euromonitor overall destination index',
        source: a.url,
      }
    : null;
}
function cityCard(c) {
  const rank = cityRanking(c),
    sights = c.items.filter((x) => x.kind === 'see').length;
  return `<article class="citycard" data-action="city" data-id="${c.id}" tabindex="0" role="link" aria-label="Explore ${esc(c.name)}"><div class="cityimage">${photoTag(c.id)}${cityAdd(c.id, true)}${rank ? `<span class="city-rankpill">#${rank.rank} <small>${browseSort === 'arrivals' ? 'most visited' : 'tourism index'}</small></span>` : ''}</div><div class="citybody"><h3>${esc(c.name)}</h3><span class="citycountry">${esc(c.country)}</span><p>${esc(c.tagline)}</p><small class="citymeta">${c.days} days · ${sights} sights${budgetMonth() && bestIn(c, budgetMonth()) ? ` · <span class="bestpill">${icon('sun')} Best in ${MONTHS[budgetMonth() - 1]}</span>` : ''}</small></div></article>`;
}
function placeCard(p) {
  const d = fromStay(p),
    n = popularityRank(p);
  return `<article class="placecard" data-action="place" data-id="${p.id}" tabindex="0" role="button" aria-label="Details for ${esc(p.name)}"><div class="placeimage">${visualTag(p.id)}${saveButton(p.id)}${visualBadge(p.id)}${photoCount(p.id)}<span class="place-rankpill t-${tier(p).key}">${tier(p).label}</span></div><div class="placebody"><h3>${esc(p.name)}</h3>${p.michelin ? `<div class="michelin-line">${michelinPill(p)}</div>` : ''}<p>${esc(p.summary)}</p>${p.mustOrder?.length ? `<p class="must-order"><strong>Try:</strong> ${esc(p.mustOrder.slice(0, 3).join(' · '))}</p>` : ''}${p.kind === 'eat' ? `<div class="actions dietlabels">${dietaryLabels(p)}</div>` : ''}<div class="placemeta"><span>${esc(p.area)} · ${p.duration} h · ${priceLabel(p)}${d !== null ? ` · <span class="near-label">${distanceText(d)} away</span>` : ''}</span>${rating(p)}</div></div></article>`;
}
function rankingRows(items) {
  return `<div class="ranking-list">${items.map((p) => `<article class="ranking-row"><div class="ranking-number">${popularityRank(p) ? '#' + popularityRank(p) : '—'}</div><button class="ranking-thumb" data-action="place" data-id="${p.id}" aria-label="View ${esc(p.name)}">${visualTag(p.id)}</button><div class="ranking-main"><button class="inline-link" data-action="place" data-id="${p.id}">${esc(p.name)}</button><div class="typechips">${typeChips(p)}</div><small class="rankwhy">${esc(rankReason(p))}</small><small>${esc(rankCategory(p))} · ${esc(p.area)}${fromStay(p) !== null ? ' · ' + distanceText(fromStay(p)) + ' from stay' : ''}</small></div><div class="ranking-stat"><strong>${reviewCount(p) !== null ? num(reviewCount(p)) : '—'}</strong><small>${reviewCount(p) !== null ? 'reviews' : 'no count verified'}</small>${rating(p)}</div><button class="btn light small" data-action="place" data-id="${p.id}">Why go? ${icon('arrow')}</button>${saveButton(p.id)}</article>`).join('')}</div>`;
}
function cityResults(c) {
  const places = getCityPlaces(c);
  if (!places.length)
    return '<div class="no-results"><h3>No matches for these filters.</h3><p>Missing dietary evidence means “unverified”, not “no suitable food exists”. Clear a filter, check a venue’s current menu, or search nearby on Google Maps.</p><button class="btn light" data-action="clear-place-filters">Clear filters</button></div>';
  return placeView === 'ranking'
    ? rankingRows(places)
    : `<div class="placegrid">${places.map(placeCard).join('')}</div>`;
}
function refreshCityResults() {
  const c = C[activeCityId];
  if (!c) return;
  const el = $('#city-places');
  if (el) el.innerHTML = cityResults(c);
  const n = $('#place-result-count');
  if (n) n.innerHTML = resultLine(c);
  const f = $('#filter-btn');
  if (f) f.innerHTML = filterButton();
  const d = $('#filter-done');
  if (d) d.textContent = 'Show ' + getCityPlaces(c).length + ' places';
}
function stayPanel(c, compact = false) {
  const s = S.stays[c.id],
    near = s
      ? c.items
          .map((p) => P[p.id])
          .filter((p) => p.kind === 'see' && !p.excursion && p.duration < 6 && hav(c, p) < 40)
          .sort((a, b) => hav(s, a) - hav(s, b))
          .slice(0, 3)
      : [];
  if (!s && compact)
    return `<button class="stay-prompt" data-action="edit-stay" data-id="${c.id}">${icon('pin')}<span><strong>Where are you staying?</strong><small>Add it to see what is close by</small></span>${icon('arrow')}</button>`;
  return `<section class="stay-panel ${compact ? 'compact' : ''}"><div class="stay-heading">${icon('pin')}<div><h3>${s ? 'Start from ' + esc(s.label) : 'Where are you staying?'}</h3><p>${s ? esc(s.address || `${s.lat.toFixed(5)}, ${s.lon.toFixed(5)}`) : 'Add a hotel, address or map pin to find nearby places and begin your local routes there.'}</p></div><button class="btn ${s ? 'light' : 'small'}" data-action="edit-stay" data-id="${c.id}">${s ? 'Change stay' : 'Add your stay'}</button></div>${s && !compact ? `<div class="nearby-preview"><span class="eyebrow">CLOSE TO YOUR DOOR · STRAIGHT-LINE DISTANCE</span><div class="nearby-options">${near.map((p) => `<button data-action="place" data-id="${p.id}"><span>${esc(p.name)}</span><strong>${distanceText(hav(s, p))}</strong></button>`).join('')}</div><button class="inline-link" data-action="nearby-first" data-id="${c.id}">Show nearby places first ${icon('arrow')}</button><span class="muted"> Actual travel time and accessible routes are checked in Maps.</span></div>` : ''}</section>`;
}
const SORT_LABELS = {
  popularity: 'Most popular',
  rating: 'Highest rated',
  recommended: 'First-visit picks',
  nearby: 'Closest to my stay',
  cost: 'Lowest cost',
};
function activeFilterCount() {
  return (
    (experienceFilter !== 'all') +
    (foodHalal !== 'all') +
    (foodVeg !== 'all') +
    (placeSort !== 'popularity')
  );
}
function filterButton() {
  const n = activeFilterCount();
  return `<button class="btn ghost filterbtn ${n ? 'on' : ''}" data-action="place-filters" aria-label="Sort and filter${n ? ', ' + n + ' active' : ''}">${icon('sliders')}<span class="lbl"> Filters</span>${n ? `<span class="count">${n}</span>` : ''}</button>`;
}
function resultLine(c) {
  const n = getCityPlaces(c).length;
  return `${n} place${n === 1 ? '' : 's'} · ${SORT_LABELS[placeSort] || 'Most popular'} first <button class="inline-link" data-action="ranking-method">How ranks work</button>`;
}
function openFilters() {
  const c = C[activeCityId];
  if (!c) return;
  const food = FOOD_FILTERS.includes(cityFilter);
  showModal(
    `<div class="modalcontent filtersheet"><h2 id="modal-heading">Sort & filter</h2><div class="field"><label for="place-sort">Sort by</label><select id="place-sort">${Object.entries(
      SORT_LABELS,
    )
      .map(
        ([k, t]) =>
          `<option value="${k}" ${placeSort === k ? 'selected' : ''} ${k === 'nearby' && !S.stays[c.id] ? 'disabled' : ''}>${t}${k === 'nearby' && !S.stays[c.id] ? ' (add your stay first)' : ''}</option>`,
      )
      .join(
        '',
      )}</select></div><div class="field"><label for="experience-filter">Kind of experience</label><select id="experience-filter"><option value="all">Every type</option>${TYPES.map((t) => `<option ${experienceFilter === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>${food ? `<div class="field"><label for="food-halal">Halal</label><select id="food-halal"><option value="all">Any</option><option value="stated" ${foodHalal === 'stated' ? 'selected' : ''}>Sourced halal choices</option><option value="certified" ${foodHalal === 'certified' ? 'selected' : ''}>Certification evidence only</option></select></div><div class="field"><label for="food-veg">Vegetarian</label><select id="food-veg"><option value="all">Any</option><option value="options" ${foodVeg === 'options' ? 'selected' : ''}>Vegetarian options</option><option value="fully" ${foodVeg === 'fully' ? 'selected' : ''}>Fully vegetarian / plant-based</option><option value="vegan" ${foodVeg === 'vegan' ? 'selected' : ''}>Plant-based menu</option></select></div><p class="filter-note">Halal certification, operator claims and particular halal dishes are labelled separately. Vegetarian does not automatically mean halal.</p>` : ''}<div class="field"><label>Show as</label><div class="view-switch"><button class="${placeView === 'cards' ? 'active' : ''}" data-action="place-view" data-id="cards">Cards</button><button class="${placeView === 'ranking' ? 'active' : ''}" data-action="place-view" data-id="ranking">Ranked list</button></div></div><div class="filter-actions"><button class="btn ghost" data-action="clear-place-filters">Clear all</button><button class="btn" data-action="close-modal" id="filter-done">Show ${getCityPlaces(c).length} places</button></div></div>`,
    'Sort & filter',
  );
}
function cityTabHtml(c, tab) {
  if (tab === 'arrival' || tab === 'sources') return cityTabLegacy(c, tab);
  if (tab === 'shop')
    return `${shoppingGuide(c)}${getCityPlaces(c).length ? `<h3 class="shopstops-h">Shopping stops with full details</h3><p class="muted result-count" id="place-result-count">${resultLine(c)}</p><div id="city-places">${cityResults(c)}</div>` : ''}`;
  if (tab === 'food' && !FOOD_FILTERS.includes(cityFilter)) cityFilter = 'restaurants';
  const food = tab === 'food' || FOOD_FILTERS.includes(cityFilter);
  const chips = food
    ? [
        ['restaurants', 'Restaurants'],
        ...(c.items.some((x) => x.michelin) ? [['michelin', 'MICHELIN Guide']] : []),
        ['eat', 'All food stops'],
        ['saved', 'Saved'],
      ]
    : [
        ['see', 'Sights'],
        ['all', 'Everything'],
        ['saved', 'Saved'],
      ];
  return `<div class="placetools"><div class="searchrow"><div class="searchbox">${icon('search')}<input id="place-search" type="search" placeholder="Search ${esc(c.name)}" aria-label="Search places in this city" value="${esc(placeQuery)}"></div><span id="filter-btn">${filterButton()}</span></div><div class="chips">${chips
    .map(
      ([k, t]) =>
        `<button class="chip ${cityFilter === k ? 'active' : ''}" data-action="city-filter" data-id="${k}">${t}</button>`,
    )
    .join(
      '',
    )}</div></div><p class="muted result-count" id="place-result-count">${resultLine(c)}</p><div id="city-places">${cityResults(c)}</div>`;
}
const SHOP_TIERS = {
  budget: ['$', 'Budget'],
  mid: ['$$', 'Mid-range'],
  high: ['$$$', 'High-end'],
};
const SHOP_STYLES = {
  streetwear: 'Streetwear',
  vintage: 'Vintage & thrift',
  designer: 'Designer',
  luxury: 'Luxury',
  'local-design': 'Local design',
  crafts: 'Crafts',
  markets: 'Markets',
  souvenirs: 'Souvenirs',
  food: 'Food to take home',
  malls: 'Malls',
  'department-store': 'Department stores',
  textiles: 'Textiles & tailoring',
  jewelry: 'Jewellery',
  homeware: 'Homeware',
  antiques: 'Antiques',
  books: 'Books',
  outdoor: 'Outdoor gear',
  anime: 'Anime & games',
  electronics: 'Electronics',
  outlets: 'Outlets',
};
function shopMapsUrl(c, s) {
  return (
    'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent(`${s.name}, ${c.name}, ${c.country}`)
  );
}
function shoppingGuide(c) {
  const g = c.shopping;
  if (!g?.spots?.length) return '';
  const count = {};
  g.spots.forEach((s) => s.styles.forEach((t) => (count[t] = (count[t] || 0) + 1)));
  // Streetwear leads when a city has it; otherwise the most common styles come first.
  const styles = Object.keys(count).sort(
    (a, b) => (b === 'streetwear') - (a === 'streetwear') || count[b] - count[a],
  );
  const chip = (action, k, label, on) =>
    `<button class="chip ${on ? 'active' : ''}" data-action="${action}" data-id="${k}" aria-pressed="${on}">${label}</button>`;
  return `<section class="shopguide" aria-labelledby="shopguide-h"><div class="shopguide-head"><span class="eyebrow">WHERE TO SHOP</span><h3 id="shopguide-h">${icon('bag')} Shopping in ${esc(c.name)}</h3><p>${esc(g.note)}</p></div><div class="shopfilters"><div class="chips" role="group" aria-label="Price level">${chip('shop-tier', 'all', 'Every budget', shopTier === 'all')}${Object.entries(
    SHOP_TIERS,
  )
    .map(([k, [sym, t]]) => chip('shop-tier', k, `${sym} ${t}`, shopTier === k))
    .join(
      '',
    )}</div><div class="chips shopstyles" role="group" aria-label="Style">${chip('shop-style', 'all', 'Any style', shopStyle === 'all')}${styles.map((k) => chip('shop-style', k, esc(SHOP_STYLES[k] || k), shopStyle === k)).join('')}</div></div><div id="shop-spots">${shopSpots(c)}</div><small class="muted shopguide-note">Editorial picks, checked ${esc(g.checked || DATA.retrieved)}. Opening days and prices change, so confirm before you go. Tap a stop below for photos, rankings and visit details.</small></section>`;
}
function shopSpots(c) {
  const list = (c.shopping?.spots || []).filter(
    (s) =>
      (shopTier === 'all' || s.tier === shopTier) &&
      (shopStyle === 'all' || s.styles.includes(shopStyle)),
  );
  if (!list.length)
    return '<p class="muted shop-empty">No picks match both filters here. Try another price level or style.</p>';
  return `<div class="shopgrid">${list
    .map((s) => {
      const [sym, t] = SHOP_TIERS[s.tier] || ['', s.tier];
      return `<article class="shopcard">${shopSave(s.id)}<div class="shopcard-top"><span class="pill ${s.tier === 'mid' ? 'warm' : ''} shoptier tier-${s.tier}" title="${t}">${sym} ${t}</span><small>${esc(s.area)}</small></div><h4>${esc(s.name)}</h4><p>${esc(s.summary)}</p><div class="shoptags">${s.styles.map((k) => `<span class="pill ${k === 'streetwear' ? 'warm' : 'gray'}">${esc(SHOP_STYLES[k] || k)}</span>`).join('')}</div><p class="shoptip"><strong>Tip:</strong> ${esc(s.tip)}</p>${external(shopMapsUrl(c, s), icon('pin') + ' Find on Google Maps', 'inline-link shopmap')}</article>`;
    })
    .join('')}</div>`;
}
function setShopFilter(kind, id) {
  if (kind === 'tier') shopTier = id;
  else shopStyle = id;
  const c = C[activeCityId];
  const el = $('.shopguide');
  if (!c || !el) return;
  el.outerHTML = shoppingGuide(c);
}
function renderCity(id, tab = 'places') {
  if (!validCity(id)) {
    location.hash = '#/';
    return;
  }
  const c = C[id];
  if (placeSort === 'nearby' && !S.stays[id]) placeSort = 'popularity';
  if (activeCityId !== id) {
    activeCityId = id;
    cityFilter = tab === 'food' ? 'restaurants' : tab === 'shop' ? 'shop' : 'see';
    experienceFilter = 'all';
    placeQuery = '';
    shopTier = 'all';
    shopStyle = 'all';
    foodHalal = 'all';
    foodVeg = 'all';
    placeSort = 'popularity';
  }
  if (tab === 'food' && !FOOD_FILTERS.includes(cityFilter)) cityFilter = 'restaurants';
  if (tab === 'shop') {
    cityFilter = 'shop';
    placeQuery = '';
    experienceFilter = 'all';
  } else if (cityFilter === 'shop') cityFilter = 'see';
  headerActive('explore');
  const r = cityRanking(c, 'tourism'),
    a = cityRanking(c, 'arrivals');
  $('#app').innerHTML =
    `<div class="wrap"><div class="backline"><a href="#/" aria-label="Compare destinations">${icon('left')}<span class="lbl-long"> Compare destinations</span><span class="lbl-short">Cities</span></a><div class="actions">${cityAdd(id)}<a class="btn ghost small" href="#/map/${id}">${icon('map')} City map</a></div></div><section class="cityhero">${photoTag(c.id, '', false)}<span class="hero-credit">${photoCredit(c.id)}</span><div class="cityherotext"><div class="eyebrow">${esc(c.country)} · ${esc(c.region)}</div><h1>${esc(c.name)}</h1><p>${esc(c.summary)}</p></div></section>${cityPhotos(c)}<div class="cityfacts">${r ? `<button class="fact" data-action="ranking-method"><b>#${r.rank}</b><span>tourism index</span></button>` : ''}${a ? `<button class="fact" data-action="ranking-method"><b>#${a.rank}</b><span>most visited</span></button>` : ''}<span class="fact"><b>${c.days} days</b><span>to see it well</span></span><span class="fact"><b>${range(c.dailyBudget, c.currency)}</b><span>per person a day</span></span><span class="fact"><b>${c.bestMonths.map((m) => months[m - 1]).join(' · ')}</b><span>best months</span></span></div>${budgetPanel(c)}${stayPanel(c, !S.stays[id])}<div class="citytabs">${[
      ['places', 'Sights'],
      ['food', 'Food'],
      ['shop', 'Shopping'],
      ['arrival', 'Practical'],
      ['sources', 'Sources'],
    ]
      .map(
        ([k, t]) =>
          `<button class="${tab === k ? 'active' : ''}" data-action="city-tab" data-id="${id}" data-tab="${k}">${t}</button>`,
      )
      .join(
        '',
      )}</div>${parkNotice(c)}${cityTabHtml(c, tab)}${alsoFromHere(c)}<div class="resourcebox"><h3>${icon('book')}Your notes for ${esc(c.name)}</h3><div class="field"><textarea data-note="${id}" placeholder="Reservation times, a local tip, reminders…" aria-label="Notes for ${esc(c.name)}">${esc(S.notes[id] || '')}</textarea></div><small class="muted">Your stay and notes are saved in this browser and included in trip backups.</small></div>${footer()}</div>`;
}
// Tiers in words, from where a place sits among its peers in the same city.
function tier(p) {
  const n = popularityRank(p),
    of = poolStats(p).ranked;
  if (!n) return { key: 'pick', label: p.michelin ? 'MICHELIN pick' : 'Editor’s pick' };
  return n <= Math.ceil(of / 3)
    ? { key: 'must', label: p.kind === 'see' ? 'Must see' : 'Must try' }
    : n <= Math.ceil((2 * of) / 3)
      ? { key: 'worth', label: 'Worth it' }
      : { key: 'maybe', label: 'If you have time' };
}
// Which parts of the day a "best time" note points at, or null when it is not about a time.
function dayparts(t = '') {
  const x = t.toLowerCase(),
    on = [false, false, false, false];
  if (/^outside|avoid/.test(x)) return null;
  if (/full day|all day|any ?time/.test(x)) return [true, true, true, true];
  if (/morning|opening|first entry|early in the day|sunrise|dawn|beat the queue/.test(x))
    on[0] = true;
  if (/late morning|midday|noon|lunch/.test(x)) on[1] = true;
  if (/afternoon/.test(x)) on[2] = true;
  if (/daytime/.test(x)) on[0] = on[1] = on[2] = true;
  if (/evening|dinner|sunset|night|dusk/.test(x)) on[3] = true;
  return on.some(Boolean) ? on : null;
}
function placeGlance(p) {
  const parts = dayparts(p.bestTime),
    score = popularityScore(p),
    crowd = score === null ? 0 : score >= 0.75 ? 4 : score >= 0.5 ? 3 : score >= 0.25 ? 2 : 1,
    hours = p.duration > 16 ? 'Multi-day' : `${p.duration} hour${p.duration === 1 ? '' : 's'}`;
  return `<div class="glance"><div class="g-tile g-wide"><label>Best time</label>${parts ? `<div class="dayparts" role="img" aria-label="${esc(p.bestTime)}">${['Morning', 'Midday', 'Afternoon', 'Evening'].map((l, i) => `<span class="${parts[i] ? 'on' : ''}">${l}</span>`).join('')}</div>` : ''}<small>${esc(p.bestTime)}</small></div>${crowd ? `<div class="g-tile"><label>Crowds</label><div class="meter" role="img" aria-label="${['', 'Lighter', 'Moderate', 'Busy', 'Very busy'][crowd]}">${[1, 2, 3, 4].map((i) => `<i class="${i <= crowd ? 'on' : ''}"></i>`).join('')}</div><strong>${['', 'Lighter', 'Moderate', 'Busy', 'Very busy'][crowd]}</strong></div>` : ''}<div class="g-tile"><label>Time needed</label><div class="g-bar"><i style="width:${Math.min(100, Math.round((p.duration / 8) * 100))}%"></i></div><strong>${hours}</strong></div><div class="g-tile"><label>Cost</label><strong class="g-cost">${priceLabel(p)}</strong></div><div class="g-tile"><label>Booking</label><strong class="g-book">${esc(p.reservation)}</strong></div></div>`;
}
// "Why it ranks here": one verdict line, then one chip per source. The whole chip is the link.
function rankChips(p) {
  const sigs = placeSignals(p),
    c = C[p.cityId],
    t = tier(p),
    cat = rankCategory(p).replace('listed ', '');
  if (!sigs.length)
    return `<p class="verdict"><b class="tierword t-pick">${t.label}</b> No review counts to compare yet. It is here on the strength of the linked sources.</p>${michelinRow(p)}`;
  const line =
    t.key === 'must'
      ? `Among the most popular ${cat} in ${esc(c.name)}.`
      : t.key === 'worth'
        ? `Well liked, in the middle of ${esc(c.name)}’s ${cat}.`
        : `Less visited than most ${cat} in ${esc(c.name)}.`;
  return `<p class="verdict"><b class="tierword t-${t.key}">${t.label}</b> ${line}</p><div class="srcchips">${sigs
    .map((x) => {
      const inner = `<b class="src-logo src-${x.key}" aria-hidden="true">${x.label[0]}</b><span><strong>${esc(x.display(p))}</strong><small>${esc(x.short.replace(/ (reviews|readers)$/, ''))} · #${x.place} of ${x.of}</small></span>`;
      return x.url(p)
        ? `<a class="srcchip" href="${esc(x.url(p))}" target="_blank" rel="noopener noreferrer">${inner}${icon('external')}</a>`
        : `<span class="srcchip">${inner}</span>`;
    })
    .join('')}</div>${michelinRow(p)}`;
}
let placeList = [],
  placeMap = null;
function setPlaceList(el, id) {
  if (el.closest('.modal')) {
    if (!placeList.includes(id)) placeList = [];
    return;
  }
  const box = el.closest('.savedpage, .placegrid, .ranking-list, .rc-places');
  placeList = box
    ? [
        ...new Set(
          [...box.querySelectorAll('[data-action="place"][data-id]')].map((x) => x.dataset.id),
        ),
      ]
    : [];
}
function placeStep(dir) {
  const id = $('.modal [data-place]')?.dataset.place,
    next = placeList[placeList.indexOf(id) + dir];
  if (placeList.includes(id) && next) openPlace(next);
}
function openPlace(id) {
  if (!validPlace(id)) return;
  const p = P[id],
    c = C[p.cityId],
    r = p.review,
    stay = S.stays[c.id],
    at = placeList.indexOf(id),
    wasFull = $('.modal [data-place]') && !$('.modal.peek'),
    art = leadsWithArt(id);
  const bullets = (x) => (Array.isArray(x) ? x : x ? [x] : []);
  showModal(
    `<div data-gscope data-place="${id}"><div class="modalphoto gallery" id="place-visual">${galleryHero(id, `${visualTag(id, '', false)}<div class="photo-caption">${art ? artCaption(id) : photoCredit(id)}${!art && PHOTO[id]?.context ? '<br>' + esc(photoContext(id)) : ''}</div>`, 'Photos of ' + p.name)}</div></div><div class="modalcontent placesheet">${ART[id] ? `<div class="visual-toggle"><button class="${art ? '' : 'active'}" data-action="place-photo" data-id="${id}">Photo${PHOTO[id]?.context ? ' · representative' : ''}</button><button class="${art ? 'active' : ''}" data-action="place-art" data-id="${id}">Illustration</button></div>` : ''}<div class="place-top"><div class="actions"><a class="pill" href="#/city/${c.id}">${esc(c.name)}</a><span class="pill tierpill t-${tier(p).key}">${tier(p).label}</span>${michelinPill(p)}</div>${at >= 0 && placeList.length > 1 ? `<div class="place-nav"><button class="iconbtn" data-action="place-step" data-dir="-1" aria-label="Previous place" ${at === 0 ? 'disabled' : ''}>${icon('left')}</button><span>${at + 1} of ${placeList.length}</span><button class="iconbtn" data-action="place-step" data-dir="1" aria-label="Next place" ${at === placeList.length - 1 ? 'disabled' : ''}>${icon('arrow')}</button></div>` : ''}</div><h2 id="modal-heading">${esc(p.name)}</h2><p class="lead">${esc(p.summary)}</p>${placeGlance(p)}<p class="keytip">${icon('info')}<span>${esc(p.tip)}</span></p>${p.mustOrder?.length ? `<p class="keytip">${icon('food')}<span><strong>Try:</strong> ${p.mustOrder.map((x) => esc(x)).join(' · ')}</span></p>` : ''}${S.street && navigator.onLine ? `<div class="minimap" data-action="map-place" data-id="${id}" role="button" tabindex="0" aria-label="Show ${esc(p.name)} on the map"><div id="place-minimap"></div><span>${icon('map')} ${esc(p.area)}</span></div>` : ''}<section class="rank-reason"><div class="rr-head"><h3>Why it ranks here</h3><button class="inline-link" data-action="ranking-method">How ranks work</button></div>${rankChips(p)}</section>${stay ? `<div class="stay-to-place"><strong>${distanceText(hav(stay, p))} from ${esc(stay.label)}</strong><div class="actions">${p.excursion || hav(c, p) > 40 ? external(p.sourceUrls?.[0] || mapsPin(p), icon('external') + ' Check excursion access', 'btn light small') : external(mapsDirections([stay, p], 'walking'), icon('route') + ' Walk', 'btn light small') + external(mapsDirections([stay, p], 'transit'), icon('train') + ' Transit', 'btn light small')}</div></div>` : ''}<details class="readmore"><summary>Read more</summary><section class="why-go"><h3>Why go</h3><ul>${bullets(
      p.whyVisit || p.expect,
    )
      .map((x) => `<li>${esc(x)}</li>`)
      .join('')}</ul></section><section><h3>How a visit goes</h3><ol class="visit-flow">${bullets(
      p.visitFlow || p.expect,
    )
      .map((x) => `<li>${esc(x)}</li>`)
      .join(
        '',
      )}</ol></section><section><h3>Is it your kind of place?</h3><p><strong>Best for:</strong> ${esc(bullets(p.bestFor).join(' · ') || typesFor(p).join(', ') + ' enthusiasts')}</p><p><strong>Trade-offs:</strong> ${esc(bullets(p.tradeoffs).join(' ') || p.tip)}</p><p>${esc(p.expect)}</p><p class="price-note">${esc(p.priceNote)}</p></section>${p.cuisine ? `<p class="price-note">${esc(p.cuisine)} · Confirm the current menu and your dietary requirements.</p>` : ''}${dietaryDetail(p)}${p.reviewHighlights?.length ? `<section class="review-themes"><h3>What reviewers mention</h3><ul>${p.reviewHighlights.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><small>${esc(p.reviewHighlightsNote || '')}</small></section>` : ''}${p.annualVisits ? `<p><strong>Reported visits:</strong> ${num(p.annualVisits.count)} in ${p.annualVisits.year}. ${esc(p.annualVisits.note || '')} ${external(p.annualVisits.url, 'Official count ↗')}</p>` : ''}${stay ? '' : `<button class="btn light small" data-action="edit-stay" data-id="${c.id}">${icon('pin')} Add your stay to check distance</button>`}<div class="source-links">Sources: ${(p.sourceUrls || []).map((u) => external(u, esc(new URL(u).hostname) + ' ↗')).join(' ')}${r?.checked ? ` · review counts checked ${esc(r.checked)}` : ''}<br>Map points are approximate. ${external(mapsCoordinate(p), 'Exact coordinate pin ↗')}</div></details><div class="field placenote"><label>Your note</label><textarea data-note="${id}" placeholder="Booked time, must-try dish or reminder…">${esc(S.notes[id] || '')}</textarea></div></div><div class="sheet-actions">${saveButtonWide(id)}<button class="btn ghost maponly" data-action="map-place" data-id="${id}" aria-label="Show on the map">${icon('map')}</button>${external(mapsPin(p), icon('pin') + ' Google Maps', 'btn gmaps')}</div>`,
    p.name,
  );
  const m = $('.modal');
  // Phones: the sheet opens at about half height and grows as soon as it is scrolled.
  if (isMobile() && !wasFull) {
    m.classList.add('peek');
    m.addEventListener('scroll', () => m.scrollTop > 2 && m.classList.remove('peek'), {
      passive: true,
    });
  }
  // Swipe sideways (outside the photos) for the next or previous place in the list.
  let x0 = null,
    y0 = 0;
  m.addEventListener(
    'touchstart',
    (e) => {
      x0 = e.target.closest('.gallery, .srcchips, .leaflet-container, textarea')
        ? null
        : e.touches[0].clientX;
      y0 = e.touches[0].clientY;
    },
    { passive: true },
  );
  m.addEventListener(
    'touchend',
    (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0,
        dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 70 && Math.abs(dx) > 2 * Math.abs(dy)) placeStep(dx < 0 ? 1 : -1);
    },
    { passive: true },
  );
  if ($('#place-minimap') && typeof L !== 'undefined') {
    placeMap = L.map('place-minimap', {
      zoomControl: false,
      attributionControl: true,
      dragging: false,
      touchZoom: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
    }).setView([p.lat, p.lon], 14);
    placeMap.attributionControl.setPrefix(false);
    let fails = 0;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    })
      .on('tileerror', () => ++fails === 3 && $('.minimap')?.classList.add('notiles'))
      .addTo(placeMap);
    L.marker([p.lat, p.lon], {
      icon: L.divIcon({
        className: 'trip-pin',
        html: '<b></b>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
      interactive: false,
      keyboard: false,
    }).addTo(placeMap);
    setTimeout(() => placeMap?.invalidateSize(), 320);
  }
}
function showRankingMethod() {
  showModal(
    `<div class="modalcontent"><span class="eyebrow">POPULARITY, WITH CONTEXT</span><h2>Every number has a meaning.</h2><section class="method-block"><h3>City tourism index</h3><p>Euromonitor’s 2025 Top 100 City Destinations Index combines tourism performance with infrastructure, policy, business, safety and sustainability. The rank is global within its 100-city study. It is not an ordering by visitor numbers.</p>${external(POP.indexSource || 'https://www.euromonitor.com/article/top-100-city-destinations-index-2025-driving-growth-and-innovation', 'Euromonitor methodology ↗')} · ${external(POP.indexTableSource || 'https://www.vacationstravel.com/top-100-city-destinations/', 'Published rank table ↗')}</section><section class="method-block"><h3>Most visited cities</h3><p>The separate arrivals view uses the public 2025 top 10 for international arrivals. These were year-end estimates published in December 2025. Repeat trips count; domestic visitors are excluded. Only the covered cities in that published table receive a rank. Unranked destinations are not “least popular”.</p>${external(POP.arrivalsSource || 'https://www.statista.com/chart/35880/top-cities-for-international-visitors-in-2025/', 'Published arrivals figures ↗')}</section><section class="method-block"><h3>Place popularity</h3><p>Each place is scored from every source we have for it: Tripadvisor review counts, Google Maps review counts and how many people read its Wikipedia page over the last 12 months. For each source, the place gets a percentile against the other sights, restaurants, food experiences or shopping stops in the same city. The score is the average of those percentiles, with review sources counting more than Wikipedia readership. Ratings only break ties.</p><p>Open any place to see each source, its number and where it puts the place. Review volume and page views signal visibility, not measured footfall. Places with no comparable data are editorial picks and stay unranked.</p></section><section class="method-block"><h3>Why go?</h3><p>The appeal and visit-flow notes are editorial explanations grounded in the linked venue and destination sources. Review observations are identified in the visitor-evidence section. Costs are planning ranges. Original AI illustrations communicate the experience and are labelled; photographic sources remain available.</p></section><button class="btn" data-action="close-modal">Got it</button></div>`,
    'How popularity rankings work',
  );
}
// ---------------------------------------------------------------------------
// Inspiration: browse the most popular places worldwide by vibe, "surprise
// me", and "since you're going to X" suggestions on each city page.
// ---------------------------------------------------------------------------
const VIBES = [
  'History',
  'Nature',
  'Food',
  'Architecture',
  'Art',
  'Viewpoint',
  'Spiritual',
  'Adventure',
  'Shopping',
  'Entertainment',
];
let vibe = 'History';
// Cross-city order: the city-relative popularity score, then raw review volume.
function worldOrder(a, b) {
  return (
    (popularityScore(b) ?? -1) - (popularityScore(a) ?? -1) ||
    (reviewCount(b) ?? -1) - (reviewCount(a) ?? -1)
  );
}
function vibePlaces(v, n = 8) {
  const pool = PLACES.filter((p) => typesFor(p).includes(v) && popularityRank(p) !== null).sort(
    worldOrder,
  );
  // At most two per city, so one city can't fill the row.
  const perCity = {};
  return pool.filter((p) => (perCity[p.cityId] = (perCity[p.cityId] || 0) + 1) <= 2).slice(0, n);
}
function vibeCard(p) {
  return `<article class="vibecard" data-action="place" data-id="${p.id}" tabindex="0" role="button" aria-label="Why go to ${esc(p.name)}"><div class="vibeimage">${visualTag(p.id)}</div><div class="vibebody"><span class="vibecity">${esc(p.cityName)} · #${popularityRank(p)} there</span><h3>${esc(p.name)}</h3><p class="rankwhy">${esc(rankShort(p))}</p></div></article>`;
}
function vibeSection() {
  return `<div class="rowhead" id="vibes"><h2>In the mood for…</h2></div><div class="chips" id="vibe-chips">${VIBES.map((v) => `<button class="chip ${vibe === v ? 'active' : ''}" data-action="vibe" data-id="${v}">${v}</button>`).join('')}</div><div class="hrow vibegrid" id="vibe-results">${vibePlaces(vibe).map(vibeCard).join('')}</div>`;
}
function surprise() {
  // A top-3 sight from a random city, so the surprise is always worth it.
  const picks = PLACES.filter(
    (p) => p.kind === 'see' && popularityRank(p) !== null && popularityRank(p) <= 3,
  );
  const p = picks[Math.floor(Math.random() * picks.length)];
  if (p) openPlace(p.id);
}
function travelLabel(m) {
  return m < 60
    ? m + ' min'
    : Math.floor(m / 60) + 'h' + (m % 60 ? String(m % 60).padStart(2, '0') : '');
}
function alsoFromHere(c) {
  const linked = new Map(
    (c.connections || []).filter((x) => validCity(x.to)).map((x) => [x.to, x]),
  );
  for (const o of CITIES)
    for (const x of o.connections || [])
      if (x.to === c.id && !linked.has(o.id)) linked.set(o.id, { ...x, to: o.id });
  const near = CITIES.filter(
    (o) => o.id !== c.id && !linked.has(o.id) && (o.country === c.country || hav(c, o) < 600),
  )
    .sort((a, b) => hav(c, a) - hav(c, b))
    .slice(0, Math.max(0, 4 - linked.size));
  const cities = [...[...linked.keys()].map((id) => C[id]), ...near].slice(0, 4);
  const trips = c.items
    .filter((p) => p.excursion)
    .map((p) => P[p.id])
    .sort(worldOrder);
  if (!cities.length && !trips.length) return '';
  const cityHtml = cities
    .map((o) => {
      const l = linked.get(o.id),
        top = o.items
          .map((p) => P[p.id])
          .filter((p) => p.kind === 'see')
          .sort(worldOrder)
          .slice(0, 2);
      return `<article class="alsocard"><a class="alsoimage" href="#/city/${o.id}">${photoTag(o.id)}</a><div class="alsobody"><span class="eyebrow">${l ? `${esc(l.mode)} · about ${travelLabel(l.minutes)}` : `${esc(o.country)} · ${distanceText(hav(c, o))} away`}</span><h3><a href="#/city/${o.id}">${esc(o.name)}</a></h3><p>${esc(o.tagline || o.summary)}</p>${top.length ? `<ul>${top.map((p) => `<li><button class="inline-link" data-action="place" data-id="${p.id}">${esc(p.name)}</button></li>`).join('')}</ul>` : ''}</div></article>`;
    })
    .join('');
  return `<section class="alsofrom"><div class="rowhead"><h2>Make more of ${esc(c.name)}</h2></div>${trips.length ? `<h3 class="alsoh">Day trips and excursions from ${esc(c.name)}</h3><div class="alsotrips">${trips.map((p) => `<button class="alsotrip" data-action="place" data-id="${p.id}"><strong>${esc(p.name)}</strong><small>${p.duration > 16 ? 'Multi-day' : p.duration + ' h'} · ${esc(rankReason(p))}</small></button>`).join('')}</div>` : ''}${cities.length ? `<h3 class="alsoh">Easy to add nearby</h3><div class="alsogrid">${cityHtml}</div>` : ''}</section>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  if (b.dataset.action === 'vibe') {
    vibe = b.dataset.id;
    $$('[data-action="vibe"]').forEach((x) => x.classList.toggle('active', x.dataset.id === vibe));
    $('#vibe-results').innerHTML = vibePlaces(vibe).map(vibeCard).join('');
  } else if (b.dataset.action === 'surprise') surprise();
});

function renderExplore() {
  headerActive('explore');
  $('#app').innerHTML =
    `<div class="wrap home"><section class="home-hero">${photoTag('kyoto', '', false)}<div class="home-hero-copy"><h1>Where to next?</h1><p>${CITIES.length} places worth the trip, ranked so you can see why.</p><div class="searchbox hero-search">${icon('search')}<input type="search" id="browse-search" aria-label="Search destinations and attractions" placeholder="Search a city, country or landmark" value="${esc(browseQuery)}"></div><div class="quickacts"><button class="quickact" data-action="surprise">${icon('shuffle')} Surprise me</button><a class="quickact" href="#/budget">${icon('wallet')} Trips for my budget</a><a class="quickact" href="#/map">${icon('map')} Browse the map</a><a class="quickact" href="#/trip">${icon('route')} Plan a trip</a></div></div><span class="hero-credit">${photoCredit('kyoto')}</span></section>${storyTeaser()}<div class="chips region-chips" id="region-chips">${['All', 'Asia', 'Europe', 'Africa', 'South America', 'North America'].map((r) => `<button class="chip ${browseRegion === r ? 'active' : ''}" data-action="region" data-id="${r}">${r === 'All' ? 'Everywhere' : r}</button>`).join('')}</div>${monthChips()}<div class="browse-tools" id="browse"><label class="sortpick">Sort by <select id="browse-sort" aria-label="Sort destinations">${[
      ['tourism', 'Tourism index'],
      ['arrivals', 'Most visited'],
      ['personal', 'Japan first'],
    ]
      .map(([k, t]) => `<option value="${k}" ${browseSort === k ? 'selected' : ''}>${t}</option>`)
      .join(
        '',
      )}</select></label><button class="inline-link" data-action="ranking-method">${icon('info')} What do the ranks mean?</button></div><div id="browse-results"></div>${vibeSection()}<div class="rowhead"><h2>Ready-made trips</h2><a href="#/trip" class="inline-link">See all ${icon('arrow')}</a></div><div class="hrow">${TEMPLATES.slice(
      0,
      6,
    )
      .map(
        (t) =>
          `<article class="tripteaser" data-action="template" data-id="${t.id}" tabindex="0" role="button" aria-label="Plan ${esc(t.title)}">${starterArt(t)}<div class="teaser-body"><div class="tag">${t.tag}</div><h3>${t.title}</h3><p>${t.highlights}</p></div></article>`,
      )
      .join('')}</div>${footer()}</div>`;
  renderBrowse();
}
// "When can I go?": one row of months. The pick also prices every estimate for that month.
function monthChips() {
  const m = budgetMonth();
  return `<div class="month-pick" id="month-chips" role="group" aria-label="When are you going?"><span class="month-label">${icon('calendar')} When</span><div class="chips month-chips"><button class="chip ${m ? '' : 'active'}" data-action="month" data-id="0" aria-pressed="${!m}">Any time</button>${MONTHS.map((t, i) => `<button class="chip ${m === i + 1 ? 'active' : ''}" data-action="month" data-id="${i + 1}" aria-pressed="${m === i + 1}">${t}</button>`).join('')}</div></div>`;
}
function syncMonthChips() {
  const m = budgetMonth();
  $$('#month-chips .chip').forEach((x) => {
    const on = Number(x.dataset.id) === m;
    x.classList.toggle('active', on);
    x.setAttribute('aria-pressed', on);
  });
}
const bestIn = (c, m) => c.bestMonths.includes(m);
function browseOrder(list) {
  if (browseSort === 'personal') return list;
  return [...list].sort((a, b) => (cityRanking(a)?.rank ?? 1e4) - (cityRanking(b)?.rank ?? 1e4));
}
function cityRow(title, list, region = '') {
  return `<section class="cityrow"><div class="rowhead"><h2>${title}</h2>${region ? `<button class="inline-link" data-action="region" data-id="${region}">See all ${list.length} ${icon('arrow')}</button>` : ''}</div><div class="hrow">${list.map(cityCard).join('')}</div></section>`;
}
function renderBrowse() {
  const q = browseQuery.toLowerCase().trim();
  const list = browseOrder(
    CITIES.filter(
      (c) =>
        (browseRegion === 'All' || c.region === browseRegion) &&
        (!q ||
          [c.name, c.country, c.tagline, ...c.items.map((p) => p.name + ' ' + p.summary)]
            .join(' ')
            .toLowerCase()
            .includes(q)),
    ),
  );
  const el = $('#browse-results');
  if (!el) return;
  if (!list.length) {
    el.innerHTML =
      '<div class="no-results">No matching destinations. Try a city, country or landmark.</div>';
    return;
  }
  // Rows of cards while browsing everything; a full grid once the person narrows down.
  if (browseRegion === 'All' && !q) {
    const top = list.filter((c) => cityRanking(c)).slice(0, 10);
    const regions = ['Asia', 'Europe', 'Africa', 'South America', 'North America'];
    const m = budgetMonth(),
      best = m ? list.filter((c) => bestIn(c, m)) : [],
      quiet = best.filter((c) => 'LS'.includes(COSTS.seasons?.[c.id]?.[m - 1] || 'H'));
    el.innerHTML =
      (m
        ? best.length
          ? cityRow(`At their best in ${MONTHS_LONG[m - 1]}`, best) +
            (quiet.length >= 3 ? cityRow('Good weather, fewer crowds', quiet) : '')
          : `<p class="muted">No destination here lists ${MONTHS_LONG[m - 1]} among its best months.</p>`
        : '') +
      budgetHomeRow() +
      (browseSort === 'personal'
        ? ''
        : cityRow(
            browseSort === 'arrivals' ? 'Most visited in the world' : 'Top of the tourism index',
            top,
          )) +
      regions
        .map((r) => [r, list.filter((c) => c.region === r)])
        .filter(([, l]) => l.length)
        .map(([r, l]) => cityRow(r, l, r))
        .join('');
    return;
  }
  const m = budgetMonth();
  if (m) list.sort((a, b) => bestIn(b, m) - bestIn(a, m));
  el.innerHTML = `<p class="muted result-count">${list.length} destination${list.length > 1 ? 's' : ''}${m ? ` · ${list.filter((c) => bestIn(c, m)).length} at their best in ${MONTHS_LONG[m - 1]}` : ''}${browseRegion !== 'All' ? ' in ' + esc(browseRegion) + ` · <button class="inline-link" data-action="region" data-id="All">Show everywhere</button>` : ''}</p><div class="citygrid">${list.map(cityCard).join('')}</div>`;
}
function openStay(id) {
  if (!validCity(id)) return;
  const c = C[id],
    s = S.stays[id];
  stayCity = id;
  stayDraft = s ? { ...s } : null;
  staySearchResults = [];
  showModal(
    `<div class="modalcontent stay-modal"><span class="eyebrow">YOUR STARTING POINT IN ${esc(c.name.toUpperCase())}</span><h2>Where are you staying?</h2><p>Search for your hotel or address, paste coordinates, or tap the map to place a pin. Confirm the location before saving.</p><div class="field"><label for="stay-label">Name to remember</label><input id="stay-label" maxlength="180" placeholder="My hotel / apartment" value="${esc(s?.label || '')}"></div><div class="stay-search-line"><div class="field"><label for="stay-query">Hotel, address, coordinates or full Google Maps link</label><input id="stay-query" maxlength="500" placeholder="e.g. hotel name, Tokyo · or 35.71, 139.80" value="${esc(s?.address || '')}"></div><button class="btn small" data-action="stay-search">Find location</button></div><p class="filter-note">Address search sends your query to Photon / OpenStreetMap. Pinning the map or pasting coordinates works without address search. Your saved stay remains in this browser and your exported backups.</p><div id="stay-search-status" role="status" class="filter-note"></div><div id="stay-search-results" class="stay-search-results"></div><div id="stay-map" aria-label="Choose your accommodation location on the map"></div><div class="stay-coordinate-line"><label>Latitude <input id="stay-lat" type="number" min="-90" max="90" step="any" value="${s?.lat ?? ''}" placeholder="35.71"></label><label>Longitude <input id="stay-lon" type="number" min="-180" max="180" step="any" value="${s?.lon ?? ''}" placeholder="139.80"></label><button class="btn light small" data-action="stay-coords">Use coordinates</button><button class="btn light small" data-action="stay-location">${icon('locate')} Use my location</button></div><p id="stay-confirm" class="stay-confirm" role="status">${s ? 'Current saved point. Move it if needed.' : 'No location selected yet. Tap the map or choose a search result.'}</p><div class="actions"><button class="btn" data-action="stay-save" id="stay-save" ${s ? '' : 'disabled'}>Save my stay</button>${s ? '<button class="btn ghost" data-action="stay-remove">Remove stay</button>' : ''}<button class="btn ghost" data-action="close-modal">Cancel</button></div><small class="muted">Map/search © OpenStreetMap contributors. Search is an optional online service with no availability guarantee. Check hotel names and entrances carefully.</small></div>`,
    'Set your accommodation',
  );
  stayMap = L.map('stay-map', { zoomControl: true, minZoom: 1, maxZoom: 19 }).setView(
    [s?.lat ?? c.lat, s?.lon ?? c.lon],
    13,
  );
  L.geoJSON(DATA.world, {
    style: outlineStyle(),
    interactive: false,
  }).addTo(stayMap);
  if (navigator.onLine)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(stayMap);
  stayMap.on('click', (e) =>
    selectStayPoint({ lat: e.latlng.lat, lon: e.latlng.lng, address: 'Pinned on the map' }),
  );
  if (s) selectStayPoint(s, false);
  setTimeout(() => stayMap?.invalidateSize(), 100);
}
function selectStayPoint(point, move = true) {
  if (!stayMap || !validCoords(point.lat, point.lon)) return;
  staySearchSequence++;
  staySearchAbort?.abort();
  staySearchAbort = null;
  stayDraft = {
    lat: point.lat,
    lon: point.lon,
    label: point.label || $('#stay-label')?.value || 'My stay',
    address: point.address || '',
  };
  if (stayMarker) stayMap.removeLayer(stayMarker);
  stayMarker = L.circleMarker([point.lat, point.lon], {
    radius: 10,
    color: '#fff',
    weight: 3,
    fillColor: '#e7764b',
    fillOpacity: 1,
  }).addTo(stayMap);
  if (move) stayMap.setView([point.lat, point.lon], Math.max(14, stayMap.getZoom()));
  $('#stay-lat').value = point.lat.toFixed(6);
  $('#stay-lon').value = point.lon.toFixed(6);
  if (!$('#stay-label').value && point.label) $('#stay-label').value = point.label;
  const d = hav(C[stayCity], point);
  $('#stay-confirm').textContent =
    (point.address ? point.address + ' · ' : '') +
    point.lat.toFixed(5) +
    ', ' +
    point.lon.toFixed(5) +
    (d > 80
      ? ' · This is ' +
        Math.round(d) +
        ' km from the city centre. Check that you selected the correct city.'
      : ' · Check the pin, then save.');
  $('#stay-save').disabled = false;
  if ($('#stay-search-status'))
    $('#stay-search-status').textContent = 'Location selected. Check the pin and save.';
}
async function searchStay() {
  const q = $('#stay-query')?.value.trim();
  if (!q) return;
  const sequence = ++staySearchSequence;
  staySearchAbort?.abort();
  staySearchAbort = null;
  const parsed = parseStayCoordinates(q);
  if (parsed) {
    selectStayPoint({ ...parsed, address: 'Point from coordinates / map link' });
    return;
  }
  if (/^https?:\/\//i.test(q)) {
    toast(
      'Use a full Maps URL containing coordinates, or paste latitude and longitude. Short share links cannot be located here.',
    );
    return;
  }
  if (!navigator.onLine) {
    $('#stay-search-status').textContent =
      'You are offline. Use coordinates or place a pin on the map.';
    return;
  }
  if (Date.now() - staySearchTime < 1500) {
    $('#stay-search-status').textContent = 'Please wait a moment, then press Find location again.';
    return;
  }
  staySearchTime = Date.now();
  const city = stayCity,
    query = q + ', ' + C[city].name,
    key = city + '|' + q.toLowerCase();
  $('#stay-search-status').textContent = 'Looking for matching locations…';
  $('#stay-search-results').innerHTML = '';
  staySearchResults = [];
  try {
    let rows = geocodeCache.get(key);
    if (!rows) {
      const controller = new AbortController();
      staySearchAbort = controller;
      const timer = setTimeout(() => controller.abort(), 12000);
      let response;
      try {
        response = await fetch(
          'https://photon.komoot.io/api/?' +
            new URLSearchParams({
              q: query,
              lat: C[city].lat,
              lon: C[city].lon,
              limit: 6,
              lang: 'en',
            }),
          { signal: controller.signal, referrerPolicy: 'no-referrer' },
        );
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) throw Error('Search is temporarily unavailable');
      const data = await response.json();
      rows = (data.features || [])
        .filter(
          (f) =>
            f.geometry?.type === 'Point' &&
            validCoords(f.geometry.coordinates[1], f.geometry.coordinates[0]),
        )
        .map((f) => ({
          lat: f.geometry.coordinates[1],
          lon: f.geometry.coordinates[0],
          label: f.properties?.name || q,
          address: [
            f.properties?.housenumber,
            f.properties?.street,
            f.properties?.district,
            f.properties?.city,
            f.properties?.country,
          ]
            .filter(Boolean)
            .join(', '),
        }));
      geocodeCache.set(key, rows);
    }
    if (!stayMap || stayCity !== city || sequence !== staySearchSequence) return;
    staySearchResults = rows;
    $('#stay-search-status').textContent = rows.length
      ? 'Choose the matching address, check its map pin, then save.'
      : 'No matches found. Try a street address or place a pin yourself.';
    $('#stay-search-results').innerHTML = rows
      .map(
        (p, i) =>
          `<button data-action="stay-result" data-id="${i}"><strong>${esc(p.label)}</strong><span>${esc(p.address)}</span><small>${distanceText(hav(C[city], p))} from ${esc(C[city].name)} centre</small></button>`,
      )
      .join('');
  } catch (e) {
    if (sequence !== staySearchSequence) return;
    if ($('#stay-search-status'))
      $('#stay-search-status').textContent =
        'Address search is unavailable. Paste coordinates or tap the map to set your stay.';
  }
}
function saveStay() {
  if (!stayDraft || !validCity(stayCity)) return;
  S.stays[stayCity] = normalStay({
    ...stayDraft,
    label: $('#stay-label')?.value.trim() || stayDraft.label || 'My stay',
  });
  const id = stayCity;
  persist();
  closeModal();
  if (location.hash.startsWith('#/trip')) renderTrip();
  else if (map) {
    renderMapPins(false);
    toast('Stay saved. Open the city guide for nearby recommendations.');
  } else {
    const tab = activeCityId === id && FOOD_FILTERS.includes(cityFilter) ? 'food' : 'places';
    if (tab === 'places') cityFilter = 'see';
    activeCityId = id;
    placeSort = 'nearby';
    history.replaceState(null, '', '#/city/' + id + '?tab=' + tab);
    renderCity(id, tab);
  }
  toast('Your stay is saved. Nearby choices and local route origins are ready.');
}
function stayUseLocation() {
  if (!navigator.geolocation) {
    toast('Location is unavailable. Pin the map instead.');
    return;
  }
  const id = stayCity;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (stayMap && stayCity === id)
        selectStayPoint({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          address: 'Current device location',
        });
    },
    () => toast('Location unavailable. Search or pin the map instead.'),
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
  );
}
function closeStayMap() {
  staySearchSequence++;
  staySearchAbort?.abort();
  staySearchAbort = null;
  if (stayMap) {
    stayMap.remove();
    stayMap = null;
  }
  stayMarker = null;
}

function changeCityFilter(id) {
  cityFilter = id;
  experienceFilter = 'all';
  foodHalal = 'all';
  foodVeg = 'all';
  const cid = location.hash.split('/')[2]?.split('?')[0];
  if (validCity(cid)) {
    const tab = FOOD_FILTERS.includes(id) ? 'food' : id === 'shop' ? 'shop' : 'places';
    history.replaceState(null, '', '#/city/' + cid + '?tab=' + tab);
    renderCity(cid, tab);
    $('.citytabs')?.scrollIntoView({ block: 'start' });
  }
}
function switchPlaceVisual(id, useArt) {
  if (!validPlace(id) || !$('#place-visual-main')) return;
  galleryGo(galleryScope($('#place-visual-main')), 0);
  $('#place-visual-main').innerHTML =
    `${useArt ? artTag(id, '', false) : photoTag(id, '', false)}<div class="photo-caption">${useArt ? artCaption(id) : photoCredit(id) + (PHOTO[id]?.context ? '<br>' + esc(photoContext(id)) : '')}</div>`;
  $$('.visual-toggle button').forEach((x) =>
    x.classList.toggle('active', x.dataset.action === (useArt ? 'place-art' : 'place-photo')),
  );
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b || b.disabled) return;
  const a = b.dataset.action,
    id = b.dataset.id;
  if (a === 'ranking-method') showRankingMethod();
  else if (a === 'browse-scroll')
    $('#browse')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else if (a === 'browse-sort') {
    browseSort = id;
    $$('[data-action="browse-sort"]').forEach((x) =>
      x.classList.toggle('active', x.dataset.id === id),
    );
    renderBrowse();
  } else if (a === 'place-view') {
    placeView = id;
    $$('[data-action="place-view"]').forEach((x) =>
      x.classList.toggle('active', x.dataset.id === id),
    );
    refreshCityResults();
  } else if (a === 'clear-place-filters') {
    experienceFilter = 'all';
    foodHalal = 'all';
    foodVeg = 'all';
    placeSort = 'popularity';
    placeQuery = '';
    const inSheet = Boolean(b.closest('.modal'));
    if (inSheet) {
      refreshCityResults();
      openFilters();
    } else
      renderCity(
        activeCityId,
        FOOD_FILTERS.includes(cityFilter) ? 'food' : cityFilter === 'shop' ? 'shop' : 'places',
      );
  } else if (a === 'city-tab') {
    if (b.dataset.tab === 'places') cityFilter = 'see';
    if (b.dataset.tab === 'food') cityFilter = 'restaurants';
    if (b.dataset.tab === 'shop') cityFilter = 'shop';
    experienceFilter = 'all';
    foodHalal = 'all';
    foodVeg = 'all';
    placeQuery = '';
  } else if (a === 'edit-stay') openStay(id);
  else if (a === 'stay-search') searchStay();
  else if (a === 'stay-result') {
    const p = staySearchResults[Number(id)];
    if (p) selectStayPoint(p);
  } else if (a === 'stay-coords') {
    const la = $('#stay-lat').value,
      lo = $('#stay-lon').value;
    if (!la.trim() || !lo.trim() || !validCoords(Number(la), Number(lo)))
      toast('Enter latitude between −90 and 90, and longitude between −180 and 180.');
    else selectStayPoint({ lat: Number(la), lon: Number(lo), address: 'Entered coordinates' });
  } else if (a === 'stay-location') stayUseLocation();
  else if (a === 'stay-save') saveStay();
  else if (a === 'stay-remove') {
    const cid = stayCity;
    delete S.stays[cid];
    persist();
    closeModal();
    if (location.hash.startsWith('#/trip')) renderTrip();
    else if (map) renderMapPins(false);
    else {
      if (placeSort === 'nearby') placeSort = 'popularity';
      renderCity(cid);
    }
    toast('Saved accommodation removed.');
  } else if (a === 'nearby-first') {
    placeSort = 'nearby';
    cityFilter = 'see';
    experienceFilter = 'all';
    foodHalal = 'all';
    foodVeg = 'all';
    renderCity(id);
    $('.citytabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (a === 'place-art') switchPlaceVisual(id, true);
  else if (a === 'place-photo') switchPlaceVisual(id, false);
  else if (a === 'gal-step') {
    const scope = galleryScope(b),
      t = scope.querySelector('[data-gtrack]');
    if (t) galleryGo(scope, galleryIndex(t) + Number(b.dataset.dir));
  } else if (a === 'gal-go') galleryGo(galleryScope(b), Number(b.dataset.i));
  else if (a === 'city-photos') openViewer(id, Number(b.dataset.i) || 0);
  else if (a === 'place-filters') openFilters();
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'place-search') {
    placeQuery = e.target.value;
    refreshCityResults();
  }
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'experience-filter') {
    experienceFilter = t.value;
    refreshCityResults();
  } else if (t.id === 'food-halal') {
    foodHalal = t.value;
    refreshCityResults();
  } else if (t.id === 'food-veg') {
    foodVeg = t.value;
    refreshCityResults();
  } else if (t.id === 'map-diet') {
    mapDiet = t.value;
    renderMapPins(true);
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'stay-query') {
    e.preventDefault();
    searchStay();
  }
});

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const a = b.dataset.action,
    id = b.dataset.id;
  if (b.disabled) return;
  if (a === 'save') {
    e.stopPropagation();
    toggleSave(id);
  } else if (a === 'trip-toggle') {
    e.stopPropagation();
    toggleTrip(id);
  } else if (a === 'city') location.hash = '#/city/' + id;
  else if (a === 'place') {
    setPlaceList(b, id);
    openPlace(id);
  } else if (a === 'place-step') placeStep(Number(b.dataset.dir));
  else if (a === 'save-shop') {
    e.stopPropagation();
    toggleShop(id);
  } else if (a === 'close-modal') closeModal('user');
  else if (a === 'month') setMonth(Number(id));
  else if (a === 'region') {
    browseRegion = id;
    $$('#region-chips .chip').forEach((x) => x.classList.toggle('active', x.dataset.id === id));
    renderBrowse();
  } else if (a === 'city-tab') {
    const target = '#/city/' + id + '?tab=' + b.dataset.tab;
    if (location.hash === target) renderCity(id, b.dataset.tab);
    else location.hash = target;
  } else if (a === 'city-filter') changeCityFilter(id);
  else if (a === 'shop-tier') setShopFilter('tier', id);
  else if (a === 'shop-style') setShopFilter('style', id);
  else if (a === 'template') applyTemplate(id);
  else if (a === 'trip-tab') {
    tripTab = id;
    rerenderTrip();
    if ($('.triptabs').getBoundingClientRect().top < 0 || b.classList.contains('tc-total'))
      $('.triptabs').scrollIntoView({ block: 'start' });
  } else if (a === 'save-top5') saveTopFive(id);
  else if (a === 'choose-cities') chooseCities();
  else if (a === 'finish-cities') {
    closeModal();
    location.hash = '#/trip';
    renderTrip();
  } else if (a === 'days') {
    S.days[id] = Math.max(1, Math.min(21, (S.days[id] || C[id].days) + Number(b.dataset.dir)));
    persist();
    const y = window.scrollY;
    renderTrip();
    window.scrollTo(0, y);
  } else if (a === 'move') {
    const i = S.trip.indexOf(id),
      j = i + Number(b.dataset.dir);
    if (j >= 0 && j < S.trip.length) {
      [S.trip[i], S.trip[j]] = [S.trip[j], S.trip[i]];
      persist();
      const y = window.scrollY;
      renderTrip();
      window.scrollTo(0, y);
    }
  } else if (a === 'optimize') optimizeRoute();
  else if (a === 'export') exportTrip();
  else if (a === 'csv') exportCSV();
  else if (a === 'import') importTrip();
  else if (a === 'import-merge') doImport(true);
  else if (a === 'import-replace') doImport(false);
  else if (a === 'print') window.print();
  else if (a === 'budget-detail') budgetDetail();
  else if (a === 'saved-to-trip') {
    for (const pid of S.saved) {
      const cid = P[pid].cityId;
      if (!inTrip(cid)) {
        S.trip.push(cid);
        S.days[cid] ??= C[cid].days;
      }
    }
    persist();
    location.hash = '#/trip';
  } else if (a === 'map-kind') {
    mapKind = id;
    $$('[data-action="map-kind"]').forEach((x) =>
      x.classList.toggle('active', x.dataset.id === id),
    );
    renderMapPins(true);
  } else if (a === 'map-city-open') setMapCity(id);
  else if (a === 'map-focus') {
    const p = P[id] || C[id];
    map.setView([p.lat, p.lon], P[id] ? Math.max(13, map.getZoom()) : 6);
    setMapSheet(false);
    if (isMobile()) showMapCard(id);
    else mapMarkers[id]?.openPopup();
  } else if (a === 'map-reset') {
    mapCity = '';
    mapKind = 'all';
    mapQuery = '';
    mapDiet = 'all';
    $('#map-diet').value = 'all';
    $('#map-city').value = '';
    $('#map-search').value = '';
    $$('[data-action="map-kind"]').forEach((x) =>
      x.classList.toggle('active', x.dataset.id === 'all'),
    );
    routeLayer.clearLayers();
    renderMapPins(true);
    history.replaceState(null, '', '#/map');
  } else if (a === 'map-list') setMapSheet(!$('#map-sheet').classList.contains('open'));
  else if (a === 'map-card-close') hideMapCard();
  else if (a === 'tiles') {
    S.street = !S.street;
    persist();
    if (S.street) enableStreet();
    else if (streetLayer) {
      map.removeLayer(streetLayer);
      streetLayer = null;
    }
    $('#tile-toggle').innerHTML =
      icon('map') + `<span class="lbl"> Street detail: ${S.street ? 'on' : 'off'}</span>`;
    $('#tile-toggle').classList.toggle('on', S.street);
    $('#tile-toggle').setAttribute('aria-label', 'Street detail ' + (S.street ? 'on' : 'off'));
    $('#map-note').textContent = S.street
      ? 'Online street detail. Lines show stop order, not turn-by-turn routes.'
      : 'Offline map: planning pins and country outlines. Enable street detail when online.';
  } else if (a === 'locate') mapLocate();
  else if (a === 'map-place') {
    const p = P[id];
    closeModal();
    const reveal = () => {
      if (!map) return;
      map.setView([p.lat, p.lon], 13, { animate: false });
      if (isMobile()) showMapCard(id);
      else mapMarkers[id]?.openPopup();
    };
    if (map) {
      setMapCity(p.cityId);
      reveal();
    } else {
      location.hash = '#/map/' + p.cityId;
      setTimeout(reveal, 150);
    }
  }
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'browse-search') {
    browseQuery = t.value;
    renderBrowse();
  } else if (t.id === 'map-search') {
    mapQuery = t.value;
    renderMapPins(false);
  } else if (t.id === 'choose-city-search')
    $('#choose-city-list').innerHTML = chooseCityList(t.value);
  else if (t.dataset.note) {
    S.notes[t.dataset.note] = t.value.slice(0, 4000);
    persist();
  }
});
document.addEventListener('change', (e) => {
  const t = e.target;
  let tripChange = false;
  if (t.id === 'browse-sort') {
    browseSort = t.value;
    renderBrowse();
  } else if (t.id === 'place-sort') {
    placeSort = t.value;
    refreshCityResults();
  } else if (t.id === 'map-city') {
    if (t.value) setMapCity(t.value);
    else {
      mapCity = '';
      history.replaceState(null, '', '#/map');
      renderMapPins(true);
    }
  } else if (t.id === 'trip-date') {
    S.startDate = t.value;
    tripChange = true;
  } else if (t.id === 'trip-pace') {
    S.pace = t.value;
    tripChange = true;
  } else if (t.id === 'trip-people') {
    S.people = Math.max(1, Math.min(20, Math.round(Number(t.value) || 1)));
    tripChange = true;
  } else if (t.dataset.lodging) {
    S.lodging[t.dataset.lodging] = Math.max(0, Math.min(1e8, Number(t.value) || 0));
    tripChange = true;
  } else if (t.dataset.extra) {
    S.extra[t.dataset.extra] = Math.max(0, Math.min(1e9, Number(t.value) || 0));
    tripChange = true;
  } else if (t.dataset.visited) {
    S.visited = t.checked
      ? [...new Set([...S.visited, t.dataset.visited])]
      : S.visited.filter((x) => x !== t.dataset.visited);
    persist();
  } else if (t.dataset.checklist) {
    S.checklist = t.checked
      ? [...new Set([...S.checklist, t.dataset.checklist])]
      : S.checklist.filter((x) => x !== t.dataset.checklist);
    persist();
  } else if (t.id === 'source-city' || t.id === 'source-type') renderSources();
  if (tripChange) {
    persist();
    const y = window.scrollY;
    renderTrip();
    window.scrollTo(0, y);
  }
});
$('#import-file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    if (f.size > 5e6)
      throw Error('This backup is too large. Choose a Tandem Roads trip JSON under 5 MB.');
    importPreview(JSON.parse(await f.text()));
  } catch (err) {
    toast(err.message || 'Could not read this backup.');
  }
  e.target.value = '';
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('.modal-backdrop')) closeModal('user');
  if (
    (e.key === 'Enter' || e.key === ' ') &&
    e.target.matches('[role="button"][data-action],[role="link"][data-action]')
  ) {
    e.preventDefault();
    e.target.click();
  }
  if (e.key === 'Tab' && $('.modal-backdrop')) {
    const focusables = $$(
      '.modal button:not(:disabled),.modal a[href],.modal input,.modal select,.modal textarea,.modal [tabindex="0"]',
    );
    const first = focusables[0],
      last = focusables.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }
});
window.addEventListener('hashchange', route);
window.addEventListener('online', () => {
  if (map && S.street) enableStreet();
});
window.addEventListener('offline', () => {
  toast('You are offline. Your guide, photos and pins still work.');
  if (map && $('#map-note'))
    $('#map-note').textContent =
      'Offline: your guide, photos and pins remain available. Street tiles need a connection.';
});
applyTheme();
route();
if (!storageOK)
  setTimeout(() => toast('Browser storage is unavailable. Use Export to keep your trip.'), 500);
