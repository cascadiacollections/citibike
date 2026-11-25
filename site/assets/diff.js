// Pure helpers for the live station_status poll. No DOM, no three.js.

export function bikeDeltas(previous, rows) {
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const id = row[0];
    const bikes = row[1] | 0;
    const before = previous[id];
    if (before == null || before === bikes) continue;
    out.push({
      id: id,
      delta: bikes - before,
      bikes: bikes,
      ebikes: row[2] | 0,
      docks: row[3] | 0
    });
  }
  out.sort(function (a, b) { return Math.abs(b.delta) - Math.abs(a.delta); });
  return out;
}

export function tickerLine(delta, name) {
  const n = Math.abs(delta);
  const sign = delta > 0 ? '+' : '\u2212';
  return sign + n + ' ' + (n === 1 ? 'bike' : 'bikes') + ' at ' + name;
}
