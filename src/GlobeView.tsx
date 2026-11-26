import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Globe, { type GlobeMethods, type GlobeProps } from 'react-globe.gl';
import { AmbientLight, DirectionalLight, MeshBasicMaterial } from 'three';
import type { Atlas, LayerId } from './atlas';
import { getLayer } from './catalog';
import { textures, type AtlasData } from './data';
import { useGlobeMarkers, type Marker } from './GlobeMarkers';
import { useGlobeBorders } from './GlobeBorders';
import { useGlobeClouds } from './GlobeClouds';
import type { Area, Mark, Position, Route } from './models';
import { clearsGlobe } from './orbital-view';

export const home = { lat: 24, lng: 11, altitude: 2.02 };
type Camera = Position & { altitude: number };
export type CameraCommand = { key: number; position?: Camera; zoom?: number };
export type Selection = { layer: LayerId; data: Mark | Area | Route };
const EMPTY: never[] = [];
const rendererConfig = { antialias: true, alpha: true };
const asLayer = (items: Mark[], layer: LayerId, radius: number, altitude = 0.003) => items.map(m => ({ ...m, layer, name: m.name, color: getLayer(layer).color, radius: m.radius ?? radius, altitude: m.altitude ?? altitude }));
const areaName = (value: object) => label((value as Area).name);
// Globe.gl accepts HTML strings for tooltips; pass text as a DOM node instead.
function label(name: string) { const node = document.createElement('span'); node.textContent = name; return node as unknown as React.ReactHTMLElement<HTMLElement>; }

