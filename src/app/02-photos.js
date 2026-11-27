// Extra photos per place/city from Wikimedia Commons (hotlinked thumbnails, loaded on demand).
// data/gallery.json stores each photo as [file, hash, width, height, author, licence].
const galleryEntry = ([f, hh, w, h, a, l]) => ({ f, hh, w, h, a, l });
const GALLERY = Object.fromEntries(
  Object.entries(DATA.gallery || {}).map(([id, list]) => [id, list.map(galleryEntry)]),
);
const commonsName = (f) =>
  encodeURIComponent(f.replace(/ /g, '_')).replace(
    /[!'()*]/g,
    (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase(),
  );
function licenceUrl(l) {
  // Ported licences such as "CC BY-SA 3.0 de" link to their own country version.
  const m = l.match(/^CC (BY(?:-SA)?) ([0-9.]+)(?: ([a-z]{2,3}))?/i);
  if (m)
    return `https://creativecommons.org/licenses/${m[1].toLowerCase()}/${m[2]}/${m[3] ? m[3].toLowerCase() + '/' : ''}`;
  if (/^CC0/i.test(l)) return 'https://creativecommons.org/publicdomain/zero/1.0/';
  return '';
}
// A Commons file name read as the photo's title: "File:Kinkaku-ji 2019.jpg" -> "Kinkaku-ji 2019".
const commonsTitle = (f) =>
  String(f || '')
    .replace(/^File:/i, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/_/g, ' ')
    .trim();
// Title, author, source and licence, as the Commons licences ask, plus what we changed.
function commonsCredit(title, author, page, licence, lu, changes) {
  const a = (author || '').trim(),
    l = (licence || '').trim() || 'See licence on Commons';
  return `<a href="${esc(page)}" target="_blank" rel="noopener noreferrer">“${esc(title)}”</a>${a ? ' by ' + esc(a) : ''} · Wikimedia Commons · <a href="${esc(lu || page)}" target="_blank" rel="noopener noreferrer">${esc(l)}</a> · ${changes}`;
}
function galleryFor(id) {
  return GALLERY[id] || [];
}
function galleryUrl(g, w = 960) {
  const n = commonsName(g.f);
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${g.hh[0]}/${g.hh}/${n}/${w}px-${n}`;
}
function galleryImg(g, lazy = true, sizes = '(max-width: 700px) 100vw, 760px') {
  return `<img class="photo" src="${esc(galleryUrl(g, 960))}" srcset="${esc(galleryUrl(g, 500))} 500w, ${esc(galleryUrl(g, 960))} 960w" sizes="${sizes}" width="${g.w}" height="${g.h}" alt="${esc(g.f.replace(/\.[a-z]+$/i, '').replace(/[_-]+/g, ' '))}" ${lazy ? 'loading="lazy"' : ''} decoding="async" referrerpolicy="no-referrer" data-drop="gallery">`;
}
function galleryCredit(g) {
  const page = 'https://commons.wikimedia.org/wiki/File:' + commonsName(g.f);
  return commonsCredit(
    commonsTitle(g.f),
    g.a,
    page,
    g.l,
    licenceUrl(g.l),
    'resized, colours adjusted',
  );
}
function photoCount(id) {
  // Before a city's detail arrives, the main data file still knows how many photos it has.
  const n = galleryFor(id).length || GALLERY_N[id] || 0;
  return n
    ? `<span class="photo-count" title="${n + 1} photos">${icon('camera')}${n + 1}</span>`
    : '';
}
// Photo area of a place sheet, as X and Instagram show a post's photos: the main photo is a
// swipeable track you can flick through at once, with a strip of thumbnails underneath that
// jumps to any photo and follows the swipe. Tapping a photo still opens the full-screen viewer.
function galleryHero(id, firstSlide, label) {
  return galleryCarousel(id, firstSlide, label);
}
// One thumbnail button. A Commons thumbnail that fails to load drops out of the strip.
function galleryThumb(src, i, n, commons) {
  return `<button class="gthumb${i ? '' : ' on'}" data-action="gal-thumb" data-i="${i}" aria-label="Photo ${i + 1} of ${n}"${i ? '' : ' aria-current="true"'}><img src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"${commons ? ' data-drop="thumb"' : ''}></button>`;
}
// The thumbnail strip under a place's carousel. `first` is the main visual's image URL.
function galleryThumbs(id, first) {
  const gal = galleryFor(id),
    n = gal.length + 1;
  if (!gal.length) return '';
  return `<div class="gthumbs" role="group" aria-label="Choose a photo">${first ? galleryThumb(first, 0, n) : ''}${gal.map((g, i) => galleryThumb(galleryUrl(g, 250), i + 1, n, true)).join('')}</div>`;
}
// Swipeable carousel: first slide is the existing main visual, then the Commons photos.
function galleryCarousel(id, firstSlide, label) {
  const gal = galleryFor(id),
    open = (i) =>
      `data-action="gal-open" data-id="${id}" data-i="${i}" role="button" tabindex="-1" aria-label="View photo ${i + 1} full screen"`;
  const slides =
    `<figure class="gslide" data-gslide data-k="0" id="place-visual-main" ${open(0)}>${firstSlide}</figure>` +
    gal
      .map(
        (g, i) =>
          `<figure class="gslide" data-gslide data-k="${i + 1}" ${open(i + 1)}>${galleryImg(g)}<figcaption class="photo-caption">${galleryCredit(g)}</figcaption></figure>`,
      )
      .join('');
  const expand = `<span class="gexpand" aria-hidden="true">${icon('expand')}</span>`;
  if (!gal.length) return `<div class="gtrack single">${slides}</div>${expand}`;
  return `<div class="gtrack" tabindex="0" aria-label="${esc(label)}" data-gtrack>${slides}</div><button class="gnav prev" data-action="gal-step" data-dir="-1" aria-label="Previous photo">${icon('left')}</button><button class="gnav next" data-action="gal-step" data-dir="1" aria-label="Next photo">${icon('arrow')}</button><span class="gcount" aria-live="polite">1 / ${gal.length + 1}</span>${expand}`;
}
function galleryScope(el) {
  return el.closest('[data-gscope]') || document;
}
function galleryGo(scope, i) {
  const t = scope.querySelector('[data-gtrack]');
  if (!t) return;
  const slides = t.querySelectorAll('[data-gslide]');
  i = Math.max(0, Math.min(slides.length - 1, i));
  t.scrollTo({ left: slides[i].offsetLeft, behavior: 'smooth' });
}
// Thumbnails keep the number of the photo they show, so a photo that fails to load can drop
// out without the strip pointing at the wrong slide.
function gallerySlideFor(scope, k) {
  const slides = [...scope.querySelectorAll('[data-gslide]')];
  return Math.max(
    0,
    slides.findIndex((s) => s.dataset.k === String(k)),
  );
}
// A Commons photo that will not load leaves the gallery. The count and thumbnails follow, and a
// city's photo section with nothing left to show disappears rather than leaving an empty frame.
// Images say how to fail with data-drop instead of an onerror="…" attribute, which the page's
// security policy would refuse. Load errors do not bubble, so this listens on the way down.
document.addEventListener(
  'error',
  (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.drop) return;
    if (img.dataset.drop === 'gallery') galleryDrop(img);
    else img.closest('.gthumb')?.remove();
  },
  true,
);
function galleryDrop(img) {
  const slide = img.closest('[data-gslide],.cityphoto,.gtile'),
    scope = img.closest('[data-gscope]');
  if (!slide) return;
  const k = slide.dataset.k;
  slide.remove();
  if (!scope) return;
  const n = scope.querySelectorAll('[data-gslide]').length;
  if (!n && scope.matches('.cityphotos')) return scope.remove();
  if (k != null) scope.querySelector(`.gthumb[data-i="${k}"]`)?.remove();
  if (n < 2) {
    scope.querySelectorAll('.gnav,.gcount,.gthumbs').forEach((x) => x.remove());
    return;
  }
  const t = scope.querySelector('[data-gtrack]'),
    c = scope.querySelector('.gcount');
  if (c && t) c.textContent = `${galleryIndex(t) + 1} / ${n}`;
  scope
    .querySelectorAll('.gthumb')
    .forEach((b, j) => b.setAttribute('aria-label', `Photo ${j + 1} of ${n}`));
}
function galleryIndex(t) {
  return Math.round(t.scrollLeft / Math.max(1, t.clientWidth));
}
document.addEventListener(
  'scroll',
  (e) => {
    const t = e.target;
    if (!(t instanceof Element) || !t.matches('[data-gtrack]')) return;
    const scope = galleryScope(t),
      i = galleryIndex(t),
      n = t.querySelectorAll('[data-gslide]').length;
    const c = scope.querySelector('.gcount'),
      k = t.querySelectorAll('[data-gslide]')[i]?.dataset.k;
    if (c) c.textContent = `${i + 1} / ${n}`;
    scope.querySelectorAll('.gthumb').forEach((b) => {
      const on = b.dataset.i === k;
      b.classList.toggle('on', on);
      if (!on) return b.removeAttribute('aria-current');
      b.setAttribute('aria-current', 'true');
      const strip = b.parentElement;
      strip.scrollTo({
        left: b.offsetLeft - strip.clientWidth / 2 + b.clientWidth / 2,
        behavior: 'smooth',
      });
    });
  },
  true,
);
document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (!(t instanceof Element) || !t.matches('[data-gtrack]')) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault();
    galleryGo(galleryScope(t), galleryIndex(t) + (e.key === 'ArrowRight' ? 1 : -1));
  }
});
function cityPhotos(c) {
  const gal = galleryFor(c.id),
    n = gal.length;
  if (!n) return '';
  // Same pattern as a place: a big photo to swipe through, thumbnails underneath.
  const open = (i) =>
    `data-action="city-photos" data-id="${c.id}" data-i="${i + 1}" role="button" tabindex="-1" aria-label="View photo ${i + 1} of ${esc(c.name)} full screen"`;
  const slides = gal
    .map(
      (g, i) =>
        `<figure class="gslide" data-gslide data-k="${i}" ${open(i)}>${galleryImg(g, i > 0, '(max-width: 700px) 100vw, 900px')}<figcaption class="photo-caption">${galleryCredit(g)}</figcaption></figure>`,
    )
    .join('');
  const nav =
    n > 1
      ? `<button class="gnav prev" data-action="gal-step" data-dir="-1" aria-label="Previous photo">${icon('left')}</button><button class="gnav next" data-action="gal-step" data-dir="1" aria-label="Next photo">${icon('arrow')}</button><span class="gcount" aria-live="polite">1 / ${n}</span>`
      : '';
  const thumbs =
    n > 1
      ? `<div class="gthumbs" role="group" aria-label="Choose a photo">${gal.map((g, i) => galleryThumb(galleryUrl(g, 250), i, n, true)).join('')}</div>`
      : '';
  return `<section class="cityphotos" aria-label="Photos of ${esc(c.name)}" data-gscope><div class="cityphotos-head"><h3>${icon('camera')} See what to expect</h3><small>${n} photos · Wikimedia Commons</small></div><div class="citygallery"><div class="gtrack" tabindex="0" aria-label="Photos of ${esc(c.name)}" data-gtrack>${slides}</div>${nav}</div>${thumbs}</section>`;
}
/* ------------------------------------------------------------------
   Full-screen photo viewer (Google Photos, Instagram, Unsplash).
   Dark backdrop, the whole photo uncropped at the largest size that
   fits, a filmstrip and credit underneath. Click or double-tap to zoom
   where you point, scroll or pinch to zoom further, drag to pan. Swipe
   or arrow keys to move, swipe down / Esc / Back to close.
   ------------------------------------------------------------------ */
