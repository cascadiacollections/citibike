#!/usr/bin/env node
'use strict';

/*
 * Validates a Citi Bike GBFS discovery file once with MobilityData's
 * gbfs-validator, then compares error *shapes* to scripts/gbfs-baseline.json.
 *
 * A shape is the feed file, the JSON Schema path and the keyword. The same
 * failure on every station, or in en/fr/es, is one shape. Counts are not
 * compared and are not stored in the baseline.
 *
 * The default feed is GBFS 1.1, which is what this client reads. restBase
 * points at https://gbfs.citibikenyc.com/gbfs/en; the validator needs the
 * discovery file that lists those feeds. Pass --version 2.3 to check
 * https://gbfs.citibikenyc.com/gbfs/2.3/gbfs.json once instead. That run
 * does not touch the 1.1 baseline or the tracking issue.
 *
 * One validation() call. This process does not retry.
 *
 *   node scripts/gbfs-validate.js
 *   node scripts/gbfs-validate.js --write-baseline
 *   node scripts/gbfs-validate.js --version 2.3 --report gbfs-report.json
 *
 * Exit 0 when a report was produced, including when new shapes appear.
 * The scheduled workflow treats that as advisory and opens an issue.
 * Exit 1 when the feed could not be validated. Nothing is written in that
 * case, so a failed run cannot close the tracking issue.
 */

var fs = require('fs');
var path = require('path');

var GBFS = require('gbfs-validator');
var validatorPackage = require('gbfs-validator/package.json');

var BASELINE_PATH = path.join(__dirname, 'gbfs-baseline.json');
var DEFAULT_REPORT = path.join(__dirname, '..', 'gbfs-report.json');

/** Discovery URLs. One version, one URL, one request batch inside validation(). */
var FEEDS = {
  '1.1': 'https://gbfs.citibikenyc.com/gbfs/gbfs.json',
  '2.3': 'https://gbfs.citibikenyc.com/gbfs/2.3/gbfs.json'
};

var ISSUE_TITLE = 'GBFS feed validation: new upstream errors';

/**
 * Plain-language notes for the shapes the 1.1 feed was already producing
 * when the baseline was introduced. --write-baseline copies a note onto a
 * matching shape. Comparison ignores it.
 */
