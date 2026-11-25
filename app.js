'use strict';

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const normStr = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('fr-FR');
const fmt = n => nf.format(Math.round(+n || 0));
const fmt1 = n => nf.format(+(+n || 0).toFixed(1));
const fmt2 = n => nf.format(+(+n || 0).toFixed(2));
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
const compass = deg => COMPASS[Math.round((((+deg % 360) + 360) % 360) / 22.5) % 16];

async function fetchJSON(url, ms) {
  const timeout = ms || 12000;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

function logLoad(msg, ok) {
  const el = $('#loaderLog');
  if (!el) return;
  const d = document.createElement('div');
  d.className = ok === true ? 'text-emerald-400' : ok === false ? 'text-amber-400' : 'text-slate-400';
  d.textContent = (ok === true ? '✓ ' : ok === false ? '⚠ ' : '… ') + msg;
  el.appendChild(d);
  el.scrollTop = el.scrollHeight;
}

let THREE = null;
const IS_MOBILE = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '') || window.innerWidth < 700;

const state = {
  mode: 'satellite',
  choro: 'none',
  layers: { countries: false, cities: false, relief: false, quakes: false, eonet: false, geology: false, currents: false, shipping: false, cables: false, trenches: false, air: false, ships: false, clouds: false, iss: false },
  net: {},
  mouse: { x: 0, y: 0 },
  hoverPoly: null,
  iss: { lat: 0, lng: 0, altitude: 408, velocity: 27600, live: false },
  followIss: false,
  autoRotate: !IS_MOBILE,
  flash: null,
  probe: null,
  selected: null,
  scales: {}
};

const DATA = { countries: null, cityPts: [], volcPts: [], quakes: [], eonet: [], rcMap: null, rcName: null, waterMask: null, wb: null };

const LAYER_DEFS = [
  { id: 'countries', domain: 'Terre & géopolitique', label: 'Frontières & pays' },
  { id: 'cities', domain: 'Terre & géopolitique', label: 'Mégapoles & capitales' },
  { id: 'relief', domain: 'Terre & géopolitique', label: 'Reliefs & grands fleuves' },
  { id: 'quakes', domain: 'Géologie & risques naturels', label: 'Séismes en direct (USGS)' },
  { id: 'eonet', domain: 'Géologie & risques naturels', label: 'Événements actifs (NASA EONET)' },
  { id: 'geology', domain: 'Géologie & risques naturels', label: 'Volcans & limites de plaques' },
  { id: 'currents', domain: 'Océans & bathymétrie', label: 'Courants océaniques' },
  { id: 'shipping', domain: 'Océans & bathymétrie', label: 'Routes maritimes, ports & détroits' },
  { id: 'cables', domain: 'Océans & bathymétrie', label: 'Câbles sous-marins' },
  { id: 'trenches', domain: 'Océans & bathymétrie', label: 'Fosses abyssales' },
  { id: 'air', domain: 'Flux & transports mondiaux', label: 'Routes aériennes' },
  { id: 'ships', domain: 'Flux & transports mondiaux', label: 'Navires (trafic mondial)' },
  { id: 'clouds', domain: 'Atmosphère & espace proche', label: 'Nuageuse & halo atmosphérique' },
  { id: 'iss', domain: 'Atmosphère & espace proche', label: 'ISS — suivi live' }
];

const POINT_R = { city: 0.3, quake: 0.4, volcano: 0.3, eonet: 0.4, port: 0.5, strait: 0.45, trench: 0.55, peak: 0.45 };

const EONET_COLORS = {
  'Wildfires': '#ff6d00', 'Severe Storms': '#ffd60a', 'Volcanoes': '#ff2d55', 'Sea and Lake Ice': '#90e0ef',
  'Floods': '#4361ee', 'Earthquakes': '#f72585', 'Landslides': '#b08968', 'Drought': '#e9c46a',
  'Dust and Haze': '#ced4da', 'Temperature Extremes': '#ff9770', 'Water Color': '#48cae4', 'Snow': '#caf0f8', 'Manmade': '#adb5bd'
};
function eonetColor(cat) {
  const c = normStr(cat);
  for (const k in EONET_COLORS) if (c.includes(normStr(k))) return EONET_COLORS[k];
  return '#adb5bd';
}
function quakeColor(depth) { return depth < 70 ? '#ff5252' : depth < 300 ? '#ffb142' : '#b388ff'; }

let world = null, R = 100, cloudMesh = null, issMesh = null, issLabel = null;
let bumpTex = null, nightTex = null, waterTex = null;
let SEARCH_INDEX = [];
let globeReady = false, bootDone = false;
const bootT0 = Date.now();
function maybeHideLoader() {
  if (bootDone && (globeReady || Date.now() - bootT0 > 12000)) {
    const l = $('#loader');
    if (l && !l.classList.contains('done')) l.classList.add('done');
  }
}

function polyItem(f) { return { layer: 'country', ref: f, name: (f.properties && f.properties.NAME) || 'Pays' }; }
function polyFeature(d) { return d && d.data ? d.data : (d && d.properties ? d : null); }

function centroid(f) {
  const g = f && f.geometry;
  if (!g) return { lat: 0, lng: 0 };
  const ring = g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? g.coordinates[0][0] : null;
  if (!ring || !ring.length) return { lat: 0, lng: 0 };
  let la = 0, lo = 0;
  for (const p of ring) { la += p[1]; lo += p[0]; }
  return { lat: la / ring.length, lng: lo / ring.length };
}

function cleanPath(pts) {
  return (pts || [])
    .filter(p => Array.isArray(p) && p.length >= 2 && isFinite(+p[0]) && isFinite(+p[1]) && +p[0] >= -90 && +p[0] <= 90 && +p[1] >= -180 && +p[1] <= 180)
    .map(p => [+p[0], +p[1]]);
}

function normCities(j) {
  return ((j && j.features) || []).map(f => {
    const p = f.properties || {};
    const c = f.geometry && f.geometry.coordinates ? f.geometry.coordinates : [p.longitude, p.latitude];
    return { layer: 'city', lat: +c[1], lng: +c[0], name: p.name || 'Ville', pop: +(p.pop_max != null ? p.pop_max : (p.population != null ? p.population : 1e6)), color: '#7dd3fc' };
  }).filter(c => isFinite(c.lat) && isFinite(c.lng));
}

function normVolcanoes(j) {
  const out = [];
  const arr = Array.isArray(j) ? j : (j && j.features) || [];
  for (const v of arr) {
    let lat, lng, name, elev, country;
    if (v.geometry && v.geometry.coordinates) {
      const p = v.properties || {};
      lng = +v.geometry.coordinates[0]; lat = +v.geometry.coordinates[1];
      name = p.name || p.Name || p.NAME || 'Volcan';
      elev = +(p.elevation != null ? p.elevation : (p.Elevation != null ? p.Elevation : (p.alt || 0)));
      country = p.country || p.Country || '';
    } else {
      const p = v;
      lat = +(p.lat != null ? p.lat : (p.latitude != null ? p.latitude : p.Latitude));
      lng = +(p.lng != null ? p.lng : (p.lon != null ? p.lon : (p.longitude != null ? p.longitude : p.Longitude)));
      name = p.name || p.Name || p.NAME || 'Volcan';
      elev = +(p.elevation != null ? p.elevation : (p.Elevation != null ? p.Elevation : (p.alt || 0)));
      country = p.country || p.Country || '';
    }
    if (isFinite(lat) && isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      out.push({ layer: 'volcano', lat, lng, name, elev: elev || 0, country, color: '#ff6d3f' });
    }
  }
  return out;
}

function normQuakes(j) {
  return ((j && j.features) || []).map(f => {
    const c = (f.geometry && f.geometry.coordinates) || [0, 0, 0];
    const p = f.properties || {};
    const depth = +(c[2] != null ? c[2] : (p.depth || 0));
    return { layer: 'quake', lat: +c[1], lng: +c[0], name: p.place || 'Séisme', mag: +(p.mag || 0), depth, time: p.time || 0, url: p.url || '', color: quakeColor(depth) };
  }).filter(q => isFinite(q.lat) && isFinite(q.lng));
}

