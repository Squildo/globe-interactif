# ADR 002 — Publier une édition statique sur GitHub Pages

**Décision acceptée — 2026-11-26.** Conserver l’édition locale et générer un second build à partir du même atlas. Sur GitHub Pages, seuls `dist-pages/` et les fichiers référencés par le build sont servis sous `/terrascope/`. Le workflow compile depuis un checkout sans `.env` ni import de jeux locaux. Le déploiement direct du dépôt et la collecte périodique `live-data` ne sont plus utilisés.

USGS, NASA EONET et CelesTrak acceptent les requêtes cross-origin sans identifiants. Les requêtes partent à l’ouverture d’une couche, avec un cache par onglet ; la normalisation et le calcul orbital sont partagés avec l’API locale. Les géométries téléchargées ne sont pas republées sous forme d’instantanés. En cas de panne ou de changement CORS, le catalogue indique un retard ou une indisponibilité, sans empêcher l’exploration du globe.

Le [registre des sources](../sources/README.md) fixe le jeu de fichiers publiables et les attributions. Les services qui nécessitent l’API ou des secrets (ADS-B, AIS, Gemini), les fichiers aux droits non vérifiés et le build local `dist/` ne sont pas transférés. L’assistant reconnaît les commandes dans le navigateur et ne modifie la carte qu’après validation.

Un serveur public pour les clés ou un proxy recréerait des besoins de contrôle d’accès, de quotas et de maintenance. Un job de collecte ajouterait des instantanés obsolètes et des obligations de redistribution. Pour corriger une régression, rétablir un build Pages fonctionnel par commit sur `main` et relancer le workflow ; ne pas repasser au déploiement du dépôt source.
