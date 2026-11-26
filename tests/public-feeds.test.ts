import { test } from 'node:test';
import assert from 'node:assert/strict';
import { science } from '../src/science.ts';
import { download } from '../src/upstream.ts';

const clock = Date.UTC(2026, 10, 26, 15);
const iss = 'ISS (ZARYA)\n1 25544U 98067A   26330.17013273  .00004569  00000-0  89217-4 0  9992\n2 25544  51.6313 218.4750 0007471  66.5508 293.6265 15.49589862596861';

test('les catalogues TLE sont mis en cache, et un catalogue partiel reste signalé', async () => {
  const groups: string[] = [];
  let time = clock;
  const feeds = science(async input => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://celestrak.org');
    assert.equal(url.searchParams.get('FORMAT'), 'TLE');
    groups.push(url.searchParams.get('GROUP')!);
    return groups.at(-1) === 'stations' ? new Response(iss) : new Response(null, { status: 429 });
  }, () => time);
  const first = await feeds.satellites();
  assert.equal(first.status, 'stale');
  assert.equal(first.items[0].id, '25544');
  time += 25_000;
  const next = await feeds.satellites();
  assert.equal(next.updatedAt, time);
  assert.notEqual(next.items[0].lng, first.items[0].lng);
  assert.deepEqual(groups, ['stations', 'visual']);
});

test('le téléchargement Web décode les caractères coupés entre deux blocs et borne la taille', async () => {
  const bytes = new TextEncoder().encode('Séisme');
  const request: typeof fetch = async () => new Response(new ReadableStream({ start(stream) {
    stream.enqueue(bytes.slice(0, 2));
    stream.enqueue(bytes.slice(2));
    stream.close();
  } }));
  assert.equal(await download(request, 'https://example.org', undefined, bytes.length), 'Séisme');
  await assert.rejects(download(request, 'https://example.org', undefined, bytes.length - 1), /volumineuse/);
});