function normEonet(j) {
  let feats = [];
  if (j && Array.isArray(j.features)) feats = j.features.map(f => ({ properties: f.properties, geometry: f.geometry }));
  else if (j && Array.isArray(j.events)) {
    feats = j.events.map(e => {
      const geoms = e.geometry || e.geometries || [];
      const last = geoms.length ? geoms[geoms.length - 1] : null;
      return { properties: { title: e.title, categories: e.categories, id: e.id, link: e.link, date: last ? last.date : null }, geometry: last };
    });
  }
  return feats.filter(f => f.geometry && Array.isArray(f.geometry.coordinates)).map(f => {
    const c = f.geometry.coordinates;
    const p = f.properties || {};
    const cat = (p.categories && p.categories[0] && p.categories[0].title) || 'Divers';
    return { layer: 'eonet', lat: +c[1], lng: +c[0], name: p.title || 'Événement', cat, date: p.date || null, id: p.id || null, link: p.link || '', color: eonetColor(cat) };
  }).filter(e => isFinite(e.lat) && isFinite(e.lng));
}

function buildRc(j) {
  const m = new Map(), nm = new Map();
  for (const c of (Array.isArray(j) ? j : [])) {
    if (c.cca3) m.set(c.cca3, c);
    if (c.name && c.name.common) nm.set(normStr(c.name.common), c);
  }
  DATA.rcMap = m; DATA.rcName = nm;
}

function setupGlobe() {
  const el = $('#globe');
  world = Globe({
    rendererConfig: { antialias: !IS_MOBILE, alpha: false, powerPreference: 'high-performance' },
    waitForGlobeReady: true
  })(el);
  world.width(window.innerWidth).height(window.innerHeight);
  world.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_MOBILE ? 1.25 : 2));
  world.backgroundColor('#020409').backgroundImageUrl(IMG.stars);
  world.globeImageUrl(IMG.satellite).bumpImageUrl(IMG.topology);
  world.showAtmosphere(true).atmosphereColor('#5ea0ff').atmosphereAltitude(0.13);
  world.pointOfView({ lat: 24, lng: 8, altitude: 2.4 }, 0);
  const c = world.controls();
  c.autoRotate = state.autoRotate; c.autoRotateSpeed = 0.5;

  try { world.globeMaterial().color.set(0x274060); } catch (e) {}
  try {
    const gl = world.renderer().getContext();
    logLoad('WebGL OK — ' + ((gl && gl.getParameter(gl.VERSION)) || 'n/a'), true);
  } catch (e) {}
  world.onGlobeReady(() => { globeReady = true; logLoad('Texture du globe chargée — globe visible', true); maybeHideLoader(); });
  for (const k of ['satellite', 'topology', 'stars']) {
    const im = new Image();
    im.onerror = () => logLoad('Texture ' + k + ' indisponible : ' + IMG[k], false);
    im.src = IMG[k];
  }

  if (THREE) {
    const tl = new THREE.TextureLoader();
    tl.load(IMG.topology, t => { bumpTex = t; });
    tl.load(IMG.night, t => { nightTex = t; });
    tl.load(IMG.water, t => {
      waterTex = t;
      const m = world.globeMaterial();
      m.specularMap = t; m.specular = new THREE.Color(0x8fa3b8); m.shininess = 16; m.needsUpdate = true;
    });
  }

  world
    .pointsData([]).pointLat(d => d.lat).pointLng(d => d.lng)
    .pointColor(d => d.color || '#ffffff')
    .pointRadius(d => d.layer === 'city' ? 0.22 + Math.min(0.5, Math.log10(1 + (d.pop || 0)) / 16) : d.layer === 'quake' ? 0.18 + (d.mag || 0) * 0.14 : (POINT_R[d.layer] || 0.3))
    .pointAltitude(d => d.layer === 'city' ? 0.012 + Math.min(0.035, Math.log10(1 + (d.pop || 0)) / 220) : 0.018)
    .pointsMerge(true)
    .pointLabel(() => '').onPointHover(d => hoverObj(d)).onPointClick(d => { if (d && !Array.isArray(d)) openDetail(d); })
    .labelsData([]).labelLat(d => d.lat).labelLng(d => d.lng).labelText(d => d.name)
    .labelAltitude(0.03).labelColor(() => 'rgba(228,238,255,.95)').labelSize(d => d.layer === 'city' ? 0.65 : 0.55)
    .labelDotRadius(d => d.layer === 'city' ? 0.22 : 0).labelResolution(2)
    .labelLabel(() => '').onLabelHover(d => hoverObj(d)).onLabelClick(d => { if (d) openDetail(d); })
    .arcsData([]).arcStartLat(d => d.a[0]).arcStartLng(d => d.a[1]).arcEndLat(d => d.b[0]).arcEndLng(d => d.b[1])
    .arcColor(d => d.color).arcStroke(d => d.stroke).arcAltitude(d => d.alt || 0.012)
    .arcDashLength(d => d.dashLen || 0).arcDashGap(d => d.dashGap || 0).arcDashAnimateTime(d => d.dashTime || 0)
    .arcLabel(() => '').onArcHover(d => hoverObj(d)).onArcClick(d => { if (d) openDetail(d); })
    .pathsData([]).pathPoints(d => d.points).pathPointLat(p => p[0]).pathPointLng(p => p[1]).pathColor(d => d.color).pathStroke(d => d.stroke).pathResolution(16)
    .pathLabel(() => '').onPathHover(d => hoverObj(d)).onPathClick(d => { if (d) openDetail(d); })
    .ringsData([]).ringLat(d => d.lat).ringLng(d => d.lng).ringColor(d => d.color)
    .ringMaxRadius(d => d.maxR).ringPropagationSpeed(2.4).ringRepeatPeriod(d => d.period || 1500)
    .polygonsData([]).polygonCapColor(f => capColor(f)).polygonSideColor(() => 'rgba(6,10,22,.45)')
    .polygonStrokeColor(() => '#0a1020').polygonAltitude(0.004).polygonCapCurvatureResolution(2)
    .polygonLabel(() => '')
    .onPolygonHover(d => {
      state.hoverPoly = d ? polyFeature(d) : null;
      hoverObj(state.hoverPoly ? polyItem(state.hoverPoly) : null);
      refreshPoly();
    })
    .onPolygonClick(d => { const f = d && polyFeature(d); if (f) openDetail(polyItem(f)); })
    .onGlobeClick(coords => { if (coords && isFinite(coords.lat) && isFinite(coords.lng)) probeAt(coords.lat, coords.lng); });
  for (const m of ['pointsTransitionDuration', 'arcsTransitionDuration', 'polygonsTransitionDuration', 'pathsTransitionDuration', 'pathTransitionDuration', 'labelsTransitionDuration']) {
    if (typeof world[m] === 'function') world[m](0);
  }
}

function countryIso(p) {
  return (p.ISO_A3 && p.ISO_A3 !== '-99' && p.ISO_A3) || p.ADM0_A3 || '';
}

function countryVals(p) {
  const iso = countryIso(p);
  const wb = DATA.wb;
  const pop = wb && wb.pop[iso] != null ? wb.pop[iso] : (+p.POP_EST || 0);
  const gdpUS = wb && wb.gdp[iso] != null ? wb.gdp[iso] : (+p.GDP_MD_EST > 0 ? +p.GDP_MD_EST * 1e6 : 0);
  return { pop, gdpEUR: gdpUS / 1e9 * USD_EUR };
}

function capColor(f) {
  if (!f || !f.properties) return 'rgba(90,130,190,.55)';
  if (state.hoverPoly === f) return '#ffd166';
  if (state.choro === 'none') return 'rgba(90,130,190,.55)';
  const cv = countryVals(f.properties);
  const v = state.choro === 'pop' ? cv.pop : cv.gdpEUR;
  if (!isFinite(v) || v <= 0) return 'rgba(70,80,105,.5)';
  const s = state.scales[state.choro];
  if (!s) return 'rgba(90,130,190,.55)';
  const t = clamp(Math.log10(1 + v) / Math.log10(1 + s.max), 0, 1);
  return s.fn(t);
}

