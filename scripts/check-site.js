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

var PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// Returns { width, height } for a PNG in site/, or null after reporting why not.
function pngSize(rel, minBytes) {
  var file = path.join(siteDir, rel);
  if (!fs.existsSync(file)) { fail('site/' + rel + ' is missing'); return null; }
  var buf = fs.readFileSync(file);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIG)) { fail(rel + ' is not a PNG'); return null; }
  if (buf.length < minBytes) fail(rel + ' looks empty (' + buf.length + ' bytes)');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// Same for a WebP. Reads the canvas size from a lossless (VP8L), lossy (VP8)
// or extended (VP8X) header.
function webpSize(rel, minBytes) {
  var file = path.join(siteDir, rel);
  if (!fs.existsSync(file)) { fail('site/' + rel + ' is missing'); return null; }
  var buf = fs.readFileSync(file);
  if (buf.length < 30 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') {
    fail(rel + ' is not a WebP');
    return null;
  }
  if (buf.length < minBytes) fail(rel + ' looks empty (' + buf.length + ' bytes)');
  var kind = buf.toString('latin1', 12, 16);
  if (kind === 'VP8L' && buf[20] === 0x2f) {
    var bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (kind === 'VP8X') return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  if (kind === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  fail(rel + ' has an unknown WebP header (' + kind + ')');
  return null;
}

function attr(tag, name) {
  var m = new RegExp('\\s' + name + '="([^"]*)"').exec(tag || '');
  return m ? m[1] : null;
}

// The raster images are committed, not built (see scripts/render-fallback.js),
// so check that each one exists, is what its extension says, has the size the
// markup declares, and is still referenced.
function checkImages() {
  var indexHtml = fs.readFileSync(path.join(siteDir, 'index.html'), 'utf8');

  var png = pngSize('hero-fallback.png', 8000);
  var webp = webpSize('hero-fallback.webp', 8000);
  if (png && (png.width < 800 || png.height < 500)) fail('hero-fallback.png is ' + png.width + 'x' + png.height);
  if (png && webp && (png.width !== webp.width || png.height !== webp.height)) {
    fail('hero-fallback.webp is ' + webp.width + 'x' + webp.height + ' but the PNG is ' + png.width + 'x' + png.height + '; rerun scripts/render-fallback.js');
  }
  if (fs.existsSync(path.join(siteDir, 'hero-fallback.webp')) && fs.existsSync(path.join(siteDir, 'hero-fallback.png')) &&
      fs.statSync(path.join(siteDir, 'hero-fallback.webp')).size >= fs.statSync(path.join(siteDir, 'hero-fallback.png')).size) {
    fail('hero-fallback.webp is not smaller than the PNG it replaces');
  }
  var picture = /<picture>([\s\S]*?)<\/picture>/.exec(indexHtml);
  var source = picture && /<source\b[^>]*>/.exec(picture[1]);
  var img = picture && /<img\b[^>]*>/.exec(picture[1]);
  if (!source || attr(source[0], 'srcset') !== 'hero-fallback.webp' || attr(source[0], 'type') !== 'image/webp') {
    fail('index.html should offer hero-fallback.webp in a <picture> <source type="image/webp">');
  }
  if (!img || attr(img[0], 'src') !== 'hero-fallback.png') {
    fail('index.html should keep hero-fallback.png as the <img> fallback inside <picture>');
  } else if (png && (attr(img[0], 'width') !== String(png.width) || attr(img[0], 'height') !== String(png.height))) {
    fail('the hero <img> width/height do not match hero-fallback.png (' + png.width + 'x' + png.height + ')');
  } else if (/\sloading="lazy"/.test(img[0])) {
    fail('the hero <img> is above the fold and must not be lazy-loaded');
  }

  var og = pngSize('og-image.png', 8000);
  var ogW = /property="og:image:width" content="(\d+)"/.exec(indexHtml);
  var ogH = /property="og:image:height" content="(\d+)"/.exec(indexHtml);
  if (og && (og.width !== 1200 || og.height !== 630)) fail('og-image.png is ' + og.width + 'x' + og.height + ', expected 1200x630');
  if (og && (!ogW || !ogH || +ogW[1] !== og.width || +ogH[1] !== og.height)) fail('og:image:width/height do not match og-image.png');
  if (!/property="og:image:alt" content="[^"]+"/.test(indexHtml)) fail('og:image:alt is missing');

  [['assets/favicon-32.png', 32, /<link rel="icon" href="assets\/favicon-32\.png" sizes="32x32"/],
   ['assets/apple-touch-icon.png', 180, /<link rel="apple-touch-icon" href="assets\/apple-touch-icon\.png"/]].forEach(function (icon) {
    var size = pngSize(icon[0], 200);
    if (size && (size.width !== icon[1] || size.height !== icon[1])) {
      fail(icon[0] + ' is ' + size.width + 'x' + size.height + ', expected ' + icon[1] + 'x' + icon[1]);
    }
    if (!icon[2].test(indexHtml)) fail('index.html does not link ' + icon[0]);
  });
  if (!fs.existsSync(path.join(siteDir, 'assets', 'favicon.svg'))) fail('site/assets/favicon.svg is missing');
  ['light', 'dark'].forEach(function (scheme) {
    if (!new RegExp('<meta name="theme-color" content="#[0-9a-f]{6}" media="\\(prefers-color-scheme: ' + scheme + '\\)"').test(indexHtml)) {
      fail('index.html has no theme-color for the ' + scheme + ' scheme');
    }
  });
}

function checkStatusWorker() {
  var config = fs.readFileSync(path.join(siteDir, 'assets', 'config.js'), 'utf8');
  var match = config.match(/^export const STATUS_WORKER_URL = '([^']*)';$/m);
  if (!match) {
    fail('site/assets/config.js must set STATUS_WORKER_URL to one single-quoted string');
  } else if (match[1] !== '' && !/^https:\/\/[A-Za-z0-9.-]+\/station_status$/.test(match[1])) {
    fail('STATUS_WORKER_URL must be empty or an https URL ending in /station_status');
  }

  // One assignment in the whole site, so deploy is a one-line edit.
  var assignments = 0;
  walk(siteDir).forEach(function (file) {
    if (!/\.js$/.test(file) || file.indexOf(path.sep + 'vendor' + path.sep) !== -1) return;
    var found = fs.readFileSync(file, 'utf8').match(/STATUS_WORKER_URL\s*=/g);
    if (found) assignments += found.length;
  });
  if (assignments !== 1) {
    fail('STATUS_WORKER_URL must be assigned once, in site/assets/config.js (found ' + assignments + ')');
  }

  var hero = fs.readFileSync(path.join(siteDir, 'assets', 'hero.js'), 'utf8');
  if (hero.indexOf("import { STATUS_WORKER_URL } from './config.js';") === -1) {
    fail('hero.js must import STATUS_WORKER_URL from config.js');
  }
  // startPolling and canPoll both refuse to run while the URL is empty, so
  // the map stays on the snapshot and does not invent bike changes.
  if (hero.indexOf('if (!STATUS_WORKER_URL) return;') === -1 || hero.indexOf('!!STATUS_WORKER_URL') === -1) {
    fail('hero.js must not poll when STATUS_WORKER_URL is empty');
  }
  // Two fetches: the snapshot file, and the Worker URL from config.js.
  // A third fetch would be a hardcoded live feed.
  var fetches = hero.match(/\bfetch\s*\(/g) || [];
  if (fetches.length !== 2 || hero.indexOf("fetch('data/stations.json'") === -1 || hero.indexOf('fetch(STATUS_WORKER_URL') === -1) {
    fail('hero.js must fetch only the station snapshot and STATUS_WORKER_URL');
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
  var hero = fs.readFileSync(path.join(siteDir, 'assets', 'hero.js'), 'utf8');
  if (hero.indexOf('../vendor/three-r187.min.js') === -1) fail('hero.js does not load the vendored three build');
  if (hero.indexOf('data/stations.json') === -1) fail('hero.js does not fetch the station snapshot');
  var indexHtml = fs.readFileSync(path.join(siteDir, 'index.html'), 'utf8');
  var headEnd = indexHtml.indexOf('</head>');
  var head = headEnd === -1 ? indexHtml : indexHtml.slice(0, headEnd);
  if (/three-r187|three-map|city-scene/.test(head)) fail('three.js is referenced from <head>');
  // hero.js and its static imports are modulepreloaded so they arrive together.
  // Keep that list exact: a missing entry costs a round trip, a stale one a wasted fetch.
  var imported = ['hero.js'].concat((hero.match(/^import [^;]*? from '\.\/[^']+';/gm) || []).map(function (line) {
    return /'\.\/([^']+)'/.exec(line)[1];
  })).sort();
  var preloaded = (head.match(/<link rel="modulepreload" href="assets\/[^"]+"/g) || []).map(function (tag) {
    return /assets\/([^"]+)/.exec(tag)[1];
  }).sort();
  if (imported.join(' ') !== preloaded.join(' ')) {
    fail('modulepreload links (' + preloaded.join(', ') + ') do not match hero.js and its imports (' + imported.join(', ') + ')');
  }
  // The snapshot is fetched by hero.js after first paint, and only once the hero is on screen.
  if (/stations\.json/.test(head)) fail('the station snapshot is referenced from <head>');
  if (/<script\b(?![^>]*\btype="(?:module|application\/ld\+json)")(?![^>]*\b(?:defer|async)\b)[^>]*>/.test(head)) {
    fail('index.html has a render-blocking script in <head>');
  }
  checkStatusWorker();
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
  if (calls.length !== 1 || calls[0] !== 'https://gbfs.lyft.com/gbfs/1.1/bkn/en/station_status.json') {
    fail('worker fetched upstream ' + calls.length + ' times: ' + calls.join(', '));
  }
  if (first.headers.get('cache-control') !== 'public, max-age=60') fail('cache-control is ' + first.headers.get('cache-control'));
  if (first.headers.get('access-control-allow-origin') !== 'https://cascadiacollections.github.io') fail('CORS origin was reflected or missing');
  var body = await first.json();
  if (!body.s || body.s[0][0] !== 9 || body.s[0][1] !== 2) fail('worker body was not the compact feed');
  var again = await second.json();
  if (again.s[0][0] !== 9) fail('cached body did not replay');

  calls.length = 0;
  var missing = await run('/anything-else');
  if (missing.status !== 404 || calls.length !== 0) fail('worker proxied a non-status path');
  var evil = await run('/station_status', 'GET', 'https://evil.example');
  if (evil.headers.get('access-control-allow-origin') !== 'https://cascadiacollections.github.io') fail('worker echoed a foreign Origin');
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
  checkImages();
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
