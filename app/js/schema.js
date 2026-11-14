/* =====================================================================
   Schéma de la fiche bilan UDPS (reprend la fiche papier ANPS avril 2024).
   Chaque champ a une clé stable : c'est cette clé qui sort dans l'export
   JSON / API. Ne pas renommer une clé déjà utilisée en production.
   ===================================================================== */
(function () {
  // ---- constructeurs ----
  const C = (k, l, o = {}) => ({ t: 'chk', k, l, ...o });                       // case à cocher
  const CI = (k, l, type = 'text', o = {}) => ({ t: 'chk', k, l, input: { type, ...o } }); // case + saisie (clé k_v)
  const F = (k, l, type = 'text', o = {}) => ({ t: 'field', k, l, type, ...o });  // champ
  const R = (k, l, opts, o = {}) => ({ t: 'radio', k, l, opts, ...o });           // choix unique
  const T = (k, l, o = {}) => ({ t: 'text', k, l, ...o });                         // zone de texte
  const G = (l, items, o = {}) => ({ t: 'group', l, items, ...o });               // ligne libellée
  const PA = (k, l) => ({ t: 'pa', k, l });                                        // tension sys/dia
  const SIG = (k, l) => ({ t: 'sig', k, l });                                      // signature

  const S = [];

  S.push({
    id: 'entete', nav: 'En-tête', title: 'Fiche bilan UDPS', kind: 'plain', items: [
      G(null, [
        F('num', 'Fiche n°', 'text', { w: 's' }),
        F('date', 'Date', 'date', { w: 'm' }),
        F('heurePec', 'Heure de prise en charge', 'time', { w: 's', now: true }),
      ]),
      G(null, [
        F('respDps', 'Nom du responsable DPS', 'text', { w: 'l' }),
        F('vpsp', 'VPSP n°', 'text', { w: 's' }),
        F('infirmerie', 'Infirmerie n°', 'text', { w: 's' }),
      ]),
      F('adresse', 'Adresse de prise en charge', 'text', { w: 'full' }),
    ]
  });

  S.push({
    id: 'regard1', nav: '1er regard', title: '1er regard — situation globale', kind: 'plain', items: [
      G('Lieu', [C('lieu_vp', 'VP'), C('lieu_dom', 'Domicile'), C('lieu_travail', 'Lieu de travail'),
        C('lieu_public', 'Lieu public'), C('lieu_nat', 'Milieu naturel'), CI('lieu_autre', 'Autre')]),
      G('Victime', [F('victNum', 'Victime n°', 'text', { w: 's' }),
        R('victCat', null, [['IMP', 'IMP'], ['UR', 'UR'], ['UA', 'UA', 1], ['DCD', 'DCD', 1]])]),
      T('nature', "Nature de l'intervention (description succincte de l'évènement)", { rows: 3 }),
      G('Brûlure', [C('brul_therm', 'Thermique'), C('brul_elec', 'Électrique'),
        CI('brul_chim', 'Chimique — produit'), C('brul_inhal', 'Inhalation'), C('brul_inges', 'Ingestion')]),
      G('Chute', [C('chute_hauteur', 'De sa hauteur'), CI('chute_m', 'De', 'number', { suf: 'm' }),
        C('chute_tete', 'Sup. 1 m sur la tête'), C('chute_pieds', 'Sup. 3 m sur les pieds ou fesses')]),
      { t: 'sub', l: 'Secours routier' },
      F('sr_cinetique', 'Cinétique', 'text', { w: 'full' }),
      G('Victime', [C('sr_pieton', 'Piéton'), C('sr_velo', 'Vélo'), C('sr_moto', 'Moto'), C('sr_vl', 'VL'),
        C('sr_pl', 'PL'), C('sr_tc', 'TC'), C('sr_seul', 'Seul'), CI('sr_contre', 'Contre')]),
      G(null, [C('sr_sortie', "Sortie d'elle-même"), C('sr_ejectee', 'Éjectée'), C('sr_piegee', 'Piégée / incarcérée'),
        C('sr_casque', 'Casque'), C('sr_ceinture', 'Ceinture'), C('sr_airbag', 'Airbag déclenché'), C('sr_tonneaux', 'Tonneaux')]),
    ]
  });

  // ---- Bilan XABCDE : 4 colonnes comme la fiche papier ----
  const COLS = [
    ['c2', '2ème regard', 'Détresse vitale'],
    ['c3', '3ème regard', "Recherche d'une détresse vitale"],
    ['c4', '4ème regard', 'Paramètres vitaux'],
    ['g', 'Gestes effectués', ''],
  ];

  S.push({
    id: 'X', nav: 'X', letter: 'X', title: 'Hémorragie ?', en: 'eXsanguination', kind: 'abcde', color: 'x', cols: {
      c2: [C('x_hemo_ext', 'Hémorragie externe', { red: 1 }), C('x_hemo_exte', 'Hémorragie extériorisée', { red: 1 }),
        F('x_loc', 'Localisation', 'text', { w: 'full' })],
      c3: [C('x_absence', "Absence d'hémorragie")],
      c4: [],
      g: [C('x_compr', 'Compression manuelle'), C('x_panscomp', 'Pansement compressif (CHU)'),
        C('x_panshemo', 'Pansement hémostatique'), CI('x_garrot', 'Garrot posé à', 'time', { now: true })],
    }
  });

  S.push({
    id: 'A', nav: 'A', letter: 'A', title: 'Voies aériennes ?', en: 'Airway', kind: 'abcde', color: 'a', cols: {
      c2: [C('a_obs_comp', 'Obstruction complète des VAS', { red: 1 }), C('a_obs_part', 'Obstruction partielle des VAS', { red: 1 })],
      c3: [C('a_trauma', 'Trauma rachis / facial', { red: 1 }), C('a_parle', 'Parle facilement'), C('a_vas', 'VAS libres')],
      c4: [],
      g: [C('a_desob', 'Manœuvres de désobstruction'), C('a_lvas', 'LVAS'), C('a_aspi', 'Aspiration'),
        C('a_casque', 'Retrait du casque'), C('a_retourn', 'Retournement'), C('a_stab', 'Stabilisation du rachis')],
    }
  });

  S.push({
    id: 'B', nav: 'B', letter: 'B', title: 'Respiration ?', en: 'Breathing', kind: 'abcde', color: 'b', cols: {
      c2: [C('b_nv', 'Ne ventile pas', { red: 1 }), C('b_agon', 'Respiration agonique', { red: 1 })],
      c3: [C('b_souffl', 'Plaie soufflante', { red: 1 }), C('b_trauma', 'Trauma thoracique', { red: 1 }),
        C('b_fv30', 'FV > 30', { red: 1 }), C('b_fv6', 'FV < 6', { red: 1 }),
        C('b_superf', 'Superficielle'), C('b_asym', 'Asymétrie'), C('b_irreg', 'Irrégulière'), C('b_bruy', 'Bruyante'),
        C('b_tirage', 'Tirage'), C('b_sueurs', 'Sueurs'), C('b_cyanose', 'Cyanose')],
      c4: [F('b_fr', 'FR', 'number', { suf: '/min', w: 's' }), C('b_ample', 'Ample'), C('b_reg', 'Régulière'), C('b_sil', 'Silencieuse'),
        F('b_sat_aa', 'SpO₂ air ambiant', 'number', { suf: '%', w: 's' }), F('b_sat_o2', 'SpO₂ sous O₂', 'number', { suf: '%', w: 's' }),
        F('b_debit', 'Débit', 'number', { suf: 'L/min', w: 's' })],
      g: [C('b_demi', '½ assis'), CI('b_inhal', 'Inhalation O₂', 'number', { suf: 'L/min' }), C('b_insuf', 'Insufflation O₂'),
        CI('b_lunette', 'Lunette O₂', 'number', { suf: 'L/min' }), C('b_pans3', 'Pansement 3 côtés')],
    }
  });

  S.push({
    id: 'C', nav: 'C', letter: 'C', title: 'Circulation ?', en: 'Circulation', kind: 'abcde', color: 'c', cols: {
      c2: [],
      c3: [C('c_radial', 'Pouls radial non perçu', { red: 1 }), C('c_trc', 'TRC > 2 s', { red: 1 }),
        C('c_fc40', 'FC < 40', { red: 1 }), C('c_fc120', 'FC > 120', { red: 1 }),
        C('c_irreg', 'Irrégulier'), C('c_filant', 'Filant'), C('c_lent', 'Lent'), C('c_asym', 'Asymétrique'),
        C('c_abdo', 'Abdomen douloureux', { red: 1 }), C('c_bassin', 'Bassin douloureux', { red: 1 }),
        C('c_paleur', 'Pâleur'), C('c_marbr', 'Marbrures'), C('c_thorax', 'Douleur thoracique', { red: 1 })],
      c4: [F('c_fc', 'FC', 'number', { suf: '/min', w: 's' }), C('c_regulier', 'Régulier'), C('c_bienfrap', 'Bien frappé'),
        C('c_sym', 'Symétrique'), PA('c_pag', 'PA gauche'), PA('c_pad', 'PA droite')],
      g: [C('c_rcp', 'RCP'), CI('c_dsa', 'DSA posé à', 'time', { now: true }), F('c_chocs', 'Nb de chocs', 'number', { w: 's' }),
        F('c_arret', 'Arrêt RCP à', 'time', { w: 's', now: true }), F('c_noflow', 'Durée no flow', 'text', { w: 's', ph: 'min' }),
        C('c_pelv', 'Ceinture pelvienne'), C('c_allonge', 'Allongé')],
    }
  });

  S.push({
    id: 'D', nav: 'D', letter: 'D', title: 'Neurologique ?', en: 'Disability', kind: 'abcde', color: 'd', cols: {
      c2: [C('d_areac', 'Aréactive', { red: 1 })],
      c3: [R('d_avpu', 'Conscience (AVPU)', [['A', 'A : Alert'], ['V', 'V : Verbal'], ['P', 'P : Pain', 1], ['U', 'U : Unresponsive', 1]]),
        CI('d_pc', 'PC — durée', 'text', { red: 1 }), C('d_conv', 'Convulsions répétées', { red: 1 }),
        C('d_agit', 'Agitation'), C('d_vomi', 'Vomissement'),
        G('Pupille G', [C('d_pg_retr', 'Rétrécie'), C('d_pg_dil', 'Dilatée'), C('d_pg_areac', 'Aréactive')]),
        G('Pupille D', [C('d_pd_retr', 'Rétrécie'), C('d_pd_dil', 'Dilatée'), C('d_pd_areac', 'Aréactive')]),
        { t: 'sub', l: 'FAST' },
        C('d_fast_f', 'Anomalie expression faciale (F)'), C('d_fast_a', 'Anomalie extension des membres sup. (A)'),
        C('d_fast_s', "Trouble de l'élocution (S)"), CI('d_fast_t', 'Heure de début des signes (T)', 'time', { now: true }),
        G('Motricité', [C('d_mot_msg', 'MS G', { red: 1 }), C('d_mot_msd', 'MS D', { red: 1 }), C('d_mot_mig', 'MI G', { red: 1 }), C('d_mot_mid', 'MI D', { red: 1 })]),
        G('Sensibilité', [C('d_sen_msg', 'MS G', { red: 1 }), C('d_sen_msd', 'MS D', { red: 1 }), C('d_sen_mig', 'MI G', { red: 1 }), C('d_sen_mid', 'MI D', { red: 1 })]),
      ],
      c4: [C('d_consc', 'Conscient'), C('d_orient', 'Orienté'), C('d_absdef', 'Absence de déficit'),
        { t: 'sub', l: 'Pupilles G et D' }, C('d_p_react', 'Réactives'), C('d_p_sym', 'Symétriques'), C('d_p_inter', 'Tailles intermédiaires'),
        F('d_gly', 'Glycémie', 'number', { suf: 'mg/dl', w: 's' })],
      g: [C('d_pls', 'PLS'), C('d_allonge', 'Allongé'), C('d_demi', '½ assis'), C('d_resuc', 'Resucrage'),
        F('d_resuc_dose', 'Dose', 'text', { w: 's' }), F('d_resuc_h', 'Heure', 'time', { w: 's', now: true }),
        F('d_resuc_gly', 'Glycémie', 'number', { suf: 'mg/dl', w: 's' })],
    }
  });

  S.push({
    id: 'suite', nav: 'Suite bilan', title: 'Suite bilan', kind: 'suite', items: [
      { t: 'panel', id: 'plaintes', l: 'Plaintes', tone: 'orange', items: [
        T('pl_text', 'Plaintes', { rows: 2 }),
        F('pl_provoque', 'Provoqué par', 'text', { w: 'full' }),
        G('Qualité', [C('pl_serre', 'Serre'), C('pl_pique', 'Pique'), C('pl_brule', 'Brûle'), C('pl_irrad', 'Irradiation'), CI('pl_autre', 'Autre')]),
        F('pl_region', 'Région', 'text', { w: 'full' }),
        { t: 'bodymap', k: 'marks', l: 'Type de lésion — touchez le schéma pour placer' },
        { t: 'scale', k: 'pl_sev', l: 'Sévérité (EN 0–10)' },
        F('pl_temps', 'Temps (depuis quand)', 'text', { w: 'm' }),
      ] },
      { t: 'panel', id: 'antecedents', l: 'Antécédents', tone: 'blue', items: [
        T('at_maladie', 'Maladie', { rows: 2 }),
        T('at_hospit', 'Hospitalisation', { rows: 2 }),
        T('at_trait', 'Traitement', { rows: 2 }), C('at_ordo', 'Ordonnance'),
        T('at_allergie', 'Allergie', { rows: 1 }), C('at_vaccin', 'Vaccin à jour'),
        T('at_risque', 'Facteur(s) de risque', { rows: 1 }),
      ] },
      { t: 'panel', id: 'commentaires', l: 'Commentaires libres', tone: 'grey', items: [
        T('com', 'Commentaires libres', { rows: 4 }),
        F('meteo', 'Conditions météorologiques', 'text', { w: 'l' }),
        F('tempExt', 'Température extérieure', 'number', { suf: '°C', w: 's' }),
      ] },
      G(null, [F('temp', 'Température', 'number', { suf: '°C', w: 's', step: '0.1' }), F('repas', 'Dernier repas', 'text', { w: 'm' }),
        F('poids', 'Poids', 'number', { suf: 'kg', w: 's' }), F('taille', 'Taille', 'number', { suf: 'cm', w: 's' })]),
    ]
  });

  S.push({
    id: 'gestes', nav: 'Gestes compl.', title: 'Gestes complémentaires', kind: 'plain', items: [
      G('Immobilisation', [C('gc_collier', 'Collier cervical / bloc tête'), C('gc_act', 'ACT'), C('gc_mid', 'MID'), C('gc_echarpes', 'Écharpes'),
        C('gc_attelles', 'Attelles'), C('gc_plandur', 'Plan dur'), C('gc_traction', 'Attelle à traction (en présence médecin)')]),
      G('Matériels utilisés', [C('gc_kitbrul', 'Kit brûlure'), C('gc_kitaes', 'Kit AES'), C('gc_lsu', 'LSU'), C('gc_garrot', 'Garrot'),
        C('gc_panscomp', 'Pansement compressif'), C('gc_resuc', 'Resucrage'), C('gc_froid', 'Poche de froid')]),
      F('gc_autre', 'Autre', 'text', { w: 'full' }),
    ]
  });

  S.push({
    id: 'surveillance', nav: 'Surveillance', title: 'Surveillance', note: 'Si aggravation, contacter le SAMU', kind: 'plain',
    items: [{ t: 'surv', k: 'surv' }]
  });

  S.push({
    id: 'etatcivil', nav: 'État civil', title: 'État civil de la victime', kind: 'plain', items: [
      G(null, [R('sexe', 'Sexe', [['M', 'M'], ['F', 'F']]), F('nom', 'Nom / Prénom', 'text', { w: 'l' })]),
      G(null, [F('dob', 'Date de naissance', 'date', { w: 'm' }), F('age', 'Âge', 'number', { suf: 'ans', w: 's' })]),
      F('adr', 'Adresse', 'text', { w: 'full' }),
      G(null, [F('cp', 'Code postal', 'text', { w: 's', mode: 'numeric', max: 5 }), F('commune', 'Commune', 'text', { w: 'l' })]),
      G(null, [F('prevenir', 'Personne à prévenir et lien de parenté', 'text', { w: 'l' }), F('tel', 'Tél.', 'tel', { w: 'm' })]),
      F('effets', 'Effets personnels', 'text', { w: 'full' }),
    ]
  });

  S.push({
    id: 'devenir', nav: 'Devenir', title: 'Prise en charge et devenir', kind: 'plain', items: [
      G('Sur place', [CI('pc_med', 'Médecin'), CI('pc_inf', 'Infirmière'), C('pc_sp', 'SP'), C('pc_isp', 'ISP'), C('pc_msp', 'MSP'), CI('pc_autre', 'Autre')]),
      G('Victime laissée sur place', [C('ls_pastransport', 'Pas de transport'), C('ls_dcd', 'DCD'), C('ls_refussoins', 'Refus soins'),
        C('ls_refustransport', 'Refus transport (après accord médecin régulateur)')]),
      G('… à', [C('ls_famille', 'Famille'), CI('ls_fdo', "Forces de l'ordre (préciser)"), CI('ls_autre', 'Autre')]),
      G('Victime évacuée par', [CI('ev_amb', 'Ambulance privée'), CI('ev_sp', 'SP de'), CI('ev_smur', 'SMUR de'), CI('ev_vpsp', 'VPSP'),
        C('ev_perso', 'Moyen personnel'), CI('ev_autre', 'Autre')]),
      F('destination', 'Destination', 'text', { w: 'full' }),
      G(null, [F('mat_laisse', 'Matériel(s) laissé(s)', 'text', { w: 'l' }), F('mat_qui', 'À qui', 'text', { w: 'm' })]),
      SIG('sig_mat', 'Signature (matériel laissé)'),
    ]
  });

  S.push({
    id: 'evac', nav: 'Suivi évac.', title: 'Suivi évacuation', kind: 'plain', items: [
      { t: 'sigrow', items: [
        [F('se_resp', 'Nom du responsable DPS', 'text', { w: 'full' }), SIG('sig_resp', 'Signature responsable DPS')],
        [F('se_rec', 'Nom, fonction (relève)', 'text', { w: 'full' }), SIG('sig_rec', 'Signature relève')],
        [F('se_heure', 'Heure de prise en charge', 'time', { w: 's', now: true }), F('se_ioa', 'Nom IOA ou médecin', 'text', { w: 'full' }), SIG('sig_ioa', 'Signature IOA / médecin')],
      ] }
    ]
  });

  const LESIONS = [
    ['D', 'Douleur', '#d97706'], ['P', 'Plaie', '#dc2626'], ['B', 'Brûlure', '#ea580c'], ['O', 'Œdème', '#2563eb'],
    ['DEF', 'Déformation', '#7c3aed'], ['SE', 'Section', '#111827'], ['F', 'Fracture ouverte', '#be123c'],
  ];

  window.FB_SCHEMA = { sections: S, cols: COLS, lesions: LESIONS, version: 'ANPS-GD-2024-04-n6' };
})();
