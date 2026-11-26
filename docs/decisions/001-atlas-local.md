# ADR 001 — Garder TerraScope local en V1

**Décision acceptée — 2026-11-26.** Intégrer Globe.gl via `react-globe.gl` et utiliser Vite pour servir le client. Monter la même API locale dans Vite en développement et en prévisualisation : elle normalise, limite et met en cache les appels fournisseurs. Les clés et la connexion WebSocket AIS restent côté serveur. L’assistant local convertit les commandes en actions typées ; Gemini est un interprète optionnel via son API native, jamais un exécutant.

Un fork de Globe.gl augmenterait la maintenance alors que ses surcouches rendent déjà les géométries nécessaires. Des appels directs depuis le navigateur exposeraient les identifiants ou dépendraient des politiques CORS de chaque source. Un serveur public distinct impliquerait authentification, quotas par utilisateur, gestion de secrets, conformité des sources et surveillance : hors périmètre V1.

Conséquence : l’API écoute sur la boucle locale ; un hébergement de `dist/` seul ne sert que le client. Les caches sont en mémoire et repartent à zéro au redémarrage. Les hooks utilisés sont documentés par [Vite](https://vite.dev/guide/api-plugin.html#configureserver) ; l’interprète distant utilise le [mode JSON de Chat Completions](https://developers.openai.com/api/docs/guides/structured-outputs#json-mode) avec validation applicative.
