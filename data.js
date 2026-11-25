const IMG = {
  satellite: 'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg',
  night: 'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg',
  topology: 'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png',
  water: 'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-water.png',
  stars: 'https://cdn.jsdelivr.net/npm/three-globe/example/img/night-sky.png'
};

const API = {
  countries: 'https://unpkg.com/globe.gl/example/datasets/ne_110m_admin_0_countries.geojson',
  cities: 'https://unpkg.com/globe.gl/example/datasets/ne_110m_populated_places_simple.geojson',
  volcanoes: 'https://unpkg.com/globe.gl/example/datasets/world_volcanoes.json',
  restcountries: 'https://restcountries.com/v3.1/all?fields=name,cca3,population,area,region,capital,latlng,landlocked',
  usgs: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson',
  eonet: 'https://eonet.gsfc.nasa.gov/api/v3/events/geojson?status=open&limit=50',
  eonetAlt: 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=50',
  iss: 'https://api.wheretheiss.at/v1/satellites/25544',
  meteo: (lat, lng) => 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lng + '&current=temperature_2m,wind_speed_10m,wind_direction_10m',
  marine: (lat, lng) => 'https://marine-api.open-meteo.com/v1/marine?latitude=' + lat + '&longitude=' + lng + '&current=wave_height,wave_direction,wave_period,ocean_current_velocity,ocean_current_direction'
};

const RANGES = [
  { name: 'Himalaya', metric: '8 848 m (Everest)', points: [[34.6,73.0],[35.5,74.5],[36.2,74.0],[35.0,76.5],[33.9,75.0],[32.5,77.0],[31.5,78.0],[30.4,79.5],[29.5,81.5],[28.5,84.0],[27.99,86.93],[28.2,87.5],[27.7,88.1],[27.0,88.3],[26.4,88.0],[25.7,88.0],[25.2,88.0]] },
  { name: 'Andes', metric: '6 961 m (Aconcagua)', points: [[-4.5,-79.5],[-10,-77.5],[-15,-72],[-20,-70],[-25,-70.3],[-32.65,-70.02],[-38,-71],[-45,-72.5],[-50,-73.5],[-54,-71],[-54.8,-68.3]] },
  { name: 'Alpes', metric: '4 808 m (Mont Blanc)', points: [[43.7,6.8],[44.4,6.9],[45.83,6.86],[46.5,8.5],[47.0,10.5],[47.8,13.0],[46.8,12.5],[45.9,10.0],[44.6,8.0]] },
  { name: 'Rocheuses', metric: '4 401 m (mont Elbert)', points: [[48.8,-125.5],[49.0,-120.0],[48.0,-114.0],[46.5,-112.0],[44.5,-110.5],[43.0,-109.5],[41.0,-106.5],[39.12,-106.45],[37.5,-105.5],[35.5,-105.6],[33.0,-105.5],[31.8,-106.4]] },
  { name: 'Rift est-africain', metric: '5 895 m (Kilimandjaro)', points: [[11.0,41.5],[8.0,39.0],[5.0,36.5],[0.0,35.0],[-3.07,37.35],[-6.0,35.5],[-10.0,34.0],[-15.0,32.0],[-20.0,30.5],[-26.0,28.5],[-33.9,26.0]] }
];

const PEAKS = [
  { layer: 'peak', name: 'Everest', lat: 27.99, lng: 86.93, elev: 8848, color: '#e8c39e' },
  { layer: 'peak', name: 'Aconcagua', lat: -32.65, lng: -70.02, elev: 6961, color: '#e8c39e' },
  { layer: 'peak', name: 'Mont Blanc', lat: 45.83, lng: 6.86, elev: 4808, color: '#e8c39e' },
  { layer: 'peak', name: 'Kilimandjaro', lat: -3.07, lng: 37.35, elev: 5895, color: '#e8c39e' },
  { layer: 'peak', name: 'Mont Elbert', lat: 39.12, lng: -106.45, elev: 4401, color: '#e8c39e' }
];