async function loadWorldBank() {
  const out = { gdp: {}, pop: {}, year: {} };
  try {
    const pair = await Promise.all([fetchJSON(API.worldbank.gdp, 20000), fetchJSON(API.worldbank.pop, 20000)]);
    const ingest = (rows, key) => {
      for (const r of (rows && rows[1]) || []) {
        const c = r.countryiso3code;
        if (!c || c.length !== 3 || r.value == null) continue;
        const y = +r.date;
        if (out[key][c] == null || y > out.year[c + key]) { out[key][c] = +r.value; out.year[c + key] = y; }
      }
    };
    ingest(pair[0], 'gdp');
    ingest(pair[1], 'pop');
    if (!Object.keys(out.gdp).length && !Object.keys(out.pop).length) throw new Error('flux vide');
    DATA.wb = out;
    state.net.worldbank = 'live';
    const gy = Math.max.apply(null, Object.keys(out.year).map(k => out.year[k]).concat([0]));
    logLoad('Banque mondiale — PIB & population, dernière année dispo : ' + gy + ' (PIB converti en € au taux indicatif 1 $ = ' + USD_EUR + ' €)', true);
  } catch (e) {
    DATA.wb = null;
    state.net.worldbank = 'cache';
    logLoad('Banque mondiale indisponible — secours Natural Earth (~2022), PIB converti en € (taux indicatif ' + USD_EUR + ')', false);
  }
}

function buildScales() {
  if (!DATA.countries || !window.d3) return;
  const vals = DATA.countries.features.map(f => countryVals(f.properties));
  const pops = vals.map(v => v.pop).filter(v => v > 0);
  const gdps = vals.map(v => v.gdpEUR).filter(v => v > 0);
  state.scales.pop = { max: Math.max.apply(null, pops.concat([1])), fn: t => d3.interpolateYlOrRd(t) };
  state.scales.gdp = { max: Math.max.apply(null, gdps.concat([1])), fn: t => d3.interpolateViridis(t) };
}

let polyPending = false, polyLastHover = null;
function refreshPoly(force) {
  if (!world || polyPending) return;
  if (!force && state.hoverPoly === polyLastHover) return;
  polyPending = true;
  requestAnimationFrame(() => {
    polyPending = false;
    polyLastHover = state.hoverPoly;
    if (state.layers.countries && DATA.countries) world.polygonsData(DATA.countries.features);
  });
}

function makeCloudTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 1024, 512);
  for (let i = 0; i < 1400; i++) {
    const x = Math.random() * 1024, y = Math.random() * 512, r = 6 + Math.random() * 42;
    const a = 0.05 + Math.random() * 0.13;
    for (const dx of [-1024, 0, 1024]) {
      const gr = g.createRadialGradient(x + dx, y, 0, x + dx, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,' + a.toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(x + dx, y, r, 0, 6.2832); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function initCustom() {
  R = world.getGlobeRadius();
  if (THREE) {
    cloudMesh = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.014, 48, 24),
      new THREE.MeshBasicMaterial({ map: makeCloudTexture(), transparent: true, opacity: 0.5, depthWrite: false })
    );
    const g = new THREE.Group();
    const matBody = new THREE.MeshPhongMaterial({ color: 0xdfe6ee, shininess: 80 });
    const matPanel = new THREE.MeshPhongMaterial({ color: 0x1d4ed8, emissive: 0x0a1c4d, shininess: 40 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.8), matBody));
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.38), matPanel); p1.position.x = 0.6;
    const p2 = p1.clone(); p2.position.x = -0.6;
    const p3 = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.03, 0.9), matPanel); p3.position.z = 0.6;
    const p4 = p3.clone(); p4.position.z = -0.6;
    g.add(p1, p2, p3, p4);
    issMesh = g;
    issLabel = document.createElement('div');
    issLabel.className = 'iss-label';
    issLabel.textContent = 'ISS';
    document.body.appendChild(issLabel);
  }
  applyCustomVisibility();
}

function applyCustomVisibility() {
  if (!world) return;
  const s = world.scene();
  if (cloudMesh) {
    if (state.layers.clouds && !cloudMesh.parent) s.add(cloudMesh);
    if (!state.layers.clouds && cloudMesh.parent) s.remove(cloudMesh);
  }
  if (issMesh) {
    if (state.layers.iss && !issMesh.parent) s.add(issMesh);
    if (!state.layers.iss && issMesh.parent) s.remove(issMesh);
  }
  if (issLabel) issLabel.style.display = (state.layers.iss && issMesh && issMesh.parent) ? 'block' : 'none';
  $('#issCard').classList.toggle('hidden', !state.layers.iss);
}

function tick() {
  requestAnimationFrame(tick);
  if (cloudMesh && cloudMesh.parent) cloudMesh.rotation.y += 0.00045;
  if (issMesh && issMesh.parent && state.iss) {
    const alt = (state.iss.altitude || 408) / 6371;
    const c = world.getCoords(state.iss.lat, state.iss.lng, alt);
    issMesh.position.set(c.x, c.y, c.z);
    issMesh.lookAt(0, 0, 0);
    const sc = world.getScreenCoords(state.iss.lat, state.iss.lng, alt);
    if (sc && issLabel) { issLabel.style.left = sc.x + 'px'; issLabel.style.top = sc.y + 'px'; }
  }
}

