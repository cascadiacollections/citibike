/**
 *  Get a list of available stations and bikes.
 */
 
Citibike = require('..');
citibike = new Citibike;

citibike.getStations(null, function(callback) {
  var stations = callback;
  console.log(stations.results);
  
  /* Example Response:
    {
      ok: true,
      meta: [ ],
      results: [
        {
          id: 72,
          status: "Active",
          latitude: 40.76727216,
          longitude: -73.99392888,
          label: "W 52 St & 11 Av",
          stationAddress: "",
          availableBikes: 15,
          availableDocks: 22,
          nearbyStations: [
            {
            id: 480,
            distance: 0.17780736685282
            },
            {
            id: 508,
            distance: 0.30285853404336
            },
            {
            id: 495,
            distance: 0.3196273377671
            },
            {
            id: 422,
            distance: 0.3446534955824
            },
            {
            id: 449,
            distance: 0.36516621792546
            }
          ]
        },
        
        ... More stations go here ...
        
      ]
      activeStations: 304,
      totalStations: 327,
      lastUpdate: 1370713417
    }
  */

});