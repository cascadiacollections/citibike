var request = require('supertest');

/**
 * Tests for Citibike's REST API
 * TODO: this
 */
request = request('http://appservices.citibikenyc.com');

describe('GET /users', function(){
  it('respond with json', function(done){
    request(app)
      .get('/user')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200, done);
  })
})

// GET Helmets JSON
request.get('/v1/helmet/list').expect(200, function(err) {
	console.log(err);
});

// GET Branches JSON
request.get('/v1/branch/list').expect(200, function(err) {
	console.log(err);
});

// GET Stations JSON
request.get('/data2/stations.php').expect(200, function(err) {
	console.log(err);
});