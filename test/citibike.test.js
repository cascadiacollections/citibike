/** Tests for HTTP GET requests
   Test Framework: Mocha (https://github.com/visionmedia/mocha)
   Assertions: Should (https://github.com/visionmedia/should.js/) */

var Citibike = require('..'),
    should = require('should');

var citibike;

beforeEach(function(){
  citibike = new Citibike();
});

describe('Citibike.get()', function() {
  it('should throw error if callback is not typeof function', function () {
    (function() {
      citibike.get(null, null, 'string');
    }).should.throwError('ERROR: Invalid callback function.');
  });

  it('should throw error if an invalid url is passed', function () {
    (function() {
      citibike.get(null, null, function(done) {
      });
    }).should.throwError('ERROR: Invalid URL called.');
  });

  it('should successfully complete a request', function (done) {
    var url=citibike.defaults.rest_base + citibike.defaults.helmet_url;

    citibike.get(url, null, function(data) {
      should.exist(data);
      should.exist(data.results);
      data.results.should.not.be.empty;
      done();
    });
  });
});

describe('Citibike.getStations()', function () {
    it('should successfully complete request', function (done) {
      citibike.getStations(null, function(data) {
        should.exist(data);
        data.results.should.not.be.empty;
        done();
      });
    });
});

describe('Citibike.getBranches()', function () {
    it('should successfully complete request', function (done) {
      citibike.getBranches(null, function(data) {
        should.exist(data);
        data.results.should.not.be.empty;
        done();
      });
    });
});

describe('Citibike.getHelmets()', function () {
    it('should successfully complete request', function (done) {
      citibike.getHelmets(null, function(data) {
        should.exist(data);
        data.results.should.not.be.empty;
        done();
      });
    });
});