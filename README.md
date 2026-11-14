# Fiche Bilan UDPS — application hors ligne

Version numérique de la fiche bilan ANPS (avril 2024, n°6). C'est une application web installable (PWA).
Elle fonctionne sur tablette et sur téléphone (Android, iPad, iPhone), sans réseau une fois installée.

## Fonctions

- Tous les champs de la fiche papier : en-tête, 1er regard, bilan X-A-B-C-D (2ème, 3ème et 4ème regard, gestes effectués),
  suite bilan, gestes complémentaires, surveillance, état civil, prise en charge et devenir, suivi évacuation.
- Grandes cases cochables au doigt. Les signes de détresse vitale (en rouge sur la fiche) font apparaître une alerte et marquent le bloc concerné.
- Boutons « maint. » pour inscrire l'heure actuelle (garrot, DSA, début des signes FAST, etc.).
- Schéma corporel face et dos : on choisit le type de lésion (D, P, B, O, DEF, SE, F) puis on touche le schéma.
- Échelle de sévérité 0–10, tableau de surveillance extensible, calcul automatique de l'âge.
- Signatures au doigt : responsable DPS, relève, IOA ou médecin, matériel laissé.
- Enregistrement automatique sur l'appareil. Une fiche clôturée passe en lecture seule (on peut la rouvrir).
- **Export PDF** : 2 pages A4, mise en page proche de la fiche papier. Le PDF se génère sans réseau. Ensuite : Télécharger ou Partager (mail, Drive…).
- **Export JSON** : la fiche au format structuré.
- **Envoi API** : envoi en HTTPS vers un logiciel externe. Hors ligne, l'envoi est mis en file d'attente et part tout seul au retour du réseau.
- Sauvegarde et restauration de toutes les fiches (JSON), purge des fiches déjà envoyées.

## Installation sur Android (APK)

1. Récupérez le fichier `FicheBilanUDPS-….apk` : dans la page **Releases** du dépôt, ou dans l'onglet **Actions** (artefact « apk »).
2. Copiez-le sur la tablette ou le téléphone, puis ouvrez-le.
3. Android demande d'autoriser l'installation depuis cette source (Chrome, Fichiers…). Acceptez.

L'application fonctionne entièrement hors ligne.
- « Exporter PDF » → **Enregistrer** place le fichier dans `Documents/FicheBilan`.
- « Exporter PDF » → **Partager** ouvre le menu de partage d'Android : mail, Drive, WhatsApp…
- Dans l'APK, l'envoi API passe par la couche native : la contrainte CORS décrite plus bas ne s'applique pas.

### Reconstruire l'APK

