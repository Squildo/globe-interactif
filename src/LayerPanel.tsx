import { useState } from 'react';
import { Activity, Building2, ChevronDown, CircleHelp, Cloud, Flame, Globe2, Layers3, MapPin, Mountain, Orbit, Plane, Radio, Route, Search, Ship, Waves, X } from 'lucide-react';
import { regions, type Action, type Atlas, type LayerId, type Region } from './atlas';
import { catalog, groups, type Layer } from './catalog';
import type { AtlasData } from './data';
import type { Feed, Mark } from './models';

const icons = { countries: Globe2, cities: Building2, population: MapPin, quakes: Activity, volcanoes: Mountain, events: Flame,
  airports: Plane, routes: Route, air: Radio, sea: Ship, cables: Waves, satellites: Orbit, clouds: Cloud, 'moon-landings': MapPin };
export const formatTime = (time: number) => new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(time) + ' UTC';
const labels: Record<Feed['status'], string> = { fresh: 'Actualisé', stale: 'En retard', disabled: 'À configurer', loading: 'Chargement', unavailable: 'Indisponible', limited: 'Quota atteint' };
export const getFeed = (id: LayerId, data: AtlasData) => ({ quakes: data.quakes, events: data.events, air: data.air, sea: data.sea, satellites: data.satellites } as Partial<Record<LayerId, Feed>>)[id];

function options(layer: Layer, atlas: Atlas, change: (action: Action) => void) {
  if (layer.id === 'countries') return <label>Représentation<select aria-label="Représentation" value={atlas.countryMode} onChange={e => change({ type: 'countryMode', value: e.target.value as Atlas['countryMode'] })}><option value="borders">Frontières</option><option value="population">Population estimée</option><option value="gdp">PIB estimé</option><option value="hex">Maillage hexagonal</option></select></label>;
  if (layer.id === 'population') return <label>Représentation<select aria-label="Représentation" value={atlas.populationMode} onChange={e => change({ type: 'populationMode', value: e.target.value as Atlas['populationMode'] })}><option value="heat">Carte de chaleur</option><option value="columns">Colonnes</option></select></label>;
  if (layer.id === 'volcanoes') return <label>Représentation<select aria-label="Représentation" value={atlas.volcanoMode} onChange={e => change({ type: 'volcanoMode', value: e.target.value as Atlas['volcanoMode'] })}><option value="points">Points</option><option value="heat">Carte de chaleur</option></select></label>;
  if (layer.id === 'quakes') return <div className="filter-pair">
    <label>Période<select aria-label="Période" value={atlas.period} onChange={e => change({ type: 'period', value: Number(e.target.value) as Atlas['period'] })}><option value={1}>24 heures</option><option value={7}>7 jours</option><option value={30}>30 jours</option></select></label>
    <label>Magnitude min.<select aria-label="Magnitude min." value={atlas.minMagnitude} onChange={e => change({ type: 'magnitude', value: Number(e.target.value) })}>{[...new Set([0, 2.5, 4.5, 5, 5.5, 6, 7, atlas.minMagnitude])].sort((a, b) => a - b).map(m => <option key={m} value={m}>{m.toLocaleString('fr-FR')}</option>)}</select></label>
  </div>;
  if (layer.id === 'air') return <label>Région<select aria-label="Région" value={atlas.region} onChange={e => change({ type: 'region', value: e.target.value as Region })}>{Object.entries(regions).map(([id, r]) => <option key={id} value={id}>{r.name}</option>)}</select></label>;
  return null;
}

