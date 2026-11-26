import { useEffect, useMemo, useState } from 'react';
import { editionAssets } from '#edition-assets';
import { normalize, type Atlas, type LayerId } from './atlas';
import { getLayer } from './catalog';
import { isPages } from './edition';
import { live, type FeedLoader } from './live';
import type { Area, Feed, Mark, Place, Route } from './models';
import { list, object, parseAirports, parseAreas, parsePlaces, parseRoutes, number, text } from './parsers';

export const textures = {
  earth: new URL('../data/earth.jpg', import.meta.url).href,
  night: editionAssets.night, relief: editionAssets.relief, moon: editionAssets.moon,
  clouds: new URL('../data/clouds.jpg', import.meta.url).href,
};
const files = {
  countries: new URL('../data/countries.geojson', import.meta.url).href, cities: new URL('../data/cities.geojson', import.meta.url).href,
  volcanoes: editionAssets.volcanoes, landings: editionAssets.landings, airports: editionAssets.airports, routes: editionAssets.routes,
};
async function load(url: string | null) {
  if (!url) throw Error('Source réservée à l’édition locale');
  const response = await fetch(url);
  if (!response.ok) throw Error('Source indisponible');
  return response;
}
const readers = {
  countries: () => load(files.countries).then(r => r.json()).then(parseAreas),
  cities: () => load(files.cities).then(r => r.json()).then(v => parsePlaces(v)),
  volcanoes: () => load(files.volcanoes).then(r => r.json()).then(v => parsePlaces(v, true)),
  airports: () => load(files.airports).then(r => r.text()).then(parseAirports),
  routes: () => Promise.all([load(files.routes).then(r => r.text()), staticRead('airports')]).then(([csv, airports]) => parseRoutes(csv, airports)),
  landings: (): Promise<Mark[]> => load(files.landings).then(r => r.json()).then(raw => list(raw).flatMap((item, i) => {
    const p = object(item), lat = number(p.lat), lng = number(p.lng);
    return lat !== undefined && lng !== undefined ? [{ lat, lng, name: text(p.label), id: String(i), subtitle: `${text(p.agency)} · ${text(p.date)}`, code: text(p.program) }] : [];
  })),
};
type Reads = { [K in keyof typeof readers]: Awaited<ReturnType<typeof readers[K]>> };
const cache = new Map<keyof Reads, Promise<unknown>>();
function staticRead<K extends keyof Reads>(key: K): Promise<Reads[K]> {
  if (!cache.has(key)) cache.set(key, readers[key]().catch(error => { cache.delete(key); throw error; }));
  return cache.get(key) as Promise<Reads[K]>;
}
const EMPTY: never[] = [];
function useStatic<K extends keyof Reads>(key: K, enabled = true): [Reads[K], boolean] {
  const [data, setData] = useState<Reads[K]>(), [error, setError] = useState(false);
  useEffect(() => {
    if (!enabled || data) return;
    let valid = true;
    setError(false);
    staticRead(key).then(value => { if (valid) setData(value); }).catch(() => { if (valid) setError(true); });
    return () => { valid = false; };
  }, [data, enabled, key]);
  return [data ?? EMPTY, error];
}

const pending: Feed = { status: 'loading', items: EMPTY, updatedAt: null };
function useFeed(load: FeedLoader | undefined, enabled: boolean, interval: number): Feed {
  const [current, set] = useState<{ load: FeedLoader; feed: Feed }>();
  useEffect(() => {
    if (!enabled || !load) return;
    let valid = true;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController;
    const refresh = async () => {
      if (document.visibilityState === 'hidden') { timer = setTimeout(refresh, interval); return; }
      controller = new AbortController();
      try {
        const feed = await load(controller.signal);
        if (valid) set({ load, feed });
      } catch {
        const note = isPages ? 'Le flux public n’a pas pu être chargé.' : 'Le serveur local ne répond pas.';
        if (valid) set({ load, feed: { status: 'unavailable', items: EMPTY, updatedAt: null, note } });
      } finally {
        if (valid) timer = setTimeout(refresh, interval);
      }
    };
    void refresh();
    return () => { valid = false; clearTimeout(timer); controller?.abort(); };
  }, [enabled, interval, load]);
  return enabled && current && current.load === load ? current.feed : pending;
}

export function useAtlasData(state: Atlas) {
  const has = (id: LayerId) => !getLayer(id).restriction && state.active.includes(id) && (state.body === 'moon' ? id === 'moon-landings' : id !== 'moon-landings');
  const [countries, countryError] = useStatic('countries'), [cities, cityError] = useStatic('cities');
  const [volcanoes, volcanoError] = useStatic('volcanoes', has('volcanoes'));
  const [airports, airportError] = useStatic('airports', has('airports') || has('routes'));
  const [routes, routeError] = useStatic('routes', has('routes'));
  const [landings, landingError] = useStatic('landings', has('moon-landings'));
  const quakeLoader = useMemo(() => live.quakes(state.period), [state.period]);
  const airLoader = useMemo(() => live.air(state.region), [state.region]);
  const quakes = useFeed(quakeLoader, has('quakes'), 60_000);
  const events = useFeed(live.events, has('events'), 600_000);
  const air = useFeed(airLoader, has('air'), 180_000);
  const sea = useFeed(live.sea, has('sea'), 20_000);
  const satellites = useFeed(live.satellites, has('satellites'), 25_000);
  const filteredQuakes = useMemo(() => quakes.items.filter(item => (item.number ?? 0) >= state.minMagnitude), [quakes.items, state.minMagnitude]);
  const places = useMemo<Place[]>(() => [
    ...countries.map(area => ({ ...area.center, id: `country-${area.id}`, name: area.name, context: 'Pays', aliases: [area.nativeName], altitude: 0.95 })),
    ...cities.map(mark => ({ ...mark, id: `city-${mark.id}`, context: mark.subtitle || 'Ville', altitude: 0.52 })),
    ...airports.map(mark => ({ ...mark, id: `airport-${mark.id}`, context: mark.code ? `Aéroport · ${mark.code}` : 'Aéroport', aliases: mark.code ? [mark.code] : [], altitude: 0.47 })),
  ], [countries, cities, airports]);
  const errors = { countries: countryError, cities: cityError, population: cityError, volcanoes: volcanoError, airports: airportError, routes: routeError, 'moon-landings': landingError };
  const counts: Partial<Record<LayerId, number>> = {
    countries: countries.length, cities: cities.length, population: cities.length, quakes: filteredQuakes.length, volcanoes: volcanoes.length,
    events: events.items.length, airports: airports.length, routes: routes.length, air: air.items.length,
    sea: sea.items.length, satellites: satellites.items.length, 'moon-landings': landings.length,
  };
  return { countries, cities, volcanoes, airports, routes, landings, places, errors, counts, quakes, filteredQuakes, events, air, sea, satellites };
}
export type AtlasData = ReturnType<typeof useAtlasData>;
export function searchPlaces(places: Place[], input: string, limit = 6) {
  const query = normalize(input);
  if (query.length < 2) return [];
  return places.map(place => ({ place, rank: Math.max(...[place.name, ...(place.aliases ?? [])].map(name => {
    const value = normalize(name);
    return value === query ? 3 : value.startsWith(query) ? 2 : value.includes(query) ? 1 : 0;
  })) })).filter(match => match.rank).sort((a, b) => b.rank - a.rank).slice(0, limit).map(match => match.place);
}

export type { Area, Route };
