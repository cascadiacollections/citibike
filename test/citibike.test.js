/**
 * Tests for the callback methods against a local GBFS fixture server.
 * Runner: node:test. Assertions: node:assert/strict.
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const Citibike = require('..');
const support = require('./support/server');

const called = support.called;

const GBFS_ROUTES = {
  '/gbfs/en/station_information.json': { body: support.fixture('station_information.json') },
  '/gbfs/en/station_status.json': { body: support.fixture('station_status.json') },
  '/broken.json': { body: '{ not json' },
  '/missing.json': { status: 503, body: '{}' },
  '/empty.json': { body: '{"data":{}}' },
  '/hang.json': { hang: true },
  '/drop.json': { drop: '{"data":{"stations":[{"station_id":"a"' }
};

let server, citibike;

before(async () => {
  server = await support.start(GBFS_ROUTES);
});

after(() => support.stop(server));

beforeEach(() => {
  server.requests.length = 0;
  citibike = new Citibike({ restBase: server.base + '/gbfs/en' });
});

describe('Citibike.get()', () => {
  it('should throw error if callback is not typeof function', () => {
    assert.throws(() => {
      citibike.get(null, null, 'string');
    }, { name: 'Error', message: 'ERROR: Invalid callback function.' });
  });

  it('should throw error if an invalid url is passed', () => {
    assert.throws(() => {
      citibike.get(null, null, () => {});
    }, { name: 'Error', message: 'ERROR: Invalid URL called.' });
  });

  it('should successfully complete a request to an absolute url', async () => {
    const data = await called((cb) => citibike.get(server.base + '/gbfs/en/station_status.json', null, cb));
    assert.ok(data);
    assert.ok(data.data.stations.length > 0);
  });

  it('should resolve paths relative to restBase and append params', async () => {
    const data = await called((cb) => citibike.get('/station_status.json', { a: 1 }, cb));
    assert.ok(data.data.stations.length > 0);
    assert.deepEqual(server.requests, ['/gbfs/en/station_status.json?a=1']);
  });

  it('should not append a query string for empty params', async () => {
    await called((cb) => citibike.get('/station_status.json', {}, cb));
    assert.deepEqual(server.requests, ['/gbfs/en/station_status.json']);
  });

  it('should report invalid JSON as ok: false', async () => {
    const data = await called((cb) => citibike.get(server.base + '/broken.json', cb));
    assert.equal(data.ok, false);
    assert.deepEqual(data.results, []);
    assert.match(data.error, /Invalid JSON/);
  });

  it('should report non-2xx responses as ok: false', async () => {
    const data = await called((cb) => citibike.get(server.base + '/missing.json', cb));
    assert.equal(data.ok, false);
    assert.match(data.error, /HTTP 503/);
  });

  it('should report connection errors as ok: false', async () => {
    // Port 1 on loopback: refused immediately, no external network involved.
    const data = await called((cb) => citibike.get('http://127.0.0.1:1/x.json', cb));
    assert.equal(data.ok, false);
    assert.equal(typeof data.error, 'string');
  });

  it('should time out according to options.timeout', async () => {
    const client = new Citibike({ timeout: 50 });
    const data = await called((cb) => client.get(server.base + '/hang.json', cb));
    assert.equal(data.ok, false);
    assert.match(data.error, /timed out/);
  });

  it('should report a connection dropped mid-response as ok: false', async () => {
    const client = new Citibike({ timeout: 2000 });
    const data = await called((cb) => client.get(server.base + '/drop.json', cb));
    assert.equal(data.ok, false);
    assert.deepEqual(data.results, []);
    assert.match(data.error, /Connection closed/);
  });
});

describe('Citibike.getStations()', () => {
  it('should join station_information and station_status', async () => {
    const data = await called((cb) => citibike.getStations(null, cb));
    assert.equal(data.ok, true);
    assert.deepEqual(data.meta, []);
    assert.equal(data.lastUpdate, 1761955230);
    assert.equal(data.totalStations, 2);
    assert.equal(data.activeStations, 1);

    assert.deepEqual(data.results[0], {
      id: 72,
      stationId: '66db237e-0aca-11e7-82f6-3863bb44ef7c',
      status: 'Active',
      availableBikes: 12,
      availableEbikes: 3,
      availableDocks: 22,
      lastReported: 1761955201,
      label: 'W 52 St & 11 Ave',
      shortName: '6926.01',
      latitude: 40.76727216,
      longitude: -73.99392888,
      capacity: 39,
      stationAddress: '',
      nearbyStations: data.results[0].nearbyStations
    });
    assert.equal(data.results[1].status, 'Not In Service');
  });

  it('should only fetch station_status when updateOnly is set', async () => {
    const data = await called((cb) => citibike.getStations({ updateOnly: true }, cb));
    assert.equal(data.ok, true);
    assert.equal(data.totalStations, 3);
    assert.equal(data.activeStations, 2);
    assert.equal(data.results[0].label, undefined);
    assert.deepEqual(server.requests, ['/gbfs/en/station_status.json']);
  });

  it('should accept the callback as the only argument', async () => {
    const data = await called((cb) => citibike.getStations(cb));
    assert.equal(data.ok, true);
  });

  it('should throw if callback is not a function', () => {
    assert.throws(() => {
      citibike.getStations(null, 'nope');
    }, { name: 'Error', message: 'ERROR: Invalid callback function.' });
    assert.throws(() => {
      citibike.getStations();
    }, { name: 'Error', message: 'ERROR: Invalid callback function.' });
    assert.deepEqual(server.requests, []);
  });

  it('should pass through feed errors as ok: false', async () => {
    const client = new Citibike({ restBase: server.base + '/nope' });
    const data = await called((cb) => client.getStations(null, cb));
    assert.equal(data.ok, false);
    assert.match(data.error, /HTTP 404/);
  });

  it('should reject payloads that are not GBFS-shaped', async () => {
    const client = new Citibike({ restBase: server.base, stationStatusURL: '/empty.json' });
    const data = await called((cb) => client.getStations(null, cb));
    assert.equal(data.ok, false);
    assert.match(data.error, /Unexpected station_status payload/);
  });
});

['getBranches', 'getHelmets'].forEach((method) => {
  describe('Citibike.' + method + '()', () => {
    it('should call back asynchronously with ok: false and no request', async () => {
      let sync = true;
      const pending = called((cb) => citibike[method](null, (data) => {
        cb({ data: data, sync: sync });
      }));
      sync = false;
      const result = await pending;
      assert.equal(result.sync, false);
      assert.equal(result.data.ok, false);
      assert.deepEqual(result.data.results, []);
      assert.match(result.data.error, /not available/);
      assert.deepEqual(server.requests, []);
    });

    it('should throw if callback is not a function', () => {
      assert.throws(() => {
        citibike[method](null, 'nope');
      }, { name: 'Error', message: 'ERROR: Invalid callback function.' });
    });
  });
});
