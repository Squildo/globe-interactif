import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyActions, defaultAtlas, parseCommand, validateActions } from '../src/atlas.ts';

test('les actions de l’assistant conservent les couches sans rapport', () => {
  const before = { ...defaultAtlas, active: ['countries', 'volcanoes'] as const };
  const after = applyActions(before, [
    { type: 'layer', id: 'volcanoes', enabled: false }, { type: 'layer', id: 'quakes', enabled: true },
    { type: 'magnitude', value: 5 },
  ]);
  assert.deepEqual(after.active, ['countries', 'quakes']);
  assert.equal(after.minMagnitude, 5);
  assert.equal(before.active.length, 2);
});

test('les variantes sont exclusives au sein d’un même jeu', () => {
  const next = applyActions(defaultAtlas, [{ type: 'countryMode', value: 'gdp' }, { type: 'countryMode', value: 'population' }]);
  assert.equal(next.countryMode, 'population');
  assert.equal(next.active.filter(id => id === 'countries').length, 1);
});

test('la sortie IA est refusée si une action est inconnue ou hors limites', () => {
  assert.equal(validateActions([{ type: 'layer', id: 'invalid', enabled: true }]), null);
  assert.equal(validateActions([{ type: 'magnitude', value: 50 }]), null);
  assert.equal(validateActions([{ type: 'reset', url: 'https://example.org' }]), null);
});

test('la commande française sépare les actions et identifie le lieu et le seuil', () => {
  assert.deepEqual(parseCommand('Montre les séismes de magnitude 5,5 ou plus au Japon et masque les volcans.'), [
    { type: 'layer', id: 'quakes', enabled: true }, { type: 'magnitude', value: 5.5 },
    { type: 'focus', place: 'Japon' }, { type: 'layer', id: 'volcanoes', enabled: false },
  ]);
});

test('une demande interrogative ou une couche non publiée ne déclenche pas de changement', () => {
  assert.deepEqual(parseCommand('Pourquoi y a-t-il des volcans ?'), []);
  assert.deepEqual(parseCommand('Affiche les câbles'), []);
});

test('les périodes, variantes et régions reconnues fonctionnent sans service IA', () => {
  assert.deepEqual(parseCommand('Affiche les séismes des 30 derniers jours'), [{ type: 'layer', id: 'quakes', enabled: true }, { type: 'period', value: 30 }]);
  assert.deepEqual(parseCommand('Affiche le PIB par pays'), [{ type: 'countryMode', value: 'gdp' }]);
  assert.deepEqual(parseCommand('Affiche la population urbaine en colonnes'), [{ type: 'layer', id: 'population', enabled: true }, { type: 'populationMode', value: 'columns' }]);
  assert.deepEqual(parseCommand('Affiche le trafic aérien au Japon'), [{ type: 'layer', id: 'air', enabled: true }, { type: 'region', value: 'japan' }]);
  assert.deepEqual(parseCommand('Passe en mode nuit'), [{ type: 'style', value: 'night' }]);
  assert.deepEqual(parseCommand('Centre sur les États-Unis'), [{ type: 'focus', place: 'États-Unis' }]);
});

test('passer de la Terre à la Lune et revenir ne masque pas les couches terrestres', () => {
  const lunar = applyActions(defaultAtlas, parseCommand('Passe à la Lune'));
  assert.equal(lunar.body, 'moon');
  assert.ok(lunar.active.includes('moon-landings'));
  const earth = applyActions(lunar, parseCommand('Reviens sur Terre'));
  assert.equal(earth.body, 'earth');
  assert.ok(earth.active.includes('cities'));
});

test('l’édition Web peut ouvrir la Lune sans activer les sites historiques', () => {
  assert.deepEqual(parseCommand('Passe à la Lune', false), [{ type: 'body', value: 'moon' }]);
  assert.deepEqual(parseCommand('Affiche les sites d’alunissage', false), [{ type: 'layer', id: 'moon-landings', enabled: true }]);
});
