// "Best Mar to May": the first run of best months, or the chosen month when it is one of them.
function bestLabel(c) {
  const m = budgetMonth(),
    b = c.bestMonths;
  if (m) return bestIn(c, m) ? `Best in ${MONTHS[m - 1]}` : '';
  if (!b.length) return '';
  let end = b[0];
  for (const x of b.slice(1)) {
    if (x !== end + 1) break;
    end = x;
  }
  return end === b[0]
    ? `Best in ${MONTHS[b[0] - 1]}`
    : `Best ${MONTHS[b[0] - 1]} to ${MONTHS[end - 1]}`;
}
function cityPrice(c) {
  return budgetOrigin() ? pick(cityCost(c).total) / S.people : null;
}
function cityCard(c) {
  const best = bestLabel(c),
    price = cityPrice(c),
    cmp = compareIds.includes(c.id);
  return `<article class="citycard" data-action="city" data-id="${c.id}" tabindex="0" role="link" aria-label="Explore ${esc(c.name)}"><div class="cityimage">${photoTag(c.id)}${cityAdd(c.id, true)}${best ? `<span class="city-rankpill bestmark">${icon('sun')} ${best}</span>` : ''}</div><div class="citybody"><h3>${esc(c.name)}</h3><span class="citycountry">${esc(c.country)}</span><p>${esc(c.tagline)}</p><div class="cardfoot"><span class="cardprice">${price !== null ? `<b>About ${cash(price)}</b><small>${B().days} days${S.people > 1 ? ', each' : ''}</small>` : `<b>${c.days} days</b><small>to see it well</small>`}</span><button class="cmpbtn ${cmp ? 'on' : ''}" data-action="cmp" data-id="${c.id}" aria-pressed="${cmp}">${icon(cmp ? 'check' : 'plus')} Compare</button></div></div></article>`;
}
function placeCard(p) {
  const d = fromStay(p),
    n = popularityRank(p);
  return `<article class="placecard" data-action="place" data-id="${p.id}" tabindex="0" role="button" aria-label="Details for ${esc(p.name)}"><div class="placeimage">${visualTag(p.id)}${saveButton(p.id)}${visualBadge(p.id)}${photoCount(p.id)}<span class="place-rankpill t-${tier(p).key}">${tier(p).label}</span></div><div class="placebody"><h3>${esc(p.name)}</h3>${p.michelin ? `<div class="michelin-line">${michelinPill(p)}</div>` : ''}<p>${esc(p.summary)}</p>${p.mustOrder?.length ? `<p class="must-order"><strong>Try:</strong> ${esc(p.mustOrder.slice(0, 3).join(' · '))}</p>` : ''}${p.kind === 'eat' ? `<div class="actions dietlabels">${dietaryLabels(p)}</div>` : ''}<div class="placemeta"><span>${esc(p.area)} · ${p.duration} h · ${priceLabel(p)}${d !== null ? ` · <span class="near-label">${distanceText(d)} away</span>` : ''}</span>${rating(p)}</div></div></article>`;
}
function rankingRows(items) {
  return `<div class="ranking-list">${items.map((p) => `<article class="ranking-row"><div class="ranking-number">${popularityRank(p) ? '#' + popularityRank(p) : '—'}</div><button class="ranking-thumb" data-action="place" data-id="${p.id}" aria-label="View ${esc(p.name)}">${visualTag(p.id)}</button><div class="ranking-main"><button class="inline-link" data-action="place" data-id="${p.id}">${esc(p.name)}</button><div class="typechips">${typeChips(p)}</div><small class="rankwhy">${esc(rankReason(p))}</small><small>${esc(rankCategory(p))} · ${esc(p.area)}${fromStay(p) !== null ? ' · ' + distanceText(fromStay(p)) + ' from stay' : ''}</small></div><div class="ranking-stat">${p.signals?.wikipedia?.views > 0 ? `<strong>${compact(p.signals.wikipedia.views)}</strong><small>Wikipedia readers</small>` : rating(p)}</div><button class="btn light small" data-action="place" data-id="${p.id}">Why go? ${icon('arrow')}</button>${saveButton(p.id)}</article>`).join('')}</div>`;
}
function cityResults(c) {
  const places = getCityPlaces(c);
  if (!places.length)
    return '<div class="no-results"><h3>No matches for these filters.</h3><p>Missing dietary evidence means “unverified”, not “no suitable food exists”. Clear a filter, check a venue’s current menu, or search nearby on Google Maps.</p><button class="btn light" data-action="clear-place-filters">Clear filters</button></div>';
  return placeView === 'ranking'
    ? rankingRows(places)
    : `<div class="placegrid">${places.map(placeCard).join('')}</div>`;
}
function refreshCityResults() {
  const c = C[activeCityId];
  if (!c) return;
  const el = $('#city-places');
  if (el) el.innerHTML = cityResults(c);
  const n = $('#place-result-count');
  if (n) n.innerHTML = resultLine(c);
  const f = $('#filter-btn');
  if (f) f.innerHTML = filterButton();
  const d = $('#filter-done');
  if (d) d.textContent = 'Show ' + getCityPlaces(c).length + ' places';
}
function stayPanel(c, compact = false) {
  const s = S.stays[c.id],
    near = s
      ? c.items
          .map((p) => P[p.id])
          .filter((p) => p.kind === 'see' && !p.excursion && p.duration < 6 && hav(c, p) < 40)
          .sort((a, b) => hav(s, a) - hav(s, b))
          .slice(0, 3)
      : [];
  if (!s && compact)
    return `<button class="stay-prompt" data-action="edit-stay" data-id="${c.id}">${icon('pin')}<span><strong>Where are you staying?</strong><small>Add it to see what is close by</small></span>${icon('arrow')}</button>`;
  return `<section class="stay-panel ${compact ? 'compact' : ''}"><div class="stay-heading">${icon('pin')}<div><h3>${s ? 'Start from ' + esc(s.label) : 'Where are you staying?'}</h3><p>${s ? esc(s.address || `${s.lat.toFixed(5)}, ${s.lon.toFixed(5)}`) : 'Add a hotel, address or map pin to find nearby places and begin your local routes there.'}</p></div><button class="btn ${s ? 'light' : 'small'}" data-action="edit-stay" data-id="${c.id}">${s ? 'Change stay' : 'Add your stay'}</button></div>${s && !compact ? `<div class="nearby-preview"><span class="eyebrow">CLOSE TO YOUR DOOR · STRAIGHT-LINE DISTANCE</span><div class="nearby-options">${near.map((p) => `<button data-action="place" data-id="${p.id}"><span>${esc(p.name)}</span><strong>${distanceText(hav(s, p))}</strong></button>`).join('')}</div><button class="inline-link" data-action="nearby-first" data-id="${c.id}">Show nearby places first ${icon('arrow')}</button><span class="muted"> Actual travel time and accessible routes are checked in Maps.</span></div>` : ''}</section>`;
}
const SORT_LABELS = {
  popularity: 'Most popular',
  recommended: 'First-visit picks',
  nearby: 'Closest to my stay',
  cost: 'Lowest cost',
};
function activeFilterCount() {
  return (
    (experienceFilter !== 'all') +
    (foodHalal !== 'all') +
    (foodVeg !== 'all') +
    (placeSort !== 'popularity')
  );
}
function filterButton() {
  const n = activeFilterCount();
  return `<button class="btn ghost filterbtn ${n ? 'on' : ''}" data-action="place-filters" aria-label="Sort and filter${n ? ', ' + n + ' active' : ''}">${icon('sliders')}<span class="lbl"> Filters</span>${n ? `<span class="count">${n}</span>` : ''}</button>`;
}
function resultLine(c) {
  const n = getCityPlaces(c).length;
  return `${n} place${n === 1 ? '' : 's'} · ${SORT_LABELS[placeSort] || 'Most popular'} first <button class="inline-link" data-action="ranking-method">How ranks work</button>`;
}
function openFilters() {
  const c = C[activeCityId];
  if (!c) return;
  const food = FOOD_FILTERS.includes(cityFilter);
  showModal(
    `<div class="modalcontent filtersheet"><h2 id="modal-heading">Sort & filter</h2><div class="field"><label for="place-sort">Sort by</label><select id="place-sort">${Object.entries(
      SORT_LABELS,
    )
      .map(
        ([k, t]) =>
          `<option value="${k}" ${placeSort === k ? 'selected' : ''} ${k === 'nearby' && !S.stays[c.id] ? 'disabled' : ''}>${t}${k === 'nearby' && !S.stays[c.id] ? ' (add your stay first)' : ''}</option>`,
      )
      .join(
        '',
      )}</select></div><div class="field"><label for="experience-filter">Kind of experience</label><select id="experience-filter"><option value="all">Every type</option>${TYPES.map((t) => `<option ${experienceFilter === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>${food ? `<div class="field"><label for="food-halal">Halal</label><select id="food-halal"><option value="all">Any</option><option value="stated" ${foodHalal === 'stated' ? 'selected' : ''}>Sourced halal choices</option><option value="certified" ${foodHalal === 'certified' ? 'selected' : ''}>Certification evidence only</option></select></div><div class="field"><label for="food-veg">Vegetarian</label><select id="food-veg"><option value="all">Any</option><option value="options" ${foodVeg === 'options' ? 'selected' : ''}>Vegetarian options</option><option value="fully" ${foodVeg === 'fully' ? 'selected' : ''}>Fully vegetarian / plant-based</option><option value="vegan" ${foodVeg === 'vegan' ? 'selected' : ''}>Plant-based menu</option></select></div><p class="filter-note">Halal certification, operator claims and particular halal dishes are labelled separately. Vegetarian does not automatically mean halal.</p>` : ''}<div class="field"><label>Show as</label><div class="view-switch"><button class="${placeView === 'cards' ? 'active' : ''}" data-action="place-view" data-id="cards">Cards</button><button class="${placeView === 'ranking' ? 'active' : ''}" data-action="place-view" data-id="ranking">Ranked list</button></div></div><div class="filter-actions"><button class="btn ghost" data-action="clear-place-filters">Clear all</button><button class="btn" data-action="close-modal" id="filter-done">Show ${getCityPlaces(c).length} places</button></div></div>`,
    'Sort & filter',
  );
}
function cityTabHtml(c, tab) {
  if (tab === 'arrival' || tab === 'sources') return cityTabLegacy(c, tab);
  if (tab === 'shop')
    return `${shoppingGuide(c)}${getCityPlaces(c).length ? `<h3 class="shopstops-h">Shopping stops with full details</h3><p class="muted result-count" id="place-result-count">${resultLine(c)}</p><div id="city-places">${cityResults(c)}</div>` : ''}`;
  if (tab === 'food' && !FOOD_FILTERS.includes(cityFilter)) cityFilter = 'restaurants';
  const food = tab === 'food' || FOOD_FILTERS.includes(cityFilter);
  const chips = food
    ? [
        ['restaurants', 'Restaurants'],
        ...(c.items.some((x) => x.michelin) ? [['michelin', 'MICHELIN Guide']] : []),
        ['eat', 'All food stops'],
        ['saved', 'Saved'],
      ]
    : [
        ['see', 'Sights'],
        ['all', 'Everything'],
        ['saved', 'Saved'],
      ];
  return `<div class="placetools"><div class="searchrow"><div class="searchbox">${icon('search')}<input id="place-search" type="search" placeholder="Search ${esc(c.name)}" aria-label="Search places in this city" value="${esc(placeQuery)}"></div><span id="filter-btn">${filterButton()}</span></div><div class="chips">${chips
    .map(
      ([k, t]) =>
        `<button class="chip ${cityFilter === k ? 'active' : ''}" data-action="city-filter" data-id="${k}">${t}</button>`,
    )
    .join(
      '',
    )}</div></div><p class="muted result-count" id="place-result-count">${resultLine(c)}</p><div id="city-places">${cityResults(c)}</div>`;
}
const SHOP_TIERS = {
  budget: ['$', 'Budget'],
  mid: ['$$', 'Mid-range'],
  high: ['$$$', 'High-end'],
};
const SHOP_STYLES = {
  streetwear: 'Streetwear',
  vintage: 'Vintage & thrift',
  designer: 'Designer',
  luxury: 'Luxury',
  'local-design': 'Local design',
  crafts: 'Crafts',
  markets: 'Markets',
  souvenirs: 'Souvenirs',
  food: 'Food to take home',
  malls: 'Malls',
  'department-store': 'Department stores',
  textiles: 'Textiles & tailoring',
  jewelry: 'Jewellery',
  homeware: 'Homeware',
  antiques: 'Antiques',
  books: 'Books',
  outdoor: 'Outdoor gear',
  anime: 'Anime & games',
  electronics: 'Electronics',
  outlets: 'Outlets',
};
function shopMapsUrl(c, s) {
  return (
    'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent(`${s.name}, ${c.name}, ${c.country}`)
  );
}
function shoppingGuide(c) {
  const g = c.shopping;
  if (!g?.spots?.length) return '';
  const count = {};
  g.spots.forEach((s) => s.styles.forEach((t) => (count[t] = (count[t] || 0) + 1)));
  // Streetwear leads when a city has it; otherwise the most common styles come first.
  const styles = Object.keys(count).sort(
    (a, b) => (b === 'streetwear') - (a === 'streetwear') || count[b] - count[a],
  );
  const chip = (action, k, label, on) =>
    `<button class="chip ${on ? 'active' : ''}" data-action="${action}" data-id="${k}" aria-pressed="${on}">${label}</button>`;
  return `<section class="shopguide" aria-labelledby="shopguide-h"><div class="shopguide-head"><span class="eyebrow">WHERE TO SHOP</span><h3 id="shopguide-h">${icon('bag')} Shopping in ${esc(c.name)}</h3><p>${esc(g.note)}</p></div><div class="shopfilters"><div class="chips" role="group" aria-label="Price level">${chip('shop-tier', 'all', 'Every budget', shopTier === 'all')}${Object.entries(
    SHOP_TIERS,
  )
    .map(([k, [sym, t]]) => chip('shop-tier', k, `${sym} ${t}`, shopTier === k))
    .join(
      '',
    )}</div><div class="chips shopstyles" role="group" aria-label="Style">${chip('shop-style', 'all', 'Any style', shopStyle === 'all')}${styles.map((k) => chip('shop-style', k, esc(SHOP_STYLES[k] || k), shopStyle === k)).join('')}</div></div><div id="shop-spots">${shopSpots(c)}</div><small class="muted shopguide-note">Editorial picks, checked ${esc(g.checked || DATA.retrieved)}. Opening days and prices change, so confirm before you go. Tap a stop below for photos, rankings and visit details.</small></section>`;
}
function shopSpots(c) {
  const list = (c.shopping?.spots || []).filter(
    (s) =>
      (shopTier === 'all' || s.tier === shopTier) &&
      (shopStyle === 'all' || s.styles.includes(shopStyle)),
  );
  if (!list.length)
    return '<p class="muted shop-empty">No picks match both filters here. Try another price level or style.</p>';
  return `<div class="shopgrid">${list
    .map((s) => {
      const [sym, t] = SHOP_TIERS[s.tier] || ['', s.tier];
      return `<article class="shopcard">${shopSave(s.id)}<div class="shopcard-top"><span class="pill ${s.tier === 'mid' ? 'warm' : ''} shoptier tier-${s.tier}" title="${t}">${sym} ${t}</span><small>${esc(s.area)}</small></div><h4>${esc(s.name)}</h4><p>${esc(s.summary)}</p><div class="shoptags">${s.styles.map((k) => `<span class="pill ${k === 'streetwear' ? 'warm' : 'gray'}">${esc(SHOP_STYLES[k] || k)}</span>`).join('')}</div><p class="shoptip"><strong>Tip:</strong> ${esc(s.tip)}</p>${external(shopMapsUrl(c, s), icon('pin') + ' Find on Google Maps', 'inline-link shopmap')}</article>`;
    })
    .join('')}</div>`;
}
function setShopFilter(kind, id) {
  if (kind === 'tier') shopTier = id;
  else shopStyle = id;
  const c = C[activeCityId];
  const el = $('.shopguide');
  if (!c || !el) return;
  el.outerHTML = shoppingGuide(c);
}
function renderCity(id, tab = 'places') {
  if (!validCity(id)) {
    location.hash = '#/';
    return;
  }
  if (
    !withCities(
      [id],
      () => renderCity(id, tab),
      // The name, summary and cover photo ship with the app, so the real header shows at once.
      () =>
        ($('#app').innerHTML = loadingPage(
          `<section class="cityhero">${photoTag(id, '', false)}<div class="cityherotext"><div class="eyebrow">${esc(C[id].country)} · ${esc(C[id].region)}</div><h1>${esc(C[id].name)}</h1><p>${esc(C[id].summary)}</p></div></section>`,
        )),
    )
  )
    return;
  const c = C[id];
  if (placeSort === 'nearby' && !S.stays[id]) placeSort = 'popularity';
  if (activeCityId !== id) {
    activeCityId = id;
    cityFilter = tab === 'food' ? 'restaurants' : tab === 'shop' ? 'shop' : 'see';
    experienceFilter = 'all';
    placeQuery = '';
    shopTier = 'all';
    shopStyle = 'all';
    foodHalal = 'all';
    foodVeg = 'all';
    placeSort = 'popularity';
  }
  if (tab === 'food' && !FOOD_FILTERS.includes(cityFilter)) cityFilter = 'restaurants';
  if (tab === 'shop') {
    cityFilter = 'shop';
    placeQuery = '';
    experienceFilter = 'all';
  } else if (cityFilter === 'shop') cityFilter = 'see';
  headerActive('explore');
  const r = cityRanking(c, 'tourism'),
    a = cityRanking(c, 'arrivals');
  $('#app').innerHTML =
    `<div class="wrap"><div class="backline"><a href="#/" aria-label="Compare destinations">${icon('left')}<span class="lbl-long"> Compare destinations</span><span class="lbl-short">Cities</span></a><div class="actions">${cityAdd(id)}<a class="btn ghost small" href="#/map/${id}">${icon('map')} City map</a></div></div><section class="cityhero">${photoTag(c.id, '', false)}<span class="hero-credit">${photoCredit(c.id)}</span><div class="cityherotext"><div class="eyebrow">${esc(c.country)} · ${esc(c.region)}</div><h1>${esc(c.name)}</h1><p>${esc(c.summary)}</p></div></section>${cityPhotos(c)}${cityTopFive(c)}${cityGlance(c)}${budgetPanel(c)}${stayPanel(c, !S.stays[id])}<div class="citytabs">${[
      ['places', 'Sights'],
      ['food', 'Food'],
      ['shop', 'Shopping'],
      ['arrival', 'Practical'],
      ['sources', 'Sources'],
    ]
      .map(
        ([k, t]) =>
          `<button class="${tab === k ? 'active' : ''}" data-action="city-tab" data-id="${id}" data-tab="${k}">${t}</button>`,
      )
      .join(
        '',
      )}</div>${parkNotice(c)}${cityTabHtml(c, tab)}${alsoFromHere(c)}<div class="resourcebox"><h3>${icon('book')}Your notes for ${esc(c.name)}</h3><div class="field"><textarea data-note="${id}" placeholder="Reservation times, a local tip, reminders…" aria-label="Notes for ${esc(c.name)}">${esc(S.notes[id] || '')}</textarea></div><small class="muted">Your stay and notes are saved in this browser and included in trip backups.</small></div>${footer()}</div>`;
}
