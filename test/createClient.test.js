/**
 * Tests for client construction and options
 * Test Framework: Mocha (https://mochajs.org/)
 * Assertions: Should (https://github.com/shouldjs/should.js)
 */

var Citibike = require('..');
var pkg = require('../package.json');
var should = require('should');

var defaults = {
  apiKey: null,

  headers: {
    'Accept': 'application/json',
    'User-Agent': 'node-citibike/' + pkg.version
  },

  timeout: 10000,

  restBase: 'https://gbfs.citibikenyc.com/gbfs/en',
  stationInformationURL: '/station_information.json',
  stationStatusURL: '/station_status.json'
};

describe('Create citibike client', function () {
  describe('Correct Defaults', function () {
    it('should be created with correct defaults', function () {
      var citibike = new Citibike();
      citibike.defaults.should.eql(defaults);
      citibike.options.should.eql(defaults);
    });

    it('should work without new', function () {
      Citibike().should.be.instanceof(Citibike);
    });

    it('should have correct GBFS endpoints as defaults', function () {
      var citibike = new Citibike();
      citibike.defaults.restBase.should.equal('https://gbfs.citibikenyc.com/gbfs/en');
      citibike.defaults.stationInformationURL.should.equal('/station_information.json');
      citibike.defaults.stationStatusURL.should.equal('/station_status.json');
    });

    it('should let options override defaults and merge headers', function() {
      var citibike = new Citibike({
        apiKey: 'users_key',
        restBase: 'http://localhost:8080/gbfs',
        headers: { 'X-Test': '1' }
      });

      citibike.options.apiKey.should.equal('users_key');
      citibike.options.restBase.should.equal('http://localhost:8080/gbfs');
      citibike.options.headers.should.eql({
        'Accept': 'application/json',
        'User-Agent': 'node-citibike/' + pkg.version,
        'X-Test': '1'
      });
      // defaults are not mutated
      citibike.defaults.should.eql(defaults);
    });
  });
});
