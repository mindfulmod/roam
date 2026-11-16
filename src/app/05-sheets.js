// Phone layout breakpoint; keep in sync with the 760px media queries in styles.css.
const isMobile = () => matchMedia('(max-width: 760px)').matches;
let modalHistory = false;
function closePlaceMap() {
  if (placeMap) {
    placeMap.remove();
    placeMap = null;
  }
}
function showModal(content, label = 'Details') {
  closeStayMap();
  closePlaceMap();
  const reopening = Boolean($('.modal-backdrop'));
  if (!reopening) modalFocus = document.activeElement;
  $('.modal-backdrop')?.remove();
  const x = document.createElement('div');
  x.className = 'modal-backdrop';
  // The header bar is sticky, so Close stays in reach however far the sheet is scrolled.
  x.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-label="${esc(label)}"><div class="modal-bar"><span class="modal-grab" aria-hidden="true"></span><span class="modal-bar-title" aria-hidden="true">${esc(label)}</span><button class="iconbtn close" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button></div>${content}</section>`;
  document.body.appendChild(x);
  document.body.style.overflow = 'hidden';
  const m = x.querySelector('.modal');
  m.addEventListener('scroll', () => m.classList.toggle('scrolled', m.scrollTop > 140), {
    passive: true,
  });
  sheetSwipe(m);
  x.querySelector('.close').focus({ preventScroll: true });
  x.addEventListener('click', (e) => {
    if (e.target === x) closeModal('user');
  });
  // Give the sheet its own history entry so the phone's Back gesture closes it.
  if (!reopening && !modalHistory) {
    history.pushState({ roamModal: 1 }, '');
    modalHistory = true;
  }
}
// how: 'user' when the person dismisses the sheet (Close, backdrop, Escape, swipe), which
// also steps back past the sheet's history entry; 'history' when Back already did that.
// Anything else is a programmatic close that may navigate next, so it must not go back.
function closeModal(how = '') {
  closeStayMap();
  closePlaceMap();
  $('.modal-backdrop')?.remove();
  document.body.style.overflow = '';
  if (modalFocus?.isConnected) modalFocus.focus({ preventScroll: true });
  if (!modalHistory) return;
  modalHistory = false;
  if (how === 'history' || !history.state?.roamModal) return;
  if (how === 'user') history.back();
  else history.replaceState(null, '');
}
// Drag a sheet down from its top edge to dismiss it, as in Apple Maps and Google Maps.
function sheetSwipe(m) {
  let y0 = null,
    x0 = 0,
    dy = 0;
  m.addEventListener(
    'touchstart',
    (e) => {
      y0 = null;
      if (!isMobile() || m.scrollTop > 0 || e.touches.length > 1) return;
      if (e.target.closest('input,textarea,select,.leaflet-container')) return;
      y0 = e.touches[0].clientY;
      x0 = e.touches[0].clientX;
      dy = 0;
    },
    { passive: true },
  );
  m.addEventListener(
    'touchmove',
    (e) => {
      if (y0 === null) return;
      dy = e.touches[0].clientY - y0;
      const dx = Math.abs(e.touches[0].clientX - x0);
      if (dy <= 0 || dx > dy || m.scrollTop > 0) {
        m.style.transform = '';
        y0 = null;
        return;
      }
      e.preventDefault();
      m.style.transition = 'none';
      m.style.transform = `translateY(${dy}px)`;
    },
    { passive: false },
  );
  m.addEventListener('touchend', () => {
    m.style.transition = '';
    if (y0 !== null && dy > 110) closeModal('user');
    else m.style.transform = '';
    y0 = null;
  });
}
window.addEventListener('popstate', () => {
  if (modalHistory && !history.state?.roamModal && $('.modal-backdrop')) closeModal('history');
});
