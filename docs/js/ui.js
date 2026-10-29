/* EN3RGY - ui.js
   Header, bill estimate and the lead form. The film itself lives in reel.js. */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const inr = (n) => (n < 0 ? '−' : '') + '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');
  const inrShort = (n) => {
    const a = Math.abs(n);
    if (a >= 1e7) return '₹' + +(a / 1e7).toFixed(2) + ' Cr';
    if (a >= 1e5) return '₹' + +(a / 1e5).toFixed(1) + ' L';
    return inr(n);
  };

  /* ---------- header turns solid once the film is over ---------- */
  const top = $('#top'), film = $('#film');
  function onScroll() {
    const end = film ? film.offsetTop + film.offsetHeight - innerHeight * 1.2 : 80;
    top.classList.toggle('solid', scrollY > end);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- estimate ---------- */
  const range = $('#billRange');
  if (range) {
    const CFG = {
      home: { min: 500, max: 15000, step: 100, val: 3000, tariff: 8, note: 'Subsidy under PM Surya Ghar: ₹30,000 per kW up to 2 kW and ₹18,000 for the third kW, capped at ₹78,000. Assumes ₹8 a unit and 4 units per kW per day. Your survey gives exact numbers.' },
      biz: { min: 10000, max: 200000, step: 1000, val: 50000, tariff: 11, note: 'Businesses and factories do not get the residential subsidy. Assumes ₹11 a unit and 4 units per kW per day. Ask us about tax benefits for your category.' },
    };
    let kind = 'home';
    const el = (id) => document.getElementById(id);
    const nums = {};
    function setNum(id, value, fmt) {
      const node = el(id), from = nums[id] != null ? nums[id] : value;
      nums[id] = value;
      cancelAnimationFrame(node._raf);
      if (reduce || from === value) { node.textContent = fmt(value); return; }
      const t0 = performance.now();
      const step = (now) => {
        const p = clamp((now - t0) / 450, 0, 1), e = 1 - Math.pow(1 - p, 3);
        node.textContent = fmt(lerp(from, value, e));
        if (p < 1) node._raf = requestAnimationFrame(step);
      };
      node._raf = requestAnimationFrame(step);
    }
    function model(bill) {
      const tariff = CFG[kind].tariff, units = bill / tariff;
      const kw = kind === 'home' ? clamp(Math.round((units / 120) * 2) / 2, 1, 10) : Math.max(3, Math.round(units / 120));
      let perKw;
      if (kind === 'home') perKw = kw <= 2 ? 65000 : kw <= 3 ? 61667 : kw <= 5 ? 59000 : 55000;
      else perKw = kw <= 10 ? 55000 : kw <= 30 ? 46000 : kw <= 100 ? 42000 : 40000;
      const cost = Math.round((kw * perKw) / 1000) * 1000;
      const subsidy = kind === 'home' ? 30000 * Math.min(kw, 2) + 18000 * clamp(kw - 2, 0, 1) : 0;
      const net = cost - subsidy;
      const saved = Math.min(kw * 1450, units * 12 * 0.98);
      const floor = kind === 'home' ? 250 : Math.max(1200, bill * 0.05);
      const newBill = Math.max(bill - (saved * tariff) / 12, floor);
      const monthly = bill - newBill;
      let cum = -net, payback = 25;
      for (let y = 1; y <= 25; y++) {
        const s = monthly * 12 * Math.pow(1.03, y - 1) * Math.pow(0.993, y - 1);
        const next = cum + s - (y === 12 ? cost * 0.09 : 0);
        if (next >= 0) { payback = y - 1 + -cum / (next - cum); break; }
        cum = next;
      }
      return { kw, net, monthly, payback };
    }
    function render() {
      const bill = +range.value, m = model(bill);
      el('eBill').textContent = inr(bill);
      setNum('eKw', m.kw, (v) => (Math.round(v * 2) / 2).toFixed(1));
      setNum('eNet', m.net, (v) => (v >= 1e7 ? inrShort(v) : inr(v)));
      setNum('eSave', m.monthly, inr);
      setNum('ePay', m.payback, (v) => v.toFixed(1) + ' years');
      range.style.setProperty('--fill', ((bill - range.min) / (range.max - range.min)) * 100 + '%');
      window.HNcalc = { bill, kw: m.kw };
    }
    function setKind(k) {
      kind = k;
      const c = CFG[k];
      range.min = c.min; range.max = c.max; range.step = c.step; range.value = c.val;
      $$('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === k)));
      el('eNote').textContent = c.note;
      Object.keys(nums).forEach((id) => delete nums[id]);
      const t = el('billTicks');
      t.innerHTML = '';
      [0, 1 / 3, 2 / 3, 1].forEach((f) => { const s = document.createElement('span'); s.textContent = inrShort(Math.round((c.min + (c.max - c.min) * f) / 500) * 500); t.appendChild(s); });
      render();
    }
    $$('.seg button').forEach((b) => b.addEventListener('click', () => setKind(b.dataset.kind)));
    range.addEventListener('input', render);
    setKind('home');
  }

  /* ---------- lead form -> email (or WhatsApp, once a number is set) ---------- */
  const form = $('#leadForm');
  if (form) {
    const f = { name: $('#fName'), phone: $('#fPhone'), bill: $('#fBill') };
    const link = $('#waLink'), note = $('#formNote');
    const EMAIL = 'en3rgylive@gmail.com';
    const WHATSAPP = '';                       // country code and number, digits only, e.g. '919812345678'. Leave empty to send enquiries by email.
    const digits = () => f.phone.value.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
    const nameOk = () => f.name.value.trim().length >= 2;
    const phoneOk = () => /^[6-9]\d{9}$/.test(digits());
    function sync() {
      const ok = nameOk() && phoneOk(), bill = f.bill.value.replace(/\D/g, '');
      const msg = 'Hi EN3RGY, I am ' + f.name.value.trim() + ' (' + digits() + ').' +
        (bill ? ' My monthly bill is about ₹' + Number(bill).toLocaleString('en-IN') + '.' : '') + ' Please book a free roof check.';
      const via = WHATSAPP ? 'WhatsApp' : 'an email to us';
      link.href = WHATSAPP ? 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(msg)
        : 'mailto:' + EMAIL + '?subject=' + encodeURIComponent('Free roof check') + '&body=' + encodeURIComponent(msg);
      if (WHATSAPP) { link.target = '_blank'; link.rel = 'noopener'; }
      link.setAttribute('aria-disabled', String(!ok));
      note.textContent = ok ? 'Ready. This opens ' + via + ' with your details filled in.' : 'Add your name and a 10-digit mobile number. This opens ' + via + ' with your details filled in.';
    }
    form.addEventListener('input', sync);
    form.addEventListener('submit', (e) => { e.preventDefault(); sync(); if (nameOk() && phoneOk()) link.click(); });
    f.name.addEventListener('blur', () => f.name.classList.toggle('bad', f.name.value !== '' && !nameOk()));
    f.phone.addEventListener('blur', () => f.phone.classList.toggle('bad', f.phone.value !== '' && !phoneOk()));
    // carry the estimate's bill into the form the first time the visitor heads there
    $$('a[href="#contact"]').forEach((a) => a.addEventListener('click', () => { if (window.HNcalc && !f.bill.value) { f.bill.value = window.HNcalc.bill; sync(); } }));
    sync();
  }
})();
