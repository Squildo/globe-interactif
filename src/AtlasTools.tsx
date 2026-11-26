import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, BriefcaseBusiness, Compass, Crosshair, Grid3X3, Layers3, MapPin, Minus, Moon, Mountain, Plus, RotateCcw, Search, Sun, X } from 'lucide-react';
import { type Action, type Atlas, type LayerId, type Style } from './atlas';
import { catalog, getLayer } from './catalog';
import { searchPlaces } from './data';
import { isStyleAvailable } from './edition';
import { formatTime } from './LayerPanel';
import type { CameraCommand, Selection } from './GlobeView';
import type { Place } from './models';

export function PlaceSearch({ places, onPick }: { places: Place[]; onPick: (place: Place) => void }) {
  const [query, setQuery] = useState(''), [open, setOpen] = useState(false), [index, setIndex] = useState(-1);
  const result = searchPlaces(places, query);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); input.current?.focus(); }
    };
    document.addEventListener('keydown', shortcut); return () => document.removeEventListener('keydown', shortcut);
  }, []);
  const pick = (place: Place) => { onPick(place); setOpen(false); setQuery(''); setIndex(-1); };
  const expanded = open && query.trim().length >= 2;
  return <div className="place-search" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
    <div className="search"><Search size={17} /><input ref={input} role="combobox" aria-label="Rechercher un lieu" aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? 'place-results' : undefined} aria-activedescendant={expanded && result[index] ? `place-${result[index].id}` : undefined} placeholder="Rechercher un lieu…" value={query} onFocus={() => setOpen(true)} onChange={e => { setQuery(e.target.value); setIndex(-1); setOpen(true); }} onKeyDown={e => {
      if (e.key === 'Escape') { setOpen(false); setIndex(-1); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); setIndex(i => result.length ? (i < 0 ? (e.key === 'ArrowUp' ? result.length - 1 : 0) : (i + (e.key === 'ArrowUp' ? -1 : 1) + result.length) % result.length) : -1); }
      if (e.key === 'Enter' && expanded && result.length) { e.preventDefault(); pick(result[Math.max(0, index)]); }
    }} /><kbd>Ctrl K</kbd></div>
    {expanded && <div className="search-popover"><div role="listbox" aria-label="Lieux trouvés" id="place-results">{result.map((place, i) => <button tabIndex={-1} type="button" role="option" aria-selected={i === index} key={place.id} id={`place-${place.id}`} onMouseDown={e => e.preventDefault()} onClick={() => pick(place)}><MapPin size={15} /><span>{place.name}<small>{place.context}</small></span><ArrowUpRight size={14} /></button>)}</div>{!result.length && <p role="status">Aucun lieu trouvé.</p>}</div>}
  </div>;
}

const looks = [{ id: 'satellite', name: 'Satellite', icon: Sun }, { id: 'night', name: 'Nuit', icon: Moon }, { id: 'relief', name: 'Relief', icon: Mountain }] satisfies { id: Style; name: string; icon: typeof Sun }[];
export function BaseControls({ atlas, change, panel, onPanel }: { atlas: Atlas; change: (a: Action) => void; panel: boolean; onPanel: () => void }) {
  return <div className="map-tools">
    {!panel && <button className="tool-button" onClick={onPanel} aria-controls="layer-panel" aria-expanded={false}><Layers3 size={17} /><span>Couches</span></button>}
    {atlas.body === 'earth' && <div className="map-segments" aria-label="Fond du globe">{looks.map(({ id, name, icon: Icon }) => <button key={id} className={atlas.style === id ? 'map-chosen' : ''} aria-pressed={atlas.style === id} aria-label={`Fond ${name.toLowerCase()}`} disabled={!isStyleAvailable(id)} title={!isStyleAvailable(id) ? 'Réservé à l’édition locale' : undefined} onClick={() => change({ type: 'style', value: id })}><Icon size={16} /><span>{name}</span></button>)}</div>}
    <button type="button" className="tool-button grid-button" aria-label="Grille géographique" aria-pressed={atlas.graticules} title="Grille géographique" onClick={() => change({ type: 'grid', value: !atlas.graticules })}><Grid3X3 size={17} /></button>
  </div>;
}
export function Navigation({ spinning, onSpin, onCamera }: { spinning: boolean; onSpin: () => void; onCamera: (command: Omit<CameraCommand, 'key'>) => void }) {
  return <div className="atlas-nav" aria-label="Commandes du globe">
    <button aria-label="Recentrer le globe" title="Recentrer le globe" onClick={() => onCamera({})}><Crosshair size={19} /></button>
    <div className="zoom-group"><button aria-label="Zoom avant" title="Zoom avant" onClick={() => onCamera({ zoom: 0.72 })}><Plus size={18} /></button><button aria-label="Zoom arrière" title="Zoom arrière" onClick={() => onCamera({ zoom: 1.38 })}><Minus size={18} /></button></div>
    <button aria-label="Rotation automatique" aria-pressed={spinning} title="Rotation automatique" onClick={onSpin}><RotateCcw size={17} /></button>
  </div>;
}

