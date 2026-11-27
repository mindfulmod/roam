// Editing a trip story in place (#/story/<id>/edit). The travellers fix the story on the story
// page itself, and the map redraws as they go: reorder stops, move one to another day, fix times
// and notes, pick the cover, hide a photo from viewers, add or remove a place. Every change is
// listed with a name, and anyone can undo any of them. The sample keeps the edits in memory for
// this visit only; you play Alex.
const ST_DRAFT = {};
const ED_MAX_PHOTOS = 5;

// The shared working copy: the story as it stands, each stop with an id that survives moves.
function edDraft(id) {
  if (ST_DRAFT[id]) return ST_DRAFT[id];
  const st = structuredClone(STORIES[id]);
  let n = 0;
  st.days.forEach((d) => d.stops.forEach((s) => (s.uid = ++n)));
  st.nextUid = n;
  st.changes = [];
  ST_DRAFT[id] = st;
  edSeed(st);
  return st;
}
// What the others changed before you opened it, so the list is not empty and their changes can
// be undone like your own.
function edSeed(st) {
  const kiyo = edFindIn(st, (s) => s.place === 'kyoto-kiyomizu'),
    d3 = st.days[2];
  if (kiyo) {
    const was = 'Busy, but worth it for the view back over the city.',
      now = kiyo.s.note;
    st.changes.push({
      who: 'noor',
      text: 'rewrote the note on Kiyomizu-dera',
      when: 'yesterday',
      undo: () => (edFindIn(st, (s) => s.uid === kiyo.s.uid).s.note = was),
      redo: () => (edFindIn(st, (s) => s.uid === kiyo.s.uid).s.note = now),
    });
  }
  if (d3) {
    const was = 'Day three',
      now = d3.title;
    st.changes.push({
      who: 'sam',
      text: 'named Day 3',
      when: '2 days ago',
      undo: () => (d3.title = was),
      redo: () => (d3.title = now),
    });
  }
}
const edSt = () => ST_DRAFT[storyNow?.id];
function edFindIn(st, test) {
  for (const [di, d] of st.days.entries()) {
    const k = d.stops.findIndex(test);
    if (k >= 0) return { d, di, k, s: d.stops[k] };
  }
  return null;
}
const edFind = (uid) => edFindIn(edSt(), (s) => s.uid === uid);
const edName = (s) => (s.place && P[s.place] ? P[s.place].name : s.name || s.leg || 'this stop');
const edWho = (id) => (id === stMe() ? 'You' : stPerson(id).name);
const edT = (m) =>
  `${String(Math.max(0, Math.min(23, Math.floor(m / 60)))).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`;

