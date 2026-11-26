export const layerIds = ['countries', 'cities', 'population', 'quakes', 'volcanoes', 'events', 'airports', 'routes', 'air', 'sea', 'cables', 'satellites', 'clouds', 'moon-landings'] as const;
export type LayerId = typeof layerIds[number];
export type Style = 'satellite' | 'night' | 'relief';
export type CountryMode = 'borders' | 'population' | 'gdp' | 'hex';
export type Body = 'earth' | 'moon';
export type Region = 'europe' | 'atlantic' | 'japan' | 'west';
export const regions = {
  europe: { name: 'Europe occidentale', lat: 48.8, lng: 2.4 },
  atlantic: { name: 'Manche orientale', lat: 50.7, lng: 0.9 },
  japan: { name: 'Japon', lat: 35.7, lng: 139.7 },
  west: { name: 'Côte est américaine', lat: 40.7, lng: -74 },
} satisfies Record<Region, { name: string; lat: number; lng: number }>;

export type Atlas = {
  active: readonly LayerId[]; style: Style; countryMode: CountryMode; body: Body; graticules: boolean;
  minMagnitude: number; period: 1 | 7 | 30; populationMode: 'heat' | 'columns';
  volcanoMode: 'points' | 'heat'; region: Region;
};
export const defaultAtlas: Atlas = {
  active: ['countries', 'cities'], style: 'satellite', countryMode: 'borders', body: 'earth',
  graticules: true, minMagnitude: 2.5, period: 7, populationMode: 'heat', volcanoMode: 'points', region: 'atlantic',
};

export type Action =
  | { type: 'layer'; id: LayerId; enabled: boolean }
  | { type: 'style'; value: Style } | { type: 'countryMode'; value: CountryMode }
  | { type: 'body'; value: Body } | { type: 'magnitude'; value: number }
  | { type: 'period'; value: Atlas['period'] } | { type: 'grid'; value: boolean }
  | { type: 'populationMode'; value: Atlas['populationMode'] } | { type: 'volcanoMode'; value: Atlas['volcanoMode'] }
  | { type: 'region'; value: Region } | { type: 'focus'; place: string } | { type: 'reset' };

export function applyActions(start: Atlas, actions: readonly Action[]): Atlas {
  return actions.reduce<Atlas>((state, action) => {
    switch (action.type) {
      case 'layer': {
        const active = new Set(state.active);
        if (action.enabled) active.add(action.id); else active.delete(action.id);
        return { ...state, active: [...active], body: action.enabled ? (action.id === 'moon-landings' ? 'moon' : 'earth') : state.body };
      }
      case 'countryMode': return { ...state, body: 'earth', countryMode: action.value,
        active: state.active.includes('countries') ? state.active : [...state.active, 'countries'] };
      case 'magnitude': return { ...state, minMagnitude: action.value };
      case 'grid': return { ...state, graticules: action.value };
      case 'focus': return { ...state, body: 'earth' };
      case 'reset': return { ...defaultAtlas };
      default: return { ...state, [action.type]: action.value };
    }
  }, start);
}

