import { isPosition, type Area, type Mark, type Position, type Route } from './models.ts';

export function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export const number = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
export const text = (value: unknown, fallback = '') => typeof value === 'string' && value.trim() ? value.trim().slice(0, 220) : fallback;
export function coordinates(value: unknown): Position | undefined {
  const [lng, lat] = list(value);
  return isPosition(lat, lng) ? { lat: lat as number, lng: lng as number } : undefined;
}

export function parseRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], value = '', quoted = false;
  for (let i = 0; i <= csv.length; i++) {
    const char = csv[i] ?? '\n';
    if (char === '"') {
      if (quoted && csv[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted;
    } else if (!quoted && char === ',') { row.push(value); value = ''; }
    else if (!quoted && char === '\n') { if (row.length || value) rows.push([...row, value]); row = []; value = ''; }
    else if (quoted || char !== '\r') value += char;
  }
  return rows;
}

function entries(value: unknown) {
  return list(object(value).features).map(raw => {
    const f = object(raw);
    return { id: text(f.id), p: object(f.properties), g: object(f.geometry) };
  });
}
export function parseQuakes(data: unknown): Mark[] {
  return entries(data).flatMap(({ id, p, g }) => {
    const pos = coordinates(g.coordinates), mag = number(p.mag);
    return g.type === 'Point' && id && pos && mag !== undefined ? [{ ...pos, id, name: text(p.place, 'Séisme'), number: mag, depth: number(list(g.coordinates)[2]), observedAt: number(p.time) }] : [];
  });
}
export function parseEvents(data: unknown): Mark[] {
  return list(object(data).events).flatMap(raw => {
    const e = object(raw);
    const geo = list(e.geometry).map(object).filter(g => g.type === 'Point' && coordinates(g.coordinates));
    const g = geo.sort((a, b) => Date.parse(text(b.date)) - Date.parse(text(a.date)))[0];
    if (!g || !text(e.id)) return [];
    return [{ ...coordinates(g.coordinates)!, id: text(e.id), name: text(e.title, 'Événement naturel'), subtitle: text(object(list(e.categories)[0]).title), observedAt: number(Date.parse(text(g.date))) }];
  });
}

export function parseAreas(data: unknown): Area[] {
  const display = new Intl.DisplayNames('fr', { type: 'region', fallback: 'none' });
  return entries(data).flatMap(({ p, g }) => {
    const type = g.type;
    if (type !== 'Polygon' && type !== 'MultiPolygon') return [];
    const rings = type === 'Polygon' ? [list(g.coordinates)[0]] : list(g.coordinates).map(part => list(part)[0]);
    const ring = rings.map(list).sort((a, b) => b.length - a.length)[0] ?? [];
    const points = ring.map(coordinates).filter((v): v is Position => Boolean(v));
    if (!points.length) return [];
    const lat = points.reduce((sum, pt) => sum + pt.lat, 0) / points.length;
    const x = points.reduce((sum, pt) => sum + Math.cos(pt.lng * Math.PI / 180), 0);
    const y = points.reduce((sum, pt) => sum + Math.sin(pt.lng * Math.PI / 180), 0);
    const nativeName = text(p.ADMIN, text(p.NAME));
    const iso = text(p.ISO_A2, text(p.WB_A2));
    const name = /^[A-Z]{2}$/.test(iso) ? display.of(iso) ?? nativeName : nativeName;
    return nativeName ? [{ id: text(p.ADM0_A3, nativeName), nativeName, name, center: { lat, lng: Math.atan2(y, x) * 180 / Math.PI },
      geometry: { type, coordinates: g.coordinates } as Area['geometry'], population: number(p.POP_EST), gdp: number(p.GDP_MD_EST), populationYear: number(p.POP_YEAR), gdpYear: number(p.GDP_YEAR) }] : [];
  });
}
export function parsePlaces(data: unknown, volcanoes = false): Mark[] {
  return entries(data).flatMap(({ p, g }, index) => {
    const pos = coordinates(g.coordinates), name = text(volcanoes ? p.NAME : p.name);
    return pos && name ? [{ ...pos, id: String(index), name,
      subtitle: volcanoes ? [text(p.COUNTRY), text(p.MORPHOLOGY)].filter(Boolean).join(' · ') : text(p.adm0name),
      number: number(volcanoes ? p.ELEVATION : p.pop_max), code: !volcanoes && p.adm0cap === 1 ? 'capital' : undefined }] : [];
  });
}
export function parseAirports(raw: string): Mark[] {
  return parseRows(raw).flatMap(([id, name, city, country, iata, icao, lat, lng]) => {
    if (!id || !name || !lat || !lng || !isPosition(Number(lat), Number(lng))) return [];
    return [{ id, name, lat: Number(lat), lng: Number(lng), subtitle: `${city} · ${country}`, code: iata !== '\\N' ? iata : icao !== '\\N' ? icao : undefined }];
  });
}
export function parseRoutes(raw: string, airports: Mark[]): Route[] {
  const byId = new Map(airports.map(mark => [mark.id, mark]));
  const byCode = new Map(airports.filter(mark => mark.code).map(mark => [mark.code, mark]));
  const result = new Map<string, Route>();
  for (const [, , from, fromId, to, toId, , stops] of parseRows(raw)) {
    const start = byId.get(fromId) ?? byCode.get(from), end = byId.get(toId) ?? byCode.get(to);
    if (!start || !end || start === end || stops !== '0') continue;
    const id = [start.id, end.id].sort().join('-');
    const match = result.get(id);
    if (match) { match.weight++; continue; }
    result.set(id, { id, name: `${start.code ?? start.name} ↔ ${end.code ?? end.name}`, startLat: start.lat, startLng: start.lng, endLat: end.lat, endLng: end.lng, weight: 1 });
  }
  return [...result.values()].sort((a, b) => b.weight - a.weight).slice(0, 800);
}
export function orbitalRecords(value: string) {
  const lines = value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const seen = new Set<string>();
  return lines.flatMap((name, i) => {
    const one = lines[i + 1], two = lines[i + 2];
    if (!/^(ISS\b|TIANGONG\b|HUBBLE\b|HST\b|TERRA\b|AQUA\b|LANDSAT\b|SENTINEL[- ]|SUOMI NPP\b|NOAA[- ](?:15|18|19|20|21)\b)/.test(name) || seen.has(name) || !one?.startsWith('1 ') || !two?.startsWith('2 ')) return [];
    const yy = Number(one.slice(18, 20)), day = Number(one.slice(20, 32));
    if (!day || day >= 367) return [];
    seen.add(name);
    return [{ name, one, two, epoch: Date.UTC(yy < 57 ? 2000 + yy : 1900 + yy, 0, 1) + (day - 1) * 86_400_000 }];
  });
}