const RIVERS = [
  { name: 'Amazone', metric: '≈ 6 400 km', points: [[-10.9,-73.9],[-7.5,-75.0],[-4.5,-72.5],[-3.75,-73.25],[-4.0,-70.0],[-3.1,-60.0],[-2.2,-55.5],[-1.5,-52.5],[-0.5,-50.2]] },
  { name: 'Nil', metric: '≈ 6 650 km', points: [[-1.3,33.2],[0.3,33.2],[3.5,32.7],[6.5,32.3],[9.5,31.8],[12.0,32.3],[15.5,32.55],[18.5,32.6],[22.0,32.6],[25.7,32.3],[28.0,32.5],[29.9,31.1],[31.3,30.05]] },
  { name: 'Yangtsé', metric: '≈ 6 300 km', points: [[33.7,96.5],[33.0,99.0],[31.5,101.5],[30.5,104.0],[29.56,106.55],[28.5,109.5],[27.5,112.5],[30.6,114.3],[29.9,116.5],[32.06,118.8],[31.5,120.5],[31.2,121.5]] },
  { name: 'Mississippi', metric: '≈ 3 770 km', points: [[47.2,-94.3],[44.9,-93.4],[42.5,-90.5],[39.5,-91.4],[37.2,-89.5],[35.5,-91.2],[33.9,-91.3],[31.5,-91.5],[30.45,-91.15],[29.95,-90.07],[29.2,-89.5]] },
  { name: 'Danube', metric: '≈ 2 860 km', points: [[48.07,8.5],[48.57,13.46],[48.3,16.4],[47.5,19.05],[46.2,20.2],[44.8,20.45],[44.4,22.9],[43.7,24.0],[44.2,28.7],[44.5,29.5]] }
];

const CURRENTS = [
  { name: 'Gulf Stream', a: [25.8,-79.5], b: [41.0,-52.0], warm: true },
  { name: 'Dérive nord-atlantique', a: [41.0,-52.0], b: [56.0,-22.0], warm: true },
  { name: 'Kuroshio', a: [24.0,124.0], b: [38.5,150.0], warm: true },
  { name: 'Courant des Canaries', a: [32.0,-22.0], b: [14.0,-26.0], warm: false },
  { name: 'Courant de Californie', a: [40.0,-132.0], b: [24.0,-114.0], warm: false },
  { name: 'Courant du Humboldt', a: [-5.0,-81.5], b: [-36.0,-73.0], warm: false },
  { name: 'Courant du Brésil', a: [-24.0,-46.0], b: [-38.5,-57.0], warm: true },
  { name: 'Courant du Benguela', a: [-24.0,12.5], b: [-35.0,19.5], warm: false },
  { name: 'Courant des Aiguilles (Agulhas)', a: [-32.0,29.0], b: [-34.0,60.0], warm: true },
  { name: 'Courant circumpolaire antarctique', a: [-62.0,-20.0], b: [-62.0,140.0], warm: false },
  { name: 'Courant du Labrador', a: [60.0,-56.0], b: [49.0,-46.0], warm: false },
  { name: 'Oyashio', a: [45.0,143.0], b: [41.0,162.0], warm: false },
  { name: 'Courant équatorial Nord', a: [6.0,-32.0], b: [12.0,-18.0], warm: true },
  { name: 'Courant équatorial Sud', a: [-6.0,-12.0], b: [-10.0,2.0], warm: true },
  { name: 'Courant de Somalie', a: [4.0,48.0], b: [10.5,64.0], warm: true },
  { name: 'Courant est-australien', a: [-25.0,154.0], b: [-38.0,168.0], warm: true }
];

