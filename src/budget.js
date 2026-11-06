'use strict';
// Budget finder: "where can my budget take me?" from a home city, a total budget and a trip
// length. Everything here is a rough planning estimate baked into data/costs.json, never a
// live quote. Loaded before app.js, so top-level code may only touch DATA; everything else
// runs later, once app.js has defined S, C, CITIES and the helpers.
const COSTS = DATA.costs || { fx: { USD: 1 }, origins: [], cities: {} },
  ORIGINS = COSTS.origins,
  ORIGIN = Object.fromEntries(ORIGINS.map((o) => [o.id, o])),
  BUDGET_DAYS = [3, 5, 7, 10, 14],
  BUDGET_CURRENCIES = [...new Set(['USD', ...ORIGINS.map((o) => o.currency)])];

function defaultBudget() {
  return { amount: 0, currency: '', origin: '', days: 7, people: 1, style: 'thrifty' };
}
function cleanBudget(b) {
  const d = defaultBudget();
  if (!b || typeof b !== 'object') return d;
  const amount = Number(b.amount);
  d.amount = Number.isFinite(amount) ? Math.min(1e10, Math.max(0, Math.round(amount))) : 0;
  d.currency = BUDGET_CURRENCIES.includes(b.currency) ? b.currency : '';
  d.origin = Object.hasOwn(ORIGIN, b.origin) ? b.origin : '';
  d.days = Math.min(30, Math.max(1, Math.round(Number(b.days) || 7)));
  d.people = Math.min(12, Math.max(1, Math.round(Number(b.people) || 1)));
  d.style = b.style === 'comfort' ? 'comfort' : 'thrifty';
  return d;
}
// A first guess at the home city from the browser's time zone, so most people never touch it.
function guessOrigin() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return ORIGINS.find((o) => o.tz?.includes(tz))?.id || '';
  } catch (e) {
    return '';
  }
}
const B = () => S.budget;
function budgetOrigin() {
  return ORIGIN[B().origin] || null;
}
function budgetCurrency() {
  return B().currency || budgetOrigin()?.currency || 'USD';
}
function toUSD(n, cur) {
  return n * (COSTS.fx[cur] ?? 0);
}
function fromUSD(usd, cur = budgetCurrency()) {
  return usd / (COSTS.fx[cur] || 1);
}
function niceRound(x) {
  const a = Math.abs(x);
  const step = a < 100 ? 5 : a < 1000 ? 10 : a < 10000 ? 50 : 10 ** (Math.floor(Math.log10(a)) - 2);
  return Math.round(x / step) * step;
}
function cash(usd, cur = budgetCurrency()) {
  const v = niceRound(fromUSD(usd, cur));
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: 0,
    }).format(v);
  } catch (e) {
    return `${cur} ${num(v)}`;
  }
}

