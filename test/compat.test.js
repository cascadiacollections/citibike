/**
 * Tests for the 2.x-compatible callback API: the result shapes 2.x callers
 * read (numeric ids, nearbyStations) and how the callbacks are delivered.
 * Runner: node:test. Assertions: node:assert/strict.
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const path = require('node:path');

const Citibike = require('..');
const support = require('./support/server');

const called = support.called;
const city = support.city(400);

const ROUTES = {
  '/gbfs/en/station_information.json': { body: support.fixture('station_information.json') },
  '/gbfs/en/station_status.json': { body: support.fixture('station_status.json') },
  '/city/station_information.json': { body: city.information },
  '/city/station_status.json': { body: city.status },
  '/missing.json': { status: 503, body: '{}' },
  '/hang.json': { hang: true }
};

const MILES = 1609.344;

function approximately(actual, expected, delta) {
  assert.ok(Math.abs(actual - expected) <= delta, actual + ' is not within ' + delta + ' of ' + expected);
}

describe('2.x compatibility', () => {
  let server;

  before(async () => {
    server = await support.start(ROUTES);
  });

  after(() => support.stop(server));

  beforeEach(() => {
    server.requests.length = 0;
  });

  describe('station ids', () => {
    it('should report the numeric legacy id, like 2.x', async () => {
      const client = new Citibike({ restBase: server.base + '/gbfs/en' });
      const data = await called((cb) => client.getStations(null, cb));
      assert.equal(data.results[0].id, 72);
      assert.equal(data.results[0].stationId, '66db237e-0aca-11e7-82f6-3863bb44ef7c');
    });

    it('should fall back to the GBFS id when the feed has no legacy id', async () => {
      const client = new Citibike({ restBase: server.base + '/gbfs/en' });
      const data = await called((cb) => client.getStations(null, cb));
      assert.equal(data.results[1].id, '66dc0e99-0aca-11e7-82f6-3863bb44ef7c');
      assert.equal(data.results[1].stationId, data.results[1].id);
    });

    it('should report numeric ids with updateOnly too', async () => {
      const client = new Citibike({ restBase: server.base + '/gbfs/en' });
      const data = await called((cb) => client.getStations({ updateOnly: true }, cb));
      assert.equal(data.results[0].id, 72);
      assert.equal(data.results[0].nearbyStations, undefined);
    });
  });

  describe('nearbyStations', () => {
    it('should list the five closest stations in miles, nearest first', async () => {
      const client = new Citibike({ restBase: server.base + '/city' });
      const data = await called((cb) => client.getStations(null, cb));
      assert.equal(data.ok, true);
      assert.equal(data.totalStations, 400);

      // Brute force over every pair is the reference.
      data.results.forEach((s) => {
        const expected = data.results.filter((o) => o !== s).map((o) => {
          return { id: o.id, distance: Citibike.distance(s, o) / MILES };
        }).sort((a, b) => a.distance - b.distance).slice(0, 5);

        assert.equal(s.nearbyStations.length, 5);
        s.nearbyStations.forEach((n, i) => {
          assert.deepEqual(Object.keys(n).sort(), ['distance', 'id']);
          assert.equal(typeof n.id, 'number');
          assert.equal(n.id, expected[i].id);
          approximately(n.distance, expected[i].distance, 1e-9);
        });
      });
    });

    it('should list fewer when there are fewer stations', async () => {
      const client = new Citibike({ restBase: server.base + '/gbfs/en' });
      const data = await called((cb) => client.getStations(null, cb));
      assert.equal(data.results[0].nearbyStations.length, 1);
      assert.equal(data.results[0].nearbyStations[0].id, data.results[1].id);
      approximately(data.results[0].nearbyStations[0].distance, 1.74, 0.01);
      assert.equal(data.results[1].nearbyStations[0].id, 72);
    });
  });

  describe('callbacks', () => {
    it('should include the error code in the envelope', async () => {
      const client = new Citibike({ timeout: 50 });
      const missing = await called((cb) => client.get(server.base + '/missing.json', cb));
      assert.deepEqual(missing, {
        ok: false,
        meta: [],
        results: [],
        error: 'HTTP 503 from ' + server.base + '/missing.json',
        code: 'EHTTP'
      });
      const hung = await called((cb) => client.get(server.base + '/hang.json', cb));
      assert.equal(hung.code, 'ETIMEDOUT');
      const helmets = await called((cb) => client.getHelmets(null, cb));
      assert.equal(helmets.code, 'EDISCONTINUED');
    });

    it('should never cache get()', async () => {
      const client = new Citibike({ restBase: server.base + '/gbfs/en' });
      await called((cb) => client.get('/station_status.json', cb));
      await called((cb) => client.get('/station_status.json', cb));
      assert.equal(server.requests.length, 2);
    });

    it('should return the client for chaining', async () => {
      const client = new Citibike({ restBase: server.base + '/gbfs/en' });
      const returned = [];
      await Promise.all([
        called((cb) => returned.push(client.getStations(cb))),
        called((cb) => returned.push(client.get('/station_status.json', cb))),
        called((cb) => returned.push(client.getBranches(cb)))
      ]);
      assert.equal(returned.length, 3);
      returned.forEach((value) => assert.equal(value, client));
    });

    it('should surface an exception thrown by the callback as uncaught', async () => {
      // In a child process, because a test runner has its own handlers for
      // uncaught errors (and `bun test` gives a test no way around them).
      const script = path.join(__dirname, 'support', 'throwing-callback.js');
      const result = await new Promise((resolve) => {
        execFile(process.execPath, [script], (error, stdout, stderr) => {
          resolve({ code: error ? error.code : 0, stdout: stdout, stderr: stderr });
        });
      });
      // Once, as an uncaught exception, and not as an unhandled rejection.
      assert.deepEqual(result, { code: 0, stdout: 'uncaughtException: from the callback\n', stderr: '' });
    });
  });

  describe('exports', () => {
    it('should keep the 2.x entry points', () => {
      assert.equal(typeof Citibike, 'function');
      assert.equal(require('../lib/citibike.js'), Citibike);
      assert.equal(Citibike.Citibike, Citibike);
      assert.equal(Citibike.default, Citibike);
      assert.deepEqual(Object.keys(new Citibike()), ['defaults', 'options']);
    });
  });
});
