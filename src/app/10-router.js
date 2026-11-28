let routePath = '',
  prevRoutePath = null;
// Where the city tabs sit in the page when not stuck (their sticky offset taken off), and the
// current scroll. Used to keep your place when the tab changes.
function cityTabsSpot() {
  const t = $('.citytabs'),
    before = t?.previousElementSibling;
  if (!t || !before) return null;
  const css = getComputedStyle(t),
    stick = (parseFloat(css.top) || 0) - (parseFloat(css.marginTop) || 0);
  return { y: window.scrollY, top: before.getBoundingClientRect().bottom + window.scrollY - stick };
}
// Each page remembers how far down you were and where its sideways rows were scrolled.
// Coming back by a tab puts you where you left off; tapping the tab you are on goes to the top.
const scrollMemo = {};
let tabJump = false;
document.addEventListener(
  'click',
  (e) => {
    const a = e.target.closest?.('.nav a[data-nav]');
    if (!a) return;
    const here = location.hash.replace(/^#\/?/, ''),
      there = a.getAttribute('href').replace(/^#\/?/, '');
    if (here === there) {
      e.preventDefault();
      const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'instant' });
    } else tabJump = true;
  },
  true,
);
function rememberScroll() {
  if (!$('#app')?.children.length) return;
  scrollMemo[routePath] = { y: window.scrollY, rows: $$('#app .hrow').map((r) => r.scrollLeft) };
}
function restoreScroll(path, jump) {
  const m = scrollMemo[path];
  if (!m) return;
  $$('#app .hrow').forEach((r, i) => m.rows[i] && (r.scrollLeft = m.rows[i]));
  if (jump) window.scrollTo({ top: m.y, behavior: 'instant' });
}
function route() {
  const jump = tabJump;
  tabJump = false;
  rememberScroll();
  closeModal();
  storyLeave();
  socLeave();
  logLeave();
  tripLogLeave();
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
    labelLayer = null;
    markerLayer = null;
    routeLayer = null;
  }
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?'),
    parts = path.split('/'),
    params = new URLSearchParams(query || '');
  // Switching Sights, Food or Shopping on the same city keeps your place: the page stays where
  // it was, or, if you had scrolled into the list, the new list starts just under the tabs.
  const keep = parts[0] === 'city' && routePath === path ? cityTabsSpot() : null,
    // Going back to the page you just came from (Back, or its own back link) also keeps your place.
    back = path !== routePath && path === prevRoutePath;
  if (path !== routePath) prevRoutePath = routePath;
  routePath = path;
  if (!keep) window.scrollTo(0, 0);
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
    if (keep) {
      const now = cityTabsSpot();
      window.scrollTo({ top: now && keep.y > keep.top ? now.top : keep.y, behavior: 'instant' });
    }
  } else if (parts[0] === 'map') renderMap(parts[1] || '');
  else if (parts[0] === 'trip') renderTrip();
  else if (parts[0] === 'saved') renderSaved();
  else if (parts[0] === 'guide') renderGuide();
  else if (parts[0] === 'budget') renderBudget();
  else if (parts[0] === 'choose') renderChoose(params);
  else if (parts[0] === 't' && parts[1]) renderShared(parts[1]);
  else if (parts[0] === 'log') renderTripLog(parts[1] || '');
  else if (parts[0] === 'story' && parts[1] === TL_STORY) renderMyStory();
  else if (parts[0] === 'story' && parts[2] === 'log') renderLog(parts[1] || '', parts[3] || '');
  else if (parts[0] === 'story') renderStory(parts[1] || '');
  else if (parts[0] === 'feed') renderFeed();
  else if (parts[0] === 'me') renderProfile(socMe());
  else if (parts[0] === 'people') renderProfile(parts[1] || '');
  else if (parts[0] === 'account') renderAccount();
  else if (parts[0] === 'signin') renderSignIn(params);
  else if (parts[0] === 'join') renderJoin(parts[1] || '');
  else renderExplore();
  if (!keep) restoreScroll(path, jump || back);
}
