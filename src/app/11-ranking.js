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
// data under place.signals.<key>. Third-party ratings and review counts are
// not stored or ranked: the sources' terms do not allow it.
// ---------------------------------------------------------------------------
const SIGNALS = [
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
    if (w) score.set(x.id, t / w);
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
const compact = (n) =>
  n >= 1e6
    ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'm'
    : n >= 1e3
      ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'k'
      : String(n);
function rankReason(p) {
  const sigs = placeSignals(p),
    m = michelinShort(p);
  if (!sigs.length) return (m || 'Editorial pick') + ' · no popularity figure yet';
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
  if (!sigs.length) return m || 'Editorial pick';
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
  if (sort === 'cost') return a.price[0] - b.price[0];
  if (sort === 'recommended') return a.priority - b.priority;
  // Unranked MICHELIN picks sit after ranked places but ahead of plain editorial picks.
  const fallback = (p) => (p.michelin ? -0.9 + p.michelin.stars * 0.1 : -1);
  return (
    (popularityScore(b) ?? fallback(b)) - (popularityScore(a) ?? fallback(a)) ||
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
// Map list order: the most-visited countries first (UN Tourism international arrivals), then
// within each country its most popular places: the published tourism index rank where there is
// one, then how many people read about the city's sights on Wikipedia.
const ARRIVALS = DATA.countryArrivals?.countries || {};
function cityReaders(c) {
  return c.items.reduce((sum, it) => sum + (P[it.id]?.signals?.wikipedia?.views || 0), 0);
}
let cityVisitOrder;
function citiesByVisits() {
  if (cityVisitOrder) return cityVisitOrder;
  const arr = (c) => ARRIVALS[c.country]?.arrivals ?? -1,
    idx = (c) => c.popularity?.tourism?.rank ?? Infinity,
    readers = new Map(CITIES.map((c) => [c.id, cityReaders(c)]));
  cityVisitOrder = [...CITIES].sort(
    (a, b) =>
      arr(b) - arr(a) ||
      a.country.localeCompare(b.country) ||
      idx(a) - idx(b) ||
      readers.get(b.id) - readers.get(a.id) ||
      a.name.localeCompare(b.name),
  );
  return cityVisitOrder;
}
function countryVisitors(country) {
  const a = ARRIVALS[country];
  return a
    ? `${compact(a.arrivals)} international visitors · ${a.year}`
    : 'No comparable visitor figure';
}