// Typical round-trip economy fare per person, from a distance curve. Very short hops are
// treated as a train or bus; smaller airports add a connecting leg.
function fareUSD(o, c) {
  const km = hav(o, c),
    k = COSTS.cities[c.id] || {};
  if (km < COSTS.groundKm) return { lo: COSTS.ground[0], hi: COSTS.ground[1], km, ground: true };
  const curve = COSTS.fareCurve;
  let lo = curve.at(-1)[1];
  for (let i = 0; i < curve.length; i++) {
    const [x1, y1] = curve[i];
    if (km <= x1) {
      const [x0, y0] = curve[i - 1] || [0, curve[0][1]];
      lo = y0 + ((y1 - y0) * (km - x0)) / (x1 - x0 || 1);
      break;
    }
  }
  lo *= k.fare || 1;
  if (o.region === c.region && km < 4000) lo *= COSTS.sameRegionShortHaul;
  let hi = lo * COSTS.fareHigh;
  const hop = km > 1500 && k.hop;
  if (hop) {
    lo += k.hop[0];
    hi += k.hop[1];
  }
  return { lo, hi, km, hop: Boolean(hop) };
}
function dailyUSD(c) {
  return c.dailyBudget.map((n) => toUSD(n, c.currency));
}
// Cost of one city for the whole party, as [low, high] in USD per part.
function cityCost(c, days = B().days, people = B().people, o = budgetOrigin()) {
  const k = COSTS.cities[c.id] || { hotel: [80, 160] },
    f = fareUSD(o, c),
    rooms = Math.ceil(people / 2),
    cars = Math.ceil(people / 5),
    d = dailyUSD(c);
  const parts = {
    travel: [f.lo * people, f.hi * people],
    stay: [k.hotel[0] * rooms * days, k.hotel[1] * rooms * days],
    daily: [d[0] * people * days, d[1] * people * days],
    car: k.car ? [COSTS.car[0] * cars * days, COSTS.car[1] * cars * days] : [0, 0],
  };
  return { c, f, k, days, people, rooms, parts, total: sumParts(parts) };
}
function sumParts(parts) {
  return Object.values(parts).reduce((t, [a, b]) => [t[0] + a, t[1] + b], [0, 0]);
}
const pick = (r) => (B().style === 'comfort' ? r[1] : r[0]);
// A ready-made trip: fly into the first city and home from it, with a hop between cities.
function templateCost(t, people = B().people, o = budgetOrigin()) {
  const legs = t.cities.length - 1,
    parts = { travel: [0, 0], stay: [0, 0], daily: [0, 0], car: [0, 0] };
  t.cities.forEach((id, i) => {
    const days = t.days[i] + (i ? 1 : 0),
      x = cityCost(C[id], days, people, o);
    for (const p of ['stay', 'daily', 'car']) {
      parts[p][0] += x.parts[p][0];
      parts[p][1] += x.parts[p][1];
    }
    if (!i) parts.travel = x.parts.travel;
  });
  parts.travel = [
    parts.travel[0] + COSTS.leg[0] * legs * people,
    parts.travel[1] + COSTS.leg[1] * legs * people,
  ];
  const days = t.days.reduce((a, b) => a + b, 0) + legs;
  return { t, days, parts, total: sumParts(parts) };
}
function budgetUSD() {
  return toUSD(B().amount, budgetCurrency());
}
function fitState(est, budget = budgetUSD()) {
  if (!budget) return '';
  return est <= budget ? 'fit' : est <= budget * 1.2 ? 'stretch' : 'over';
}
function budgetReady() {
  return Boolean(budgetOrigin());
}

