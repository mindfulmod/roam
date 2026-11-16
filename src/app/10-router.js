function route() {
  closeModal();
  storyLeave();
  socLeave();
  logLeave();
  if (tripMap) {
    tripMap.remove();
    tripMap = null;
  }
  if (chooseMap) {
    chooseMap.remove();
    chooseMap = null;
  }
  document.title = 'Tandem Roads — Your world, ready to explore';
  if (map) {
    map.remove();
    map = null;
    streetLayer = null;
    markerLayer = null;
    routeLayer = null;
  }
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?'),
    parts = path.split('/'),
    params = new URLSearchParams(query || '');
  window.scrollTo(0, 0);
  if (parts[0] === 'city') {
    const tab = params.get('tab') || 'places';
    if (tab === 'places' || tab === 'food') {
      cityFilter = tab === 'food' ? 'restaurants' : 'see';
      experienceFilter = 'all';
      foodHalal = 'all';
      foodVeg = 'all';
      placeQuery = '';
    }
    renderCity(parts[1], tab);
  } else if (parts[0] === 'map') renderMap(parts[1] || '');
  else if (parts[0] === 'trip') renderTrip();
  else if (parts[0] === 'saved') renderSaved();
  else if (parts[0] === 'guide') renderGuide();
  else if (parts[0] === 'budget') renderBudget();
  else if (parts[0] === 'choose') renderChoose(params);
  else if (parts[0] === 't' && parts[1]) renderShared(parts[1]);
  else if (parts[0] === 'story' && parts[2] === 'log') renderLog(parts[1] || '', parts[3] || '');
  else if (parts[0] === 'story') renderStory(parts[1] || '');
  else if (parts[0] === 'feed') renderFeed();
  else if (parts[0] === 'me') renderProfile(socMe());
  else if (parts[0] === 'people') renderProfile(parts[1] || '');
  else if (parts[0] === 'account') renderAccount();
  else renderExplore();
}
