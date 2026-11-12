// Trip stories: a logged trip told as a route on a map and a day-by-day timeline, with the time
// spent at each place and a few picked photos. The first one is a made-up sample (data/stories.json)
// so the format can be judged before accounts and real logging exist.
const STORIES = DATA.stories || {};
const LOVES_KEY = 'roam-story-loves';
// One colour per day, so the route reads in order on the map and in the timeline.
const ST_COLORS = [
  '#d1495b',
  '#e07a1f',
  '#a9820c',
  '#3a8f5a',
  '#16808a',
  '#2f6fd0',
  '#6a4fc4',
  '#b0429f',
  '#7a5a43',
];
const stColor = (day) => ST_COLORS[day % ST_COLORS.length];
// Phone layouts being tried side by side on the sample story. 'now' is the original.
const LAYOUT_KEY = 'roam-story-layout';
const ST_LAYOUTS = [
  ['now', 'Current'],
  ['map', 'A · Map first'],
  ['photo', 'B · Photos first'],
  ['tap', 'C · Tap through'],
];
const stStacked = () => matchMedia('(max-width: 900px)').matches;
function stLayout() {
  const ok = (x) => ST_LAYOUTS.some((l) => l[0] === x);
  const fromLink = location.hash.split('/')[3];
  if (ok(fromLink)) return fromLink;
  try {
    const v = localStorage.getItem(LAYOUT_KEY);
    if (ok(v)) return v;
  } catch {}
  return 'now';
}
let storyMap = null,
  storyNow = null;

const stMins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
function stDur(m) {
  const h = Math.floor(m / 60),
    r = m % 60;
  return h && r ? `${h} h ${r} min` : h ? `${h} h` : `${r} min`;
}
function stKm(a, b) {
  const rad = Math.PI / 180,
    dLat = (b.lat - a.lat) * rad,
    dLon = (b.lon - a.lon) * rad;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}
