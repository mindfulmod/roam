function toggleSave(id, quiet = false) {
  if (!validPlace(id)) return;
  const had = saved(id);
  S.saved = had ? S.saved.filter((x) => x !== id) : [...S.saved, id];
  persist();
  $$(`[data-action="save"][data-id="${id}"]`).forEach((b) => {
    b.classList.toggle('saved', !had);
    b.classList.toggle('pop', !had);
    b.innerHTML =
      icon('heart') + (b.classList.contains('savewide') ? (had ? ' Save' : ' Saved') : '');
    b.setAttribute('aria-label', (had ? 'Save ' : 'Unsave ') + P[id].name);
    if (b.hasAttribute('aria-pressed')) b.setAttribute('aria-pressed', String(!had));
    b.title = had ? 'Save place' : 'Saved';
  });
  if (!quiet) {
    const cid = P[id].cityId;
    if (had) toast('Removed from Saved.', { label: 'Undo', run: () => toggleSave(id, true) });
    else {
      navigator.vibrate?.(10);
      if (inTrip(cid)) toast('Saved.', { label: 'Undo', run: () => toggleSave(id, true) });
      else
        toast(`Saved. Add ${C[cid].name} to your trip?`, {
          label: `Add ${C[cid].name}`,
          run: () => toggleTrip(cid),
        });
    }
  }
  if (location.hash.startsWith('#/saved')) renderSaved();
  else if (location.hash.startsWith('#/trip')) rerenderTrip();
  else if (location.hash.startsWith('#/city') && cityFilter === 'saved') refreshCityResults();
  if (map) {
    if (mapKind === 'saved') renderMapPins(false);
    else
      mapMarkers[id]
        ?.getElement()
        ?.querySelector('.map-pin')
        ?.classList.toggle('selected', saved(id));
  }
}
function saveTopFive(cid) {
  const add = topFive(cid).filter((p) => !saved(p.id));
  if (!add.length) return;
  S.saved = [...S.saved, ...add.map((p) => p.id)];
  persist();
  add.forEach((p) =>
    $$(`[data-action="save"][data-id="${p.id}"]`).forEach((b) => b.classList.add('saved')),
  );
  if (location.hash.startsWith('#/saved')) renderSaved();
  else if (location.hash.startsWith('#/trip')) rerenderTrip();
  else if ($('.topfive')) $('.topfive').outerHTML = cityTopFive(C[cid]);
  toast(`Saved ${add.length} place${add.length === 1 ? '' : 's'} in ${C[cid].name}.`, {
    label: 'Undo',
    run: () => {
      S.saved = S.saved.filter((x) => !add.some((p) => p.id === x));
      persist();
      route();
    },
  });
}
function toggleTrip(id, quiet = false) {
  if (!validCity(id)) return;
  const had = inTrip(id),
    at = S.trip.indexOf(id);
  S.trip = had ? S.trip.filter((x) => x !== id) : [...S.trip, id];
  if (!S.days[id]) S.days[id] = C[id].days;
  persist();
  $$(`[data-action="trip-toggle"][data-id="${id}"]`).forEach((b) => {
    if (b.closest('.reorder')) return;
    const sm = b.classList.contains('addcity');
    b.classList.toggle('saved', !had);
    b.innerHTML = icon(had ? 'plus' : 'check') + (sm ? '' : tripLabel(id, b.dataset.short));
    b.setAttribute(
      'aria-label',
      `${had ? 'Add' : 'Remove'} ${C[id].name} ${had ? 'to' : 'from'} trip`,
    );
  });
  if (location.hash.startsWith('#/trip')) rerenderTrip();
  else if (location.hash.startsWith('#/saved')) renderSaved();
  if (quiet) return;
  if (had)
    toast(`${C[id].name} removed from your trip.`, {
      label: 'Undo',
      run: () => {
        if (inTrip(id)) return;
        S.trip.splice(Math.min(at, S.trip.length), 0, id);
        persist();
        route();
      },
    });
  else if (topFive(id).some((p) => !saved(p.id)))
    toast(`${C[id].name} added to your trip.`, {
      label: 'Save the top 5',
      run: () => saveTopFive(id),
    });
  else toast(`${C[id].name} added to your trip.`);
}
function hav(a, b) {
  const r = Math.PI / 180,
    dl = (b.lat - a.lat) * r,
    dn = (b.lon - a.lon) * r;
  const x =
    Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)));
}
function routeDist(ids) {
  return ids.slice(1).reduce((s, id, i) => s + hav(C[ids[i]], C[id]), 0);
}
function optimizeRoute() {
  if (S.trip.length < 3) {
    toast('Add at least three destinations to compare the order.');
    return;
  }
  const original = [...S.trip],
    left = S.trip.slice(1),
    out = [S.trip[0]];
  while (left.length) {
    left.sort((a, b) => hav(C[out.at(-1)], C[a]) - hav(C[out.at(-1)], C[b]));
    out.push(left.shift());
  }
  let changed = true,
    rounds = 0;
  while (changed && rounds++ < 20) {
    changed = false;
    for (let i = 1; i < out.length - 1; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const cand = [...out.slice(0, i), ...out.slice(i, j + 1).reverse(), ...out.slice(j + 1)];
        if (routeDist(cand) < routeDist(out) - 0.1) {
          out.splice(0, out.length, ...cand);
          changed = true;
        }
      }
    }
  }
  if (routeDist(out) > routeDist(original)) S.trip = original;
  else S.trip = out;
  persist();
  renderTrip();
  toast('Suggested order updated. First city kept fixed; check actual transport links.');
}
function leg(a, b) {
  const known =
    a.connections?.find((x) => x.to === b.id) || b.connections?.find((x) => x.to === a.id);
  const d = hav(a, b);
  if (known)
    return { mode: known.mode, minutes: known.minutes, note: known.note, known: true, distance: d };
  return {
    mode:
      d > 850 || a.region !== b.region
        ? 'Check flights / connections'
        : 'Check rail, road or ferry',
    minutes: null,
    note: 'No verified direct transport link is stored for this pair. Geographic proximity alone does not establish a usable route.',
    known: false,
    distance: d,
  };
}
function durationLabel(m) {
  if (!m || !Number.isFinite(Number(m))) return '';
  return m >= 60
    ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + Math.round(m % 60) + ' min' : ''}`
    : `${Math.round(m)} min`;
}
function transferDays() {
  return Math.max(0, S.trip.length - 1);
}
function totalDays() {
  return S.trip.reduce((s, id) => s + (S.days[id] || C[id].days), 0);
}
function tripBudgets() {
  const out = {};
  for (const id of S.trip) {
    const c = C[id],
      d = S.days[id] || c.days,
      extra = Number(S.extra[id]) || 0,
      hotel = (Number(S.lodging[id]) || 0) * d,
      k = c.currency;
    out[k] ??= [0, 0];
    out[k][0] += (c.dailyBudget[0] * d + extra + hotel) * S.people;
    out[k][1] += (c.dailyBudget[1] * d + extra + hotel) * S.people;
  }
  return out;
}
function timeRank(p) {
  const t = (p.bestTime || '').toLowerCase();
  if (/before departure|buy.*before|prepare|supplies/.test(t)) return -1;
  if (/breakfast|sunrise|dawn|early morning|opening|early start/.test(t)) return 0;
  if (/morning/.test(t)) return 1;
  if (/lunch|midday/.test(t)) return 2;
  if (/sunset|late afternoon/.test(t)) return 4;
  if (/evening|night|dusk/.test(t)) return 5;
  if (/afternoon/.test(t)) return 3;
  return 2;
}
function plannedHours(items) {
  return (
    items.reduce((n, p) => n + p.duration, 0) +
    items.slice(1).reduce((n, p, i) => {
      const d = hav(items[i], p);
      return n + Math.max(0.2, d < 2 ? d / 4 : 0.35 + d / 22);
    }, 0)
  );
}
function citySchedule(c) {
  const days = S.days[c.id] || c.days,
    cap = S.pace === 'relaxed' ? 5 : S.pace === 'full' ? 9 : 7,
    maxStops = S.pace === 'relaxed' ? 2 : S.pace === 'full' ? 4 : 3;
  let chosen = c.items.map((p) => P[p.id]).filter((p) => saved(p.id));
  const manual = chosen.length > 0;
  if (!manual) chosen = c.items.map((p) => P[p.id]).sort((a, b) => a.priority - b.priority);
  const wanted = new Set(chosen.map((p) => p.id));
  const byTime = (items) => [...items].sort((a, b) => timeRank(a) - timeRank(b));
  let groups = [];
  if (c.dayClusters?.length) {
    groups = c.dayClusters
      .map((g) => ({
        ...g,
        curated: true,
        items: g.items.filter((id) => wanted.has(id)).map((id) => P[id]),
      }))
      .filter((g) => g.items.length);
    const grouped = new Set(groups.flatMap((g) => g.items.map((p) => p.id)));
    for (const p of chosen.filter((p) => !grouped.has(p.id)))
      groups.push({
        label: p.area,
        items: [p],
        days: p.duration > 16 ? Math.ceil(p.duration / 12) : 1,
        note: '',
      });
  } else {
    const local = chosen.filter((p) => !p.excursion && p.duration < 6 && hav(c, p) < 40);
    let left = [...local];
    while (left.length) {
      left.sort((a, b) => a.priority - b.priority || (a.kind === 'see' ? -1 : 1));
      let items = [left.shift()];
      while (items.length < maxStops && left.length) {
        const prev = items.at(-1);
        left.sort((a, b) => hav(prev, a) - hav(prev, b));
        const j = left.findIndex(
          (p) => hav(prev, p) < 5 && plannedHours(byTime([...items, p])) <= cap,
        );
        if (j < 0) break;
        items = byTime([...items, left.splice(j, 1)[0]]);
      }
      groups.push({
        label: [...new Set(items.map((p) => p.area))].join(' / '),
        items,
        days: 1,
        note: 'Check opening hours and any reserved entry slot before following this sequence.',
      });
    }
    for (const p of chosen.filter((p) => !local.includes(p)))
      groups.push({
        label: p.area,
        items: [p],
        days: p.duration > 16 ? Math.ceil(p.duration / 12) : 1,
        note:
          p.duration > 16
            ? 'Reserve consecutive days and an overnight stay.'
            : 'Dedicate this day to the excursion and confirm access/transport.',
      });
  }
  const bins = [],
    used = new Set();
  function addDay(g, items, extra = {}) {
    const hours = plannedHours(items);
    // A curated park group is an editorial day, not a bag of independent outings.
    // Keep its order. Surface a pace warning instead of secretly splitting it.
    const paceWarning = items.length > maxStops || hours > cap;
    const note = [
      g.note || '',
      paceWarning
        ? `This recommended day is longer than your ${S.pace} pace or has more stops. Shorten the visits, omit a stop, or add time; the group is kept together to avoid repeat journeys. Summed time estimates may overlap within a park excursion.`
        : '',
    ]
      .filter(Boolean)
      .join(' ');
    items.forEach((p) => used.add(p.id));
    bins.push({
      items,
      hours,
      excursion: items.some((p) => p.excursion || p.duration >= 6 || hav(c, p) > 40),
      label: g.label,
      note,
      paceWarning,
      curated: !!g.curated,
      ...extra,
    });
  }
  for (const g of groups) {
    let items = g.curated ? [...g.items] : byTime(g.items);
    const blockDays = Math.max(
      g.days || 1,
      ...items.map((p) => (p.duration > 16 ? Math.ceil(p.duration / 12) : 1)),
    );
    if (blockDays > 1) {
      if (bins.length + blockDays > days) continue;
      // Yellowstone's two basin items can be shown on separate days.
      // A single Machu Picchu/Colca item represents the whole booked excursion.
      if (items.length === blockDays && items.every((p) => p.duration <= 12)) {
        items.forEach((p, k) =>
          addDay({ ...g, label: `${g.label} · day ${k + 1} of ${blockDays}` }, [p], {
            excursion: true,
            blockDays,
            blockDay: k + 1,
          }),
        );
      } else {
        addDay(
          {
            ...g,
            note: [
              g.note || '',
              `This is a ${blockDays}-day block. Item durations and excursion prices apply to the complete trip; the following days are reserved for its continuation.`,
            ]
              .filter(Boolean)
              .join(' '),
          },
          items,
          {
            hours: Math.min(
              12,
              items.reduce((h, p) => h + p.duration, 0),
            ),
            excursion: true,
            blockDays,
            blockDay: 1,
          },
        );
        for (let k = 1; k < blockDays; k++)
          bins.push({
            items: [],
            hours: 0,
            excursion: true,
            continuation: true,
            blockDays,
            blockDay: k + 1,
            label: g.label + ' · continuation',
            note: 'Continue the same excursion and return or move onward as arranged. Do not add a full city sightseeing day here.',
          });
      }
      continue;
    }
    if (g.curated) {
      if (bins.length < days) addDay(g, items);
      continue;
    }
    while (items.length && bins.length < days) {
      const chunk = [];
      while (items.length && chunk.length < maxStops) {
        const p = items[0];
        if (chunk.length && plannedHours([...chunk, p]) > cap) break;
        chunk.push(items.shift());
        if (p.duration >= 6 || p.excursion) break;
      }
      if (!chunk.length) break;
      addDay(g, chunk);
    }
  }
  while (bins.length < days)
    bins.push({ items: [], hours: 0, excursion: false, label: 'Room to explore', note: '' });
  return { bins, manual, unplaced: chosen.filter((p) => !used.has(p.id)) };
}

function dayDirections(points, stay = null) {
  if (stay && points.length)
    return `<div class="day-origin">${icon('pin')} Start at ${esc(stay.label)} · ${external(mapsDirections([stay, points[0]], 'transit'), 'Check first leg / transit ↗')}</div><div class="actions">${external(mapsDirections([stay, ...points].slice(0, 5), 'walking'), icon('route') + ' Walk from my stay', 'btn ghost small')}</div><small class="muted">Walking route preview from your accommodation. Check transit, entrances and actual journey times in Maps.</small>`;
  if (!points.length) return '';
  if (points.length === 1) {
    const p = points[0];
    return `<div class="actions">${external(mapsPin(p), icon('pin') + ' Locate in Google Maps', 'btn ghost small')}${p.sourceUrls?.[0] ? external(p.sourceUrls[0], icon('external') + ' Check official access / source', 'btn ghost small') : ''}</div><small class="muted">Check the actual entrance, trailhead, rail/shuttle or tour meeting point. A site pin is not a driving destination.</small>`;
  }
  const maxLeg = points.slice(1).reduce((m, p, i) => Math.max(m, hav(points[i], p)), 0),
    mode = maxLeg > 2 ? 'driving' : 'walking',
    chunks = [];
  for (let i = 0; i < points.length - 1; i += 4) chunks.push(points.slice(i, i + 5));
  return `<div class="actions">${chunks.map((g, i) => external(mapsDirections(g, mode), icon('route') + ` Open ${chunks.length > 1 ? 'segment ' + (i + 1) : 'route'} in Maps`, 'btn ghost small')).join('')}</div><small class="muted">${mode === 'walking' ? 'Check walking access and entrances.' : 'Driving is a preview; compare transit or a guided transfer in Maps.'} Confirm opening hours separately.</small>`;
}
function buildDaysHtml() {
  let n = 1;
  const start = S.startDate ? new Date(S.startDate + 'T12:00:00') : null;
  function datelabel(day) {
    if (!start) return '';
    const d = new Date(start);
    d.setDate(start.getDate() + day - 1);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  let html = '';
  for (let ci = 0; ci < S.trip.length; ci++) {
    const c = C[S.trip[ci]],
      sch = citySchedule(c);
    html += `<div class="sectionhead"><div><div class="eyebrow">${esc(c.country)}</div><h2>${esc(c.name)}</h2></div><p>${sch.manual ? 'Using your saved places in this destination.' : 'A starting plan from the curated highlights. Save specific places to choose your own.'}</p></div>`;
    for (const [cityDay, day] of sch.bins.entries()) {
      const labels = day.items.map((p) => p.area).filter((x, i, a) => a.indexOf(x) === i);
      html += `<article class="daycard ${day.continuation ? 'continuation' : ''}"><div class="daytitle"><h3>Day ${n} ${datelabel(n) ? '· ' + datelabel(n) : ''}</h3><span>${day.blockDays ? `Excursion day ${day.blockDay} of ${day.blockDays}` : day.continuation ? 'Overnight trip continues' : day.excursion ? 'Dedicated excursion' : day.items.length ? `About ${Math.ceil(day.hours)} h planned` : 'A flexible day'}</span></div>${day.label ? `<h4 style="font-size:13px;margin:0 0 8px">${esc(day.label)}</h4>` : ''}${day.note ? `<p class="day-context">${esc(day.note)}</p>` : ''}${day.items.length ? `<p class="muted" style="font-size:11px">${esc(labels.join(' → '))}${c.id === 'cusco' && cityDay === 0 ? ' · keep your first day gentle' : ''}</p>` : day.continuation ? '' : '<p class="muted" style="font-size:12px">Use this day to rest, explore beyond the shortlist or add a guided excursion. No extra places have been invented to fill the schedule.</p>'}${day.items.map((p) => `<div class="day-stop${S.visited.includes(p.id) ? ' done' : ''}"><label class="tick" title="Tick it off when you've been"><input type="checkbox" data-visited="${p.id}" aria-label="Been to ${esc(p.name)}" ${S.visited.includes(p.id) ? 'checked' : ''}><span aria-hidden="true">${icon('check')}</span></label>${photoTag(p.id)}<div class="stoptext"><h4><button class="inline-link" data-action="place" data-id="${p.id}">${esc(p.name)}</button><span class="been">Been here</span></h4><p>${p.duration} h${day.blockDays > 1 && day.items.length === 1 && p.duration > 12 ? ' for the whole excursion' : ''} · ${esc(p.bestTime)} · ${priceLabel(p)}</p>${p.reservation !== 'Usually not needed' ? `<span class="pill warm">${esc(p.reservation)} booking</span>` : ''}<p>${esc(p.tip)}</p><p class="price-note-inline">${esc(p.priceNote)}</p>${S.notes[p.id] ? `<p><strong>Your note:</strong> ${esc(S.notes[p.id])}</p>` : ''}</div>${external(mapsPin(p), icon('external'), 'btn light small')}</div>`).join('')}${dayDirections(day.items, day.excursion ? null : S.stays[c.id])}</article>`;
      n++;
    }
    if (sch.unplaced.length)
      html += `<div class="info-note"><strong>${sch.unplaced.length} more option${sch.unplaced.length > 1 ? 's' : ''} not fitted into these days:</strong> ${sch.unplaced.map((p) => esc(p.name)).join(', ')}. Add days or save only your priorities. The app leaves these visible rather than silently overfilling your itinerary.</div>`;
    if (ci < S.trip.length - 1) {
      const next = C[S.trip[ci + 1]],
        l = leg(c, next);
      html += `<article class="daycard" style="background:#edf0e7"><div class="daytitle"><h3>Day ${n} ${datelabel(n) ? '· ' + datelabel(n) : ''} · Transfer buffer</h3><span>${esc(c.name)} → ${esc(next.name)}</span></div><p style="font-size:12px;color:var(--muted)">${esc(l.mode)}${l.minutes ? ' · approximate service time ' + durationLabel(l.minutes) : ''}. ${esc(l.note)} One buffer day is reserved here; long-haul connections, border formalities or limited services can need more. Short regional trips may let you reclaim part of this day.</p></article>`;
      n++;
    }
  }
  return html;
}
function cityArrivalDate(id) {
  if (!S.startDate) return null;
  const d = new Date(S.startDate + 'T12:00:00');
  const index = S.trip.indexOf(id);
  let offset = 0;
  for (let i = 0; i < index; i++) offset += (S.days[S.trip[i]] || C[S.trip[i]].days) + 1;
  d.setDate(d.getDate() + offset);
  return d;
}
function intercityLink(a, b, l) {
  if (/flight|fly|air/i.test(l.mode) || (!l.known && l.distance > 850))
    return external(
      'https://www.google.com/search?q=' +
        encodeURIComponent('flights ' + a.name + ' to ' + b.name),
      'Check flights / connections ↗',
    );
  if (/ferry|boat/i.test(l.mode))
    return external(
      'https://www.google.com/search?q=' +
        encodeURIComponent(a.name + ' ' + b.name + ' official ferry schedule'),
      'Check ferry dates and ports ↗',
    );
  if (!l.known)
    return external(
      'https://www.google.com/search?q=' +
        encodeURIComponent('how to travel from ' + a.name + ' to ' + b.name),
      'Check transport options ↗',
    );
  return external(
    mapsDirections(
      [S.stays[a.id] || a, S.stays[b.id] || b],
      /train|rail|shinkansen/i.test(l.mode) ? 'transit' : 'driving',
    ),
    'Check route options ↗',
  );
}
function parkNotice(c) {
  if (!['springdale', 'flagstaff', 'moab', 'jackson', 'mariposa', 'las-vegas'].includes(c.id))
    return c.budgetNote
      ? `<div class="info-note"><strong>Budget scope:</strong> ${esc(c.budgetNote)}</div>`
      : '';
  return `<div class="info-note"><strong>Park travel has a separate budget.</strong> ${esc(c.budgetNote || 'Rental car, fuel and admission/pass costs are extra.')} For 2026, designated parks add USD 100 per eligible non-U.S. resident aged 16+ unless covered by a valid qualifying pass. The nonresident annual pass is USD 250; coverage depends on vehicle/party rules. ${external('https://www.nps.gov/aboutus/nonresident-fees.htm', 'Read current NPS fee and eligibility rules ↗')}</div>`;
}
// The Trip page opens on the trip itself: cover, route map, the cities with what you saved in
// each, and the total. Dates, pace and travellers sit behind "Trip settings".
let tripTab = 'plan',
  tripMap = null;
function listNames(names) {
  return names.length < 3
    ? names.join(' and ')
    : names.slice(0, -1).join(', ') + ' and ' + names.at(-1);
}
function starterCard(t) {
  const o = budgetOrigin(),
    days = t.days.reduce((a, b) => a + b, 0),
    est = o ? pick(templateCost(t).total) : 0;
  return `<article class="startercard"><div class="sc-photo">${photoTag(t.cities[0])}</div><div class="sc-body"><h3>${esc(t.title)}</h3><p>${esc(listNames(t.cities.filter((id) => C[id]).map((id) => C[id].name)))}</p><small>${days} days${est ? ` · about ${cash(est)}` : ''}</small><button class="btn light small" data-action="template" data-id="${t.id}">Start with this trip</button></div></article>`;
}
function tripCityCard(id, i) {
  const c = C[id],
    l = i ? leg(C[S.trip[i - 1]], c) : null,
    mine = savedIn(id),
    arrivalDate = cityArrivalDate(id),
    m = arrivalDate ? arrivalDate.getMonth() + 1 : 0,
    days = S.days[id] || c.days;
  return `${l ? `<div class="leg"><strong>${icon('route')} ${esc(l.mode)} ${l.minutes ? '· about ' + durationLabel(l.minutes) : ''}</strong>${intercityLink(C[S.trip[i - 1]], c, l)}</div>` : ''}<article class="routecard"><div class="routecardtop"><div class="route-number">${i + 1}</div>${photoTag(id)}<div class="routeinfo"><h3>${esc(c.name)}</h3><p>${days} day${days > 1 ? 's' : ''} · ${mine.length} saved</p></div><div class="reorder"><button data-action="move" data-id="${id}" data-dir="-1" aria-label="Move ${esc(c.name)} earlier" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button><button data-action="move" data-id="${id}" data-dir="1" aria-label="Move ${esc(c.name)} later" ${i === S.trip.length - 1 ? 'disabled' : ''}>${icon('down')}</button><button data-action="trip-toggle" data-id="${id}" aria-label="Remove ${esc(c.name)} from trip">${icon('close')}</button></div></div><div class="rc-places">${mine.map((p) => `<button class="rc-place" data-action="place" data-id="${p.id}" aria-label="${esc(p.name)}">${visualTag(p.id)}<span>${esc(p.name)}</span></button>`).join('')}<a class="rc-place add" href="#/city/${id}"><i>${icon('plus')}</i><span>${mine.length ? 'Add places' : 'Choose places'}</span></a>${mine.length ? '' : `<button class="rc-place add" data-action="save-top5" data-id="${id}"><i>${icon('heart')}</i><span>Save the top 5</span></button>`}</div><div class="actions"><div class="stepper"><button data-action="days" data-id="${id}" data-dir="-1" aria-label="Fewer days in ${esc(c.name)}">−</button><strong>${days} day${days > 1 ? 's' : ''}</strong><button data-action="days" data-id="${id}" data-dir="1" aria-label="More days in ${esc(c.name)}">+</button></div></div>${m && !c.bestMonths.includes(m) ? `<p class="season-warning">${MONTHS[m - 1]} is outside the best months here. ${esc(c.seasonNote)}</p>` : ''}<details class="rc-more" data-keep="more-${id}"><summary>Hotel and extras</summary>${stayPanel(c, true)}<div class="budget-custom"><div class="field"><label>Hotel / person / night (${c.currency})</label><input type="number" min="0" data-lodging="${id}" value="${S.lodging[id] || 0}" aria-label="Hotel per person per night in ${esc(c.name)}"></div><div class="field"><label>Extras / person (${c.currency})</label><input type="number" min="0" data-extra="${id}" value="${S.extra[id] || 0}" aria-label="Extra excursion allowance in ${esc(c.name)}"></div></div></details></article>`;
}
function tripPlanTab() {
  return `<div class="tripplan"><div class="tripmapwrap"><div id="trip-map" aria-label="Route map"></div><a class="btn light small tm-open" href="#/map/trip">${icon('map')} Open map</a></div><div class="tripcities">${S.trip.map(tripCityCard).join('')}<button class="selectcities" data-action="choose-cities">${icon('plus')} Add another city</button></div></div><details class="trip-settings" data-keep="settings"><summary>${icon('sliders')} Trip settings<small>${S.startDate ? esc(S.startDate) : 'No dates yet'} · ${S.people} traveller${S.people > 1 ? 's' : ''}</small></summary><div class="trip-controls"><div class="field"><label for="trip-date">Start date</label><input type="date" id="trip-date" value="${S.startDate}"></div><div class="field"><label for="trip-pace">Daily pace</label><select id="trip-pace">${[
    ['relaxed', 'Unhurried · aim for 5 hours'],
    ['balanced', 'Balanced · aim for 7 hours'],
    ['full', 'Full days · aim for 9 hours'],
  ]
    .map(([v, l]) => `<option value="${v}" ${S.pace === v ? 'selected' : ''}>${l}</option>`)
    .join(
      '',
    )}</select></div><div class="field smallfield"><label for="trip-people">Travellers</label><input type="number" id="trip-people" min="1" max="20" value="${S.people}"></div></div>${S.trip.length > 2 ? `<button class="btn light small" data-action="optimize">${icon('shuffle')} Suggest visit order</button>` : ''}</details><div class="plan-toolbar"><h2>Day by day</h2></div><section id="day-plans">${buildDaysHtml()}</section>`;
}
function tripShareTab() {
  return `<div class="sharepanel"><h2>Share with friends</h2><p>One link shows your route, places and costs.</p><button class="btn" data-action="share">${icon('share')} Share with friends</button></div><details class="trip-more" data-keep="more"><summary>More</summary><div class="more-list"><button data-action="export">${icon('download')} Save a backup file</button><button data-action="import">${icon('upload')} Open a backup file</button><button data-action="csv">${icon('pin')} Export pins for Google My Maps</button><button data-action="print">${icon('print')} Print the plan</button></div></details>`;
}
function renderTrip() {
  headerActive('trip');
  const wait = () =>
    location.hash.startsWith('#/trip') && !$('.trippage') && ($('#app').innerHTML = loadingPage());
  if (!withCities(S.trip, renderTrip, wait)) return;
  const keep = $('.trippage') && [...$$('.trippage details[open]')].map((d) => d.dataset.keep);
  if (tripMap) {
    tripMap.remove();
    tripMap = null;
  }
  if (!S.trip.length) {
    $('#app').innerHTML =
      `<div class="wrap trippage"><div class="pagehead"><div><h1>Your trip</h1><p>Start from a ready-made trip, or pick your own cities.</p></div></div><div class="starter-grid">${TEMPLATES.slice(0, 3).map(starterCard).join('')}</div><div class="actions trip-start"><button class="btn" data-action="choose-cities">${icon('plus')} Choose my own cities</button><button class="inline-link" data-action="import">${icon('upload')} Open a backup file</button></div><details class="trip-more"><summary>More ready-made trips</summary><div class="starter-grid">${TEMPLATES.slice(3).map(starterCard).join('')}</div></details>${footer()}</div>`;
    return;
  }
  const cost = tripCost(),
    days = totalDays() + transferDays();
  $('#app').innerHTML =
    `<div class="wrap trippage"><section class="tripcover">${photoTag(S.trip[0], '', false)}<div class="tc-copy"><span class="eyebrow">YOUR TRIP</span><h1>${esc(listNames(S.trip.map((id) => C[id].name)))}</h1><p>${days} days · ${S.people} traveller${S.people > 1 ? 's' : ''}</p></div><button class="tc-total" data-action="trip-tab" data-id="cost"><small>About</small><b>${cash(cost.est)}</b></button></section><div class="tripbar"><button class="btn" data-action="share">${icon('share')} Share with friends</button></div><div class="citytabs triptabs" role="tablist">${[
      ['plan', 'Plan'],
      ['cost', 'Cost'],
      ['share', 'Share'],
    ]
      .map(
        ([k, l]) =>
          `<button role="tab" aria-selected="${tripTab === k}" class="${tripTab === k ? 'active' : ''}" data-action="trip-tab" data-id="${k}">${l}</button>`,
      )
      .join(
        '',
      )}</div><div class="triptab">${tripTab === 'cost' ? tripCostBar() + tripReceipt() : tripTab === 'share' ? tripShareTab() : tripPlanTab()}</div>${footer()}</div>`;
  (keep || []).forEach((k) => $(`.trippage details[data-keep="${k}"]`)?.setAttribute('open', ''));
  if (tripTab === 'plan') initTripMap();
}
function rerenderTrip() {
  const y = window.scrollY;
  renderTrip();
  window.scrollTo(0, y);
}
function initTripMap() {
  if (!$('#trip-map') || typeof L === 'undefined') return;
  tripMap = L.map('trip-map', {
    zoomControl: !isMobile(),
    minZoom: 1,
    maxZoom: 12,
    scrollWheelZoom: false,
    dragging: !isMobile(),
    attributionControl: true,
  });
  tripMap.createPane('offline-outline');
  tripMap.getPane('offline-outline').style.zIndex = '150';
  L.geoJSON(DATA.world, {
    pane: 'offline-outline',
    style: outlineStyle(),
    interactive: false,
  }).addTo(tripMap);
  tripMap.attributionControl.setPrefix(false);
  foldCredit(tripMap);
  if (S.street && navigator.onLine)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      maxZoom: 19,
    }).addTo(tripMap);
  const pts = S.trip.map((id) => [C[id].lat, C[id].lon]);
  if (pts.length > 1)
    L.polyline(pts, { color: '#e7764b', weight: 3, dashArray: '7 7' }).addTo(tripMap);
  S.trip.forEach((id, i) =>
    L.marker(pts[i], {
      icon: L.divIcon({
        className: 'trip-pin',
        html: `<b>${i + 1}</b><span>${esc(C[id].name)}</span>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      }),
      keyboard: false,
    })
      .on('click', () => (location.hash = '#/city/' + id))
      .addTo(tripMap),
  );
  if (pts.length > 1) tripMap.fitBounds(pts, { padding: [46, 46], maxZoom: 7 });
  else tripMap.setView(pts[0], 6);
  setTimeout(() => tripMap?.invalidateSize(), 100);
}
function chooseCities() {
  showModal(
    `<div class="modalcontent"><span class="eyebrow">ONE CITY OR A GRAND ADVENTURE</span><h2>Where would you like to go?</h2><div class="searchbox" style="margin-bottom:20px">${icon('search')}<input id="choose-city-search" type="search" placeholder="Search destinations…" aria-label="Search destinations to add"></div><div class="compact-citylist" id="choose-city-list">${chooseCityList('')}</div><div class="actions" style="margin-top:20px"><button class="btn" data-action="finish-cities">See my trip ${icon('arrow')}</button></div></div>`,
    'Choose destinations',
  );
}
function chooseCityList(q) {
  return CITIES.filter((c) => (c.name + ' ' + c.country).toLowerCase().includes(q.toLowerCase()))
    .map(
      (c) =>
        `<div class="compactcity">${photoTag(c.id)}<div class="text"><h4>${esc(c.name)}</h4><p>${esc(c.country)} · ${c.days} suggested days</p></div>${cityAdd(c.id, false, true)}</div>`,
    )
    .join('');
}
function applyTemplate(id) {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) return;
  for (let i = 0; i < t.cities.length; i++) {
    const id = t.cities[i];
    if (!C[id]) continue;
    if (!inTrip(id)) {
      S.trip.push(id);
      S.days[id] = t.days[i];
    }
  }
  persist();
  closeModal();
  location.hash = '#/trip';
  if (location.hash === '#/trip') renderTrip();
  tripTab = 'plan';
  toast('Trip added.');
}
function budgetDetail() {
  showModal(
    `<div class="modalcontent"><h2>Your spending assumptions.</h2><p class="muted">Local currency amounts for ${S.people} traveller${S.people > 1 ? 's' : ''}. Cash guidance is a subset of spending, not another expense.</p><div style="overflow:auto"><table class="budgettable"><thead><tr><th>Destination</th><th>Days</th><th>Daily / person</th><th>Cash / person / day</th></tr></thead><tbody>${S.trip
      .map((id) => {
        const c = C[id];
        return `<tr><td>${esc(c.name)}</td><td>${S.days[id] || c.days}</td><td>${range(c.dailyBudget, c.currency)}</td><td>${range(c.cashPerDay, c.currency)}</td></tr>`;
      })
      .join(
        '',
      )}</tbody></table></div><div class="info-note">Do not carry the entire trip budget in cash. These are editable planning allowances. Premium excursions—especially safaris, Machu Picchu rail packages and theme-park upgrades—can materially exceed the baseline. Your exact itinerary needs a booking-by-booking budget.</div><h3>Currency totals with your entered extras</h3>${Object.entries(
      tripBudgets(),
    )
      .map(([c, r]) => `<p><strong>${range(r, c)}</strong></p>`)
      .join(
        '',
      )}<p class="muted" style="font-size:12px">The app deliberately does not add different currencies together. A zero hotel or extra allowance means those costs have not been supplied.</p></div>`,
    'Budget breakdown',
  );
}
// Three real-photo places to start from when nothing is saved yet.
function starterPlaces() {
  const out = [];
  for (const c of CITIES) {
    const p = topFive(c.id).find((x) => !ART[x.id]);
    if (p) out.push(p);
    if (out.length === 3) break;
  }
  return out;
}
