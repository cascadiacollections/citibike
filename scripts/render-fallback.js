#!/usr/bin/env node
'use strict';

/*
 * Draws site/hero-fallback.png from site/data/stations.json.
 * No dependencies: a tiny PNG writer plus the same projection the hero uses.
 * Run it again when you want the static image to match a new snapshot.
 * The daily job does not, so git isn't churning a binary every night.
 */

var fs = require('fs');
var path = require('path');
var zlib = require('zlib');
var { pathToFileURL } = require('url');

var W = 840;
var H = 1140;
var PAD = 36;

function crcTable() {
  var table = new Uint32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
}

var CRC = crcTable();

function crc32(buf) {
  var c = 0xffffffff;
  for (var i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  var len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  var body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  var crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function writePNG(file, width, height, rgba) {
  var stride = width * 4;
  var raw = Buffer.alloc((stride + 1) * height);
  for (var y = 0; y < height; y++) {
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  var png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
  fs.writeFileSync(file, png);
  return png.length;
}

function blend(rgba, width, height, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= width || y >= height || a <= 0) return;
  var i = (y * width + x) * 4;
  var sa = a / 255;
  var da = rgba[i + 3] / 255;
  var outA = sa + da * (1 - sa);
  if (outA <= 0) return;
  rgba[i] = (r * sa + rgba[i] * da * (1 - sa)) / outA;
  rgba[i + 1] = (g * sa + rgba[i + 1] * da * (1 - sa)) / outA;
  rgba[i + 2] = (b * sa + rgba[i + 2] * da * (1 - sa)) / outA;
  rgba[i + 3] = Math.max(0, Math.min(255, outA * 255));
}

function dot(rgba, width, height, cx, cy, radius, color) {
  var r = Math.ceil(radius + 1);
  var x0 = Math.floor(cx);
  var y0 = Math.floor(cy);
  for (var y = -r; y <= r; y++) {
    for (var x = -r; x <= r; x++) {
      var d = Math.hypot(x + (x0 + 0.5 - cx), y + (y0 + 0.5 - cy));
      if (d > radius + 0.8) continue;
      var cov = radius + 0.35 - d;
      if (cov <= 0.45) continue;
      blend(rgba, width, height, x0 + x, y0 + y, color[0], color[1], color[2], 255);
    }
  }
}

function colorFor(s) {
  if (!s.active) return [140, 152, 168, 180];
  if (s.bikes <= 0) return [92, 110, 130, 210];
  var ratio = s.bikes > 0 ? Math.max(0, Math.min(1, s.ebikes / s.bikes)) : 0;
  return [
    20 + (224 - 20) * ratio,
    110 + (138 - 110) * ratio,
    196 + (36 - 196) * ratio,
    235
  ];
}

async function main() {
  var root = path.join(__dirname, '..');
  var stationsMod = await import(pathToFileURL(path.join(root, 'site/assets/stations.js')).href);
  var projectMod = await import(pathToFileURL(path.join(root, 'site/assets/project.js')).href);
  var payload = JSON.parse(fs.readFileSync(path.join(root, 'site/data/stations.json'), 'utf8'));
  var list = stationsMod.decodeStations(payload);
  var pts = list.map(function (s) { return projectMod.project(s.lat, s.lon); });

  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  pts.forEach(function (p) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  });

  var scale = Math.min((W - PAD * 2) / (maxX - minX), (H - PAD * 2) / (maxY - minY));
  var ox = (W - (maxX - minX) * scale) / 2 - minX * scale;
  var oy = (H - (maxY - minY) * scale) / 2 - minY * scale;

  var rgba = Buffer.alloc(W * H * 4);
  var order = list.map(function (s, i) { return i; });
  order.sort(function (a, b) { return list[a].bikes - list[b].bikes; });

  order.forEach(function (i) {
    var s = list[i];
    var radius = s.bikes <= 0 ? 2.1 : Math.min(6.5, 2.3 + Math.sqrt(s.bikes) * 0.62);
    dot(rgba, W, H, pts[i][0] * scale + ox, pts[i][1] * scale + oy, radius, colorFor(s));
  });

  var out = path.join(root, 'site/hero-fallback.png');
  var bytes = writePNG(out, W, H, rgba);
  var opaque = 0;
  for (var p = 3; p < rgba.length; p += 4) if (rgba[p] > 20) opaque++;
  console.log('Wrote ' + out + ' (' + bytes + ' bytes, ' + opaque + ' opaque pixels).');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
