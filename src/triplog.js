// Logging your own trip as it happens (#/log). This is the real thing, not the sample on the
// story page: it uses the phone's clock, asks for the phone's location only when you tap, and
// keeps every stop on this phone (localStorage), so it works with no signal. Until accounts
// arrive there is no group to send to, so "for all of you" waits for that.
//   - "I'm here" logs the suggested place with the time now and closes the stop before it
//   - "Somewhere else" searches the trip's cities, nearest first, or adds a place by name
//   - any stop can be fixed (times, a note) or removed, and each change can be undone
// The location is used once to suggest a place, then dropped. No trail is kept.
const TL_KEY = 'roam-trip-log';
const TL_MAX = 3000;
const TL_NEAR_KM = 0.6;
let TL = null,
  tlLastPos = null;

const tlStr = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const tlTime = (v) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : '');
const tlNum = (v, lim) => (Number.isFinite(Number(v)) && Math.abs(v) <= lim ? Number(v) : null);
function tlClean(s) {
  const date = validDate(s?.date) ? s.date : '',
    tin = tlTime(s?.in),
    place = validPlace(s?.place) ? s.place : '',
    p = place ? P[place] : null,
    lat = p ? p.lat : tlNum(s?.lat, 90),
    lon = p ? p.lon : tlNum(s?.lon, 180),
    name = p ? p.name : tlStr(s?.name, 60);
  if (!date || !tin || !name || lat === null || lon === null) return null;
  let out = tlTime(s.out);
  if (out && stMins(out) <= stMins(tin)) out = '';
  return {
    uid: typeof s.uid === 'string' && /^[a-z0-9-]{1,40}$/.test(s.uid) ? s.uid : tlUid(),
    date,
    in: tin,
    out,
    left: s.left === true && Boolean(out),
    est: s.est === true,
    place,
    name,
    area: p ? p.area || '' : tlStr(s.area, 60),
    city: p ? p.cityId : validCity(s.city) ? s.city : '',
    lat,
    lon,
    note: tlStr(s.note, 600),
    photos: (Array.isArray(s.photos) ? s.photos : [])
      .filter((x) => TLP_ID.test(x?.id))
      .slice(0, TLP_MAX)
      .map((x) => ({ id: x.id, t: tlTime(x.t), caption: tlStr(x.caption, 140) })),
  };
}
const tlUid = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function tlRead() {
  try {
    const raw = JSON.parse(localStorage.getItem(TL_KEY) || 'null');
    const stops = (Array.isArray(raw?.stops) ? raw.stops : [])
      .slice(0, TL_MAX)
      .map(tlClean)
      .filter(Boolean);
    return { v: 1, stops: tlSort(stops) };
  } catch {
    return { v: 1, stops: [] };
  }
}
function tlWrite() {
  try {
    localStorage.setItem(TL_KEY, JSON.stringify(TL.log));
    return true;
  } catch {
    toast('This phone would not save the log. Free some space and try again.');
    return false;
  }
}
const tlSort = (list) =>
  list.sort((a, b) => a.date.localeCompare(b.date) || stMins(a.in) - stMins(b.in));
// The phone's own date and time, so a day in Kyoto is Kyoto's day.
const tlPad = (n) => String(n).padStart(2, '0');
const tlToday = (d = new Date()) =>
  `${d.getFullYear()}-${tlPad(d.getMonth() + 1)}-${tlPad(d.getDate())}`;
const tlNow = (d = new Date()) => `${tlPad(d.getHours())}:${tlPad(d.getMinutes())}`;
const tlDay = (date) => TL.log.stops.filter((s) => s.date === date);
const tlOpen = () => tlDay(tlToday()).findLast((s) => !s.out) || null;
const tlFresh = () => TL.pos && Date.now() - TL.pos.at < 10 * 60e3;

