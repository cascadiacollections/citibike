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
          res.header['content-type'].should.eql('application/json');

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

          sampleResult.id.should.be.type('number');
          sampleResult.latitude.should.be.type('number');
          sampleResult.latitude.should.be.type('number');
          sampleResult.label.should.be.type('string');

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
          res.header['content-type'].should.eql('application/json');

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

          sampleResult.id.should.be.type('number');
          sampleResult.address.should.be.type('string');
          sampleResult.latitude.should.be.type('number');
          sampleResult.latitude.should.be.type('number');
          sampleResult.label.should.be.type('string');

          done();
        });
    });
});
