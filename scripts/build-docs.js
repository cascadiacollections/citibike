#!/usr/bin/env node
'use strict';

/*
 * Builds the API reference page (site/api/index.html) from the JSDoc comments
 * in lib/citibike.js. No dependencies. The output is generated on every deploy
 * and never committed (see .gitignore).
 *
 * Reads these JSDoc tags: @class, @method, @typedef, @param, @property,
 * @returns, @example, @deprecated, @private, and {@link Name} in text.
 */

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var pkg = require(path.join(root, 'package.json'));
var source = fs.readFileSync(path.join(root, 'lib', 'citibike.js'), 'utf8');
var outDir = path.join(root, 'site', 'api');

// ---------------------------------------------------------------- parsing

function parseBlocks(src) {
  var blocks = [];
  var re = /\/\*\*([\s\S]*?)\*\/[ \t]*\n([^\n]*)/g;
  var m;
  while ((m = re.exec(src))) {
    var lines = m[1].split('\n').map(function (l) { return l.replace(/^\s*\* ?/, ''); });
    var description = [];
    var tags = [];
    var current = null;
    lines.forEach(function (line) {
      var t = /^@(\w+)\s*(.*)$/.exec(line);
      if (t) {
        current = { tag: t[1], text: t[2] };
        tags.push(current);
      } else if (current) {
        current.text += '\n' + line;
      } else {
        description.push(line);
      }
    });
    tags.forEach(function (t) { t.text = t.text.replace(/\s+$/, ''); });
    blocks.push({
      description: description.join('\n').trim(),
      tags: tags,
      code: m[2].trim()
    });
  }
  return blocks;
}

function has(block, tag) {
  return block.tags.some(function (t) { return t.tag === tag; });
}

function all(block, tag) {
  return block.tags.filter(function (t) { return t.tag === tag; });
}

// "{Type} [name=default] text" or "{Type} name - text"
function parseNamed(text) {
  var m = /^\{([^}]*)\}\s+(\[[^\]]*\]|\S+)\s*([\s\S]*)$/.exec(text);
  if (!m) throw new Error('Cannot parse JSDoc tag: ' + text);
  var name = m[2];
  var optional = false;
  var def = null;
  if (name.charAt(0) === '[') {
    optional = true;
    name = name.slice(1, -1);
    var eq = name.indexOf('=');
    if (eq !== -1) {
      def = name.slice(eq + 1);
      name = name.slice(0, eq);
    }
  }
  return {
    type: m[1],
    name: name,
    optional: optional,
    def: def,
    text: m[3].replace(/^-\s*/, '').replace(/\s*\n\s*/g, ' ').trim()
  };
}

function parseTyped(text) {
  var m = /^\{([^}]*)\}\s*([\s\S]*)$/.exec(text);
  return m ? { type: m[1], text: m[2].replace(/\s*\n\s*/g, ' ').trim() } : { type: '', text: text };
}

