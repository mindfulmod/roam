function saved(id) {
  return S.saved.includes(id);
}
function inTrip(id) {
  return S.trip.includes(id);
}
function saveButton(id) {
  return `<button class="iconbtn ${saved(id) ? 'saved' : ''}" data-action="save" data-id="${id}" aria-label="${saved(id) ? 'Unsave' : 'Save'} ${esc(P[id]?.name || 'place')}" title="${saved(id) ? 'Saved' : 'Save place'}">${icon('heart')}</button>`;
}
function saveButtonWide(id) {
  return `<button class="btn light savewide ${saved(id) ? 'saved' : ''}" data-action="save" data-id="${id}" aria-pressed="${saved(id)}">${icon('heart')} ${saved(id) ? 'Saved' : 'Save'}</button>`;
}
// The one way to put a city in the trip. Wide buttons name the city ("Add Kyoto to trip");
// `short` is for rows that already show the name beside the button.
function tripLabel(id, short) {
  return inTrip(id)
    ? short
      ? 'In trip'
      : `${esc(C[id].name)} is in your trip`
    : short
      ? 'Add to trip'
      : `Add ${esc(C[id].name)} to trip`;
}
function cityAdd(id, small = false, short = false) {
  return `<button class="${small ? 'iconbtn addcity' : 'btn light small tripadd'} ${inTrip(id) ? 'saved' : ''}" data-action="trip-toggle" data-id="${id}" ${short ? 'data-short="1"' : ''} aria-label="${inTrip(id) ? 'Remove' : 'Add'} ${esc(C[id].name)} ${inTrip(id) ? 'from' : 'to'} trip">${icon(inTrip(id) ? 'check' : 'plus')}${small ? '' : tripLabel(id, short)}</button>`;
}
function mapsPin(p) {
  return (
    'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent(`${p.name}, ${p.cityName || p.name}, ${C[p.cityId]?.country || p.country}`)
  );
}
function mapsCoordinate(p) {
  return (
    'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${p.lat},${p.lon}`)
  );
}
function mapsDirections(points, mode) {
  if (!points.length) return '#';
  const q = new URLSearchParams({
    api: '1',
    destination: `${points.at(-1).lat},${points.at(-1).lon}`,
    travelmode: mode || 'walking',
  });
  if (points.length > 1) q.set('origin', `${points[0].lat},${points[0].lon}`);
  if (points.length > 2)
    q.set(
      'waypoints',
      points
        .slice(1, -1)
        .map((p) => `${p.lat},${p.lon}`)
        .join('|'),
    );
  return 'https://www.google.com/maps/dir/?' + q;
}
function external(url, text, cls = '') {
  return `<a ${cls ? `class="${cls}"` : ''} href="${esc(url)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
}
function rating(p) {
  return p.michelin
    ? '<span class="muted">MICHELIN Guide</span>'
    : '<span class="muted">Curated pick</span>';
}
// One short message above the tab bar. `action` adds a single button (Undo, or the next step).
function toast(t, action, ms = 3500) {
  $('.toast')?.remove();
  const x = document.createElement('div');
  x.className = 'toast';
  x.setAttribute('role', 'status');
  const span = document.createElement('span');
  span.textContent = t;
  x.appendChild(span);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action.label;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      x.remove();
      action.run();
    });
    x.appendChild(b);
    x.classList.add('has-action');
  }
  document.body.appendChild(x);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => x.remove(), action ? Math.max(ms, 5000) : ms);
}
// The five most popular sights of a city, for "Save the top 5".
function topFive(cid) {
  return C[cid].items
    .map((x) => P[x.id])
    .filter((p) => p.kind === 'see')
    .sort((a, b) => (popularityRank(a) ?? 999) - (popularityRank(b) ?? 999))
    .slice(0, 5);
}
function savedCount() {
  return S.saved.length + S.shops.length;
}
function shopSave(id) {
  const on = S.shops.includes(id);
  return `<button class="iconbtn shopheart ${on ? 'saved' : ''}" data-action="save-shop" data-id="${id}" aria-label="${on ? 'Unsave' : 'Save'} ${esc(SHOPS[id].name)}" title="${on ? 'Saved' : 'Save shop'}">${icon('heart')}</button>`;
}
function toggleShop(id, quiet = false) {
  if (!Object.hasOwn(SHOPS, id)) return;
  const had = S.shops.includes(id),
    cid = SHOPS[id].cityId;
  S.shops = had ? S.shops.filter((x) => x !== id) : [...S.shops, id];
  persist();
  $$(`[data-action="save-shop"][data-id="${id}"]`).forEach((b) => {
    b.classList.toggle('saved', !had);
    b.classList.toggle('pop', !had);
    b.setAttribute('aria-label', (had ? 'Save ' : 'Unsave ') + SHOPS[id].name);
  });
  if (!quiet) {
    if (had) toast('Removed from Saved.', { label: 'Undo', run: () => toggleShop(id, true) });
    else {
      navigator.vibrate?.(10);
      if (inTrip(cid)) toast('Saved.', { label: 'Undo', run: () => toggleShop(id, true) });
      else
        toast(`Saved. Add ${C[cid].name} to your trip?`, {
          label: `Add ${C[cid].name}`,
          run: () => toggleTrip(cid),
        });
    }
  }
  if (location.hash.startsWith('#/saved')) renderSaved();
}
function savedIn(cid) {
  return S.saved.map((id) => P[id]).filter((p) => p && p.cityId === cid);
}
// Phones: a small "cart" above the tab bar once something is saved, so the trip is one tap away.
function updateMiniCart() {
  const el = $('#minicart');
  if (!el) return;
  const page = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  const hidden = (!S.trip.length && !savedCount()) || ['trip', 'map', 'story', 't'].includes(page);
  document.body.classList.toggle('has-minicart', !hidden);
  el.hidden = hidden;
  if (hidden) return;
  if (S.trip.length) {
    const first = C[S.trip[0]].name,
      places = S.saved.filter((id) => S.trip.includes(P[id]?.cityId)).length,
      cost = tripCost();
    el.href = '#/trip';
    el.innerHTML = `<span class="mc-text"><strong>${esc(first)}${S.trip.length > 1 ? ` +${S.trip.length - 1}` : ''}</strong><small>${places} place${places === 1 ? '' : 's'} · about ${cash(cost.est)}</small></span><span class="mc-go">View trip ${icon('arrow')}</span>`;
  } else {
    el.href = '#/saved';
    el.innerHTML = `<span class="mc-text"><strong>${savedCount()} saved</strong><small>No city in your trip yet</small></span><span class="mc-go">Add to trip ${icon('arrow')}</span>`;
  }
}
function updateCounts() {
  $$('.saved-count').forEach((e) => {
    e.textContent = savedCount();
    e.toggleAttribute('data-zero', !savedCount());
  });
  $$('.trip-count').forEach((e) => {
    e.textContent = S.trip.length;
    e.toggleAttribute('data-zero', !S.trip.length);
  });
  socHeader();
  updateMiniCart();
}
function headerActive(page) {
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === page));
  updateCounts();
  placeNavPill();
}
// One highlight slides between tabs instead of each tab switching its own background on and
// off. On phones it sits behind the active icon; on wider screens behind the whole link.
function placeNavPill(jump = false) {
  const pill = $('.nav-pill'),
    nav = pill?.parentElement,
    a = nav?.querySelector('a.active');
  if (!pill) return;
  if (!a) return pill.classList.remove('on');
  // The icon may be mid-pop (scaled about its centre), so take its centre from the screen and
  // its size from the stylesheet.
  const target = (isMobile() && a.querySelector('.icon')) || a,
    cs = getComputedStyle(target),
    w = target === a ? a.offsetWidth : parseFloat(cs.width) + parseFloat(cs.paddingLeft) * 2,
    h = target === a ? a.offsetHeight : parseFloat(cs.height) + parseFloat(cs.paddingTop) * 2,
    box = target.getBoundingClientRect(),
    n = nav.getBoundingClientRect(),
    r = {
      left: box.left + box.width / 2 - w / 2,
      top: box.top + box.height / 2 - h / 2,
      width: w,
      height: h,
    };
  // The first placement (and one after a resize) jumps into position; later ones slide.
  // During a tab slide the page transition moves the pill, so it jumps here too.
  pill.classList.toggle(
    'jump',
    jump || !pill.classList.contains('on') || 'slide' in document.documentElement.dataset,
  );
  pill.style.transform = `translate(${r.left - n.left - nav.clientLeft}px, ${r.top - n.top - nav.clientTop}px)`;
  pill.style.width = r.width + 'px';
  pill.style.height = r.height + 'px';
  pill.classList.add('on');
}
addEventListener('resize', () => placeNavPill(true));
function footer() {
  return `<footer class="footer"><div>Tandem Roads · Made for the journey.<br>Research retrieved ${CHECKED}. Fees and availability can change.</div><div><a href="#/guide">About & sources</a> · <button class="inline-link" data-action="export">Export your trip</button><br>Guide, photos and pins work offline. Street tiles and external links need internet.</div></footer>`;
}