function rebuild() {
  if (!world) return;
  const on = id => state.layers[id];
  const pts = [], lbl = [], arcs = [], paths = [], rings = [];

  if (on('countries') && DATA.countries) world.polygonsData(DATA.countries.features);
  else world.polygonsData([]);

  if (on('cities')) for (const c of DATA.cityPts) { pts.push(c); if (c.pop >= 2e6) lbl.push(c); }

  if (on('relief')) {
    for (const r of RIVERS) { const pp = cleanPath(r.points); if (pp.length >= 2) paths.push({ layer: 'river', name: r.name, points: pp, color: '#3a86ff', stroke: 0.9, metric: r.metric }); }
    for (const m of RANGES) { const pp = cleanPath(m.points); if (pp.length >= 2) paths.push({ layer: 'range', name: m.name, points: pp, color: '#b08968', stroke: 1.6, metric: m.metric }); }
    for (const p of PEAKS) { pts.push(p); lbl.push(p); }
  }

  if (on('quakes')) {
    const qs = DATA.quakes.slice().sort((a, b) => (b.mag || 0) - (a.mag || 0));
    qs.forEach((q, i) => {
      pts.push(q);
      if (i < 50) rings.push({ lat: q.lat, lng: q.lng, color: q.color, maxR: 1 + (q.mag || 0) * 0.55, period: 1700 });
    });
  }

  if (on('eonet')) for (const e of DATA.eonet) {
    pts.push(e);
    lbl.push(Object.assign({}, e, { name: e.name.length > 34 ? e.name.slice(0, 32) + '…' : e.name }));
  }

  if (on('geology')) {
    for (const v of DATA.volcPts) { if (v.elev >= 2000) pts.push(v); if (v.elev >= 3500) lbl.push(v); }
    for (const f of FAULTS) { const pp = cleanPath(f.points); if (pp.length >= 2) paths.push({ layer: 'fault', name: f.name, points: pp, color: '#ff2d55', stroke: 1.8, metric: f.metric }); }
  }

  if (on('currents')) for (const c of CURRENTS) arcs.push({
    layer: 'current', name: c.name, a: c.a, b: c.b, color: c.warm ? '#ff8c42' : '#4cc9f0', stroke: 0.55,
    dashLen: 0.25, dashGap: 0.12, dashTime: 5200, metric: c.warm ? 'Courant chaud' : 'Courant froid'
  });

  if (on('shipping')) {
    for (const r of ROUTES) { const pp = cleanPath(r.points); if (pp.length >= 2) paths.push({ layer: 'route', name: r.name, points: pp, color: '#ffd166', stroke: 1.2, metric: r.metric }); }
    for (const p of PORTS) { pts.push({ layer: 'port', lat: p.lat, lng: p.lng, name: p.name, metric: p.metric, color: '#ffd166' }); lbl.push(Object.assign({ layer: 'port' }, p)); }
    for (const s of STRAITS) { pts.push({ layer: 'strait', lat: s.lat, lng: s.lng, name: s.name, metric: s.metric, color: '#4cc9f0' }); lbl.push(Object.assign({ layer: 'strait' }, s)); }
  }

  if (on('cables')) for (const c of CABLES) arcs.push({
    layer: 'cable', name: c.name, a: c.a, b: c.b, color: '#c77dff', stroke: 0.5,
    metric: fmt(c.km) + ' km · ' + c.tbsp + ' Tbps · ' + c.from + ' ↔ ' + c.to, ref: c
  });

  if (on('trenches')) for (const t of TRENCHES) {
    pts.push({ layer: 'trench', lat: t.lat, lng: t.lng, name: t.name, metric: t.metric, color: '#80ffdb' });
    lbl.push(Object.assign({ layer: 'trench' }, t));
  }

  if (on('air')) for (const r of AIR_ROUTES) arcs.push({ layer: 'air', name: r.name, a: r.a, b: r.b, color: '#e0f2fe', stroke: 0.4, alt: 0.035, dashLen: 0.12, dashGap: 0.1, dashTime: 2600, metric: 'Ligne long-courrier' });

  if (on('ships')) for (const s of SHIPS) {
    const p = { layer: 'ship', lat: s.lat, lng: s.lng, name: s.name, type: s.type, metric: s.type + ' · ' + s.metric, color: SHIP_COLORS[s.type] || '#ffffff' };
    pts.push(p);
    lbl.push(Object.assign({}, p));
  }

  if (state.flash && Date.now() < state.flash.until) rings.push({ lat: state.flash.lat, lng: state.flash.lng, color: '#ffffff', maxR: 2.6, period: 1900 });
  if (state.probe) rings.push({ lat: state.probe.lat, lng: state.probe.lng, color: '#ffd166', maxR: 1.7, period: 1500 });

  world.pointsData(pts);
  world.labelsData(lbl);
  world.arcsData(arcs);
  world.pathsData(paths);
  world.ringsData(rings);
  applyCustomVisibility();
  updateCounters();
  updateLegend();
  buildSearch();
}

function layerCounts() {
  return {
    countries: DATA.countries ? DATA.countries.features.length : 0,
    cities: DATA.cityPts.length,
    relief: RIVERS.length + RANGES.length + PEAKS.length,
    quakes: DATA.quakes.length,
    eonet: DATA.eonet.length,
    geology: DATA.volcPts.length + FAULTS.length,
    currents: CURRENTS.length,
    shipping: ROUTES.length + PORTS.length + STRAITS.length,
    cables: CABLES.length,
    trenches: TRENCHES.length,
    air: AIR_ROUTES.length,
    ships: SHIPS.length,
    clouds: '—',
    iss: '1'
  };
}

function updateCounters() {
  const c = layerCounts();
  $$('#layerList .cnt').forEach(el => { el.textContent = c[el.dataset.id] != null ? c[el.dataset.id] : ''; });
}

function updateLegend() {
  const el = $('#legend');
  const items = [];
  if (state.layers.quakes) items.push('<span class="chip"><i style="background:linear-gradient(90deg,#ff5252,#ffb142,#b388ff);width:26px"></i>Séisme : profondeur</span>');
  if (state.layers.currents) { items.push('<span class="chip"><i style="background:#ff8c42"></i>Courant chaud</span>'); items.push('<span class="chip"><i style="background:#4cc9f0"></i>Courant froid</span>'); }
  if (state.layers.geology) { items.push('<span class="chip"><i style="background:#ff6d3f"></i>Volcan</span>'); items.push('<span class="chip"><i style="background:#ff2d55"></i>Limite de plaque</span>'); }
  if (state.layers.shipping) { items.push('<span class="chip"><i style="background:#ffd166"></i>Port / route</span>'); items.push('<span class="chip"><i style="background:#4cc9f0"></i>Détroit</span>'); }
  if (state.layers.cables) items.push('<span class="chip"><i style="background:#c77dff"></i>Câble sous-marin</span>');
  if (state.layers.eonet) { items.push('<span class="chip"><i style="background:#ff6d00"></i>Feux</span>'); items.push('<span class="chip"><i style="background:#ffd60a"></i>Tempête</span>'); items.push('<span class="chip"><i style="background:#ff2d55"></i>Volcan actif</span>'); items.push('<span class="chip"><i style="background:#90e0ef"></i>Glace dérivante</span>'); }
  if (state.layers.trenches) items.push('<span class="chip"><i style="background:#80ffdb"></i>Fosse abyssale</span>');
  if (state.layers.air) items.push('<span class="chip"><i style="background:#e0f2fe"></i>Route aérienne</span>');
  if (state.layers.ships) { items.push('<span class="chip"><i style="background:#ffd166"></i>Porte-conteneurs</span>'); items.push('<span class="chip"><i style="background:#ff6b6b"></i>Pétrolier</span>'); items.push('<span class="chip"><i style="background:#4cc9f0"></i>Cargo</span>'); items.push('<span class="chip"><i style="background:#8d99ae"></i>Vraquier</span>'); }
  if (state.layers.countries && state.choro !== 'none') items.push('<span class="chip">Choroplèthe : ' + (state.choro === 'pop' ? 'population (échelle log)' : 'PIB en Mds € (échelle log)') + '</span>');
  if (!items.length) { el.classList.add('hidden'); return; }
  el.innerHTML = '<div class="text-[10px] uppercase tracking-[.14em] text-slate-500 mb-1.5">Légende</div><div class="flex flex-wrap gap-1.5">' + items.join('') + '</div>';
  el.classList.remove('hidden');
}

function describe(d) {
  switch (d.layer) {
    case 'country': {
      const p = d.ref.properties;
      const cv = countryVals(p);
      return {
        t: p.NAME || 'Pays',
        c: 'Pays · ' + (p.CONTINENT || '—'),
        m: state.choro === 'pop' ? 'Population : ' + fmt(cv.pop) + ' hab.' : state.choro === 'gdp' ? 'PIB : ≈ ' + fmt(cv.gdpEUR) + ' Mds €' : 'Pop. ' + fmt(cv.pop) + ' · PIB ≈ ' + fmt(cv.gdpEUR) + ' Mds €'
      };
    }
    case 'city': return { t: d.name, c: 'Mégapole', m: 'Population : ' + fmt(d.pop) + ' hab.' };
    case 'quake': return { t: d.name, c: 'Séisme', m: 'M ' + fmt1(d.mag) + ' · profondeur ' + fmt1(d.depth) + ' km' };
    case 'eonet': return { t: d.name, c: d.cat, m: d.date ? 'Actif depuis le ' + new Date(d.date).toLocaleDateString('fr-FR') : '' };
    case 'volcano': return { t: d.name, c: 'Volcan', m: 'Altitude : ' + fmt(d.elev) + ' m' + (d.country ? ' · ' + d.country : '') };
    case 'port': return { t: d.name, c: 'Port majeur', m: d.metric };
    case 'strait': return { t: d.name, c: 'Détroit stratégique', m: d.metric };
    case 'cable': return { t: d.name, c: 'Câble sous-marin', m: d.metric };
    case 'current': return { t: d.name, c: 'Courant océanique', m: d.metric };
    case 'route': return { t: d.name, c: 'Route commerciale', m: d.metric };
    case 'river': return { t: d.name, c: 'Grand fleuve', m: d.metric || '' };
    case 'range': return { t: d.name, c: 'Chaîne de montagnes', m: d.metric || '' };
    case 'peak': return { t: d.name, c: 'Sommet', m: 'Altitude : ' + fmt(d.elev) + ' m' };
    case 'trench': return { t: d.name, c: 'Fosse abyssale', m: d.metric };
    case 'fault': return { t: d.name, c: 'Limite de plaque tectonique', m: d.metric || '' };
    case 'air': return { t: d.name, c: 'Route aérienne', m: d.metric || 'Ligne long-courrier' };
    case 'ship': return { t: d.name, c: 'Navire · ' + (d.type || ''), m: d.metric || '' };
    default: return { t: d.name || d.layer, c: d.layer, m: d.metric || '' };
  }
}