// ---------------------------------------------------------------- What editing looks like
function edBanner(m) {
  const others = m.st.travellers.filter((t) => t.id !== stMe());
  return `<section class="ed-banner"><div class="ed-banner-copy"><span class="eyebrow">${icon('pencil')} Editing as ${esc(stPerson(stMe()).name)}</span><p>Changes save for all ${m.st.travellers.length} of you as you make them, and anyone can undo them. ${esc(others.map((t) => t.name).join(', '))} can edit at the same time.</p><p class="ed-banner-fine">Use the arrows to reorder, or to move a stop into the next or previous day. ${m.stops.some((s) => s.ripples.length) ? `Stops with a ring led a friend somewhere; their saved place stays even if you remove the stop.` : ''}</p></div><a class="btn small ghost" href="#/story/${esc(m.id)}/log/edit">Is it ready?</a></section>`;
}
function edStopTools(s) {
  const m = storyNow,
    first = s.i === 0,
    last = s.i === m.stops.length - 1;
  return `<div class="ed-tools"><span class="ed-move"><button class="iconbtn" data-action="ed-move" data-uid="${s.uid}" data-dir="-1" aria-label="Move ${esc(s.name)} earlier" ${first ? 'disabled' : ''}>${icon('up')}</button><button class="iconbtn" data-action="ed-move" data-uid="${s.uid}" data-dir="1" aria-label="Move ${esc(s.name)} later" ${last ? 'disabled' : ''}>${icon('down')}</button></span><button class="st-act" data-action="ed-stop" data-uid="${s.uid}">${icon('pencil')}<span>Edit</span></button><button class="st-act ed-danger" data-action="ed-remove" data-uid="${s.uid}">${icon('trash')}<span>Remove</span></button></div>`;
}
function edPhotoHtml(s, x, k) {
  const cover = storyNow.st.cover === x.id && s.photos.findIndex((y) => y.id === x.id) === k;
  return `<div class="st-photo ed-photo${x.hidden ? ' hid' : ''}">${photoTag(x.id)}<span class="ed-ptools"><button class="ed-pbtn${cover ? ' on' : ''}" data-action="ed-cover-pick" data-id="${x.id}" aria-pressed="${cover}" aria-label="${cover ? 'This is the cover' : 'Use as the cover'}" title="${cover ? 'The cover' : 'Use as the cover'}">${icon('star')}</button><button class="ed-pbtn${x.hidden ? ' on' : ''}" data-action="ed-hide" data-uid="${s.uid}" data-k="${x.k}" aria-pressed="${!!x.hidden}" aria-label="${x.hidden ? 'Show to viewers' : 'Hide from viewers'}" title="${x.hidden ? 'Hidden from viewers' : 'Hide from viewers'}">${icon(x.hidden ? 'eyeoff' : 'eye')}</button></span><span class="st-cap">${x.hidden ? 'Hidden from viewers' : `${stAvatar(x.by, 'tiny')} ${esc(x.caption)}`}</span></div>`;
}
// The bar at the bottom while editing: undo, the list of changes, and done. It takes the place of
// the tab bar, so nothing sits on the map.
function edBar() {
  const st = edSt();
  if (!st) return;
  const live = st.changes.filter((c) => !c.undone),
    mine = st.changes.filter((c) => c.who === stMe() && !c.undone).length,
    last = live.at(-1);
  let bar = $('.ed-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'ed-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Editing the story');
    document.body.append(bar);
  }
  bar.innerHTML = `<button class="btn small ghost" data-action="ed-undo" ${last ? '' : 'disabled'} aria-label="${last ? `Undo: ${esc(edWho(last.who))} ${esc(last.text)}` : 'Nothing to undo'}">${icon('left')}<span>Undo</span></button><button class="ed-count" data-action="ed-changes"><strong>${st.changes.length} ${st.changes.length === 1 ? 'change' : 'changes'}</strong><span>${mine ? `${mine} by you · ` : ''}saved for everyone</span></button><button class="btn small" data-action="ed-done">${icon('check')}<span>Done</span></button>`;
}
// Redraws the cover, facts, timeline and map from the working copy, keeping your place on the page.
function edRefresh() {
  const old = storyNow;
  if (!old) return;
  const y = scrollY,
    m = storyModel(old.id);
  m.calm = old.calm;
  m.layer = old.layer; // so the old pins and lines are cleared, not left under the new ones
  old.io?.disconnect();
  storyNow = m;
  $('.story-hero').outerHTML = stHeroHtml(m);
  $('.st-facts').outerHTML = stFactsHtml(m);
  $('.ed-banner').outerHTML = edBanner(m);
  $('#story-timeline').innerHTML = m.days.map((d) => stDayHtml(d, 180)).join('');
  storyLayers(m);
  storyWatch();
  edBar();
  window.scrollTo(0, y);
}

// ---------------------------------------------------------------- Changes, undo and redo
// Every edit runs through here with its own way back, so undoing one change leaves later ones
// alone. `run` makes the change; `back` reverses it.
function edChange(text, run, back, after = '') {
  const st = edSt();
  run();
  const c = { who: stMe(), text, when: 'just now', undo: back, redo: run };
  st.changes.push(c);
  edRefresh();
  toast(after || `Saved for everyone: you ${text}.`, { label: 'Undo', run: () => edUndo(c) });
  return c;
}
function edUndo(c) {
  const st = edSt();
  c = c || st?.changes.filter((x) => !x.undone).at(-1);
  if (!c || c.undone) return;
  c.undo();
  c.undone = true;
  edRefresh();
  if ($('.ed-changes')) edChanges();
  toast(`Undone: ${c.who === stMe() ? 'you' : stPerson(c.who).name} ${c.text}.`);
}
function edChanges() {
  const st = edSt(),
    list = [...st.changes].reverse();
  showModal(
    `<div class="modalcontent ed-changes"><h2 id="modal-heading">Changes to the story</h2><p class="lead">Everyone can edit everything, so every change is kept here with a name. Anyone can undo any of them.</p><ul class="lg-changes">${list
      .map((c) => {
        const k = st.changes.indexOf(c);
        return `<li class="${c.undone ? 'undone' : ''}">${stAvatar({ name: stPerson(c.who).name, color: stPerson(c.who).color }, 'tiny')}<span><strong>${esc(edWho(c.who))}</strong> ${esc(c.text)}<small>${esc(c.when)}${c.undone ? ' · undone' : ''}</small></span>${c.undone ? `<button class="st-act" data-action="ed-redo" data-k="${k}">Redo</button>` : `<button class="st-act" data-action="ed-undo-one" data-k="${k}">Undo</button>`}</li>`;
      })
      .join('')}</ul></div>`,
    'Changes',
  );
}

