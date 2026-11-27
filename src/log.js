// Logging a trip, as a clickable mock on the sample story (#/story/<id>/log). Three parts:
//   here    - "I'm here": one tap logs a place for the whole group, with or without signal
//   catchup - build a day afterwards from picked photos
//   edit    - the group OKs the story a week after getting home (editing is on the story page)
// Nothing is saved or sent: it all lives in LG and is gone on reload. You play Alex.
// The map stays large with nothing on top of it, as on the story page.
const LG_ME = 'alex';
const LG_HERE_DAY = 4; // Day 5, Kyoto: the day you log as it happens
const LG_CATCH_DAY = 5; // Day 6, Kyoto: the day you build afterwards from photos
const LG_TABS = [
  ['here', 'On the trip'],
  ['catchup', 'Catch up'],
  ['edit', 'The story'],
];
let LG = null;

const lgWho = (id) => LG.who[id];
const lgT = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`;
const lgSpan = (a, b) => stDur(Math.max(5, stMins(b) - stMins(a)));
const lgControl = (html) => `<div class="lg-control"><span>Sample control</span>${html}</div>`;
const lgThumb = (x, cls = '') =>
  `<span class="lg-thumb ${cls}" style="--pos:${x.pos ?? 50}%">${photoTag(x.id, '', false)}</span>`;

// The mock is scripted around two Kyoto days, so it only opens on a story that has them.
const logCan = (id) =>
  [LG_HERE_DAY, LG_CATCH_DAY].every((d) => STORIES[id]?.days[d]?.city === 'Kyoto');
function renderLog(id, tab) {
  const m = logCan(id) && storyModel(id);
  if (!m) return renderStory(id);
  if (!LG_TABS.some((t) => t[0] === tab)) tab = 'here';
  headerActive('trip');
  document.title = `Logging · ${m.st.title} · Tandem Roads`;
  LG = {
    id,
    m,
    tab,
    who: Object.fromEntries(m.st.travellers.map((t) => [t.id, t])),
    here: lgHereStart(m),
    catchup: lgCatchStart(m),
    edit: lgEditStart(m),
  };
  $('#app').innerHTML =
    `<div class="wrap story-page log-page"><header class="lg-head"><a class="inline-link" href="#/story/${esc(id)}">${icon('left')}<span>${esc(m.st.title)}</span></a><h1>Log the trip</h1><p class="muted">A sample you can click through. You are ${stAvatar(lgWho(LG_ME), 'tiny')} Alex, travelling with Sam, Noor and Jo. Nothing here is saved or sent.</p></header>` +
    `<div class="story-layout"><div class="story-mapcol"><div class="story-mapbox"><div id="log-map" aria-label="Map of the places logged"></div></div><div class="chips story-days" id="lg-tabs" role="tablist">${LG_TABS.map(([k, label]) => `<button class="chip" role="tab" data-action="lg-tab" data-id="${k}">${label}</button>`).join('')}</div></div>` +
    `<div class="story-timeline lg-panel" id="lg-panel"></div></div><p class="filter-note lg-samplenote">A sample you can click through. You are Alex, travelling with Sam, Noor and Jo. Nothing here is saved or sent.</p>${footer()}</div>`;
  const map = (LG.map = L.map('log-map', {
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
  LG.layer = L.layerGroup().addTo(map);
  map.setView([35.0, 135.76], 12);
  lgShow();
  setTimeout(() => LG?.map === map && (map.invalidateSize(), lgMap()), 120);
}
function logLeave() {
  LG?.map.remove();
  LG = null;
}
function lgShow() {
  $$('#lg-tabs .chip').forEach((c) => {
    const on = c.dataset.id === LG.tab;
    c.classList.toggle('active', on);
    c.setAttribute('aria-selected', String(on));
  });
  $('#lg-panel').innerHTML =
    LG.tab === 'here' ? lgHereHtml() : LG.tab === 'catchup' ? lgCatchHtml() : lgEditHtml();
  lgMap();
}
function lgTab(tab) {
  LG.tab = tab;
  $('.toast')?.remove();
  history.replaceState(history.state, '', `#/story/${LG.id}/log${tab === 'here' ? '' : '/' + tab}`);
  lgShow();
  if (stStacked()) window.scrollTo({ top: 0 });
}

