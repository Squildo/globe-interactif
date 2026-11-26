import assert from 'node:assert/strict';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { chromium, devices } from 'playwright-core';
import { preview } from 'vite';

const deployed = process.env.ATLAS_URL;
const publicHosts = new Set(['earthquake.usgs.gov', 'eonet.gsfc.nasa.gov', 'celestrak.org']);

async function checkArtifact() {
  assert.deepEqual((await readdir('dist-pages')).sort(), ['assets', 'index.html', 'licenses.md']);
  const assets = await readdir('dist-pages/assets', { withFileTypes: true });
  const data = [];
  for (const asset of assets) {
    const { name } = asset;
    assert.ok(asset.isFile() && /\.(js|css|woff2?|jpg|geojson|svg)$/.test(name), `Asset inédit : ${name}`);
    if (/\.(jpg|geojson)$/.test(name)) data.push(name.replace(/-[\w-]{8}(?=\.)/, ''));
    if (name.endsWith('.js')) {
      const script = await readFile(`dist-pages/assets/${name}`, 'utf8');
      assert.doesNotMatch(script, /\/api\/(?:config|assistant|earthquakes|events|satellites|air-traffic|sea-traffic)|generativelanguage\.googleapis\.com|GEMINI_API_KEY|AISSTREAM_API_KEY/);
    }
  }
  assert.deepEqual(data.sort(), ['cities.geojson', 'clouds.jpg', 'countries.geojson', 'earth.jpg', 'moon-nasa-svs.jpg', 'night-black-marble.jpg']);
}

async function fixture(page) {
  // Date.now must advance in the browser: Globe.gl uses it for debouncing renders.
  const clock = Date.now();
  const date = new Date(clock - 60_000), year = date.getUTCFullYear();
  const day = 1 + (date.getTime() - Date.UTC(year, 0, 1)) / 86_400_000;
  const epoch = `${String(year).slice(-2)}${day.toFixed(8).padStart(12, '0')}`;
  const tle = `1 25544U 98067A   ${epoch}  .00004569  00000-0  89217-4 0  999`;
  const checksum = tle.match(/[\d-]/g).reduce((sum, c) => sum + (c === '-' ? 1 : Number(c)), 0) % 10;
  const catalog = `ISS (ZARYA)\r\n${tle}${checksum}\r\n2 25544  51.6313 218.4750 0007471  66.5508 293.6265 15.49589862596861\r\n`;
  await page.route(url => publicHosts.has(url.hostname), async route => {
    const url = new URL(route.request().url());
    const headers = { 'Access-Control-Allow-Origin': '*' };
    if (url.hostname === 'celestrak.org') return route.fulfill({ headers, contentType: 'text/plain', body: catalog });
    if (url.hostname === 'eonet.gsfc.nasa.gov') return route.fulfill({ headers, json: { events: [{ id: 'E', title: 'Incendie (test)', geometry: [{ type: 'Point', date: date.toISOString(), coordinates: [1, 45] }] }] } });
    return route.fulfill({ headers, json: { type: 'FeatureCollection', metadata: { generated: clock }, features: [{ id: 'U', geometry: { type: 'Point', coordinates: [140, 36, 35] }, properties: { mag: 5.5, place: 'Séisme (test)', time: clock } }] } });
  });
}

const texture = (page, name) => page.waitForResponse(r => r.ok() && new URL(r.url()).pathname.startsWith(`/terrascope/assets/${name}-`), { timeout: 35_000 });
const toggle = (page, name) => page.getByRole('switch', { name, exact: true });
const button = (page, name) => page.getByRole('button', { name, exact: true });
const checked = async (page, name, expected) => assert.equal(await toggle(page, name).getAttribute('aria-checked'), String(expected));
const ready = async page => {
  await page.locator('.globe-host canvas').waitFor({ timeout: 35_000 });
  await page.locator('.globe-fallback').waitFor({ state: 'hidden' });
};
const screenshot = (page, name) => page.screenshot({ path: `artifacts/terrascope-pages-${name}.png` });

