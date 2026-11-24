function openStay(id) {
  if (!validCity(id)) return;
  const c = C[id],
    s = S.stays[id];
  stayCity = id;
  stayDraft = s ? { ...s } : null;
  staySearchResults = [];
  showModal(
    `<div class="modalcontent stay-modal"><span class="eyebrow">YOUR STARTING POINT IN ${esc(c.name.toUpperCase())}</span><h2>Where are you staying?</h2><p>Search for your hotel or address, paste coordinates, or tap the map to place a pin. Confirm the location before saving.</p><div class="field"><label for="stay-label">Name to remember</label><input id="stay-label" maxlength="180" placeholder="My hotel / apartment" value="${esc(s?.label || '')}"></div><div class="stay-search-line"><div class="field"><label for="stay-query">Hotel, address, coordinates or full Google Maps link</label><input id="stay-query" maxlength="500" placeholder="e.g. hotel name, Tokyo · or 35.71, 139.80" value="${esc(s?.address || '')}"></div><button class="btn small" data-action="stay-search">Find location</button></div><p class="filter-note">Address search sends your query to Photon / OpenStreetMap. Pinning the map or pasting coordinates works without address search. Your saved stay remains in this browser and your exported backups.</p><div id="stay-search-status" role="status" class="filter-note"></div><div id="stay-search-results" class="stay-search-results"></div><div id="stay-map" aria-label="Choose your accommodation location on the map"></div><div class="stay-coordinate-line"><label>Latitude <input id="stay-lat" type="number" min="-90" max="90" step="any" value="${s?.lat ?? ''}" placeholder="35.71"></label><label>Longitude <input id="stay-lon" type="number" min="-180" max="180" step="any" value="${s?.lon ?? ''}" placeholder="139.80"></label><button class="btn light small" data-action="stay-coords">Use coordinates</button><button class="btn light small" data-action="stay-location">${icon('locate')} Use my location</button></div><p id="stay-confirm" class="stay-confirm" role="status">${s ? 'Current saved point. Move it if needed.' : 'No location selected yet. Tap the map or choose a search result.'}</p><div class="actions"><button class="btn" data-action="stay-save" id="stay-save" ${s ? '' : 'disabled'}>Save my stay</button>${s ? '<button class="btn ghost" data-action="stay-remove">Remove stay</button>' : ''}<button class="btn ghost" data-action="close-modal">Cancel</button></div><small class="muted">Map/search © OpenStreetMap contributors. Search is an optional online service with no availability guarantee. Check hotel names and entrances carefully.</small></div>`,
    'Set your accommodation',
  );
  stayMap = L.map('stay-map', { zoomControl: true, minZoom: 1, maxZoom: 19 }).setView(
    [s?.lat ?? c.lat, s?.lon ?? c.lon],
    13,
  );
  L.geoJSON(DATA.world, {
    style: outlineStyle(),
    interactive: false,
  }).addTo(stayMap);
  if (navigator.onLine)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(stayMap);
  stayMap.on('click', (e) =>
    selectStayPoint({ lat: e.latlng.lat, lon: e.latlng.lng, address: 'Pinned on the map' }),
  );
  if (s) selectStayPoint(s, false);
  setTimeout(() => stayMap?.invalidateSize(), 100);
}
function selectStayPoint(point, move = true) {
  if (!stayMap || !validCoords(point.lat, point.lon)) return;
  staySearchSequence++;
  staySearchAbort?.abort();
  staySearchAbort = null;
  stayDraft = {
    lat: point.lat,
    lon: point.lon,
    label: point.label || $('#stay-label')?.value || 'My stay',
    address: point.address || '',
  };
  if (stayMarker) stayMap.removeLayer(stayMarker);
  stayMarker = L.circleMarker([point.lat, point.lon], {
    radius: 10,
    color: '#fff',
    weight: 3,
    fillColor: '#e7764b',
    fillOpacity: 1,
  }).addTo(stayMap);
  if (move) stayMap.setView([point.lat, point.lon], Math.max(14, stayMap.getZoom()));
  $('#stay-lat').value = point.lat.toFixed(6);
  $('#stay-lon').value = point.lon.toFixed(6);
  if (!$('#stay-label').value && point.label) $('#stay-label').value = point.label;
  const d = hav(C[stayCity], point);
  $('#stay-confirm').textContent =
    (point.address ? point.address + ' · ' : '') +
    point.lat.toFixed(5) +
    ', ' +
    point.lon.toFixed(5) +
    (d > 80
      ? ' · This is ' +
        Math.round(d) +
        ' km from the city centre. Check that you selected the correct city.'
      : ' · Check the pin, then save.');
  $('#stay-save').disabled = false;
  if ($('#stay-search-status'))
    $('#stay-search-status').textContent = 'Location selected. Check the pin and save.';
}
async function searchStay() {
  const q = $('#stay-query')?.value.trim();
  if (!q) return;
  const sequence = ++staySearchSequence;
  staySearchAbort?.abort();
  staySearchAbort = null;
  const parsed = parseStayCoordinates(q);
  if (parsed) {
    selectStayPoint({ ...parsed, address: 'Point from coordinates / map link' });
    return;
  }
  if (/^https?:\/\//i.test(q)) {
    toast(
      'Use a full Maps URL containing coordinates, or paste latitude and longitude. Short share links cannot be located here.',
    );
    return;
  }
  if (!navigator.onLine) {
    $('#stay-search-status').textContent =
      'You are offline. Use coordinates or place a pin on the map.';
    return;
  }
  if (Date.now() - staySearchTime < 1500) {
    $('#stay-search-status').textContent = 'Please wait a moment, then press Find location again.';
    return;
  }
  staySearchTime = Date.now();
  const city = stayCity,
    query = q + ', ' + C[city].name,
    key = city + '|' + q.toLowerCase();
  $('#stay-search-status').textContent = 'Looking for matching locations…';
  $('#stay-search-results').innerHTML = '';
  staySearchResults = [];
  try {
    let rows = geocodeCache.get(key);
    if (!rows) {
      const controller = new AbortController();
      staySearchAbort = controller;
      const timer = setTimeout(() => controller.abort(), 12000);
      let response;
      try {
        response = await fetch(
          'https://photon.komoot.io/api/?' +
            new URLSearchParams({
              q: query,
              lat: C[city].lat,
              lon: C[city].lon,
              limit: 6,
              lang: 'en',
            }),
          { signal: controller.signal, referrerPolicy: 'no-referrer' },
        );
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) throw Error('Search is temporarily unavailable');
      const data = await response.json();
      rows = (data.features || [])
        .filter(
          (f) =>
            f.geometry?.type === 'Point' &&
            validCoords(f.geometry.coordinates[1], f.geometry.coordinates[0]),
        )
        .map((f) => ({
          lat: f.geometry.coordinates[1],
          lon: f.geometry.coordinates[0],
          label: f.properties?.name || q,
          address: [
            f.properties?.housenumber,
            f.properties?.street,
            f.properties?.district,
            f.properties?.city,
            f.properties?.country,
          ]
            .filter(Boolean)
            .join(', '),
        }));
      geocodeCache.set(key, rows);
    }
    if (!stayMap || stayCity !== city || sequence !== staySearchSequence) return;
    staySearchResults = rows;
    $('#stay-search-status').textContent = rows.length
      ? 'Choose the matching address, check its map pin, then save.'
      : 'No matches found. Try a street address or place a pin yourself.';
    $('#stay-search-results').innerHTML = rows
      .map(
        (p, i) =>
          `<button data-action="stay-result" data-id="${i}"><strong>${esc(p.label)}</strong><span>${esc(p.address)}</span><small>${distanceText(hav(C[city], p))} from ${esc(C[city].name)} centre</small></button>`,
      )
      .join('');
  } catch (e) {
    if (sequence !== staySearchSequence) return;
    if ($('#stay-search-status'))
      $('#stay-search-status').textContent =
        'Address search is unavailable. Paste coordinates or tap the map to set your stay.';
  }
}
function saveStay() {
  if (!stayDraft || !validCity(stayCity)) return;
  S.stays[stayCity] = normalStay({
    ...stayDraft,
    label: $('#stay-label')?.value.trim() || stayDraft.label || 'My stay',
  });
  const id = stayCity;
  persist();
  closeModal();
  if (location.hash.startsWith('#/trip')) renderTrip();
  else if (map) {
    renderMapPins(false);
    toast('Stay saved. Open the city guide for nearby recommendations.');
  } else {
    const tab = activeCityId === id && FOOD_FILTERS.includes(cityFilter) ? 'food' : 'places';
    if (tab === 'places') cityFilter = 'see';
    activeCityId = id;
    placeSort = 'nearby';
    history.replaceState(null, '', '#/city/' + id + '?tab=' + tab);
    renderCity(id, tab);
  }
  toast('Your stay is saved. Nearby choices and local route origins are ready.');
}
function stayUseLocation() {
  if (!navigator.geolocation) {
    toast('Location is unavailable. Pin the map instead.');
    return;
  }
  const id = stayCity;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (stayMap && stayCity === id)
        selectStayPoint({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          address: 'Current device location',
        });
    },
    () => toast('Location unavailable. Search or pin the map instead.'),
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
  );
}
function closeStayMap() {
  staySearchSequence++;
  staySearchAbort?.abort();
  staySearchAbort = null;
  if (stayMap) {
    stayMap.remove();
    stayMap = null;
  }
  stayMarker = null;
}

