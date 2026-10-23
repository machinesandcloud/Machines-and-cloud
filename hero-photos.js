// Quiet trade-photo rotation. The original HVAC image also works without this script.
(() => {
  const root = document.querySelector('[data-hero-photos]');
  if (!root) return;
  const stage = root.querySelector('[data-hero-stage]');
  const toggle = root.querySelector('[data-hero-toggle]');
  const entries = [...root.querySelectorAll('[data-hero-photo]')];
  if (!stage || !toggle || entries.length < 2) return;
  const photos = entries.map(entry => ({ ...entry.dataset, image: null, ready: null, failed: false }));
  photos[0].image = stage.querySelector('img');
  if (!photos[0].image) return;
  const job = root.querySelector('.site-job-note p > span');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const DWELL = 3000, FADE = 400;
  let current = 0, timer, intent = 0, autoIntent = 0, fading = false, pending = null, finishFade = null;
  let userPaused = false, focused = false, inView = false, away = false;

  const canPlay = () => !userPaused && !motion.matches && !focused && inView && !away && !document.hidden;
  function schedule() {
    clearTimeout(timer);
    autoIntent++;
    if (canPlay() && !fading && photos.filter(photo => !photo.failed).length > 1) {
      timer = setTimeout(advance, DWELL);
    }
  }
  function updateToggle() {
    const onlyOne = photos.filter(photo => !photo.failed).length < 2;
    const paused = userPaused || motion.matches || onlyOne;
    const label = motion.matches ? 'Automatic photos off for reduced motion' : onlyOne ? 'Only one photo is available' : paused ? 'Play photo rotation' : 'Pause photo rotation';
    toggle.hidden = motion.matches || onlyOne;
    toggle.dataset.paused = String(paused);
    toggle.disabled = motion.matches || onlyOne;
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
  }
  function ready(index) {
    const photo = photos[index];
    if (photo.failed) return Promise.resolve(null);
    if (photo.ready) return photo.ready;
    photo.ready = new Promise(resolve => {
      const image = photo.image || new Image();
      photo.image = image;
      image.className = 'site-hero-photo' + (index === current ? ' is-visible' : '');
      image.dataset.photo = photo.photo;
      image.width = 1800;
      image.height = 1200;
      image.decoding = 'async';
      let settled = false;
      const done = success => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        image.onload = image.onerror = null;
        if (!success) {
          photo.failed = true;
          updateToggle();
        }
        resolve(success ? image : null);
      };
      const loaded = async () => {
        try {
          if (!image.naturalWidth) return done(false);
          if (image.decode) await image.decode();
          done(image.naturalWidth > 0);
        } catch { done(false); }
      };
      const deadline = setTimeout(() => done(false), 10000);
      image.onload = loaded;
      image.onerror = () => done(false);
      if (!image.getAttribute('src')) {
        image.alt = '';
        image.setAttribute('aria-hidden', 'true');
        image.src = photo.src;
      }
      if (image.complete) loaded();
    });
    return photo.ready;
  }
  async function show(index, manual = false) {
    clearTimeout(timer);
    if (fading) { pending = index; return; }
    const request = ++intent;
    if (index === current) { schedule(); return; }
    const incoming = await ready(index);
    if (request !== intent) return;
    if (!incoming || (!manual && !canPlay())) { schedule(); return; }
    fading = true;
    const outgoing = photos[current].image;
    const instant = motion.matches || photos[current].failed;
    incoming.style.transition = instant ? 'none' : '';
    incoming.classList.remove('is-visible');
    incoming.alt = '';
    incoming.setAttribute('aria-hidden', 'true');
    stage.insertBefore(incoming, stage.firstChild.nextSibling);
    // Keep the old image underneath while the decoded replacement fades in.
    incoming.getBoundingClientRect();
    incoming.classList.add('is-visible');
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(fallback);
      incoming.removeEventListener('transitionend', transitioned);
      outgoing.classList.remove('is-visible');
      outgoing.alt = '';
      outgoing.setAttribute('aria-hidden', 'true');
      outgoing.remove();
      incoming.alt = photos[index].alt;
      incoming.removeAttribute('aria-hidden');
      current = index;
      if (job) job.textContent = photos[index].job;
      fading = false;
      finishFade = null;
      const next = pending;
      pending = null;
      if (next !== null && next !== current) show(next, true);
      else schedule();
    };
    const transitioned = event => { if (event.target === incoming && event.propertyName === 'opacity') finish(); };
    finishFade = finish;
    incoming.addEventListener('transitionend', transitioned);
    const fallback = setTimeout(finish, instant ? 0 : FADE + 80);
    if (instant) finish();
  }
  async function advance() {
    if (!canPlay()) return;
    const request = autoIntent;
    for (let step = 1; step < photos.length; step++) {
      const next = (current + step) % photos.length;
      const image = await ready(next);
      if (request !== autoIntent) return;
      if (image) { if (canPlay()) show(next); return; }
    }
    updateToggle();
  }
  toggle.addEventListener('click', () => {
    userPaused = !userPaused;
    // Explicit Play resumes even while the keyboard focus remains on this control.
    // Explicit Pause persists through later focus, visibility and viewport changes.
    if (!userPaused) focused = false;
    updateToggle();
    schedule();
  });
  root.addEventListener('focusin', () => { focused = true; schedule(); });
  root.addEventListener('focusout', () => queueMicrotask(() => { focused = root.contains(document.activeElement); schedule(); }));
  document.addEventListener('visibilitychange', schedule);
  motion.addEventListener('change', () => {
    updateToggle();
    if (motion.matches && finishFade) finishFade();
    if (!motion.matches) preload();
    schedule();
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => { inView = entries[0].isIntersecting; schedule(); }, { threshold: 0.05 }).observe(root);
  } else {
    const measure = () => { const box = root.getBoundingClientRect(); inView = box.bottom > 0 && box.top < innerHeight; schedule(); };
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    measure();
  }
  window.addEventListener('pagehide', () => { away = true; intent++; schedule(); });
  window.addEventListener('pageshow', () => { away = false; schedule(); });
  function preload() {
    // Decode the small local alternates while the first photograph is already visible.
    // Rotation never has to fade into an image that is still loading.
    if (!motion.matches) photos.forEach((photo, index) => { if (index !== current) ready(index); });
  }
  async function recoverFirst() {
    // A failed first image needs a usable still even with reduced motion or offscreen.
    for (let index = 1; index < photos.length; index++) {
      if (await ready(index)) { await show(index, true); return; }
    }
    updateToggle();
  }
  updateToggle();
  ready(0).then(image => { if (image) { preload(); schedule(); } else recoverFirst(); });
})();
