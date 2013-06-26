/** Tests for Citibike Client Creation
   Test Framework: Mocha (http://visionmedia.github.io/mocha/)
   Assertions: Should (https://github.com/visionmedia/should.js/) */


var Citibike = require('..');
var utils = require('../lib/utils');
var should = require ('should');

describe('Create citibike client', function () {
  describe('Correct Defaults', function () {
    it('should be created with correct defaults', function () {

		var defaults = {
			apiKey: null,

			headers: {
				'Accept': '*/*',
				'Connection': 'close',
				'User-Agent': 'node-citibike/'
			},

			restBase: 'http://appservices.citibikenyc.com',
			helmetsURL: '/v1/helmet/list',
			branchesURL: '/v1/branch/list',
			stationsURL: '/data2/stations.php',
			stationsStreamURL: '/data2/stations.php?updateOnly=true'
		};

        var citibike = new Citibike();
        citibike.defaults.should.eql(defaults);
    });

    it('should have correct API endpoints as defaults', function () {
		var citibike = new Citibike();
		citibike.defaults.restBase.should.equal('http://appservices.citibikenyc.com');
		citibike.defaults.helmetsURL.should.equal('/v1/helmet/list');
		citibike.defaults.branchesURL.should.equal('/v1/branch/list');
		citibike.defaults.stationsURL.should.equal('/data2/stations.php');
		citibike.defaults.stationsStreamURL.should.equal('/data2/stations.php?updateOnly=true');
    });

    it('should merge options passed as parameter with defaults', function() {

		var defaults = {
			apiKey: null,

			headers: {
				'Accept': '*/*',
				'Connection': 'close',
				'User-Agent': 'node-citibike/'
			},

			restBase: 'http://appservices.citibikenyc.com',
			helmetsURL: '/v1/helmet/list',
			branchesURL: '/v1/branch/list',
			stationsURL: '/data2/stations.php',
			stationsStreamURL: '/data2/stations.php?updateOnly=true'

		},
      options = {
        apiKey: 'users_key'
      };

      var citibike = new Citibike(options);
      citibike.options.should.eql(utils.merge(defaults, options));
    });
  });
});