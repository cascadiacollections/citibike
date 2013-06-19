/*
"use strict";

var Citibike = require('..')
  , assert = require('assert');

beforeEach(function(done){
  var citibike = new Citibike();
})

describe('Citibike.get()', function() {
  specify('HTTP GET request', function (done) {
    it('should throw error if callback is not typeof function', function () {
      assert.throws(
        function () { 
            citibike.get(null, null, 'string'); 
        }
      );
    });

    it('should successfully complete request', function (done) {
      citibike.get(null, null, function(data) {
        done();
      });
    });
  });
});

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