import { degreesLat, degreesLong, eciToGeodetic, gstime, propagate, twoline2satrec } from 'satellite.js';
import { isPosition, type Feed, type Mark } from '../src/models.ts';
import { number, object, orbitalRecords, parseEvents, parseQuakes } from '../src/parsers.ts';
import { cached, download, empty } from './upstream.ts';

const minute = 60_000, hour = 60 * minute, day = 24 * hour;
const quakeWindows = { '1': 'day', '7': 'week', '30': 'month' } as const;
export type Period = keyof typeof quakeWindows;
export const isPeriod = (value: string): value is Period => Object.hasOwn(quakeWindows, value);

export function science(request: typeof fetch, now: () => number) {
  const json = async (url: string): Promise<unknown> => JSON.parse(await download(request, url));
  const quakes = Object.fromEntries(Object.entries(quakeWindows).map(([period, window]) => [period, cached(async (): Promise<Feed> => {
    const source = object(await json(`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_${window}.geojson`));
    const generated = number(object(source.metadata).generated), time = now();
    if (source.type !== 'FeatureCollection' || !Array.isArray(source.features) || !generated || generated > time + 5 * minute) throw Error('USGS invalide');
    if (time - generated > hour) return empty('unavailable', 'USGS ne fournit pas de catalogue récent.');
    const items = parseQuakes(source).sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
    const stale = time - generated > 5 * minute;
    return { status: stale ? 'stale' : 'fresh', items, updatedAt: generated, note: stale ? 'Le catalogue USGS a plus de cinq minutes.' : undefined };
  }, { ttl: minute, retry: minute, retain: hour, now })])) as Record<Period, () => Promise<Feed>>;

  const events = cached(async (): Promise<Feed> => {
    const source = object(await json('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=500'));
    if (!Array.isArray(source.events)) throw Error('EONET invalide');
    return { status: 'fresh', updatedAt: now(), items: parseEvents(source), note: 'Heure de consultation ; les dates d’observation sont indiquées dans les fiches.' };
  }, { ttl: 10 * minute, retry: 5 * minute, retain: day, now });

  const catalogues = ['stations', 'visual'].map(group => cached(async () => {
    const source = await download(request, `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=3le`, undefined, 300_000);
    const items = orbitalRecords(source);
    if (!items.length) throw Error('Sélection TLE vide');
    return { status: 'fresh', updatedAt: now(), items };
  }, { ttl: 2 * hour, retry: 30 * minute, retain: 7 * day, now }));
  const satellites = async (): Promise<Feed<Mark>> => {
    const feeds = await Promise.all(catalogues.map(load => load()));
    const time = now(), date = new Date(time), gmst = gstime(date);
    const selected = new Map<string, (typeof feeds)[number]['items'][number]>();
    for (const feed of feeds) for (const item of feed.items) {
      if (time - item.epoch > 7 * day || item.epoch - time > 5 * minute) continue;
      const id = item.one.slice(2, 7).trim();
      if (item.epoch > (selected.get(id)?.epoch ?? 0)) selected.set(id, item);
    }
    const items = [...selected].flatMap<Mark>(([id, item]) => {
      try {
        const xyz = propagate(twoline2satrec(item.one, item.two), date)?.position;
        if (!xyz) return [];
        const position = eciToGeodetic(xyz, gmst), lat = degreesLat(position.latitude), lng = degreesLong(position.longitude);
        return isPosition(lat, lng) && position.height > 0 ? [{ id, name: item.name, lat, lng, altitude: position.height / 6371,
          number: Math.round(position.height), observedAt: item.epoch, subtitle: 'Position estimée par SGP4' }] : [];
      } catch { return []; }
    });
    if (!items.length) return empty(feeds.some(feed => feed.status === 'limited') ? 'limited' : 'unavailable', 'Aucun élément orbital civil récent et utilisable.');
    const stale = feeds.some(feed => feed.status !== 'fresh') || items.some(item => time - item.observedAt! > 3 * day);
    return { status: stale ? 'stale' : 'fresh', items, updatedAt: time,
      note: stale ? 'Calcul SGP4 sur une sélection partielle ou des éléments orbitaux en retard.' : 'Heure du calcul SGP4, pas une mesure directe.' };
  };
  return { quakes, events, satellites };
}
