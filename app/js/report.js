/* =====================================================================
   Génération du PDF : reconstruit une fiche A4 (2 pages, mise en page
   proche de la fiche papier) puis la convertit en PDF (html2canvas+jsPDF).
   Fonctionne hors ligne : les deux bibliothèques sont embarquées.
   ===================================================================== */
(function () {
  'use strict';
  const SCH = window.FB_SCHEMA;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const frDate = iso => iso ? iso.split('-').reverse().join('/') : '';
  let F, D;   // fiche, données

  const box = (on, red) => `<span class="rb${on ? ' on' : ''}${red ? ' red' : ''}">${on ? 'X' : ''}</span>`;
  const val = (v, w) => `<span class="rv" style="min-width:${w || 40}px">${esc(v)}</span>`;

  function item(it) {
    switch (it.t) {
      case 'chk': {
        let s = `<span class="ri${it.red ? ' redt' : ''}">${box(D[it.k], it.red)}${esc(it.l)}`;
        if (it.input) s += ' ' + val(D[it.k + '_v'] ? D[it.k + '_v'] + (it.input.suf ? ' ' + it.input.suf : '') : '', 30);
        return s + '</span>';
      }
      case 'field': {
        const v = it.type === 'date' ? frDate(D[it.k]) : D[it.k];
        return `<span class="ri">${esc(it.l)} : ${val(v ? v + (it.suf ? ' ' + it.suf : '') : '', it.w === 'full' ? 300 : it.w === 'l' ? 140 : 46)}</span>`;
      }
      case 'pa': return `<span class="ri">${esc(it.l)} : ${val((D[it.k + '_s'] || '') + ' / ' + (D[it.k + '_d'] || ''), 50)}</span>`;
      case 'radio': return `<span class="ri">${it.l ? esc(it.l) + ' : ' : ''}${it.opts.map(([v, l, red]) => `<span class="ri${red ? ' redt' : ''}">${box(D[it.k] === v, red)}${esc(l)}</span>`).join('')}</span>`;
      case 'text': return `<div class="rt"><b>${esc(it.l)} :</b> ${esc(D[it.k] || '').replace(/\n/g, '<br>')}</div>`;
      case 'group': return `<div class="rg">${it.l ? `<b class="rgl">${esc(it.l)} :</b>` : ''}${it.items.map(item).join('')}</div>`;
      case 'sub': return `<div class="rsub">${esc(it.l)}</div>`;
      case 'scale': {
        let s = '<div class="rg"><b class="rgl">Sévérité :</b><span class="scl">';
        for (let i = 0; i <= 10; i++) s += `<span class="sc s${i}${D[it.k] === String(i) ? ' on' : ''}">${i}</span>`;
        return s + '</span></div>';
      }
      case 'bodymap': {
        const legend = SCH.lesions.map(([c, l, col]) => `<span class="lg"><b style="color:${col}">${c}</b> ${esc(l)}</span>`).join('');
        return `<div class="rbody"><img src="${bodyPng}" alt=""><div class="lgd"><b>Type de lésion</b>${legend}</div></div>`;
      }
      case 'sig': return `<div class="rsig"><span>${esc(it.l)}</span>${F.sigs[it.k] ? `<img src="${F.sigs[it.k]}" alt="">` : '<div class="blank"></div>'}</div>`;
      case 'sigrow': return `<div class="rsigrow">${it.items.map(col => `<div>${col.map(item).join('')}</div>`).join('')}</div>`;
      case 'panel': return `<div class="rpanel tone-${it.tone}"><div class="rph">${esc(it.l)}</div>${it.items.map(item).join('')}</div>`;
      case 'surv': {
        const cols = ['Heure', 'FR', 'SpO₂', 'Débit O₂', 'FC', 'P.A', 'T°', 'EN', 'Glycémie', 'Conscience'];
        const keys = ['h', 'fr', 'sat', 'o2', 'fc', 'pa', 't', 'en', 'gly'];
        const rows = F.surv.length ? F.surv : [{}, {}, {}];
        return `<table class="rsurv"><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr>` +
          rows.map(r => `<tr>${keys.map(k => `<td>${esc(r[k] || '')}${k === 'en' && r[k] ? ' /10' : ''}</td>`).join('')}<td>${['A', 'V', 'P', 'U'].map(v => `<span class="av${r.avpu === v ? ' on' : ''}">${v}</span>`).join(' ')}</td></tr>`).join('') + '</table>';
      }
    }
    return '';
  }

  const sec = id => SCH.sections.find(s => s.id === id);
  const band = t => `<div class="rband">${esc(t)}</div>`;

  function page1(settings) {
    const h = sec('entete'), r1 = sec('regard1');
    let s = `<div class="rhead"><div class="org">${esc(settings.structure || '')}</div>
      <div class="rtitle">FICHE BILAN UDPS N° <u>${esc(D.num || '')}</u></div><div class="rdate">DATE : ${esc(frDate(D.date))}</div></div>`;
    s += `<div class="rbox">${h.items.map(item).join('')}</div>`;
    s += band('1er REGARD - SITUATION GLOBALE') + `<div class="rbox grey">${r1.items.map(item).join('')}</div>`;
    s += band('- BILAN -');
    s += `<table class="rabc"><tr><th></th>${SCH.cols.map(([, a, b]) => `<th><b>${esc(a)}</b><br><span>${esc(b)}</span></th>`).join('')}</tr>`;
    for (const x of SCH.sections.filter(x => x.kind === 'abcde')) {
      s += `<tr class="row-${x.color}"><td class="lt"><div class="ltb col-${x.color}"><b>${x.letter}</b><span>${esc(x.title)}</span><small>${esc(x.en)}</small></div></td>` +
        SCH.cols.map(([ck]) => `<td class="c-${ck}">${x.cols[ck].map(item).join('')}</td>`).join('') + '</tr>';
    }
    return s + '</table>' + `<div class="rfoot">Fiche n° ${esc(D.num || '')} · page 1/2 · modèle ${SCH.version}</div>`;
  }
  function page2() {
    const su = sec('suite');
    let s = band('- SUITE BILAN -');
    const [pl, an, co, last] = su.items;
    s += `<div class="rsuite"><div>${item(pl)}</div><div>${item(co)}${item(an)}</div></div><div class="rbox">${item(last)}</div>`;
    for (const id of ['gestes', 'surveillance', 'etatcivil', 'devenir', 'evac']) {
      const x = sec(id);
      s += band(x.title.toUpperCase() + (x.note ? ' (' + x.note.toLowerCase() + ')' : '')) + `<div class="rbox">${x.items.map(item).join('')}</div>`;
    }
    return s + `<div class="rfoot">Fiche n° ${esc(D.num || '')} · page 2/2 · générée le ${new Date().toLocaleString('fr-FR')}</div>`;
  }

  /* ---- schéma corporel en image ---- */
  let bodyPng = '';
  function bodySvg() {
    const fig = (v, ox) => {
      const marks = F.marks.filter(m => m.v === v).map(m => {
        const col = (SCH.lesions.find(l => l[0] === m.t) || [, , '#000'])[2];
        return `<circle cx="${m.x}" cy="${m.y}" r="${m.t.length > 1 ? 6.5 : 5}" fill="${col}" stroke="#fff"/><text x="${m.x}" y="${m.y + 2.2}" text-anchor="middle" font-family="Arial" font-size="${m.t.length > 2 ? 4.2 : 5.8}" font-weight="700" fill="#fff">${m.t}</text>`;
      }).join('');
      return `<g transform="translate(${ox},0)"><g fill="#f4f6fa" stroke="#6b7280" stroke-width="1.2">
        <ellipse cx="50" cy="16" rx="10.5" ry="12.5"/><rect x="45" y="27" width="10" height="8" rx="2"/>
        <path d="M31,35 L69,35 Q77,37 77,46 L72,98 Q71,110 66,118 L34,118 Q29,110 28,98 L23,46 Q23,37 31,35 Z"/>
        <path d="M24,40 Q16,44 15,58 L10,104 Q9,112 11,118 L17,118 Q19,112 19,104 L27,66 Z"/>
        <path d="M76,40 Q84,44 85,58 L90,104 Q91,112 89,118 L83,118 Q81,112 81,104 L73,66 Z"/>
        <ellipse cx="13.5" cy="123" rx="4.5" ry="6"/><ellipse cx="86.5" cy="123" rx="4.5" ry="6"/>
        <path d="M34,116 L49,116 L48,198 Q48,205 44,206 L37,206 Q35,203 36,196 Z"/>
        <path d="M66,116 L51,116 L52,198 Q52,205 56,206 L63,206 Q65,203 64,196 Z"/></g>
        <text x="50" y="213" text-anchor="middle" font-family="Arial" font-size="7" fill="#374151">${v === 'f' ? 'Face' : 'Dos'}</text>
        <text x="3" y="10" font-family="Arial" font-size="7" fill="#6b7280">${v === 'f' ? 'D' : 'G'}</text>
        <text x="97" y="10" text-anchor="end" font-family="Arial" font-size="7" fill="#6b7280">${v === 'f' ? 'G' : 'D'}</text>${marks}</g>`;
    };
    return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="440" viewBox="0 0 205 216"><rect width="205" height="216" fill="#fff"/>${fig('f', 0)}${fig('b', 105)}</svg>`;
  }
  function rasterBody() {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => { const c = document.createElement('canvas'); c.width = 420; c.height = 440; c.getContext('2d').drawImage(img, 0, 0); res(c.toDataURL('image/png')); };
      img.onerror = () => res('');
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(bodySvg());
    });
  }

  const W = 794, H = 1123;   // A4 à 96 dpi
  async function pdf(fiche, settings) {
    if (!window.jspdf || !window.html2canvas) throw new Error('bibliothèques PDF absentes');
    F = fiche; D = fiche.data;
    bodyPng = await rasterBody();
    const host = document.getElementById('reportHost');
    host.innerHTML = `<div class="rpage">${page1(settings)}</div><div class="rpage">${page2()}</div>`;
    await Promise.all([...host.querySelectorAll('img')].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const pages = [...host.querySelectorAll('.rpage')];
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      const canvas = await window.html2canvas(p, { scale: 2, backgroundColor: '#ffffff', width: W, windowWidth: W, logging: false });
      const img = canvas.toDataURL('image/jpeg', 0.88);
      // si le contenu dépasse la page (textes longs), on réduit pour tenir sur l'A4
      const ratio = Math.min(1, (H / W) / (canvas.height / canvas.width));
      const wmm = 210 * ratio, hmm = wmm * canvas.height / canvas.width;
      if (i) doc.addPage();
      doc.addImage(img, 'JPEG', (210 - wmm) / 2, 0, wmm, hmm);
    }
    doc.setProperties({ title: 'Fiche bilan UDPS n° ' + (D.num || ''), creator: 'Fiche Bilan UDPS' });
    host.innerHTML = '';
    return doc.output('blob');
  }

  window.FB_REPORT = { pdf };
})();
