"use strict";

var citibike = require('..')
  , http = require('http')
  , utils = require('../lib/utils')
  , assert = require('assert');

/** Tests for Citibike Utility Functions */
describe('citibike.utils', function () {
  specify('.merge()', function () {
 	var options = {
		"key1": "value1",
		"key2": "value2"
	},
	defaults = {
		"key1": "default1",
		"key2": "default2",
		"key3": "default3"
	},
	result = {
		"key1": "value1",
		"key2": "value2",
		"key3": "default3"
	};
    assert.deepEqual(result, utils.merge(defaults, options));
  });
});

/** TEsts for Citibike Client */
describe('citibike', function () {
  specify('getStations()', function () {
    assert.equal(true, true);
  });

  specify('getBranches()', function () {
    assert.equal(true, true);
  });

  specify('getHelmets()', function () {
    assert.equal(true, true);
  });
});