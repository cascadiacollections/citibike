/**
 * Edge cases of the feeds themselves: sparse or odd station entries, cache
 * expiry, and transport failures that a real server cannot produce on demand.
 * These inject `options.fetch`, so no server is involved at all.
 * Runner: node:test. Assertions: node:assert/strict.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Citibike = require('..');
const support = require('./support/server');

const called = support.called;
const rejected = support.rejected;

const BASE = 'https://feeds.test/gbfs/en';

function feed(stations, extra) {
  return Object.assign({ last_updated: 1761955230, ttl: 60, version: '2.3', data: { stations: stations } }, extra);
}

/**
 * A client whose fetch answers from `bodies`, a map of feed file name to
 * value (JSON-encoded unless it is already a string). `client.calls` lists
 * every `[url, init]` it was asked for.
 */
function clientFor(bodies, options) {
  const calls = [];
  const client = new Citibike(Object.assign({
    restBase: BASE,
    fetch: (url, init) => {
      calls.push([url, init]);
      const name = url.slice(BASE.length + 1);
      if (!(name in bodies)) return Promise.resolve(new Response('not found', { status: 404 }));
      const body = bodies[name];
      return Promise.resolve(new Response(typeof body === 'string' ? body : JSON.stringify(body)));
    }
  }, options));
  client.calls = calls;
  return client;
}

const FULL_INFO = { station_id: 'full', name: 'Full', short_name: 'F.01', lat: 40.7, lon: -74, capacity: 20, region_id: '71', address: '1 Main St' };
const FULL_STATUS = {
  station_id: 'full', legacy_id: '10', num_bikes_available: 5, num_ebikes_available: 2, num_docks_available: 15,
  num_bikes_disabled: 1, num_docks_disabled: 2, is_installed: 1, is_renting: 1, is_returning: 1, last_reported: 100
};

describe('sparse station feeds', () => {
  it('should fill in nulls and zeroes for fields a station does not report', async () => {
    const client = clientFor({
      'station_information.json': feed([{ station_id: 'bare', name: 'Bare', lat: 40.7, lon: -74 }]),
      'station_status.json': feed([{ station_id: 'bare' }])
    });
    assert.deepEqual(await client.stations(), [{
      id: 'bare',
      legacyId: null,
      name: 'Bare',
      shortName: null,
      latitude: 40.7,
      longitude: -74,
      capacity: null,
      regionId: null,
      bikesAvailable: 0,
      ebikesAvailable: 0,
      classicBikesAvailable: 0,
      docksAvailable: 0,
      bikesDisabled: 0,
      docksDisabled: 0,
      isInstalled: false,
      isRenting: false,
      isReturning: false,
      lastReported: null
    }]);
  });

  it('should leave out stations that appear in only one feed', async () => {
    const client = clientFor({
      'station_information.json': feed([FULL_INFO, { station_id: 'info-only', name: 'Info only', lat: 40.71, lon: -74 }]),
      'station_status.json': feed([FULL_STATUS, { station_id: 'status-only', num_bikes_available: 3 }])
    });
    const stations = await client.stations();
    assert.deepEqual(stations.map((s) => s.id), ['full']);
    assert.equal(stations[0].legacyId, 10);
    assert.equal(stations[0].classicBikesAvailable, 3);

    const legacy = await called((cb) => client.getStations(null, cb));
    assert.equal(legacy.totalStations, 1);
    assert.deepEqual(legacy.results.map((s) => s.stationId), ['full']);
    assert.equal(legacy.results[0].stationAddress, '1 Main St');
    assert.deepEqual(legacy.results[0].nearbyStations, []);
  });

  it('should never report a negative classic bike count', async () => {
    const client = clientFor({
      'station_information.json': feed([FULL_INFO]),
      'station_status.json': feed([Object.assign({}, FULL_STATUS, { num_bikes_available: 1, num_ebikes_available: 4 })])
    });
    assert.equal((await client.stations())[0].classicBikesAvailable, 0);
  });

  it('should only treat an all-digit legacy_id as a legacy id', async () => {
    const client = clientFor({
      'station_information.json': feed([FULL_INFO, { station_id: 'other', name: 'Other', lat: 40.71, lon: -74 }]),
      'station_status.json': feed([
        Object.assign({}, FULL_STATUS, { legacy_id: 'abc-1' }),
        { station_id: 'other', legacy_id: 7, is_installed: true, is_renting: true }
      ])
    });
    const stations = await client.stations();
    assert.equal(stations[0].legacyId, null);
    assert.equal(stations[1].legacyId, 7);
    assert.equal((await client.station(7)).id, 'other');
    assert.equal(await client.station('null'), null);

    const legacy = await called((cb) => client.getStations({ updateOnly: true }, cb));
    assert.deepEqual(legacy.results.map((s) => s.id), ['full', 7]);
  });

  it('should skip stations without coordinates in nearest() and nearbyStations', async () => {
    const client = clientFor({
      'station_information.json': feed([
        FULL_INFO,
        { station_id: 'nowhere', name: 'Nowhere' },
        { station_id: 'near', name: 'Near', lat: 40.701, lon: -74 }
      ]),
      'station_status.json': feed([FULL_STATUS, { station_id: 'nowhere', legacy_id: '11' }, { station_id: 'near', legacy_id: '12' }])
    });
    const near = await client.nearest({ latitude: 40.7, longitude: -74 }, { limit: 10 });
    assert.deepEqual(near.map((s) => s.id), ['full', 'near']);
    assert.equal(near[0].distance, 0);

    const legacy = await called((cb) => client.getStations(cb));
    assert.equal(legacy.totalStations, 3);
    assert.deepEqual(legacy.results[0].nearbyStations.map((n) => n.id), [12]);
    assert.deepEqual(legacy.results[1].nearbyStations, []);
    assert.deepEqual(legacy.results[2].nearbyStations.map((n) => n.id), [10]);
  });

  it('should report an unexpected error from a callback method without a code', async () => {
    const client = clientFor({
      'station_information.json': feed([FULL_INFO]),
      'station_status.json': feed([null])
    });
    const data = await called((cb) => client.getStations(null, cb));
    assert.equal(data.ok, false);
    assert.deepEqual(data.results, []);
    assert.equal(typeof data.error, 'string');
    assert.ok(data.error.length > 0);
    assert.equal('code' in data, false);
  });

  it('should report a station_information failure when station_status is fine', async () => {
    const client = clientFor({ 'station_status.json': feed([FULL_STATUS]) });
    const data = await called((cb) => client.getStations(null, cb));
    assert.deepEqual(data, {
      ok: false,
      meta: [],
      results: [],
      error: 'HTTP 404 from ' + BASE + '/station_information.json',
      code: 'EHTTP'
    });
  });

  it('should report the station_status failure first when both feeds fail', async () => {
    const data = await called((cb) => clientFor({}).getStations(null, cb));
    assert.equal(data.error, 'HTTP 404 from ' + BASE + '/station_status.json');
  });
});

