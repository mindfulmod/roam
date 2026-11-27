function renderSaved() {
  headerActive('saved');
  const places = S.saved.map((id) => P[id]).filter(Boolean),
    shops = S.shops.map((id) => SHOPS[id]).filter(Boolean),
    cities = [...new Set([...places, ...shops].map((p) => p.cityId))];
  $('#app').innerHTML =
    `<div class="wrap savedpage"><div class="pagehead"><div><h1>Saved</h1><p>${cities.length ? 'Your places, by city. Add a city to your trip to start planning it.' : 'Tap the heart on any place to keep it here.'}</p></div></div>${
      cities.length
        ? cities
            .map((id) => {
              const mine = places.filter((p) => p.cityId === id),
                shop = shops.filter((x) => x.cityId === id);
              return `<section class="savedgroup"><div class="sg-head"><a class="sg-city" href="#/city/${id}">${photoTag(id)}<span><strong>${esc(C[id].name)}</strong><small>${mine.length + shop.length} saved</small></span></a>${cityAdd(id)}</div>${mine.length ? `<div class="placegrid">${mine.map(placeCard).join('')}</div>` : ''}${shop.length ? `<div class="shopgrid savedshops">${shop.map((x) => `<article class="shopcard">${shopSave(x.id)}<div class="shopcard-top"><span class="pill gray">${icon('bag')} Shopping</span><small>${esc(x.area)}</small></div><h4>${esc(x.name)}</h4><p>${esc(x.summary)}</p>${external(shopMapsUrl(C[id], x), icon('pin') + ' Google Maps', 'inline-link shopmap')}</article>`).join('')}</div>` : ''}</section>`;
            })
            .join('')
        : `<div class="rowhead"><h2>Start with one of these</h2></div><div class="placegrid">${starterPlaces().map(placeCard).join('')}</div><div class="actions trip-start"><a href="#/" class="btn">Explore more ${icon('arrow')}</a></div>`
    }${footer()}</div>`;
}
function sourceRecords() {
  const records = new Map();
  for (const c of CITIES) {
    for (const s of c.sources) {
      const previous = records.get(s.url),
        cities = new Set([...(previous?.cities || []), c.name]);
      records.set(s.url, { ...s, cities: [...cities] });
    }
    for (const p of c.items) {
      for (const u of [
        ...(p.sourceUrls || []),
        ...(p.review?.url ? [p.review.url] : []),
        ...(p.dietary?.evidence || []).map((e) => e.url),
      ]) {
        if (records.has(u)) {
          const r = records.get(u);
          if (!r.cities.includes(c.name)) r.cities.push(c.name);
        } else
          records.set(u, {
            title: new URL(u).hostname,
            url: u,
            type: 'reference',
            cities: [c.name],
            checked: '2026-11-04',
          });
      }
    }
  }
  return [...records.values()];
}
const CHECKLIST = [
  ['tickets', 'Book critical timed entries and permits'],
  ['transport', 'Confirm intercity routes and transfer buffers'],
  ['entry', 'Check passport, entry and transit requirements'],
  ['cash', 'Check payment options and cash access'],
  ['offline', 'Download the app and export the trip backup'],
  ['weather', 'Recheck weather, closures and seasonal roads'],
  ['insurance', 'Arrange suitable travel insurance'],
  ['bookings', 'Keep booking confirmations available offline'],
];
function renderGuide() {
  headerActive('guide');
  $('#app').innerHTML =
    `<div class="wrap"><div class="pagehead"><div><h1>About & sources</h1><p>How this guide makes its choices, where the information comes from, and how to take your plan with you.</p></div></div><div class="methodology"><h2>Start here.</h2><ol><li><strong>Compare cities.</strong> Choose a published tourism ranking or your Japan-first priorities, then open a city.</li><li><strong>Understand the places.</strong> Open any place to see why it ranks where it does, its appeal and trade-offs. Use Filters for experience type, and the Food tab for named venues with halal and vegetarian filters.</li><li><strong>Add your stay.</strong> Search an address, paste coordinates or pin the map. Sort by distance and start local routes at your accommodation.</li><li><strong>Save the places that interest you.</strong> Your saved places become that city’s day-plan inputs. With no saved picks, the planner offers a shortlist.</li><li><strong>Add cities to your trip.</strong> Set the number of days and your pace. Put your arrival city first before suggesting an order.</li><li><strong>Use the map.</strong> Tap destination or place markers, filter by activity and open a pin in Google Maps.</li><li><strong>Keep a backup.</strong> Export your trip JSON, then import it in the app on another device. Browser storage is local to each browser/origin.</li></ol><h2>What “popular” means here.</h2><p>The ${CITIES.length} destinations combine your Japan-first priorities with Asia, Europe, Africa, Latin America and six U.S. park gateways. The city comparison offers the 2025 Euromonitor overall tourism index and a separate international-arrivals view. Their scope and definitions differ. <button class="inline-link" data-action="ranking-method">Read the ranking methods and source links ↗</button></p><p>This guide does not show or store visitor ratings or review counts from other sites. Sights are ranked by Wikipedia readership, compared only with the other sights covered in the same city. Places without that figure stay unranked and follow our editors’ order, as do food and shopping. Where a place has a Tripadvisor page, a plain link opens it. Tandem Roads is not affiliated with Tripadvisor.</p><p>Where a restaurant holds a distinction in the ${external('https://guide.michelin.com/', 'MICHELIN Guide ↗')} (one to three MICHELIN Stars, or a Bib Gourmand for good value), we state it in words and link to the guide’s own entry, with the date we checked it. It is an inspector award for cooking quality, so it is shown next to the popularity rank and never mixed into it. These restaurants are our own editorial picks; unranked ones are listed after ranked places and ahead of other picks. Their prices are our own rough estimates for a meal at that level in the city, not menu quotes. Tandem Roads is not affiliated with, sponsored or endorsed by Michelin. MICHELIN, MICHELIN Star and Bib Gourmand are trademarks of Michelin.</p><h2>What the route planner can tell you.</h2><p>The visit-order button uses geographic distance, keeps your first city fixed and makes a local improvement pass. It is useful for spotting backtracking. It does not solve for the cheapest airfare, shortest road journey, visas, train timetables or ferry availability. Where a researched connection is available, its mode and approximate service duration appear; otherwise the app explicitly asks you to check connections.</p><p>Daily plans use researched day groups where available and otherwise group nearby places under a time budget. Authored park days stay together to avoid repeat journeys; a visible note identifies any day above your selected pace. Shorten those days or save fewer stops to adapt them. Full-day and distant excursions get separate days. Each city-to-city move receives a one-day transfer placeholder; some long-haul or limited-frequency journeys need more. Closing days and timed reservations are not automatically scheduled. Map lines show the order of stops, not navigable roads or trails.</p><h2>Costs without false precision.</h2><p>Most prices are planning ranges in the destination’s currency. An official fee is labelled when it was specifically verified. Daily spending ranges cover food, local transport and ordinary sightseeing. Hotels, international and intercity travel, transfer days, shopping and major excursions require additional allowances. The cash suggestion sits within spending and is not added to the total.</p><p>Vehicle-based park fees, nonresident supplements and multi-day passes do not behave like ordinary per-person attraction tickets. Read each park card’s price note. Group totals in the planner apply to baseline daily budgets and your own entered per-person allowances, not automatically to park tickets.</p><h2>Google Maps and offline use.</h2><p>“Open in Google Maps” launches a place search; tap <strong>Save</strong> in Google Maps to add it to your own list. This app cannot write directly to your Google account. The CSV export contains names, cities, coordinates, notes and source links. Import it at ${external('https://www.google.com/mymaps', 'Google My Maps ↗')}, choosing Latitude and Longitude for locations and Name for labels. My Maps is separate from your personal saved-place lists.</p><p>The HTML file embeds the guide, photographs, map library and a world outline, so the core app can open without a connection. Street-map tiles, external booking/review pages and Google Maps need internet. Download local Google Maps areas separately when appropriate. Location access is optional and requested only when you press “Near me” or “Use my location”. Accommodation address searches are sent to Photon only when you press Find location; no search runs as you type. Search results require your confirmation. You can use map pins and coordinates instead. Accommodation, preferences and notes are stored locally and exported with your trip backup. Coordinates are approximate planning pins, not guaranteed entrances.</p><h2>Illustrations, photography & map credits.</h2><p>Trip starters and selected signature places have original AI illustrations. They are labelled and interpretive: a trip cover may combine locations and seasons, and a place illustration is not documentary evidence of its current layout. Where an illustration is used, the place page also offers a photographic view. Restaurant imagery never verifies the food’s ingredients or dietary suitability.</p><p>Every city and place has its own image asset. Photos include photographer, source and licence links. Sources include Pexels and Wikimedia Commons; each Commons photograph retains its stated licence, including share-alike terms on the adapted image where applicable. Images are resized, cropped and converted to WebP. Where an exact venue could not be verified, the image is marked as representative dish, craft or destination context. Historical photographs do not verify current vendors or conditions. The downloadable edition embeds every image; the hosted edition bundles the same images as local assets. Many cities and places also have a swipeable gallery of up to five extra photos taken from the photos used in their Wikipedia article and hosted by Wikimedia Commons. Each one is credited with its title, author, licence and a link to the original file, and only freely licensed photographs are used. The full list for a city is under Photo credits in its Sources tab. Gallery photos load from Commons when you open a place, so they need a connection. Photos are displayed with a small colour and contrast boost, and each credit says so (“colours adjusted”); the source files are unchanged. Where a photo carries a share-alike licence, our resized and cropped copy keeps that same licence.</p><p>Interactive mapping uses bundled ${external('https://leafletjs.com/', 'Leaflet')} (BSD 2-Clause). Offline country outlines are ${external('https://www.naturalearthdata.com/about/terms-of-use/', 'Natural Earth public-domain data')}. Optional street tiles are © ${external('https://www.openstreetmap.org/copyright', 'OpenStreetMap contributors')}. Optional address lookup uses ${external('https://github.com/komoot/photon', 'Photon')} with OpenStreetMap data. It has no uptime guarantee; map pinning and coordinate entry remain available if it fails. No map API key or external script is needed.</p><h2>Before you go.</h2><div class="resourcebox">${CHECKLIST.map(([id, label]) => `<label class="checkrow"><input type="checkbox" data-checklist="${id}" ${S.checklist.includes(id) ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div><div class="actions"><button class="btn" data-action="export">${icon('download')} Export your trip</button><button class="btn ghost" data-action="import">${icon('upload')} Import a backup</button></div><details class="sourcebook" id="sourcebook"><summary><h2>The sourcebook</h2></summary><p><span id="source-count">${CITIES.every((c) => cityReady(c.id)) ? sourceRecords().length : 'All the'}</span> unique linked travel/review sources across the guide. Research retrieved ${CHECKED}. Photo-source pages are listed in each destination’s Sources tab. This static edition does not refresh itself automatically.</p><div class="sourcefilters"><select id="source-city" aria-label="Filter sourcebook by destination"><option value="">All destinations</option>${CITIES.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select><select id="source-type" aria-label="Filter sourcebook by source type"><option value="">All source types</option><option value="official">Official</option><option value="reviews">Visitor reviews</option><option value="reference">Other reference</option></select></div><div id="source-results"></div></details></div>${footer()}</div>`;
  $('#sourcebook').addEventListener('toggle', () => $('#sourcebook').open && renderSources());
  renderSources();
}
function renderSources() {
  // The sourcebook covers every city, so it fetches every city's detail the first time it opens.
  if (!$('#sourcebook')?.open && !CITIES.every((c) => cityReady(c.id))) return;
  if (!CITIES.every((c) => cityReady(c.id))) {
    $('#source-results').innerHTML = '<p class="muted">Gathering sources from every city…</p>';
    loadCities(CITIES.map((c) => c.id)).then(
      () => $('#source-results') && renderSources(),
      () => {
        if ($('#source-results'))
          $('#source-results').innerHTML =
            '<p class="muted">Some cities didn’t load. Check your connection, then close and open the sourcebook again.</p>';
      },
    );
    return;
  }
  if ($('#source-count')) $('#source-count').textContent = sourceRecords().length;
  const cid = $('#source-city')?.value || '',
    type = $('#source-type')?.value || '';
  const records = sourceRecords().filter(
    (s) => (!cid || s.cities.includes(C[cid].name)) && (!type || s.type === type),
  );
  $('#source-results').innerHTML = records
    .map(
      (s) =>
        `<div class="source-row"><div>${external(s.url, esc(s.title) + ' ↗')}<br><small>${esc(s.cities.join(', '))} · ${esc(new URL(s.url).hostname)}</small></div><span class="pill ${s.type === 'reviews' ? 'warm' : 'gray'}">${s.type}</span></div>`,
    )
    .join('');
}
