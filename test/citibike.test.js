/**
 * Tests for Citibike requests against a local GBFS fixture server.
 * Test Framework: Mocha (https://mochajs.org/)
 * Assertions: Should (https://github.com/shouldjs/should.js)
 */

var Citibike = require('..'),
    should = require('should'),
    support = require('./support/server');

var GBFS_ROUTES = {
  '/gbfs/en/station_information.json': { body: support.fixture('station_information.json') },
  '/gbfs/en/station_status.json': { body: support.fixture('station_status.json') },
  '/broken.json': { body: '{ not json' },
  '/missing.json': { status: 503, body: '{}' },
  '/empty.json': { body: '{"data":{}}' },
  '/hang.json': { hang: true }
};

var server, citibike;

before(function(done) {
  support.start(GBFS_ROUTES, function(s) {
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

describe('Citibike.get()', function() {
  it('should throw error if callback is not typeof function', function () {
    (function() {
      citibike.get(null, null, 'string');
    }).should.throwError('ERROR: Invalid callback function.');
  });

  it('should throw error if an invalid url is passed', function () {
    (function() {
      citibike.get(null, null, function() {});
    }).should.throwError('ERROR: Invalid URL called.');
  });

  it('should successfully complete a request to an absolute url', function (done) {
    citibike.get(server.base + '/gbfs/en/station_status.json', null, function(data) {
      should.exist(data);
      data.data.stations.should.not.be.empty();
      done();
    });
  });

  it('should resolve paths relative to restBase and append params', function (done) {
    citibike.get('/station_status.json', { a: 1 }, function(data) {
      data.data.stations.should.not.be.empty();
      server.requests.should.eql(['/gbfs/en/station_status.json?a=1']);
      done();
    });
  });

  it('should report invalid JSON as ok: false', function (done) {
    citibike.get(server.base + '/broken.json', function(data) {
      data.ok.should.equal(false);
      data.results.should.eql([]);
      data.error.should.match(/Invalid JSON/);
      done();
    });
  });

  it('should report non-2xx responses as ok: false', function (done) {
    citibike.get(server.base + '/missing.json', function(data) {
      data.ok.should.equal(false);
      data.error.should.match(/HTTP 503/);
      done();
    });
  });

  it('should report connection errors as ok: false', function (done) {
    // Port 1 on loopback: refused immediately, no external network involved.
    citibike.get('http://127.0.0.1:1/x.json', function(data) {
      data.ok.should.equal(false);
      data.error.should.be.type('string');
      done();
    });
  });

  it('should time out according to options.timeout', function (done) {
    var client = new Citibike({ timeout: 50 });
    client.get(server.base + '/hang.json', function(data) {
      data.ok.should.equal(false);
      data.error.should.match(/timed out/);
      done();
    });
  });
});

describe('Citibike.getStations()', function () {
  it('should join station_information and station_status', function (done) {
    citibike.getStations(null, function(data) {
      data.ok.should.equal(true);
      data.meta.should.eql([]);
      data.lastUpdate.should.equal(1761955230);
      data.totalStations.should.equal(2);
      data.activeStations.should.equal(1);

      data.results[0].should.eql({
        id: '66db237e-0aca-11e7-82f6-3863bb44ef7c',
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
        stationAddress: ''
      });
      data.results[1].status.should.equal('Not In Service');
      done();
    });
  });

  it('should only fetch station_status when updateOnly is set', function (done) {
    citibike.getStations({ updateOnly: true }, function(data) {
      data.ok.should.equal(true);
      data.totalStations.should.equal(3);
      data.activeStations.should.equal(2);
      should.not.exist(data.results[0].label);
      server.requests.should.eql(['/gbfs/en/station_status.json']);
      done();
    });
  });

  it('should accept the callback as the only argument', function (done) {
    citibike.getStations(function(data) {
      data.ok.should.equal(true);
      done();
    });
  });

  it('should pass through feed errors as ok: false', function (done) {
    var client = new Citibike({ restBase: server.base + '/nope' });
    client.getStations(null, function(data) {
      data.ok.should.equal(false);
      data.error.should.match(/HTTP 404/);
      done();
    });
  });

  it('should reject payloads that are not GBFS-shaped', function (done) {
    var client = new Citibike({ restBase: server.base, stationStatusURL: '/empty.json' });
    client.getStations(null, function(data) {
      data.ok.should.equal(false);
      data.error.should.match(/Unexpected station_status payload/);
      done();
    });
  });
});

['getBranches', 'getHelmets'].forEach(function(method) {
  describe('Citibike.' + method + '()', function () {
    it('should call back asynchronously with ok: false and no request', function (done) {
      var sync = true;
      citibike[method](null, function(data) {
        sync.should.equal(false);
        data.ok.should.equal(false);
        data.results.should.eql([]);
        data.error.should.match(/not available/);
        server.requests.should.eql([]);
        done();
      });
      sync = false;
    });

    it('should throw if callback is not a function', function () {
      (function() {
        citibike[method](null, 'nope');
      }).should.throwError('ERROR: Invalid callback function.');
    });
  });
});
