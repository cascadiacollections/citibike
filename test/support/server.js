/**
 * Local HTTP server that serves recorded GBFS fixtures so tests never hit
 * the network. Routes map a request path to a status code and body.
 */
var http = require('http')
  , fs = require('fs')
  , path = require('path');

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'fixtures', name), 'utf8');
}

/**
 * Starts the server on a free loopback port. Resolves with the server, which
 * has `base` (its URL) and `requests` (every request URL so far, in order).
 */
function start(routes) {
  var server = http.createServer(function(req, res) {
    server.requests.push(req.url);
    var route = routes[req.url.split('?')[0]];
    if (!route) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('not found');
    }
    if (route.hang) return; // never respond; used for timeout tests
    res.writeHead(route.status || 200, { 'Content-Type': 'application/json' });
    if (route.drop) {
      // send part of the body, then kill the socket mid-response
      res.write(route.drop);
      return setTimeout(function() { res.socket.destroy(); }, 10);
    }
    res.end(typeof route.body === 'function' ? route.body() : route.body);
  });
  server.requests = [];
  return new Promise(function(resolve, reject) {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', function() {
      server.base = 'http://127.0.0.1:' + server.address().port;
      resolve(server);
    });
  });
}

/** Drops every open connection (hung requests included) and closes the server. */
function stop(server) {
  return new Promise(function(resolve) {
    server.closeAllConnections();
    server.close(function() { resolve(); });
  });
}

/** Resolves with the single value a 2.x-style method passes to its callback. */
function called(invoke) {
  return new Promise(function(resolve) { invoke(resolve); });
}

/** Resolves with the error `promise` rejects with; rejects if it fulfils. */
function rejected(promise) {
  return promise.then(function() {
    throw new Error('expected the promise to reject');
  }, function(error) {
    return error;
  });
}

/**
 * Builds a made-up system of `count` stations scattered over a Manhattan-sized
 * box, as a pair of GBFS feed bodies. Deterministic: same count, same stations.
 */
function city(count) {
  var seed = 42;
  function random() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  }
  var information = [], status = [];
  for (var i = 0; i < count; i++) {
    var id = 'station-' + i;
    information.push({
      station_id: id,
      name: 'Station ' + i,
      short_name: String(1000 + i) + '.01',
      lat: 40.70 + random() * 0.12,
      lon: -74.02 + random() * 0.10,
      region_id: '71',
      capacity: 30
    });
    status.push({
      station_id: id,
      legacy_id: String(100 + i),
      num_bikes_available: i % 7,
      num_ebikes_available: i % 7 === 6 ? 2 : 0,
      num_docks_available: i % 5,
      num_bikes_disabled: 0,
      num_docks_disabled: 0,
      is_installed: 1,
      is_renting: i % 11 === 0 ? 0 : 1,
      is_returning: 1,
      last_reported: 1761955000 + i
    });
  }
  function feed(stations) {
    return JSON.stringify({ last_updated: 1761955230, ttl: 60, version: '1.1', data: { stations: stations } });
  }
  return { information: feed(information), status: feed(status) };
}

module.exports = { start: start, stop: stop, fixture: fixture, city: city, called: called, rejected: rejected };
