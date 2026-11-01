# Citibike 

  [![npm version](https://img.shields.io/npm/v/citibike.svg?style=flat-square)](https://www.npmjs.com/package/citibike)
  
  A [node.js](http://nodejs.org/) client for [Citi Bike](https://citibikenyc.com/)'s public GBFS data feeds.
  
  Now available in [PHP](https://github.com/cascadiacollections/citibike.php)!

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

## Data source

  Citi Bike retired its original `appservices.citibikenyc.com` REST API, which
  versions 2.x of this library used. Since 3.0.0 the library reads Citi Bike's
  public [GBFS](https://gbfs.org/) feeds (`https://gbfs.citibikenyc.com/gbfs/gbfs.json`),
  specifically `station_information` and `station_status`, and maps them onto
  the same `{ ok, meta, results, ... }` envelope used before.

  | Method          | 3.x behavior                                                  |
  |-----------------|---------------------------------------------------------------|
  | `getStations()` | `station_information` + `station_status`, joined by station id |
  | `getBranches()` | **Discontinued.** Always calls back with `ok: false`, no request is made |
  | `getHelmets()`  | **Discontinued.** Always calls back with `ok: false`, no request is made |
  | `get()`         | Generic GET + JSON parse for any URL (or path under `restBase`) |

  See [CHANGELOG.md](./CHANGELOG.md) for the full list of breaking changes.

## Examples

  Demos of the citibike module are located in: [./examples](https://github.com/cascadiacollections/citibike/tree/master/examples)

## API Documentation

  Every callback receives a single object. When something goes wrong (network
  error, timeout, non-2xx status, invalid JSON, or a discontinued method) the
  object is `{ ok: false, meta: [], results: [], error: "<message>" }`, so always
  check `data.ok` first.

  * **Client - new Citibike( options )**
```js
var Citibike = require('citibike');
var citibike = new Citibike({
    // all optional; these are the defaults
    restBase: 'https://gbfs.citibikenyc.com/gbfs/en',
    stationInformationURL: '/station_information.json',
    stationStatusURL: '/station_status.json',
    timeout: 10000,               // ms
    headers: { 'User-Agent': 'my-app/1.0' }   // merged with the defaults
});
```

  * **Stations - .getStations( params, callback )**
```js
citibike.getStations(null, function(data) {
    if (!data.ok) return console.error(data.error);
    console.log(data.results);
});
```
  Pass `{ updateOnly: true }` to fetch only `station_status` (live availability,
  no names or coordinates), like the old API's `updateOnly` flag.

  * **Sample JSON Response**
```json
{
    "ok": true,
    "meta": [],
    "results": [
        {
            "id": "66db237e-0aca-11e7-82f6-3863bb44ef7c",
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
            "stationAddress": ""
        }
    ],
    "activeStations": 1,
    "totalStations": 1,
    "lastUpdate": 1761955230
}
```
  `status` is `"Active"` when GBFS reports the station as installed and renting,
  otherwise `"Not In Service"`. `lastUpdate` is the `station_status` feed's
  `last_updated` timestamp. Stations present in `station_status` but not (yet)
  in `station_information` are left out of the full response.

  * **Branches - .getBranches( params, callback )** and **Helmets - .getHelmets( params, callback )**

  Citi Bike no longer publishes branch or helmet-retailer locations, and GBFS
  has no equivalent. Both methods are kept so existing code does not crash, but
  they make no request and always call back (asynchronously) with:
```json
{ "ok": false, "meta": [], "results": [], "error": "getHelmets() is not available: ..." }
```

## Testing

  You can test citibike (tests use local GBFS fixtures and never hit the network):

      $ npm test

## Contributors

  * [Brad Dickason](https://github.com/bdickason)
  * [David Mazza](https://www.davidmazza.com/)

## LICENSE

  Citibike: Copyright (c) 2014-2016 Kevin T. Coughlin
  
  Permission is hereby granted, free of charge, to any person obtaining
  a copy of this software and associated documentation files (the
  "Software"), to deal in the Software without restriction, including
  without limitation the rights to use, copy, modify, merge, publish,
  distribute, sublicense, and/or sell copies of the Software, and to
  permit persons to whom the Software is furnished to do so, subject to
  the following conditions:
  
  The above copyright notice and this permission notice shall be
  included in all copies or substantial portions of the Software.
  
  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
  EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
  NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
  LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
  OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
  WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.