const stDate = (d, opts) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts });
function stLoves() {
  try {
    return new Set(JSON.parse(localStorage.getItem(LOVES_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

// Flattens the story into ordered stops with everything the page needs worked out once.
function storyModel(id) {
  const st = STORIES[id];
  if (!st) return null;
  const who = Object.fromEntries(st.travellers.map((t) => [t.id, t]));
  const stops = [],
    days = [];
  st.days.forEach((d, di) => {
    const day = { ...d, i: di, rows: [], mins: 0, places: 0 };
    d.stops.forEach((s) => {
      const mins = stMins(s.out) - stMins(s.in);
      if (s.leg) {
        day.rows.push({ leg: true, name: s.leg, in: s.in, out: s.out, mins, note: s.note });
        return;
      }
      const p = s.place ? P[s.place] : null;
      if (s.place && !p) return;
      const stop = {
        i: stops.length,
        day: di,
        n: day.places + 1,
        id: p?.id || '',
        name: p?.name || s.name,
        area: p?.area || s.area || '',
        cityId: p?.cityId || s.city,
        lat: p?.lat ?? s.lat,
        lon: p?.lon ?? s.lon,
        in: s.in,
        out: s.out,
        mins,
        by: who[s.by],
        note: s.note || '',
        photos: (s.photos || []).filter((x) => PHOTO[x.id]).map((x) => ({ ...x, by: who[x.by] })),
        loves: s.loves || 0,
        comments: s.comments || [],
      };
      stops.push(stop);
      day.rows.push(stop);
      day.mins += mins;
      day.places++;
    });
    days.push(day);
  });
  let km = 0;
  for (let i = 1; i < stops.length; i++) km += stKm(stops[i - 1], stops[i]);
  const cityIds = [...new Set(stops.map((s) => s.cityId))];
  // One screen per day and per stop, for the tap-through view.
  const slides = [];
  days.forEach((d) => {
    slides.push({ day: d });
    d.rows.filter((r) => !r.leg).forEach((r) => slides.push({ day: d, stop: r }));
  });
  return { id, st, stops, days, km, cityIds, slides };
}

const stAvatar = (t, cls = '') =>
  `<span class="st-avatar ${cls}" style="--who:${esc(t.color)}" title="${esc(t.name)}" aria-hidden="true">${esc(t.name[0])}</span>`;

// Outside links for a stop: where it is, and what other visitors say.
function stLinks(s) {
  const maps = s.id
    ? mapsPin(P[s.id])
    : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${s.lat},${s.lon}`);
  const ta = s.id
    ? 'https://www.tripadvisor.com/Search?q=' + encodeURIComponent(`${s.name} ${P[s.id].cityName}`)
    : '';
  return (
    external(
      maps,
      `${icon('pin')}<span>Maps</span>`,
      'st-act st-link" aria-label="' + esc(s.name) + ' on Google Maps',
    ) +
    (ta
      ? external(
          ta,
          `${icon('star')}<span>Tripadvisor</span>`,
          'st-act st-link" aria-label="' + esc(s.name) + ' on Tripadvisor',
        )
      : '')
  );
}
function stStopHtml(s, max) {
  const mine = stLoves().has(storyNow.id + ':' + s.i);
  const want = s.id && saved(s.id);
  return `<article class="st-stop" id="st-stop-${s.i}" data-i="${s.i}" style="--day:${stColor(s.day)}"><div class="st-time"><b class="st-num" aria-label="Stop ${s.n} of day ${s.day + 1}">${s.n}</b><strong>${s.in}</strong><span>${stDur(s.mins)}</span><i class="st-bar" style="--w:${Math.max(12, Math.round((Math.min(s.mins, max) / max) * 100))}%"></i></div><div class="st-body"><h4>${s.id ? `<button class="inline-link" data-action="place" data-id="${s.id}">${esc(s.name)}</button>` : esc(s.name)}</h4><p class="st-area">${esc(s.area)}${s.id ? '' : ' · added by the group'} · ${stAvatar(s.by, 'tiny')} logged by ${esc(s.by.name)}</p>${s.note ? `<p class="st-note">${esc(s.note)}</p>` : ''}${
    s.photos.length
      ? `<div class="st-photos n${s.photos.length}">${s.photos.map((x) => `<button class="st-photo" data-action="story-photo" data-id="${x.id}" aria-label="Open photo: ${esc(x.caption)}">${photoTag(x.id)}<span class="st-cap">${stAvatar(x.by, 'tiny')} ${esc(x.caption)}</span></button>`).join('')}</div>`
      : ''
  }<div class="st-acts"><button class="st-act ${mine ? 'on' : ''}" data-action="story-love" data-i="${s.i}" aria-pressed="${mine}" aria-label="Love this stop">${icon('heart')}<span>${s.loves + (mine ? 1 : 0)}</span></button>${s.id ? `<button class="st-act ${want ? 'on' : ''}" data-action="story-want" data-id="${s.id}" aria-pressed="${want}">${icon(want ? 'check' : 'plus')}<span>${want ? 'On my list' : 'Want to go'}</span></button>` : ''}${stLinks(s)}</div>${
    s.comments.length
      ? `<ul class="st-comments">${s.comments.map((c) => `<li><strong>${esc(c.by)}</strong> ${esc(c.text)}</li>`).join('')}</ul>`
      : ''
  }</div></article>`;
}

function stDayHtml(day, max) {
  let html = `<header class="st-day" id="st-day-${day.i}" data-day="${day.i}" style="--day:${stColor(day.i)}"><span class="eyebrow">Day ${day.i + 1} · ${stDate(day.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span><h3>${esc(day.title)}</h3><p>${esc(day.city)} · ${day.places} places · ${stDur(day.mins)} at places</p></header>`;
  day.rows.forEach((r, i) => {
    const prev = day.rows[i - 1];
    if (prev && !r.leg && !prev.leg) {
      const gap = stMins(r.in) - stMins(prev.out);
      if (gap > 0) html += `<p class="st-gap">${stDur(gap)} to the next stop</p>`;
    }
    html += r.leg
      ? `<div class="st-leg">${icon('train')}<div><strong>${esc(r.name)}</strong><span>${r.in} to ${r.out} · ${stDur(r.mins)}</span>${r.note ? `<p>${esc(r.note)}</p>` : ''}</div></div>`
      : stStopHtml(r, max);
  });
  return html;
}

function stStamp(c, date, i) {
  const tilt = [-7, 5, -3, 8][i % 4];
  return `<svg class="st-stamp ${i % 2 ? 'alt' : ''}" viewBox="0 0 120 120" style="--tilt:${tilt}deg" role="img" aria-label="${esc(c.name)} stamp, ${esc(date)}"><circle cx="60" cy="60" r="54" /><circle cx="60" cy="60" r="46" class="thin" /><path id="st-arc-${c.id}" d="M22 60a38 38 0 0 1 76 0" fill="none" stroke="none" /><text class="rim"><textPath href="#st-arc-${c.id}" startOffset="50%" text-anchor="middle">ROAM · ${esc(c.country.toUpperCase())}</textPath></text><text x="60" y="68" text-anchor="middle" class="city">${esc(c.name.toUpperCase())}</text><text x="60" y="86" text-anchor="middle" class="date">${esc(date.toUpperCase())}</text></svg>`;
}

// The journey in one line: each city in order with its days. Sits on the cover photo.
function stRibbon(m) {
  const legs = m.cityIds.map((cid) => {
    const ds = m.stops.filter((s) => s.cityId === cid).map((s) => s.day + 1),
      a = Math.min(...ds),
      b = Math.max(...ds);
    return {
      name: C[cid].name,
      days: a === b ? `Day ${a}` : `Days ${a}–${b}`,
      color: stColor(a - 1),
    };
  });
  return `<ol class="st-ribbon" aria-label="Route: ${legs.map((l) => esc(l.name)).join(', then ')}">${legs.map((l, i) => `<li style="--day:${l.color};--i:${i}"><i></i><strong>${esc(l.name)}</strong><span>${l.days}</span></li>`).join('')}</ol>`;
}
// A small drawing of one day's route with the current stop picked out.
function stMiniRoute(dayStops, cur) {
  const W = 140,
    H = 100,
    pad = 16,
    k = Math.cos((dayStops[0].lat * Math.PI) / 180);
  const xs = dayStops.map((s) => s.lon * k),
    ys = dayStops.map((s) => -s.lat);
  const x0 = Math.min(...xs),
    y0 = Math.min(...ys),
    dx = Math.max(...xs) - x0,
    dy = Math.max(...ys) - y0;
  const sc = Math.min((W - 2 * pad) / (dx || 1e-9), (H - 2 * pad) / (dy || 1e-9), 4e4);
  const pt = (i) => [(W - dx * sc) / 2 + (xs[i] - x0) * sc, (H - dy * sc) / 2 + (ys[i] - y0) * sc];
  const pts = dayStops.map((_, i) => pt(i).map((v) => v.toFixed(1)));
  return `<svg class="st-mini" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline points="${pts.map((q) => q.join(',')).join(' ')}" />${dayStops
    .map((s, i) =>
      s.i === cur
        ? ''
        : `<circle ${cur < 0 ? 'class="on" ' : ''}cx="${pts[i][0]}" cy="${pts[i][1]}" r="${cur < 0 ? 7 : 4}" />${cur < 0 ? `<text x="${pts[i][0]}" y="${pts[i][1]}" dy="3">${s.n}</text>` : ''}`,
    )
    .join('')}${dayStops
    .map((s, i) =>
      s.i === cur
        ? `<circle class="on" cx="${pts[i][0]}" cy="${pts[i][1]}" r="9" /><text x="${pts[i][0]}" y="${pts[i][1]}" dy="3.5">${s.n}</text>`
        : '',
    )
    .join('')}</svg>`;
}

function renderStory(id) {
  const m = storyModel(id);
  if (!m) {
    $('#app').innerHTML =
      `<div class="wrap"><section class="empty"><h1>This story isn't here.</h1><p class="muted">The link may be old, or the story is no longer shared with you.</p><a class="btn" href="#/">Start exploring</a></section></div>`;
    return;
  }
  storyNow = m;
  m.layout = stStacked() ? stLayout() : 'now';
  headerActive('trip');
  const { st, stops, days } = m;
  document.title = `${st.title} · Roam Atlas`;
  const first = days[0].date,
    last = days[days.length - 1].date;
  const range = `${stDate(first, { day: 'numeric', month: 'short' })} to ${stDate(last, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const max = 180;
  const cityMins = m.cityIds.map((cid) => ({
    c: C[cid],
    mins: stops.filter((s) => s.cityId === cid).reduce((a, s) => a + s.mins, 0),
    date: days[stops.find((s) => s.cityId === cid).day].date,
  }));
  const topMins = Math.max(...cityMins.map((x) => x.mins));
  const longest = [...stops].sort((a, b) => b.mins - a.mins).slice(0, 5);
  const seen = st.travellers.length + st.viewers.length;
  $('#app').innerHTML =
    `<div class="wrap story-page" data-layout="${m.layout}"><section class="shared-hero story-hero">${photoTag(st.cover, '', false)}<div class="shared-hero-copy">${st.sample ? '<span class="st-sample">Sample story</span>' : ''}<h1>${esc(st.title)}</h1><p>${esc(range)} · ${esc(st.blurb)}</p><div class="st-people">${st.travellers.map((t) => stAvatar(t)).join('')}<span>${st.travellers.map((t) => esc(t.name)).join(', ')}</span></div>${stRibbon(m)}</div><span class="hero-credit">${photoCredit(st.cover)}</span></section>` +
    `<div class="st-facts"><div><strong>${days.length}</strong><span>days</span></div><div><strong>${m.cityIds.length}</strong><span>cities</span></div><div><strong>${stops.length}</strong><span>places</span></div><div><strong>${Math.round(m.km / 10) * 10}</strong><span>km between stops</span></div><button class="st-lock" data-action="story-audience">${icon('info')}<span>Only ${seen} people can see this</span></button></div>` +
    (st.sample
      ? `<div class="st-proto" id="st-proto"><strong>Try a phone layout</strong><div class="chips">${ST_LAYOUTS.map(([k, label]) => `<button class="chip ${k === m.layout ? 'active' : ''}" data-action="story-layout" data-id="${k}" aria-pressed="${k === m.layout}">${label}</button>`).join('')}</div></div>`
      : '') +
    `<div class="story-layout"><div class="story-mapcol"><div class="story-mapbox"><div id="story-map" aria-label="Map of the trip route"></div><button class="st-expand" data-action="story-expand" aria-expanded="false">${icon('expand')}<span>Open map</span></button><div class="story-maptools"><button class="btn small" data-action="story-play" id="story-play" aria-pressed="false">${icon('route')}<span>${m.layout === 'tap' ? 'Tap through the trip' : 'Play the trip'}</span></button><span class="story-now" id="story-now" aria-live="polite"></span></div></div><div class="chips story-days" id="story-days"><button class="chip active" data-action="story-day" data-id="all">Whole trip</button>${days.map((d) => `<button class="chip" data-action="story-day" data-id="${d.i}"><i class="st-dot" style="--day:${stColor(d.i)}"></i>Day ${d.i + 1}</button>`).join('')}</div></div>` +
    `<div class="story-timeline" id="story-timeline">${days.map((d) => stDayHtml(d, max)).join('')}</div></div>` +
    `<section class="st-after"><div class="st-panel"><h2>Where the time went</h2><div class="st-citybars">${cityMins.map((x) => `<div class="st-citybar"><span>${esc(x.c.name)}</span><i style="--w:${Math.round((x.mins / topMins) * 100)}%"></i><em>${stDur(x.mins)}</em></div>`).join('')}</div><h3>Longest stops</h3><ol class="st-longest">${longest.map((s) => `<li><button class="inline-link" data-action="story-goto" data-i="${s.i}">${esc(s.name)}</button><span>${stDur(s.mins)}</span></li>`).join('')}</ol></div>` +
    `<div class="st-panel"><h2>What this trip left behind</h2><p class="muted">${esc(st.country)} is now filled in on ${st.travellers.length} maps, and each traveller's passport has ${cityMins.length} new stamps.</p><div class="st-stamps">${cityMins.map((x, i) => stStamp(x.c, stDate(x.date, { day: 'numeric', month: 'short', year: 'numeric' }), i)).join('')}</div><p class="filter-note">A preview. Maps and passports arrive in a later step.</p></div></section>` +
    (st.sample
      ? `<p class="st-samplenote">${icon('info')} This is a sample. The travellers and their notes are made up, and Roam's own photos stand in for theirs. Loves and your want-to-go list are saved on this device only.</p>`
      : '') +
    footer() +
    '</div>';
  storyMapInit(m);
  storyWatch();
}

function storyMapInit(m) {
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  storyMap = L.map('story-map', {
    zoomControl: !isMobile(),
    minZoom: 2,
    maxZoom: 18,
    attributionControl: true,
    scrollWheelZoom: false,
  });
  storyMap.createPane('offline-outline');
  storyMap.getPane('offline-outline').style.zIndex = '150';
  L.geoJSON(DATA.world, {
    pane: 'offline-outline',
    style: outlineStyle(),
    interactive: false,
  }).addTo(storyMap);
  if (S.street && navigator.onLine) storyTiles();
  const pts = m.stops.map((s) => [s.lat, s.lon]);
  // One line per day, so the day being read stands out from the rest of the route.
  L.polyline(pts, { color: '#6b7a78', weight: 2, opacity: 0.55, dashArray: '2 7' }).addTo(storyMap);
  m.lines = m.days.map((d) =>
    L.polyline(
      m.stops.filter((s) => s.day === d.i).map((s) => [s.lat, s.lon]),
      { color: stColor(d.i), weight: 3, opacity: 0.95, lineJoin: 'round' },
    ).addTo(storyMap),
  );
  m.markers = m.stops.map((s) =>
    L.marker([s.lat, s.lon], {
      title: `Day ${s.day + 1}, stop ${s.n}: ${s.name}`,
      keyboard: false,
      icon: L.divIcon({
        className: '',
        html: `<div class="st-pin" data-pin="${s.i}" style="--day:${stColor(s.day)}">${s.n}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    })
      .on('click', () => {
        if ($('.story-mapcol.open')) storyExpand(false);
        storyGoto(s.i);
      })
      .addTo(storyMap),
  );
  m.calm = calm;
  m.bounds = L.latLngBounds(pts);
  storyFitAll(false);
  storyCityLabels(m);
  // In the photos-first layout the map is a thin strip: a tap anywhere on it opens it.
  storyMap.on('click', () => {
    if (m.layout === 'photo' && !$('.story-mapcol.open')) storyExpand(true);
  });
  setTimeout(() => {
    if (!storyMap) return;
    storyMap.invalidateSize();
    if (storyNow === m && m.active < 0) storyFitAll(false);
  }, 120);
}

// Street tiles with English labels everywhere. OpenStreetMap's own tiles label places in the local
// script, so they are only the fallback if the English ones fail to load.
function storyTiles() {
  const osm = () =>
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      maxZoom: 19,
      updateWhenIdle: true,
    });
  const english = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    {
      attribution:
        'Tiles © <a href="https://www.esri.com/">Esri</a> and its data providers, including OpenStreetMap contributors',
      maxZoom: 19,
      updateWhenIdle: true,
    },
  );
  let failed = 0,
    loaded = 0;
  english.on('tileload', () => loaded++);
  english.on('tileerror', () => {
    if (++failed < 4 || loaded || !storyMap) return;
    english.off('tileerror');
    storyMap.removeLayer(english);
    osm().addTo(storyMap);
  });
  english.addTo(storyMap);
}
// City labels for the zoomed-out view, where single stops are too close together to tell apart.
function storyCityLabels(m) {
  // Cities close enough to overlap at this zoom (Kyoto, Nara, Osaka) share one label.
  const groups = [];
  m.cityIds.forEach((cid) => {
    const mine = m.stops.filter((s) => s.cityId === cid),
      at = { lat: mine[0].lat, lon: mine[0].lon },
      g = groups.find((o) => stKm(o.at, at) < 120);
    if (g) (g.names.push(C[cid].name), g.mine.push(...mine));
    else groups.push({ at, names: [C[cid].name], mine: [...mine] });
  });
  groups.forEach((g) => {
    const ds = g.mine.map((s) => s.day + 1),
      a = Math.min(...ds),
      b = Math.max(...ds),
      lat = g.mine.reduce((t, s) => t + s.lat, 0) / g.mine.length,
      lon = g.mine.reduce((t, s) => t + s.lon, 0) / g.mine.length;
    L.marker([lat, lon], {
      keyboard: false,
      icon: L.divIcon({
        className: '',
        html: `<div class="st-citydot" style="--day:${stColor(g.mine[0].day)}"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
      zIndexOffset: 2000,
    })
      .bindTooltip(
        `<strong>${esc(g.names.join(' · '))}</strong> ${a === b ? `Day ${a}` : `Days ${a}–${b}`} · ${g.mine.length} places`,
        {
          permanent: true,
          direction: 'top',
          offset: [0, -8],
          className: 'st-citytip',
          interactive: true,
        },
      )
      .on('click', () => storyCity(g))
      .addTo(storyMap);
  });
  const far = () => $('.story-mapbox')?.classList.toggle('far', storyMap.getZoom() < 10);
  storyMap.on('zoomend', far);
  far();
}
function storyCity(g) {
  storyPlay(false);
  storyNow.hold = Date.now() + 1200;
  storyMap.fitBounds(L.latLngBounds(g.mine.map((s) => [s.lat, s.lon])), {
    padding: [36, 36],
    maxZoom: 14,
    animate: !storyNow.calm,
  });
}
// The stop nearest the reading line becomes the active one, and the map follows it.
function storyWatch() {
  const m = storyNow;
  m.active = -1;
  if (m.layout === 'map') {
    // Cards sit in a sideways row here, so the one in the middle of the row is the active one.
    m.io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).pop();
        if (hit && Date.now() > (m.hold || 0)) storyActive(Number(hit.target.dataset.i));
      },
      { root: $('#story-timeline'), threshold: 0.6 },
    );
    $$('.st-stop').forEach((el) => m.io.observe(el));
    return;
  }
  m.io = new IntersectionObserver(
    (entries) => {
      const hit = entries.filter((e) => e.isIntersecting).pop();
      if (hit && window.scrollY > 40 && Date.now() > (m.hold || 0))
        storyActive(Number(hit.target.dataset.i));
    },
    {
      rootMargin: matchMedia('(max-width: 900px)').matches
        ? '-50% 0px -38% 0px'
        : '-42% 0px -50% 0px',
    },
  );
  $$('.st-stop').forEach((el) => m.io.observe(el));
}
function storyActive(i, zoom = true) {
  const m = storyNow;
  if (!m || !storyMap || i === m.active) return;
  m.active = i;
  const s = m.stops[i];
  $$('.st-stop.active').forEach((el) => el.classList.remove('active'));
  $('#st-stop-' + i)?.classList.add('active');
  $$('.st-pin.active').forEach((el) => el.classList.remove('active'));
  $(`.st-pin[data-pin="${i}"]`)?.classList.add('active');
  m.markers.forEach((mk, k) => mk.setZIndexOffset(k === i ? 1000 : 0));
  storyDayLines(s.day);
  const now = $('#story-now');
  if (now) now.textContent = `Day ${s.day + 1}, stop ${s.n} · ${s.name}`;
  $$('#story-days .chip').forEach((c) =>
    c.classList.toggle('active', c.dataset.id === String(s.day)),
  );
  storyChipIntoView();
  if (!zoom || Date.now() < (m.hold || 0)) return;
  clearTimeout(m.fly);
  m.fly = setTimeout(() => {
    if (!storyMap) return;
    const far =
      storyMap.getZoom() < 12 || storyMap.distance(storyMap.getCenter(), [s.lat, s.lon]) > 9000;
    if (m.calm || !far)
      storyMap.setView([s.lat, s.lon], Math.max(storyMap.getZoom(), 13), { animate: !m.calm });
    else storyMap.flyTo([s.lat, s.lon], 13, { duration: 0.9 });
  }, 140);
}
function storyDayLines(day) {
  storyNow.lines.forEach((l, k) =>
    l.setStyle(
      day < 0 || k === day
        ? { weight: day < 0 ? 3 : 4, opacity: 0.95 }
        : { weight: 2, opacity: 0.3 },
    ),
  );
  $$('.st-pin').forEach((el) =>
    el.classList.toggle('dim', day >= 0 && storyNow.stops[Number(el.dataset.pin)].day !== day),
  );
}
// Keeps the active day chip visible in its sideways-scrolling row without moving the page.
function storyChipIntoView() {
  const row = $('#story-days'),
    chip = row?.querySelector('.chip.active');
  if (chip) row.scrollTo({ left: chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2 });
}
// Scrolls so the element sits just under the pinned map on small screens, or mid-screen beside it.
function storyScroll(el) {
  if (!el) return;
  if (storyNow?.layout === 'map') {
    const row = $('#story-timeline');
    row.scrollTo({
      left: el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2,
      behavior: storyNow.calm ? 'auto' : 'smooth',
    });
    return;
  }
  const r = el.getBoundingClientRect(),
    stacked = stStacked();
  const offset = stacked
    ? $('.story-mapcol').getBoundingClientRect().bottom + 12
    : Math.max(110, (innerHeight - r.height) / 2);
  window.scrollTo({
    top: r.top + window.scrollY - offset,
    behavior: storyNow?.calm ? 'auto' : 'smooth',
  });
}
function storyGoto(i) {
  storyScroll($('#st-stop-' + i));
  storyActive(i);
  // Stops the cards scrolling past from stealing the highlight on the way there.
  storyNow.hold = Date.now() + 1200;
}
// Whole-trip view, with room left around the route for the city labels and the play button.
function storyFitAll(animate) {
  storyMap.fitBounds(storyNow.bounds, {
    paddingTopLeft: [64, 48],
    paddingBottomRight: [64, 62],
    animate,
  });
}
function storyDay(id) {
  const m = storyNow;
  if (!m || !storyMap) return;
  storyPlay(false);
  $$('#story-days .chip').forEach((c) => c.classList.toggle('active', c.dataset.id === id));
  if (id === 'all') {
    m.active = -1;
    $$('.st-stop.active, .st-pin.active').forEach((el) => el.classList.remove('active'));
    $('#story-now').textContent = '';
    storyDayLines(-1);
    storyFitAll(!m.calm);
    return;
  }
  const dayStops = m.stops.filter((s) => s.day === Number(id));
  m.hold = Date.now() + 1500;
  clearTimeout(m.fly);
  storyActive(dayStops[0].i, false);
  storyMap.fitBounds(L.latLngBounds(dayStops.map((s) => [s.lat, s.lon])), {
    padding: [40, 40],
    maxZoom: 14,
    animate: !m.calm,
  });
  storyChipIntoView();
  storyScroll($('#st-day-' + id));
}
// Play walks through every stop in order, like someone telling the trip.
function storyPlay(on) {
  const m = storyNow;
  if (!m) return;
  clearInterval(m.timer);
  m.timer = null;
  const b = $('#story-play');
  if (b) {
    b.setAttribute('aria-pressed', String(on));
    b.querySelector('span').textContent = on
      ? 'Pause'
      : m.layout === 'tap'
        ? 'Tap through the trip'
        : 'Play the trip';
  }
  if (!on) return;
  let i = m.active >= m.stops.length - 1 ? 0 : Math.max(0, m.active);
  storyGoto(i);
  m.timer = setInterval(() => {
    if (i >= m.stops.length - 1) return storyPlay(false);
    storyGoto(++i);
  }, 3200);
}
// Photos-first layout: the map is a thin strip until it is opened to fill the screen.
function storyExpand(on) {
  const col = $('.story-mapcol'),
    b = $('.st-expand');
  if (!col || !b) return;
  col.classList.toggle('open', on);
  b.setAttribute('aria-expanded', String(on));
  b.innerHTML = `${icon(on ? 'close' : 'expand')}<span>${on ? 'Close map' : 'Open map'}</span>`;
  document.body.classList.toggle('st-noscroll', on);
  setTimeout(() => {
    if (!storyMap) return;
    storyMap.invalidateSize();
    if (storyNow.active < 0) storyFitAll(false);
    else {
      const s = storyNow.stops[storyNow.active];
      storyMap.setView([s.lat, s.lon], Math.max(storyMap.getZoom(), 13), { animate: false });
    }
  }, 60);
}
function storyLayout(id) {
  const m = storyNow;
  try {
    localStorage.setItem(LAYOUT_KEY, id);
  } catch {}
  history.replaceState(null, '', `#/story/${m.id}/${id}`);
  const trip = m.id;
  storyLeave();
  renderStory(trip);
  const top = $('#st-proto').getBoundingClientRect().top + scrollY - 62;
  scrollTo({ top, behavior: 'instant' });
  if (id === 'tap') storyTap(0);
}
// Tap-through: one full screen per day and per stop, like flicking through someone's photos.
function storyTap(k) {
  const m = storyNow;
  if (!m) return;
  if (k < 0) k = 0;
  if (k >= m.slides.length) {
    storyTapClose();
    $('.st-after')?.scrollIntoView({ block: 'start' });
    return;
  }
  m.tap = k;
  let el = $('.st-tap');
  if (!el) {
    el = document.createElement('div');
    el.className = 'st-tap';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'The trip, one stop at a time');
    document.body.append(el);
    document.body.classList.add('st-noscroll');
    m.tapFocus = document.activeElement;
  }
  const { day, stop } = m.slides[k];
  const mine = m.slides.filter((x) => x.day === day),
    at = mine.indexOf(m.slides[k]);
  const dayStops = m.stops.filter((s) => s.day === day.i);
  const shot = stop ? stop.photos[0] : dayStops.flatMap((s) => s.photos)[0];
  const date = stDate(day.date, { weekday: 'short', day: 'numeric', month: 'short' });
  const copy = stop
    ? `<p class="st-tap-when"><b class="st-num">${stop.n}</b>${stop.in} · ${stDur(stop.mins)} here</p><h2>${esc(stop.name)}</h2><p class="st-tap-area">${esc(stop.area)}</p>${stop.note ? `<p class="st-tap-note">${esc(stop.note)}</p>` : ''}<p class="st-tap-by">${stAvatar(shot ? shot.by : stop.by, 'tiny')} ${shot ? esc(shot.caption) : 'Logged by ' + esc(stop.by.name)}</p><div class="st-tap-acts"><button class="st-act" data-action="story-tap-details" data-i="${stop.i}">${icon('list')}<span>Details</span></button>${stLinks(stop)}</div>`
    : `<p class="st-tap-when">Day ${day.i + 1} of ${m.days.length} · ${date}</p><h2>${esc(day.title)}</h2><p class="st-tap-area">${esc(day.city)} · ${day.places} places · ${stDur(day.mins)} at places</p><ol class="st-tap-list">${dayStops.map((s) => `<li><b class="st-num">${s.n}</b>${esc(s.name)}</li>`).join('')}</ol>`;
  el.style.setProperty('--day', stColor(day.i));
  el.innerHTML =
    `<div class="st-tap-bg ${shot ? '' : 'plain'}">${shot ? photoTag(shot.id, '', false) : ''}</div>` +
    `<button class="st-tap-zone prev" data-action="story-tap-prev" aria-label="Back"></button><button class="st-tap-zone next" data-action="story-tap-next" aria-label="Next"></button>` +
    `<div class="st-tap-top"><div class="st-tap-bars">${mine.map((_, i) => `<i class="${i <= at ? 'on' : ''}"></i>`).join('')}</div><div class="st-tap-head"><span>${stop ? `Day ${day.i + 1} · ${esc(day.title)}` : esc(m.st.title)}</span><button class="st-tap-x" data-action="story-tap-close" aria-label="Close">${icon('close')}</button></div></div>` +
    `<div class="st-tap-route ${stop ? '' : 'big'}">${stMiniRoute(dayStops, stop ? stop.i : -1)}</div>` +
    `<div class="st-tap-copy">${copy}</div>`;
  $('.st-tap-x').focus({ preventScroll: true });
}
function storyTapClose() {
  const el = $('.st-tap');
  if (!el) return;
  el.remove();
  document.body.classList.remove('st-noscroll');
  storyNow?.tapFocus?.focus?.({ preventScroll: true });
}
function storyAudience() {
  const { st } = storyNow;
  showModal(
    `<div class="modalcontent"><h2 id="modal-heading">Who can see this trip</h2><p class="lead">The travellers decide together, and nobody else can open it.</p><ul class="st-rules"><li><strong>Travellers:</strong> ${st.travellers.map((t) => esc(t.name)).join(', ')}.</li><li><strong>Invited viewers:</strong> ${st.viewers.map(esc).join(', ')}. Each one was approved by every traveller.</li><li>A trip starts visible to its travellers only.</li><li>Opening it up needs a yes from everyone. Any one traveller can close it again at once.</li><li>Any traveller can hide a photo from viewers.</li><li>There are no public links.</li></ul><p class="filter-note">In this sample the people are made up. The rules are the ones Roam will use.</p><div class="actions"><button class="btn" data-action="close-modal">Got it</button></div></div>`,
    'Who can see this trip',
  );
}
function storyLove(i, b) {
  const set = stLoves(),
    key = storyNow.id + ':' + i;
  set.has(key) ? set.delete(key) : set.add(key);
  try {
    localStorage.setItem(LOVES_KEY, JSON.stringify([...set]));
  } catch {}
  const on = set.has(key);
  b.classList.toggle('on', on);
  b.setAttribute('aria-pressed', String(on));
  b.querySelector('span').textContent = storyNow.stops[i].loves + (on ? 1 : 0);
}
function storyWant(id) {
  toggleSave(id);
  const on = saved(id);
  $$(`[data-action="story-want"][data-id="${id}"]`).forEach((b) => {
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
    b.innerHTML = `${icon(on ? 'check' : 'plus')}<span>${on ? 'On my list' : 'Want to go'}</span>`;
  });
}
// Called by the router before every page change.
function storyLeave() {
  if (storyNow) {
    clearInterval(storyNow.timer);
    clearTimeout(storyNow.fly);
    storyNow.io?.disconnect();
  }
  $('.st-tap')?.remove();
  document.body.classList.remove('st-noscroll');
  storyMap?.remove();
  storyMap = null;
  storyNow = null;
}
function storyTeaser() {
  const id = Object.keys(STORIES)[0],
    st = STORIES[id];
  if (!st) return '';
  return `<a class="story-teaser" href="#/story/${id}">${photoTag(st.cover)}<div><span class="eyebrow">New · Trip stories</span><strong>See a trip tell itself</strong><span>The route, the time at each place and a few picked photos. Open the sample from Japan.</span></div>${icon('arrow')}</a>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action^="story-"]');
  if (!b || !storyNow) return;
  const a = b.dataset.action;
  if (a === 'story-play') {
    if (storyNow.layout === 'tap') {
      const k = storyNow.slides.findIndex((x) => x.stop?.i === storyNow.active);
      storyTap(Math.max(0, k));
    } else storyPlay(!storyNow.timer);
  } else if (a === 'story-layout') storyLayout(b.dataset.id);
  else if (a === 'story-expand') storyExpand(!$('.story-mapcol').classList.contains('open'));
  else if (a === 'story-tap-next') storyTap(storyNow.tap + 1);
  else if (a === 'story-tap-prev') storyTap(storyNow.tap - 1);
  else if (a === 'story-tap-close') storyTapClose();
  else if (a === 'story-tap-details') {
    storyTapClose();
    storyGoto(Number(b.dataset.i));
  } else if (a === 'story-day') storyDay(b.dataset.id);
  else if (a === 'story-goto') {
    if ($('.story-mapcol.open')) storyExpand(false);
    storyGoto(Number(b.dataset.i));
  } else if (a === 'story-audience') storyAudience();
  else if (a === 'story-love') storyLove(Number(b.dataset.i), b);
  else if (a === 'story-want') storyWant(b.dataset.id);
  else if (a === 'story-photo') openViewer(b.dataset.id, 0);
});
// Any deliberate scroll or key press hands control back from Play.
for (const ev of ['wheel', 'touchmove', 'keydown'])
  window.addEventListener(
    ev,
    (e) => {
      if (storyNow?.timer && !e.target.closest?.('#story-play')) storyPlay(false);
    },
    { passive: true },
  );
// Arrow keys and Escape drive the tap-through view.
window.addEventListener('keydown', (e) => {
  if (!storyNow || !$('.st-tap')) return;
  if (e.key === 'ArrowRight') storyTap(storyNow.tap + 1);
  else if (e.key === 'ArrowLeft') storyTap(storyNow.tap - 1);
  else if (e.key === 'Escape') storyTapClose();
});
