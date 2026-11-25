#!/usr/bin/env node
'use strict';

/*
 * Writes site/data/stations.json from the live GBFS feeds.
 *
 * Station names, coordinates and counts come from getStations(). The status
 * feed is read once more for legacy_id, a short numeric id, so the file can
 * stay under ~150 KB. (The UUID station id alone is about 80 KB.)
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

client.getStations(null, function (data) {
  if (!data || data.ok === false) {
    console.error(data && data.error ? data.error : 'getStations failed');
    process.exit(1);
  }

  client.get(client.options.stationStatusURL, function (status) {
    if (!status || status.ok === false || !status.data || !Array.isArray(status.data.stations)) {
      console.error(status && status.error ? status.error : 'station_status failed');
      process.exit(1);
    }

    var legacyById = {};
    status.data.stations.forEach(function (st) {
      if (st && st.station_id != null && /^\d+$/.test(String(st.legacy_id))) {
        legacyById[st.station_id] = Number(st.legacy_id);
      }
    });

    var stations = [];
    var seen = {};
    data.results.forEach(function (s) {
      if (typeof s.latitude !== 'number' || typeof s.longitude !== 'number') return;
      if (!s.id || !s.label) return;
      var id = Object.prototype.hasOwnProperty.call(legacyById, s.id) ? legacyById[s.id] : s.id;
      var key = String(id);
      if (seen[key]) {
        console.error('Duplicate station id ' + key);
        process.exit(1);
      }
      seen[key] = true;
      stations.push([
        id,
        s.label,
        Math.round(s.latitude * 1e5) - LAT0,
        Math.round(s.longitude * 1e5) - LON0,
        s.availableBikes | 0,
        s.availableEbikes | 0,
        s.availableDocks | 0,
        s.status === 'Active' ? 1 : 0
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
  });
});