function showTip(x, y, d) {
  const t = $('#tooltip');
  const desc = describe(d);
  t.innerHTML = '<span>' + esc(desc.c) + '</span><b>' + esc(desc.t) + '</b>' + (desc.m ? '<em>' + esc(desc.m) + '</em>' : '');
  t.classList.remove('hidden');
  const w = t.offsetWidth, h = t.offsetHeight;
  t.style.left = clamp(x + 14, 8, window.innerWidth - w - 8) + 'px';
  t.style.top = clamp(y + 18, 8, window.innerHeight - h - 8) + 'px';
}
function hideTip() { $('#tooltip').classList.add('hidden'); }
function hoverObj(d) { if (d) showTip(state.mouse.x, state.mouse.y, d); else hideTip(); }

function row(k, v) {
  return '<div class="flex justify-between gap-3 py-1 border-b border-white/5"><span class="text-slate-400 shrink-0">' + k + '</span><span class="text-right text-slate-100 break-words">' + v + '</span></div>';
}

function cardShell(cat, title, cls) {
  return '<div class="flex items-start justify-between gap-2"><div><div class="text-[10px] uppercase tracking-[.14em] ' + (cls || 'text-sky-300/90') + '">' + esc(cat) + '</div>' +
    '<h2 class="text-[15px] font-semibold leading-snug mt-0.5">' + title + '</h2></div>' +
    '<button class="detail-close shrink-0 w-7 h-7 rounded-lg hover:bg-white/10 text-slate-400" title="Fermer">✕</button></div>';
}

function syncDetailPanel() {
  if (!$('#detailCard').innerHTML.trim() && !$('#probeCard').innerHTML.trim()) $('#detail').classList.add('hidden');
}

function openDetail(d) {
  state.selected = d;
  const desc = describe(d);
  $('#detailCard').innerHTML = cardShell(desc.c, esc(desc.t)) + '<div class="mt-2 text-[12.5px]">' + detailBody(d) + '</div>';
  $('#detail').classList.remove('hidden');
}

function detailBody(d) {
  switch (d.layer) {
    case 'country': {
      const p = d.ref.properties;
      const rc = DATA.rcMap && (DATA.rcMap.get(p.ISO_A3) || DATA.rcMap.get(p.ADM0_A3) || (DATA.rcName && DATA.rcName.get(normStr(p.NAME))));
      let h = row('Continent', esc(p.CONTINENT || '—')) + row('Sous-région', esc(p.SUBREGION || '—'));
      const iso = countryIso(p);
      const wb = DATA.wb;
      if (wb && wb.pop[iso] != null) h += row('Population (Banque mondiale ' + (wb.year[iso + 'pop'] || '?') + ')', fmt(wb.pop[iso]) + ' hab.');
      else h += row('Population (Natural Earth ~2022)', fmt(p.POP_EST) + ' hab.');
      if (wb && wb.gdp[iso] != null) h += row('PIB (Banque mondiale ' + (wb.year[iso + 'gdp'] || '?') + ')', '≈ ' + fmt(wb.gdp[iso] / 1e9 * USD_EUR) + ' Mds € (taux indicatif 1 $ = ' + USD_EUR + ' €)');
      else h += row('PIB (Natural Earth ~2022, converti)', '≈ ' + fmt((+p.GDP_MD_EST > 0 ? +p.GDP_MD_EST / 1000 : 0) * USD_EUR) + ' Mds € (taux ' + USD_EUR + ')');
      if (rc) {
        h += row('Population (ONU)', fmt(rc.population) + ' hab.');
        h += row('Superficie', fmt(rc.area) + ' km²');
        h += row('Capitale', esc((rc.capital && rc.capital[0]) || '—'));
        h += row('Région', esc(rc.region || '—'));
        h += row('Pays enclavé', rc.landlocked ? 'Oui' : 'Non');
        if (rc.latlng && rc.latlng.length === 2) h += row('Coord. capitale', fmt2(rc.latlng[0]) + '°, ' + fmt2(rc.latlng[1]) + '°');
      } else {
        h += row('Enrichissement ONU', '<span class="text-amber-400/80">REST Countries indisponible (mode cache)</span>');
      }
      return h;
    }
    case 'city': return row('Population', fmt(d.pop) + ' hab.') + row('Source', 'Natural Earth 110m — villes peuplées');
    case 'quake': {
      let h = row('Magnitude', 'M ' + fmt1(d.mag)) + row('Profondeur de l’hypocentre', fmt1(d.depth) + ' km') + row('Lieu', esc(d.name));
      if (d.time) h += row('Heure', new Date(d.time).toISOString().replace('T', ' ').slice(0, 19) + ' UTC');
      h += row('Source', 'USGS — 24 h, M ≥ 2,5');
      if (d.url) h += row('Fiche', '<a class="text-sky-400 underline" href="' + esc(d.url) + '" target="_blank" rel="noopener">earthquake.usgs.gov ↗</a>');
      return h;
    }
    case 'eonet': {
      let h = row('Catégorie', esc(d.cat)) + row('Événement', esc(d.name));
      if (d.date) h += row('Dernière position', new Date(d.date).toISOString().replace('T', ' ').slice(0, 19) + ' UTC');
      h += row('Source', 'NASA EONET v3' + (d.id ? ' · id ' + esc(d.id) : ''));
      if (d.link) h += row('Fiche', '<a class="text-sky-400 underline" href="' + esc(d.link) + '" target="_blank" rel="noopener">eonet.gsfc.nasa.gov ↗</a>');
      return h;
    }
    case 'volcano': return row('Altitude', fmt(d.elev) + ' m') + row('Pays', esc(d.country || '—')) + row('Source', 'Base mondiale des volcans (dataset hébergé)');
    case 'port': return row('Trafic conteneurisé', esc(d.metric)) + row('Type', 'Grand port mondial');
    case 'strait': return row('Rôle stratégique', esc(d.metric));
    case 'cable': { const c = d.ref || d; return row('Tracé', esc(c.from) + ' ↔ ' + esc(c.to)) + row('Longueur', fmt(c.km) + ' km') + row('Capacité', c.tbsp + ' Tbps') + row('Type', 'Câble sous-marin de télécommunication'); }
    case 'current': return row('Régime thermique', esc(d.metric)) + row('Type', 'Grand courant de surface (donnée embarquée)');
    case 'route': return row('Volume', esc(d.metric)) + row('Type', 'Route commerciale mondiale');
    case 'river': return row('Longueur', esc(d.metric)) + row('Type', 'Grand bassin fluvial (donnée embarquée)');
    case 'range': return row('Point culminant', esc(d.metric)) + row('Type', 'Grande chaîne de montagnes');
    case 'peak': return row('Altitude', fmt(d.elev) + ' m') + row('Type', 'Grand relief (donnée embarquée)');
    case 'trench': return row('Profondeur', esc(d.metric)) + row('Type', 'Fosse océanique abyssale');
    case 'fault': return row('Longueur / type', esc(d.metric || 'Limite de plaque majeure'));
    case 'air': return row('Liaison', esc(d.name)) + row('Type', 'Route aérienne long-courrier (donnée embarquée)');
    case 'ship': return row('Type de navire', esc(d.type || '—')) + row('Détails', esc(d.metric || '—')) + row('Source', 'Trafic maritime mondial — positions types embarquées');
    default: return '';
  }
}