let VW = null;
const commonsOriginal = (g) =>
  `https://upload.wikimedia.org/wikipedia/commons/${g.hh[0]}/${g.hh}/${commonsName(g.f)}`;
function viewerItems(id, scope) {
  const name = P[id]?.name || C[id]?.name || '';
  // The first photo is whatever the sheet shows now (a place may be on its illustration).
  const main = scope?.querySelector('#place-visual-main');
  const mainImg = main?.querySelector('img');
  const first = mainImg
    ? {
        src: mainImg.currentSrc || mainImg.src,
        alt: mainImg.alt,
        vivid: mainImg.classList.contains('photo'),
        credit: main.querySelector('.photo-caption')?.innerHTML || '',
      }
    : PHOTO[id]
      ? { src: PHOTO[id].data, alt: PHOTO[id].alt || name, vivid: true, credit: photoCredit(id) }
      : ART[id]
        ? { src: ART[id].data, alt: ART[id].alt, vivid: false, credit: artCaption(id) }
        : null;
  const items = first ? [{ ...first, thumb: first.src, r: 0 }] : [];
  for (const g of galleryFor(id))
    items.push({
      g,
      src: galleryUrl(g, 1920),
      thumb: galleryUrl(g, 500),
      alt: g.f.replace(/\.[a-z]+$/i, '').replace(/[_-]+/g, ' '),
      vivid: true,
      credit: galleryCredit(g),
      r: g.w / g.h,
    });
  return { name, items };
}
function openViewer(id, start = 0, from) {
  const scope = from?.closest('[data-gscope]');
  const { name, items } = viewerItems(id, scope);
  if (!items.length) return;
  closeViewer('swap');
  const n = items.length,
    one = n < 2;
  const x = document.createElement('div');
  x.className = 'viewer' + (one ? ' one' : '');
  x.setAttribute('role', 'dialog');
  x.setAttribute('aria-modal', 'true');
  x.setAttribute('aria-label', 'Photos of ' + name);
  x.innerHTML = `<div class="vw-top"><span class="vw-count" aria-live="polite"></span><span class="vw-title">${esc(name)}</span><div class="vw-tools"><button class="vw-btn" data-vw="zoom" aria-label="Zoom in" title="Zoom (Z)">${icon('zoomin')}</button><button class="vw-btn" data-vw="close" aria-label="Close photos" title="Close (Esc)">${icon('close')}</button></div></div><div class="vw-track">${items
    .map(
      (it, i) =>
        `<div class="vw-slide" data-i="${i}"><img class="vw-img${it.vivid ? ' photo' : ''}" data-src="${esc(it.src)}" alt="${esc(it.alt)}" draggable="false" decoding="async" referrerpolicy="no-referrer"><span class="vw-miss">This photo needs an internet connection.</span></div>`,
    )
    .join(
      '',
    )}</div><button class="vw-nav prev" data-vw="prev" aria-label="Previous photo">${icon('left')}</button><button class="vw-nav next" data-vw="next" aria-label="Next photo">${icon('arrow')}</button><div class="vw-foot"><div class="vw-credit"></div>${
    one
      ? ''
      : `<div class="vw-strip" role="group" aria-label="Choose a photo">${items
          .map(
            (it, i) =>
              `<button class="vw-thumb" data-vw="go" data-i="${i}" aria-label="Photo ${i + 1} of ${n}"><img src="${esc(it.thumb)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false"></button>`,
          )
          .join('')}</div>`
  }</div>`;
  document.body.appendChild(x);
  const track = x.querySelector('.vw-track');
  VW = {
    x,
    track,
    items,
    i: -1,
    z: { s: 1, x: 0, y: 0 },
    id,
    scope,
    focus: document.activeElement,
    overflow: document.body.style.overflow,
  };
  document.body.style.overflow = 'hidden';
  x.querySelectorAll('.vw-img').forEach((img) => {
    img.addEventListener('load', () => img.parentElement.classList.add('loaded'));
    img.addEventListener('error', () => viewerImgFailed(img));
  });
  track.addEventListener(
    'scroll',
    () => {
      // While an arrow or thumbnail click is gliding to a photo, ignore the frames in between.
      if (VW?.target != null) {
        if (Math.round(track.scrollLeft / Math.max(1, track.clientWidth)) !== VW.target) return;
        VW.target = null;
      }
      viewerSync();
    },
    { passive: true },
  );
  viewerGestures(x, track);
  history.pushState({ ...(history.state || {}), roamViewer: 1 }, '');
  VW.history = true;
  requestAnimationFrame(() => {
    track.scrollLeft = start * track.clientWidth;
    viewerSync(start);
    x.classList.add('open');
    x.querySelector('[data-vw="close"]').focus({ preventScroll: true });
  });
}
// Show the 1920px rendition; if it can't load, try the original file before giving up.
function viewerImgFailed(img) {
  const it = VW?.items[+img.closest('.vw-slide').dataset.i];
  if (it?.g && img.dataset.tried !== 'orig') {
    img.dataset.tried = 'orig';
    img.src = commonsOriginal(it.g);
  } else img.parentElement.classList.add('missing');
}
function viewerLoad(i) {
  const img = VW.x.querySelectorAll('.vw-img')[i];
  if (img && !img.getAttribute('src')) img.src = img.dataset.src;
}
function viewerSync(force) {
  if (!VW) return;
  const { x, track, items } = VW;
  const i =
    force ??
    Math.max(
      0,
      Math.min(items.length - 1, Math.round(track.scrollLeft / Math.max(1, track.clientWidth))),
    );
  if (i === VW.i) return;
  if (VW.i >= 0) viewerZoom(1);
  VW.i = i;
  [i, i + 1, i - 1].forEach((k) => k >= 0 && k < items.length && viewerLoad(k));
  x.querySelector('.vw-count').textContent = items.length > 1 ? `${i + 1} / ${items.length}` : '';
  x.querySelector('.vw-credit').innerHTML = items[i].credit;
  x.querySelector('.prev').disabled = i === 0;
  x.querySelector('.next').disabled = i === items.length - 1;
  x.querySelectorAll('.vw-thumb').forEach((b) => {
    const on = +b.dataset.i === i;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'true');
    else b.removeAttribute('aria-current');
    if (on) {
      const s = b.parentElement;
      s.scrollTo({ left: b.offsetLeft - (s.clientWidth - b.offsetWidth) / 2, behavior: 'smooth' });
    }
  });
}
function viewerGo(i) {
  if (!VW) return;
  i = Math.max(0, Math.min(VW.items.length - 1, i));
  viewerZoom(1);
  VW.target = i;
  clearTimeout(VW.targetTimer);
  VW.targetTimer = setTimeout(() => VW && (VW.target = null), 900);
  VW.track.scrollTo({ left: i * VW.track.clientWidth, behavior: 'smooth' });
  viewerSync(i);
}
function closeViewer(how = 'user') {
  if (!VW) return;
  const v = VW;
  VW = null;
  v.x.remove();
  document.body.style.overflow = v.overflow;
  // Leave the sheet's carousel on the photo you were last looking at.
  const t = v.scope?.querySelector('[data-gtrack]');
  const s = t?.querySelectorAll('[data-gslide]')[v.i];
  if (s) t.scrollLeft = s.offsetLeft;
  if (how !== 'swap' && v.focus?.isConnected) v.focus.focus({ preventScroll: true });
  if (v.history && how !== 'history' && history.state?.roamViewer) history.back();
}
window.addEventListener('popstate', () => {
  if (VW && !history.state?.roamViewer) closeViewer('history');
});
// Photo credits and map credits stay behind a small "i" until asked for.
document.addEventListener(
  'click',
  (e) => {
    const c = e.target.closest?.('.hero-credit, .photo-caption');
    if (!c || !c.querySelector('a') || c.querySelector('br')) return;
    const open = c.classList.contains('open');
    if (open && e.target.closest('a')) return;
    e.preventDefault();
    e.stopPropagation();
    c.classList.toggle('open', !open);
  },
  true,
);
// The photo's on-screen box inside its slide (the image is object-fit: contain).
function viewerBox() {
  const slide = VW.x.querySelectorAll('.vw-slide')[VW.i],
    img = slide.querySelector('img'),
    W = slide.clientWidth,
    H = slide.clientHeight,
    r = img.naturalWidth ? img.naturalWidth / img.naturalHeight : VW.items[VW.i].r || W / H,
    w = Math.min(W, H * r);
  return { slide, img, W, H, w, h: w / r };
}
// Zoom to scale s, keeping the point (px, py), measured from the slide's centre, still.
function viewerZoom(s, px = 0, py = 0, animate = true) {
  if (!VW || VW.i < 0) return;
  const { img, W, H, w, h } = viewerBox(),
    z = VW.z;
  s = Math.max(1, Math.min(5, s));
  z.x = px - ((px - z.x) * s) / z.s;
  z.y = py - ((py - z.y) * s) / z.s;
  z.s = s;
  viewerPan(0, 0, { img, W, H, w, h }, animate);
  if (s > 1.6) viewerSharpen();
}
function viewerPan(dx, dy, box = viewerBox(), animate = false) {
  const z = VW.z,
    mx = Math.max(0, (box.w * z.s - box.W) / 2),
    my = Math.max(0, (box.h * z.s - box.H) / 2);
  z.x = Math.max(-mx, Math.min(mx, z.x + dx));
  z.y = Math.max(-my, Math.min(my, z.y + dy));
  if (z.s === 1) z.x = z.y = 0;
  box.img.style.transition = animate ? '' : 'none';
  box.img.style.transform = z.s === 1 ? '' : `translate(${z.x}px, ${z.y}px) scale(${z.s})`;
  const zoomed = z.s > 1;
  VW.x.classList.toggle('zoomed', zoomed);
  const b = VW.x.querySelector('[data-vw="zoom"]');
  b.innerHTML = icon(zoomed ? 'zoomout' : 'zoomin');
  b.setAttribute('aria-label', zoomed ? 'Zoom out' : 'Zoom in');
}
// Zoomed in on a Commons photo: swap in the original file so the detail is real. Commons
// upscales thumbnails wider than the file, so a bigger thumbnail wouldn't add detail.
function viewerSharpen() {
  const it = VW.items[VW.i],
    img = viewerBox().img;
  if (!it.g || img.dataset.tried || !img.complete) return;
  img.dataset.tried = 'orig';
  const big = new Image();
  big.referrerPolicy = 'no-referrer';
  big.onload = () => {
    if (big.naturalWidth > img.naturalWidth) img.src = big.src;
  };
  big.src = commonsOriginal(it.g);
}
function viewerPoint(e) {
  const r = viewerBox().slide.getBoundingClientRect();
  return [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2];
}
function viewerToggleZoom(e) {
  if (VW.z.s > 1) viewerZoom(1);
  else viewerZoom(2.5, ...(e ? viewerPoint(e) : [0, 0]));
}
function viewerGestures(x, track) {
  const pts = new Map();
  let g = null,
    lastTap = 0,
    tapTimer = 0;
  track.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.vw-slide') || !VW) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    const z = VW.z;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      g = {
        pinch: true,
        d0: Math.hypot(a[0] - b[0], a[1] - b[1]),
        s0: z.s,
        moved: true,
      };
    } else if (pts.size === 1) {
      g = { x0: e.clientX, y0: e.clientY, zx: z.x, zy: z.y, moved: false, type: e.pointerType };
      if (z.s > 1 || e.pointerType === 'mouse') track.setPointerCapture(e.pointerId);
    }
  });
  track.addEventListener('pointermove', (e) => {
    if (!g || !pts.has(e.pointerId) || !VW) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    const z = VW.z;
    if (g.pinch && pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      viewerZoom(
        (g.s0 * d) / g.d0,
        ...viewerPoint({ clientX: (a[0] + b[0]) / 2, clientY: (a[1] + b[1]) / 2 }),
        false,
      );
      return;
    }
    const dx = e.clientX - g.x0,
      dy = e.clientY - g.y0;
    if (Math.hypot(dx, dy) > 6) g.moved = true;
    if (z.s > 1) {
      z.x = g.zx;
      z.y = g.zy;
      viewerPan(dx, dy);
    } else if (g.type !== 'mouse' && (g.down || (g.moved && Math.abs(dy) > Math.abs(dx)))) {
      // Swipe down to put the photo away.
      g.down = true;
      const img = viewerBox().img;
      img.style.transition = 'none';
      img.style.transform = `translate(${dx * 0.4}px, ${Math.max(0, dy)}px) scale(${1 - Math.min(0.25, Math.max(0, dy) / 1200)})`;
      x.style.setProperty('--vw-fade', String(Math.max(0.3, 1 - Math.max(0, dy) / 400)));
    }
  });
  const end = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (!g || !VW) return;
    if (g.pinch) {
      if (!pts.size) g = null;
      return;
    }
    if (g.down) {
      const dy = e.clientY - g.y0;
      x.style.removeProperty('--vw-fade');
      if (dy > 110 && e.type === 'pointerup') return closeViewer();
      const img = viewerBox().img;
      img.style.transition = '';
      img.style.transform = '';
    } else if (!g.moved && e.type === 'pointerup') {
      if (g.type === 'mouse') {
        // Click the photo to zoom there; click the dark space around it to close.
        const [px, py] = viewerPoint(e),
          { w, h } = viewerBox();
        if (VW.z.s === 1 && (Math.abs(px) > w / 2 + 4 || Math.abs(py) > h / 2 + 4)) closeViewer();
        else viewerToggleZoom(e);
      } else {
        const now = Date.now(),
          ev = { clientX: e.clientX, clientY: e.clientY };
        if (now - lastTap < 300) {
          clearTimeout(tapTimer);
          lastTap = 0;
          viewerToggleZoom(ev);
        } else {
          lastTap = now;
          // A single tap hides the controls so the photo has the whole screen.
          tapTimer = setTimeout(() => x.classList.toggle('bare'), 300);
        }
      }
    }
    g = null;
  };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
  track.addEventListener(
    'wheel',
    (e) => {
      if (!VW) return;
      // Sideways trackpad swipes still page through photos; vertical scroll and pinch zoom.
      if (VW.z.s === 1 && !e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      const k = e.deltaMode === 1 ? 0.05 : 0.0025;
      viewerZoom(VW.z.s * Math.exp(-e.deltaY * k * (e.ctrlKey ? 4 : 1)), ...viewerPoint(e), false);
    },
    { passive: false },
  );
  x.addEventListener('dragstart', (e) => e.preventDefault());
  x.addEventListener('click', (e) => {
    const b = e.target.closest('[data-vw]');
    if (!b) {
      // Clicking the dark area around the photo (not the photo) closes, as in most lightboxes.
      if (e.target === x || e.target.classList.contains('vw-foot')) closeViewer();
      return;
    }
    const a = b.dataset.vw;
    if (a === 'close') closeViewer();
    else if (a === 'prev') viewerGo(VW.i - 1);
    else if (a === 'next') viewerGo(VW.i + 1);
    else if (a === 'go') viewerGo(+b.dataset.i);
    else if (a === 'zoom') viewerToggleZoom();
  });
}
// Runs before the sheet's own key handling, so Esc closes only the viewer.
window.addEventListener(
  'keydown',
  (e) => {
    if (!VW) return;
    const k = e.key;
    if (k === 'Escape') closeViewer();
    else if (k === 'ArrowRight' || k === 'ArrowLeft') {
      if (VW.z.s > 1) viewerPan(k === 'ArrowRight' ? -80 : 80, 0);
      else viewerGo(VW.i + (k === 'ArrowRight' ? 1 : -1));
    } else if ((k === 'ArrowUp' || k === 'ArrowDown') && VW.z.s > 1)
      viewerPan(0, k === 'ArrowDown' ? -80 : 80);
    else if (k === '+' || k === '=') viewerZoom(VW.z.s * 1.5);
    else if (k === '-') viewerZoom(VW.z.s / 1.5);
    else if (k === '0') viewerZoom(1);
    else if (k === 'z' || k === 'Z') viewerToggleZoom();
    else if (k === 'Tab') {
      const f = [...VW.x.querySelectorAll('button:not(:disabled),a[href]')].filter(
        (el) => el.offsetParent,
      );
      const at = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(at + (e.shiftKey ? -1 : 1) + f.length) % f.length]?.focus();
    } else return;
    e.preventDefault();
    e.stopPropagation();
  },
  true,
);
window.addEventListener('resize', () => {
  if (!VW) return;
  viewerZoom(1, 0, 0, false);
  VW.track.scrollLeft = VW.i * VW.track.clientWidth;
});
// Photo tiles in a sheet, the sheet carousel and the city page's photo row open the viewer.
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action="gal-open"]');
  if (!b || e.target.closest('a')) return;
  openViewer(b.dataset.id, Number(b.dataset.i) || 0, b);
});
function photoCredit(id) {
  const p = PHOTO[id];
  if (!p || p.own) return '';
  const provider = p.provider || 'Pexels';
  if (/commons/i.test(provider))
    return commonsCredit(
      commonsTitle(p.commonsTitle || p.title),
      p.author,
      p.url,
      p.license,
      p.licenseUrl || licenceUrl(p.license || ''),
      'resized, cropped, colours adjusted',
    );
  return `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" title="${esc(p.title)}">Photo: ${esc(p.author || provider + ' contributor')} / ${esc(provider)}</a> · <a href="${esc(p.licenseUrl || p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.license || 'Photo licence')}</a> · resized, cropped, colours adjusted`;
}
function photoContext(id) {
  const p = PHOTO[id];
  if (!p?.context) return '';
  return (
    p.contextNote ||
    (P[id]?.kind === 'eat'
      ? 'Representative cuisine, not the named venue or proof of dietary suitability. Shown: ' +
        p.title +
        '.'
      : 'Representative location context. Shown: ' +
        p.title +
        '. The exact place is not verified in this image.')
  );
}
function contextBadge(id) {
  return PHOTO[id]?.context
    ? `<span class="photo-context" title="${esc(photoContext(id))}">Representative ${P[id]?.kind === 'eat' ? 'cuisine' : 'location'} photo</span>`
    : '';
}
