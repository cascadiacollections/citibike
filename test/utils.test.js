"use strict";

var Citibike = require('..')
  , utils = require('../lib/utils')
  , assert = require('assert');

/** Tests for Citibike Utility Functions */
describe('Citibike.utils', function () {
  describe('.merge()', function () {
  	it('should return an object with the second object\'s values merged with the first.');
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