export function LayerPanel({ atlas, data, change, visibleOrbits, onSatellite, onClose, onSources }: {
  atlas: Atlas; data: AtlasData; change: (action: Action) => void; visibleOrbits: number;
  onSatellite: (satellite: Mark) => void; onClose: () => void; onSources: () => void;
}) {
  const [filter, setFilter] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [closed, setClosed] = useState<string[]>([]);
  const [info, setInfo] = useState<LayerId[]>([]);
  const orbits = data.satellites.items, iss = orbits.find(mark => mark.id === '25544');
  const selected = catalog.filter(layer => (!activeOnly || atlas.active.includes(layer.id)) && `${layer.title} ${layer.source}`.toLocaleLowerCase('fr').normalize('NFD').replace(/\p{M}/gu, '').includes(filter.toLocaleLowerCase('fr').normalize('NFD').replace(/\p{M}/gu, '').trim()));
  return <aside className="sidebar" id="layer-panel" aria-labelledby="layer-title">
    <div className="sidebar-top">
      <div className="sidebar-eyebrow"><Layers3 size={15} /><span>EXPLORER L’ATLAS</span><button className="icon-button close-layer" onClick={onClose} aria-label="Fermer le catalogue"><X size={18} /></button></div>
      <h2 id="layer-title">Couches</h2><p>Compose ta propre lecture du monde.</p>
      <label className="search layer-search"><Search size={15} /><input placeholder="Rechercher une couche…" aria-label="Rechercher une couche" value={filter} onChange={e => setFilter(e.target.value)} />{filter && <button type="button" className="search-clear" aria-label="Effacer le filtre" onClick={() => setFilter('')}><X size={14} /></button>}</label>
      <div className="layer-tabs" aria-label="Filtrer le catalogue"><button className={!activeOnly ? 'chosen' : ''} aria-pressed={!activeOnly} onClick={() => setActiveOnly(false)}>Toutes <span>{catalog.length}</span></button><button className={activeOnly ? 'chosen' : ''} aria-pressed={activeOnly} onClick={() => setActiveOnly(true)}>Actives <span>{atlas.active.length}</span></button></div>
    </div>
    <div className="layer-list">
      {!selected.length && <p className="empty-note">Aucune couche ne correspond.</p>}
      {groups.map(group => {
        const items = selected.filter(layer => layer.group === group.id);
        if (!items.length) return null;
        const open = Boolean(filter) || !closed.includes(group.id);
        return <section key={group.id} className="layer-group"><h3><button aria-expanded={open} aria-controls={`group-${group.id}`} onClick={() => setClosed(previous => open ? [...previous, group.id] : previous.filter(id => id !== group.id))}><span><b>{group.index}</b> {group.name}</span><ChevronDown size={15} className={open ? '' : 'closed-chevron'} /></button></h3>
          <div id={`group-${group.id}`} hidden={!open}>{items.map(layer => {
            const Icon = icons[layer.id], enabled = atlas.active.includes(layer.id), expanded = info.includes(layer.id);
            const feed = getFeed(layer.id, data), filters = layer.restriction ? null : options(layer, atlas, change);
            const error = data.errors[layer.id as keyof typeof data.errors];
            return <div key={layer.id} className={`layer ${enabled ? 'enabled' : ''}`}>
              <div className="layer-row">
                <button className="layer-name" aria-expanded={expanded} aria-controls={`layer-info-${layer.id}`} onClick={() => setInfo(old => old.includes(layer.id) ? old.filter(id => id !== layer.id) : [...old, layer.id])}>
                  <span className="layer-icon" style={{ color: layer.color }}><Icon size={15} strokeWidth={1.8} /></span><span><strong>{layer.title}</strong><small>{layer.restriction ? (layer.id === 'cables' ? 'Source à valider' : 'Édition locale') : enabled && feed ? labels[feed.status] : error ? 'Indisponible' : `${layer.source}${enabled && data.counts[layer.id] ? ` · ${data.counts[layer.id]!.toLocaleString('fr-FR')}` : ''}`}</small></span>
                </button>
                <button className="switch-hit" role="switch" type="button" aria-label={layer.title} aria-checked={enabled} disabled={Boolean(layer.restriction)}
                  onClick={() => { change({ type: 'layer', id: layer.id, enabled: !enabled }); if (!enabled && (feed || layer.id === 'population')) setInfo(old => old.includes(layer.id) ? old : [...old, layer.id]); }}><span className="switch-track" /></button>
              </div>
              <div className="layer-info" id={`layer-info-${layer.id}`} hidden={!expanded}>
                <p><strong>{layer.kind}</strong> — {layer.description}</p>
                <a href={layer.url} target="_blank" rel="noreferrer">{layer.source} ↗</a>
                {layer.restriction && layer.id !== 'cables' && <p>{layer.restriction}</p>}
                {enabled && feed && <p role="status">{labels[feed.status]}{feed.updatedAt ? ` · ${formatTime(feed.updatedAt)}` : ''}{feed.note ? ` — ${feed.note}` : ''}</p>}
                {enabled && layer.id === 'satellites' && atlas.body === 'earth' && orbits.length > 0 && <>
                  <p>{visibleOrbits > 0 ? `${visibleOrbits} sur ${orbits.length} visible${visibleOrbits === 1 ? '' : 's'} dans cette vue.` : `${orbits.length} position${orbits.length === 1 ? '' : 's'} calculée${orbits.length === 1 ? '' : 's'}, hors de vue. Fais tourner le globe.`}</p>
                  <button className="layer-action" onClick={() => onSatellite(iss ?? orbits[0])}><Orbit size={14} /> {iss ? 'Voir l’ISS' : 'Voir un satellite'}</button>
                </>}
                {enabled && error && <p role="status">Le fichier local n’a pas pu être chargé.</p>}
                {filters}
              </div>
            </div>;
          })}</div>
        </section>;
      })}
    </div>
    <button className="sidebar-foot" onClick={onSources}><CircleHelp size={16} /> Sources et crédits <span aria-hidden="true">↗</span></button>
  </aside>;
}