const PORTS = [
  { name: 'Shanghai', lat: 31.23, lng: 121.47, metric: '47,3 M EVP/an' },
  { name: 'Singapour', lat: 1.29, lng: 103.85, metric: '39,0 M EVP/an' },
  { name: 'Ningbo-Zhoushan', lat: 29.9, lng: 122.1, metric: '33,4 M EVP/an' },
  { name: 'Qingdao', lat: 36.07, lng: 120.38, metric: '25,0 M EVP/an' },
  { name: 'Shenzhen', lat: 22.53, lng: 113.93, metric: '28,2 M EVP/an' },
  { name: 'Busan', lat: 35.1, lng: 129.04, metric: '22,9 M EVP/an' },
  { name: 'Jebel Ali (Dubaï)', lat: 25.01, lng: 55.06, metric: '15,5 M EVP/an' },
  { name: 'Rotterdam', lat: 51.92, lng: 4.48, metric: '14,5 M EVP/an' },
  { name: 'Anvers', lat: 51.27, lng: 4.4, metric: '12,0 M EVP/an' },
  { name: 'Los Angeles–Long Beach', lat: 33.75, lng: -118.2, metric: '9,3 M EVP/an' },
  { name: 'Hambourg', lat: 53.54, lng: 9.98, metric: '8,3 M EVP/an' },
  { name: 'New York–New Jersey', lat: 40.7, lng: -74.0, metric: '7,5 M EVP/an' },
  { name: 'Mumbai (Nhava Sheva)', lat: 18.95, lng: 72.84, metric: '6,0 M EVP/an' },
  { name: 'Tokyo', lat: 35.62, lng: 139.78, metric: '5,2 M EVP/an' },
  { name: 'Santos', lat: -23.96, lng: -46.33, metric: '4,8 M EVP/an' }
];

const STRAITS = [
  { name: 'Détroit d’Ormuz', lat: 26.6, lng: 56.4, metric: '≈ 20 % du pétrole mondial transite ici' },
  { name: 'Détroit de Malacca', lat: 2.2, lng: 101.8, metric: '≈ 25 % du commerce mondial' },
  { name: 'Bab-el-Mandeb', lat: 12.6, lng: 43.4, metric: 'Porte de la mer Rouge' },
  { name: 'Canal de Suez', lat: 29.95, lng: 32.55, metric: '≈ 12 % du commerce mondial' },
  { name: 'Canal de Panama', lat: 9.4, lng: -79.9, metric: '≈ 5 % du commerce mondial' },
  { name: 'Détroit de Gibraltar', lat: 35.95, lng: -5.35, metric: 'Porte de la Méditerranée' },
  { name: 'Bosphore', lat: 41.05, lng: 29.0, metric: '≈ 3 M barils/j de pétrole' },
  { name: 'Détroit de la Sonde', lat: -5.9, lng: 105.9, metric: 'Voie vers l’Indonésie orientale' },
  { name: 'Détroit de Torres', lat: -10.5, lng: 142.0, metric: 'Passage Australie–Papouasie' },
  { name: 'Détroit de Béring', lat: 65.8, lng: -168.9, metric: 'Frontière maritime Pacifique/Arctique' },
  { name: 'Pas de Calais (Dover)', lat: 51.15, lng: 1.5, metric: 'Voie maritime la plus fréquentée du monde' }
];

const ROUTES = [
  { name: 'Asie–Europe via Suez', metric: '≈ 22 M EVP/an', points: [[31.23,121.47],[1.29,103.85],[2.2,101.8],[6.93,79.86],[12.6,43.4],[29.95,32.55],[36.8,10.3],[43.3,5.4],[51.92,4.48]] },
  { name: 'Transpacifique', metric: '≈ 18 M EVP/an', points: [[31.23,121.47],[35.62,139.78],[33.0,-170.0],[33.75,-118.2]] },
  { name: 'Asie–Moyen-Orient', metric: '≈ 14 M EVP/an', points: [[1.29,103.85],[2.2,101.8],[12.6,43.4],[26.6,56.4],[25.01,55.06]] },
  { name: 'Transatlantique', metric: '≈ 12 M EVP/an', points: [[51.92,4.48],[40.7,-74.0]] },
  { name: 'Canal de Panama', metric: '≈ 5 M EVP/an', points: [[40.7,-74.0],[9.4,-79.9],[33.75,-118.2]] },
  { name: 'Route du Cap', metric: 'Détournement par le cap de Bonne-Espérance', points: [[1.29,103.85],[-33.93,18.42],[51.92,4.48]] },
  { name: 'Route maritime du Nord', metric: '≈ 1 300 navires/an (saisonnier, Arctique)', points: [[51.92,4.48],[59.9,30.2],[69.5,33.1],[65.8,-168.9],[40.0,142.0],[35.62,139.78]] }
];

