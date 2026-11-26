#!/usr/bin/env node
'use strict';

/*
 * Regenerates the site's raster images. Nothing here runs in CI or on deploy:
 * the outputs are committed, and this file is the recipe for making them again.
 *
 *   node scripts/render-fallback.js          the hero's static fallback
 *   node scripts/render-fallback.js icons    the PNG favicon and touch icon
 *
 * The fallback is drawn from site/data/stations.json with no dependencies: a
 * tiny PNG writer plus the same projection the hero uses. It is written as
 * site/hero-fallback.png, then encoded losslessly as site/hero-fallback.webp,
 * which is the file browsers actually fetch (the PNG is the <img> fallback
 * inside <picture>). Run it again when you want the static image to match a
 * new snapshot. The daily job does not, so git isn't churning binaries every
 * night.
 *
 * The icons are rasterized from site/assets/favicon.svg.
 *
 * External tools, all optional to the site itself and none of them npm
 * packages (on Fedora or macOS: brew install webp librsvg oxipng):
 *   cwebp         required for the fallback; writes the WebP
 *   rsvg-convert  required for `icons`
 *   oxipng        optional; recompresses the PNGs losslessly when present
 *
 * AVIF was measured and left out: for this image (a few hundred flat colors
 * on transparency) lossless WebP is about 30 KB, while AVIF is 42 KB at
 * quality 50 with visible ringing, and 116 KB lossless.
 *
 * site/og-image.png has its own recipe in site/og-image.html.
 */

var fs = require('fs');
var path = require('path');
var zlib = require('zlib');
var { spawnSync } = require('child_process');
var { pathToFileURL } = require('url');

var root = path.join(__dirname, '..');

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

// The dots are flat colors with hard edges, so the image normally has well
// under 256 distinct colors and fits a palette. Returns null when it doesn't.
function palettize(width, height, rgba) {
  var lookup = new Map();
  var colors = [];
  var raw = Buffer.alloc((width + 1) * height);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var key = rgba.readUInt32BE((y * width + x) * 4);
      var index = lookup.get(key);
      if (index === undefined) {
        if (colors.length === 256) return null;
        index = colors.length;
        lookup.set(key, index);
        colors.push(key);
      }
      raw[y * (width + 1) + 1 + x] = index;
    }
  }
  var plte = Buffer.alloc(colors.length * 3);
  var trns = Buffer.alloc(colors.length);
  colors.forEach(function (key, i) {
    plte[i * 3] = key >>> 24;
    plte[i * 3 + 1] = (key >>> 16) & 0xff;
    plte[i * 3 + 2] = (key >>> 8) & 0xff;
    trns[i] = key & 0xff;
  });
  return { raw: raw, plte: plte, trns: trns };
}

function writePNG(file, width, height, rgba) {
  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  var chunks = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])];
  var indexed = palettize(width, height, rgba);
  var raw;
  if (indexed) {
    ihdr[9] = 3;
    raw = indexed.raw;
    chunks.push(chunk('IHDR', ihdr), chunk('PLTE', indexed.plte), chunk('tRNS', indexed.trns));
  } else {
    ihdr[9] = 6;
    var stride = width * 4;
    raw = Buffer.alloc((stride + 1) * height);
    for (var y = 0; y < height; y++) {
      rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
    }
    chunks.push(chunk('IHDR', ihdr));
  }
  chunks.push(chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)));
  fs.writeFileSync(file, Buffer.concat(chunks));
}

function has(tool) {
  var probe = spawnSync(tool, ['--version'], { stdio: 'ignore' });
  return !probe.error;
}

function run(tool, args, options) {
  var res = spawnSync(tool, args, Object.assign({ stdio: ['ignore', 'pipe', 'inherit'] }, options));
  if (res.error) throw new Error(tool + ' is not installed (' + res.error.code + '). See the note at the top of this file.');
  if (res.status !== 0) throw new Error(tool + ' ' + args.join(' ') + ' exited with ' + res.status);
  return res.stdout;
}

function optimizePNG(file) {
  if (!has('oxipng')) {
    console.log('oxipng not found: left ' + path.relative(root, file) + ' as written.');
    return;
  }
  run('oxipng', ['--quiet', '--opt', 'max', '--strip', 'all', file]);
}

function report(file) {
  console.log('Wrote ' + path.relative(root, file) + ' (' + fs.statSync(file).size + ' bytes).');
}

// 32px for browsers that can't use the SVG favicon. 180px for iOS, which
// rounds the corners itself and paints transparency black, so that one is
// drawn on a full square of the icon's own blue.
function renderIcons() {
  var svg = path.join(root, 'site/assets/favicon.svg');
  var small = path.join(root, 'site/assets/favicon-32.png');
  var touch = path.join(root, 'site/assets/apple-touch-icon.png');
  fs.writeFileSync(small, run('rsvg-convert', ['--width', '32', '--height', '32', svg]));
  fs.writeFileSync(touch, run('rsvg-convert', ['--width', '180', '--height', '180', '--background-color', '#0b5cab', svg]));
  [small, touch].forEach(function (file) {
    optimizePNG(file);
    report(file);
  });
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

async function renderFallback() {
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

  var png = path.join(root, 'site/hero-fallback.png');
  var webp = path.join(root, 'site/hero-fallback.webp');
  writePNG(png, W, H, rgba);
  // Encode the WebP before oxipng touches the PNG, so both come straight from
  // the pixels drawn above. -exact keeps the color under transparent pixels.
  run('cwebp', ['-quiet', '-lossless', '-z', '9', '-exact', png, '-o', webp]);
  optimizePNG(png);
  var opaque = 0;
  for (var p = 3; p < rgba.length; p += 4) if (rgba[p] > 20) opaque++;
  report(png);
  report(webp);
  console.log(opaque + ' opaque pixels from ' + list.length + ' stations.');
}

function main() {
  var what = process.argv[2] || 'fallback';
  if (what === 'icons') return Promise.resolve(renderIcons());
  if (what === 'fallback') return renderFallback();
  return Promise.reject(new Error('Unknown target "' + what + '". Use "fallback" or "icons".'));
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
