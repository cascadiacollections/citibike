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

			restBase: 'http://appservices.citibikenyc.com/',
			helmetUrl: 'v1/helmet/list',
			branchUrl: 'v1/branch/list',
			stationsUrl: 'data2/stations.php',
			stationsStreamUrl: 'data2/stations.php?updateOnly=true'
		};

        var citibike = new Citibike();
        citibike.defaults.should.eql(defaults);
    });

    it('should have correct API endpoints as defaults', function () {
		var citibike = new Citibike();
		citibike.defaults.restBase.should.equal('http://appservices.citibikenyc.com/');
		citibike.defaults.helmetUrl.should.equal('v1/helmet/list');
		citibike.defaults.branchUrl.should.equal('v1/branch/list');
		citibike.defaults.stationsUrl.should.equal('data2/stations.php');
		citibike.defaults.stationsStreamUrl.should.equal('data2/stations.php?updateOnly=true');
    });

    it('should merge options passed as parameter with defaults', function() {

		var defaults = {
			apiKey: null,

			headers: {
				'Accept': '*/*',
				'Connection': 'close',
				'User-Agent': 'node-citibike/'
			},

			restBase: 'http://appservices.citibikenyc.com/',
			helmetUrl: 'v1/helmet/list',
			branchUrl: 'v1/branch/list',
			stationsUrl: 'data2/stations.php',
			stationsStreamUrl: 'data2/stations.php?updateOnly=true',

		},
      options = {
        apiKey: 'users_key'
      };

      var citibike = new Citibike(options);
      citibike.options.should.eql(utils.merge(defaults, options));
    });
  });
});