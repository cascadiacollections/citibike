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
var { pathToFileURL } = require('url');

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

function fail(message) { errors.push(message); }

function checkSnapshot() {
  var file = path.join(siteDir, 'data', 'stations.json');
  if (!fs.existsSync(file)) return fail('site/data/stations.json is missing');
  var raw = fs.readFileSync(file);
  if (raw.length > 160000) fail('site/data/stations.json is ' + raw.length + ' bytes (ceiling 160000)');
  var payload;
  try { payload = JSON.parse(raw.toString('utf8')); }
  catch (e) { return fail('site/data/stations.json is not JSON: ' + e.message); }
  if (!payload.generatedAt || Number.isNaN(Date.parse(payload.generatedAt))) fail('stations.json generatedAt is not a time');
  if (payload.lat0 !== 4060000 || payload.lon0 !== -7410000) fail('stations.json lat0/lon0 changed');
  if (!Array.isArray(payload.stations) || payload.stations.length < 2000) {
    return fail('stations.json has too few stations');
  }
  var seen = {};
  var known = null;
  payload.stations.forEach(function (row, i) {
    if (!Array.isArray(row) || row.length !== 8) {
      if (i < 3) fail('station row ' + i + ' should have 8 fields');
      return;
    }
    var lat = (payload.lat0 + row[2]) / 1e5;
    var lon = (payload.lon0 + row[3]) / 1e5;
    if (lat < 40.45 || lat > 41.05 || lon < -74.25 || lon > -73.7) {
      fail('station ' + row[0] + ' is outside the NYC area (' + lat + ', ' + lon + ')');
    }
    if (row[7] !== 0 && row[7] !== 1) fail('station ' + row[0] + ' active flag is not 0 or 1');
    var key = String(row[0]);
    if (seen[key]) fail('duplicate station id ' + key);
    seen[key] = true;
    if (row[1] === 'W 52 St & 11 Ave') known = { lat: lat, lon: lon };
  });
  if (!known) fail('snapshot is missing W 52 St & 11 Ave');
  else if (Math.abs(known.lat - 40.76727) > 0.002 || Math.abs(known.lon + 73.99393) > 0.002) {
    fail('W 52 St & 11 Ave is at the wrong coordinates');
  }
}

function checkVendor() {
  var file = path.join(siteDir, 'vendor', 'three-r187.min.js');
  var license = path.join(siteDir, 'vendor', 'three-LICENSE.txt');
  if (!fs.existsSync(file)) return fail('site/vendor/three-r187.min.js is missing');
  if (!fs.existsSync(license)) return fail('site/vendor/three-LICENSE.txt is missing');
  var src = fs.readFileSync(file, 'utf8');
  if (src.length < 400000 || src.length > 800000) fail('three bundle is an unexpected size (' + src.length + ')');
  if (src.indexOf('three.js r187') === -1 || src.indexOf('MIT') === -1) fail('three bundle is missing its license banner');
  ['OrbitControls', 'InstancedMesh', 'WebGLRenderer'].forEach(function (name) {
    if (src.indexOf('as ' + name) === -1) fail('three bundle does not export ' + name);
  });
  var png = path.join(siteDir, 'hero-fallback.png');
  if (!fs.existsSync(png)) return fail('site/hero-fallback.png is missing');
  var magic = fs.readFileSync(png).subarray(0, 8);
  var sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!magic.equals(sig)) fail('hero-fallback.png is not a PNG');
  var hero = fs.readFileSync(path.join(siteDir, 'assets', 'hero.js'), 'utf8');
  if (hero.indexOf('../vendor/three-r187.min.js') === -1) fail('hero.js does not load the vendored three build');
  var config = fs.readFileSync(path.join(siteDir, 'assets', 'config.js'), 'utf8');
  if (!/export const STATUS_WORKER_URL = '';/.test(config)) {
    fail('site/assets/config.js must ship with an empty STATUS_WORKER_URL');
  }
  var workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'snapshot.yml'), 'utf8');
  if (/npm publish/.test(workflow)) fail('snapshot workflow must not publish to npm');
  var pins = workflow.match(/uses: \S+@[0-9a-f]{40}/g) || [];
  if (pins.length < 2) fail('snapshot workflow should pin actions by commit SHA');
}

function memoryCache() {
  var store = new Map();
  return {
    match: function (req) {
      var hit = store.get(req.url);
      return Promise.resolve(hit ? hit.clone() : undefined);
    },
    put: function (req, res) {
      store.set(req.url, res.clone());
      return Promise.resolve();
    }
  };
}

function ctxFor(pending) {
  return { waitUntil: function (p) { pending.push(p); } };
}

