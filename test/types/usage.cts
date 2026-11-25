/**
 * CommonJS consumer. `import = require` is the typed form of
 * `const Citibike = require("citibike")`.
 * Type-checked by `tsc --strict --noEmit --module nodenext`. Not executed.
 */
import Citibike = require("citibike");
import CitibikeDefault from "citibike";
import { checkCitibike } from "./api.cjs";

type IsAny<T> = 0 extends 1 & T ? true : false;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

type _requireIsTyped = Assert<IsAny<typeof Citibike> extends true ? false : true>;
type _defaultIsTyped = Assert<IsAny<typeof CitibikeDefault> extends true ? false : true>;
type _sameBinding = Assert<Equal<typeof Citibike, typeof CitibikeDefault>>;

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
checkCitibike(CitibikeDefault);
