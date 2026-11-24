// Feed, profiles and account settings. There are no accounts yet, so these pages run on made-up
// people (data/social.json, the travellers and viewers of the sample stories) and the visitor
// plays one of them. Everything a visitor changes here is kept on this device only.
//
// The standing rule for all of it: numbers describe your travels, never your popularity, and
// people are never sorted by a number. So hearts show as faces, there are no follower or heart
// totals, the feed is in time order and ends, and travel counts appear on your own profile only.
const SOCIAL = DATA.social || { me: '', people: {}, needs: [], feed: [], ripples: [] };
const SOC_KEY = 'tandem-social-v1';
// Country names in the guide that are spelled differently in the world outline file.
const SOC_WORLD = {
  Türkiye: 'Turkey',
  'United States': 'United States of America',
  Tanzania: 'United Republic of Tanzania',
};
const SOC_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
let socMaps = [],
  socIO = null,
  socSpecs = {},
  socOnFeed = false;

function socDefaults() {
  return {
    done: {},
    hearts: [],
    hidden: [],
    muted: [],
    blocked: [],
    // The two oldest items start as already seen, so the "Earlier" divider has something under it.
    seen: ['f-pick-afuri', 'f-jo-line'],
    lookOff: false,
    lookSkip: [],
    profile: {},
    styleHidden: false,
    next: {},
    // Polls you started, by id: { options: [city ids], to: [friend ids] }.
    polls: {},
    weekly: true,
    replies: true,
  };
}
function socLoad() {
  const d = socDefaults();
  try {
    const s = JSON.parse(localStorage.getItem(SOC_KEY) || 'null');
    if (s && typeof s === 'object' && !Array.isArray(s))
      for (const k of Object.keys(d)) {
        if (Array.isArray(d[k])) {
          if (Array.isArray(s[k])) d[k] = s[k].filter((x) => typeof x === 'string').slice(0, 200);
        } else if (typeof d[k] === 'boolean') {
          if (typeof s[k] === 'boolean') d[k] = s[k];
        } else if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) d[k] = s[k];
      }
  } catch {}
  return d;
}
let SOCS = socLoad();
function socSave() {
  try {
    localStorage.setItem(SOC_KEY, JSON.stringify(SOCS));
  } catch {}
}

const socMe = () => SOCIAL.me;
// A person, with this device's own profile edits laid over the sample for "you".
function socPerson(id) {
  const p = SOCIAL.people[id];
  if (!p) return null;
  if (id !== socMe()) return { id, ...p };
  const e = SOCS.profile || {};
  const text = (k, max) =>
    typeof e[k] === 'string' && e[k].trim() ? e[k].trim().slice(0, max) : p[k];
  return {
    id,
    ...p,
    name: text('name', 30),
    home: text('home', 40),
    line: typeof e.line === 'string' ? e.line.trim().slice(0, 90) : p.line,
    style: Array.isArray(e.style)
      ? e.style.filter((x) => typeof x === 'string' && x.trim()).slice(0, 4)
      : p.style,
  };
}
const socFriends = () =>
  Object.keys(SOCIAL.people).filter((id) => id !== socMe() && !SOCS.blocked.includes(id));
const socName = (id) => (id === socMe() ? 'You' : socPerson(id)?.name || '');
function socList(names) {
  if (names.length < 2) return names[0] || '';
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}
function socAvatar(id, cls = '') {
  const p = socPerson(id);
  if (!p) return '';
  return `<span class="st-avatar soc-av ${cls}" style="--who:${esc(p.color)}" aria-hidden="true">${esc(p.name[0] || '?')}</span>`;
}
const socFaceRow = (ids) =>
  `<span class="soc-faces">${ids.map((id) => socAvatar(id)).join('')}</span>`;
function socSince(p) {
  const [y, m] = p.since.split('-').map(Number);
  return `${SOC_MONTHS[m - 1]} ${y}`;
}
const socMonth = (ym) => SOC_MONTHS[Number(ym.split('-')[1]) - 1];
const socSample = () => '<span class="soc-sample">Sample</span>';
const socPossessive = (name) => name + (name.endsWith('s') ? '’' : '’s');
// A story is listed for you only if you travelled on it or its travellers let you see it.
function socCanSee(storyId) {
  const st = STORIES[storyId],
    me = SOCIAL.people[socMe()]?.name;
  if (!st) return false;
  return st.travellers.some((t) => t.id === socMe()) || (st.viewers || []).includes(me);
}
function socStoryStops(storyId) {
  const st = STORIES[storyId];
  if (!st) return [];
  return st.days.flatMap((d) =>
    d.stops
      .filter((s) => !s.leg)
      .map((s) => {
        const p = s.place ? P[s.place] : null;
        return {
          id: p?.id || '',
          name: p?.name || s.name,
          cityId: p?.cityId || s.city,
          lat: p?.lat ?? s.lat,
          lon: p?.lon ?? s.lon,
          loves: s.loves || 0,
          note: s.note || '',
        };
      })
      .filter((s) => Number.isFinite(s.lat)),
  );
}
// Needs-you items still waiting on this person. Shown as the small number on the Feed tab: it
// counts things to do, not attention received.
function socNeeds() {
  return SOCIAL.needs.filter(
    (n) => !Object.hasOwn(SOCS.done, n.id) && !SOCS.blocked.includes(n.by),
  );
}
function socHeader() {
  const n = socNeeds().length;
  $$('.feed-count').forEach((e) => {
    e.textContent = n;
    e.toggleAttribute('data-zero', !n);
  });
  const me = socPerson(socMe());
  $$('.me-link').forEach((a) => {
    if (me) a.innerHTML = socAvatar(me.id);
    a.hidden = !me;
  });
}

