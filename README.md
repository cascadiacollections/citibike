# Citibike [![Build Status](https://travis-ci.org/KevinTCoughlin/citibike.png)](https://travis-ci.org/KevinTCoughlin/citibike) [![Dependency Status](https://gemnasium.com/KevinTCoughlin/citibike.png)](https://gemnasium.com/KevinTCoughlin/citibike)

  A [node.js](http://nodejs.org/) wrapper for [Citibike](http://citibikenyc.com/)'s REST API.
  
  Now available in [PHP](https://github.com/KevinTCoughlin/citibike.php)!

## Installation

  Install using the node.js package manager [npm](http://npmjs.org/):

      $ npm install citibike
      
  Or...

  Install via git clone:

      $ git clone git://github.com/KevinTCoughlin/citibike.git
      $ cd citibike
      $ npm install

## Requirements

  You can install citibike and its dependencies with npm: 
    
      $ npm install citibike
  
  Dependencies
  
  * [Node.js](http://nodejs.org/) v0.8 +

## Examples

  Demos of the citibike module are located in: [./examples](https://github.com/KevinTCoughlin/citibike/tree/master/examples)
  
## API Documentation

  * **Stations - .getStations( params, callback )**
    
        citibike.getStations({ updateOnly: true }, function(data) {
          console.log(data);
        });

  * **Sample JSON Response**

        {
          "ok": true,
          "meta": [],
          "results": [
              {
                  "id": 72,
                  "status": "Active",
                  "latitude": 40.76727216,
                  "longitude": -73.99392888,
                  "label": "W 52 St & 11 Ave",
                  "stationAddress": "",
                  "availableBikes": 12,
                  "availableDocks": 22,
                  "nearbyStations": [
                      {
                          "id": 480,
                          "distance": 0.17780736685282
                      },
                      {
                          "id": 513,
                          "distance": 0.28502152791732
                      },
                      {
                          "id": 508,
                          "distance": 0.30285853404336
                      },
                      {
                          "id": 495,
                          "distance": 0.3196273377671
                      },
                      {
                          "id": 530,
                          "distance": 0.3430221582592
                      }
                  ]
              },
              ... more stations ...
          ],
        "activeStations":308,"totalStations":313,"lastUpdate":1371908767}

  * **Branches - .getBranches( params, callback )**

        citibike.getBranches(null, function(data) {
          console.log(data);
        });
        
  * **Sample Branches JSON Response**
  
        {"ok": true, "meta": [], "results":[
          { "id":1, "latitude":40.7086647301912, "longitude":-74.0108752995729, "label":"120 Broadway" },
          { "id":2, "latitude":40.7533264160156, "longitude":-73.9794006347656, "label":"330 Madison Ave" },
          { "id":3, "latitude":40.7042541503906, "longitude":-74.0070037841797, "label":"111 Wall St" },
          ... more branches ...
        ],"lastUpdate": 1367853735}
        
  * **Helmets - .getHelmets( params, callback )**

        citibike.getHelmets(null, function(data) {
          console.log(data);
        });
  
  * **Sample Helmets JSON Response**
  
        {"ok": true, "meta": [], "results":[
          { "id":5002, "address":"571 Courtlandt Av", "latitude":40.8170769363642, "longitude":-73.9193703979254, "label":"Neighborhood Cycle, Inc." },
          { "id":5008, "address":"178 Graham Av", "latitude":40.7078323364258, "longitude":-73.9429473876953, "label":"Graham Bicycle Discount Center" },
          { "id":5000, "address":"4055 White Plains Rd", "latitude":40.8901315927505, "longitude":-73.8593445718288, "label":"Arrow Cycle, Inc" },
          { "id":5001, "address":"33 E 170th St", "latitude":40.8400574326515, "longitude":-73.9171025902033, "label":"Crosstown Bicycles" },
          ... more helmet locations ...
        ],"lastUpdate": 1367853737}

## Testing

  Issue the following Make command in the top directory to run the mocha.js test cases:
  
      $ make test

## Contributors

  * [Brad Dickason](https://github.com/bdickason)
  * [David Mazza](http://www.davidmazza.com/)

## LICENSE

  Citibike: Copyright (c) 2013 Kevin Coughlin
  
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

[![Bitdeli Badge](https://d2weczhvl823v0.cloudfront.net/KevinTCoughlin/citibike/trend.png)](https://bitdeli.com/free "Bitdeli Badge")
