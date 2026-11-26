import { randomBytes, createHmac } from 'node:crypto';
import WebSocket from 'ws';
import { regions, type Region } from '../src/atlas.ts';
import { isPosition, type Feed, type Mark } from '../src/models.ts';
import { number, object, text } from '../src/parsers.ts';
import { cached, download, empty, UpstreamError } from './upstream.ts';

const airBin = 0.5, seaBin = 0.25;
const cell = (lat: number, lng: number, step: number) => `${Math.floor(lat / step)}:${Math.floor(lng / step)}`;
type Counts = Map<string, Set<string>>;
function add(counts: Counts, key: string, token: string) {
  if (!counts.has(key)) counts.set(key, new Set());
  const members = counts.get(key)!;
  if (members.size < 100) members.add(token);
}
function tiles(counts: Counts, step: number, unit: string): Mark[] {
  return [...counts].flatMap(([id, members]) => {
    if (members.size < 3) return [];
    const [y, x] = id.split(':').map(Number), value = members.size;
    const subtitle = `${value < 6 ? '3 à 5' : value < 11 ? '6 à 10' : 'Plus de 10'} ${unit}`;
    return [{ id, lat: (y + 0.5) * step, lng: (x + 0.5) * step, radius: step * 0.95, name: 'Densité régionale', subtitle,
      band: value < 6 ? 'low' : value < 11 ? 'medium' : 'high' }];
  });
}

export function airTraffic(enabled: boolean, key: string | undefined, request: typeof fetch, now: () => number) {
  let blockUntil = 0;
  let requests: number[] = [];
  const readers = Object.fromEntries(Object.entries(regions).map(([id, { lat, lng }]) => [id, cached(async (): Promise<Feed> => {
    const time = now();
    requests = requests.filter(when => time - when < 86_400_000);
    if (time < blockUntil || requests.length >= 450) return empty('limited', 'Budget de requêtes adsb.lol atteint ; réessai automatique.');
    requests.push(time);
    let raw: unknown;
    try {
      raw = JSON.parse(await download(request, `https://api.adsb.lol/v2/point/${lat}/${lng}/150`, key ? { headers: { 'x-api-key': key } } : undefined, 2_000_000));
    } catch (error) {
      if (error instanceof UpstreamError && error.status === 429) blockUntil = now() + Math.max(600_000, error.retryAfter ?? 0);
      throw error;
    }
    const source = object(raw), timestamp = number(source.now);
    if (!Array.isArray(source.ac) || !timestamp || timestamp > now() + 60_000) throw Error('ADS-B invalide');
    if (now() - timestamp > 600_000) return empty('unavailable', 'L’instantané ADS-B a plus de dix minutes.');
    const counts: Counts = new Map();
    for (const item of source.ac) {
      const p = object(item), hex = text(p.hex), age = number(p.seen_pos);
      // These categories are a transport proxy, not a verified operator identity.
      if (!/^[0-9a-f]{6}$/i.test(hex) || !/^A[345]$/.test(text(p.category)) || ((number(p.dbFlags) ?? 0) & 13) !== 0 ||
        p.alt_baro === 'ground' || age === undefined || age < 0 || age > 60 || !isPosition(p.lat, p.lon) || p.lat === 90 || p.lon === 180) continue;
      add(counts, cell(p.lat as number, p.lon as number, airBin), hex.toLowerCase());
    }
    const items = tiles(counts, airBin, 'appareils'), stale = now() - timestamp > 180_000;
    return { status: stale ? 'stale' : 'fresh', updatedAt: timestamp, items,
      note: stale ? 'L’instantané ADS-B a plus de trois minutes.' : items.length ? 'Détections regroupées ; couverture et classification partielles.' : 'Aucune maille au seuil d’affichage ; cela ne signifie pas que le ciel est vide.' };
  }, { ttl: 180_000, retry: 180_000, retain: 600_000, now })])) as Record<Region, () => Promise<Feed>>;
  return (region: Region) => enabled ? readers[region]() : empty('disabled', 'Active ADS_B_ENABLED dans le fichier .env, puis redémarre TerraScope.');
}

