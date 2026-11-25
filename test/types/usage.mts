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
