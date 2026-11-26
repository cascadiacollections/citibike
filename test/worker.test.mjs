/**
 * Tests for the Cloudflare Worker in worker/src/index.js, which caches a
 * compact copy of station_status for the landing page. The Worker takes its
 * cache and its fetch as arguments, so both are faked here with Node built-ins.
 * Runner: node:test. Assertions: node:assert/strict.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker, { handle, compactStatus, PAGES_ORIGIN } from '../worker/src/index.js';

const UPSTREAM = 'https://gbfs.citibikenyc.com/gbfs/en/station_status.json';
const HOST = 'https://citibike-status.example';

const FEED = {
  last_updated: 1761955230,
  ttl: 60,
  data: { stations: [
    { station_id: 'u-20', legacy_id: '20', num_bikes_available: 1, num_ebikes_available: 0, num_docks_available: 3, is_installed: 1, is_renting: 1 },
    { station_id: 'u-3', legacy_id: '3', num_bikes_available: 4, num_ebikes_available: 2, num_docks_available: 5, is_installed: 0, is_renting: 1 }
  ] }
};
const COMPACT = { t: 1761955230, ttl: 60, s: [[3, 4, 2, 5, 0], [20, 1, 0, 3, 1]] };

/** The Cache API, as far as the Worker uses it. */
function memoryCache() {
  const store = new Map();
  return {
    store: store,
    match: async (request) => {
      const hit = store.get(request.url);
      return hit ? hit.clone() : undefined;
    },
    put: async (request, response) => {
      store.set(request.url, response);
    }
  };
}

/** One Worker "isolate": a cache, an upstream that can be swapped, and logs. */
function harness(t, upstream) {
  const cache = memoryCache();
  const calls = [];
  const state = {
    cache: cache,
    calls: calls,
    upstream: upstream || (() => new Response(JSON.stringify(FEED), { headers: { 'content-type': 'application/json' } })),
    info: t.mock.method(console, 'log', () => {}),
    errors: t.mock.method(console, 'error', () => {}),
    async request(path, init) {
      const pending = [];
      const response = await handle(new Request(HOST + path, init), { waitUntil: (p) => pending.push(p) }, {
        cache: cache,
        fetch: async (url, options) => {
          calls.push([url, options]);
          return state.upstream();
        }
      });
      await Promise.all(pending);
      return response;
    },
    logged(mock) {
      return mock.mock.calls.map((call) => JSON.parse(call.arguments[0]));
    }
  };
  return state;
}

function assertCors(response) {
  assert.equal(response.headers.get('access-control-allow-origin'), PAGES_ORIGIN);
  assert.equal(response.headers.get('access-control-allow-methods'), 'GET, HEAD, OPTIONS');
  assert.equal(response.headers.get('access-control-max-age'), '86400');
  assert.equal(response.headers.get('vary'), 'Origin');
}

async function assertFailure(response, error) {
  assert.equal(response.status, 502);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assertCors(response);
  assert.deepEqual(await response.json(), { ok: false, error: error });
}

