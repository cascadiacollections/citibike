/**
 * Tests for the promise API against a local GBFS fixture server.
 * Test Framework: Mocha (https://mochajs.org/)
 * Assertions: Should (https://github.com/shouldjs/should.js)
 */

var Citibike = require('..'),
    should = require('should'),
    support = require('./support/server');

var city = support.city(400);

var ROUTES = {
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

var server, citibike;

function rejected(promise) {
  return promise.then(function() {
    throw new Error('expected the promise to reject');
  }, function(error) {
    return error;
  });
}

describe('promise API', function() {
  before(function(done) {
    support.start(ROUTES, function(s) {
      server = s;
      done();
    });
  });

  after(function(done) {
    server.closeAllConnections();
    server.close(done);
  });

  beforeEach(function() {
    server.requests.length = 0;
    citibike = new Citibike({ restBase: server.base + '/gbfs/en' });
  });

  describe('Citibike.stations()', function() {
    it('should join station_information and station_status', async function() {
      var stations = await citibike.stations();
      stations.should.have.length(2);
      stations[0].should.eql({
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
      should(stations[1].legacyId).equal(null);
      stations[1].isRenting.should.equal(false);
    });

    it('should fetch both feeds at once', async function() {
      await citibike.stations();
      server.requests.slice().sort().should.eql([
        '/gbfs/en/station_information.json',
        '/gbfs/en/station_status.json'
      ]);
    });

    it('should reject with EPAYLOAD when a feed has no stations', async function() {
      var client = new Citibike({ restBase: server.base + '/empty' });
      var error = await rejected(client.stations());
      error.should.be.instanceof(Citibike.CitibikeError);
      error.code.should.equal('EPAYLOAD');
      error.message.should.match(/Unexpected station_status payload/);
    });
  });

  describe('caching', function() {
    it('should serve repeat calls from memory while the ttl lasts', async function() {
      await citibike.stations();
      await citibike.stations();
      await citibike.station(72);
      server.requests.should.have.length(2);
    });

    it('should share one request between concurrent callers', async function() {
      await Promise.all([citibike.stations(), citibike.stations(), citibike.feed('station_status')]);
      server.requests.should.have.length(2);
    });

    it('should refetch with fresh: true', async function() {
      await citibike.stations();
      await citibike.stations({ fresh: true });
      server.requests.should.have.length(4);
    });

    it('should refetch after clearCache()', async function() {
      await citibike.feed('system_information');
      citibike.clearCache().should.equal(citibike);
      await citibike.feed('system_information');
      server.requests.should.have.length(2);
    });

    it('should not cache when cache: false', async function() {
      var client = new Citibike({ restBase: server.base + '/gbfs/en', cache: false });
      await client.feed('system_information');
      await client.feed('system_information');
      server.requests.should.have.length(2);
    });

    it('should not cache a feed whose ttl is 0', async function() {
      await citibike.feed('no_ttl');
      await citibike.feed('no_ttl');
      server.requests.should.have.length(2);
    });

    it('should not cache failures', async function() {
      await rejected(citibike.feed(server.base + '/missing.json'));
      await rejected(citibike.feed(server.base + '/missing.json'));
      server.requests.should.have.length(2);
    });

    it('should keep each client\'s cache to itself', async function() {
      await citibike.feed('system_information');
      await new Citibike({ restBase: server.base + '/gbfs/en' }).feed('system_information');
      server.requests.should.have.length(2);
    });
  });

  describe('Citibike.station()', function() {
    it('should find a station by GBFS id, legacy id or short name', async function() {
      var byId = await citibike.station('66db237e-0aca-11e7-82f6-3863bb44ef7c');
      var byLegacy = await citibike.station(72);
      var byLegacyString = await citibike.station('72');
      var byShortName = await citibike.station('5329.03');
      byId.name.should.equal('W 52 St & 11 Ave');
      byLegacy.should.eql(byId);
      byLegacyString.should.eql(byId);
      byShortName.name.should.equal('Broadway & W 24 St');
    });

    it('should resolve with null when nothing matches', async function() {
      should(await citibike.station('nope')).equal(null);
      should(await citibike.station(null)).equal(null);
    });
  });

  describe('Citibike.nearest()', function() {
    var point = { latitude: 40.76, longitude: -73.97 };

    beforeEach(function() {
      citibike = new Citibike({ restBase: server.base + '/city' });
    });

    it('should return the closest stations, nearest first', async function() {
      var all = await citibike.stations();
      var expected = all.map(function(s) {
        return { id: s.id, distance: Citibike.distance(point, s) };
      }).sort(function(a, b) { return a.distance - b.distance; }).slice(0, 5);

      var near = await citibike.nearest(point);
      near.map(function(s) { return s.id; }).should.eql(expected.map(function(s) { return s.id; }));
      near[0].distance.should.be.approximately(expected[0].distance, 1e-6);
      near[0].name.should.be.type('string');
      should.not.exist(all[0].distance);
    });

    it('should accept { lat, lon } and honour limit', async function() {
      var near = await citibike.nearest({ lat: point.latitude, lon: point.longitude }, { limit: 12 });
      near.should.have.length(12);
      near[0].distance.should.be.belowOrEqual(near[11].distance);
    });

    it('should leave out stations beyond the radius', async function() {
      var near = await citibike.nearest(point, { limit: 400, radius: 500 });
      near.length.should.be.within(1, 399);
      near.forEach(function(s) { s.distance.should.be.belowOrEqual(500); });
      (await citibike.nearest(point, { radius: 0 })).should.eql([]);
    });

    it('should filter by what is available', async function() {
      var bikes = await citibike.nearest(point, { limit: 400, available: 'bikes' });
      var ebikes = await citibike.nearest(point, { limit: 400, available: 'ebikes' });
      var docks = await citibike.nearest(point, { limit: 400, available: 'docks' });
      bikes.length.should.be.within(1, 399);
      bikes.forEach(function(s) { (s.isRenting && s.bikesAvailable > 0).should.equal(true); });
      ebikes.length.should.be.within(1, bikes.length);
      ebikes.forEach(function(s) { (s.isRenting && s.ebikesAvailable > 0).should.equal(true); });
      docks.forEach(function(s) { (s.isReturning && s.docksAvailable > 0).should.equal(true); });
    });

    it('should reject bad arguments with a TypeError and no request', async function() {
      server.requests.length = 0;
      (await rejected(citibike.nearest())).should.be.instanceof(TypeError);
      (await rejected(citibike.nearest({ latitude: 'x', longitude: 1 }))).should.be.instanceof(TypeError);
      (await rejected(citibike.nearest({ latitude: 91, longitude: 0 }))).should.be.instanceof(TypeError);
      (await rejected(citibike.nearest(point, { limit: 0 }))).should.be.instanceof(TypeError);
      (await rejected(citibike.nearest(point, { radius: -1 }))).should.be.instanceof(TypeError);
      (await rejected(citibike.nearest(point, { available: 'scooters' }))).should.be.instanceof(TypeError);
      server.requests.should.eql([]);
    });
  });

  describe('Citibike.feed()', function() {
    it('should fetch a feed by name, path or absolute url', async function() {
      var byName = await citibike.feed('system_information');
      var byPath = await citibike.feed('/system_information.json');
      var byUrl = await citibike.feed(server.base + '/gbfs/en/system_information.json');
      byName.data.name.should.equal('Citi Bike');
      byName.ttl.should.equal(60);
      byPath.should.equal(byName);
      byUrl.should.equal(byName);
      server.requests.should.eql(['/gbfs/en/system_information.json']);
    });

    it('should use the configured station feed paths', async function() {
      var client = new Citibike({ restBase: server.base, stationStatusURL: '/city/station_status.json' });
      (await client.feed('station_status')).data.stations.should.have.length(400);
    });

    it('should reject a name that is not a string', async function() {
      (await rejected(citibike.feed())).should.be.instanceof(TypeError);
      (await rejected(citibike.feed(''))).should.be.instanceof(TypeError);
    });
  });

  describe('errors', function() {
    it('should reject with EHTTP and the status', async function() {
      var error = await rejected(citibike.feed(server.base + '/missing.json'));
      error.should.be.instanceof(Citibike.CitibikeError).and.instanceof(Error);
      error.name.should.equal('CitibikeError');
      error.code.should.equal('EHTTP');
      error.status.should.equal(503);
      error.url.should.equal(server.base + '/missing.json');
    });

    it('should reject with EPARSE for invalid JSON', async function() {
      var error = await rejected(citibike.feed(server.base + '/broken.json'));
      error.code.should.equal('EPARSE');
      should(error.status).equal(null);
      error.cause.should.be.instanceof(SyntaxError);
    });

    it('should reject with EPAYLOAD for JSON that is not a feed', async function() {
      (await rejected(citibike.feed(server.base + '/array.json'))).code.should.equal('EPAYLOAD');
    });

    it('should reject with ETIMEDOUT after options.timeout', async function() {
      var client = new Citibike({ timeout: 50 });
      var error = await rejected(client.feed(server.base + '/hang.json'));
      error.code.should.equal('ETIMEDOUT');
      error.message.should.match(/timed out after 50ms/);
    });

    it('should reject with ENETWORK when the connection is refused', async function() {
      // Port 1 on loopback: refused immediately, no external network involved.
      (await rejected(citibike.feed('http://127.0.0.1:1/x.json'))).code.should.equal('ENETWORK');
    });

    it('should reject with ENETWORK when the connection drops mid-response', async function() {
      var error = await rejected(citibike.feed(server.base + '/drop.json'));
      error.code.should.equal('ENETWORK');
      error.message.should.match(/Connection closed/);
    });
  });

  describe('signal', function() {
    it('should reject with EABORTED without a request when already aborted', async function() {
      var error = await rejected(citibike.stations({ signal: AbortSignal.abort() }));
      error.code.should.equal('EABORTED');
      server.requests.should.eql([]);
    });

    it('should reject with EABORTED when aborted mid-request', async function() {
      var controller = new AbortController();
      var client = new Citibike({ timeout: 2000 });
      var pending = rejected(client.feed(server.base + '/hang.json', { signal: controller.signal }));
      setTimeout(function() { controller.abort(); }, 20);
      (await pending).code.should.equal('EABORTED');
    });

    it('should not abort another caller sharing the same request', async function() {
      var controller = new AbortController();
      var aborted = rejected(citibike.feed('system_information', { signal: controller.signal }));
      var kept = citibike.feed('system_information');
      controller.abort();
      (await aborted).code.should.equal('EABORTED');
      (await kept).data.name.should.equal('Citi Bike');
    });
  });

  describe('options.fetch', function() {
    it('should use the fetch implementation it is given', async function() {
      var calls = [];
      var client = new Citibike({
        headers: { 'X-Test': '1' },
        fetch: function(url, init) {
          calls.push({ url: url, headers: init.headers });
          return Promise.resolve(new Response(JSON.stringify({ ttl: 5, data: { hello: 'world' } })));
        }
      });
      (await client.feed('system_alerts')).data.hello.should.equal('world');
      calls.should.have.length(1);
      calls[0].url.should.equal('https://gbfs.citibikenyc.com/gbfs/en/system_alerts.json');
      calls[0].headers['X-Test'].should.equal('1');
      server.requests.should.eql([]);
    });
  });

  describe('Citibike.distance()', function() {
    it('should measure meters between two points', function() {
      var a = { latitude: 40.76727216, longitude: -73.99392888 };
      var b = { lat: 40.7423543, lon: -73.98915076 };
      Citibike.distance(a, a).should.equal(0);
      Citibike.distance(a, b).should.be.approximately(2800, 5);
      Citibike.distance(a, b).should.equal(Citibike.distance(b, a));
      (function() { Citibike.distance(a, {}); }).should.throw(TypeError);
    });
  });
});