const CABLES = [
  { name: 'MAREA', from: 'Virginia Beach (US)', a: [36.83,-76.28], to: 'Bilbao (ES)', b: [43.39,-3.83], km: 6600, tbsp: 160 },
  { name: 'Dunant', from: 'Virginia Beach (US)', a: [36.83,-76.28], to: 'Saint-Hilaire-de-Riez (FR)', b: [46.72,-2.20], km: 6400, tbsp: 250 },
  { name: 'Grace Hopper', from: 'Sennen Cove (UK)', a: [50.07,-5.67], to: 'Bilbao (ES)', b: [43.39,-3.83], km: 7000, tbsp: 72 },
  { name: 'Amitié', from: 'Le Porge (FR)', a: [44.82,-1.11], to: 'Virginia Beach (US)', b: [36.83,-76.28], km: 6700, tbsp: 23 },
  { name: '2Africa', from: 'Marseille (FR)', a: [43.30,5.37], to: 'Le Cap (ZA)', b: [-33.93,18.42], km: 45000, tbsp: 180 },
  { name: 'SEA-ME-WE 5', from: 'Singapour (SG)', a: [1.29,103.85], to: 'Marseille (FR)', b: [43.30,5.37], km: 20000, tbsp: 38 },
  { name: 'FASTER', from: 'Pacific City, Oregon (US)', a: [45.20,-123.97], to: 'Chikura (JP)', b: [35.07,140.05], km: 9000, tbsp: 60 },
  { name: 'Curie', from: 'Valparaíso (CL)', a: [-33.05,-71.62], to: 'Los Angeles (US)', b: [33.74,-118.27], km: 8700, tbsp: 72 },
  { name: 'SEA-US', from: 'Manasquan, New Jersey (US)', a: [40.11,-74.01], to: 'Hawaï (US)', b: [21.6,-158.0], km: 8000, tbsp: 80 },
  { name: 'TAT-14', from: 'Bude (UK)', a: [50.83,-4.55], to: 'Saint-Hilaire-de-Riez (FR)', b: [46.72,-2.20], km: 7500, tbsp: 40 },
  { name: 'Apollo', from: 'Bude (UK)', a: [50.83,-4.55], to: 'Shirley, NY (US)', b: [40.80,-72.88], km: 6600, tbsp: 80 },
  { name: 'EXA Atlantic', from: 'Halifax (CA)', a: [44.65,-63.57], to: 'Bilbao (ES)', b: [43.39,-3.83], km: 5200, tbsp: 40 },
  { name: 'Hibernia Express', from: 'Halifax (CA)', a: [44.65,-63.57], to: 'Brean (UK)', b: [51.29,-3.01], km: 4600, tbsp: 53 },
  { name: 'Southern Cross (SCCN)', from: 'Sydney (AU)', a: [-33.87,151.21], to: 'Hawaï (US)', b: [21.6,-158.0], km: 11000, tbsp: 60 },
  { name: 'Japan–US Cable Network', from: 'Shima (JP)', a: [34.32,136.82], to: 'Nedonna Beach, Oregon (US)', b: [45.72,-123.95], km: 9900, tbsp: 40 }
];

