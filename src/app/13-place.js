// Tiers in words, from where a place sits among its peers in the same city.
function tier(p) {
  const n = popularityRank(p),
    of = poolStats(p).ranked;
  if (!n) return { key: 'pick', label: p.michelin ? 'MICHELIN pick' : 'Editor’s pick' };
  return n <= Math.ceil(of / 3)
    ? { key: 'must', label: p.kind === 'see' ? 'Must see' : 'Must try' }
    : n <= Math.ceil((2 * of) / 3)
      ? { key: 'worth', label: 'Worth it' }
      : { key: 'maybe', label: 'If you have time' };
}
// Which parts of the day a "best time" note points at, or null when it is not about a time.
function dayparts(t = '') {
  const x = t.toLowerCase(),
    on = [false, false, false, false];
  if (/^outside|avoid/.test(x)) return null;
  if (/full day|all day|any ?time/.test(x)) return [true, true, true, true];
  if (/morning|opening|first entry|early in the day|sunrise|dawn|beat the queue/.test(x))
    on[0] = true;
  if (/late morning|midday|noon|lunch/.test(x)) on[1] = true;
  if (/afternoon/.test(x)) on[2] = true;
  if (/daytime/.test(x)) on[0] = on[1] = on[2] = true;
  if (/evening|dinner|sunset|night|dusk/.test(x)) on[3] = true;
  return on.some(Boolean) ? on : null;
}
function placeGlance(p) {
  const parts = dayparts(p.bestTime),
    score = popularityScore(p),
    crowd = score === null ? 0 : score >= 0.75 ? 4 : score >= 0.5 ? 3 : score >= 0.25 ? 2 : 1,
    hours = p.duration > 16 ? 'Multi-day' : `${p.duration} hour${p.duration === 1 ? '' : 's'}`;
  return `<div class="glance"><div class="g-tile g-wide"><label>Best time</label>${parts ? `<div class="dayparts" role="img" aria-label="${esc(p.bestTime)}">${['Morning', 'Midday', 'Afternoon', 'Evening'].map((l, i) => `<span class="${parts[i] ? 'on' : ''}">${l}</span>`).join('')}</div>` : ''}<small>${esc(p.bestTime)}</small></div>${crowd ? `<div class="g-tile"><label>Crowds</label><div class="meter" role="img" aria-label="${['', 'Lighter', 'Moderate', 'Busy', 'Very busy'][crowd]}">${[1, 2, 3, 4].map((i) => `<i class="${i <= crowd ? 'on' : ''}"></i>`).join('')}</div><strong>${['', 'Lighter', 'Moderate', 'Busy', 'Very busy'][crowd]}</strong></div>` : ''}<div class="g-tile"><label>Time needed</label><div class="g-bar"><i style="width:${Math.min(100, Math.round((p.duration / 8) * 100))}%"></i></div><strong>${hours}</strong></div><div class="g-tile"><label>Cost</label><strong class="g-cost">${priceLabel(p)}</strong></div><div class="g-tile"><label>Booking</label><strong class="g-book">${esc(p.reservation)}</strong></div></div>`;
}
// "Why it ranks here": one verdict line, then one chip per source. The whole chip is the link.
function rankChips(p) {
  const sigs = placeSignals(p),
    c = C[p.cityId],
    t = tier(p),
    cat = rankCategory(p).replace('listed ', '');
  if (!sigs.length)
    return `<p class="verdict"><b class="tierword t-pick">${t.label}</b> No popularity figure to compare yet. It is here on the strength of the linked sources.</p>${michelinRow(p)}`;
  const line =
    t.key === 'must'
      ? `Among the most popular ${cat} in ${esc(c.name)}.`
      : t.key === 'worth'
        ? `Well liked, in the middle of ${esc(c.name)}’s ${cat}.`
        : `Less visited than most ${cat} in ${esc(c.name)}.`;
  return `<p class="verdict"><b class="tierword t-${t.key}">${t.label}</b> ${line}</p><div class="srcchips">${sigs
    .map((x) => {
      const inner = `<b class="src-logo src-${x.key}" aria-hidden="true">${x.label[0]}</b><span><strong>${esc(x.display(p))}</strong><small>${esc(x.short.replace(/ (reviews|readers)$/, ''))} · #${x.place} of ${x.of}</small></span>`;
      return x.url(p)
        ? `<a class="srcchip" href="${esc(x.url(p))}" target="_blank" rel="noopener noreferrer">${inner}${icon('external')}</a>`
        : `<span class="srcchip">${inner}</span>`;
    })
    .join('')}</div>${michelinRow(p)}`;
}
let placeList = [],
  placeMap = null;
function setPlaceList(el, id) {
  if (el.closest('.modal')) {
    if (!placeList.includes(id)) placeList = [];
    return;
  }
  const box = el.closest('.savedpage, .placegrid, .ranking-list, .rc-places');
  placeList = box
    ? [
        ...new Set(
          [...box.querySelectorAll('[data-action="place"][data-id]')].map((x) => x.dataset.id),
        ),
      ]
    : [];
}
function placeStep(dir) {
  const id = $('.modal [data-place]')?.dataset.place,
    next = placeList[placeList.indexOf(id) + dir];
  if (placeList.includes(id) && next) openPlace(next);
}
function openPlace(id) {
  if (!validPlace(id)) return;
  if (!withCities([P[id].cityId], () => openPlace(id))) return;
  const p = P[id],
    c = C[p.cityId],
    stay = S.stays[c.id],
    at = placeList.indexOf(id),
    wasFull = $('.modal [data-place]') && !$('.modal.peek'),
    art = leadsWithArt(id);
  const bullets = (x) => (Array.isArray(x) ? x : x ? [x] : []);
  showModal(
    `<div data-gscope data-place="${id}"><div class="modalphoto gallery" id="place-visual">${galleryHero(id, `${visualTag(id, '', false)}<div class="photo-caption">${art ? artCaption(id) : photoCredit(id)}${!art && PHOTO[id]?.context ? '<br>' + esc(photoContext(id)) : ''}</div>`, 'Photos of ' + p.name)}</div></div><div class="modalcontent placesheet">${ART[id] ? `<div class="visual-toggle"><button class="${art ? '' : 'active'}" data-action="place-photo" data-id="${id}">Photo${PHOTO[id]?.context ? ' · representative' : ''}</button><button class="${art ? 'active' : ''}" data-action="place-art" data-id="${id}">Illustration</button></div>` : ''}<div class="place-top"><div class="actions"><a class="pill" href="#/city/${c.id}">${esc(c.name)}</a><span class="pill tierpill t-${tier(p).key}">${tier(p).label}</span>${michelinPill(p)}</div>${at >= 0 && placeList.length > 1 ? `<div class="place-nav"><button class="iconbtn" data-action="place-step" data-dir="-1" aria-label="Previous place" ${at === 0 ? 'disabled' : ''}>${icon('left')}</button><span>${at + 1} of ${placeList.length}</span><button class="iconbtn" data-action="place-step" data-dir="1" aria-label="Next place" ${at === placeList.length - 1 ? 'disabled' : ''}>${icon('arrow')}</button></div>` : ''}</div><h2 id="modal-heading">${esc(p.name)}</h2><p class="lead">${esc(p.summary)}</p>${placeGlance(p)}<p class="keytip">${icon('info')}<span>${esc(p.tip)}</span></p>${p.mustOrder?.length ? `<p class="keytip">${icon('food')}<span><strong>Try:</strong> ${p.mustOrder.map((x) => esc(x)).join(' · ')}</span></p>` : ''}${S.street && navigator.onLine ? `<div class="minimap" data-action="map-place" data-id="${id}" role="button" tabindex="0" aria-label="Show ${esc(p.name)} on the map"><div id="place-minimap"></div><span>${icon('map')} ${esc(p.area)}</span></div>` : ''}<section class="rank-reason"><div class="rr-head"><h3>Why it ranks here</h3><button class="inline-link" data-action="ranking-method">How ranks work</button></div>${rankChips(p)}</section>${stay ? `<div class="stay-to-place"><strong>${distanceText(hav(stay, p))} from ${esc(stay.label)}</strong><div class="actions">${p.excursion || hav(c, p) > 40 ? external(p.sourceUrls?.[0] || mapsPin(p), icon('external') + ' Check excursion access', 'btn light small') : external(mapsDirections([stay, p], 'walking'), icon('route') + ' Walk', 'btn light small') + external(mapsDirections([stay, p], 'transit'), icon('train') + ' Transit', 'btn light small')}</div></div>` : ''}<details class="readmore"><summary>Read more</summary><section class="why-go"><h3>Why go</h3><ul>${bullets(
      p.whyVisit || p.expect,
    )
      .map((x) => `<li>${esc(x)}</li>`)
      .join('')}</ul></section><section><h3>How a visit goes</h3><ol class="visit-flow">${bullets(
      p.visitFlow || p.expect,
    )
      .map((x) => `<li>${esc(x)}</li>`)
      .join(
        '',
      )}</ol></section><section><h3>Is it your kind of place?</h3><p><strong>Best for:</strong> ${esc(bullets(p.bestFor).join(' · ') || typesFor(p).join(', ') + ' enthusiasts')}</p><p><strong>Trade-offs:</strong> ${esc(bullets(p.tradeoffs).join(' ') || p.tip)}</p><p>${esc(p.expect)}</p><p class="price-note">${esc(p.priceNote)}</p></section>${p.cuisine ? `<p class="price-note">${esc(p.cuisine)} · Confirm the current menu and your dietary requirements.</p>` : ''}${dietaryDetail(p)}${p.reviewHighlights?.length ? `<section class="review-themes"><h3>What reviewers mention</h3><ul>${p.reviewHighlights.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><small>${esc(p.reviewHighlightsNote || '')}</small></section>` : ''}${p.annualVisits ? `<p><strong>Reported visits:</strong> ${num(p.annualVisits.count)} in ${p.annualVisits.year}. ${esc(p.annualVisits.note || '')} ${external(p.annualVisits.url, 'Official count ↗')}</p>` : ''}${stay ? '' : `<button class="btn light small" data-action="edit-stay" data-id="${c.id}">${icon('pin')} Add your stay to check distance</button>`}<div class="source-links">Sources: ${(p.sourceUrls || []).map((u) => external(u, esc(new URL(u).hostname) + ' ↗')).join(' ')}${p.review?.url ? ' · ' + external(p.review.url, 'See reviews on Tripadvisor ↗') : ''}<br>Map points are approximate. ${external(mapsCoordinate(p), 'Exact coordinate pin ↗')}</div></details><div class="field placenote"><label>Your note</label><textarea data-note="${id}" placeholder="Booked time, must-try dish or reminder…">${esc(S.notes[id] || '')}</textarea></div></div><div class="sheet-actions">${saveButtonWide(id)}<button class="btn ghost maponly" data-action="map-place" data-id="${id}" aria-label="Show on the map">${icon('map')}</button>${external(mapsPin(p), icon('pin') + ' Google Maps', 'btn gmaps')}</div>`,
    p.name,
  );
  const m = $('.modal');
  // Phones: the sheet opens at about half height and grows as soon as it is scrolled.
  if (isMobile() && !wasFull) {
    m.classList.add('peek');
    m.addEventListener('scroll', () => m.scrollTop > 2 && m.classList.remove('peek'), {
      passive: true,
    });
  }
  // Swipe sideways (outside the photos) for the next or previous place in the list.
  let x0 = null,
    y0 = 0;
  m.addEventListener(
    'touchstart',
    (e) => {
      x0 = e.target.closest('.gallery, .srcchips, .leaflet-container, textarea')
        ? null
        : e.touches[0].clientX;
      y0 = e.touches[0].clientY;
    },
    { passive: true },
  );
  m.addEventListener(
    'touchend',
    (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0,
        dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 70 && Math.abs(dx) > 2 * Math.abs(dy)) placeStep(dx < 0 ? 1 : -1);
    },
    { passive: true },
  );
  if ($('#place-minimap') && typeof L !== 'undefined') {
    placeMap = L.map('place-minimap', {
      zoomControl: false,
      attributionControl: true,
      dragging: false,
      touchZoom: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
    }).setView([p.lat, p.lon], 14);
    placeMap.attributionControl.setPrefix(false);
    let fails = 0;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    })
      .on('tileerror', () => ++fails === 3 && $('.minimap')?.classList.add('notiles'))
      .addTo(placeMap);
    L.marker([p.lat, p.lon], {
      icon: L.divIcon({
        className: 'trip-pin',
        html: '<b></b>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
      interactive: false,
      keyboard: false,
    }).addTo(placeMap);
    setTimeout(() => placeMap?.invalidateSize(), 320);
  }
}
function showRankingMethod() {
  showModal(
    `<div class="modalcontent"><span class="eyebrow">POPULARITY, WITH CONTEXT</span><h2>Every number has a meaning.</h2><section class="method-block"><h3>City tourism index</h3><p>Euromonitor’s 2025 Top 100 City Destinations Index combines tourism performance with infrastructure, policy, business, safety and sustainability. The rank is global within its 100-city study. It is not an ordering by visitor numbers.</p>${external(POP.indexSource || 'https://www.euromonitor.com/article/top-100-city-destinations-index-2025-driving-growth-and-innovation', 'Euromonitor methodology ↗')} · ${external(POP.indexTableSource || 'https://www.vacationstravel.com/top-100-city-destinations/', 'Published rank table ↗')}</section><section class="method-block"><h3>Most visited cities</h3><p>The separate arrivals view uses the public 2025 top 10 for international arrivals. These were year-end estimates published in December 2025. Repeat trips count; domestic visitors are excluded. Only the covered cities in that published table receive a rank. Unranked destinations are not “least popular”.</p>${external(POP.arrivalsSource || 'https://www.statista.com/chart/35880/top-cities-for-international-visitors-in-2025/', 'Published arrivals figures ↗')}</section><section class="method-block"><h3>Place popularity</h3><p>Sights are ranked by how many people read their Wikipedia page over the last 12 months, compared with the other sights covered in the same city. We do not store or rank on ratings or review counts from Tripadvisor, Google Maps or other review sites, because their terms do not allow it. Once travellers have accounts, saves and “want to go” taps from our own travellers will join the rank.</p><p>Open any place to see the figure and where it puts the place. Page views signal visibility, not measured footfall. Places with no figure, including food and shopping, are editorial picks: they stay unranked and follow our editors’ order.</p></section><section class="method-block"><h3>Why go?</h3><p>The appeal and visit-flow notes are editorial explanations grounded in the linked venue and destination sources. Costs are planning ranges. Original AI illustrations communicate the experience and are labelled; photographic sources remain available.</p></section><button class="btn" data-action="close-modal">Got it</button></div>`,
    'How popularity rankings work',
  );
}
