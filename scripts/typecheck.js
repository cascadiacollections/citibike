#!/usr/bin/env node
'use strict';

/*
 * Type-checks a small consumer of the package with:
 *   tsc --strict --noEmit --module nodenext --moduleResolution nodenext
 *
 * The fixtures live in test/types and import the package by name
 * (`require` via `import = require`, and `import Citibike from "citibike"`).
 * Node and TypeScript only resolve that name from node_modules, and a link
 * back to this repo would make the package contain the tests. Stage the
 * published layout (package.json + lib/) under test/types/node_modules so
 * resolution uses the "types" field the way an installed dependency does.
 *
 * lib/ is build output (tsc compiles src/citibike.ts into it), so this needs
 * `npm run build` first. `npm test` does that in its `pretest` step.
 */

var fs = require('fs');
var path = require('path');
var spawnSync = require('child_process').spawnSync;

var root = path.join(__dirname, '..');
var stage = path.join(root, 'test', 'types', 'node_modules', 'citibike');
var tscJs = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');

function fail(message) {
  console.error(message);
  process.exit(1);
}

var pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
var declared = pkg.types;
if (typeof declared !== 'string' ||
    path.resolve(root, declared) !== path.resolve(root, 'lib', 'citibike.d.ts')) {
  fail('package.json "types" must point at lib/citibike.d.ts');
}
if (!fs.existsSync(path.join(root, 'lib', 'citibike.d.ts')) ||
    !fs.existsSync(path.join(root, 'lib', 'citibike.js'))) {
  fail('Missing lib/citibike.d.ts or lib/citibike.js. Run npm run build first.');
}
if (!fs.existsSync(tscJs)) {
  fail('typescript is not installed. Run npm install.');
}

var exitCode = 1;
try {
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  fs.copyFileSync(path.join(root, 'package.json'), path.join(stage, 'package.json'));
  fs.cpSync(path.join(root, 'lib'), path.join(stage, 'lib'), { recursive: true });

  var args = [
    '--strict',
    '--noEmit',
    '--module', 'nodenext',
    '--moduleResolution', 'nodenext',
    '-p', 'test/types'
  ];
  console.log('> tsc ' + args.join(' '));
  var result = spawnSync(process.execPath, [tscJs].concat(args), {
    cwd: root,
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  exitCode = result.status === null ? 1 : result.status;
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}

process.exit(exitCode);
