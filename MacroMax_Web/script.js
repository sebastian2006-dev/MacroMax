/**
 * MacroMax promo site
 * Ambient motion, cursor spotlight, nav indicator, demo video,
 * ring simulator, infinite screenshot slider, lightbox, download tabs.
 */

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

document.addEventListener('DOMContentLoaded', () => {
  initAmbientMotion();
  initSpotlight();
  initNavIndicator();
  initHeroCounter();
  initVideoPlayer();
  initRingSimulator();
  initLightbox();       // before the slider so it can read the original cards
  initScreenSlider();
  initDownloadTabs();
  initCopyChecksum();
  init3DBackground();
});

/* --------------------------------------------------------------------------
   Ambient motion: background parallax + hero phone tilt + chip drift.
   One rAF loop that sleeps once everything has settled.
   -------------------------------------------------------------------------- */
function initAmbientMotion() {
  if (REDUCED_MOTION) return;

  const bg = document.querySelector('.bg');
  const phone = document.getElementById('heroPhone');
  const chips = document.querySelectorAll('.floating-chip');
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  if (!finePointer) return;

  const cur = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };
  let raf = 0;

  const loop = () => {
    cur.x += (target.x - cur.x) * 0.07;
    cur.y += (target.y - cur.y) * 0.07;

    bg.style.setProperty('--px', cur.x.toFixed(4));
    bg.style.setProperty('--py', cur.y.toFixed(4));

    if (phone) {
      phone.style.setProperty('--ry', `${(-6 + cur.x * 9).toFixed(3)}deg`);
      phone.style.setProperty('--rx', `${(3 - cur.y * 7).toFixed(3)}deg`);
    }
    chips.forEach((chip, i) => {
      const dir = i % 2 ? -1 : 1;
      chip.style.setProperty('--cx', (cur.x * 14 * dir).toFixed(2));
      chip.style.setProperty('--cy', (cur.y * 10 * dir).toFixed(2));
    });

    const settled = Math.abs(target.x - cur.x) < 0.0005 && Math.abs(target.y - cur.y) < 0.0005;
    raf = settled ? 0 : requestAnimationFrame(loop);
  };

  window.addEventListener('pointermove', (e) => {
    target.x = (e.clientX / window.innerWidth - 0.5) * 2;
    target.y = (e.clientY / window.innerHeight - 0.5) * 2;
    if (!raf) raf = requestAnimationFrame(loop);
  }, { passive: true });

  // Start with the phone at its resting angle
  loop();
}

/* --------------------------------------------------------------------------
   Cursor spotlight on glass surfaces
   -------------------------------------------------------------------------- */
