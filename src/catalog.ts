import type { Action, LayerId } from './atlas';
import { isPages, isStyleAvailable } from './edition';

export const groups = [
  { id: 'geo', name: 'Géographie', index: '01' }, { id: 'earth', name: 'Terre & phénomènes', index: '02' },
  { id: 'traffic', name: 'Mobilité & réseaux', index: '03' }, { id: 'orbit', name: 'Atmosphère & espace', index: '04' },
] as const;
export type GroupId = typeof groups[number]['id'];
export type Layer = {
  id: LayerId; title: string; group: GroupId; color: string; kind: 'Atlas' | 'Archive' | 'Flux' | 'Calcul' | 'Démo';
  source: string; url: string; description: string; restriction?: string;
};
const natural = 'https://www.naturalearthdata.com/';
const airRoutes = 'https://openflights.org/data';
const localData = isPages ? 'Ce jeu est réservé à l’édition locale : ses conditions de redistribution restent à vérifier.' : undefined;
const localService = isPages ? 'Ce flux nécessite le serveur de l’édition locale.' : undefined;
export const catalog: Layer[] = [
  { id: 'countries', title: 'Pays et frontières', group: 'geo', color: '#ddeda3', kind: 'Atlas', source: 'Natural Earth', url: natural, description: 'Limites et estimations par pays (échelle 1:110 M).' },
  { id: 'cities', title: 'Villes du monde', group: 'geo', color: '#f5c693', kind: 'Atlas', source: 'Natural Earth', url: natural, description: 'Sélection de villes et capitales. Le détail augmente au zoom.' },
  { id: 'population', title: 'Population urbaine', group: 'geo', color: '#f2ad70', kind: 'Archive', source: 'Natural Earth', url: natural, description: 'Estimations des villes de la sélection, pas un recensement mondial continu.' },
  { id: 'quakes', title: 'Séismes récents', group: 'earth', color: '#f5ab7c', kind: 'Flux', source: 'USGS', url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php', description: 'Événements enregistrés, actualisés à la minute ; catalogue révisable.' },
  { id: 'volcanoes', title: 'Volcans', group: 'earth', color: '#ec8d89', kind: 'Atlas', source: 'NOAA / Smithsonian GVP', url: 'https://gis.ngdc.noaa.gov/arcgis/rest/services/web_mercator/hazards/MapServer/7', description: 'Catalogue de volcans, sans indication d’activité actuelle.', restriction: localData },
  { id: 'events', title: 'Événements naturels', group: 'earth', color: '#f5d17d', kind: 'Flux', source: 'NASA EONET', url: 'https://eonet.gsfc.nasa.gov/docs/v3', description: 'Dernière position ponctuelle des événements ouverts signalés par EONET.' },
  { id: 'airports', title: 'Aéroports', group: 'traffic', color: '#a9d9ed', kind: 'Archive', source: 'OpenFlights', url: airRoutes, description: 'Instantané OpenFlights, non destiné à la navigation.', restriction: localData },
  { id: 'routes', title: 'Routes aériennes', group: 'traffic', color: '#8eb7f3', kind: 'Archive', source: 'OpenFlights', url: airRoutes, description: 'Liaisons historiques directes (2014), regroupées par paire d’aéroports ; une sélection est affichée.', restriction: localData },
  { id: 'air', title: 'Trafic aérien', group: 'traffic', color: '#91d9f1', kind: 'Flux', source: 'adsb.lol', url: 'https://www.adsb.lol/docs/open-data/api', description: 'Densité régionale de certaines catégories d’appareils. Couverture et classification partielles.', restriction: localService },
  { id: 'sea', title: 'Trafic maritime', group: 'traffic', color: '#88d9c9', kind: 'Flux', source: 'AISStream', url: 'https://aisstream.io/documentation', description: 'Densité du trafic passagers, fret et pétroliers signalé en Manche orientale. Couverture partielle.', restriction: localService },
  { id: 'cables', title: 'Câbles sous-marins', group: 'traffic', color: '#a0d4b9', kind: 'Atlas', source: 'TeleGeography (référence)', url: 'https://www2.telegeography.com/submarine-cable-faqs-frequently-asked-questions', description: 'Cité dans Globe.gl ; non intégré en attendant une source dont les droits de réutilisation sont établis.', restriction: 'Source à valider.' },
  { id: 'satellites', title: 'Satellites et ISS', group: 'orbit', color: '#c4bcf7', kind: 'Calcul', source: 'CelesTrak', url: 'https://celestrak.org/NORAD/documentation/gp-data-formats.php', description: 'Positions estimées (SGP4), obtenues à partir d’éléments orbitaux datés ; sélection civile.' },
  { id: 'clouds', title: 'Nuages illustratifs', group: 'orbit', color: '#e5ebe1', kind: 'Démo', source: 'Natural Earth III · Globe.gl', url: 'https://commons.wikimedia.org/wiki/File:Fair_Weather_Cloud_Map.jpg', description: 'Carte nuageuse illustrative en rotation, d’après l’exemple Globe.gl. Ne représente pas la météo actuelle.' },
  { id: 'moon-landings', title: 'Sites d’alunissage', group: 'orbit', color: '#e3c3a1', kind: 'Archive', source: 'Exemple Globe.gl', url: 'https://github.com/vasturiano/globe.gl/tree/master/example/moon-landing-sites', description: 'Sites historiques documentés dans la démo.', restriction: localData },
];
export const getLayer = (id: LayerId) => catalog.find(layer => layer.id === id)!;

export function checkAvailability(actions: readonly Action[]): string | undefined {
  for (const action of actions) {
    if (action.type === 'layer' && action.enabled) {
      const layer = getLayer(action.id);
      if (layer.restriction) return `${layer.title} : ${layer.restriction}`;
    }
    if (action.type === 'style' && !isStyleAvailable(action.value)) return 'Le fond relief est réservé à l’édition locale.';
  }
}