// ---------------------------------------------------------------- maps
// Small maps on feed cards: where, at a glance. They do not pan or zoom, so the page scrolls
// freely over them, and they are only built when a card comes near the screen.
function socTiles(map) {
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
    if (++failed < 4 || loaded || !socMaps.includes(map)) return;
    english.off('tileerror');
    map.removeLayer(english);
    osm().addTo(map);
  });
  english.addTo(map);
}
function socBaseMap(el, opts) {
  // No animations: these maps are glances, and a page change mid-animation trips Leaflet.
  const map = L.map(el, {
    minZoom: 1,
    maxZoom: 16,
    zoomSnap: 0.25,
    zoomAnimation: false,
    fadeAnimation: false,
    markerZoomAnimation: false,
    ...opts,
  });
  map.createPane('offline-outline');
  map.getPane('offline-outline').style.zIndex = '150';
  map.attributionControl.setPrefix(false);
  // The credit folds down to a small "i" so nothing sits on the map.
  const credit = map.attributionControl.getContainer();
  credit.classList.add('soc-credit');
  L.DomEvent.disableClickPropagation(credit);
  credit.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!e.target.closest('a')) credit.classList.toggle('open');
  });
  socMaps.push(map);
  return map;
}
function socCardMap(el) {
  const spec = socSpecs[el.dataset.map];
  if (!spec || !el.isConnected || el._leaflet_id || typeof L === 'undefined') return;
  const map = socBaseMap(el, {
    zoomControl: false,
    dragging: false,
    touchZoom: false,
    doubleClickZoom: false,
    scrollWheelZoom: false,
    boxZoom: false,
    keyboard: false,
  });
  L.geoJSON(DATA.world, {
    pane: 'offline-outline',
    style: outlineStyle(),
    interactive: false,
  }).addTo(map);
  if (S.street && navigator.onLine) socTiles(map);
  const pts = spec.points.map((p) => [p.lat, p.lon]);
  if (spec.line && pts.length > 1)
    L.polyline(pts, { color: '#e7764b', weight: 3, opacity: 0.9, lineJoin: 'round' }).addTo(map);
  spec.points.forEach((p, i) =>
    L.marker([p.lat, p.lon], {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: '',
        html: `<div class="soc-pin${spec.numbered ? '' : ' dot'}">${spec.numbered ? i + 1 : ''}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
    }).addTo(map),
  );
  if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [34, 34], maxZoom: 14 });
  else map.setView(pts[0], spec.zoom || 13);
}
function socWatchMaps() {
  socIO?.disconnect();
  const els = $$('.soc-map[data-map]');
  if (!('IntersectionObserver' in window)) return els.forEach(socCardMap);
  socIO = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        socIO.unobserve(e.target);
        socCardMap(e.target);
      }),
    { rootMargin: '300px 0px' },
  );
  els.forEach((el) => socIO.observe(el));
}
// Called by the router before every page change.
function socLeave() {
  socIO?.disconnect();
  socIO = null;
  socMaps.forEach((m) => m.remove());
  socMaps = [];
  socSpecs = {};
  if (socOnFeed) {
    // Everything on the page has now been seen, so nothing is marked new on the next visit.
    SOCS.seen = [...new Set([...SOCS.seen, ...SOCIAL.feed.map((f) => f.id)])];
    socSave();
    socOnFeed = false;
  }
}

// ---------------------------------------------------------------- feed
function socNeedHtml(n) {
  const by = socPerson(n.by);
  const head = (label, sub) =>
    `<header class="soc-need-head">${socAvatar(n.by)}<div><span class="eyebrow">${label}</span><p>${sub}</p></div></header>`;
  if (n.kind === 'poll')
    return `<article class="soc-need" data-need="${n.id}">${head(
      'Poll · ' + esc(n.trip),
      `${esc(by.name)} asks · ${esc(n.closes)}`,
    )}<h3>${esc(n.question)}</h3><div class="soc-options">${n.options
      .map((o, k) => {
        const voters = Object.keys(n.votes).filter((id) => n.votes[id] === k);
        return `<button class="soc-option" data-action="soc-vote" data-id="${n.id}" data-k="${k}"><span>${esc(o)}</span>${socFaceRow(voters)}</button>`;
      })
      .join(
        '',
      )}</div><p class="soc-fine">Names show on planning polls. Still to answer: you and ${esc(socList(n.waiting.map(socName)))}.</p></article>`;
  if (n.kind === 'dream' || n.kind === 'pick') {
    const label = (o) => (n.kind === 'dream' ? C[o]?.name : P[o]?.name) || '';
    const st = n.story ? STORIES[n.story] : null;
    return `<article class="soc-need" data-need="${n.id}">${head(
      n.kind === 'dream' ? 'Where next?' : 'After the trip · ' + esc(st?.title || ''),
      `${esc(by.name)} asks · ${esc(n.closes)}`,
    )}<h3>${esc(n.question)}</h3><div class="soc-options${n.kind === 'pick' ? ' pics' : ''}">${n.options
      .filter((o) => label(o))
      .map((o) => {
        const k = n.options.indexOf(o),
          voters = Object.keys(n.votes).filter((id) => n.votes[id] === k);
        return `<button class="soc-option" data-action="soc-vote" data-id="${n.id}" data-k="${k}">${n.kind === 'pick' ? photoTag(o) : ''}<span>${esc(label(o))}</span>${socFaceRow(voters)}</button>`;
      })
      .join('')}</div><p class="soc-fine">${
      n.kind === 'pick'
        ? 'The winner is marked as the group’s pick on that stop in the story.'
        : 'Names show. The winner can become a trip with everyone who voted.'
    }</p></article>`;
  }
  if (n.kind === 'budget')
    return `<article class="soc-need" data-need="${n.id}">${head(
      'Secret poll · ' + esc(n.trip),
      `${esc(by.name)} asks · ${esc(n.closes)}`,
    )}<h3>${esc(n.question)}</h3><div class="soc-options two">${n.options
      .map(
        (o, k) =>
          `<button class="soc-option" data-action="soc-vote" data-id="${n.id}" data-k="${k}"><span>${esc(o)}</span></button>`,
      )
      .join(
        '',
      )}</div><p class="soc-fine">${icon('info')} Nobody sees your answer. The group is shown only the lowest comfortable range.</p></article>`;
  if (n.kind === 'viewer') {
    const st = STORIES[n.story];
    return `<article class="soc-need" data-need="${n.id}">${head(
      'A new viewer',
      `${esc(by.name)} asks`,
    )}<h3>Let ${esc(n.viewer)} see “${esc(st?.title || 'your trip')}”?</h3><p class="soc-need-text">${esc(n.viewer)} is ${esc(n.relation)}. Every traveller has to say yes. ${esc(socList(n.yes.map(socName)))} already have.</p><div class="soc-need-acts"><button class="btn small" data-action="soc-need" data-id="${n.id}" data-v="yes">Let ${esc(n.viewer)} see it</button><button class="btn small ghost" data-action="soc-need" data-id="${n.id}" data-v="no">Keep it closed</button></div></article>`;
  }
  if (n.kind === 'fix') {
    const p = P[n.place];
    return `<article class="soc-need" data-need="${n.id}">${head(
      'A correction',
      `${esc(by.name)} suggests`,
    )}<h3>${esc(p?.name || 'A stop')}: ${esc(n.field.toLowerCase())} ${esc(n.to)}, not ${esc(n.from)}?</h3><p class="soc-need-text">“${esc(n.reason)}”</p><div class="soc-need-acts"><button class="btn small" data-action="soc-need" data-id="${n.id}" data-v="yes">Change to ${esc(n.to)}</button><button class="btn small ghost" data-action="soc-need" data-id="${n.id}" data-v="no">Keep ${esc(n.from)}</button></div></article>`;
  }
  return '';
}
function socNeedsHtml() {
  const needs = socNeeds();
  return `<section class="soc-needs" id="soc-needs" aria-label="Needs you"><div class="soc-sechead"><h2>Needs you</h2>${needs.length ? `<span class="soc-pill">${needs.length}</span>` : ''}</div>${
    needs.length
      ? `<div class="soc-needlist">${needs.map(socNeedHtml).join('')}</div>`
      : `<p class="soc-calm">${icon('check')} Nothing is waiting on you.</p>`
  }</section>`;
}
// One look back at a time. The first that applies and has not been put away is shown.
function socLookbacks() {
  return (SOCIAL.lookbacks || []).filter(
    (l) =>
      !SOCS.lookOff &&
      !SOCS.lookSkip.includes(l.id) &&
      !SOCS.lookSkip.includes('kind:' + l.kind) &&
      !(l.story && SOCS.lookSkip.includes('trip:' + l.story)) &&
      !Object.hasOwn(SOCS.done, l.id) &&
      (l.kind === 'month' ? socMonthTrips().length : socPerson(l.who) && C[l.city]) &&
      !SOCS.muted.includes(l.who) &&
      !SOCS.blocked.includes(l.who),
  );
}
// Trips taken in this calendar month, yours first, then friends' that you were not on.
function socMonthTrips(month = new Date().getMonth() + 1) {
  const me = socPerson(socMe()),
    skip = (h) => h.story && SOCS.lookSkip.includes('trip:' + h.story),
    mine = me.history.filter((h) => h.month === month && !skip(h)).map((h) => ({ h, who: me.id }));
  const theirs = socFriends()
    .filter((id) => !SOCS.muted.includes(id))
    .flatMap((id) =>
      socPerson(id)
        .history.filter((h) => h.month === month && !(h.with || []).includes(me.id) && !skip(h))
        .map((h) => ({ h, who: id })),
    );
  return [...mine, ...theirs];
}
function socMonthTile({ h, who }) {
  const cid = h.cities.find((c) => C[c]),
    href = h.story && socCanSee(h.story) ? `#/story/${h.story}` : `#/city/${cid}`,
    others = (h.with || []).filter((x) => x !== who && SOCIAL.people[x]),
    sub =
      who === socMe()
        ? others.length
          ? 'with ' + socList(others.map((x) => (x === socMe() ? 'you' : socName(x))))
          : 'on your own'
        : socName(who);
  return `<a class="soc-mtile" href="${href}">${photoTag(h.story ? STORIES[h.story]?.cover || cid : cid)}<span>${who === socMe() ? '' : socAvatar(who, 'tiny')}<strong>${esc(h.country)} ${h.year}</strong><small>${esc(sub)}</small></span></a>`;
}
function socLookHtml() {
  const l = socLookbacks()[0];
  if (!l) return '';
  const foot = (lessLabel = 'Show less like this') =>
    `<button class="btn small ghost" data-action="soc-look-hide" data-id="${l.id}">Not now</button></div><button class="inline-link soc-less" data-action="soc-look-less" data-id="${l.id}">${lessLabel}</button>`;
  if (l.kind === 'month') {
    const m = new Date().getMonth() + 1,
      name = SOC_MONTHS[m - 1],
      all = socMonthTrips(m),
      mine = all.filter((x) => x.who === socMe()),
      theirs = all.filter((x) => x.who !== socMe());
    return `<section class="soc-look month" id="soc-look" aria-label="A look back"><div class="soc-look-body"><span class="eyebrow">A look back</span><h3>${mine.length ? `Your ${name}s` : `Friends’ ${name}s`}</h3>${mine.length ? `<div class="soc-mrow">${mine.map(socMonthTile).join('')}</div>` : ''}${theirs.length && mine.length ? `<h4>Friends’ ${name}s</h4>` : ''}${theirs.length ? `<div class="soc-mrow">${theirs.map(socMonthTile).join('')}</div>` : ''}<div class="soc-need-acts"><button class="btn small" data-action="soc-look-month" data-m="${m}">Where next ${name}?</button>${foot()}</div></section>`;
  }
  const who = socPerson(l.who),
    c = C[l.city];
  return `<section class="soc-look" id="soc-look" aria-label="A look back">${photoTag(STORIES[l.story]?.cover || c.id)}<div class="soc-look-body"><span class="eyebrow">A look back</span><h3>${esc(who.name)} is planning ${esc(c.name)} for ${esc(l.when)}. You were there in ${l.year}.</h3><div class="soc-need-acts"><button class="btn small" data-action="soc-look-send" data-id="${l.id}">Send ${esc(who.name)} your three best stops</button>${foot()}</div></section>`;
}
function socHeartLine(f) {
  const mine = SOCS.hearts.includes(f.id),
    others = (f.hearts || []).filter(
      (id) => !SOCS.muted.includes(id) && !SOCS.blocked.includes(id),
    ),
    ids = mine ? [socMe(), ...others] : others,
    names = ids.map(socName),
    shown = names.length > 3 ? [...names.slice(0, 2), `${names.length - 2} others`] : names;
  return `<button class="st-act soc-heart ${mine ? 'on' : ''}" data-action="soc-heart" data-id="${f.id}" aria-pressed="${mine}" aria-label="Heart">${icon('heart')}</button>${ids.length ? `<span class="soc-hearts">${socFaceRow(ids.slice(0, 4))}<span>${esc(socList(shown))}</span></span>` : ''}`;
}
function socWantBtn(id) {
  if (!validPlace(id)) return '';
  const on = saved(id);
  return `<button class="st-act ${on ? 'on' : ''}" data-action="soc-want" data-id="${id}" aria-pressed="${on}">${icon(on ? 'check' : 'plus')}<span>${on ? 'On my list' : 'Want to go'}</span></button>`;
}
function socItemHtml(f) {
  const who = f.who.map(socPerson).filter(Boolean),
    names = `<strong>${esc(socList(who.map((p) => p.name)))}</strong>`,
    st = f.story ? STORIES[f.story] : null,
    p = f.place ? P[f.place] : null,
    c = f.city ? C[f.city] : null;
  let line = '',
    body = '',
    acts = '',
    href = '',
    spec = null;
  if (f.kind === 'story' && st) {
    const stops = socStoryStops(f.story);
    href = `#/story/${f.story}`;
    line = `${names} published a trip`;
    spec = { points: stops, line: true, numbered: false };
    body = `<a class="soc-cover" href="${href}">${photoTag(st.cover)}<span class="soc-cover-text"><strong>${esc(st.title)}</strong><span>${st.days.length} days · ${stops.length} places · ${esc(st.blurb)}</span></span></a>`;
    acts = `<a class="st-act" href="${href}">${icon('route')}<span>Open the story</span></a>`;
  } else if (f.kind === 'ripple' && p) {
    const g = galleryFor(p.id)[1] || galleryFor(p.id)[0];
    href = `#/story/${f.story}`;
    line = `${names} went to <strong>${esc(p.name)}</strong>, ${esc(f.after)}`;
    spec = { points: [p], zoom: 13 };
    body = `<div class="soc-pair"><figure>${photoTag(p.id)}<figcaption>${socAvatar(f.mine.by, 'tiny')} ${esc(socName(f.mine.by))} · ${esc(f.mine.date)}</figcaption></figure><figure>${g ? galleryImg(g, true, '(max-width: 700px) 50vw, 330px') : photoTag(p.id)}<figcaption>${socAvatar(f.theirs.by, 'tiny')} ${esc(socName(f.theirs.by))} · ${esc(f.theirs.date)}</figcaption></figure></div>${f.theirs.note ? `<p class="soc-quote">“${esc(f.theirs.note)}”</p>` : ''}<details class="soc-photo-credit"><summary aria-label="Photo credits">i</summary><span>${photoCredit(p.id)}${g ? ' · ' + galleryCredit(g) : ''}</span></details>`;
    acts = `<a class="st-act" href="${href}">${icon('route')}<span>Your story</span></a>`;
  } else if (f.kind === 'wants' && c) {
    const list = f.places.filter(validPlace).map((id) => P[id]);
    href = `#/city/${c.id}`;
    line = `${names} wants to go to <strong>${list.length} places in ${esc(c.name)}</strong>`;
    spec = { points: list, numbered: true };
    body = `<ol class="soc-placelist">${list.map((x) => `<li><button class="inline-link" data-action="place" data-id="${x.id}">${esc(x.name)}</button></li>`).join('')}</ol>${f.from && STORIES[f.from] ? `<p class="soc-fine">Saved from “${esc(STORIES[f.from].title)}”.</p>` : ''}`;
    acts = `<a class="st-act" href="${href}">${icon('compass')}<span>${esc(c.name)} guide</span></a>`;
  } else if (f.kind === 'plan' && c) {
    href = `#/city/${c.id}`;
    line = `${names} leaves for <strong>${esc(c.country)}</strong> in ${esc(f.month)}`;
    spec = { points: [c], zoom: 4.5 };
    body = `<a class="soc-cover short" href="${href}">${photoTag(c.id)}<span class="soc-cover-text"><strong>${esc(c.name)}, ${esc(c.country)}</strong><span>${esc(c.tagline)}</span></span></a>`;
    acts = `<a class="st-act" href="${href}">${icon('compass')}<span>${esc(c.name)} guide</span></a>`;
  } else if (f.kind === 'pick' && p) {
    href = `#/story/${f.story}`;
    line = `${names} and you chose the group’s pick`;
    spec = { points: [p], zoom: 14 };
    body = `<button class="soc-placecard" data-action="place" data-id="${p.id}">${photoTag(p.id)}<span><em>${esc(f.question)}</em><strong>${esc(p.name)}</strong><small>${esc(p.area)} · ${esc(C[p.cityId].name)}</small></span></button>`;
    acts = socWantBtn(p.id);
  } else if (f.kind === 'line' && p) {
    href = `#/story/${f.story}`;
    line = `${names} added a line to <strong>${esc(p.name)}</strong>`;
    spec = { points: [p], zoom: 13 };
    body = `<p class="soc-quote">“${esc(f.text)}”</p>${st ? `<p class="soc-fine">In “${esc(st.title)}”.</p>` : ''}`;
    acts = socWantBtn(p.id);
  } else return '';
  socSpecs[f.id] = spec;
  const where = spec.points.length > 1 ? c?.name || st?.title || '' : p?.name || c?.name || '';
  return `<article class="soc-item" id="soc-${f.id}" data-item="${f.id}"><a class="soc-map" data-map="${f.id}" href="${href}" aria-label="Map: ${esc(where)}"></a><header class="soc-item-head">${socFaceRow(f.who)}<p>${line}<span class="soc-when">${esc(f.when)}</span></p><button class="iconbtn soc-more" data-action="soc-more" data-id="${f.id}" aria-label="More options">${icon('more')}</button></header><div class="soc-item-body">${body}</div><footer class="soc-item-acts">${socHeartLine(f)}<span class="soc-grow"></span>${acts}<button class="st-act" data-action="soc-send" data-id="${f.id}">${icon('share')}<span>Send to</span></button></footer></article>`;
}
function socFeedItems() {
  return SOCIAL.feed.filter(
    (f) =>
      !SOCS.hidden.includes(f.id) &&
      !f.who.every((id) => SOCS.muted.includes(id) || SOCS.blocked.includes(id)) &&
      (!f.story || socCanSee(f.story)),
  );
}
function renderFeed() {
  headerActive('feed');
  document.title = 'Feed · Tandem Roads';
  socSpecs = {};
  socOnFeed = true;
  const items = socFeedItems(),
    fresh = items.filter((f) => !SOCS.seen.includes(f.id)),
    old = items.filter((f) => SOCS.seen.includes(f.id));
  $('#app').innerHTML =
    `<div class="wrap soc-page soc-feed"><header class="soc-top"><div><h1>Feed</h1><p class="muted">What needs you, then your friends’ travels, newest first.</p></div><button class="soc-about" data-action="soc-about">${socSample()}${icon('info')}</button></header>` +
    socNeedsHtml() +
    socLookHtml() +
    socMyPollsHtml() +
    `<section class="soc-stream" aria-label="From your friends"><div class="soc-sechead"><h2>From your friends</h2><button class="btn small ghost soc-ask-btn" data-action="soc-dream">${icon('plus')} Ask “where next?”</button></div>${fresh.length ? `<p class="soc-divider"><span>New since your last visit</span></p>${fresh.map(socItemHtml).join('')}` : ''}${old.length ? `${fresh.length ? '<p class="soc-divider"><span>Earlier</span></p>' : ''}${old.map(socItemHtml).join('')}` : ''}${items.length ? '' : '<p class="soc-calm">Nothing new from your friends.</p>'}</section>` +
    `<section class="soc-end">${icon('check')}<h2>You’re all caught up</h2><p class="muted">That is everything. The feed does not refill itself.</p><div class="soc-need-acts"><a class="btn" href="#/">Explore places</a><button class="btn ghost" data-action="soc-invite">Invite a friend</button></div></section>` +
    footer() +
    '</div>';
  socWatchMaps();
}
function socAbout() {
  showModal(
    `<div class="modalcontent"><h2 id="modal-heading">A sample, until accounts arrive</h2><p class="lead">Sign-in is not switched on yet, so these pages show how they will work using made-up people from the sample trips. You are seeing them as Alex.</p><ul class="st-rules"><li>What you tap here is saved on this device only.</li><li>Nobody is ranked. Hearts show as faces, and there are no follower or heart totals anywhere.</li><li>The feed is in time order and it ends.</li><li>Profiles are for friends only, and there are no public links.</li></ul><div class="actions"><button class="btn" data-action="close-modal">Got it</button><button class="btn ghost" data-action="soc-reset">Reset the sample</button></div></div>`,
    'About this sample',
  );
}
function socRefreshFeedParts() {
  $('#soc-needs')?.replaceWith(
    Object.assign(document.createElement('div'), { innerHTML: socNeedsHtml() }).firstElementChild,
  );
  socHeader();
}
function socAnswer(id, value, message) {
  SOCS.done[id] = value;
  socSave();
  socRefreshFeedParts();
  toast(message, {
    label: 'Undo',
    run: () => {
      delete SOCS.done[id];
      socSave();
      if (location.hash.startsWith('#/feed')) socRefreshFeedParts();
      else socHeader();
    },
  });
}
function socVote(id, k) {
  const n = SOCIAL.needs.find((x) => x.id === id);
  if (!n || !n.options[k]) return;
  const waiting = socList(n.waiting.filter((x) => x !== socMe()).map(socName));
  if (n.kind === 'dream' || n.kind === 'pick') {
    const win = socWinners({ ...n.votes, [socMe()]: k }, n.options),
      label = (o) => (n.kind === 'dream' ? C[o]?.name : P[o]?.name),
      names = socList(win.map(label));
    return socAnswer(
      id,
      k,
      n.kind === 'pick'
        ? `${names} ${win.length > 1 ? 'share' : 'is'} the group’s pick for ${n.label.toLowerCase()}.`
        : `Everyone has answered. ${names} ${win.length > 1 ? 'are level' : 'wins'}.`,
    );
  }
  socAnswer(
    id,
    k,
    n.kind === 'budget'
      ? `Answered in secret. Waiting for ${waiting}.`
      : `You chose “${n.options[k]}”. Waiting for ${waiting}.`,
  );
}
function socNeed(id, v) {
  const n = SOCIAL.needs.find((x) => x.id === id);
  if (!n) return;
  const msg =
    n.kind === 'viewer'
      ? v === 'yes'
        ? `Everyone said yes. ${n.viewer} can see the trip.`
        : `Kept closed. ${n.viewer} cannot see the trip.`
      : v === 'yes'
        ? `Changed to ${n.to}.`
        : `Kept at ${n.from}.`;
  socAnswer(id, v, msg);
}
const socLook = (id) => (SOCIAL.lookbacks || []).find((l) => l.id === id);
function socLookSend(id) {
  const l = socLook(id),
    who = socPerson(l.who),
    stops = socStoryStops(l.story)
      .filter((s) => s.cityId === l.city && s.id)
      .sort((a, b) => b.loves - a.loves)
      .slice(0, 6);
  showModal(
    `<div class="modalcontent"><h2 id="modal-heading">Your three best stops in ${esc(C[l.city].name)}</h2><p class="lead">Pick up to three for ${esc(who.name)}. They land on ${esc(who.name)}’s want-to-go list with your note from the trip.</p><div class="soc-picks">${stops
      .map(
        (s, i) =>
          `<label class="soc-pick"><input type="checkbox" name="soc-pick" value="${s.id}" ${i < 3 ? 'checked' : ''}>${photoTag(s.id)}<span><strong>${esc(s.name)}</strong><small>${esc(s.note)}</small></span></label>`,
      )
      .join(
        '',
      )}</div><div class="actions"><button class="btn" data-action="soc-look-go" data-id="${l.id}">Send to ${esc(who.name)}</button><button class="btn ghost" data-action="close-modal">Cancel</button></div></div>`,
    'Send your best stops',
  );
}
function socLookGo(id) {
  const l = socLook(id),
    n = $$('input[name="soc-pick"]:checked').length;
  if (!n) return toast('Pick at least one stop.');
  closeModal('user');
  SOCS.done[l.id] = n;
  socSave();
  $('#soc-look')?.remove();
  toast(`Sent ${n} stop${n === 1 ? '' : 's'} to ${socName(l.who)}.`);
}
function socLookHide(id, less) {
  const l = socLook(id);
  if (!l) return;
  const key = less ? 'kind:' + l.kind : l.id;
  SOCS.lookSkip = [...new Set([...SOCS.lookSkip, key])];
  socSave();
  $('#soc-look')?.remove();
  toast(less ? 'You will see fewer look backs.' : 'Hidden.', {
    label: 'Undo',
    run: () => {
      SOCS.lookSkip = SOCS.lookSkip.filter((x) => x !== key);
      socSave();
      if (location.hash.startsWith('#/feed')) route();
    },
  });
}
function socHeart(id) {
  const f = SOCIAL.feed.find((x) => x.id === id);
  if (!f) return;
  const on = !SOCS.hearts.includes(id);
  SOCS.hearts = on ? [...SOCS.hearts, id] : SOCS.hearts.filter((x) => x !== id);
  socSave();
  if (on) navigator.vibrate?.(10);
  const foot = $(`[data-item="${id}"] .soc-item-acts`);
  if (!foot) return;
  foot.querySelector('.soc-hearts')?.remove();
  foot.querySelector('.soc-heart').outerHTML = socHeartLine(f);
  if (on) foot.querySelector('.soc-heart').classList.add('pop');
}
function socWant(id) {
  toggleSave(id, true);
  const on = saved(id);
  $$(`[data-action="soc-want"][data-id="${id}"]`).forEach((b) => {
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
    b.innerHTML = `${icon(on ? 'check' : 'plus')}<span>${on ? 'On my list' : 'Want to go'}</span>`;
  });
  toast(on ? `${P[id].name} is on your want-to-go list.` : 'Removed from your list.');
}
// "Send to" takes the place of reposting: only to friends, and never wider than the trip allows.
function socSend(id) {
  const f = SOCIAL.feed.find((x) => x.id === id),
    st = f?.story ? STORIES[f.story] : null;
  if (!f) return;
  let ids = socFriends();
  if (st) {
    const allowed = new Set([...st.travellers.map((t) => t.name), ...(st.viewers || [])]);
    ids = ids.filter((x) => allowed.has(SOCIAL.people[x].name));
  }
  ids = ids.filter((x) => !f.who.includes(x));
  showModal(
    `<div class="modalcontent"><h2 id="modal-heading">Send to a friend</h2><p class="lead">${st ? `Only people who can already see “${esc(st.title)}”. Nothing can be passed on wider than its travellers agreed.` : 'It goes to one friend, not to a feed.'}</p>${ids.length ? `<div class="soc-people">${ids.map((x) => `<button class="soc-personrow" data-action="soc-send-go" data-id="${x}">${socAvatar(x)}<strong>${esc(socName(x))}</strong>${icon('arrow')}</button>`).join('')}</div>` : '<p class="muted">Everyone who can see this already has it.</p>'}</div>`,
    'Send to a friend',
  );
}
function socMore(id) {
  const f = SOCIAL.feed.find((x) => x.id === id);
  if (!f) return;
  showModal(
    `<div class="modalcontent"><h2 id="modal-heading">This item</h2><div class="soc-people"><button class="soc-personrow" data-action="soc-hide" data-id="${id}">${icon('close')}<strong>Hide this</strong></button>${f.who
      .map(
        (w) =>
          `<button class="soc-personrow" data-action="soc-mute" data-id="${w}">${socAvatar(w)}<strong>Mute ${esc(socName(w))}</strong><small>They are not told</small></button>`,
      )
      .join(
        '',
      )}<button class="soc-personrow" data-action="soc-report" data-id="${id}">${icon('info')}<strong>Report this</strong><small>Reviewed within 48 hours</small></button></div></div>`,
    'Item options',
  );
}
function socToggleList(key, id, on) {
  SOCS[key] = on ? [...new Set([...SOCS[key], id])] : SOCS[key].filter((x) => x !== id);
  socSave();
}
function socMute(id, on = true) {
  socToggleList('muted', id, on);
  closeModal('user');
  socReroute();
  toast(on ? `${socName(id)} is muted. They are not told.` : `${socName(id)} is no longer muted.`, {
    label: 'Undo',
    run: () => {
      socToggleList('muted', id, !on);
      socReroute();
    },
  });
}
function socBlock(id, on = true) {
  socToggleList('blocked', id, on);
  closeModal('user');
  if (on && location.hash === `#/people/${id}`) location.hash = '#/account';
  else socReroute();
  toast(on ? `${SOCIAL.people[id].name} is blocked.` : `${SOCIAL.people[id].name} is unblocked.`, {
    label: 'Undo',
    run: () => {
      socToggleList('blocked', id, !on);
      socReroute();
    },
  });
}
// Redraw the current social page after a change, keeping the scroll position.
function socReroute() {
  if (!/^#\/(feed|me|people|account)/.test(location.hash)) return socHeader();
  const y = scrollY;
  route();
  window.scrollTo(0, y);
}

// ---------------------------------------------------------------- profile
const socCountries = (p, upTo = Infinity) => [
  ...new Set(p.history.filter((h) => h.year <= upTo).map((h) => h.country)),
];
const socCities = (p, upTo = Infinity) => [
  ...new Set(p.history.filter((h) => h.year <= upTo).flatMap((h) => h.cities)),
];
function socWants(p) {
  // Your own list is the real one from Saved; a friend's comes from the sample.
  const ids = p.id === socMe() && S.saved.length ? S.saved : p.wants;
  return ids.filter(validPlace);
}
function socTripLine(h, p) {
  const others = (h.with || []).filter((id) => SOCIAL.people[id] && !SOCS.blocked.includes(id));
  return `${esc(h.country)}${others.length ? ' with ' + esc(socList(others.map(socName).map((n) => (n === 'You' ? 'you' : n)))) : ''}`;
}
function socYearText(p, year) {
  const trips = p.history.filter((h) => h.year === year);
  return trips
    .map((h) =>
      h.story && socCanSee(h.story)
        ? `<a href="#/story/${h.story}">${socTripLine(h, p)}</a>`
        : socTripLine(h, p),
    )
    .join(' · ');
}
function socProfileMap(p) {
  const el = $('#soc-pmap');
  if (!el || typeof L === 'undefined') return;
  const map = socBaseMap(el, {
    zoomControl: !isMobile(),
    dragging: !isMobile(),
    scrollWheelZoom: false,
    maxZoom: 7,
    worldCopyJump: true,
  });
  const style = (upTo) => {
    const been = new Set(socCountries(p, upTo).map((c) => SOC_WORLD[c] || c));
    return (f) =>
      been.has(f.properties.name)
        ? {
            color: themeColor('--teal', '#a9431a'),
            weight: 1.2,
            fillColor: themeColor('--teal', '#a9431a'),
            fillOpacity: 0.72,
          }
        : outlineStyle();
  };
  const land = L.geoJSON(DATA.world, {
    pane: 'offline-outline',
    style: style(Infinity),
    interactive: false,
  }).addTo(map);
  const dots = L.layerGroup().addTo(map);
  const draw = (upTo) => {
    land.setStyle(style(upTo));
    dots.clearLayers();
    socCities(p, upTo).forEach((cid) =>
      L.marker([C[cid].lat, C[cid].lon], {
        title: C[cid].name,
        keyboard: false,
        icon: L.divIcon({
          className: '',
          html: '<div class="soc-pin dot"></div>',
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        }),
      })
        .on('click', () => (location.hash = '#/city/' + cid))
        .addTo(dots),
    );
  };
  draw(Infinity);
  const pts = socCities(p).map((cid) => [C[cid].lat, C[cid].lon]);
  const fit = () =>
    pts.length
      ? map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 4 })
      : map.setView([25, 10], 1.5);
  fit();
  setTimeout(() => {
    if (!socMaps.includes(map)) return;
    map.invalidateSize();
    fit();
  }, 120);
  return draw;
}
function socStampDate(h) {
  return h.month ? `${SOC_MONTHS[h.month - 1].slice(0, 3)} ${h.year}` : String(h.year);
}
function renderProfile(id) {
  const p = socPerson(id),
    me = socPerson(socMe()),
    own = id === socMe();
  if (!p || SOCS.blocked.includes(id)) {
    headerActive('me');
    $('#app').innerHTML =
      `<div class="wrap"><section class="empty"><h1>This profile isn’t here.</h1><p class="muted">Profiles are visible to friends only${p ? ', and you have blocked this person' : ''}.</p><a class="btn" href="#/feed">Back to the feed</a></section></div>`;
    return;
  }
  headerActive(own ? 'me' : 'feed');
  document.title = `${own ? 'Your profile' : p.name} · Tandem Roads`;
  const years = [...new Set(p.history.map((h) => h.year))].sort((a, b) => a - b),
    last = years[years.length - 1],
    countries = socCountries(p),
    cities = socCities(p);
  const founding = p.since <= '2028-05';
  const head = `<header class="soc-phead"><span class="st-avatar soc-av big" style="--who:${esc(p.color)}" aria-hidden="true">${esc(p.name[0] || '?')}</span><div class="soc-phead-text"><h1>${esc(p.name)}${own ? ' <span class="soc-you">You</span>' : ''}</h1><p class="soc-home">${icon('pin')}${esc(p.home)}</p>${p.line ? `<p class="soc-line">${esc(p.line)}</p>` : ''}<p class="soc-since">On the road since ${esc(socSince(p))}${founding ? ` <span class="soc-founding" title="Joined in the first year">${icon('star')}Founding traveller</span>` : ''}</p></div><div class="soc-phead-acts">${own ? `<a class="btn small ghost" href="#/account">${icon('sliders')} Edit and settings</a>` : `<button class="iconbtn" data-action="soc-person-more" data-id="${id}" aria-label="Options for ${esc(p.name)}">${icon('more')}</button>`}<button class="soc-about" data-action="soc-about">${socSample()}${icon('info')}</button></div></header>`;
  const mapPart = `<section class="soc-mapsec" aria-label="${own ? 'Your' : esc(socPossessive(p.name))} map"><div id="soc-pmap" class="soc-pmap"></div><div class="soc-years"><label for="soc-year">Travels through <strong id="soc-year-label">${last}</strong></label><input type="range" id="soc-year" min="0" max="${years.length - 1}" value="${years.length - 1}" step="1" ${years.length < 2 ? 'disabled' : ''} aria-valuetext="${last}"><div class="soc-yearticks" aria-hidden="true">${years.map((y) => `<span>${y}</span>`).join('')}</div><p class="soc-yeartext" id="soc-year-text" aria-live="polite"><b>${last}</b> ${socYearText(p, last)}</p>${own ? `<p class="soc-counts"><span><strong>${countries.length}</strong> countries</span><span><strong>${cities.length}</strong> cities</span><span><strong>${p.history.length}</strong> trips</span><small>Only you see these numbers.</small></p>` : ''}</div></section>`;
  // You and them: where your travels overlap, and what you could do next together.
  let overlap = '';
  if (!own) {
    const mine = new Set(socCountries(me)),
      both = countries.filter((c) => mine.has(c)),
      onlyThem = countries.filter((c) => !mine.has(c)).slice(0, 3),
      wantCity = (x) => [...new Set(socWants(x).map((pid) => P[pid].cityId))],
      myWant = wantCity(me),
      bothWant = wantCity(p).filter((c) => myWant.includes(c)),
      theyKnow = myWant.filter((c) => cities.includes(c)),
      rows = [];
    if (both.length)
      rows.push(`<li><span>Both been</span><strong>${esc(socList(both))}</strong></li>`);
    if (onlyThem.length)
      rows.push(
        `<li><span>Only ${esc(p.name)}</span><strong>${esc(socList(onlyThem))}</strong></li>`,
      );
    if (bothWant.length)
      rows.push(
        `<li><span>You both want</span><strong>${esc(socList(bothWant.map((c) => C[c].name)))}</strong></li>`,
      );
    if (theyKnow.length)
      rows.push(
        `<li><span>On your list, ${esc(p.name)} has been</span><strong>${esc(socList(theyKnow.map((c) => C[c].name)))}</strong></li>`,
      );
    overlap = rows.length
      ? `<section class="soc-sec soc-overlap"><h2>You and ${esc(p.name)}</h2><ul>${rows.join('')}</ul>${bothWant.length ? `<button class="btn small" data-action="soc-plan" data-id="${id}" data-city="${bothWant[0]}">${icon('route')} Plan ${esc(C[bothWant[0]].name)} together</button>` : ''}</section>`
      : '';
  }
  const favs = p.favourites.filter(validPlace);
  const favPart = favs.length
    ? `<section class="soc-sec"><h2>Four favourites</h2><div class="soc-favs">${favs
        .slice(0, 4)
        .map(
          (pid) =>
            `<button class="soc-fav" data-action="place" data-id="${pid}">${photoTag(pid)}<span><strong>${esc(P[pid].name)}</strong><small>${esc(C[P[pid].cityId].name)}</small></span></button>`,
        )
        .join('')}</div></section>`
    : '';
  // Where next: place and month only, and only for trips the person chose to show.
  const nextShown = p.next.filter((n) => (own ? true : n.show) && C[n.city]),
    showing = (n) => (own ? (SOCS.next[n.id] ?? n.show) : n.show),
    wants = socWants(p),
    wantCities = [...new Set(wants.map((pid) => P[pid].cityId))];
  const nextPart = `<section class="soc-sec"><h2>Next</h2>${
    nextShown.length
      ? nextShown
          .map(
            (n) =>
              `<a class="soc-next" href="#/city/${n.city}">${photoTag(n.city)}<span><strong>${esc(C[n.city].name)}, ${esc(C[n.city].country)}</strong><small>${esc(socMonth(n.month))}${own ? (showing(n) ? ' · friends can see this' : ' · hidden from friends') : ''}</small></span>${icon('arrow')}</a>`,
          )
          .join('')
      : `<p class="muted soc-none">${own ? 'No trip planned yet.' : esc(p.name) + ' has not shared a next trip.'}</p>`
  }${
    wants.length
      ? `<h3>Want to go</h3><div class="soc-wantrow">${wantCities
          .map((cid) => {
            const n = wants.filter((pid) => P[pid].cityId === cid).length;
            return `<a class="soc-want" href="#/city/${cid}">${photoTag(cid)}<span><strong>${esc(C[cid].name)}</strong><small>${n} place${n === 1 ? '' : 's'}</small></span></a>`;
          })
          .join('')}</div>`
      : own
        ? `<h3>Want to go</h3><p class="muted soc-none">Places you save show up here. <a href="#/">Find some</a>.</p>`
        : ''
  }</section>`;
  const stories = [...new Set(p.history.map((h) => h.story).filter((s) => s && socCanSee(s)))];
  const tripsPart = `<section class="soc-sec"><h2>Trips</h2>${
    stories.length
      ? `<div class="soc-shelf">${stories
          .map((sid) => {
            const st = STORIES[sid];
            return `<a class="soc-trip" href="#/story/${sid}">${photoTag(st.cover)}<span><strong>${esc(st.title)}</strong><small>${st.days.length} days · ${esc(socList(st.travellers.map((t) => (t.id === socMe() ? 'you' : t.name))))}</small></span></a>`;
          })
          .join('')}</div>`
      : `<p class="muted soc-none">No stories shared with you yet.</p>`
  }<p class="soc-fine">${own ? 'Friends see only the trips whose travellers let them in.' : 'You see only the trips whose travellers let you in.'}</p></section>`;
  const askPart =
    !own && p.knows.length
      ? `<section class="soc-sec"><h2>Ask ${esc(p.name)} about</h2><div class="chips soc-ask">${p.knows
          .filter((c) => C[c])
          .map(
            (c) =>
              `<button class="chip" data-action="soc-ask" data-id="${id}" data-city="${c}">${esc(C[c].name)}</button>`,
          )
          .join('')}</div></section>`
      : '';
  const stampList = p.history.flatMap((h) => h.cities.map((cid) => ({ cid, h }))).slice(-8);
  const stampsPart = `<section class="soc-sec"><h2>Stamps</h2><div class="st-stamps soc-stamps">${stampList.map((x, i) => stStamp(C[x.cid], socStampDate(x.h), i)).join('')}</div></section>`;
  let ownPart = '';
  if (own) {
    const ripples = SOCIAL.ripples.filter(
      (r) => P[r.place] && !SOCS.blocked.includes(r.who) && !SOCS.muted.includes(r.who),
    );
    ownPart =
      `<section class="soc-sec soc-private"><h2>Only you see this</h2>${
        SOCS.styleHidden || !p.style.length
          ? ''
          : `<h3>Your travel style</h3><p class="soc-style">${p.style.map((s) => `<span>${esc(s)}</span>`).join('')}</p><p class="soc-fine">Worked out from your trips. <a href="#/account">Edit or hide it</a>.</p>`
      }<h3>Your ripples</h3>${
        ripples.length
          ? `<ul class="soc-ripples">${ripples
              .map(
                (r) =>
                  `<li>${socAvatar(r.who)}<span><strong>${esc(socName(r.who))} · <button class="inline-link" data-action="place" data-id="${r.place}">${esc(P[r.place].name)}</button></strong><small>${esc(r.saved)} · ${esc(r.went)}</small></span></li>`,
              )
              .join('')}</ul>`
          : '<p class="muted soc-none">When a friend saves one of your places and later goes, it shows here.</p>'
      }<p class="soc-fine">A list of moments. It is never added up.</p></section>` +
      `<section class="soc-sec"><h2>Friends</h2><div class="soc-friendrow">${socFriends()
        .map(
          (f) =>
            `<a class="soc-friend" href="#/people/${f}">${socAvatar(f, 'mid')}<span>${esc(socName(f))}</span></a>`,
        )
        .join(
          '',
        )}<button class="soc-friend add" data-action="soc-invite"><span class="st-avatar soc-av mid" aria-hidden="true">+</span><span>Invite</span></button></div></section>`;
  }
  $('#app').innerHTML =
    `<div class="wrap soc-page soc-profile">${head}${mapPart}<div class="soc-cols">${overlap}${favPart}${nextPart}${tripsPart}${askPart}${stampsPart}${ownPart}</div><p class="st-samplenote">${icon('info')} A sample profile. The people and their travels are made up${own ? ', and what you change is saved on this device only' : ''}.</p>` +
    footer() +
    '</div>';
  const draw = socProfileMap(p);
  $('#soc-year')?.addEventListener('input', (e) => {
    const y = years[Number(e.target.value)];
    e.target.setAttribute('aria-valuetext', y);
    $('#soc-year-label').textContent = y;
    $('#soc-year-text').innerHTML = `<b>${y}</b> ${socYearText(p, y)}`;
    draw?.(y);
  });
}
function socPersonMore(id) {
  const muted = SOCS.muted.includes(id),
    name = esc(socName(id));
  showModal(
    `<div class="modalcontent"><h2 id="modal-heading">${name}</h2><div class="soc-people"><button class="soc-personrow" data-action="${muted ? 'soc-unmute' : 'soc-mute'}" data-id="${id}">${icon('close')}<strong>${muted ? 'Unmute' : 'Mute'} ${name}</strong><small>They are not told</small></button><button class="soc-personrow" data-action="soc-block" data-id="${id}">${icon('trash')}<strong>Block ${name}</strong><small>You stop seeing each other. Shared trips stay.</small></button><button class="soc-personrow" data-action="soc-report" data-id="${id}">${icon('info')}<strong>Report ${name}</strong><small>Reviewed within 48 hours</small></button></div></div>`,
    'Options',
  );
}
function socPlan(id, city) {
  const c = C[city];
  if (!c || !SOCIAL.people[id]) return;
  showModal(
    `<div class="modalcontent"><h2 id="modal-heading">${esc(c.name)} with ${esc(socName(id))}</h2><p class="lead">You both want to go. Starting a shared trip and inviting ${esc(socName(id))} arrives with accounts. For now you can start it on your own and share the link.</p><div class="actions"><button class="btn" data-action="soc-plan-go" data-city="${city}">Add ${esc(c.name)} to my trip</button><a class="btn ghost" href="#/city/${city}">Open the ${esc(c.name)} guide</a></div></div>`,
    'Plan together',
  );
}
function socAsk(id, city) {
  const c = C[city];
  if (!c || !SOCIAL.people[id]) return;
  showModal(
    `<div class="modalcontent"><h2 id="modal-heading">Ask ${esc(socName(id))} about ${esc(c.name)}</h2><p class="lead">Your question shows up for ${esc(socName(id))} under “Needs you”. There are no private message threads.</p><div class="field"><label for="soc-ask-text">Your question</label><textarea id="soc-ask-text" maxlength="280" placeholder="Where should we eat on the first night?"></textarea></div><div class="actions"><button class="btn" data-action="soc-ask-go" data-id="${id}">Send to ${esc(socName(id))}</button><button class="btn ghost" data-action="close-modal">Cancel</button></div></div>`,
    'Ask a friend',
  );
}
function socInvite() {
  showModal(
    `<div class="modalcontent"><h2 id="modal-heading">Invite a friend</h2><p class="lead">Invites open with accounts. A friend joins with their email, and you see each other’s profiles only after both of you say yes.</p><ul class="st-rules"><li>No contact list upload, and no suggested strangers.</li><li>Friends see your profile. A trip is seen only by people its travellers approved.</li></ul><div class="actions"><button class="btn" data-action="close-modal">Got it</button></div></div>`,
    'Invite a friend',
  );
}

// ---------------------------------------------------------------- account
const socSwitch = (key, on, label, sub, locked = false) =>
  `<label class="soc-switch${locked ? ' locked' : ''}"><span><strong>${label}</strong>${sub ? `<small>${sub}</small>` : ''}</span><input type="checkbox" data-soc-set="${key}" ${on ? 'checked' : ''} ${locked ? 'disabled' : ''}><i aria-hidden="true"></i></label>`;
function renderAccount() {
  headerActive('me');
  document.title = 'Account · Tandem Roads';
  const me = socPerson(socMe()),
    all = Object.keys(SOCIAL.people).filter((id) => id !== socMe());
  if (!me) return renderExplore();
  const trips = me.history.filter((h) => h.story && STORIES[h.story]);
  $('#app').innerHTML =
    `<div class="wrap soc-page soc-account"><div class="backline"><a href="#/me">${icon('left')} Your profile</a></div><header class="soc-top"><div><h1>Account</h1><p class="muted">Your profile, who sees what, and your data.</p></div><button class="soc-about" data-action="soc-about">${socSample()}${icon('info')}</button></header>` +
    `<section class="soc-set"><h2>Sign in</h2><p class="soc-set-note">${icon('info')} Sign-in is not switched on yet. It will use a six-digit code sent to your email, with no password. Until then this page uses a made-up traveller and keeps your changes on this device.</p><div class="soc-row"><span><strong>Email</strong><small>Never shown to friends</small></span><em>Added when you sign in</em></div></section>` +
    `<section class="soc-set"><h2>Profile</h2><p class="soc-set-note">Friends see this. Nobody else can.</p><div class="soc-fields"><div class="field"><label for="soc-f-name">Name</label><input id="soc-f-name" data-soc-field="name" maxlength="30" value="${esc(me.name)}" autocomplete="off"></div><div class="field"><label for="soc-f-home">Home city</label><input id="soc-f-home" data-soc-field="home" maxlength="40" value="${esc(me.home)}" autocomplete="off"></div><div class="field wide"><label for="soc-f-line">One line about how you travel</label><input id="soc-f-line" data-soc-field="line" maxlength="90" value="${esc(me.line)}" autocomplete="off"></div><div class="field wide"><label for="soc-f-style">Travel style, up to four, separated by commas</label><input id="soc-f-style" data-soc-field="style" maxlength="120" value="${esc(me.style.join(', '))}" autocomplete="off"></div></div>${socSwitch('styleShown', !SOCS.styleHidden, 'Show my travel style on my profile', 'Only you see it either way')}<div class="soc-row"><span><strong>On the road since</strong><small>Set when you join. It cannot be changed.</small></span><em>${esc(socSince(me))}</em></div></section>` +
    `<section class="soc-set"><h2>Who sees what</h2><div class="soc-row"><span><strong>Profile</strong><small>There is no public setting and no public link</small></span><em>Friends only</em></div>${me.next
      .filter((n) => C[n.city])
      .map((n) =>
        socSwitch(
          'next:' + n.id,
          SOCS.next[n.id] ?? n.show,
          `Show my next trip: ${esc(C[n.city].name)}`,
          `Friends see “${esc(C[n.city].name)}, ${esc(socMonth(n.month))}” and never exact dates`,
        ),
      )
      .join(
        '',
      )}${trips.map((h) => `<a class="soc-row link" href="#/story/${h.story}"><span><strong>${esc(STORIES[h.story].title)}</strong><small>Travellers plus ${esc(socList(STORIES[h.story].viewers || []) || 'nobody else')}. Changed by the travellers together.</small></span>${icon('arrow')}</a>`).join('')}</section>` +
    `<section class="soc-set"><h2>Look backs</h2>${socSwitch('look', !SOCS.lookOff, 'Show look backs', 'One at a time, and only when it is useful')}${trips.map((h) => socSwitch('skip:' + h.story, !SOCS.lookSkip.includes('trip:' + h.story), `Include “${esc(STORIES[h.story].title)}”`, 'Switch off to leave this trip out')).join('')}</section>` +
    `<section class="soc-set"><h2>Notifications</h2>${socSwitch('needs', true, 'When something needs you', 'Polls, viewers to approve, corrections. Always on.', true)}${socSwitch('replies', SOCS.replies, 'When someone replies to you', 'Sent at once')}${socSwitch('weekly', SOCS.weekly, 'Weekly summary', 'Everything else waits for one email a week')}</section>` +
    `<section class="soc-set"><h2>People</h2><div class="soc-peoplelist">${all
      .map((id) => {
        const blocked = SOCS.blocked.includes(id),
          muted = SOCS.muted.includes(id);
        return `<div class="soc-row person">${blocked ? `<span class="soc-rowwho">${socAvatar(id)}<strong>${esc(SOCIAL.people[id].name)}</strong><small>Blocked</small></span>` : `<a class="soc-rowwho" href="#/people/${id}">${socAvatar(id)}<strong>${esc(SOCIAL.people[id].name)}</strong>${muted ? '<small>Muted</small>' : ''}</a>`}<span class="soc-rowacts">${blocked ? '' : `<button class="btn small ghost" data-action="${muted ? 'soc-unmute' : 'soc-mute'}" data-id="${id}">${muted ? 'Unmute' : 'Mute'}</button>`}<button class="btn small ghost" data-action="${blocked ? 'soc-unblock' : 'soc-block'}" data-id="${id}">${blocked ? 'Unblock' : 'Block'}</button></span></div>`;
      })
      .join(
        '',
      )}</div><button class="btn small ghost" data-action="soc-invite">${icon('plus')} Invite a friend</button></section>` +
    `<section class="soc-set"><h2>About Tandem Roads</h2><a class="soc-row link" href="#/guide"><span><strong>About & sources</strong><small>How places are ranked, where the information comes from, photo and map credits</small></span>${icon('arrow')}</a></section>` +
    `<section class="soc-set"><h2>Your data</h2><div class="soc-row"><span><strong>Download everything</strong><small>Your profile, settings, saved places and trip, as one file</small></span><button class="btn small ghost" data-action="soc-download">${icon('download')} Download</button></div><div class="soc-row"><span><strong>Delete my account</strong><small>Everything of yours is removed. You have 30 days to change your mind.</small></span><button class="btn small ghost" data-action="soc-delete">Delete</button></div><p class="soc-fine">No ads, no tracking, no location trail. Photos you pick are yours.</p></section>` +
    footer() +
    '</div>';
}
function socSetting(key, on) {
  if (key === 'weekly' || key === 'replies') SOCS[key] = on;
  else if (key === 'look') SOCS.lookOff = !on;
  else if (key === 'styleShown') SOCS.styleHidden = !on;
  else if (key.startsWith('next:')) SOCS.next[key.slice(5)] = on;
  else if (key.startsWith('skip:')) socToggleList('lookSkip', 'trip:' + key.slice(5), !on);
  else return;
  socSave();
  toast('Saved on this device.', null, 1600);
}
function socField(key, value) {
  if (!['name', 'home', 'line', 'style'].includes(key)) return;
  SOCS.profile[key] =
    key === 'style'
      ? value
          .split(',')
          .map((x) => x.trim().slice(0, 28))
          .filter(Boolean)
          .slice(0, 4)
      : value;
  socSave();
  socHeader();
  toast('Saved on this device.', null, 1600);
}
function socDownload() {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          app: 'Tandem Roads',
          exported: new Date().toISOString(),
          profile: socPerson(socMe()),
          social: SOCS,
          trip: S,
        },
        null,
        2,
      ),
    ],
    { type: 'application/json' },
  );
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tandem-roads-my-data.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Downloaded what this device holds.');
}
function socDelete() {
  showModal(
    `<div class="modalcontent"><h2 id="modal-heading">Delete your account</h2><p class="lead">There is no account to delete yet. When there is, this is what happens.</p><ul class="st-rules"><li>Your profile, photos, notes and name are removed from every trip.</li><li>Places on shared trips stay for your fellow travellers, without your name.</li><li>You can undo it for 30 days. After that it is gone for good.</li></ul><div class="actions"><button class="btn" data-action="close-modal">Got it</button><button class="btn ghost" data-action="soc-reset">Reset the sample on this device</button></div></div>`,
    'Delete your account',
  );
}
function socReset() {
  SOCS = socDefaults();
  socSave();
  closeModal('user');
  socReroute();
  toast('The sample is back to how it started.');
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action^="soc-"]');
  if (!b) return;
  const a = b.dataset.action,
    id = b.dataset.id;
  if (a === 'soc-vote') socVote(id, Number(b.dataset.k));
  else if (a === 'soc-need') socNeed(id, b.dataset.v);
  else if (a === 'soc-look-send') socLookSend(id);
  else if (a === 'soc-look-go') socLookGo(id);
  else if (a === 'soc-look-hide') socLookHide(id, false);
  else if (a === 'soc-look-less') socLookHide(id, true);
  else if (a === 'soc-look-month') {
    B().month = Number(b.dataset.m);
    persist();
    location.hash = '#/choose';
  } else if (a === 'soc-dream') socDreamSheet();
  else if (a === 'soc-dream-go') socDreamGo();
  else if (a === 'soc-dream-start') {
    const city = b.dataset.city;
    if (validCity(city) && !inTrip(city)) toggleTrip(city);
    location.hash = '#/trip';
  } else if (a === 'soc-dream-close') {
    const old = SOCS.polls[id];
    delete SOCS.polls[id];
    socSave();
    socReroute();
    toast('Poll closed.', {
      label: 'Undo',
      run: () => {
        SOCS.polls[id] = old;
        socSave();
        socReroute();
      },
    });
  } else if (a === 'soc-heart') socHeart(id);
  else if (a === 'soc-want') socWant(id);
  else if (a === 'soc-send') socSend(id);
  else if (a === 'soc-send-go') {
    closeModal('user');
    toast(`Sent to ${socName(id)}.`);
  } else if (a === 'soc-more') socMore(id);
  else if (a === 'soc-hide') {
    socToggleList('hidden', id, true);
    closeModal('user');
    socReroute();
    toast('Hidden.', {
      label: 'Undo',
      run: () => {
        socToggleList('hidden', id, false);
        socReroute();
      },
    });
  } else if (a === 'soc-mute') socMute(id, true);
  else if (a === 'soc-unmute') socMute(id, false);
  else if (a === 'soc-block') socBlock(id, true);
  else if (a === 'soc-unblock') socBlock(id, false);
  else if (a === 'soc-report') {
    closeModal('user');
    toast('Reports open with accounts. Each one is reviewed within 48 hours.');
  } else if (a === 'soc-about') socAbout();
  else if (a === 'soc-reset') socReset();
  else if (a === 'soc-invite') socInvite();
  else if (a === 'soc-person-more') socPersonMore(id);
  else if (a === 'soc-plan') socPlan(id, b.dataset.city);
  else if (a === 'soc-plan-go') {
    const city = b.dataset.city;
    closeModal('user');
    if (!inTrip(city)) toggleTrip(city);
    location.hash = '#/trip';
  } else if (a === 'soc-ask') socAsk(id, b.dataset.city);
  else if (a === 'soc-ask-go') {
    if (!$('#soc-ask-text')?.value.trim()) return toast('Write your question first.');
    closeModal('user');
    toast(`Sent. ${socName(id)} will see it under “Needs you”.`);
  } else if (a === 'soc-download') socDownload();
  else if (a === 'soc-delete') socDelete();
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.matches?.('[data-soc-set]')) socSetting(t.dataset.socSet, t.checked);
  else if (t.matches?.('[data-soc-field]')) socField(t.dataset.socField, t.value);
  else if (
    t.matches?.('input[name="soc-pick"]') &&
    $$('input[name="soc-pick"]:checked').length > 3
  ) {
    t.checked = false;
    toast('Three at most.');
  }
});