async function checkLogic() {
  var diff = await import(pathToFileURL(path.join(siteDir, 'assets', 'diff.js')).href);
  var line = diff.tickerLine(2, 'W 52 St & 11 Ave');
  if (line !== '+2 bikes at W 52 St & 11 Ave') fail('tickerLine plus: ' + line);
  var down = diff.tickerLine(-1, 'W 52 St & 11 Ave');
  if (down !== '\u22121 bike at W 52 St & 11 Ave') fail('tickerLine minus: ' + down);
  var deltas = diff.bikeDeltas({ 72: 9, 73: 4 }, [[72, 11, 3, 20, 1], [73, 4, 0, 10, 1], [74, 1, 0, 1, 1]]);
  if (deltas.length !== 1 || deltas[0].id !== 72 || deltas[0].delta !== 2) fail('bikeDeltas did not keep the real change');

  var worker = await import(pathToFileURL(path.join(__dirname, '..', 'worker', 'src', 'index.js')).href);
  if (worker.PAGES_ORIGIN !== 'https://cascadiacollections.github.io') fail('worker CORS origin changed');
  var compact = worker.compactStatus({
    last_updated: 100,
    data: { stations: [
      { station_id: 'b', legacy_id: '20', num_bikes_available: 1, num_ebikes_available: 0, num_docks_available: 3, is_installed: 1, is_renting: 1 },
      { station_id: 'a', legacy_id: '3', num_bikes_available: 4, num_ebikes_available: 2, num_docks_available: 5, is_installed: 0, is_renting: 1 }
    ] }
  });
  if (compact.ttl !== 60 || compact.t !== 100) fail('compact status metadata');
  if (compact.s.length !== 2 || compact.s[0][0] !== 3 || compact.s[1][0] !== 20 || compact.s[0][4] !== 0) {
    fail('compact status rows: ' + JSON.stringify(compact.s));
  }

  var fixture = JSON.stringify({
    last_updated: 50,
    ttl: 60,
    data: { stations: [{ station_id: 'u', legacy_id: '9', num_bikes_available: 2, num_ebikes_available: 1, num_docks_available: 8, is_installed: 1, is_renting: 1 }] }
  });
  var calls = [];
  var cache = memoryCache();
  async function run(pathName, method, origin) {
    var pending = [];
    var res = await worker.handle(new Request('https://citibike-status.example' + pathName, {
      method: method || 'GET',
      headers: origin ? { Origin: origin } : {}
    }), ctxFor(pending), {
      cache: cache,
      fetch: function (url) {
        calls.push(url);
        return Promise.resolve(new Response(fixture, { status: 200, headers: { 'content-type': 'application/json' } }));
      }
    });
    await Promise.all(pending);
    return res;
  }

  var first = await run('/station_status');
  var second = await run('/');
  if (calls.length !== 1 || calls[0] !== 'https://gbfs.citibikenyc.com/gbfs/en/station_status.json') {
    fail('worker fetched upstream ' + calls.length + ' times: ' + calls.join(', '));
  }
  if (first.headers.get('cache-control') !== 'public, max-age=60') fail('cache-control is ' + first.headers.get('cache-control'));
  if (first.headers.get('access-control-allow-origin') !== worker.PAGES_ORIGIN) fail('CORS origin was reflected or missing');
  var body = await first.json();
  if (!body.s || body.s[0][0] !== 9 || body.s[0][1] !== 2) fail('worker body was not the compact feed');
  var again = await second.json();
  if (again.s[0][0] !== 9) fail('cached body did not replay');

  calls.length = 0;
  var missing = await run('/anything-else');
  if (missing.status !== 404 || calls.length !== 0) fail('worker proxied a non-status path');
  var evil = await run('/station_status', 'GET', 'https://evil.example');
  if (evil.headers.get('access-control-allow-origin') !== worker.PAGES_ORIGIN) fail('worker echoed a foreign Origin');
  var denied = await worker.handle(new Request('https://citibike-status.example/station_status', { method: 'POST' }), ctxFor([]), {
    cache: cache,
    fetch: function () { calls.push('post'); return Promise.resolve(new Response('no')); }
  });
  if (denied.status !== 405) fail('POST should be 405');

  var busted = memoryCache();
  var bad = await worker.handle(new Request('https://citibike-status.example/station_status'), ctxFor([]), {
    cache: busted,
    fetch: function () { return Promise.resolve(new Response('nope', { status: 503 })); }
  });
  if (bad.status !== 502) fail('upstream error should be 502, got ' + bad.status);
  var retried = [];
  await worker.handle(new Request('https://citibike-status.example/station_status'), ctxFor([]), {
    cache: busted,
    fetch: function () { retried.push(1); return Promise.resolve(new Response('nope', { status: 503 })); }
  });
  if (retried.length !== 1) fail('an error response was cached');
}

function done() {
  if (errors.length) {
    console.error(errors.join('\n'));
    console.error('\n' + errors.length + ' problem(s) found.');
    process.exit(1);
  }
  console.log('Checked ' + pages.length + ' pages, ' + urls.length + ' sitemap URLs: all links resolve.');
}

async function main() {
  checkSnapshot();
  checkVendor();
  await checkLogic();
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
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