// The map shows whatever the open tab is working on: numbered pins joined in order, hollow
// while a place is only suggested, plus a blue dot for where the phone is.
function lgMap() {
  if (!LG) return;
  const { map, layer } = LG;
  layer.clearLayers();
  let pins = [],
    you = null,
    day = LG_HERE_DAY;
  if (LG.tab === 'here') {
    const h = LG.here;
    pins = h.log.map((e) => ({ ...e.stop, ghost: e.wait }));
    if (h.phase === 'near') you = h.script[h.k];
  } else if (LG.tab === 'catchup') {
    day = LG_CATCH_DAY;
    const c = LG.catchup;
    if (c.step > 1)
      pins = c.groups.filter((g) => g.stop).map((g) => ({ ...g.stop, ghost: c.step === 2 }));
  } else {
    day = LG.edit.day;
    pins = LG.edit.stops.filter((s) => s.day === day && !s.removed);
  }
  const color = stColor(day),
    pts = pins.map((p) => [p.lat, p.lon]);
  if (pts.length > 1) L.polyline(pts, { color, weight: 3, opacity: 0.9 }).addTo(layer);
  pins.forEach((p, i) =>
    L.marker([p.lat, p.lon], {
      title: p.name,
      keyboard: false,
      icon: L.divIcon({
        className: '',
        html: `<div class="st-pin ${p.ghost ? 'lg-ghost' : ''}" style="--day:${color}">${i + 1}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    }).addTo(layer),
  );
  if (you) {
    L.marker([you.lat, you.lon], {
      title: 'Where you are',
      keyboard: false,
      icon: L.divIcon({
        className: '',
        html: '<div class="lg-you"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
    }).addTo(layer);
    pts.push([you.lat, you.lon]);
  }
  if (!pts.length) {
    const c = C[LG.m.days[day].rows.find((r) => !r.leg).cityId];
    return map.setView([c.lat, c.lon], 12, { animate: false });
  }
  map.fitBounds(L.latLngBounds(pts), { padding: [44, 44], maxZoom: 15, animate: !LG.m.calm });
}

// ---------------------------------------------------------------- On the trip: "I'm here"
function lgHereStart(m) {
  const script = m.days[LG_HERE_DAY].rows.filter((r) => !r.leg);
  return { script, k: 0, phase: 'near', clock: script[0].in, offline: false, log: [] };
}
function lgHereHtml() {
  const h = LG.here,
    day = LG.m.days[LG_HERE_DAY],
    waiting = h.log.filter((e) => e.wait).length,
    cur = h.log[h.log.length - 1],
    next = h.script[h.k];
  let card;
  if (h.phase === 'near')
    card = `<section class="lg-card lg-here"><p class="lg-kicker">${icon('locate')} You look close to</p><div class="lg-place">${lgThumb({ id: next.id })}<div><h2>${esc(next.name)}</h2><p class="muted">${esc(next.area)}</p></div></div><button class="btn lg-big" data-action="lg-here">${icon('pin')} I'm here</button><button class="btn text" data-action="lg-else">Somewhere else</button><p class="filter-note">One tap logs it for all four of you. Your phone's location is used once to suggest the place, then dropped. No trail is kept.</p></section>`;
  else if (h.phase === 'done')
    card = `<section class="lg-card"><p class="lg-kicker">${icon('check')} Day done</p><h2>${h.log.length} places, ${stDur(h.log.reduce((a, e) => a + stMins(e.out) - stMins(e.in), 0))} at them</h2><p class="muted">Nobody opened the app for more than a few seconds at a time. Anything missed can be added later from photos.</p><div class="lg-row"><button class="btn" data-action="lg-tab" data-id="catchup">Catch up a day from photos</button><button class="btn ghost" data-action="lg-tab" data-id="edit">Open the story</button></div></section>`;
  else {
    const left = h.phase === 'moving';
    card =
      `<section class="lg-card"><p class="lg-kicker">${icon(left ? 'route' : 'pin')} ${left ? 'On the way from' : 'You are at'}</p><div class="lg-place">${lgThumb({ id: cur.stop.id || cur.photo })}<div><h2>${esc(cur.stop.name)}</h2><p class="muted">${left ? `Left at ${cur.out}` : `Since ${cur.in}`} · ${cur.by === LG_ME ? 'you tapped' : esc(lgWho(cur.by).name) + ' tapped for everyone'}</p></div></div>` +
      (cur.by !== LG_ME && !left
        ? `<p class="lg-note">${stAvatar(lgWho(cur.by), 'tiny')} ${esc(lgWho(cur.by).name)} got there first, so you did not need to do anything. <button class="inline-link" data-action="lg-notme">I wasn't there</button></p>`
        : '') +
      (left
        ? ''
        : `<div class="lg-row"><button class="st-act" data-action="lg-photo" ${cur.photos >= 5 ? 'disabled' : ''}>${icon('camera')}<span>${cur.photos ? `${cur.photos} of 5 photos` : 'Add a photo'}</span></button><button class="st-act" data-action="lg-left">${icon('route')}<span>We've left</span></button></div><p class="filter-note">"We've left" is optional. Without it, the leaving time is worked out when the next place is logged.</p>`) +
      lgControl(
        h.k < h.script.length
          ? `<button class="btn small ghost" data-action="lg-skip">Skip ahead to ${h.script[h.k].in}, the next place</button>`
          : `<button class="btn small ghost" data-action="lg-skip">Skip to the end of the day</button>`,
      ) +
      '</section>';
  }
  return (
    `<div class="lg-clock"><div><span class="eyebrow">Day ${LG_HERE_DAY + 1} · ${stDate(day.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${esc(day.city)}</span><strong>${h.clock}</strong></div><label class="lg-switch"><input type="checkbox" data-action="lg-signal" ${h.offline ? '' : 'checked'}><span>${h.offline ? 'No signal' : 'Signal'}</span></label></div>` +
    (h.offline
      ? `<p class="lg-offline">${icon('info')} No signal. ${waiting ? `${waiting} ${waiting === 1 ? 'place is' : 'places are'} kept on this phone and will send on their own.` : 'Taps are kept on this phone and send on their own later.'}</p>`
      : '') +
    card +
    (h.log.length
      ? `<h3 class="lg-sub">Today so far</h3><ol class="lg-list">${h.log.map((e, i) => lgEntryHtml(e, i, i === h.log.length - 1 && h.phase === 'at')).join('')}</ol><p class="filter-note">Times marked "about" are worked out from taps, photo times and the distance to the next place. Anyone in the group can fix one.</p>`
      : '')
  );
}
function lgEntryHtml(e, i, open) {
  const by = lgWho(e.by);
  return `<li style="--day:${stColor(LG_HERE_DAY)}"><b class="st-num">${i + 1}</b><div><strong>${esc(e.stop.name)}</strong><span>${open ? `${e.in}, here now` : `${e.in} to ${e.est ? 'about ' : ''}${e.out} · ${lgSpan(e.in, e.out)}`} · ${stAvatar(by, 'tiny')} ${e.by === LG_ME ? 'you' : esc(by.name)}${e.manual ? ' · added by the group' : ''}${e.skip ? ' · without you' : ''}${e.wait ? ' · <em class="lg-wait">waiting to send</em>' : ''}</span></div>${open ? '' : `<button class="st-act" data-action="lg-fix" data-i="${i}">Fix</button>`}</li>`;
}
// Logging a place: closes the stop before it (leaving time worked out), then opens this one.
function lgHereLog(by, stop) {
  const h = LG.here,
    s = stop || h.script[h.k],
    prev = h.log[h.log.length - 1];
  if (prev && !prev.left) {
    prev.out = prev.planOut;
    prev.est = true;
  }
  h.log.push({
    stop: s,
    in: h.clock,
    out: h.clock,
    planOut: h.script[h.k].out,
    by,
    photos: 0,
    wait: h.offline,
    manual: !s.id,
  });
  h.k++;
  h.phase = 'at';
}
function lgHere(stop) {
  const h = LG.here,
    snap = JSON.stringify({
      k: h.k,
      phase: h.phase,
      n: h.log.length,
      prev: h.log[h.log.length - 1],
    });
  lgHereLog(LG_ME, stop);
  lgShow();
  toast(
    h.offline
      ? 'Saved on this phone. It sends when you have signal.'
      : 'Logged for all four of you.',
    {
      label: 'Undo',
      run() {
        if (!LG) return;
        const b = JSON.parse(snap);
        h.log.length = b.n;
        if (b.prev) Object.assign(h.log[b.n - 1], { out: b.prev.out, est: b.prev.est });
        h.k = b.k;
        h.phase = b.phase;
        lgShow();
      },
    },
  );
}
function lgSkip() {
  const h = LG.here,
    cur = h.log[h.log.length - 1];
  if (h.k >= h.script.length) {
    if (!cur.left) Object.assign(cur, { out: cur.planOut, est: true });
    h.clock = cur.out;
    h.phase = 'done';
    return lgShow();
  }
  h.clock = h.script[h.k].in;
  // Two of the six stops are tapped by someone else, to show that one tap covers the group.
  if (h.k === 1 || h.k === 3) {
    lgHereLog(h.script[h.k].by.id);
    lgShow();
    return toast(
      `${h.log[h.log.length - 1].stop.name}: ${lgWho(h.log[h.log.length - 1].by).name} tapped for everyone.`,
    );
  }
  h.phase = 'near';
  lgShow();
}
// "Somewhere else": places near the phone, then a way to add one the guide does not have.
function lgElse(mode) {
  const at =
      mode === 'catch' ? LG.catchup.groups[LG.catchup.picking].at : LG.here.script[LG.here.k],
    near = C[at.cityId].items
      .map((x) => P[x.id])
      .filter((p) => p && p.id !== at.id && p.lat)
      .sort((a, b) => stKm(at, a) - stKm(at, b))
      .slice(0, 6);
  showModal(
    `<div class="modalcontent lg-modal"><h2 id="modal-heading">Where are you?</h2><p class="lead">${mode === 'catch' ? 'Places from your plan and the guide, nearest first.' : 'Nearest first, from your plan and the guide.'}</p><ul class="lg-pick">${near.map((p) => `<li><button data-action="lg-choose" data-mode="${mode}" data-id="${p.id}">${lgThumb({ id: p.id })}<span><strong>${esc(p.name)}</strong><small>${esc(p.area || '')} · ${stKm(at, p) < 1 ? Math.round(stKm(at, p) * 100) * 10 + ' m' : stKm(at, p).toFixed(1) + ' km'}</small></span></button></li>`).join('')}</ul><form class="lg-add" data-mode="${mode}"><label for="lg-newplace">Not listed? Add it yourself</label><div><input id="lg-newplace" maxlength="60" placeholder="Name of the place" autocomplete="off" required><button class="btn small">Add</button></div><p class="filter-note">It joins your trip straight away, pinned where you are standing. Tandem Roads is told, and may add it to the guide for everyone.</p></form></div>`,
    'Where are you?',
  );
}
function lgChoose(mode, stop) {
  closeModal('user');
  if (mode === 'catch') {
    const c = LG.catchup,
      g = c.groups[c.picking];
    g.stop = stop;
    g.asked = true;
    return lgShow();
  }
  lgHere(stop);
}
const lgGuideStop = (p) => ({
  id: p.id,
  name: p.name,
  area: p.area || '',
  cityId: p.cityId,
  lat: p.lat,
  lon: p.lon,
});
function lgSignal(on) {
  const h = LG.here,
    n = h.log.filter((e) => e.wait).length;
  h.offline = !on;
  if (on) h.log.forEach((e) => (e.wait = false));
  lgShow();
  if (on && n) toast(`Back online. ${n} ${n === 1 ? 'place' : 'places'} sent to the group.`);
}
// One small sheet fixes the times of any stop, wherever it is listed.
function lgFix(kind, i) {
  const e = kind === 'here' ? LG.here.log[i] : kind === 'catch' ? LG.catchup.groups[i] : null,
    name = e.stop?.name || 'this stop';
  showModal(
    `<div class="modalcontent lg-modal"><h2 id="modal-heading">Fix the times</h2><p class="lead">${esc(name)}</p><form class="lg-times" data-kind="${kind}" data-i="${i}"><label>Arrived<input type="time" name="in" value="${e.in}" required></label><label>Left<input type="time" name="out" value="${e.out}" required></label><div class="actions"><button class="btn">Save</button></div></form><p class="filter-note">The whole group sees the change and who made it, and anyone can undo it.</p></div>`,
    'Fix the times',
  );
}

// ---------------------------------------------------------------- Catch up from photos
// A stand-in camera roll for one day: several near-identical shots per place, as on a real phone.
function lgCatchStart(m) {
  const stops = m.days[LG_CATCH_DAY].rows.filter((r) => !r.leg),
    shots = [
      [0, ['07:42', '07:58', '08:30', '09:41'], [0, 1, 0, 1]],
      [1, ['11:24'], [1]],
      [2, ['13:31', '13:50', '14:12'], [0, 1, 0]],
      [3, ['14:58', '15:20', '15:22', '15:40', '15:51', '16:02'], [1, 1, 1, 1, 1, 1]],
      [4, ['17:45'], [1]],
    ],
    roll = [];
  shots.forEach(([si, times, on]) =>
    times.forEach((t, j) =>
      roll.push({
        k: roll.length,
        id: stops[si].id,
        stop: si,
        t,
        pos: times.length === 1 ? 50 : Math.round((j / (times.length - 1)) * 100),
        on: Boolean(on[j]),
        // The last photo of the day carries no location, as most phone browsers strip it.
        noloc: si === 4,
      }),
    ),
  );
  return { stops, roll: roll.filter((x) => PHOTO[x.id]), step: 1, groups: [], picking: 0 };
}
function lgCatchBuild() {
  const c = LG.catchup;
  c.groups = c.stops
    .map((s, si) => {
      const shots = c.roll.filter((x) => x.on && x.stop === si);
      if (!shots.length) return null;
      const a = stMins(shots[0].t),
        b = stMins(shots[shots.length - 1].t),
        one = shots.length === 1;
      return {
        at: s,
        stop: shots[0].noloc ? null : s,
        shots,
        // Rounded outwards to five minutes; a single photo gets a 45-minute guess around it.
        in: lgT(Math.floor((one ? a - 15 : a - 5) / 5) * 5),
        out: lgT(Math.ceil((one ? a + 30 : b + 5) / 5) * 5),
        one,
        drop: false,
      };
    })
    .filter(Boolean);
  c.step = 2;
}
function lgCatchHtml() {
  const c = LG.catchup,
    day = LG.m.days[LG_CATCH_DAY],
    when = stDate(day.date, { weekday: 'long', day: 'numeric', month: 'long' }),
    n = c.roll.filter((x) => x.on).length;
  if (c.step === 1)
    return (
      `<section class="lg-card"><p class="lg-kicker">${icon('camera')} Step 1 of 2</p><h2>Pick the photos worth keeping</h2><p class="muted">${esc(when)} in ${esc(day.city)}. Nobody logged anything that day, so build it now from the pictures. Highlights only: up to five per place.</p><div class="lg-roll">${c.roll.map((x) => `<button class="lg-shot ${x.on ? 'on' : ''}" data-action="lg-shot" data-k="${x.k}" aria-pressed="${x.on}" aria-label="Photo taken at ${x.t}">${lgThumb(x)}<time>${x.t}</time><i>${icon('check')}</i></button>`).join('')}</div><div class="lg-row"><button class="btn" data-action="lg-build" ${n ? '' : 'disabled'}>Build the day from ${n} ${n === 1 ? 'photo' : 'photos'}</button><button class="btn text" data-action="lg-all">${n === c.roll.length ? 'Clear all' : 'Select all'}</button></div><p class="filter-note">Stand-ins for your camera roll. In the real app this is your phone's own photo picker. The time each photo was taken is read on your phone, and photos you do not pick never leave it.</p></section>` +
      `<p class="lg-aside">No photos from a place? You can also add it by hand in the next step.</p>`
    );
  const live = c.groups.filter((g) => !g.drop),
    ready = live.length && live.every((g) => g.stop && g.shots.length <= 5);
  if (c.step === 2)
    return (
      `<section class="lg-card"><p class="lg-kicker">${icon('route')} Step 2 of 2</p><h2>Is this how the day went?</h2><p class="muted">The photos fell into ${c.groups.length} ${c.groups.length === 1 ? 'place' : 'places'} by the time they were taken. Check each one, then add them to the story.</p></section>` +
      c.groups.map(lgGroupHtml).join('') +
      `<button class="lg-addrow" data-action="lg-byhand">${icon('plus')} Add a place with no photo</button>` +
      `<div class="lg-row lg-sticky"><button class="btn" data-action="lg-commit" ${ready ? '' : 'disabled'}>Add ${live.length} ${live.length === 1 ? 'place' : 'places'} to Day ${LG_CATCH_DAY + 1}</button><button class="btn text" data-action="lg-back">Back to photos</button></div>${ready ? '' : '<p class="filter-note">Something above still needs you before this can be added.</p>'}`
    );
  return `<section class="lg-card"><p class="lg-kicker">${icon('check')} Added</p><h2>Day ${LG_CATCH_DAY + 1} is in the story</h2><p class="muted">Sam, Noor and Jo can see it now and add their own photos. Nothing is shown to viewers until the group says the story is ready.</p><ol class="lg-list">${live.map((g, i) => `<li style="--day:${stColor(LG_CATCH_DAY)}"><b class="st-num">${i + 1}</b><div><strong>${esc(g.stop.name)}</strong><span>about ${g.in} to ${g.out} · ${g.shots.length ? `${g.shots.length} ${g.shots.length === 1 ? 'photo' : 'photos'}` : 'no photo'}</span></div></li>`).join('')}</ol><div class="lg-row"><button class="btn" data-action="lg-tab" data-id="edit">Open the story</button><button class="btn ghost" data-action="lg-again">Start over</button></div></section>`;
}
function lgGroupHtml(g, i) {
  if (g.drop)
    return `<section class="lg-group dropped"><span>${esc(g.stop?.name || 'A place')} left out</span><button class="inline-link" data-action="lg-drop" data-i="${i}">Put back</button></section>`;
  const over = g.shots.length > 5;
  return `<section class="lg-group ${g.stop && !over ? '' : 'needs'}" style="--day:${stColor(LG_CATCH_DAY)}"><header>${
    g.stop
      ? `<div><h3>${esc(g.stop.name)}</h3><p>${g.hand ? 'Added by hand' : g.asked ? 'You chose this place' : 'Suggested from your plan and when the photos were taken'}</p></div><button class="st-act" data-action="lg-where" data-i="${i}">Change</button>`
      : `<div><h3>Where was this?</h3><p>This photo has no location saved in it, and nothing in the plan fits the time.</p></div><button class="btn small" data-action="lg-where" data-i="${i}">Choose the place</button>`
  }</header>${g.shots.length ? `<div class="lg-strip">${g.shots.map((x) => `<button class="lg-shot on" data-action="lg-unpick" data-i="${i}" data-k="${x.k}" aria-label="Leave out the photo from ${x.t}">${lgThumb(x)}<time>${x.t}</time>${over ? `<i>${icon('close')}</i>` : ''}</button>`).join('')}</div>` : ''}${over ? `<p class="lg-warn">${g.shots.length} photos picked, and a stop holds five. Tap one to leave it out.</p>` : ''}<footer><span><strong>about ${g.in} to ${g.out}</strong> · ${g.hand ? 'a guess' : g.one ? 'a guess from one photo' : 'from the first and last photo'}</span><button class="st-act" data-action="lg-fix" data-kind="catch" data-i="${i}">Fix</button><button class="st-act" data-action="lg-drop" data-i="${i}">Leave out</button></footer></section>`;
}

// ---------------------------------------------------------------- The story: finish
function lgEditStart(m) {
  return {
    day: LG_HERE_DAY,
    cover: m.st.cover,
    stops: m.stops.map((s) => ({
      ...s,
      by: s.by.id,
      photos: s.photos.map((x) => ({ id: x.id, caption: x.caption, by: x.by.id, hidden: false })),
      removed: false,
    })),
    week: false,
    oks: { sam: true, noor: true },
    stage: 'draft',
  };
}
function lgEditHtml() {
  const e = LG.edit,
    m = LG.m,
    people = m.st.travellers,
    viewers = m.st.viewers.join(' and '),
    yes = people.filter((t) => e.oks[t.id]).length,
    back = stDate(m.days[m.days.length - 1].date, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }),
    ask = stDate(
      new Date(Date.parse(m.days[m.days.length - 1].date) + 7 * 864e5).toISOString().slice(0, 10),
      {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      },
    );
  let status;
  if (e.stage === 'done')
    status = `<section class="lg-card lg-done"><p class="lg-kicker">${icon('check')} Finished</p><h2>The story is ready</h2><p class="muted">All four of you said yes. ${esc(viewers)} can open it now. You can still fix things, and any one of you can take it back to a draft.</p><button class="btn ghost small" data-action="lg-reopen">Take it back to a draft</button></section>`;
  else if (!e.week)
    status = `<section class="lg-card"><p class="lg-kicker">${icon('info')} Draft</p><h2>Only the four of you can see this</h2><p class="muted">You got home on ${back}. On ${ask}, a week later, everyone is asked one question: is the story ready? Until all four say yes, it stays a draft.</p>${lgControl(`<button class="btn small ghost" data-action="lg-week">Skip to ${ask}</button>`)}</section>`;
  else
    status =
      `<section class="lg-card"><p class="lg-kicker">${icon('calendar')} ${ask} · a week home</p><h2>Is the story ready for ${esc(viewers)}?</h2><ul class="lg-oks">${people.map((t) => `<li>${stAvatar(t, 'tiny')}<strong>${t.id === LG_ME ? 'You' : esc(t.name)}</strong><span class="${e.oks[t.id] ? 'yes' : ''}">${e.oks[t.id] ? 'Ready' : t.id === LG_ME ? 'Not answered' : 'Has not answered'}</span>${!e.oks[t.id] && t.id !== LG_ME ? `<button class="st-act" data-action="lg-nudge" data-id="${t.id}">Remind</button>` : ''}</li>`).join('')}</ul><div class="lg-row"><button class="btn" data-action="lg-ok">${e.oks[LG_ME] ? 'Take back my yes' : "Yes, it's ready"}</button><span class="muted">${yes} of ${people.length} so far</span></div><p class="filter-note">It needs all four. Nobody is rushed: no answer means it stays a draft, with two gentle reminders and then silence.</p>` +
      (e.oks.jo
        ? ''
        : lgControl(
            `<button class="btn small ghost" data-action="lg-jo">Pretend Jo says yes</button>`,
          )) +
      '</section>';
  return (
    status +
    `<a class="lg-try ed-door" href="#/story/${esc(LG.id)}/edit">${icon('pencil')}<span><strong>Edit the story on its own page</strong><small>Fix times and notes, reorder stops, choose the cover, hide a photo. The map redraws as you go, and anyone can undo.</small></span>${icon('arrow')}</a>`
  );
}
// ---------------------------------------------------------------- Events
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-action^="lg-"]');
  if (!b || !LG || b.matches('input')) return;
  const a = b.dataset.action,
    i = Number(b.dataset.i),
    h = LG.here,
    c = LG.catchup,
    e = LG.edit;
  if (a === 'lg-tab') lgTab(b.dataset.id);
  // On the trip
  else if (a === 'lg-here') lgHere();
  else if (a === 'lg-else') lgElse('here');
  else if (a === 'lg-skip') lgSkip();
  else if (a === 'lg-left') {
    const cur = h.log[h.log.length - 1];
    Object.assign(cur, { out: cur.planOut, left: true });
    h.clock = cur.out;
    h.phase = h.k < h.script.length ? 'moving' : 'done';
    lgShow();
  } else if (a === 'lg-photo') {
    h.log[h.log.length - 1].photos++;
    lgShow();
    toast('Photo added. It uploads when you are on Wi-Fi.');
  } else if (a === 'lg-notme') {
    h.log[h.log.length - 1].skip = true;
    lgShow();
    toast('Kept for the others, left off your own map.');
  } else if (a === 'lg-fix') lgFix(b.dataset.kind || 'here', i);
  else if (a === 'lg-choose') lgChoose(b.dataset.mode, lgGuideStop(P[b.dataset.id]));
  // Catch up
  else if (a === 'lg-shot') {
    c.roll[Number(b.dataset.k)].on = !c.roll[Number(b.dataset.k)].on;
    lgShow();
  } else if (a === 'lg-all') {
    const all = c.roll.every((x) => x.on);
    c.roll.forEach((x) => (x.on = !all));
    lgShow();
  } else if (a === 'lg-build') {
    lgCatchBuild();
    lgShow();
    if (stStacked()) window.scrollTo({ top: 0 });
  } else if (a === 'lg-back') {
    c.step = 1;
    lgShow();
  } else if (a === 'lg-unpick') {
    const g = c.groups[i];
    if (g.shots.length < 2)
      return toast('The last photo stays. Use "Leave out" to drop the place.');
    g.shots = g.shots.filter((x) => x.k !== Number(b.dataset.k));
    c.roll[Number(b.dataset.k)].on = false;
    lgShow();
  } else if (a === 'lg-drop') {
    c.groups[i].drop = !c.groups[i].drop;
    lgShow();
  } else if (a === 'lg-where') {
    c.picking = i;
    lgElse('catch');
  } else if (a === 'lg-byhand') {
    const last = c.groups[c.groups.length - 1],
      t = last ? stMins(last.out) + 30 : 720;
    c.groups.push({
      at: last?.at || c.stops[0],
      stop: null,
      shots: [],
      in: lgT(t),
      out: lgT(t + 60),
      hand: true,
      drop: false,
    });
    c.picking = c.groups.length - 1;
    lgShow();
    lgElse('catch');
  } else if (a === 'lg-commit') {
    c.groups = c.groups.filter((g) => !g.drop).sort((x, y) => stMins(x.in) - stMins(y.in));
    c.step = 3;
    lgShow();
    if (stStacked()) window.scrollTo({ top: 0 });
    toast(`${c.groups.length} places added to Day ${LG_CATCH_DAY + 1}.`);
  } else if (a === 'lg-again') {
    LG.catchup = lgCatchStart(LG.m);
    lgShow();
  }
  // The story
  else if (a === 'lg-week') {
    e.week = true;
    lgShow();
  } else if (a === 'lg-ok' || a === 'lg-jo') {
    const who = a === 'lg-jo' ? 'jo' : LG_ME;
    e.oks[who] = !e.oks[who];
    if (LG.m.st.travellers.every((t) => e.oks[t.id])) e.stage = 'done';
    lgShow();
    if (e.stage === 'done')
      toast(`Finished. ${LG.m.st.viewers.join(' and ')} can see the story now.`);
  } else if (a === 'lg-nudge') toast(`${lgWho(b.dataset.id).name} gets one reminder.`);
  else if (a === 'lg-reopen') {
    e.stage = 'draft';
    e.oks[LG_ME] = false;
    lgShow();
    toast('Back to a draft. Viewers can no longer open it.');
  }
});
document.addEventListener('change', (ev) => {
  if (!LG) return;
  if (ev.target.matches('[data-action="lg-signal"]')) lgSignal(ev.target.checked);
});
document.addEventListener('submit', (ev) => {
  const f = ev.target;
  if (!LG || !f.closest('.lg-modal')) return;
  ev.preventDefault();
  const v = Object.fromEntries(new FormData(f));
  if (f.matches('.lg-add')) {
    const name = $('#lg-newplace').value.trim();
    if (!name) return;
    const mode = f.dataset.mode,
      at = mode === 'catch' ? LG.catchup.groups[LG.catchup.picking].at : LG.here.script[LG.here.k];
    // Pinned a little off the suggested place, where the phone says you are standing.
    lgChoose(mode, {
      id: '',
      name,
      area: 'Added by you',
      cityId: at.cityId,
      lat: at.lat + 0.0012,
      lon: at.lon + 0.0015,
    });
    toast(`"${name}" is in your trip. Tandem Roads has been told about it.`);
  } else if (f.matches('.lg-times')) {
    if (stMins(v.out) <= stMins(v.in))
      return toast('The leaving time has to be after the arrival.');
    const list = f.dataset.kind === 'here' ? LG.here.log : LG.catchup.groups;
    Object.assign(list[Number(f.dataset.i)], {
      in: v.in,
      out: v.out,
      est: false,
      one: false,
      left: true,
    });
    closeModal('user');
    lgShow();
    toast('Times fixed.');
  }
});