const TRENCHES = [
  { name: 'Fosse des Mariannes', lat: 11.37, lng: 142.59, metric: '-10 994 m (Challenger Deep)' },
  { name: 'Fosse des Tonga', lat: -21.5, lng: -175.2, metric: '-10 882 m' },
  { name: 'Fosse de Porto Rico', lat: 19.6, lng: -66.5, metric: '-8 376 m' },
  { name: 'Fosse de Java (Sonde)', lat: -10.3, lng: 109.7, metric: '-7 725 m' },
  { name: 'Fosse Pérou-Chili', lat: -20.0, lng: -72.5, metric: '-8 069 m' }
];

const FAULTS = [
  { name: 'Ceinture de feu du Pacifique', metric: '≈ 40 000 km de limites de plaques', points: [[-54,-70],[-40,-73],[-25,-70],[-10,-78],[0,-80],[10,-78],[15,-95],[20,-105],[28,-112],[35,-120],[42,-125],[50,-130],[55,-155],[60,-170],[62,-175],[55,-160],[50,-140],[45,-125],[38,-122],[32,-118],[25,-110],[20,-106],[15,-92],[8,-78],[0,-80],[-10,-78],[-25,-70],[-40,-73]] },
  { name: 'Faille de San Andreas', metric: '≈ 1 300 km, décrochement dextre', points: [[31.8,-114.7],[33.0,-116.5],[34.5,-118.5],[36.0,-121.0],[37.5,-122.5],[38.5,-123.0],[40.0,-124.2],[41.5,-124.0],[42.8,-124.5]] },
  { name: 'Dorsale médio-atlantique', metric: '≈ 16 000 km, limite divergente', points: [[-55,-5],[-45,-10],[-35,-15],[-25,-15],[-15,-12],[-5,-15],[0,-18],[10,-25],[20,-35],[30,-42],[40,-45],[50,-45],[55,-42],[62,-36],[66,-30]] }
];

const FALLBACK_QUAKES = [
  { lat: 46.2, lng: 149.5, mag: 6.0, depth: 35, place: 'Îles Kouriles, Russie', hoursAgo: 2 },
  { lat: 36.0, lng: 141.0, mag: 5.4, depth: 10, place: 'Près de la côte est de Honshu, Japon', hoursAgo: 5 },
  { lat: 35.7, lng: -117.5, mag: 4.8, depth: 12, place: 'Californie du Sud, USA', hoursAgo: 8 },
  { lat: -2.5, lng: 120.0, mag: 6.2, depth: 20, place: 'Sulawesi, Indonésie', hoursAgo: 11 },
  { lat: -33.0, lng: -70.5, mag: 5.8, depth: 25, place: 'Santiago, Chili', hoursAgo: 14 },
  { lat: 38.0, lng: 37.0, mag: 5.5, depth: 10, place: 'Turquie orientale', hoursAgo: 18 },
  { lat: 61.5, lng: -147.5, mag: 5.9, depth: 18, place: 'Alaska, USA', hoursAgo: 21 },
  { lat: 64.0, lng: -21.5, mag: 4.9, depth: 8, place: 'Islande', hoursAgo: 26 },
  { lat: 38.2, lng: 14.9, mag: 4.7, depth: 10, place: 'Sicile, Italie', hoursAgo: 30 },
  { lat: -15.5, lng: -74.5, mag: 5.7, depth: 95, place: 'Pérou', hoursAgo: 36 },
  { lat: 38.5, lng: 20.8, mag: 5.2, depth: 12, place: 'Îles Ioniennes, Grèce', hoursAgo: 44 },
  { lat: -41.5, lng: 174.0, mag: 5.5, depth: 120, place: 'Île du Sud, Nouvelle-Zélande', hoursAgo: 52 },
  { lat: 13.0, lng: 125.5, mag: 6.1, depth: 45, place: 'Leyte, Philippines', hoursAgo: 60 },
  { lat: 39.4, lng: -119.8, mag: 4.6, depth: 8, place: 'Nevada, USA', hoursAgo: 70 }
];