// A stop left open on an earlier day (the phone was put away) is closed an hour after it began.
function tlCloseOld() {
  const today = tlToday();
  let n = 0;
  for (const s of TL.log.stops)
    if (!s.out && s.date < today) {
      s.out = tlT(Math.min(stMins(s.in) + 60, 23 * 60 + 59));
      s.est = true;
      n++;
    }
  if (n) tlWrite();
}
const tlT = (m) => `${tlPad(Math.floor(m / 60))}:${tlPad(Math.round(m) % 60)}`;

// Which city you are in today: the plan's dates first, then where you last logged, then the
// trip city nearest the phone, then the first city of the trip.
function tlCityToday(date = tlToday()) {
  if (S.startDate) {
    const now = new Date(date + 'T12:00:00');
    for (const id of S.trip) {
      const a = cityArrivalDate(id),
        days = S.days[id] || C[id].days;
      if (a && now >= a && now < new Date(a.getTime() + (days + 1) * 864e5)) return id;
    }
  }
  const last = TL.log.stops.findLast((s) => s.city && s.date <= date);
  if (last && last.date === date) return last.city;
  const near = date === tlToday() && tlNearCities()[0];
  if (near) return near;
  return S.trip[0] || last?.city || '';
}
// Trip cities, nearest the phone first. With no trip planned, the nearest guide city.
function tlNearCities() {
  if (!tlFresh()) return [];
  const list = S.trip.length ? S.trip.map((id) => C[id]) : CITIES;
  return list
    .filter((c) => c.lat)
    .sort((a, b) => stKm(TL.pos, a) - stKm(TL.pos, b))
    .slice(0, S.trip.length ? 99 : 1)
    .map((c) => c.id);
}
// The places a stop can be: everything in the trip's cities (or today's city), with your
// saved places first when the phone's location is unknown.
function tlCandidates(date = tlToday()) {
  const here = date === tlToday(),
    ids = [
      ...new Set([tlCityToday(date), ...S.trip, ...(here ? tlNearCities() : [])].filter(Boolean)),
    ];
  const saved = new Set(S.saved),
    list = ids.flatMap((id) => C[id].items.map((x) => P[x.id]).filter((p) => p?.lat));
  if (here && tlFresh()) return list.sort((a, b) => stKm(TL.pos, a) - stKm(TL.pos, b));
  const city = tlCityToday(date);
  const rank = (p) => (p.cityId === city ? 0 : 2) + (saved.has(p.id) ? 0 : 1);
  return list.sort(
    (a, b) => rank(a) - rank(b) || (popularityRank(a) ?? 999) - (popularityRank(b) ?? 999),
  );
}
function tlSuggest() {
  const done = new Set(tlDay(tlToday()).map((s) => s.place)),
    open = tlOpen(),
    list = tlCandidates().filter((p) => !done.has(p.id) && p.id !== open?.place);
  if (tlFresh()) {
    const p = list[0];
    return p ? { p, km: stKm(TL.pos, p), near: stKm(TL.pos, p) <= TL_NEAR_KM } : null;
  }
  const city = tlCityToday(),
    p = list.find((x) => x.cityId === city && S.saved.includes(x.id));
  return p ? { p, plan: true } : null;
}
const tlKm = (km) =>
  km < 1 ? Math.max(10, Math.round(km * 100) * 10) + ' m' : km.toFixed(km < 10 ? 1 : 0) + ' km';

