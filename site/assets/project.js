// Equirectangular projection centered on New York, with the cos(lat)
// correction so a degree of longitude matches a degree of latitude.
// Shared by the hero scene and the static fallback image.

export const CENTER_LAT = 40.735;
export const CENTER_LON = -73.98;

const COS_LAT = Math.cos((CENTER_LAT * Math.PI) / 180);

export function project(lat, lon) {
  return [(lon - CENTER_LON) * COS_LAT, -(lat - CENTER_LAT)];
}
