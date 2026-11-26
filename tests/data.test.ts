import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuakes, parseRows, orbitalRecords } from '../src/parsers.ts';

test('un champ CSV cité peut contenir une virgule ou un guillemet', () => {
  assert.deepEqual(parseRows('1,"Nom, aéroport","Texte ""cité"""\r\n2,Paris,FR'), [['1', 'Nom, aéroport', 'Texte "cité"'], ['2', 'Paris', 'FR']]);
});
test('USGS : écarte les positions ou magnitudes manquantes et conserve l’ordre longitude/latitude', () => {
  const items = parseQuakes({ features: [
    { id: 'a', geometry: { type: 'Point', coordinates: [139, 35, 72] }, properties: { mag: 5, place: 'Japon', time: 100 } },
    { id: 'b', geometry: { type: 'Point', coordinates: [1, 2] }, properties: { mag: null } },
  ] });
  assert.deepEqual(items, [{ id: 'a', lng: 139, lat: 35, depth: 72, number: 5, name: 'Japon', observedAt: 100 }]);
});
test('le catalogue orbital ne retient que la sélection civile et garde le millésime TLE', () => {
  const lines = ['ISS (ZARYA)', '1 25544U 98067A   26330.17013273  .00004569  00000-0  89217-4 0  9992', '2 25544  51.6313 218.4750 0007471  66.5508 293.6265 15.49589862596861'];
  const records = orbitalRecords([...lines, 'X', ...lines.slice(1)].join('\r\n'));
  assert.equal(records.length, 1);
  assert.equal(records[0].name, 'ISS (ZARYA)');
  assert.equal(new Date(records[0].epoch).toISOString().slice(0, 10), '2026-11-26');
});
