/** 
 * Tests for HTTP GET requests
 * Test Framework: Mocha (http://visionmedia.github.io/mocha/)
 * Assertions: Should (https://github.com/visionmedia/should.js/) 
 */
 
var Citibike = require('..'),
    utils = require('../lib/utils'),
    should = require('should');

describe('Citibike.utils', function () {
  describe('.merge()', function () {
    it('should return an object with the second object\'s values merged with the first.', function() {

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

    result.should.eql(utils.merge(defaults, options));
    
    });
  });
});