function loadWaterMask() {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      DATA.waterMask = g.getImageData(0, 0, c.width, c.height);
      logLoad('Masque océanique earth-water.png échantillonné', true);
    } catch (e) {
      logLoad('Masque océanique illisible — sonde par défaut en mode marin', false);
    }
  };
  img.onerror = () => logLoad('Masque océanique indisponible — sonde par défaut en mode marin', false);
  img.src = IMG.water;
}

function isWater(lat, lng) {
  const m = DATA.waterMask;
  if (!m) return null;
  const x = clamp(Math.floor((lng + 180) / 360 * m.width), 0, m.width - 1);
  const y = clamp(Math.floor((90 - lat) / 180 * m.height), 0, m.height - 1);
  const i = (y * m.width + x) * 4;
  return (m.data[i] + m.data[i + 1] + m.data[i + 2]) / 3 > 110;
}

async function probeAt(lat, lng) {
  state.probe = { lat, lng };
  rebuild();
  const card = $('#probeCard');
  $('#detail').classList.remove('hidden');
  const water = isWater(lat, lng);
  const marine = water === null ? true : water;
  card.innerHTML = cardShell('Sonde environnementale · Open-Meteo', fmt2(lat) + '°, ' + fmt2(lng) + '° — ' + (marine ? 'océan' : 'terre'), 'text-emerald-300/90') +
    '<div class="mt-2 text-[12.5px] text-slate-400">Interrogation des API Open-Meteo en cours…</div>';
  try {
    const url = marine ? API.marine(lat.toFixed(4), lng.toFixed(4)) : API.meteo(lat.toFixed(4), lng.toFixed(4));
    const j = await fetchJSON(url, 9000);
    state.net.openmeteo = 'live';
    const c = j.current || {}, u = j.current_units || {};
    let h = row('Coordonnées GPS', fmt2(lat) + '°, ' + fmt2(lng) + '°') + row('Zone', marine ? 'Océan / mer (masque earth-water.png)' : 'Terre ferme');
    if (marine) {
      h += row('Hauteur des vagues', fmt1(c.wave_height) + ' ' + (u.wave_height || 'm'));
      h += row('Période de houle', fmt1(c.wave_period) + ' ' + (u.wave_period || 's'));
      h += row('Direction de la houle', fmt1(c.wave_direction) + '° (' + compass(c.wave_direction) + ')');
      h += row('Vitesse du courant', fmt1(c.ocean_current_velocity) + ' ' + (u.ocean_current_velocity || 'm/s'));
      h += row('Direction du courant', fmt1(c.ocean_current_direction) + '° (' + compass(c.ocean_current_direction) + ')');
    } else {
      h += row('Température (2 m)', fmt1(c.temperature_2m) + ' ' + (u.temperature_2m || '°C'));
      h += row('Vent (10 m)', fmt1(c.wind_speed_10m) + ' ' + (u.wind_speed_10m || 'km/h') + ' · ' + compass(c.wind_direction) + ' (' + fmt1(c.wind_direction) + '°)');
    }
    h += row('Source', 'Open-Meteo · <span class="text-emerald-400">● Live</span>');
    card.innerHTML = cardShell('Sonde environnementale · Open-Meteo', fmt2(lat) + '°, ' + fmt2(lng) + '° — ' + (marine ? 'océan' : 'terre'), 'text-emerald-300/90') + '<div class="mt-2 text-[12.5px]">' + h + '</div>';
  } catch (e) {
    state.net.openmeteo = 'cache';
    card.innerHTML = cardShell('Sonde environnementale · Open-Meteo', fmt2(lat) + '°, ' + fmt2(lng) + '° — ' + (marine ? 'océan' : 'terre'), 'text-emerald-300/90') +
      '<div class="mt-2 text-[12.5px]">' + row('Coordonnées GPS', fmt2(lat) + '°, ' + fmt2(lng) + '°') +
      row('Statut', '<span class="text-amber-400">API indisponible ou timeout — aucune donnée météo (mode secours)</span>') + '</div>';
  }
  updateNet();
}

async function loadRestCountries() {
  for (const url of (API.restcountriesUrls || [])) {
    try {
      const j = await fetchJSON(url, 25000);
      if (Array.isArray(j) && j.length) {
        DATA.restcountries = j;
        state.net.restcountries = 'live';
        buildRc(j);
        logLoad('Enrichissement REST Countries v3.1 — OK (' + j.length + ' pays)', true);
        return;
      }
    } catch (e) { /* on tente l'URL suivante */ }
  }
  const fb = FALLBACK_RC.map(a => ({ cca3: a[0], name: { common: a[1] }, population: a[2], area: a[3], region: a[4], capital: [a[5]], latlng: [a[6], a[7]], landlocked: a[8] }));
  DATA.restcountries = fb;
  state.net.restcountries = 'cache';
  buildRc(fb);
  logLoad('REST Countries indisponible — enrichissement embarqué sur ' + fb.length + ' grands pays (mode cache)', false);
}

async function loadStatic() {
  const jobs = [
    ['countries', 'Frontières & pays (Natural Earth 110m)', API.countries],
    ['cities', 'Villes & capitales (Natural Earth 110m)', API.cities],
    ['volcanoes', 'Base mondiale des volcans', API.volcanoes]
  ];
  const rcPromise = loadRestCountries();
  const res = await Promise.allSettled(jobs.map(async j => [j[0], await fetchJSON(j[2], 20000)]));
  res.forEach((r, i) => {
    const key = jobs[i][0], label = jobs[i][1];
    if (r.status === 'fulfilled') {
      DATA[key] = r.value[1];
      state.net[key] = 'live';
      const n = Array.isArray(r.value[1]) ? r.value[1].length : (r.value[1].features ? r.value[1].features.length : '?');
      logLoad(label + ' — OK (' + n + ' entrées)', true);
    } else {
      state.net[key] = 'cache';
      logLoad(label + ' — indisponible, jeu de secours embarqué', false);
    }
  });
  await rcPromise;
  if (!DATA.cities) DATA.cities = FALLBACK_CITIES;
  DATA.cityPts = normCities(DATA.cities);
  DATA.volcPts = DATA.volcanoes ? normVolcanoes(DATA.volcanoes) : normVolcanoes(FALLBACK_VOLCANOES);
  if (!DATA.countries) logLoad('Couche « Frontières & pays » désactivée (dataset indisponible)', false);
}

async function loadQuakes() {
  try {
    const j = await fetchJSON(API.usgs, 12000);
    const qs = normQuakes(j);
    if (!qs.length) throw new Error('flux vide');
    DATA.quakes = qs;
    state.net.usgs = 'live';
    logLoad('USGS — ' + qs.length + ' séismes (24 h, M ≥ 2,5) en direct', true);
  } catch (e) {
    DATA.quakes = FALLBACK_QUAKES.map(q => ({
      layer: 'quake', lat: q.lat, lng: q.lng, name: q.place, mag: q.mag, depth: q.depth,
      time: Date.now() - q.hoursAgo * 3600e3, url: '', color: quakeColor(q.depth)
    }));
    state.net.usgs = 'cache';
    logLoad('USGS indisponible — ' + DATA.quakes.length + ' séismes de secours embarqués', false);
  }
  rebuild(); updateNet();
}

async function loadEonet() {
  for (const url of [API.eonet, API.eonetAlt]) {
    try {
      const j = await fetchJSON(url, 12000);
      const ev = normEonet(j);
      if (ev.length) {
        DATA.eonet = ev;
        state.net.eonet = 'live';
        logLoad('NASA EONET — ' + ev.length + ' événements actifs en direct', true);
        rebuild(); updateNet();
        return;
      }
    } catch (e) { /* URL suivante */ }
  }
  DATA.eonet = FALLBACK_EONET.map(e => ({ layer: 'eonet', lat: e.lat, lng: e.lng, name: e.name, cat: e.cat, date: e.date, id: e.id, link: e.link, color: eonetColor(e.cat) }));
  state.net.eonet = 'cache';
  logLoad('NASA EONET indisponible — ' + DATA.eonet.length + ' événements de secours embarqués', false);
  rebuild(); updateNet();
}

