// Your log, told as a story (#/story/my-trip). The story page draws it exactly like the shared
// samples: route, days, time at each place and the photos you picked. Until accounts arrive it
// is built on this phone from the log, and only you can see it. To change it, fix the log.
const TL_STORY = 'my-trip';

// Builds the story from the log and makes its photos (kept in IndexedDB) drawable by photoTag.
async function tlStoryBuild() {
  const stops = tlRead().stops;
  if (!stops.length) return null;
  const ids = stops.flatMap((s) => s.photos.map((x) => x.id));
  await Promise.all(
    ids.map(async (id) => {
      try {
        if (!tlpUrls[id]) {
          const rec = await tlpGet(id);
          if (rec?.blob) tlpUrls[id] = URL.createObjectURL(rec.blob);
        }
        if (tlpUrls[id]) PHOTO[id] = { data: tlpUrls[id], alt: 'Your photo', own: true };
      } catch {
        // A photo that is no longer on the phone is simply left out of the story.
      }
    }),
  );
  const me = { id: stMe(), name: 'You', color: '#c8501f' },
    now = tlNow(),
    near = (s) => CITIES.filter((c) => c.lat).sort((a, b) => stKm(s, a) - stKm(s, b))[0]?.id || '',
    byDate = {};
  for (const s of stops) {
    const city = s.city || near(s);
    // A stop you are still at runs to now (or five minutes, if you only just arrived).
    const out = s.out || tlT(Math.max(stMins(s.in) + 5, s.date === tlToday() ? stMins(now) : 0));
    (byDate[s.date] ||= []).push({
      uid: s.uid,
      ...(s.place ? { place: s.place } : { name: s.name, area: s.area, lat: s.lat, lon: s.lon }),
      city,
      in: s.in,
      out: tlTime(out) || '23:59',
      by: me.id,
      note: s.note,
      photos: s.photos
        .filter((x) => PHOTO[x.id])
        .map((x) => ({ id: x.id, by: me.id, caption: x.caption })),
    });
  }
  const dates = Object.keys(byDate).sort(),
    cityIds = [...new Set(dates.flatMap((d) => byDate[d].map((s) => s.city)).filter(validCity))],
    names = (list) =>
      list.length < 4
        ? listNames(list)
        : `${list.slice(0, 2).join(', ')} and ${list.length - 2} more`,
    firstPhoto = ids.find((id) => PHOTO[id]),
    firstPlace = stops.find((s) => s.place)?.place;
  return (STORIES[TL_STORY] = {
    local: true,
    title: cityIds.length ? listNames(cityIds.map((id) => C[id].name)) : 'Your trip',
    blurb: 'Logged as it happened',
    cover: firstPhoto || firstPlace || '',
    country: [...new Set(cityIds.map((id) => C[id].country))].join(' and '),
    travellers: [me],
    audience: 'travellers',
    viewers: [],
    days: dates.map((d) => ({
      date: d,
      city: [...new Set(byDate[d].map((s) => C[s.city]?.name).filter(Boolean))].join(' and '),
      title: names(byDate[d].map((s) => (s.place ? P[s.place].name : s.name))),
      stops: byDate[d],
    })),
  });
}
function renderMyStory() {
  headerActive('trip');
  $('#app').innerHTML = loadingPage();
  const at = location.hash;
  tlStoryBuild().then(
    (st) => {
      if (location.hash !== at) return;
      if (st) return renderStory(TL_STORY);
      $('#app').innerHTML =
        `<div class="wrap"><section class="empty">${icon('pin')}<h1>Nothing logged yet</h1><p class="muted">Tap "I'm here" when you arrive somewhere, or catch up from photos afterwards. Your story builds itself from that.</p><a class="btn" href="#/log">Log the trip</a></section></div>`;
    },
    () => location.hash === at && ($('#app').innerHTML = loadFailed()),
  );
}
const tlStoryDoor = () =>
  TL.log.stops.length
    ? `<a class="lg-try tl-storydoor" href="#/story/${TL_STORY}">${icon('route')}<span><strong>See it as a story</strong><small>The route, the time at each place and your photos, built from this log. Only you can see it.</small></span>${icon('arrow')}</a>`
    : '';