function renderTripLog(day) {
  headerActive('trip');
  document.title = 'Log the trip · Tandem Roads';
  TL = { log: tlRead(), day: validDate(day) ? day : tlToday(), pos: tlLastPos };
  tlCloseOld();
  tlpTidy(TL.log.stops);
  $('#app').innerHTML =
    `<div class="wrap story-page log-page tl-page"><header class="lg-head"><a class="inline-link" href="#/trip">${icon('left')}<span>Your trip</span></a><h1>Log the trip</h1><p class="muted">Tap "I'm here" when you arrive somewhere. It is saved on this phone straight away, signal or not.</p></header>` +
    `<div class="story-layout"><div class="story-mapcol"><div class="story-mapbox"><div id="tl-map" aria-label="Map of the places logged"></div></div><div class="chips story-days" id="tl-days" role="tablist"></div></div>` +
    `<div class="story-timeline lg-panel" id="tl-panel"></div></div>${footer()}</div>`;
  const map = (TL.map = L.map('tl-map', {
    zoomControl: !isMobile(),
    minZoom: 2,
    maxZoom: 18,
    scrollWheelZoom: false,
  }));
  map.createPane('offline-outline');
  map.getPane('offline-outline').style.zIndex = '150';
  L.geoJSON(DATA.world, {
    pane: 'offline-outline',
    style: outlineStyle(),
    interactive: false,
  }).addTo(map);
  if (S.street && navigator.onLine) storyTiles(map);
  const credit = map.attributionControl.getContainer();
  credit.classList.add('st-credit');
  L.DomEvent.disableClickPropagation(credit);
  credit.addEventListener('click', (e) => {
    if (!e.target.closest('a')) credit.classList.toggle('open');
  });
  TL.layer = L.layerGroup().addTo(map);
  const c = C[tlCityToday()];
  map.setView(c ? [c.lat, c.lon] : [30, 10], c ? 12 : 2);
  tlShow();
  setTimeout(() => TL?.map === map && (map.invalidateSize(), tlMap()), 120);
}
function tripLogLeave() {
  TL?.map?.remove();
  tlLastPos = TL?.pos || tlLastPos;
  TL = null;
}
function tlShow() {
  const today = tlToday(),
    dates = [...new Set([today, ...TL.log.stops.map((s) => s.date)])].sort().reverse();
  if (!dates.includes(TL.day)) TL.day = today;
  $('#tl-days').innerHTML = dates
    .map(
      (d) =>
        `<button class="chip ${d === TL.day ? 'active' : ''}" role="tab" aria-selected="${d === TL.day}" data-action="tl-day" data-id="${d}">${d === today ? 'Today' : esc(stDate(d, { weekday: 'short', day: 'numeric', month: 'short' }))}</button>`,
    )
    .join('');
  $('#tl-panel').innerHTML = TL.catch
    ? tlCatchHtml()
    : (TL.day === today ? tlNowHtml() : '') + tlListHtml(TL.day) + tlStoryDoor() + tlCatchDoor();
  tlpFill($('#tl-panel'));
  tlMap();
}