describe('payload validation', () => {
  it('should reject anything that is not a feed object with EPAYLOAD', async () => {
    const client = clientFor({
      'null.json': 'null',
      'string.json': '"hello"',
      'no_data.json': { ttl: 60 },
      'scalar_data.json': { ttl: 60, data: 1 }
    });
    for (const name of ['null', 'string', 'no_data', 'scalar_data']) {
      const error = await rejected(client.feed(name));
      assert.equal(error.code, 'EPAYLOAD', name);
      assert.equal(error.message, 'Unexpected ' + name + ' payload');
      assert.equal(error.url, BASE + '/' + name + '.json');
    }
  });

  it('should reject a station feed whose stations is not an array', async () => {
    const client = clientFor({
      'station_information.json': { ttl: 60, data: { stations: {} } },
      'station_status.json': feed([])
    });
    const error = await rejected(client.feed('station_information'));
    assert.equal(error.code, 'EPAYLOAD');
    assert.equal(error.message, 'Unexpected station_information payload');
    assert.equal((await rejected(client.stations())).code, 'EPAYLOAD');
  });
});

describe('cache expiry', () => {
  it('should refetch a feed once its ttl has passed, and not before', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 1700000000000 });
    const client = clientFor({ 'system_alerts.json': { ttl: 60, data: { alerts: [] } } });

    const first = await client.feed('system_alerts');
    t.mock.timers.tick(59999);
    assert.equal(await client.feed('system_alerts'), first);
    assert.equal(client.calls.length, 1);

    t.mock.timers.tick(1);
    const second = await client.feed('system_alerts');
    assert.notEqual(second, first);
    assert.deepEqual(second, first);
    assert.equal(client.calls.length, 2);
  });

  it('should not cache a feed with a missing or unusable ttl', async () => {
    const client = clientFor({
      'missing_ttl.json': { data: {} },
      'text_ttl.json': { ttl: 'soon', data: {} },
      'negative_ttl.json': { ttl: -5, data: {} }
    });
    for (const name of ['missing_ttl', 'text_ttl', 'negative_ttl']) {
      await client.feed(name);
      await client.feed(name);
    }
    assert.equal(client.calls.length, 6);
  });

  it('should replace the cached feed after fresh: true', async () => {
    let n = 0;
    const client = new Citibike({
      restBase: BASE,
      fetch: () => Promise.resolve(new Response(JSON.stringify({ ttl: 60, data: { n: ++n } })))
    });
    assert.equal((await client.feed('counter')).data.n, 1);
    assert.equal((await client.feed('counter', { fresh: true })).data.n, 2);
    assert.equal((await client.feed('counter')).data.n, 2);
  });
});

