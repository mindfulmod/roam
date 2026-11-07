'use strict';
// Share a trip as a link. The whole plan (cities, days, dates, pace, travellers and the saved
// places in those cities) is packed into the URL after #/t/, so there is no server and nothing
// to sign up for. Notes, hotel addresses and budgets stay on the device.
// Loaded before app.js: top-level code only defines functions.
const SHARE_HOME = 'https://mindfulmod.github.io/roam/';

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
function unb64url(str) {
  const s = atob(str.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
async function streamBytes(bytes, stream) {
  return new Uint8Array(
    await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer(),
  );
}
// "z" + deflated JSON where the browser can compress, "j" + plain JSON otherwise.
async function packShare(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === 'function') {
    try {
      return 'z' + b64url(await streamBytes(raw, new CompressionStream('deflate-raw')));
    } catch (e) {}
  }
  return 'j' + b64url(raw);
}
async function unpackShare(code) {
  const kind = code[0],
    bytes = unb64url(code.slice(1));
  const raw =
    kind === 'z'
      ? await streamBytes(bytes, new DecompressionStream('deflate-raw'))
      : kind === 'j'
        ? bytes
        : null;
  if (!raw) throw Error('Unknown link format');
  return JSON.parse(new TextDecoder().decode(raw));
}
function tripPayload() {
  const days = {};
  for (const id of S.trip) days[id] = S.days[id] || C[id].days;
  return {
    v: 1,
    t: S.trip,
    d: days,
    s: S.saved.filter((id) => S.trip.includes(P[id]?.cityId)),
    sd: S.startDate || undefined,
    p: S.people > 1 ? S.people : undefined,
    pc: S.pace !== 'balanced' ? S.pace : undefined,
  };
}
// Back to a clean, validated plan; anything unknown is dropped.
function cleanShared(x) {
  if (!x || x.v !== 1 || !Array.isArray(x.t)) throw Error('Not a Roam Atlas trip link');
  const st = cleanState({
    trip: x.t,
    days: x.d,
    saved: x.s,
    startDate: x.sd,
    people: x.p,
    pace: x.pc,
  });
  if (!st.trip.length) throw Error('This trip link has no destinations');
  return st;
}
function shareBase() {
  return /^https?:$/.test(location.protocol) ? location.origin + location.pathname : SHARE_HOME;
}
function tripTitle(ids) {
  const names = ids.map((id) => C[id].name);
  if (names.length <= 3)
    return names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names.at(-1)}` : names[0];
  return `${names.slice(0, 2).join(', ')} & ${names.length - 2} more`;
}
function tripLength(st) {
  return (
    st.trip.reduce((t, id) => t + (st.days[id] || C[id].days), 0) + Math.max(0, st.trip.length - 1)
  );
}
function shortDate(d) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
async function shareTrip() {
  if (!S.trip.length) {
    toast('Add a destination first, then share the trip.');
    return;
  }
  const url = shareBase() + '#/t/' + (await packShare(tripPayload())),
    title = `${tripTitle(S.trip)} · ${tripLength(S)} days`,
    text = `Here’s my trip plan: ${title}`;
  // Phones get the system share sheet (Messages, WhatsApp, email…); everyone else a copy box.
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ title, text, url });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  showModal(
    `<div class="modalcontent share-modal"><span class="eyebrow">SHARE YOUR TRIP</span><h2>${esc(title)}</h2><p class="muted">Anyone with this link can see your route, days, dates and saved places, and copy the trip into their own Roam Atlas.</p><div class="share-line"><input id="share-url" readonly value="${esc(url)}" aria-label="Trip link" onfocus="this.select()"><button class="btn" data-action="share-copy">${icon('link')} Copy link</button></div><p class="filter-note">Your notes, hotel addresses and budget aren’t included. If you change the trip later, share a new link.</p></div>`,
    'Share trip',
  );
  $('#share-url')?.select();
}
async function copyShareUrl() {
  const input = $('#share-url');
  if (!input) return;
  try {
    await navigator.clipboard.writeText(input.value);
  } catch (e) {
    input.select();
    document.execCommand?.('copy');
  }
  toast('Link copied. Paste it into a message.');
}

// ---------- The page a shared link opens ----------
let sharedTrip = null;
async function renderShared(code) {
  headerActive('trip');
  $('#app').innerHTML =
    '<div class="wrap"><p class="muted" style="padding:40px 0">Opening the trip…</p></div>';
  try {
    sharedTrip = cleanShared(await unpackShare(code));
  } catch (e) {
    sharedTrip = null;
    $('#app').innerHTML =
      `<div class="wrap"><div class="empty">${icon('route')}<h2>This trip link doesn’t open.</h2><p>It may have been cut off when it was copied. Ask for the link again, or start your own trip.</p><a href="#/" class="btn">Start exploring ${icon('arrow')}</a></div>${footer()}</div>`;
    return;
  }
  const st = sharedTrip,
    start = st.startDate ? new Date(st.startDate + 'T12:00:00') : null,
    total = tripLength(st);
  let offset = 0;
  const stops = st.trip
    .map((id, i) => {
      const c = C[id],
        days = st.days[id] || c.days,
        arrive = start && new Date(start.getTime() + offset * 864e5),
        picks = st.saved.filter((p) => P[p].cityId === id);
      offset += days + 1;
      return `<article class="shared-stop"><button class="shared-photo" data-action="city" data-id="${id}" aria-label="Explore ${esc(c.name)}">${photoTag(id)}<span class="route-number">${i + 1}</span></button><div class="shared-body"><h3><a href="#/city/${id}">${esc(c.name)}</a></h3><p>${esc(c.country)} · ${days} day${days > 1 ? 's' : ''}${arrive ? ` · from ${arrive.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</p>${picks.length ? `<div class="shared-picks">${picks.map((p) => `<button class="chip" data-action="place" data-id="${p}">${icon('heart')} ${esc(P[p].name)}</button>`).join('')}</div>` : `<p class="muted shared-tag">${esc(c.tagline)}</p>`}</div></article>`;
    })
    .join('');
  const meta = [
    `${total} days`,
    `${st.trip.length} stop${st.trip.length > 1 ? 's' : ''}`,
    start ? `from ${shortDate(start)}` : '',
    st.people > 1 ? `${st.people} travellers` : '',
  ].filter(Boolean);
  $('#app').innerHTML =
    `<div class="wrap shared-page"><section class="shared-hero">${photoTag(st.trip[0], '', false)}<div class="shared-hero-copy"><span class="eyebrow">A TRIP SHARED WITH YOU</span><h1>${esc(tripTitle(st.trip))}</h1><p>${meta.join(' · ')}</p><div class="actions"><button class="btn" data-action="shared-take">${icon('plus')} Make this my trip</button><a class="btn light" href="#/map">${icon('map')} Browse the map</a></div></div></section><div class="trip-layout"><section class="shared-stops">${stops}</section><aside>${sharedCost(st)}</aside></div>${footer()}</div>`;
}
// What the shared trip would cost the person viewing it, from their own home city.
function sharedCost(st) {
  const keep = {
    trip: S.trip,
    days: S.days,
    startDate: S.startDate,
    people: S.people,
    lodging: S.lodging,
    extra: S.extra,
  };
  try {
    Object.assign(S, {
      trip: st.trip,
      days: { ...S.days, ...st.days },
      startDate: st.startDate,
      people: st.people,
      lodging: {},
      extra: {},
    });
    return tripReceipt();
  } finally {
    Object.assign(S, keep);
  }
}
function takeSharedTrip(mode) {
  const st = sharedTrip;
  if (!st) return;
  if (!mode && S.trip.length) {
    showModal(
      `<div class="modalcontent"><h2>You already have a trip planned.</h2><p class="muted">Your trip has ${S.trip.length} destination${S.trip.length > 1 ? 's' : ''}. Replace it with this one, or add these cities to the end of yours?</p><div class="actions"><button class="btn" data-action="shared-take" data-mode="replace">Replace my trip</button><button class="btn light" data-action="shared-take" data-mode="add">Add to my trip</button></div><p class="filter-note">Either way, your saved places and notes stay.</p></div>`,
      'Use this trip',
    );
    return;
  }
  const add = mode === 'add';
  S.trip = add ? [...new Set([...S.trip, ...st.trip])] : [...st.trip];
  Object.assign(S.days, st.days);
  S.saved = [...new Set([...S.saved, ...st.saved])];
  if (!add) {
    S.startDate = st.startDate;
    S.pace = st.pace;
    S.people = st.people;
  }
  persist();
  closeModal();
  location.hash = '#/trip';
  toast(add ? 'Added to your trip.' : 'This is now your trip. Make it your own.');
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const a = t.dataset.action;
  if (a === 'share') shareTrip();
  else if (a === 'share-copy') copyShareUrl();
  else if (a === 'shared-take') takeSharedTrip(t.dataset.mode || '');
  else if (a === 'theme') cycleTheme();
});