// ---------------------------------------------------------------- polls you start
// Options with the most votes. Several when level.
function socWinners(votes, options) {
  const n = options.map((_, k) => Object.values(votes).filter((v) => v === k).length),
    top = Math.max(...n);
  return top ? options.filter((_, k) => n[k] === top) : [];
}
// Cities to offer in a "where next?" poll: from your saved places first, then your sample wants.
function socDreamCities() {
  const me = socPerson(socMe()),
    fromSaved = [...new Set(S.saved.filter(validPlace).map((id) => P[id].cityId))],
    fromSample = [...new Set(me.wants.filter(validPlace).map((id) => P[id].cityId))];
  return [...new Set([...fromSaved, ...fromSample, 'lisbon', 'marrakech', 'cusco'])]
    .filter(validCity)
    .slice(0, 8);
}
function socDreamSheet() {
  const cities = socDreamCities(),
    friends = socFriends().filter((id) => !SOCS.muted.includes(id));
  showModal(
    `<div class="modalcontent"><h2 id="modal-heading">Where next?</h2><p class="lead">Pick two to four places and the friends to ask. Names show on the answers, and the poll closes in three days.</p><h3 class="soc-sheet-h">Places</h3><div class="soc-picks soc-dream-cities">${cities
      .map(
        (c, i) =>
          `<label class="soc-pick"><input type="checkbox" name="soc-dc" value="${c}" ${i < 3 ? 'checked' : ''}>${photoTag(c)}<span><strong>${esc(C[c].name)}</strong><small>${esc(C[c].country)}${S.saved.some((id) => P[id]?.cityId === c) ? ' · from your saved places' : ''}</small></span></label>`,
      )
      .join(
        '',
      )}</div><h3 class="soc-sheet-h">Ask</h3><div class="soc-who">${friends.map((f) => `<label class="soc-whochip"><input type="checkbox" name="soc-df" value="${f}" checked>${socAvatar(f)}<span>${esc(socName(f))}</span></label>`).join('')}</div><div class="actions"><button class="btn" data-action="soc-dream-go">Send the poll</button><button class="btn ghost" data-action="close-modal">Cancel</button></div></div>`,
    'Ask where next',
  );
}
function socDreamGo() {
  const options = $$('input[name="soc-dc"]:checked')
      .map((x) => x.value)
      .filter(validCity),
    to = $$('input[name="soc-df"]:checked')
      .map((x) => x.value)
      .filter((x) => SOCIAL.people[x]);
  if (options.length < 2 || options.length > 4) return toast('Pick two to four places.');
  if (!to.length) return toast('Pick at least one friend.');
  closeModal('user');
  const id = 'p' + Date.now().toString(36);
  SOCS.polls = { [id]: { options, to }, ...SOCS.polls };
  socSave();
  socReroute();
  toast(`Sent to ${socList(to.map(socName))}.`);
  $('#soc-mypolls')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
// In the sample, friends answer at once. Each picks the option that sits nearest their own
// want-to-go list, so the answers look like them rather than random.
function socSampleVote(friend, options) {
  const wants = socPerson(friend)
      .wants.filter(validPlace)
      .map((id) => P[id].cityId),
    known = socCities(socPerson(friend)),
    score = (c) => (wants.includes(c) ? 2 : 0) - (known.includes(c) ? 1 : 0);
  let best = 0;
  options.forEach((c, k) => {
    if (score(c) > score(options[best])) best = k;
  });
  if (score(options[best]) <= 0) best = (friend.length + options.length) % options.length;
  return best;
}
function socMyPollsHtml() {
  const polls = Object.entries(SOCS.polls || {}).filter(
    ([, p]) => p && Array.isArray(p.options) && Array.isArray(p.to),
  );
  if (!polls.length) return '';
  return `<section class="soc-mypolls" id="soc-mypolls" aria-label="Your polls"><div class="soc-sechead"><h2>Your polls</h2></div>${polls
    .map(([id, p]) => {
      const options = p.options.filter(validCity),
        to = p.to.filter((f) => SOCIAL.people[f] && !SOCS.blocked.includes(f)),
        votes = Object.fromEntries(to.map((f) => [f, socSampleVote(f, options)])),
        win = socWinners(votes, options),
        max = Math.max(
          1,
          ...options.map((_, k) => Object.values(votes).filter((v) => v === k).length),
        );
      return `<article class="soc-need mine"><header class="soc-need-head">${socAvatar(socMe())}<div><span class="eyebrow">Where next?</span><p>You asked ${esc(socList(to.map(socName)))} · ${to.length} answered ${socSample()}</p></div></header><div class="soc-results">${options
        .map((c, k) => {
          const who = Object.keys(votes).filter((f) => votes[f] === k);
          return `<div class="soc-result${win.includes(c) ? ' win' : ''}"><span class="soc-result-name">${esc(C[c].name)}</span><i style="--w:${Math.round((who.length / max) * 100)}%"></i>${socFaceRow(who)}</div>`;
        })
        .join('')}</div><div class="soc-need-acts">${
        win.length === 1
          ? `<button class="btn small" data-action="soc-dream-start" data-city="${win[0]}">${icon('route')} Start a trip to ${esc(C[win[0]].name)}</button>`
          : `<span class="soc-fine">A tie between ${esc(socList(win.map((c) => C[c].name)))}.</span>`
      }<button class="btn small ghost" data-action="soc-dream-close" data-id="${id}">Close poll</button></div><p class="soc-fine">Starting the trip adds it to your plan. Inviting the voters arrives with accounts.</p></article>`;
    })
    .join('')}</section>`;
}

// ---------------------------------------------------------------- group's picks on a story
// "Best meal", "Best view": decided by the travellers after a trip, shown on that stop.
function socPicksFor(storyId) {
  const out = {};
  const add = (place, label) => (out[place] = [...(out[place] || []), label]);
  (SOCIAL.picks || []).filter((x) => x.story === storyId).forEach((x) => add(x.place, x.label));
  SOCIAL.needs
    .filter((n) => n.kind === 'pick' && n.story === storyId && Object.hasOwn(SOCS.done, n.id))
    .forEach((n) =>
      socWinners({ ...n.votes, [socMe()]: SOCS.done[n.id] }, n.options).forEach((p) =>
        add(p, n.label),
      ),
    );
  return out;
}
function socPickBadge(storyId, placeId) {
  const labels = placeId ? socPicksFor(storyId)[placeId] : null;
  return labels
    ? `<p class="soc-grouppick">${icon('star')} The group’s pick: ${esc(labels.join(', ').toLowerCase())}</p>`
    : '';
}
