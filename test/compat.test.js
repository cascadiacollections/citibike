/**
 * Tests for the 2.x-compatible callback API: the result shapes 2.x callers
 * read (numeric ids, nearbyStations) and how the callbacks are delivered.
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
  '/city/station_information.json': { body: city.information },
  '/city/station_status.json': { body: city.status },
  '/missing.json': { status: 503, body: '{}' },
  '/hang.json': { hang: true }
};

var MILES = 1609.344;

var server;

describe('2.x compatibility', function() {
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
  });

  describe('station ids', function() {
    it('should report the numeric legacy id, like 2.x', function(done) {
      new Citibike({ restBase: server.base + '/gbfs/en' }).getStations(null, function(data) {
        data.results[0].id.should.equal(72);
        data.results[0].stationId.should.equal('66db237e-0aca-11e7-82f6-3863bb44ef7c');
        done();
      });
    });

    it('should fall back to the GBFS id when the feed has no legacy id', function(done) {
      new Citibike({ restBase: server.base + '/gbfs/en' }).getStations(null, function(data) {
        data.results[1].id.should.equal('66dc0e99-0aca-11e7-82f6-3863bb44ef7c');
        data.results[1].stationId.should.equal(data.results[1].id);
        done();
      });
    });

    it('should report numeric ids with updateOnly too', function(done) {
      new Citibike({ restBase: server.base + '/gbfs/en' }).getStations({ updateOnly: true }, function(data) {
        data.results[0].id.should.equal(72);
        should.not.exist(data.results[0].nearbyStations);
        done();
      });
    });
  });

  describe('nearbyStations', function() {
    it('should list the five closest stations in miles, nearest first', function(done) {
      new Citibike({ restBase: server.base + '/city' }).getStations(null, function(data) {
        data.ok.should.equal(true);
        data.totalStations.should.equal(400);

        // Brute force over every pair is the reference.
        data.results.forEach(function(s) {
          var expected = data.results.filter(function(o) { return o !== s; }).map(function(o) {
            return { id: o.id, distance: Citibike.distance(s, o) / MILES };
          }).sort(function(a, b) { return a.distance - b.distance; }).slice(0, 5);

          s.nearbyStations.should.have.length(5);
          s.nearbyStations.forEach(function(n, i) {
            n.should.have.keys('id', 'distance');
            n.id.should.equal(expected[i].id).and.be.type('number');
            n.distance.should.be.approximately(expected[i].distance, 1e-9);
          });
        });
        done();
      });
    });

    it('should list fewer when there are fewer stations', function(done) {
      new Citibike({ restBase: server.base + '/gbfs/en' }).getStations(null, function(data) {
        data.results[0].nearbyStations.should.have.length(1);
        data.results[0].nearbyStations[0].id.should.equal(data.results[1].id);
        data.results[0].nearbyStations[0].distance.should.be.approximately(1.74, 0.01);
        data.results[1].nearbyStations[0].id.should.equal(72);
        done();
      });
    });
  });

  describe('callbacks', function() {
    it('should include the error code in the envelope', function(done) {
      var client = new Citibike({ timeout: 50 });
      client.get(server.base + '/missing.json', function(data) {
        data.should.eql({ ok: false, meta: [], results: [], error: 'HTTP 503 from ' + server.base + '/missing.json', code: 'EHTTP' });
        client.get(server.base + '/hang.json', function(data) {
          data.code.should.equal('ETIMEDOUT');
          client.getHelmets(null, function(data) {
            data.code.should.equal('EDISCONTINUED');
            done();
          });
        });
      });
    });

    it('should never cache get()', function(done) {
      var client = new Citibike({ restBase: server.base + '/gbfs/en' });
      client.get('/station_status.json', function() {
        client.get('/station_status.json', function() {
          server.requests.should.have.length(2);
          done();
        });
      });
    });

    it('should return the client for chaining', function(done) {
      var client = new Citibike({ restBase: server.base + '/gbfs/en' });
      var pending = 3;
      function next() { if (--pending === 0) done(); }
      client.getStations(next).should.equal(client);
      client.get('/station_status.json', next).should.equal(client);
      client.getBranches(next).should.equal(client);
    });

    it('should surface an exception thrown by the callback as uncaught', function(done) {
      var client = new Citibike({ restBase: server.base + '/gbfs/en' });
      var listeners = process.listeners('uncaughtException');
      process.removeAllListeners('uncaughtException');
      process.once('uncaughtException', function(error) {
        listeners.forEach(function(l) { process.on('uncaughtException', l); });
        error.message.should.equal('from the callback');
        done();
      });
      client.getStations(function() {
        throw new Error('from the callback');
      });
    });
  });

  describe('exports', function() {
    it('should keep the 2.x entry points', function() {
      Citibike.should.be.type('function');
      require('../lib/citibike.js').should.equal(Citibike);
      Citibike.Citibike.should.equal(Citibike);
      Citibike.default.should.equal(Citibike);
      Object.keys(new Citibike()).should.eql(['defaults', 'options']);
    });
  });
});
