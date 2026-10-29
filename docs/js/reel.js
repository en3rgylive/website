/* EN3RGY - reel.js
   The film is real footage, cut into chapters (one per scene) and packed by tools/pack_clips.py into frame sheets.
   Scroll position picks the frame, neighbouring frames are blended so scrubbing stays smooth, and each chapter holds
   its first frame briefly so the caption can be read. Hard cuts between scenes dissolve through a warm flash.
   Captions, counter, progress bar and call to action follow the same scroll value. */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const sstep = (a, b, x) => smooth(clamp((x - a) / (b - a), 0, 1));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;

  const filmEl = $('#film'), stick = $('.film-stick'), cv = $('#stage');
  const fail = () => document.documentElement.classList.add('no-film');      // shows the plain list of stills instead
  if (!filmEl || !stick || !cv || !cv.getContext) { fail(); return; }
  let base = new URLSearchParams(location.search).get('clips') || 'clips/';  // ?clips=other/folder/ to try another set
  if (base.slice(-1) !== '/') base += '/';
  fetch(base + 'manifest.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no manifest'))))
    .then((m) => { if (!m || !m.clips || !m.clips.length) throw new Error('empty manifest'); start(m); })
    .catch(fail);

  function start(M) {
    const ctx = cv.getContext('2d', { alpha: false });
    const clips = M.clips, K = clips.length;                 // K chapters
    const small = coarse || Math.min(screen.width || 1200, screen.height || 800) < 700;
    const grid = (small && M.mgrid) || M.grid || { cols: 1, rows: 1 };      // frames per sheet: the phone set can use a different grid
    const cols = grid.cols || 1, rows = grid.rows || 1, per = cols * rows;
    const unitsOf = (c) => (small && c.munits) || c.units || Math.ceil(c.n / per);
    const EASE = reduce ? 0 : 0.35;                          // a little easing on the footage inside each chapter
    const PRE = 0.02, POST = 0.04;                           // scroll held on the very first and very last frame

    /* ---------- scroll length of each chapter ---------- */
    const wts = clips.map((c) => c.w || 1), cum = [0];
    wts.forEach((w, i) => cum.push(cum[i] + w));
    const wsum = cum[K];

    /* ---------- sheets: a coarse pass first so scrubbing works at once, then fill in around the playhead ---------- */
    const uStart = [], uClip = [], uLocal = [];
    let nU = 0;
    clips.forEach((c, ci) => {
      const units = unitsOf(c);
      uStart.push(nU);
      for (let u = 0; u < units; u++) { uClip.push(ci); uLocal.push(u); }
      nU += units;
    });
    const uImg = new Array(nU).fill(null), uState = new Uint8Array(nU), uDec = new Uint8Array(nU);   // state: 0 idle, 1 loading, 2 loaded, 3 failed
    const url = (g) => {
      const c = clips[uClip[g]];
      return base + (small ? (c.mdir || c.dir) : c.dir) + String(uLocal[g] + 1).padStart(4, '0') + '.' + (M.ext || 'webp');
    };
    const isKey = (g) => uLocal[g] === 0 || g === uStart[uClip[g]] + unitsOf(clips[uClip[g]]) - 1;
    const coarseList = [];
    for (let g = 0; g < nU; g++) if (isKey(g) || uLocal[g] % 3 === 0) coarseList.push(g);
    coarseList.sort((a, b) => (isKey(a) ? 0 : 1) - (isKey(b) ? 0 : 1) || a - b);
    const isCoarse = new Uint8Array(nU); coarseList.forEach((g) => { isCoarse[g] = 1; });
    let coarsePtr = 0, coarseDone = 0, head = 0, dirty = true, firstOk = false;
    const loadEl = $('#filmLoad'), loadBar = loadEl && loadEl.querySelector('i');
    function progress() {
      const k = Math.min(1, coarseDone / coarseList.length);
      if (loadBar) loadBar.style.transform = 'scaleX(' + k.toFixed(3) + ')';
      if (loadEl && k >= 1) loadEl.classList.add('done');
    }
    function pick() {
      if (coarsePtr < coarseList.length) return coarseList[coarsePtr++];
      let best = -1, bd = 1e9;
      for (let g = 0; g < nU; g++) {
        if (uState[g]) continue;
        const d = g - head, dd = d >= 0 ? d : -d * 1.6;       // look ahead of the playhead first
        if (dd < bd) { bd = dd; best = g; }
      }
      return best;
    }
    function loadOne(g) {
      return new Promise((res) => {
        const im = new Image();
        im.decoding = 'async';
        im.onload = () => { uImg[g] = im; uState[g] = 2; if (g === 0) firstOk = true; if (isCoarse[g]) { coarseDone++; progress(); } dirty = true; res(); };
        im.onerror = () => { uState[g] = 3; if (isCoarse[g]) { coarseDone++; progress(); } if (g === 0) fail(); res(); };
        im.src = url(g);
      });
    }
    async function worker() { for (;;) { const g = pick(); if (g < 0) return; uState[g] = 1; await loadOne(g); } }
    Promise.all(Array.from({ length: coarse ? 3 : 5 }, worker));
    function warm() {                                         // decode the sheets just ahead of and behind the playhead
      for (let g = Math.max(0, head - 1); g <= Math.min(nU - 1, head + 2); g++) {
        const im = uImg[g];
        if (im && !uDec[g] && im.decode) { uDec[g] = 1; im.decode().catch(() => {}); }
      }
    }

    /* ---------- sizing ---------- */
    let W = 0, H = 0, dpr = 1, portrait = false;
    function resize() {
      const r = cv.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(2, Math.round(r.width)); H = Math.max(2, Math.round(r.height));
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      portrait = W / H < 1.0;
      stick.classList.toggle('portrait', portrait);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      dirty = true;
    }
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 250));

    /* ---------- drawing ---------- */
    function frameAt(ci, i) {                                 // the loaded frame of this chapter nearest to index i
      const n = clips[ci].n, u0 = uStart[ci];
      for (let d = 0; d < n; d++) {
        for (let s = 0; s < (d ? 2 : 1); s++) {
          const j = s ? i + d : i - d;
          if (j < 0 || j >= n) continue;
          const im = uImg[u0 + ((j / per) | 0)];
          if (im) return { im, cell: j % per };
        }
      }
      return null;
    }
    function blit(fr, alpha, px) {
      const sw = fr.im.naturalWidth / cols, sh = fr.im.naturalHeight / rows;
      const sx = (fr.cell % cols) * sw + 1, sy = ((fr.cell / cols) | 0) * sh + 1, ssw = sw - 2, ssh = sh - 2;   // 1 px inset so a neighbour never bleeds in
      const s = Math.max(cv.width / ssw, cv.height / ssh);
      const w = ssw * s, h = ssh * s;
      let x = cv.width / 2 - px * w;                          // portrait: slide the crop along the picture
      x = clamp(x, Math.min(0, cv.width - w), 0);
      ctx.globalAlpha = alpha;
      ctx.drawImage(fr.im, sx, sy, ssw, ssh, x, (cv.height - h) / 2, w, h);
    }
    function playT(ci, r) {                                   // chapter progress -> footage progress, with the holds
      const hold = clips[ci].hold || [0.1, 0.06];
      const t = clamp((r - hold[0]) / (1 - hold[0] - hold[1]), 0, 1);
      return lerp(t, smooth(t), EASE);
    }
    function layer(ci, t, alpha, settle) {
      const c = clips[ci], n = c.n, f = t * (n - 1), a = Math.floor(f), b = Math.min(n - 1, a + 1);
      let k = f - a;
      if (settle > 0) k = lerp(k, k < 0.5 ? 0 : 1, settle);   // when scrolling pauses, rest on a sharp frame
      const kx = c.kx || [0.5, 0.5], p0 = lerp(kx[0], kx[1], t), px = portrait ? p0 : 0.5 + (p0 - 0.5) * 0.5;
      const fa = frameAt(ci, a), fb = frameAt(ci, b);
      if (!fa) return;
      blit(fa, alpha, px);
      if (fb && fb !== fa && !(fb.im === fa.im && fb.cell === fa.cell) && k > 0.004) blit(fb, alpha * k, px);
    }
    function locate(P) {                                      // scroll progress -> chapter index and progress inside it
      const x = clamp((P - PRE) / (1 - PRE - POST), 0, 1) * wsum;
      let i = K - 1;
      for (let k = 0; k < K; k++) if (x < cum[k + 1]) { i = k; break; }
      return { i, r: clamp((x - cum[i]) / wts[i], 0, 1) };
    }
    let flash = 0;
    function draw(i, r, settle) {
      head = uStart[i] + (((playT(i, r) * (clips[i].n - 1)) / per) | 0);
      ctx.globalAlpha = 1; ctx.fillStyle = '#03040a'; ctx.fillRect(0, 0, cv.width, cv.height);
      const q = i + r;
      // across a hard cut the ending chapter and the starting chapter dissolve, both resting on their still frames
      let b = -1, seam = 0;
      if (i > 0 && r < 0.5 && clips[i].seam) { b = i; seam = clips[i].seam; }
      else if (i < K - 1 && r >= 0.5 && clips[i + 1].seam) { b = i + 1; seam = clips[i + 1].seam; }
      flash = 0;
      if (b > 0 && Math.abs(q - b) < seam) {
        const t = smooth(clamp((q - (b - seam)) / (2 * seam), 0, 1));
        layer(b - 1, playT(b - 1, clamp(q - (b - 1), 0, 1)), 1, settle);
        layer(b, playT(b, clamp(q - b, 0, 1)), t, settle);
        flash = (clips[b].flash || 0) * Math.exp(-Math.pow((q - b) / (seam * 0.55), 2));
        head = uStart[t < 0.5 ? b - 1 : b];
      } else {
        layer(i, playT(i, r), 1, settle);
      }
      if (flash > 0.004) {
        ctx.globalAlpha = Math.min(0.6, flash * (reduce ? 0.4 : 1));
        ctx.fillStyle = '#ffd9a0'; ctx.fillRect(0, 0, cv.width, cv.height);
      }
      ctx.globalAlpha = 1;
    }

    /* ---------- captions, counter, progress, call to action ---------- */
    const capEls = $$('.cap'), flareEl = $('#flare'), flareLine = flareEl && flareEl.firstElementChild;
    const barEl = $('#filmBar'), cueEl = $('#cue'), ctaEl = $('#filmCta'), cNum = $('#cNum'), cName = $('#cName'), cTot = $('.counter span');
    const NAMES = capEls.map((el) => { const k = $('.k', el); return k ? k.textContent : ''; });
    if (cTot) cTot.textContent = '/ ' + String(K).padStart(2, '0');
    let lastIdx = -1;
    function ui(i, r, P) {
      const q = i + r;
      capEls.forEach((el) => {
        const k = +el.dataset.i;
        const inK = k === 0 ? 1 : sstep(k + 0.05, k + 0.17, q), outK = k >= K - 1 ? 1 : 1 - sstep(k + 0.83, k + 0.95, q);
        const v = inK * outK;
        el.style.opacity = v.toFixed(3);
        el.style.transform = 'translate3d(0,' + ((1 - inK) * 24 - (1 - outK) * 16).toFixed(1) + 'px,0)';
        el.style.visibility = v > 0.01 ? 'visible' : 'hidden';
        el.toggleAttribute('inert', v < 0.5);
      });
      if (barEl) barEl.style.transform = 'scaleY(' + P.toFixed(4) + ')';
      if (cueEl) cueEl.style.opacity = (1 - sstep(0.0, 0.2, q)).toFixed(3);
      if (ctaEl) ctaEl.classList.toggle('on', q > 0.55);
      const idx = clamp(Math.floor(q + 0.1), 0, K - 1);
      if (idx !== lastIdx) { lastIdx = idx; if (cNum) cNum.textContent = String(idx + 1).padStart(2, '0'); if (cName && NAMES[idx]) cName.textContent = NAMES[idx]; }
      if (flareEl) {
        flareEl.style.opacity = Math.min(1, flash * 1.6 * (reduce ? 0.5 : 1)).toFixed(3);
        if (flareLine) flareLine.style.transform = 'scaleX(' + (0.2 + flash * 2.4).toFixed(3) + ')';
      }
    }

    /* ---------- loop ---------- */
    let forced = null;
    window.HNreel = { set: (p) => { forced = p; }, info: () => ({ chapters: K, sheets: nU, loaded: uState.reduce((a, s) => a + (s === 2 ? 1 : 0), 0), small }) };
    function readProgress() {
      const r = filmEl.getBoundingClientRect();
      const span = r.height - (stick.clientHeight || window.innerHeight);
      return span > 0 ? clamp(-r.top / span, 0, 1) : 0;
    }
    let ps = 0, first = true, last = performance.now(), lastMove = 0, lastTarget = -1, lastSettle = -1, lastP = -1, warmAt = -1;
    function frame(now) {
      requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.1); last = now;
      const target = forced != null ? forced : readProgress();
      ps = first || reduce ? target : lerp(ps, target, 1 - Math.exp(-dt * 8));
      if (Math.abs(ps - target) < 0.00004) ps = target;
      first = false;
      if (Math.abs(target - lastTarget) > 0.00002 || Math.abs(ps - target) > 0.0004) { lastMove = now; lastTarget = target; }
      const settle = reduce ? 1 : smooth(clamp((now - lastMove) / 1000 - 0.12, 0, 0.3) / 0.3);
      const L = locate(ps);
      const r = filmEl.getBoundingClientRect();
      const onScreen = !(r.bottom < -50 || r.top > innerHeight + 50);
      if (onScreen && (dirty || ps !== lastP || Math.abs(settle - lastSettle) > 0.002)) { draw(L.i, L.r, settle); dirty = false; lastP = ps; lastSettle = settle; }
      ui(L.i, L.r, ps);
      if (onScreen && head !== warmAt) { warmAt = head; warm(); }
    }

    resize();
    document.documentElement.classList.add('has-film', 'has-reel');
    requestAnimationFrame(frame);
    setTimeout(() => { if (!firstOk) fail(); }, 9000);
  }
})();
