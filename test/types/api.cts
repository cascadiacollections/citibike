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
  | "stationId"
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
  | "stationAddress"
  | "nearbyStations";

type _stationKeys = Assert<Equal<keyof Citibike.LegacyStation, StationKeys>>;
type _id = Assert<Equal<Citibike.LegacyStation["id"], number | string>>;
type _stationId = Assert<Equal<Citibike.LegacyStation["stationId"], string>>;
type _nearby = Assert<Equal<Citibike.LegacyStation["nearbyStations"], Citibike.NearbyLegacyStation[] | undefined>>;
type _nearbyKeys = Assert<Equal<keyof Citibike.NearbyLegacyStation, "id" | "distance">>;
type _status = Assert<Equal<Citibike.LegacyStation["status"], "Active" | "Not In Service">>;
type _bikes = Assert<Equal<Citibike.LegacyStation["availableBikes"], number>>;
type _ebikes = Assert<Equal<Citibike.LegacyStation["availableEbikes"], number>>;
type _docks = Assert<Equal<Citibike.LegacyStation["availableDocks"], number>>;
type _reported = Assert<Equal<Citibike.LegacyStation["lastReported"], number>>;
type _label = Assert<Equal<Citibike.LegacyStation["label"], string | undefined>>;
type _shortName = Assert<Equal<Citibike.LegacyStation["shortName"], string | undefined>>;
type _lat = Assert<Equal<Citibike.LegacyStation["latitude"], number | undefined>>;
type _lon = Assert<Equal<Citibike.LegacyStation["longitude"], number | undefined>>;
type _capacity = Assert<Equal<Citibike.LegacyStation["capacity"], number | undefined>>;
type _address = Assert<Equal<Citibike.LegacyStation["stationAddress"], string | undefined>>;

type _ok = Assert<Equal<Citibike.StationsResult["ok"], true>>;
type _meta = Assert<Equal<Citibike.StationsResult["meta"], never[]>>;
type _results = Assert<Equal<Citibike.StationsResult["results"], Citibike.LegacyStation[]>>;
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
type _errCode = Assert<Equal<Citibike.ErrorResult["code"], Citibike.ErrorCode | "EDISCONTINUED" | undefined>>;
type _errKeys = Assert<Equal<keyof Citibike.ErrorResult, "ok" | "meta" | "results" | "error" | "code">>;

type ModernStationKeys =
  | "id"
  | "legacyId"
  | "name"
  | "shortName"
  | "latitude"
  | "longitude"
  | "capacity"
  | "regionId"
  | "bikesAvailable"
  | "ebikesAvailable"
  | "classicBikesAvailable"
  | "docksAvailable"
  | "bikesDisabled"
  | "docksDisabled"
  | "isInstalled"
  | "isRenting"
  | "isReturning"
  | "lastReported";

type _modernKeys = Assert<Equal<keyof Citibike.Station, ModernStationKeys>>;
type _modernId = Assert<Equal<Citibike.Station["id"], string>>;
type _modernLegacyId = Assert<Equal<Citibike.Station["legacyId"], number | null>>;
type _modernRenting = Assert<Equal<Citibike.Station["isRenting"], boolean>>;
type _nearbyStationKeys = Assert<Equal<keyof Citibike.NearbyStation, ModernStationKeys | "distance">>;
type _errorCodes = Assert<Equal<
  Citibike.ErrorCode,
  "ETIMEDOUT" | "EABORTED" | "ENETWORK" | "EHTTP" | "EPARSE" | "EPAYLOAD"
>>;
type _optCache = Assert<Equal<Citibike.Options["cache"], boolean | undefined>>;
type _resCache = Assert<Equal<Citibike.ResolvedOptions["cache"], boolean>>;

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

  const full: Citibike.LegacyStation = {
    id: 72,
    stationId: "66db237e-0aca-11e7-82f6-3863bb44ef7c",
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
    stationAddress: "",
    nearbyStations: [{ id: 480, distance: 0.1778 }]
  };
  const liveOnly: Citibike.LegacyStation = {
    id: full.stationId,
    stationId: full.stationId,
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
      const id: number | string = data.results[0].id;
      const nearby: Citibike.NearbyLegacyStation[] | undefined = data.results[0].nearbyStations;
      void nearby;
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
  const badStatus: Citibike.LegacyStation["status"] = "Closed";
  void badStatus;

  // @ts-expect-error station ids are numbers or strings
  const badId: Citibike.LegacyStation["id"] = null;
  void badId;

  checkPromiseApi(Ctor, client);
}

function checkPromiseApi(Ctor: typeof Citibike, client: Citibike): void {
  const withCache: Citibike = new Ctor({ cache: false, fetch: fetch });
  void withCache;

  async function run(): Promise<void> {
    const stations: Citibike.Station[] = await client.stations();
    await client.stations({ fresh: true, signal: new AbortController().signal });
    const name: string = stations[0].name;
    const legacyId: number | null = stations[0].legacyId;
    void name;
    void legacyId;

    const one: Citibike.Station | null = await client.station(72);
    await client.station("6926.01", { fresh: true });
    if (one !== null) void one.bikesAvailable;

    const near: Citibike.NearbyStation[] = await client.nearest(
      { latitude: 40.7527, longitude: -73.9772 },
      { limit: 3, radius: 800, available: "ebikes" }
    );
    await client.nearest({ lat: 40.7527, lon: -73.9772 });
    const meters: number = near[0].distance;
    void meters;

    const status = await client.feed("station_status");
    const bikes: number = status.data.stations[0].num_bikes_available;
    const information = await client.feed("station_information");
    const lat: number = information.data.stations[0].lat;
    const system = await client.feed<{ name: string }>("system_information");
    const systemName: string = system.data.name;
    const ttl: number = system.ttl;
    const raw = await client.feed("system_alerts");
    const unknownField: unknown = raw.data.alerts;
    void bikes;
    void lat;
    void systemName;
    void ttl;
    void unknownField;

    const cleared: Citibike = client.clearCache().clearCache();
    void cleared;

    try {
      await client.stations();
    } catch (error) {
      if (error instanceof Ctor.CitibikeError) {
        const code: Citibike.ErrorCode = error.code;
        const httpStatus: number | null = error.status;
        const url: string | null = error.url;
        const message: string = error.message;
        void code;
        void httpStatus;
        void url;
        void message;
      }
    }

    // @ts-expect-error a point needs both coordinates
    await client.nearest({ latitude: 40.75 });

    // @ts-expect-error unknown availability filter
    await client.nearest({ latitude: 40.75, longitude: -73.98 }, { available: "scooters" });

    // @ts-expect-error limit is a number
    await client.nearest({ latitude: 40.75, longitude: -73.98 }, { limit: "5" });

    // @ts-expect-error an id is required
    await client.station();

    // @ts-expect-error a feed name is required
    await client.feed();

    // @ts-expect-error fresh is a boolean
    await client.stations({ fresh: "yes" });

    // @ts-expect-error stations() resolves with an array, not the 2.x envelope
    void (await client.stations()).results;
  }
  void run;

  const meters: number = Ctor.distance({ latitude: 40.75, longitude: -73.98 }, { lat: 40.76, lon: -73.97 });
  const error: Error = new Ctor.CitibikeError("EHTTP", "HTTP 503", { status: 503, url: "https://example.com" });
  const named: Citibike = new Ctor.Citibike();
  void meters;
  void error;
  void named;

  // @ts-expect-error unknown error code
  new Ctor.CitibikeError("ENOPE", "x");

  // @ts-expect-error both points are required
  Ctor.distance({ latitude: 40.75, longitude: -73.98 });
}
