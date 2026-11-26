/**
 * The package is CommonJS; this checks that it also loads from an ES module,
 * with both the default export and the named exports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Citibike, { Citibike as Named, CitibikeError, distance } from 'citibike';

describe('ES module import', () => {
  it('should expose the default and named exports', () => {
    assert.equal(typeof Citibike, 'function');
    assert.equal(Named, Citibike);
    assert.ok(new Citibike() instanceof Citibike);
    assert.ok(new CitibikeError('EHTTP', 'x') instanceof Error);
    assert.equal(distance({ latitude: 1, longitude: 1 }, { latitude: 1, longitude: 1 }), 0);
  });
});
