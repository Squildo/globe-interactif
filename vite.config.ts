import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { createApi } from './server/api.ts';

function atlasApi(env: Record<string, string>): Plugin {
  const api = createApi(env);
  return {
    name: 'terrascope-local-api',
    configureServer(server) { server.middlewares.use(api.handle); server.httpServer?.once('close', api.close); },
    configurePreviewServer(server) { server.middlewares.use(api.handle); server.httpServer.once('close', api.close); },
  };
}

export default defineConfig(({ command, mode }) => {
  const pages = mode === 'pages';
  return {
    base: pages ? '/terrascope/' : '/',
    resolve: { alias: { '#edition-assets': fileURLToPath(new URL(pages ? './src/assets.pages.ts' : './src/assets.local.ts', import.meta.url)) } },
    ...(pages ? {
      publicDir: false, envDir: false, envPrefix: [],
      // Vite analyse le worker WASM de satellite.js avant d’éliminer le code inutilisé.
      // https://github.com/shashwatak/satellite-js/issues/165
      worker: { format: 'es' as const },
      build: { outDir: 'dist-pages', license: { fileName: 'licenses.md' } },
    } : {}),
    plugins: !pages && command === 'serve' ? [atlasApi(loadEnv(mode, process.cwd(), ['ADS_B_', 'AISSTREAM_', 'GEMINI_']))] : [],
    server: { host: '127.0.0.1', cors: false },
    preview: { host: '127.0.0.1', cors: false },
  };
});