let browser, server;
const requested = [], failed = [];
try {
  if (!deployed) {
    await checkArtifact();
    server = await preview({ mode: 'pages', preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  }
  const url = new URL(deployed ?? `http://127.0.0.1:${server.httpServer.address().port}/terrascope/`);
  assert.equal(url.pathname, '/terrascope/');
  browser = await chromium.launch({
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : { channel: 'chromium' }),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const observe = page => {
    page.setDefaultTimeout(20_000);
    page.on('request', request => requested.push(new URL(request.url())));
    page.on('response', response => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
    page.on('requestfailed', request => failed.push(`${request.failure()?.errorText} ${request.url()}`));
    page.on('pageerror', error => failed.push(error.message));
    page.on('console', entry => { if (entry.type() === 'error') failed.push(entry.text()); });
  };
  await mkdir('artifacts', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  observe(page);
  if (!deployed) await fixture(page);
  await Promise.all([texture(page, 'earth'), page.goto(url.href)]);
  await ready(page);
  await page.getByText('Atlas web', { exact: true }).waitFor();
  await button(page, 'Paris').waitFor();
  await page.getByText(/Natural Earth · 243/).waitFor();
  assert.ok(await page.locator('.branding img').evaluate(img => img.complete && img.naturalWidth > 0));
  assert.equal(requested.some(u => publicHosts.has(u.hostname)), false);
  await screenshot(page, 'desktop');

  for (const name of ['Volcans', 'Aéroports', 'Routes aériennes', 'Trafic aérien', 'Trafic maritime', 'Sites d’alunissage', 'Câbles sous-marins']) {
    assert.ok(await toggle(page, name).isDisabled(), `${name} doit rester désactivé sur Pages`);
  }
  assert.ok(await button(page, 'Fond relief').isDisabled());
  await Promise.all([texture(page, 'night-black-marble'), button(page, 'Fond nuit').click()]);
  await screenshot(page, 'night');
  await button(page, 'Fond satellite').click();
  await Promise.all([texture(page, 'clouds'), toggle(page, 'Nuages illustratifs').click()]);
  await checked(page, 'Nuages illustratifs', true);

  await button(page, 'Assistant').click();
  await page.getByText(/Gemini nécessite l’édition locale/).waitFor();
  assert.equal(await page.getByRole('checkbox', { name: /Envoyer à Gemini/ }).count(), 0);
  const prompt = page.getByRole('textbox', { name: 'Message à l’assistant' });
  await prompt.fill('Affiche les volcans et masque les villes');
  await prompt.press('Enter');
  await page.getByText(/Volcans :.*réservé à l’édition locale.*Aucun changement proposé/).waitFor();
  assert.equal(await button(page, 'Appliquer sur le globe').count(), 0);
  await checked(page, 'Villes du monde', true);
  await prompt.fill('Affiche les séismes de magnitude 5 au Japon');
  await prompt.press('Enter');
  await button(page, 'Appliquer sur le globe').waitFor();
  await checked(page, 'Séismes récents', false);
  await button(page, 'Appliquer sur le globe').click();
  await checked(page, 'Séismes récents', true);
  await page.keyboard.press('Escape');
  await page.getByText(/FOCUS : Japon/).waitFor();
  const status = id => page.locator(`#layer-info-${id}`).getByRole('status').filter({ hasText: /Actualisé|En retard/ });
  await page.getByRole('button', { name: /^Séismes récents/ }).click();
  await status('quakes').waitFor();
  await page.getByRole('combobox', { name: 'Période', exact: true }).selectOption('30');
  await status('quakes').waitFor();
  await toggle(page, 'Événements naturels').click();
  await status('events').waitFor();
  await toggle(page, 'Satellites et ISS').click();
  await status('satellites').waitFor();
  await button(page, 'Voir l’ISS').click();
  await page.getByText(/FOCUS : ISS/).waitFor();

  await Promise.all([texture(page, 'moon-nasa-svs'), button(page, 'Lune').click()]);
  await page.getByRole('heading', { name: 'Globe lunaire' }).waitFor();
  await checked(page, 'Sites d’alunissage', false);
  await screenshot(page, 'moon');
  await button(page, 'Terre').click();
  await page.getByRole('heading', { name: 'Globe terrestre' }).waitFor();
  await button(page, 'Sources et crédits').click();
  const credits = page.getByRole('dialog', { name: 'Sources et crédits' });
  await credits.getByRole('link', { name: 'CGI Moon Kit' }).waitFor();
  const licenses = new URL(await credits.getByRole('link', { name: 'Licences des bibliothèques' }).getAttribute('href'), url);
  const response = await page.request.get(licenses.href);
  assert.ok(response.ok());
  assert.match(await response.text(), /satellite\.js/);
  await page.context().close();

  const mobile = await browser.newPage({ ...devices['iPhone 13'], reducedMotion: 'reduce' });
  observe(mobile);
  await Promise.all([texture(mobile, 'earth'), mobile.goto(url.href)]);
  await ready(mobile);
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await button(mobile, 'Couches').tap();
  await checked(mobile, 'Villes du monde', true);
  await button(mobile, 'Fermer le catalogue').tap();
  await screenshot(mobile, 'mobile');

  const feeds = requested.filter(u => publicHosts.has(u.hostname));
  const expected = [
    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson',
    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson',
    'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=500',
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=TLE',
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=TLE',
  ];
  assert.deepEqual([...new Set(feeds.map(u => u.href))].sort(), expected.sort());
  for (const asset of requested.filter(u => u.protocol === 'http:' || u.protocol === 'https:')) {
    if (publicHosts.has(asset.hostname)) continue;
    assert.equal(asset.origin, url.origin, asset.href);
    assert.ok(asset.pathname.startsWith(url.pathname) && !asset.pathname.includes('/api/'), asset.href);
  }
  assert.deepEqual(failed, []);
  console.log(`OK — Pages, globe WebGL ordinateur/mobile et trois flux publics ${deployed ? 'réels' : 'simulés'}.`);
} catch (error) {
  if (failed.length) console.error('Erreurs navigateur :', failed);
  throw error;
} finally {
  await browser?.close();
  await server?.close();
}
