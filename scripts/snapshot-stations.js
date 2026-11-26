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
 */

var fs = require('fs');
var path = require('path');
var Citibike = require('../lib/citibike');

var OUT = path.join(__dirname, '..', 'site', 'data', 'stations.json');
var LAT0 = 4060000;   // 40.60000°
var LON0 = -7410000;  // -74.10000°
var TARGET_BYTES = 150000;

function cmpId(a, b) {
  var na = typeof a === 'number';
  var nb = typeof b === 'number';
  if (na && nb) return a - b;
  if (na) return -1;
  if (nb) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

var client = new Citibike({ timeout: 30000 });

client.stations().then(function (all) {
  var stations = [];
  var seen = {};
  all.forEach(function (s) {
    if (typeof s.latitude !== 'number' || typeof s.longitude !== 'number') return;
    if (!s.id || !s.name) return;
    var id = s.legacyId !== null ? s.legacyId : s.id;
    var key = String(id);
    if (seen[key]) {
      console.error('Duplicate station id ' + key);
      process.exit(1);
    }
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

  if (stations.length < 2000) {
    console.error('Only ' + stations.length + ' stations; refusing to overwrite the snapshot.');
    process.exit(1);
  }

  var previous = null;
  try { previous = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { /* first write */ }

  var same = previous
    && previous.lat0 === LAT0
    && previous.lon0 === LON0
    && JSON.stringify(previous.stations) === JSON.stringify(stations);

  if (same) {
    console.log('Snapshot unchanged (' + stations.length + ' stations).');
    return;
  }

  var payload = {
    generatedAt: new Date().toISOString(),
    lat0: LAT0,
    lon0: LON0,
    stations: stations
  };
  var json = JSON.stringify(payload);
  if (json.length > TARGET_BYTES) {
    console.warn('Snapshot is ' + json.length + ' bytes, over the ' + TARGET_BYTES + ' byte target.');
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, json);
  console.log('Wrote ' + stations.length + ' stations, ' + json.length + ' bytes.');
}).catch(function (error) {
  console.error(error && error.message ? error.message : 'stations() failed');
  process.exit(1);
});
