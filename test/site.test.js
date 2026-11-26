/**
 * Black-box check of the docs pipeline: build the API reference, then run the
 * site checker over the result, each as the child process `npm run docs` and
 * `npm run docs:check` would start. Offline: the checker only fetches external
 * links when given --external.
 *
 * It asserts on what the scripts print and write, not on which source file the
 * generator reads, so it holds whether that is lib/citibike.js or src/citibike.ts.
 * Runner: node:test. Assertions: node:assert/strict.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function run(script) {
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(root, 'scripts', script)], { cwd: root }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code : 0, stdout: stdout, stderr: stderr });
    });
  });
}

describe('docs site', () => {
  it('should build the API reference and pass the site check', async () => {
    const build = await run('build-docs.js');
    assert.equal(build.code, 0, build.stderr);
    assert.match(build.stdout, /Wrote site\/api\/index\.html \(\d+ methods, \d+ types\)/);

    const html = fs.readFileSync(path.join(root, 'site', 'api', 'index.html'), 'utf8');
    ['stations', 'station', 'nearest', 'feed', 'clearCache', 'getStations', 'get', 'getBranches', 'getHelmets'].forEach((method) => {
      assert.ok(html.indexOf('id="' + method + '"') !== -1, 'the API reference has no section for ' + method + '()');
    });

    const check = await run('check-site.js');
    assert.equal(check.code, 0, check.stderr);
    assert.match(check.stdout, /Checked \d+ pages, \d+ sitemap URLs: all links resolve\./);
  });
});
