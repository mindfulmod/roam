function renderMap(id = '') {
  headerActive('map');
  mapCity = id === 'trip' ? '' : validCity(id) ? id : '';
  mapKind = 'all';
  mapQuery = '';
  mapDiet = 'all';
  $('#app').innerHTML =
    `<section class="map-layout"><aside class="mapaside"><h1>Follow your curiosity.</h1><p class="muted">Find a place, open its story, then make it part of your journey.</p><select id="map-city" aria-label="Map destination"><option value="">All ${CITIES.length} destinations</option>${CITIES.map((c) => `<option value="${c.id}" ${mapCity === c.id ? 'selected' : ''}>${esc(c.name)}, ${esc(c.country)}</option>`).join('')}</select><button class="map-mobile-toggle" data-action="map-list" aria-label="Show places list">${icon('list')}</button><div class="searchbox">${icon('search')}<input id="map-search" type="search" placeholder="Search places…" aria-label="Search map places"></div><div class="chips">${[
      ['all', 'All'],
      ['see', 'See'],
      ['eat', 'Eat'],
      ['shop', 'Shop'],
      ['saved', 'Saved'],
    ]
      .map(
        ([k, t]) =>
          `<button class="chip ${k === 'all' ? 'active' : ''}" data-action="map-kind" data-id="${k}">${t}</button>`,
      )
      .join(
        '',
      )}<select id="map-diet" aria-label="Map dietary filter"><option value="all">All dietary choices</option><option value="halal">Sourced halal choices</option><option value="vegetarian">Vegetarian options</option><option value="vegan">Plant-based menus</option></select><div id="map-stay-control">${mapCity ? `<button class="btn light small" data-action="edit-stay" data-id="${mapCity}">${icon('pin')} ${S.stays[mapCity] ? 'Change my stay' : 'Add my stay'}</button>` : ''}</div></div><div id="map-card" class="map-card" hidden></div><div class="map-sheet" id="map-sheet"><button class="sheet-handle" data-action="map-list" aria-expanded="false" aria-controls="map-list"><span class="modal-grab" aria-hidden="true"></span><span class="sheet-count" id="map-count"></span><span class="sheet-hint">${icon('list')}<span>List</span></span></button><div id="map-list" class="maplist"></div></div></aside><div class="mapcanvas"><div id="atlasmap" aria-label="Interactive destination and attraction map"></div><div class="map-top"><div class="actions"><button class="btn light small" data-action="map-reset" aria-label="World overview" title="World overview">${icon('globe')}<span class="lbl"> Overview</span></button><button class="btn light small ${S.street ? 'on' : ''}" data-action="tiles" id="tile-toggle" aria-label="Street detail ${S.street ? 'on' : 'off'}" title="Street detail">${icon('map')}<span class="lbl"> Street detail: ${S.street ? 'on' : 'off'}</span></button></div><button class="btn light small" data-action="locate" aria-label="Near me" title="Near me">${icon('locate')}<span class="lbl"> Near me</span></button></div><div class="map-bottom" id="map-note">Numbered pins show popularity ranks within each place category. Lines show order, not roads.</div></div></section>`;
  map = L.map('atlasmap', {
    zoomControl: !isMobile(),
    minZoom: 1,
    maxZoom: 18,
    worldCopyJump: true,
    attributionControl: true,
  }).setView([21, 40], 2);
  map.createPane('offline-outline');
  map.getPane('offline-outline').style.zIndex = '150';
  // The outline and the city dots are drawn on canvas rather than as hundreds of separate page
  // elements, so panning and pinching the world map stays smooth on phones.
  L.geoJSON(DATA.world, {
    pane: 'offline-outline',
    renderer: L.canvas({ pane: 'offline-outline', padding: 0.5 }),
    style: outlineStyle(),
    interactive: false,
  }).addTo(map);
  dotRenderer = L.canvas({ padding: 0.5, tolerance: isMobile() ? 10 : 4 });
  map.attributionControl.addAttribution(
    'Offline outline: <a href="https://www.naturalearthdata.com/">Natural Earth</a>',
  );
  foldCredit(map);
  markerLayer = L.layerGroup().addTo(map);
  routeLayer = L.layerGroup().addTo(map);
  map.on('click', () => hideMapCard());
  map.createPane('atlas-labels');
  map.getPane('atlas-labels').style.zIndex = '450';
  map.getPane('atlas-labels').style.pointerEvents = 'none';
  labelLayer = L.layerGroup().addTo(map);
  map.on('zoomend moveend', drawAtlasLabels);
  if (S.street && navigator.onLine) enableStreet();
  renderMapPins(true);
  drawAtlasLabels();
  if (id === 'trip' && S.trip.length) {
    const pts = S.trip.map((id) => [C[id].lat, C[id].lon]);
    if (pts.length > 1) {
      L.polyline(pts, { color: '#e7764b', weight: 3, dashArray: '7 7' }).addTo(routeLayer);
      map.fitBounds(pts, { padding: [50, 65], maxZoom: 6 });
    } else map.setView(pts[0], 7);
  }
  setTimeout(() => map?.invalidateSize(), 100);
}
function enableStreet() {
  if (!map) return;
  if (streetLayer) return;
  streetLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    maxZoom: 19,
    updateWhenIdle: true,
  });
  let failures = 0;
  streetLayer.on('tileerror', () => {
    failures++;
    // Tiles that never arrive leave a blank map: draw the offline names after all.
    if (failures === 3 && streetLayer) {
      streetLayer.broken = true;
      drawAtlasLabels();
    }
    if (failures >= 3 && $('#map-note'))
      $('#map-note').textContent =
        'Street tiles are unavailable. Embedded map outline and planning pins still work.';
  });
  streetLayer.addTo(map);
}
function mapUsesPlaces() {
  return Boolean(mapCity || mapKind !== 'all' || mapDiet !== 'all' || mapQuery.trim());
}
function mapItems() {
  const q = mapQuery.toLowerCase().trim();
  let items = mapCity
    ? C[mapCity].items.map((p) => P[p.id])
    : mapUsesPlaces()
      ? mapKind === 'saved'
        ? S.saved.map((id) => P[id])
        : PLACES
      : citiesByVisits();
  if (!mapUsesPlaces()) return items;
  return items
    .filter(
      (p) =>
        (mapKind === 'all' || p.kind === mapKind || (mapKind === 'saved' && saved(p.id))) &&
        (!q ||
          [p.name, p.cityName, p.area, C[p.cityId].country, p.summary, ...typesFor(p)]
            .join(' ')
            .toLowerCase()
            .includes(q)) &&
        (mapDiet === 'all' ||
          (p.kind === 'eat' &&
            p.dietary?.evidence?.length &&
            (mapDiet === 'halal'
              ? ['certified', 'operator-stated', 'options'].includes(p.dietary.halal)
              : mapDiet === 'vegan'
                ? p.dietary.vegetarian === 'vegan'
                : ['fully-vegetarian', 'vegan', 'options'].includes(p.dietary.vegetarian)))),
    )
    .sort((a, b) =>
      mapCity && S.stays[mapCity]
        ? hav(S.stays[mapCity], a) - hav(S.stays[mapCity], b)
        : comparePlaces(a, b, 'popularity'),
    );
}
function popupHtml(p, isCity) {
  return `<div class="map-popup">${photoTag(p.id)}<div class="map-popup-body"><h3>${esc(p.name)}</h3><p>${esc(isCity ? p.tagline : p.area + ' · ' + priceLabel(p))}</p>${isCity ? '' : `<div class="map-popup-tags">${typeChips(p)}<span class="pill tierpill t-${tier(p).key}">${tier(p).label}</span></div>`}</div><div class="actions"><button class="btn small" data-action="${isCity ? 'map-city-open' : 'place'}" data-id="${p.id}">${isCity ? 'Explore places' : 'View details'} ${icon('arrow')}</button>${isCity ? cityAdd(p.id, true) : external(mapsPin(p), icon('pin') + '<span class="visually-hidden">Open in Google Maps</span>', 'btn light small')}</div></div>`;
}
// Countries folded in the world list, kept while the app is open.
const mapFolded = new Set();
document.addEventListener(
  'toggle',
  (e) => {
    const g = e.target;
    if (!g.matches?.('.maplist-group')) return;
    if (g.open) mapFolded.delete(g.dataset.country);
    else mapFolded.add(g.dataset.country);
    const all = $('[data-action="map-fold-all"]');
    if (all)
      all.textContent = $$('.maplist-group').every((x) => !x.open)
        ? 'Open all countries'
        : 'Fold all countries';
  },
  true,
);
function mapFoldAll() {
  const groups = $$('.maplist-group'),
    open = groups.every((g) => !g.open);
  for (const g of groups) g.open = open;
}
function renderMapPins(fit = false) {
  if (!map) return;
  markerLayer.clearLayers();
  mapMarkers = {};
  dotInk = null;
  const items = mapItems(),
    isCity = !mapUsesPlaces();
  // Numbered pins only while there are few enough to read; the world view and big searches get dots.
  const dots = isCity || items.length > DOT_OVER;
  items.forEach((p) => {
    const m = dots
      ? L.circleMarker([p.lat, p.lon], { renderer: dotRenderer, ...dotStyle(p, isCity) })
      : L.marker([p.lat, p.lon], {
          title: p.name,
          icon: L.divIcon({
            className: '',
            html: `<div class="map-pin ${p.kind} ${saved(p.id) ? 'selected' : ''}">${popularityRank(p) || '•'}</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          }),
        });
    if (isMobile())
      m.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        showMapCard(p.id);
      });
    else m.bindPopup(popupHtml(p, isCity));
    m.addTo(markerLayer);
    if (dots && !isMobile()) m.bindTooltip(p.name, { direction: 'top', offset: [0, -5] });
    mapMarkers[p.id] = m;
  });
  const row = (p) =>
    `<div class="maplistitem"><div data-action="map-focus" data-id="${p.id}" style="display:flex;align-items:center;gap:11px;flex:1;min-width:0" tabindex="0" role="button" aria-label="Find ${esc(p.name)} on the map">${photoTag(p.id)}<div class="text"><h4>${isCity ? '' : popularityRank(p) ? '#' + popularityRank(p) + ' ' : ''}${esc(p.name)}</h4><p>${esc(isCity ? p.tagline : (mapCity ? p.area : p.cityName) + ' · ' + p.duration + ' h')}</p></div></div>${isCity ? cityAdd(p.id, true) : saveButton(p.id)}</div>`;
  // The world list is grouped by country, most-visited first, so the order explains itself.
  // Each country folds away with one tap, so you can skip past one you are not interested in.
  const groups = [];
  if (isCity)
    for (const p of items) {
      if (groups.at(-1)?.country !== p.country) groups.push({ country: p.country, list: [] });
      groups.at(-1).list.push(p);
    }
  // On phones the list sits in a closed sheet: it is drawn when the sheet opens, not on every
  // filter change, which kept hundreds of hidden rows in the page behind the map.
  mapListDraw = () => {
    mapListDraw = null;
    const el = $('#map-list');
    if (el) el.innerHTML = listHtml();
  };
  const listHtml = () => items.length
    ? isCity
      ? `<p class="maplist-order">Most-visited countries first, then each country’s most popular places. <button class="inline-link" data-action="ranking-method">How this is ranked</button>${groups.length > 1 ? ` · <button class="inline-link" data-action="map-fold-all">${groups.every((g) => mapFolded.has(g.country)) ? 'Open all countries' : 'Fold all countries'}</button>` : ''}</p>` +
        groups
          .map(
            (g) =>
              `<details class="maplist-group" data-country="${esc(g.country)}"${mapFolded.has(g.country) ? '' : ' open'}><summary class="maplist-country"><span>${esc(g.country)}<small>${esc(countryVisitors(g.country))}</small></span><em>${g.list.length} ${g.list.length === 1 ? 'city' : 'cities'}${icon('down')}</em></summary>${g.list.map(row).join('')}</details>`,
          )
          .join('')
      : items.map(row).join('')
    : '<p class="muted">No matching places. Try another filter.</p>';
  if (!isMobile() || $('#map-sheet')?.classList.contains('open')) mapListDraw();
  else $('#map-list').innerHTML = '';
  if ($('#map-count'))
    $('#map-count').textContent =
      `${items.length} ${isCity ? 'destinations' : items.length === 1 ? 'place' : 'places'}` +
      (mapCity ? ' in ' + C[mapCity].name : '');
  hideMapCard();
  if (mapCity && S.stays[mapCity]) {
    const stay = S.stays[mapCity];
    L.marker([stay.lat, stay.lon], {
      icon: L.divIcon({
        className: '',
        html: '<div class="stay-pin">⌂</div>',
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      }),
    })
      .bindPopup('<strong>' + esc(stay.label) + '</strong><br>Your saved stay')
      .addTo(markerLayer);
  }
  if ($('#map-stay-control'))
    $('#map-stay-control').innerHTML = mapCity
      ? `<button class="btn light small" data-action="edit-stay" data-id="${mapCity}">${icon('pin')} ${S.stays[mapCity] ? 'Change my stay' : 'Add my stay'}</button>`
      : '';
  if (fit && items.length) {
    if (isCity) {
      map.setView([21, 35], 2);
    } else {
      map.fitBounds(
        items.map((p) => [p.lat, p.lon]),
        { padding: [50, 70], maxZoom: 13 },
      );
    }
  }
}
// City dots and big result sets are canvas circles: their look lives here, not in CSS.
const DOT_OVER = 250;
let dotRenderer = null;
let dotInk = null;
function dotStyle(p, isCity, focused = false) {
  // Theme colours are read once per drawing, not once per dot.
  const k = (dotInk ||= {
      on: themeColor('--orange', '#e7764b'),
      eat: themeColor('--k-d88647-s', '#d88647'),
      shop: themeColor('--k-84719a-s', '#84719a'),
      see: themeColor('--teal-fill', '#c8501f'),
      edge: themeColor('--k-fff-b', '#ffffff'),
      phone: isMobile(),
    }),
    on = focused || saved(p.id),
    fill = on ? k.on : !isCity && (p.kind === 'eat' || p.kind === 'shop') ? k[p.kind] : k.see;
  return {
    radius: (focused ? 9 : k.phone ? 7 : 6) + (on && !focused ? 1 : 0),
    color: k.edge,
    weight: 2,
    fillColor: fill,
    fillOpacity: 1,
  };
}
// Marks one pin as saved or focused, whether it is a numbered pin or a canvas dot.
function markPin(id, cls, on) {
  const m = mapMarkers[id];
  if (!m) return;
  if (m.setStyle) {
    const p = P[id] || C[id];
    m.setStyle(dotStyle(p, !P[id] || !mapUsesPlaces(), cls === 'focused' && on));
    if (cls === 'focused' && on) m.bringToFront();
  } else m.getElement()?.querySelector('.map-pin')?.classList.toggle(cls, on);
}
let mapListDraw = null;
function setMapSheet(open) {
  if (open) mapListDraw?.();
  $('#map-sheet')?.classList.toggle('open', open);
  $('#map-list')?.classList.toggle('visible', open);
  $('.sheet-handle')?.setAttribute('aria-expanded', String(open));
  if (open) hideMapCard();
}
// Phones get a docked preview card (Apple/Google Maps style) instead of a floating popup.
function showMapCard(id) {
  const card = $('#map-card');
  if (!card) return;
  const isCity = !P[id];
  card.innerHTML = `<button class="iconbtn close" data-action="map-card-close" aria-label="Close preview">${icon('close')}</button>${popupHtml(P[id] || C[id], isCity)}`;
  card.hidden = false;
  setMapSheet(false);
  $('.mapaside')?.classList.add('has-card');
  unfocusPins();
  const marker = mapMarkers[id];
  markPin(id, 'focused', true);
  focusedPin = id;
  if (map && marker) {
    const pt = map.latLngToContainerPoint(marker.getLatLng()),
      size = map.getSize(),
      free = size.y - card.offsetHeight - 24;
    if (pt.y > free - 30 || pt.y < 130 || pt.x < 20 || pt.x > size.x - 20)
      map.panBy([pt.x - size.x / 2, pt.y - (130 + free) / 2]);
  }
}
function hideMapCard() {
  const card = $('#map-card');
  if (!card || card.hidden) return;
  card.hidden = true;
  card.innerHTML = '';
  $('.mapaside')?.classList.remove('has-card');
  unfocusPins();
}
let focusedPin = '';
function unfocusPins() {
  $$('.map-pin.focused').forEach((x) => x.classList.remove('focused'));
  if (focusedPin) markPin(focusedPin, 'focused', false);
  focusedPin = '';
}
function setMapCity(id) {
  if (!validCity(id)) return;
  mapCity = id;
  mapKind = 'all';
  mapQuery = '';
  mapDiet = 'all';
  $('#map-diet').value = 'all';
  $('#map-city').value = id;
  $('#map-search').value = '';
  $$('[data-action="map-kind"]').forEach((b) =>
    b.classList.toggle('active', b.dataset.id === 'all'),
  );
  routeLayer.clearLayers();
  renderMapPins(true);
  setMapSheet(false);
  history.replaceState(null, '', '#/map/' + id);
}
function mapLocate() {
  if (!navigator.geolocation) {
    toast('This browser does not offer location. Choose your city instead.');
    return;
  }
  toast('Requesting your location…');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (!map) return;
      const here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      const nearest = [...CITIES].sort((a, b) => hav(here, a) - hav(here, b))[0];
      const distance = hav(here, nearest);
      if (distance < 180) {
        setMapCity(nearest.id);
        L.circleMarker([here.lat, here.lon], {
          radius: 7,
          color: '#fff',
          weight: 3,
          fillColor: '#348dc8',
          fillOpacity: 1,
        })
          .addTo(map)
          .bindPopup('Your approximate position');
        map.setView([here.lat, here.lon], Math.max(9, map.getZoom()));
        toast('Showing the nearest covered destination: ' + nearest.name);
      } else {
        map.setView([here.lat, here.lon], 4);
        toast(
          `Nearest covered destination: ${nearest.name}, about ${Math.round(distance)} km away.`,
        );
      }
    },
    () => toast('Location unavailable. Select a destination from the map menu.'),
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
  );
}
// Map credits fold down to a small "i" in the corner (as on stories and the feed), so no
// footer sits across the map. OpenStreetMap's attribution rules ask for the credit to be
// visible when the map opens, so it starts open and folds at the first touch, click or scroll
// on the map, or after five seconds. Tap the "i" to read it again.
function foldCredit(m) {
  const credit = m.attributionControl?.getContainer();
  if (!credit) return;
  credit.classList.add('soc-credit', 'open');
  credit.setAttribute('role', 'button');
  credit.setAttribute('tabindex', '0');
  credit.setAttribute('aria-label', 'Map credits');
  credit.setAttribute('aria-expanded', 'true');
  // Only the person's own touch counts: the app's own fit-to-pins moves don't fold it.
  const box = m.getContainer(),
    fold = (e) => {
      if (e && credit.contains(e.target)) return;
      clearTimeout(timer);
      box.removeEventListener('pointerdown', fold);
      box.removeEventListener('wheel', fold);
      credit.classList.remove('open');
      credit.setAttribute('aria-expanded', 'false');
    },
    timer = setTimeout(fold, 5000);
  box.addEventListener('pointerdown', fold);
  box.addEventListener('wheel', fold, { passive: true });
  L.DomEvent.disableClickPropagation(credit);
  const flip = () => credit.setAttribute('aria-expanded', String(credit.classList.toggle('open')));
  credit.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!e.target.closest('a')) flip();
  });
  credit.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target === credit) {
      e.preventDefault();
      flip();
    }
  });
}
// Without street tiles the map is only land and sea, so it draws its own names: countries
// when zoomed out, city names from the regional view in, and the names of the pinned places
// once you are inside a city. With street detail on, the tiles carry the names instead.
let labelLayer = null,
  countryPoints = null,
  labelTimer = 0;
function countryLabelPoints() {
  if (countryPoints) return countryPoints;
  countryPoints = [];
  for (const f of DATA.world.features || []) {
    const g = f.geometry,
      polys =
        g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
    let best = null,
      area = 0;
    for (const poly of polys) {
      const ring = poly[0];
      let x0 = 180,
        x1 = -180,
        y0 = 90,
        y1 = -90;
      for (const [x, y] of ring) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
      const a = (x1 - x0) * (y1 - y0);
      if (a > area) ((area = a), (best = [(y0 + y1) / 2, (x0 + x1) / 2]));
    }
    if (best && f.properties?.name) countryPoints.push({ name: f.properties.name, at: best, area });
  }
  return countryPoints;
}
function atlasLabel(at, text, cls) {
  return L.marker(at, {
    pane: 'atlas-labels',
    interactive: false,
    keyboard: false,
    icon: L.divIcon({
      className: 'atlas-label-anchor',
      html: `<span class="atlas-label ${cls}">${esc(text)}</span>`,
      iconSize: [0, 0],
    }),
  });
}
function drawAtlasLabels() {
  clearTimeout(labelTimer);
  labelTimer = setTimeout(() => {
    if (!map || !labelLayer) return;
    labelLayer.clearLayers();
    if (streetLayer && !streetLayer.broken) return;
    const z = map.getZoom(),
      view = map.getBounds().pad(0.15),
      inView = (lat, lon) => view.contains([lat, lon]),
      placeMode = mapUsesPlaces(),
      taken = [];
    // Labels go in priority order and skip any spot already taken, so names never pile up.
    // Sizes are estimated from the text (about 0.6em a character).
    const put = (at, text, cls, size, dx, centre) => {
      const pt = map.latLngToContainerPoint(at),
        w = text.length * size * 0.6,
        x = centre ? pt.x - w / 2 : pt.x + dx,
        r = { x0: x - 3, x1: x + w + 3, y0: pt.y - size, y1: pt.y + size };
      if (taken.some((t) => r.x0 < t.x1 && r.x1 > t.x0 && r.y0 < t.y1 && r.y1 > t.y0)) return;
      taken.push(r);
      atlasLabel(at, text, cls).addTo(labelLayer);
    };
    // Places first inside a city (names beside their numbered pins), most popular first.
    if (placeMode && z >= 12)
      for (const p of mapItems()
        .filter((p) => inView(p.lat, p.lon))
        .slice(0, 60))
        put(
          [p.lat, p.lon],
          p.name.length > 24 ? p.name.slice(0, 23) + '…' : p.name,
          'place',
          11,
          19,
        );
    // Cities from a regional view in, in the guide's own order.
    if (z >= 4 && (z < 11 || !placeMode))
      for (const c of CITIES.filter((c) => inView(c.lat, c.lon)))
        placeMode
          ? put([c.lat, c.lon], c.name, 'city big', 15, 0, true)
          : put([c.lat, c.lon], c.name, 'city', 12, 10);
    // Countries when zoomed out: big ones first, smaller ones as you zoom in.
    if (z <= 6)
      for (const c of [...countryLabelPoints()].sort((a, b) => b.area - a.area))
        if (c.area > 600 / 4 ** (z - 1) && inView(...c.at))
          put(c.at, c.name.toUpperCase(), 'country', 11, 0, true);
  }, 60);
}
