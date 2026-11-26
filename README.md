# TerraScope

Atlas interactif en français sur un globe 3D Terre/Lune. Recherche un lieu, superpose les couches, change leur représentation et clique sur un pays ou un repère pour consulter sa fiche et sa source. Le globe et l’assistant de commandes ne nécessitent ni compte ni clé.

## Édition web

Ouvre [l’atlas sur GitHub Pages](https://squildo.github.io/terrascope/) dans un navigateur compatible WebGL 2. Le site comprend les frontières et capitales, les fonds Satellite et Nuit, la Lune, les nuages illustratifs et l’assistant sans IA, qui demande confirmation avant toute modification.

Les séismes USGS, les événements NASA EONET et les éléments orbitaux CelesTrak sont demandés par le navigateur, sans clé, à l’ouverture des couches. Les positions orbitales sont estimées par SGP4 et les indisponibilités sont signalées dans le catalogue. Gemini, les densités ADS-B et AIS, les volcans, les aéroports, les routes aériennes, le relief et les sites d’alunissage restent réservés à l’édition locale. Les câbles sous-marins sont désactivés dans les deux éditions.

## Démarrer en local

Prérequis : Node.js 24+, npm et un navigateur avec WebGL 2. Dans le dossier du projet :

```sh
npm ci
node scripts/import-data.mjs
npm run dev
```

Ouvre [http://127.0.0.1:5173](http://127.0.0.1:5173), ou l’adresse affichée par Vite. Sous PowerShell, utilise `npm.cmd` à la place de `npm` si la stratégie d’exécution bloque le script npm. Après un clonage, le script d’import récupère les fichiers manquants dans `data/` avant le premier lancement ou build. Les jeux dont les conditions de redistribution restent à vérifier ne sont pas inclus dans le dépôt ; `--refresh` retélécharge tous les jeux depuis les sources indiquées dans le script.

- **Sans clé, avec Internet** : séismes USGS (24 h, 7 j ou 30 j), événements NASA EONET et positions estimées d’une sélection de satellites civils (CelesTrak + SGP4). Dans « Satellites et ISS », « Voir l’ISS » recentre la vue si la station est cachée par la Terre. Les jeux historiques et le flux d’événements ne sont pas des alertes.
- **Nuages illustratifs** : sphère de la démo officielle Globe.gl avec la carte « Fair Weather » de Natural Earth III, indépendante de la rotation du globe. Ce n’est pas la météo en direct. La couche reste fixe lorsque la réduction des animations est activée.
- **Assistant local** : essaie « Affiche les séismes de magnitude 5 au Japon et masque les volcans », « Affiche le PIB par pays » ou « Passe en mode nuit ». Prévisualise, applique, puis annule si besoin. « Au Japon » centre la caméra ; cela ne retire pas les séismes hors du Japon.
- **Mobilité** : les routes OpenFlights sont une archive, distincte des densités actualisées facultatives. Les mailles omettent les groupes de moins de trois détections et n’affichent ni identifiants ni trajectoires individuelles. Une maille vide ne signifie pas une absence de trafic.

## Options locales dans `.env`

Le fichier `.env` à la racine suffit et est ignoré par Git. `.env.local` est facultatif et prend le dessus sur `.env` pour une même variable en cas de doublon. S’il manque, pars de [`.env.example`](.env.example). Modifie-le localement puis redémarre le serveur Vite. N’utilise pas le préfixe `VITE_` pour une clé et ne colle pas de clé dans le chat.

| Variable | Effet |
| --- | --- |
| `ADS_B_ENABLED=true` | Active les requêtes adsb.lol à l’ouverture de la couche. Quatre zones fixes, rayon de 150 NM ; clé facultative dans `ADS_B_API_KEY`. |
| `AISSTREAM_API_KEY` | Active la connexion AISStream à l’ouverture de la couche maritime. Zone : Manche orientale ; aucun navire individuel n’est affiché. |
| `GEMINI_API_KEY` et `GEMINI_MODEL` (facultatif) | Active l’option Gemini (modèle `gemini-3.1-flash-lite` par défaut) via [`generateContent`](https://ai.google.dev/api/generate-content) avec [sortie structurée JSON](https://ai.google.dev/gemini-api/docs/structured-output). Après consentement, seules les commandes non reconnues localement sont envoyées à Google. L’usage dépend du quota et de la facturation du projet ; aucun changement de carte sans validation. |

Les options sont lues côté serveur. Rien n’oblige à activer les trois services. Les pages des fournisseurs et les conditions de diffusion sont dans le [registre des sources](docs/sources/README.md).

## Vérifier et prévisualiser

| Commande | Vérification |
| --- | --- |
| `npm test` | Commandes françaises, normalisation, caches, API, transports et réponses IA simulés. |
| `npm run build` | Vérification TypeScript et génération de `dist/`. |
| `npm run preview` | Prévisualisation locale du build, avec la même API que le serveur de développement. |
| `npm run test:browser` | Parcours Chromium avec le serveur lancé. L’URL peut être configurée par `ATLAS_URL` ; le test produit des captures ordinateur et mobile de jour et de nuit dans `artifacts/`. |
| `npm run build:pages` | Génère `dist-pages/` pour `/terrascope/`, après `npm ci`, sans `.env` ni import de données. |
| `npm run preview:pages` | Prévisualise le site statique à `http://127.0.0.1:4173/terrascope/` (ou au port affiché par Vite). |
| `npm run test:pages` | Vérifie `dist-pages/` et lance Chromium sur un build prévisualisé avec les flux simulés. Avec `ATLAS_URL` défini à l’URL GitHub Pages, vérifie le site public avec les flux réels. |

Pour le test navigateur, installe Chromium avec `npx playwright-core install chromium` ou fournis le chemin d’un Chrome/Chromium/Edge existant dans `BROWSER_EXECUTABLE`. Sur Windows, exemple : `$env:BROWSER_EXECUTABLE = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'`.

## Déploiement

Dans **Settings → Pages**, la source est **GitHub Actions**. L’unique [workflow Pages](.github/workflows/pages.yml) teste puis publie `dist-pages/` depuis `main` à chaque changement qui affecte le site. Il peut aussi être lancé manuellement sur `main` depuis l’onglet Actions. Il ne publie ni le dépôt source, ni `dist/`, ni `.env`, ni l’API locale.

`src/` contient l’interface et la normalisation des flux publics, commune aux deux éditions. `server/` contient les services de l’édition locale et leurs options avec clés. Ne mets pas le serveur de développement ou de prévisualisation Vite en ligne.

[Contexte et périmètre](CONTEXTE.md) · [Suivi et vérifications](PROGRESSION.md) · [Sources et droits](docs/sources/README.md) · [Choix d’architecture](docs/decisions/002-edition-pages.md)
