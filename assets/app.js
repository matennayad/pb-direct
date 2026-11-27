(() => {
  'use strict';
  const S = window.SITE || {};
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
    }
    el.append(...kids.flat().filter(x => x != null && x !== false && x !== ''));
    return el;
  };

  // The 28 supplier categories grouped by room; the tile photo for each room.
  const ROOMS = [
    ['סלון', 'p0011', ['ספות בד', 'ספות עור', 'ספות מתכווננות', 'כורסאות', 'כורסאות עץ מלא', 'כורסאות מתכווננות', 'שולחנות סלון', 'מזנוני טלוויזיה', 'שולחנות צד', 'שולחנות תה']],
    ['חדר שינה', 'p0231', ['מיטות עור', 'מיטות בד', 'מזרנים', 'שידות לילה', 'שולחנות איפור', 'ארונות בגדים']],
    ['פינת אוכל', 'p0629', ['שולחנות אוכל מלבניים', 'שולחנות אוכל עגולים', 'שולחנות אי', 'כיסאות אוכל']],
    ['חדר ילדים', 'p0393', ['מיטות ילדים מרופדות', 'מיטות ילדים מעץ מלא', 'מיטות קומתיים', 'ריהוט ילדים נוסף', 'שולחן וכיסאות לילדים']],
    ['אחסון ועבודה', 'p1436', ['מזנונים ושידות', 'שולחנות כתיבה', 'ריהוט כניסה']],
  ];
  const ALL_LABEL = { 'סלון': 'כל מוצרי הסלון', 'חדר שינה': 'כל מוצרי חדר השינה', 'פינת אוכל': 'כל מוצרי פינת האוכל', 'חדר ילדים': 'כל מוצרי חדר הילדים', 'אחסון ועבודה': 'כל מוצרי האחסון והעבודה' };
  const roomOf = c => (ROOMS.find(r => r[2].includes(c)) || [])[0];
  const PER_PAGE = 60;
  const sku = p => p.id.slice(1);
  const segs = p => p.desc.split(' · ').filter(Boolean);
  const fmt = n => n.toLocaleString('he-IL');
  const waLink = text => `https://wa.me/${S.whatsapp}?text=${encodeURIComponent(text)}`;
  const waProduct = (p, size) => waLink(((size && S.whatsappTextSize) || S.whatsappText || '').replace('{model}', p.model).replace('{sku}', sku(p)).replace('{size}', size || ''));
  // prices exist only for models the admin page priced: { currency: 'ILS' | 'USD', values: [per size, or null] }
  const hasPrice = p => !!(p.price && (p.price.values || []).some(v => v > 0));
  const money = (v, cur) => cur === 'USD' ? `$${Number(v).toLocaleString('en-US')}` : `₪${Number(v).toLocaleString('he-IL')}`;
  const chevron = () => h('span', { html: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' }).firstChild;
  // Dimension runs (215×106×80) and time ranges are LTR islands inside RTL text; isolate them or they render reversed.
  const DIM = /[φ\d][\d.\/–φ-]*(?:\s*×\s*\(?[φ\d][\d.\/–φ-]*\)?)+|\d[\d:]*\s*[–-]\s*\d[\d:]*/g;
  const rich = text => {
    const out = []; let last = 0;
    for (const m of text.matchAll(DIM)) { out.push(text.slice(last, m.index), h('bdi', { dir: 'ltr', text: m[0] })); last = m.index + m[0].length; }
    out.push(text.slice(last)); return out.filter(Boolean);
  };

  let ALL = [], counts = {}, list = [], state = {}, current = -1;

  /* ---------- hash state: #room=…&cat=…&q=…&page=…&p=… ---------- */
  const readHash = () => Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
  const href = (o) => { const u = new URLSearchParams(); for (const k of ['room', 'cat', 'q', 'page', 'p']) if (o[k]) u.set(k, o[k]); const s = u.toString(); return s ? `#${s}` : '#catalog'; };
  const go = (o, replace) => { const url = href(o); replace ? history.replaceState(null, '', url) : history.pushState(null, '', url); route(); };

  /* ---------- config ---------- */
  function applyConfig() {
    $$('[data-tagline]').forEach(el => el.textContent = S.tagline || '');
    $$('[data-audience]').forEach(el => el.textContent = S.audience || '');
    const brand = $('[data-brand]');
    brand.append(S.logo ? h('img', { src: S.logo, alt: S.name, width: 112, height: 56 }) : h('span', { text: S.name }));
    $$('[data-logo-light]').forEach(img => { if (S.logoLight) img.src = S.logoLight; });
    $$('[data-wa-general]').forEach(a => a.href = waLink(S.whatsappGeneral));
    $('#year').textContent = new Date().getFullYear();
    const ICONS = [ // savings, custom, delivery time, delivery+assembly, warranty
      '<path d="M4 7h16v10H4z M8 12h8 M12 9v6" />',
      '<path d="M5 19 15 9l3 3L8 22H5zM14 6l3-3 4 4-3 3" />',
      '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2" />',
      '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-.01M17 19a2 2 0 1 0 0-.01" />',
      '<path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z M9 12l2 2 4-4" />',
    ];
    $('#promises').append(...(S.promises || []).map(([t, d], i) => h('li', {},
      h('span', { html: `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[i % ICONS.length]}</svg>` }).firstChild,
      h('div', {}, h('b', { text: t }), h('span', { text: d })))));
    const dl = $('#contact-list');
    const row = (k, v) => v && dl.append(h('dt', { text: k }), h('dd', {}, v));
    row('וואטסאפ', h('a', { href: waLink(S.whatsappGeneral), target: '_blank', rel: 'noopener', text: 'שליחת הודעה' }));
    row('טלפון', S.phone && h('a', { href: `tel:${S.phone.replace(/[^\d+]/g, '')}`, dir: 'ltr', text: S.phone }));
    row('מייל', S.email && h('a', { href: `mailto:${S.email}`, dir: 'ltr', text: S.email }));
    row('כתובת', S.address);
    row('שעות', S.hours && h('span', {}, rich(S.hours)));
  }

  /* ---------- navigation: top menu, drawer, tiles, footer map ---------- */
  function buildNav() {
    const nav = $('#nav');
    ROOMS.forEach(([room, , cats], i) => {
      const id = `panel-${i}`;
      const btn = h('button', { type: 'button', class: 'nav__btn', 'aria-expanded': 'false', 'aria-controls': id, 'data-room': room }, room, chevron());
      const panel = h('div', { class: 'nav__panel', id },
        cats.map(c => h('a', { href: href({ cat: c }), 'data-cat': c }, h('span', { text: c }), h('span', { class: 'n', text: fmt(counts[c] || 0) }))),
        h('a', { href: href({ room }), class: 'all' }, h('span', { text: ALL_LABEL[room] }), h('span', { class: 'n', text: fmt(cats.reduce((s, c) => s + (counts[c] || 0), 0)) })));
      const li = h('li', { class: 'nav__item' }, btn, panel);
      let t;
      const open = v => { $$('.nav__item.open').forEach(o => o !== li && setOpen(o, false)); setOpen(li, v); };
      li.addEventListener('mouseenter', () => { clearTimeout(t); open(true); });
      li.addEventListener('mouseleave', () => { t = setTimeout(() => setOpen(li, false), 160); });
      btn.addEventListener('click', () => open(!li.classList.contains('open')));
      li.addEventListener('focusout', e => { if (!li.contains(e.relatedTarget)) setOpen(li, false); });
      li.addEventListener('keydown', e => {
        if (e.key === 'Escape') { setOpen(li, false); btn.focus(); }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault(); open(true);
          const links = $$('a', panel), k = links.indexOf(document.activeElement);
          const d = e.key === 'ArrowDown' ? 1 : -1;
          links[k < 0 ? (d > 0 ? 0 : links.length - 1) : (k + d + links.length) % links.length].focus();
        }
      });
      panel.addEventListener('click', e => { if (e.target.closest('a')) setOpen(li, false); });
      nav.append(li);
    });
    function setOpen(li, v) { li.classList.toggle('open', v); $('.nav__btn', li).setAttribute('aria-expanded', v); }
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      $$('.nav__item.open').forEach(li => { const had = li.contains(document.activeElement); setOpen(li, false); if (had) $('.nav__btn', li).focus(); });
    });
    // the menu opens with Enter/Space on its button, or with the arrow keys (handled on the item above)

    const dn = $('#drawer-nav');
    for (const [room, , cats] of ROOMS) {
      dn.append(h('details', {}, h('summary', {}, room, chevron()),
        h('ul', {}, h('li', {}, h('a', { href: href({ room }) }, h('span', { text: 'הכול' }))),
          cats.map(c => h('li', {}, h('a', { href: href({ cat: c }) }, h('span', { text: c }), h('span', { class: 'n', text: fmt(counts[c] || 0) })))))));
    }
    const mb = $('.menu-btn'), drawer = $('#drawer');
    const setDrawer = v => { drawer.style.top = $('#head').getBoundingClientRect().bottom + 'px'; drawer.hidden = !v; mb.setAttribute('aria-expanded', v); mb.setAttribute('aria-label', v ? 'סגירת התפריט' : 'פתיחת התפריט'); document.body.style.overflow = v ? 'hidden' : ''; };
    mb.addEventListener('click', () => setDrawer(drawer.hidden));
    drawer.addEventListener('click', e => { if (e.target.closest('a')) setDrawer(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !drawer.hidden) { setDrawer(false); mb.focus(); } });

    $('#rooms').append(...ROOMS.map(([room, img, cats]) => h('a', { class: 'tile', href: href({ room }) },
      h('img', { src: `img/l/${img}.webp`, alt: '', loading: 'lazy', width: 1200, height: 1200 }),
      h('span', { class: 'tile__label' }, h('b', { text: room }), h('span', { text: `${fmt(cats.reduce((s, c) => s + (counts[c] || 0), 0))} דגמים` })))));

    $('#foot-map').append(...ROOMS.map(([room, , cats]) => h('div', {}, h('h2', { class: 'foot__h' }, h('a', { href: href({ room }), text: room })),
      h('ul', {}, cats.map(c => h('li', {}, h('a', { href: href({ cat: c }), text: c })))))));
  }

  /* ---------- catalog ---------- */
  const norm = s => s.toLowerCase().replace(/[״"׳']/g, '').replace(/\s+/g, ' ').trim();
  function filtered() {
    const nq = norm(state.q || ''), digits = /^\d+$/.test(nq) ? nq.padStart(4, '0') : null;
    const roomCats = state.room && (ROOMS.find(r => r[0] === state.room) || [])[2];
    return ALL.filter(p => (!state.cat || p.cat === state.cat) && (!roomCats || roomCats.includes(p.cat))
      && (!nq || p._s.includes(nq) || (digits && sku(p) === digits)));
  }
  function renderCatalog() {
    list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    const page = Math.min(Math.max(1, +state.page || 1), pages);
    const room = state.room || roomOf(state.cat);

    $('#cat-title').textContent = state.cat || state.room || (state.q ? `תוצאות חיפוש: ${state.q}` : 'כל הקטלוג');
    $('#count').textContent = list.length === 1 ? 'דגם אחד' : list.length === ALL.length ? 'למעלה מ-1,700 דגמים' : `${fmt(list.length)} דגמים`;
    const crumbs = $('#crumbs'); crumbs.replaceChildren();
    const crumb = (t, o) => [crumbs.childNodes.length ? h('span', { 'aria-hidden': 'true', text: '‹' }) : null, o ? h('a', { href: href(o), text: t }) : h('span', { text: t })].filter(Boolean);
    crumbs.append(...crumb('הקטלוג', (state.cat || state.room || state.q) ? {} : null));
    if (room && (state.cat || state.room)) crumbs.append(...crumb(room, state.cat ? { room } : null));
    if (state.cat) crumbs.append(...crumb(state.cat));

    const sub = $('#subcats'); sub.replaceChildren(); sub.hidden = !room || !!state.q;
    if (room && !state.q) {
      const cats = ROOMS.find(r => r[0] === room)[2];
      sub.append(h('a', { href: href({ room }), 'aria-current': !state.cat ? 'true' : 'false', text: 'הכול' }),
        ...cats.map(c => h('a', { href: href({ cat: c }), 'aria-current': c === state.cat ? 'true' : 'false' }, c, h('span', { class: 'n', text: fmt(counts[c]) }))));
    }
    $$('.nav__btn').forEach(b => b.setAttribute('aria-current', b.dataset.room === room ? 'true' : 'false'));

    const start = (page - 1) * PER_PAGE;
    $('#grid').replaceChildren(...list.slice(start, start + PER_PAGE).map((p, k) => card(p, start + k)));
    $('#empty').hidden = list.length > 0;
    renderPager(page, pages);
  }
  function card(p, i) {
    const s = p.sizes, type = segs(p)[0] || p.cat;
    const size = s.length ? s[0] + (s.length > 1 ? ` ועוד ${s.length - 1} מידות` : '') : '';
    return h('li', {}, h('button', { type: 'button', class: 'card', onclick: () => go({ ...state, p: p.id }) },
      h('div', { class: 'card__img' }, h('img', { src: `img/t/${p.id}.webp`, alt: `${type} דגם ${p.model}`, loading: i % PER_PAGE < 8 ? 'eager' : 'lazy', decoding: 'async', width: 520, height: 520 })),
      h('span', { class: 'card__model', dir: 'ltr', text: p.model }),
      h('span', { class: 'card__type', text: type }),
      size && h('span', { class: 'card__size' }, rich(size))));
  }
  function renderPager(page, pages) {
    const nav = $('#pager'); nav.replaceChildren(); nav.hidden = pages < 2;
    if (pages < 2) return;
    const link = (n, label, cls) => h('a', { href: href({ ...state, p: '', page: n > 1 ? n : '' }), class: cls, 'aria-current': n === page && cls === 'num' ? 'page' : false, 'aria-label': cls === 'num' ? `עמוד ${n}` : false, text: label });
    const prev = link(page - 1, 'הקודם', 'step'), next = link(page + 1, 'הבא', 'step');
    if (page === 1) prev.setAttribute('aria-disabled', 'true');
    if (page === pages) next.setAttribute('aria-disabled', 'true');
    const goPage = n => go({ ...state, p: '', page: n > 1 ? String(n) : '' });
    // "…" opens a small list of links to the pages it hides (a link is chosen on purpose, nothing moves on its own)
    const gap = (from, to) => {
      const list = h('div', { class: 'more__list', hidden: true },
        Array.from({ length: to - from + 1 }, (_, k) => link(from + k, fmt(from + k), 'num')));
      const btn = h('button', { type: 'button', 'aria-expanded': 'false', 'aria-label': `עמודים ${fmt(from)} עד ${fmt(to)}`, text: '…',
        onclick: () => { const v = list.hidden; list.hidden = !v; btn.setAttribute('aria-expanded', v); if (v) list.querySelector('a').focus(); } });
      const box = h('div', { class: 'more' }, btn, list);
      box.addEventListener('keydown', e => { if (e.key === 'Escape' && !list.hidden) { e.stopPropagation(); list.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.focus(); } });
      box.addEventListener('focusout', e => { if (!box.contains(e.relatedTarget)) { list.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
      return box;
    };
    const nums = new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2].filter(n => n >= 1 && n <= pages));
    const items = []; let last = 0;
    for (const n of [...nums].sort((a, b) => a - b)) {
      if (n - last === 2) items.push(link(last + 1, fmt(last + 1), 'num'));
      else if (n - last > 2) items.push(gap(last + 1, n - 1));
      items.push(link(n, fmt(n), 'num')); last = n;
    }
    const sel = h('select', { 'aria-label': 'בחירת עמוד' },
      Array.from({ length: pages }, (_, k) => h('option', { value: k + 1, text: fmt(k + 1), selected: k + 1 === page })));
    const jump = h('div', { class: 'jump' }, h('span', { text: 'עמוד' }), sel, h('span', { text: `מתוך ${fmt(pages)}` }),
      h('button', { type: 'button', onclick: () => goPage(+sel.value) }, 'מעבר'));
    nav.append(prev, ...items, jump, next);
  }

  /* ---------- product dialog ---------- */
  const modal = $('#modal');
  function render(p) {
    current = list.indexOf(p);
    const type = segs(p)[0] || p.cat;
    $('#m-img').replaceChildren(h('img', { src: `img/l/${p.id}.webp`, alt: `${type} דגם ${p.model}`, width: 1200, height: 1200 }));
    const ca = $('#m-cat'); ca.textContent = p.cat; ca.href = href({ cat: p.cat });
    $('#m-model').textContent = p.model;
    $('#m-sku').textContent = sku(p);
    const sizesEl = $('#m-sizes'), priceBox = $('#m-price');
    if (hasPrice(p) && p.sizes.length) {
      // a priced model: the sizes become choices, the chosen one stays pressed and its price shows below
      const vals = p.price.values;
      let sel = Math.max(0, vals.findIndex(v => v > 0));
      const pick = k => {
        sel = k;
        $$('button', sizesEl).forEach((b, j) => b.setAttribute('aria-pressed', j === k ? 'true' : 'false'));
        $('#m-price-value').textContent = vals[k] > 0 ? money(vals[k], p.price.currency) : 'מחיר למידה זו לפי פנייה';
        $('#m-price-value').classList.toggle('is-ask', !(vals[k] > 0));
        $('#m-wa').href = waProduct(p, p.sizes[k]);
      };
      sizesEl.className = 'sizes sizes--pick';
      sizesEl.setAttribute('aria-label', 'בחירת מידה');
      sizesEl.replaceChildren(...p.sizes.map((s, k) => h('li', {}, h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => pick(k) }, rich(s)))));
      priceBox.hidden = false;
      queueMicrotask(() => pick(sel));
    } else {
      sizesEl.className = 'sizes'; sizesEl.removeAttribute('aria-label');
      sizesEl.replaceChildren(...(p.sizes.length ? p.sizes : ['לפי הזמנה, שאלו אותנו']).map(s => h('li', {}, rich(s))));
      priceBox.hidden = true;
    }
    const dl = $('#m-specs'); dl.replaceChildren();
    segs(p).forEach((seg, k) => {
      const m = seg.match(/^([^:]{2,24}):\s*(.+)$/);
      if (k === 0) dl.append(h('dt', { text: 'סוג' }), h('dd', {}, rich(seg)));
      else if (m) dl.append(h('dt', { text: m[1] }), h('dd', {}, rich(m[2])));
      else dl.append(h('dd', { class: 'full' }, rich(seg)));
    });
    $('#m-wa').href = waProduct(p);
    $('#m-prev').hidden = current <= 0; $('#m-next').hidden = current < 0 || current >= list.length - 1;
    if (!modal.open) modal.showModal();
    $('.modal__body').scrollTop = 0;
  }
  const step = d => { const i = current + d; if (i >= 0 && i < list.length) go({ ...state, p: list[i].id, page: String(Math.floor(i / PER_PAGE) + 1) }, true); };
  $('#m-prev').addEventListener('click', () => step(-1));
  $('#m-next').addEventListener('click', () => step(1));
  modal.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') step(1); if (e.key === 'ArrowRight') step(-1); });
  modal.querySelector('[data-close]').addEventListener('click', () => modal.close());
  modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });
  modal.addEventListener('close', () => { if (state.p) { const { p, ...rest } = state; go(rest, true); } });

  /* ---------- router ---------- */
  let lastList = '';
  function route() {
    const next = readHash();
    if (next.p && !ALL.some(x => x.id === next.p)) delete next.p;
    const listKey = JSON.stringify([next.room, next.cat, next.q, next.page]);
    const changed = listKey !== lastList;
    state = next; lastList = listKey;
    if ($('#q').value !== (state.q || '')) $('#q').value = state.q || '';
    if (changed) renderCatalog();
    if (state.p) {
      let p = ALL.find(x => x.id === state.p);
      if (!list.includes(p)) { state = { cat: p.cat, p: p.id }; lastList = ''; history.replaceState(null, '', href(state)); renderCatalog(); lastList = JSON.stringify([undefined, p.cat, undefined, undefined]); }
      render(p);
    } else {
      if (modal.open) modal.close();
      if (changed && location.hash && location.hash !== '#catalog' && booted) $('#crumbs').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  }
  let booted = false;
  window.addEventListener('popstate', route);
  window.addEventListener('hashchange', route);

  let t;
  $('#q').addEventListener('input', e => {
    clearTimeout(t);
    t = setTimeout(() => {
      const q = e.target.value.trim();
      history.replaceState(null, '', href({ q })); state = readHash(); lastList = ''; route();
      if (q && window.scrollY < $('#catalog').offsetTop - 200) $('#catalog').scrollIntoView();
    }, 200);
  });
  $('#reset').addEventListener('click', () => go({}));

  /* ---------- hero slider: the room photo, then selected models; a new slide every 3 s (pause button stops it) ---------- */
  (function slider() {
    const box = $('#slider'), track = $('#slides');
    if (!box || !track) return;
    const n = track.children.length;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let i = 0, timer = null, paused = false;
    const clone = track.children[0].cloneNode(true); // seamless loop: slide past the end onto a copy of the first
    clone.querySelector('img').removeAttribute('fetchpriority'); clone.querySelector('h1')?.replaceWith(Object.assign(document.createElement('p'), { className: 'h1-copy', textContent: 'רהיטים לבית, ביבוא ישיר מהמפעל' })); track.append(clone);
    const dots = $('#slide-dots');
    for (let k = 0; k < n; k++) dots.append(h('button', { type: 'button', 'aria-label': `תמונה ${k + 1} מתוך ${n}`, onclick: () => { show(k); restart(); } }));
    const btn = $('#slide-pause');
    const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
    const ICON_PLAY = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
    const count = $('#slide-count');
    $('#slide-prev').addEventListener('click', () => { show((i % n + n - 1) % n, false); restart(); });
    $('#slide-next').addEventListener('click', () => { show(i + 1); restart(); });
    function mark() {
      const k = i % n;
      count.textContent = `${k + 1} / ${n}`;
      [...dots.children].forEach((d, j) => d.setAttribute('aria-current', j === k ? 'true' : 'false'));
      [...track.children].forEach((sl, j) => {
        const on = j === i; sl.setAttribute('aria-hidden', on ? 'false' : 'true');
        sl.querySelectorAll('a').forEach(a => a.tabIndex = on ? 0 : -1); sl.inert = !on;
      });
    }
    // with "reduce motion" the slides still change every 3 s, but switch in place without sliding
    function show(k, animate = true) {
      const anim = animate && !reduce;
      i = k; track.style.transition = anim ? '' : 'none';
      track.style.transform = `translateX(${-100 * i}%)`; mark();
      if (!anim && i === n) show(0, false);
    }
    track.addEventListener('transitionend', () => { if (i === n) show(0, false); });
    function restart() {
      clearInterval(timer);
      if (!paused) timer = setInterval(() => { if (!document.hidden) show(i + 1); }, 3000);
    }
    function setPaused(v) {
      paused = v; btn.innerHTML = v ? ICON_PLAY : ICON_PAUSE;
      btn.setAttribute('aria-label', v ? 'הפעלת ההחלפה האוטומטית' : 'עצירת ההחלפה האוטומטית'); restart();
    }
    btn.addEventListener('click', () => setPaused(!paused));
    show(0, false); setPaused(paused);
  })();

  /* ---------- boot ---------- */
  $('#search-form').addEventListener('submit', e => e.preventDefault());
  applyConfig();
  fetch('data/products.json').then(r => r.json()).then(data => {
    ALL = data;
    for (const p of ALL) { counts[p.cat] = (counts[p.cat] || 0) + 1; p._s = norm(`${p.model} ${p.id} ${p.cat} ${p.desc} ${p.sizes.join(' ')}`); }
    buildNav();
    route();
    if (location.hash && location.hash !== '#catalog' && !state.p) $('#crumbs').scrollIntoView();
    booted = true;
  });
})();
