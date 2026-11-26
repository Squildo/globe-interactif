import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type WebSocket from 'ws';
import { seaTraffic } from '../server/transport.ts';

test('AIS souscrit à la zone prévue et ne publie que des densités temporaires de navires classés', () => {
  let now = Date.UTC(2026, 10, 26, 15);
  class Stream extends EventEmitter {
    subscription: string | undefined;
    send(message: string) { this.subscription = message; }
    terminate() { this.emit('close'); }
  }
  const stream = new Stream();
  const sea = seaTraffic('clé-fictive', () => now, () => stream as unknown as WebSocket);
  try {
    assert.equal(sea.read().status, 'loading');
    stream.emit('open');
    assert.deepEqual(JSON.parse(stream.subscription!), {
      APIKey: 'clé-fictive', BoundingBoxes: [[[49.8, -1.5], [51.5, 3]]], FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
    });
    const emit = (kind: string, data: object) => stream.emit('message', Buffer.from(JSON.stringify({ MessageType: kind, Message: { [kind]: data } })));
    const pos = (id: number, lat = 50.03) => emit('PositionReport', { UserID: id, Valid: true, Latitude: lat, Longitude: 1.02 });
    for (let i = 0; i < 3; i++) {
      emit('ShipStaticData', { UserID: 123000001 + i, Valid: true, Type: 70 });
      pos(123000001 + i); pos(123000001 + i);
    }
    emit('ShipStaticData', { UserID: 123000004, Valid: true, Type: 35 });
    pos(123000004);
    pos(123000001, 60);
    const feed = sea.read();
    assert.equal(feed.status, 'fresh');
    assert.deepEqual(feed.items.map(x => [x.lat, x.lng, x.band, x.subtitle]), [[50.125, 1.125, 'low', '3 à 5 navires']]);
    assert.doesNotMatch(JSON.stringify(feed), /123000001|50\.03|clé-fictive/);
    now += 120_001;
    assert.deepEqual(sea.read().items, []);
    stream.emit('error', new Error('simulation de coupure'));
    assert.equal(sea.read().status, 'unavailable');
  } finally { sea.close(); }
});
