// Help me choose: when and how long, then budget, then mood. Tap-only, skippable, and the
// picks update as each answer changes. Also the home search suggestions.
const MOODS = [
    ['food', 'Food'],
    ['nature', 'Nature'],
    ['history', 'History and culture'],
    ['beach', 'Beach'],
    ['bigcity', 'Big city'],
    ['quiet', 'Quiet'],
  ],
  MOOD_WORD = {
    food: 'food',
    nature: 'nature',
    history: 'history and culture',
    beach: 'beaches',
    bigcity: 'big-city energy',
    quiet: 'a quiet pace',
  },
  BAND_STEPS = [1000, 2000, 3500, 5000],
  CHOOSE_DAYS = [
    [3, 'Long weekend'],
    [5, '5 days'],
    [7, '1 week'],
    [10, '10 days'],
    [14, '2 weeks'],
  ];
let moodCache = null,
  chooseShown = 3,
  chooseView = 'list',
  chooseMap = null,
  choosePicks = [],
  surpriseSeen = [];

// How strongly each city leans towards each mood, as a 0 to 1 standing among all cities.
function moodScores() {
  if (moodCache) return moodCache;
  const raw = {},
    words = (c, re) =>
      (
        [c.tagline, c.summary, ...c.items.map((p) => p.name + ' ' + p.summary)]
          .join(' ')
          .toLowerCase()
          .match(re) || []
      ).length;
  for (const c of CITIES) {
    const see = c.items.filter((p) => p.kind === 'see'),
      eat = c.items.filter((p) => p.kind === 'eat'),
      share = (types) =>
        see.length
          ? see.filter((p) => typesFor(p).some((t) => types.includes(t))).length / see.length
          : 0,
      rank = c.popularity?.tourism?.rank,
      big = (rank ? 1 - rank / 100 : 0) + (c.popularity?.arrivals ? 0.5 : 0);
    raw[c.id] = {
      food: eat.length + 2 * eat.filter((p) => p.michelin).length,
      nature: share(['Nature', 'Adventure']),
      history: share(['History', 'Architecture', 'Spiritual', 'Art']),
      beach: words(c, /beach|island|snorkel|lagoon|reef|surf/g),
      bigcity: big,
      quiet:
        (big ? 0 : 1) +
        share(['Nature']) * 0.5 +
        (words(c, /quiet|calm|slow|village|unhurried|peaceful/g) ? 0.3 : 0),
    };
  }
  moodCache = {};
  for (const [k] of MOODS) {
    const vals = CITIES.map((c) => raw[c.id][k]);
    for (const c of CITIES)
      (moodCache[c.id] ??= {})[k] =
        vals.filter((v) => v < raw[c.id][k]).length / Math.max(1, vals.length - 1);
  }
  return moodCache;
}
// One picture per mood, each from a different city. Food shows a dish, not a skyline.
let moodCovers = null;
function moodCover(k) {
  if (!moodCovers) {
    const ms = moodScores(),
      used = new Set();
    moodCovers = {};
    for (const [m] of MOODS) {
      const c = [...CITIES]
        .sort((a, b) => ms[b.id][m] - ms[a.id][m])
        .find((x) => !used.has(x.id) && PHOTO[x.id]);
      used.add(c.id);
      const dish =
        m === 'food' &&
        c.items
          .map((x) => P[x.id])
          .find((p) => p.kind === 'eat' && PHOTO[p.id] && !PHOTO[p.id].context);
      moodCovers[m] = dish ? dish.id : c.id;
    }
  }
  return moodCovers[k];
}
// Budget bands in US dollars. Currencies close to the dollar get the same round numbers in
// their own money (CA$1,000 rather than CA$1,350).
function bandsUSD() {
  const fx = COSTS.fx[budgetCurrency()] || 1;
  return BAND_STEPS.map((n) => (fx > 0.4 && fx < 2 ? n * fx : n));
}
// The per-person budget band that is active, or 0 when the budget is open or a custom amount.
function chooseBand() {
  const per = B().amount ? budgetUSD() / S.people : 0;
  return bandsUSD().find((b) => Math.abs(b - per) / b < 0.03) || 0;
}
function setBand(usd) {
  B().amount = usd ? Math.round(fromUSD(usd * S.people)) : 0;
}
function chooseAnswered() {
  return Boolean(B().month || B().amount || S.moods.length || B().days !== 7);
}
function chooseSummary() {
  const b = B(),
    out = [];
  if (b.month) out.push(MONTHS_LONG[b.month - 1]);
  out.push(CHOOSE_DAYS.find(([d]) => d === b.days)?.[1].toLowerCase() || `${b.days} days`);
  if (b.amount) out.push(`up to ${cash(budgetUSD() / S.people)} each`);
  if (S.moods.length) out.push(S.moods.map((m) => MOOD_WORD[m]).join(' and '));
  return out.join(' · ');
}
// Every city scored against the answers, best fit first, each with its reasons.
function chooseRank() {
  const o = budgetOrigin(),
    m = budgetMonth(),
    days = B().days,
    cap = budgetUSD(),
    ms = moodScores();
  return CITIES.map((c) => {
    const why = [];
    let score = -(c.popularity?.tourism?.rank ?? 150) / 1000,
      est = null,
      st = '';
    if (o) {
      est = pick(cityCost(c, days).total);
      if (cap) {
        st = fitState(est, cap);
        const diff = cash(Math.abs(cap - est) / S.people);
        if (st === 'fit') {
          score += 3;
          why.push(`${diff} under your budget`);
        } else if (st === 'stretch') {
          score += 1;
          why.push(`A stretch, ${diff} over`);
        } else {
          score -= 3 * (est / cap);
          why.push(`${diff} over your budget`);
        }
      }
    }
    if (m) {
      if (bestIn(c, m)) {
        score += 2;
        why.push(`At its best in ${MONTHS_LONG[m - 1]}`);
      } else score -= 1;
    }
    for (const k of S.moods) {
      score += 2.5 * ms[c.id][k];
      if (ms[c.id][k] >= 0.6) why.push(`Strong for ${MOOD_WORD[k]}`);
    }
    if (c.days <= days) score += 0.5;
    else score -= 0.5;
    if (why.length < 2)
      why.push(c.days <= days ? `${c.days} days covers it` : `Best with ${c.days} days`);
    return { c, est, st, why, score };
  }).sort((a, b) => b.score - a.score);
}
function pickCard(x) {
  const c = x.c;
  return `<article class="pickcard" data-action="city" data-id="${c.id}" tabindex="0" role="link" aria-label="Explore ${esc(c.name)}"><div class="pk-photo">${photoTag(c.id)}${x.est !== null ? `<span class="pk-price ${x.st}">About ${cash(x.est / S.people)}${S.people > 1 ? ' each' : ''}</span>` : ''}</div><div class="pk-body"><h3>${esc(c.name)}</h3><span class="citycountry">${esc(c.country)}</span><ul class="pk-why">${x.why
    .slice(0, 3)
    .map((w) => `<li>${icon('check')}${esc(w)}</li>`)
    .join(
      '',
    )}</ul><div class="actions">${cityAdd(c.id)}<button class="cmpbtn ${compareIds.includes(c.id) ? 'on' : ''}" data-action="cmp" data-id="${c.id}" aria-pressed="${compareIds.includes(c.id)}">${icon(compareIds.includes(c.id) ? 'check' : 'plus')} Compare</button></div></div></article>`;
}
function chooseFix(list) {
  const b = B(),
    cap = budgetUSD();
  if (!cap || !budgetOrigin() || list.some((x) => x.st === 'fit')) return '';
  const fits = (days) => CITIES.filter((c) => pick(cityCost(c, days).total) <= cap).length,
    d = CHOOSE_DAYS.map(([n]) => n)
      .filter((n) => n < b.days)
      .reverse()
      .find((n) => fits(n)),
    up = bandsUSD().find(
      (u) => u > cap / S.people && CITIES.some((c) => pick(cityCost(c).total) <= u * S.people),
    );
  return `<div class="choosefix"><strong>Nothing fits all of that yet, so these are the closest.</strong>${d ? ` <button class="inline-link" data-action="ch-days" data-id="${d}">Try ${d} days (${fits(d)} fit)</button>` : ''}${up ? ` <button class="inline-link" data-action="ch-band" data-id="${up}">Try up to ${cash(up)}</button>` : ''}</div>`;
}
function renderChooseResults() {
  const el = $('#choose-results');
  if (!el) return;
  const list = chooseRank(),
    shown = list.slice(0, chooseShown),
    o = budgetOrigin();
  choosePicks = list.slice(0, 3).map((x) => x.c.id);
  if (chooseMap) {
    chooseMap.remove();
    chooseMap = null;
  }
  el.innerHTML = `<div class="rowhead choosehead"><h2>${chooseAnswered() ? 'Three picks for you' : 'Three to start with'}</h2><div class="viewtoggle" role="group" aria-label="Show picks as"><button class="${chooseView === 'list' ? 'active' : ''}" data-action="ch-view" data-id="list">${icon('list')} List</button><button class="${chooseView === 'map' ? 'active' : ''}" data-action="ch-view" data-id="map">${icon('map')} Map</button></div></div>${o ? '' : '<p class="muted">Choose where you are leaving from to see prices.</p>'}${chooseFix(list)}${
    chooseView === 'map'
      ? '<div id="choose-map" aria-label="Picks on a map"></div>'
      : `<div class="pickgrid">${shown.map(pickCard).join('')}</div>`
  }<div class="actions chooseactions">${chooseView === 'list' && chooseShown < list.length ? `<button class="btn light" data-action="ch-more">Show more</button>` : ''}<button class="btn light" data-action="ch-surprise">${icon('shuffle')} Surprise me</button><button class="btn" data-action="ch-send">${icon('share')} Send these three to friends</button></div>`;
  if (chooseView === 'map') initChooseMap(list.slice(0, Math.max(12, chooseShown)));
}
function initChooseMap(list) {
  if (typeof L === 'undefined') return;
  chooseMap = L.map('choose-map', {
    zoomControl: !isMobile(),
    minZoom: 1,
    maxZoom: 8,
    scrollWheelZoom: false,
    worldCopyJump: true,
  });
  chooseMap.createPane('offline-outline');
  chooseMap.getPane('offline-outline').style.zIndex = '150';
  L.geoJSON(DATA.world, {
    pane: 'offline-outline',
    style: outlineStyle(),
    interactive: false,
  }).addTo(chooseMap);
  chooseMap.attributionControl.setPrefix(false);
  chooseMap.attributionControl.addAttribution(
    'Outline: <a href="https://www.naturalearthdata.com/">Natural Earth</a>',
  );
  list.forEach((x, i) =>
    L.marker([x.c.lat, x.c.lon], {
      icon: L.divIcon({
        className: 'price-pin-wrap',
        html: `<span class="price-pin ${i < 3 ? 'top' : ''} ${x.st}" title="${esc(x.c.name)}">${i < 3 || x.est === null ? esc(x.c.name) : ''}${i < 3 && x.est !== null ? ' · ' : ''}${x.est !== null ? cash(x.est / S.people) : ''}</span>`,
        iconSize: [0, 0],
      }),
      zIndexOffset: i < 3 ? 500 : 0,
      keyboard: false,
    })
      .on('click', () => (location.hash = '#/city/' + x.c.id))
      .addTo(chooseMap),
  );
  chooseMap.fitBounds(
    list.map((x) => [x.c.lat, x.c.lon]),
    { padding: [40, 40], maxZoom: 5 },
  );
  setTimeout(() => chooseMap?.invalidateSize(), 100);
}
function originSelect(id) {
  const byCountry = ORIGINS.reduce((m, o) => ((m[o.country] ??= []).push(o), m), {});
  return `<select id="${id}" aria-label="Leaving from"><option value="">Choose a city</option>${Object.entries(
    byCountry,
  )
    .map(
      ([country, list]) =>
        `<optgroup label="${esc(country)}">${list.map((o) => `<option value="${o.id}" ${o.id === B().origin ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</optgroup>`,
    )
    .join('')}</select>`;
}
function renderChoose(params) {
  headerActive('explore');
  if (!B().origin) {
    B().origin = guessOrigin();
    if (B().origin) persist();
  }
  const b = B(),
    band = chooseBand(),
    now = new Date().getMonth(),
    months = MONTHS.map((_, i) => (now + i) % 12),
    shared = (params?.get('pick') || '').split(',').filter(validCity).slice(0, 3),
    chip = (on, action, id, label) =>
      `<button class="chip ${on ? 'active' : ''}" data-action="${action}" data-id="${id}" aria-pressed="${on}">${label}</button>`;
  $('#app').innerHTML =
    `<div class="wrap choosepage"><div class="backline"><a href="#/">${icon('left')} Explore</a></div><div class="choose-head"><h1>Help me choose</h1><p>Tap what you know. Skip the rest.</p></div>${
      shared.length
        ? `<section class="sharedpicks"><div class="rowhead"><h2>A friend sent you these</h2></div><div class="pickgrid">${chooseRank()
            .filter((x) => shared.includes(x.c.id))
            .map(pickCard)
            .join('')}</div></section>`
        : ''
    }<section class="cq"><h2>When?</h2><div class="chips rowchips" id="ch-months">${chip(!b.month, 'ch-month', 0, 'Any time')}${months.map((i) => chip(b.month === i + 1, 'ch-month', i + 1, MONTHS_LONG[i])).join('')}</div><h2>How long?</h2><div class="chips rowchips">${CHOOSE_DAYS.map(([d, l]) => chip(b.days === d, 'ch-days', d, l)).join('')}</div></section><section class="cq"><h2>Budget for each person</h2><p class="cq-note">The whole trip: flights, hotel, food and fun.</p><div class="chips rowchips">${chip(!b.amount, 'ch-band', 0, 'Any budget')}${bandsUSD()
      .map((u) => chip(band === u, 'ch-band', u, 'Up to ' + cash(u)))
      .join(
        '',
      )}${b.amount && !band ? chip(true, 'bud-edit', '', cash(budgetUSD() / S.people) + ' each') : ''}</div><div class="cq-from"><label>From ${originSelect('ch-origin')}</label><div class="stepper"><button data-action="ch-people" data-dir="-1" aria-label="Fewer travellers">−</button><strong>${S.people} traveller${S.people > 1 ? 's' : ''}</strong><button data-action="ch-people" data-dir="1" aria-label="More travellers">+</button></div></div></section><section class="cq"><h2>In the mood for?</h2><p class="cq-note">Pick up to two.</p><div class="moodgrid">${MOODS.map(([k, l]) => `<button class="moodtile ${S.moods.includes(k) ? 'active' : ''}" data-action="ch-mood" data-id="${k}" aria-pressed="${S.moods.includes(k)}">${photoTag(moodCover(k))}<span>${l}</span>${icon('check')}</button>`).join('')}</div></section><div id="choose-results"></div>${footer()}</div>`;
  renderChooseResults();
}
function rerenderChoose() {
  const y = window.scrollY,
    x = $('#ch-months')?.scrollLeft || 0;
  persist();
  renderChoose(new URLSearchParams(location.hash.split('?')[1] || ''));
  if ($('#ch-months')) $('#ch-months').scrollLeft = x;
  window.scrollTo(0, y);
}
// A city within the answers, shown with its best photos only.
function chooseSurprise() {
  const list = chooseRank(),
    fits = list.filter((x) => x.st === 'fit'),
    pool = (fits.length >= 3 ? fits : list.slice(0, 12)).filter(
      (x) => !surpriseSeen.includes(x.c.id),
    );
  if (!pool.length) {
    surpriseSeen = [];
    return chooseSurprise();
  }
  const x = pool[Math.floor(Math.random() * Math.min(pool.length, 8))],
    c = x.c;
  surpriseSeen.push(c.id);
  const shots = topFive(c.id)
    .filter((p) => !leadsWithArt(p.id) && PHOTO[p.id])
    .slice(0, 3);
  showModal(
    `<div class="surprise"><div class="sp-main">${photoTag(c.id, '', false)}</div><div class="sp-row">${shots.map((p) => `<figure>${photoTag(p.id)}<figcaption>${esc(p.name)}</figcaption></figure>`).join('')}</div><div class="modalcontent"><span class="eyebrow">HOW ABOUT</span><h2>${esc(c.name)}</h2><p class="lead">${esc(c.tagline)}</p><ul class="pk-why">${x.why
      .slice(0, 3)
      .map((w) => `<li>${icon('check')}${esc(w)}</li>`)
      .join(
        '',
      )}</ul></div></div><div class="sheet-actions"><button class="btn ghost" data-action="ch-surprise">${icon('shuffle')} Not this, another</button><a class="btn" href="#/city/${c.id}">Explore ${esc(c.name)} ${icon('arrow')}</a></div>`,
    `Surprise: ${c.name}`,
  );
}
async function chooseSend() {
  const names = choosePicks.map((id) => C[id].name),
    url = location.href.split('#')[0] + '#/choose?pick=' + choosePicks.join(','),
    text = `Where should we go? ${listNames(names).replace(' and ', ' or ')}?`;
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ title: 'Where should we go?', text, url });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast('Link copied. Paste it to your friends.');
  } catch (e) {
    showModal(
      `<div class="modalcontent"><h2>Send these three</h2><p class="muted">Copy this link and send it to your friends.</p><textarea class="sharelink" readonly rows="3">${esc(text + ' ' + url)}</textarea></div>`,
      'Send to friends',
    );
  }
}
// Home: the remembered answers as one pill, and the Dream / Save / Trip strip.
function choosePill() {
  return chooseAnswered()
    ? `<a class="choosepill" href="#/choose">${icon('sliders')}<span>${esc(chooseSummary())}</span><b>Change</b></a>`
    : '';
}
function loopStrip() {
  const saved = savedCount(),
    trip = S.trip.length,
    step = (n, href, label, sub, done, cur) =>
      `<a href="${href}" class="${done ? 'done' : ''} ${cur ? 'current' : ''}"><b>${done ? icon('check') : n}</b><span><strong>${label}</strong><small>${sub}</small></span></a>`;
  return `<nav class="loopstrip" aria-label="How it works">${step(1, '#/choose', 'Dream', 'Find a place', saved > 0 || trip > 0, !saved && !trip)}${step(2, '#/saved', 'Save', saved ? `${saved} saved` : 'Tap a heart', saved > 0 && trip > 0, saved === 0 ? false : !trip)}${step(3, '#/trip', 'Trip', trip ? `${trip} ${trip > 1 ? 'cities' : 'city'}` : 'Add a city', false, trip > 0)}</nav>`;
}

// ---------- Compare up to three cities, with bars ----------
let compareIds = [];
function updateCompareBar() {
  let el = $('#cmpbar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cmpbar';
    el.className = 'cmpbar no-print';
    document.body.appendChild(el);
  }
  el.hidden = !compareIds.length;
  document.body.classList.toggle('has-compare', compareIds.length > 0);
  el.innerHTML = compareIds.length
    ? `<span class="cmp-thumbs">${compareIds.map((id) => photoTag(id)).join('')}</span><span class="cmp-text">${compareIds.length === 1 ? 'Pick one or two more' : listNames(compareIds.map((id) => C[id].name))}</span><button class="cmp-clear" data-action="cmp-clear" aria-label="Clear comparison">${icon('close')}</button><button class="btn small" data-action="cmp-open" ${compareIds.length < 2 ? 'disabled' : ''}>Compare</button>`
    : '';
}
function toggleCompare(id) {
  if (compareIds.includes(id)) compareIds = compareIds.filter((x) => x !== id);
  else if (compareIds.length >= 3) return toast('Compare up to three at a time.');
  else compareIds.push(id);
  $$(`[data-action="cmp"][data-id="${id}"]`).forEach((b) => {
    const on = compareIds.includes(id);
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
    b.innerHTML = icon(on ? 'check' : 'plus') + ' Compare';
  });
  updateCompareBar();
}
function openCompare() {
  const cs = compareIds.map((id) => C[id]),
    o = budgetOrigin(),
    ms = moodScores(),
    rows = (title, vals, fmt, lowBest = true) => {
      if (vals.some((v) => v === null)) return '';
      const max = Math.max(...vals, 1),
        best = lowBest ? Math.min(...vals) : Math.max(...vals);
      return `<section class="cmp-metric"><h3>${title}</h3>${cs.map((c, i) => `<div class="cmp-row"><span>${esc(c.name)}</span><div class="cmp-track"><i class="${vals[i] === best ? 'best' : ''}" style="width:${Math.max(4, Math.round((vals[i] / max) * 100))}%"></i></div><b>${fmt(vals[i])}</b></div>`).join('')}</section>`;
    };
  showModal(
    `<div class="modalcontent comparesheet"><h2>Side by side</h2><div class="cmp-heads">${cs.map((c) => `<a href="#/city/${c.id}">${photoTag(c.id)}<strong>${esc(c.name)}</strong><small>${esc(c.country)}</small></a>`).join('')}</div>${rows(
      `Price for ${B().days} days${S.people > 1 ? ', each' : ''}`,
      cs.map((c) => (o ? pick(cityCost(c).total) / S.people : null)),
      (v) => cash(v),
    )}${rows(
      o ? `Travel time from ${esc(o.name)}` : '',
      cs.map((c) => {
        const f = flightHours(c);
        return f ? (f.ground ? 2 : f.h) : null;
      }),
      (v) => `${v} h`,
    )}${rows(
      'Days needed',
      cs.map((c) => c.days),
      (v) => `${v} days`,
    )}<section class="cmp-metric"><h3>Best months</h3>${cs.map((c) => `<div class="cmp-row"><span>${esc(c.name)}</span><div class="cmp-months">${MONTHS.map((m, i) => `<i class="${c.bestMonths.includes(i + 1) ? 'on' : ''}" title="${m}">${m[0]}</i>`).join('')}</div></div>`).join('')}</section><section class="cmp-metric"><h3>Strongest for</h3>${cs
      .map(
        (c) =>
          `<div class="cmp-row"><span>${esc(c.name)}</span><div class="cmp-moods">${MOODS.map(
            ([k]) => k,
          )
            .sort((a, b) => ms[c.id][b] - ms[c.id][a])
            .slice(0, 2)
            .map((k) => `<em>${MOOD_WORD[k]}</em>`)
            .join('')}</div></div>`,
      )
      .join(
        '',
      )}</section><div class="actions cmp-add">${cs.map((c) => cityAdd(c.id)).join('')}</div></div>`,
    'Compare',
  );
}

// ---------- Search: cities, places and dishes, forgiving of typos ----------
let searchIndex = null;
function plain(t) {
  return String(t)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
function buildSearchIndex() {
  const out = [];
  for (const c of CITIES) {
    out.push({
      kind: 'city',
      id: c.id,
      label: c.name,
      sub: `City in ${c.country}`,
      t: plain(c.name),
      w: 3,
    });
    out.push({
      kind: 'city',
      id: c.id,
      label: c.name,
      sub: `In ${c.country}`,
      t: plain(c.country),
      w: 2,
      alt: true,
    });
    for (const p of c.items) {
      const what = p.kind === 'eat' ? 'Food' : p.kind === 'shop' ? 'Shopping' : 'Sight';
      out.push({
        kind: 'place',
        id: p.id,
        label: p.name,
        sub: `${what} in ${c.name}`,
        t: plain(p.name),
        w: 1,
      });
      for (const d of p.mustOrder || [])
        out.push({
          kind: 'place',
          id: p.id,
          label: d,
          sub: `Dish at ${p.name}, ${c.name}`,
          t: plain(d),
          w: 0,
          dish: true,
        });
    }
  }
  return out;
}
// Edit distance that counts a swapped pair of letters as one slip.
function slips(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}
function searchScore(q, t) {
  if (t === q) return 120;
  if (t.startsWith(q)) return 100;
  const words = t.split(' ');
  if (words.some((w) => w.startsWith(q))) return 80;
  if (t.includes(q)) return 60;
  if (q.length < 4) return 0;
  const max = q.length <= 5 ? 1 : 2;
  let best = 99;
  for (const cand of [t, ...words]) {
    if (cand[0] !== q[0]) continue;
    for (const len of [q.length - 1, q.length, q.length + 1])
      best = Math.min(best, slips(q, cand.slice(0, Math.max(1, len))));
  }
  return best <= max ? 40 - best * 8 : 0;
}
function searchSuggest(query) {
  const q = plain(query);
  if (q.length < 2) return [];
  searchIndex ??= buildSearchIndex();
  const seen = new Set(),
    out = [];
  for (const e of searchIndex) {
    const s = searchScore(q, e.t);
    if (s) out.push({ ...e, s: s + e.w, fuzzy: s < 60 });
  }
  return out
    .sort((a, b) => b.s - a.s || a.label.length - b.label.length)
    .filter((e) => {
      const k = e.kind + e.id + (e.dish ? e.label : '');
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .filter((e, i, all) => !e.fuzzy || all.slice(0, i).filter((x) => x.fuzzy).length < 3)
    .slice(0, 7);
}
function renderSuggest(query) {
  const el = $('#search-suggest');
  if (!el) return;
  const list = searchSuggest(query);
  el.hidden = plain(query).length < 2;
  el.innerHTML = list.length
    ? list
        .map(
          (e) =>
            `<button role="option" data-action="sg" data-kind="${e.kind}" data-id="${e.id}">${e.kind === 'city' ? photoTag(e.id) : visualTag(e.id)}<span><strong>${esc(e.label)}</strong><small>${e.fuzzy ? 'Did you mean this? ' : ''}${esc(e.sub)}</small></span>${icon('arrow')}</button>`,
        )
        .join('')
    : `<p class="sg-none">Nothing matches that. <a href="#/choose">Let us help you choose</a>.</p>`;
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action]');
  if (!t) {
    if (!e.target.closest('.door')) $('#search-suggest')?.setAttribute('hidden', '');
    return;
  }
  const a = t.dataset.action,
    id = t.dataset.id;
  if (a === 'ch-month') {
    B().month = Number(id);
    rerenderChoose();
  } else if (a === 'ch-days') {
    const band = chooseBand();
    B().days = Number(id);
    if (band) setBand(band);
    rerenderChoose();
  } else if (a === 'ch-band') {
    setBand(Number(id));
    rerenderChoose();
  } else if (a === 'ch-people') {
    const band = chooseBand();
    S.people = Math.min(12, Math.max(1, S.people + Number(t.dataset.dir)));
    if (band) setBand(band);
    rerenderChoose();
  } else if (a === 'ch-mood') {
    S.moods = S.moods.includes(id) ? S.moods.filter((x) => x !== id) : [...S.moods, id].slice(-2);
    rerenderChoose();
  } else if (a === 'ch-view') {
    chooseView = id;
    renderChooseResults();
  } else if (a === 'ch-more') {
    chooseShown += 6;
    renderChooseResults();
  } else if (a === 'ch-surprise') chooseSurprise();
  else if (a === 'ch-send') chooseSend();
  else if (a === 'cmp') {
    e.stopPropagation();
    toggleCompare(id);
  } else if (a === 'cmp-clear') {
    const was = compareIds;
    compareIds = [];
    was.forEach((x) => {
      compareIds = [x];
      toggleCompare(x);
    });
    updateCompareBar();
  } else if (a === 'cmp-open') openCompare();
  else if (a === 'sg') {
    if (t.dataset.kind === 'city') location.hash = '#/city/' + id;
    else {
      placeList = [];
      openPlace(id);
    }
    $('#search-suggest')?.setAttribute('hidden', '');
  }
});
document.addEventListener('change', (e) => {
  if (e.target.id !== 'ch-origin') return;
  const band = chooseBand();
  B().origin = e.target.value;
  if (band) setBand(band);
  rerenderChoose();
});
document.addEventListener('keydown', (e) => {
  if (e.target.id === 'browse-search' && e.key === 'Enter') $('#search-suggest button')?.click();
});
