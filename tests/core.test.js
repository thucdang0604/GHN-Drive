import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { calculateGpsAccuracyReport, parseAndNormalizeAddress } from '../js/geo-healer.js';
import '../js/p2p-sync.js';

const p2p = globalThis.P2PSync;

test('mobile and desktop bundles include the GPS safety fixes', async () => {
  const [mobile, desktopBundle] = await Promise.all([
    readFile(new URL('../ghn_mobile.html', import.meta.url), 'utf8'),
    readFile(new URL('../js/app.bundle.js', import.meta.url), 'utf8')
  ]);

  assert.ok(mobile.includes('var numericDistrict = normalizedAddress.match('));
  assert.ok(mobile.includes("level = 'gps_outlier';"));
  assert.ok(mobile.includes('confidence = 0;'));
  assert.ok(desktopBundle.includes('isGpsOutlier'));
  assert.ok(desktopBundle.includes('normalizedAddress.match'));
  assert.ok(mobile.includes('maxlength="48"'));
  assert.ok(mobile.includes('p2p.isValidConnectionCode(pinOrId)'));
  assert.ok(!mobile.includes('val.length !== 6'));
});

test('connection codes accept current and legacy tokens only', () => {
  assert.equal(p2p.isValidConnectionCode('a'.repeat(32)), true);
  assert.equal(p2p.isValidConnectionCode('GHN-SYNC-' + 'A'.repeat(32)), true);
  assert.equal(p2p.isValidConnectionCode('123456'), true);
  assert.equal(p2p.isValidConnectionCode('ghn-sync-123456'), true);
  assert.equal(p2p.isValidConnectionCode('12345'), false);
  assert.equal(p2p.isValidConnectionCode('<img src=x>'), false);
  let connectionError;
  assert.equal(p2p.connectToHost('<img src=x>', { onError: error => { connectionError = error; } }), null);
  assert.match(connectionError.message, /không hợp lệ/i);
});

test('full P2P sync preserves money and delivery fields', () => {
  const order = {
    id: 'ghn_order_1', trackingCode: 'VNGH123', customerName: 'Khách', phone: '0901234567',
    secondaryPhone: '0907654321', address: '12 Pasteur', codAmount: 150000, phaiThu: 120000,
    gtbThu: 30000, status: 'gtb', subStatus: 'hen_giao_lai', gtbReason: 'Hẹn giao lại',
    notes: 'Gọi trước khi giao', lat: 10.78, lng: 106.69, tripCode: 'T1',
    createdAt: '2026-10-31T08:00:00.000Z', deliveredAt: '2026-10-31T09:00:00.000Z'
  };
  const wire = p2p.buildFullPayload([order], [{ id: 'group_1', name: 'Quận 1' }]).payload;
  const result = p2p.applyFull(wire, [{ id: 'ghn_local_1', trackingCode: 'VNGH123', deliveryPhoto: 'local-photo' }], [], false);

  assert.equal(result.valid, true);
  assert.deepEqual(
    Object.fromEntries(['phaiThu', 'gtbThu', 'secondaryPhone', 'notes', 'subStatus', 'gtbReason'].map(key => [key, result.orders[0][key]])),
    Object.fromEntries(['phaiThu', 'gtbThu', 'secondaryPhone', 'notes', 'subStatus', 'gtbReason'].map(key => [key, order[key]]))
  );
  assert.equal(result.orders[0].id, 'ghn_local_1');
  assert.equal(result.orders[0].deliveryPhoto, 'local-photo');
});

test('P2P import strips markup from phone and creates a safe order id', () => {
  const result = p2p.applyFull({ g: [['__proto__', '<img src=x onerror=1>']], o: [[
    'VNGH999', '<img src=x onerror=1>', '"><img src=x onerror=1>', 'Address', 0, 'pending', '', null, null, '', {}
  ]] }, [], [], false);

  assert.equal(result.valid, true);
  assert.equal(result.orders[0].phone, '1');
  assert.match(result.orders[0].id, /^[a-zA-Z0-9_-]+$/);
  assert.equal(result.groups.some(group => group.id === '__proto__'), false);
});

test('verified geocache import skips prototype-mutating keys', () => {
  const cache = p2p.sanitizeVerifiedGeocache(JSON.parse('{"__proto__":{"lat":10,"lng":106},"ok":{"lat":10,"lng":106}}'));
  assert.equal(Object.getPrototypeOf(cache), null);
  assert.equal(cache.__proto__, undefined);
  assert.equal(cache.ok.lat, 10);
});

test('legacy full sync keeps local money and notes it cannot send', () => {
  const current = [{
    id: 'ghn_local_1', trackingCode: 'VNGH999', phaiThu: 120000, gtbThu: 30000,
    secondaryPhone: '0907654321', notes: 'Gọi trước', deliveredAt: '2026-10-31T09:00:00.000Z'
  }];
  const result = p2p.applyFull({ v: 2, g: [], o: [[
    'VNGH999', 'Khách', '0901234567', 'Address', 150000, 'gtb', '', 10.78, 106.69, ''
  ]] }, current, [], false);

  assert.equal(result.orders[0].id, 'ghn_local_1');
  assert.equal(result.orders[0].gtbThu, 30000);
  assert.equal(result.orders[0].notes, 'Gọi trước');
  assert.equal(result.orders[0].secondaryPhone, '0907654321');
});

test('a P2P host requires explicit approval and uses a cryptographic room code', () => {
  class FakePeer {
    constructor(id) { this.id = id; this.handlers = {}; FakePeer.last = this; }
    on(name, callback) { this.handlers[name] = callback; }
    destroy() {}
  }

  globalThis.Peer = FakePeer;
  const host = p2p.createHost({ authorizeConnection: () => false });
  assert.match(host.pin, /^[a-f0-9]{32}$/);

  const connection = {
    open: true,
    handlers: {},
    on(name, callback) { this.handlers[name] = callback; },
    close() { this.closed = true; }
  };
  host.peer.handlers.connection(connection);
  connection.handlers.open();

  assert.equal(connection.closed, true);
  host.close();

  const approvedHost = p2p.createHost({ authorizeConnection: () => true });
  const approvedConnection = {
    open: true,
    handlers: {},
    on(name, callback) { this.handlers[name] = callback; },
    close() { this.closed = true; },
    send() {}
  };
  approvedHost.peer.handlers.connection(approvedConnection);
  approvedConnection.handlers.open();
  assert.equal(approvedHost.send({ type: 'ghn_p2p_sync' }), true);

  const secondConnection = { close() { this.closed = true; } };
  approvedHost.peer.handlers.connection(secondConnection);
  assert.equal(secondConnection.closed, true);
  approvedHost.close();
  delete globalThis.Peer;
});

test('named districts map to their GPS validation key', () => {
  assert.equal(parseAndNormalizeAddress('12 Xô Viết Nghệ Tĩnh, Phường 19, Bình Thạnh, TP.HCM').districtCode, 'binhthanh');
  assert.equal(parseAndNormalizeAddress('154 Pasteur, Phường Bến Nghé, Quận 1, TP.HCM').districtCode, 'q1');
});

test('GPS report gives no confidence to a flagged outlier', () => {
  const report = calculateGpsAccuracyReport([{
    address: '12 Đường Thử Nghiệm, Quận 3', lat: 10.78, lng: 106.69,
    isGpsOutlier: true, outlierReason: 'Lệch khỏi cụm đường'
  }]);

  assert.equal(report.items[0].level, 'gps_outlier');
  assert.equal(report.items[0].confidence, 0);
  assert.equal(report.accuracyScore, 0);
});
