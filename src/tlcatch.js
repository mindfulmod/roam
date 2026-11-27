// Catching up afterwards, from photos (on #/log). AM's rule: logging does not have to happen on
// the trip, so this is a first-class path, not a fallback.
//   1. pick the best photos of a day (or several days) with the phone's own picker
//   2. they fall into places by the time they were taken (a gap of 45 minutes starts a new one)
//   3. a group that overlaps a stop already logged joins it; any other asks "where was this?"
//      from the plan for that day, since phone browsers strip a photo's location
//   4. five photos a stop at most, then everything is added in one go (and can be undone)
const TLC_GAP = 45;
const TLC_PICK = 60;

const tlcMins = (x) => stMins(x.t);
const tlcRound = (m, up) =>
  tlT(Math.min(23 * 60 + 59, Math.max(0, (up ? Math.ceil : Math.floor)(m / 5) * 5)));
// The stop already logged that a group of photos falls inside (15 minutes' grace either side).
function tlcMatch(g) {
  const a = stMins(g.in) + 5,
    b = stMins(g.out) - 5;
  return tlDay(g.date).find((s) => {
    const sin = stMins(s.in) - 15,
      sout = (s.out ? stMins(s.out) : 24 * 60) + 15;
    return a <= sout && b >= sin;
  });
}
function tlcGroups(shots) {
  const sorted = [...shots].sort((x, y) => x.date.localeCompare(y.date) || tlcMins(x) - tlcMins(y)),
    groups = [];
  for (const x of sorted) {
    const g = groups[groups.length - 1],
      last = g?.shots[g.shots.length - 1];
    if (g && last.date === x.date && tlcMins(x) - tlcMins(last) <= TLC_GAP) g.shots.push(x);
    else groups.push({ date: x.date, shots: [x] });
  }
  return groups.map((g) => {
    const a = tlcMins(g.shots[0]),
      b = tlcMins(g.shots[g.shots.length - 1]),
      one = g.shots.length === 1,
      out = {
        ...g,
        // Rounded outwards to five minutes; a single photo gets a 45-minute guess around it.
        in: tlcRound(one ? a - 15 : a - 5),
        out: tlcRound(one ? a + 30 : b + 5, true),
        drop: false,
        stop: null,
      };
    const hit = tlcMatch(out);
    if (hit) out.join = hit.uid;
    return out;
  });
}
const tlcJoined = (g) => (g.join && TL.log.stops.find((s) => s.uid === g.join)) || null;
const tlcRoom = (g) => TLP_MAX - (tlcJoined(g)?.photos.length || 0);
const tlcReady = (g) => g.drop || ((tlcJoined(g) || g.stop) && g.shots.length <= tlcRoom(g));

