type LocalOnly = 'relief' | 'volcanoes' | 'landings' | 'airports' | 'routes';
export type EditionAssets = Record<'night' | 'moon', string> & Record<LocalOnly, string | null>;

export const editionAssets: EditionAssets = {
  night: new URL('../data/night.jpg', import.meta.url).href,
  moon: new URL('../data/moon.jpg', import.meta.url).href,
  relief: new URL('../data/topology.png', import.meta.url).href,
  volcanoes: new URL('../data/volcanoes.geojson', import.meta.url).href,
  landings: new URL('../data/landings.json', import.meta.url).href,
  airports: new URL('../data/airports.csv', import.meta.url).href,
  routes: new URL('../data/routes.csv', import.meta.url).href,
};
