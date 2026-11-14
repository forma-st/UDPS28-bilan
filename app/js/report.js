/* =====================================================================
   Export PDF : remplit la fiche ANPS d'origine (A3 paysage, version
   ANPS/GD/Avril_2024-n°6, logo compris) avec les données saisies.
   Les cases sont cochées et les valeurs écrites à leurs positions exactes
   (table js/template-map.js, extraite du PDF d'origine).
   Fonctionne hors ligne : pdf-lib et le PDF modèle sont embarqués.
   ===================================================================== */
(function () {
  'use strict';
  const M = window.FB_TEMPLATE_MAP;
  const SCH = window.FB_SCHEMA;
  const H = 841.92;                     // hauteur de la page A3 paysage (pt)
  const TEMPLATE_URL = 'assets/fiche-anps-2024.pdf';
  let tplBytes = null;

  async function template() {
    if (!tplBytes) {
      const r = await fetch(TEMPLATE_URL);
      if (!r.ok) throw new Error('modèle de fiche introuvable');
      tplBytes = await r.arrayBuffer();
    }
    return tplBytes;
  }

  const frDate = iso => iso ? iso.split('-').reverse().join('/') : '';
  const hm = t => t ? String(t).replace(':', ' h ') : '';

  async function pdf(fiche, settings) {
    if (!window.PDFLib) throw new Error('bibliothèque PDF absente');
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const D = fiche.data;
    const doc = await PDFDocument.load(await template());
    const page = doc.getPage(0);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const INK = rgb(0.03, 0.15, 0.55), WHITE = rgb(1, 1, 1), RED = rgb(0.78, 0.06, 0.18);
    const annex = [];                    // textes trop longs → page annexe

    /* ---- texte : caractères hors WinAnsi remplacés ---- */
    const okCache = {};
    const SUBST = { '₂': '2', '₀': '0', '₁': '1', '₃': '3', '½': '1/2', '≥': '>=', '≤': '<=', '→': '->', '\t': ' ' };
    const clean = (s, f = font) => Array.from(String(s ?? '')).map(c => {
      if (SUBST[c]) return SUBST[c];
      if (okCache[c] === undefined) { try { f.widthOfTextAtSize(c, 8); okCache[c] = true; } catch { okCache[c] = false; } }
      return okCache[c] ? c : '?';
    }).join('');
    const W = (s, size, f = font) => f.widthOfTextAtSize(s, size);
    const base = top => H - (top + 6.0);           // ligne de base : juste au-dessus des pointillés de la fiche
    // couleur du fond de la fiche sous un champ (pour masquer proprement les pointillés)
    const G1 = rgb(231 / 255, 230 / 255, 230 / 255), G2 = rgb(217 / 255, 217 / 255, 217 / 255);
    function bgAt(x, top) {
      if (x < 600 && top > 105 && top < 235) return G1;
      if (top > 290 && top < 815 && x >= 370 && x < 482) return G1;
      if (top > 290 && top < 815 && x >= 482 && x < 600) return G2;
      if ((x > 838 && x < 1175 && top > 696 && top < 730) || (x > 840 && x < 990 && top > 55 && top < 255)) return G2;
      return WHITE;
    }

    function white(x, top, w, h = 10) { page.drawRectangle({ x, y: H - top - h + 0.5, width: w, height: h, color: bgAt(x + 2, top) }); }
    // écrit sur une ligne, en réduisant la taille si besoin ; retourne false si tronqué
    function line(str, x, top, maxW, o = {}) {
      let s = clean(String(str).replace(/\s*\n\s*/g, ' ')), size = o.size || 8.5;
      const f = o.bold ? bold : font, min = o.min || 5.6;
      if (!s) return true;
      while (size > min && W(s, size, f) > maxW) size -= 0.25;
      let full = true;
      if (W(s, size, f) > maxW) { full = false; while (s.length > 1 && W(s + '…', size, f) > maxW) s = s.slice(0, -1); s += '…'; }
      let px = x;
      if (o.align === 'center') px = x + (maxW - W(s, size, f)) / 2;
      if (o.align === 'right') px = x + maxW - W(s, size, f);
      page.drawText(s, { x: px, y: o.y != null ? o.y : base(top), size, font: f, color: o.color || INK });
      return full;
    }
    function wrap(str, maxW, size) {
      const out = [];
      for (const para of clean(str).split(/\n/)) {
        let cur = '';
        for (const w of para.split(/\s+/)) {
          const t = cur ? cur + ' ' + w : w;
          if (W(t, size) <= maxW) cur = t;
          else { if (cur) out.push(cur); cur = w; while (W(cur, size) > maxW && cur.length > 1) { let k = cur.length; while (k > 1 && W(cur.slice(0, k), size) > maxW) k--; out.push(cur.slice(0, k)); cur = cur.slice(k); } }
        }
        out.push(cur);
      }
      return out;
    }
    // zone multi-lignes ; ce qui ne tient pas part en annexe
    function area(label, str, x, top, w, bottom, size = 7.5, lh = 9) {
      if (!str) return;
      const lines = wrap(str, w, size), max = Math.max(1, Math.floor((bottom - top) / lh) + 1);
      const shown = lines.slice(0, max), more = lines.length > max;
      if (more) {
        const tag = ' (suite en annexe)'; let last = shown[max - 1];
        while (last.length > 1 && W(last + ' …', size) + W(tag, size - 1) > w) last = last.slice(0, -1);
        shown[max - 1] = last + ' …';
        page.drawText(tag, { x: x + W(shown[max - 1], size), y: H - top - size - (max - 1) * lh, size: size - 1, font, color: RED });
        annex.push([label, str]);
      }
      shown.forEach((l, i) => page.drawText(l, { x, y: H - top - size - i * lh, size, font, color: INK }));
    }
    function cross(cx, top) {
      const cy = H - (top + 5.15), r = 2.3, o = { thickness: 1.25, color: INK };
      page.drawLine({ start: { x: cx - r, y: cy - r }, end: { x: cx + r, y: cy + r }, ...o });
      page.drawLine({ start: { x: cx - r, y: cy + r }, end: { x: cx + r, y: cy - r }, ...o });
    }
    const T = k => M.texts[k];
    const put = (k, v, o = {}) => {
      const t = T(k); if (!t || v == null || v === '') return;
      const maxW = Math.max(o.minW || 0, t[2] - t[0] + (o.extra != null ? o.extra : 6));
      if (o.white) white(t[0] - 1, t[1], maxW + 2);
      if (!line(v, t[0], t[1], maxW, o)) annex.push([o.label || k, v]);
    };

    /* ---- cases à cocher ---- */
    for (const [key, cx, top] of M.boxes) {
      let on;
      if (key.includes('=')) { const [k, v] = key.split('='); on = D[k] === v; }
      else if (key.endsWith('?')) { const k = key.slice(0, -1); on = !!(D[k] || D[k + '_s'] || D[k + '_d']); }
      else on = !!D[key];
      if (on) cross(cx, top);
    }

    /* ---- en-tête ---- */
    const num = T('num'); if (D.num) { white(num[0], num[1] + 2, 40, 14); line(D.num, num[0] + 1, 0, 70, { size: 14, bold: true, y: H - num[1] - 13.5 }); }
    put('date', frDate(D.date), { white: true, extra: 50, size: 9 });
    put('respDps', D.respDps); put('vpsp', D.vpsp); put('infirmerie', D.infirmerie, { extra: 8 });
    put('adresse', D.adresse, { extra: 0 });
    put('heurePec', hm(D.heurePec), { white: true, extra: 20 });
    boxesDigits(D.cpPec, [278.7, 291.0, 303.4, 315.8, 328.2], 65.8);
    function boxesDigits(v, xs, top) {
      String(v || '').replace(/\s/g, '').slice(0, 5).split('').forEach((d, i) =>
        line(d, xs[i], 0, 11.2, { align: 'center', size: 8.5, y: H - top - 9.3 }));
    }

    /* ---- 1er regard ---- */
    put('lieu_autre_v', D.lieu_autre_v); put('victNum', D.victNum, { extra: 14 });
    if (D.nature) {
      const t = T('nature'), size = 8;
      const words = wrap(D.nature, 10000, size).join(' ');
      const l1 = wrap(words, t[2] - t[0], size);
      const first = l1.shift() || '';
      const rest = wrap(l1.join(' '), 547, size);
      page.drawText(first, { x: t[0], y: base(t[1]), size, font, color: INK });
      [149.1, 161.8].forEach((top, i) => { if (rest[i]) page.drawText(rest[i], { x: 38, y: base(top), size, font, color: INK }); });
      if (rest.length > 2) annex.push(["Nature de l'intervention", D.nature]);
    }
    put('brul_chim_v', D.brul_chim_v); put('chute_m_v', D.chute_m_v); put('sr_cinetique', D.sr_cinetique); put('sr_contre_v', D.sr_contre_v);

    /* ---- bilan X A B C D ---- */
    put('x_loc', D.x_loc, { extra: 20 }); put('x_garrot_v', hm(D.x_garrot_v), { extra: 0 });
    put('b_fr', D.b_fr); put('b_sat_aa', D.b_sat_aa); put('b_sat_o2', D.b_sat_o2); put('b_debit', D.b_debit);
    put('b_inhal_v', D.b_inhal_v, { white: true, extra: 0, minW: 16 }); put('b_lunette_v', D.b_lunette_v, { white: true, extra: 0, minW: 16 });
    put('c_fc', D.c_fc); put('c_debit', D.c_debit);
    ['c_pag', 'c_pad'].forEach(k => { if (D[k + '_s'] || D[k + '_d']) put(k, (D[k + '_s'] || '') + ' / ' + (D[k + '_d'] || ''), { white: true, extra: 0 }); });
    put('c_dsa_v', hm(D.c_dsa_v), { extra: 0 }); put('c_chocs', D.c_chocs, { extra: 20 }); put('c_arret', hm(D.c_arret), { extra: 0 }); put('c_noflow', D.c_noflow, { extra: 0 });
    put('d_pc_v', D.d_pc_v, { white: true, extra: 0 }); put('d_fast_t_v', hm(D.d_fast_t_v), { white: true, extra: 0, minW: 30 });
    put('d_gly', D.d_gly); put('d_resuc_dose', D.d_resuc_dose); put('d_resuc_h', hm(D.d_resuc_h), { white: true, extra: 20 }); put('d_resuc_gly', D.d_resuc_gly);

    /* ---- suite bilan ---- */
    area('Plaintes', D.pl_text, 632, 69, 200, 78, 7, 8);
    put('pl_provoque', D.pl_provoque); put('pl_autre_v', D.pl_autre_v); put('pl_region', D.pl_region, { extra: 0 });
    area('Commentaires libres', D.com, 845, 61, 140, 238);
    put('meteo', D.meteo, { extra: 10 }); put('tempExt', D.tempExt);
    area('Maladie', D.at_maladie, 1012, 90, 166, 128);
    area('Hospitalisation', D.at_hospit, 1012, 155, 166, 175);
    area('Traitement', D.at_trait, 1012, 204, 166, 230);
    area('Allergie', D.at_allergie, 1012, 260, 166, 280);
    area('Facteur(s) de risque', D.at_risque, 1012, 309, 166, 325);
    put('pl_temps', D.pl_temps, { extra: 25 }); put('temp', D.temp); put('repas', D.repas); put('poids', D.poids); put('taille', D.taille);
    // sévérité : case entourée
    if (D.pl_sev !== '' && D.pl_sev != null) {
      const i = +D.pl_sev, cx = [714.5, 741.6, 768.75, 795.6, 822.75, 849.85, 877, 904.1, 931.3, 958.4, 985.75][i];
      if (cx) page.drawRectangle({ x: cx - 9.5, y: H - 319.9 - 12, width: 19, height: 13, borderColor: INK, borderWidth: 2.2 });
    }
    // lésions sur les silhouettes d'origine (image 625.8,150 → 756.4,314.4)
    for (const m of fiche.marks || []) {
      if (m.u == null) continue;
      const cx = 625.8 + m.u * 130.6, cy = H - (150 + m.v * 164.4);
      const col = hexRgb((SCH.lesions.find(l => l[0] === m.t) || [, , '#000'])[2]);
      const r = m.t.length > 1 ? 5.2 : 4.2;
      page.drawCircle({ x: cx, y: cy, size: r, color: col, borderColor: WHITE, borderWidth: 0.6 });
      const s = m.t.length > 2 ? 3.2 : m.t.length > 1 ? 4 : 5.2;
      page.drawText(m.t, { x: cx - W(m.t, s, bold) / 2, y: cy - s * 0.36, size: s, font: bold, color: WHITE });
    }
    function hexRgb(h) { const n = parseInt(h.slice(1), 16); return rgb((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); }

    /* ---- gestes complémentaires ---- */
    put('gc_autre', D.gc_autre);

    /* ---- surveillance : 3 lignes sur la fiche, le reste en annexe ---- */
    const rows = (fiche.surv || []).filter(r => Object.values(r).some(Boolean));
    const ROWS = [466.1, 480.8, 495.4], AVPU = { A: 1112.2, V: 1125.5, P: 1138.5, U: 1151.85 };
    rows.slice(0, 3).forEach((r, i) => {
      const top = ROWS[i];
      if (r.h) { const [h, m] = r.h.split(':'); line(h, 623, top, 12, { align: 'right' }); line(m || '', 641, top, 14); }
      [['fr', 668, 32], ['sat', 700, 32], ['o2', 732, 51], ['fc', 783, 23], ['pa', 806, 149], ['t', 955, 43], ['gly', 1030, 70]]
        .forEach(([k, x, w]) => r[k] && line(r[k], x, top, w, { align: 'center' }));
      if (r.en) line(r.en, 998, top, 10.5, { align: 'right' });
      if (AVPU[r.avpu]) page.drawEllipse({ x: AVPU[r.avpu], y: H - (top - 1.6 + 5.4), xScale: 5, yScale: 5, borderColor: INK, borderWidth: 1.2 });
    });
    const extraRows = rows.slice(3);

    /* ---- état civil ---- */
    put('nom', D.nom); put('dob', frDate(D.dob), { white: true, extra: 50 }); put('age', D.age, { extra: 2 });
    put('adr', D.adr); boxesDigits(D.cp, [921.6, 934.3, 947.2, 960.1, 973.2], 554.5); put('commune', D.commune);
    put('prevenir', D.prevenir); put('tel', D.tel); put('effets', D.effets);

    /* ---- prise en charge et devenir ---- */
    ['pc_med_v', 'pc_inf_v', 'pc_autre_v', 'ls_fdo_v', 'ls_autre_v', 'ev_amb_v', 'ev_sp_v', 'ev_smur_v', 'ev_vpsp_v', 'ev_autre_v'].forEach(k => put(k, D[k], { extra: 2 }));
    put('destination', D.destination); put('mat_laisse', D.mat_laisse, { size: 7.5, extra: 0 }); put('mat_qui', D.mat_qui, { size: 7.5, extra: 0 });

    /* ---- suivi évacuation ---- */
    line(D.se_resp || '', 626, 773, 170); line(D.se_rec || '', 806, 773, 170);
    put('se_heure', hm(D.se_heure), { white: true, extra: 25 });
    line(D.se_ioa || '', 985, 789, 100, { size: 8 });

    /* ---- signatures ---- */
    const SIG = { sig_resp: [626, 783, 170, 31], sig_rec: [806, 783, 170, 31], sig_ioa: [1088, 787, 90, 28], sig_mat: [1090, 709, 82, 22] };
    for (const [k, [x, top, w, h]] of Object.entries(SIG)) {
      const d = fiche.sigs && fiche.sigs[k]; if (!d) continue;
      const img = d.startsWith('data:image/png') ? await doc.embedPng(d) : await doc.embedJpg(d);
      const sc = Math.min(w / img.width, h / img.height);
      page.drawImage(img, { x: x + (w - img.width * sc) / 2, y: H - top - h + (h - img.height * sc) / 2, width: img.width * sc, height: img.height * sc });
    }

    /* ---- annexe : textes longs et mesures de surveillance supplémentaires ---- */
    if (annex.length || extraRows.length) {
      const p2 = doc.addPage([595.28, 841.89]); let y = 800;
      const L = (s, o = {}) => {
        for (const l of (o.nowrap ? [clean(s)] : wrap(s, 515, o.size || 9.5))) {
          if (y < 50) { y = 800; doc.addPage([595.28, 841.89]); }
          doc.getPages()[doc.getPageCount() - 1].drawText(l, { x: 40, y, size: o.size || 9.5, font: o.bold ? bold : font, color: o.color || rgb(0.1, 0.1, 0.1) });
          y -= (o.size || 9.5) + 4;
        }
      };
      L('FICHE BILAN UDPS N° ' + (D.num || '') + ' du ' + frDate(D.date) + ' — annexe', { bold: true, size: 13 }); y -= 6;
      if (D.nom) L('Victime : ' + D.nom);
      y -= 6;
      for (const [lab, v] of annex) { L(lab, { bold: true }); L(v); y -= 6; }
      if (extraRows.length) {
        L('Surveillance (suite)', { bold: true });
        L('Heure    FR    SpO2    Débit O2    FC    PA    T°    EN    Glycémie    Conscience', { size: 8.5, color: rgb(0.35, 0.35, 0.35) });
        for (const r of extraRows) L([r.h, r.fr, r.sat, r.o2, r.fc, r.pa, r.t, r.en && r.en + '/10', r.gly, r.avpu].map(v => v || '—').join('    '));
      }
      void p2;
    }

    doc.setTitle('Fiche bilan UDPS n° ' + (D.num || ''));
    doc.setCreator('Fiche Bilan UDPS');
    doc.setProducer('Fiche Bilan UDPS (modèle ANPS/GD/Avril_2024-n°6)');
    const bytes = await doc.save();
    return new Blob([bytes], { type: 'application/pdf' });
  }

  window.FB_REPORT = { pdf };
})();