describe('compactStatus()', () => {
  it('should build [id, bikes, ebikes, docks, active] rows sorted by id', () => {
    assert.deepEqual(compactStatus(FEED), COMPACT);
  });

  it('should use the numeric legacy id, or the station id when there is none', () => {
    const compact = compactStatus({ last_updated: 5, data: { stations: [
      { station_id: 'zeta' },
      { station_id: 'x', legacy_id: 100 },
      { station_id: 'alpha', legacy_id: 'not-a-number' },
      { station_id: 'y', legacy_id: '9' },
      { station_id: 'alpha2', legacy_id: '' }
    ] } });
    // Numbers first, in order; then strings.
    assert.deepEqual(compact.s.map((row) => row[0]), [9, 100, 'alpha', 'alpha2', 'zeta']);
  });

  it('should write whole numbers for counts and 0 for missing ones', () => {
    const compact = compactStatus({ data: { stations: [
      { station_id: 'a', num_bikes_available: 2.7, num_docks_available: '4' }
    ] } });
    assert.deepEqual(compact, { t: 0, ttl: 60, s: [['a', 2, 0, 4, 0]] });
  });

  it('should mark a station active only when installed and renting', () => {
    const flags = [[1, 1], [true, true], [1, 0], [0, 1], [undefined, undefined]];
    const compact = compactStatus({ data: { stations: flags.map((f, i) => {
      return { station_id: 's', legacy_id: String(i), is_installed: f[0], is_renting: f[1] };
    }) } });
    assert.deepEqual(compact.s.map((row) => row[4]), [1, 1, 0, 0, 0]);
  });

  it('should skip empty entries and entries without an id, and keep the last duplicate', () => {
    const compact = compactStatus({ data: { stations: [
      null,
      { num_bikes_available: 9 },
      { station_id: '' },
      { station_id: 'dup', num_bikes_available: 1 },
      { station_id: 'dup', num_bikes_available: 2 },
      { station_id: 'one', legacy_id: '7', num_bikes_available: 1 },
      { station_id: 'two', legacy_id: 7, num_bikes_available: 3 }
    ] } });
    assert.deepEqual(compact.s, [[7, 3, 0, 0, 0], ['dup', 2, 0, 0, 0]]);
  });

  it('should throw for anything that is not a station_status feed', () => {
    [null, undefined, 'feed', {}, { data: null }, { data: {} }, { data: { stations: {} } }].forEach((feed) => {
      assert.throws(() => compactStatus(feed), { message: 'Unexpected station_status payload' });
    });
  });
});

