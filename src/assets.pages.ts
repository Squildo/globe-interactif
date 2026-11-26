import type { EditionAssets } from './assets.local';

export const editionAssets: EditionAssets = {
  night: new URL('../data/night-black-marble.jpg', import.meta.url).href,
  moon: new URL('../data/moon-nasa-svs.jpg', import.meta.url).href,
  relief: null, volcanoes: null, landings: null, airports: null, routes: null,
};
