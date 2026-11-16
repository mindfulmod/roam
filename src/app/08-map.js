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
  L.geoJSON(DATA.world, {
    pane: 'offline-outline',
    style: outlineStyle(),
    interactive: false,
  }).addTo(map);
  map.attributionControl.addAttribution(
    'Offline outline: <a href="https://www.naturalearthdata.com/">Natural Earth</a>',
  );
  markerLayer = L.layerGroup().addTo(map);
  routeLayer = L.layerGroup().addTo(map);
  map.on('click', () => hideMapCard());
  if (S.street && navigator.onLine) enableStreet();
  renderMapPins(true);
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
      : CITIES;
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
function renderMapPins(fit = false) {
  if (!map) return;
  markerLayer.clearLayers();
  mapMarkers = {};
  const items = mapItems(),
    isCity = !mapUsesPlaces();
  items.forEach((p, i) => {
    const m = L.marker([p.lat, p.lon], {
      title: p.name,
      icon: L.divIcon({
        className: '',
        html: `<div class="map-pin ${isCity ? 'city' : p.kind} ${saved(p.id) ? 'selected' : ''}">${isCity ? '' : popularityRank(p) || '•'}</div>`,
        iconSize: isCity ? [13, 13] : [32, 32],
        iconAnchor: isCity ? [6, 6] : [16, 16],
      }),
    });
    if (isMobile())
      m.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        showMapCard(p.id);
      });
    else m.bindPopup(popupHtml(p, isCity));
    m.addTo(markerLayer);
    if (isCity && !isMobile()) m.bindTooltip(p.name, { direction: 'top', offset: [0, -5] });
    mapMarkers[p.id] = m;
  });
  $('#map-list').innerHTML = items.length
    ? items
        .map(
          (p, i) =>
            `<div class="maplistitem"><div data-action="map-focus" data-id="${p.id}" style="display:flex;align-items:center;gap:11px;flex:1;min-width:0" tabindex="0" role="button" aria-label="Find ${esc(p.name)} on the map">${photoTag(p.id)}<div class="text"><h4>${isCity ? '' : popularityRank(p) ? '#' + popularityRank(p) + ' ' : ''}${esc(p.name)}</h4><p>${esc(isCity ? p.country : (mapCity ? p.area : p.cityName) + ' · ' + p.duration + ' h')}</p></div></div>${isCity ? cityAdd(p.id, true) : saveButton(p.id)}</div>`,
        )
        .join('')
    : '<p class="muted">No matching places. Try another filter.</p>';
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
function setMapSheet(open) {
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
  $$('.map-pin.focused').forEach((x) => x.classList.remove('focused'));
  const marker = mapMarkers[id];
  marker?.getElement()?.querySelector('.map-pin')?.classList.add('focused');
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
  $$('.map-pin.focused').forEach((x) => x.classList.remove('focused'));
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
