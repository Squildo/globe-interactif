import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApi } from '../server/api.ts';
import { cached } from '../server/upstream.ts';

const clock = Date.UTC(2026, 10, 26, 15);
const mocked = (callback: (url: URL, init?: RequestInit) => Response | Promise<Response>): typeof fetch => (input, init) =>
  Promise.resolve(callback(new URL(input instanceof Request ? input.url : input), init));
async function withApi(env: Record<string, string>, request: typeof fetch, run: (base: string) => Promise<void>) {
  const api = createApi(env, { request, now: () => clock });
  const server = createServer((req, res) => api.handle(req, res, () => { res.writeHead(404).end(); }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    assert.ok(address && typeof address !== 'string');
    await run(`http://127.0.0.1:${address.port}`);
  } finally { api.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
}

test('USGS et EONET normalisés, fenêtres bornées et requêtes identiques mutualisées', async () => {
  let calls = 0;
  await withApi({}, mocked(url => {
    calls++;
    if (url.hostname === 'eonet.gsfc.nasa.gov') return Response.json({ events: [{ id: 'E', title: 'Incendie', geometry: [{ type: 'Point', date: '2026-11-20', coordinates: [-2, 49] }] }] });
    assert.equal(url.pathname, '/earthquakes/feed/v1.0/summary/all_week.geojson');
    return Response.json({ type: 'FeatureCollection', metadata: { generated: clock }, features: [{ id: 'U', geometry: { type: 'Point', coordinates: [2, 49, 12] }, properties: { mag: 5.1 } }] });
  }), async base => {
    const loads = await Promise.all(Array.from({ length: 3 }, () => fetch(`${base}/api/earthquakes?period=7`).then(r => r.json())));
    assert.equal(calls, 1); assert.equal(loads[0].status, 'fresh'); assert.equal(loads[0].items[0].depth, 12);
    assert.equal((await fetch(`${base}/api/earthquakes?period=90`)).status, 400);
    assert.equal((await fetch(`${base}/api/air-traffic?region=arbitrary`)).status, 400);
    assert.equal((await fetch(`${base}/api/events`).then(r => r.json())).items[0].lat, 49);
  });
});

test('un cache expiré est marqué en retard en cas de quota, puis disparaît', async () => {
  let time = clock, calls = 0;
  const load = cached(async () => {
    if (calls++) return { status: 'limited', items: [], updatedAt: null };
    return { status: 'fresh', items: ['objet'], updatedAt: clock };
  }, { ttl: 10_000, retain: 30_000, retry: 5_000, now: () => time });
  assert.equal((await load()).status, 'fresh');
  time += 15_000;
  assert.deepEqual((await load()).items, ['objet']); assert.equal((await load()).status, 'stale'); assert.equal(calls, 2);
  time += 20_000;
  assert.equal((await load()).status, 'limited'); assert.deepEqual((await load()).items, []);
});

test('sans clés, les options ne font aucun appel externe ; les requêtes tierces sont refusées', async () => {
  await withApi({}, mocked(() => { throw Error('appel inattendu'); }), async base => {
    assert.deepEqual(await fetch(`${base}/api/config`).then(r => r.json()), { assistant: false });
    assert.equal((await fetch(`${base}/api/air-traffic?region=atlantic`).then(r => r.json())).status, 'disabled');
    assert.equal((await fetch(`${base}/api/sea-traffic`).then(r => r.json())).status, 'disabled');
    const payload = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"message":"bonjour"}' };
    assert.equal((await fetch(`${base}/api/assistant`, payload)).status, 503);
    assert.equal((await fetch(`${base}/api/assistant`, { ...payload, headers: { ...payload.headers, Origin: 'https://example.org' } })).status, 403);
    assert.equal((await fetch(`${base}/api/config`, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${base}/api/missing`)).status, 404);
  });
});

test('adsb.lol ne renvoie que des bandes de densité au-dessus du seuil, sans identifiants', async () => {
  await withApi({ ADS_B_ENABLED: 'true', ADS_B_API_KEY: 'fictive' }, mocked((url, init) => {
    assert.equal(url.toString(), 'https://api.adsb.lol/v2/point/50.7/0.9/150');
    assert.equal(new Headers(init?.headers).get('x-api-key'), 'fictive');
    const aircraft = (i: number, options = {}) => ({ hex: (0xaaaaaa + i).toString(16), lat: 50.13, lon: 1.13, category: 'A3', seen_pos: 2, ...options });
    return Response.json({ now: clock, ac: [aircraft(0), aircraft(1), aircraft(2), aircraft(3, { dbFlags: 1 }), aircraft(4, { lat: 51.12 }), aircraft(5, { lat: 51.12 }), aircraft(6, { lat: 51.12, seen_pos: 600 }), aircraft(1)] });
  }), async base => {
    const r = await fetch(`${base}/api/air-traffic?region=atlantic`);
    const json = await r.json();
    assert.equal(json.status, 'fresh'); assert.equal(json.items.length, 1);
    assert.deepEqual([json.items[0].lat, json.items[0].lng], [50.25, 1.25]);
    assert.match(json.items[0].subtitle, /3 à 5/);
    assert.doesNotMatch(JSON.stringify(json.items), /aaaaaa|50\.13|1\.13/);
  });
});

test('Gemini natif ne renvoie que des actions valides et les appels sont bornés', async () => {
  let calls = 0;
  await withApi({ GEMINI_API_KEY: 'fictive', GEMINI_MODEL: 'modele-de-test' }, mocked((url, init) => {
    assert.equal(url.toString(), 'https://generativelanguage.googleapis.com/v1beta/models/modele-de-test:generateContent');
    assert.equal(new Headers(init?.headers).get('x-goog-api-key'), 'fictive');
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.contents[0].role, 'user');
    assert.equal(payload.generationConfig.responseMimeType, 'application/json');
    assert.equal(payload.generationConfig.responseJsonSchema.properties.actions.maxItems, 8);
    const action = { type: 'style', value: ++calls === 1 ? 'night' : 'outside' };
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [
      { text: 'Texte interne', thought: true }, { text: '{"message":"Proposition",' }, { text: `"actions":[${JSON.stringify(action)}]}` },
    ] } }] });
  }), async base => {
    const send = (message: string) => fetch(`${base}/api/assistant`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ message }) });
    assert.deepEqual(await fetch(`${base}/api/config`).then(r => r.json()), { assistant: true });
    assert.equal((await send('x'.repeat(4500))).status, 413);
    assert.deepEqual(await (await send('Le fond de nuit, s’il te plaît')).json(), { message: 'Proposition', actions: [{ type: 'style', value: 'night' }] });
    for (let i = 0; i < 5; i++) assert.equal((await send('Test')).status, 502);
    assert.equal((await send('Test')).status, 429);
    assert.equal(calls, 6);
  });
});

test('Gemini sans modèle explicite : refus sans action, sortie tronquée rejetée et pause après quota', async () => {
  let calls = 0;
  await withApi({ GEMINI_API_KEY: 'fictive' }, mocked(url => {
    assert.match(url.pathname, /\/models\/gemini-[a-z\d.\-]+:generateContent$/);
    if (++calls === 1) return Response.json({ promptFeedback: { blockReason: 'SAFETY' } });
    if (calls === 2) return Response.json({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"message":"Non","actions":[]}' }] } }] });
    return new Response(null, { status: 429, headers: { 'Retry-After': '90' } });
  }), async base => {
    const send = () => fetch(`${base}/api/assistant`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: '{"message":"Test"}' });
    const refusal = await send();
    assert.equal(refusal.status, 200);
    assert.deepEqual((await refusal.json()).actions, []);
    assert.equal((await send()).status, 502);
    assert.equal((await send()).status, 429);
    assert.equal((await send()).status, 429);
    assert.equal(calls, 3);
  });
});