const FALLBACK_EONET = (() => {
  const H = 3600e3, now = Date.now();
  return [
    { lat: 55.0, lng: -115.0, name: 'Feux de forêt — Alberta, Canada', cat: 'Wildfires', date: new Date(now - 30 * H).toISOString(), id: 'EONET_5101', link: 'https://eonet.gsfc.nasa.gov' },
    { lat: -33.0, lng: 150.0, name: 'Feux de forêt — Nouvelle-Galles du Sud, Australie', cat: 'Wildfires', date: new Date(now - 52 * H).toISOString(), id: 'EONET_5102', link: 'https://eonet.gsfc.nasa.gov' },
    { lat: 28.0, lng: -90.0, name: 'Tempête tropicale — golfe du Mexique', cat: 'Severe Storms', date: new Date(now - 12 * H).toISOString(), id: 'EONET_5103', link: 'https://eonet.gsfc.nasa.gov' },
    { lat: 40.0, lng: -40.0, name: 'Dépression atlantique — Atlantique Nord', cat: 'Severe Storms', date: new Date(now - 20 * H).toISOString(), id: 'EONET_5104', link: 'https://eonet.gsfc.nasa.gov' },
    { lat: 64.8, lng: -17.5, name: 'Éruption — Reykjanes, Islande', cat: 'Volcanoes', date: new Date(now - 8 * H).toISOString(), id: 'EONET_5105', link: 'https://eonet.gsfc.nasa.gov' },
    { lat: 37.75, lng: 14.99, name: 'Activité — Etna, Italie', cat: 'Volcanoes', date: new Date(now - 16 * H).toISOString(), id: 'EONET_5106', link: 'https://eonet.gsfc.nasa.gov' },
    { lat: 56.0, lng: 160.5, name: 'Activité — Klyuchevskoy, Kamchatka', cat: 'Volcanoes', date: new Date(now - 40 * H).toISOString(), id: 'EONET_5107', link: 'https://eonet.gsfc.nasa.gov' },
    { lat: -70.0, lng: 0.0, name: 'Glace de mer dérivante — Antarctique', cat: 'Sea and Lake Ice', date: new Date(now - 26 * H).toISOString(), id: 'EONET_5108', link: 'https://eonet.gsfc.nasa.gov' },
    { lat: 30.0, lng: 70.0, name: 'Inondations — Pakistan', cat: 'Floods', date: new Date(now - 60 * H).toISOString(), id: 'EONET_5109', link: 'https://eonet.gsfc.nasa.gov' }
  ];
})();

const FALLBACK_CITIES = {
  type: 'FeatureCollection',
  features: [
    ['Tokyo', 35.68, 139.69, 37200000], ['Delhi', 28.61, 77.21, 32900000], ['Shanghai', 31.23, 121.47, 29200000],
    ['Dacca', 23.81, 90.41, 23200000], ['São Paulo', -23.55, -46.63, 22600000], ['Le Caire', 30.04, 31.24, 22200000],
    ['Mexico', 19.43, -99.13, 22300000], ['Pékin', 39.9, 116.4, 21800000], ['Mumbai', 19.08, 72.88, 21300000],
    ['Osaka', 34.69, 135.5, 19000000], ['Chongqing', 29.56, 106.55, 17300000], ['Karachi', 24.86, 67.0, 16800000],
    ['Istanbul', 41.01, 28.98, 16600000], ['Kinshasa', -4.32, 15.31, 17000000], ['Moscou', 55.76, 37.62, 13000000],
    ['New York', 40.71, -74.01, 18800000], ['Londres', 51.51, -0.13, 9000000], ['Paris', 48.86, 2.35, 11200000],
    ['Los Angeles', 34.05, -118.24, 12400000], ['Lagos', 6.52, 3.38, 15900000], ['Buenos Aires', -34.6, -58.38, 15500000],
    ['Rio de Janeiro', -22.91, -43.17, 13500000], ['Jakarta', -6.21, 106.85, 11000000], ['Lima', -12.05, -77.04, 11000000],
    ['Séoul', 37.57, 126.98, 9700000], ['Madrid', 40.42, -3.7, 6800000], ['Bangkok', 13.76, 100.5, 11000000],
    ['Téhéran', 35.69, 51.39, 9200000], ['Le Cap', -33.92, 18.42, 4700000], ['Sydney', -33.87, 151.21, 5300000]
  ].map(([name, lat, lng, pop]) => ({
    type: 'Feature',
    properties: { name, pop_max: pop },
    geometry: { type: 'Point', coordinates: [lng, lat] }
  }))
};

