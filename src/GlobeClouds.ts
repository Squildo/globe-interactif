import { useEffect } from 'react';
import type { GlobeMethods } from 'react-globe.gl';
import { Mesh, MeshPhongMaterial, SphereGeometry, TextureLoader } from 'three';
import { textures } from './data';

// Globe.gl's clouds example: an independent transparent shell and -0.006° per 60 Hz frame.
const CLOUD_ALTITUDE = 0.004;
const DRIFT = -0.36 * Math.PI / 180 / 1000;

export function useGlobeClouds(globe: GlobeMethods | undefined, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !globe) return;
    const scene = globe.scene(), motion = matchMedia('(prefers-reduced-motion: reduce)');
    const geometry = new SphereGeometry(globe.getGlobeRadius() * (1 + CLOUD_ALTITUDE), 75, 75);
    const material = new MeshPhongMaterial({ color: '#f5f9ff', transparent: true, depthWrite: false, opacity: 0.72 });
    const mesh = new Mesh(geometry, material);
    mesh.name = 'Nuages illustratifs';
    mesh.renderOrder = 2;
    mesh.raycast = () => {};
    let frame = 0, previous = 0, disposed = false, loaded = false;
    const move = (time: number) => {
      if (previous) mesh.rotation.y += Math.min(time - previous, 60) * DRIFT;
      previous = time;
      frame = requestAnimationFrame(move);
    };
    const syncMotion = () => {
      cancelAnimationFrame(frame); previous = 0;
      if (loaded && !motion.matches && !document.hidden) frame = requestAnimationFrame(move);
    };
    // Natural Earth III's grayscale cloud map becomes the shell's opacity mask.
    const texture = new TextureLoader().load(textures.clouds, alphaMap => {
      if (disposed) return;
      material.alphaMap = alphaMap;
      scene.add(mesh);
      loaded = true;
      syncMotion();
    });
    motion.addEventListener('change', syncMotion);
    document.addEventListener('visibilitychange', syncMotion);
    return () => {
      disposed = true;
      motion.removeEventListener('change', syncMotion);
      document.removeEventListener('visibilitychange', syncMotion);
      cancelAnimationFrame(frame);
      scene.remove(mesh);
      geometry.dispose(); material.dispose(); texture.dispose();
    };
  }, [globe, enabled]);
}
