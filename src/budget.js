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
  return { amount: 0, currency: '', origin: '', days: 7, people: 1, style: 'thrifty', month: 0 };
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
  const m = Math.round(Number(b.month));
  d.month = m >= 1 && m <= 12 ? m : 0;
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

// ---------- Seasons ----------
// Month 1-12, or 0 for "any time" (the year-round average). Hotels swing with each city's own
// season; fares swing with the traveller's home hemisphere and, a little, the destination's.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  MONTHS_LONG = [
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
const budgetMonth = () => B().month || 0;
function seasonOf(c, m) {
  return m ? COSTS.seasons?.[c.id]?.[m - 1] || 'S' : '';
}
const SEASON_LABEL = { L: 'Low season', S: 'Shoulder season', H: 'High season', P: 'Peak season' };
function hotelFactor(c, m) {
  const code = COSTS.seasons?.[c.id];
  if (!m || !code) return 1;
  const f = (k) => COSTS.seasonHotel[k] ?? 1,
    mean = [...code].reduce((t, k) => t + f(k), 0) / 12;
  return f(code[m - 1]) / mean;
}
function fareFactor(o, c, m) {
  if (!m || !o) return 1;
  const curve = COSTS.fareMonths?.[o.lat < 0 ? 'south' : 'north'];
  return (curve?.[m - 1] ?? 1) * (COSTS.seasonFare?.[seasonOf(c, m)] ?? 1);
}
// The month a trip starting on this date is mostly in.
function monthOfDate(d) {
  return d ? d.getMonth() + 1 : 0;
}

