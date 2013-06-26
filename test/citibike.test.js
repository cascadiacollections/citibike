
// "use strict";

var Citibike = require('..'),
    should = require('should');

var citibike;

beforeEach(function(){
  citibike = new Citibike();
});

describe('Citibike.get()', function() {
  it('should throw error if callback is not typeof function', function () {
    (function() {
      citibike.get(null, null, 'string')
    }).should.throwError('ERROR: Invalid callback function.');


    /*
    it('should successfully complete request', function (done) {
      citibike.get(null, null, function(data) {
        done();
      });
    }); */
  });
});
/*
describe('Citibike.getStations()', function () {
  specify('HTTP GET request', function (done) {
    it('should successfully complete request', function (done) {
      citibike.getStations(null, function(data) {
        done();
      });
    });
  });
});

describe('Citibike.getBranches()', function () {
  specify('HTTP GET request', function (done) {
    it('should successfully complete request', function (done) {
      citibike.getBranches(null, function(data) {
        done();
      });
    });
  });
});

describe('Citibike.getHelmets()', function () {
  specify('HTTP GET request', function (done) {
    it('should successfully complete request', function (done) {
      citibike.getHelmets(null, function(data) {
        done();
      });
    });
  });
});
*/