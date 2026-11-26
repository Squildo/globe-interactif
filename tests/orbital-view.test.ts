import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearsGlobe } from '../src/orbital-view.ts';

test('l’occlusion respecte l’altitude des satellites au-delà du limbe terrestre', () => {
  const eye = { x: 0, y: 0, z: 3 };
  assert.equal(clearsGlobe(eye, { x: 0, y: 0, z: 1.06 }, 1), true);
  assert.equal(clearsGlobe(eye, { x: 0, y: 0, z: -1.06 }, 1), false);
  assert.equal(clearsGlobe(eye, { x: 1, y: 0, z: 0 }, 1), false);
  assert.equal(clearsGlobe(eye, { x: 1.15, y: 0, z: 0 }, 1), true);
});
