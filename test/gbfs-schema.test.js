/**
 * The canonical GBFS 1.1 fixtures must pass MobilityData's schema with zero
 * errors. The client targets 1.1: restBase defaults to
 * https://gbfs.citibikenyc.com/gbfs/en, and the Worker reads the 1.1
 * station_status feed because the 2.3 file drops legacy_id.
 *
 * test/fixtures/station_information.json and station_status.json stay loose
 * on purpose (labeled 2.3, with is_installed as both a boolean and 0/1).
 * This file does not rewrite them.
 *
 * Runner: node:test. Assertions: node:assert/strict.
 * Nothing here contacts the live feed.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const validate = require('gbfs-validator/validate');
const GBFS = require('gbfs-validator');
const support = require('./support/server');
const gbfsScript = require('../scripts/gbfs-validate');

const DIR = path.join(__dirname, 'fixtures', 'canonical', '1.1');
const SCHEMA_DIR = path.join('gbfs-validator', 'versions', 'gbfs-json-schema', 'v1.1');
const FEED_FILES = ['gbfs', 'system_information', 'station_information', 'station_status'];

function read(name) {
  return fs.readFileSync(path.join(DIR, name), 'utf8');
}

function schema(name) {
  return require(path.join(SCHEMA_DIR, name + '.json'));
}

describe('canonical GBFS 1.1 fixtures', () => {
  FEED_FILES.forEach((name) => {
    it('should accept ' + name + '.json with zero schema errors', () => {
      const result = validate(schema(name), JSON.parse(read(name + '.json')));
      assert.equal(result.errors, false);
    });
  });

  it('should keep the version the client targets', () => {
    FEED_FILES.forEach((name) => {
      assert.equal(JSON.parse(read(name + '.json')).version, '1.1');
    });
  });
});

describe('canonical feed through gbfs-validator', () => {
  let server;

  before(async () => {
    server = await support.start({
      '/gbfs.json': {
        body: () => read('gbfs.json').split('https://fixtures.invalid').join(server.base)
      },
      '/system_information.json': { body: read('system_information.json') },
      '/station_information.json': { body: read('station_information.json') },
      '/station_status.json': { body: read('station_status.json') }
    });
  });

  after(async () => {
    await support.stop(server);
  });

  it('should validate the docked 1.1 feed with zero errors', async () => {
    const report = await new GBFS(server.base + '/gbfs.json', {
      docked: true,
      version: '1.1'
    }).validation();
    const shapes = gbfsScript.shapesFromReport(report);
    assert.deepEqual(shapes, []);
    assert.equal(report.summary.hasErrors, false);
    assert.equal(report.summary.errorsCount, 0);
    assert.equal(report.summary.version.validated, '1.1');
  });
});

describe('error shapes', () => {
  it('should collapse the same station error into one shape', () => {
    const stationError = (index) => ({
      keyword: 'minimum',
      instancePath: '/data/stations/' + index + '/last_reported',
      schemaPath: '#/properties/data/properties/stations/items/properties/last_reported/minimum',
      message: 'must be >= 1450155600'
    });
    const report = {
      files: [
        {
          file: 'station_status.json',
          required: true,
          exists: true,
          languages: [
            { lang: 'en', exists: true, errors: [stationError(0), stationError(1), stationError(2)] },
            { lang: 'fr', exists: true, errors: [stationError(0), stationError(4)] }
          ]
        },
        {
          file: 'system_pricing_plans.json',
          required: false,
          exists: true,
          languages: [
            {
              lang: 'en',
              exists: true,
              errors: [
                {
                  keyword: 'type',
                  instancePath: '/data/plans/0/price',
                  schemaPath: '#/properties/data/properties/plans/items/properties/price/type',
                  message: 'must be number'
                },
                {
                  keyword: 'type',
                  instancePath: '/data/plans/0/is_taxable',
                  schemaPath: '#/properties/data/properties/plans/items/properties/is_taxable/type',
                  message: 'must be number'
                }
              ]
            }
          ]
        }
      ]
    };

    const shapes = gbfsScript.shapesFromReport(report);
    assert.deepEqual(shapes.map((shape) => shape.file + ' ' + shape.keyword), [
      'station_status.json minimum',
      'system_pricing_plans.json type',
      'system_pricing_plans.json type'
    ]);
    assert.equal(shapes[0].sample.instancePath, '/data/stations/0/last_reported');
    assert.equal(shapes.filter((shape) => shape.schemaPath.endsWith('/price/type')).length, 1);
    assert.equal(shapes.filter((shape) => shape.schemaPath.endsWith('/is_taxable/type')).length, 1);
  });

  it('should treat a missing required file as one shape', () => {
    const shapes = gbfsScript.shapesFromReport({
      files: [{
        file: 'system_information.json',
        required: true,
        exists: false,
        errors: false,
        languages: [
          { lang: 'en', exists: false, errors: false },
          { lang: 'fr', exists: false, errors: false }
        ]
      }]
    });
    assert.deepEqual(shapes, [{ file: 'system_information.json', schemaPath: '', keyword: 'missing' }]);
  });

  it('should ignore notes and samples when comparing to the baseline', () => {
    const current = [{
      file: 'gbfs.json',
      schemaPath: '#/name/enum',
      keyword: 'enum',
      sample: { instancePath: '/data/en/feeds/1/name', message: 'must be equal to one of the allowed values' }
    }];
    const baseline = [{
      file: 'gbfs.json',
      schemaPath: '#/name/enum',
      keyword: 'enum',
      note: 'already known'
    }];
    const same = gbfsScript.diffShapes(baseline, current);
    assert.deepEqual(same.newShapes, []);
    assert.deepEqual(same.resolvedShapes, []);

    const extra = current.concat([{
      file: 'station_status.json',
      schemaPath: '#/properties/last_reported/minimum',
      keyword: 'minimum'
    }]);
    const changed = gbfsScript.diffShapes(baseline, extra);
    assert.equal(changed.newShapes.length, 1);
    assert.equal(changed.newShapes[0].file, 'station_status.json');
    assert.deepEqual(changed.resolvedShapes, []);
  });

  it('should describe the shapes the live 1.1 feed is already known for', () => {
    assert.match(gbfsScript.noteFor({
      file: 'gbfs.json',
      schemaPath: '#/properties/data/patternProperties/x/properties/feeds/items/properties/name/enum',
      keyword: 'enum'
    }), /ebikes_at_stations/);
    assert.match(gbfsScript.noteFor({
      file: 'gbfs_versions.json',
      schemaPath: '#/properties/data/properties/versions/items/properties/version/enum',
      keyword: 'enum'
    }), /v1\.1/);
    assert.match(gbfsScript.noteFor({
      file: 'station_status.json',
      schemaPath: '#/properties/data/properties/stations/items/properties/last_reported/minimum',
      keyword: 'minimum'
    }), /last_reported/);
    assert.match(gbfsScript.noteFor({
      file: 'system_pricing_plans.json',
      schemaPath: '#/properties/data/properties/plans/items/properties/price/type',
      keyword: 'type'
    }), /price/);
    assert.match(gbfsScript.noteFor({
      file: 'system_pricing_plans.json',
      schemaPath: '#/properties/data/properties/plans/items/properties/is_taxable/type',
      keyword: 'type'
    }), /is_taxable/);
  });
});

describe('GBFS 1.1 baseline', () => {
  const baseline = require('../scripts/gbfs-baseline.json');

  it('should record the live 1.1 discovery file and the known shapes', () => {
    assert.equal(baseline.url, gbfsScript.FEEDS['1.1']);
    assert.equal(baseline.gbfsVersion, '1.1');
    assert.equal(baseline.docked, true);
    assert.equal(baseline.validatorVersion, '1.0.18');
    assert.deepEqual(
      baseline.shapes.map((shape) => shape.file + ' ' + shape.keyword + ' ' + shape.schemaPath.split('/').slice(-2).join('/')),
      [
        'gbfs.json enum name/enum',
        'gbfs_versions.json enum version/enum',
        'station_status.json minimum last_reported/minimum',
        'system_pricing_plans.json type is_taxable/type',
        'system_pricing_plans.json type price/type'
      ]
    );
    baseline.shapes.forEach((shape) => {
      assert.equal(typeof shape.note, 'string');
      assert.ok(shape.note.length > 0);
      assert.equal(shape.sample, undefined);
    });
    const keys = baseline.shapes.map(gbfsScript.shapeKey);
    assert.deepEqual(keys, keys.slice().sort());
    assert.equal(new Set(keys).size, keys.length);
    assert.deepEqual(gbfsScript.diffShapes(baseline.shapes, baseline.shapes).newShapes, []);
  });
});

describe('tolerance fixtures', () => {
  it('should keep the loose station_status fixture mixed', () => {
    const status = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'station_status.json'), 'utf8'));
    assert.equal(status.version, '2.3');
    const flags = status.data.stations.map((station) => station.is_installed);
    assert.ok(flags.indexOf(true) !== -1);
    assert.ok(flags.indexOf(1) !== -1);
  });
});

describe('package boundary', () => {
  const pkg = require('../package.json');

  it('should keep gbfs-validator out of the published package', () => {
    assert.equal(pkg.dependencies, undefined);
    assert.ok(pkg.devDependencies['gbfs-validator']);
    assert.deepEqual(pkg.files, ['lib/']);
  });
});

describe('scheduled workflow', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'gbfs-validate.yml'), 'utf8');

  it('should run once on a schedule, not on pull requests', () => {
    assert.match(workflow, /schedule:/);
    assert.match(workflow, /workflow_dispatch:/);
    assert.equal(workflow.includes('pull_request:'), false);
    assert.equal(workflow.includes('strategy:'), false);
    assert.match(workflow, /runs-on: ubuntu-latest/);
    assert.equal(workflow.includes('macos-'), false);
    assert.equal(workflow.includes('windows-'), false);
    assert.equal(workflow.split('node scripts/gbfs-validate.js').length - 1, 1);
    assert.deepEqual(workflow.match(/uses: actions\/[a-z0-9-]+@/g), [
      'uses: actions/checkout@',
      'uses: actions/setup-node@',
      'uses: actions/upload-artifact@'
    ]);
    assert.equal(workflow.includes('https://gbfs.citibikenyc.com/gbfs/gbfs.json'), true);
    assert.equal(workflow.includes('https://gbfs.citibikenyc.com/gbfs/2.3/gbfs.json'), true);
  });
});