// -------------------------------------------------------------- rendering

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Inline markup: `code` and {@link Name} / {@link Class#method}.
function inline(s) {
  return esc(s)
    .replace(/\{@link\s+([^}\s]+)\}/g, function (_, ref) {
      var name = ref.split('#').pop();
      return '<a href="#' + name + '"><code>' + name + '</code></a>';
    })
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function paragraphs(text) {
  return text.split(/\n\s*\n/).filter(Boolean).map(function (p) {
    return '<p>' + inline(p.replace(/\s*\n\s*/g, ' ')) + '</p>';
  }).join('\n');
}

function typeCell(type) {
  var known = {};
  parsed.typedefs.forEach(function (t) { known[t.name] = true; });
  var base = type.replace(/\[\]$/, '');
  var html = esc(type);
  if (known[base]) html = '<a href="#' + base + '">' + esc(base) + '</a>' + esc(type.slice(base.length));
  return '<span class="type">' + html + '</span>';
}

function paramTable(rows, kind) {
  var showDefault = rows.some(function (r) { return r.def !== null; });
  var head = '<tr><th>Name</th><th>Type</th>' + (showDefault ? '<th>Default</th>' : '') + '<th>Description</th></tr>';
  var body = rows.map(function (r) {
    var name = '<code>' + esc(r.name) + '</code>' + (r.optional ? '' : ' <span class="type">(required)</span>');
    if (kind === 'property' && !r.optional) name = '<code>' + esc(r.name) + '</code>';
    return '<tr><td>' + name + '</td><td>' + typeCell(r.type) + '</td>' +
      (showDefault ? '<td>' + (r.def !== null ? '<code>' + esc(r.def) + '</code>' : '') + '</td>' : '') +
      '<td>' + inline(r.text) + '</td></tr>';
  }).join('\n');
  return '<div class="table-wrap"><table>\n<thead>' + head + '</thead>\n<tbody>\n' + body + '\n</tbody></table></div>';
}

function examples(block) {
  return all(block, 'example').map(function (e) {
    return '<pre><code>' + esc(e.text) + '</code></pre>';
  }).join('\n');
}

function signature(name, params) {
  var parts = params.map(function (p) { return p.optional ? '[' + p.name + ']' : p.name; });
  return name + '(' + parts.join(', ') + ')';
}

function renderMethod(m) {
  var sigParams = m.params.filter(function (p) { return p.name.indexOf('.') === -1; });
  var out = '<div class="entry" id="' + m.name + '">\n';
  out += '<h3>' + esc(signature('citibike.' + m.name, sigParams));
  if (m.deprecated !== null) out += ' <span class="badge warn">discontinued</span>';
  out += ' <a class="anchor" href="#' + m.name + '" aria-label="Link to ' + m.name + '">#</a></h3>\n';
  out += paragraphs(m.description) + '\n';
  if (m.deprecated !== null && m.deprecated) out += '<p><strong>Discontinued.</strong> ' + inline(m.deprecated) + '</p>\n';
  if (m.params.length) out += '<p class="h4">Parameters</p>\n' + paramTable(m.params, 'param') + '\n';
  if (m.returns) out += '<p class="h4">Returns</p>\n<p>' + typeCell(m.returns.type) + ' ' + inline(m.returns.text) + '</p>\n';
  if (m.examples) out += '<p class="h4">Example</p>\n' + m.examples + '\n';
  return out + '</div>';
}

function renderTypedef(t) {
  var out = '<div class="entry" id="' + t.name + '">\n';
  out += '<h3>' + esc(t.name) + ' <a class="anchor" href="#' + t.name + '" aria-label="Link to ' + t.name + '">#</a></h3>\n';
  out += paragraphs(t.description) + '\n';
  out += paramTable(t.properties, 'property') + '\n';
  return out + '</div>';
}

// ------------------------------------------------------------------ build

var parsed = { cls: null, methods: [], typedefs: [] };

parseBlocks(source).forEach(function (b) {
  if (has(b, 'private')) return;

  if (has(b, 'typedef')) {
    var td = /^\{[^}]*\}\s*(\S+)/.exec(all(b, 'typedef')[0].text);
    parsed.typedefs.push({
      name: td[1],
      description: b.description,
      properties: all(b, 'property').map(function (p) { return parseNamed(p.text); })
    });
  } else if (has(b, 'class')) {
    parsed.cls = {
      name: all(b, 'class')[0].text.trim(),
      description: b.description,
      params: all(b, 'param').map(function (p) { return parseNamed(p.text); }),
      examples: examples(b)
    };
  } else if (has(b, 'method')) {
    var dep = all(b, 'deprecated')[0];
    var ret = all(b, 'returns')[0];
    parsed.methods.push({
      name: all(b, 'method')[0].text.trim(),
      description: b.description,
      params: all(b, 'param').map(function (p) { return parseNamed(p.text); }),
      returns: ret ? parseTyped(ret.text) : null,
      deprecated: dep ? dep.text : null,
      examples: examples(b)
    });
  }
});

if (!parsed.cls) throw new Error('No @class block found in lib/citibike.js');
['get', 'getStations', 'getBranches', 'getHelmets'].forEach(function (n) {
  if (!parsed.methods.some(function (m) { return m.name === n; })) {
    throw new Error('Missing JSDoc for method ' + n);
  }
});
['Options', 'Station', 'StationsResult', 'ErrorResult'].forEach(function (n) {
  if (!parsed.typedefs.some(function (t) { return t.name === n; })) {
    throw new Error('Missing JSDoc @typedef ' + n);
  }
});

