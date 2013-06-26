var Citibike = require('..');
var utils = require('../lib/utils');
var should = require ('should');

/** Tests for Citibike Client Creation */
describe('Create citibike client', function () {
  describe('Correct Defaults', function () {
    it('should be created with correct defaults', function () {

		var defaults = {
			api_key: null,

			headers: {
				'Accept': '*/*',
				'Connection': 'close',
				'User-Agent': 'node-citibike/'
			},

			rest_base: 'http://appservices.citibikenyc.com/',
			helmet_url: 'v1/helmet/list',
			branch_url: 'v1/branch/list',
			stations_url: 'data2/stations.php',
			stations_stream_url: 'data2/stations.php?updateOnly=true'
		};

        var citibike = new Citibike();
        citibike.defaults.should.eql(defaults);
    });

    it('should have correct API endpoints as defaults', function () {
		var citibike = new Citibike();
		citibike.defaults.rest_base.should.equal('http://appservices.citibikenyc.com/');
		citibike.defaults.helmet_url.should.equal('v1/helmet/list');
		citibike.defaults.branch_url.should.equal('v1/branch/list');
		citibike.defaults.stations_url.should.equal('data2/stations.php');
		citibike.defaults.stations_stream_url.should.equal('data2/stations.php?updateOnly=true');
    });

    it('should merge options passed as parameter with defaults', function() {

		var defaults = {
			api_key: null,

			headers: {
				'Accept': '*/*',
				'Connection': 'close',
				'User-Agent': 'node-citibike/'
			},

			rest_base: 'http://appservices.citibikenyc.com/',
			helmet_url: 'v1/helmet/list',
			branch_url: 'v1/branch/list',
			stations_url: 'data2/stations.php',
			stations_stream_url: 'data2/stations.php?updateOnly=true',

		},
      options = {
        api_key: 'users_key'
      };

      var citibike = new Citibike(options);
      citibike.options.should.eql(utils.merge(defaults, options));
    });
  });
});