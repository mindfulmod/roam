// Highlight photos for your own trip log: up to five per stop, picked from the phone's own photo
// picker. Each one is shrunk on the phone (longest side 1600 px, JPEG) before it is kept, which
// also drops everything hidden in the file, location included. Only the time it was taken is read
// first. They live in this browser's IndexedDB, next to the log in localStorage, so no signal is
// needed. When accounts arrive, these small copies are what gets uploaded.
const TLP_DB = 'roam-trip-photos';
const TLP_MAX = 5;
const TLP_EDGE = 1600;
const TLP_ID = /^u[a-z0-9]{6,30}$/;
const tlpUrls = {};
let tlpOpen = null;

function tlpDb() {
  if (!tlpOpen)
    tlpOpen = new Promise((ok, no) => {
      if (!window.indexedDB) return no(new Error('no IndexedDB'));
      const r = indexedDB.open(TLP_DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('photos');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => no(r.error);
    }).catch((e) => {
      tlpOpen = null;
      throw e;
    });
  return tlpOpen;
}
async function tlpTx(mode, fn) {
  const db = await tlpDb();
  return new Promise((ok, no) => {
    const tx = db.transaction('photos', mode),
      out = fn(tx.objectStore('photos'));
    tx.oncomplete = () => ok(out?.result);
    tx.onerror = tx.onabort = () => no(tx.error);
  });
}
const tlpGet = (id) => tlpTx('readonly', (s) => s.get(id));
const tlpKeys = () => tlpTx('readonly', (s) => s.getAllKeys());
const tlpPut = (id, rec) => tlpTx('readwrite', (s) => s.put(rec, id));
const tlpDel = (ids) => tlpTx('readwrite', (s) => ids.forEach((id) => s.delete(id)));

// The time a photo was taken, from the EXIF DateTimeOriginal tag of a JPEG, read on the phone.
// Returns { date: 'YYYY-MM-DD', t: 'HH:MM' } or null. Nothing else in the file is looked at.
async function tlpTaken(file) {
  try {
    const v = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (v.getUint16(0) !== 0xffd8) return null;
    let o = 2;
    while (o + 4 < v.byteLength) {
      const mark = v.getUint16(o),
        len = v.getUint16(o + 2);
      if (mark === 0xffe1 && v.getUint32(o + 4) === 0x45786966) return tlpExif(v, o + 10);
      if ((mark & 0xff00) !== 0xff00 || mark === 0xffda) return null;
      o += 2 + len;
    }
  } catch {
    // An unreadable file simply has no time.
  }
  return null;
}
function tlpExif(v, t) {
  const le = v.getUint16(t) === 0x4949,
    u16 = (o) => v.getUint16(t + o, le),
    u32 = (o) => v.getUint32(t + o, le);
  const find = (ifd, tag) => {
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (u16(e) === tag) return e;
    }
    return -1;
  };
  const sub = find(u32(4), 0x8769);
  if (sub < 0) return null;
  const e = find(u32(sub + 8), 0x9003);
  if (e < 0) return null;
  const at = u32(e + 8);
  let s = '';
  for (let i = 0; i < 19; i++) s += String.fromCharCode(v.getUint8(t + at + i));
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2})/.exec(s);
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`,
    time = `${m[4]}:${m[5]}`;
  return validDate(date) && tlTime(time) ? { date, t: time } : null;
}
// Shrinks a photo to a small JPEG. Drawing it onto a canvas keeps only the pixels.
async function tlpShrink(file) {
  const img = await createImageBitmap(file, { imageOrientation: 'from-image' }),
    k = Math.min(1, TLP_EDGE / Math.max(img.width, img.height)),
    c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  img.close?.();
  return new Promise((ok, no) =>
    c.toBlob((b) => (b ? ok(b) : no(new Error('could not shrink'))), 'image/jpeg', 0.82),
  );
}
// Keeps up to `room` of the picked files. Returns [{ id, date, t }] for those kept.
async function tlpAdd(files, room) {
  const list = [...files].filter((f) => f.type.startsWith('image/')).slice(0, Math.max(0, room)),
    kept = [];
  navigator.storage?.persist?.().catch(() => {});
  for (const f of list) {
    try {
      const when = (await tlpTaken(f)) || tlpModified(f),
        blob = await tlpShrink(f),
        id = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      await tlpPut(id, { blob, ...when });
      kept.push({ id, ...when });
    } catch {
      // A photo this browser cannot open (or store) is skipped; the count tells the person.
    }
  }
  return kept;
}
function tlpModified(f) {
  const d = new Date(f.lastModified || Date.now());
  return { date: tlToday(d), t: tlNow(d), guess: true };
}
const tlpImg = (id, cls = '') =>
  `<img class="tl-photo ${cls}" data-tlp="${esc(id)}" alt="Your photo" decoding="async">`;
// Fills in every photo on screen once its file is read from the phone's storage.
function tlpFill(root = document) {
  root.querySelectorAll('img[data-tlp]:not([src])').forEach(async (img) => {
    const id = img.dataset.tlp;
    try {
      if (!tlpUrls[id]) {
        const rec = await tlpGet(id);
        if (!rec?.blob) throw new Error('gone');
        tlpUrls[id] = URL.createObjectURL(rec.blob);
      }
      img.src = tlpUrls[id];
    } catch {
      img.classList.add('missing');
      img.alt = 'Photo no longer on this phone';
    }
  });
}
// Photos no stop points to any more (removed, and the undo has long gone) are deleted when the
// log next opens.
async function tlpTidy(stops) {
  try {
    const used = new Set(stops.flatMap((s) => s.photos.map((x) => x.id))),
      gone = (await tlpKeys()).filter((k) => !used.has(k));
    if (gone.length) await tlpDel(gone);
  } catch {
    // Nothing to tidy without IndexedDB.
  }
}
