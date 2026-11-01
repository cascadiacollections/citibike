3.0.0 / 2026-11-01
==================

Citi Bike shut down the `appservices.citibikenyc.com` API that 2.x depended on,
so every network call in 2.x hung or failed. 3.0.0 moves to Citi Bike's GBFS feeds.

**Breaking changes**

 * `getStations()` is (re)implemented on GBFS `station_information` + `station_status`.
   Station `id` is now the GBFS `station_id` **string** (was a number).
   `nearbyStations` is no longer returned (not in GBFS). New fields:
   `availableEbikes`, `shortName`, `capacity`, `lastReported`.
   `stationAddress` is `""` when the feed has no address.
 * `getBranches()` and `getHelmets()` are discontinued: Citi Bike no longer
   publishes this data and GBFS has no equivalent. They make no request and
   call back asynchronously with `{ ok: false, results: [], error }`.
 * Errors are now reported to the callback as `{ ok: false, meta: [], results: [], error }`
   instead of being logged to the console with the callback never called.
   Requests time out after `options.timeout` ms (default 10000).
 * Default options changed: `restBase` is now `https://gbfs.citibikenyc.com/gbfs/en`;
   `helmetsURL`/`branchesURL` are replaced by `stationInformationURL`/`stationStatusURL`.
 * User options now override defaults (previously defaults always won, so options
   such as `restBase` were silently ignored). `headers` are merged and actually sent.
 * Requires Node.js 22 or newer (`engines.node`).
 * Removed the `lodash` runtime dependency.

**Other**

 * Tests run against a local HTTP server with GBFS-shaped fixtures; no network access.
 * CI runs on Node 22.x and 24.x with current `actions/checkout` and `actions/setup-node`;
   mocha pinned to `^12`, should to `^13`; supertest removed.

2.2.0 - 2.2.3 / 2013-07-27
==========================

 * David Mazza added parameter support

2.1.3 / 2013-06-22
==================

 * Minor Formatting
 * Added documentation for sample JSON responses

2.1.2 / 2013-06-20
==================

 * Fixed tests (capitalization error)

2.1.1 / 2013-06-20
==================

 * Minor formatting
 * Added Travis CI support for Node v0.9
 * Added documentation

2.1.0 / 2013-06-19
==================

 * Revised Example
 * Revised Tests
 * Added Travis CI implementation

2.0.1 / 2013-06-19 
==================

 * Mocha tests included

2.0.0 / 2013-06-18 
==================

 * Initial Working Release