// Typical round-trip economy fare per person, from a distance curve. Very short hops are
// treated as a train or bus; smaller airports add a connecting leg.
function fareUSD(o, c, m = budgetMonth()) {
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
  lo *= (k.fare || 1) * fareFactor(o, c, m);
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
function cityCost(c, days = B().days, people = S.people, o = budgetOrigin(), m = budgetMonth()) {
  const base = COSTS.cities[c.id] || { hotel: [80, 160] },
    hf = hotelFactor(c, m),
    k = { ...base, hotel: base.hotel.map((n) => n * hf) },
    f = fareUSD(o, c, m),
    rooms = Math.ceil(people / 2),
    cars = Math.ceil(people / 5),
    d = dailyUSD(c);
  const parts = {
    travel: [f.lo * people, f.hi * people],
    stay: [k.hotel[0] * rooms * days, k.hotel[1] * rooms * days],
    daily: [d[0] * people * days, d[1] * people * days],
    car: k.car ? [COSTS.car[0] * cars * days, COSTS.car[1] * cars * days] : [0, 0],
  };
  return { c, f, k, m, season: seasonOf(c, m), days, people, rooms, parts, total: sumParts(parts) };
}
function sumParts(parts) {
  return Object.values(parts).reduce((t, [a, b]) => [t[0] + a, t[1] + b], [0, 0]);
}
const pick = (r) => (B().style === 'comfort' ? r[1] : r[0]);
// The whole year for one city, so people can see when their money goes furthest.
function cityYear(c, days = S.days[c.id] || c.days) {
  return MONTHS.map((_, i) => ({
    m: i + 1,
    est: pick(cityCost(c, days, S.people, budgetOrigin(), i + 1).total),
  }));
}
// A ready-made trip: fly into the first city and home from it, with a hop between cities.
function templateCost(t, people = S.people, o = budgetOrigin()) {
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
    )}</select></div><div class="field"><label for="bud-month">When</label><select id="bud-month"><option value="0">Any time (yearly average)</option>${MONTHS_LONG.map((m, i) => `<option value="${i + 1}" ${b.month === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select></div><div class="budget-line"><div class="budget-group days-group"><span class="budget-label">Trip length</span><div class="chips" role="group" aria-label="Trip length">${BUDGET_DAYS.map((d) => `<button class="chip ${b.days === d ? 'active' : ''}" data-action="bud-days" data-id="${d}">${d} days</button>`).join('')}</div></div><div class="budget-group"><span class="budget-label">Travellers</span><div class="stepper"><button data-action="bud-people" data-dir="-1" aria-label="Fewer travellers">−</button><strong id="bud-people">${S.people}</strong><button data-action="bud-people" data-dir="1" aria-label="More travellers">+</button></div></div><div class="budget-group"><span class="budget-label">Style</span><div class="chips" role="group" aria-label="Travel style">${[
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
    who = `${b.days} days · ${S.people} traveller${S.people > 1 ? 's' : ''} · ${b.style === 'comfort' ? 'comfortable' : 'thrifty'} · ${b.month ? 'in ' + MONTHS_LONG[b.month - 1] : 'any time'}`,
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
  const x = cityCost(c, S.days[c.id] || c.days),
    b = B(),
    est = pick(x.total),
    budget = budgetUSD(),
    st = fitState(est, budget),
    bar = ['travel', 'stay', 'daily', 'car']
      .map((p) => [p, pick(x.parts[p])])
      .filter(([, v]) => v > 0)
      .map(([p, v]) => `<i class="seg-${p}" style="flex:${v.toFixed(0)}"></i>`)
      .join('');
  return `<section class="citycost" data-id="${c.id}" aria-label="Trip cost estimate"><div class="citycost-head"><div><h3>Trip from ${esc(budgetOrigin().name)}</h3><p><span class="stepper mini"><button data-action="bud-citydays" data-id="${c.id}" data-dir="-1" aria-label="Fewer days">−</button><strong>${x.days} days</strong><button data-action="bud-citydays" data-id="${c.id}" data-dir="1" aria-label="More days">+</button></span> · ${S.people} traveller${S.people > 1 ? 's' : ''} · ${b.style === 'comfort' ? 'comfortable' : 'thrifty'} <button class="inline-link" data-action="bud-edit">Change</button></p></div><div class="citycost-total"><b>≈ ${cash(est)}</b>${budget ? `<small class="fitnote ${st}">${st === 'fit' ? `${cash(budget - est)} to spare` : `${cash(est - budget)} over budget`}</small>` : ''}</div></div><div class="costbar" aria-hidden="true">${bar}</div><ul class="costlist">${costRows(x)}</ul><button class="inline-link mathlink" data-action="bud-math" data-id="${c.id}">See the full math ${icon('arrow')}</button>${cityPriceLinks(c, x.days)}</section>`;
}
// Twelve bars, one per month: what this trip would cost if you left then. Tap one to price it.
// Twelve months at a glance: bar height is the price (once a home city is known), colour is
// how busy the season is, and a sun marks the best months to visit.
function yearStrip(c, days = S.days[c.id] || c.days) {
  const o = budgetOrigin(),
    year = o ? cityYear(c, days) : MONTHS.map((_, i) => ({ m: i + 1, est: 0 })),
    lo = Math.min(...year.map((y) => y.est)),
    hi = Math.max(...year.map((y) => y.est)),
    cheap = year.find((y) => y.est === lo),
    m = budgetMonth(),
    busy = { L: 'Quiet', S: 'Moderate', H: 'Busy', P: 'Very busy' };
  const bars = year
    .map((y) => {
      const h = o && hi > lo ? 28 + ((y.est - lo) / (hi - lo)) * 72 : 55,
        best = c.bestMonths.includes(y.m),
        sn = seasonOf(c, y.m) || 'S';
      return `<button class="ybar s-${sn} ${y.m === m ? 'active' : ''} ${best ? 'best' : ''}" data-action="bud-month-pick" data-id="${y.m === m ? 0 : y.m}" aria-pressed="${y.m === m}" aria-label="${MONTHS_LONG[y.m - 1]}: ${busy[sn].toLowerCase()}${o ? `, about ${cash(y.est)}` : ''}${best ? ', one of the best months to visit' : ''}"><em>${best ? icon('sun') : ''}</em><i style="height:${h.toFixed(0)}%"></i><span>${MONTHS[y.m - 1][0]}</span></button>`;
    })
    .join('');
  return `<div class="yearstrip"><div class="yearstrip-head"><strong>When to go</strong><small>${o ? `Cheapest in ${MONTHS_LONG[cheap.m - 1]}, about ${cash(cheap.est)}` : 'Tap a month to plan around it'}</small></div><div class="ybars" role="group" aria-label="The year by month">${bars}</div><div class="yearstrip-key"><span>${icon('sun')} best months</span><span><i class="s-L"></i> quiet</span><span><i class="s-S"></i> moderate</span><span><i class="s-H"></i> busy</span><span><i class="s-P"></i> very busy</span>${o ? '<span>taller = pricier</span>' : ''}${m ? `<button class="inline-link" data-action="bud-month-pick" data-id="0">Any time</button>` : ''}</div></div>`;
}
// Rough door-to-door flying time from the home city, from the distance.
function flightHours(c, o = budgetOrigin()) {
  if (!o) return null;
  const f = fareUSD(o, c);
  if (f.ground) return { ground: true, label: 'Train or bus' };
  const h = Math.round(f.km / 850 + 0.75 + (f.hop ? 3 : 0));
  return { h, label: `About ${h} h`, hop: f.hop };
}

// ---------- Real prices ----------
// Our numbers are estimates, so every estimate offers a one-tap hand-off to live search with the
// cities, dates and travellers already filled in. No API, just prefilled search links.
const isoDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
// A start date for a price search: the trip's own date, else the 10th of the next picked month.
function searchStart(id) {
  if (S.startDate && S.trip.includes(id)) return cityArrivalDate(id);
  const m = budgetMonth();
  if (!m) return null;
  const now = new Date(),
    d = new Date(now.getFullYear(), m - 1, 10);
  if (d < addDays(now, 14)) d.setFullYear(d.getFullYear() + 1);
  return d;
}
function flightsUrl(from, to, out, back) {
  const q = `Flights from ${from} to ${to}${out ? ` on ${isoDate(out)}` : ''}${back ? ` through ${isoDate(back)}` : out ? ' one way' : ''}`;
  return 'https://www.google.com/travel/flights?q=' + encodeURIComponent(q);
}
function hotelsUrl(c, inD, outD, people = S.people) {
  const u = new URL('https://www.booking.com/searchresults.html');
  u.searchParams.set('ss', `${c.name}, ${c.country}`);
  if (inD) {
    u.searchParams.set('checkin', isoDate(inD));
    u.searchParams.set('checkout', isoDate(outD));
  }
  u.searchParams.set('group_adults', people);
  u.searchParams.set('no_rooms', Math.ceil(people / 2));
  return u.href;
}
function homesUrl(c, inD, outD, people = S.people) {
  const u = new URL(
    `https://www.airbnb.com/s/${encodeURIComponent(`${c.name}, ${c.country}`.replaceAll(', ', '--').replaceAll(' ', '-'))}/homes`,
  );
  if (inD) {
    u.searchParams.set('checkin', isoDate(inD));
    u.searchParams.set('checkout', isoDate(outD));
  }
  u.searchParams.set('adults', people);
  return u.href;
}
const priceBtn = (url, label) =>
  `<a class="pricebtn" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label} ${icon('external')}</a>`;
