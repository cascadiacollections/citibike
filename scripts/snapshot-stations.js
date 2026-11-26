#!/usr/bin/env node
'use strict';

/*
 * Writes site/data/stations.json from the live GBFS feeds.
 *
 * Station names, coordinates and counts come from stations(). Each row uses
 * the station's legacyId, a short numeric id, so the file can stay under
 * ~150 KB. (The UUID station id alone is about 80 KB.)
 *
 * {
 *   generatedAt,          // ISO time, updated only when rows change
 *   lat0, lon0,           // integer degrees * 1e5
 *   stations: [
 *     [id, name, dlat, dlon, bikes, ebikes, docks, active]
 *   ]
 * }
 * lat = (lat0 + dlat) / 1e5, lon = (lon0 + dlon) / 1e5, both already
 * rounded to 5 decimal places. active is 1 or 0. id is the numeric
 * legacy_id, or the UUID string when a station has no legacy id.
 *
 * Re-running with the same rows leaves the file untouched.
 *
 * Two environment variables exist for tests and dry runs. The scheduled
 * workflow sets neither.
 *   CITIBIKE_GBFS_BASE     feed base URL (default: the client's restBase)
 *   CITIBIKE_SNAPSHOT_OUT  output file (default: site/data/stations.json)
 */

var fs = require('fs');
var path = require('path');
var Citibike = require('../lib/citibike');

var OUT = path.join(__dirname, '..', 'site', 'data', 'stations.json');
var LAT0 = 4060000;   // 40.60000°
var LON0 = -7410000;  // -74.10000°
var TARGET_BYTES = 150000;
var MIN_STATIONS = 2000;

function cmpId(a, b) {
  var na = typeof a === 'number';
  var nb = typeof b === 'number';
  if (na && nb) return a - b;
  if (na) return -1;
  if (nb) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Turns what stations() resolves with into the snapshot rows, sorted by id:
 * numeric ids first, in order, then string ids. Stations without a name, an
 * id or coordinates are left out. Throws if two stations share an id.
 */
function buildRows(all) {
  var stations = [];
  var seen = {};
  all.forEach(function (s) {
    if (typeof s.latitude !== 'number' || typeof s.longitude !== 'number') return;
    if (!s.id || !s.name) return;
    var id = s.legacyId !== null ? s.legacyId : s.id;
    var key = String(id);
    if (seen[key]) throw new Error('Duplicate station id ' + key);
    seen[key] = true;
    stations.push([
      id,
      s.name,
      Math.round(s.latitude * 1e5) - LAT0,
      Math.round(s.longitude * 1e5) - LON0,
      s.bikesAvailable | 0,
      s.ebikesAvailable | 0,
      s.docksAvailable | 0,
      s.isInstalled && s.isRenting ? 1 : 0
    ]);
  });

  stations.sort(function (a, b) { return cmpId(a[0], b[0]); });
  return stations;
}

/**
 * Fetches the stations and writes the snapshot. Resolves with
 * `{ written, stations, bytes }`, where `written` is false when the rows on
 * disk were already the same. Rejects without touching the file when the
 * feeds fail, two stations share an id, or fewer than 2000 stations come back.
 *
 * @param {Object} [options]
 * @param {String} [options.restBase]  Feed base URL.
 * @param {String} [options.out]       Output file.
 * @param {Object} [options.log]       Where messages go. Defaults to `console`.
 */
function snapshot(options) {
  options = options || {};
  var out = options.out || OUT;
  var log = options.log || console;
  var clientOptions = { timeout: 30000 };
  if (options.restBase) clientOptions.restBase = options.restBase;

  return new Citibike(clientOptions).stations().then(function (all) {
    var stations = buildRows(all);

    if (stations.length < MIN_STATIONS) {
      throw new Error('Only ' + stations.length + ' stations; refusing to overwrite the snapshot.');
    }

    var previous = null;
    try { previous = JSON.parse(fs.readFileSync(out, 'utf8')); } catch (e) { /* first write */ }

    var same = previous
      && previous.lat0 === LAT0
      && previous.lon0 === LON0
      && JSON.stringify(previous.stations) === JSON.stringify(stations);

    if (same) {
      log.log('Snapshot unchanged (' + stations.length + ' stations).');
      return { written: false, stations: stations.length, bytes: 0 };
    }

    var payload = {
      generatedAt: new Date().toISOString(),
      lat0: LAT0,
      lon0: LON0,
      stations: stations
    };
    var json = JSON.stringify(payload);
    if (json.length > TARGET_BYTES) {
      log.warn('Snapshot is ' + json.length + ' bytes, over the ' + TARGET_BYTES + ' byte target.');
    }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, json);
    log.log('Wrote ' + stations.length + ' stations, ' + json.length + ' bytes.');
    return { written: true, stations: stations.length, bytes: json.length };
  });
}

module.exports = { snapshot: snapshot, buildRows: buildRows, LAT0: LAT0, LON0: LON0 };

if (require.main === module) {
  snapshot({
    restBase: process.env.CITIBIKE_GBFS_BASE,
    out: process.env.CITIBIKE_SNAPSHOT_OUT
  }).catch(function (error) {
    console.error(error && error.message ? error.message : 'stations() failed');
    process.exit(1);
  });
}
