const TEMPLATES = [
  {
    id: 'japan',
    title: 'The Japan first-timer',
    tag: '12 city days + 2 transfer days · rail',
    cities: ['tokyo', 'kyoto', 'osaka'],
    days: [5, 4, 3],
    note: 'Tokyo → Kyoto → Osaka. Consider arriving in Tokyo and flying home from Kansai to reduce backtracking. Allow two travel days in addition to these city days.',
    highlights: 'Asakusa mornings, Kyoto temple trails and Osaka food streets.',
    warning:
      'Book popular timed attractions early. Nara is a separate day trip; compare point-to-point rail fares before buying a pass.',
  },
  {
    id: 'peru',
    title: 'Peru beyond Machu Picchu',
    tag: '12 city days + 2 transfer days',
    cities: ['lima', 'arequipa', 'cusco'],
    days: [3, 3, 6],
    note: 'Lima → Arequipa → Cusco, then Sacred Valley and Machu Picchu from Cusco. International flights commonly connect through Lima; add travel days and a return buffer.',
    highlights: 'Coastal food, white-stone Arequipa and the Sacred Valley.',
    warning:
      'Keep arrival in Cusco gentle and allow adjustment to altitude. Secure the precise Machu Picchu circuit and timed ticket before train or tour commitments. Machu Picchu needs 1–2 days.',
  },
  {
    id: 'southwest',
    title: 'The great Southwest loop',
    tag: '13 city days + 3 transfer days',
    cities: ['las-vegas', 'springdale', 'moab', 'flagstaff'],
    days: [2, 4, 4, 3],
    note: 'Las Vegas → Springdale/Zion → Moab → Flagstaff/Grand Canyon. This is an open route; add the return to Las Vegas if your rental requires it.',
    highlights: 'Zion walls, red-rock arches and Grand Canyon horizons.',
    warning:
      'Long driving days need buffers. Check road conditions, heat, trail permits and the current U.S. nonresident park fee/pass rules before buying.',
  },
  {
    id: 'italy',
    title: 'Italy by rail',
    tag: '13 city days + 3 transfer days',
    cities: ['venice', 'florence', 'rome', 'naples'],
    days: [3, 3, 4, 3],
    note: 'A north-to-south sequence with Venice, Florence, Rome and Naples. Open-jaw flights can avoid a return journey.',
    highlights: 'Canals, Renaissance art, Roman history and Neapolitan food.',
    warning:
      'Book major museums and ruins in advance. Add intercity travel time; do not schedule a timed attraction immediately after a train arrival.',
  },
  {
    id: 'greece',
    title: 'Greece: city to islands',
    tag: '11 city days + 2 transfer days',
    cities: ['athens', 'santorini', 'chania'],
    days: [3, 3, 5],
    note: 'Athens → Santorini → Crete/Chania. Ferries to Crete may arrive at Heraklion; Chania is then a separate transfer.',
    highlights: 'Classical sites, caldera paths and Cretan food.',
    warning:
      'Ferry routes are seasonal and weather-sensitive. Confirm your exact ports and sailing dates; avoid a tight island-to-international-flight connection.',
  },
  {
    id: 'southeast',
    title: 'A Southeast Asia sampler',
    tag: '12 city days + 3 transfer days',
    cities: ['bangkok', 'chiang-mai', 'siem-reap', 'hanoi'],
    days: [3, 3, 3, 3],
    note: 'Bangkok and Chiang Mai pair naturally. Continue to Siem Reap and Hanoi after checking whether flights require connections.',
    highlights: 'Temples, northern Thai food, Angkor and Old Quarter lanes.',
    warning:
      'This is a multi-country route. Check entry requirements for your passport, flight connections and seasonal smoke/rain before booking.',
  },
  {
    id: 'egypt',
    title: 'Egypt’s ancient corridor',
    tag: '8 city days + 1 transfer day',
    cities: ['cairo', 'luxor'],
    days: [4, 4],
    note: 'Cairo → Luxor. Add an optional Nile cruise or Aswan extension beyond this guide.',
    highlights: 'Pyramids, museum collections and the Valley of the Kings.',
    warning:
      'Check exactly which tombs and museum sections a ticket includes; special entries can cost extra.',
  },
  {
    id: 'east-africa',
    title: 'East Africa city & safari',
    tag: '10–14+ days · guided overland / flights',
    cities: ['nairobi', 'arusha'],
    days: [4, 5],
    note: 'Start in Nairobi, then cross into Tanzania for Arusha and an individually quoted safari. Reserve separate multi-day safari blocks.',
    highlights: 'Wildlife close to Nairobi and the northern Tanzania circuit.',
    warning:
      'Safari quotes must spell out park/concession fees, vehicle, guide, lodging and transfers. Budget substantially beyond ordinary city spending.',
  },
  {
    id: 'morocco',
    title: 'Morocco’s medinas',
    tag: '8 city days + 1 transfer day',
    cities: ['marrakech', 'fez'],
    days: [4, 4],
    note: 'Marrakech → Fez; the transfer is long. Consider a stop in Rabat or a deliberately booked desert circuit beyond the covered destinations.',
    highlights: 'Craft traditions, courtyard architecture and market food.',
    warning:
      'A Sahara trip is not a quick detour from either city. Agree prices for guides and purchases before committing.',
  },
  {
    id: 'yellowstone',
    title: 'The northern park pair',
    tag: '7+ days · rental car',
    cities: ['jackson'],
    days: [7],
    note: 'Base the Grand Teton section near Jackson, then move accommodation closer to the Yellowstone areas you plan to visit.',
    highlights: 'Teton views, geyser basins and wildlife at a distance.',
    warning:
      'Jackson is not a practical daily base for every part of Yellowstone. Seasonal road openings, wildfire conditions and lodging availability shape the route.',
  },
];
function cityTabLegacy(c, tab) {
  if (tab === 'arrival')
    return `<div class="infogrid">${[
      ['train', 'From the airport / station', c.arrival],
      ['route', 'Getting around', c.gettingAround],
      ['pin', 'Where to base yourself', c.baseArea],
      [
        'wallet',
        'Cash to carry',
        c.cashTip +
          ' Suggested accessible cash: ' +
          range(c.cashPerDay, c.currency) +
          ' per person/day. This is part of your spending budget, not an additional charge.',
      ],
      ['food', 'What to eat', c.foodTip],
      ['bag', 'What to bring home', c.buyTip],
      ['sun', 'When to go', c.seasonNote],
    ]
      .map(
        ([i, t, b]) =>
          `<section class="infocard"><h3>${icon(i)}${esc(t)}</h3><p>${esc(b)}</p></section>`,
      )
      .join(
        '',
      )}<section class="infocard wide"><h3>${icon('wallet')}Your daily planning allowance</h3><p>${range(c.dailyBudget, c.currency)} per person/day. ${esc(c.budgetNote || 'Planning estimate for food, local transport and ordinary sightseeing.')} Hotels, intercity transport, shopping and premium excursions are extra. Amounts are editorial planning ranges, not current quotes. Adjust accommodation and special-excursion allowances in your trip.</p></section></div>`;
  if (tab === 'sources')
    return `<div class="reviewstrip">${icon('star')}<p>Sights are ordered by how many people read about them on Wikipedia. Food and shopping follow our editors’ order.<br>${external(c.reviewSource, 'See what visitors say on Tripadvisor ↗')}</p></div><div class="source-list">${c.sources.map((s) => `<div class="source-row"><div>${external(s.url, esc(s.title) + ' ↗')}<br><small>${esc(new URL(s.url).hostname)}</small></div><span class="pill ${s.type === 'reviews' ? 'warm' : 'gray'}">${s.type}</span></div>`).join('')}</div><div class="info-note">Retrieved ${CHECKED}. “Retrieved” is the research access date; some indexed pages may have been crawled earlier. Recheck official hours and ticket types before committing.</div><h3 style="margin-top:30px">Photography</h3><div class="source-list">${[
      c.id,
      ...c.items.map((p) => p.id),
    ]
      .map(
        (id) =>
          `<div class="source-row"><div>${esc(id === c.id ? c.name : P[id].name)}<br><small>${photoCredit(id)}${PHOTO[id]?.context ? ' · representative image' : ''}</small>${galleryFor(
            id,
          )
            .map((g) => `<br><small>Gallery · ${galleryCredit(g)}</small>`)
            .join('')}</div></div>`,
      )
      .join('')}</div>`;
  return `<div class="reviewstrip">${icon('star')}<p><strong>Why these places?</strong> Sights are ordered by Wikipedia readership; food and shopping follow our editors’ order. ${external(c.reviewSource, 'Reviews on Tripadvisor ↗')}</p></div><div class="searchrow" style="justify-content:space-between;flex-wrap:wrap"><div class="chips" style="margin:0">${[
    ['all', 'All places'],
    ['see', 'See & do'],
    ['eat', 'Eat & drink'],
    ['shop', 'Shop'],
    ['saved', 'Saved'],
  ]
    .map(
      ([k, t]) =>
        `<button class="chip ${cityFilter === k ? 'active' : ''}" data-action="city-filter" data-id="${k}">${t}</button>`,
    )
    .join(
      '',
    )}</div><select id="place-sort" aria-label="Sort places" style="padding:9px;border:1px solid var(--line);border-radius:8px;color:var(--ink);background:white"><option value="recommended" ${placeSort === 'recommended' ? 'selected' : ''}>Suggested visit priority</option><option value="cost" ${placeSort === 'cost' ? 'selected' : ''}>Lowest starting cost</option></select></div><div class="placegrid" id="city-places">${getCityPlaces(c).map(placeCard).join('') || '<div class="no-results">No saved places here yet. Tap a heart to keep a place.</div>'}</div>`;
}
