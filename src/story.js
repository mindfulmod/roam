// Trip stories: a logged trip told as a route on a map and a day-by-day timeline, with the time
// spent at each place and a few picked photos. The first one is a made-up sample (data/stories.json)
// so the format can be judged before accounts and real logging exist.
const STORIES = DATA.stories || {};
const LOVES_KEY = 'roam-story-loves';
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
  return { id, st, stops, days, km, cityIds };
}

const stAvatar = (t, cls = '') =>
  `<span class="st-avatar ${cls}" style="--who:${esc(t.color)}" title="${esc(t.name)}" aria-hidden="true">${esc(t.name[0])}</span>`;

function stStopHtml(s, max) {
  const mine = stLoves().has(storyNow.id + ':' + s.i);
  const want = s.id && saved(s.id);
  return `<article class="st-stop" id="st-stop-${s.i}" data-i="${s.i}"><div class="st-time"><strong>${s.in}</strong><span>${stDur(s.mins)}</span><i class="st-bar" style="--w:${Math.max(12, Math.round((Math.min(s.mins, max) / max) * 100))}%"></i></div><div class="st-body"><h4>${s.id ? `<button class="inline-link" data-action="place" data-id="${s.id}">${esc(s.name)}</button>` : esc(s.name)}</h4><p class="st-area">${esc(s.area)}${s.id ? '' : ' · added by the group'} · ${stAvatar(s.by, 'tiny')} logged by ${esc(s.by.name)}</p>${s.note ? `<p class="st-note">${esc(s.note)}</p>` : ''}${
    s.photos.length
      ? `<div class="st-photos n${s.photos.length}">${s.photos.map((x) => `<button class="st-photo" data-action="story-photo" data-id="${x.id}" aria-label="Open photo: ${esc(x.caption)}">${photoTag(x.id)}<span class="st-cap">${stAvatar(x.by, 'tiny')} ${esc(x.caption)}</span></button>`).join('')}</div>`
      : ''
  }<div class="st-acts"><button class="st-act ${mine ? 'on' : ''}" data-action="story-love" data-i="${s.i}" aria-pressed="${mine}" aria-label="Love this stop">${icon('heart')}<span>${s.loves + (mine ? 1 : 0)}</span></button>${s.id ? `<button class="st-act ${want ? 'on' : ''}" data-action="story-want" data-id="${s.id}" aria-pressed="${want}">${icon(want ? 'check' : 'plus')}<span>${want ? 'On my list' : 'Want to go'}</span></button>` : ''}</div>${
    s.comments.length
      ? `<ul class="st-comments">${s.comments.map((c) => `<li><strong>${esc(c.by)}</strong> ${esc(c.text)}</li>`).join('')}</ul>`
      : ''
  }</div></article>`;
}

function stDayHtml(day, max) {
  let html = `<header class="st-day" id="st-day-${day.i}" data-day="${day.i}"><span class="eyebrow">Day ${day.i + 1} · ${stDate(day.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span><h3>${esc(day.title)}</h3><p>${esc(day.city)} · ${day.places} places · ${stDur(day.mins)} at places</p></header>`;
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

function renderStory(id) {
  const m = storyModel(id);
  if (!m) {
    $('#app').innerHTML =
      `<div class="wrap"><section class="empty"><h1>This story isn't here.</h1><p class="muted">The link may be old, or the story is no longer shared with you.</p><a class="btn" href="#/">Start exploring</a></section></div>`;
    return;
  }
  storyNow = m;
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
    `<div class="wrap story-page"><section class="shared-hero story-hero">${photoTag(st.cover, '', false)}<div class="shared-hero-copy">${st.sample ? '<span class="st-sample">Sample story</span>' : ''}<h1>${esc(st.title)}</h1><p>${esc(range)} · ${esc(st.blurb)}</p><div class="st-people">${st.travellers.map((t) => stAvatar(t)).join('')}<span>${st.travellers.map((t) => esc(t.name)).join(', ')}</span></div></div><span class="hero-credit">${photoCredit(st.cover)}</span></section>` +
    `<div class="st-facts"><div><strong>${days.length}</strong><span>days</span></div><div><strong>${m.cityIds.length}</strong><span>cities</span></div><div><strong>${stops.length}</strong><span>places</span></div><div><strong>${Math.round(m.km / 10) * 10}</strong><span>km between stops</span></div><button class="st-lock" data-action="story-audience">${icon('info')}<span>Only ${seen} people can see this</span></button></div>` +
    `<div class="story-layout"><div class="story-mapcol"><div class="story-mapbox"><div id="story-map" aria-label="Map of the trip route"></div><div class="story-maptools"><button class="btn small" data-action="story-play" id="story-play" aria-pressed="false">${icon('route')}<span>Play the trip</span></button><span class="story-now" id="story-now" aria-live="polite"></span></div></div><div class="chips story-days" id="story-days"><button class="chip active" data-action="story-day" data-id="all">Whole trip</button>${days.map((d) => `<button class="chip" data-action="story-day" data-id="${d.i}">Day ${d.i + 1}</button>`).join('')}</div></div>` +
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
  if (S.street && navigator.onLine)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      maxZoom: 19,
      updateWhenIdle: true,
    }).addTo(storyMap);
  const pts = m.stops.map((s) => [s.lat, s.lon]);
  // One line per day, so the day being read stands out from the rest of the route.
  L.polyline(pts, { color: '#e7764b', weight: 2, opacity: 0.35, dashArray: '2 7' }).addTo(storyMap);
  m.lines = m.days.map((d) =>
    L.polyline(
      m.stops.filter((s) => s.day === d.i).map((s) => [s.lat, s.lon]),
      { color: '#e7764b', weight: 3, opacity: 0.9, lineJoin: 'round' },
    ).addTo(storyMap),
  );
  m.markers = m.stops.map((s) =>
    L.marker([s.lat, s.lon], {
      title: s.name,
      keyboard: false,
      icon: L.divIcon({
        className: '',
        html: `<div class="st-pin" data-pin="${s.i}"></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    })
      .on('click', () => storyGoto(s.i))
      .addTo(storyMap),
  );
  m.calm = calm;
  m.bounds = L.latLngBounds(pts);
  storyMap.fitBounds(m.bounds, { padding: [28, 28] });
  setTimeout(() => storyMap?.invalidateSize(), 120);
}

// The stop nearest the reading line becomes the active one, and the map follows it.
function storyWatch() {
  const m = storyNow;
  m.active = -1;
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
  if (now) now.textContent = `Day ${s.day + 1} · ${s.in} · ${s.name}`;
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
  const r = el.getBoundingClientRect(),
    stacked = matchMedia('(max-width: 900px)').matches;
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
    storyMap.fitBounds(m.bounds, { padding: [28, 28], animate: !m.calm });
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
    b.querySelector('span').textContent = on ? 'Pause' : 'Play the trip';
  }
  if (!on) return;
  let i = m.active >= m.stops.length - 1 ? 0 : Math.max(0, m.active);
  storyGoto(i);
  m.timer = setInterval(() => {
    if (i >= m.stops.length - 1) return storyPlay(false);
    storyGoto(++i);
  }, 3200);
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
  if (a === 'story-play') storyPlay(!storyNow.timer);
  else if (a === 'story-day') storyDay(b.dataset.id);
  else if (a === 'story-goto') storyGoto(Number(b.dataset.i));
  else if (a === 'story-audience') storyAudience();
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
