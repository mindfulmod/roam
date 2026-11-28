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
// Cross-city order: the city-relative popularity score, then Wikipedia readership.
function worldOrder(a, b) {
  return (
    (popularityScore(b) ?? -1) - (popularityScore(a) ?? -1) ||
    (b.signals?.wikipedia?.views ?? -1) - (a.signals?.wikipedia?.views ?? -1)
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
    `<div class="wrap home"><section class="home-hero">${photoTag('kyoto', '', false)}<div class="home-hero-copy"><h1>Where to next?</h1></div><span class="hero-credit">${photoCredit('kyoto')}</span></section><section class="doors"><div class="door door-search"><div class="searchbox hero-search">${icon('search')}<input type="search" id="browse-search" autocomplete="off" aria-label="Search cities, sights and dishes" placeholder="Search a city, sight or dish"></div><div class="suggest" id="search-suggest" role="listbox" hidden></div></div></section><div class="home-quick"><a class="hq hq-choose" href="#/choose"><i>${icon('compass')}</i><span><strong>Help me choose</strong><small>Match my trip</small></span></a>${storyTile()}</div>${choosePill()}<div class="chips region-chips" id="region-chips">${['All', 'Asia', 'Europe', 'Africa', 'South America', 'North America', 'Oceania'].map((r) => `<button class="chip ${browseRegion === r ? 'active' : ''}" data-action="region" data-id="${r}">${r === 'All' ? 'Everywhere' : r}</button>`).join('')}</div><div class="browse-tools" id="browse">${monthPick()}<label class="sortpick"><span>Sort</span><select id="browse-sort" aria-label="Sort destinations">${[
      ['tourism', 'Most loved'],
      ['arrivals', 'Most visited'],
      ['personal', 'Japan first'],
    ]
      .map(([k, t]) => `<option value="${k}" ${browseSort === k ? 'selected' : ''}>${t}</option>`)
      .join(
        '',
      )}</select></label><button class="iconbtn rank-info" data-action="ranking-method" aria-label="How we order places" title="How we order places">${icon('info')}</button></div><div id="browse-results"></div>${vibeSection()}<div class="rowhead"><h2>Ready-made trips</h2><a href="#/trip" class="inline-link">See all ${icon('arrow')}</a></div><div class="hrow">${TEMPLATES.slice(
      0,
      6,
    )
      .map(
        (t) =>
          `<article class="tripteaser" data-action="template" data-id="${t.id}" tabindex="0" role="button" aria-label="Plan ${esc(t.title)}"><div class="starter-art">${photoTag(t.cities[0])}</div><div class="teaser-body"><div class="tag">${t.tag}</div><h3>${t.title}</h3><p>${t.highlights}</p></div></article>`,
      )
      .join('')}</div>${footer()}</div>`;
  renderBrowse();
}
// "When can I go?": one menu of months. The pick also prices every estimate for that month.
function monthPick() {
  const m = budgetMonth();
  return `<label class="sortpick month-pick">${icon('calendar')}<span class="visually-hidden">When are you going?</span><select id="month-pick" aria-label="When are you going?"><option value="0" ${m ? '' : 'selected'}>Any time</option>${MONTHS_LONG.map((t, i) => `<option value="${i + 1}" ${m === i + 1 ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
}
function syncMonthChips() {
  const el = $('#month-pick');
  if (el) el.value = String(budgetMonth() || 0);
}
const bestIn = (c, m) => c.bestMonths.includes(m);
function browseOrder(list) {
  if (browseSort === 'personal') return list;
  return [...list].sort((a, b) => (cityRanking(a)?.rank ?? 1e4) - (cityRanking(b)?.rank ?? 1e4));
}
// The city page opens on a saveable strip of its five most popular sights.
function cityTopFive(c) {
  const top = topFive(c.id);
  if (!top.length) return '';
  return `<section class="topfive"><div class="rowhead"><h2>Top 5 in ${esc(c.name)}</h2>${top.some((p) => !saved(p.id)) ? `<button class="inline-link" data-action="save-top5" data-id="${c.id}">${icon('heart')} Save all five</button>` : ''}</div><div class="t5row">${top.map((p, i) => `<article class="t5card" data-action="place" data-id="${p.id}" tabindex="0" role="button" aria-label="${esc(p.name)}">${visualTag(p.id)}${saveButton(p.id)}<span class="t5n">${i + 1}</span><strong>${esc(p.name)}</strong></article>`).join('')}</div></section>`;
}
// Days needed, flight time and daily spend as tiles, then the twelve-month strip.
function cityGlance(c) {
  const f = flightHours(c),
    o = budgetOrigin(),
    dots = Array.from(
      { length: Math.min(10, Math.max(c.days, 7)) },
      (_, i) => `<i class="${i < c.days ? 'on' : ''}"></i>`,
    ).join('');
  return `<section class="cityglance"><div class="glance"><div class="g-tile"><label>Days needed</label><div class="daydots">${dots}</div><strong>${c.days} days</strong></div>${f ? `<div class="g-tile"><label>From ${esc(o.name)}</label><div class="g-bar"><i style="width:${f.ground ? 6 : Math.min(100, Math.round((f.h / 24) * 100))}%"></i></div><strong>${f.label}${f.ground ? '' : f.hop ? ' with a connection' : ' in the air'}</strong></div>` : ''}<div class="g-tile"><label>Each day, per person</label><strong class="g-cost">${range(c.dailyBudget, c.currency)}</strong><small>food, transport and sights</small></div></div>${yearStrip(c)}</section>`;
}
// Rows stop after a dozen cards and end on a "See all" card: rendering every city on the
// home page made it thousands of elements long and stuttered when scrolled on phones.
const ROW_MAX = 12,
  GRID_STEP = 24;
let gridShown = GRID_STEP;
function cityRow(title, list, region = '', skip = []) {
  const more = region && list.length > ROW_MAX,
    shown = skip.length ? list.filter((c) => !skip.includes(c)) : list;
  return `<section class="cityrow"><div class="rowhead"><h2>${title}</h2>${region ? `<button class="inline-link" data-action="region" data-id="${region}" data-jump>See all ${list.length} ${icon('arrow')}</button>` : ''}</div><div class="hrow">${shown
    .slice(0, region ? ROW_MAX : 20)
    .map(cityCard)
    .join(
      '',
    )}${more ? `<button class="seeall-card" data-action="region" data-id="${region}" data-jump><strong>${list.length - ROW_MAX} more</strong><span>See all of ${esc(region)} ${icon('arrow')}</span></button>` : ''}</div></section>`;
}
// The full grid draws a page of cards at a time and adds the next page as you near the end.
let gridWatch = null;
function moreGrid() {
  const el = $('#browse-results .citygrid'),
    list = el?._list;
  if (!list) return;
  const next = list.slice(gridShown, gridShown + GRID_STEP);
  gridShown += next.length;
  el.insertAdjacentHTML('beforeend', next.map(cityCard).join(''));
  const btn = $('#grid-more');
  if (btn && gridShown >= list.length) {
    gridWatch?.disconnect();
    btn.hidden = true;
  } else if (btn) btn.textContent = `Show ${list.length - gridShown} more`;
}
function renderBrowse() {
  gridShown = GRID_STEP;
  gridWatch?.disconnect();
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
    const regions = ['Asia', 'Europe', 'Africa', 'South America', 'North America', 'Oceania'];
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
            browseSort === 'arrivals' ? 'Most visited in the world' : 'Most loved worldwide',
            top,
          )) +
      regions
        .map((r) => [r, list.filter((c) => c.region === r)])
        .filter(([, l]) => l.length)
        .map(([r, l]) => cityRow(r, l, r, top))
        .join('');
    return;
  }
  const m = budgetMonth();
  if (m) list.sort((a, b) => bestIn(b, m) - bestIn(a, m));
  el.innerHTML = `<p class="muted result-count">${list.length} destination${list.length > 1 ? 's' : ''}${m ? ` · ${list.filter((c) => bestIn(c, m)).length} at their best in ${MONTHS_LONG[m - 1]}` : ''}${browseRegion !== 'All' ? ' in ' + esc(browseRegion) + ` · <button class="inline-link" data-action="region" data-id="All">Show everywhere</button>` : ''}</p><div class="citygrid">${list.slice(0, gridShown).map(cityCard).join('')}</div>${list.length > gridShown ? `<button class="btn light grid-more" id="grid-more" data-action="grid-more">Show ${list.length - gridShown} more</button>` : ''}`;
  $('#browse-results .citygrid')._list = list;
  const btn = $('#grid-more');
  if (btn && 'IntersectionObserver' in window) {
    gridWatch = new IntersectionObserver((es) => es.some((x) => x.isIntersecting) && moreGrid(), {
      rootMargin: '600px 0px',
    });
    gridWatch.observe(btn);
  }
}
