/** 
 * Tests for Citibike API
 * Ensure that Citibike does not dramatically change data we need to access in their API
 * Test Framework: Mocha (http://visionmedia.github.io/mocha/)
 * Assertions: Should (https://github.com/visionmedia/should.js/) 
 */

var Citibike = require('..'),
    should = require('should'),
    request = require('supertest');

var citibike;
request = request('http://appservices.citibikenyc.com');

beforeEach(function(){
  citibike = new Citibike();
});

describe('Citibike API - Branches', function () {
    it('responds with json and proper data', function (done) {
      request
        .get(citibike.defaults.branchesURL)
        .set('Accept', 'application/json')
        .expect(200)
        .end(function(err, res) {
          should.not.exist(err);

          // Headers
          res.header['content-type'].should.eql('application/json; charset=utf8');

          // Content
          /* Expected Response:
          {
            ok: true,
            meta: [ ],
            results: [
              {
              id: 1,
              latitude: 40.7086647301912,
              longitude: -74.0108752995729,
              label: "120 Broadway"
              },
            ],
            lastUpdate: 1367853737
          } */

          res.body.ok.should.eql(true);
          res.body.results.should.not.be.empty;

          var sampleResult = res.body.results[0];

          sampleResult.id.should.be.a('number');
          sampleResult.latitude.should.be.a('number');
          sampleResult.latitude.should.be.a('number');
          sampleResult.label.should.be.a('string');

          done();
        });
    });
});

describe('Citibike API - Helmets', function () {
    it('responds with json and proper data', function (done) {
      request
        .get(citibike.defaults.helmetsURL)
        .set('Accept', 'application/json')
        .expect(200)
        .end(function(err, res) {
          should.not.exist(err);

          // Headers
          res.header['content-type'].should.eql('application/json; charset=utf8');

          // Content
          /* Expected Response:
          {
            ok: true,
            meta: [ ],
            results: [
              {
                id: 5002,
                address: "571 Courtlandt Av",
                latitude: 40.8170769363642,
                longitude: -73.9193703979254,
                label: "Neighborhood Cycle, Inc."
              },
            ],
            lastUpdate: 1367853737
          } */

          res.body.ok.should.eql(true);
          res.body.results.should.not.be.empty;

          var sampleResult = res.body.results[0];

          sampleResult.id.should.be.a('number');       
          sampleResult.address.should.be.a('string');
          sampleResult.latitude.should.be.a('number');
          sampleResult.latitude.should.be.a('number');
          sampleResult.label.should.be.a('string');

          done();
        });
    });
});

describe('Citibike API - Stations', function () {
    it('responds with json and proper data', function (done) {
      request
        .get(citibike.defaults.stationsURL)
        .set('Accept', 'application/json')
        .expect(200)
        .end(function(err, res) {
          should.not.exist(err);

          // Headers
          res.header['content-type'].should.eql('application/json; charset=utf8');

          // Content
          /* Expected Response:
          {
            ok: true,
            meta: [ ],
            results: [
              {
                id: 72,
                status: "Active",
                latitude: 40.76727216,
                longitude: -73.99392888,
                label: "W 52 St & 11 Ave",
                stationAddress: "",
                availableBikes: 8,
                availableDocks: 26,
                nearbyStations: [
                  {
                  id: 480,
                  distance: 0.17780736685282
                  }
                ]
              } 
            ],
            lastUpdate: 1367853737
          } */

          res.body.ok.should.eql(true);
          res.body.results.should.not.be.empty;

          var sampleResult = res.body.results[0];

          sampleResult.id.should.be.a('number');
          sampleResult.status.should.be.a('string');
          sampleResult.latitude.should.be.a('number');
          sampleResult.latitude.should.be.a('number');
          sampleResult.label.should.be.a('string');
          sampleResult.stationAddress.should.be.a('string');
          sampleResult.availableBikes.should.be.a('number');
          sampleResult.availableDocks.should.be.a('number');
          sampleResult.nearbyStations.should.not.be.empty;
          sampleResult.nearbyStations[0].id.should.be.a('number');
          sampleResult.nearbyStations[0].distance.should.be.a('number');

          done();
        });
    });

    it('responds with json and only updated data', function (done) {
      request
        .get(citibike.defaults.stationsURL + '?updateOnly=true')
        .set('Accept', 'application/json')
        .expect(200)
        .end(function(err, res) {
          should.not.exist(err);

          // Headers
          res.header['content-type'].should.eql('application/json; charset=utf8');

          // Content
          /* Expected Response:
          {
            ok: true,
            meta: [ ],
            results: [
              {
                id: 72,
                status: "Active",
                availableBikes: 8,
                availableDocks: 26
              }
            ],
            lastUpdate: 1367853737
          } */

          res.body.ok.should.eql(true);
          res.body.results.should.not.be.empty;

          var sampleResult = res.body.results[0];

          sampleResult.id.should.be.a('number');
          sampleResult.status.should.be.a('string');
          sampleResult.availableBikes.should.be.a('number');
          sampleResult.availableDocks.should.be.a('number');
          should.not.exist(sampleResult.latitude);

          done();
        });
    });
});