- Automatique : le workflow `.github/workflows/android.yml` construit l'APK à chaque push sur `main`. Pour une Release, poussez un tag (`git tag v1.0.1 && git push --tags`).
  Les secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD` et `ANDROID_KEY_ALIAS` doivent être renseignés.
- En local : il faut le JDK 21 et le SDK Android 35. Placez le keystore dans `signing/` (jamais commité), puis lancez `npm ci && npm run apk`.
- À chaque nouvelle version, augmentez `versionCode` et `versionName` dans `android/app/build.gradle`.
  Signez **toujours avec la même clé**, sinon Android refuse la mise à jour par-dessus l'ancienne version.

## iPhone / iPad

Sans Mac ni compte Apple Developer (99 €/an), il n'y a pas d'application iOS à installer.
Deux options :
- **Version web installable** (section suivante) : depuis Safari, Partager → « Sur l'écran d'accueil ». Elle fonctionne aussi hors ligne.
- **Application iOS native** : sur un Mac, lancez `npx cap add ios`, ouvrez le projet dans Xcode et publiez sur l'App Store ou via TestFlight.

## Installation de la version web (PWA)

Le dossier `app/` est l'application web. L'application doit être servie en **HTTPS**. C'est obligatoire pour le mode hors ligne et l'installation.
N'importe quel hébergement de fichiers statiques convient : serveur de l'association, OVH, Netlify, GitHub Pages, etc.
Il suffit de copier le contenu du dossier `app/` tel quel (GitHub Pages fonctionne aussi). Il n'y a ni base de données ni serveur applicatif.

Sur chaque appareil, ouvrez l'adresse **une fois avec du réseau**, puis :
- **Android (Chrome)** : menu ⋮ → « Installer l'application » (ou « Ajouter à l'écran d'accueil ») ;
- **iPad / iPhone (Safari)** : bouton Partager → « Sur l'écran d'accueil ».

L'application s'ouvre ensuite en plein écran depuis son icône, avec ou sans réseau.

Pour tester sur un ordinateur : `npm run serve`, puis http://localhost:8080.

Mise à jour : remplacez les fichiers sur l'hébergement **et** changez le numéro dans `app/sw.js` (`const CACHE = 'fiche-bilan-v1.0.1'`).
Les appareils prennent la nouvelle version à leur prochaine ouverture avec réseau.

## Envoi vers Certiflow, e-brigade ou un autre logiciel

Dans **Réglages → Envoi vers un logiciel externe**, renseignez :
- l'URL de réception ;
- l'en-tête d'authentification, par exemple `Authorization` avec la valeur `Bearer <jeton>` ;
- l'option « Joindre le PDF » ;
- l'option « Envoyer automatiquement à la clôture ».

La fiche part en `POST` (méthode modifiable), au format `application/json` :

```json
{
  "format": "fiche-bilan-udps",
  "format_version": 1,
  "modele_fiche": "ANPS-GD-2024-04-n6",
  "structure": "Nom de l'association",
  "fiche": { "id": "…", "numero": "12", "statut": "closed", "cree_le": "ISO8601", "modifie_le": "…", "cloture_le": "…", "detresse_vitale": true },
  "donnees": { "num": "12", "date": "2026-11-14", "heurePec": "14:20", "lieu_public": true, "x_garrot": true, "x_garrot_v": "14:32", "b_fr": "22", "c_pag_s": "135", "c_pag_d": "82", "d_avpu": "A", "nom": "…", "…": "…" },
  "surveillance": [ { "h": "14:40", "fr": "18", "sat": "97", "o2": "", "fc": "88", "pa": "130/80", "t": "", "en": "4", "gly": "", "avpu": "A" } ],
  "lesions": [ { "vue": "face", "type": "D", "libelle": "Douleur", "x": 55, "y": 196.9 } ],
  "signatures": ["sig_resp", "sig_rec"],
  "lisible": [ { "section": "X — Hémorragie ?", "colonne": "Gestes effectués", "cle": "x_garrot", "libelle": "Garrot posé à", "valeur": "14:32", "detresse": false } ],
  "pdf": { "nom": "fiche-bilan-12-2026-11-14.pdf", "type": "application/pdf", "base64": "…" }
}
```

- `donnees` contient toutes les clés de la fiche. La liste complète est dans `app/js/schema.js` : une case = un booléen ; une case avec saisie = la clé plus `<clé>_v` ; une tension = `<clé>_s` et `<clé>_d`.
- `lisible` liste uniquement les éléments renseignés, avec leur libellé. C'est la forme la plus simple à reprendre dans un autre logiciel.
- Le serveur doit répondre en `2xx`. Toute autre réponse laisse la fiche en file d'attente.
- Le schéma corporel occupe une zone de 100 × 214 unités par vue (face ou dos) : `x` et `y` sont exprimés dans ces unités.

### Points à valider avec l'éditeur

Je n'ai pas trouvé de documentation publique sur une API d'import de fiches bilan chez Certiflow ou e-brigade.
Demandez à l'éditeur :
1. l'adresse de réception et la méthode d'authentification ;
2. le format attendu.

Si le format diffère, deux solutions :
- adapter la fonction `buildPayload()` dans `app/js/app.js` ;
- placer une petite passerelle entre l'application et le logiciel : elle reçoit ce JSON et le traduit.

Dans la version web, l'envoi part directement du navigateur. Le serveur de destination doit donc autoriser les requêtes CORS venant de l'adresse de l'application.
Une passerelle hébergée sur le même domaine que l'application évite ce problème.

## Données et confidentialité

- Les fiches sont stockées uniquement sur l'appareil (`localStorage` de l'application). La sauvegarde automatique Android est désactivée dans l'APK. Rien ne sort sans export ni envoi.
- Ce sont des données de santé. Verrouillez les appareils par code et supprimez les fiches une fois transmises (Réglages → « Supprimer les fiches envoyées »).
  Faites des sauvegardes JSON régulières : si les données du navigateur sont effacées, les fiches de l'appareil sont perdues.
- Pour que le stockage ne soit pas effacé automatiquement, l'application demande au navigateur un stockage « persistant ».

## Fichiers

| Fichier | Rôle |
|---|---|
| `app/` | application web (source unique, utilisée aussi par l'APK) |
| `android/` | projet Android natif (Capacitor 7) |
| `.github/workflows/android.yml` | construction automatique de l'APK |
| `app/index.html` | page de l'application |
| `app/js/schema.js` | définition de tous les champs de la fiche (à modifier pour faire évoluer la fiche) |
| `app/js/app.js` | formulaire, enregistrement, export JSON, envoi API, réglages |
| `app/js/report.js` | mise en page et génération du PDF |
| `app/js/vendor/` | jsPDF 2.5.1 et html2canvas 1.4.1 (embarqués pour le hors ligne, licence MIT) |
| `app/sw.js` | cache hors ligne |
| `app/manifest.webmanifest`, `app/icons/` | installation sur l'écran d'accueil |
