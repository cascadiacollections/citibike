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
