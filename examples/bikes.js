/**
 *  Retrieves Citi Bike station data from the GBFS feeds.
 */

var Citibike = require('..')
  , citibike = new Citibike();

/** Grand Central Terminal */
var here = { latitude: 40.7527, longitude: -73.9772 };

async function main() {
  /** Every station, with live availability */
  var stations = await citibike.stations();
  var renting = stations.filter(function(s) { return s.isRenting; });
  console.log(renting.length + ' of ' + stations.length + ' stations renting');

  /** The three closest stations that have an e-bike right now */
  var near = await citibike.nearest(here, { limit: 3, available: 'ebikes' });
  near.forEach(function(s) {
    console.log(s.name + ': ' + s.ebikesAvailable + ' e-bikes, ' + Math.round(s.distance) + ' m away');
  });

  /** Any other GBFS feed, exactly as Citi Bike serves it */
  var system = await citibike.feed('system_information');
  console.log(system.data.name + ' (' + system.data.timezone + ')');
}

main().catch(function(error) {
  console.error(error.code + ': ' + error.message);
  process.exitCode = 1;
});