// ---------------------------------------------------------------- The edits
// Moving a stop swaps it with its neighbour and the two trade time slots, each keeping its own
// length. Past the first or last stop of a day, it moves into the day before or after.
function edMove(uid, dir) {
  const st = edSt(),
    at = edFind(uid);
  if (!at) return;
  const { d, di, s } = at,
    places = d.stops.map((x, j) => ({ x, j })).filter(({ x }) => !x.leg),
    pos = places.findIndex(({ x }) => x === s),
    nb = places[pos + dir];
  const snap = JSON.stringify(st.days.map((day) => day.stops.map((x) => [x.uid, x.in, x.out]))),
    rows = Object.fromEntries(st.days.flatMap((day) => day.stops).map((x) => [x.uid, x]));
  const back = () => {
    JSON.parse(snap).forEach((list, i) => {
      st.days[i].stops = list.map(([u, a, b]) => Object.assign(rows[u], { in: a, out: b }));
    });
  };
  let text, run;
  if (nb) {
    const o = nb.x,
      [a, b] = dir < 0 ? [s, o] : [o, s], // a ends up first
      start = Math.min(stMins(s.in), stMins(o.in)),
      gap = Math.max(10, Math.abs(stMins(o.in) - stMins(s.out)) % 120 || 20),
      la = stMins(a.out) - stMins(a.in),
      lb = stMins(b.out) - stMins(b.in);
    run = () => {
      const j = d.stops.indexOf(s),
        jo = d.stops.indexOf(o);
      d.stops[j] = o;
      d.stops[jo] = s;
      Object.assign(a, { in: edT(start), out: edT(start + la) });
      Object.assign(b, { in: edT(start + la + gap), out: edT(start + la + gap + lb) });
    };
    text = `moved ${edName(s)} ${dir < 0 ? 'before' : 'after'} ${edName(o)}`;
  } else {
    const to = st.days[di + dir];
    if (!to) return;
    const len = stMins(s.out) - stMins(s.in),
      toPlaces = to.stops.filter((x) => !x.leg);
    run = () => {
      d.stops.splice(d.stops.indexOf(s), 1);
      if (dir < 0) {
        const lastOut = toPlaces.length ? stMins(toPlaces.at(-1).out) : 17 * 60;
        const t = Math.min(lastOut + 30, 23 * 60 - len);
        Object.assign(s, { in: edT(t), out: edT(t + len) });
        to.stops.push(s);
      } else {
        const firstIn = toPlaces.length ? stMins(toPlaces[0].in) : 9 * 60;
        const t = Math.max(6 * 60, firstIn - 30 - len);
        Object.assign(s, { in: edT(t), out: edT(t + len) });
        to.stops.unshift(s);
      }
    };
    text = `moved ${edName(s)} to Day ${di + dir + 1}`;
  }
  edChange(text, run, back);
  // Keep the moved stop in view and lit, so you can see where it went on the map too.
  const m = storyNow,
    now = m.stops.find((x) => x.uid === uid);
  if (now) {
    const el = $('#st-stop-' + now.i);
    el?.classList.add('ed-moved');
    storyActive(now.i);
    storyScroll(el);
    m.hold = Date.now() + 1200;
  }
}
function edRemove(uid) {
  const st = edSt(),
    at = edFind(uid);
  if (!at) return;
  const { d, s } = at,
    k = at.k,
    name = edName(s),
    rips = (st.ripples || []).filter((r) => r.place && r.place === s.place),
    names = rips.map((r) => stPerson(r.who).name).join(' and ');
  edChange(
    `removed ${name}`,
    () => d.stops.splice(d.stops.indexOf(s), 1),
    () => d.stops.splice(Math.min(k, d.stops.length), 0, s),
    rips.length
      ? `Removed ${name}. ${names} still ${rips.length > 1 ? 'have' : 'has'} it saved, so the ripple stays on their side.`
      : `Removed ${name} for everyone.`,
  );
}
function edHide(uid, k) {
  const { s } = edFind(uid) || {};
  const x = s?.photos?.[k];
  if (!x) return;
  const was = !!x.hidden;
  edChange(
    `${was ? 'showed' : 'hid'} a photo at ${edName(s)}`,
    () => (x.hidden = !was),
    () => (x.hidden = was),
    was
      ? 'Viewers can see that photo again.'
      : 'Hidden from viewers. The four of you still see it, marked.',
  );
}
function edCover(id) {
  const st = edSt(),
    was = st.cover;
  if (id === was) return;
  edChange(
    'changed the cover photo',
    () => (st.cover = id),
    () => (st.cover = was),
  );
  closeModal('user');
  window.scrollTo({ top: 0, behavior: storyNow?.calm ? 'auto' : 'smooth' });
}

