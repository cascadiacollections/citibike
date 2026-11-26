3.0.0 / unreleased
==================

Citi Bike shut down the `appservices.citibikenyc.com` API that 2.x depended on
(the host no longer resolves), so every network call in 2.x hung or failed.
3.0.0 moves to Citi Bike's GBFS feeds, adds a promise API, and keeps the 2.x
callback API working on top of the new feeds.

**New: promise API**

 * `stations()` resolves with every station: `station_information` and
   `station_status` joined by id, with camelCase fields (`bikesAvailable`,
   `ebikesAvailable`, `docksAvailable`, `isRenting`, `legacyId`, ...).
 * `station(id)` looks one station up by GBFS id, legacy numeric id or short name.
 * `nearest(point, { limit, radius, available })` resolves with the closest
   stations, nearest first, each with a `distance` in meters. `available` keeps
   only stations with a bike, an e-bike or a free dock.
 * `feed(name)` resolves with any GBFS feed exactly as served (`system_alerts`,
   `system_regions`, `system_information`, ...).
 * Feeds are cached in memory for as long as their own `ttl` says, and
   concurrent callers share one request. `{ fresh: true }` per call or
   `cache: false` per client opts out; `clearCache()` empties it.
 * Every promise method takes `{ signal }` (an `AbortSignal`).
 * Failures reject with a `CitibikeError` carrying `code` (`ETIMEDOUT`,
   `EABORTED`, `ENETWORK`, `EHTTP`, `EPARSE`, `EPAYLOAD`), `url` and `status`.
 * `Citibike.distance(a, b)` returns the meters between two points.
 * TypeScript declarations are bundled (`lib/citibike.d.ts`).
 * Named exports (`Citibike`, `CitibikeError`, `distance`) work from both
   `require` and `import`. The package stays CommonJS.
 * New options: `cache`, and `fetch` to supply your own `fetch` implementation.

**2.x compatibility**

The callback methods keep their 2.x signatures, and `getStations()` keeps its
2.x result shape:

 * Station `id` is the same number 2.x reported, read from the feed's
   `legacy_id`. A station with no legacy id gets its GBFS `station_id` string.
   The GBFS id is always available as the new `stationId` field.
 * `nearbyStations` is back: the five closest stations as `{ id, distance }`
   with `distance` in miles. The library computes it from the coordinates, so
   values can differ from 2.x in the fifth decimal place.
 * New fields on each station: `stationId`, `availableEbikes`, `shortName`,
   `capacity`, `lastReported`. `stationAddress` is always `""`.
 * `getStations()` shares the feed cache, so two calls inside one `ttl`
   make one round of requests. `get()` is never cached.

**Breaking changes**

 * `getBranches()` and `getHelmets()` are discontinued: Citi Bike no longer
   publishes this data and GBFS has no equivalent. They make no request and
   call back asynchronously with `{ ok: false, results: [], error, code }`.
 * Errors are now reported to the callback as
   `{ ok: false, meta: [], results: [], error, code }` instead of being logged
   to the console with the callback never called.
 * Requests time out after `options.timeout` ms (default 10000), measured from
   the start of the request to the end of the body.
 * Default options changed: `restBase` is now `https://gbfs.citibikenyc.com/gbfs/en`;
   `helmetsURL`/`branchesURL` are replaced by `stationInformationURL`/`stationStatusURL`.
 * User options now override defaults (previously defaults always won, so options
   such as `restBase` were silently ignored). `headers` are merged and actually sent.
 * Requires Node.js 22 or newer (`engines.node`).
 * Removed the `lodash` runtime dependency. Requests use Node's built-in `fetch`.
 * `package.json` now has an `exports` map: `citibike`, `citibike/lib/citibike.js`
   and `citibike/package.json` resolve; other deep paths do not.

**Other**

 * Fix: a connection dropped after the response headers but before the body
   finished never called the callback. It now calls back with
   `{ ok: false, error: 'Connection closed before response ... finished' }`.
 * Responses are requested with compression, which `fetch` handles itself.
 * Tests run against a local HTTP server with GBFS-shaped fixtures; no network access.
 * The source is now TypeScript (`src/citibike.ts`); `npm run build` compiles it to the
   `lib/citibike.js` and `lib/citibike.d.ts` the package ships. `lib/` is no longer committed.
 * CI runs on Node 22.x and 24.x with current `actions/checkout` and `actions/setup-node`,
   and type-checks the bundled declarations. The tests use Node's built-in runner
   (`node:test` and `node:assert`); mocha, should and supertest are removed.
   `npm run coverage` fails if coverage drops below its thresholds, and
   `npm run test:bun` runs the same suite under Bun.

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
