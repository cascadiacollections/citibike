# Citibike 

  [![npm version](https://img.shields.io/npm/v/citibike.svg?style=flat-square)](https://www.npmjs.com/package/citibike)
  [![OpenSSF Scorecard](https://img.shields.io/ossf-scorecard/github.com/cascadiacollections/citibike?label=openssf%20scorecard&style=flat-square)](https://scorecard.dev/viewer/?uri=github.com/cascadiacollections/citibike)
  Docs: https://cascadiacollections.github.io/citibike/
  The map on that page is a daily snapshot of station positions and counts. The library itself reads the live feeds.
  
  A [node.js](http://nodejs.org/) client for [Citi Bike](https://citibikenyc.com/)'s public GBFS data feeds.
  
  A [PHP port](https://github.com/cascadiacollections/citibike.php) also exists, but it is archived and no longer maintained.

## Installation

  Install using the node.js package manager [npm](http://npmjs.org/):

      $ npm install citibike
      
  Or...

  Install via git clone:

      $ git clone https://github.com/cascadiacollections/citibike.git
      $ cd citibike
      $ npm install

## Requirements

  * [Node.js](https://nodejs.org/) 22 or newer (active LTS lines). No runtime dependencies.
  * TypeScript types are included. Works from CommonJS (`require`) and ES modules (`import`).

## Quick start

```js
const Citibike = require('citibike');   // or: import Citibike from 'citibike';
const citibike = new Citibike();

// Every station, with its live availability.
const stations = await citibike.stations();

// The closest stations that have an e-bike right now.
const near = await citibike.nearest(
  { latitude: 40.7527, longitude: -73.9772 },
  { available: 'ebikes', limit: 3 }
);
console.log(near.map((s) => `${s.name}: ${s.ebikesAvailable} e-bikes, ${Math.round(s.distance)} m`));

// One station, by GBFS id, legacy numeric id or the short name on the dock.
const station = await citibike.station(72);
```

  Upgrading from 2.x? Your callback code keeps working: see
  [2.x compatibility](#2x-compatibility).

## Data source

  Citi Bike retired its original `appservices.citibikenyc.com` REST API, which
  versions 2.x of this library used. Since 3.0.0 the library reads Citi Bike's
  public [GBFS](https://gbfs.org/) feeds (`https://gbfs.citibikenyc.com/gbfs/gbfs.json`).
  The feeds are run by Lyft: `gbfs.json` lists the same data under
  `https://gbfs.lyft.com/gbfs/1.1/bkn/`, which you can pass as `restBase`
  (with `/en` appended) if you prefer that host.

## Examples

  Demos of the citibike module are located in: [./examples](https://github.com/cascadiacollections/citibike/tree/master/examples)

## API Documentation

  The full reference, generated from the source, is at
  <https://cascadiacollections.github.io/citibike/api/>.

  * **Client - new Citibike( options )**
```js
const citibike = new Citibike({
    // all optional; these are the defaults
    restBase: 'https://gbfs.citibikenyc.com/gbfs/en',
    stationInformationURL: '/station_information.json',
    stationStatusURL: '/station_status.json',
    timeout: 10000,               // ms for one request; 0 turns it off
    cache: true,                  // keep each feed for as long as its own `ttl` says
    headers: { 'User-Agent': 'my-app/1.0' },  // merged with the defaults
    fetch: globalThis.fetch       // swap in your own fetch (proxy, retries, tests)
});
```

### Promise methods

  Each method returns a promise. Each takes an optional last argument
  `{ signal, fresh }`: `signal` is an `AbortSignal`, and `fresh: true` skips the cache.

  | Method | Resolves with |
  |--------|---------------|
  | `stations()` | Every station: `station_information` and `station_status` joined by id |
  | `station(id)` | One station, or `null`. `id` is a GBFS id, a legacy numeric id or a short name |
  | `nearest(point, { limit, radius, available })` | The closest stations, nearest first, each with `distance` in meters |
  | `feed(name)` | Any GBFS feed exactly as served, for example `system_alerts` or `system_regions` |
  | `clearCache()` | Not a promise. Forgets cached feeds and returns the client |

  * **A station**
```json
{
    "id": "66db237e-0aca-11e7-82f6-3863bb44ef7c",
    "legacyId": 72,
    "name": "W 52 St & 11 Ave",
    "shortName": "6926.01",
    "latitude": 40.76727216,
    "longitude": -73.99392888,
    "capacity": 39,
    "regionId": "71",
    "bikesAvailable": 12,
    "ebikesAvailable": 3,
    "classicBikesAvailable": 9,
    "docksAvailable": 22,
    "bikesDisabled": 1,
    "docksDisabled": 4,
    "isInstalled": true,
    "isRenting": true,
    "isReturning": true,
    "lastReported": 1761955201
}
```
  `bikesAvailable` includes e-bikes. `lastReported` is a Unix timestamp in seconds.

  * **Caching**

  Citi Bike's feeds say how long they stay current (`ttl`, 60 seconds at the
  time of writing). The client keeps each feed in memory for that long, and
  callers that ask for the same feed at the same time share one request. So
  `stations()`, `station()` and `nearest()` in a row cost two requests, not six.
  Pass `{ fresh: true }` to a call, or `cache: false` to the client, to opt out.

  * **Errors**

  Promise methods reject with a `CitibikeError` (exported as `Citibike.CitibikeError`).
  Check `error.code`:

  | `code` | Meaning |
  |--------|---------|
  | `ETIMEDOUT` | The request took longer than `timeout` |
  | `EABORTED` | The `signal` you passed was aborted |
  | `ENETWORK` | The connection failed, or closed before the response finished |
  | `EHTTP` | Non-2xx response; the status is in `error.status` |
  | `EPARSE` | The response was not valid JSON |
  | `EPAYLOAD` | Valid JSON, but not shaped like the feed that was asked for |

```js
try {
    await citibike.stations({ signal: AbortSignal.timeout(3000) });
} catch (error) {
    if (error.code === 'EHTTP') console.error('Citi Bike answered', error.status);
    else throw error;
}
```
  Invalid arguments (a point without coordinates, a negative radius) reject with a `TypeError`.

  * **Distance - Citibike.distance( a, b )**

  A static helper: straight-line meters between two `{ latitude, longitude }` points.

## 2.x compatibility

  The callback methods from 2.x are still here, with the same signatures and
  the same result shapes, on top of the GBFS feeds. Code written for 2.x keeps
  working after `npm install citibike@3` as long as it runs on Node.js 22 or newer.

  | Method          | 3.x behavior                                                  |
  |-----------------|---------------------------------------------------------------|
  | `getStations()` | Same `{ ok, meta, results, ... }` envelope as 2.x, built from GBFS |
  | `get()`         | Generic GET + JSON parse for any URL (or path under `restBase`) |
  | `getBranches()` | **Discontinued.** Always calls back with `ok: false`, no request is made |
  | `getHelmets()`  | **Discontinued.** Always calls back with `ok: false`, no request is made |

  Every callback receives a single object. When something goes wrong (network
  error, timeout, non-2xx status, invalid JSON, or a discontinued method) the
  object is `{ ok: false, meta: [], results: [], error: "<message>", code: "<code>" }`,
  so always check `data.ok` first. In 2.x a failed request logged to the
  console and never called back.

  * **Stations - .getStations( params, callback )**
```js
citibike.getStations(null, function(data) {
    if (!data.ok) return console.error(data.error);
    console.log(data.results);
});
```
  Pass `{ updateOnly: true }` to fetch only `station_status` (live availability,
  no names, coordinates or `nearbyStations`), like the old API's `updateOnly` flag.

  * **Sample JSON Response**
```json
{
    "ok": true,
    "meta": [],
    "results": [
        {
            "id": 72,
            "stationId": "66db237e-0aca-11e7-82f6-3863bb44ef7c",
            "status": "Active",
            "availableBikes": 12,
            "availableEbikes": 3,
            "availableDocks": 22,
            "lastReported": 1761955201,
            "label": "W 52 St & 11 Ave",
            "shortName": "6926.01",
            "latitude": 40.76727216,
            "longitude": -73.99392888,
            "capacity": 39,
            "stationAddress": "",
            "nearbyStations": [
                { "id": 480, "distance": 0.17779664783117674 },
                { "id": 513, "distance": 0.28500434554753534 }
            ]
        }
    ],
    "activeStations": 1,
    "totalStations": 1,
    "lastUpdate": 1761955230
}
```
  What matches 2.x, and what differs:

  * `id` is the same number 2.x reported (station 72 is still W 52 St & 11 Ave).
    It comes from the feed's `legacy_id`. A station without one gets its GBFS
    `station_id` string as `id` instead. Every station in the live feed had a
    legacy id as of November 2026.
  * `nearbyStations` lists the five closest stations with `distance` in miles,
    as 2.x did. The old API computed it; now the library does, from the
    coordinates, so distances can differ from 2.x in the fifth decimal place.
  * `status` is `"Active"` when GBFS reports the station as installed and renting,
    otherwise `"Not In Service"`.
  * `stationAddress` is always `""`: GBFS has no address.
  * New fields: `stationId`, `availableEbikes`, `shortName`, `capacity`, `lastReported`.
  * `lastUpdate` is the `station_status` feed's `last_updated` timestamp.
  * Stations present in `station_status` but not (yet) in `station_information`
    are left out of the full response.

  * **Branches - .getBranches( params, callback )** and **Helmets - .getHelmets( params, callback )**

  Citi Bike no longer publishes branch or helmet-retailer locations, and GBFS
  has no equivalent. Both methods are kept so existing code does not crash, but
  they make no request and always call back (asynchronously) with:
```json
{ "ok": false, "meta": [], "results": [], "error": "getHelmets() is not available: ...", "code": "EDISCONTINUED" }
```

  * **Options that changed**

  `restBase` now defaults to the GBFS host, and `helmetsURL`/`branchesURL` are
  replaced by `stationInformationURL`/`stationStatusURL`. In 2.x the defaults
  always won, so options you passed were ignored; in 3.x your options apply.

  See [CHANGELOG.md](./CHANGELOG.md) for the full list of breaking changes.

## Testing

  You can test citibike (tests use local GBFS fixtures and never hit the network):

      $ npm test
      $ npm run test:types    # compiles test/types against the bundled declarations
      $ npm run coverage      # the same tests with coverage; fails below the thresholds
      $ bun run test:bun      # the same tests under Bun

  The tests use Node's built-in runner (`node:test` and `node:assert`), so there
  is nothing to install beyond the dev dependencies.

  The source is TypeScript, in `src/citibike.ts`. `npm run build` compiles it with
  `tsc` into `lib/` (`citibike.js` and `citibike.d.ts`), which is what the package
  ships and what the tests and examples load. `lib/` is not committed. `npm test`,
  `npm run coverage`, `npm run test:bun` and `npm pack` build first; run `npm run build` yourself before
  `npm run test:types`, `npm run snapshot` or an example on a fresh checkout.

## Development

  The repository ships a [dev container](https://containers.dev/) with Node 24,
  Bun and the GitHub CLI. Open the repo in GitHub Codespaces, or in VS Code with
  the Dev Containers extension ("Reopen in Container"); it runs `npm ci` and
  `npm run build` for you. Without a container you need Node 22 or newer.

      $ npm ci                # install the pinned dev dependencies
      $ npm run build         # build lib/
      $ npm test              # tests plus the type check
      $ npm run coverage      # tests with coverage
      $ npm run check:pkg     # publint and arethetypeswrong on the packed tarball
      $ npm run docs          # generate the API reference into site/
      $ npm run docs:check    # check the site's links

## Contributors

  * [Brad Dickason](https://github.com/bdickason)
  * [David Mazza](https://www.davidmazza.com/)

## License

  [MIT](./LICENSE). Copyright (c) 2014-2016 Kevin T. Coughlin.