// ---------------------------------------------------------------- Sheets
function edStopSheet(uid) {
  const { s, di } = edFind(uid) || {};
  if (!s) return;
  const st = edSt(),
    who = Object.fromEntries(st.travellers.map((t) => [t.id, t])),
    n = (s.photos || []).length;
  showModal(
    `<div class="modalcontent lg-modal"><h2 id="modal-heading">${esc(edName(s))}</h2><p class="lead">Day ${di + 1} · logged by ${esc(who[s.by]?.name || 'the group')}</p><form class="ed-form" data-kind="stop" data-uid="${uid}"><div class="lg-times"><label>Arrived<input type="time" name="in" value="${s.in}" required></label><label>Left<input type="time" name="out" value="${s.out}" required></label></div><label>Note<textarea name="note" rows="3" maxlength="280">${esc(s.note || '')}</textarea></label><label>Day<select name="day">${st.days.map((d, i) => `<option value="${i}" ${i === di ? 'selected' : ''}>Day ${i + 1} · ${esc(d.title)}</option>`).join('')}</select></label><fieldset><legend>Photos · ${n} of ${ED_MAX_PHOTOS}</legend>${(
      s.photos || []
    )
      .map(
        (x, k) =>
          `<div class="lg-photo ${x.hidden ? 'hidden' : ''}"><span class="lg-thumb">${photoTag(x.id, '', false)}</span><div><input name="cap${k}" value="${esc(x.caption)}" maxlength="80" aria-label="Caption"><small>${stAvatar(who[x.by] || { name: '?', color: '#627572' }, 'tiny')} ${esc(who[x.by]?.name || 'Someone')}'s photo${x.hidden ? ' · hidden from viewers' : ''}</small><span><button type="button" class="inline-link" data-action="ed-rmphoto" data-uid="${uid}" data-k="${k}">Remove</button></span></div></div>`,
      )
      .join(
        '',
      )}<button type="button" class="lg-addrow" data-action="ed-addphoto" data-uid="${uid}" ${n >= ED_MAX_PHOTOS || !PHOTO[s.place] ? 'disabled' : ''}>${icon('plus')} ${n >= ED_MAX_PHOTOS ? 'Five is the most for one stop' : PHOTO[s.place] ? 'Add a photo' : 'No stand-in photo for this place in the sample'}</button></fieldset><div class="actions"><button class="btn">Save</button><button type="button" class="btn text lg-danger" data-action="ed-remove" data-uid="${uid}">Remove this stop</button></div></form></div>`,
    'Edit stop',
  );
}
function edTextSheet(kind, di) {
  const st = edSt(),
    d = st.days[di];
  showModal(
    kind === 'title'
      ? `<div class="modalcontent lg-modal"><h2 id="modal-heading">The story's title</h2><form class="ed-form" data-kind="title"><label>Title<input name="title" value="${esc(st.title)}" maxlength="60" required></label><label>One line under it<input name="blurb" value="${esc(st.blurb)}" maxlength="120"></label><div class="actions"><button class="btn">Save</button></div></form></div>`
      : `<div class="modalcontent lg-modal"><h2 id="modal-heading">Day ${di + 1}</h2><form class="ed-form" data-kind="day" data-day="${di}"><label>What the day was<input name="title" value="${esc(d.title)}" maxlength="50" required></label><div class="actions"><button class="btn">Save</button></div></form></div>`,
    kind === 'title' ? 'Edit title' : 'Rename day',
  );
}
function edCoverSheet() {
  const st = edSt(),
    ids = [
      ...new Set([
        st.cover,
        ...st.days.flatMap((d) =>
          d.stops.flatMap((s) => (s.photos || []).filter((x) => !x.hidden).map((x) => x.id)),
        ),
      ]),
    ].filter((id) => PHOTO[id]);
  showModal(
    `<div class="modalcontent lg-modal"><h2 id="modal-heading">Choose the cover</h2><p class="lead">From the photos in the story. Hidden photos can't be the cover.</p><div class="lg-covers ed-covers">${ids.map((id) => `<button class="lg-shot ${id === st.cover ? 'on' : ''}" data-action="ed-cover-pick" data-id="${id}" aria-pressed="${id === st.cover}" aria-label="Use as cover: ${esc(PHOTO[id].title || PHOTO[id].alt || id)}"><span class="lg-thumb">${photoTag(id, '', false)}</span><i>${icon('check')}</i></button>`).join('')}</div></div>`,
    'Choose the cover',
  );
}
// Adding a place: guide places in that day's city nearest the day's last stop, or one you name.
function edAddSheet(di) {
  const st = edSt(),
    d = st.days[di],
    places = d.stops.filter((s) => !s.leg),
    lastP = places.at(-1),
    at = lastP?.place ? P[lastP.place] : lastP,
    used = new Set(st.days.flatMap((x) => x.stops.map((s) => s.place)).filter(Boolean)),
    city = C[at?.cityId] || CITIES.find((c) => c.name === d.city),
    near = (city?.items || [])
      .map((x) => P[x.id])
      .filter((p) => p && p.lat && !used.has(p.id))
      .sort((a, b) => (at ? stKm(at, a) - stKm(at, b) : 0))
      .slice(0, 6);
  showModal(
    `<div class="modalcontent lg-modal"><h2 id="modal-heading">Add a place to Day ${di + 1}</h2><p class="lead">${esc(d.title)} · nearest to where the day ended.</p><ul class="lg-pick">${near.map((p) => `<li><button data-action="ed-add-pick" data-day="${di}" data-id="${p.id}"><span class="lg-thumb">${photoTag(p.id, '', false)}</span><span><strong>${esc(p.name)}</strong><small>${esc(p.area || '')}${at ? ` · ${stKm(at, p) < 1 ? Math.round(stKm(at, p) * 100) * 10 + ' m' : stKm(at, p).toFixed(1) + ' km'}` : ''}</small></span></button></li>`).join('')}</ul><form class="lg-add ed-form" data-kind="add" data-day="${di}"><label for="ed-newplace">Not listed? Add it yourself</label><div><input id="ed-newplace" name="name" maxlength="60" placeholder="Name of the place" autocomplete="off" required><button class="btn small">Add</button></div><p class="filter-note">It is pinned next to the day's last stop, and you can move it later. Tandem Roads is told, and may add it to the guide.</p></form></div>`,
    'Add a place',
  );
}
function edAdd(di, stop) {
  const st = edSt(),
    d = st.days[di],
    places = d.stops.filter((s) => !s.leg),
    t = places.length ? Math.min(stMins(places.at(-1).out) + 30, 22 * 60) : 10 * 60,
    s = {
      uid: ++st.nextUid,
      ...stop,
      in: edT(t),
      out: edT(Math.min(t + 60, 23 * 60 + 59)),
      by: stMe(),
      note: '',
      photos: [],
    };
  closeModal('user');
  edChange(
    `added ${edName(s)} to Day ${di + 1}`,
    () => d.stops.push(s),
    () => d.stops.splice(d.stops.indexOf(s), 1),
  );
  const now = storyNow.stops.find((x) => x.uid === s.uid);
  if (now) {
    storyActive(now.i);
    storyScroll($('#st-stop-' + now.i));
  }
}

