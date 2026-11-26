# TerraScope

- Lire [CONTEXTE.md](CONTEXTE.md) pour le périmètre et [PROGRESSION.md](PROGRESSION.md) pour la reprise. Tenir à jour [le registre des sources](docs/sources/README.md) pour chaque ajout ou substitution de données.
- Node 24, React/TypeScript, Vite et `react-globe.gl`. Vérifier avec `npm test`, `npm run build` et `npm run test:browser` pour les changements visuels. Sous PowerShell, `npm.cmd` fonctionne sans script PowerShell.
- Garder `.env` local et ignoré ; ne jamais exposer de clé dans le navigateur ni dans les journaux. Ne pas activer de service payant ou publier de fichiers sans accord.
- Distinguer archive, flux, calcul et simulation. Ne jamais faire passer une coupure ou un jeu de démonstration pour des données actuelles. Les couches de trafic ne publient que des mailles de densité.
