// Readers for site/data/stations.json. See scripts/snapshot-stations.js.

export function decodeStations(payload) {
  if (!payload || !Array.isArray(payload.stations)) throw new Error('bad snapshot');
  var lat0 = payload.lat0;
  var lon0 = payload.lon0;
  var out = new Array(payload.stations.length);
  for (var i = 0; i < payload.stations.length; i++) {
    var row = payload.stations[i];
    out[i] = {
      id: row[0],
      name: row[1],
      lat: (lat0 + row[2]) / 1e5,
      lon: (lon0 + row[3]) / 1e5,
      bikes: row[4] | 0,
      ebikes: row[5] | 0,
      docks: row[6] | 0,
      active: row[7] === 1
    };
  }
  return out;
}

export function totals(list) {
  var bikes = 0;
  var ebikes = 0;
  for (var i = 0; i < list.length; i++) {
    bikes += list[i].bikes;
    ebikes += list[i].ebikes;
  }
  return { stations: list.length, bikes: bikes, ebikes: ebikes };
}
