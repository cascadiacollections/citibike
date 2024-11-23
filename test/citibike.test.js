/**
 * Tests for HTTP GET requests
 * Test Framework: Mocha (http://visionmedia.github.io/mocha/)
 * Assertions: Should (https://github.com/visionmedia/should.js/)
 */
var Citibike = require('..'),
    should = require('should');

var citibike;

beforeEach(function(){
  citibike = new Citibike;
});

describe('Citibike.get()', function() {
  it('should successfully complete a request', function (done) {
    var url = citibike.defaults.restBase + citibike.defaults.helmetsURL;

    citibike.get(url, null, function(data) {
      should.exist(data);
      should.exist(data.results);
      data.results.should.not.be.empty;
      done();
    });
  });
});