function issModel(t) {
  const T = 92.9 * 60, inc = 51.64 * Math.PI / 180, Om = -30 * Math.PI / 180, u0 = 1.1;
  const u = u0 + 2 * Math.PI * ((t / 1000) % T) / T;
  const lat = Math.asin(Math.sin(inc) * Math.sin(u)) * 180 / Math.PI;
  let lng = (Math.atan2(Math.cos(inc) * Math.sin(u), Math.cos(u)) - Om - 2 * Math.PI * (t / 1000) / 86164.0911) * 180 / Math.PI;
  lng = ((lng % 360) + 540) % 360 - 180;
  return { lat, lng, altitude: 408, velocity: 27580 };
}

async function loadIss() {
  try {
    const j = await fetchJSON(API.iss, 8000);
    state.iss = { lat: +j.latitude, lng: +j.longitude, altitude: +j.altitude, velocity: +j.velocity, live: true };
    state.net.iss = 'live';
  } catch (e) {
    state.iss = Object.assign(issModel(Date.now()), { live: false });
    state.net.iss = 'cache';
  }
  updateIssCard();
  updateNet();
  if (state.followIss && world) world.pointOfView({ lat: state.iss.lat, lng: state.iss.lng, altitude: 0.6 }, 900);
}

function updateIssCard() {
  const s = state.iss;
  $('#issCard').innerHTML =
    '<div class="flex items-center justify-between"><span class="text-[10px] uppercase tracking-[.14em] text-sky-300/90">ISS — orbite basse</span>' +
    '<span class="text-[10px] font-semibold ' + (s.live ? 'text-emerald-400' : 'text-amber-400') + '">' + (s.live ? '● LIVE' : '○ SIMULÉ') + '</span></div>' +
    '<div class="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">' +
    '<div class="text-slate-400">Position</div><div class="text-right text-slate-100 font-mono">' + fmt2(s.lat) + '°, ' + fmt2(s.lng) + '°</div>' +
    '<div class="text-slate-400">Altitude</div><div class="text-right text-slate-100 font-mono">' + fmt1(s.altitude) + ' km</div>' +
    '<div class="text-slate-400">Vitesse</div><div class="text-right text-slate-100 font-mono">' + fmt(s.velocity) + ' km/h</div>' +
    '<div class="text-slate-400">Trace au sol</div><div class="text-right text-slate-100 font-mono">' + fmt2(Math.abs(s.lat)) + '° ' + (s.lat >= 0 ? 'N' : 'S') + ', ' + fmt2(Math.abs(s.lng)) + '° ' + (s.lng >= 0 ? 'E' : 'O') + '</div></div>';
}

const NET_LABELS = { countries: 'Natural Earth frontières', cities: 'Natural Earth villes', volcanoes: 'Volcans', restcountries: 'REST Countries', worldbank: 'Banque mondiale', usgs: 'USGS séismes', eonet: 'NASA EONET', iss: 'ISS (wheretheiss.at)', openmeteo: 'Open-Meteo' };
function updateNet() {
  const keys = Object.keys(NET_LABELS).filter(k => state.net[k]);
  const b = $('#netBadge');
  if (!keys.length || !b) return;
  const cached = keys.filter(k => state.net[k] !== 'live');
  b.classList.toggle('live', !cached.length);
  b.classList.toggle('cache', !!cached.length);
  b.innerHTML = '<span class="pulse"></span>' + (cached.length ? 'Cache' : 'Live');
  b.title = cached.length ? 'Sources en secours embarqué : ' + cached.map(k => NET_LABELS[k]).join(', ') : 'Toutes les sources externes répondent en direct';
}

function midArc(a, b) { return [(a[0] + b[0]) / 2, ((a[1] + b[1] + 540) % 360) - 180]; }

function buildSearch() {
  const idx = [];
  const push = (label, sub, lat, lng, item) => {
    if (isFinite(lat) && isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) idx.push({ label, sub, lat, lng, item });
  };
  if (DATA.countries) for (const f of DATA.countries.features) { const c = centroid(f); push(f.properties.NAME || 'Pays', 'Pays · ' + (f.properties.CONTINENT || ''), c.lat, c.lng, polyItem(f)); }
  for (const c of DATA.cityPts) push(c.name, 'Ville · pop. ' + fmt(c.pop), c.lat, c.lng, c);
  for (const v of DATA.volcPts) if (v.elev >= 2500) push(v.name, 'Volcan · ' + fmt(v.elev) + ' m', v.lat, v.lng, v);
  for (const p of PORTS) push(p.name, 'Port majeur · ' + p.metric, p.lat, p.lng, { layer: 'port', lat: p.lat, lng: p.lng, name: p.name, metric: p.metric });
  for (const s of STRAITS) push(s.name, 'Détroit stratégique', s.lat, s.lng, { layer: 'strait', lat: s.lat, lng: s.lng, name: s.name, metric: s.metric });
  for (const c of CABLES) { const m = midArc(c.a, c.b); push(c.name, 'Câble sous-marin · ' + c.tbsp + ' Tbps', m[0], m[1], { layer: 'cable', name: c.name, metric: fmt(c.km) + ' km · ' + c.tbsp + ' Tbps · ' + c.from + ' ↔ ' + c.to, ref: c }); }
  for (const t of TRENCHES) push(t.name, 'Fosse abyssale · ' + t.metric, t.lat, t.lng, { layer: 'trench', lat: t.lat, lng: t.lng, name: t.name, metric: t.metric });
  for (const r of RIVERS) { const m = r.points[Math.floor(r.points.length / 2)]; push(r.name, 'Grand fleuve · ' + r.metric, m[0], m[1], { layer: 'river', name: r.name, metric: r.metric }); }
  for (const r of RANGES) { const m = r.points[Math.floor(r.points.length / 2)]; push(r.name, 'Chaîne de montagnes', m[0], m[1], { layer: 'range', name: r.name, metric: r.metric }); }
  for (const r of AIR_ROUTES) { const m = midArc(r.a, r.b); push(r.name, 'Route aérienne', m[0], m[1], { layer: 'air', name: r.name, metric: 'Ligne long-courrier' }); }
  for (const s of SHIPS) push(s.name, 'Navire · ' + s.type, s.lat, s.lng, { layer: 'ship', lat: s.lat, lng: s.lng, name: s.name, type: s.type, metric: s.type + ' · ' + s.metric });
  for (const q of DATA.quakes.slice().sort((a, b) => b.mag - a.mag).slice(0, 25)) push(q.name, 'Séisme M' + fmt1(q.mag), q.lat, q.lng, q);
  SEARCH_INDEX = idx;
}

function flyTo(lat, lng, alt) {
  state.flash = { lat, lng, until: Date.now() + 3200 };
  rebuild();
  world.pointOfView({ lat, lng, altitude: alt }, 1400);
}

function setupSearch() {
  const input = $('#search'), box = $('#searchResults');
  input.addEventListener('input', () => {
    const q = normStr(input.value.trim());
    if (q.length < 2) { box.classList.add('hidden'); return; }
    const res = SEARCH_INDEX.filter(x => normStr(x.label + ' ' + x.sub).includes(q)).slice(0, 8);
    if (!res.length) { box.classList.add('hidden'); return; }
    box.innerHTML = res.map((r, i) =>
      '<button class="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/10" data-i="' + i + '">' +
      '<div class="text-[12.5px] text-slate-100">' + esc(r.label) + '</div>' +
      '<div class="text-[10.5px] text-slate-400">' + esc(r.sub) + '</div></button>').join('');
    box.classList.remove('hidden');
    $$('#searchResults button').forEach(b => b.addEventListener('mousedown', e => {
      e.preventDefault();
      const r = res[+b.dataset.i];
      box.classList.add('hidden');
      flyTo(r.lat, r.lng, r.item && r.item.layer === 'country' ? 0.9 : 0.55);
    }));
  });
  input.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const q = normStr(input.value.trim());
    const r = SEARCH_INDEX.find(x => normStr(x.label) === q) || SEARCH_INDEX.filter(x => normStr(x.label + ' ' + x.sub).includes(q))[0];
    if (r) { box.classList.add('hidden'); flyTo(r.lat, r.lng, r.item && r.item.layer === 'country' ? 0.9 : 0.55); }
  });
  document.addEventListener('click', e => { if (!e.target.closest('#searchBox')) box.classList.add('hidden'); });
}

