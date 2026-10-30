/* EN3RGY - reel.js
   The film is real footage, cut into chapters (one per scene) and packed by tools/pack_clips.py into one file per frame.
   Scroll position picks the frame. Three things keep it smooth:
   - tiny preview frames load first, so scrubbing works at once and never waits on a big image,
   - full frames are decoded off the main thread, in a window around the playhead, and drawing never blocks on a decode,
   - the scroll value is eased, so a mouse wheel and a trackpad both feel the same.
   Each chapter holds its first frame while the caption is read and drifts in slowly so the picture never looks frozen.
   A hard cut between scenes becomes a push through light: the old scene pushes in and blooms, the new one settles out of it. */
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
    const ext = M.ext || 'webp';
    const hasP = !!(M.p && clips[0].pdir), pstep = M.pstep || 1;
    const DRIFT = reduce ? 0 : (M.drift != null ? M.drift : 0.05);
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
    const fUrl = (g) => { const c = clips[gClip[g]]; return base + (small ? (c.mdir || c.dir) : c.dir) + pad(gLocal[g] + 1) + '.' + ext; };
    const pUrl = (g) => base + clips[gClip[g]].pdir + pad(gLocal[g] + 1) + '.' + ext;
    const hasPrev = (g) => hasP && (gLocal[g] % pstep === 0 || gLocal[g] === clips[gClip[g]].n - 1);   // the preview set may keep only every Nth frame

    /* ---------- frames: fetched as blobs, decoded to bitmaps only inside a window around the playhead ---------- */
    const fBlob = new Array(N).fill(null), pBlob = new Array(N).fill(null);
    const fBmp = new Array(N).fill(null), pBmp = new Array(N).fill(null);
    const fFet = new Uint8Array(N), pFet = new Uint8Array(N), fDec = new Uint8Array(N), pDec = new Uint8Array(N);   // 0 idle, 1 busy, 2 done, 3 failed
    const canBmp = typeof createImageBitmap === 'function';
    const W_FULL = small ? { ahead: 22, behind: 8 } : { ahead: 28, behind: 10 };   // how many full frames stay decoded
    const W_PREV = { ahead: 100, behind: 60 };
    let head = 0, dirSign = 1, dirty = true, firstOk = false, pDone = 0, fPend = 0, pPend = 0, fDecPend = 0, pDecPend = 0, nextP = 0, gen = 0;
    const pOrder = [];
    clips.forEach((c, ci) => { pOrder.push(first[ci]); pOrder.push(first[ci] + c.n - 1); });
    for (let g = 0; g < N; g++) if (hasPrev(g)) pOrder.push(g);
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
    function pump() {
      // 1. previews: everything, key frames first
      while (hasP && pPend < 8 && nextP < pOrder.length) {
        const g = pOrder[nextP++];
        if (pFet[g]) continue;
        pFet[g] = 1; pPend++;
        blobOf(pUrl(g)).then((b) => { pBlob[g] = b; pFet[g] = 2; }, () => { pFet[g] = 3; if (g === 0) fail(); })
          .then(() => { pPend--; pDone++; progress(); dirty = true; });
      }
      // 2. full frames: nearest to the playhead first, looking ahead in the scroll direction
      const gate = !hasP || pDone >= pTotal * 0.9;
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
        const g = best; fFet[g] = 1; fPend++;
        blobOf(fUrl(g)).then((b) => { fBlob[g] = b; fFet[g] = 2; }, () => { fFet[g] = 3; if (g === 0 && !hasP) fail(); })
          .then(() => { fPend--; dirty = true; });
      }
      // 3. decode windows
      const wf = dirSign >= 0 ? W_FULL : { ahead: W_FULL.behind, behind: W_FULL.ahead };
      const lo = head - wf.behind, hi = head + wf.ahead;
      const reach = Math.max(wf.ahead, wf.behind);
      for (let d = 0; d <= reach && fDecPend < 3; d++) {
        for (let s = 0; s < (d ? 2 : 1) && fDecPend < 3; s++) {
          const g = s ? head - d : head + d;
          if (g < lo || g > hi || g < 0 || g >= N || fDec[g] || !fBlob[g]) continue;
          fDec[g] = 1; fDecPend++;
          decodeBlob(fBlob[g], bmpSize).then((b) => { if (fDec[g] === 1) { fBmp[g] = b; fDec[g] = 2; dirty = true; } else closeBmp(b); }, () => { fDec[g] = 3; })
            .then(() => { fDecPend--; });
        }
      }
      for (let g = 0; g < N; g++) if (fBmp[g] && (g < lo - 6 || g > hi + 6)) { closeBmp(fBmp[g]); fBmp[g] = null; fDec[g] = 0; }
      if (hasP) {
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
      if (!firstOk && fBmp[0]) firstOk = true;
    }

    /* ---------- sizing ---------- */
    let W = 0, H = 0, dpr = 1, portrait = false, dprCap = 2;
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
    function blit(im, alpha, px, zoom) {
      const iw = dimW(im), ih = dimH(im);
      const s = Math.max(cv.width / iw, cv.height / ih) * zoom;
      const w = iw * s, h = ih * s;
      let x = w >= cv.width ? clamp(cv.width / 2 - px * w, cv.width - w, 0) : (cv.width - w) / 2;   // portrait: slide the crop along the picture
      const y = (cv.height - h) / 2;
      ctx.globalAlpha = alpha;
      ctx.drawImage(im, x, y, w, h);
      return { x, y, w, h };
    }
    function playT(ci, r) {                                   // chapter progress -> footage progress, with the holds
      const hold = clips[ci].hold || [0.2, 0.08];
      const t = clamp((r - hold[0]) / (1 - hold[0] - hold[1]), 0, 1);
      return lerp(t, smooth(t), EASE);
    }
    function chapterZoom(ci, t, r) {                          // a chapter can start zoomed out, and every chapter drifts in a little
      const c = clips[ci];
      let z = 1;
      if (c.zoom) z = lerp(c.zoom[0], c.zoom[1], smooth(clamp(t / (c.zoomT || 0.3), 0, 1)));
      return z * (1 + DRIFT * r);
    }
    function layer(ci, t, alpha, settle, zoom) {
      const c = clips[ci], n = c.n, f = t * (n - 1), a = Math.floor(f), b = Math.min(n - 1, a + 1);
      let k = f - a;
      if (settle > 0) k = lerp(k, k < 0.5 ? 0 : 1, settle);   // when scrolling pauses, rest on a sharp frame
      const kx = c.kx || [0.5, 0.5], p0 = lerp(kx[0], kx[1], t), px = portrait ? p0 : 0.5 + (p0 - 0.5) * 0.5;
      const fa = pick(ci, a), fb = pick(ci, b);
      if (!fa) return null;
      const rc = blit(fa, alpha, px, zoom);
      if (fb && fb !== fa && k > 0.004) blit(fb, alpha * k, px, zoom);
      return rc;
    }
    function streak(ci, t, alpha, settle, zoom, amount) {      // a little zoom blur while the picture pushes through a cut
      if (amount < 0.01 || reduce) return layer(ci, t, alpha, settle, zoom);
      let rc = null;
      for (let j = 0; j < 3; j++) {
        const r2 = layer(ci, t, j === 0 ? alpha : alpha / (j + 1), settle, zoom * (1 + amount * j * 0.5));
        if (!rc) rc = r2;
      }
      return rc;
    }
    function feather(rc) {                                    // a zoomed-out picture melts into the page instead of ending in a hard edge
      const f = Math.round(0.16 * Math.min(rc.w, rc.h)), x1 = rc.x + rc.w, y1 = rc.y + rc.h;
      ctx.globalAlpha = 1;
      const edge = (x0, y0, x2, y2, rx, ry, rw, rh) => {
        const g = ctx.createLinearGradient(x0, y0, x2, y2);
        g.addColorStop(0, BG); g.addColorStop(1, 'rgba(3,4,10,0)');
        ctx.fillStyle = g; ctx.fillRect(rx, ry, rw, rh);
      };
      if (rc.x > 1) { edge(rc.x, 0, rc.x + f, 0, rc.x, rc.y, f, rc.h); edge(x1, 0, x1 - f, 0, x1 - f, rc.y, f + 1, rc.h); }
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
        const u = (q - b) / seam, push = reduce ? 0 : (clips[b].push != null ? clips[b].push : 0.12);
        const t = smooth(clamp((u + 0.25) / 0.5, 0, 1));      // the new scene takes over quickly, in the middle of the bloom
        const pk = 1 - Math.abs(u);                           // 1 right at the cut
        const glow = Math.exp(-Math.pow(u / 0.5, 2));         // the bloom peaks exactly at the swap
        const outT = playT(b - 1, clamp(q - (b - 1), 0, 1)), inT = playT(b, clamp(q - b, 0, 1));
        const outZ = chapterZoom(b - 1, outT, clamp(q - (b - 1), 0, 1)) * (1 + push * smooth(clamp(1 + u, 0, 1)));
        const inZ = chapterZoom(b, inT, clamp(q - b, 0, 1)) * (1 + push * (1 - smooth(clamp(u, 0, 1))));
        streak(b - 1, outT, 1, settle, outZ, 0.05 * pk);
        streak(b, inT, t, settle, inZ, 0.05 * pk);
        flash = (clips[b].flash || 0) * glow;
        head = first[t < 0.5 ? b - 1 : b] + (t < 0.5 ? clips[b - 1].n - 1 : 0);
      } else {
        const t = playT(i, r);
        rc = layer(i, t, 1, settle, chapterZoom(i, t, r));
      }
      if (rc && (rc.x > 1 || rc.y > 1)) feather(rc);
      if (flash > 0.004) {
        bloom(Math.min(0.9, flash * 1.5 * (reduce ? 0.3 : 1)));
        ctx.globalAlpha = Math.min(0.3, flash * 0.6 * (reduce ? 0.3 : 1));
        ctx.fillStyle = '#ffd9a0'; ctx.fillRect(0, 0, cv.width, cv.height);
      }
      ctx.globalAlpha = 1;
    }

    /* ---------- captions, counter, progress, call to action ---------- */
    const capEls = $$('.cap'), flareEl = $('#flare');
    const barEl = $('#filmBar'), cueEl = $('#cue'), ctaEl = $('#filmCta'), cNum = $('#cNum'), cName = $('#cName'), cTot = $('.counter span');
    const NAMES = capEls.map((el) => { const k = $('.k', el); return k ? k.textContent : ''; });
    if (cTot) cTot.textContent = '/ ' + String(K).padStart(2, '0');
    let lastIdx = -1;
    function ui(i, r, P) {
      const q = i + r;
      capEls.forEach((el) => {
        const k = +el.dataset.i;
        const inK = k === 0 ? 1 : sstep(k + 0.1, k + 0.24, q), outK = k >= K - 1 ? 1 : 1 - sstep(k + 0.78, k + 0.9, q);
        const v = inK * outK;
        el.style.opacity = v.toFixed(3);
        el.style.transform = 'translate3d(0,' + ((1 - inK) * 24 - (1 - outK) * 16).toFixed(1) + 'px,0)';
        el.style.visibility = v > 0.01 ? 'visible' : 'hidden';
        el.toggleAttribute('inert', v < 0.5);
      });
      if (barEl) barEl.style.transform = 'scaleY(' + P.toFixed(4) + ')';
      if (cueEl) cueEl.style.opacity = (1 - sstep(0.0, 0.2, q)).toFixed(3);
      if (ctaEl) ctaEl.classList.toggle('on', q > 0.55);
      const idx = clamp(Math.floor(q + 0.14), 0, K - 1);
      if (idx !== lastIdx) { lastIdx = idx; if (cNum) cNum.textContent = String(idx + 1).padStart(2, '0'); if (cName && NAMES[idx]) cName.textContent = NAMES[idx]; }
      if (flareEl) flareEl.style.opacity = '0';                // the bloom on the canvas replaces the old flare line
    }

    /* ---------- loop ---------- */
    let forced = null;
    window.HNreel = { set: (p) => { forced = p; }, info: () => ({ chapters: K, frames: N, previews: pDone, decoded: fBmp.reduce((a, b) => a + (b ? 1 : 0), 0), fetched: fFet.reduce((a, s) => a + (s === 2 ? 1 : 0), 0), small }) };
    function readProgress() {
      const r = filmEl.getBoundingClientRect();
      const span = r.height - (stick.clientHeight || window.innerHeight);
      return span > 0 ? clamp(-r.top / span, 0, 1) : 0;
    }
    let ps = 0, first0 = true, last = performance.now(), lastMove = 0, lastTarget = -1, lastSettle = -1, lastP = -1, ema = 16, moving = 0;
    function frame(now) {
      requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.1); last = now;
      const target = forced != null ? forced : readProgress();
      const prev = ps;
      ps = first0 || reduce ? target : lerp(ps, target, 1 - Math.exp(-dt * 9));
      if (Math.abs(ps - target) < 0.00004) ps = target;
      first0 = false;
      if (Math.abs(ps - prev) > 1e-6) dirSign = ps > prev ? 1 : -1;
      if (Math.abs(target - lastTarget) > 0.00002 || Math.abs(ps - target) > 0.0004) { lastMove = now; lastTarget = target; }
      const settle = reduce ? 1 : smooth(clamp((now - lastMove) / 1000 - 0.12, 0, 0.3) / 0.3);
      const L = locate(ps);
      const r = filmEl.getBoundingClientRect();
      const onScreen = !(r.bottom < -50 || r.top > innerHeight + 50);
      if (onScreen) {
        pump();
        if (dirty || ps !== lastP || Math.abs(settle - lastSettle) > 0.002) { draw(L.i, L.r, settle); dirty = false; lastP = ps; lastSettle = settle; }
      }
      ui(L.i, L.r, ps);
      if (onScreen && Math.abs(ps - prev) > 1e-6) {          // on a slow device, trade resolution for smoothness while scrolling
        ema = lerp(ema, dt * 1000, 0.08);
        if (++moving % 90 === 0 && ema > 32 && dprCap > 1 && (window.devicePixelRatio || 1) > 1) { dprCap = Math.max(1, dprCap - 0.25); resize(); }
      }
    }

    resize();
    document.documentElement.classList.add('has-film', 'has-reel');
    requestAnimationFrame(frame);
    setTimeout(() => { if (!firstOk) fail(); }, 12000);
  }
})();
