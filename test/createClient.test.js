"use strict";

var Citibike = require('..')
  , utils = require('../lib/utils')
  , assert = require('assert');

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

			rest_base: 				'http://appservices.citibikenyc.com/',
			helmet_url: 			'v1/helmet/list',
			branch_url: 			'v1/branch/list',
			stations_url: 			'data2/stations.php',
			stations_stream_url: 	'data2/stations.php?updateOnly=true',
		};

        var citibike = new Citibike;
      	assert.deepEqual(citibike.defaults, defaults);
    });

    it('should have correct API endpoints as defaults', function () {
		var citibike = new Citibike;
		assert.equal(citibike.defaults.rest_base, 'http://appservices.citibikenyc.com/');
		assert.equal(citibike.defaults.helmet_url, 'v1/helmet/list');
		assert.equal(citibike.defaults.branch_url, 'v1/branch/list');
		assert.equal(citibike.defaults.stations_url, 'data2/stations.php');
		assert.equal(citibike.defaults.stations_stream_url, 'data2/stations.php?updateOnly=true');
    });

    it('should merge options passed as parameter with defaults', function() {

		var defaults = {
			api_key: null,

			headers: {
				'Accept': '*/*',
				'Connection': 'close',
				'User-Agent': 'node-citibike/'
			},

			rest_base: 				'http://appservices.citibikenyc.com/',
			helmet_url: 			'v1/helmet/list',
			branch_url: 			'v1/branch/list',
			stations_url: 			'data2/stations.php',
			stations_stream_url: 	'data2/stations.php?updateOnly=true',

		},
    	options = {
    		api_key: 'users_key'
    	};

    	var citibike = new Citibike(options);
    	assert.deepEqual(citibike.options, utils.merge(defaults, options));
    });
  });
});