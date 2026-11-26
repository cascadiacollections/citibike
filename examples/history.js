/**
 *  Records station availability over time in a local SQLite file, using the
 *  node:sqlite module that ships with Node. Nothing to install.
 *
 *    node examples/history.js                 poll every minute until Ctrl-C
 *    node examples/history.js --once          record one poll and exit
 *    node examples/history.js --db bikes.db   write somewhere else
 *    node examples/history.js --interval 300  poll every five minutes
 *
 *  Then ask it questions with any SQLite client:
 *
 *    sqlite3 citibike-history.db "
 *      SELECT name, datetime(at, 'unixepoch', 'localtime') AS seen, bikes, ebikes, docks
 *      FROM samples JOIN stations USING (station_id)
 *      WHERE name = 'W 52 St & 11 Ave' ORDER BY at"
 *
 *  A station gets a new row only when it reports again, so an idle station
 *  costs nothing and polling faster than the feed updates adds no rows.
 */

var Citibike = require('..');

var SCHEMA = [
  'CREATE TABLE IF NOT EXISTS stations (',
  '  station_id TEXT PRIMARY KEY,',
  '  name       TEXT NOT NULL,',
  '  latitude   REAL NOT NULL,',
  '  longitude  REAL NOT NULL,',
  '  capacity   INTEGER',
  ') WITHOUT ROWID;',
  'CREATE TABLE IF NOT EXISTS samples (',
  '  station_id TEXT NOT NULL REFERENCES stations (station_id),',
  '  at         INTEGER NOT NULL,', // station.lastReported, Unix seconds
  '  bikes      INTEGER NOT NULL,', // includes e-bikes
  '  ebikes     INTEGER NOT NULL,',
  '  docks      INTEGER NOT NULL,',
  '  renting    INTEGER NOT NULL,', // 1 or 0
  '  PRIMARY KEY (station_id, at)',
  ') WITHOUT ROWID;'
].join('\n');

/** Opens (and if needed creates) the history database. */
function open(file) {
  var DatabaseSync;
  try {
    DatabaseSync = require('node:sqlite').DatabaseSync;
  } catch (e) {
    throw new Error('This example needs node:sqlite, which ships with Node 22.13 and later.');
  }
  var db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

/**
 *  Writes one poll. Resolves nothing; returns { stations, added }, where
 *  added is how many stations had reported since the last poll.
 */
function record(db, stations) {
  var upsert = db.prepare(
    'INSERT INTO stations (station_id, name, latitude, longitude, capacity) VALUES (?, ?, ?, ?, ?) ' +
    'ON CONFLICT (station_id) DO UPDATE SET name = excluded.name, latitude = excluded.latitude, ' +
    'longitude = excluded.longitude, capacity = excluded.capacity');
  var insert = db.prepare(
    'INSERT OR IGNORE INTO samples (station_id, at, bikes, ebikes, docks, renting) VALUES (?, ?, ?, ?, ?, ?)');

  var added = 0;
  db.exec('BEGIN');
  try {
    stations.forEach(function(s) {
      /** A station that has never reported has nothing to put on the timeline */
      if (s.lastReported === null) return;
      upsert.run(s.id, s.name, s.latitude, s.longitude, s.capacity);
      added += Number(insert.run(
        s.id, s.lastReported, s.bikesAvailable, s.ebikesAvailable, s.docksAvailable, s.isRenting ? 1 : 0
      ).changes);
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { stations: stations.length, added: added };
}

/** The stations whose bike count moved the most across everything recorded. */
function busiest(db, limit) {
  return db.prepare(
    'SELECT name, MIN(bikes) AS low, MAX(bikes) AS high, COUNT(*) AS samples ' +
    'FROM samples JOIN stations USING (station_id) ' +
    'GROUP BY station_id ORDER BY high - low DESC, name LIMIT ?'
  ).all(limit);
}

function parse(argv) {
  var options = { db: 'citibike-history.db', interval: 60, once: false };
  for (var i = 0; i < argv.length; i++) {
    if (argv[i] === '--once') options.once = true;
    else if (argv[i] === '--db' && argv[i + 1]) options.db = argv[++i];
    else if (argv[i] === '--interval' && Number(argv[i + 1]) > 0) options.interval = Number(argv[++i]);
    else throw new Error('Usage: node examples/history.js [--once] [--db FILE] [--interval SECONDS]');
  }
  return options;
}

async function main() {
  var options = parse(process.argv.slice(2));
  var db = open(options.db);
  /** ttl 0: every poll reads the feeds, since the loop already paces itself */
  var citibike = new Citibike({ ttl: 0 });
  var timer = null;

  async function poll() {
    var result = record(db, await citibike.stations());
    console.log(new Date().toISOString() + '  ' + result.added + ' of ' + result.stations +
      ' stations reported since the last poll');
  }

  function stop() {
    clearInterval(timer);
    busiest(db, 3).forEach(function(row) {
      console.log(row.name + ': ' + row.low + ' to ' + row.high + ' bikes over ' + row.samples + ' samples');
    });
    db.close();
  }

  try {
    await poll();
  } catch (error) {
    db.close();
    throw error;
  }
  if (options.once) return stop();

  console.log('Recording to ' + options.db + ' every ' + options.interval + ' s. Ctrl-C to stop.');
  timer = setInterval(function() {
    /** One failed poll, say a network blip, should not end a long recording */
    poll().catch(function(error) { console.error((error.code || 'ERROR') + ': ' + error.message); });
  }, options.interval * 1000);
  process.once('SIGINT', stop);
}

if (require.main === module) {
  main().catch(function(error) {
    console.error((error.code || 'ERROR') + ': ' + error.message);
    process.exitCode = 1;
  });
}

module.exports = { open: open, record: record, busiest: busiest, parse: parse };
