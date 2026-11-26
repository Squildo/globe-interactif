import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, ChevronRight, Globe2, Layers3, MapPin, Moon, RotateCcw, Sparkles, X } from 'lucide-react';
import { applyActions, defaultAtlas, regions, type Action, type Atlas } from './atlas';
import { BaseControls, CameraBadge, DetailCard, Legend, Navigation, PlaceSearch } from './AtlasTools';
import { Assistant } from './Assistant';
import { catalog } from './catalog';
import { searchPlaces, useAtlasData } from './data';
import { LayerPanel } from './LayerPanel';
import type { CameraCommand, Selection } from './GlobeView';
import type { Mark, Place } from './models';

const GlobeView = lazy(() => import('./GlobeView'));
const initialCamera = { lat: 24, lng: 11, altitude: 2.02 };
const initialAtlas = (): Atlas => {
  try {
    const value = localStorage.getItem('terrascope-style');
    return value === 'night' || value === 'relief' ? { ...defaultAtlas, style: value } : defaultAtlas;
  } catch { return defaultAtlas; }
};

export default function App() {
  const [atlas, setAtlas] = useState(initialAtlas);
  const data = useAtlasData(atlas);
  const [panel, setPanel] = useState(() => !matchMedia('(max-width: 860px)').matches), [assist, setAssist] = useState(false);
  const [selection, setSelection] = useState<Selection>(), [spinning, setSpinning] = useState(false);
  const [camera, setCamera] = useState(initialCamera), [command, setCommand] = useState<CameraCommand | null>(null);
  const [visibleOrbits, setVisibleOrbits] = useState(0);
  const [focusName, setFocusName] = useState(''), [undo, setUndo] = useState<{ atlas: Atlas; camera: typeof camera; focus: string }>();
  const [showSearch, setShowSearch] = useState(false);
  const serial = useRef(0), sources = useRef<HTMLDialogElement>(null), assistantTrigger = useRef<HTMLButtonElement>(null);
  const navigate = useCallback((options: Omit<CameraCommand, 'key'>) => {
    setSpinning(false); setCommand({ ...options, key: ++serial.current });
    if (!options.position && !options.zoom) { setFocusName(''); setSelection(undefined); }
  }, []);
  const focus = (place: Place) => {
    setFocusName(place.name); navigate({ position: { lat: place.lat, lng: place.lng, altitude: place.altitude ?? 0.62 } });
    setShowSearch(false);
  };
  const focusTransport = (region: keyof typeof regions, maritime: boolean) => {
    focus({ ...regions[maritime ? 'atlantic' : region], id: 'region', context: 'Région', altitude: maritime ? 0.22 : 0.40 });
  };
  const focusSatellite = (satellite: Mark) => {
    focus({ ...satellite, name: satellite.id === '25544' ? 'ISS' : satellite.name, context: 'Orbite', altitude: Math.max(0.9, (satellite.altitude ?? 0) + 0.5) });
    setSelection(undefined);
    if (matchMedia('(max-width: 860px)').matches) setPanel(false);
  };
  const change = (action: Action) => {
    const next = applyActions(atlas, [action]);
    setAtlas(next); setUndo(undefined);
    if (action.type === 'style' || action.type === 'reset') try { localStorage.setItem('terrascope-style', next.style); } catch { /* storage unavailable */ }
    if (action.type === 'reset' || atlas.body !== next.body) navigate({});
    if (action.type === 'layer' && !action.enabled && action.id === selection?.layer) setSelection(undefined);
    if (action.type === 'region' || action.type === 'layer' && action.enabled && (action.id === 'air' || action.id === 'sea')) {
      focusTransport(next.region, action.type === 'layer' && action.id === 'sea');
    }
  };
  const apply = (actions: Action[]) => {
    const placeActions = actions.flatMap(action => action.type === 'focus' ? [action] : []);
    const resolved = placeActions.map(a => ({ a, match: searchPlaces(data.places, a.place, 1)[0] }));
    const unknown = resolved.find(result => !result.match);
    if (unknown) return `Lieu introuvable : « ${unknown.a.place} ». Aucun changement appliqué.`;
    const next = applyActions(atlas, actions);
    setUndo({ atlas, camera, focus: focusName }); setAtlas(next); setSelection(undefined);
    const target = resolved.at(-1)?.match;
    if (target && next.body === 'earth') focus(target);
    else if (next.body === 'earth' && actions.some(a => a.type === 'region' || a.type === 'layer' && a.id === 'air' && a.enabled) && next.active.includes('air')) focusTransport(next.region, false);
    else if (next.body === 'earth' && actions.some(a => a.type === 'layer' && a.id === 'sea' && a.enabled) && next.active.includes('sea')) focusTransport(next.region, true);
    else if (atlas.body !== next.body || actions.some(a => a.type === 'reset')) navigate({});
    return null;
  };
  const undoCommand = () => { if (!undo) return; setAtlas(undo.atlas); setFocusName(undo.focus); navigate({ position: undo.camera }); setUndo(undefined); };
  const select = useCallback((value: Selection) => { setAssist(false); setSelection(value); }, []);
  const closeAssistant = () => { setAssist(false); assistantTrigger.current?.focus(); };
  useEffect(() => {
    const end = (e: KeyboardEvent) => { if (e.key === 'Escape' && assist && !sources.current?.open) closeAssistant(); };
    document.addEventListener('keydown', end); return () => document.removeEventListener('keydown', end);
  }, [assist]);
  const activeCount = catalog.filter(layer => atlas.active.includes(layer.id) && (atlas.body === 'moon' ? layer.id === 'moon-landings' : layer.id !== 'moon-landings')).length;

  return <div className="shell">
    <header className="topbar">
      <div className="branding"><img src="/mark.svg" alt="" width="40" height="40" /><div><strong>TerraScope<span>.</span></strong><small>ATLAS INTERACTIF</small></div></div>
      <div className="breadcrumbs"><Globe2 size={15} /><span>Atlas</span><ChevronRight size={13} /><strong>{atlas.body === 'earth' ? 'Globe terrestre' : 'Globe lunaire'}</strong></div>
      <div className={`top-search ${showSearch ? 'search-open' : ''}`}><PlaceSearch places={data.places} onPick={place => { if (atlas.body !== 'earth') setAtlas(applyActions(atlas, [{ type: 'body', value: 'earth' }])); focus(place); }} /></div>
      <button className="mobile-search icon-button" aria-label="Ouvrir la recherche géographique" aria-expanded={showSearch} onClick={() => setShowSearch(!showSearch)}><MapPin size={18} /></button>
      <button ref={assistantTrigger} className="assistant-trigger" aria-expanded={assist} onClick={() => { setAssist(!assist); setSelection(undefined); if (matchMedia('(max-width: 860px)').matches) setPanel(false); }}><Sparkles size={17} /><span>Assistant</span></button>
    </header>
    <main className={`workspace ${panel ? 'with-panel' : ''}`}>
      {panel && <LayerPanel atlas={atlas} data={data} change={change} visibleOrbits={visibleOrbits} onSatellite={focusSatellite} onClose={() => setPanel(false)} onSources={() => sources.current?.showModal()} />}
      <section className="map-stage" aria-label="Carte interactive">
        <div className="map-grid" aria-hidden="true" />
        <Suspense fallback={<div className="globe-fallback" role="status">Chargement du moteur 3D…</div>}><GlobeView atlas={atlas} data={data} camera={camera} command={command} spinning={spinning} onCamera={setCamera} onOrbitVisibility={setVisibleOrbits} onSelect={select} /></Suspense>
        <div className="map-toolbar"><BaseControls atlas={atlas} change={change} panel={panel} onPanel={() => { setPanel(true); setAssist(false); }} />
          <div className="world-controls"><button className="tool-button body-button" onClick={() => change(atlas.body === 'earth' ? { type: 'layer', id: 'moon-landings', enabled: true } : { type: 'body', value: 'earth' })}>{atlas.body === 'earth' ? <Moon size={16} /> : <Globe2 size={16} />} {atlas.body === 'earth' ? 'Lune' : 'Terre'}</button><button className="tool-button reset-button" onClick={() => change({ type: 'reset' })} title="Réinitialiser les filtres" aria-label="Réinitialiser les filtres"><RotateCcw size={16} /></button></div>
        </div>
        <div className="map-heading"><div><i /> {atlas.body === 'earth' ? 'TERRE / 01' : 'LUNE / 02'} <span>·</span> {focusName ? `FOCUS : ${focusName}` : 'VUE GLOBALE'}</div><h1>{atlas.body === 'earth' ? 'Globe terrestre' : 'Globe lunaire'}</h1><p>{atlas.body === 'earth' ? 'Géographies, phénomènes et flux du monde.' : 'Explore les sites historiques d’alunissage.'}</p></div>
        <Navigation spinning={spinning} onSpin={() => setSpinning(!spinning)} onCamera={navigate} />
        <Legend atlas={atlas} change={change} />
        <button className="stage-credit" onClick={() => sources.current?.showModal()}>Globe.gl <span>·</span> Crédits <ArrowUpRight size={12} /></button>
        {selection && <DetailCard selection={selection} onClose={() => setSelection(undefined)} />}
        {assist && <Assistant onClose={closeAssistant} onApply={apply} onUndo={undoCommand} canUndo={Boolean(undo)} />}
      </section>
    </main>
    <footer className="statusbar"><span className="status-brand"><span className="status-dot" /> Atlas local</span><span className="status-count"><Layers3 size={13} /> {activeCount} couche{activeCount !== 1 ? 's' : ''} visible{activeCount !== 1 ? 's' : ''}</span><span className="status-chrome">MODÈLE SPHÉRIQUE <b>·</b> WGS84</span><CameraBadge {...camera} moon={atlas.body === 'moon'} /></footer>
    <dialog className="sources" ref={sources} aria-labelledby="sources-title">
      <header><span><BookOpen size={18} /> Registre</span><form method="dialog"><button className="icon-button" aria-label="Fermer les sources"><X size={20} /></button></form></header>
      <h2 id="sources-title">Sources et crédits</h2><p>Les couches ne sont pas toujours exhaustives. Les estimations, données historiques et flux actualisés sont distingués dans le catalogue. Cet atlas n’est pas destiné à la navigation.</p>
      <ul>{catalog.map(layer => <li key={layer.id}><strong>{layer.title}</strong><a href={layer.url} target="_blank" rel="noreferrer">{layer.source} <ArrowUpRight size={13} /></a><small>{layer.description}</small></li>)}</ul><p>Fonds : textures des exemples Globe.gl / three-globe ; Blue Marble, NASA (Terre). Rendu : Globe.gl / Three.js.</p>
    </dialog>
  </div>;
}