describe('requests', () => {
  it('should send the configured headers and a timeout signal', async () => {
    const client = clientFor({ 'x.json': { ttl: 0, data: {} } }, { headers: { 'User-Agent': 'my-app/1.0' } });
    await client.feed('x');
    const init = client.calls[0][1];
    assert.deepEqual(init.headers, { 'Accept': 'application/json', 'User-Agent': 'my-app/1.0' });
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(init.signal.aborted, false);
  });

  it('should send no timeout signal when timeout is 0', async () => {
    const client = clientFor({ 'x.json': { ttl: 0, data: {} } }, { timeout: 0 });
    await client.feed('x');
    assert.equal(client.calls[0][1].signal, undefined);
  });

  it('should describe a fetch failure by its cause, its message, or itself', async () => {
    const inner = new Error('getaddrinfo ENOTFOUND feeds.test');
    const failures = [
      [new TypeError('fetch failed', { cause: inner }), 'getaddrinfo ENOTFOUND feeds.test'],
      [new TypeError('fetch failed', { cause: {} }), 'fetch failed'],
      [new Error('socket hang up'), 'socket hang up'],
      ['just a string', 'just a string'],
      [undefined, 'undefined']
    ];
    for (const [thrown, message] of failures) {
      const client = new Citibike({ restBase: BASE, fetch: () => Promise.reject(thrown) });
      const error = await rejected(client.feed('x'));
      assert.ok(error instanceof Citibike.CitibikeError);
      assert.equal(error.code, 'ENETWORK');
      assert.equal(error.message, message);
      assert.equal(error.url, BASE + '/x.json');
      assert.equal(error.status, null);
      assert.equal(error.cause, thrown);
    }
  });

  it('should report a body that fails to arrive as ENETWORK, with the cause', async () => {
    const reason = new Error('terminated');
    const client = new Citibike({
      restBase: BASE,
      fetch: () => Promise.resolve({ ok: true, status: 200, text: () => Promise.reject(reason) })
    });
    const error = await rejected(client.feed('x'));
    assert.equal(error.code, 'ENETWORK');
    assert.equal(error.message, 'Connection closed before response from ' + BASE + '/x.json finished');
    assert.equal(error.cause, reason);
  });

  it('should pass a failure through to a caller whose signal never aborts', async () => {
    const controller = new AbortController();
    const client = clientFor({});
    const error = await rejected(client.feed('gone', { signal: controller.signal }));
    assert.equal(error.code, 'EHTTP');
    assert.equal(error.status, 404);
  });

  it('should answer from the cache for a caller with a live signal', async () => {
    const controller = new AbortController();
    const client = clientFor({ 'x.json': { ttl: 60, data: { n: 1 } } });
    const first = await client.feed('x', { signal: controller.signal });
    assert.equal(await client.feed('x', { signal: controller.signal }), first);
    assert.equal(client.calls.length, 1);
  });

  it('should carry the abort reason as the cause of EABORTED', async () => {
    const reason = new Error('user navigated away');
    const client = clientFor({ 'x.json': { ttl: 60, data: {} } });
    const error = await rejected(client.feed('x', { signal: AbortSignal.abort(reason) }));
    assert.equal(error.code, 'EABORTED');
    assert.equal(error.message, 'Request to ' + BASE + '/x.json was aborted');
    assert.equal(error.cause, reason);
    assert.equal(client.calls.length, 0);
  });
});

