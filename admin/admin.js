(() => {
  'use strict';
  /* Catalog admin. Reads and writes the repository through the GitHub API with the user's token:
     supplier source (read only) = data/products.src.json + data/raw.json
     site text before edits     = data/products.base.json
     edits and selling prices    = data/admin/overrides.json   { id: { model?, sizes?, desc?, price? } }
     what the site reads         = data/products.json = base + overrides (written in the same commit)
     ?local opens a test mode that reads the files from this site and never writes. */
  const $ = (s, el = document) => el.querySelector(s);
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
    }
    el.append(...kids.flat().filter(x => x != null && x !== false && x !== ''));
    return el;
  };
  const LOCAL = new URLSearchParams(location.search).has('local');
  // dimension runs (215×106×80) are LTR islands in RTL text; isolate them or they render reversed
  const DIM = /[φ\d][\d.\/–φ-]*(?:\s*×\s*\(?[φ\d][\d.\/–φ-]*\)?)+/g;
  const rich = text => {
    const out = []; let last = 0;
    for (const m of String(text).matchAll(DIM)) { out.push(text.slice(last, m.index), h('bdi', { dir: 'ltr', text: m[0] })); last = m.index + m[0].length; }
    out.push(text.slice(last)); return out.filter(Boolean);
  };
  const STORE = 'pb-admin';
  const DEFAULTS = { owner: 'matennayad', repo: 'furniture-catalog', branch: 'build-catalog' };
  const FIELDS = ['model', 'sizes', 'desc', 'price'];
  const PER_PAGE = 20;
  const CUR = { ILS: '₪', USD: '$' };

  let cfg = { ...DEFAULTS }, token = '';
  let base = [], baseById = {}, src = {}, ov = {}, draft = {}, page = 1, list = [];
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(STORE) || '{}')); token = cfg.token || ''; } catch {}

  const status = (t, kind) => { const s = $('#status'); s.textContent = t; s.className = 'bar__status' + (kind ? ` is-${kind}` : ''); };
  const clone = o => JSON.parse(JSON.stringify(o));
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

  /* ---------- GitHub API ---------- */
  async function gh(path, { method = 'GET', body, raw } = {}) {
    const r = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}${path}`, {
      method, body: body && JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}`, Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!r.ok) { const e = new Error(`GitHub ${r.status}`); e.status = r.status; throw e; }
    return raw ? r.text() : r.json();
  }
  async function readJSON(path) {
    try {
      const text = LOCAL ? await (await fetch(`../${path}`, { cache: 'no-store' })).text()
        : await gh(`/contents/${path}?ref=${encodeURIComponent(cfg.branch)}`, { raw: true });
      return JSON.parse(text);
    } catch (e) { if (e.status === 404 || (LOCAL && e instanceof SyntaxError)) return null; throw e; }
  }

  /* ---------- login ---------- */
  $('#cfg-owner').value = cfg.owner; $('#cfg-repo').value = cfg.repo; $('#cfg-branch').value = cfg.branch;
  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    token = $('#token').value.trim();
    cfg.owner = $('#cfg-owner').value.trim(); cfg.repo = $('#cfg-repo').value.trim(); cfg.branch = $('#cfg-branch').value.trim();
    await start();
  });
  $('#logout').addEventListener('click', () => { localStorage.removeItem(STORE); location.reload(); });

  async function start() {
    $('#login-error').textContent = '';
    status('טוען נתונים…');
    try {
      if (!LOCAL) {
        const repo = await gh('');
        if (!repo.permissions?.push) throw Object.assign(new Error('no push'), { status: 403 });
        $('#public-warning').hidden = repo.private;
        localStorage.setItem(STORE, JSON.stringify({ ...cfg, token }));
      }
      const [b, s, raw, o] = await Promise.all([readJSON('data/products.base.json'), readJSON('data/products.src.json'), readJSON('data/raw.json'), readJSON('data/admin/overrides.json')]);
      if (!b) throw Object.assign(new Error('no contents'), { status: 'contents' });
      base = b; baseById = Object.fromEntries(b.map(p => [p.id, p]));
      src = {}; (s || []).forEach((p, k) => { src[p.id] = { raw: p.model_raw, lines: ((raw || [])[k] || {}).lines || [] }; });
      ov = o || {}; draft = {};
      $('#login').hidden = true; $('#app').hidden = false; $('#logout').hidden = LOCAL;
      const cats = [...new Set(base.map(p => p.cat))];
      $('#cat').append(...cats.map(c => h('option', { value: c, text: c })));
      status(LOCAL ? 'מצב בדיקה: השינויים לא נשמרים' : `מחובר ל-${cfg.owner}/${cfg.repo}`, LOCAL ? '' : 'ok');
      render(); pdfInfo();
    } catch (err) {
      status('');
      $('#login').hidden = false; $('#app').hidden = true;
      $('#login-error').textContent = err.status === 401 ? 'הטוקן לא תקין או שפג תוקפו.'
        : err.status === 403 ? 'לטוקן אין הרשאת כתיבה למאגר. צריך Contents: Read and write.'
        : err.status === 'contents' ? 'הטוקן נכנס למאגר אבל אין לו הרשאה לקרוא קבצים. ודאו שזה טוקן "pb-direct admin" שנבחר בו המאגר furniture-catalog ושיש לו Contents: Read and write.'
        : err.status === 404 ? 'המאגר או הענף לא נמצאו, או שלטוקן אין גישה אליהם. בדקו את הגדרות המאגר.'
        : `הטעינה נכשלה: ${err.message}`;
    }
  }

  /* ---------- data helpers ---------- */
  const saved = id => ({ ...pick(baseById[id]), ...(ov[id] || {}) });
  const current = id => ({ ...saved(id), ...(draft[id] || {}) });
  const pick = p => ({ model: p.model, sizes: p.sizes, desc: p.desc });
  function setDraft(id, field, value) {
    const d = draft[id] || (draft[id] = {});
    if (same(value, saved(id)[field])) delete d[field]; else d[field] = value;
    if (!Object.keys(d).length) delete draft[id];
    updateSavebar();
  }
  const isEdited = (id, field) => field in (ov[id] || {}) || field in (draft[id] || {});
  const dirtyCount = () => Object.keys(draft).length;

  /* ---------- list ---------- */
  const norm = s => (s || '').toLowerCase();
  function filtered() {
    const q = norm($('#q').value.trim()), cat = $('#cat').value, onlyChanged = $('#only-changed').checked, onlyPriced = $('#only-priced').checked;
    return base.filter(p => {
      if (cat && p.cat !== cat) return false;
      const c = current(p.id);
      if (onlyChanged && !(ov[p.id] || draft[p.id])) return false;
      if (onlyPriced && !(c.price && c.price.values.some(v => v > 0))) return false;
      if (!q) return true;
      return [p.id, p.id.slice(1), c.model, c.desc, (src[p.id] || {}).raw, ...(c.sizes || [])].some(t => norm(t).includes(q));
    });
  }
  function render() {
    list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    page = Math.min(page, pages);
    $('#count').textContent = `${list.length.toLocaleString('he-IL')} מוצרים`;
    $('#items').replaceChildren(...list.slice((page - 1) * PER_PAGE, page * PER_PAGE).map(card));
    const pg = $('#pager'); pg.replaceChildren();
    if (pages > 1) pg.append(
      h('button', { type: 'button', class: 'btn btn--ghost btn--sm', disabled: page === 1, onclick: () => { page--; render(); scrollTo(0, 0); } }, 'הקודם'),
      h('span', { text: `עמוד ${page} מתוך ${pages}` }),
      h('button', { type: 'button', class: 'btn btn--ghost btn--sm', disabled: page === pages, onclick: () => { page++; render(); scrollTo(0, 0); } }, 'הבא'));
  }
  ['input', 'change'].forEach(ev => {
    $('#q').addEventListener(ev, () => { page = 1; render(); });
  });
  ['#cat', '#only-changed', '#only-priced'].forEach(s => $(s).addEventListener('change', () => { page = 1; render(); }));

  /* ---------- one product ---------- */
  function card(p) {
    const id = p.id, c = current(id), s = src[id] || { raw: '', lines: [] };
    const li = h('li', { class: 'item' + (draft[id] ? ' is-dirty' : ''), 'data-id': id });
    const refresh = () => li.replaceWith(card(p));

    const editable = (field, view, multiline) => h('div', {
      class: 'val' + (isEdited(id, field) ? ' is-edited' : ''), role: 'button', tabindex: '0', 'aria-label': 'לחיצה לעריכה',
      onclick: e => openEditor(e.currentTarget, field, multiline), onkeydown: e => { if (e.key === 'Enter') openEditor(e.currentTarget, field, multiline); },
    }, view);
    function openEditor(el, field, multiline) {
      const cur = current(id)[field];
      const text = Array.isArray(cur) ? cur.join('\n') : cur;
      const input = multiline ? h('textarea', { 'aria-label': 'עריכה' }) : h('input', { 'aria-label': 'עריכה', dir: field === 'model' ? 'ltr' : 'auto' });
      input.value = text;
      const done = ok => {
        if (ok) {
          let v = input.value.trim();
          if (field === 'sizes') v = v.split('\n').map(x => x.trim()).filter(Boolean);
          if (field === 'desc') v = v.replace(/\s*\n\s*/g, ' · ');
          setDraft(id, field, v);
        }
        refresh();
      };
      input.addEventListener('keydown', e => {
        if (e.key === 'Escape') done(false);
        if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) { e.preventDefault(); done(true); }
      });
      const reset = isEdited(id, field) && h('button', { type: 'button', class: 'link', onclick: () => { setDraft(id, field, pick(baseById[id])[field]); refresh(); } }, 'חזרה לטקסט המקורי');
      el.replaceWith(h('div', { class: 'editor' }, input, h('div', { class: 'editor__bar' },
        h('button', { type: 'button', class: 'btn btn--primary btn--sm', onclick: () => done(true) }, 'אישור'),
        h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: () => done(false) }, 'ביטול'),
        reset, h('span', { class: 'note', text: field === 'sizes' ? 'מידה אחת בכל שורה' : field === 'desc' ? 'שורה חדשה = פריט חדש ברשימת החומרים' : '' }))));
      input.focus();
    }

    // prices: one per Hebrew size line, one currency per product
    const price = c.price || { currency: 'ILS', values: [] };
    const setPrice = (k, v) => {
      const cur = clone(current(id).price || { currency: price.currency, values: [] });
      cur.values = c.sizes.map((_, j) => (j === k ? v : cur.values[j] ?? null));
      setDraft(id, 'price', cur.values.some(x => x > 0) ? cur : undefined);
    };
    const sizeRows = (c.sizes.length ? c.sizes : ['']).map((s_, k) => h('li', {},
      h('span', { class: 's' }, s_ ? rich(s_) : 'בלי מידה'),
      h('label', { class: 'money' + (isEdited(id, 'price') ? ' is-edited' : '') },
        h('span', { text: CUR[price.currency] }),
        h('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', 'aria-label': `מחיר למידה ${s_}`, value: price.values[k] ?? '', placeholder: '—',
          onchange: e => { const v = e.target.value === '' ? null : Math.max(0, Math.round(+e.target.value)); setPrice(k, v); li.classList.toggle('is-dirty', !!draft[id]); } }))));
    const setCurrency = cur => {
      const pr = clone(current(id).price || { currency: cur, values: [] });
      pr.currency = cur; setDraft(id, 'price', pr.values.some(x => x > 0) ? pr : undefined); refresh();
    };

    const srcSizes = s.lines.filter(l => /\$/.test(l) || /\d+\s*[*×xX]\s*\d+/.test(l));
    const srcText = s.lines.filter(l => !srcSizes.includes(l) && l !== s.raw);
    const priceSpan = l => { const m = l.match(/(.*?)(\$\s*[\d,.]+)(.*)/); return m ? [m[1], h('span', { class: 'p', text: m[2] }), m[3]] : [l]; };

    li.append(
      h('img', { class: 'item__img', src: `../img/t/${id}.webp`, alt: '', loading: 'lazy', width: 120, height: 120 }),
      h('div', {},
        h('div', { class: 'item__head' },
          h('span', { class: 'item__sku', text: `מק״ט ${id.slice(1)}` }),
          h('span', { class: 'item__cat', text: p.cat }),
          (ov[id] || draft[id]) && h('span', { class: 'item__flag', text: draft[id] ? 'שינוי שלא נשמר' : 'נערך' }),
          h('a', { class: 'item__view', href: `../#p=${id}`, target: '_blank', rel: 'noopener', text: 'פתיחה באתר' })),
        h('div', { class: 'grid' },
          h('div', { class: 'colh' }), h('div', { class: 'colh', text: 'מקור הספק (לקריאה בלבד)' }), h('div', { class: 'colh', text: 'באתר (לחיצה לעריכה)' }),
          h('div', { class: 'lbl', text: 'שם דגם' }),
          h('div', { class: 'src' }, h('p', { dir: 'auto', text: s.raw })),
          editable('model', h('span', { class: 'model', dir: 'ltr', text: c.model })),
          h('div', { class: 'lbl', text: 'מידות ומחיר' }),
          h('div', { class: 'src' }, h('ul', {}, srcSizes.map(l => h('li', { dir: 'ltr' }, priceSpan(l))))),
          h('div', { class: 'sizecell' }, h('ul', { class: 'sizes' }, sizeRows), editable('sizes', h('span', { class: 'editsizes', text: 'עריכת המידות' }), true)),
          h('div', { class: 'lbl', text: 'תיאור' }),
          h('div', { class: 'src' }, h('p', { dir: 'ltr', text: srcText.join(' ') })),
          editable('desc', h('p', {}, rich(c.desc)), true),
          h('div', { class: 'priceband' },
            h('b', { text: 'מחיר ללקוח' }),
            h('div', { class: 'seg', role: 'group', 'aria-label': 'מטבע' },
              h('button', { type: 'button', 'aria-pressed': price.currency === 'ILS' ? 'true' : 'false', onclick: () => setCurrency('ILS') }, '₪'),
              h('button', { type: 'button', 'aria-pressed': price.currency === 'USD' ? 'true' : 'false', onclick: () => setCurrency('USD') }, '$')),
            h('span', { class: 'note', text: 'מחיר לכל מידה, בשדות שליד המידות. שדה ריק = המחיר לא יוצג באתר.' })))));
    return li;
  }

  /* ---------- save ---------- */
  function updateSavebar() {
    const n = dirtyCount();
    $('#savebar').hidden = n === 0;
    $('#dirty-count').textContent = n === 1 ? 'מוצר אחד עם שינויים שלא נשמרו' : `${n} מוצרים עם שינויים שלא נשמרו`;
  }
  $('#discard').addEventListener('click', () => { if (confirm('לבטל את כל השינויים שלא נשמרו?')) { draft = {}; updateSavebar(); render(); } });
  window.addEventListener('beforeunload', e => { if (dirtyCount()) { e.preventDefault(); e.returnValue = ''; } });

  function mergeOverrides(target) {
    const out = clone(target || {});
    for (const [id, d] of Object.entries(draft)) {
      const o = out[id] || {};
      for (const f of FIELDS) {
        if (!(f in d)) continue;
        if (d[f] === undefined || same(d[f], pick(baseById[id])[f])) delete o[f]; else o[f] = d[f];
      }
      if (Object.keys(o).length) out[id] = o; else delete out[id];
    }
    return out;
  }
  const buildProducts = overrides => base.map(p => {
    const o = overrides[p.id]; if (!o) return p;
    const q = { ...p }; for (const f of FIELDS) if (f in o) q[f] = o[f]; return q;
  });

  $('#save').addEventListener('click', async () => {
    const btn = $('#save'); btn.disabled = true; status('שומר…');
    try {
      if (LOCAL) {
        ov = mergeOverrides(ov); console.log('overrides', ov); draft = {};
        status('מצב בדיקה: השינויים לא נשמרו במאגר', ''); updateSavebar(); render(); return;
      }
      for (let attempt = 0; attempt < 2; attempt++) {
        const ref = await gh(`/git/ref/heads/${encodeURIComponent(cfg.branch)}`);
        const head = ref.object.sha;
        const commit = await gh(`/git/commits/${head}`);
        const latest = await readJSON('data/admin/overrides.json'); // someone else may have saved meanwhile: merge onto the newest
        const nextOv = mergeOverrides(latest);
        const blob = content => gh('/git/blobs', { method: 'POST', body: { content, encoding: 'utf-8' } });
        const [b1, b2] = await Promise.all([blob(JSON.stringify(nextOv, null, 1)), blob(JSON.stringify(buildProducts(nextOv)))]);
        const tree = await gh('/git/trees', { method: 'POST', body: { base_tree: commit.tree.sha, tree: [
          { path: 'data/admin/overrides.json', mode: '100644', type: 'blob', sha: b1.sha },
          { path: 'data/products.json', mode: '100644', type: 'blob', sha: b2.sha }] } });
        const n = dirtyCount();
        const c = await gh('/git/commits', { method: 'POST', body: { message: `עדכון קטלוג מדף הניהול: ${n} מוצרים`, tree: tree.sha, parents: [head] } });
        try {
          await gh(`/git/refs/heads/${encodeURIComponent(cfg.branch)}`, { method: 'PATCH', body: { sha: c.sha } });
        } catch (e) { if (e.status === 422 && attempt === 0) continue; throw e; }
        ov = nextOv; draft = {};
        status('נשמר. האתר יתעדכן תוך דקה-שתיים.', 'ok'); updateSavebar(); render();
        return;
      }
    } catch (err) {
      status(err.status === 401 ? 'החיבור פג. התחברו מחדש.' : err.status === 403 ? 'אין הרשאת כתיבה למאגר.' : `השמירה נכשלה (${err.message}). השינויים עדיין כאן, נסו שוב.`, 'err');
    } finally { btn.disabled = false; }
  });

  /* ---------- PDF downloads (private repo, so through the API with the token) ---------- */
  document.querySelectorAll('[data-pdf]').forEach(b => b.addEventListener('click', async () => {
    const path = b.dataset.pdf, st = $('#pdf-status');
    b.disabled = true; st.textContent = 'מוריד… (כ-50MB, עשוי לקחת דקה)';
    try {
      const r = LOCAL ? await fetch(`../${path}`) : await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}?ref=pdfs`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw+json', 'X-GitHub-Api-Version': '2022-11-28' } });
      if (!r.ok) throw new Error(r.status);
      const url = URL.createObjectURL(await r.blob());
      const a = h('a', { href: url, download: path.split('/').pop() }); document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      st.textContent = 'ההורדה הסתיימה';
    } catch (e) { st.textContent = `ההורדה נכשלה (${e.message})`; }
    finally { b.disabled = false; }
  }));

  async function pdfInfo() {
    try {
      const info = LOCAL ? null : JSON.parse(await gh('/contents/pdf/pdf-info.json?ref=pdfs', { raw: true }));
      if (info) $('#pdf-status').textContent = `עודכן לאחרונה: ${new Date(info.updated).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })} · כ-50MB כל קובץ`;
    } catch { $('#pdf-status').textContent = 'הקבצים בהפקה, נסו שוב בעוד כמה דקות'; }
  }

  /* ---------- boot ---------- */
  if (LOCAL || token) start(); else $('#token').focus();
})();
