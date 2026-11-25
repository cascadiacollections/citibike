/**
 * Shape checks shared by the CommonJS and ESM consumers.
 * Imported as `./api.cjs` (the extension nodenext emits for a `.cts` file).
 */
import Citibike = require("citibike");

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

type StationKeys =
  | "id"
  | "status"
  | "availableBikes"
  | "availableEbikes"
  | "availableDocks"
  | "lastReported"
  | "label"
  | "shortName"
  | "latitude"
  | "longitude"
  | "capacity"
  | "stationAddress";

type _stationKeys = Assert<Equal<keyof Citibike.Station, StationKeys>>;
type _id = Assert<Equal<Citibike.Station["id"], string>>;
type _status = Assert<Equal<Citibike.Station["status"], "Active" | "Not In Service">>;
type _bikes = Assert<Equal<Citibike.Station["availableBikes"], number>>;
type _ebikes = Assert<Equal<Citibike.Station["availableEbikes"], number>>;
type _docks = Assert<Equal<Citibike.Station["availableDocks"], number>>;
type _reported = Assert<Equal<Citibike.Station["lastReported"], number>>;
type _label = Assert<Equal<Citibike.Station["label"], string | undefined>>;
type _shortName = Assert<Equal<Citibike.Station["shortName"], string | undefined>>;
type _lat = Assert<Equal<Citibike.Station["latitude"], number | undefined>>;
type _lon = Assert<Equal<Citibike.Station["longitude"], number | undefined>>;
type _capacity = Assert<Equal<Citibike.Station["capacity"], number | undefined>>;
type _address = Assert<Equal<Citibike.Station["stationAddress"], string | undefined>>;

type _ok = Assert<Equal<Citibike.StationsResult["ok"], true>>;
type _meta = Assert<Equal<Citibike.StationsResult["meta"], never[]>>;
type _results = Assert<Equal<Citibike.StationsResult["results"], Citibike.Station[]>>;
type _active = Assert<Equal<Citibike.StationsResult["activeStations"], number>>;
type _total = Assert<Equal<Citibike.StationsResult["totalStations"], number>>;
type _updated = Assert<Equal<Citibike.StationsResult["lastUpdate"], number>>;
type _resultKeys = Assert<Equal<
  keyof Citibike.StationsResult,
  "ok" | "meta" | "results" | "activeStations" | "totalStations" | "lastUpdate"
>>;

type _errOk = Assert<Equal<Citibike.ErrorResult["ok"], false>>;
type _errMeta = Assert<Equal<Citibike.ErrorResult["meta"], never[]>>;
type _errResults = Assert<Equal<Citibike.ErrorResult["results"], never[]>>;
type _err = Assert<Equal<Citibike.ErrorResult["error"], string>>;
type _errKeys = Assert<Equal<keyof Citibike.ErrorResult, "ok" | "meta" | "results" | "error">>;

type _optTimeout = Assert<Equal<Citibike.Options["timeout"], number | undefined>>;
type _optKey = Assert<Equal<Citibike.Options["apiKey"], string | null | undefined>>;
type _optBase = Assert<Equal<Citibike.Options["restBase"], string | undefined>>;
type _resTimeout = Assert<Equal<Citibike.ResolvedOptions["timeout"], number>>;
type _resKey = Assert<Equal<Citibike.ResolvedOptions["apiKey"], string | null>>;
type _resBase = Assert<Equal<Citibike.ResolvedOptions["restBase"], string>>;
type _resHeaders = Assert<Equal<Citibike.ResolvedOptions["headers"], { [header: string]: string }>>;

export function checkCitibike(Ctor: typeof Citibike): void {
  const client: Citibike = new Ctor({
    restBase: "https://gbfs.citibikenyc.com/gbfs/en",
    stationInformationURL: "/station_information.json",
    stationStatusURL: "/station_status.json",
    timeout: 10000,
    headers: { "User-Agent": "my-app/1.0" },
    apiKey: null
  });
  const bare: Citibike = Ctor();
  const lyft: Citibike = new Ctor({
    restBase: "https://gbfs.lyft.com/gbfs/1.1/bkn/en"
  });

  const timeout: number = client.options.timeout;
  const base: string = client.defaults.restBase;
  const info: string = client.defaults.stationInformationURL;
  const statusURL: string = lyft.options.stationStatusURL;
  const apiKey: string | null = bare.options.apiKey;
  const userAgent: string = client.options.headers["User-Agent"];
  void timeout;
  void base;
  void info;
  void statusURL;
  void apiKey;
  void userAgent;

  const full: Citibike.Station = {
    id: "66db237e-0aca-11e7-82f6-3863bb44ef7c",
    status: "Active",
    availableBikes: 12,
    availableEbikes: 3,
    availableDocks: 22,
    lastReported: 1761955201,
    label: "W 52 St & 11 Ave",
    shortName: "6926.01",
    latitude: 40.76727216,
    longitude: -73.99392888,
    capacity: 39,
    stationAddress: ""
  };
  const liveOnly: Citibike.Station = {
    id: full.id,
    status: "Not In Service",
    availableBikes: 0,
    availableEbikes: 0,
    availableDocks: 0,
    lastReported: 0
  };
  void liveOnly;

  const chained: Citibike = client
    .getStations(null, (data) => {
      if (!data.ok) {
        const message: string = data.error;
        const ok: false = data.ok;
        void message;
        void ok;
        return;
      }
      const summary: string = data.activeStations + " of " + data.totalStations + " stations active";
      const when: number = data.lastUpdate;
      const id: string = data.results[0].id;
      const state: "Active" | "Not In Service" = data.results[0].status;
      void summary;
      void when;
      void id;
      void state;
    })
    .getStations({ updateOnly: true }, (data) => {
      if (data.ok) void data.results[0].availableBikes;
    })
    .getStations((data) => {
      if (data.ok === false) void data.error;
    })
    .get("/system_information.json", (data) => {
      if (data.ok === false) {
        void data.error;
        return;
      }
      void data.data.name;
    })
    .get("/station_status.json", { a: 1 }, (data) => {
      void data;
    })
    .get("/station_status.json", null, () => {})
    .getBranches(null, (data) => {
      const ok: false = data.ok;
      const message: string = data.error;
      void ok;
      void message;
    })
    .getBranches(() => {})
    .getHelmets((data) => {
      const message: string = data.error;
      void message;
    })
    .getHelmets({}, () => {});

  void chained;

  // @ts-expect-error getStations is an instance method
  Ctor.getStations(() => {});

  // @ts-expect-error defaults live on the instance
  void Ctor.defaults;

  // @ts-expect-error timeout is a number of milliseconds
  new Ctor({ timeout: "10000" });

  // @ts-expect-error unknown option
  new Ctor({ timeOut: 1 });

  // @ts-expect-error header values are strings
  new Ctor({ headers: { "X-Test": 1 } });

  // @ts-expect-error a callback is required
  client.getStations();

  // @ts-expect-error a callback is required
  client.getStations(null);

  // @ts-expect-error callback must be a function
  client.getStations(null, "nope");

  // @ts-expect-error updateOnly is a boolean
  client.getStations({ updateOnly: "yes" }, () => {});

  // @ts-expect-error a callback is required
  client.get("/system_information.json");

  // @ts-expect-error url is a string
  client.get(null, () => {});

  // @ts-expect-error status is "Active" or "Not In Service"
  const badStatus: Citibike.Station["status"] = "Closed";
  void badStatus;

  // @ts-expect-error station ids are strings
  const badId: Citibike.Station["id"] = 66;
  void badId;
}
