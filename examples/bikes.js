/**
 *  Retrieves Citi Bike station data from the GBFS feeds.
 */

var Citibike = require('..')
  , citibike = new Citibike();

/** Retrieves Citi Bike stations (location + live availability) and prints a summary */
citibike.getStations(null, function(data) {
  if (!data.ok) return console.error(data.error);
  console.log(data.activeStations + ' of ' + data.totalStations + ' stations active');
  console.log(data.results.slice(0, 5));
});

/** Branches and helmet retailers are no longer published by Citi Bike */
citibike.getHelmets(null, function(data) {
  console.log('getHelmets: ' + data.error);
});