describe('CitibikeError', () => {
  it('should default url and status to null and keep what it is given', () => {
    const bare = new Citibike.CitibikeError('EPARSE', 'bad');
    assert.equal(bare.name, 'CitibikeError');
    assert.equal(bare.code, 'EPARSE');
    assert.equal(bare.message, 'bad');
    assert.equal(bare.url, null);
    assert.equal(bare.status, null);
    assert.equal('cause' in bare, false);

    const cause = new Error('why');
    const full = new Citibike.CitibikeError('EHTTP', 'HTTP 500', { url: 'https://x.test/', status: 500, cause: cause });
    assert.equal(full.url, 'https://x.test/');
    assert.equal(full.status, 500);
    assert.equal(full.cause, cause);
    assert.equal(new Citibike.CitibikeError('EHTTP', 'x', {}).url, null);
  });
});

describe('argument validation', () => {
  it('should reject out-of-range or non-finite coordinates', () => {
    const ok = { latitude: 0, longitude: 0 };
    const bad = [
      null,
      { latitude: 0 },
      { latitude: 0, longitude: 181 },
      { latitude: -90.5, longitude: 0 },
      { latitude: NaN, longitude: 0 },
      { latitude: 0, longitude: Infinity },
      { lat: '40', lon: -74 }
    ];
    bad.forEach((point) => {
      assert.throws(() => Citibike.distance(point, ok), { name: 'TypeError', message: 'a must be { latitude, longitude } with numbers in range' });
      assert.throws(() => Citibike.distance(ok, point), { name: 'TypeError', message: 'b must be { latitude, longitude } with numbers in range' });
    });
    assert.equal(Citibike.distance({ latitude: 90, longitude: 180 }, { latitude: 90, longitude: -180 }) < 1e-6, true);
  });

  it('should name the option nearest() did not like', async () => {
    const client = clientFor({});
    const point = { latitude: 40.7, longitude: -74 };
    const cases = [
      [[{ latitude: 100, longitude: 0 }], 'point must be { latitude, longitude } with numbers in range'],
      [[point, { limit: 1.5 }], 'options.limit must be a positive integer'],
      [[point, { limit: '3' }], 'options.limit must be a positive integer'],
      [[point, { radius: '100' }], 'options.radius must be a number of meters'],
      [[point, { radius: NaN }], 'options.radius must be a number of meters'],
      [[point, { available: 'Bikes' }], 'options.available must be "bikes", "ebikes" or "docks"']
    ];
    for (const [args, message] of cases) {
      const error = await rejected(client.nearest.apply(client, args));
      assert.ok(error instanceof TypeError);
      assert.equal(error.message, message);
    }
    assert.equal(client.calls.length, 0);
  });

  it('should treat null limit, radius and available as not given', async () => {
    const client = clientFor({
      'station_information.json': feed([FULL_INFO]),
      'station_status.json': feed([FULL_STATUS])
    });
    const near = await client.nearest({ latitude: 40.7, longitude: -74 }, { limit: null, radius: null, available: null });
    assert.deepEqual(near.map((s) => s.id), ['full']);
  });

  it('should only hand out stations that can actually rent or take a bike', async () => {
    const info = ['ok', 'not-installed', 'not-renting', 'not-returning', 'empty'].map((id, i) => {
      return { station_id: id, name: id, lat: 40.7 + i / 1000, lon: -74 };
    });
    const on = { num_bikes_available: 2, num_ebikes_available: 1, num_docks_available: 3, is_installed: 1, is_renting: 1, is_returning: 1 };
    const client = clientFor({
      'station_information.json': feed(info),
      'station_status.json': feed([
        Object.assign({ station_id: 'ok' }, on),
        Object.assign({ station_id: 'not-installed' }, on, { is_installed: 0 }),
        Object.assign({ station_id: 'not-renting' }, on, { is_renting: 0 }),
        Object.assign({ station_id: 'not-returning' }, on, { is_returning: 0 }),
        Object.assign({ station_id: 'empty' }, on, { num_bikes_available: 0, num_ebikes_available: 0, num_docks_available: 0 })
      ])
    });
    const point = { latitude: 40.7, longitude: -74 };
    const ids = async (available) => (await client.nearest(point, { limit: 10, available: available })).map((s) => s.id);
    assert.deepEqual(await ids('bikes'), ['ok', 'not-returning']);
    assert.deepEqual(await ids('ebikes'), ['ok', 'not-returning']);
    assert.deepEqual(await ids('docks'), ['ok', 'not-renting']);
    assert.deepEqual(await ids(undefined), ['ok', 'not-installed', 'not-renting', 'not-returning', 'empty']);
  });
});
