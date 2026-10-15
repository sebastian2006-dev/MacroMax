/**
 * MacroMax promo site
 * Ambient motion, cursor spotlight, nav indicator, demo video,
 * ring simulator, screenshot deck, lightbox, download tabs.
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
  initLightbox();       // before the deck so it can read the cards
  initScreenDeck();
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
   Screenshot deck

   Five screens stacked like a deck of photos: the front card is full size and
   the cards behind it sit a step higher, a step smaller and a shade darker.

   There is no clone and no scroll offset to reset. The whole deck is derived
   from one number, "active": every card's place in the stack comes from it
   with a modulo, so the deck loops forever in both directions.

   A step is (dir, from): dir is which way the deck travels and "from" is the
   side the arriving card comes up through. The card on top always leaves by
   the opposite side.
     - dir +1: the top card falls away and the next card is dealt in
     - dir -1: the top card settles back into the pile and the previous card
               is set back down on top
   A swipe always deals forward, so the card falls the way you pushed it and
   the next screen arrives from the other side.
   Each step is one CSS transition per card. Nothing runs per frame except
   while a finger is dragging the deck.
   -------------------------------------------------------------------------- */
function initScreenDeck() {
  const stage = document.getElementById('deckStage');
  const track = document.getElementById('deckTrack');
  const prevBtn = document.getElementById('deckPrevBtn');
  const nextBtn = document.getElementById('deckNextBtn');
  const barsEl = document.getElementById('deckBars');
  const titleEl = document.getElementById('deckTitle');
  const descEl = document.getElementById('deckDesc');
  const modal = document.getElementById('lightboxModal');
  if (!stage || !track) return;

  const cards = Array.from(track.querySelectorAll('.deck-card'));
  const total = cards.length;
  if (!total) return;

  /* Feel. Tune these, not the maths below. */
  const DEPTH = 3;          // cards of the stack you can see at once
  const LIFT = 26;          // px higher for every step back
  const SHRINK = 0.03;      // scale lost for every step back (keeps the lift visible)
  const TILT = 1.35;        // degrees of lean for every step back
  const SCRIM = 0.22;       // how much darker every step back gets
  const PARK = 30;          // extra lift for cards waiting outside the stack
  const DROP = 30;          // drops the stack below the middle of the stage
  const FLY = 560;          // ms the flicked card takes to leave
  const SWIPE = 58;         // px of drag that commits to the next card
  const CHAIN = 300;        // ms between steps when a bar is clicked far away
  const AUTOPLAY = 6500;    // ms between automatic deals (0 to stay put)

  const items = cards.map((card, i) => {
    card.dataset.index = String(i);
    card.setAttribute('role', 'button');
    card.setAttribute('aria-roledescription', 'screenshot');
    card.setAttribute('aria-label', `${card.dataset.title}, open full size`);
    return { title: card.dataset.title || '', desc: card.dataset.desc || '' };
  });

  const bars = [];
  if (barsEl) {
    items.forEach((item, i) => {
      const bar = document.createElement('button');
      bar.type = 'button';
      bar.className = 'deck-bar';
      bar.setAttribute('aria-label', `Show ${item.title}`);
      bar.addEventListener('click', () => { handOff(); jumpTo(i); });
      barsEl.appendChild(bar);
      bars.push(bar);
    });
  }

  let active = 0;          // index of the card on top of the deck
  let dragX = 0;           // px the deck is following a finger
  let auto = AUTOPLAY > 0 && !REDUCED_MOTION;
  let autoTimer = 0;
  let chainTimer = 0;
  let captionTimer = 0;
  let paused = false;      // pointer or keyboard is on the deck
  let onScreen = true;
  let pressing = false;
  let pointerId = null;
  let startX = 0;
  let lastX = 0;
  let travel = 0;
  let lastStepAt = 0;
  let wheelAcc = 0;
  let wheelReset = 0;
  let stepTimer = 0;
  let arriveTimer = 0;

  const flying = new Map();     // card index -> direction it is leaving in
  const flyTimers = new Map();

  const slotOf = (i) => (i - active + total) % total;

  /* ---- Painting -------------------------------------------------------- */
  function paint(i, drag) {
    const card = cards[i];

    if (flying.has(i)) {
      const dir = flying.get(i);
      card.classList.add('is-exit');
      card.style.zIndex = String(total + 6);
      card.style.opacity = '0';
      card.style.setProperty('--scrim', '0');
      card.style.transform =
        `translate(-50%, -50%) translate3d(${(dir * 74).toFixed(2)}%, ${DROP + 30}px, 0) ` +
        `rotate(${(dir * 11).toFixed(2)}deg) scale(0.92)`;
      return;
    }

    const slot = slotOf(i);
    const depth = Math.min(slot, DEPTH);
    const visible = slot < DEPTH;
    const lift = DROP - LIFT * depth - (visible ? 0 : PARK);
    const scale = 1 - SHRINK * depth;
    const follow = drag * Math.max(1 - depth * 0.3, 0.12);

    card.classList.toggle('is-parked', !visible);
    card.style.zIndex = String(total + 2 - slot);
    card.style.opacity = visible ? '1' : '0';
    card.style.setProperty('--scrim', visible ? (depth * SCRIM).toFixed(3) : '0');
    card.style.transform =
      `translate(-50%, -50%) translate3d(${follow.toFixed(2)}px, ${lift.toFixed(2)}px, 0) ` +
      `rotate(${(TILT * depth).toFixed(2)}deg) scale(${scale.toFixed(4)})`;
  }

  function positions(drag) {
    for (let i = 0; i < total; i++) paint(i, drag);
  }

  function chrome() {
    for (let i = 0; i < total; i++) {
      const front = !flying.has(i) && slotOf(i) === 0;
      cards[i].classList.toggle('is-front', front);
      cards[i].tabIndex = front ? 0 : -1;
      cards[i].setAttribute('aria-hidden', front ? 'false' : 'true');
    }
    bars.forEach((bar, i) => {
      const on = i === active;
      bar.classList.toggle('is-active', on);
      bar.setAttribute('aria-current', on ? 'true' : 'false');
    });
  }

  function render() {
    positions(dragX);
    chrome();
  }

  /* ---- Caption --------------------------------------------------------- */
  function captions(instant) {
    const apply = () => {
      if (titleEl) titleEl.textContent = items[active].title;
      if (descEl) descEl.textContent = items[active].desc;
    };
    if (instant || REDUCED_MOTION || !titleEl || !descEl) { apply(); return; }
    if (captionTimer) return;                       // a swap is already in flight
    titleEl.classList.add('is-out');
    descEl.classList.add('is-out');
    captionTimer = setTimeout(() => {
      captionTimer = 0;
      apply();
      titleEl.classList.remove('is-out');
      descEl.classList.remove('is-out');
    }, 160);
  }

  /* ---- Moving the deck ------------------------------------------------- */
  function flyOff(i, side) {
    flying.set(i, side);
    if (flyTimers.has(i)) clearTimeout(flyTimers.get(i));
    flyTimers.set(i, setTimeout(() => {
      flying.delete(i);
      flyTimers.delete(i);
      cards[i].classList.remove('is-exit');
      paint(i, dragX);
      chrome();
    }, FLY + 90));
    paint(i, 0);
  }

  // Lays a card down on top of the deck: park it off to the side it comes up
  // through with no transition first, commit that pose, then let the step
  // animate out of it.
  function dealIn(i, from) {
    const card = cards[i];
    card.style.transition = 'none';
    card.style.opacity = '0';
    card.style.setProperty('--scrim', '0');
    card.style.zIndex = String(total + 6);
    card.style.transform =
      `translate(-50%, -50%) translate3d(${(from * 58).toFixed(2)}%, ${DROP - 46}px, 0) ` +
      `rotate(${(from * 13).toFixed(2)}deg) scale(0.9)`;
    void card.offsetWidth;
    card.style.transition = '';
  }

  // The pile only shifts a few pixels, so it settles quicker than a card that
  // has to cross the whole stage to reach the top.
  function stepping() {
    track.classList.add('is-stepping');
    clearTimeout(stepTimer);
    stepTimer = setTimeout(() => track.classList.remove('is-stepping'), 780);
  }

  function arriving(card) {
    cards.forEach((c) => c.classList.remove('is-dealing'));
    card.classList.add('is-dealing');
    clearTimeout(arriveTimer);
    arriveTimer = setTimeout(() => card.classList.remove('is-dealing'), 840);
  }

  function step(dir, from) {
    if (total < 2) return;
    const leaving = active;
    active = (active + dir + total) % total;
    lastStepAt = performance.now();
    if (!REDUCED_MOTION) {
      if (dir > 0) flyOff(leaving, -from);   // the top card falls the way it was pushed
      dealIn(active, from);                  // the next screen comes up through `from`
      arriving(cards[active]);
      stepping();
    }
    render();
    captions(false);
    followFocus();
  }

  // Keep the keyboard on the card that is actually on top
  function followFocus() {
    const focused = document.activeElement;
    if (!focused || !focused.classList || !focused.classList.contains('deck-card')) return;
    if (focused.classList.contains('is-front')) return;
    cards[active].focus({ preventScroll: true });
  }

  // Bars jump by dealing through the cards in between, so it never teleports
  function jumpTo(target) {
    if (total < 2 || target === active) return;
    const forward = (target - active + total) % total;
    const back = total - forward;
    const dir = forward <= back ? 1 : -1;
    let left = Math.min(forward, back);

    const tick = () => {
      chainTimer = 0;
      if (!left) return;
      left -= 1;
      step(dir, dir > 0 ? -1 : 1);
      if (left) chainTimer = setTimeout(tick, CHAIN);
    };
    tick();
  }

  /* ---- Autoplay: hands the deck over the moment you touch it ----------- */
  function startAuto() {
    if (!auto || autoTimer) return;
    autoTimer = setInterval(() => {
      if (paused || !onScreen || document.hidden) return;
      if (modal && modal.classList.contains('active')) return;
      if (performance.now() - lastStepAt < AUTOPLAY) return;
      step(1, -1);
    }, 400);
  }

  function handOff() {
    auto = false;
    if (autoTimer) { clearInterval(autoTimer); autoTimer = 0; }
    if (chainTimer) { clearTimeout(chainTimer); chainTimer = 0; }
  }

  /* ---- Opening a screen ------------------------------------------------ */
  function openScreen(i) {
    handOff();
    document.dispatchEvent(new CustomEvent('screen:open', { detail: i }));
  }

  /* ---- Input ----------------------------------------------------------- */
  track.addEventListener('click', (e) => {
    const card = e.target.closest('.deck-card');
    if (!card || travel > 6) return;
    openScreen(parseInt(card.dataset.index, 10));
  });

  if (prevBtn) prevBtn.addEventListener('click', () => { handOff(); step(-1, 1); });
  if (nextBtn) nextBtn.addEventListener('click', () => { handOff(); step(1, -1); });

  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    handOff();
    pressing = true;
    pointerId = e.pointerId;
    startX = lastX = e.clientX;
    travel = 0;
    stage.classList.add('is-dragging');
  });

  stage.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') paused = true;
    if (!pressing || e.pointerId !== pointerId) return;

    travel = Math.max(travel, Math.abs(e.clientX - lastX));
    lastX = e.clientX;
    const dx = e.clientX - startX;
    if (dx && !stage.hasPointerCapture(pointerId)) {
      try { stage.setPointerCapture(pointerId); } catch (_) { }
    }
    dragX = clamp(dx * 0.42, -170, 170);
    positions(dragX);
  });

  function endPress(e) {
    if (!pressing || (e && e.pointerId !== pointerId)) return;
    pressing = false;
    stage.classList.remove('is-dragging');
    try { stage.releasePointerCapture(pointerId); } catch (_) { }
    const dx = lastX - startX;
    dragX = 0;
    // Either way you swipe, the deck moves on: the top card falls the way you
    // pushed it and the next screen comes up through the other side.
    if (Math.abs(dx) >= SWIPE) step(1, dx < 0 ? 1 : -1);
    else render();
  }
  stage.addEventListener('pointerup', endPress);
  stage.addEventListener('pointercancel', endPress);

  stage.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') paused = true; });
  stage.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !pressing) paused = false; });
  stage.addEventListener('focusin', () => { paused = true; });
  stage.addEventListener('focusout', () => { paused = false; });

  stage.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const card = e.target.closest && e.target.closest('.deck-card');
      if (card) { e.preventDefault(); openScreen(parseInt(card.dataset.index, 10)); }
      return;
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    handOff();
    const forward = e.key === 'ArrowRight';
    step(forward ? 1 : -1, forward ? -1 : 1);
  });

  // Trackpads scroll the deck sideways; the vertical wheel still scrolls the page
  stage.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    handOff();
    wheelAcc += e.deltaX;
    clearTimeout(wheelReset);
    if (Math.abs(wheelAcc) > 34) {
      step(1, wheelAcc > 0 ? -1 : 1);
      wheelAcc = 0;
    } else {
      wheelReset = setTimeout(() => { wheelAcc = 0; }, 160);
    }
  }, { passive: false });

  new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; },
    { rootMargin: '140px 0px' }).observe(stage);

  /* ---- First paint: place the stack without animating in from nothing --- */
  cards.forEach((card) => { card.style.transition = 'none'; });
  render();
  void stage.offsetWidth;
  cards.forEach((card) => { card.style.transition = ''; });
  captions(true);
  startAuto();
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

  const items = Array.from(document.querySelectorAll('.deck-card')).map((c) => ({
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