function tlCatchDoor() {
  return `<button class="lg-addrow tl-catchdoor" data-action="tl-c-start">${icon('camera')} Catch up from photos</button><p class="filter-note tl-catchnote">Missed a place, or logging after the trip? Pick the best photos and they fall into places by the time they were taken.</p>`;
}
function tlCatchHtml() {
  const c = TL.catch;
  if (c.step === 1)
    return `<section class="lg-card"><p class="lg-kicker">${icon('camera')} Catch up from photos</p><h2>Pick the photos worth keeping</h2><p class="muted">From one day or several. Highlights only: a stop holds five. Only the time each photo was taken is read, and each is made small on this phone, which drops its location. Photos you do not pick never leave the phone.</p><label class="btn lg-big tl-catchpick">${icon('camera')} Choose photos<input type="file" accept="image/*" multiple></label><div class="lg-row tl-alt"><button class="btn text" data-action="tl-c-cancel">Cancel</button></div></section>`;
  const live = c.groups.filter((g) => !g.drop),
    ready = live.length && c.groups.every(tlcReady),
    added = live.filter((g) => !tlcJoined(g)).length,
    joined = live.length - added;
  return (
    `<section class="lg-card"><p class="lg-kicker">${icon('route')} Catch up from photos</p><h2>Is this how it went?</h2><p class="muted">${c.n} ${c.n === 1 ? 'photo' : 'photos'} fell into ${c.groups.length} ${c.groups.length === 1 ? 'place' : 'places'} by the time they were taken. Check each one.</p>${c.skipped ? `<p class="lg-warn">${c.skipped} ${c.skipped === 1 ? 'photo' : 'photos'} could not be read and ${c.skipped === 1 ? 'was' : 'were'} left out.</p>` : ''}</section>` +
    c.groups.map(tlcGroupHtml).join('') +
    `<div class="lg-row lg-sticky"><button class="btn" data-action="tl-c-commit" ${ready ? '' : 'disabled'}>${added ? `Add ${added} ${added === 1 ? 'place' : 'places'}` : ''}${added && joined ? ' and ' : ''}${joined ? `${added ? 'fill' : 'Fill'} ${joined} ${joined === 1 ? 'stop' : 'stops'}` : ''}${live.length ? '' : 'Nothing to add'}</button><button class="btn text" data-action="tl-c-cancel">Cancel</button></div>${ready ? '' : '<p class="filter-note">Something above still needs you before this can be added.</p>'}`
  );
}
function tlcGroupHtml(g, i) {
  const when = esc(stDate(g.date, { weekday: 'short', day: 'numeric', month: 'short' }));
  if (g.drop)
    return `<section class="lg-group dropped"><span>${when}, ${g.in}: left out</span><button class="inline-link" data-action="tl-c-drop" data-i="${i}">Put back</button></section>`;
  const hit = tlcJoined(g),
    room = tlcRoom(g),
    over = g.shots.length > room,
    head = hit
      ? `<div><h3>${esc(hit.name)}</h3><p>Already logged, ${hit.in}${hit.out ? ' to ' + hit.out : ''}. The photos join it.</p></div><button class="st-act" data-action="tl-c-where" data-i="${i}">Not here?</button>`
      : g.stop
        ? `<div><h3>${esc(g.stop.name || P[g.stop.place]?.name)}</h3><p>You chose this place</p></div><button class="st-act" data-action="tl-c-where" data-i="${i}">Change</button>`
        : `<div><h3>Where was this?</h3><p>${when}. Phones do not share a photo's location with web pages, so choose the place.</p></div><button class="btn small" data-action="tl-c-where" data-i="${i}">Choose the place</button>`;
  return `<section class="lg-group ${tlcReady(g) ? '' : 'needs'}" style="--day:${stColor(0)}"><header>${head}</header><div class="lg-strip">${g.shots.map((x) => `<button class="lg-shot on" data-action="tl-c-unpick" data-i="${i}" data-k="${esc(x.id)}" aria-label="Leave out the photo from ${x.t}"><span class="lg-thumb">${tlpImg(x.id)}</span><time>${x.t}</time>${over ? `<i>${icon('close')}</i>` : ''}</button>`).join('')}</div>${over ? `<p class="lg-warn">${g.shots.length} photos, and there is room for ${room}. Tap one to leave it out.</p>` : ''}<footer><span><strong>${when}, about ${g.in} to ${g.out}</strong> · ${g.shots.length === 1 ? 'a guess from one photo' : 'from the first and last photo'}${g.shots.some((x) => x.guess) ? ' (some had no time saved, so the file date was used)' : ''}</span><button class="st-act" data-action="tl-c-drop" data-i="${i}">Leave out</button></footer></section>`;
}
function tlCatchPins() {
  return TL.catch.step === 2
    ? TL.catch.groups
        .filter((g) => !g.drop)
        .map((g) => tlcJoined(g) || (g.stop && tlClean({ ...g.stop, date: g.date, in: g.in })))
        .filter(Boolean)
    : [];
}
function tlCatchPlace(stop) {
  const g = TL.catch?.groups[TL.picking];
  if (!g) return;
  g.stop = stop;
  g.join = '';
  tlShow();
}
async function tlCatchPick(input) {
  const files = [...(input.files || [])];
  input.value = '';
  if (!files.length) return;
  toast(
    `Reading ${Math.min(files.length, TLC_PICK)} ${files.length === 1 ? 'photo' : 'photos'}…`,
    null,
    60000,
  );
  const kept = await tlpAdd(files, TLC_PICK);
  if (!TL?.catch) return;
  $('.toast')?.remove();
  if (!kept.length) return toast('Those photos could not be read. Try others.');
  const extra = files.length - TLC_PICK;
  Object.assign(TL.catch, {
    step: 2,
    n: kept.length,
    skipped: Math.max(0, Math.min(files.length, TLC_PICK) - kept.length),
    groups: tlcGroups(kept),
  });
  TL.day = TL.catch.groups[0].date;
  tlShow();
  if (extra > 0) toast(`${TLC_PICK} photos at a time, so ${extra} were left for the next round.`);
  if (stStacked()) window.scrollTo({ top: 0 });
}
function tlCatchAction(a, b) {
  const c = TL.catch,
    i = Number(b.dataset.i),
    g = c?.groups[i];
  if (a === 'tl-c-start') {
    TL.catch = { step: 1, groups: [] };
    tlShow();
    if (stStacked()) window.scrollTo({ top: 0 });
  } else if (!c) return;
  else if (a === 'tl-c-cancel') {
    TL.catch = null;
    tlShow();
  } else if (a === 'tl-c-drop' && g) {
    g.drop = !g.drop;
    tlShow();
  } else if (a === 'tl-c-where' && g) tlElse(i);
  else if (a === 'tl-c-unpick' && g) {
    if (g.shots.length < 2)
      return toast('The last photo stays. Use "Leave out" to drop the place.');
    g.shots = g.shots.filter((x) => x.id !== b.dataset.k);
    tlShow();
  } else if (a === 'tl-c-commit') {
    const live = c.groups.filter((x) => !x.drop);
    if (!live.length || !c.groups.every(tlcReady)) return;
    const dates = [...new Set(live.map((x) => x.date))];
    TL.catch = null;
    tlChange(
      () => {
        for (const x of live) {
          const photos = x.shots.map((p) => ({ id: p.id, t: p.t, caption: '' })),
            hit = tlcJoined(x);
          if (hit) hit.photos.push(...photos);
          else
            TL.log.stops.push(
              tlClean({
                ...x.stop,
                uid: tlUid(),
                date: x.date,
                in: x.in,
                out: x.out,
                est: true,
                photos,
              }),
            );
        }
        TL.day = dates[0];
      },
      `${live.length} ${live.length === 1 ? 'place' : 'places'} caught up${dates.length > 1 ? ` across ${dates.length} days` : ''}.`,
    );
  }
}
document.addEventListener('change', (ev) => {
  if (TL?.catch && ev.target.matches('.tl-catchpick input')) tlCatchPick(ev.target);
});