describe('handle()', () => {
  let worker;

  beforeEach((t) => {
    worker = harness(t);
  });

  describe('routing', () => {
    it('should answer OPTIONS with CORS headers and no upstream request', async () => {
      const response = await worker.request('/station_status', { method: 'OPTIONS' });
      assert.equal(response.status, 204);
      assert.equal(response.body, null);
      assert.equal(response.headers.get('cache-control'), 'public, max-age=86400');
      assertCors(response);
      assert.equal(worker.calls.length, 0);
    });

    it('should answer OPTIONS on any path', async () => {
      assert.equal((await worker.request('/anything', { method: 'OPTIONS' })).status, 204);
    });

    it('should refuse methods other than GET and HEAD with 405', async () => {
      for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
        const response = await worker.request('/station_status', { method: method });
        assert.equal(response.status, 405, method);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assertCors(response);
        assert.deepEqual(await response.json(), { ok: false, error: 'method not allowed' });
      }
      assert.equal(worker.calls.length, 0);
    });

    it('should answer 404 for any other path without touching upstream', async () => {
      for (const path of ['/anything-else', '/station_status/', '/station_status.json', '/gbfs/en/station_status.json']) {
        const response = await worker.request(path);
        assert.equal(response.status, 404, path);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assertCors(response);
        assert.deepEqual(await response.json(), { ok: false, error: 'not found' });
      }
      assert.equal(worker.calls.length, 0);
      assert.equal(worker.cache.store.size, 0);
    });

    it('should never reflect the request Origin', async () => {
      const response = await worker.request('/station_status', { headers: { Origin: 'https://evil.example' } });
      assert.equal(response.headers.get('access-control-allow-origin'), 'https://cascadiacollections.github.io');
    });
  });

  describe('cache miss', () => {
    it('should fetch upstream once and answer with the compact feed', async () => {
      const response = await worker.request('/station_status');
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
      assert.equal(response.headers.get('cache-control'), 'public, max-age=60');
      assertCors(response);
      assert.deepEqual(await response.json(), COMPACT);

      assert.deepEqual(worker.calls, [[UPSTREAM, {
        headers: { Accept: 'application/json', 'User-Agent': 'citibike-status-worker' }
      }]]);
      assert.deepEqual(worker.logged(worker.info), [{ message: 'station_status', cache: 'miss', stations: 2, t: 1761955230 }]);
      assert.equal(worker.errors.mock.callCount(), 0);
    });

    it('should store the response under one key, whatever the path or query', async () => {
      await worker.request('/?utm=1');
      assert.deepEqual(Array.from(worker.cache.store.keys()), [HOST + '/station_status']);
      const stored = worker.cache.store.get(HOST + '/station_status');
      assert.equal(stored.status, 200);
      assert.deepEqual(await stored.clone().json(), COMPACT);
    });

    it('should answer HEAD with the headers and no body, and still fill the cache', async () => {
      const response = await worker.request('/station_status', { method: 'HEAD' });
      assert.equal(response.status, 200);
      assert.equal(response.body, null);
      assert.equal(response.headers.get('cache-control'), 'public, max-age=60');
      assertCors(response);
      assert.equal(worker.cache.store.size, 1);

      assert.deepEqual(await (await worker.request('/station_status')).json(), COMPACT);
      assert.equal(worker.calls.length, 1);
    });
  });

  describe('cache hit', () => {
    it('should replay the stored response without another upstream request', async () => {
      await worker.request('/station_status');
      worker.upstream = () => { throw new Error('upstream must not be called on a hit'); };

      for (const path of ['/station_status', '/', '/station_status?cachebust=1']) {
        const response = await worker.request(path);
        assert.equal(response.status, 200, path);
        assert.equal(response.headers.get('cache-control'), 'public, max-age=60');
        assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
        assertCors(response);
        assert.deepEqual(await response.json(), COMPACT);
      }
      assert.equal(worker.calls.length, 1);
      assert.deepEqual(worker.logged(worker.info).slice(1), [
        { message: 'station_status', cache: 'hit' },
        { message: 'station_status', cache: 'hit' },
        { message: 'station_status', cache: 'hit' }
      ]);
    });

    it('should answer HEAD from the cache with no body', async () => {
      await worker.request('/station_status');
      const response = await worker.request('/station_status', { method: 'HEAD' });
      assert.equal(response.status, 200);
      assert.equal(response.body, null);
      assert.equal(response.headers.get('cache-control'), 'public, max-age=60');
      assert.equal(worker.calls.length, 1);
    });

    it('should keep separate caches per host', async () => {
      await worker.request('/station_status');
      const pending = [];
      await handle(new Request('https://other.example/station_status'), { waitUntil: (p) => pending.push(p) }, {
        cache: worker.cache,
        fetch: async () => new Response(JSON.stringify(FEED))
      });
      await Promise.all(pending);
      assert.deepEqual(Array.from(worker.cache.store.keys()), [HOST + '/station_status', 'https://other.example/station_status']);
    });
  });

  describe('upstream failures', () => {
    async function assertNotCached() {
      assert.equal(worker.cache.store.size, 0);
      worker.upstream = () => new Response(JSON.stringify(FEED));
      const retry = await worker.request('/station_status');
      assert.equal(retry.status, 200);
      assert.deepEqual(await retry.json(), COMPACT);
    }

    it('should answer 502 when the upstream request throws', async () => {
      worker.upstream = () => { throw new Error('connect ECONNREFUSED'); };
      await assertFailure(await worker.request('/station_status'), 'upstream unavailable');
      assert.deepEqual(worker.logged(worker.errors), [{ message: 'upstream failed', error: 'connect ECONNREFUSED' }]);
      await assertNotCached();
    });

    it('should log whatever was thrown, even if it is not an Error', async () => {
      worker.upstream = () => { throw 'offline'; };
      await assertFailure(await worker.request('/station_status'), 'upstream unavailable');
      assert.deepEqual(worker.logged(worker.errors), [{ message: 'upstream failed', error: 'offline' }]);
    });

    it('should answer 502 with the upstream status, and drop its body', async () => {
      let cancelled = 0;
      const upstream = new Response('service unavailable', { status: 503 });
      const cancel = upstream.body.cancel.bind(upstream.body);
      upstream.body.cancel = () => { cancelled++; return cancel(); };
      worker.upstream = () => upstream;

      await assertFailure(await worker.request('/station_status'), 'upstream HTTP 503');
      assert.equal(cancelled, 1);
      assert.deepEqual(worker.logged(worker.errors), [{ message: 'upstream status', status: 503 }]);
      await assertNotCached();
    });

    it('should cope with an upstream error that has no body, or whose body will not cancel', async () => {
      worker.upstream = () => new Response(null, { status: 500 });
      await assertFailure(await worker.request('/station_status'), 'upstream HTTP 500');

      worker.upstream = () => ({ ok: false, status: 429, body: { cancel: () => { throw new Error('locked'); } } });
      await assertFailure(await worker.request('/station_status'), 'upstream HTTP 429');

      worker.upstream = () => ({ ok: false, status: 404, body: {} });
      await assertFailure(await worker.request('/station_status'), 'upstream HTTP 404');
    });

    it('should refuse a body declared larger than 5 MB without reading it', async () => {
      let cancelled = 0;
      let read = 0;
      const declared = String(5 * 1024 * 1024 + 1);
      worker.upstream = () => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': declared }),
        body: { cancel: () => { cancelled++; } },
        text: async () => { read++; return '{}'; }
      });
      await assertFailure(await worker.request('/station_status'), 'upstream payload too large');
      assert.equal(cancelled, 1);
      assert.equal(read, 0);
      assert.deepEqual(worker.logged(worker.errors), [{ message: 'upstream too large', bytes: 5 * 1024 * 1024 + 1 }]);

      worker.upstream = () => ({ ok: true, status: 200, headers: new Headers({ 'content-length': declared }), body: null });
      await assertFailure(await worker.request('/station_status'), 'upstream payload too large');
      await assertNotCached();
    });

    it('should accept a body declared at exactly 5 MB', async () => {
      worker.upstream = () => new Response(JSON.stringify(FEED), { headers: { 'content-length': String(5 * 1024 * 1024) } });
      assert.equal((await worker.request('/station_status')).status, 200);
    });

    it('should refuse a body that turns out larger than 5 MB', async () => {
      worker.upstream = () => new Response(' '.repeat(5 * 1024 * 1024 + 1));
      await assertFailure(await worker.request('/station_status'), 'upstream payload too large');
      await assertNotCached();
    });

    it('should answer 502 when the body cannot be read', async () => {
      worker.upstream = () => ({ ok: true, status: 200, headers: new Headers(), text: async () => { throw new Error('terminated'); } });
      await assertFailure(await worker.request('/station_status'), 'upstream read failed');
      assert.deepEqual(worker.logged(worker.errors), [{ message: 'upstream read failed', error: 'terminated' }]);

      worker.upstream = () => ({ ok: true, status: 200, headers: new Headers(), text: async () => { throw 'reset'; } });
      await assertFailure(await worker.request('/station_status'), 'upstream read failed');
      assert.deepEqual(worker.logged(worker.errors)[1], { message: 'upstream read failed', error: 'reset' });
      await assertNotCached();
    });

    it('should answer 502 for a body that is not JSON', async () => {
      worker.upstream = () => new Response('<html>maintenance</html>');
      await assertFailure(await worker.request('/station_status'), 'unexpected station_status payload');
      const logged = worker.logged(worker.errors);
      assert.equal(logged.length, 1);
      assert.equal(logged[0].message, 'upstream parse failed');
      assert.equal(typeof logged[0].error, 'string');
      await assertNotCached();
    });

    it('should answer 502 for JSON that is not a station_status feed', async () => {
      worker.upstream = () => new Response(JSON.stringify({ data: { bikes: [] } }));
      await assertFailure(await worker.request('/station_status'), 'unexpected station_status payload');
      assert.deepEqual(worker.logged(worker.errors), [{ message: 'upstream parse failed', error: 'Unexpected station_status payload' }]);
      await assertNotCached();
    });

    it('should answer HEAD with 502 too', async () => {
      worker.upstream = () => new Response('nope', { status: 503 });
      const response = await worker.request('/station_status', { method: 'HEAD' });
      assert.equal(response.status, 502);
    });
  });
});

describe('the Worker entry point', () => {
  it('should serve from caches.default and the global fetch', async (t) => {
    const cache = memoryCache();
    const fetched = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(FEED)));
    t.mock.method(console, 'log', () => {});
    globalThis.caches = { default: cache };
    t.after(() => { delete globalThis.caches; });

    const pending = [];
    const ctx = { waitUntil: (p) => pending.push(p) };
    const first = await worker.fetch(new Request(HOST + '/station_status'), {}, ctx);
    await Promise.all(pending);
    const second = await worker.fetch(new Request(HOST + '/'), {}, ctx);

    assert.deepEqual(await first.json(), COMPACT);
    assert.deepEqual(await second.json(), COMPACT);
    assert.equal(fetched.mock.callCount(), 1);
    assert.equal(fetched.mock.calls[0].arguments[0], UPSTREAM);
    assert.equal(cache.store.size, 1);
  });
});