function tlNowHtml() {
  const open = tlOpen(),
    city = C[tlCityToday()],
    when = stDate(tlToday(), { weekday: 'short', day: 'numeric', month: 'short' });
  const clock = `<div class="lg-clock"><div><span class="eyebrow">${esc(when)}${city ? ' · ' + esc(city.name) : ''}</span><strong>${tlNow()}</strong></div><span class="tl-saved">${icon('check')} Saved on this phone</span></div>`;
  if (open)
    return (
      clock +
      `<section class="lg-card"><p class="lg-kicker">${icon('pin')} You are at</p><div class="lg-place">${lgThumb({ id: open.place })}<div><h2>${esc(open.name)}</h2><p class="muted">Since ${open.in}${open.area ? ' · ' + esc(open.area) : ''}</p></div></div>${tlStrip(open)}<div class="lg-row">${tlAddPhoto(open)}<button class="st-act" data-action="tl-fix" data-id="${open.uid}">${icon('pencil')}<span>${open.note ? 'Edit the note' : 'Add a note'}</span></button><button class="st-act" data-action="tl-left">${icon('route')}<span>We've left</span></button></div><button class="btn ghost tl-next" data-action="tl-else">${icon('pin')} Moved on? Log the next place</button><p class="filter-note">"We've left" is optional. Without it, the leaving time is the moment you log the next place.</p></section>`
    );
  const g = tlSuggest(),
    locBtn = `<button class="btn text" data-action="tl-locate">${icon('locate')} ${tlFresh() ? 'Check my location again' : 'Use my location'}</button>`;
  let card;
  if (g)
    card = `<section class="lg-card lg-here"><p class="lg-kicker">${icon(g.plan ? 'heart' : 'locate')} ${g.near ? 'You look close to' : g.plan ? 'Next on your plan' : `Nearest place we know, ${tlKm(g.km)} away`}</p><div class="lg-place">${lgThumb({ id: g.p.id })}<div><h2>${esc(g.p.name)}</h2><p class="muted">${esc(g.p.area || C[g.p.cityId].name)}</p></div></div><button class="btn lg-big" data-action="tl-here" data-id="${g.p.id}">${icon('pin')} I'm here</button><div class="lg-row tl-alt"><button class="btn text" data-action="tl-else">Somewhere else</button>${locBtn}</div></section>`;
  else
    card = `<section class="lg-card lg-here"><p class="lg-kicker">${icon('pin')} Where are you?</p><h2>Log the place you are at</h2><p class="muted">${S.trip.length ? 'Choose it from your trip’s cities, or add a place the guide does not have.' : 'No trip planned yet, so your location finds the nearest city in the guide. You can also add any place by name.'}</p><button class="btn lg-big" data-action="tl-else">${icon('pin')} I'm here</button><div class="lg-row tl-alt">${locBtn}</div></section>`;
  return (
    clock +
    card +
    `<p class="filter-note">Your location is asked for only when you tap, used once to suggest a place, then dropped. No trail is kept.</p>`
  );
}
function tlListHtml(date) {
  const list = tlDay(date),
    color = stColor(0);
  if (!list.length)
    return date === tlToday() ? '' : `<p class="lg-aside">Nothing logged on this day.</p>`;
  const mins = list.reduce((a, s) => a + (s.out ? stMins(s.out) - stMins(s.in) : 0), 0);
  return (
    `<h3 class="lg-sub">${date === tlToday() ? 'Today so far' : esc(stDate(date, { weekday: 'long', day: 'numeric', month: 'long' }))}<small>${list.length} ${list.length === 1 ? 'place' : 'places'}${mins ? ' · ' + stDur(mins) : ''}</small></h3>` +
    `<ol class="lg-list tl-list">${list
      .map(
        (s, i) =>
          `<li style="--day:${color}"><b class="st-num">${i + 1}</b><div><strong>${esc(s.name)}</strong><span>${s.out ? `${s.in} to ${s.est ? 'about ' : ''}${s.out} · ${lgSpan(s.in, s.out)}` : `${s.in}, here now`}${s.place ? '' : ' · added by you'}</span>${s.note ? `<p>${esc(s.note)}</p>` : ''}${tlStrip(s)}</div><button class="st-act" data-action="tl-fix" data-id="${s.uid}">Fix</button></li>`,
      )
      .join(
        '',
      )}</ol><p class="filter-note">Times marked "about" were worked out, not tapped. Fix any of them.</p>`
  );
}

