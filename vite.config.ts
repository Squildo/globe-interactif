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

export default defineConfig(({ mode }) => ({
  plugins: [atlasApi(loadEnv(mode, process.cwd(), ['ADS_B_', 'AISSTREAM_', 'GEMINI_']))],
  server: { host: '127.0.0.1', cors: false },
  preview: { host: '127.0.0.1', cors: false },
}));
