import { useCallback, useMemo } from 'react';
import type { GlobeMethods } from 'react-globe.gl';
import type { LayerId } from './atlas';
import type { Selection } from './GlobeView';
import type { Mark, Position } from './models';
import { clearsGlobe } from './orbital-view';

export type Marker = Mark & { layer: LayerId; color: string; radius: number };

type Box = { left: number; right: number; top: number; bottom: number };
function visibleCities(globe: GlobeMethods, cities: Marker[], view: { width: number; height: number }, camera: Position & { altitude: number }) {
  const eye = globe.getCoords(camera.lat, camera.lng, camera.altitude), radius = globe.getGlobeRadius();
  const placed: Box[] = [];
  return cities.filter(city => {
    if (!clearsGlobe(eye, globe.getCoords(city.lat, city.lng, city.altitude), radius)) return false;
    const { x, y } = globe.getScreenCoords(city.lat, city.lng, city.altitude);
    const box = { left: x - 8, right: x + 12 + city.name.length * 6.4, top: y - 9, bottom: y + 9 };
    if (box.left < 2 || box.right > view.width - 2 || box.top < 2 || box.bottom > view.height - 2) return false;
    if (placed.some(p => p.left < box.right && p.right > box.left && p.top < box.bottom && p.bottom > box.top)) return false;
    placed.push(box);
    return true;
  });
}

export function useGlobeMarkers(cities: Marker[], satellites: Marker[], globe: GlobeMethods | undefined,
  view: { width: number; height: number }, camera: Position & { altitude: number }, select: (item: Selection) => void) {
  const htmlElement = useCallback((value: object) => {
    const mark = value as Marker, orbital = mark.layer === 'satellites', iss = orbital && mark.id === '25544';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `globe-marker ${orbital ? 'orbital-marker' : 'city-marker'}${iss ? ' iss-marker' : mark.code === 'capital' ? ' capital-marker' : ''}`;
    button.setAttribute('aria-label', mark.name);
    button.title = orbital ? `${mark.name} · Position estimée` : mark.name;
    if (!orbital || iss) {
      const text = document.createElement('span'); text.textContent = iss ? 'ISS' : mark.name; button.append(text);
    }
    // Stop the canvas from picking a country under this DOM control.
    button.addEventListener('pointerdown', event => event.stopPropagation());
    button.addEventListener('click', () => select({ layer: mark.layer, data: mark }));
    return button;
  }, [select]);
  const htmlElementsData = useMemo(() => globe ? [...visibleCities(globe, cities, view, camera), ...satellites] : [], [cities, satellites, globe, view, camera]);
  return { htmlElementsData, htmlElement, htmlAltitude: 'altitude', htmlTransitionDuration: 0 };
}
