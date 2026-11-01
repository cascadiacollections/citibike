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

function start(routes, callback) {
  var server = http.createServer(function(req, res) {
    server.requests.push(req.url);
    var route = routes[req.url.split('?')[0]];
    if (!route) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('not found');
    }
    if (route.hang) return; // never respond; used for timeout tests
    res.writeHead(route.status || 200, { 'Content-Type': 'application/json' });
    res.end(route.body);
  });
  server.requests = [];
  server.listen(0, '127.0.0.1', function() {
    server.base = 'http://127.0.0.1:' + server.address().port;
    callback(server);
  });
  return server;
}

module.exports = { start: start, fixture: fixture };
