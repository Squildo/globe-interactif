import { mkdir, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const raw = 'https://raw.githubusercontent.com/';
const globe = raw + 'vasturiano/globe.gl/6820a9c794bddde8e842bb203eaa698f6ed7adfe/';
const three = raw + 'vasturiano/three-globe/1e1f4400b80179809f761e632e207d9a3cfc298e/example/img/';
const flights = raw + 'jpatokal/openflights/a438edcb869bd882506add5abdb9ff1f4aae1ae7/data/';
const files = {
  'countries.geojson': globe + 'example/datasets/ne_110m_admin_0_countries.geojson',
  'cities.geojson': globe + 'example/datasets/ne_110m_populated_places_simple.geojson',
  'volcanoes.geojson': 'https://gis.ngdc.noaa.gov/arcgis/rest/services/web_mercator/hazards/MapServer/7/query?where=1%3D1&outFields=NAME,COUNTRY,MORPHOLOGY,ELEVATION&outSR=4326&f=geojson',
  'airports.csv': flights + 'airports.dat', 'routes.csv': flights + 'routes.dat',
  'landings.json': globe + 'example/moon-landing-sites/moon_landings.json',
  'earth.jpg': three + 'earth-blue-marble.jpg', 'night.jpg': three + 'earth-night.jpg',
  'topology.png': three + 'earth-topology.png', 'moon.jpg': globe + 'example/moon-landing-sites/lunar_surface.jpg',
  'clouds.jpg': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Fair_Weather_Cloud_Map.jpg/1920px-Fair_Weather_Cloud_Map.jpg',
};

await mkdir(new URL('../data/', import.meta.url), { recursive: true });
const results = await Promise.allSettled(Object.entries(files).map(async ([name, url]) => {
  const target = new URL(`../data/${name}`, import.meta.url);
  if (!process.argv.includes('--refresh') && await access(target).then(() => true, () => false)) return;
  const response = await fetch(url, { signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw Error(`${name}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (name.endsWith('.jpg') && bytes.readUInt16BE(0) !== 0xffd8) throw Error(`${name}: JPEG invalide`);
  if (name === 'clouds.jpg' && createHash('sha256').update(bytes).digest('hex') !== '975bef2a17e3cfb9ff9ea2303f7049423735cf4192b8b7a2d8eb18e71144cc67') throw Error(`${name}: empreinte différente de la texture référencée`);
  if (name.endsWith('.png') && !bytes.subarray(1, 4).equals(Buffer.from('PNG'))) throw Error(`${name}: PNG invalide`);
  if (name.endsWith('.geojson') && !Array.isArray(JSON.parse(bytes).features)) throw Error(`${name}: GeoJSON invalide`);
  if (name.endsWith('.json') && !Array.isArray(JSON.parse(bytes))) throw Error(`${name}: JSON invalide`);
  if (name.endsWith('.csv') && !/^\d+,|^[\w-]+,\d+/m.test(bytes.toString('utf8').slice(0, 300))) throw Error(`${name}: CSV invalide`);
  await writeFile(target, bytes);
  console.log(`${name} (${bytes.length} octets)`);
}));
for (const result of results) if (result.status === 'rejected') { console.error(result.reason); process.exitCode = 1; }
