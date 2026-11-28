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
const stStacked = () => matchMedia('(max-width: 900px)').matches;
let storyMap = null,
  storyNow = null,
  stEditing = false;

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
// The person using the app (the sample plays Alex) and whether they travelled on this trip.
const stMe = () => DATA.social?.me || 'alex';
const stMine = (st) => st.travellers.some((t) => t.id === stMe());
// Friends outside the trip, for ripples.
const stPerson = (id) => DATA.social?.people?.[id] || { name: id, color: '#627572' };

function storyModel(id) {
  const st = (typeof ST_DRAFT !== 'undefined' && ST_DRAFT[id]) || STORIES[id];
  if (!st) return null;
  const who = Object.fromEntries(st.travellers.map((t) => [t.id, t])),
    mine = stMine(st);
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
        uid: s.uid,
        i: stops.length,
        day: di,
        n: day.places + 1,
        id: p?.id || '',
        name: p?.name || s.name,
        area: p?.area || s.area || '',
        osm: p ? '' : s.osm || '',
        local: p ? p.local : s.local ? { name: s.local } : null,
        cityId: p?.cityId || s.city,
        lat: p?.lat ?? s.lat,
        lon: p?.lon ?? s.lon,
        in: s.in,
        out: s.out,
        mins,
        by: who[s.by],
        note: s.note || '',
        // Travellers see photos hidden from viewers, marked; viewers never get them.
        photos: (s.photos || [])
          .map((x, k) => ({ ...x, k }))
          .filter((x) => PHOTO[x.id] && (mine || !x.hidden))
          .map((x) => ({ ...x, by: who[x.by] })),
        ripples: (st.ripples || []).filter((r) => r.place && r.place === s.place),
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
  // One screen for the cover, then one per day and per stop, for the tap-through view.
  const slides = [{ cover: true }];
  days.forEach((d) => {
    slides.push({ day: d });
    d.rows.filter((r) => !r.leg).forEach((r) => slides.push({ day: d, stop: r }));
  });
  return { id, st, stops, days, km, cityIds, slides };
}

const stAvatar = (t, cls = '') =>
  `<span class="st-avatar ${cls}" style="--who:${esc(t.color)}" title="${esc(t.name)}" aria-hidden="true">${esc(t.name[0])}</span>`;