const option = <const T,>(values: readonly T[], value: unknown): value is T => values.includes(value as T);
export function validateActions(input: unknown): Action[] | null {
  if (!Array.isArray(input) || input.length > 8) return null;
  const result: Action[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const { type, id, enabled, value, place } = item;
    const keys = (...allowed: string[]) => Object.keys(item).every(key => ['type', ...allowed].includes(key));
    if (type === 'layer' && keys('id', 'enabled') && option(layerIds, id) && id !== 'cables' && typeof enabled === 'boolean') result.push({ type, id, enabled });
    else if (type === 'style' && keys('value') && option(['satellite', 'night', 'relief'], value)) result.push({ type, value });
    else if (type === 'countryMode' && keys('value') && option(['borders', 'population', 'gdp', 'hex'], value)) result.push({ type, value });
    else if (type === 'body' && keys('value') && option(['earth', 'moon'], value)) result.push({ type, value });
    else if (type === 'magnitude' && keys('value') && typeof value === 'number' && value >= 0 && value <= 10) result.push({ type, value });
    else if (type === 'period' && keys('value') && option([1, 7, 30] as const, value)) result.push({ type, value });
    else if (type === 'grid' && keys('value') && typeof value === 'boolean') result.push({ type, value });
    else if (type === 'populationMode' && keys('value') && option(['heat', 'columns'], value)) result.push({ type, value });
    else if (type === 'volcanoMode' && keys('value') && option(['points', 'heat'], value)) result.push({ type, value });
    else if (type === 'region' && keys('value') && typeof value === 'string' && Object.hasOwn(regions, value)) result.push({ type, value: value as Region });
    else if (type === 'focus' && keys('place') && typeof place === 'string' && /^[\p{L}\p{M}\p{N} .’'-]{2,60}$/u.test(place.trim())) result.push({ type, place: place.trim() });
    else if (type === 'reset' && keys()) result.push({ type });
    else return null;
  }
  return result;
}

export const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const terms: [LayerId, RegExp][] = [
  ['countries', /frontier|\bpays\b/], ['cities', /ville|capitale/], ['population', /densite|population/],
  ['quakes', /seisme|tremblement/], ['volcanoes', /volcan/], ['events', /evenement|incendie|tempete/],
  ['airports', /aeroport/], ['routes', /route[s]? aerienne|liaison/], ['air', /avion|ads-b|trafic aerien/],
  ['sea', /navire|\bais\b|trafic maritime/], ['satellites', /\bsatellites\b|\biss\b|satellite artificiel/], ['clouds', /nuage/],
  ['moon-landings', /alunissage|mission[s]? lunaire/],
];

export function parseCommand(text: string): Action[] {
  const clauses = text.trim().split(/\s+(?:et\s+)?(?=(?:affiche|active|cache|masque|d[ée]sactive|montre|centre|zoome|passe|reviens|r[ée]initialise)\b)/iu);
  const actions: Action[] = [];
  for (const clause of clauses) {
    const line = normalize(clause);
    if (!/^(affiche|active|cache|masque|desactive|montre|centre|zoome|passe|reviens|reinitialise|remets)\b/.test(line)) return [];
    const enabled = !/^(cache|masque|desactive)\b/.test(line);
    if (/^(reinitialise|remets)\b/.test(line)) { actions.push({ type: 'reset' }); continue; }
    const place = clause.match(/\s(?:au|aux|en|sur|à)\s+([\p{L}\p{M} ’'-]+?)[.!?]?$/iu)?.[1]?.trim().replace(/^(?:les|le|la)\s+/i, '');
    if (/^(centre|zoome)\b/.test(line)) {
      if (!place) return [];
      actions.push({ type: 'focus', place }); continue;
    }
    if (/\blune\b/.test(line) && (/^(passe|reviens)\b/.test(line) || place && normalize(place) === 'lune' || !terms.some(([, pattern]) => pattern.test(line)))) {
      actions.push(enabled ? { type: 'layer', id: 'moon-landings', enabled: true } : { type: 'body', value: 'earth' }); continue;
    }
    if (/^(passe|reviens)\b/.test(line) && /\bterre\b/.test(line)) { actions.push({ type: 'body', value: 'earth' }); continue; }

    const countryMode = enabled && (/\bpib\b/.test(line) ? 'gdp' : /hexagon/.test(line) ? 'hex' : /population.*\b(?:par pays|des pays)\b/.test(line) ? 'population' : null);
    const found = terms.filter(([id, pattern]) => pattern.test(line) && !(countryMode && (id === 'countries' || id === 'population'))).map(([id]) => id);
    if (countryMode) actions.push({ type: 'countryMode', value: countryMode });
    for (const id of found) actions.push({ type: 'layer', id, enabled });
    if (enabled && /fond|mode|texture/.test(line)) {
      if (/\bnuit\b/.test(line)) actions.push({ type: 'style', value: 'night' });
      else if (/\brelief\b/.test(line)) actions.push({ type: 'style', value: 'relief' });
      else if (/\bjour\b|\bsatellite\b/.test(line)) actions.push({ type: 'style', value: 'satellite' });
    }
    if (/\bgrille\b/.test(line)) actions.push({ type: 'grid', value: enabled });
    if (enabled && found.includes('quakes')) {
      const mag = line.match(/magnitude\s*(?:(?:d['’]au moins|au moins|de)\s*)?(\d+(?:[.,]\d+)?)/);
      if (mag) actions.push({ type: 'magnitude', value: Number(mag[1].replace(',', '.')) });
      const period = line.match(/\b(1|7|30)\s+(?:(?:dernier[es]*|passe[es]*)\s+)?jours?\b/)?.[1];
      if (period) actions.push({ type: 'period', value: Number(period) as Atlas['period'] });
      else if (/\b24\s+h(?:eures)?\b/.test(line)) actions.push({ type: 'period', value: 1 });
    }
    const heat = /carte de chaleur/.test(line), columns = /\bcolonnes?\b/.test(line);
    if (enabled && found.includes('population') && (heat || columns)) actions.push({ type: 'populationMode', value: heat ? 'heat' : 'columns' });
    if (enabled && found.includes('volcanoes') && (heat || /\bpoints?\b/.test(line))) actions.push({ type: 'volcanoMode', value: heat ? 'heat' : 'points' });
    const location = place && normalize(place);
    const region = location && (Object.keys(regions) as Region[]).find(id => normalize(regions[id].name) === location);
    if (enabled && found.includes('air') && region) actions.push({ type: 'region', value: region });
    else if (place && found.length && !found.includes('moon-landings') && !/^(?:mode\b|colonnes?$|points?$|carte de chaleur$)|\bplus$/.test(location || '')) actions.push({ type: 'focus', place });
  }
  return validateActions(actions) ?? [];
}