function initSpotlight() {
  if (!window.matchMedia('(hover: hover)').matches) return;

  let raf = 0;
  let last = null;

  document.addEventListener('pointermove', (e) => {
    last = e;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const el = last.target instanceof Element ? last.target.closest('.spot') : null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${last.clientX - r.left}px`);
      el.style.setProperty('--my', `${last.clientY - r.top}px`);
    });
  }, { passive: true });
}

/* --------------------------------------------------------------------------
   Navigation: sliding hover pill + section highlight
   -------------------------------------------------------------------------- */
function initNavIndicator() {
  const nav = document.getElementById('navLinks');
  if (!nav) return;

  const pill = nav.querySelector('.nav-pill');
  const links = Array.from(nav.querySelectorAll('.nav-link'));
  let placed = false;
  let active = null;

  function moveTo(el) {
    if (!el || getComputedStyle(pill).display === 'none') return;
    if (!placed) {
      // First placement: jump into position instead of sliding in from the left edge
      pill.style.transition = 'none';
      pill.style.width = `${el.offsetWidth}px`;
      pill.style.transform = `translateX(${el.offsetLeft}px)`;
      void pill.offsetWidth;
      pill.style.transition = '';
      placed = true;
    } else {
      pill.style.width = `${el.offsetWidth}px`;
      pill.style.transform = `translateX(${el.offsetLeft}px)`;
    }
    pill.classList.add('on');
  }

  function rest() {
    if (active) moveTo(active);
    else pill.classList.remove('on');
  }

  links.forEach((link) => {
    link.addEventListener('pointerenter', () => moveTo(link));
    link.addEventListener('focus', () => moveTo(link));
  });
  nav.addEventListener('pointerleave', rest);
  nav.addEventListener('focusout', rest);

  // Highlight the link for the section currently in view
  const map = new Map();
  links.forEach((l) => {
    const id = l.getAttribute('href').slice(1);
    const section = document.getElementById(id);
    if (section) map.set(section, l);
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const link = map.get(entry.target);
      links.forEach((l) => l.classList.toggle('active', l === link));
      active = link;
      if (!nav.matches(':hover')) rest();
    });
  }, { rootMargin: '-45% 0px -50% 0px' });

  map.forEach((_, section) => io.observe(section));

  window.addEventListener('resize', rest);
}

/* --------------------------------------------------------------------------
   Hero number count-up
   -------------------------------------------------------------------------- */
function initHeroCounter() {
  const el = document.querySelector('[data-count]');
  if (!el || REDUCED_MOTION) return;

  const end = parseInt(el.dataset.count, 10);
  const duration = 1700;
  const delay = 700;
  el.textContent = '0';

  setTimeout(() => {
    const start = performance.now();
    const tick = (now) => {
      const t = clamp((now - start) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - t, 4);
      el.textContent = Math.round(end * eased).toLocaleString('en-US');
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, delay);
}

/* --------------------------------------------------------------------------
   Demo video
   -------------------------------------------------------------------------- */
function initVideoPlayer() {
  const video = document.getElementById('spotlightVideo');
  const wrapper = document.getElementById('cinemaVideoWrapper');
  const badge = document.getElementById('cinemaCenterPauseBadge');
  const bar = document.getElementById('cinemaControlsBar');
  const playBtn = document.getElementById('cinemaPlayBtn');
  const playIcon = document.getElementById('cinemaPlayIcon');
  const muteBtn = document.getElementById('cinemaMuteBtn');
  const muteIcon = document.getElementById('cinemaMuteIcon');
  const track = document.getElementById('cinemaProgressTrack');
  const fill = document.getElementById('cinemaProgressFill');
  if (!video || !wrapper) return;

  const ICON = {
    pause: '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>',
    play: '<polygon points="5 3 19 12 5 21 5 3"></polygon>',
    muted: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line>',
    sound: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>'
  };

  let userPaused = false;
  let hideTimer = 0;

  function sync() {
    const paused = video.paused;
    wrapper.classList.toggle('is-paused', paused);
    playIcon.innerHTML = paused ? ICON.play : ICON.pause;
    if (badge) {
      badge.querySelector('svg').innerHTML = paused ? ICON.play : ICON.pause;
      badge.querySelector('span').textContent = paused ? 'Play' : 'Pause';
    }
  }

  function toggle() {
    if (video.paused) {
      userPaused = false;
      video.play().catch(() => { });
    } else {
      userPaused = true;
      video.pause();
    }
  }

  function revealControls() {
    wrapper.classList.add('show-controls');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => wrapper.classList.remove('show-controls'), 2400);
  }

  video.addEventListener('play', sync);
  video.addEventListener('pause', sync);

  wrapper.addEventListener('click', (e) => {
    if (bar.contains(e.target)) return;
    toggle();
    revealControls();
  });
  wrapper.addEventListener('pointermove', revealControls);
  wrapper.addEventListener('pointerleave', () => {
    clearTimeout(hideTimer);
    wrapper.classList.remove('show-controls');
  });

  playBtn.addEventListener('click', toggle);

  muteBtn.addEventListener('click', () => {
    video.muted = !video.muted;
    muteIcon.innerHTML = video.muted ? ICON.muted : ICON.sound;
  });

  video.addEventListener('timeupdate', () => {
    if (!video.duration) return;
    const pct = (video.currentTime / video.duration) * 100;
    fill.style.width = `${pct}%`;
    track.setAttribute('aria-valuenow', String(Math.round(pct)));
  });

  // Scrubbing: click or drag the progress bar
  let scrubbing = false;
  const seek = (e) => {
    const r = track.getBoundingClientRect();
    if (video.duration) video.currentTime = clamp((e.clientX - r.left) / r.width, 0, 1) * video.duration;
  };
  track.addEventListener('pointerdown', (e) => {
    scrubbing = true;
    track.setPointerCapture(e.pointerId);
    seek(e);
  });
  track.addEventListener('pointermove', (e) => { if (scrubbing) seek(e); });
  track.addEventListener('pointerup', () => { scrubbing = false; });
  track.addEventListener('pointercancel', () => { scrubbing = false; });
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') video.currentTime = Math.max(0, video.currentTime - 5);
    if (e.key === 'ArrowRight') video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
  });

  // Don't burn battery on a video nobody can see
  new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) video.pause();
    else if (!userPaused) video.play().catch(() => { });
  }, { threshold: 0.25 }).observe(wrapper);

  sync();
}

/* --------------------------------------------------------------------------
   Ring simulator
   -------------------------------------------------------------------------- */
function initRingSimulator() {
  const sliderCal = document.getElementById('sliderCalories');
  const sliderProt = document.getElementById('sliderProtein');
  const ringCal = document.getElementById('simCalorieRing');
  const ringProt = document.getElementById('simProteinRing');
  if (!sliderCal || !sliderProt || !ringCal || !ringProt) return;

  const valCal = document.getElementById('valCalories');
  const valProt = document.getElementById('valProtein');
  const dispKcal = document.getElementById('simDisplayKcal');
  const dispProt = document.getElementById('simDisplayProt');
  const status = document.getElementById('simRemainingStatus');
  const pctCal = document.getElementById('simCalPercent');
  const pctProt = document.getElementById('simProtPercent');

  const GOAL_CAL = 2500;
  const GOAL_PROT = 180;
  const C_CAL = 2 * Math.PI * 100;
  const C_PROT = 2 * Math.PI * 100;

  ringCal.style.strokeDasharray = C_CAL;
  ringProt.style.strokeDasharray = C_PROT;
  // Start empty; the rings fill when the section scrolls into view
  ringCal.style.strokeDashoffset = C_CAL;
  ringProt.style.strokeDashoffset = C_PROT;

  const fmt = (n) => n.toLocaleString('en-US');
  const setFill = (input) => {
    const pct = ((input.value - input.min) / (input.max - input.min)) * 100;
    input.style.setProperty('--fill', `${pct}%`);
  };

  function update() {
    const cal = parseInt(sliderCal.value, 10);
    const prot = parseInt(sliderProt.value, 10);
    const calPct = Math.round((cal / GOAL_CAL) * 100);
    const protPct = Math.round((prot / GOAL_PROT) * 100);

    valCal.textContent = fmt(cal);
    valProt.textContent = fmt(prot);
    dispKcal.textContent = fmt(cal);
    dispProt.textContent = fmt(prot);
    pctCal.textContent = `${calPct}% of calorie goal`;
    pctProt.textContent = `${protPct}% of protein goal`;

    ringCal.style.strokeDashoffset = C_CAL * (1 - Math.min(cal / GOAL_CAL, 1));
    ringProt.style.strokeDashoffset = C_PROT * (1 - Math.min(prot / GOAL_PROT, 1));

    setFill(sliderCal);
    setFill(sliderProt);

    if (calPct > 105) {
      status.textContent = 'Over goal';
      status.style.color = '#f59e0b';
    } else if (calPct >= 95 && protPct >= 95) {
      status.textContent = 'Goals hit';
      status.style.color = 'var(--accent-glow)';
    } else if (calPct >= 75) {
      status.textContent = 'On track';
      status.style.color = 'var(--accent-glow)';
    } else {
      status.textContent = 'Eat more';
      status.style.color = '#38bdf8';
    }
  }

  sliderCal.addEventListener('input', update);
  sliderProt.addEventListener('input', update);

  setFill(sliderCal);
  setFill(sliderProt);

  const io = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    io.disconnect();
    update();
  }, { threshold: 0.35 });
  io.observe(ringCal.closest('.simulator-card'));
}

/* --------------------------------------------------------------------------
   Infinite screenshot slider

   One requestAnimationFrame loop owns the position (x) and a velocity (v).
   - The track is moved with translate3d only, so it stays on the GPU.
   - Velocity eases toward a slow drift using frame-rate independent damping,
     which is what makes flicks, arrow nudges and slow-downs feel continuous.
   - The loop is seamless because x is wrapped with modulo against the exact
     pixel width of one set of cards. There is no scroll-position jumping.
   - Cards nearer the middle of the viewport are slightly larger and brighter.
   -------------------------------------------------------------------------- */
function initScreenSlider() {
  const viewport = document.getElementById('scrollerViewport');
  const track = document.getElementById('scrollerTrack');
  const prevBtn = document.getElementById('scrollerPrevBtn');
  const nextBtn = document.getElementById('scrollerNextBtn');
  if (!viewport || !track) return;

  // Set to true if you want the vertical mouse wheel to scroll the slider
  // instead of the page while the cursor is over it.
  const CAPTURE_VERTICAL_WHEEL = false;

  const DRIFT = REDUCED_MOTION ? 0 : 34;  // px per second, auto movement
  const DAMPING = 3;                      // higher = settles faster
  const NUDGE = 1150;                     // velocity added by an arrow press

  const originals = Array.from(track.children);
  originals.forEach((card, i) => {
    card.dataset.index = String(i);
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    card.setAttribute('aria-label', `${card.dataset.title}, open full size`);
  });

  let x = 0;
  let v = 0;
  let setWidth = 0;
  let viewWidth = 0;
  let cards = [];
  let centers = [];

  let hovering = false;
  let focused = false;
  let visible = true;
  let pressing = false;
  let dragging = false;
  let justDragged = false;
  let startX = 0;
  let lastX = 0;
  let lastT = 0;
  let dragV = 0;
  let pointerId = null;

  const wrap = (n) => (setWidth ? ((n % setWidth) + setWidth) % setWidth : 0);

  function build() {
    track.querySelectorAll('[data-clone]').forEach((n) => n.remove());

    const gap = parseFloat(getComputedStyle(track).columnGap) || 28;
    viewWidth = viewport.clientWidth;
    setWidth = originals.reduce((sum, c) => sum + c.offsetWidth + gap, 0);

    const copies = Math.max(1, Math.ceil(viewWidth / setWidth));
    for (let k = 0; k < copies; k++) {
      originals.forEach((card) => {
        const clone = card.cloneNode(true);
        clone.dataset.clone = 'true';
        clone.setAttribute('aria-hidden', 'true');
        clone.tabIndex = -1;
        track.appendChild(clone);
      });
    }

    cards = Array.from(track.children);
    centers = cards.map((c) => c.offsetLeft + c.offsetWidth / 2);
  }

  function render() {
    x = wrap(x);
    track.style.transform = `translate3d(${-x}px, 0, 0)`;

    const mid = x + viewWidth / 2;
    const reach = viewWidth * 0.62;
    for (let i = 0; i < cards.length; i++) {
      const d = Math.min(Math.abs(centers[i] - mid) / reach, 1);
      const eased = d * d;
      cards[i].style.transform = `scale(${(1 - eased * 0.085).toFixed(4)})`;
      cards[i].style.opacity = (1 - eased * 0.5).toFixed(3);
    }
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (visible && !dragging) {
      const paused = hovering || focused;
      const goal = paused ? 0 : DRIFT;
      v += (goal - v) * (1 - Math.exp(-dt * DAMPING));
      x += v * dt;
    }
    if (visible) render();
    requestAnimationFrame(frame);
  }

  /* ---- Drag with momentum ---- */
  viewport.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pressing = true;
    dragging = false;
    pointerId = e.pointerId;
    startX = lastX = e.clientX;
    lastT = performance.now();
    dragV = 0;
  });

  viewport.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') hovering = true;
    if (!pressing || e.pointerId !== pointerId) return;

    if (!dragging && Math.abs(e.clientX - startX) > 6) {
      dragging = true;
      v = 0;
      viewport.classList.add('is-dragging');
      try { viewport.setPointerCapture(pointerId); } catch (_) { }
    }
    if (!dragging) return;

    const now = performance.now();
    const dx = e.clientX - lastX;
    const dtMs = Math.max(now - lastT, 1);
    x -= dx;
    dragV = dragV * 0.65 + ((-dx / dtMs) * 1000) * 0.35;
    lastX = e.clientX;
    lastT = now;
  });

  function endPress(e) {
    if (!pressing || (e && e.pointerId !== pointerId)) return;
    pressing = false;
    if (dragging) {
      const stale = performance.now() - lastT > 90;
      v = stale ? 0 : clamp(dragV, -4200, 4200);
      dragging = false;
      justDragged = true;
      setTimeout(() => { justDragged = false; }, 0);
      viewport.classList.remove('is-dragging');
      try { viewport.releasePointerCapture(pointerId); } catch (_) { }
    }
  }
  viewport.addEventListener('pointerup', endPress);
  viewport.addEventListener('pointercancel', endPress);

  viewport.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hovering = true; });
  viewport.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !pressing) hovering = false; });
  viewport.addEventListener('focusin', () => { focused = true; });
  viewport.addEventListener('focusout', () => { focused = false; });

  /* ---- Wheel / trackpad ---- */
  viewport.addEventListener('wheel', (e) => {
    const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    if (!horizontal && !CAPTURE_VERTICAL_WHEEL) return;   // let the page scroll
    e.preventDefault();
    x += horizontal ? e.deltaX : e.deltaY;
  }, { passive: false });

  /* ---- Arrows ---- */
  if (prevBtn) prevBtn.addEventListener('click', () => { v -= NUDGE; });
  if (nextBtn) nextBtn.addEventListener('click', () => { v += NUDGE; });

  /* ---- Open lightbox ---- */
  function open(card) {
    document.dispatchEvent(new CustomEvent('screen:open', { detail: parseInt(card.dataset.index, 10) }));
  }
  track.addEventListener('click', (e) => {
    if (justDragged) return;
    const card = e.target.closest('.showcase-card');
    if (card) open(card);
  });
  track.addEventListener('keydown', (e) => {
    const card = e.target.closest('.showcase-card');
    if (!card) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(card); }
    if (e.key === 'ArrowRight') { e.preventDefault(); v += NUDGE; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); v -= NUDGE; }
  });

  /* ---- Housekeeping ---- */
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { rootMargin: '200px 0px' }).observe(viewport);

  let resizeTimer = 0;
  const rebuild = () => {
    const ratio = setWidth ? x / setWidth : 0;
    build();
    x = ratio * setWidth;
    render();
  };
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(rebuild, 120);
  });

  // Card heights depend on image load, widths don't, so the loop math is stable
  build();
  x = 0;
  render();
  requestAnimationFrame(frame);
}

/* --------------------------------------------------------------------------
   Screenshot lightbox
   -------------------------------------------------------------------------- */
function initLightbox() {
  const modal = document.getElementById('lightboxModal');
  const overlay = document.getElementById('lightboxOverlay');
  const closeBtn = document.getElementById('lightboxClose');
  const img = document.getElementById('lightboxImg');
  const title = document.getElementById('lightboxTitle');
  const desc = document.getElementById('lightboxDesc');
  const prev = document.getElementById('lightboxPrev');
  const next = document.getElementById('lightboxNext');
  if (!modal) return;

  const items = Array.from(document.querySelectorAll('.showcase-card')).map((c) => ({
    img: c.dataset.img,
    title: c.dataset.title,
    desc: c.dataset.desc
  }));
  if (!items.length) return;

  let index = 0;
  let opener = null;

  function show(i) {
    index = (i + items.length) % items.length;
    const item = items[index];
    img.src = item.img;
    img.alt = `${item.title} screen`;
    title.textContent = item.title;
    desc.textContent = item.desc;
  }

  function open(i) {
    opener = document.activeElement;
    show(i);
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function close() {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (opener && opener.focus) opener.focus();
  }

  document.addEventListener('screen:open', (e) => open(e.detail));
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', close);
  prev.addEventListener('click', () => show(index - 1));
  next.addEventListener('click', () => show(index + 1));

  document.addEventListener('keydown', (e) => {
    if (!modal.classList.contains('active')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(index - 1);
    if (e.key === 'ArrowRight') show(index + 1);
  });
}

/* --------------------------------------------------------------------------
   Download tabs
   -------------------------------------------------------------------------- */
function initDownloadTabs() {
  const header = document.getElementById('tabHeader');
  const buttons = Array.from(document.querySelectorAll('.tab-btn'));
  const panes = Array.from(document.querySelectorAll('.tab-pane'));
  if (!header || !buttons.length) return;

  function select(i) {
    const target = buttons[i].dataset.tab;
    header.style.setProperty('--i', i);
    buttons.forEach((b, j) => {
      const on = j === i;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    panes.forEach((p) => {
      const on = p.id === `pane-${target}`;
      p.classList.toggle('active', on);
      p.hidden = !on;
    });
  }

  buttons.forEach((b, i) => {
    b.addEventListener('click', () => select(i));
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      select(n);
      buttons[n].focus();
    });
  });

  select(0);
}

/* --------------------------------------------------------------------------
   Copy checksum
   -------------------------------------------------------------------------- */
function initCopyChecksum() {
  const btn = document.getElementById('copyChecksumBtn');
  const text = document.getElementById('checksumText');
  if (!btn || !text) return;

  const label = btn.querySelector('.copy-status');

  btn.addEventListener('click', async () => {
    const value = text.textContent.trim();
    try {
      await navigator.clipboard.writeText(value);
    } catch (_) {
      // Fallback for http:// and file:// previews where the Clipboard API is blocked
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (__) { }
      ta.remove();
    }
    label.textContent = 'Copied';
    btn.classList.add('copied');
    setTimeout(() => {
      label.textContent = 'Copy';
      btn.classList.remove('copied');
    }, 1800);
  });
}

/* --------------------------------------------------------------------------
   Premium 3D Background (Retro Grid + Spinning Logo Rings)
   -------------------------------------------------------------------------- */
/* --------------------------------------------------------------------------
   Premium 3D Background (Typographic Cuboidal Logo + Equal Rings + Seamless Grid)
   -------------------------------------------------------------------------- */
function init3DBackground() {
  const canvas = document.getElementById('bgCanvas');
  if (!canvas || typeof THREE === 'undefined') return;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#07100d');

  // Soft emerald fog to blend the horizon deeply
  scene.fog = new THREE.FogExp2('#07100d', 0.015);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 8);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  // 1. Seamless Uniform Retro Grid
  const gridHelper = new THREE.GridHelper(120, 120, '#1f3d2f', '#1f3d2f');
  gridHelper.position.y = -3;
  scene.add(gridHelper);

  // 2. 3D Logo Group
  const logoGroup = new THREE.Group();
  scene.add(logoGroup);
  logoGroup.position.set(0, 0, 0);

  // --- DRAW THE TYPOGRAPHIC CUBOIDAL PEARL "M" ---
  const mMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.3,
    roughness: 0.15,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    emissive: 0xffffff,
    emissiveIntensity: 0.1
  });

  const mShape = new THREE.Shape();
  // Premium bold geometric sans-serif font proportions
  mShape.moveTo(-1.2, -1.0);     // Bottom Left Outer
  mShape.lineTo(-1.2, 1.0);      // Top Left Outer
  mShape.lineTo(-0.65, 1.0);     // Top Left Inner
  mShape.lineTo(0.0, -0.2);      // Center Dip Outer (Deep elegant drop)
  mShape.lineTo(0.65, 1.0);      // Top Right Inner
  mShape.lineTo(1.2, 1.0);       // Top Right Outer
  mShape.lineTo(1.2, -1.0);      // Bottom Right Outer
  mShape.lineTo(0.65, -1.0);     // Bottom Right Inner
  mShape.lineTo(0.65, 0.3);      // Inner Right Stem Peak
  mShape.lineTo(0.0, -0.9);      // Center Dip Inner (Follows outer V shape)
  mShape.lineTo(-0.65, 0.3);     // Inner Left Stem Peak
  mShape.lineTo(-0.65, -1.0);    // Bottom Left Inner
  mShape.lineTo(-1.2, -1.0);     // Close Shape

  // Extrude the 2D M into a thick cuboidal block with polished beveled edges
  const mExtrudeSettings = {
    depth: 0.35,
    bevelEnabled: true,
    bevelSegments: 4,
    steps: 1,
    bevelSize: 0.04,
    bevelThickness: 0.04
  };

  const mGeometry = new THREE.ExtrudeGeometry(mShape, mExtrudeSettings);
  mGeometry.center(); // Center the block perfectly
  const mMesh = new THREE.Mesh(mGeometry, mMat);
  mMesh.scale.set(1.15, 1.15, 1.15);

  const mGroup = new THREE.Group();
  mGroup.add(mMesh);
  logoGroup.add(mGroup);

  // --- ORBITING CUBOIDAL ARCS (Equally Divided) ---
  const arcsGroup = new THREE.Group();
  const R = 2.7;
  const tr = 0.18; // Half-thickness of the square cross-section

  // Create a square 2D shape for the cross-section
  const sqShape = new THREE.Shape();
  sqShape.moveTo(-tr, -tr);
  sqShape.lineTo(-tr, tr);
  sqShape.lineTo(tr, tr);
  sqShape.lineTo(tr, -tr);
  sqShape.lineTo(-tr, -tr);

  // Custom Curve to sweep the square along a perfectly circular arc in 3D
  class Arc3DCurve extends THREE.Curve {
    constructor(radius, lengthRad) {
      super();
      this.radius = radius;
      this.lengthRad = lengthRad;
    }
    getPoint(t, optionalTarget = new THREE.Vector3()) {
      const theta = t * this.lengthRad;
      return optionalTarget.set(this.radius * Math.cos(theta), this.radius * Math.sin(theta), 0);
    }
  }

  function createCuboidalArc(colorHex, emissiveHex, startDeg, lengthDeg) {
    const arcGroup = new THREE.Group();

    const mat = new THREE.MeshPhysicalMaterial({
      color: colorHex,
      metalness: 0.65,
      roughness: 0.35,
      clearcoat: 1.0,
      clearcoatRoughness: 0.2,
      emissive: emissiveHex,
      emissiveIntensity: 0.15
    });

    const lenRad = THREE.MathUtils.degToRad(lengthDeg);
    const startRad = THREE.MathUtils.degToRad(startDeg);

    const path = new Arc3DCurve(R, lenRad);
    const arcExtrudeSettings = {
      steps: Math.ceil(lengthDeg / 2),
      bevelEnabled: true,
      bevelSegments: 4,
      bevelSize: 0.04,
      bevelThickness: 0.04,
      extrudePath: path
    };

    const arcGeo = new THREE.ExtrudeGeometry(sqShape, arcExtrudeSettings);
    const arcMesh = new THREE.Mesh(arcGeo, mat);

    arcGroup.add(arcMesh);
    arcGroup.rotation.z = startRad;
    return arcGroup;
  }

  // Exact equal division: 3 segments of 100 degrees each, with exactly 20 degrees gap between them (120 spacing)
  const greenArc = createCuboidalArc(0x5ddc94, 0x22a860, 0, 100);
  const orangeArc = createCuboidalArc(0xfcb23b, 0xd98a10, 120, 100);
  const blueArc = createCuboidalArc(0x4b84f3, 0x1f56cc, 240, 100);

  arcsGroup.add(greenArc, orangeArc, blueArc);

  // Stand vertically facing the camera
  arcsGroup.rotation.x = 0;
  arcsGroup.rotation.y = 0;
  logoGroup.add(arcsGroup);

  // 3. Lighting
  const hemiLight = new THREE.HemisphereLight(0xffffff, '#07100d', 1.0);
  scene.add(hemiLight);

  const pointLight = new THREE.PointLight(0x34d399, 1.5, 20);
  pointLight.position.set(2, 6, 5);
  scene.add(pointLight);

  // 4. Interaction tracking
  let targetX = 0;
  let targetY = 0;
  window.addEventListener('pointermove', (e) => {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = -(e.clientY / window.innerHeight) * 2 + 1;
    targetX = x * 0.2;
    targetY = y * 0.2;
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // 5. Animation Loop
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();

    // M hovers softly
    mGroup.position.y = Math.sin(time * 1.5) * 0.12;

    // Cuboidal arcs continuously spin vertically around the M
    arcsGroup.rotation.z = -time * 0.5;

    // Add a gentle 3D wobble to highlight the flat sides and beveled edges
    arcsGroup.rotation.x = Math.sin(time * 0.8) * 0.15;
    arcsGroup.rotation.y = Math.cos(time * 0.5) * 0.15;

    // Smooth tilt of the whole logo reacting to mouse
    logoGroup.rotation.x += (targetY - logoGroup.rotation.x) * 0.05;
    logoGroup.rotation.y += (targetX - logoGroup.rotation.y) * 0.05;

    // FLAWLESS GRID LOOP
    gridHelper.position.z = (time * 2.0) % 1.0;

    renderer.render(scene, camera);
  }

  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    animate();
  } else {
    renderer.render(scene, camera);
  }
}