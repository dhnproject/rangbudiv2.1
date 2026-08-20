/**
 * RANGBUDI V1.4 Mobile Controller
 * Handles: responsive scaling, touch swipe, keyboard nav, drawer, bookmarks
 */
(function () {
  'use strict';

  var player = null;
  var totalSlides = 293;
  var currentSlide = 0;
  var touchStartX = 0, touchStartY = 0, touchStartTime = 0;
  var lastTapTime = 0;
  var isZoomed = false;
  var pollingTimer = null;

  /* ---- DOM refs ---- */
  var stageEl, progressFill, counterText, touchLayer, swipeFlash;
  var btnPrev, btnNext, btnPlay, btnDrawer, btnFullscreen, btnZoom, btnCloseDrawer;
  var drawerBackdrop, drawerList, searchInput;
  var resumeModal, resumeOk, resumeCancel, resumeDesc;
  var landscapeTip;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    stageEl         = document.getElementById('stage-wrapper');
    progressFill    = document.getElementById('progress-bar-fill');
    counterText     = document.getElementById('slide-counter-text');
    touchLayer      = document.getElementById('touch-layer');
    swipeFlash      = document.getElementById('swipe-flash');
    btnPrev         = document.getElementById('btn-prev');
    btnNext         = document.getElementById('btn-next');
    btnPlay         = document.getElementById('btn-play');
    btnDrawer       = document.getElementById('btn-drawer');
    btnFullscreen   = document.getElementById('btn-fullscreen');
    btnZoom         = document.getElementById('btn-zoom');
    btnCloseDrawer  = document.getElementById('btn-close-drawer');
    drawerBackdrop  = document.getElementById('drawer-backdrop');
    drawerList      = document.getElementById('drawer-list');
    searchInput     = document.getElementById('search-input');
    resumeModal     = document.getElementById('resume-modal');
    resumeOk        = document.getElementById('resume-ok');
    resumeCancel    = document.getElementById('resume-cancel');
    resumeDesc      = document.getElementById('resume-desc');
    landscapeTip    = document.getElementById('portrait-tip');

    setupButtons();
    setupTouch();
    setupKeyboard();
    setupScaler();
    checkPortrait();

    window.addEventListener('orientationchange', function () {
      setTimeout(function () { applyScale(); checkPortrait(); }, 250);
    });
  }

  /* Exposed init hook called from index.html onPlayerInit */
  window.initMobileApp = function (p) {
    player = p;
    if (player) {
      try {
        var slides = player.slides ? player.slides() : null;
        if (slides && slides.count) totalSlides = slides.count();
      } catch (e) {}
    }
    buildDrawerList();
    checkBookmark();
    updateUI();
    /* Poll slide index every 600ms */
    if (pollingTimer) clearInterval(pollingTimer);
    pollingTimer = setInterval(pollSlide, 600);
  };

  /* ---- Scale ---- */
  function setupScaler() {
    window.addEventListener('resize', applyScale);
    applyScale();
    setTimeout(applyScale, 400);
    setTimeout(applyScale, 1200);
  }

  function applyScale() {
    var pv = document.getElementById('playerView');
    if (!pv || !stageEl) return;
    var cw = stageEl.clientWidth  - 16;
    var ch = stageEl.clientHeight - 16;
    if (cw <= 0 || ch <= 0) return;
    var baseW = 1280, baseH = 720;
    var scale = Math.min(cw / baseW, ch / baseH);
    if (isZoomed) scale = Math.min(scale * 1.6, cw / baseW);
    pv.style.width  = baseW + 'px';
    pv.style.height = baseH + 'px';
    pv.style.transform = 'scale(' + scale + ')';
  }

  /* ---- Buttons ---- */
  function setupButtons() {
    if (btnPrev)        btnPrev.addEventListener('click', prevSlide);
    if (btnNext)        btnNext.addEventListener('click', nextSlide);
    if (btnPlay)        btnPlay.addEventListener('click', togglePlay);
    if (btnDrawer)      btnDrawer.addEventListener('click', openDrawer);
    if (btnCloseDrawer) btnCloseDrawer.addEventListener('click', closeDrawer);
    if (btnFullscreen)  btnFullscreen.addEventListener('click', toggleFullscreen);
    if (btnZoom)        btnZoom.addEventListener('click', toggleZoom);
    if (searchInput)    searchInput.addEventListener('input', function (e) { filterList(e.target.value); });
    if (drawerBackdrop) drawerBackdrop.addEventListener('click', function (e) { if (e.target === drawerBackdrop) closeDrawer(); });
    if (resumeOk)       resumeOk.addEventListener('click', resumeFromBookmark);
    if (resumeCancel)   resumeCancel.addEventListener('click', dismissResume);

    var badge = document.getElementById('slide-badge');
    if (badge) badge.addEventListener('click', openDrawer);
  }

  /* ---- Touch ---- */
  function setupTouch() {
    if (!touchLayer) return;
    touchLayer.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      touchStartX    = e.touches[0].clientX;
      touchStartY    = e.touches[0].clientY;
      touchStartTime = Date.now();
    }, { passive: true });

    touchLayer.addEventListener('touchend', function (e) {
      if (e.changedTouches.length !== 1) return;
      var dx = e.changedTouches[0].clientX - touchStartX;
      var dy = e.changedTouches[0].clientY - touchStartY;
      var dt = Date.now() - touchStartTime;
      var now = Date.now();

      // double-tap zoom
      if (Math.abs(dx) < 18 && Math.abs(dy) < 18 && now - lastTapTime < 310) {
        lastTapTime = 0;
        toggleZoom();
        return;
      }
      lastTapTime = now;

      // horizontal swipe
      if (dt < 500 && Math.abs(dx) > 45 && Math.abs(dy) < 70) {
        if (dx < 0) { nextSlide(); flashSwipe('&rarr;'); }
        else         { prevSlide(); flashSwipe('&larr;'); }
      }
    });
  }

  function flashSwipe(html) {
    if (!swipeFlash) return;
    swipeFlash.innerHTML = html;
    swipeFlash.classList.add('show');
    setTimeout(function () { swipeFlash.classList.remove('show'); }, 900);
  }

  /* ---- Keyboard ---- */
  function setupKeyboard() {
    document.addEventListener('keydown', function (e) {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      switch (e.key) {
        case 'ArrowRight': case 'ArrowDown': e.preventDefault(); nextSlide(); break;
        case 'ArrowLeft':  case 'ArrowUp':   e.preventDefault(); prevSlide(); break;
        case 'f': case 'F': toggleFullscreen(); break;
        case 'm': case 'M': openDrawer(); break;
        case 'Escape': closeDrawer(); break;
      }
    });
  }

  /* ---- Navigation ---- */
  function nextSlide() {
    if (player && player.gotoNextSlide) { player.gotoNextSlide(); }
    else { triggerCore('gotoNextSlide'); }
    setTimeout(updateUI, 150);
  }
  function prevSlide() {
    if (player && player.gotoPreviousSlide) { player.gotoPreviousSlide(); }
    else { triggerCore('gotoPreviousSlide'); }
    setTimeout(updateUI, 150);
  }
  function gotoSlide(i) {
    if (player && player.gotoSlide) { player.gotoSlide(i); }
    else { triggerCore('gotoSlide', i); }
    setTimeout(updateUI, 150);
  }
  function triggerCore(method, arg) {
    try {
      var el = document.getElementById('coreSpr_7886453') ||
               document.getElementById('$coreSprPlaceholder');
      if (el && el.getCore) {
        var c = el.getCore();
        if (c && c[method]) c[method](arg);
      }
    } catch (e) {}
  }

  var isPlaying = false;
  function togglePlay() {
    isPlaying = !isPlaying;
    if (player) {
      if (isPlaying && player.play)  player.play();
      if (!isPlaying && player.pause) player.pause();
    }
    var icon = document.getElementById('play-icon');
    if (icon) icon.innerHTML = isPlaying ? pauseIcon() : playIcon();
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen && document.exitFullscreen();
    }
  }

  function toggleZoom() {
    isZoomed = !isZoomed;
    applyScale();
    showToast(isZoomed ? 'Zoom In aktif' : 'Ukuran normal');
    if (btnZoom) btnZoom.style.color = isZoomed ? '#38bdf8' : '';
  }

  /* ---- Poll & UI Update ---- */
  function pollSlide() {
    var idx = getSlideIndex();
    if (idx !== currentSlide) { currentSlide = idx; updateUI(); }
  }

  function getSlideIndex() {
    try {
      if (player && player.currentSlideIndex) return player.currentSlideIndex();
    } catch (e) {}
    return currentSlide;
  }

  function updateUI() {
    currentSlide = getSlideIndex();
    if (counterText) counterText.textContent = 'Slide ' + (currentSlide + 1) + ' / ' + totalSlides;
    if (progressFill) progressFill.style.width = (((currentSlide + 1) / totalSlides) * 100).toFixed(1) + '%';
    // save bookmark
    try { localStorage.setItem('rangbudi_slide', currentSlide); } catch (e) {}
    updateActiveItem();
  }

  /* ---- Drawer ---- */
  function buildDrawerList() {
    if (!drawerList) return;
    drawerList.innerHTML = '';
    for (var i = 0; i < totalSlides; i++) {
      var item = document.createElement('div');
      item.className = 'slide-item' + (i === currentSlide ? ' active' : '');
      item.dataset.index = i;
      item.innerHTML =
        '<div class="slide-num">' + (i + 1) + '</div>' +
        '<div class="slide-label">Slide ' + (i + 1) + ' dari ' + totalSlides + '</div>';
      item.addEventListener('click', (function (idx) {
        return function () { gotoSlide(idx); closeDrawer(); showToast('Slide ' + (idx + 1)); };
      })(i));
      drawerList.appendChild(item);
    }
  }

  function updateActiveItem() {
    if (!drawerList) return;
    var items = drawerList.querySelectorAll('.slide-item');
    for (var i = 0; i < items.length; i++) {
      var active = parseInt(items[i].dataset.index, 10) === currentSlide;
      items[i].classList.toggle('active', active);
      if (active && drawerBackdrop && drawerBackdrop.classList.contains('open')) {
        items[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }

  function filterList(q) {
    if (!drawerList) return;
    var items = drawerList.querySelectorAll('.slide-item');
    var term = q.trim().toLowerCase();
    for (var i = 0; i < items.length; i++) {
      var num = (parseInt(items[i].dataset.index, 10) + 1).toString();
      items[i].style.display = (!term || num.includes(term)) ? '' : 'none';
    }
  }

  function openDrawer() {
    if (drawerBackdrop) drawerBackdrop.classList.add('open');
    updateActiveItem();
    if (searchInput) { searchInput.value = ''; filterList(''); }
  }
  function closeDrawer() {
    if (drawerBackdrop) drawerBackdrop.classList.remove('open');
  }

  /* ---- Bookmark / Resume ---- */
  function checkBookmark() {
    try {
      var saved = localStorage.getItem('rangbudi_slide');
      if (saved !== null) {
        var idx = parseInt(saved, 10);
        if (idx > 0 && idx < totalSlides) {
          if (resumeDesc) resumeDesc.textContent =
            'Anda pernah belajar sampai Slide ' + (idx + 1) + '. Lanjutkan dari sana?';
          if (resumeModal) resumeModal.classList.add('open');
        }
      }
    } catch (e) {}
  }
  function resumeFromBookmark() {
    try {
      var idx = parseInt(localStorage.getItem('rangbudi_slide'), 10);
      if (!isNaN(idx)) { gotoSlide(idx); showToast('Melanjutkan dari Slide ' + (idx + 1)); }
    } catch (e) {}
    dismissResume();
  }
  function dismissResume() {
    if (resumeModal) resumeModal.classList.remove('open');
  }

  /* ---- Portrait tip ---- */
  function checkPortrait() {
    if (!landscapeTip) return;
    var portrait = window.innerHeight > window.innerWidth && window.innerWidth < 768;
    landscapeTip.style.display = portrait ? 'flex' : 'none';
  }

  /* ---- Toast ---- */
  function showToast(msg) {
    var t = document.getElementById('app-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'app-toast';
      t.className = 'app-toast';
      document.body.appendChild(t);
    }
    t.innerHTML = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2000);
  }

  /* SVG icon helpers */
  function playIcon()  { return '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'; }
  function pauseIcon() { return '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>'; }

})();