function useLayers(atlas: Atlas, data: AtlasData, altitude: number, satellites: Mark[], globe: GlobeMethods | undefined,
  view: Viewport, camera: Camera, select: (item: Selection) => void): GlobeProps {
  const { active, body, countryMode, populationMode, volcanoMode } = atlas;
  const [hoveredCountry, setHoveredCountry] = useState<string>();
  const hoverCountry = useCallback((area: object | null) => setHoveredCountry((area as Area | null)?.id), []);
  const moon = body === 'moon', has = (id: LayerId) => active.includes(id) && (moon ? id === 'moon-landings' : id !== 'moon-landings');
  const citiesEnabled = has('cities');
  const names = useMemo(() => {
    if (!citiesEnabled) return EMPTY;
    const cities = data.cities.filter(c => altitude < 0.65 || c.code === 'capital' || (c.number ?? 0) > 6e6);
    return asLayer(cities.sort((a, b) => Number(b.code === 'capital') - Number(a.code === 'capital') || (b.number ?? 0) - (a.number ?? 0))
      .slice(0, altitude < 0.65 ? cities.length : altitude < 1.3 ? 85 : 52), 'cities', 0.21, 0.005);
  }, [altitude, citiesEnabled, data.cities]);
  const orbitMarkers = useMemo(() => asLayer(satellites, 'satellites', 0.2), [satellites]);
  const markers = useGlobeMarkers(names, orbitMarkers, globe, view, camera, select);
  const marks = useMemo(() => [
    ...asLayer(active.includes('quakes') && !moon ? data.filteredQuakes : EMPTY, 'quakes', 0.33),
    ...asLayer(active.includes('volcanoes') && volcanoMode === 'points' && !moon ? data.volcanoes : EMPTY, 'volcanoes', 0.17),
    ...asLayer(active.includes('events') && !moon ? data.events.items : EMPTY, 'events', 0.35),
    ...asLayer(active.includes('airports') && !moon ? data.airports.filter(m => m.code).filter((_, i) => i % (altitude < 0.65 ? 2 : 12) === 0) : EMPTY, 'airports', 0.15),
    ...asLayer(active.includes('moon-landings') && moon ? data.landings : EMPTY, 'moon-landings', 0.48),
    ...asLayer(active.includes('population') && populationMode === 'columns' && !moon ? data.cities.map(m => ({ ...m, altitude: Math.min(0.18, Math.sqrt((m.number ?? 0) / 2e7) * 0.17) })) : EMPTY, 'population', 0.26),
  ], [active, altitude, data.filteredQuakes, data.volcanoes, data.events.items, data.airports, data.landings, data.cities, moon, populationMode, volcanoMode]);
  const quakeRings = useMemo(() => marks.filter(mark => mark.layer === 'quakes' && (mark.number ?? 0) >= 5).slice(0, 25), [marks]);
  const heat = useMemo(() => moon ? [] : [
    ...(active.includes('population') && populationMode === 'heat' ? [{ points: data.cities.map(m => ({ ...m, weight: Math.max(1, Math.min(100, Math.sqrt((m.number ?? 0) / 2000))) })), tint: '239, 142, 76' }] : []),
    ...(active.includes('volcanoes') && volcanoMode === 'heat' ? [{ points: data.volcanoes.map(m => ({ ...m, weight: 1 })), tint: '233, 92, 105' }] : []),
  ], [active, data.cities, data.volcanoes, moon, populationMode, volcanoMode]);
  const transport = useMemo(() => moon ? [] : [
    ...asLayer(active.includes('air') ? data.air.items : EMPTY, 'air', 0.52),
    ...asLayer(active.includes('sea') ? data.sea.items : EMPTY, 'sea', 0.35),
  ], [active, data.air.items, data.sea.items, moon]);
  const areas = has('countries') ? data.countries : EMPTY;
  useGlobeBorders(globe, countryMode === 'borders' ? areas : EMPTY);
  const routes = useMemo(() => !moon && active.includes('routes') ? data.routes.slice(0, altitude > 1.3 ? 175 : 450) : EMPTY, [active, altitude, data.routes, moon]);
  const fill = useCallback((item: object) => {
    const a = item as Area, v = countryMode === 'population' ? a.population : a.gdp;
    if (countryMode === 'borders') return a.id === hoveredCountry ? 'rgba(218,244,164,0.82)' : 'rgba(172,195,133,0.45)';
    if (!v || v < 0) return 'rgba(143,153,151,0.22)';
    const x = Math.max(0, Math.min(1, Math.log10(v) / (countryMode === 'population' ? 9 : 7)));
    return `rgba(${Math.round(75 + x * 146)},${Math.round(110 + x * 119)},${Math.round(105 - x * 29)},${0.24 + x * 0.52})`;
  }, [countryMode, hoveredCountry]);
  return {
    ...markers,
    polygonsData: countryMode !== 'hex' ? areas : EMPTY, polygonCapColor: fill, polygonLabel: areaName,
    polygonStrokeColor: countryMode === 'borders' ? undefined : 'rgba(224,239,192,0.57)', polygonSideColor: () => '',
    polygonAltitude: 0.0032, polygonCapCurvatureResolution: 2, polygonsTransitionDuration: 0,
    onPolygonHover: countryMode === 'borders' ? hoverCountry : undefined,
    onPolygonClick: a => select({ layer: 'countries', data: a as Area }),
    hexPolygonsData: countryMode === 'hex' ? areas : EMPTY, hexPolygonResolution: 3, hexPolygonMargin: 0.27,
    hexPolygonColor: 'rgba(213,240,155,0.61)', hexPolygonLabel: areaName, onHexPolygonClick: a => select({ layer: 'countries', data: a as Area }),
    pointsData: marks, pointLat: 'lat', pointLng: 'lng', pointRadius: 'radius', pointAltitude: 'altitude', pointColor: 'color', pointResolution: 6,
    pointLabel: m => label((m as Marker).name), pointsTransitionDuration: 0, onPointClick: m => select({ layer: (m as Marker).layer, data: m as Marker }),
    ringsData: quakeRings, ringColor: () => (t: number) => `rgba(245,171,124,${0.7 * (1 - t)})`, ringAltitude: 0.007,
    ringMaxRadius: 3, ringPropagationSpeed: 2, ringRepeatPeriod: 1800,
    arcsData: routes, arcColor: ['#748ec6', '#b4e1ff'],
    arcCurveResolution: 22, arcAltitudeAutoScale: 0.15, arcsTransitionDuration: 0, arcLabel: r => label((r as Route).name),
    onArcClick: r => select({ layer: 'routes', data: r as Route }),
    heatmapsData: heat, heatmapPoints: 'points', heatmapPointLat: 'lat', heatmapPointLng: 'lng',
    heatmapPointWeight: 'weight',
    heatmapColorFn: (item: object) => (t: number) => `rgba(${(item as { tint: string }).tint}, ${Math.min(0.82, t * 0.9)})`,
    heatmapBaseAltitude: 0.002, heatmapBandwidth: 2.2,
    tilesData: transport, tileWidth: 'radius', tileHeight: 'radius', tileAltitude: 0.008,
    tileMaterial: item => {
      const tile = item as Marker;
      return densityMaterials[tile.layer === 'air' ? 'air' : 'sea'][tile.band ?? 'low'];
    },
    tileLabel: m => label((m as Marker).name), onTileClick: m => select({ layer: (m as Marker).layer, data: m as Marker }), tilesTransitionDuration: 0,
  };
}
const densityMaterial = (color: string) => {
  const make = (opacity: number) => new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  return { low: make(0.36), medium: make(0.62), high: make(0.88) };
};
const densityMaterials = { air: densityMaterial('#91d9f1'), sea: densityMaterial('#88d9c9') };

type Viewport = { width: number; height: number };

