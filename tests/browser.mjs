import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, devices } from 'playwright-core';

const url = process.env.ATLAS_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({
  ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : { channel: 'chromium' }),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors = [];
const observe = page => {
  page.setDefaultTimeout(15_000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
};
const assertSwitch = async (page, name, enabled) => {
  const control = page.getByRole('switch', { name, exact: true });
  await page.locator(`[role="switch"][aria-label="${name}"][aria-checked="${enabled}"]`).waitFor();
  assert.equal(await control.getAttribute('aria-checked'), String(enabled));
};
const waitForGlobe = async page => {
  await page.locator('.globe-host canvas').waitFor({ timeout: 40_000 });
  await page.locator('.globe-fallback').waitFor({ state: 'hidden', timeout: 40_000 });
};
const renderedFrames = (page, count = 3) => page.evaluate(count => new Promise(resolve => {
  const frame = () => --count === 0 ? resolve() : requestAnimationFrame(frame);
  requestAnimationFrame(frame);
}), count);
const waitForTexture = (page, name) => page.waitForResponse(r =>
  r.ok() && new RegExp(`/${name}[.-][^/]+$`).test(new URL(r.url()).pathname), { timeout: 40_000 });

try {
  await mkdir('artifacts', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  observe(page);
  // Isolated visibility fixture: real tab switching isn't reliable in headless Chromium.
  await page.addInitScript(() => {
    let hidden = false;
    Object.defineProperty(document, 'hidden', { get: () => hidden });
    window.setAtlasTabHidden = value => { hidden = value; document.dispatchEvent(new Event('visibilitychange')); };
  });
  const config = await page.request.get(`${url}/api/config`);
  assert.equal(config.status(), 200);
  assert.equal(typeof (await config.json()).assistant, 'boolean');
  await page.route('**/api/config', route => route.fulfill({ json: { assistant: true } }));
  let geminiCalls = 0;
  await page.route('**/api/assistant', route => {
    geminiCalls++;
    return route.fulfill({ json: { message: 'Proposition distante', actions: [{ type: 'layer', id: 'clouds', enabled: true }] } });
  });
  const periods = [];
  await page.route('**/api/earthquakes?*', route => {
    periods.push(new URL(route.request().url()).searchParams.get('period'));
    return route.fulfill({ json: { status: 'fresh', updatedAt: Date.now(), items: [{ id: 'test', name: 'Séisme test', lat: 36, lng: 140, number: 5.5 }] } });
  });
  let orbitUnavailable = false;
  const orbit = [{ id: '25544', name: 'ISS (test)', lat: -24, lng: -169, altitude: 0.065, number: 414 },
    { id: 'test-front', name: 'Satellite test visible', lat: 5, lng: 0, altitude: 0.095, number: 605 }];
  await page.route('**/api/satellites', route => route.fulfill({ json: orbitUnavailable
    ? { status: 'unavailable', updatedAt: null, items: [], note: 'Aucun élément orbital récent.' }
    : { status: 'fresh', updatedAt: Date.now(), items: orbit } }));
  await Promise.all([waitForTexture(page, 'earth'), page.goto(url)]);
  await waitForGlobe(page);
  await page.getByText(/Natural Earth · 243/).waitFor();
  await page.locator('.camera-coords').filter({ hasText: '24.0° N' }).waitFor();
  const paris = page.getByRole('button', { name: 'Paris', exact: true });
  await paris.waitFor();
  await page.screenshot({ path: 'artifacts/terrascope-desktop.png' });
  const globe = page.locator('.globe-host canvas');
  const view = await globe.boundingBox();
  assert.ok(view);
  const x = Math.floor(view.x + view.width * 0.51), y = Math.floor(view.y + view.height * 0.5);
  const sample = () => page.screenshot({ clip: { x: x - 105, y: y - 75, width: 220, height: 150 },
    style: '.float-tooltip-kap { visibility: hidden !important; }' });
  const beforeHover = await sample();
  await page.mouse.move(x, y);
  await page.locator('.float-tooltip-kap').waitFor();
  await renderedFrames(page);
  assert.ok(!(await sample()).equals(beforeHover), 'Le survol modifie l’aplat du pays');
  await page.screenshot({ path: 'artifacts/terrascope-hover.png' });
  await page.mouse.move(8, 8);
  await renderedFrames(page, 8);
  assert.ok((await sample()).equals(beforeHover), 'Le survol s’efface quand le pointeur quitte le globe');
  await page.mouse.move(x, y);
  await page.locator('.float-tooltip-kap').waitFor();
  await page.mouse.click(x, y);
  await page.getByRole('region', { name: 'Détail de la sélection' }).waitFor();
  await page.getByRole('button', { name: 'Fermer le détail' }).click();

  const clouds = page.getByRole('switch', { name: 'Nuages illustratifs' });
  await Promise.all([waitForTexture(page, 'clouds'), clouds.click()]);
  // Clicking the catalogue can scroll it; park the pointer outside the globe before sampling.
  await page.mouse.move(8, 8);
  await renderedFrames(page);
  const cloudStill = await sample();
  assert.ok(!cloudStill.equals(beforeHover), 'Le masque local est rendu sur le globe');
  await renderedFrames(page, 8);
  assert.ok((await sample()).equals(cloudStill), 'Les nuages restent fixes avec la réduction des animations');

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await renderedFrames(page, 8);
  assert.ok(!(await sample()).equals(cloudStill), 'Les nuages dérivent sans rotation de la caméra');
  await page.locator('.camera-coords').filter({ hasText: '24.0° N / 11.0° E' }).waitFor();
  await page.evaluate(() => window.setAtlasTabHidden(true));
  await renderedFrames(page);
  const paused = await sample();
  await renderedFrames(page, 8);
  assert.ok((await sample()).equals(paused), 'L’animation s’arrête quand l’onglet est masqué');
  await page.evaluate(() => window.setAtlasTabHidden(false));
  await renderedFrames(page, 8);
  assert.ok(!(await sample()).equals(paused), 'L’animation reprend quand l’onglet redevient visible');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.click(x, y);
  await page.getByRole('region', { name: 'Détail de la sélection' }).waitFor();
  await page.getByRole('button', { name: 'Fermer le détail' }).click();
  await Promise.all([waitForTexture(page, 'night'), page.getByRole('button', { name: 'Fond nuit' }).click()]);
  await renderedFrames(page);
  await paris.waitFor();
  await page.screenshot({ path: 'artifacts/terrascope-night.png' });
  await page.getByRole('button', { name: 'Fond satellite' }).click();
  await clouds.click();
  await assertSwitch(page, 'Nuages illustratifs', false);
  await page.mouse.move(8, 8);
  await renderedFrames(page);
  assert.ok((await sample()).equals(beforeHover), 'La couche n’est plus rendue une fois masquée');

  const orbitSwitch = page.getByRole('switch', { name: 'Satellites et ISS' });
  await orbitSwitch.click();
  const orbitInfo = page.locator('#layer-info-satellites');
  await orbitInfo.getByText(/1 sur 2.*visible/).waitFor();
  await page.getByRole('button', { name: 'ISS (test)', exact: true }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Satellite test visible', exact: true }).click();
  await page.getByRole('heading', { name: 'Satellite test visible' }).waitFor();
  await page.getByRole('button', { name: 'Fermer le détail' }).click();
  await orbitInfo.getByRole('button', { name: 'Voir l’ISS' }).click();
  await page.getByRole('button', { name: 'ISS (test)', exact: true }).waitFor();
  await orbitSwitch.click();
  orbitUnavailable = true;
  await orbitSwitch.click();
  await orbitInfo.getByText(/Indisponible.*Aucun élément orbital récent/).waitFor();
  assert.equal(await orbitInfo.getByRole('button', { name: 'Voir l’ISS' }).count(), 0);
  await orbitSwitch.click();
  await page.keyboard.press('Control+k');
  const search = page.getByRole('combobox', { name: 'Rechercher un lieu' });
  assert.ok(await search.evaluate(el => document.activeElement === el));
  await search.fill('Japon');
  await page.getByRole('option', { name: /Japon/ }).first().waitFor();
  await search.press('ArrowDown');
  await search.press('Enter');
  await page.getByText(/FOCUS : Japon/).waitFor();

  await page.getByRole('button', { name: /^Pays et frontières/ }).click();
  const representation = page.getByRole('combobox', { name: 'Représentation', exact: true });
  await representation.selectOption('hex');
  await representation.selectOption('gdp');
  await page.getByText('Valeur élevée').waitFor();
  await representation.selectOption('borders');
  await page.getByRole('button', { name: 'Fond nuit' }).click();
  assert.equal(await page.getByRole('button', { name: 'Fond nuit' }).getAttribute('aria-pressed'), 'true');

  await page.getByRole('button', { name: 'Assistant', exact: true }).click();
  await page.getByRole('button', { name: 'Affiche les séismes de magnitude 5 au Japon' }).click();
  await assertSwitch(page, 'Séismes récents', false);
  await page.getByRole('button', { name: 'Appliquer sur le globe' }).click();
  await assertSwitch(page, 'Séismes récents', true);
  await page.getByRole('button', { name: 'Annuler la dernière commande' }).click();
  await assertSwitch(page, 'Séismes récents', false);
  assert.equal(geminiCalls, 0);
  const aiOptIn = page.getByRole('checkbox', { name: /Envoyer à Gemini/ });
  await aiOptIn.waitFor();
  assert.equal(await aiOptIn.isChecked(), false);
  await aiOptIn.check();
  const prompt = page.getByRole('textbox', { name: 'Message à l’assistant' });
  await prompt.fill('Je te laisse interpréter cette demande');
  await prompt.press('Enter');
  const gemini = page.getByText('Proposition distante', { exact: true }).locator('..');
  await gemini.waitFor();
  assert.equal(geminiCalls, 1);
  await assertSwitch(page, 'Nuages illustratifs', false);
  await page.keyboard.press('Escape');
  await page.getByRole('switch', { name: 'Séismes récents' }).click();
  await page.getByText(/Actualisé · /).waitFor();
  const month = page.waitForResponse(r => r.url().includes('earthquakes?period=30'));
  await page.getByRole('combobox', { name: 'Période', exact: true }).selectOption('30');
  await month;
  assert.ok(periods.includes('7') && periods.includes('30'));

  const moon = waitForTexture(page, 'moon');
  await page.getByRole('button', { name: 'Lune', exact: true }).click();
  await moon;
  await page.getByRole('heading', { name: 'Globe lunaire' }).waitFor();
  await page.getByRole('button', { name: 'Masquer Sites d’alunissage' }).waitFor();
  await page.getByRole('button', { name: 'Terre', exact: true }).click();
  await page.getByRole('heading', { name: 'Globe terrestre' }).waitFor();
  await page.getByRole('button', { name: 'Sources et crédits' }).click();
  await page.getByRole('dialog', { name: 'Sources et crédits' }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('switch', { name: 'Population urbaine' }).click();
  await page.getByRole('button', { name: 'Masquer Population urbaine' }).waitFor();
  await page.locator('#layer-info-population').getByRole('combobox').selectOption('columns');
  await page.context().close();

  const mobile = await browser.newPage({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
  observe(mobile);
  await mobile.goto(url);
  await waitForGlobe(mobile);
  await mobile.locator('.camera-coords').filter({ hasText: '24.0° N' }).waitFor();
  assert.equal(await mobile.getByRole('complementary').count(), 0);
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await mobile.screenshot({ path: 'artifacts/terrascope-mobile.png' });
  await mobile.getByRole('button', { name: 'Couches', exact: true }).click();
  await assertSwitch(mobile, 'Villes du monde', true);
  await Promise.all([waitForTexture(mobile, 'clouds'), mobile.getByRole('switch', { name: 'Nuages illustratifs' }).tap()]);
  await mobile.getByRole('button', { name: 'Fermer le catalogue' }).tap();
  await Promise.all([waitForTexture(mobile, 'night'), mobile.getByRole('button', { name: 'Fond nuit' }).tap()]);
  await renderedFrames(mobile);
  await mobile.screenshot({ path: 'artifacts/terrascope-mobile-night.png' });
  await mobile.getByRole('button', { name: 'Couches', exact: true }).tap();
  await mobile.getByRole('switch', { name: 'Villes du monde' }).tap();
  await assertSwitch(mobile, 'Villes du monde', false);
  await mobile.getByRole('button', { name: 'Fermer le catalogue' }).tap();
  await mobile.getByRole('complementary').waitFor({ state: 'hidden' });
  assert.deepEqual(errors, []);
  console.log('OK — globe WebGL, survol, nuages, orbites, recherche clavier, assistant, Terre/Lune et tiroir mobile. Captures : artifacts/.');
} finally {
  await browser.close();
}
