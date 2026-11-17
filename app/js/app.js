/* =====================================================================
   Fiche Bilan UDPS — application hors ligne (PWA)
   Stockage local (localStorage), export PDF, export JSON, envoi API.
   ===================================================================== */
(function () {
  'use strict';
  const SCH = window.FB_SCHEMA;
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
    return e;
  };
  const pad = n => String(n).padStart(2, '0');
  const nowHM = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const frDate = iso => iso ? iso.split('-').reverse().join('/') : '';

  /* ------------------------------------------------------------------ */
  /* Stockage                                                            */
  /* ------------------------------------------------------------------ */
  const store = {
    get(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch { return def; } },
    set(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); return true; }
      catch (e) { toast("Espace de stockage plein : exportez puis supprimez d'anciennes fiches.", true); return false; }
    },
    del(k) { try { localStorage.removeItem(k); } catch { } },
  };
  const DEFAULT_SETTINGS = {
    structure: '', respDps: '', vpsp: '', infirmerie: '', prefix: '', nextNum: 1,
    apiUrl: '', apiMethod: 'POST', apiHeader: 'Authorization', apiToken: '', apiPdf: true, apiAuto: false,
  };
  let settings = Object.assign({}, DEFAULT_SETTINGS, store.get('fb.settings', {}));
  const saveSettings = () => store.set('fb.settings', settings);

  const index = () => store.get('fb.index', []);
  const saveIndex = ix => store.set('fb.index', ix);
  const loadFiche = id => store.get('fb.f.' + id, null);
  const outbox = () => store.get('fb.outbox', []);
  const saveOutbox = o => store.set('fb.outbox', o);

  function metaOf(f) {
    return { id: f.id, num: f.data.num || '', date: f.data.date || '', heure: f.data.heurePec || '', nom: f.data.nom || '',
      status: f.status, red: hasDistress(f), updated: f.updated, sentAt: f.sentAt || null };
  }
  function persist(f) {
    f.updated = new Date().toISOString();
    if (!store.set('fb.f.' + f.id, f)) return;
    const ix = index().filter(m => m.id !== f.id);
    ix.unshift(metaOf(f));
    ix.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
    saveIndex(ix);
  }
  function removeFiche(id) {
    store.del('fb.f.' + id);
    saveIndex(index().filter(m => m.id !== id));
    saveOutbox(outbox().filter(x => x !== id));
  }

  function newFiche() {
    const n = settings.nextNum || 1;
    settings.nextNum = n + 1; saveSettings();
    const f = {
      id: uid(), created: new Date().toISOString(), updated: null, status: 'draft', schema: SCH.version,
      data: { num: (settings.prefix || '') + n, date: todayISO(), heurePec: nowHM(),
        respDps: settings.respDps, vpsp: settings.vpsp, infirmerie: settings.infirmerie, se_resp: settings.respDps },
      surv: [{}, {}, {}], marks: [], sigs: {},
    };
    persist(f);
    return f;
  }

  /* ------------------------------------------------------------------ */
  /* Détection détresse vitale (éléments rouges de la fiche)             */
  /* ------------------------------------------------------------------ */
  const RED_KEYS = []; const RED_RADIO = {};
  (function collect(items) {
    for (const it of items || []) {
      if (!it) continue;
      if (it.t === 'chk' && it.red) RED_KEYS.push(it.k);
      if (it.t === 'radio') it.opts.forEach(o => { if (o[2]) (RED_RADIO[it.k] = RED_RADIO[it.k] || []).push(o[0]); });
      if (it.items) collect(it.items);
    }
  })(SCH.sections.flatMap(s => s.items || Object.values(s.cols || {}).flat()));
  function redKeysIn(sec) {
    const out = [];
    (function walk(items) { for (const it of items) { if (it.t === 'chk' && it.red) out.push(it.k); if (it.items) walk(it.items); } })(Object.values(sec.cols).flat());
    return out;
  }
  function hasDistress(f) {
    return RED_KEYS.some(k => f.data[k]) || Object.entries(RED_RADIO).some(([k, v]) => v.includes(f.data[k]));
  }

  /* ------------------------------------------------------------------ */
  /* Rendu du formulaire                                                  */
  /* ------------------------------------------------------------------ */
  let cur = null;          // fiche en cours
  let saveTimer = null;
  const form = $('#ficheForm');

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { if (cur) { persist(cur); updateTitle(); } }, 300);
  }

  function fieldInput(k, type, o = {}) {
    const attrs = { id: 'f_' + k, 'data-k': k, type: type === 'date' || type === 'time' || type === 'tel' ? type : (type === 'number' ? 'text' : 'text') };
    if (type === 'number') { attrs.inputmode = 'decimal'; attrs.pattern = '[0-9.,]*'; }
    if (o.mode) attrs.inputmode = o.mode;
    if (o.max) attrs.maxlength = o.max;
    if (o.ph) attrs.placeholder = o.ph;
    const inp = el('input', attrs);
    const v = cur.data[k]; if (v != null) inp.value = v;
    return inp;
  }

  function withSuffix(inp, o) {
    const wrap = el('span', { class: 'inwrap' + (o.now ? ' has-now' : '') }, inp);
    if (o.suf) wrap.append(el('span', { class: 'suf', text: o.suf }));
    if (o.now) wrap.append(el('button', { type: 'button', class: 'nowbtn', 'data-now': inp.dataset.k, title: "Mettre l'heure actuelle", text: 'maint.' }));
    return wrap;
  }

  function renderItem(it) {
    switch (it.t) {
      case 'chk': {
        const cb = el('input', { type: 'checkbox', id: 'f_' + it.k, 'data-k': it.k });
        cb.checked = !!cur.data[it.k];
        const lab = el('label', { class: 'chk' + (it.red ? ' red' : ''), for: 'f_' + it.k }, cb, el('span', { class: 'box' }), el('span', { class: 'lbl', text: it.l }));
        if (!it.input) return lab;
        const inp = fieldInput(it.k + '_v', it.input.type, it.input);
        inp.dataset.autocheck = it.k;
        inp.setAttribute('aria-label', it.l);
        return el('span', { class: 'chk-wrap' }, lab, withSuffix(inp, it.input));
      }
      case 'field': {
        const inp = fieldInput(it.k, it.type, it);
        if (it.step) inp.dataset.step = it.step;
        return el('label', { class: 'field w-' + (it.w || 'm'), for: 'f_' + it.k }, el('span', { class: 'flbl', text: it.l }), withSuffix(inp, it));
      }
      case 'pa': {
        const s = fieldInput(it.k + '_s', 'number'), d = fieldInput(it.k + '_d', 'number');
        s.setAttribute('aria-label', it.l + ' systolique'); d.setAttribute('aria-label', it.l + ' diastolique');
        return el('div', { class: 'field w-m' }, el('span', { class: 'flbl', text: it.l }),
          el('span', { class: 'pa' }, s, el('span', { class: 'slash', text: '/' }), d, el('span', { class: 'suf', text: 'mmHg' })));
      }
      case 'radio': {
        const g = el('div', { class: 'radio', role: 'radiogroup', 'aria-label': it.l || it.k });
        it.opts.forEach(([v, l, red]) => g.append(el('button', {
          type: 'button', class: 'rbtn' + (red ? ' red' : ''), 'data-radio': it.k, 'data-v': v,
          'aria-pressed': cur.data[it.k] === v ? 'true' : 'false', text: l
        })));
        return it.l ? el('div', { class: 'field w-auto' }, el('span', { class: 'flbl', text: it.l }), g) : g;
      }
      case 'text': {
        const ta = el('textarea', { id: 'f_' + it.k, 'data-k': it.k, rows: it.rows || 3 });
        ta.value = cur.data[it.k] || '';
        return el('label', { class: 'field w-full', for: 'f_' + it.k }, el('span', { class: 'flbl', text: it.l }), ta);
      }
      case 'group': {
        const row = el('div', { class: 'grp' });
        if (it.l) row.append(el('span', { class: 'glbl', text: it.l }));
        row.append(el('div', { class: 'gitems' }, it.items.map(renderItem)));
        return row;
      }
      case 'sub': return el('h4', { class: 'sub', text: it.l });
      case 'panel': return el('div', { class: 'panel tone-' + it.tone }, el('h3', { class: 'ptitle', text: it.l }), it.items.map(renderItem));
      case 'scale': return renderScale(it);
      case 'bodymap': return renderBodyMap(it);
      case 'surv': return renderSurv();
      case 'sig': return renderSig(it);
      case 'sigrow': return el('div', { class: 'sigrow' }, it.items.map(col => el('div', { class: 'sigcol' }, col.map(renderItem))));
    }
    return document.createTextNode('');
  }

  function renderForm() {
    form.innerHTML = '';
    const fs = el('fieldset', { id: 'fs' });
    const nav = $('#secNav'); nav.innerHTML = '';
    for (const s of SCH.sections) {
      const sec = el('section', { class: 'fsec kind-' + s.kind + (s.color ? ' col-' + s.color : ''), id: 'sec_' + s.id });
      if (s.kind === 'abcde') {
        sec.append(el('header', { class: 'abc-head' },
          el('span', { class: 'letter', text: s.letter }),
          el('span', { class: 'abc-t' }, el('strong', { text: s.title }), el('small', { text: s.en })),
          el('span', { class: 'dv-badge', text: 'Détresse vitale', hidden: true })));
        const grid = el('div', { class: 'abc-grid' });
        for (const [ck, t1, t2] of SCH.cols) {
          const items = s.cols[ck];
          grid.append(el('div', { class: 'abc-col c-' + ck + (items.length ? '' : ' empty') },
            el('div', { class: 'col-h' }, el('strong', { text: t1 }), t2 ? el('span', { text: t2 }) : null),
            el('div', { class: 'colbody' }, items.map(renderItem))));
        }
        sec.append(grid);
      } else {
        sec.append(el('header', { class: 'sec-head' }, el('h2', { text: s.title }), s.note ? el('span', { class: 'note', text: s.note }) : null));
        sec.append(el('div', { class: 'sec-body' }, s.items.map(renderItem)));
      }
      fs.append(sec);
      nav.append(el('button', { type: 'button', class: 'navchip' + (s.color ? ' col-' + s.color : ''), 'data-go': s.id, text: s.nav }));
    }
    form.append(fs);
    refreshDistress();
    applyLock();
    requestAnimationFrame(() => document.querySelectorAll('canvas.sigpad').forEach(c => c._init && c._init()));
  }

  /* ---- échelle de douleur ---- */
  function renderScale(it) {
    const row = el('div', { class: 'scale', role: 'radiogroup', 'aria-label': it.l });
    for (let i = 0; i <= 10; i++) row.append(el('button', {
      type: 'button', class: 'sbtn s' + i, 'data-radio': it.k, 'data-v': String(i),
      'aria-pressed': cur.data[it.k] === String(i) ? 'true' : 'false', text: String(i)
    }));
    return el('div', { class: 'field w-full' }, el('span', { class: 'flbl', text: it.l }), row);
  }

  /* ---- schéma corporel : silhouettes de la fiche ANPS d'origine ---- */
  let curLesion = 'D';
  function renderBodyMap(it) {
    const pal = el('div', { class: 'lespal', role: 'radiogroup', 'aria-label': 'Type de lésion' });
    SCH.lesions.forEach(([c, l, col]) => pal.append(el('button', {
      type: 'button', class: 'lesbtn', 'data-les': c, 'aria-pressed': c === curLesion ? 'true' : 'false', style: '--lc:' + col
    }, el('b', { text: c }), ' ' + l)));
    const cv = el('canvas', { class: 'burncv', id: 'burnCv', width: BZ.w * 4, height: BZ.h * 4 });
    const map = el('div', { class: 'bodyimg', id: 'bodyImg' },
      el('img', { src: 'assets/silhouettes.png', alt: 'Silhouettes face et dos', draggable: 'false' }),
      cv, el('div', { class: 'marks' }));
    // outils de la surface brûlée (visibles quand on peint)
    const tools = el('div', { class: 'burntools', id: 'burnTools', hidden: true },
      el('div', { class: 'radio', role: 'radiogroup', 'aria-label': 'Outil' },
        el('button', { type: 'button', class: 'rbtn', 'data-brush': 'fin', 'aria-pressed': burnTool === 'fin' ? 'true' : 'false', text: 'Pinceau fin' }),
        el('button', { type: 'button', class: 'rbtn', 'data-brush': 'large', 'aria-pressed': burnTool === 'large' ? 'true' : 'false', text: 'Pinceau large' }),
        el('button', { type: 'button', class: 'rbtn', 'data-brush': 'gomme', 'aria-pressed': burnTool === 'gomme' ? 'true' : 'false', text: 'Gomme' })),
      el('button', { type: 'button', class: 'btn small', 'data-act': 'burn-clear', text: 'Effacer la surface brûlée' }));
    const wrap = el('div', { class: 'bodymap' }, el('span', { class: 'flbl', text: it.l }), pal,
      el('p', { class: 'burnhint', id: 'burnHint', hidden: true }), tools, map,
      el('p', { class: 'burnres', id: 'burnRes', hidden: true }),
      el('div', { class: 'bm-actions', id: 'markActions' },
        el('button', { type: 'button', class: 'btn small', 'data-act': 'mark-undo', text: 'Annuler le dernier repère' }),
        el('span', { class: 'hint', text: 'Touchez un repère pour le retirer.' })));
    bindBurnCanvas(cv);
    setTimeout(() => { drawMarks(); drawBurn(); syncBurnUI(); });
    return wrap;
  }

  /* ---- surface brûlée : peinture sur la silhouette + règle des 9 de Wallace ---- */
  const BZ = window.FB_BURN;
  const ZONE = Uint8Array.from(BZ.cells, c => parseInt(c, 16) || 0);
  let burnTool = 'fin', burnBits = null, burnFor = null;
  const hasBurnSituation = () => !!(cur && (cur.data.brul_therm || cur.data.brul_elec || cur.data.brul_chim));
  const paintMode = () => curLesion === 'B' && hasBurnSituation() && cur.status === 'draft';
  function bits() {
    if (burnFor !== cur.id) {
      burnFor = cur.id; burnBits = new Uint8Array(BZ.w * BZ.h);
      if (cur.burn) { try { const raw = atob(cur.burn); for (let i = 0; i < burnBits.length; i++) burnBits[i] = (raw.charCodeAt(i >> 3) >> (i & 7)) & 1; } catch { } }
    }
    return burnBits;
  }
  function saveBits() {
    const b = bits(), bytes = new Uint8Array(Math.ceil(b.length / 8));
    let any = false;
    for (let i = 0; i < b.length; i++) if (b[i]) { bytes[i >> 3] |= 1 << (i & 7); any = true; }
    let str = ''; for (const x of bytes) str += String.fromCharCode(x);
    cur.burn = any ? btoa(str) : '';
  }
  // résultat : % par zone = poids de la zone × part de la zone peinte
  function burnCalc(b) {
    const tot = {}, hit = {};
    for (let i = 0; i < ZONE.length; i++) { const z = ZONE[i]; if (!z) continue; tot[z] = (tot[z] || 0) + 1; if (b[i]) hit[z] = (hit[z] || 0) + 1; }
    const pct = z => tot[z] ? BZ.zones[z][1] * (hit[z] || 0) / tot[z] : 0;
    const regions = BZ.regions.map(([lab, zs]) => [lab, zs.reduce((a, z) => a + pct(z), 0)]).filter(r => r[1] > 0);
    return { total: regions.reduce((a, r) => a + r[1], 0), regions };
  }
  const fmtPct = v => { const r = Math.max(0.5, Math.round(v * 2) / 2); return String(r).replace('.', ','); };
  const BURN_PREFIX = 'Surface brûlée estimée (règle des 9 de Wallace)';
  function burnSentence(res) {
    if (!res.total) return '';
    let s = BURN_PREFIX + ' : ' + fmtPct(res.total) + ' % — ' + res.regions.map(([l, v]) => l + ' ' + fmtPct(v) + ' %').join(', ') + '.';
    const age = parseInt(cur.data.age, 10);
    if (age < 15) s += ' Victime de moins de 15 ans : règle établie pour l\'adulte, résultat indicatif.';
    return s;
  }
  // écrit / met à jour la ligne du résultat dans « Commentaires libres »
  function updateBurnComment() {
    const res = burnCalc(bits()), line = burnSentence(res);
    const lines = (cur.data.com || '').split('\n').filter(l => !l.startsWith(BURN_PREFIX));
    if (line) lines.unshift(line);
    cur.data.com = lines.join('\n').replace(/^\n+|\n+$/g, '');
    const ta = $('#f_com'); if (ta) ta.value = cur.data.com;
    const out = $('#burnRes');
    if (out) { out.hidden = !line; out.textContent = line ? 'Surface brûlée : ' + fmtPct(res.total) + ' % — reporté dans « Commentaires libres ».' : ''; }
  }
  function drawBurn() {
    const cv = $('#burnCv'); if (!cv) return;
    const ctx = cv.getContext('2d'), b = bits(), k = cv.width / BZ.w;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (paintMode()) {   // zones du corps légèrement teintées pour guider le pinceau
      ctx.fillStyle = 'rgba(37, 87, 167, 0.07)';
      for (let i = 0; i < ZONE.length; i++) if (ZONE[i]) ctx.fillRect((i % BZ.w) * k, Math.floor(i / BZ.w) * k, k, k);
    }
    ctx.fillStyle = 'rgba(234, 88, 12, 0.6)';
    for (let i = 0; i < b.length; i++) if (b[i]) ctx.fillRect((i % BZ.w) * k, Math.floor(i / BZ.w) * k, k + 0.3, k + 0.3);
  }
  function syncBurnUI() {
    const map = $('#bodyImg'); if (!map) return;
    const on = paintMode();
    map.classList.toggle('painting', on);
    $('#burnTools').hidden = !on;
    $('#markActions').hidden = on;
    const hint = $('#burnHint');
    if (curLesion === 'B' && cur.status === 'draft') {
      hint.hidden = false;
      hint.textContent = on ? 'Peignez au doigt les surfaces brûlées, face et dos. Le pourcentage est calculé avec la règle des 9 de Wallace.'
        : 'Pour peindre la surface brûlée, cochez d\'abord « Brûlure » (thermique, électrique ou chimique) dans le 1er regard. Sinon, « B » place un repère.';
    } else hint.hidden = true;
    const res = burnCalc(bits()), out = $('#burnRes');
    out.hidden = !res.total; if (res.total) out.textContent = 'Surface brûlée : ' + fmtPct(res.total) + ' % — reporté dans « Commentaires libres ».';
    drawBurn();
  }
  function bindBurnCanvas(cv) {
    let down = false, last = null;
    const cell = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * BZ.w, (e.clientY - r.top) / r.height * BZ.h]; };
    const dab = ([x, y]) => {
      const rad = burnTool === 'large' ? 4 : burnTool === 'gomme' ? 3 : 1.6, v = burnTool === 'gomme' ? 0 : 1, b = bits();
      for (let gy = Math.floor(y - rad); gy <= y + rad; gy++) for (let gx = Math.floor(x - rad); gx <= x + rad; gx++) {
        if (gx < 0 || gy < 0 || gx >= BZ.w || gy >= BZ.h) continue;
        if ((gx + 0.5 - x) ** 2 + (gy + 0.5 - y) ** 2 > rad * rad) continue;
        const i = gy * BZ.w + gx; if (ZONE[i]) b[i] = v;
      }
    };
    const stroke = p => {
      if (last) { const n = Math.ceil(Math.hypot(p[0] - last[0], p[1] - last[1]) / 0.8); for (let s = 1; s <= n; s++) dab([last[0] + (p[0] - last[0]) * s / n, last[1] + (p[1] - last[1]) * s / n]); }
      else dab(p);
      last = p; drawBurn();
    };
    cv.addEventListener('pointerdown', e => { if (!paintMode()) return; down = true; last = null; cv.setPointerCapture(e.pointerId); stroke(cell(e)); e.preventDefault(); });
    cv.addEventListener('pointermove', e => { if (down) { stroke(cell(e)); e.preventDefault(); } });
    const end = () => { if (!down) return; down = false; last = null; saveBits(); updateBurnComment(); scheduleSave(); };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  }
  function drawMarks() {
    const g = document.querySelector('#bodyImg .marks'); if (!g) return;
    g.innerHTML = '';
    cur.marks = cur.marks.filter(m => m.u != null);   // repères d'un ancien format ignorés
    cur.marks.forEach((m, i) => {
      const col = (SCH.lesions.find(l => l[0] === m.t) || [, , '#000'])[2];
      g.append(el('span', { class: 'mk' + (m.t.length > 1 ? ' long' : ''), 'data-i': i, title: m.t,
        style: `left:${m.u * 100}%;top:${m.v * 100}%;background:${col}`, text: m.t }));
    });
  }

  /* ---- tableau de surveillance ---- */
  const SURV_COLS = [['h', 'Heure', 'time'], ['fr', 'FR', 'n'], ['sat', 'SpO₂ %', 'n'], ['o2', 'Débit O₂', 'n'], ['fc', 'FC', 'n'],
    ['pa', 'PA', 't'], ['t', 'T°', 'n'], ['en', 'EN /10', 'n'], ['gly', 'Glycémie', 'n'], ['avpu', 'Conscience', 'avpu']];
  function renderSurv() {
    const tbl = el('table', { class: 'surv' });
    tbl.append(el('thead', {}, el('tr', {}, SURV_COLS.map(c => el('th', { text: c[1] })), el('th', { text: '' }))));
    const tb = el('tbody');
    cur.surv.forEach((r, i) => {
      const tr = el('tr');
      SURV_COLS.forEach(([k, l, t]) => {
        let ctl;
        if (t === 'avpu') {
          ctl = el('div', { class: 'radio mini' }, ['A', 'V', 'P', 'U'].map(v => el('button', {
            type: 'button', class: 'rbtn' + (v === 'P' || v === 'U' ? ' red' : ''), 'data-surv': i, 'data-sk': k, 'data-v': v,
            'aria-pressed': r[k] === v ? 'true' : 'false', text: v })));
        } else {
          ctl = el('input', { type: t === 'time' ? 'time' : 'text', inputmode: t === 'n' ? 'decimal' : null, 'data-surv': i, 'data-sk': k,
            'aria-label': l + ' ligne ' + (i + 1), placeholder: k === 'pa' ? '120/80' : '' });
          ctl.value = r[k] || '';
        }
        tr.append(el('td', { 'data-l': l }, ctl));
      });
      tr.append(el('td', {}, el('button', { type: 'button', class: 'iconbtn small del', 'data-act': 'surv-del', 'data-i': i, 'aria-label': 'Supprimer la ligne', text: '×' })));
      tb.append(tr);
    });
    tbl.append(tb);
    return el('div', { class: 'survwrap' }, el('div', { class: 'tscroll' }, tbl),
      el('button', { type: 'button', class: 'btn small', 'data-act': 'surv-add', text: '+ Ajouter une mesure (heure actuelle)' }));
  }

  /* ---- signature ---- */
  function renderSig(it) {
    const c = el('canvas', { class: 'sigpad', 'data-sig': it.k, 'aria-label': it.l });
    c._init = () => setupSig(c, it.k);
    return el('div', { class: 'sig' }, el('span', { class: 'flbl', text: it.l }), c,
      el('button', { type: 'button', class: 'btn small', 'data-act': 'sig-clear', 'data-k': it.k, text: 'Effacer' }));
  }
  function setupSig(c, k) {
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const w = c.clientWidth || 300, h = c.clientHeight || 120;
    c.width = w * ratio; c.height = h * ratio;
    const ctx = c.getContext('2d'); ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0b1f44';
    if (cur.sigs[k]) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, w, h); img.src = cur.sigs[k]; }
    if (c._bound) return; c._bound = true;
    let drawing = false, last = null;
    const pos = e => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    c.addEventListener('pointerdown', e => { if (cur.status !== 'draft') return; drawing = true; last = pos(e); c.setPointerCapture(e.pointerId); e.preventDefault(); });
    c.addEventListener('pointermove', e => {
      if (!drawing) return; const p = pos(e); const ctx2 = c.getContext('2d');
      ctx2.beginPath(); ctx2.moveTo(last[0], last[1]); ctx2.lineTo(p[0], p[1]); ctx2.stroke(); last = p;
    });
    const end = () => {
      if (!drawing) return; drawing = false;
      // signature stockée en PNG sur fond blanc (lisible dans le PDF)
      const out = document.createElement('canvas'); out.width = c.width; out.height = c.height;
      const o = out.getContext('2d'); o.fillStyle = '#fff'; o.fillRect(0, 0, out.width, out.height); o.drawImage(c, 0, 0);
      cur.sigs[k] = out.toDataURL('image/jpeg', 0.7); scheduleSave();
    };
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
  }

  /* ------------------------------------------------------------------ */
  /* Événements du formulaire                                            */
  /* ------------------------------------------------------------------ */
  form.addEventListener('input', e => {
    const t = e.target; if (!cur) return;
    if (t.dataset.surv != null) { cur.surv[+t.dataset.surv][t.dataset.sk] = t.value; scheduleSave(); return; }
    const k = t.dataset.k; if (!k) return;
    cur.data[k] = t.type === 'checkbox' ? t.checked : t.value;
    if (t.dataset.autocheck) {
      const cb = $('#f_' + t.dataset.autocheck);
      if (t.value && cb && !cb.checked) { cb.checked = true; cur.data[t.dataset.autocheck] = true; }
    }
    if (k === 'dob') autoAge();
    if (t.type === 'checkbox') refreshDistress();
    if (/^brul_(therm|elec|chim)$/.test(k)) syncBurnUI();
    if (k === 'age' || k === 'dob') { if (cur.burn) updateBurnComment(); }
    scheduleSave();
  });
  form.addEventListener('change', e => { if (e.target.type === 'checkbox') { refreshDistress(); scheduleSave(); } });

  form.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !cur) return;
    if (cur.status !== 'draft' && !b.dataset.go) return;
    if (b.dataset.radio) {
      const k = b.dataset.radio, v = b.dataset.v;
      cur.data[k] = cur.data[k] === v ? '' : v;
      form.querySelectorAll(`[data-radio="${k}"]`).forEach(x => x.setAttribute('aria-pressed', x.dataset.v === cur.data[k] ? 'true' : 'false'));
      refreshDistress(); scheduleSave(); return;
    }
    if (b.dataset.surv != null) {
      const r = cur.surv[+b.dataset.surv], k = b.dataset.sk;
      r[k] = r[k] === b.dataset.v ? '' : b.dataset.v;
      b.parentNode.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.dataset.v === r[k] ? 'true' : 'false'));
      scheduleSave(); return;
    }
    if (b.dataset.now) {
      const inp = $('#f_' + b.dataset.now); inp.value = nowHM();
      inp.dispatchEvent(new Event('input', { bubbles: true })); return;
    }
    if (b.dataset.les) {
      curLesion = b.dataset.les;
      form.querySelectorAll('[data-les]').forEach(x => x.setAttribute('aria-pressed', x.dataset.les === curLesion ? 'true' : 'false'));
      syncBurnUI(); return;
    }
    if (b.dataset.brush) {
      burnTool = b.dataset.brush;
      form.querySelectorAll('[data-brush]').forEach(x => x.setAttribute('aria-pressed', x.dataset.brush === burnTool ? 'true' : 'false'));
      return;
    }
    switch (b.dataset.act) {
      case 'surv-add': cur.surv.push({ h: nowHM() }); rerenderSurv(); scheduleSave(); break;
      case 'surv-del': cur.surv.splice(+b.dataset.i, 1); rerenderSurv(); scheduleSave(); break;
      case 'mark-undo': cur.marks.pop(); drawMarks(); scheduleSave(); break;
      case 'burn-clear': bits().fill(0); saveBits(); updateBurnComment(); drawBurn(); scheduleSave(); break;
      case 'sig-clear': {
        delete cur.sigs[b.dataset.k];
        const c = form.querySelector(`canvas[data-sig="${b.dataset.k}"]`);
        c.getContext('2d').clearRect(0, 0, c.width, c.height); scheduleSave(); break;
      }
    }
  });
  function rerenderSurv() { const w = form.querySelector('.survwrap'); w.replaceWith(renderSurv()); }

  // repères sur le schéma corporel (position en fraction de l'image : u, v entre 0 et 1)
  form.addEventListener('pointerup', e => {
    const box = e.target.closest && e.target.closest('#bodyImg'); if (!box || !cur || cur.status !== 'draft' || paintMode()) return;
    const mk = e.target.closest('.mk');
    if (mk) { cur.marks.splice(+mk.dataset.i, 1); drawMarks(); scheduleSave(); return; }
    const r = box.getBoundingClientRect();
    const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
    if (u < 0 || u > 1 || v < 0 || v > 1) return;
    cur.marks.push({ u: Math.round(u * 1000) / 1000, v: Math.round(v * 1000) / 1000, t: curLesion });
    drawMarks(); scheduleSave();
  });

  $('#secNav').addEventListener('click', e => {
    const b = e.target.closest('[data-go]'); if (!b) return;
    const s = $('#sec_' + b.dataset.go);
    const y = s.getBoundingClientRect().top + window.scrollY - ($('#topwrap').offsetHeight + $('#secNav').offsetHeight + 8);
    window.scrollTo({ top: y, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });

  function autoAge() {
    const d = cur.data.dob; if (!d) return;
    const b = new Date(d), n = new Date();
    let a = n.getFullYear() - b.getFullYear();
    if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
    if (a >= 0 && a < 130) { cur.data.age = String(a); const i = $('#f_age'); if (i) i.value = a; }
  }

  function refreshDistress() {
    if (!cur) return;
    let any = false;
    for (const s of SCH.sections.filter(s => s.kind === 'abcde')) {
      const on = redKeysIn(s).some(k => cur.data[k]) ||
        Object.entries(RED_RADIO).some(([k, v]) => Object.values(s.cols).flat().some(it => it.k === k) && v.includes(cur.data[k]));
      const sec = $('#sec_' + s.id); if (sec) { sec.classList.toggle('distress', on); sec.querySelector('.dv-badge').hidden = !on; }
      const chip = $(`#secNav [data-go="${s.id}"]`); if (chip) chip.classList.toggle('distress', on);
      any = any || on;
    }
    $('#alertBar').hidden = !any;
  }

  function applyLock() {
    const locked = cur.status !== 'draft';
    $('#fs').disabled = locked;
    form.classList.toggle('locked', locked);
    $('#btnClose').textContent = locked ? 'Rouvrir la fiche' : 'Clôturer la fiche';
    $('#btnClose').classList.toggle('primary', !locked);
  }

  /* ------------------------------------------------------------------ */
  /* Navigation                                                          */
  /* ------------------------------------------------------------------ */
  const STATUS = { draft: ['Brouillon', 'st-draft'], closed: ['Clôturée', 'st-closed'], sent: ['Envoyée', 'st-sent'] };
  function show(view) {
    ['viewList', 'viewEdit', 'viewSettings'].forEach(v => $('#' + v).hidden = v !== view);
    $('#btnBack').hidden = view === 'viewList';
    $('#btnSettings').hidden = view === 'viewSettings';
    if (view !== 'viewEdit') { $('#alertBar').hidden = true; }
    window.scrollTo(0, 0);
  }
  function updateTitle() {
    if (!cur) return;
    $('#tbTitle').textContent = 'Fiche n° ' + (cur.data.num || '—');
    const st = STATUS[cur.status];
    const pending = outbox().includes(cur.id) ? ' · envoi en attente' : '';
    $('#tbSub').textContent = st[0] + pending + (cur.data.nom ? ' · ' + cur.data.nom : '');
  }
  function route() {
    const h = location.hash.slice(1);
    if (h.startsWith('f=')) {
      const f = loadFiche(h.slice(2));
      if (!f) { location.hash = ''; return; }
      cur = f; burnFor = null; f.surv = f.surv || []; f.marks = f.marks || []; f.sigs = f.sigs || {};
      show('viewEdit'); renderForm(); updateTitle();
    } else if (h === 'reglages') {
      flush(); cur = null; show('viewSettings'); renderSettings();
      $('#tbTitle').textContent = 'Réglages'; $('#tbSub').textContent = '';
    } else {
      flush(); cur = null; show('viewList'); renderList();
      $('#tbTitle').textContent = 'Fiches bilan'; $('#tbSub').textContent = settings.structure || '';
    }
  }
  function flush() { if (cur && saveTimer) { clearTimeout(saveTimer); persist(cur); } }
  window.addEventListener('hashchange', route);
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  $('#btnBack').onclick = () => { location.hash = ''; };
  $('#btnSettings').onclick = () => { location.hash = 'reglages'; };
  $('#btnNew').onclick = () => { const f = newFiche(); location.hash = 'f=' + f.id; };

  /* ---- liste ---- */
  function renderList() {
    const q = ($('#search').value || '').toLowerCase();
    const ob = outbox();
    const ul = $('#ficheList'); ul.innerHTML = '';
    const items = index().filter(m => !q || [m.num, m.nom, frDate(m.date), m.date].join(' ').toLowerCase().includes(q));
    items.forEach(m => {
      const st = STATUS[m.status] || STATUS.draft;
      ul.append(el('li', {}, el('a', { href: '#f=' + m.id, class: 'fcard' + (m.red ? ' red' : '') },
        el('span', { class: 'fc-num', text: 'N° ' + (m.num || '—') }),
        el('span', { class: 'fc-main' },
          el('strong', { text: m.nom || 'Victime non identifiée' }),
          el('small', { text: [frDate(m.date), m.heure].filter(Boolean).join(' · ') })),
        el('span', { class: 'fc-tags' },
          m.red ? el('span', { class: 'pill st-red', text: 'Détresse' }) : null,
          ob.includes(m.id) ? el('span', { class: 'pill st-wait', text: 'Envoi en attente' }) : null,
          el('span', { class: 'pill ' + st[1], text: st[0] })))));
    });
    $('#emptyList').hidden = index().length > 0;
    const info = $('#outboxInfo');
    info.hidden = !ob.length;
    if (ob.length) {
      info.innerHTML = '';
      info.append(el('span', { text: ob.length + ' fiche(s) en attente d\'envoi vers le logiciel externe.' }),
        el('button', { class: 'btn small', text: 'Réessayer maintenant', onclick: () => flushOutbox(true) }));
    }
  }
  $('#search').addEventListener('input', renderList);

  /* ------------------------------------------------------------------ */
  /* Actions fiche                                                       */
  /* ------------------------------------------------------------------ */
  $('#btnClose').onclick = async () => {
    if (cur.status === 'draft') {
      if (!(await confirmBox('Clôturer la fiche ? Elle passera en lecture seule (réouverture possible).', 'Clôturer'))) return;
      cur.status = 'closed'; cur.closedAt = new Date().toISOString();
      persist(cur); applyLock(); updateTitle(); toast('Fiche clôturée');
      if (settings.apiAuto && settings.apiUrl) sendFiche(cur);
    } else {
      if (!(await confirmBox('Rouvrir la fiche pour la modifier ?', 'Rouvrir'))) return;
      cur.status = 'draft'; persist(cur); applyLock(); updateTitle();
    }
  };
  $('#btnDelete').onclick = async () => {
    if (!(await confirmBox('Supprimer définitivement cette fiche de l\'appareil ?', 'Supprimer'))) return;
    removeFiche(cur.id); cur = null; location.hash = ''; toast('Fiche supprimée');
  };
  $('#btnJson').onclick = () => {
    flush();
    const blob = new Blob([JSON.stringify(buildPayload(cur), null, 2)], { type: 'application/json' });
    offerFile(blob, fileBase(cur) + '.json');
  };
  $('#btnPdf').onclick = async () => {
    flush();
    try { busy(true, 'Génération du PDF…'); const blob = await window.FB_REPORT.pdf(cur, settings); busy(false); offerFile(blob, fileBase(cur) + '.pdf'); }
    catch (err) { busy(false); console.error(err); toast('PDF non généré : ' + err.message, true); }
  };
  $('#btnSend').onclick = () => { flush(); if (!settings.apiUrl) { toast("Renseignez d'abord l'adresse de l'API dans les réglages.", true); return; } sendFiche(cur, true); };

  function fileBase(f) {
    const n = String(f.data.num || f.id).replace(/[^\w-]+/g, '_');
    return 'fiche-bilan-' + n + '-' + (f.data.date || todayISO());
  }

  /* ---- fichier : partager ou télécharger ---- */
  const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  function offerFileNative(blob, name) {
    const { Filesystem, Share } = window.Capacitor.Plugins;
    const box = $('#modal'); $('#modalText').textContent = name + ' est prêt.';
    const yes = $('#modalYes'), no = $('#modalNo');
    yes.className = 'btn primary'; yes.textContent = 'Enregistrer'; no.textContent = 'Partager…';
    box.hidden = false;
    const done = () => { box.hidden = true; yes.onclick = no.onclick = box.onclick = null; };
    yes.onclick = async () => {
      done();
      try {
        await Filesystem.writeFile({ path: 'FicheBilan/' + name, data: await blobToB64(blob), directory: 'DOCUMENTS', recursive: true });
        toast('Enregistré dans Documents/FicheBilan');
      } catch (e) { toast("Enregistrement impossible (" + (e.message || e) + "). Utilisez « Partager ».", true); }
    };
    no.onclick = async () => {
      done();
      try {
        const r = await Filesystem.writeFile({ path: name, data: await blobToB64(blob), directory: 'CACHE' });
        await Share.share({ title: name, files: [r.uri], dialogTitle: 'Partager la fiche' });
      } catch (e) { if (!/cancel/i.test(String(e.message || e))) toast('Partage impossible : ' + (e.message || e), true); }
    };
    box.onclick = e => { if (e.target === box) done(); };
  }
  function offerFile(blob, name) {
    if (NATIVE) return offerFileNative(blob, name);
    const file = new File([blob], name, { type: blob.type });
    const canShare = navigator.canShare && navigator.canShare({ files: [file] });
    const url = URL.createObjectURL(blob);
    const box = $('#modal'); $('#modalText').textContent = name + ' est prêt.';
    const yes = $('#modalYes'), no = $('#modalNo');
    yes.className = 'btn primary'; yes.textContent = 'Télécharger';
    no.textContent = canShare ? 'Partager…' : 'Ouvrir';
    box.hidden = false;
    const done = () => { box.hidden = true; yes.onclick = no.onclick = null; setTimeout(() => URL.revokeObjectURL(url), 60000); };
    yes.onclick = () => { const a = el('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove(); done(); };
    no.onclick = async () => {
      if (canShare) { try { await navigator.share({ files: [file], title: name }); } catch { } }
      else window.open(url, '_blank');
      done();
    };
    box.onclick = e => { if (e.target === box) done(); };
  }

  /* ------------------------------------------------------------------ */
  /* Export structuré / API                                              */
  /* ------------------------------------------------------------------ */
  function labelsOf(f) {
    // vue lisible : liste des éléments renseignés, section par section
    const out = [];
    const walk = (items, sec, col) => {
      for (const it of items) {
        if (it.items) { walk(it.items, sec, col); continue; }
        let v = null;
        if (it.t === 'chk') { if (f.data[it.k]) v = f.data[it.k + '_v'] ? f.data[it.k + '_v'] + (it.input && it.input.suf ? ' ' + it.input.suf : '') : true; }
        else if (it.t === 'pa') { if (f.data[it.k + '_s'] || f.data[it.k + '_d']) v = (f.data[it.k + '_s'] || '?') + '/' + (f.data[it.k + '_d'] || '?'); }
        else if (['field', 'text', 'radio', 'scale'].includes(it.t)) { if (f.data[it.k]) v = f.data[it.k] + (it.suf ? ' ' + it.suf : ''); }
        if (v != null && v !== '') out.push({ section: sec, colonne: col || null, cle: it.k, libelle: it.l || it.k, valeur: v, detresse: !!it.red });
      }
    };
    for (const s of SCH.sections) {
      if (s.kind === 'abcde') SCH.cols.forEach(([ck, t1]) => walk(s.cols[ck], s.letter + ' — ' + s.title, t1));
      else walk(s.items, s.title);
    }
    return out;
  }
  function buildPayload(f, pdfB64) {
    const p = {
      format: 'fiche-bilan-udps', format_version: 1, modele_fiche: SCH.version,
      structure: settings.structure || null,
      fiche: { id: f.id, numero: f.data.num, statut: f.status, cree_le: f.created, modifie_le: f.updated, cloture_le: f.closedAt || null,
        detresse_vitale: hasDistress(f) },
      donnees: f.data,
      surveillance: f.surv.filter(r => Object.values(r).some(Boolean)),
      lesions: f.marks.filter(m => m.u != null).map(m => ({ type: m.t, libelle: (SCH.lesions.find(l => l[0] === m.t) || [])[1], vue: m.u < 0.5 ? 'face' : 'dos', u: m.u, v: m.v })),
      brulure: f.burn ? burnPayload(f) : null,
      signatures: Object.keys(f.sigs),
      lisible: labelsOf(f),
    };
    if (pdfB64) p.pdf = { nom: fileBase(f) + '.pdf', type: 'application/pdf', base64: pdfB64 };
    return p;
  }
  function burnPayload(f) {
    const b = new Uint8Array(BZ.w * BZ.h), raw = atob(f.burn);
    for (let i = 0; i < b.length; i++) b[i] = (raw.charCodeAt(i >> 3) >> (i & 7)) & 1;
    const r = burnCalc(b);
    return { methode: 'règle des 9 de Wallace', surface_pct: Math.round(r.total * 10) / 10,
      detail: Object.fromEntries(r.regions.map(([l, v]) => [l, Math.round(v * 10) / 10])),
      grille: { largeur: BZ.w, hauteur: BZ.h, cellules_base64: f.burn } };
  }
  const blobToB64 = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(b); });

  async function postFiche(f) {
    let b64 = null;
    if (settings.apiPdf) b64 = await blobToB64(await window.FB_REPORT.pdf(f, settings));
    const headers = { 'Content-Type': 'application/json' };
    if (settings.apiToken) headers[settings.apiHeader || 'Authorization'] = settings.apiToken;
    const res = await fetch(settings.apiUrl, { method: settings.apiMethod || 'POST', headers, body: JSON.stringify(buildPayload(f, b64)) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
  }
  async function sendFiche(f, interactive) {
    const queue = () => { const o = outbox(); if (!o.includes(f.id)) { o.push(f.id); saveOutbox(o); } updateTitle(); };
    if (!navigator.onLine) { queue(); toast('Hors ligne : la fiche sera envoyée au retour du réseau.'); return; }
    try {
      if (interactive) busy(true, 'Envoi en cours…');
      await postFiche(f);
      f.status = f.status === 'draft' ? f.status : 'sent'; f.sentAt = new Date().toISOString(); persist(f);
      saveOutbox(outbox().filter(x => x !== f.id));
      if (cur && cur.id === f.id) { applyLock(); updateTitle(); }
      toast('Fiche envoyée');
    } catch (err) {
      queue(); toast("Envoi impossible (" + err.message + "). La fiche reste en file d'attente.", true);
    } finally { busy(false); }
  }
  let flushing = false;
  async function flushOutbox(interactive) {
    if (flushing || !navigator.onLine || !settings.apiUrl) return;
    flushing = true;
    let ok = 0, ko = 0;
    for (const id of outbox()) {
      const f = loadFiche(id); if (!f) { saveOutbox(outbox().filter(x => x !== id)); continue; }
      try { await postFiche(f); if (f.status !== 'draft') f.status = 'sent'; f.sentAt = new Date().toISOString(); persist(f); saveOutbox(outbox().filter(x => x !== id)); ok++; }
      catch { ko++; }
    }
    flushing = false;
    if (ok || interactive) toast(ok + ' fiche(s) envoyée(s)' + (ko ? ', ' + ko + ' en échec' : ''));
    if (!cur && !$('#viewList').hidden) renderList();
  }

  /* ------------------------------------------------------------------ */
  /* Réglages                                                            */
  /* ------------------------------------------------------------------ */
  function renderSettings() {
    const v = $('#viewSettings'); v.innerHTML = '';
    const inp = (k, l, o = {}) => {
      const i = el('input', { id: 's_' + k, type: o.type || 'text', placeholder: o.ph || '', inputmode: o.mode || null });
      i.value = settings[k] ?? '';
      i.oninput = () => { settings[k] = o.type === 'number' ? (parseInt(i.value, 10) || 1) : i.value; saveSettings(); };
      return el('label', { class: 'field w-' + (o.w || 'l'), for: 's_' + k }, el('span', { class: 'flbl', text: l }), i);
    };
    const tog = (k, l) => {
      const c = el('input', { type: 'checkbox', id: 's_' + k }); c.checked = !!settings[k];
      c.onchange = () => { settings[k] = c.checked; saveSettings(); };
      return el('label', { class: 'chk', for: 's_' + k }, c, el('span', { class: 'box' }), el('span', { class: 'lbl', text: l }));
    };
    let usage = 0; try { for (const k in localStorage) if (k.startsWith('fb.')) usage += (localStorage.getItem(k) || '').length; } catch { }

    v.append(
      el('section', { class: 'fsec kind-plain' }, el('header', { class: 'sec-head' }, el('h2', { text: 'Structure et valeurs par défaut' })),
        el('div', { class: 'sec-body' },
          el('p', { class: 'help', text: 'Ces valeurs pré-remplissent chaque nouvelle fiche.' }),
          inp('structure', 'Nom de la structure / unité', { w: 'full' }),
          el('div', { class: 'grp' }, el('div', { class: 'gitems' }, inp('respDps', 'Responsable DPS'), inp('vpsp', 'VPSP n°', { w: 's' }), inp('infirmerie', 'Infirmerie n°', { w: 's' }))),
          el('div', { class: 'grp' }, el('div', { class: 'gitems' }, inp('prefix', 'Préfixe de numérotation', { w: 's', ph: 'ex. 2026-' }), inp('nextNum', 'Prochain numéro', { w: 's', type: 'number', mode: 'numeric' }))))),
      el('section', { class: 'fsec kind-plain' }, el('header', { class: 'sec-head' }, el('h2', { text: 'Envoi vers un logiciel externe (API)' })),
        el('div', { class: 'sec-body' },
          el('p', { class: 'help', html: 'La fiche est envoyée en <b>JSON</b> (format décrit dans le README) vers l\'adresse ci-dessous. Pour Certiflow, e-brigade ou un autre logiciel, renseignez l\'URL et le jeton fournis par l\'éditeur ou par votre passerelle. Hors ligne, les envois sont mis en file d\'attente et partent automatiquement au retour du réseau.' }),
          inp('apiUrl', 'URL de réception (https://…)', { w: 'full', type: 'url', ph: 'https://exemple.fr/api/fiches' }),
          el('div', { class: 'grp' }, el('div', { class: 'gitems' },
            inp('apiMethod', 'Méthode', { w: 's' }), inp('apiHeader', "En-tête d'authentification", { w: 'm' }),
            inp('apiToken', 'Jeton / clé (ex. « Bearer abc… »)', { w: 'l', type: 'password' }))),
          el('div', { class: 'gitems' }, tog('apiPdf', 'Joindre le PDF (base64) dans l\'envoi'), tog('apiAuto', 'Envoyer automatiquement à la clôture')),
          el('div', { class: 'gitems' }, el('button', { class: 'btn', text: 'Tester la connexion', onclick: testApi })))),
      el('section', { class: 'fsec kind-plain' }, el('header', { class: 'sec-head' }, el('h2', { text: 'Données de l\'appareil' })),
        el('div', { class: 'sec-body' },
          el('p', { class: 'help', text: index().length + ' fiche(s) stockée(s) sur cet appareil · ' + Math.round(usage / 1024) + ' Ko utilisés. Les données de santé restent sur l\'appareil tant qu\'elles ne sont pas exportées ou envoyées : supprimez les fiches transmises et verrouillez la tablette.' }),
          el('div', { class: 'gitems' },
            el('button', { class: 'btn', text: 'Sauvegarder toutes les fiches (JSON)', onclick: backupAll }),
            el('label', { class: 'btn', for: 'importFile' }, 'Restaurer une sauvegarde'),
            el('input', { type: 'file', id: 'importFile', accept: 'application/json,.json', hidden: true, onchange: importBackup }),
            el('button', { class: 'btn danger ghost', text: 'Supprimer les fiches envoyées', onclick: purgeSent })),
          el('p', { class: 'help small', text: 'Modèle de fiche : ' + SCH.version + ' · application v1.2.0' }))),
    );
  }
  async function testApi() {
    if (!settings.apiUrl) { toast('Renseignez une URL.', true); return; }
    try {
      busy(true, 'Test de connexion…');
      const headers = { 'Content-Type': 'application/json' };
      if (settings.apiToken) headers[settings.apiHeader || 'Authorization'] = settings.apiToken;
      const r = await fetch(settings.apiUrl, { method: settings.apiMethod || 'POST', headers, body: JSON.stringify({ format: 'fiche-bilan-udps', test: true }) });
      toast(r.ok ? 'Connexion réussie (HTTP ' + r.status + ')' : 'Le serveur répond HTTP ' + r.status, !r.ok);
    } catch (e) { toast('Connexion impossible : serveur injoignable ou CORS non autorisé.', true); }
    finally { busy(false); }
  }
  function backupAll() {
    const all = index().map(m => loadFiche(m.id)).filter(Boolean);
    offerFile(new Blob([JSON.stringify({ format: 'fiche-bilan-udps-backup', date: new Date().toISOString(), fiches: all })], { type: 'application/json' }),
      'sauvegarde-fiches-bilan-' + todayISO() + '.json');
  }
  function importBackup(e) {
    const file = e.target.files[0]; if (!file) return;
    file.text().then(t => {
      const j = JSON.parse(t); const list = j.fiches || (j.fiche ? [] : []);
      let n = 0; list.forEach(f => { if (f && f.id && f.data) { persist(f); n++; } });
      toast(n + ' fiche(s) restaurée(s)'); renderSettings();
    }).catch(() => toast('Fichier de sauvegarde illisible.', true));
  }
  async function purgeSent() {
    const sent = index().filter(m => m.status === 'sent');
    if (!sent.length) { toast('Aucune fiche envoyée à supprimer.'); return; }
    if (!(await confirmBox('Supprimer ' + sent.length + ' fiche(s) déjà envoyée(s) ?', 'Supprimer'))) return;
    sent.forEach(m => removeFiche(m.id)); toast('Fiches supprimées'); renderSettings();
  }

  /* ------------------------------------------------------------------ */
  /* UI utilitaires                                                      */
  /* ------------------------------------------------------------------ */
  let toastT;
  function toast(msg, err) {
    const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, err ? 5000 : 2600);
  }
  function busy(on, txt) { $('#busy').hidden = !on; if (txt) $('#busyText').textContent = txt; }
  function confirmBox(text, yesLabel) {
    return new Promise(res => {
      const box = $('#modal'); $('#modalText').textContent = text;
      const yes = $('#modalYes'), no = $('#modalNo');
      yes.className = 'btn danger'; yes.textContent = yesLabel || 'Confirmer'; no.textContent = 'Annuler';
      box.hidden = false;
      const close = v => { box.hidden = true; yes.onclick = no.onclick = box.onclick = null; res(v); };
      yes.onclick = () => close(true); no.onclick = () => close(false);
      box.onclick = e => { if (e.target === box) close(false); };
    });
  }
  function netState() {
    const n = $('#netState'); const on = navigator.onLine;
    n.textContent = on ? 'En ligne' : 'Hors ligne'; n.className = 'net ' + (on ? 'on' : 'off');
  }
  window.addEventListener('online', () => { netState(); flushOutbox(); });
  window.addEventListener('offline', netState);

  // persistance renforcée (évite l'effacement automatique par le navigateur)
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !NATIVE) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW', err));
  }

  // hauteur de l'en-tête (barre + alerte) pour caler la navigation des sections
  const topH = () => document.documentElement.style.setProperty('--toph', $('#topwrap').offsetHeight + 'px');
  if (window.ResizeObserver) new ResizeObserver(topH).observe($('#topwrap')); else window.addEventListener('resize', topH);
  topH();
  netState();
  route();
  flushOutbox();
})();