// ---------------------------------------------------------------- Events
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-action^="ed-"]');
  if (!b || !storyNow || !edSt() || b.disabled) return;
  const a = b.dataset.action,
    uid = Number(b.dataset.uid),
    st = edSt();
  if (a === 'ed-move') edMove(uid, Number(b.dataset.dir));
  else if (a === 'ed-remove') {
    closeModal('user');
    edRemove(uid);
  } else if (a === 'ed-stop') edStopSheet(uid);
  else if (a === 'ed-hide') edHide(uid, Number(b.dataset.k));
  else if (a === 'ed-cover') edCoverSheet();
  else if (a === 'ed-cover-pick') edCover(b.dataset.id);
  else if (a === 'ed-title') edTextSheet('title');
  else if (a === 'ed-day') edTextSheet('day', Number(b.dataset.day));
  else if (a === 'ed-add') edAddSheet(Number(b.dataset.day));
  else if (a === 'ed-add-pick') {
    const p = P[b.dataset.id];
    edAdd(Number(b.dataset.day), { place: p.id });
  } else if (a === 'ed-undo') edUndo();
  else if (a === 'ed-undo-one') edUndo(st.changes[Number(b.dataset.k)]);
  else if (a === 'ed-redo') {
    const c = st.changes[Number(b.dataset.k)];
    c.redo();
    c.undone = false;
    edRefresh();
    edChanges();
  } else if (a === 'ed-changes') edChanges();
  else if (a === 'ed-done') {
    const n = st.changes.filter((c) => c.who === stMe() && !c.undone).length;
    location.hash = `#/story/${storyNow.id}`;
    toast(n ? 'Done. Your changes were already saved for everyone.' : 'Done.');
  } else if (a === 'ed-rmphoto' || a === 'ed-addphoto') {
    const { s } = edFind(uid) || {};
    if (!s) return;
    s.photos = s.photos || [];
    const k = Number(b.dataset.k);
    closeModal('user');
    if (a === 'ed-rmphoto') {
      const x = s.photos[k];
      edChange(
        `removed a photo from ${edName(s)}`,
        () => s.photos.splice(s.photos.indexOf(x), 1),
        () => s.photos.splice(k, 0, x),
      );
    } else {
      const x = { id: s.place, caption: 'New photo', by: stMe() };
      edChange(
        `added a photo to ${edName(s)}`,
        () => s.photos.push(x),
        () => s.photos.splice(s.photos.indexOf(x), 1),
      );
    }
    edStopSheet(uid);
  }
});
document.addEventListener('submit', (ev) => {
  const f = ev.target;
  if (!f.matches('.ed-form') || !edSt()) return;
  ev.preventDefault();
  const v = Object.fromEntries(new FormData(f)),
    st = edSt(),
    kind = f.dataset.kind;
  if (kind === 'stop') {
    if (stMins(v.out) <= stMins(v.in))
      return toast('The leaving time has to be after the arrival.');
    const uid = Number(f.dataset.uid),
      at = edFind(uid),
      { s } = at,
      before = { in: s.in, out: s.out, note: s.note, caps: (s.photos || []).map((x) => x.caption) },
      after = {
        in: v.in,
        out: v.out,
        note: v.note.trim(),
        caps: (s.photos || []).map((x, k) => (v['cap' + k] ?? x.caption).trim()),
      },
      fromDay = at.di,
      toDay = Number(v.day),
      fromK = at.k;
    const set = (o) => {
      Object.assign(s, { in: o.in, out: o.out, note: o.note });
      (s.photos || []).forEach((x, k) => (x.caption = o.caps[k] ?? x.caption));
    };
    closeModal('user');
    if (JSON.stringify(before) === JSON.stringify(after) && fromDay === toDay) return;
    edChange(
      fromDay === toDay ? `edited ${edName(s)}` : `moved ${edName(s)} to Day ${toDay + 1}`,
      () => {
        set(after);
        if (fromDay !== toDay) {
          const from = st.days[fromDay].stops;
          from.splice(from.indexOf(s), 1);
          st.days[toDay].stops.push(s);
          st.days[toDay].stops.sort((a, b) => stMins(a.in) - stMins(b.in));
        }
      },
      () => {
        set(before);
        if (fromDay !== toDay) {
          const to = st.days[toDay].stops;
          to.splice(to.indexOf(s), 1);
          st.days[fromDay].stops.splice(fromK, 0, s);
        }
      },
    );
  } else if (kind === 'title') {
    const was = { title: st.title, blurb: st.blurb },
      now = { title: v.title.trim() || st.title, blurb: v.blurb.trim() };
    closeModal('user');
    if (was.title === now.title && was.blurb === now.blurb) return;
    edChange(
      'changed the title',
      () => Object.assign(st, now),
      () => Object.assign(st, was),
    );
  } else if (kind === 'day') {
    const d = st.days[Number(f.dataset.day)],
      was = d.title,
      now = v.title.trim() || was;
    closeModal('user');
    if (now === was) return;
    edChange(
      `renamed Day ${Number(f.dataset.day) + 1}`,
      () => (d.title = now),
      () => (d.title = was),
    );
  } else if (kind === 'add') {
    const di = Number(f.dataset.day),
      d = st.days[di],
      places = d.stops.filter((s) => !s.leg),
      last = places.at(-1),
      at = last?.place ? P[last.place] : last,
      name = v.name.trim();
    if (!name || !at) return;
    edAdd(di, {
      name,
      area: 'Added by you',
      city: at.cityId || at.city,
      lat: at.lat + 0.0015,
      lon: at.lon + 0.0018,
    });
  }
});
