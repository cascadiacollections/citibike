#!/usr/bin/env node
'use strict';

/*
 * Checks the built site in site/ without dependencies: every relative link,
 * script, stylesheet and image must exist, every #fragment must match an id on
 * the target page, and every sitemap URL must map to a real file.
 *
 * Run `npm run docs` first so site/api/index.html exists.
 * Pass --external to also check that absolute https links respond (needs network).
 * A 403 is accepted there, since sites such as npmjs.com refuse non-browser clients.
 */

var fs = require('fs');
var path = require('path');

var siteDir = path.join(__dirname, '..', 'site');
var BASE = 'https://cascadiacollections.github.io/citibike/';
var checkExternal = process.argv.indexOf('--external') !== -1;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).reduce(function (files, e) {
    var p = path.join(dir, e.name);
    return files.concat(e.isDirectory() ? walk(p) : [p]);
  }, []);
}

var pages = walk(siteDir).filter(function (f) { return /\.html$/.test(f) && path.basename(f) !== 'og-image.html'; });
var errors = [];
var externals = {};
var idCache = {};

function ids(file) {
  if (!idCache[file]) {
    var html = fs.readFileSync(file, 'utf8');
    var set = {};
    html.replace(/\sid="([^"]+)"/g, function (_, id) { set[id] = true; return ''; });
    idCache[file] = set;
  }
  return idCache[file];
}

function resolve(fromFile, urlPath, absolute) {
  var target = path.resolve(absolute ? siteDir : path.dirname(fromFile), urlPath);
  if (urlPath === '' ) return fromFile;
  if (/\/$/.test(urlPath) || (fs.existsSync(target) && fs.statSync(target).isDirectory())) {
    target = path.join(target, 'index.html');
  }
  return target;
}

pages.forEach(function (file) {
  var rel = path.relative(siteDir, file);
  var html = fs.readFileSync(file, 'utf8');
  var dup = {};
  html.replace(/\sid="([^"]+)"/g, function (_, id) {
    if (dup[id]) errors.push(rel + ': duplicate id "' + id + '"');
    dup[id] = true;
    return '';
  });

  html.replace(/\s(?:href|src)="([^"]*)"/g, function (_, url) {
    if (/^(mailto:|data:|javascript:)/.test(url)) return '';
    var absolute = false;
    if (/^https?:\/\//.test(url)) {
      if (url.indexOf(BASE) === 0) {
        absolute = true;
        // Absolute links to this site are only expected in <link rel="canonical"> and meta tags.
        url = url.slice(BASE.length);
      } else {
        externals[url.split('#')[0]] = rel;
        return '';
      }
    }
    var parts = url.split('#');
    var target = resolve(file, parts[0], absolute);
    if (!fs.existsSync(target)) {
      errors.push(rel + ': broken link "' + url + '"');
    } else if (parts[1] && /\.html$/.test(target) && !ids(target)[parts[1]]) {
      errors.push(rel + ': "' + url + '" points at a missing #' + parts[1]);
    }
    return '';
  });
});

// og:image and sitemap entries point at this site by absolute URL.
var sitemap = fs.readFileSync(path.join(siteDir, 'sitemap.xml'), 'utf8');
var urls = (sitemap.match(/<loc>([^<]+)<\/loc>/g) || []).map(function (s) { return s.replace(/<\/?loc>/g, ''); });
urls.concat(['og-image.png'].map(function (p) { return BASE + p; })).forEach(function (u) {
  if (u.indexOf(BASE) !== 0) return errors.push('sitemap: unexpected URL ' + u);
  var local = u.slice(BASE.length);
  var target = path.join(siteDir, local, /(^|\/)$/.test(local) ? 'index.html' : '');
  if (!fs.existsSync(target)) errors.push('sitemap/meta: ' + u + ' has no file');
});

function checkSnapshot() {
  var file = path.join(siteDir, 'data', 'stations.json');
  if (!fs.existsSync(file)) return errors.push('data/stations.json is missing');
  var raw = fs.readFileSync(file);
  if (raw.length > 150 * 1024) errors.push('data/stations.json is ' + raw.length + ' bytes (limit 150KB)');
  var data;
  try {
    data = JSON.parse(raw.toString('utf8'));
  } catch (e) {
    return errors.push('data/stations.json is not JSON: ' + e.message);
  }
  if (typeof data.generatedAt !== 'number' || !isFinite(data.generatedAt)) {
    errors.push('data/stations.json generatedAt must be a unix timestamp');
  }
  if (!Array.isArray(data.stations)) return errors.push('data/stations.json has no stations array');
  if (data.stations.length < 1500 || data.stations.length > 6000) {
    errors.push('data/stations.json has ' + data.stations.length + ' stations; expected the NYC system');
  }
  for (var i = 0; i < data.stations.length; i++) {
    var row = data.stations[i];
    if (!Array.isArray(row) || row.length !== 6 || typeof row[0] !== 'string' || !row[0]) {
      return errors.push('data/stations.json row ' + i + ' must be [name, lat, lon, bikes, ebikes, docks]');
    }
    if (typeof row[1] !== 'number' || row[1] < 40.4 || row[1] > 41.1) {
      return errors.push('data/stations.json row ' + i + ' latitude is outside the NYC area');
    }
    if (typeof row[2] !== 'number' || row[2] < -74.3 || row[2] > -73.6) {
      return errors.push('data/stations.json row ' + i + ' longitude is outside the NYC area');
    }
    for (var k = 3; k <= 5; k++) {
      if (typeof row[k] !== 'number' || row[k] < 0 || row[k] > 200 || row[k] !== Math.floor(row[k])) {
        return errors.push('data/stations.json row ' + i + ' has a bad count');
      }
    }
  }
}

