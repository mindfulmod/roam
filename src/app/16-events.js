document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b || b.disabled) return;
  const a = b.dataset.action,
    id = b.dataset.id;
  if (a === 'ranking-method') showRankingMethod();
  else if (a === 'browse-scroll')
    $('#browse')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else if (a === 'browse-sort') {
    browseSort = id;
    $$('[data-action="browse-sort"]').forEach((x) =>
      x.classList.toggle('active', x.dataset.id === id),
    );
    renderBrowse();
  } else if (a === 'place-view') {
    placeView = id;
    $$('[data-action="place-view"]').forEach((x) =>
      x.classList.toggle('active', x.dataset.id === id),
    );
    refreshCityResults();
  } else if (a === 'clear-place-filters') {
    experienceFilter = 'all';
    foodHalal = 'all';
    foodVeg = 'all';
    placeSort = 'popularity';
    placeQuery = '';
    const inSheet = Boolean(b.closest('.modal'));
    if (inSheet) {
      refreshCityResults();
      openFilters();
    } else
      renderCity(
        activeCityId,
        FOOD_FILTERS.includes(cityFilter) ? 'food' : cityFilter === 'shop' ? 'shop' : 'places',
      );
  } else if (a === 'city-tab') {
    if (b.dataset.tab === 'places') cityFilter = 'see';
    if (b.dataset.tab === 'food') cityFilter = 'restaurants';
    if (b.dataset.tab === 'shop') cityFilter = 'shop';
    experienceFilter = 'all';
    foodHalal = 'all';
    foodVeg = 'all';
    placeQuery = '';
  } else if (a === 'edit-stay') openStay(id);
  else if (a === 'stay-search') searchStay();
  else if (a === 'stay-result') {
    const p = staySearchResults[Number(id)];
    if (p) selectStayPoint(p);
  } else if (a === 'stay-coords') {
    const la = $('#stay-lat').value,
      lo = $('#stay-lon').value;
    if (!la.trim() || !lo.trim() || !validCoords(Number(la), Number(lo)))
      toast('Enter latitude between −90 and 90, and longitude between −180 and 180.');
    else selectStayPoint({ lat: Number(la), lon: Number(lo), address: 'Entered coordinates' });
  } else if (a === 'stay-location') stayUseLocation();
  else if (a === 'stay-save') saveStay();
  else if (a === 'stay-remove') {
    const cid = stayCity;
    delete S.stays[cid];
    persist();
    closeModal();
    if (location.hash.startsWith('#/trip')) renderTrip();
    else if (map) renderMapPins(false);
    else {
      if (placeSort === 'nearby') placeSort = 'popularity';
      renderCity(cid);
    }
    toast('Saved accommodation removed.');
  } else if (a === 'nearby-first') {
    placeSort = 'nearby';
    cityFilter = 'see';
    experienceFilter = 'all';
    foodHalal = 'all';
    foodVeg = 'all';
    renderCity(id);
    $('.citytabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (a === 'place-art') switchPlaceVisual(id, true);
  else if (a === 'place-photo') switchPlaceVisual(id, false);
  else if (a === 'gal-step') {
    const scope = galleryScope(b),
      t = scope.querySelector('[data-gtrack]');
    if (t) galleryGo(scope, galleryIndex(t) + Number(b.dataset.dir));
  } else if (a === 'gal-go') galleryGo(galleryScope(b), Number(b.dataset.i));
  else if (a === 'city-photos') openViewer(id, Number(b.dataset.i) || 0);
  else if (a === 'place-filters') openFilters();
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'place-search') {
    placeQuery = e.target.value;
    refreshCityResults();
  }
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'experience-filter') {
    experienceFilter = t.value;
    refreshCityResults();
  } else if (t.id === 'food-halal') {
    foodHalal = t.value;
    refreshCityResults();
  } else if (t.id === 'food-veg') {
    foodVeg = t.value;
    refreshCityResults();
  } else if (t.id === 'map-diet') {
    mapDiet = t.value;
    renderMapPins(true);
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'stay-query') {
    e.preventDefault();
    searchStay();
  }
});

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const a = b.dataset.action,
    id = b.dataset.id;
  if (b.disabled) return;
  if (a === 'save') {
    e.stopPropagation();
    toggleSave(id);
  } else if (a === 'trip-toggle') {
    e.stopPropagation();
    toggleTrip(id);
  } else if (a === 'city') {
    growFrom = b.querySelector('.cityimage img, .pk-photo img');
    location.hash = '#/city/' + id;
  } else if (a === 'place') {
    setPlaceList(b, id);
    openPlace(id);
  } else if (a === 'retry') route();
  else if (a === 'place-step') placeStep(Number(b.dataset.dir));
  else if (a === 'save-shop') {
    e.stopPropagation();
    toggleShop(id);
  } else if (a === 'close-modal') closeModal('user');
  else if (a === 'month') setMonth(Number(id));
  else if (a === 'region') {
    browseRegion = id;
    $$('#region-chips .chip').forEach((x) => x.classList.toggle('active', x.dataset.id === id));
    renderBrowse();
  } else if (a === 'city-tab') {
    const target = '#/city/' + id + '?tab=' + b.dataset.tab;
    if (location.hash === target) renderCity(id, b.dataset.tab);
    else location.hash = target;
  } else if (a === 'city-filter') changeCityFilter(id);
  else if (a === 'shop-tier') setShopFilter('tier', id);
  else if (a === 'shop-style') setShopFilter('style', id);
  else if (a === 'template') applyTemplate(id);
  else if (a === 'trip-tab') {
    tripTab = id;
    rerenderTrip();
    if ($('.triptabs').getBoundingClientRect().top < 0 || b.classList.contains('tc-total'))
      $('.triptabs').scrollIntoView({ block: 'start' });
  } else if (a === 'save-top5') saveTopFive(id);
  else if (a === 'choose-cities') chooseCities();
  else if (a === 'finish-cities') {
    closeModal();
    location.hash = '#/trip';
    renderTrip();
  } else if (a === 'days') {
    S.days[id] = Math.max(1, Math.min(21, (S.days[id] || C[id].days) + Number(b.dataset.dir)));
    persist();
    const y = window.scrollY;
    renderTrip();
    window.scrollTo(0, y);
  } else if (a === 'move') {
    const i = S.trip.indexOf(id),
      j = i + Number(b.dataset.dir);
    if (j >= 0 && j < S.trip.length) {
      [S.trip[i], S.trip[j]] = [S.trip[j], S.trip[i]];
      persist();
      const y = window.scrollY;
      renderTrip();
      window.scrollTo(0, y);
    }
  } else if (a === 'optimize') optimizeRoute();
  else if (a === 'export') exportTrip();
  else if (a === 'csv') exportCSV();
  else if (a === 'import') importTrip();
  else if (a === 'import-merge') doImport(true);
  else if (a === 'import-replace') doImport(false);
  else if (a === 'print') window.print();
  else if (a === 'budget-detail') budgetDetail();
  else if (a === 'saved-to-trip') {
    for (const pid of S.saved) {
      const cid = P[pid].cityId;
      if (!inTrip(cid)) {
        S.trip.push(cid);
        S.days[cid] ??= C[cid].days;
      }
    }
    persist();
    location.hash = '#/trip';
  } else if (a === 'map-kind') {
    mapKind = id;
    $$('[data-action="map-kind"]').forEach((x) =>
      x.classList.toggle('active', x.dataset.id === id),
    );
    renderMapPins(true);
  } else if (a === 'map-city-open') setMapCity(id);
  else if (a === 'map-focus') {
    const p = P[id] || C[id];
    map.setView([p.lat, p.lon], P[id] ? Math.max(13, map.getZoom()) : 6);
    setMapSheet(false);
    if (isMobile()) showMapCard(id);
    else mapMarkers[id]?.openPopup();
  } else if (a === 'map-reset') {
    mapCity = '';
    mapKind = 'all';
    mapQuery = '';
    mapDiet = 'all';
    $('#map-diet').value = 'all';
    $('#map-city').value = '';
    $('#map-search').value = '';
    $$('[data-action="map-kind"]').forEach((x) =>
      x.classList.toggle('active', x.dataset.id === 'all'),
    );
    routeLayer.clearLayers();
    renderMapPins(true);
    history.replaceState(null, '', '#/map');
  } else if (a === 'map-list') setMapSheet(!$('#map-sheet').classList.contains('open'));
  else if (a === 'map-card-close') hideMapCard();
  else if (a === 'tiles') {
    S.street = !S.street;
    persist();
    if (S.street) enableStreet();
    else if (streetLayer) {
      map.removeLayer(streetLayer);
      streetLayer = null;
    }
    $('#tile-toggle').innerHTML =
      icon('map') + `<span class="lbl"> Street detail: ${S.street ? 'on' : 'off'}</span>`;
    $('#tile-toggle').classList.toggle('on', S.street);
    $('#tile-toggle').setAttribute('aria-label', 'Street detail ' + (S.street ? 'on' : 'off'));
    $('#map-note').textContent = S.street
      ? 'Online street detail. Lines show stop order, not turn-by-turn routes.'
      : 'Offline map: planning pins and country outlines. Enable street detail when online.';
  } else if (a === 'locate') mapLocate();
  else if (a === 'map-place') {
    const p = P[id];
    closeModal();
    const reveal = () => {
      if (!map) return;
      map.setView([p.lat, p.lon], 13, { animate: false });
      if (isMobile()) showMapCard(id);
      else mapMarkers[id]?.openPopup();
    };
    if (map) {
      setMapCity(p.cityId);
      reveal();
    } else {
      location.hash = '#/map/' + p.cityId;
      setTimeout(reveal, 150);
    }
  }
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'browse-search') renderSuggest(t.value);
  else if (t.id === 'map-search') {
    mapQuery = t.value;
    renderMapPins(false);
  } else if (t.id === 'choose-city-search')
    $('#choose-city-list').innerHTML = chooseCityList(t.value);
  else if (t.dataset.note) {
    S.notes[t.dataset.note] = t.value.slice(0, 4000);
    persist();
  }
});
document.addEventListener('change', (e) => {
  const t = e.target;
  let tripChange = false;
  if (t.id === 'browse-sort') {
    browseSort = t.value;
    renderBrowse();
  } else if (t.id === 'place-sort') {
    placeSort = t.value;
    refreshCityResults();
  } else if (t.id === 'map-city') {
    if (t.value) setMapCity(t.value);
    else {
      mapCity = '';
      history.replaceState(null, '', '#/map');
      renderMapPins(true);
    }
  } else if (t.id === 'trip-date') {
    S.startDate = t.value;
    tripChange = true;
  } else if (t.id === 'trip-pace') {
    S.pace = t.value;
    tripChange = true;
  } else if (t.id === 'trip-people') {
    S.people = Math.max(1, Math.min(20, Math.round(Number(t.value) || 1)));
    tripChange = true;
  } else if (t.dataset.lodging) {
    S.lodging[t.dataset.lodging] = Math.max(0, Math.min(1e8, Number(t.value) || 0));
    tripChange = true;
  } else if (t.dataset.extra) {
    S.extra[t.dataset.extra] = Math.max(0, Math.min(1e9, Number(t.value) || 0));
    tripChange = true;
  } else if (t.dataset.visited) {
    S.visited = t.checked
      ? [...new Set([...S.visited, t.dataset.visited])]
      : S.visited.filter((x) => x !== t.dataset.visited);
    persist();
  } else if (t.dataset.checklist) {
    S.checklist = t.checked
      ? [...new Set([...S.checklist, t.dataset.checklist])]
      : S.checklist.filter((x) => x !== t.dataset.checklist);
    persist();
  } else if (t.id === 'source-city' || t.id === 'source-type') renderSources();
  if (tripChange) {
    persist();
    const y = window.scrollY;
    renderTrip();
    window.scrollTo(0, y);
  }
});
$('#import-file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    if (f.size > 5e6)
      throw Error('This backup is too large. Choose a Tandem Roads trip JSON under 5 MB.');
    importPreview(JSON.parse(await f.text()));
  } catch (err) {
    toast(err.message || 'Could not read this backup.');
  }
  e.target.value = '';
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('.modal-backdrop')) closeModal('user');
  if (
    (e.key === 'Enter' || e.key === ' ') &&
    e.target.matches('[role="button"][data-action],[role="link"][data-action]')
  ) {
    e.preventDefault();
    e.target.click();
  }
  if (e.key === 'Tab' && $('.modal-backdrop')) {
    const focusables = $$(
      '.modal button:not(:disabled),.modal a[href],.modal input,.modal select,.modal textarea,.modal [tabindex="0"]',
    );
    const first = focusables[0],
      last = focusables.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }
});
// Opening a city from a card: the card's photo grows into the page's cover (where the
// browser supports it and the person has not asked for reduced motion).
let growFrom = null;
window.addEventListener('hashchange', () => {
  const img = growFrom;
  growFrom = null;
  if (
    !img?.isConnected ||
    !document.startViewTransition ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  )
    return route();
  img.style.viewTransitionName = 'cover';
  document.startViewTransition(() => {
    img.style.viewTransitionName = '';
    route();
    const hero = $('.cityhero img');
    if (hero) hero.style.viewTransitionName = 'cover';
  });
});
window.addEventListener('online', () => {
  if (map && S.street) enableStreet();
});
window.addEventListener('offline', () => {
  toast('You are offline. Your guide, photos and pins still work.');
  if (map && $('#map-note'))
    $('#map-note').textContent =
      'Offline: your guide, photos and pins remain available. Street tiles need a connection.';
});
applyTheme();
route();
if (!storageOK)
  setTimeout(() => toast('Browser storage is unavailable. Use Export to keep your trip.'), 500);