// The map shows the day you are looking at: numbered pins joined in order, and a blue dot for
// the phone while its location is fresh. Nothing is drawn on top of the map.
function tlMap() {
  if (!TL?.map) return;
  const { map, layer } = TL,
    list = TL.catch ? tlCatchPins() : tlDay(TL.day),
    color = stColor(0),
    pts = list.map((s) => [s.lat, s.lon]);
  layer.clearLayers();
  if (pts.length > 1) L.polyline(pts, { color, weight: 3, opacity: 0.9 }).addTo(layer);
  list.forEach((s, i) =>
    L.marker([s.lat, s.lon], {
      title: s.name,
      keyboard: false,
      icon: L.divIcon({
        className: '',
        html: `<div class="st-pin" style="--day:${color}">${i + 1}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    }).addTo(layer),
  );
  if (tlFresh() && TL.day === tlToday()) {
    L.marker([TL.pos.lat, TL.pos.lon], {
      title: 'Where you are',
      keyboard: false,
      icon: L.divIcon({
        className: '',
        html: '<div class="lg-you"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
    }).addTo(layer);
    pts.push([TL.pos.lat, TL.pos.lon]);
  }
  if (!pts.length) return;
  if (pts.length === 1) return map.setView(pts[0], 15, { animate: false });
  map.fitBounds(L.latLngBounds(pts), {
    padding: [44, 44],
    maxZoom: 15,
    animate: !matchMedia('(prefers-reduced-motion: reduce)').matches,
  });
}

// Every change goes through here: snapshot, change, save, redraw, and offer to undo.
function tlChange(fn, msg) {
  const before = JSON.stringify(TL.log.stops);
  fn();
  tlSort(TL.log.stops);
  if (!tlWrite()) {
    TL.log.stops = JSON.parse(before);
    return tlShow();
  }
  tlShow();
  toast(msg, {
    label: 'Undo',
    run() {
      if (!TL) return;
      TL.log.stops = JSON.parse(before);
      tlWrite();
      tlShow();
    },
  });
}
function tlHere(stop) {
  const now = tlNow(),
    today = tlToday();
  tlChange(
    () => {
      const open = tlOpen();
      if (open) {
        // Logged within the same minute: a slip, so the new place replaces the open one.
        if (open.in === now) TL.log.stops.splice(TL.log.stops.indexOf(open), 1);
        else Object.assign(open, { out: now, est: false });
      }
      TL.log.stops.push(tlClean({ ...stop, uid: tlUid(), date: today, in: now, out: '' }));
      TL.day = today;
    },
    `${stop.name || P[stop.place]?.name} logged at ${now}.`,
  );
  if (stStacked()) window.scrollTo({ top: 0 });
}
const tlPlaceStop = (p) => ({ place: p.id });
function tlLocate() {
  if (!navigator.geolocation) return toast('This browser cannot share your location.');
  toast('Finding where you are…', null, 10000);
  navigator.geolocation.getCurrentPosition(
    (g) => {
      if (!TL) return;
      // Kept in memory only, for ten minutes, to suggest a place. Never saved.
      TL.pos = { lat: g.coords.latitude, lon: g.coords.longitude, at: Date.now() };
      $('.toast')?.remove();
      tlShow();
    },
    (e) => {
      if (!TL) return;
      toast(
        e.code === 1
          ? 'Location is off for this site. You can still choose the place yourself.'
          : 'Could not find your location. You can still choose the place yourself.',
      );
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
  );
}
// "Somewhere else": a search over the trip's cities, nearest first when the location is known.
// With `g`, it chooses the place for a catch-up group instead of logging one now.
function tlElse(g = -1) {
  const now = g < 0 && tlFresh();
  TL.picking = g;
  showModal(
    `<div class="modalcontent lg-modal tl-modal"><h2 id="modal-heading">${g < 0 ? 'Where are you?' : 'Where was this?'}</h2><p class="lead">${now ? 'Nearest first.' : 'Your saved places first, then the most visited.'}</p><input class="tl-search" type="search" placeholder="Search places" aria-label="Search places" autocomplete="off" maxlength="60"><ul class="lg-pick" id="tl-pick">${tlPickHtml('')}</ul><form class="lg-add tl-add"><label for="tl-newplace">Not listed? Add it yourself</label><div><input id="tl-newplace" maxlength="60" placeholder="Name of the place" autocomplete="off" required><button class="btn small">Add</button></div><p class="filter-note">${now ? 'It is pinned where you are standing.' : 'It is pinned in the middle of the city. You can move it later.'} Only you see it.</p></form></div>`,
    g < 0 ? 'Where are you?' : 'Where was this?',
  );
}
const tlPickDate = () => (TL.picking >= 0 ? TL.catch.groups[TL.picking].date : tlToday());
function tlPickHtml(q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean),
    open = TL.picking >= 0 ? '' : tlOpen()?.place,
    list = tlCandidates(tlPickDate())
      .filter((p) => p.id !== open)
      .filter((p) => words.every((w) => `${p.name} ${p.area || ''}`.toLowerCase().includes(w)))
      .slice(0, 30);
  if (!list.length) return `<li class="tl-none">No match in your trip’s cities. Add it below.</li>`;
  return list
    .map(
      (p) =>
        `<li><button data-action="tl-choose" data-id="${p.id}">${lgThumb({ id: p.id })}<span><strong>${esc(p.name)}</strong><small>${esc(p.area || C[p.cityId].name)}${TL.picking < 0 && tlFresh() ? ' · ' + tlKm(stKm(TL.pos, p)) : S.saved.includes(p.id) ? ' · saved' : ''}</small></span></button></li>`,
    )
    .join('');
}
function tlFix(uid) {
  const s = TL.log.stops.find((x) => x.uid === uid);
  if (!s) return;
  showModal(
    `<div class="modalcontent lg-modal tl-modal"><h2 id="modal-heading">${esc(s.name)}</h2><p class="lead">${esc(stDate(s.date, { weekday: 'long', day: 'numeric', month: 'long' }))}</p><form class="lg-times tl-fix" data-id="${s.uid}"><label>Arrived<input type="time" name="in" value="${s.in}" required></label><label>Left<input type="time" name="out" value="${s.out}" ${s.out ? 'required' : ''}></label><div class="tl-note tl-fixphotos"><span>Photos <small>${s.photos.length} of ${TLP_MAX}</small></span><div class="tl-strip">${s.photos.map((x) => `<span class="tl-shot">${tlpImg(x.id)}<button type="button" data-action="tl-unphoto" data-id="${s.uid}" data-k="${esc(x.id)}" aria-label="Remove this photo">${icon('close')}</button></span>`).join('')}</div>${tlAddPhoto(s)}</div><label class="tl-note">Note<textarea name="note" maxlength="600" rows="3" placeholder="What happened here?">${esc(s.note)}</textarea></label><div class="actions"><button class="btn">Save</button><button type="button" class="btn text tl-remove" data-action="tl-remove" data-id="${s.uid}">Remove this stop</button></div></form>${s.out ? '' : '<p class="filter-note">Leave "Left" empty while you are still here.</p>'}</div>`,
    'Fix the stop',
  );
  tlpFill($('.tl-modal'));
}
// A stop's photos as a row of small squares, and the button that adds more.
const tlStrip = (s) =>
  s.photos.length
    ? `<div class="tl-strip">${s.photos.map((x) => tlpImg(x.id)).join('')}</div>`
    : '';
const tlAddPhoto = (s) =>
  `<label class="st-act tl-addphoto ${s.photos.length >= TLP_MAX ? 'full' : ''}">${icon('camera')}<span>${s.photos.length ? `${s.photos.length} of ${TLP_MAX} photos` : 'Add a photo'}</span><input type="file" accept="image/*" multiple data-uid="${s.uid}" ${s.photos.length >= TLP_MAX ? 'disabled' : ''}></label>`;
async function tlPhotos(input) {
  const s = TL?.log.stops.find((x) => x.uid === input.dataset.uid),
    files = [...(input.files || [])];
  input.value = '';
  if (!s || !files.length) return;
  const room = TLP_MAX - s.photos.length;
  toast('Adding…', null, 20000);
  const kept = await tlpAdd(files, room);
  if (!TL) return;
  const fresh = TL.log.stops.find((x) => x.uid === s.uid);
  if (!kept.length || !fresh)
    return toast('That photo could not be added. Try another, or free some space.');
  const extra = files.length - room;
  closeModal('user');
  tlChange(
    () => fresh.photos.push(...kept.map((x) => ({ id: x.id, t: x.t, caption: '' }))),
    `${kept.length} ${kept.length === 1 ? 'photo' : 'photos'} added to ${fresh.name}.` +
      (extra > 0
        ? ` A stop holds ${TLP_MAX}, so ${extra} ${extra === 1 ? 'was' : 'were'} left out.`
        : ''),
  );
}

document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-action^="tl-"]');
  if (!b || !TL) return;
  const a = b.dataset.action;
  if (a === 'tl-day') {
    TL.day = b.dataset.id;
    TL.catch = null;
    history.replaceState(history.state, '', TL.day === tlToday() ? '#/log' : `#/log/${TL.day}`);
    tlShow();
  } else if (a === 'tl-here' && validPlace(b.dataset.id)) tlHere(tlPlaceStop(P[b.dataset.id]));
  else if (a === 'tl-else') tlElse();
  else if (a.startsWith('tl-c-')) tlCatchAction(a, b);
  else if (a === 'tl-locate') tlLocate();
  else if (a === 'tl-choose' && validPlace(b.dataset.id)) {
    closeModal('user');
    if (TL.picking >= 0) tlCatchPlace(tlPlaceStop(P[b.dataset.id]));
    else tlHere(tlPlaceStop(P[b.dataset.id]));
  } else if (a === 'tl-left') {
    const open = tlOpen();
    if (!open) return;
    const now = tlNow();
    if (open.in === now) return toast('You only just arrived. Fix the times if you need to.');
    tlChange(
      () => Object.assign(open, { out: now, left: true, est: false }),
      `Left ${open.name} at ${now}.`,
    );
  } else if (a === 'tl-fix') tlFix(b.dataset.id);
  else if (a === 'tl-unphoto') {
    const s = TL.log.stops.find((x) => x.uid === b.dataset.id);
    if (!s) return;
    closeModal('user');
    tlChange(() => (s.photos = s.photos.filter((x) => x.id !== b.dataset.k)), 'Photo removed.');
  } else if (a === 'tl-remove') {
    const s = TL.log.stops.find((x) => x.uid === b.dataset.id);
    if (!s) return;
    closeModal('user');
    tlChange(() => TL.log.stops.splice(TL.log.stops.indexOf(s), 1), `${s.name} removed.`);
  }
});
document.addEventListener('change', (ev) => {
  if (TL && ev.target.matches('.tl-addphoto input')) tlPhotos(ev.target);
});
document.addEventListener('input', (ev) => {
  if (TL && ev.target.matches('.tl-search')) $('#tl-pick').innerHTML = tlPickHtml(ev.target.value);
});
document.addEventListener('submit', (ev) => {
  const f = ev.target;
  if (!TL || !f.closest('.tl-modal')) return;
  ev.preventDefault();
  if (f.matches('.tl-add')) {
    const name = tlStr($('#tl-newplace').value, 60);
    if (!name) return;
    const c = C[tlCityToday(tlPickDate())],
      at = TL.picking < 0 && tlFresh() ? TL.pos : c;
    if (!at) return toast('Share your location or plan a trip first, so we know where to pin it.');
    closeModal('user');
    const stop = { name, area: 'Added by you', city: c?.id || '', lat: at.lat, lon: at.lon };
    if (TL.picking >= 0) tlCatchPlace(stop);
    else tlHere(stop);
  } else if (f.matches('.tl-fix')) {
    const s = TL.log.stops.find((x) => x.uid === f.dataset.id),
      v = Object.fromEntries(new FormData(f));
    if (!s) return;
    const tin = tlTime(v.in),
      out = tlTime(v.out);
    if (!tin) return toast('Add the time you arrived.');
    if (out && stMins(out) <= stMins(tin))
      return toast('The leaving time has to be after the arrival.');
    if (!out && (s.out || s.date !== tlToday() || tlOpen() !== s))
      return toast('Add the time you left.');
    closeModal('user');
    tlChange(
      () =>
        Object.assign(s, {
          in: tin,
          out,
          est: false,
          left: Boolean(out),
          note: tlStr(v.note, 600),
        }),
      'Saved.',
    );
  }
});
