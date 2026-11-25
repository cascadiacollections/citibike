/**
 * Type declarations for the CommonJS citibike client (`module.exports = Citibike`).
 * Hand-written to match `lib/citibike.js`. Not generated.
 *
 *   const Citibike = require("citibike");
 *   import Citibike from "citibike";
 *
 * The default import needs `esModuleInterop`, which `module: nodenext` and
 * `module: node16` enable. `require("citibike")` and
 * `import Citibike = require("citibike")` work without it.
 */

/**
 * Client for Citi Bike's public GBFS feeds. Works with or without `new`.
 * Every option is optional; options you pass override the defaults.
 */
declare function Citibike(options?: Citibike.Options): Citibike;

declare class Citibike {
    /**
     * Client for Citi Bike's public GBFS feeds. Works with or without `new`.
     * Every option is optional; options you pass override the defaults.
     */
    constructor(options?: Citibike.Options);

    /** Default client options. Passing options to the constructor does not change this. */
    defaults: Citibike.ResolvedOptions;

    /** Defaults merged with the options passed to the constructor. `headers` are merged, not replaced. */
    options: Citibike.ResolvedOptions;

    /**
     * HTTP(S) GET that parses the JSON body.
     *
     * The callback receives one value. On failure (network error, non-2xx status,
     * timeout, or invalid JSON) it is an `ErrorResult`. On success it is the parsed
     * JSON body, unchanged (`any`).
     *
     * Throws synchronously if `url` is null or `callback` is not a function.
     *
     * @param url URL, or a path starting with `/` resolved against `options.restBase`.
     * @param callback Called once with the parsed JSON body, or an `ErrorResult`.
     * @returns The client, for chaining.
     */
    get(url: string, callback: (data: any) => void): this;

    /**
     * @param url URL, or a path starting with `/` resolved against `options.restBase`.
     * @param params Query string parameters to append. `null` sends none.
     * @param callback Called once with the parsed JSON body, or an `ErrorResult`.
     * @returns The client, for chaining.
     */
    get(url: string, params: Citibike.QueryParams | null, callback: (data: any) => void): this;

    /**
     * Joins the GBFS `station_information` and `station_status` feeds into
     * `{ ok, meta, results, activeStations, totalStations, lastUpdate }`.
     * Stations present in `station_status` but missing from `station_information`
     * are left out of the full response.
     *
     * Throws synchronously if `callback` is not a function.
     *
     * @param callback Called once with a `StationsResult` or an `ErrorResult`.
     * @returns The client, for chaining.
     */
    getStations(callback: (data: Citibike.StationsResult | Citibike.ErrorResult) => void): this;

    /**
     * @param params Pass `null` or omit (the other overload) for the full response.
     *   `updateOnly: true` fetches only `station_status`; each station then has just the live availability fields.
     * @param callback Called once with a `StationsResult` or an `ErrorResult`.
     * @returns The client, for chaining.
     */
    getStations(params: Citibike.GetStationsParams | null, callback: (data: Citibike.StationsResult | Citibike.ErrorResult) => void): this;

    /**
     * Citi Bike branch locations. No longer published, so this makes no request
     * and always calls back asynchronously with an `ErrorResult`.
     * Kept so code written for 2.x does not crash.
     *
     * @deprecated Citi Bike no longer publishes this data and GBFS has no equivalent.
     * @param callback Called once with an `ErrorResult`.
     * @returns The client, for chaining.
     */
    getBranches(callback: (data: Citibike.ErrorResult) => void): this;

    /**
     * @deprecated Citi Bike no longer publishes this data and GBFS has no equivalent.
     * @param params Ignored.
     * @param callback Called once with an `ErrorResult`.
     * @returns The client, for chaining.
     */
    getBranches(params: object | null, callback: (data: Citibike.ErrorResult) => void): this;

    /**
     * Helmet retailer locations. No longer published, so this makes no request
     * and always calls back asynchronously with an `ErrorResult`.
     * Kept so code written for 2.x does not crash.
     *
     * @deprecated Citi Bike no longer publishes this data and GBFS has no equivalent.
     * @param callback Called once with an `ErrorResult`.
     * @returns The client, for chaining.
     */
    getHelmets(callback: (data: Citibike.ErrorResult) => void): this;