function checkFallback() {
  var file = path.join(siteDir, 'hero-fallback.png');
  if (!fs.existsSync(file)) return errors.push('hero-fallback.png is missing');
  var buf = fs.readFileSync(file);
  if (buf.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    return errors.push('hero-fallback.png is not a PNG');
  }
  if (buf.length < 8000) errors.push('hero-fallback.png looks empty');
  var width = buf.readUInt32BE(16);
  var height = buf.readUInt32BE(20);
  if (width < 800 || height < 500) errors.push('hero-fallback.png is ' + width + 'x' + height);
}

function checkVendor() {
  var file = path.join(siteDir, 'vendor', 'three-map.js');
  var license = path.join(siteDir, 'vendor', 'three.LICENSE.txt');
  if (!fs.existsSync(file)) return errors.push('vendor/three-map.js is missing');
  var text = fs.readFileSync(file, 'utf8');
  if (text.length < 100 * 1024) errors.push('vendor/three-map.js is unexpectedly small');
  if (text.length > 700 * 1024) errors.push('vendor/three-map.js is unexpectedly large');
  ['WebGLRenderer', 'OrbitControls', 'InstancedMesh', 'SPDX-License-Identifier: MIT'].forEach(function (needle) {
    if (text.indexOf(needle) === -1) errors.push('vendor/three-map.js is missing "' + needle + '"');
  });
  if (!fs.existsSync(license)) return errors.push('vendor/three.LICENSE.txt is missing');
  var lic = fs.readFileSync(license, 'utf8');
  if (lic.indexOf('MIT License') === -1 || lic.toLowerCase().indexOf('three.js') === -1) {
    errors.push('vendor/three.LICENSE.txt does not look like the three.js MIT license');
  }
}

function checkHeroModules() {
  var index = fs.readFileSync(path.join(siteDir, 'index.html'), 'utf8');
  var head = index.slice(0, index.indexOf('</head>'));
  if (/three-map|city-scene/.test(head)) errors.push('three.js is referenced from <head>');
  if (index.indexOf('src="assets/hero.js"') === -1) errors.push('index.html does not load assets/hero.js');

  var heroPath = path.join(siteDir, 'assets', 'hero.js');
  var scenePath = path.join(siteDir, 'assets', 'city-scene.js');
  if (!fs.existsSync(heroPath)) return errors.push('assets/hero.js is missing');
  if (!fs.existsSync(scenePath)) return errors.push('assets/city-scene.js is missing');
  var hero = fs.readFileSync(heroPath, 'utf8');
  var scene = fs.readFileSync(scenePath, 'utf8');
  if (/^import\s/m.test(hero)) errors.push('assets/hero.js should lazy-load the scene, not statically import it');
  if (hero.indexOf("import('./city-scene.js')") === -1) errors.push('assets/hero.js does not lazy-import city-scene.js');
  if (hero.indexOf('data/stations.json') === -1) errors.push('assets/hero.js does not fetch data/stations.json');
  if (scene.indexOf('../vendor/three-map.js') === -1) errors.push('assets/city-scene.js does not import the vendored three.js build');

  [heroPath, scenePath].forEach(function (file) {
    var src = fs.readFileSync(file, 'utf8');
    var rel = path.relative(siteDir, file);
    var re = /(?:import\s*(?:[^'"]*?\sfrom\s*)?|import\()\s*['"](\.[^'"]+)['"]/g;
    var match;
    while ((match = re.exec(src))) {
      var target = path.resolve(path.dirname(file), match[1]);
      if (!fs.existsSync(target)) errors.push(rel + ': missing module "' + match[1] + '"');
    }
  });
}

checkSnapshot();
checkFallback();
checkVendor();
checkHeroModules();

function done() {
  if (errors.length) {
    console.error(errors.join('\n'));
    console.error('\n' + errors.length + ' problem(s) found.');
    process.exit(1);
  }
  console.log('Checked ' + pages.length + ' pages, ' + urls.length + ' sitemap URLs: all links resolve.');
}

if (!checkExternal) return done();

var list = Object.keys(externals);
var pending = list.length;
if (!pending) return done();
list.forEach(function (u) {
  fetch(u, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': 'citibike-site-check' } })
    .then(function (r) { if (!r.ok && r.status !== 403) errors.push(externals[u] + ': ' + u + ' returned ' + r.status); })
    .catch(function (e) { errors.push(externals[u] + ': ' + u + ' failed (' + e.message + ')'); })
    .then(function () { if (--pending === 0) done(); });
});
