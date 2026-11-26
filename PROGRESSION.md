# Progression — TerraScope

Lire d’abord [CONTEXTE.md](CONTEXTE.md). Voir [le registre des sources](docs/sources/README.md) avant de livrer un nouveau jeu de données.

- [x] Recenser les exemples Globe.gl, leurs jeux intégrables et les démonstrations.
- [x] Tester le globe Terre/Lune, les couches, la recherche, les fiches et le tiroir mobile.
- [x] Normaliser les jeux locaux et servir USGS, EONET et CelesTrak/SGP4 ; vérifier les trois services avec des réponses réelles.
- [x] Ajouter les densités ADS-B et AIS, les statuts d’indisponibilité et l’assistant à validation. Vérifier adsb.lol en Europe occidentale sans clé et les cas sans clé.
- [x] Ajouter `.env` ignoré, `.env.example`, `AGENTS.md`, le README et le registre.
- [x] Remplacer OpenAI par l’API native Gemini. L’assistant local reste autonome ; l’envoi à Gemini est facultatif et aucune action n’est appliquée sans validation.
- [x] Revoir la lecture des frontières et des capitales : aplats translucides, contours renforcés, survol et étiquettes avec halo sombre et filtrage des chevauchements.
- [x] Rétablir les repères orbitaux cliquables et le recentrage « Voir l’ISS » (ou « Voir un satellite »). L’occlusion par la Terre reste active.
- [x] Ajouter la sphère de nuages de l’exemple officiel Globe.gl avec un masque local « Fair Weather » de Natural Earth III. C’est une illustration, pas un flux de météo.
- [ ] Tester AISStream et Gemini avec des identifiants dans `.env`. Les échanges sont couverts par simulation, pas par un test authentifié. En local, `/api/config` indique `assistant: false` : aucune clé Gemini n’a été détectée.
- [ ] Lever les réserves du registre avant de publier des couches supplémentaires. Les câbles restent désactivés ; si une couverture européenne ou un rendu régional agrégé convient, réévaluer EMODnet.
- [x] Préparer l’édition statique avec les fonds Nuit et Lune crédités et les flux publics directs. L’API locale et les sources non redistribuables sont exclues de `dist-pages/`.
- [x] Remplacer `live-data` sur `main` par un workflow qui teste, compile et publie uniquement `dist-pages/`. L’ancien code et son workflow sont conservés sur `mistral-large-4-work`.

## Vérifications du 26 novembre 2026

- `npm test` : 22 tests, dont un catalogue USGS mensuel à la taille mesurée (6,8 Mo décompressés). `npm run build` et `npm run build:pages` passent. Vite signale la taille du module 3D et l’analyse du worker WASM de `satellite.js` ; ce worker n’est pas inclus dans le build Pages.
- `npm run test:browser` : réussi sur le serveur de développement et le build prévisualisé, avec Chromium et WebGL 2 (SwiftShader). Le parcours couvre le survol et sa disparition à la sortie, les nuages (chargement, rendu, dérive sans rotation de la caméra, arrêt au masquage et en mouvement réduit, visibilité d’onglet simulée), les orbites, l’assistant avec confirmation, la recherche, Terre/Lune et les contrôles tactiles. Captures jour/nuit sur ordinateur et iPhone 13 émulé dans `artifacts/`, ignoré par Git. Les séismes, satellites et réponses Gemini y sont simulés.
- `/api/satellites` réel : HTTP `200`, état `fresh`, cinq positions dont l’ISS. Une couche active sans repère visible peut simplement indiquer que les satellites sont derrière la Terre. L’API distingue ce cas d’un flux indisponible.
- `npm run test:pages` : artefact vérifié dans Chromium sur ordinateur et mobile avec les flux simulés, depuis une copie du dépôt sans `.env` ni jeu importé. Le scénario couvre aussi l’assistant avec confirmation et les fonds Nuit et Lune.
- Le `502` et l’erreur de fermeture du canal de messagerie n’ont pas été reproduits dans le Chromium de test sans extensions. Si le `502` revient, relever séparément l’URL de la requête en échec dans Réseau et la source du message de console ; aucun lien avec les satellites n’est établi.
- `npm audit` : aucune vulnérabilité signalée. Le workflow de publication ne lance pas le script d’import local.

Pour reprendre : [README](README.md) pour lancer ou publier le projet, `src/science.ts` pour les flux partagés, `server/` pour l’API locale et `src/atlas.ts` pour les actions de l’assistant. Vérifier `git status` avant toute opération de versionnement ou de publication.
