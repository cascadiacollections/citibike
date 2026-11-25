#!/usr/bin/env node
'use strict';

/*
 * Writes site/data/stations.json and site/hero-fallback.png from the live
 * Citi Bike feeds, using this library's getStations().
 *
 * The browser map cannot call the feeds itself: they send no CORS header.
 * The JSON is compact on purpose (short keys, coordinates rounded to 5
 * decimals, no pretty-printing) and must stay under 150KB raw.
 *
 * stations.json:
 *   { "generatedAt": <unix seconds>,
 *     "stations": [ [name, lat, lon, bikes, ebikes, docks], ... ] }
 *
 * generatedAt is left untouched when the station rows are identical, so a
 * re-run that sees the same feed does not dirty git.
 *
 * The PNG is a transparent scatter of the same stations (equirectangular,
 * cos(lat) correction, north up). The page paints theme-colored water behind
 * it. Same projection constants as site/assets/city-scene.js.
 */

var fs = require('fs');
var path = require('path');
var zlib = require('zlib');
var Citibike = require('../lib/citibike');

var root = path.join(__dirname, '..');
var jsonPath = path.join(root, 'site', 'data', 'stations.json');
var pngPath = path.join(root, 'site', 'hero-fallback.png');
var MAX_BYTES = 150 * 1024;

// Keep in sync with site/assets/city-scene.js.
var ORIGIN_LAT = 40.735;
var ORIGIN_LON = -73.985;
var COS_LAT = Math.cos(ORIGIN_LAT * Math.PI / 180);

function round5(n) {
  return Math.round(n * 1e5) / 1e5;
}

function project(lat, lon) {
  return [
    (lon - ORIGIN_LON) * COS_LAT,
    -(lat - ORIGIN_LAT)
  ];
}

function compact(results) {
  var rows = [];
  results.forEach(function (s) {
    if (typeof s.latitude !== 'number' || typeof s.longitude !== 'number') return;
    if (!s.label) return;
    rows.push([
      String(s.label),
      round5(s.latitude),
      round5(s.longitude),
      s.availableBikes | 0,
      s.availableEbikes | 0,
      s.availableDocks | 0
    ]);
  });
  rows.sort(function (a, b) {
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
    if (a[1] !== b[1]) return a[1] - b[1];
    return a[2] - b[2];
  });
  return rows;
}

function readPrevious() {
  try {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch (e) {
    return null;
  }
}

// --- PNG (no dependencies; zlib is built into Node) ---

var CRC_TABLE = (function () {
  var table = new Uint32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  var c = 0xffffffff;
  for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  var length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  var typeBuf = Buffer.from(type, 'ascii');
  var crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function blend(buf, o, r, g, b, a) {
  var sa = a / 255;
  var da = buf[o + 3] / 255;
  var out = sa + da * (1 - sa);
  if (out <= 0) return;
  buf[o] = Math.round((r * sa + buf[o] * da * (1 - sa)) / out);
  buf[o + 1] = Math.round((g * sa + buf[o + 1] * da * (1 - sa)) / out);
  buf[o + 2] = Math.round((b * sa + buf[o + 2] * da * (1 - sa)) / out);
  buf[o + 3] = Math.round(out * 255);
}

function dot(buf, width, height, cx, cy, rad, r, g, b, a) {
  if (rad <= 0 || a <= 0) return;
  var x0 = Math.max(0, Math.floor(cx - rad));
  var x1 = Math.min(width - 1, Math.ceil(cx + rad));
  var y0 = Math.max(0, Math.floor(cy - rad));
  var y1 = Math.min(height - 1, Math.ceil(cy + rad));
  var r2 = rad * rad;
  for (var y = y0; y <= y1; y++) {
    for (var x = x0; x <= x1; x++) {
      var dx = x + 0.5 - cx;
      var dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) blend(buf, (y * width + x) * 4, r, g, b, a);
    }
  }
}

function stationColor(bikes, ebikes) {
  if (bikes <= 0) return [120, 138, 156];
  var t = Math.max(0, Math.min(1, ebikes / bikes));
  // Blue for classic bikes, yellow-green where the dock is mostly e-bikes.
  return [
    Math.round(32 + (150 - 32) * t),
    Math.round(114 + (190 - 114) * t),
    Math.round(196 + (40 - 196) * t)
  ];
}

function renderFallback(stations) {
  var width = 1440;
  var height = 900;
  var pts = stations.map(function (s) {
    var p = project(s[1], s[2]);
    return { x: p[0], y: p[1], bikes: s[3], ebikes: s[4] };
  });
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  pts.forEach(function (p) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  });
  var spanX = Math.max(1e-6, maxX - minX);
  var spanY = Math.max(1e-6, maxY - minY);
  var margin = 48;
  var scale = Math.min((width - margin * 2) / spanX, (height - margin * 2) / spanY);
  var offX = (width - spanX * scale) / 2;
  var offY = (height - spanY * scale) / 2;

  var buf = Buffer.alloc(width * height * 4);
  pts.forEach(function (p) {
    var cx = offX + (p.x - minX) * scale;
    var cy = offY + (p.y - minY) * scale;
    var rad = 2.1 + Math.sqrt(Math.max(0, p.bikes)) * 0.38;
    if (rad > 6.5) rad = 6.5;
    var col = stationColor(p.bikes, p.ebikes);
    dot(buf, width, height, cx, cy, rad + 1.6, 8, 16, 28, 150);
    dot(buf, width, height, cx, cy, rad + 0.7, 255, 255, 255, 210);
    dot(buf, width, height, cx, cy, rad, col[0], col[1], col[2], 235);
  });

  var raw = Buffer.alloc((width * 4 + 1) * height);
  for (var y = 0; y < height; y++) {
    var row = y * (width * 4 + 1);
    raw[row] = 0;
    buf.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }

  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  var png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
  return png;
}

function main() {
  var client = new Citibike({ timeout: 20000 });
  client.getStations(null, function (data) {
    if (!data || data.ok === false) {
      console.error(data && data.error ? data.error : 'getStations failed');
      process.exit(1);
    }
    var stations = compact(data.results || []);
    if (stations.length < 500) {
      console.error('Only ' + stations.length + ' stations with coordinates; not overwriting the snapshot.');
      process.exit(1);
    }

    var generatedAt = Math.floor(Date.now() / 1000);
    var prev = readPrevious();
    if (prev && JSON.stringify(prev.stations) === JSON.stringify(stations) && typeof prev.generatedAt === 'number') {
      generatedAt = prev.generatedAt;
    }

    var json = JSON.stringify({ generatedAt: generatedAt, stations: stations }) + '\n';
    var bytes = Buffer.byteLength(json);
    if (bytes > MAX_BYTES) {
      console.error('stations.json is ' + bytes + ' bytes, over the 150KB budget.');
      process.exit(1);
    }

    fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
    var png = renderFallback(stations);
    if (png.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') {
      console.error('PNG encoder produced a bad signature.');
      process.exit(1);
    }
    fs.writeFileSync(jsonPath, json);
    fs.writeFileSync(pngPath, png);
    var bikes = 0, ebikes = 0;
    stations.forEach(function (s) { bikes += s[3]; ebikes += s[4]; });
    console.log(
      'Wrote ' + stations.length + ' stations, ' +
      bikes + ' bikes, ' + ebikes + ' e-bikes, ' +
      bytes + ' bytes JSON, ' + png.length + ' bytes PNG, generatedAt ' + generatedAt
    );
  });
}

main();