export function Legend({ atlas, change }: { atlas: Atlas; change: (a: Action) => void }) {
  const active = catalog.filter(layer => atlas.active.includes(layer.id) && (atlas.body === 'moon' ? layer.id === 'moon-landings' : layer.id !== 'moon-landings'));
  return <div className="legend" aria-label="Légende et couches visibles"><div className="legend-caption"><Layers3 size={14} /><span>COUCHES VISIBLES</span></div>
    <div className="chips">{active.length ? active.map(layer => <button type="button" key={layer.id} title={`Masquer ${layer.title}`} aria-label={`Masquer ${layer.title}`} onClick={() => change({ type: 'layer', id: layer.id, enabled: false })}><i style={{ background: layer.color }} />{layer.title}<X size={12} /></button>) : <span className="muted">Aucune couche affichée</span>}</div>
    {atlas.body === 'earth' && active.some(x => x.id === 'countries') && (atlas.countryMode === 'population' || atlas.countryMode === 'gdp') && <div className="scale-legend"><span>Valeur faible</span><i /><span>Valeur élevée</span><small>· Estimations</small></div>}
    {active.some(x => x.id === 'air' || x.id === 'sea') && <div className="scale-legend"><span>Mailles de densité : 3–5 · 6–10 · plus de 10</span></div>}
  </div>;
}

const fmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
export function DetailCard({ selection, onClose }: { selection: Selection; onClose: () => void }) {
  const { layer, data } = selection, meta = getLayer(layer);
  const facts: [string, string][] = [];
  if ('nativeName' in data) {
    if (data.population && data.population > 0) facts.push([`Population${data.populationYear ? ` (${data.populationYear})` : ''}`, fmt.format(data.population)]);
    if (data.gdp && data.gdp > 0) facts.push([`PIB${data.gdpYear ? ` (${data.gdpYear})` : ''}`, `${fmt.format(data.gdp)} M$`]);
  } else if ('weight' in data) facts.push(['Entrées dans la source', fmt.format(data.weight)], ['Millésime', '2014']);
  else {
    if (data.subtitle) facts.push(['Contexte', data.subtitle]);
    if (data.number !== undefined) facts.push([({ cities: 'Population estimée', quakes: 'Magnitude', volcanoes: 'Altitude (m)', population: 'Population estimée', satellites: 'Altitude estimée (km)' } as Partial<Record<LayerId, string>>)[layer] ?? 'Valeur', fmt.format(data.number)]);
    if (data.depth !== undefined) facts.push(['Profondeur (km)', fmt.format(data.depth)]);
    if (data.observedAt) facts.push([layer === 'satellites' ? 'Époque des éléments orbitaux' : 'Date de mesure', `${new Date(data.observedAt).toLocaleDateString('fr-FR', { timeZone: 'UTC' })} · ${formatTime(data.observedAt)}`]);
    if (layer !== 'air' && layer !== 'sea') facts.push(['Coordonnées', `${fmt.format(data.lat)}°, ${fmt.format(data.lng)}°`]);
  }
  return <section className="details pop-card" aria-label="Détail de la sélection"><header><span><BriefcaseBusiness size={14} /> {meta.title}</span><button className="icon-button" aria-label="Fermer le détail" onClick={onClose}><X size={18} /></button></header><h2>{data.name}</h2><dl>{facts.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl><a href={meta.url} target="_blank" rel="noreferrer">Source : {meta.source} <ArrowUpRight size={14} /></a></section>;
}

export function CameraBadge({ lat, lng, moon }: { lat: number; lng: number; moon: boolean }) {
  return <span className="camera-coords"><Compass size={14} /> <span>{Math.abs(lat).toFixed(1)}° {lat >= 0 ? 'N' : 'S'} <i>/</i> {Math.abs(lng).toFixed(1)}° {lng >= 0 ? 'E' : 'O'}{moon ? ' · LUNE' : ''}</span></span>;
}