function setMode(m) {
  state.mode = m;
  $$('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  if (!world) return;
  const mat = world.globeMaterial();
  if (m === 'satellite') world.globeImageUrl(IMG.satellite);
  else if (m === 'night') world.globeImageUrl(IMG.night);
  else world.globeImageUrl(IMG.topology);
  if (!THREE) return;
  if (m === 'satellite') {
    mat.bumpMap = bumpTex || null; if (bumpTex) mat.bumpScale = 0.05;
    mat.emissiveMap = null; mat.emissive = new THREE.Color(0x000000); mat.emissiveIntensity = 1;
    mat.specularMap = waterTex || null; mat.specular = new THREE.Color(0x8fa3b8); mat.shininess = 16;
  } else if (m === 'night') {
    mat.bumpMap = null;
    mat.emissiveMap = nightTex || null; mat.emissive = new THREE.Color(0xffffff); mat.emissiveIntensity = 1.25;
    mat.specular = new THREE.Color(0x000000);
  } else {
    mat.bumpMap = bumpTex || null; if (bumpTex) mat.bumpScale = 0.1;
    mat.emissiveMap = null; mat.emissive = new THREE.Color(0x000000);
    mat.specularMap = waterTex || null; mat.specular = new THREE.Color(0x8fa3b8); mat.shininess = 16;
  }
  mat.needsUpdate = true;
}

function setChoro(v) {
  state.choro = v;
  $$('#choroSeg button').forEach(b => b.classList.toggle('on', b.dataset.choro === v));
  refreshPoly(true);
  updateLegend();
}

function zoomBy(f) {
  if (!world) return;
  const pov = world.pointOfView();
  if (!pov) return;
  world.pointOfView({ lat: pov.lat, lng: pov.lng, altitude: clamp(pov.altitude * f, 0.15, 4) }, 350);
}

function toggleFollowIss() {
  state.followIss = !state.followIss;
  $('#btnIss').classList.toggle('on', state.followIss);
  if (state.followIss && !state.layers.iss) {
    state.layers.iss = true;
    const inp = document.querySelector('#layerList input[data-layer="iss"]');
    if (inp) inp.checked = true;
    rebuild();
  }
  if (state.followIss && world) world.pointOfView({ lat: state.iss.lat, lng: state.iss.lng, altitude: 0.6 }, 1200);
}

function buildPanel() {
  let html = '', lastDomain = null;
  for (const L of LAYER_DEFS) {
    if (L.domain !== lastDomain) {
      html += '<div class="mt-3 mb-1 text-[10px] uppercase tracking-[.14em] text-slate-500">' + esc(L.domain) + '</div>';
      lastDomain = L.domain;
    }
    html += '<div class="flex items-center gap-2 py-[3px]">' +
      '<span class="text-[12.5px] text-slate-200 flex-1">' + esc(L.label) + '</span>' +
      '<span class="cnt text-[10px] font-mono text-slate-400 bg-white/5 rounded-md px-1.5 py-0.5" data-id="' + L.id + '"></span>' +
      '<label class="sw"><input type="checkbox" data-layer="' + L.id + '"' + (state.layers[L.id] ? ' checked' : '') + '><i></i></label></div>';
  }
  $('#layerList').innerHTML = html;
  $$('#layerList input').forEach(inp => inp.addEventListener('change', () => {
    state.layers[inp.dataset.layer] = inp.checked;
    rebuild();
  }));
  $$('#modeSeg button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $$('#choroSeg button').forEach(b => b.addEventListener('click', () => setChoro(b.dataset.choro)));
  $$('#presets button[data-lat]').forEach(b => b.addEventListener('click', () => {
    world.pointOfView({ lat: +b.dataset.lat, lng: +b.dataset.lng, altitude: +b.dataset.alt }, 1500);
  }));
  $('#btnIss').addEventListener('click', toggleFollowIss);
  $('#btnZoomIn').addEventListener('click', () => zoomBy(0.65));
  $('#btnZoomOut').addEventListener('click', () => zoomBy(1.5));
  $('#btnResetFilters').addEventListener('click', () => {
    for (const k in state.layers) state.layers[k] = false;
    $$('#layerList input').forEach(i => { i.checked = false; });
    setChoro('none');
    state.followIss = false;
    $('#btnIss').classList.remove('on');
    rebuild();
  });
  $('#btnPlay').addEventListener('click', () => {
    state.autoRotate = !state.autoRotate;
    world.controls().autoRotate = state.autoRotate;
    $('#btnPlay').textContent = state.autoRotate ? '⏸ Rotation auto' : '▶ Rotation auto';
  });
  $('#btnReset').addEventListener('click', () => {
    state.followIss = false;
    $('#btnIss').classList.remove('on');
    state.autoRotate = true;
    world.controls().autoRotate = true;
    $('#btnPlay').textContent = '⏸ Rotation auto';
    world.pointOfView({ lat: 24, lng: 8, altitude: 2.4 }, 1400);
  });
  $('#panelClose').addEventListener('click', () => { $('#panel').classList.add('collapsed'); $('#panelToggle').classList.remove('hidden'); });
  $('#panelToggle').addEventListener('click', () => { $('#panel').classList.remove('collapsed'); $('#panelToggle').classList.add('hidden'); });
  $('#detail').addEventListener('click', e => {
    const b = e.target.closest('.detail-close');
    if (!b) return;
    const card = b.closest('[data-card]');
    if (card) card.innerHTML = '';
    syncDetailPanel();
  });
  setMode('satellite');
  setChoro('none');
  $('#btnPlay').textContent = state.autoRotate ? '⏸ Rotation auto' : '▶ Rotation auto';
  setupSearch();
}

function setupEvents() {
  const el = $('#globe');
  el.addEventListener('pointermove', e => { state.mouse.x = e.clientX; state.mouse.y = e.clientY; });
  window.addEventListener('resize', () => { world.width(window.innerWidth).height(window.innerHeight); });
}

async function init() {
  THREE = window.THREE || null;
  if (!window.Globe) { logLoad('ERREUR : globe.gl non chargé (CDN injoignable ?)' + (window.__LIBS_ERROR ? ' — ' + window.__LIBS_ERROR : ''), false); return; }
  if (!THREE) logLoad('Avertissement : THREE absent — objets 3D personnalisés (nuages, ISS) désactivés', false);
  buildPanel();
  try { setupGlobe(); } catch (e) { console.error(e); logLoad('ERREUR moteur WebGL : ' + ((e && e.message) || e), false); return; }
  setupEvents();
  initCustom();
  requestAnimationFrame(tick);
  logLoad('Moteur WebGL (globe.gl / three.js) initialisé', true);
  loadWaterMask();
  await loadStatic();
  await Promise.all([loadQuakes(), loadEonet(), loadIss(), loadWorldBank()]);
  buildScales();
  rebuild();
  updateNet();
  setInterval(loadIss, 5000);
  setInterval(() => { loadQuakes(); loadEonet(); }, 60000);
  logLoad('Toutes les couches sont prêtes — globe interactif', true);
  bootDone = true;
  maybeHideLoader();
  setTimeout(maybeHideLoader, 12500);
  world.pointOfView({ lat: 24, lng: 8, altitude: 2.4 }, 2200);
}

let bootTries = 0;
function boot() {
  if (window.Globe || ++bootTries > 160) init();
  else setTimeout(boot, 50);
}
boot();