const FALLBACK_VOLCANOES = [
  { name: 'Etna', lat: 37.75, lng: 14.99, elev: 3357, country: 'Italie' },
  { name: 'Kilauea', lat: 19.42, lng: -155.29, elev: 1247, country: 'USA (Hawaï)' },
  { name: 'Fuji', lat: 35.36, lng: 138.73, elev: 3776, country: 'Japon' },
  { name: 'Pinatubo', lat: 15.14, lng: 120.35, elev: 1486, country: 'Philippines' },
  { name: 'Eyjafjallajökull', lat: 63.63, lng: -19.62, elev: 1651, country: 'Islande' },
  { name: 'Vésuve', lat: 40.82, lng: 14.43, elev: 1281, country: 'Italie' },
  { name: 'Stromboli', lat: 38.79, lng: 15.21, elev: 924, country: 'Italie' },
  { name: 'Popocatépetl', lat: 19.02, lng: -98.62, elev: 5426, country: 'Mexique' },
  { name: 'Cotopaxi', lat: -0.68, lng: -78.44, elev: 5897, country: 'Équateur' },
  { name: 'Villarrica', lat: -39.42, lng: -71.93, elev: 2847, country: 'Chili' },
  { name: 'Sakurajima', lat: 31.59, lng: 130.66, elev: 1117, country: 'Japon' },
  { name: 'Merapi', lat: -7.54, lng: 110.44, elev: 2930, country: 'Indonésie' },
  { name: 'Semeru', lat: -8.11, lng: 112.92, elev: 3676, country: 'Indonésie' },
  { name: 'Agung', lat: -8.34, lng: 115.51, elev: 3031, country: 'Indonésie' },
  { name: 'Tambora', lat: -8.25, lng: 118.0, elev: 2851, country: 'Indonésie' },
  { name: 'Krakatoa', lat: -6.1, lng: 105.42, elev: 813, country: 'Indonésie' },
  { name: 'Mauna Loa', lat: 19.48, lng: -155.6, elev: 4169, country: 'USA (Hawaï)' },
  { name: 'Cal caldeira de Yellowstone', lat: 44.43, lng: -110.67, elev: 2805, country: 'USA' },
  { name: 'Campi Flegrei', lat: 40.83, lng: 14.14, elev: 458, country: 'Italie' },
  { name: 'Santorin', lat: 36.4, lng: 25.4, elev: 367, country: 'Grèce' },
  { name: 'Teide', lat: 28.27, lng: -16.64, elev: 3715, country: 'Espagne (Canaries)' },
  { name: 'Kilimandjaro', lat: -3.07, lng: 37.35, elev: 5895, country: 'Tanzanie' },
  { name: 'Mont Cameroun', lat: 4.2, lng: 9.17, elev: 4095, country: 'Cameroun' },
  { name: 'Nyiragongo', lat: -1.52, lng: 29.25, elev: 3470, country: 'RD Congo' },
  { name: 'Erta Ale', lat: 13.6, lng: 40.67, elev: 613, country: 'Éthiopie' },
  { name: 'Bárðarbunga', lat: 64.63, lng: -17.53, elev: 2009, country: 'Islande' },
  { name: 'Hekla', lat: 63.98, lng: -19.7, elev: 1491, country: 'Islande' }
];
