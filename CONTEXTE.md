# TerraScope — Contexte

TerraScope est un atlas interactif en français : explorer la Terre pour comprendre comment géographie, population, phénomènes naturels et mobilité se superposent. Ce n’est ni un outil de navigation ni un système d’alerte.

## V1 locale

- `atlas` : une vue Globe.gl, un catalogue de couches indépendantes, filtres, recherche, légendes et détails. Une Terre lisible au premier regard, et les données plus denses seulement à la demande. Le prototype donné est une référence d’usage et non une maquette à copier.
- `sources` : pour chaque exemple du dépôt Globe.gl, conserver la référence et soit intégrer le jeu réutilisable, soit documenter la substitution ou le blocage (droits, ancienneté, exemple synthétique). Distinguer mesure, archive, calcul et démonstration.
- `flux` : USGS sans clé, aviation civile et trafic maritime régionaux et facultatifs. Les pannes, la couverture et la fraîcheur sont explicites. Pas d’historique de positions individuelles.
- `assistant` : commandes locales sans clé ; interprétation IA facultative, avec aperçu des changements et validation côté serveur et navigateur. Le catalogue fonctionne sans assistant.

## Architecture

Node 24 et npm ; React + TypeScript + Vite + `react-globe.gl`. `src/` contient l’interface et la normalisation des flux publics, `data/` les fichiers cartographiques et `server/` les adaptateurs locaux (montés dans Vite en développement et prévisualisation). Pas de compte ni de base de données. `.env` est local, `.env.example` est un gabarit sans secrets.

L’[édition GitHub Pages](docs/decisions/002-edition-pages.md) publie uniquement une compilation statique et ses données redistribuables. Les flux accessibles sans clé sont lus dans le navigateur ; l’API, les options avec clés et les jeux dont la redistribution reste à vérifier sont propres à l’édition locale.

## Critères d’acceptation

1. On peut afficher et masquer des couches superposées sans recharger la page, au clavier comme à la souris. Les fonds et les modes de représentation d’une même couche ne se cumulent pas par erreur.
2. La source et les limites des données sont visibles. Une coupure ne transforme jamais un cache ou une démo en « direct ».
3. Le globe, sa recherche et ses données locales sont utilisables sans compte ni clé. Les commandes de l’assistant n’agissent que sur la carte après validation.
4. `npm test`, `npm run build` et un contrôle de la vue en navigateur couvrent les parcours de base. Les flux sous clé ne sont validés en réel qu’avec des identifiants fournis localement.

## Contrat visuel

Vue atlas pleine hauteur, typo éditoriale, surfaces charbon et accent vert chartreuse. Navigation par couches à gauche sur ordinateur, tiroir par le bas sur mobile. Globe au centre, commandes regroupées et statuts textuels. Éviter les logos concurrents, le faux temps réel et l’accumulation de panneaux opaques sur le globe.