var KNOWN_NOTES = {
  'gbfs.json enum name': 'gbfs.json lists ebikes_at_stations, which is not a GBFS 1.1 feed name.',
  'gbfs_versions.json enum version': 'gbfs_versions.json publishes version strings such as "v1.1" instead of "1.1".',
  'station_status.json minimum last_reported': 'Some station_status.json stations report last_reported earlier than the schema minimum of 1450155600.',
  'system_pricing_plans.json type price': 'system_pricing_plans.json price is not a number.',
  'system_pricing_plans.json type is_taxable': 'system_pricing_plans.json is_taxable is not a number (0 or 1).'
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** file, schema path and keyword. Tabs, so the key stays one line. */
function shapeKey(shape) {
  return shape.file + '\t' + (shape.schemaPath || '') + '\t' + (shape.keyword || '');
}

/** The property name nearest the end of an Ajv schema path. */
function propertyName(schemaPath) {
  var parts = String(schemaPath || '').split('/');
  var i = parts.lastIndexOf('properties');
  if (i >= 0 && parts[i + 1]) return decodeURIComponent(parts[i + 1]);
  return '';
}

function noteFor(shape) {
  return KNOWN_NOTES[shape.file + ' ' + shape.keyword + ' ' + propertyName(shape.schemaPath)] || '';
}

function compareShapes(a, b) {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  if (a.schemaPath !== b.schemaPath) return a.schemaPath < b.schemaPath ? -1 : 1;
  if (a.keyword !== b.keyword) return a.keyword < b.keyword ? -1 : 1;
  return 0;
}

/**
 * Unique shapes in a validator report. `errors: false` means the file
 * passed. A required file that is missing is its own shape, because that
 * is not an Ajv keyword.
 *
 * @param {Object} report Result of `GBFS#validation()`.
 * @returns {Array<{file: string, schemaPath: string, keyword: string, sample?: Object}>}
 */
function shapesFromReport(report) {
  var seen = Object.create(null);
  var shapes = [];

  function push(file, schemaPath, keyword, sample) {
    if (!file) return;
    var shape = {
      file: file,
      schemaPath: schemaPath || '',
      keyword: keyword || ''
    };
    var key = shapeKey(shape);
    if (seen[key]) return;
    seen[key] = true;
    if (sample && (sample.instancePath || sample.message)) shape.sample = sample;
    shapes.push(shape);
  }

  function take(file, errors) {
    if (!Array.isArray(errors)) return;
    errors.forEach(function (error) {
      if (!error || typeof error !== 'object') return;
      push(file, error.schemaPath, error.keyword, {
        instancePath: error.instancePath || '',
        message: error.message || ''
      });
    });
  }

  var files = report && Array.isArray(report.files) ? report.files : [];
  files.forEach(function (file) {
    take(file.file, file.errors);
    if (file.required && file.exists === false) push(file.file, '', 'missing');
    var languages = Array.isArray(file.languages) ? file.languages : [];
    languages.forEach(function (lang) {
      take(file.file, lang.errors);
      if (file.required && lang.exists === false) push(file.file, '', 'missing');
    });
  });

  shapes.sort(compareShapes);
  return shapes;
}

/**
 * Shapes in `current` that are not in `baseline`, and the reverse.
 * Notes and samples are not part of the identity.
 */
function diffShapes(baseline, current) {
  var known = Object.create(null);
  var present = Object.create(null);
  (baseline || []).forEach(function (shape) { known[shapeKey(shape)] = true; });
  (current || []).forEach(function (shape) { present[shapeKey(shape)] = true; });
  return {
    newShapes: (current || []).filter(function (shape) { return !known[shapeKey(shape)]; }),
    resolvedShapes: (baseline || []).filter(function (shape) { return !present[shapeKey(shape)]; })
  };
}

function baselineDocument(meta, shapes) {
  return {
    description: 'Error shapes the live Citi Bike GBFS 1.1 feed already produces. ' +
      'A shape is the file, the JSON Schema path and the keyword. The same error on many stations or languages is one shape. ' +
      'Rewrite this file with npm run gbfs:baseline after a new shape is accepted.',
    url: meta.url,
    gbfsVersion: meta.gbfsVersion,
    docked: true,
    validatorVersion: meta.validatorVersion,
    generatedAt: meta.generatedAt,
    shapes: shapes.map(function (shape) {
      var out = {
        file: shape.file,
        schemaPath: shape.schemaPath,
        keyword: shape.keyword
      };
      var note = noteFor(shape);
      if (note) out.note = note;
      return out;
    })
  };
}

function issueMarker(shapes) {
  return '<!-- gbfs-shapes: ' + shapes.map(shapeKey).join(' | ') + ' -->';
}

function runUrl() {
  if (!process.env.GITHUB_REPOSITORY || !process.env.GITHUB_RUN_ID) return '';
  var server = process.env.GITHUB_SERVER_URL || 'https://github.com';
  return server + '/' + process.env.GITHUB_REPOSITORY + '/actions/runs/' + process.env.GITHUB_RUN_ID;
}

function issueBody(meta, newShapes) {
  var lines = [
    issueMarker(newShapes),
    '',
    'The live Citi Bike GBFS feed produced error shapes that are not in `scripts/gbfs-baseline.json`.',
    '',
    'This check is advisory. It does not block pull requests, and the library still reads the feed.',
    '',
    '- Feed: ' + meta.url,
    '- Version: ' + meta.gbfsVersion,
    '- Validator: gbfs-validator ' + meta.validatorVersion
  ];
  var url = runUrl();
  if (url) lines.push('- Run: ' + url);
  lines.push('', '### New shapes', '');
  newShapes.forEach(function (shape) {
    lines.push('- `' + shape.file + '` keyword `' + shape.keyword + '`');
    lines.push('  `' + shape.schemaPath + '`');
    if (shape.sample && shape.sample.message) {
      var where = shape.sample.instancePath ? '`' + shape.sample.instancePath + '` ' : '';
      lines.push('  Example: ' + where + shape.sample.message);
    }
  });
  lines.push(
    '',
    'A shape is the file, the schema path and the keyword. The same error on many stations is one shape. The `gbfs-validation-report` artifact on the run lists every error.',
    '',
    '`npm run gbfs:baseline` rewrites `scripts/gbfs-baseline.json` once those shapes are accepted.',
    ''
  );
  return lines.join('\n');
}

function slimError(error) {
  return {
    keyword: error.keyword,
    instancePath: error.instancePath || '',
    schemaPath: error.schemaPath || '',
    message: error.message || '',
    params: error.params || {}
  };
}

/** Validator output without the feed bodies or the copied schemas. */
function slimFile(file) {
  var out = {
    file: file.file,
    required: !!file.required,
    exists: !!file.exists,
    hasErrors: !!file.hasErrors,
    errorsCount: file.errorsCount || 0,
    url: file.url || null,
    errors: Array.isArray(file.errors) ? file.errors.map(slimError) : file.errors
  };
  if (Array.isArray(file.languages)) {
    out.languages = file.languages.map(function (lang) {
      return {
        lang: lang.lang || null,
        url: lang.url || null,
        exists: !!lang.exists,
        errors: Array.isArray(lang.errors) ? lang.errors.map(slimError) : lang.errors
      };
    });
  }
  return out;
}

function readBaseline(file) {
  var parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error('Could not read ' + file + '. Run npm run gbfs:baseline.');
  }
  if (!parsed || !Array.isArray(parsed.shapes)) {
    throw new Error(file + ' has no shapes array.');
  }
  return parsed.shapes;
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function writeSummary(markdown) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
}

