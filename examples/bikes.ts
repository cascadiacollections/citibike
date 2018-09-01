/**
 *  Retrieves JSON data for stations, helmets, and bikes.
 */
import Citibike from '..';

const citibike = new Citibike();

/** Retrieves Citibike Stations JSON Data and prints to console */
citibike.getStations(null, (data) => {
  console.log('Getting Citibike Stations...');
  console.log(data);
});

/** Retrieves Citibike Branches JSON Data and prints to console */
citibike.getBranches(null, (data) => {
  console.log('Getting Citibike Branches...');
  console.log(data);
});

/**  Retrieves Citibike Helmets JSON Data and prints to console */
citibike.getHelmets(null, (data) => {
  console.log('Getting Citibike Helmets...');
  console.log(data);
});