// Outside links use our own plain icons: other companies' logos need their permission.
const ST_LINK_ICON = { maps: 'pin', tripadvisor: 'chat' };
const stBrand = (k) => icon(ST_LINK_ICON[k]);
// Outside links for a stop, as two small marks beside its name: where it is, and what others say.
function stLinks(s) {
  const maps = s.id
    ? mapsPin(P[s.id])
    : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${s.lat},${s.lon}`);
  const ta = s.id
    ? 'https://www.tripadvisor.com/Search?q=' + encodeURIComponent(`${s.name} ${P[s.id].cityName}`)
    : '';
  const link = (url, k, label) =>
    external(
      url,
      stBrand(k),
      `st-brand ${k}" title="${label}" aria-label="${esc(s.name)} on ${label}`,
    );
  return `<span class="st-brands">${link(maps, 'maps', 'Google Maps')}${ta ? link(ta, 'tripadvisor', 'Tripadvisor') : ''}</span>`;
}
const stLoveBtn = (s) => {
  const mine = stLoves().has(storyNow.id + ':' + s.i);
  return `<button class="st-act ${mine ? 'on' : ''}" data-action="story-love" data-i="${s.i}" aria-pressed="${mine}" aria-label="Love this stop">${icon('heart')}<span>${s.loves + (mine ? 1 : 0)}</span></button>`;
};
const stWantBtn = (s) => {
  const want = s.id && saved(s.id);
  return s.id
    ? `<button class="st-act ${want ? 'on' : ''}" data-action="story-want" data-id="${s.id}" aria-pressed="${want}">${icon(want ? 'check' : 'plus')}<span>${want ? 'On my list' : 'Want to go'}</span></button>`
    : '';
};
// The ripple: friends who saved a place from this story, and what happened next. It shows on the
// stop, on its pin and at the top of the story, and is never added up into a score.
const stRipText = (r) =>
  r.went
    ? `<strong>${esc(stPerson(r.who).name)} went</strong>, ${esc(r.after)}`
    : `<strong>${esc(stPerson(r.who).name)} saved it</strong> · ${esc(r.after)}`;
const stRipFace = (r) =>
  stAvatar({ name: stPerson(r.who).name, color: stPerson(r.who).color }, 'tiny');
// Their photo of the same spot: a guide photo stands in, since the sample has no real one.
function stRipLater(r) {
  const g = galleryFor(r.place)[1] || galleryFor(r.place)[0];
  return g ? galleryImg(g, true, '160px') : photoTag(r.place);
}
function stRipLines(s) {
  return s.ripples.length
    ? `<div class="st-rips">${s.ripples.map((r) => `<p class="st-rip ${r.went ? 'went' : ''}"><i class="st-rip-mark">${icon('ripple')}</i>${stRipFace(r)}<span class="st-rip-text">${stRipText(r)}</span>${r.went ? `<span class="st-rip-later">${stRipLater(r)}</span>` : ''}</p>`).join('')}</div>`
    : '';
}
// Names in a sentence: "Maya", "Maya and Leo", "Maya, Leo and Sam".
const stNames = (ids) => {
  const n = [...new Set(ids)].map((id) => stPerson(id).name);
  return n.length > 1 ? n.slice(0, -1).join(', ') + ' and ' + n.at(-1) : n[0] || '';
};
// Their photos of the same spot. The sample has none of its own, so Commons photos of the
// place stand in; `shots` picks which ones.
function stRipShots(r, sizes = '300px') {
  const gal = galleryFor(r.place),
    shots = (r.shots || [1]).map((k) => gal[k]).filter(Boolean);
  return shots.length ? shots.map((g) => galleryImg(g, true, sizes)) : [photoTag(r.place)];
}
// "Where this trip led": one post per place, with everyone it reached. Opening one shows the
// ripple spreading out from the stop, person by person.
function stRipStrip(m) {
  const went = (s) => s.ripples.filter((r) => r.went).length,
    posts = m.stops.filter((s) => s.ripples.length).sort((a, b) => went(b) - went(a));
  if (!posts.length) return '';
  const mine = stMine(m.st);
  return `<section class="st-ripples" aria-labelledby="st-rip-h"><header><i class="st-rip-mark big">${icon('ripple')}</i><div><h2 id="st-rip-h">Where this trip led</h2><p>${mine ? 'Friends saved places from your story. Open one to see where it went next.' : 'Friends saved places from this story. Open one to see where it went next.'}</p></div></header><div class="st-rip-row">${posts
    .map((s) => {
      const went = s.ripples.filter((r) => r.went),
        later = went.flatMap((r) => stRipShots(r, '200px').slice(0, 2)).slice(0, 3),
        then = s.photos[0] ? photoTag(s.photos[0].id) : photoTag(s.id),
        faces = `<span class="st-faces">${s.ripples.map((r) => stRipFace(r)).join('')}</span>`;
      const line = went.length
        ? `<strong>${esc(stNames(went.map((r) => r.who)))} went to ${esc(s.name)}</strong><small>${went.length > 1 ? 'One after the other' : esc(went[0].after)} · Day ${s.day + 1}, stop ${s.n}</small>`
        : `<strong>${esc(stNames(s.ripples.map((r) => r.who)))} saved ${esc(s.name)}</strong><small>${esc(s.ripples[0].after)} · Day ${s.day + 1}, stop ${s.n}</small>`;
      return `<button class="st-rip-card${went.length ? ' went' : ''}" data-action="story-ripple" data-i="${s.i}" style="--day:${stColor(s.day)}">${
        went.length
          ? `<span class="st-rip-collage n${later.length + 1}"><span>${then}<em>Then</em></span>${later.map((x, j) => `<span>${x}${j ? '' : `<em>Later</em>`}</span>`).join('')}</span>`
          : `<span class="st-rip-one">${then}</span>`
      }<span class="st-rip-copy">${faces}<span>${line}</span></span></button>`;
    })
    .join(
      '',
    )}</div><p class="st-rip-key"><span class="st-pin rip demo" style="--day:var(--teal)" aria-hidden="true"></span> On the map, a ring spreads from every place that led somewhere. Nothing here is counted or ranked.</p></section>`;
}
const stCommentWord = (n) => `${n} comment${n === 1 ? '' : 's'}`;
// A stop's card in the timeline. The whole card opens the stop's own page (storyStop).
function stStopHtml(s, max) {
  return `<article class="st-stop${s.ripples.length ? ' has-rip' : ''}" id="st-stop-${s.i}" data-i="${s.i}" ${stEditing ? '' : 'data-action="story-stop"'} style="--day:${stColor(s.day)}"><div class="st-time"><b class="st-num" aria-label="Stop ${s.n} of day ${s.day + 1}">${s.n}</b><strong>${s.in}</strong><span>${stDur(s.mins)}</span><i class="st-bar" style="--w:${Math.max(12, Math.round((Math.min(s.mins, max) / max) * 100))}%"></i></div><div class="st-body"><div class="st-head"><h4><button class="inline-link" data-action="story-stop" data-i="${s.i}">${esc(s.name)}</button></h4>${stLinks(s)}</div><p class="st-area">${storyNow?.st.local ? (s.id || s.osm ? esc(s.area) : 'Added by you') : `${esc(s.area)}${s.id ? '' : ' · added by the group'} · ${stAvatar(s.by, 'tiny')} logged by ${esc(s.by.name)}`}</p>${typeof socPickBadge === 'function' ? socPickBadge(storyNow.id, s.id) : ''}${s.note ? `<p class="st-note">${esc(s.note)}</p>` : ''}${
    s.photos.length
      ? `<div class="st-photos n${s.photos.length}">${s.photos.map((x, k) => (stEditing ? edPhotoHtml(s, x, k) : `<button class="st-photo${x.hidden ? ' hid' : ''}" data-action="story-stop" data-i="${s.i}" data-k="${k}" aria-label="Open photo: ${esc(x.caption)}">${photoTag(x.id)}<span class="st-cap">${stAvatar(x.by, 'tiny')} ${esc(x.caption)}${x.hidden ? ' · hidden from viewers' : ''}</span></button>`)).join('')}</div>`
      : ''
  }${stRipLines(s)}${
    stEditing
      ? edStopTools(s)
      : `<div class="st-acts">${stLoveBtn(s)}${stWantBtn(s)}${s.comments.length ? `<button class="st-act st-talk" data-action="story-stop" data-i="${s.i}" data-to="comments">${stCommentWord(s.comments.length)}</button>` : ''}</div>`
  }</div></article>`;
}

function stDayHtml(day, max) {
  let html = `<header class="st-day" id="st-day-${day.i}" data-day="${day.i}" style="--day:${stColor(day.i)}"><span class="eyebrow">Day ${day.i + 1} · ${stDate(day.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span><h3>${esc(day.title)}${stEditing ? `<button class="iconbtn ed-pen" data-action="ed-day" data-day="${day.i}" aria-label="Rename day ${day.i + 1}">${icon('pencil')}</button>` : ''}</h3><p>${esc(day.city)} · ${day.places} ${day.places === 1 ? 'place' : 'places'} · ${stDur(day.mins)} ${day.places === 1 ? 'there' : 'at places'}</p></header>`;
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
  if (stEditing)
    html += `<button class="ed-add" data-action="ed-add" data-day="${day.i}">${icon('plus')} Add a place to Day ${day.i + 1}</button>`;
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
const stRange = (m) => {
  const a = m.days[0].date,
    b = m.days[m.days.length - 1].date,
    last = stDate(b, { day: 'numeric', month: 'short', year: 'numeric' });
  return a === b ? last : `${stDate(a, { day: 'numeric', month: 'short' })} to ${last}`;
};
const stCount = (n, one, many) =>
  `<div><strong>${n}</strong><span>${n === 1 ? one : many}</span></div>`;

// The cover and the facts row, on their own so an edit can redraw them in place.
function stHeroHtml(m) {
  const { st } = m,
    range = stRange(m);
  return `<section class="shared-hero story-hero">${photoTag(st.cover, '', false)}<div class="shared-hero-copy">${st.sample ? '<span class="st-sample">Sample story</span>' : ''}<h1>${esc(st.title)}${stEditing ? `<button class="iconbtn ed-pen light" data-action="ed-title" aria-label="Edit the title">${icon('pencil')}</button>` : ''}</h1><p>${esc(range)} · ${esc(st.blurb)}</p><div class="st-people">${st.travellers.map((t) => stAvatar(t)).join('')}<span>${st.travellers.map((t) => esc(t.name)).join(', ')}</span></div>${stRibbon(m)}</div><span class="hero-credit">${photoCredit(st.cover)}</span>${stEditing ? `<button class="btn small light ed-cover" data-action="ed-cover">${icon('camera')} Change cover</button>` : ''}</section>`;
}
function stFactsHtml(m) {
  const { st, days, stops } = m,
    id = m.id,
    seen = st.travellers.length + st.viewers.length;
  const km = Math.round(m.km / 10) * 10;
  return `<div class="st-facts">${stCount(days.length, 'day', 'days')}${stCount(m.cityIds.length, 'city', 'cities')}${stCount(stops.length, 'place', 'places')}${km ? stCount(km, 'km between stops', 'km between stops') : ''}<button class="st-lock" data-action="story-audience">${icon('info')}<span>${st.local ? 'Only you can see this' : `Only ${seen} people can see this`}</span></button>${st.local ? `<a class="btn small ed-open" href="#/log">${icon('pencil')} Fix it in the log</a>` : ''}${stMine(st) && !stEditing && !st.local ? `<a class="btn small ed-open" href="#/story/${esc(id)}/edit">${icon('pencil')} Edit the story</a>` : ''}</div>`;
}

function renderStory(id) {
  // Opening the editor starts the travellers' shared working copy.
  if (
    location.hash.split('/')[3] === 'edit' &&
    STORIES[id] &&
    stMine(STORIES[id]) &&
    !STORIES[id].local
  )
    edDraft(id);
  const m = storyModel(id);
  if (!m) {
    $('#app').innerHTML =
      `<div class="wrap"><section class="empty"><h1>This story isn't here.</h1><p class="muted">The link may be old, or the story is no longer shared with you.</p><a class="btn" href="#/">Start exploring</a></section></div>`;
    return;
  }
  storyNow = m;
  headerActive('trip');
  const { st, stops, days } = m;
  stEditing = location.hash.split('/')[3] === 'edit' && stMine(st) && !st.local;
  document.body.classList.toggle('st-editing', stEditing);
  document.title = `${st.title} · Tandem Roads`;
  const max = 180;
  const cityMins = m.cityIds.map((cid) => ({
    c: C[cid],
    mins: stops.filter((s) => s.cityId === cid).reduce((a, s) => a + s.mins, 0),
    date: days[stops.find((s) => s.cityId === cid).day].date,
  }));
  const topMins = Math.max(...cityMins.map((x) => x.mins));
  const longest = [...stops].sort((a, b) => b.mins - a.mins).slice(0, 5);
  $('#app').innerHTML =
    `<div class="wrap story-page">` +
    stHeroHtml(m) +
    stFactsHtml(m) +
    (stEditing ? edBanner(m) : stRipStrip(m)) +
    (st.sample && logCan(id) && !stEditing
      ? `<a class="lg-try" href="#/story/${esc(id)}/log">${icon('pin')}<span><strong>Try logging a day</strong><small>Log a place with one tap, or catch up a day from photos.</small></span>${icon('arrow')}</a>`
      : '') +
    `<div class="story-layout"><div class="story-mapcol"><div class="story-mapbox"><div id="story-map" aria-label="Map of the trip route"></div><div class="story-maptools"><button class="btn small" data-action="story-play" id="story-play" aria-pressed="false">${icon('route')}<span>Play the trip</span></button><span class="story-now" id="story-now" aria-live="polite"></span></div></div><div class="chips story-days" id="story-days"><button class="chip st-playchip" data-action="story-play">${icon('route')}<span>Play</span></button><button class="chip active" data-action="story-day" data-id="all">Whole trip</button>${days.map((d) => `<button class="chip" data-action="story-day" data-id="${d.i}"><i class="st-dot" style="--day:${stColor(d.i)}"></i>Day ${d.i + 1}</button>`).join('')}</div></div>` +
    `<div class="story-timeline" id="story-timeline">${days.map((d) => stDayHtml(d, max)).join('')}</div></div>` +
    `<section class="st-after"><div class="st-panel"><h2>Where the time went</h2><div class="st-citybars">${cityMins.map((x) => `<div class="st-citybar"><span>${esc(x.c.name)}</span><i style="--w:${Math.round((x.mins / topMins) * 100)}%"></i><em>${stDur(x.mins)}</em></div>`).join('')}</div><h3>Longest stops</h3><ol class="st-longest">${longest.map((s) => `<li><button class="inline-link" data-action="story-goto" data-i="${s.i}">${esc(s.name)}</button><span>${stDur(s.mins)}</span></li>`).join('')}</ol></div>` +
    `<div class="st-panel"><h2>What this trip left behind</h2><p class="muted">${st.local ? `${esc(st.country)} is now filled in on your map, and your passport has ${cityMins.length} new ${cityMins.length === 1 ? 'stamp' : 'stamps'}.` : `${esc(st.country)} is now filled in on ${st.travellers.length} maps, and each traveller's passport has ${cityMins.length} new stamps.`}</p><div class="st-stamps">${cityMins.map((x, i) => stStamp(x.c, stDate(x.date, { day: 'numeric', month: 'short', year: 'numeric' }), i)).join('')}</div><p class="filter-note">A preview. Maps and passports arrive in a later step.</p></div></section>` +
    (st.sample
      ? `<p class="st-samplenote">${icon('info')} This is a sample. The travellers and their notes are made up, and Tandem Roads' own photos stand in for theirs. Loves and your want-to-go list are saved on this device only.</p>`
      : '') +
    footer() +
    '</div>';
  storyMapInit(m);
  storyWatch();
  if (stEditing) edBar();
  if (stStacked() && location.hash.split('/')[3] === 'tap') storyTap(0);
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
  storyLayers(m);
  m.calm = calm;
  storyFitAll(false);
  const far = () =>
    storyMap.getContainer().parentElement?.classList.toggle('far', storyMap.getZoom() < 10);
  storyMap.on('zoomend', far);
  far();
  // On phones the map credit folds down to a small "i" so it does not cover the route.
  const credit = storyMap.attributionControl.getContainer();
  credit.classList.add('st-credit');
  L.DomEvent.disableClickPropagation(credit);
  credit.addEventListener('click', (e) => {
    if (!e.target.closest('a')) credit.classList.toggle('open');
  });
  setTimeout(() => {
    if (!storyMap) return;
    storyMap.invalidateSize();
    if (storyNow === m && m.active < 0 && !$('.st-tap')) storyFitAll(false);
  }, 120);
}
// Route lines, numbered pins and city labels, in one group so an edit can redraw them in place.
function storyLayers(m) {
  m.layer?.remove();
  m.layer = L.layerGroup().addTo(storyMap);
  const pts = m.stops.map((s) => [s.lat, s.lon]);
  // One line per day, so the day being read stands out from the rest of the route.
  L.polyline(pts, { color: '#6b7a78', weight: 2, opacity: 0.55, dashArray: '2 7' }).addTo(m.layer);
  m.lines = m.days.map((d) =>
    L.polyline(
      m.stops.filter((s) => s.day === d.i).map((s) => [s.lat, s.lon]),
      { color: stColor(d.i), weight: 3, opacity: 0.95, lineJoin: 'round' },
    ).addTo(m.layer),
  );
  m.markers = m.stops.map((s) =>
    L.marker([s.lat, s.lon], {
      title: `Day ${s.day + 1}, stop ${s.n}: ${s.name}${s.ripples.length ? ` · led ${s.ripples.map((r) => stPerson(r.who).name).join(' and ')} here` : ''}`,
      keyboard: false,
      icon: L.divIcon({
        className: '',
        html: `<div class="st-pin${s.ripples.length ? ' rip' : ''}" data-pin="${s.i}" style="--day:${stColor(s.day)}">${s.n}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    })
      .on('click', () => {
        const k = m.slides.findIndex((x) => x.stop === s);
        $('.st-tap') ? storyTap(k) : storyGoto(s.i);
      })
      .addTo(m.layer),
  );
  m.bounds = L.latLngBounds(pts);
  storyCityLabels(m);
}

// Street tiles from OpenStreetMap, the same as every other map in the app. They label places in
// the local script; English labels everywhere would need a keyed provider (Esri asks for a key).
function storyTiles(map = storyMap) {
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    maxZoom: 19,
    updateWhenIdle: true,
  }).addTo(map);
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
      .addTo(m.layer);
  });
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
  m.io = new IntersectionObserver(
    (entries) => {
      const hit = entries.filter((e) => e.isIntersecting).pop();
      if (hit && window.scrollY > 40 && Date.now() > (m.hold || 0))
        storyActive(Number(hit.target.dataset.i));
    },
    {
      rootMargin: matchMedia('(max-width: 900px)').matches
        ? '-60% 0px -25% 0px'
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
  $$('.st-pin[data-pin]').forEach((el) =>
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
    stacked = stStacked();
  // Measured from where the map sits once pinned, which it may not be yet near the top of the page.
  const col = $('.story-mapcol');
  const offset = stacked
    ? parseFloat(getComputedStyle(col).top) + col.offsetHeight + 12
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
// Tap-through, for phones: the live map stays on top and follows along, while the lower half
// shows one day or one stop at a time. The page's own map is borrowed while this is open.
function storyTap(k) {
  const m = storyNow;
  if (!m || !storyMap) return;
  storyPlay(false);
  if (k >= m.slides.length) {
    storyTapClose(false);
    $('.st-after')?.scrollIntoView({ block: 'start' });
    return;
  }
  k = Math.max(0, k);
  m.tap = k;
  let el = $('.st-tap');
  if (!el) {
    el = document.createElement('div');
    el.className = 'st-tap';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'The trip, one stop at a time');
    el.innerHTML = `<div class="st-tap-top"><div class="st-tap-bars"></div><div class="st-tap-head"><span></span><button class="st-tap-x" data-action="story-tap-close" aria-label="Close">${icon('close')}</button></div></div><div class="story-mapbox st-tap-map"></div><div class="st-tap-card"></div>`;
    m.tapFocus = document.activeElement;
    // On a phone a stop first peeks up to about half height, so the map and the day stay in
    // view; scrolling the stop, or tapping its top bar, brings it up to full height.
    if (matchMedia('(max-width: 760px)').matches) el.classList.add('peek');
    document.body.append(el);
    document.body.classList.add('st-noscroll');
    el.querySelector('.st-tap-map').append($('#story-map'));
    storyMap.invalidateSize();
    storyMap.fire('zoomend');
    el.querySelector('.st-tap-x').focus({ preventScroll: true });
  }
  const { cover, day, stop } = m.slides[k];
  const mine = cover ? [m.slides[0]] : m.slides.filter((x) => x.day === day),
    at = mine.indexOf(m.slides[k]);
  const dayStops = cover ? [] : m.stops.filter((s) => s.day === day.i);
  const shot = stop ? stop.photos[0] : dayStops.flatMap((s) => s.photos)[0];
  let copy;
  if (cover)
    copy = `<p class="st-tap-when">${esc(stRange(m))}</p><h2>${esc(m.st.title)}</h2><p class="st-tap-area">${esc(m.st.blurb)}</p>${stRibbon(m)}<p class="st-tap-hint">Tap to start ${icon('arrow')}</p>`;
  else if (stop)
    copy = `<p class="st-tap-when"><b class="st-num">${stop.n}</b>${stop.in} · ${stDur(stop.mins)} here</p><h2>${esc(stop.name)}</h2>${stop.note ? `<p class="st-tap-note">${esc(stop.note)}</p>` : ''}<p class="st-tap-by">${stAvatar(shot ? shot.by : stop.by, 'tiny')} ${shot ? esc(shot.caption) : 'Logged by ' + esc(stop.by.name)} · ${esc(stop.area)}</p>${stop.ripples.length ? `<p class="st-tap-rip">${icon('ripple')} ${stop.ripples.map(stRipText).join(' · ')}</p>` : ''}<div class="st-tap-acts"><button class="st-act" data-action="story-stop" data-i="${stop.i}">${icon('list')}<span>${stop.comments.length ? stCommentWord(stop.comments.length) : 'Details'}</span></button>${stLinks(stop)}</div>`;
  else
    copy = `<p class="st-tap-when">Day ${day.i + 1} of ${m.days.length} · ${stDate(day.date, { weekday: 'short', day: 'numeric', month: 'short' })}</p><h2>${esc(day.title)}</h2><p class="st-tap-area">${esc(day.city)} · ${day.places} ${day.places === 1 ? 'place' : 'places'} · ${stDur(day.mins)} ${day.places === 1 ? 'there' : 'at places'}</p><ol class="st-tap-list">${dayStops.map((s) => `<li><b class="st-num">${s.n}</b>${esc(s.name)}</li>`).join('')}</ol>`;
  el.style.setProperty('--day', cover ? 'var(--teal)' : stColor(day.i));
  el.querySelector('.st-tap-bars').innerHTML = mine
    .map((_, i) => `<i class="${i <= at ? 'on' : ''}"></i>`)
    .join('');
  el.querySelector('.st-tap-head span').textContent = cover
    ? 'The whole trip'
    : `Day ${day.i + 1} · ${day.title}`;
  const bg = cover ? photoTag(m.st.cover, '', false) : shot ? photoTag(shot.id, '', false) : '';
  el.querySelector('.st-tap-card').innerHTML =
    `<div class="st-tap-bg ${bg ? '' : 'plain'}">${bg}</div>` +
    `<button class="st-tap-zone prev" data-action="story-tap-prev" aria-label="Back"></button><button class="st-tap-zone next" data-action="story-tap-next" aria-label="Next"></button>` +
    `<div class="st-tap-copy">${copy}</div>`;
  // The map follows: whole route on the cover, the day's stops on a day, then each stop in turn.
  clearTimeout(m.fly);
  if (stop) {
    m.active = -1;
    m.hold = 0;
    storyActive(stop.i);
    return;
  }
  m.active = -1;
  $$('.st-stop.active, .st-pin.active').forEach((x) => x.classList.remove('active'));
  storyDayLines(cover ? -1 : day.i);
  if (cover) storyFitAll(!m.calm);
  else
    storyMap.fitBounds(L.latLngBounds(dayStops.map((s) => [s.lat, s.lon])), {
      padding: [36, 36],
      maxZoom: 14,
      animate: !m.calm,
    });
}
// Closing hands the map back to the page and leaves the page at the stop you had reached.
function storyTapClose(follow = true) {
  const el = $('.st-tap'),
    m = storyNow;
  if (!el || !m) return;
  $('.story-mapcol .story-mapbox').prepend($('#story-map'));
  el.remove();
  document.body.classList.remove('st-noscroll');
  storyMap.invalidateSize();
  storyMap.fire('zoomend');
  m.tapFocus?.focus?.({ preventScroll: true });
  const { day, stop } = m.slides[m.tap] || {};
  if (!follow || !day) return;
  if (stop) {
    m.active = -1;
    storyGoto(stop.i);
  } else storyDay(String(day.i));
}
// The panel that a stop or a ripple opens in, over the story. One history entry, so Back closes it.
function stSheetEl() {
  let el = $('.st-sheet');
  if (!el) {
    el = document.createElement('div');
    el.className = 'st-sheet';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    storyNow.sheetFocus = document.activeElement;
    // On a phone a stop first peeks up to about half height, so the map and the day stay in
    // view; scrolling the stop, or tapping its top bar, brings it up to full height.
    if (matchMedia('(max-width: 760px)').matches) el.classList.add('peek');
    document.body.append(el);
    document.body.classList.add('st-noscroll');
    history.pushState({ ...(history.state || {}), roamStop: 1 }, '');
  }
  el.querySelector('.st-sheet-panel')?.classList.remove('rip');
  return el;
}
// A ripple, opened: the stop at the centre and rings spreading out to everyone it reached, then
// each of their visits as a post with their photos and words, in the order it happened.
function storyRipple(i) {
  const m = storyNow;
  if (!m) return;
  storyPlay(false);
  const s = m.stops[i];
  if (!s?.ripples.length) return storyStop(i);
  const el = stSheetEl();
  el.classList.remove('peek');
  m.sheet = i;
  el.setAttribute('aria-label', 'Where ' + s.name + ' led');
  el.style.setProperty('--day', stColor(s.day));
  const gen = (r, seen = 0) => {
      const via = r.from && s.ripples.find((x) => x.who === r.from);
      return via && seen < 4 ? 1 + gen(via, seen + 1) : 1;
    },
    rings = Math.max(...s.ripples.map((r) => gen(r))),
    when = stDate(m.days[s.day].date, { month: 'long', year: 'numeric' });
  // Faces sit on their ring, spread round it, ring by ring. A line runs to each face from
  // whoever sent them: the stop itself, or the friend whose photos they saw.
  const at = new Map(),
    spots = s.ripples.map((r, j) => {
      const g = gen(r),
        same = s.ripples.filter((x) => gen(x) === g),
        k = same.indexOf(r),
        a = (-90 + 70 * (k - (same.length - 1) / 2) + (g - 1) * 50) * (Math.PI / 180),
        rad = g > 1 ? 140 : 96,
        x = Math.round(rad * Math.cos(a)),
        y = Math.round(rad * Math.sin(a));
      at.set(r.who, [x, y]);
      return `<span class="st-spread-face ${r.went ? 'went' : ''}" style="--x:${x}px;--y:${y}px;--d:${0.35 + 0.45 * g + 0.1 * j}s">${stRipFace(r)}<small>${esc(stPerson(r.who).name)}</small></span>`;
    });
  const lines = s.ripples
    .map((r, j) => {
      const [x, y] = at.get(r.who),
        [x0, y0] = (r.from && at.get(r.from)) || [0, 0];
      return `<line x1="${x0}" y1="${y0}" x2="${x}" y2="${y}" pathLength="1" style="--d:${0.3 + 0.45 * gen(r) + 0.1 * j}s" class="${r.went ? 'went' : ''}"/>`;
    })
    .join('');
  const photos = (list) =>
    `<div class="st-rip-photos">${list.map((x) => `<figure>${x}</figure>`).join('')}</div>`;
  const posts = [
    `<li class="st-rip-post origin"><header><span class="st-faces">${m.st.travellers.map((t) => stAvatar(t, 'tiny')).join('')}</span><span><strong>${esc(stNames(m.st.travellers.map((t) => t.id)))}</strong><small>${esc(when)} · Day ${s.day + 1}, stop ${s.n} of this trip</small></span></header>${photos(s.photos.length ? s.photos.map((x) => photoTag(x.id, '', false)) : [photoTag(s.id)])}${s.note ? `<p>${esc(s.note)}</p>` : ''}</li>`,
    ...s.ripples.map((r) => {
      const who = stPerson(r.who).name,
        via = r.from ? `through ${esc(stPerson(r.from).name)}’s photos` : 'from this story';
      return r.went
        ? `<li class="st-rip-post went" style="--g:${gen(r)}"><header>${stRipFace(r)}<span><strong>${esc(who)} went</strong><small>${esc(r.when)} · ${esc(r.after)}, saved ${via}</small></span></header>${photos(stRipShots(r, '(max-width: 700px) 80vw, 520px'))}${r.note ? `<p>${esc(r.note)}</p>` : ''}</li>`
        : `<li class="st-rip-post saved" style="--g:${gen(r)}"><header>${stRipFace(r)}<span><strong>${esc(who)} saved it</strong><small>${esc(r.when)} · ${esc(r.after)}, ${via}</small></span></header></li>`;
    }),
  ];
  el.innerHTML = `<div class="st-sheet-panel rip"><header class="st-sheet-bar"><button class="iconbtn" data-action="story-stop-close" aria-label="Back to the trip">${icon('left')}</button><span>${icon('ripple')} Where this place led</span><span class="st-sheet-nav"><button class="st-act" data-action="story-stop" data-i="${i}">${icon('list')}<span>The stop</span></button></span></header><div class="st-sheet-scroll"><section class="st-spread rings${rings}" aria-label="${esc(s.name)} reached ${esc(stNames(s.ripples.map((r) => r.who)))}"><svg class="st-spread-lines" viewBox="-200 -165 400 330" aria-hidden="true">${lines}</svg><span class="st-spread-ring r1"></span>${rings > 1 ? '<span class="st-spread-ring r2"></span>' : ''}<span class="st-spread-core">${s.photos[0] ? photoTag(s.photos[0].id) : photoTag(s.id)}</span>${spots.join('')}</section><div class="st-sheet-body"><h2>${esc(s.name)}</h2><p class="st-area">${esc(s.area)} · reached ${esc(stNames(s.ripples.map((r) => r.who)))} so far</p><ol class="st-rip-tl">${posts.join('')}</ol><p class="filter-note">${m.st.sample ? 'A sample: the later photos are Wikimedia Commons pictures of the same place.' : ''}</p></div></div></div>`;
  el.querySelector('.iconbtn').focus({ preventScroll: true });
}
// A stop's own page: its photos, the note, who loved it and what people said. Opens over the
// timeline or the tap-through view, so looking closer never leaves the trip.
function storyStop(i, k = 0, to = '') {
  const m = storyNow;
  if (!m) return;
  storyPlay(false);
  const s = m.stops[i],
    day = m.days[s.day],
    dayStops = m.stops.filter((x) => x.day === s.day);
  const el = stSheetEl();
  m.sheet = i;
  el.setAttribute('aria-label', s.name);
  el.style.setProperty('--day', stColor(s.day));
  const n = s.photos.length;
  el.innerHTML = `<div class="st-sheet-panel"><header class="st-sheet-bar"><button class="iconbtn" data-action="story-stop-close" aria-label="Back to the trip">${icon('left')}</button><span><b class="st-num">${s.n}</b>Day ${s.day + 1} · stop ${s.n} of ${dayStops.length}</span><span class="st-sheet-nav"><button class="iconbtn" data-action="story-stop" data-i="${i - 1}" aria-label="Previous stop" ${i ? '' : 'disabled'}>${icon('up')}</button><button class="iconbtn" data-action="story-stop" data-i="${i + 1}" aria-label="Next stop" ${i < m.stops.length - 1 ? '' : 'disabled'}>${icon('down')}</button></span></header><div class="st-sheet-scroll">${
    n
      ? `<div class="st-sheet-photos" id="st-sheet-photos">${s.photos.map((x) => `<figure><button data-action="story-photo" data-id="${x.id}" aria-label="Zoom photo: ${esc(x.caption)}">${photoTag(x.id, '', false)}</button><figcaption>${stAvatar(x.by, 'tiny')}<span>${esc(x.caption)}</span><small>${esc(x.by.name)}</small></figcaption></figure>`).join('')}</div>${n > 1 ? `<div class="st-sheet-dots" aria-hidden="true">${s.photos.map((_, j) => `<i class="${j === k ? 'on' : ''}"></i>`).join('')}</div>` : ''}`
      : ''
  }<div class="st-sheet-body"><div class="st-head"><h2>${esc(s.name)}</h2>${stLinks(s)}</div>${localName(s)}<p class="st-area">${esc(s.area)} · ${esc(day.city)}${s.id ? '' : ' · added by the group'}</p><p class="st-sheet-time"><strong>${s.in} to ${s.out}</strong> · ${stDur(s.mins)} here · ${stAvatar(s.by, 'tiny')} logged by ${esc(s.by.name)}</p>${typeof socPickBadge === 'function' ? socPickBadge(storyNow.id, s.id) : ''}${s.note ? `<p class="st-sheet-note">${esc(s.note)}</p>` : ''}${s.id ? `<div class="st-acts"><button class="st-act" data-action="place" data-id="${s.id}">${icon('book')}<span>Guide entry</span></button></div>` : ''}${stRipSheet(s)}<section class="st-sheet-talk" id="st-sheet-talk"><h3>${s.comments.length ? stCommentWord(s.comments.length) : 'No comments yet'}</h3>${
    s.comments.length
      ? `<ul>${s.comments.map((c) => `<li><span class="st-avatar tiny" style="--who:var(--muted)" aria-hidden="true">${esc(c.by[0])}</span><div><strong>${esc(c.by)}</strong><p>${esc(c.text)}</p></div></li>`).join('')}</ul>`
      : ''
  }<p class="filter-note">${m.st.sample ? 'This is a sample, so you cannot add a comment yet. Commenting opens with accounts.' : ''}</p></section></div></div><footer class="st-sheet-foot st-acts">${stLoveBtn(s)}${stWantBtn(s)}<button class="st-act st-talk" data-action="story-stop" data-i="${i}" data-k="${k}" data-to="comments" aria-label="${s.comments.length ? stCommentWord(s.comments.length) : 'Comment'}">${icon('chat')}<span>${s.comments.length || 'Comment'}</span></button></footer></div>`;
  const row = $('#st-sheet-photos');
  if (row) {
    row.scrollLeft = k * row.clientWidth;
    row.addEventListener(
      'scroll',
      () => {
        const at = Math.round(row.scrollLeft / row.clientWidth);
        $$('.st-sheet-dots i').forEach((d, j) => d.classList.toggle('on', j === at));
      },
      { passive: true },
    );
  }
  const grow = () => el.classList.remove('peek');
  el.querySelector('.st-sheet-scroll').addEventListener(
    'scroll',
    (e) => e.target.scrollTop > 2 && grow(),
    { passive: true },
  );
  el.querySelector('.st-sheet-bar').addEventListener(
    'click',
    (e) => !e.target.closest('button') && grow(),
  );
  if (to === 'comments') {
    grow();
    $('#st-sheet-talk').scrollIntoView({ block: 'start' });
  }
  el.querySelector('.iconbtn').focus({ preventScroll: true });
}
function stRipSheet(s) {
  if (!s.ripples.length) return '';
  return `<section class="st-sheet-rip"><h3>${icon('ripple')} Where this place led <button class="inline-link" data-action="story-ripple" data-i="${s.i}">See it spread</button></h3>${s.ripples
    .map((r) =>
      r.went
        ? `<div class="st-sheet-pair"><figure>${s.photos[0] ? photoTag(s.photos[0].id) : photoTag(s.id)}<figcaption>${stAvatar(s.by, 'tiny')} ${esc(s.by.name)}'s trip · ${esc(stDate(storyNow.days[s.day].date, { month: 'long', year: 'numeric' }))}</figcaption></figure><figure>${stRipLater(r)}<figcaption>${stRipFace(r)} ${esc(stPerson(r.who).name)} · ${esc(r.when)}</figcaption></figure></div><p class="st-sheet-ripnote">${stRipText(r)}, after saving it from this story.${r.note ? ` <q>${esc(r.note)}</q>` : ''}</p>`
        : `<p class="st-sheet-ripnote">${stRipFace(r)} ${stRipText(r)}. Saved from this story.</p>`,
    )
    .join('')}</section>`;
}
function storyStopClose(how = 'user') {
  const el = $('.st-sheet'),
    m = storyNow;
  if (!el) return;
  el.remove();
  if (!$('.st-tap')) document.body.classList.remove('st-noscroll');
  if (how !== 'history' && history.state?.roamStop) history.back();
  if (!m) return;
  // Leave whatever is underneath on the stop that was last open.
  if ($('.st-tap')) storyTap(m.slides.findIndex((x) => x.stop?.i === m.sheet));
  else if (how !== 'leave') storyGoto(m.sheet);
  m.sheetFocus?.focus?.({ preventScroll: true });
}
window.addEventListener('popstate', () => {
  if ($('.st-sheet') && !history.state?.roamStop) storyStopClose('history');
});
function storyAudience() {
  const { st } = storyNow;
  if (st.local)
    return showModal(
      `<div class="modalcontent"><h2 id="modal-heading">Only you can see this</h2><p class="lead">This story is built from your log, which is saved on this phone and nowhere else.</p><ul class="st-rules"><li>Nobody else can open it, and there is no link to it.</li><li>When accounts arrive, you and your travel group decide together who sees your trip, and it starts visible to the travellers only.</li><li>Clearing this browser's data clears the log and its photos.</li></ul><div class="actions"><button class="btn" data-action="close-modal">Got it</button></div></div>`,
      'Who can see this trip',
    );
  showModal(
    `<div class="modalcontent"><h2 id="modal-heading">Who can see this trip</h2><p class="lead">The travellers decide together, and nobody else can open it.</p><ul class="st-rules"><li><strong>Travellers:</strong> ${st.travellers.map((t) => esc(t.name)).join(', ')}.</li><li><strong>Invited viewers:</strong> ${st.viewers.map(esc).join(', ')}. Each one was approved by every traveller.</li><li>A trip starts visible to its travellers only.</li><li>Opening it up needs a yes from everyone. Any one traveller can close it again at once.</li><li>Any traveller can hide a photo from viewers.</li><li>There are no public links.</li></ul><p class="filter-note">In this sample the people are made up. The rules are the ones Tandem Roads will use.</p><div class="actions"><button class="btn" data-action="close-modal">Got it</button></div></div>`,
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
  $$(`[data-action="story-love"][data-i="${i}"]`).forEach((x) => {
    x.classList.toggle('on', on);
    x.setAttribute('aria-pressed', String(on));
    x.querySelector('span').textContent = storyNow.stops[i].loves + (on ? 1 : 0);
  });
}
function storyWant(id) {
  toggleSave(id, true);
  const on = saved(id),
    st = storyNow.st;
  if (on) {
    const others = st.travellers.filter((t) => t.id !== stMe()).map((t) => t.name);
    toast(
      stMine(st)
        ? 'On your list.'
        : `On your list. ${others.length > 1 ? others.slice(0, -1).join(', ') + ' and ' + others.at(-1) : others[0]} will see that their story sent you here.`,
    );
  } else toast('Taken off your list.');
  $$(`[data-action="story-want"][data-id="${id}"]`).forEach((b) => {
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
    b.innerHTML = `${icon(on ? 'check' : 'plus')}<span>${on ? 'On my list' : 'Want to go'}</span>`;
    // A ring spreads out from the button: the ripple starting.
    if (on && !storyNow.calm) {
      b.classList.remove('rippling');
      void b.offsetWidth;
      b.classList.add('rippling');
    }
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
  $('.st-sheet')?.remove();
  $('.ed-bar')?.remove();
  stEditing = false;
  document.body.classList.remove('st-noscroll', 'nav-away', 'st-editing');
  // Leaving mid zoom would let Leaflet's end-of-zoom timer run on a removed map, so end it first.
  if (storyMap?._animatingZoom) storyMap._onZoomTransitionEnd();
  storyMap?.remove();
  storyMap = null;
  storyNow = null;
}
// The home page's small door into the sample story, beside Help me choose.
function storyTile() {
  const id = Object.keys(STORIES)[0],
    st = STORIES[id];
  if (!st) return '';
  return `<a class="hq hq-story" href="#/story/${id}">${photoTag(st.cover)}<span><strong>Trip stories</strong><small>A Japan sample</small></span></a>`;
}
let stLastTap = 0,
  stTapTimer;
// A heart pops on the photo. Double-tapping only ever adds a love; the heart button takes it back.
function stDoubleLove(b) {
  const i = storyNow.sheet;
  if (i == null) return;
  if (!stLoves().has(storyNow.id + ':' + i)) storyLove(i);
  b.querySelector('.st-pop')?.remove();
  b.insertAdjacentHTML(
    'beforeend',
    `<span class="st-pop" aria-hidden="true">${icon('heart')}</span>`,
  );
  setTimeout(() => b.querySelector('.st-pop')?.remove(), 900);
  try {
    navigator.vibrate?.(12);
  } catch {}
}
document.addEventListener('click', (e) => {
  // A tap on the dimmed trip around an open stop closes it, like pressing back.
  if (storyNow && e.target.matches('.st-sheet')) return storyStopClose();
  const b = e.target.closest('[data-action^="story-"]');
  if (!b || !storyNow) return;
  // On a card, its own buttons and links act for themselves; anywhere else opens the stop.
  if (b.matches('.st-stop') && e.target.closest('a, button')) return;
  const a = b.dataset.action;
  if (a === 'story-play') {
    // Phones get the tap-through view, picking up from the stop being read.
    if (stStacked())
      storyTap(
        Math.max(
          0,
          storyNow.slides.findIndex((x) => x.stop?.i === storyNow.active),
        ),
      );
    else storyPlay(!storyNow.timer);
  } else if (a === 'story-tap-next') storyTap(storyNow.tap + 1);
  else if (a === 'story-tap-prev') storyTap(storyNow.tap - 1);
  else if (a === 'story-tap-close') storyTapClose();
  else if (a === 'story-day') storyDay(b.dataset.id);
  else if (a === 'story-goto') storyGoto(Number(b.dataset.i));
  else if (a === 'story-audience') storyAudience();
  else if (a === 'story-love') storyLove(Number(b.dataset.i), b);
  else if (a === 'story-want') storyWant(b.dataset.id);
  else if (a === 'story-photo') {
    // Two quick taps love the stop, as on Instagram; one tap still opens the photo, a moment later.
    clearTimeout(stTapTimer);
    if (Date.now() - stLastTap < 300) {
      stLastTap = 0;
      stDoubleLove(b);
    } else {
      stLastTap = Date.now();
      stTapTimer = setTimeout(() => openViewer(b.dataset.id, 0), 300);
    }
  } else if (a === 'story-stop' && b.closest('.st-sheet-foot')) {
    $('.st-sheet')?.classList.remove('peek');
    $('#st-sheet-talk')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  } else if (a === 'story-stop')
    storyStop(Number(b.dataset.i), Number(b.dataset.k || 0), b.dataset.to || '');
  else if (a === 'story-stop-close') storyStopClose();
  else if (a === 'story-ripple') storyRipple(Number(b.dataset.i));
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
  if (storyNow && $('.st-sheet')) {
    if (e.key === 'Escape' && !$('.viewer')) storyStopClose();
    return;
  }
  if (!storyNow || !$('.st-tap')) return;
  if (e.key === 'ArrowRight') storyTap(storyNow.tap + 1);
  else if (e.key === 'ArrowLeft') storyTap(storyNow.tap - 1);
  else if (e.key === 'Escape') storyTapClose();
});
// In a story the bottom bar steps aside while you read down and returns when you scroll back up.
let stLastY = 0;
window.addEventListener(
  'scroll',
  () => {
    const y = scrollY;
    if (storyNow && Math.abs(y - stLastY) > 10)
      document.body.classList.toggle('nav-away', y > stLastY && y > 120);
    if (Math.abs(y - stLastY) > 10) stLastY = y;
  },
  { passive: true },
);