function parseArgs(argv) {
  var out = {
    writeBaseline: false,
    report: process.env.GBFS_REPORT || DEFAULT_REPORT,
    version: process.env.GBFS_VERSION || '1.1',
    url: process.env.GBFS_URL || '',
    help: false
  };
  for (var i = 0; i < argv.length; i++) {
    var arg = argv[i];
    if (arg === '--write-baseline') out.writeBaseline = true;
    else if (arg === '--report') out.report = argv[++i];
    else if (arg === '--version') out.version = argv[++i];
    else if (arg === '--url') out.url = argv[++i];
    else if (arg === '--help' || arg === '-h') out.help = true;
    else fail('Unknown argument ' + arg);
  }
  out.version = String(out.version || '').trim() || '1.1';
  out.url = String(out.url || '').trim();
  return out;
}

function help() {
  console.log(
    'Usage: node scripts/gbfs-validate.js [--write-baseline] [--version 1.1|2.3] [--url URL] [--report FILE]\n' +
    '\n' +
    'Validates one GBFS discovery file. The default is GBFS 1.1:\n' +
    '  ' + FEEDS['1.1'] + '\n' +
    '--version 2.3 checks this file once and does not update the baseline:\n' +
    '  ' + FEEDS['2.3'] + '\n' +
    '--write-baseline rewrites scripts/gbfs-baseline.json from the 1.1 feed.'
  );
}

/**
 * One call to validation(). docked: true because Citi Bike publishes
 * station_information and station_status, and those are the feeds this
 * client reads.
 */
function validateOnce(url, version) {
  var feed = new GBFS(url, { docked: true, version: version });
  return feed.validation();
}