    /**
     * @deprecated Citi Bike no longer publishes this data and GBFS has no equivalent.
     * @param params Ignored.
     * @param callback Called once with an `ErrorResult`.
     * @returns The client, for chaining.
     */
    getHelmets(params: object | null, callback: (data: Citibike.ErrorResult) => void): this;
}

declare namespace Citibike {
    /**
     * Client options. Pass any of these to `new Citibike(options)`.
     * Every field is optional.
     */
    interface Options {
        /**
         * Base URL for paths that start with `/`.
         * Lyft hosts the same feeds at `https://gbfs.lyft.com/gbfs/1.1/bkn/en`.
         * @default "https://gbfs.citibikenyc.com/gbfs/en"
         */
        restBase?: string;

        /**
         * Path of the station information feed, relative to `restBase`.
         * @default "/station_information.json"
         */
        stationInformationURL?: string;

        /**
         * Path of the station status feed, relative to `restBase`.
         * @default "/station_status.json"
         */
        stationStatusURL?: string;

        /**
         * Request timeout in milliseconds. A timed-out request calls back with an `ErrorResult`.
         * @default 10000
         */
        timeout?: number;

        /**
         * Extra request headers. Merged over the defaults
         * (`Accept: application/json` and `User-Agent: node-citibike/<version>`).
         */
        headers?: { [header: string]: string };

        /**
         * Stored on `client.options.apiKey` but not sent anywhere.
         * Kept for code written against 2.x.
         * @default null
         */
        apiKey?: string | null;
    }

    /**
     * `client.options` and `client.defaults` after defaults are applied.
     * `defaults` is the built-in set. `options` is that set merged with
     * what was passed to the constructor.
     */
    interface ResolvedOptions {
        restBase: string;
        stationInformationURL: string;
        stationStatusURL: string;
        timeout: number;
        headers: { [header: string]: string };
        apiKey: string | null;
    }

    /** Query string parameters appended by `get()`. */
    interface QueryParams {
        [key: string]: string | number | boolean | null | undefined;
    }

    /** Argument to `getStations()`. Only `updateOnly` is read. */
    interface GetStationsParams {
        /**
         * If true, only `station_status` is fetched and each station has just
         * the live availability fields (no name or coordinates).
         */
        updateOnly?: boolean;
    }

    /**
     * One station in a `StationsResult`. The first six fields are always present.
     * The rest come from `station_information` and are missing when you call
     * `getStations({ updateOnly: true })`.
     */
    interface Station {
        /** GBFS `station_id`. A string since 3.0.0. */
        id: string;

        /** `"Active"` if the station is installed and renting, otherwise `"Not In Service"`. */
        status: "Active" | "Not In Service";

        /** Bikes ready to rent, including e-bikes. */
        availableBikes: number;

        /** E-bikes ready to rent. `0` if the feed does not say. */
        availableEbikes: number;

        /** Empty docks. */
        availableDocks: number;

        /** When the station last reported, as a Unix timestamp in seconds. */
        lastReported: number;

        /** Station name, for example `"W 52 St & 11 Ave"`. */
        label?: string;

        /** Short station code. */
        shortName?: string;

        /** Latitude in decimal degrees. */
        latitude?: number;

        /** Longitude in decimal degrees. */
        longitude?: number;

        /** Total docks at the station. */
        capacity?: number;

        /** Street address, or `""` when the feed has none. */
        stationAddress?: string;
    }

    /** What `getStations` passes to its callback on success. */
    interface StationsResult {
        /** Always `true`. */
        ok: true;

        /** Always `[]`. Kept for 2.x compatibility. */
        meta: never[];

        /** The stations. */
        results: Station[];

        /** How many stations in `results` have `status: "Active"`. */
        activeStations: number;

        /** `results.length`. */
        totalStations: number;

        /** The `station_status` feed's `last_updated`, as a Unix timestamp in seconds. */
        lastUpdate: number;
    }

    /**
     * What every method passes to its callback when something goes wrong:
     * network error, timeout, non-2xx status, invalid JSON, an unexpected
     * payload, or a discontinued method. Check `data.ok` first.
     */
    interface ErrorResult {
        /** Always `false`. */
        ok: false;

        /** Always `[]`. */
        meta: never[];

        /** Always `[]`. */
        results: never[];

        /** What went wrong. */
        error: string;
    }
}

export = Citibike;
