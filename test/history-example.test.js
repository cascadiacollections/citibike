/**
 * Tests for examples/history.js, which records station availability in a
 * SQLite file with node:sqlite. Runs against the local fixture server and
 * writes only to a temporary directory. Skipped where the runtime has no
 * node:sqlite.
 * Runner: node:test. Assertions: node:assert/strict.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const Citibike = require('..');
const support = require('./support/server');
const history = require('../examples/history');

let hasSqlite = true;
try { require('node:sqlite'); } catch (e) { hasSqlite = false; }

const status = JSON.parse(support.fixture('station_status.json'));
const first = status.data.stations[0];

// The same feed a minute later: one station reported again with one bike fewer.
const later = JSON.parse(JSON.stringify(status));
later.data.stations[0].last_reported = first.last_reported + 60;
later.data.stations[0].num_bikes_available = first.num_bikes_available - 1;

const ROUTES = {
  '/now/station_information.json': { body: support.fixture('station_information.json') },
  '/now/station_status.json': { body: JSON.stringify(status) },
  '/later/station_information.json': { body: support.fixture('station_information.json') },
  '/later/station_status.json': { body: JSON.stringify(later) }
};

describe('examples/history.js', { skip: hasSqlite ? false : 'node:sqlite is not available' }, () => {
  let server, dir, db, now, next;

  before(async () => {
    server = await support.start(ROUTES);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'citibike-history-'));
    db = history.open(path.join(dir, 'history.db'));
    now = await new Citibike({ restBase: server.base + '/now', ttl: 0 }).stations();
    next = await new Citibike({ restBase: server.base + '/later', ttl: 0 }).stations();
  });

  after(async () => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
    await support.stop(server);
  });

  it('records one sample for every station that has reported', () => {
    const reported = now.filter((s) => s.lastReported !== null).length;
    assert.ok(reported > 0);
    assert.deepEqual(history.record(db, now), { stations: now.length, added: reported });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stations').get().n, reported);
  });

  it('adds nothing when no station has reported again', () => {
    assert.equal(history.record(db, now).added, 0);
  });

  it('adds a sample only for the station that reported again', () => {
    assert.equal(history.record(db, next).added, 1);
    const rows = db.prepare(
      'SELECT at, bikes FROM samples WHERE station_id = ? ORDER BY at'
    ).all(first.station_id);
    assert.deepEqual(rows.map((r) => ({ at: r.at, bikes: r.bikes })), [
      { at: first.last_reported, bikes: first.num_bikes_available },
      { at: first.last_reported + 60, bikes: first.num_bikes_available - 1 }
    ]);
  });

  it('ranks the station whose bike count moved first', () => {
    const top = history.busiest(db, 1)[0];
    assert.equal(top.high - top.low, 1);
    assert.equal(top.samples, 2);
  });

  it('keeps the history when the database is reopened', () => {
    const again = history.open(path.join(dir, 'history.db'));
    try {
      assert.equal(again.prepare('SELECT COUNT(*) AS n FROM samples WHERE station_id = ?')
        .get(first.station_id).n, 2);
    } finally {
      again.close();
    }
  });

  it('rolls back a poll that fails part way', () => {
    const before = db.prepare('SELECT COUNT(*) AS n FROM samples').get().n;
    const bad = [
      Object.assign({}, now[0], { id: 'new-station', lastReported: 1 }),
      Object.assign({}, now[0], { id: 'broken-station', lastReported: 1, name: null })
    ];
    assert.throws(() => history.record(db, bad));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM samples').get().n, before);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM stations WHERE station_id = 'new-station'").get().n, 0);
  });
});

describe('examples/history.js options', () => {
  it('defaults to a one-minute poll into citibike-history.db', () => {
    assert.deepEqual(history.parse([]), { db: 'citibike-history.db', interval: 60, once: false });
  });

  it('reads --once, --db and --interval', () => {
    assert.deepEqual(history.parse(['--once', '--db', 'x.db', '--interval', '300']),
      { db: 'x.db', interval: 300, once: true });
  });

  it('rejects an unknown flag or a bad interval', () => {
    assert.throws(() => history.parse(['--nope']), /Usage/);
    assert.throws(() => history.parse(['--interval', '0']), /Usage/);
  });
});
