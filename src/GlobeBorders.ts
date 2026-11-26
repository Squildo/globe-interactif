import { useEffect } from 'react';
import type { GlobeMethods } from 'react-globe.gl';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import type { Area } from './models';

// Just above both the country fills and the cloud shell.
const BORDER_ALTITUDE = 0.006;

export function useGlobeBorders(globe: GlobeMethods | undefined, areas: Area[]) {
  useEffect(() => {
    if (!globe || !areas.length) return;
    const positions: number[] = [], seen = new Set<string>();
    for (const { geometry } of areas) {
      const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
      for (const rings of polygons) for (const ring of rings) for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1], b = ring[i];
        const keys = [a.join(','), b.join(',')].sort();
        if (keys[0] === keys[1]) continue;
        const key = keys.join('/');
        if (seen.has(key)) continue; // international borders are shared by both country rings
        seen.add(key);
        const lat = b[1] - a[1], lng = ((b[0] - a[0] + 540) % 360) - 180;
        const steps = Math.max(1, Math.ceil(Math.hypot(lat, lng) / 2));
        let start = globe.getCoords(a[1], a[0], BORDER_ALTITUDE);
        for (let j = 1; j <= steps; j++) {
          const end = globe.getCoords(a[1] + lat * j / steps, a[0] + lng * j / steps, BORDER_ALTITUDE);
          positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
          start = end;
        }
      }
    }
    if (!positions.length) return;
    const geometry = new LineSegmentsGeometry().setPositions(positions);
    // WebGL's native polygon strokes are a single device pixel, especially thin on mobile.
    const material = new LineMaterial({ color: 0x142117, linewidth: 1.4, transparent: true, opacity: 0.9, depthWrite: false, alphaToCoverage: true });
    const borders = new LineSegments2(geometry, material);
    borders.renderOrder = 3;
    borders.raycast = () => {}; // Country caps, not decorative lines, handle selection.
    const scene = globe.scene();
    scene.add(borders);
    return () => { scene.remove(borders); material.dispose(); geometry.dispose(); };
  }, [globe, areas]);
}