function main() {
  var args = parseArgs(process.argv.slice(2));
  if (args.help) {
    help();
    return;
  }
  if (!FEEDS[args.version]) {
    fail('Version must be 1.1 or 2.3.');
  }
  var url = args.url || FEEDS[args.version];
  var defaultFeed = args.version === '1.1' && url === FEEDS['1.1'];
  if (args.writeBaseline && !defaultFeed) {
    fail('--write-baseline only updates the GBFS 1.1 baseline for ' + FEEDS['1.1']);
  }

  validateOnce(url, args.version).then(function (report) {
    if (!report || !report.summary || report.summary.versionUnimplemented || !Array.isArray(report.files)) {
      fail('The validator did not return a feed report.');
    }

    var shapes = shapesFromReport(report);
    var meta = {
      url: url,
      gbfsVersion: args.version,
      validatorVersion: report.summary.validatorVersion || validatorPackage.version,
      generatedAt: new Date().toISOString()
    };

    if (args.writeBaseline) {
      writeJson(BASELINE_PATH, baselineDocument(meta, shapes));
      console.log('Wrote ' + path.relative(process.cwd(), BASELINE_PATH) + ' (' + shapes.length + ' shapes).');
      return;
    }

    var compared = defaultFeed;
    var diff = compared ? diffShapes(readBaseline(BASELINE_PATH), shapes) : { newShapes: [], resolvedShapes: [] };
    var document = {
      description: 'One gbfs-validator run. errors lists every finding. shapes collapses those findings to file + schema path + keyword. Feed bodies are not included.',
      url: meta.url,
      gbfsVersion: meta.gbfsVersion,
      docked: true,
      validatorVersion: meta.validatorVersion,
      generatedAt: meta.generatedAt,
      compared: compared,
      issueTitle: ISSUE_TITLE,
      summary: {
        hasErrors: !!report.summary.hasErrors,
        errorsCount: report.summary.errorsCount || 0,
        version: report.summary.version || null
      },
      shapes: shapes,
      newShapes: diff.newShapes,
      resolvedShapes: diff.resolvedShapes,
      issue: diff.newShapes.length
        ? { title: ISSUE_TITLE, marker: issueMarker(diff.newShapes), body: issueBody(meta, diff.newShapes) }
        : null,
      files: report.files.map(slimFile)
    };
    writeJson(args.report, document);

    console.log(
      'GBFS ' + meta.gbfsVersion + ' ' + meta.url + '\n' +
      'validator ' + meta.validatorVersion + '\n' +
      shapes.length + ' shapes (' + document.summary.errorsCount + ' errors). ' +
      'New: ' + diff.newShapes.length + '. No longer present: ' + diff.resolvedShapes.length + '.'
    );
    if (!compared) {
      console.log('Not the GBFS 1.1 baseline feed; shapes were not compared.');
    }
    console.log('Wrote ' + args.report);

    var summary = [
      '### GBFS validation (advisory)',
      '',
      'Validated `' + meta.url + '` as GBFS ' + meta.gbfsVersion + ' once, with gbfs-validator ' + meta.validatorVersion + '.',
      '',
      compared
        ? 'Shapes: ' + shapes.length + '. New: ' + diff.newShapes.length + '. In the baseline but absent this run: ' + diff.resolvedShapes.length + '.'
        : 'This run did not use the GBFS 1.1 baseline, so it did not open or close an issue.',
      ''
    ];
    if (diff.newShapes.length) {
      summary.push('New shapes:', '');
      diff.newShapes.forEach(function (shape) {
        summary.push('- `' + shape.file + '` `' + shape.keyword + '` `' + shape.schemaPath + '`');
      });
      summary.push('');
    }
    writeSummary(summary.join('\n'));
  }).catch(function (error) {
    fail(error && error.message ? error.message : 'validation() failed');
  });
}

module.exports = {
  FEEDS: FEEDS,
  ISSUE_TITLE: ISSUE_TITLE,
  shapeKey: shapeKey,
  propertyName: propertyName,
  noteFor: noteFor,
  shapesFromReport: shapesFromReport,
  diffShapes: diffShapes,
  baselineDocument: baselineDocument,
  issueMarker: issueMarker,
  issueBody: issueBody
};

if (require.main === module) {
  main();
}
