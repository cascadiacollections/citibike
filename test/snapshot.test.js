/**
 * Tests for scripts/snapshot-stations.js, which writes the station snapshot
 * the landing page's map reads. Runs against the local fixture server and
 * writes only to a temporary directory.
 * Runner: node:test. Assertions: node:assert/strict.
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const support = require('./support/server');
const script = path.join(__dirname, '..', 'scripts', 'snapshot-stations.js');
const { snapshot, buildRows, LAT0, LON0 } = require(script);

const rejected = support.rejected;

// Just over the 2000-station floor, well over it, and just under it.
const city = support.city(2100);
const big = support.city(4200);
const small = support.city(1999);

// The same city with one station's bike count changed.
const moved = JSON.parse(city.status);
moved.data.stations[5].num_bikes_available += 1;

const ROUTES = {
  '/city/station_information.json': { body: city.information },
  '/city/station_status.json': { body: city.status },
  '/moved/station_information.json': { body: city.information },
  '/moved/station_status.json': { body: JSON.stringify(moved) },
  '/big/station_information.json': { body: big.information },
  '/big/station_status.json': { body: big.status },
  '/small/station_information.json': { body: small.information },
  '/small/station_status.json': { body: small.status },
  '/gbfs/en/station_information.json': { body: support.fixture('station_information.json') },
  '/gbfs/en/station_status.json': { body: support.fixture('station_status.json') }
};

function station(overrides) {
  return Object.assign({
    id: 'uuid-a',
    legacyId: 72,
    name: 'W 52 St & 11 Ave',
    latitude: 40.76727216,
    longitude: -73.99392888,
    bikesAvailable: 12,
    ebikesAvailable: 3,
    docksAvailable: 22,
    isInstalled: true,
    isRenting: true
  }, overrides);
}

function recorder() {
  const lines = { log: [], warn: [] };
  return {
    lines: lines,
    log: (message) => lines.log.push(message),
    warn: (message) => lines.warn.push(message)
  };
}

function run(env) {
  return new Promise((resolve) => {
    execFile(process.execPath, [script], { env: Object.assign({}, process.env, env) }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code : 0, stdout: stdout, stderr: stderr });
    });
  });
}

describe('buildRows()', () => {
  it('should build [id, name, dlat, dlon, bikes, ebikes, docks, active]', () => {
    assert.deepEqual(buildRows([station()]), [[72, 'W 52 St & 11 Ave', 16727, 10607, 12, 3, 22, 1]]);
  });

  it('should store coordinates as offsets that round-trip to 5 decimal places', () => {
    const row = buildRows([station()])[0];
    assert.equal((LAT0 + row[2]) / 1e5, 40.76727);
    assert.equal((LON0 + row[3]) / 1e5, -73.99393);
    assert.equal(LAT0, 4060000);
    assert.equal(LON0, -7410000);
  });

  it('should use the GBFS id when a station has no legacy id', () => {
    assert.equal(buildRows([station({ legacyId: null })])[0][0], 'uuid-a');
  });

  it('should mark a station active only when installed and renting', () => {
    const rows = buildRows([
      station({ legacyId: 1 }),
      station({ legacyId: 2, isInstalled: false }),
      station({ legacyId: 3, isRenting: false })
    ]);
    assert.deepEqual(rows.map((r) => r[7]), [1, 0, 0]);
  });

  it('should write whole numbers for counts, and 0 for missing ones', () => {
    const row = buildRows([station({ bikesAvailable: 4.9, ebikesAvailable: undefined, docksAvailable: null })])[0];
    assert.deepEqual(row.slice(4, 7), [4, 0, 0]);
  });

  it('should sort numeric ids in order, then string ids alphabetically', () => {
    const rows = buildRows([
      station({ legacyId: null, id: 'b' }),
      station({ legacyId: 300 }),
      station({ legacyId: null, id: 'a' }),
      station({ legacyId: 72 }),
      station({ legacyId: 1000 })
    ]);
    assert.deepEqual(rows.map((r) => r[0]), [72, 300, 1000, 'a', 'b']);
  });

  it('should leave out stations without coordinates, a name or an id', () => {
    const rows = buildRows([
      station({ legacyId: 1, latitude: undefined }),
      station({ legacyId: 2, longitude: '-73.9' }),
      station({ legacyId: 3, name: '' }),
      station({ legacyId: 4, id: '' }),
      station({ legacyId: 5 })
    ]);
    assert.deepEqual(rows.map((r) => r[0]), [5]);
  });

  it('should throw when two stations end up with the same id', () => {
    assert.throws(() => buildRows([station(), station({ id: 'uuid-b' })]), { message: 'Duplicate station id 72' });
    assert.throws(() => buildRows([station({ legacyId: null, id: '72' }), station()]), { message: 'Duplicate station id 72' });
  });
});

describe('snapshot()', () => {
  let server, dir, out, log;

  before(async () => {
    server = await support.start(ROUTES);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citibike-snapshot-'));
  });

  after(async () => {
    await support.stop(server);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(() => {
    out = path.join(fs.mkdtempSync(path.join(dir, 'run-')), 'data', 'stations.json');
    log = recorder();
  });

  it('should write every station, sorted, creating the directory', async () => {
    const result = await snapshot({ restBase: server.base + '/city', out: out, log: log });
    const raw = fs.readFileSync(out, 'utf8');
    const payload = JSON.parse(raw);

    assert.deepEqual(result, { written: true, stations: 2100, bytes: raw.length });
    assert.deepEqual(Object.keys(payload), ['generatedAt', 'lat0', 'lon0', 'stations']);
    assert.equal(new Date(payload.generatedAt).toISOString(), payload.generatedAt);
    assert.equal(payload.lat0, 4060000);
    assert.equal(payload.lon0, -7410000);
    assert.equal(payload.stations.length, 2100);

    // The fixture city gives station i the legacy id 100 + i.
    assert.deepEqual(payload.stations.map((r) => r[0]), payload.stations.map((r, i) => 100 + i));
    assert.deepEqual(payload.stations[6].slice(0, 2), [106, 'Station 6']);
    assert.deepEqual(payload.stations[6].slice(4), [6, 2, 1, 1]);
    assert.equal(payload.stations[11][7], 0);
    payload.stations.forEach((row) => {
      assert.equal(row.length, 8);
      assert.deepEqual(row.map((v) => typeof v), ['number', 'string', 'number', 'number', 'number', 'number', 'number', 'number']);
      row.slice(2).forEach((v) => assert.ok(Number.isInteger(v)));
    });

    // No whitespace: the file is served as is.
    assert.equal(raw, JSON.stringify(payload));
    assert.deepEqual(log.lines, { log: ['Wrote 2100 stations, ' + raw.length + ' bytes.'], warn: [] });
  });

  it('should leave the file untouched when the rows have not changed', async () => {
    await snapshot({ restBase: server.base + '/city', out: out, log: log });
    const stale = fs.readFileSync(out, 'utf8').replace(/"generatedAt":"[^"]+"/, '"generatedAt":"2020-01-01T00:00:00.000Z"');
    fs.writeFileSync(out, stale);
    // Backdate the file, so a rewrite with identical bytes would still show.
    const old = new Date('2020-01-01T00:00:00.000Z');
    fs.utimesSync(out, old, old);

    const result = await snapshot({ restBase: server.base + '/city', out: out, log: log });
    assert.deepEqual(result, { written: false, stations: 2100, bytes: 0 });
    assert.equal(fs.readFileSync(out, 'utf8'), stale);
    assert.equal(fs.statSync(out).mtimeMs, old.getTime());
    assert.equal(log.lines.log[1], 'Snapshot unchanged (2100 stations).');
  });

  it('should rewrite the file when a row changes', async () => {
    await snapshot({ restBase: server.base + '/city', out: out, log: log });
    const before = JSON.parse(fs.readFileSync(out, 'utf8'));

    const result = await snapshot({ restBase: server.base + '/moved', out: out, log: log });
    const after = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.equal(result.written, true);
    assert.equal(after.stations[5][4], before.stations[5][4] + 1);
    assert.deepEqual(after.stations[4], before.stations[4]);
  });

  it('should rewrite a file with a different origin or one it cannot parse', async () => {
    await snapshot({ restBase: server.base + '/city', out: out, log: log });
    const good = fs.readFileSync(out, 'utf8');

    for (const stale of [good.replace('"lat0":4060000', '"lat0":0'), good.replace('"lon0":-7410000', '"lon0":0'), '{ not json']) {
      fs.writeFileSync(out, stale);
      const result = await snapshot({ restBase: server.base + '/city', out: out, log: log });
      assert.equal(result.written, true);
      const payload = JSON.parse(fs.readFileSync(out, 'utf8'));
      assert.equal(payload.lat0, 4060000);
      assert.equal(payload.lon0, -7410000);
      assert.deepEqual(payload.stations, JSON.parse(good).stations);
    }
  });

  it('should refuse to overwrite the snapshot with fewer than 2000 stations', async () => {
    await snapshot({ restBase: server.base + '/city', out: out, log: log });
    const good = fs.readFileSync(out, 'utf8');

    const error = await rejected(snapshot({ restBase: server.base + '/small', out: out, log: log }));
    assert.equal(error.message, 'Only 1999 stations; refusing to overwrite the snapshot.');
    assert.equal(fs.readFileSync(out, 'utf8'), good);
  });

  it('should not create a file when it refuses or the feeds fail', async () => {
    const few = await rejected(snapshot({ restBase: server.base + '/gbfs/en', out: out, log: log }));
    assert.equal(few.message, 'Only 2 stations; refusing to overwrite the snapshot.');

    const down = await rejected(snapshot({ restBase: server.base + '/nowhere', out: out, log: log }));
    assert.equal(down.code, 'EHTTP');
    assert.equal(fs.existsSync(path.dirname(out)), false);
    assert.deepEqual(log.lines, { log: [], warn: [] });
  });

  it('should warn, and still write, when the snapshot is over the size target', async () => {
    const result = await snapshot({ restBase: server.base + '/big', out: out, log: log });
    assert.equal(result.written, true);
    assert.ok(result.bytes > 150000);
    assert.deepEqual(log.lines.warn, ['Snapshot is ' + result.bytes + ' bytes, over the 150000 byte target.']);
    assert.equal(JSON.parse(fs.readFileSync(out, 'utf8')).stations.length, 4200);
  });

  describe('as a command', () => {
    it('should write the file named by the environment and exit 0', async () => {
      const first = await run({ CITIBIKE_GBFS_BASE: server.base + '/city', CITIBIKE_SNAPSHOT_OUT: out });
      assert.deepEqual(first, { code: 0, stdout: 'Wrote 2100 stations, ' + fs.statSync(out).size + ' bytes.\n', stderr: '' });

      const again = await run({ CITIBIKE_GBFS_BASE: server.base + '/city', CITIBIKE_SNAPSHOT_OUT: out });
      assert.deepEqual(again, { code: 0, stdout: 'Snapshot unchanged (2100 stations).\n', stderr: '' });
    });

    it('should print the reason and exit 1 when it refuses', async () => {
      const result = await run({ CITIBIKE_GBFS_BASE: server.base + '/small', CITIBIKE_SNAPSHOT_OUT: out });
      assert.deepEqual(result, { code: 1, stdout: '', stderr: 'Only 1999 stations; refusing to overwrite the snapshot.\n' });
      assert.equal(fs.existsSync(out), false);
    });

    it('should print the reason and exit 1 when the feeds fail', async () => {
      const result = await run({ CITIBIKE_GBFS_BASE: server.base + '/nowhere', CITIBIKE_SNAPSHOT_OUT: out });
      assert.equal(result.code, 1);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /^HTTP 404 from http:\/\/127\.0\.0\.1:\d+\/nowhere\/station_(information|status)\.json\n$/);
    });
  });
});

describe('the committed snapshot', () => {
  it('should have the shape the script writes', () => {
    const payload = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'site', 'data', 'stations.json'), 'utf8'));
    assert.deepEqual(Object.keys(payload), ['generatedAt', 'lat0', 'lon0', 'stations']);
    assert.equal(payload.lat0, LAT0);
    assert.equal(payload.lon0, LON0);
    assert.ok(payload.stations.length >= 2000);
    payload.stations.forEach((row) => {
      assert.equal(row.length, 8);
      assert.match(typeof row[0], /^(number|string)$/);
      assert.equal(typeof row[1], 'string');
      row.slice(2).forEach((v) => assert.ok(Number.isInteger(v)));
    });
  });
});
