/**
 * Tests for client construction and options.
 * Runner: node:test. Assertions: node:assert/strict.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Citibike = require('..');
const pkg = require('../package.json');

const defaults = {
  apiKey: null,

  headers: {
    'Accept': 'application/json',
    'User-Agent': 'node-citibike/' + pkg.version
  },

  timeout: 10000,
  cache: true,

  restBase: 'https://gbfs.citibikenyc.com/gbfs/en',
  stationInformationURL: '/station_information.json',
  stationStatusURL: '/station_status.json'
};

describe('Create citibike client', () => {
  describe('Correct Defaults', () => {
    it('should be created with correct defaults', () => {
      const citibike = new Citibike();
      assert.deepEqual(citibike.defaults, defaults);
      assert.deepEqual(citibike.options, defaults);
    });

    it('should work without new', () => {
      assert.ok(Citibike() instanceof Citibike);
    });

    it('should have correct GBFS endpoints as defaults', () => {
      const citibike = new Citibike();
      assert.equal(citibike.defaults.restBase, 'https://gbfs.citibikenyc.com/gbfs/en');
      assert.equal(citibike.defaults.stationInformationURL, '/station_information.json');
      assert.equal(citibike.defaults.stationStatusURL, '/station_status.json');
    });

    it('should let options override defaults and merge headers', () => {
      const citibike = new Citibike({
        apiKey: 'users_key',
        restBase: 'http://localhost:8080/gbfs',
        headers: { 'X-Test': '1' }
      });

      assert.equal(citibike.options.apiKey, 'users_key');
      assert.equal(citibike.options.restBase, 'http://localhost:8080/gbfs');
      assert.deepEqual(citibike.options.headers, {
        'Accept': 'application/json',
        'User-Agent': 'node-citibike/' + pkg.version,
        'X-Test': '1'
      });
      // defaults are not mutated
      assert.deepEqual(citibike.defaults, defaults);
    });

    it('should not share defaults or options between clients', () => {
      const a = new Citibike({ headers: { 'X-A': '1' } });
      const b = new Citibike();
      assert.notEqual(a.defaults, b.defaults);
      assert.notEqual(a.options.headers, a.defaults.headers);
      assert.equal(b.options.headers['X-A'], undefined);
    });
  });
});
