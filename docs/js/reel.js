/* EN3RGY - reel.js
   The film is real footage, cut into chapters (one per scene) and packed by tools/pack_clips.py into one file per frame.
   Scroll position picks the frame. Three things keep it smooth:
   - tiny preview frames load first, so scrubbing works at once and never waits on a big image,
   - full frames are decoded off the main thread, in a window around the playhead, and drawing never blocks on a decode,
   - the scroll value is eased, so a mouse wheel and a trackpad both feel the same.
   Each chapter holds its first frame while the caption is read and drifts in slowly so the picture never looks frozen.
   A hard cut between scenes becomes a push through light: the old scene pushes in and blooms, the new one settles out of it.
   The landing screen is just a small, clean sun; scrolling reveals the ray, the stars and the corona outward from it.
   On phones the motion is calmer and lighter (less drift and push, no zoom blur, fewer decoded frames), and on touch screens
   native scroll snapping makes one swipe move one chapter. */
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
  const params = new URLSearchParams(location.search);
  let base = params.get('clips') || 'clips/';                // ?clips=other/folder/ to try another set
  if (base.slice(-1) !== '/') base += '/';
  let VERTICAL = params.get('vertical') || filmEl.getAttribute('data-vertical') || '';   // a film made in 9:16 for upright screens (tools/pack_clips.py --vertical); ?vertical=folder/ tries one
  if (VERTICAL && VERTICAL.slice(-1) !== '/') VERTICAL += '/';
  const upright = window.matchMedia('(max-aspect-ratio: 4/5)');   // a phone or tablet held upright, or a tall narrow window
  const getManifest = (b) => fetch(b + 'manifest.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('no manifest'))))
    .then((m) => { if (!m || !m.clips || !m.clips.length) throw new Error('empty manifest'); return m; });
  const startedUpright = upright.matches;
  (VERTICAL && !params.get('clips') && startedUpright ? getManifest(VERTICAL).then((m) => { base = VERTICAL; return m; }, () => getManifest(base)) : getManifest(base))
    .then((m) => {
      const usedVertical = !!VERTICAL && base === VERTICAL;
      let turnTimer = 0;
      const onTurn = () => {                                 // the phone was turned: switch to the film made for that way up
        clearTimeout(turnTimer);
        turnTimer = setTimeout(() => { if (upright.matches !== startedUpright && (usedVertical || upright.matches)) location.reload(); }, 500);
      };
      if (VERTICAL && !params.get('clips')) { if (upright.addEventListener) upright.addEventListener('change', onTurn); else if (upright.addListener) upright.addListener(onTurn); }
      start(m);
    })
    .catch(fail);

  function start(M) {
    const ctx = cv.getContext('2d', { alpha: false });
    const clips = M.clips, K = clips.length;                 // K chapters
    const small = coarse || Math.min(screen.width || 1200, screen.height || 800) < 700;
    const extOf = (set) => (set && set.ext) || M.ext || 'webp';
    const hasP = !!(M.p && clips[0].pdir), pstep = M.pstep || 1;
    const CALM = small ? 0.6 : 1;                            // phones get a gentler camera: less drift, a softer push through each cut
    const DRIFT = reduce ? 0 : (M.drift != null ? M.drift : 0.05) * CALM;
    const EASE = reduce ? 0 : 0.35;                          // a little easing on the footage inside each chapter
    const PRE = 0.02, POST = 0.04;                           // scroll held on the very first and very last frame
    const BG = '#03040a';

    /* ---------- scroll length of each chapter, and the global frame index ---------- */
    const wts = clips.map((c) => c.w || 1), cum = [0];
    wts.forEach((w, i) => cum.push(cum[i] + w));
    const wsum = cum[K];
    const first = [], gClip = [], gLocal = [];
    let N = 0;
    clips.forEach((c, ci) => { first.push(N); for (let i = 0; i < c.n; i++) { gClip.push(ci); gLocal.push(i); } N += c.n; });
    const pad = (n) => String(n).padStart(4, '0');
    const fExt = extOf(small ? M.m : M.d), pExt = extOf(M.p);
    const crop = small && M.m && M.m.crop;                    // the phone set keeps only the middle band of the picture
    const fUrl = (g) => { const c = clips[gClip[g]]; return base + (small ? (c.mdir || c.dir) : c.dir) + pad(gLocal[g] + 1) + '.' + fExt; };
    const pUrl = (g) => base + clips[gClip[g]].pdir + pad(gLocal[g] + 1) + '.' + pExt;
    const hasPrev = (g) => hasP && (gLocal[g] % pstep === 0 || gLocal[g] === clips[gClip[g]].n - 1);   // the preview set may keep only every Nth frame

    /* ---------- frames: fetched as blobs, decoded to bitmaps only inside a window around the playhead ---------- */
    const fBlob = new Array(N).fill(null), pBlob = new Array(N).fill(null);
    const fBmp = new Array(N).fill(null), pBmp = new Array(N).fill(null);
    const fFet = new Uint8Array(N), pFet = new Uint8Array(N), fDec = new Uint8Array(N), pDec = new Uint8Array(N);   // 0 idle, 1 busy, 2 done, 3 failed
    const canBmp = typeof createImageBitmap === 'function';
    const IN = M.intro || null;                               // the clean sun for the landing screen
    let introBmp = null, introFail = false;
    const t0 = performance.now();
    const SNAPPY = coarse && K > 1;                           // touch screens: a swipe jumps a whole chapter, so frames are kept ready at the neighbouring stops instead
    const W_FULL = SNAPPY ? { ahead: 5, behind: 2 } : small ? { ahead: 11, behind: 4 } : { ahead: 14, behind: 5 };   // how many full frames stay decoded (a phone frame is ~8 MB decoded)
    const SLACK = SNAPPY ? 2 : 6;                            // decoded frames kept beyond the window before they are freed
    let pins = [];                                            // frames to fetch and keep decoded: the resting frames of the stops either side of the playhead
    const W_PREV = { ahead: 100, behind: 60 };
    let fastMove = false;                                     // phones: while the playhead flies past, only previews are drawn and no new full frames are decoded
    let head = 0, dirSign = 1, dirty = true, firstOk = false, pDone = 0, fPend = 0, pPend = 0, fDecPend = 0, pDecPend = 0, nextP = 0, gen = 0;
    const pOrder = [];
    clips.forEach((c, ci) => { pOrder.push(first[ci]); pOrder.push(first[ci] + c.n - 1); });
    const nKey = pOrder.length;                               // after the key frames, previews load nearest to the playhead first
    let pTotal = 0;
    for (let g = 0; g < N; g++) if (hasPrev(g)) pTotal++;
    const loadEl = $('#filmLoad'), loadBar = loadEl && loadEl.querySelector('i');
    function progress() {
      const k = hasP ? pDone / pTotal : Math.min(1, fBmp.reduce((a, b) => a + (b ? 1 : 0), 0) / Math.min(N, 40));
      if (loadBar) loadBar.style.transform = 'scaleX(' + Math.min(1, k).toFixed(3) + ')';
      if (loadEl && k >= 1) loadEl.classList.add('done');
    }
    const blobOf = (url) => fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(r.status)));
    function decodeBlob(blob, resizeTo) {
      if (!canBmp) {                                          // old browsers: an image element, decoded when drawn
        return new Promise((res, rej) => { const im = new Image(), u = URL.createObjectURL(blob); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = rej; im.src = u; });
      }
      if (resizeTo) return createImageBitmap(blob, { resizeWidth: resizeTo.w, resizeHeight: resizeTo.h, resizeQuality: 'high' }).catch(() => createImageBitmap(blob));
      return createImageBitmap(blob);
    }
    const closeBmp = (b) => { if (b && b.close) b.close(); };
    let bmpSize = null;                                       // decode a little smaller than the file when the screen is smaller than it
    function sizeFor(natW, natH) {
      const cover = Math.max(cv.width / natW, cv.height / natH);
      return cover < 0.85 ? { w: Math.ceil(natW * cover * 1.05), h: Math.ceil(natH * cover * 1.05) } : null;
    }
    function pumpPrev() {
      const pl = head - W_PREV.behind, ph = head + W_PREV.ahead;
      for (let d = 0; d <= 100 && pDecPend < 4; d++) {
        for (let s = 0; s < (d ? 2 : 1) && pDecPend < 4; s++) {
          const g = s ? head - d : head + d;
          if (g < pl || g > ph || g < 0 || g >= N || pDec[g] || !pBlob[g]) continue;
          pDec[g] = 1; pDecPend++;
          decodeBlob(pBlob[g]).then((b) => { if (pDec[g] === 1) { pBmp[g] = b; pDec[g] = 2; dirty = true; if (g === 0) firstOk = true; } else closeBmp(b); }, () => { pDec[g] = 3; })
            .then(() => { pDecPend--; });
        }
      }
      for (let g = 0; g < N; g++) if (pBmp[g] && (g < pl - 20 || g > ph + 20)) { closeBmp(pBmp[g]); pBmp[g] = null; pDec[g] = 0; }
    }
    function pump() {
      // 1. previews: everything, key frames first
      while (hasP && pPend < 8) {
        let g = -1;
        if (nextP < nKey) g = pOrder[nextP++];
        else {
          let bd = 1e9;
          for (let c = 0; c < N; c++) { if (pFet[c] || !hasPrev(c)) continue; const d = Math.abs(c - head); if (d < bd) { bd = d; g = c; } }
          if (g < 0) break;
        }
        if (pFet[g]) continue;
        pFet[g] = 1; pPend++;
        blobOf(pUrl(g)).then((b) => { pBlob[g] = b; pFet[g] = 2; }, () => { pFet[g] = 3; if (g === 0) fail(); })
          .then(() => { pPend--; pDone++; progress(); dirty = true; });
      }
      // 2. full frames: nearest to the playhead first, looking ahead in the scroll direction
      const gate = !hasP || pDone >= pTotal * 0.9;
      const fetchFull = (g) => {
        fFet[g] = 1; fPend++;
        blobOf(fUrl(g)).then((b) => { fBlob[g] = b; fFet[g] = 2; }, () => { fFet[g] = 3; if (g === 0 && !hasP) fail(); })
          .then(() => { fPend--; dirty = true; });
      };
      if (gate) for (const g of pins) if (fPend < 4 && !fFet[g]) fetchFull(g);
      while (fPend < 4) {
        let best = -1, bd = 1e9;
        for (let g = 0; g < N; g++) {
          if (fFet[g]) continue;
          const d = g - head;
          if (!gate && Math.abs(d) > 14) continue;
          const dd = (d * dirSign >= 0 ? d * dirSign : -d * dirSign * 1.7);
          if (dd < bd) { bd = dd; best = g; }
        }
        if (best < 0) break;
        fetchFull(best);
      }
      // 3. decode windows
      if (fastMove) { if (hasP) pumpPrev(); return; }
      const wf = dirSign >= 0 ? W_FULL : { ahead: W_FULL.behind, behind: W_FULL.ahead };
      const lo = head - wf.behind, hi = head + wf.ahead;
      const reach = Math.max(wf.ahead, wf.behind);
      const decFull = (g) => {
        fDec[g] = 1; fDecPend++;
        decodeBlob(fBlob[g], bmpSize).then((b) => { if (fDec[g] === 1) { fBmp[g] = b; fDec[g] = 2; dirty = true; } else closeBmp(b); }, () => { fDec[g] = 3; })
          .then(() => { fDecPend--; });
      };
      for (let d = 0; d <= reach && fDecPend < 3; d++) {
        for (let s = 0; s < (d ? 2 : 1) && fDecPend < 3; s++) {
          const g = s ? head - d : head + d;
          if (g < lo || g > hi || g < 0 || g >= N || fDec[g] || !fBlob[g]) continue;
          decFull(g);
        }
      }
      for (const g of pins) if (fDecPend < 3 && !fDec[g] && fBlob[g]) decFull(g);
      for (let g = 0; g < N; g++) if (fBmp[g] && (g < lo - SLACK || g > hi + SLACK) && pins.indexOf(g) < 0) { closeBmp(fBmp[g]); fBmp[g] = null; fDec[g] = 0; }
      if (hasP) pumpPrev();
      if (!firstOk && fBmp[0]) firstOk = true;
    }

    /* ---------- sizing ---------- */
    let W = 0, H = 0, dpr = 1, portrait = false, dprCap = small ? 3 : 2;   // draw at the screen's own density: a canvas the browser has to stretch by a fraction every frame is slower and softer
    function resize() {
      const r = cv.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      W = Math.max(2, Math.round(r.width)); H = Math.max(2, Math.round(r.height));
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      portrait = W / H < 1.0;
      stick.classList.toggle('portrait', portrait);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      const nat = M[small ? 'm' : 'd'], want = sizeFor(nat.w, nat.h);
      if ((want && want.w) !== (bmpSize && bmpSize.w)) {      // the decode size changed: start the decoded window again
        bmpSize = want;
        for (let g = 0; g < N; g++) { closeBmp(fBmp[g]); fBmp[g] = null; if (fDec[g] !== 3) fDec[g] = 0; }
      }
      dirty = true;
      if (typeof measureCaps === 'function') measureCaps();
    }
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 250));

    /* ---------- drawing ---------- */
    function pick(ci, i) {                                    // the best frame we have for this index, without ever waiting
      const n = clips[ci].n, g0 = first[ci];
      if (fBmp[g0 + i]) return fBmp[g0 + i];
      if (pBmp[g0 + i]) return pBmp[g0 + i];
      for (let d = 1; d < 48; d++) {
        for (let s = 0; s < 2; s++) {
          const j = s ? i + d : i - d;
          if (j < 0 || j >= n) continue;
          if (fBmp[g0 + j]) return fBmp[g0 + j];
          if (pBmp[g0 + j]) return pBmp[g0 + j];
        }
      }
      return null;
    }
    const dimW = (b) => b.width || b.naturalWidth, dimH = (b) => b.height || b.naturalHeight;
    let g2 = ctx;                                             // where blit draws: the canvas, or the off-screen layer while a reveal is built
    function rectOf(iw, ih, px, zoom, anchor) {                // where a picture of this size lands on the canvas
      const s = Math.max(cv.width / iw, cv.height / ih) * zoom;
      const w = iw * s, h = ih * s;
      let x = w >= cv.width ? clamp(cv.width / 2 - px * w, cv.width - w, 0) : (cv.width - w) / 2;   // portrait: slide the crop along the picture
      let y = (cv.height - h) / 2;
      if (anchor && anchor.k > 0) {                           // keep a chosen point of the picture (the sun) at a chosen spot on the screen
        x = lerp(x, anchor.tx * cv.width - anchor.fx * w, anchor.k);
        y = lerp(y, anchor.ty * cv.height - anchor.fy * h, anchor.k);
      }
      return { x, y, w, h };
    }
    function blit(im, alpha, px, zoom, anchor) {
      const rc = rectOf(dimW(im), dimH(im), px, zoom, anchor);
      g2.globalAlpha = alpha;
      g2.drawImage(im, rc.x, rc.y, rc.w, rc.h);
      return rc;
    }
    function playT(ci, r) {                                   // chapter progress -> footage progress, with the holds
      const hold = clips[ci].hold || [0.2, 0.08];
      const t = clamp((r - hold[0]) / (1 - hold[0] - hold[1]), 0, 1);
      return lerp(t, smooth(t), EASE);
    }
    const introOn = () => !!(IN && introBmp);
    const revealOf = (r) => smooth(clamp(r / IN.to, 0, 1));    // how far the ray has been revealed (0 = only the sun)
    function chapterZoom(ci, t, r) {                          // a chapter can start zoomed out, and every chapter drifts in a little
      const c = clips[ci], zr = (portrait && c.zoomP) || c.zoom;   // a tall screen can have its own zoom: the whole sun has to fit in a narrow window
      let z = 1;
      if (zr) {
        let z0 = zr[0];
        if (ci === 0 && introOn()) z0 = lerp((portrait && IN.zoomP) || IN.zoom, z0, revealOf(r));   // the landing starts with a small sun, which grows as the ray appears
        z = lerp(z0, zr[1], smooth(clamp(t / (c.zoomT || 0.3), 0, 1)));
      }
      return z * (1 + DRIFT * r);
    }
    function anchorFor(z) {                                   // pins the sun to its landing position while the picture is zoomed out
      const tgt = (portrait && IN.targetP) || IN.target || [0.5, 0.46];
      const k = portrait && IN.fixP ? 1 : clamp((1 - z) / (1 - IN.zoom), 0, 1);   // on a phone the sun stays in the upper half for the whole chapter, above the words
      return { fx: IN.cx, fy: IN.cy, tx: tgt[0], ty: tgt[1], k };
    }
    function pxAt(c, t) {
      const kx = c.kx || [0.5, 0.5], p0 = lerp(kx[0], kx[1], t);
      let px = portrait ? p0 : 0.5 + (p0 - 0.5) * 0.5;
      if (crop) px = (px - crop[0]) / (crop[1] - crop[0]);
      return px;
    }
    function layer(ci, t, alpha, settle, zoom, anchor) {
      const c = clips[ci], n = c.n, f = t * (n - 1), a = Math.floor(f), b = Math.min(n - 1, a + 1);
      let k = f - a;
      if (settle > 0) k = lerp(k, k < 0.5 ? 0 : 1, settle);   // when scrolling pauses, rest on a sharp frame
      const px = pxAt(c, t);
      const fa = pick(ci, a), fb = pick(ci, b);
      if (!fa) return null;
      const rc = blit(fa, alpha, px, zoom, anchor);
      if (fb && fb !== fa && k > 0.004) blit(fb, alpha * k, px, zoom, anchor);
      return rc;
    }
    function streak(ci, t, alpha, settle, zoom, amount, an) { // a little zoom blur while the picture pushes through a cut
      if (amount < 0.01 || reduce || small) return layer(ci, t, alpha, settle, zoom, an);   // no zoom blur on phones: three layers per side is a lot of fill
      let rc = null;
      for (let j = 0; j < 3; j++) {
        const r2 = layer(ci, t, j === 0 ? alpha : alpha / (j + 1), settle, zoom * (1 + amount * j * 0.5), an);
        if (!rc) rc = r2;
      }
      return rc;
    }
    function feather(rc, noRight) {                           // a zoomed-out picture melts into the page instead of ending in a hard edge (noRight: the sun carries on past the right edge)
      const f = Math.round(0.16 * Math.min(rc.w, rc.h)), x1 = rc.x + rc.w, y1 = rc.y + rc.h;
      ctx.globalAlpha = 1;
      const edge = (x0, y0, x2, y2, rx, ry, rw, rh) => {
        const g = ctx.createLinearGradient(x0, y0, x2, y2);
        g.addColorStop(0, BG); g.addColorStop(1, 'rgba(3,4,10,0)');
        ctx.fillStyle = g; ctx.fillRect(rx, ry, rw, rh);
      };
      if (rc.x > 1) { edge(rc.x, 0, rc.x + f, 0, rc.x, rc.y, f, rc.h); if (!noRight) edge(x1, 0, x1 - f, 0, x1 - f, rc.y, f + 1, rc.h); }
      if (rc.y > 1) { edge(0, rc.y, 0, rc.y + f, rc.x, rc.y, rc.w, f); edge(0, y1, 0, y1 - f, rc.x, y1 - f, rc.w, f + 1); }
    }
    function bloom(a) {                                       // warm light blooming from the middle of the picture
      if (a < 0.004) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const cx = cv.width / 2, cy = cv.height * 0.5, R = Math.hypot(cv.width, cv.height) * 0.55;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      g.addColorStop(0, 'rgba(255,224,172,' + a.toFixed(3) + ')');
      g.addColorStop(0.45, 'rgba(255,172,92,' + (a * 0.55).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.restore();
    }
    function locate(P) {                                      // scroll progress -> chapter index and progress inside it
      const x = clamp((P - PRE) / (1 - PRE - POST), 0, 1) * wsum;
      let i = K - 1;
      for (let k = 0; k < K; k++) if (x < cum[k + 1]) { i = k; break; }
      return { i, r: clamp((x - cum[i]) / wts[i], 0, 1) };
    }
    const off = document.createElement('canvas'), octx = off.getContext('2d');
    function reveal(i, r, settle, t, z, an) {                  // landing: the clean sun, then the footage revealed outward from it
      const rv = revealOf(r);
      const px = pxAt(clips[0], t);
      let rcS;
      if (IN.box) {                                           // the sun picture is bigger than the film frame (the sun is cut off by the frame's edge): draw it against the frame's own rectangle
        rcS = rectOf(IN.w, IN.h, px, z, an);
        ctx.globalAlpha = 1;
        ctx.drawImage(introBmp, rcS.x + IN.box[0] * rcS.w, rcS.y + IN.box[1] * rcS.h, IN.box[2] * rcS.w, IN.box[3] * rcS.h);
      } else rcS = blit(introBmp, 1, px, z, an);
      if (rv > 0.002) {
        if (off.width !== cv.width || off.height !== cv.height) { off.width = cv.width; off.height = cv.height; }
        octx.globalCompositeOperation = 'source-over'; octx.clearRect(0, 0, off.width, off.height);
        g2 = octx;
        layer(0, t, 1, settle, z, an);
        g2 = ctx;
        const sx = rcS.x + IN.cx * rcS.w, sy = rcS.y + IN.cy * rcS.h;
        const rmax = Math.max(Math.hypot(sx, sy), Math.hypot(cv.width - sx, sy), Math.hypot(sx, cv.height - sy), Math.hypot(cv.width - sx, cv.height - sy));
        const F = rmax * 0.32, R = Math.pow(rv, 1.15) * (rmax + F);
        const gr = octx.createRadialGradient(sx, sy, Math.max(0, R - F), sx, sy, Math.max(1, R));
        gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        octx.globalCompositeOperation = 'destination-in'; octx.fillStyle = gr; octx.fillRect(0, 0, off.width, off.height);
        if (IN.box) {                                         // the picture ends at the frame's right edge but the sun carries on: let the picture melt into the built-out sun there
          const xr = rcS.x + rcS.w, gx = octx.createLinearGradient(xr - rcS.w * 0.12, 0, xr - rcS.w * 0.04, 0);
          gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(1, 'rgba(0,0,0,0)');
          octx.fillStyle = gx; octx.fillRect(0, 0, off.width, off.height);
        }
        octx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1; ctx.drawImage(off, 0, 0);
      }
      return rcS;
    }
    let flash = 0;
    function draw(i, r, settle) {
      head = first[i] + Math.round(playT(i, r) * (clips[i].n - 1));
      ctx.globalAlpha = 1; ctx.fillStyle = BG; ctx.fillRect(0, 0, cv.width, cv.height);
      const q = i + r;
      let b = -1, seam = 0;                                   // the nearest hard cut and how wide its transition is
      if (i > 0 && r < 0.5 && clips[i].seam) { b = i; seam = clips[i].seam; }
      else if (i < K - 1 && r >= 0.5 && clips[i + 1].seam) { b = i + 1; seam = clips[i + 1].seam; }
      flash = 0;
      let rc = null;
      if (b > 0 && Math.abs(q - b) < seam) {
        const u = (q - b) / seam, push = reduce ? 0 : (clips[b].push != null ? clips[b].push : 0.12) * CALM;
        const t = smooth(clamp((u + 0.25) / 0.5, 0, 1));      // the new scene takes over quickly, in the middle of the bloom
        const pk = 1 - Math.abs(u);                           // 1 right at the cut
        const glow = Math.exp(-Math.pow(u / 0.5, 2));         // the bloom peaks exactly at the swap
        const outT = playT(b - 1, clamp(q - (b - 1), 0, 1)), inT = playT(b, clamp(q - b, 0, 1));
        const outZ = chapterZoom(b - 1, outT, clamp(q - (b - 1), 0, 1)) * (1 + push * smooth(clamp(1 + u, 0, 1)));
        const inZ = chapterZoom(b, inT, clamp(q - b, 0, 1)) * (1 + push * (1 - smooth(clamp(u, 0, 1))));
        const rcOut = streak(b - 1, outT, 1, settle, outZ, 0.05 * pk, b === 1 && introOn() ? anchorFor(outZ) : null);
        if (rcOut && (rcOut.x > 1 || rcOut.y > 1)) feather(rcOut);   // a zoomed-out scene melts into the page here too, before the next one arrives
        streak(b, inT, t, settle, inZ, 0.05 * pk);
        flash = (clips[b].flash || 0) * glow;
        head = first[t < 0.5 ? b - 1 : b] + (t < 0.5 ? clips[b - 1].n - 1 : 0);
      } else {
        const t = playT(i, r), z = chapterZoom(i, t, r);
        if (i === 0 && introOn() && revealOf(r) < 0.999) rc = reveal(i, r, settle, t, z, anchorFor(z));
        else rc = layer(i, t, 1, settle, z, i === 0 && introOn() ? anchorFor(z) : null);
      }
      if (rc && (rc.x > 1 || rc.y > 1)) feather(rc, !!(IN && IN.box && i === 0 && b < 0));
      if (flash > 0.004) {
        bloom(Math.min(0.9, flash * 1.5 * (reduce ? 0.3 : 1)));
        ctx.globalAlpha = Math.min(0.3, flash * 0.6 * (reduce ? 0.3 : 1));
        ctx.fillStyle = '#ffd9a0'; ctx.fillRect(0, 0, cv.width, cv.height);
      }
      ctx.globalAlpha = 1;
      if (phoneUI) {                                          // a soft band of shade behind the words; it fades with them, so a cut shows the bare picture
        for (let n = 0; n < capV.length; n++) {
          const a = capV[n], b = capBand[n];
          if (a < 0.004 || !b) continue;
          const g = ctx.createLinearGradient(0, b.y - b.h, 0, b.y + b.h);
          g.addColorStop(0, 'rgba(3,4,10,0)'); g.addColorStop(0.5, 'rgba(3,4,10,' + (0.8 * a).toFixed(3) + ')'); g.addColorStop(1, 'rgba(3,4,10,0)');
          ctx.fillStyle = g; ctx.fillRect(0, b.y - b.h, cv.width, b.h * 2);
        }
      }
    }

    /* ---------- captions, counter, progress, call to action ---------- */
    const capEls = $$('.cap'), flareEl = $('#flare');
    const ticksEl = $('#ticks'), tickFill = [];
    if (ticksEl) for (let k = 0; k < K; k++) { const t = document.createElement('i'), f = document.createElement('b'); t.appendChild(f); ticksEl.appendChild(t); tickFill.push({ el: f, v: -1 }); }
    const barEl = $('#filmBar'), cueEl = $('#cue'), ctaEl = $('#filmCta'), cNum = $('#cNum'), cName = $('#cName'), cTot = $('.counter span');
    const NAMES = capEls.map((el) => { const k = $('.k', el); return k ? k.textContent : ''; });
    if (cTot) cTot.textContent = '/ ' + String(K).padStart(2, '0');
    let lastIdx = -1, glowV = '';
    const RISE = small ? 14 : 24, LEAVE = small ? 10 : 16;     // captions only fade and rise a little; nothing scales
    const capSt = capEls.map(() => ({ o: '', t: '', vis: '', inert: null }));
    const capV = capEls.map(() => 0), capBand = [];            // how visible each caption is, and where its soft shade sits on the canvas (phones)
    let phoneUI = false, capChanged = false;
    function measureCaps() {                                  // phones: the shade behind each caption is painted into the canvas, in the same pass as the picture
      phoneUI = false;                                         // the captions are frosted-glass cards now, which show the picture behind them: no painted shade
      if (!phoneUI) return;
      const sr = stick.getBoundingClientRect();
      capEls.forEach((el, n) => { const rc = el.getBoundingClientRect(); capBand[n] = { y: (rc.top + rc.height / 2 - sr.top) * dpr, h: Math.max(rc.height * 1.1, 150) * dpr }; });
    }
    function ui(i, r, P) {
      const q = i + r;
      capChanged = false;
      capEls.forEach((el, n) => {
        const k = +el.dataset.i, st = capSt[n];
        const inK = k === 0 ? 1 : sstep(k + 0.1, k + 0.24, q), outK = k >= K - 1 ? 1 : 1 - sstep(k + 0.78, k + 0.9, q);
        const v = inK * outK;
        if (Math.abs(v - capV[n]) > 0.002 || (v === 0) !== (capV[n] === 0)) { capV[n] = v; capChanged = true; }
        const o = v.toFixed(3), t = 'translate3d(0,' + ((1 - inK) * RISE - (1 - outK) * LEAVE).toFixed(1) + 'px,0)', vis = v > 0.01 ? 'visible' : 'hidden', inert = v < 0.5;
        if (o !== st.o) { el.style.opacity = o; st.o = o; }
        if (t !== st.t) { el.style.transform = t; st.t = t; }
        if (vis !== st.vis) { el.style.visibility = vis; st.vis = vis; }
        if (inert !== st.inert) { el.toggleAttribute('inert', inert); st.inert = inert; }
      });
      tickFill.forEach((t, k) => { const v = Math.round(clamp(q - k, 0, 1) * 100) / 100; if (v !== t.v) { t.v = v; t.el.style.transform = 'scaleX(' + v + ')'; } });
      if (barEl) barEl.style.transform = 'scaleY(' + P.toFixed(4) + ')';
      if (cueEl) cueEl.style.opacity = (1 - sstep(0.0, 0.2, q)).toFixed(3);
      if (IN && IN.box) { const gl = (i === 0 ? 1 - revealOf(r) : 0).toFixed(2); if (gl !== glowV) { glowV = gl; stick.style.setProperty('--landing-glow', gl); } }   // the warm pool behind the landing card fades as the ray appears
      if (ctaEl) ctaEl.classList.toggle('on', q > 0.55);
      const idx = clamp(Math.floor(q + 0.14), 0, K - 1);
      if (idx !== lastIdx) { lastIdx = idx; if (cNum) cNum.textContent = String(idx + 1).padStart(2, '0'); if (cName && NAMES[idx]) cName.textContent = NAMES[idx]; }
      if (flareEl) flareEl.style.opacity = '0';                // the bloom on the canvas replaces the old flare line
    }

    /* ---------- touch screens: one swipe, one chapter ----------
       Invisible snap points sit where each chapter's caption is fully shown (and at the very start and end of the film).
       Native scroll snapping does the rest, so a swipe glides from one chapter to the next and cannot skip one.
       Snapping is only switched on inside the film, so the rest of the page scrolls freely. */
    const html = document.documentElement;
    const snapBox = document.createElement('div');
    snapBox.className = 'snaps'; snapBox.setAttribute('aria-hidden', 'true');
    let stopQ = [];                                           // where the stops are, as a position in the film (0 to K) or 'end'
    let stopY = [], snapOn = false, snapLock = false, snapTimer = 0;
    function pOf(q) {                                         // chapter position -> scroll progress, the inverse of locate()
      const i = Math.min(Math.floor(q), K - 1), r = q - i;
      return PRE + ((cum[i] + r * wts[i]) / wsum) * (1 - PRE - POST);
    }
    function placeStops() {
      const span = filmEl.offsetHeight - (stick.clientHeight || window.innerHeight);
      const top = filmEl.getBoundingClientRect().top + window.scrollY;
      stopY = stopQ.map((q, n) => { const y = Math.round(q === 'end' ? span : q === 0 ? 0 : pOf(q) * span); snapBox.children[n].style.top = y + 'px'; return top + y; });
    }
    function setSnap(on) { if (on !== snapOn) { snapOn = on; html.setAttribute('data-snap', on ? 'on' : 'off'); } }
    function snapCheck() { setSnap(!snapLock && window.scrollY < stopY[stopY.length - 1] - 3); }
    function snapIdle() { clearTimeout(snapTimer); snapTimer = setTimeout(() => { snapLock = false; snapCheck(); }, snapLock ? 450 : 140); }   // a jump to a link keeps snapping off until it has arrived
    let stopF = [], pinAt = -2;                               // the frame each stop rests on, and which stop the playhead is nearest to
    function updatePins() {
      let n = 0, bd = 1e9;
      stopY.forEach((y, i) => { const d = Math.abs(y - window.scrollY); if (d < bd) { bd = d; n = i; } });
      if (n === pinAt) return;
      pinAt = n; pins = [];
      [n + 1, n - 1].forEach((i) => { if (i >= 0 && i < stopF.length) for (let d = -2; d <= 2; d++) { const g = stopF[i] + d; if (g >= 0 && g < N) pins.push(g); } });
    }
    if (coarse && K > 1) {
      stopQ = [0, IN ? 0.3 : 0.55]; for (let k = 1; k < K; k++) stopQ.push(k + 0.55); stopQ.push('end');   // landing, the sun with its ray (the reveal is done), then the middle of each chapter
      stopF = stopQ.map((q) => { if (q === 'end') return N - 1; const ci = Math.floor(q), r = q - ci; return first[ci] + Math.round(playT(ci, r) * (clips[ci].n - 1)); });
      stopQ.forEach(() => snapBox.appendChild(document.createElement('i')));
      filmEl.appendChild(snapBox);
      placeStops();
      window.addEventListener('resize', () => { placeStops(); snapCheck(); });
      window.addEventListener('load', () => { placeStops(); snapCheck(); });
      window.addEventListener('scroll', snapIdle, { passive: true });
      let tY = 0, tDir = 0;
      window.addEventListener('touchstart', (e) => { tY = e.touches[0].clientY; tDir = 0; snapLock = false; snapCheck(); }, { passive: true });   // touching the screen ends a jump
      window.addEventListener('touchmove', (e) => {           // at the end of the film a swipe up goes back to the last chapter, a swipe down carries on with the page
        if (tDir) return;
        const dy = e.touches[0].clientY - tY;
        if (Math.abs(dy) < 8) return;
        tDir = dy > 0 ? -1 : 1;
        if (tDir < 0 && !snapLock && window.scrollY <= stopY[stopY.length - 1] + 4) setSnap(true);
      }, { passive: true });
      document.addEventListener('click', (e) => {              // a link that jumps somewhere else on the page must not be pulled back to a chapter
        const a = e.target.closest && e.target.closest('a[href^="#"]');
        if (a && a.getAttribute('href').length > 1) { snapLock = true; setSnap(false); snapIdle(); }
      });
      snapCheck();
    }

    /* ---------- loop ---------- */
    let forced = null;
    window.HNreel = { set: (p) => { forced = p; }, info: () => ({ chapters: K, frames: N, previews: pDone, decoded: fBmp.reduce((a, b) => a + (b ? 1 : 0), 0), fetched: fFet.reduce((a, s) => a + (s === 2 ? 1 : 0), 0), small, film: base, snap: snapOn, stops: stopY.slice(), pins: pins.slice(), dpr, headSharp: !!fBmp[head], head, stopF: stopF.slice(), decodedIdx: fBmp.map((b, i) => b ? i : -1).filter((i) => i >= 0) }) };
    function readProgress() {
      const r = filmEl.getBoundingClientRect();
      const span = r.height - (stick.clientHeight || window.innerHeight);
      return span > 0 ? clamp(-r.top / span, 0, 1) : 0;
    }
    let speed = 0;                                            // progress per second, smoothed
    let ps = 0, first0 = true, last = performance.now(), lastMove = 0, lastTarget = -1, lastSettle = -1, lastP = -1, ema = 16, moving = 0;
    function frame(now) {
      requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.1); last = now;
      const target = forced != null ? forced : readProgress();
      const prev = ps;
      ps = first0 || reduce ? target : lerp(ps, target, 1 - Math.exp(-dt * 9));
      if (Math.abs(ps - target) < 0.00004) ps = target;
      first0 = false;
      speed = lerp(speed, dt > 0 ? Math.abs(ps - prev) / dt : 0, 0.3);
      fastMove = small && speed > 0.1;
      if (SNAPPY && !fastMove) updatePins();
      if (Math.abs(ps - prev) > 1e-6) dirSign = ps > prev ? 1 : -1;
      if (Math.abs(target - lastTarget) > 0.00002 || Math.abs(ps - target) > 0.0004) { lastMove = now; lastTarget = target; }
      const settle = reduce ? 1 : smooth(clamp((now - lastMove) / 1000 - 0.12, 0, 0.3) / 0.3);
      const L = locate(ps);
      ui(L.i, L.r, ps);
      if (capChanged && phoneUI) dirty = true;
      const r = filmEl.getBoundingClientRect();
      const onScreen = !(r.bottom < -50 || r.top > innerHeight + 50);
      if (onScreen) {
        pump();
        const waiting = IN && !introBmp && !introFail && now - t0 < 3000;   // the landing sun is a few hundred KB; do not flash the old first frame
        if (!waiting && (dirty || ps !== lastP || Math.abs(settle - lastSettle) > 0.002)) { draw(L.i, L.r, settle); dirty = false; lastP = ps; lastSettle = settle; }
      }
      if (onScreen && Math.abs(ps - prev) > 1e-6) {          // on a slow device, trade resolution for smoothness while scrolling
        ema = lerp(ema, dt * 1000, 0.08);
        if (++moving % 90 === 0 && ema > 38 && dprCap > 1 && (window.devicePixelRatio || 1) > 1) { dprCap = Math.max(1, Math.ceil(dprCap) - 1); resize(); }   // slow device: step down in whole numbers, never to a fractional stretch
      }
    }

    if (IN) {
      blobOf(base + IN.img).then((b) => decodeBlob(b)).then((bm) => { introBmp = bm; dirty = true; }, () => { introFail = true; });
    }
    resize();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measureCaps(); dirty = true; });   // the caption sizes change once the web fonts arrive
    document.documentElement.classList.add('has-film', 'has-reel');
    requestAnimationFrame(frame);
    setTimeout(() => { if (!firstOk) fail(); }, 12000);
  }
})();