function changeCityFilter(id) {
  cityFilter = id;
  experienceFilter = 'all';
  foodHalal = 'all';
  foodVeg = 'all';
  const cid = location.hash.split('/')[2]?.split('?')[0];
  if (validCity(cid)) {
    const tab = FOOD_FILTERS.includes(id) ? 'food' : id === 'shop' ? 'shop' : 'places';
    history.replaceState(null, '', '#/city/' + cid + '?tab=' + tab);
    renderCity(cid, tab);
    $('.citytabs')?.scrollIntoView({ block: 'start' });
  }
}
function switchPlaceVisual(id, useArt) {
  if (!validPlace(id) || !$('#place-visual-main')) return;
  galleryGo(galleryScope($('#place-visual-main')), 0);
  $('#place-visual-main').innerHTML =
    `${useArt ? artTag(id, '', false) : photoTag(id, '', false)}<div class="photo-caption">${useArt ? artCaption(id) : photoCredit(id) + (PHOTO[id]?.context ? '<br>' + esc(photoContext(id)) : '')}</div>`;
  const t0 = $('.gthumb[data-i="0"] img'),
    src = useArt ? ART[id]?.data : PHOTO[id]?.data;
  if (t0 && src) t0.src = src;
  $$('.visual-toggle button').forEach((x) =>
    x.classList.toggle('active', x.dataset.action === (useArt ? 'place-art' : 'place-photo')),
  );
}
