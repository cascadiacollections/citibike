/**
 * Tests for the promise API against a local GBFS fixture server.
 * Runner: node:test. Assertions: node:assert/strict.
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const Citibike = require('..');
const support = require('./support/server');

const rejected = support.rejected;
const city = support.city(400);

const ROUTES = {
  '/gbfs/en/station_information.json': { body: support.fixture('station_information.json') },
  '/gbfs/en/station_status.json': { body: support.fixture('station_status.json') },
  '/gbfs/en/system_information.json': {
    body: JSON.stringify({ last_updated: 1761955230, ttl: 60, version: '1.1', data: { name: 'Citi Bike', timezone: 'America/New_York' } })
  },
  '/gbfs/en/no_ttl.json': { body: JSON.stringify({ last_updated: 1, ttl: 0, data: { n: 1 } }) },
  '/city/station_information.json': { body: city.information },
  '/city/station_status.json': { body: city.status },
  '/broken.json': { body: '{ not json' },
  '/missing.json': { status: 503, body: '{}' },
  '/array.json': { body: '[1,2,3]' },
  '/empty/station_status.json': { body: '{"data":{}}' },
  '/empty/station_information.json': { body: support.fixture('station_information.json') },
  '/hang.json': { hang: true },
  '/drop.json': { drop: '{"data":{"stations":[{"station_id":"a"' }
};

function instanceOf(value, Type) {
  assert.ok(value instanceof Type, 'expected an instance of ' + Type.name + ', got ' + value);
}

function within(value, min, max) {
  assert.ok(value >= min && value <= max, value + ' is not within ' + min + '..' + max);
}

function approximately(actual, expected, delta) {
  assert.ok(Math.abs(actual - expected) <= delta, actual + ' is not within ' + delta + ' of ' + expected);
}

describe('promise API', () => {
  let server, citibike;

  before(async () => {
    server = await support.start(ROUTES);
  });

  after(() => support.stop(server));

  beforeEach(() => {
    server.requests.length = 0;
    citibike = new Citibike({ restBase: server.base + '/gbfs/en' });
  });

  describe('Citibike.stations()', () => {
    it('should join station_information and station_status', async () => {
      const stations = await citibike.stations();
      assert.equal(stations.length, 2);
      assert.deepEqual(stations[0], {
        id: '66db237e-0aca-11e7-82f6-3863bb44ef7c',
        legacyId: 72,
        name: 'W 52 St & 11 Ave',
        shortName: '6926.01',
        latitude: 40.76727216,
        longitude: -73.99392888,
        capacity: 39,
        regionId: '71',
        bikesAvailable: 12,
        ebikesAvailable: 3,
        classicBikesAvailable: 9,
        docksAvailable: 22,
        bikesDisabled: 1,
        docksDisabled: 4,
        isInstalled: true,
        isRenting: true,
        isReturning: true,
        lastReported: 1761955201
      });
      assert.equal(stations[1].legacyId, null);
      assert.equal(stations[1].isRenting, false);
    });

    it('should fetch both feeds at once', async () => {
      await citibike.stations();
      assert.deepEqual(server.requests.slice().sort(), [
        '/gbfs/en/station_information.json',
        '/gbfs/en/station_status.json'
      ]);
    });

    it('should reject with EPAYLOAD when a feed has no stations', async () => {
      const client = new Citibike({ restBase: server.base + '/empty' });
      const error = await rejected(client.stations());
      instanceOf(error, Citibike.CitibikeError);
      assert.equal(error.code, 'EPAYLOAD');
      assert.match(error.message, /Unexpected station_status payload/);
    });
  });

  describe('caching', () => {
    it('should serve repeat calls from memory while the ttl lasts', async () => {
      await citibike.stations();
      await citibike.stations();
      await citibike.station(72);
      assert.equal(server.requests.length, 2);
    });

    it('should share one request between concurrent callers', async () => {
      await Promise.all([citibike.stations(), citibike.stations(), citibike.feed('station_status')]);
      assert.equal(server.requests.length, 2);
    });

    it('should refetch with fresh: true', async () => {
      await citibike.stations();
      await citibike.stations({ fresh: true });
      assert.equal(server.requests.length, 4);
    });

    it('should refetch after clearCache()', async () => {
      await citibike.feed('system_information');
      assert.equal(citibike.clearCache(), citibike);
      await citibike.feed('system_information');
      assert.equal(server.requests.length, 2);
    });

    it('should not cache when cache: false', async () => {
      const client = new Citibike({ restBase: server.base + '/gbfs/en', cache: false });
      await client.feed('system_information');
      await client.feed('system_information');
      assert.equal(server.requests.length, 2);
    });

    it('should not cache a feed whose ttl is 0', async () => {
      await citibike.feed('no_ttl');
      await citibike.feed('no_ttl');
      assert.equal(server.requests.length, 2);
    });

    it('should not cache failures', async () => {
      await rejected(citibike.feed(server.base + '/missing.json'));
      await rejected(citibike.feed(server.base + '/missing.json'));
      assert.equal(server.requests.length, 2);
    });

    it('should keep each client\'s cache to itself', async () => {
      await citibike.feed('system_information');
      await new Citibike({ restBase: server.base + '/gbfs/en' }).feed('system_information');
      assert.equal(server.requests.length, 2);
    });
  });

  describe('Citibike.station()', () => {
    it('should find a station by GBFS id, legacy id or short name', async () => {
      const byId = await citibike.station('66db237e-0aca-11e7-82f6-3863bb44ef7c');
      const byLegacy = await citibike.station(72);
      const byLegacyString = await citibike.station('72');
      const byShortName = await citibike.station('5329.03');
      assert.equal(byId.name, 'W 52 St & 11 Ave');
      assert.deepEqual(byLegacy, byId);
      assert.deepEqual(byLegacyString, byId);
      assert.equal(byShortName.name, 'Broadway & W 24 St');
    });

    it('should resolve with null when nothing matches', async () => {
      assert.equal(await citibike.station('nope'), null);
      assert.equal(await citibike.station(null), null);
    });
  });

  describe('Citibike.nearest()', () => {
    const point = { latitude: 40.76, longitude: -73.97 };

    beforeEach(() => {
      citibike = new Citibike({ restBase: server.base + '/city' });
    });

    it('should return the closest stations, nearest first', async () => {
      const all = await citibike.stations();
      const expected = all.map((s) => {
        return { id: s.id, distance: Citibike.distance(point, s) };
      }).sort((a, b) => a.distance - b.distance).slice(0, 5);

      const near = await citibike.nearest(point);
      assert.deepEqual(near.map((s) => s.id), expected.map((s) => s.id));
      approximately(near[0].distance, expected[0].distance, 1e-6);
      assert.equal(typeof near[0].name, 'string');
      assert.equal(all[0].distance, undefined);
    });

    it('should accept { lat, lon } and honour limit', async () => {
      const near = await citibike.nearest({ lat: point.latitude, lon: point.longitude }, { limit: 12 });
      assert.equal(near.length, 12);
      assert.ok(near[0].distance <= near[11].distance);
    });

    it('should leave out stations beyond the radius', async () => {
      const near = await citibike.nearest(point, { limit: 400, radius: 500 });
      within(near.length, 1, 399);
      near.forEach((s) => assert.ok(s.distance <= 500));
      assert.deepEqual(await citibike.nearest(point, { radius: 0 }), []);
    });

    it('should filter by what is available', async () => {
      const bikes = await citibike.nearest(point, { limit: 400, available: 'bikes' });
      const ebikes = await citibike.nearest(point, { limit: 400, available: 'ebikes' });
      const docks = await citibike.nearest(point, { limit: 400, available: 'docks' });
      within(bikes.length, 1, 399);
      bikes.forEach((s) => assert.equal(s.isRenting && s.bikesAvailable > 0, true));
      within(ebikes.length, 1, bikes.length);
      ebikes.forEach((s) => assert.equal(s.isRenting && s.ebikesAvailable > 0, true));
      docks.forEach((s) => assert.equal(s.isReturning && s.docksAvailable > 0, true));
    });

    it('should reject bad arguments with a TypeError and no request', async () => {
      server.requests.length = 0;
      instanceOf(await rejected(citibike.nearest()), TypeError);
      instanceOf(await rejected(citibike.nearest({ latitude: 'x', longitude: 1 })), TypeError);
      instanceOf(await rejected(citibike.nearest({ latitude: 91, longitude: 0 })), TypeError);
      instanceOf(await rejected(citibike.nearest(point, { limit: 0 })), TypeError);
      instanceOf(await rejected(citibike.nearest(point, { radius: -1 })), TypeError);
      instanceOf(await rejected(citibike.nearest(point, { available: 'scooters' })), TypeError);
      assert.deepEqual(server.requests, []);
    });
  });

  describe('Citibike.feed()', () => {
    it('should fetch a feed by name, path or absolute url', async () => {
      const byName = await citibike.feed('system_information');
      const byPath = await citibike.feed('/system_information.json');
      const byUrl = await citibike.feed(server.base + '/gbfs/en/system_information.json');
      assert.equal(byName.data.name, 'Citi Bike');
      assert.equal(byName.ttl, 60);
      assert.equal(byPath, byName);
      assert.equal(byUrl, byName);
      assert.deepEqual(server.requests, ['/gbfs/en/system_information.json']);
    });

    it('should use the configured station feed paths', async () => {
      const client = new Citibike({ restBase: server.base, stationStatusURL: '/city/station_status.json' });
      assert.equal((await client.feed('station_status')).data.stations.length, 400);
    });

    it('should reject a name that is not a string', async () => {
      instanceOf(await rejected(citibike.feed()), TypeError);
      instanceOf(await rejected(citibike.feed('')), TypeError);
    });
  });

  describe('errors', () => {
    it('should reject with EHTTP and the status', async () => {
      const error = await rejected(citibike.feed(server.base + '/missing.json'));
      instanceOf(error, Citibike.CitibikeError);
      instanceOf(error, Error);
      assert.equal(error.name, 'CitibikeError');
      assert.equal(error.code, 'EHTTP');
      assert.equal(error.status, 503);
      assert.equal(error.url, server.base + '/missing.json');
    });

    it('should reject with EPARSE for invalid JSON', async () => {
      const error = await rejected(citibike.feed(server.base + '/broken.json'));
      assert.equal(error.code, 'EPARSE');
      assert.equal(error.status, null);
      instanceOf(error.cause, SyntaxError);
    });

    it('should reject with EPAYLOAD for JSON that is not a feed', async () => {
      assert.equal((await rejected(citibike.feed(server.base + '/array.json'))).code, 'EPAYLOAD');
    });

    it('should reject with ETIMEDOUT after options.timeout', async () => {
      const client = new Citibike({ timeout: 50 });
      const error = await rejected(client.feed(server.base + '/hang.json'));
      assert.equal(error.code, 'ETIMEDOUT');
      assert.match(error.message, /timed out after 50ms/);
    });

    it('should reject with ENETWORK when the connection is refused', async () => {
      // Port 1 on loopback: refused immediately, no external network involved.
      assert.equal((await rejected(citibike.feed('http://127.0.0.1:1/x.json'))).code, 'ENETWORK');
    });

    it('should reject with ENETWORK when the connection drops mid-response', async () => {
      const error = await rejected(citibike.feed(server.base + '/drop.json'));
      assert.equal(error.code, 'ENETWORK');
      assert.match(error.message, /Connection closed/);
    });
  });

  describe('signal', () => {
    it('should reject with EABORTED without a request when already aborted', async () => {
      const error = await rejected(citibike.stations({ signal: AbortSignal.abort() }));
      assert.equal(error.code, 'EABORTED');
      assert.deepEqual(server.requests, []);
    });

    it('should reject with EABORTED when aborted mid-request', async () => {
      const controller = new AbortController();
      const client = new Citibike({ timeout: 2000 });
      const pending = rejected(client.feed(server.base + '/hang.json', { signal: controller.signal }));
      setTimeout(() => controller.abort(), 20);
      assert.equal((await pending).code, 'EABORTED');
    });

    it('should not abort another caller sharing the same request', async () => {
      const controller = new AbortController();
      const aborted = rejected(citibike.feed('system_information', { signal: controller.signal }));
      const kept = citibike.feed('system_information');
      controller.abort();
      assert.equal((await aborted).code, 'EABORTED');
      assert.equal((await kept).data.name, 'Citi Bike');
    });
  });

  describe('options.fetch', () => {
    it('should use the fetch implementation it is given', async () => {
      const calls = [];
      const client = new Citibike({
        headers: { 'X-Test': '1' },
        fetch: (url, init) => {
          calls.push({ url: url, headers: init.headers });
          return Promise.resolve(new Response(JSON.stringify({ ttl: 5, data: { hello: 'world' } })));
        }
      });
      assert.equal((await client.feed('system_alerts')).data.hello, 'world');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, 'https://gbfs.citibikenyc.com/gbfs/en/system_alerts.json');
      assert.equal(calls[0].headers['X-Test'], '1');
      assert.deepEqual(server.requests, []);
    });
  });

  describe('Citibike.distance()', () => {
    it('should measure meters between two points', () => {
      const a = { latitude: 40.76727216, longitude: -73.99392888 };
      const b = { lat: 40.7423543, lon: -73.98915076 };
      assert.equal(Citibike.distance(a, a), 0);
      approximately(Citibike.distance(a, b), 2800, 5);
      assert.equal(Citibike.distance(a, b), Citibike.distance(b, a));
      assert.throws(() => { Citibike.distance(a, {}); }, TypeError);
    });
  });
});
