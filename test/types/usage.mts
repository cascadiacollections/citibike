/**
 * ESM consumer: `import Citibike from "citibike"`.
 * Type-checked by `tsc --strict --noEmit --module nodenext`. Not executed.
 */
import Citibike from "citibike";
import { checkCitibike } from "./api.cjs";

type IsAny<T> = 0 extends 1 & T ? true : false;
type Assert<T extends true> = T;

type _importIsTyped = Assert<IsAny<typeof Citibike> extends true ? false : true>;

const citibike = new Citibike({
  timeout: 5000,
  headers: { "User-Agent": "my-app/1.0" }
});
const bare = Citibike();

citibike.getStations(null, (data) => {
  if (!data.ok) return;
  void data.results[0].availableBikes;
});

bare.get("/system_information.json", (data) => {
  if (data.ok === false) return;
  void data.data.name;
});

checkCitibike(Citibike);

// Named exports, the way an ES module would import them.
import { Citibike as Named, CitibikeError, distance } from "citibike";
import type { Station, NearbyStation } from "citibike";

async function promiseApi(): Promise<void> {
  const stations: Station[] = await new Named().stations();
  const near: NearbyStation[] = await citibike.nearest({ latitude: 40.75, longitude: -73.98 });
  const meters: number = distance(stations[0], near[0]);
  const error: Error = new CitibikeError("EHTTP", "HTTP 503");
  void meters;
  void error;
}
void promiseApi;