type Connect = () => WebSocket;
const bounds = [[49.8, -1.5], [51.5, 3]];
export function seaTraffic(key: string | undefined, now: () => number, connect: Connect = () => new WebSocket('wss://stream.aisstream.io/v0/stream', {
  handshakeTimeout: 8_000, maxPayload: 128_000, perMessageDeflate: true,
})) {
  const classifications = new Map<number, number>();
  const interval = 120_000;
  let counts: Counts = new Map(), window = 0, salt = randomBytes(16), observed = 0, retryAt = 0, confirmed = false;
  let socket: WebSocket | undefined, idle: ReturnType<typeof setTimeout> | undefined, guard: ReturnType<typeof setTimeout> | undefined;
  const reset = () => { counts = new Map(); salt = randomBytes(16); window = now(); observed = 0; };
  const close = () => {
    clearTimeout(idle); clearTimeout(guard);
    const old = socket; socket = undefined; confirmed = false;
    old?.terminate(); classifications.clear(); reset();
  };
  function ensureConnected() {
    clearTimeout(idle);
    idle = setTimeout(close, 65_000).unref();
    if (!key || socket || now() < retryAt) return;
    const failed = (delay: number) => { close(); retryAt = now() + delay; };
    let connection: WebSocket;
    try { connection = connect(); } catch { failed(60_000); return; }
    socket = connection; reset();
    guard = setTimeout(() => { if (socket === connection && !confirmed) failed(60_000); }, 12_000).unref();
    connection.on('open', () => {
      if (socket !== connection) return;
      connection.send(JSON.stringify({ APIKey: key, BoundingBoxes: [bounds], FilterMessageTypes: ['PositionReport', 'ShipStaticData'] }));
    });
    connection.on('error', () => { if (socket === connection) failed(60_000); });
    connection.on('close', () => { if (socket === connection) failed(60_000); });
    connection.on('message', wire => {
      if (socket !== connection) return;
      try {
        const envelope = object(JSON.parse(wire.toString())), kind = text(envelope.MessageType), time = now();
        if (envelope.error || envelope.Error) { failed(300_000); return; }
        if (kind === 'SubscriptionConfirmation') { confirmed = true; clearTimeout(guard); return; }
        if (kind !== 'PositionReport' && kind !== 'ShipStaticData') return;
        const p = object(object(envelope.Message)[kind]), id = number(p.UserID);
        if (p.Valid === false || !id || id < 100_000_000 || id > 999_999_999 || !Number.isInteger(id)) return;
        confirmed = true; clearTimeout(guard);
        if (kind === 'ShipStaticData') {
          const type = number(p.Type);
          if (classifications.size >= 2500) for (const [vessel, until] of classifications) if (until < time) classifications.delete(vessel);
          if (type && type >= 60 && type <= 89 && (classifications.has(id) || classifications.size < 2500)) classifications.set(id, time + 30 * 60_000);
          else classifications.delete(id);
          return;
        }
        const lat = number(p.Latitude), lng = number(p.Longitude);
        if (lat === undefined || lng === undefined || lat < bounds[0][0] || lat >= bounds[1][0] || lng < bounds[0][1] || lng >= bounds[1][1] || (classifications.get(id) ?? 0) <= time) return;
        if (time - window >= interval) reset();
        observed = time;
        add(counts, cell(lat, lng, seaBin), createHmac('sha256', salt).update(String(id)).digest('base64url'));
      } catch { /* Ignore malformed frames without logging provider contents. */ }
    });
  }
  const read = (): Feed => {
    if (!key) return empty('disabled', 'Renseigne AISSTREAM_API_KEY dans .env, puis redémarre TerraScope.');
    ensureConnected();
    if (!socket) return empty('unavailable', 'Connexion AISStream indisponible ; réessai automatique.');
    if (!confirmed) return empty('loading', 'Connexion à AISStream en cours.');
    if (now() - window >= interval) reset();
    const items = tiles(counts, seaBin, 'navires');
    if (!observed) return empty('loading', 'En attente de positions de navires classés en Manche orientale.');
    return { status: 'fresh', updatedAt: observed, items, note: items.length ? 'Navires classés, détections regroupées ; fenêtre de deux minutes au plus.' : 'Aucune maille au seuil d’affichage ; la couverture AIS peut être partielle.' };
  };
  return { read, close };
}
