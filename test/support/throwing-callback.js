/**
 * Run as a child process by compat.test.js: a 2.x-style callback throws, and
 * this prints how the runtime reported it. A test runner installs its own
 * handlers for uncaught errors, so the only place to see what an application
 * would see is a process without one.
 */
var Citibike = require('../..');

var client = new Citibike({
  fetch: function() {
    return Promise.resolve(new Response(JSON.stringify({ last_updated: 1, ttl: 60, data: { stations: [] } })));
  }
});

process.on('uncaughtException', function(error) {
  console.log('uncaughtException: ' + error.message);
});
process.on('unhandledRejection', function(reason) {
  console.log('unhandledRejection: ' + (reason && reason.message));
});

client.getStations(function() {
  throw new Error('from the callback');
});