var order = ['getStations', 'get', 'getBranches', 'getHelmets'];
var methods = order.map(function (n) {
  return parsed.methods.filter(function (m) { return m.name === n; })[0];
});
var typeOrder = ['Options', 'StationsResult', 'Station', 'ErrorResult'];
var typedefs = typeOrder.map(function (n) {
  return parsed.typedefs.filter(function (t) { return t.name === n; })[0];
});

var toc = '<h2>Client</h2><ul><li><a href="#Citibike">new Citibike()</a></li></ul>' +
  '<h2>Methods</h2><ul>' + methods.map(function (m) {
    return '<li><a href="#' + m.name + '"><code>' + m.name + '()</code></a></li>';
  }).join('') + '</ul>' +
  '<h2>Types</h2><ul>' + typedefs.map(function (t) {
    return '<li><a href="#' + t.name + '"><code>' + t.name + '</code></a></li>';
  }).join('') + '</ul>';

var html = [
  '<!DOCTYPE html>',
  '<html lang="en">',
  '<head>',
  '  <meta charset="UTF-8" />',
  '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
  '  <title>API reference · citibike</title>',
  '  <meta name="description" content="API reference for citibike ' + esc(pkg.version) + ': the client constructor and its options, getStations, get, and the shape of every result." />',
  '  <link rel="canonical" href="https://cascadiacollections.github.io/citibike/api/" />',
  '  <meta name="color-scheme" content="light dark" />',
  '  <link rel="icon" href="../assets/favicon.svg" type="image/svg+xml" />',
  '  <link rel="stylesheet" href="../assets/site.css" />',
  '</head>',
  '<body>',
  '  <a class="skip" href="#main">Skip to content</a>',
  '  <header class="site-header">',
  '    <div class="wrap nav">',
  '      <a class="brand" href="../"><img src="../assets/favicon.svg" alt="" width="26" height="26" />citibike</a>',
  '      <nav aria-label="Primary"><ul>',
  '        <li><a href="../#install">Install</a></li>',
  '        <li><a href="../#example">Example</a></li>',
  '        <li><a href="./" aria-current="page">API reference</a></li>',
  '        <li><a href="https://github.com/cascadiacollections/citibike">GitHub</a></li>',
  '      </ul></nav>',
  '    </div>',
  '  </header>',
  '  <div class="wrap doc">',
  '    <nav class="toc" aria-label="On this page">' + toc + '</nav>',
  '    <main id="main">',
  '      <h1>API reference</h1>',
  '      <p class="intro">citibike ' + esc(pkg.version) + '. Generated from the JSDoc comments in <a href="https://github.com/cascadiacollections/citibike/blob/master/lib/citibike.js"><code>lib/citibike.js</code></a>.</p>',
  '      <p>Every method takes a Node-style callback that receives a single object. When something goes wrong that object is an <a href="#ErrorResult"><code>ErrorResult</code></a> with <code>ok: false</code>, so check <code>data.ok</code> first. The only things that throw are a missing callback and a null URL passed to <code>get()</code>.</p>',
  '      <section>',
  '        <h2>Client</h2>',
  '        <div class="entry" id="Citibike">',
  '          <h3>new Citibike([options]) <a class="anchor" href="#Citibike" aria-label="Link to Citibike">#</a></h3>',
  paragraphs(parsed.cls.description),
  '          <p class="h4">Parameters</p>',
  paramTable(parsed.cls.params, 'param'),
  '          <p>See <a href="#Options"><code>Options</code></a> for every option and its default.</p>',
  '          <p class="h4">Example</p>',
  parsed.cls.examples,
  '        </div>',
  '      </section>',
  '      <section>',
  '        <h2>Methods</h2>',
  methods.map(renderMethod).join('\n'),
  '      </section>',
  '      <section>',
  '        <h2>Types</h2>',
  typedefs.map(renderTypedef).join('\n'),
  '      </section>',
  '    </main>',
  '  </div>',
  '  <footer class="site-footer"><div class="wrap">',
  '    <p>MIT licensed. citibike is an independent project and isn\'t affiliated with Citi Bike, Lyft or Citi.</p>',
  '    <p><a href="../">Home</a> · <a href="https://github.com/cascadiacollections/citibike">GitHub</a> · <a href="https://www.npmjs.com/package/citibike">npm</a></p>',
  '  </div></footer>',
  '</body>',
  '</html>',
  ''
].join('\n');

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), html);
console.log('Wrote site/api/index.html (' + methods.length + ' methods, ' + typedefs.length + ' types)');