// ---------- Page ----------
function budgetForm() {
  const b = B(),
    cur = budgetCurrency();
  const byCountry = ORIGINS.reduce((m, o) => ((m[o.country] ??= []).push(o), m), {});
  return `<section class="budget-form" aria-label="Your budget"><div class="field budget-amount"><label for="bud-amount">Total budget</label><div class="money-input"><select id="bud-cur" aria-label="Currency">${BUDGET_CURRENCIES.map((c) => `<option ${c === cur ? 'selected' : ''}>${c}</option>`).join('')}</select><input id="bud-amount" type="number" inputmode="numeric" min="0" step="100" placeholder="e.g. 2000" value="${b.amount || ''}"></div></div><div class="field"><label for="bud-origin">Leaving from</label><select id="bud-origin"><option value="">Choose the nearest city</option>${Object.entries(
    byCountry,
  )
    .map(
      ([country, list]) =>
        `<optgroup label="${esc(country)}">${list.map((o) => `<option value="${o.id}" ${o.id === b.origin ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</optgroup>`,
    )
    .join(
      '',
    )}</select></div><div class="budget-line"><div class="budget-group"><span class="budget-label">Trip length</span><div class="chips" role="group" aria-label="Trip length">${BUDGET_DAYS.map((d) => `<button class="chip ${b.days === d ? 'active' : ''}" data-action="bud-days" data-id="${d}">${d} days</button>`).join('')}</div></div><div class="budget-group"><span class="budget-label">Travellers</span><div class="stepper"><button data-action="bud-people" data-dir="-1" aria-label="Fewer travellers">−</button><strong id="bud-people">${b.people}</strong><button data-action="bud-people" data-dir="1" aria-label="More travellers">+</button></div></div><div class="budget-group"><span class="budget-label">Style</span><div class="chips" role="group" aria-label="Travel style">${[
    ['thrifty', 'Thrifty'],
    ['comfort', 'Comfortable'],
  ]
    .map(
      ([k, t]) =>
        `<button class="chip ${b.style === k ? 'active' : ''}" data-action="bud-style" data-id="${k}">${t}</button>`,
    )
    .join('')}</div></div></div></section>`;
}
function renderBudget() {
  headerActive('explore');
  if (!B().origin) {
    B().origin = guessOrigin();
    if (B().origin) persist();
  }
  $('#app').innerHTML =
    `<div class="wrap budget-page"><div class="backline"><a href="#/">${icon('left')} Explore</a></div><div class="budget-head"><h1>Where can my budget take me?</h1><p>Tell us roughly what you’d spend and where you’re leaving from. We’ll show the places that fit, flights and hotels included.</p></div>${budgetForm()}<div id="budget-results"></div>${footer()}</div>`;
  renderBudgetResults();
}
function budgetCard(x) {
  const c = x.c,
    est = pick(x.total),
    budget = budgetUSD(),
    st = fitState(est, budget),
    note = !budget
      ? ''
      : st === 'fit'
        ? `${cash(budget - est)} to spare`
        : `${cash(est - budget)} over`;
  const bar = ['travel', 'stay', 'daily', 'car']
    .map((p) => [p, pick(x.parts[p])])
    .filter(([, v]) => v > 0)
    .map(([p, v]) => `<i class="seg-${p}" style="flex:${v.toFixed(0)}"></i>`)
    .join('');
  return `<article class="citycard budgetcard" data-action="city" data-id="${c.id}" tabindex="0" role="link" aria-label="Explore ${esc(c.name)}, about ${cash(est)}"><div class="cityimage">${photoTag(c.id)}${cityAdd(c.id, true)}<span class="city-rankpill budget-pill ${st}">≈ ${cash(est)}</span></div><div class="citybody"><h3>${esc(c.name)}</h3><span class="citycountry">${esc(c.country)}</span><div class="costbar" aria-hidden="true">${bar}</div><ul class="costlist">${costRows(x)}</ul>${note ? `<small class="fitnote ${st}">${note}</small>` : ''}<button class="inline-link mathlink" data-action="bud-math" data-id="${c.id}">See the math</button></div></article>`;
}
// The breakdown under each card, each line colour-matched to its slice of the bar.
function costRows(x) {
  const labels = {
    travel: x.f.ground ? 'Train or bus' : 'Flights',
    stay: 'Hotel',
    daily: 'Food & fun',
    car: 'Rental car',
  };
  return Object.keys(labels)
    .map((p) => [p, pick(x.parts[p])])
    .filter(([, v]) => v > 0)
    .map(([p, v]) => `<li><i class="seg-${p}"></i>${labels[p]}<b>${cash(v)}</b></li>`)
    .join('');
}
function templateTeaser(x) {
  const t = x.t,
    est = pick(x.total);
  return `<article class="tripteaser" data-action="template" data-id="${t.id}" tabindex="0" role="button" aria-label="Plan ${esc(t.title)}, about ${cash(est)}">${starterArt(t)}<div class="teaser-body"><div class="tag">≈ ${cash(est)} · ${x.days} days</div><h3>${t.title}</h3><p>${t.highlights}</p></div></article>`;
}
function budgetCosts() {
  return CITIES.map((c) => cityCost(c)).sort((a, b) => pick(a.total) - pick(b.total));
}
function renderBudgetResults() {
  const el = $('#budget-results');
  if (!el) return;
  const o = budgetOrigin(),
    b = B();
  if (!o) {
    el.innerHTML =
      '<div class="no-results budget-empty">Choose the city you’re leaving from to see where you can go.</div>';
    return;
  }
  const all = budgetCosts(),
    budget = budgetUSD(),
    who = `${b.days} days · ${b.people} traveller${b.people > 1 ? 's' : ''} · ${b.style === 'comfort' ? 'comfortable' : 'thrifty'}`,
    how = `<button class="inline-link" data-action="bud-method">${icon('info')} How we estimate</button>`;
  if (!budget) {
    el.innerHTML = `<p class="muted result-count">From ${esc(o.name)}, cheapest first · ${who} · ${how}</p><div class="citygrid">${all.map(budgetCard).join('')}</div>`;
    return;
  }
  const fits = all.filter((x) => fitState(pick(x.total)) === 'fit'),
    stretch = all.filter((x) => fitState(pick(x.total)) === 'stretch'),
    over = all.filter((x) => fitState(pick(x.total)) === 'over');
  // Within the budget, lead with the most celebrated places rather than the cheapest.
  fits.sort((a, b) => (cityRanking(a.c)?.rank ?? 1e4) - (cityRanking(b.c)?.rank ?? 1e4));
  const trips = TEMPLATES.map((t) => templateCost(t))
    .filter((x) => pick(x.total) <= budget)
    .sort((a, b) => pick(a.total) - pick(b.total));
  el.innerHTML =
    `<p class="muted result-count"><strong>${fits.length ? `${fits.length} of ${all.length} places fit` : 'Nothing fits yet'}</strong> ${cash(budget)} from ${esc(o.name)} · ${who} · ${how}</p>` +
    (fits.length
      ? `<div class="citygrid">${fits.map(budgetCard).join('')}</div>`
      : `<div class="no-results budget-empty"><h3>Nothing fits ${cash(budget)} for ${b.days} days yet.</h3><p>${shorterHint(budget)}</p></div>`) +
    (trips.length
      ? `<div class="rowhead"><h2>Ready-made trips that fit</h2></div><div class="hrow">${trips.map(templateTeaser).join('')}</div>`
      : '') +
    (stretch.length
      ? `<div class="rowhead"><h2>Worth a stretch</h2></div><div class="hrow">${stretch.map(budgetCard).join('')}</div>`
      : '') +
    (over.length
      ? `<details class="budget-over"><summary>${over.length} place${over.length > 1 ? 's are' : ' is'} out of reach for now</summary><ul>${over
          .map((x) => {
            const travel = pick(x.parts.travel);
            return `<li><a href="#/city/${x.c.id}">${esc(x.c.name)}</a><span>${travel > budget ? `flights alone ≈ ${cash(travel)}` : `≈ ${cash(pick(x.total))} in all`}</span></li>`;
          })
          .join('')}</ul></details>`
      : '');
}
// When nothing fits, point at the trip length or style that would make something fit.
function shorterHint(budget) {
  const b = B(),
    count = (days, style) =>
      CITIES.filter((c) => {
        const t = cityCost(c, days).total;
        return (style === 'comfort' ? t[1] : t[0]) <= budget;
      }).length;
  if (b.style === 'comfort' && count(b.days, 'thrifty'))
    return `Switch to thrifty and ${count(b.days, 'thrifty')} places fit. <button class="inline-link" data-action="bud-try" data-style="thrifty">Show me</button>`;
  const d = BUDGET_DAYS.filter((d) => d < b.days)
    .reverse()
    .find((d) => count(d, b.style));
  if (d)
    return `With ${d} days, ${count(d, b.style)} place${count(d, b.style) > 1 ? 's fit' : ' fits'}. <button class="inline-link" data-action="bud-try" data-days="${d}">Show me</button>`;
  return 'Flights take most of this budget from here. The closest options are below.';
}
// The row on the home page once a budget is set.
function budgetHomeRow() {
  if (!budgetReady() || !B().amount) return '';
  const fits = budgetCosts()
    .filter((x) => fitState(pick(x.total)) === 'fit')
    .sort((a, b) => (cityRanking(a.c)?.rank ?? 1e4) - (cityRanking(b.c)?.rank ?? 1e4));
  return `<section class="cityrow"><div class="rowhead"><h2>Fits your ${cash(budgetUSD())} budget</h2><a href="#/budget" class="inline-link">${fits.length ? `See all ${fits.length}` : 'Adjust'} ${icon('arrow')}</a></div>${fits.length ? `<div class="hrow">${fits.slice(0, 10).map(budgetCard).join('')}</div>` : `<p class="muted">Nothing fits yet. <a href="#/budget">Adjust your budget</a>.</p>`}</section>`;
}
// On the city page, once a home city is known: the trip estimate with its parts in plain view.
function budgetPanel(c) {
  if (!B().origin) B().origin = guessOrigin();
  if (!budgetReady())
    return `<section class="citycost" data-id="${c.id}"><button class="inline-link" data-action="bud-edit">${icon('wallet')} What would a trip here cost?</button></section>`;
  const x = cityCost(c),
    b = B(),
    est = pick(x.total),
    budget = budgetUSD(),
    st = fitState(est, budget),
    bar = ['travel', 'stay', 'daily', 'car']
      .map((p) => [p, pick(x.parts[p])])
      .filter(([, v]) => v > 0)
      .map(([p, v]) => `<i class="seg-${p}" style="flex:${v.toFixed(0)}"></i>`)
      .join('');
  return `<section class="citycost" data-id="${c.id}" aria-label="Trip cost estimate"><div class="citycost-head"><div><h3>Trip from ${esc(budgetOrigin().name)}</h3><p>${x.days} days · ${b.people} traveller${b.people > 1 ? 's' : ''} · ${b.style === 'comfort' ? 'comfortable' : 'thrifty'} <button class="inline-link" data-action="bud-edit">Change</button></p></div><div class="citycost-total"><b>≈ ${cash(est)}</b>${budget ? `<small class="fitnote ${st}">${st === 'fit' ? `${cash(budget - est)} to spare` : `${cash(est - budget)} over budget`}</small>` : ''}</div></div><div class="costbar" aria-hidden="true">${bar}</div><ul class="costlist">${costRows(x)}</ul><button class="inline-link mathlink" data-action="bud-math" data-id="${c.id}">See the full math ${icon('arrow')}</button></section>`;
}
function showBudgetMath(id) {
  const x = cityCost(C[id]),
    c = x.c,
    b = B(),
    row = (label, sub, r) =>
      `<tr><th>${label}<small>${sub}</small></th><td>${cash(r[0])}–${cash(r[1])}</td></tr>`;
  const per = `${b.people} traveller${b.people > 1 ? 's' : ''}`;
  showModal(
    `<div class="modalcontent budget-math"><span class="eyebrow">${esc(c.country.toUpperCase())} · FROM ${esc(budgetOrigin().name.toUpperCase())}</span><h2>${esc(c.name)} for ${x.days} days</h2><p class="muted">Thrifty to comfortable, for ${per}. You chose ${b.style === 'comfort' ? 'comfortable, so we use the higher number' : 'thrifty, so we use the lower number'}.</p><table class="mathtable"><tbody>${row(
      x.f.ground ? 'Getting there' : 'Flights',
      x.f.ground
        ? 'Round trip by train or bus'
        : `Round trip, economy · about ${num(niceRound(x.f.km))} km each way${x.k.via ? ' · ' + esc(x.k.via) : ''}`,
      x.parts.travel,
    )}${row('Hotel', `${x.days} nights · ${x.rooms} room${x.rooms > 1 ? 's' : ''} · ${cash(x.k.hotel[0])}–${cash(x.k.hotel[1])} a night`, x.parts.stay)}${row('Food, local transport and sights', `${range(c.dailyBudget, c.currency)} a person a day`, x.parts.daily)}${x.k.car ? row('Rental car', `${cash(COSTS.car[0])}–${cash(COSTS.car[1])} a day with fuel`, x.parts.car) : ''}</tbody><tfoot><tr><th>Estimated total</th><td>${cash(x.total[0])}–${cash(x.total[1])}</td></tr></tfoot></table>${x.k.note ? `<p class="info-note">${esc(x.k.note)}</p>` : ''}<p class="muted small-print">Rough averages, not live prices. Peak season, holidays and last-minute bookings cost more. Shopping, big tours and travel insurance aren’t included.</p><div class="actions"><a class="btn" href="#/city/${c.id}">Explore ${esc(c.name)} ${icon('arrow')}</a>${cityAdd(c.id)}</div></div>`,
    `${c.name} costs`,
  );
}
function showBudgetMethod() {
  showModal(
    `<div class="modalcontent budget-math"><span class="eyebrow">HOW WE ESTIMATE</span><h2>Good enough to dream with.</h2><p>These are rough planning numbers, not prices you can book. They’re here to tell you what’s realistic, like whether flights alone will eat a $1,000 budget.</p><ul class="method-list"><li><strong>Flights</strong> come from the distance between your city and the destination, matched to typical round-trip economy fares. Places with small airports add a connecting flight. Trips under about ${COSTS.groundKm} km assume a train or bus.</li><li><strong>Hotels</strong> are typical nightly prices for a double room, from a good guesthouse (thrifty) to a comfortable mid-range hotel. Two travellers share a room.</li><li><strong>Daily spending</strong> covers food, local transport and ordinary sightseeing, from each city guide.</li><li><strong>National park towns</strong> add a rental car.</li><li><strong>Ready-made trips</strong> fly into the first city and home from it, with a short hop between cities.</li><li><strong>Exchange rates</strong> are fixed approximations, last set ${esc(COSTS.retrieved)}.</li></ul><p class="muted">Rounded editorial estimates informed by typical prices published on these sites. Check live prices before you book.</p><ul class="method-sources">${COSTS.sources.map((s) => `<li>${external(s.url, s.name + ' ↗')}</li>`).join('')}</ul></div>`,
    'How we estimate',
  );
}

function budgetChanged() {
  persist();
  renderBudgetResults();
  const panel = $('.citycost[data-id]');
  if (panel) panel.outerHTML = budgetPanel(C[panel.dataset.id]);
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const a = t.dataset.action;
  if (a === 'bud-math') {
    e.stopPropagation();
    showBudgetMath(t.dataset.id);
  } else if (a === 'bud-method') showBudgetMethod();
  else if (a === 'bud-edit')
    showModal(
      `<div class="modalcontent budget-edit"><h2>Your trip</h2><p class="muted">Change these and the estimate updates. They apply to every city.</p>${budgetForm()}<button class="btn" data-action="close-modal">Done</button></div>`,
      'Your trip',
    );
  else if (a === 'bud-try') {
    if (t.dataset.days) B().days = Number(t.dataset.days);
    if (t.dataset.style) B().style = t.dataset.style;
    persist();
    renderBudget();
  } else if (a === 'bud-days' || a === 'bud-style') {
    if (a === 'bud-days') B().days = Number(t.dataset.id);
    else B().style = t.dataset.id;
    t.parentElement.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x === t));
    budgetChanged();
  } else if (a === 'bud-people') {
    B().people = Math.min(12, Math.max(1, B().people + Number(t.dataset.dir)));
    $('#bud-people').textContent = B().people;
    budgetChanged();
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'bud-amount') {
    B().amount = Math.max(0, Math.round(Number(e.target.value) || 0));
    budgetChanged();
  }
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'bud-cur') {
    B().currency = t.value === budgetOrigin()?.currency ? '' : t.value;
    budgetChanged();
  } else if (t.id === 'bud-origin') {
    B().origin = t.value;
    // The currency follows the home city unless the person picked one themselves.
    const sel = $('#bud-cur');
    if (sel) sel.value = budgetCurrency();
    budgetChanged();
  }
});