export default function GlobeView({ atlas, data, camera, command, spinning, onCamera, onOrbitVisibility, onSelect }: {
  atlas: Atlas; data: AtlasData; camera: Camera; command: CameraCommand | null; spinning: boolean;
  onCamera: (camera: Camera) => void; onOrbitVisibility: (count: number) => void; onSelect: (item: Selection) => void;
}) {
  const host = useRef<HTMLDivElement>(null), ref = useRef<GlobeMethods | undefined>(undefined);
  const pointerInGlobe = useRef(false);
  // Globe.gl keeps the last pointer coordinates when the cursor leaves its container.
  const pointerEventsFilter = useCallback(() => pointerInGlobe.current, []);
  const [size, setSize] = useState({ width: 0, height: 0 }), [ready, setReady] = useState(false);
  const [altitude, setAltitude] = useState(home.altitude);
  const satellites = atlas.body === 'earth' && atlas.active.includes('satellites') ? data.satellites.items : EMPTY;
  useEffect(() => {
    const g = ref.current;
    if (!ready || !g || !satellites.length) { onOrbitVisibility(0); return; }
    const update = () => {
      const eye = g.camera().position, radius = g.getGlobeRadius();
      onOrbitVisibility(satellites.filter(mark => {
        if (!clearsGlobe(eye, g.getCoords(mark.lat, mark.lng, mark.altitude), radius)) return false;
        const { x, y } = g.getScreenCoords(mark.lat, mark.lng, mark.altitude);
        return x >= 0 && x <= size.width && y >= 0 && y <= size.height;
      }).length);
    };
    const controls = g.controls();
    let frame = 0;
    const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; update(); }); };
    schedule();
    controls.addEventListener('change', schedule);
    return () => { cancelAnimationFrame(frame); controls.removeEventListener('change', schedule); };
  }, [onOrbitVisibility, ready, satellites, size]);
  const latestCamera = useRef(home), cameraTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onZoom = useCallback((camera: Camera) => {
    latestCamera.current = camera;
    cameraTimer.current ??= setTimeout(() => {
      cameraTimer.current = undefined;
      const position = latestCamera.current;
      onCamera(position);
      setAltitude(position.altitude < 0.65 ? 0.5 : position.altitude < 1.3 ? 0.95 : home.altitude);
    }, 160);
  }, [onCamera]);
  useEffect(() => () => clearTimeout(cameraTimer.current), []);
  const reduced = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const [webgl] = useState(() => Boolean(document.createElement('canvas').getContext('webgl2')));
  useEffect(() => {
    const element = host.current!;
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) }));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  const onReady = useCallback(() => {
    const globe = ref.current;
    if (!globe) return;
    const sunlight = new DirectionalLight('#fff1d0', 1.69); sunlight.position.set(-2, 1.5, 3);
    globe.lights([new AmbientLight('#dae1ed', 1.34), sunlight]);
    globe.renderer().setPixelRatio(Math.min(1.65, window.devicePixelRatio));
    globe.controls().enablePan = false;
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const controls = ref.current?.controls();
    if (controls) { controls.autoRotate = spinning; controls.autoRotateSpeed = 0.3; }
  }, [ready, spinning]);
  useEffect(() => {
    const g = ref.current;
    if (!ready || !g) return;
    if (command?.zoom) g.pointOfView({ altitude: Math.max(0.18, Math.min(4.8, g.pointOfView().altitude * command.zoom)) }, reduced ? 0 : 280);
    else {
      const viewport = host.current;
      const altitude = Math.max(home.altitude, Math.min(4.8, 2.45 * (viewport ? viewport.clientHeight / viewport.clientWidth : 1) - 0.95));
      const initial = atlas.body === 'moon' ? { lat: 10, lng: 20, altitude } : { ...home, altitude };
      g.pointOfView(command?.position ?? initial, reduced || !command ? 0 : 720);
    }
  }, [ready, command, atlas.body, reduced]);
  const globe = ready ? ref.current : undefined;
  useGlobeClouds(globe, atlas.body === 'earth' && atlas.active.includes('clouds'));
  const props = useLayers(atlas, data, altitude, satellites, globe, size, camera, onSelect);
  const texture = atlas.body === 'moon' ? textures.moon : atlas.style === 'night' ? textures.night : textures.earth;
  return <div className="globe-host" ref={host}
    onPointerEnter={() => { pointerInGlobe.current = true; }}
    onPointerDownCapture={() => { pointerInGlobe.current = true; }}
    onPointerLeave={event => { if (event.pointerType === 'mouse') pointerInGlobe.current = false; }}>
    {!webgl ? <div className="globe-fallback"><strong>WebGL 2 indisponible</strong><p>Active l’accélération graphique dans ton navigateur pour afficher le globe.</p></div> : size.width > 0 && size.height > 0 &&
      <Globe ref={ref} {...props} {...size} backgroundColor="rgba(0,0,0,0)" animateIn={false}
        rendererConfig={rendererConfig} onGlobeReady={onReady} globeImageUrl={texture} bumpImageUrl={atlas.body === 'earth' && atlas.style === 'relief' ? textures.relief : null}
        showAtmosphere={atlas.body === 'earth'} atmosphereColor="#81b3c5" atmosphereAltitude={0.13} showGraticules={atlas.graticules} lineHoverPrecision={0}
        onZoom={onZoom} pointerEventsFilter={pointerEventsFilter} />}
    {webgl && !ready && <div className="globe-fallback" role="status">Initialisation du globe…</div>}
  </div>;
}
