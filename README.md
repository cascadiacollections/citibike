# CitibikeNYC API Client Library for Node.js

  [![Build Status](https://travis-ci.org/KevinTCoughlin/citibike.png)](https://travis-ci.org/KevinTCoughlin/citibike)

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
  
  * [node](http://nodejs.org/) v0.6 +

## Notes

  * **Parameters (Not Currently Supported)**
  
    Since Citibike has not released their Official API the module does not support parameters. 
    Once either the supported query string parameters are discovered or the official API is released 
    the module will support params.

    If you discover supported parameters please post an issue or fork the code so that they can be implemented.
  
  
## API Documentation

  * Stations - .getStations( params, callback )
    
        citibike.getStations(null, function(data) {
          console.log(data);
        });

  * Branches - .getBranches( params, callback )

        citibike.getBranches(null, function(data) {
          console.log(data);
        });
        
  * Helmets - .getHelmets( params, callback )

        citibike.getHelmets(null, function(data) {
          console.log(data);
        });

## Testing

  Issue the following Make command in the top directory to run the mocha.js test cases:
  
      $ make test

## Contributors

  * [Brad Dickason](https://github.com/bdickason)

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