function cityPriceLinks(c, days) {
  const o = budgetOrigin(),
    d = searchStart(c.id),
    back = d && addDays(d, days);
  return `<div class="pricelinks"><span>Check real prices${d ? ` for ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}–${back.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</span><div>${o && hav(o, c) >= COSTS.groundKm ? priceBtn(flightsUrl(o.name, c.name, d, back), 'Flights') : ''}${priceBtn(hotelsUrl(c, d, back), 'Hotels')}${priceBtn(homesUrl(c, d, back), 'Homes')}</div></div>`;
}
function tripPriceLinks() {
  const o = budgetOrigin(),
    ids = S.trip;
  if (!ids.length) return '';
  const first = C[ids[0]],
    last = C[ids.at(-1)],
    start = searchStart(ids[0]),
    end = start && addDays(start, totalDays() + transferDays()),
    flights = !o
      ? ''
      : first.id === last.id
        ? priceBtn(flightsUrl(o.name, first.name, start, end), 'Flights')
        : priceBtn(flightsUrl(o.name, first.name, start), `Flight to ${esc(first.name)}`) +
          priceBtn(flightsUrl(last.name, o.name, end), 'Flight home');
  const stays = ids
    .map((id, i) => {
      const c = C[id],
        nights = (S.days[id] || c.days) + (i ? 1 : 0),
        inD =
          start &&
          (S.startDate
            ? cityArrivalDate(id)
            : addDays(
                start,
                ids.slice(0, i).reduce((t, x) => t + (S.days[x] || C[x].days) + 1, 0),
              )),
        outD = inD && addDays(inD, nights);
      return priceBtn(hotelsUrl(c, inD, outD), `Hotels in ${esc(c.name)}`);
    })
    .join('');
  return `<div class="pricelinks trip"><span>Check real prices${start ? '' : '<small>Set a start date to fill in your dates</small>'}</span><div>${flights}${stays}</div></div>`;
}
// The Trip page as a checkout: every cost of the planned trip in one currency, with one total.
// Flights go out to the first city and home from the last; transfer days sleep in the next city.
function tripCost() {
  const o = budgetOrigin(),
    n = S.people,
    style = B().style,
    ids = S.trip,
    lines = [],
    add = (label, sub, r, cls = '') => {
      lines.push({ label, sub, r, cls });
      return r;
    };
  let total = [0, 0];
  const plus = (r) => (total = [total[0] + r[0], total[1] + r[1]]);
  if (o) {
    const a = fareUSD(o, C[ids[0]], tripMonth(ids[0])),
      z = fareUSD(o, C[ids.at(-1)], tripMonth(ids[0])),
      r = [((a.lo + z.lo) / 2) * n, ((a.hi + z.hi) / 2) * n];
    plus(
      add(
        a.ground && z.ground ? 'Getting there' : 'Flights',
        ids.length > 1 && ids[0] !== ids.at(-1)
          ? `${esc(o.name)} → ${esc(C[ids[0]].name)}, home from ${esc(C[ids.at(-1)].name)}`
          : `${esc(o.name)} ⇄ ${esc(C[ids[0]].name)}, round trip`,
        r,
        'big',
      ),
    );
  }
  if (ids.length > 1) {
    const hops = ids
      .slice(1)
      .map((id, i) => (hav(C[ids[i]], C[id]) < COSTS.groundKm ? COSTS.ground : COSTS.leg));
    plus(
      add(
        'Between cities',
        `${hops.length} hop${hops.length > 1 ? 's' : ''} by train, bus or short flight`,
        hops.reduce((t, h) => [t[0] + h[0] * n, t[1] + h[1] * n], [0, 0]),
        'big',
      ),
    );
  }
  ids.forEach((id, i) => {
    const c = C[id],
      nights = (S.days[id] || c.days) + (i ? 1 : 0),
      x = cityCost(c, nights, n, o || c, tripMonth(id)),
      own = Number(S.lodging[id]) || 0,
      extra = Number(S.extra[id]) || 0;
    lines.push({
      head: `${esc(c.name)} · ${nights} night${nights > 1 ? 's' : ''}${x.m ? ` · ${MONTHS[x.m - 1]}, ${SEASON_LABEL[x.season].toLowerCase()}` : ''}`,
    });
    const stay = own ? Array(2).fill(toUSD(own, c.currency) * n * nights) : x.parts.stay;
    plus(
      add(
        'Hotel',
        own
          ? 'your own hotel amount'
          : `${x.rooms} room${x.rooms > 1 ? 's' : ''} · ${cash(x.k.hotel[0])}–${cash(x.k.hotel[1])} a night`,
        stay,
      ),
    );
    plus(
      add(
        'Food, local transport & sights',
        `${range(c.dailyBudget, c.currency)} a person a day`,
        x.parts.daily,
      ),
    );
    if (x.k.car) plus(add('Rental car', 'with fuel', x.parts.car));
    if (extra)
      plus(
        add(
          'Your extras',
          'tours and other allowances you added',
          Array(2).fill(toUSD(extra, c.currency) * n),
        ),
      );
  });
  const est = style === 'comfort' ? total[1] : total[0],
    budget = budgetUSD();
  return { o, n, style, lines, total, est, budget, st: fitState(est, budget) };
}
// The whole trip as one bar against the budget; the receipt sits beneath it.
function tripCostBar() {
  const { est, budget, st, n } = tripCost();
  if (!budget)
    return `<div class="tripcost nobudget"><div class="tcb-top"><span>Estimated total</span><b>≈ ${cash(est)}</b></div><p>${n > 1 ? `About ${cash(est / n)} a person. ` : ''}Set a budget to see how this trip fits.</p><button class="btn light small" data-action="bud-edit">Set a budget</button></div>`;
  const max = Math.max(est, budget) * 1.08,
    w = Math.round((est / max) * 100),
    mark = Math.round((budget / max) * 100);
  return `<div class="tripcost ${st}"><div class="tcb-top"><span>Estimated total</span><b>≈ ${cash(est)}</b></div><div class="tcb-track" role="img" aria-label="Estimated ${cash(est)} against a budget of ${cash(budget)}"><i style="width:${w}%"></i><em style="left:${mark}%"></em></div><div class="tcb-legend"><span class="fitnote ${st}">${st === 'fit' ? `${cash(budget - est)} under budget` : `${cash(est - budget)} over budget`}</span><span>Budget ${cash(budget)} <button class="inline-link" data-action="bud-edit">Change</button></span></div></div>`;
}
function tripReceipt() {
  const { o, n, style, lines, total, est, budget, st } = tripCost();
  const row = (l) =>
    l.head
      ? `<div class="rc-city">${l.head}</div>`
      : `<div class="rc-line ${l.cls}"><span>${l.label}<small>${l.sub}</small></span><b>${cash(style === 'comfort' ? l.r[1] : l.r[0])}</b></div>`;
  return `<div class="sidepanel receipt"><div class="rc-top"><h3>Trip cost</h3><button class="inline-link" data-action="bud-edit">Change</button></div><p class="rc-who">${o ? `From ${esc(o.name)} · ` : ''}${n} traveller${n > 1 ? 's' : ''} · ${style === 'comfort' ? 'comfortable' : 'thrifty'} · ${S.startDate ? 'priced for your dates' : budgetMonth() ? `priced for ${MONTHS_LONG[budgetMonth() - 1]}` : 'year-round average'}</p>${o ? '' : `<button class="btn light small" data-action="bud-edit">Add where you’re leaving from</button>`}${lines.map(row).join('')}<div class="rc-total"><span>Estimated total</span><b>≈ ${cash(est)}</b></div><p class="rc-sub">${n > 1 ? `About ${cash(est / n)} a person · ` : ''}range ${cash(total[0])}–${cash(total[1])}</p>${budget ? `<p class="rc-fit fitnote ${st}">${st === 'fit' ? `${cash(budget - est)} under your ${cash(budget)} budget` : `${cash(est - budget)} over your ${cash(budget)} budget`}</p>` : ''}<p class="rc-note">Rough averages, not live prices. Not included: shopping, big tours, park fees, insurance. <button class="inline-link" data-action="bud-method">How we estimate</button></p>${tripPriceLinks()}</div>`;
}
// Which month a city in the planned trip is priced for: its arrival month once the trip has a
// start date, otherwise the month picked in the budget settings (or the yearly average).
function tripMonth(id) {
  return S.startDate ? monthOfDate(cityArrivalDate(id)) : budgetMonth();
}
function showBudgetMath(id) {
  const x = cityCost(C[id]),
    c = x.c,
    b = B(),
    row = (label, sub, r) =>
      `<tr><th>${label}<small>${sub}</small></th><td>${cash(r[0])}–${cash(r[1])}</td></tr>`;
  const per = `${S.people} traveller${S.people > 1 ? 's' : ''}`;
  showModal(
    `<div class="modalcontent budget-math"><span class="eyebrow">${esc(c.country.toUpperCase())} · FROM ${esc(budgetOrigin().name.toUpperCase())}</span><h2>${esc(c.name)} for ${x.days} days</h2><p class="muted">${x.m ? `Priced for ${MONTHS_LONG[x.m - 1]}, ${SEASON_LABEL[x.season].toLowerCase()} in ${esc(c.name)}. ` : 'Year-round average. '}Thrifty to comfortable, for ${per}. You chose ${b.style === 'comfort' ? 'comfortable, so we use the higher number' : 'thrifty, so we use the lower number'}.</p><table class="mathtable"><tbody>${row(
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
    `<div class="modalcontent budget-math"><span class="eyebrow">HOW WE ESTIMATE</span><h2>Good enough to dream with.</h2><p>These are rough planning numbers, not prices you can book. They’re here to tell you what’s realistic, like whether flights alone will eat a $1,000 budget.</p><ul class="method-list"><li><strong>Flights</strong> come from the distance between your city and the destination, matched to typical round-trip economy fares. Places with small airports add a connecting flight. Trips under about ${COSTS.groundKm} km assume a train or bus.</li><li><strong>Hotels</strong> are typical nightly prices for a double room, from a good guesthouse (thrifty) to a comfortable mid-range hotel. Two travellers share a room.</li><li><strong>Daily spending</strong> covers food, local transport and ordinary sightseeing, from each city guide.</li><li><strong>National park towns</strong> add a rental car.</li><li><strong>Ready-made trips</strong> fly into the first city and home from it, with a short hop between cities.</li><li><strong>Seasons</strong> change the price when you pick a month or set trip dates. Each city has its own calendar of low, shoulder, high and peak months, from tourism-board calendars, school holidays and festivals. Hotels in peak season cost about ${Math.round((COSTS.seasonHotel.P / COSTS.seasonHotel.L - 1) * 100)}% more than in low season. Fares follow the summer and December holidays where you live. With no month picked, you see the year-round average.</li><li><strong>Exchange rates</strong> are fixed approximations, last set ${esc(COSTS.retrieved)}.</li></ul><p class="muted">Rounded editorial estimates informed by typical prices published on these sites. Check live prices before you book.</p><ul class="method-sources">${COSTS.sources.map((s) => `<li>${external(s.url, s.name + ' ↗')}</li>`).join('')}</ul></div>`,
    'How we estimate',
  );
}

// One "when" for the whole app: the Explore month picker, budget settings and every estimate.
function setMonth(m) {
  B().month = m >= 1 && m <= 12 ? m : 0;
  budgetChanged();
  if (!location.hash.startsWith('#/budget') && typeof renderBrowse === 'function') renderBrowse();
  if (typeof syncMonthChips === 'function') syncMonthChips();
}
function budgetChanged() {
  persist();
  renderBudgetResults();
  if (location.hash.startsWith('#/trip')) renderTrip();
  else if (location.hash.startsWith('#/t/') && sharedTrip && $('.shared-page aside'))
    $('.shared-page aside').innerHTML = sharedCost(sharedTrip);
  const panel = $('.citycost[data-id]');
  if (panel) panel.outerHTML = budgetPanel(C[panel.dataset.id]);
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const a = t.dataset.action;
  if (a === 'bud-month-pick') {
    e.stopPropagation();
    setMonth(Number(t.dataset.id));
  } else if (a === 'bud-math') {
    e.stopPropagation();
    showBudgetMath(t.dataset.id);
  } else if (a === 'bud-method') showBudgetMethod();
  else if (a === 'bud-citydays') {
    const id = t.dataset.id;
    S.days[id] = Math.max(1, Math.min(21, (S.days[id] || C[id].days) + Number(t.dataset.dir)));
    budgetChanged();
  } else if (a === 'trip-toggle' && t.closest('.budgetcard') && !inTrip(t.dataset.id))
    // Adding from a budget card keeps the trip length the estimate was shown for.
    S.days[t.dataset.id] = B().days;
  else if (a === 'bud-edit')
    showModal(
      `<div class="modalcontent budget-edit ${location.hash.startsWith('#/budget') ? '' : 'no-days'}"><h2>Your trip</h2><p class="muted">Change these and the estimate updates. They apply to every city.</p>${budgetForm()}<button class="btn" data-action="close-modal">Done</button></div>`,
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
    S.people = Math.min(20, Math.max(1, S.people + Number(t.dataset.dir)));
    $('#bud-people').textContent = S.people;
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
  } else if (t.id === 'bud-month') {
    setMonth(Number(t.value));
  } else if (t.id === 'bud-origin') {
    B().origin = t.value;
    // The currency follows the home city unless the person picked one themselves.
    const sel = $('#bud-cur');
    if (sel) sel.value = budgetCurrency();
    budgetChanged();
  }
});
