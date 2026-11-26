import type { IncomingMessage, ServerResponse } from 'node:http';
import { regions, type Region } from '../src/atlas.ts';
import { object } from '../src/parsers.ts';
import { assistant } from './assistant.ts';
import { airTraffic, seaTraffic } from './transport.ts';
import { isPeriod, science } from './science.ts';

const loopbackHost = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/i;
const loopbackPeer = /^(?:127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/;
const send = (res: ServerResponse, status: number, body: unknown, allow?: string) => {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin', ...(allow ? { Allow: allow } : {}) });
  res.end(JSON.stringify(body));
};

function body(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const timeout = setTimeout(() => fail(408), 2500).unref();
    let size = 0;
    const cleanup = () => {
      clearTimeout(timeout); req.off('data', data); req.off('end', end); req.off('aborted', aborted);
    };
    const fail = (status: number) => { cleanup(); req.resume(); reject(status); };
    const aborted = () => fail(400);
    const end = () => {
      cleanup();
      try { resolve(JSON.parse(Buffer.concat(chunks, size).toString('utf8'))); } catch { reject(400); }
    };
    const data = (chunk: Buffer) => { size += chunk.length; if (size > 4096) fail(413); else chunks.push(chunk); };
    if (Number(req.headers['content-length'] ?? 0) > 4096) { fail(413); return; }
    req.on('data', data).once('end', end).once('aborted', aborted);
  });
}

/** Local JSON API. Provider failures on feed routes are represented by Feed.status. */
export function createApi(env: Record<string, string>, { request = fetch, now = Date.now }: { request?: typeof fetch; now?: () => number } = {}) {
  const { quakes, events, satellites } = science(request, now);
  const air = airTraffic(env.ADS_B_ENABLED?.trim() === 'true', env.ADS_B_API_KEY?.trim(), request, now);
  const sea = seaTraffic(env.AISSTREAM_API_KEY?.trim(), now);
  const chat = assistant(env, request, now);

  async function respond(req: IncomingMessage, res: ServerResponse, url: URL) {
    const host = req.headers.host ?? '', origin = req.headers.origin;
    if (!loopbackHost.test(host) || !loopbackPeer.test(req.socket.remoteAddress ?? '') ||
      (origin !== undefined && origin !== `http://${host}`) || req.headers['sec-fetch-site'] === 'cross-site') {
      send(res, 403, { error: 'API réservée à TerraScope sur cet ordinateur.' }); return;
    }
    const path = url.pathname, expected = path === '/api/assistant' ? 'POST' : 'GET';
    if (req.method !== expected) { send(res, 405, { error: 'Méthode non autorisée.' }, expected); return; }
    const bad = () => send(res, 400, { error: 'Paramètre invalide.' });
    if (path === '/api/config') send(res, 200, { assistant: chat.enabled });
    else if (path === '/api/earthquakes') {
      const period = url.searchParams.get('period') ?? '7';
      if (!isPeriod(period)) return bad();
      send(res, 200, await quakes[period]());
    } else if (path === '/api/events') send(res, 200, await events());
    else if (path === '/api/satellites') send(res, 200, await satellites());
    else if (path === '/api/air-traffic') {
      const region = url.searchParams.get('region') ?? 'atlantic';
      if (!Object.hasOwn(regions, region)) return bad();
      send(res, 200, await air(region as Region));
    } else if (path === '/api/sea-traffic') send(res, 200, sea.read());
    else if (path === '/api/assistant') {
      if (!chat.enabled) { send(res, 503, { error: 'Assistant distant non configuré.' }); return; }
      if (!origin) { send(res, 403, { error: 'Origine locale requise.' }); return; }
      if (req.headers['content-type']?.split(';', 1)[0].trim() !== 'application/json') { send(res, 415, { error: 'JSON requis.' }); return; }
      let input: Record<string, unknown>;
      try { input = object(await body(req)); } catch (code) { send(res, typeof code === 'number' ? code : 400, { error: 'Corps invalide ou trop volumineux.' }); return; }
      if (Object.keys(input).length !== 1 || typeof input.message !== 'string' || !input.message.trim() || input.message.length > 600) return bad();
      const answer = await chat.ask(input.message.trim()); send(res, answer.status, answer.body);
    } else send(res, 404, { error: 'Route inconnue.' });
  }

  return { handle(req: IncomingMessage, res: ServerResponse, next: () => void) {
    const raw = req.url ?? '';
    if (raw !== '/api' && !raw.startsWith('/api/') && !raw.startsWith('/api?')) return next();
    void respond(req, res, new URL(raw, 'http://127.0.0.1')).catch(() => send(res, 500, { error: 'Erreur de l’API locale.' }));
  }, close: sea.close };
}
