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
 *
 * The promise methods (`stations`, `station`, `nearest`, `feed`) are the 3.x
 * API. The callback methods (`getStations`, `get`, `getBranches`, `getHelmets`)
 * keep the 2.x signatures and result shapes.
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
     * Every station with its live availability: the GBFS `station_information`
     * and `station_status` feeds joined by station id. Stations that appear in
     * only one of the two feeds are left out.
     *
     * Both feeds are cached for as long as their own `ttl` says.
     *
     * @returns Resolves with every station. Rejects with a `CitibikeError`.
     */
    stations(options?: Citibike.RequestOptions): Promise<Citibike.Station[]>;

    /**
     * Looks up one station.
     *
     * @param id GBFS `station_id`, the numeric legacy id that 2.x used (`72`),
     *   or the short name printed on the dock (`"6926.01"`).
     * @returns Resolves with the station, or `null` if there is no match. Rejects with a `CitibikeError`.
     */
    station(id: string | number, options?: Citibike.RequestOptions): Promise<Citibike.Station | null>;

    /**
     * The stations closest to a point, nearest first. Each one has a `distance`
     * in meters, measured in a straight line.
     *
     * @returns Resolves with the matching stations. Rejects with a `CitibikeError`,
     *   or a `TypeError` if `point` or an option is invalid.
     */
    nearest(point: Citibike.Point, options?: Citibike.NearestOptions): Promise<Citibike.NearbyStation[]>;

    /**
     * A GBFS feed exactly as served: `{ last_updated, ttl, version, data }`.
     * The result is cached for the feed's `ttl` and shared between callers, so
     * treat it as read-only.
     *
     * @param name Feed name (`"system_alerts"`), a path under `restBase`
     *   (`"/system_alerts.json"`) or an absolute URL.
     * @returns Resolves with the feed. Rejects with a `CitibikeError`.
     */
    feed(name: "station_information", options?: Citibike.RequestOptions): Promise<Citibike.Feed<{ stations: Citibike.GbfsStationInformation[] }>>;
    feed(name: "station_status", options?: Citibike.RequestOptions): Promise<Citibike.Feed<{ stations: Citibike.GbfsStationStatus[] }>>;
    feed<T extends object = { [field: string]: unknown }>(name: string, options?: Citibike.RequestOptions): Promise<Citibike.Feed<T>>;

    /**
     * Forgets every cached feed, so the next call fetches fresh data.
     *
     * @returns The client, for chaining.
     */
    clearCache(): this;

    /**
     * HTTP(S) GET that parses the JSON body. 2.x-compatible; new code should use `feed()`.
     * Responses are never cached.
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
     * Station data in the shape 2.x returned. 2.x-compatible; new code should use `stations()`.
     *
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
    /** The client again, for `const { Citibike } = require("citibike")` and `import { Citibike } from "citibike"`. */
    export { Citibike };

    /**
     * Straight-line (great-circle) distance between two points, in meters.
     * Throws a `TypeError` unless both points have numeric coordinates in range.
     */
    export function distance(a: Point, b: Point): number;

    /** What every promise method rejects with. */
    export class CitibikeError extends Error {
        constructor(code: ErrorCode, message: string, details?: { url?: string; status?: number; cause?: unknown });

        name: "CitibikeError";

        /** What went wrong. */
        code: ErrorCode;

        /** The URL that was requested, if there was one. */
        url: string | null;

        /** The HTTP status, when `code` is `"EHTTP"`. */
        status: number | null;
    }

    /**
     * `ETIMEDOUT`: the request took longer than `options.timeout`.
     * `EABORTED`: the `signal` you passed was aborted.
     * `ENETWORK`: the connection failed, or closed before the response finished.
     * `EHTTP`: the server answered with a non-2xx status.
     * `EPARSE`: the response was not valid JSON.
     * `EPAYLOAD`: valid JSON, but not shaped like the feed that was asked for.
     */
    export type ErrorCode = "ETIMEDOUT" | "EABORTED" | "ENETWORK" | "EHTTP" | "EPARSE" | "EPAYLOAD";

    /**
     * Client options. Pass any of these to `new Citibike(options)`.
     * Every field is optional.
     */
    export interface Options {
        /**
         * Base URL for feeds and for paths that start with `/`.
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
         * How long one request may take, in milliseconds, from start to the end of the body.
         * `0` turns the timeout off.
         * @default 10000
         */
        timeout?: number;

        /**
         * Keep each feed in memory for as long as its own `ttl` says.
         * `false` fetches on every call.
         * @default true
         */
        cache?: boolean;

        /** A `fetch` implementation to use instead of the global one, for proxies, retries or tests. */
        fetch?: typeof fetch;

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
    export interface ResolvedOptions {
        restBase: string;
        stationInformationURL: string;
        stationStatusURL: string;
        timeout: number;
        cache: boolean;
        headers: { [header: string]: string };
        apiKey: string | null;
        fetch?: typeof fetch;
    }

    /** Per-call options accepted by every promise method. */
    export interface RequestOptions {
        /** Abort the call. The promise rejects with a `CitibikeError` whose `code` is `"EABORTED"`. */
        signal?: AbortSignal;

        /**
         * Skip the cache and fetch the feeds again.
         * @default false
         */
        fresh?: boolean;
    }

    /** Options for `nearest()`. */
    export interface NearestOptions extends RequestOptions {
        /**
         * The most stations to return.
         * @default 5
         */
        limit?: number;

        /** Leave out stations further away than this many meters. */
        radius?: number;

        /** Only stations that can hand one out (or, for `"docks"`, take a bike back) right now. */
        available?: "bikes" | "ebikes" | "docks";
    }

    /** A coordinate. The GBFS spelling `{ lat, lon }` is accepted too. */
    export type Point = { latitude: number; longitude: number } | { lat: number; lon: number };

    /** One station, as returned by `stations()`, `station()` and `nearest()`. */
    export interface Station {
        /** GBFS `station_id`. */
        id: string;

        /** The numeric id 2.x used, or `null` if the feed has none for this station. */
        legacyId: number | null;

        /** Station name, for example `"W 52 St & 11 Ave"`. */
        name: string;

        /** Short station code, for example `"6926.01"`. */
        shortName: string | null;

        /** Latitude in decimal degrees. */
        latitude: number;

        /** Longitude in decimal degrees. */
        longitude: number;

        /** Total docks at the station. */
        capacity: number | null;

        /** GBFS `region_id`. Look it up in the `system_regions` feed. */
        regionId: string | null;

        /** Bikes ready to rent, including e-bikes. */
        bikesAvailable: number;

        /** E-bikes ready to rent. */
        ebikesAvailable: number;

        /** `bikesAvailable` minus `ebikesAvailable`. */
        classicBikesAvailable: number;

        /** Empty docks that accept a return. */
        docksAvailable: number;

        /** Bikes at the station that cannot be rented. */
        bikesDisabled: number;

        /** Docks that are out of service. */
        docksDisabled: number;

        /** The station is on the street. */
        isInstalled: boolean;

        /** The station is letting bikes out. */
        isRenting: boolean;

        /** The station is taking bikes back. */
        isReturning: boolean;

        /** When the station last reported, as a Unix timestamp in seconds. */
        lastReported: number | null;
    }

    /** A `Station` with its distance from the point passed to `nearest()`. */
    export interface NearbyStation extends Station {
        /** Straight-line distance from the point, in meters. */
        distance: number;
    }

    /** A GBFS feed, exactly as served. */
    export interface Feed<T extends object = { [field: string]: unknown }> {
        /** When the feed was last updated, as a Unix timestamp in seconds. */
        last_updated: number;

        /** How many seconds the feed stays current. */
        ttl: number;

        /** GBFS version, when the feed says. */
        version?: string;

        data: T;
    }

    /** One entry of the `station_information` feed. Fields this library does not read are `unknown`. */
    export interface GbfsStationInformation {
        station_id: string;
        name: string;
        short_name?: string;
        lat: number;
        lon: number;
        region_id?: string;
        capacity?: number;
        [field: string]: unknown;
    }

    /** One entry of the `station_status` feed. Fields this library does not read are `unknown`. */
    export interface GbfsStationStatus {
        station_id: string;
        legacy_id?: string;
        num_bikes_available: number;
        num_ebikes_available?: number;
        num_bikes_disabled?: number;
        num_docks_available: number;
        num_docks_disabled?: number;
        is_installed: boolean | number;
        is_renting: boolean | number;
        is_returning: boolean | number;
        last_reported: number;
        [field: string]: unknown;
    }

    /** Query string parameters appended by `get()`. */
    export interface QueryParams {
        [key: string]: string | number | boolean | null | undefined;
    }

    /** Argument to `getStations()`. Only `updateOnly` is read. */
    export interface GetStationsParams {
        /**
         * If true, only `station_status` is fetched and each station has just
         * the live availability fields (no name or coordinates).
         */
        updateOnly?: boolean;
    }

    /**
     * One station in a `StationsResult`, in the shape 2.x used. The first seven
     * fields are always present. The rest come from `station_information` and
     * are missing when you call `getStations({ updateOnly: true })`.
     */
    export interface LegacyStation {
        /**
         * The numeric station id 2.x reported. Falls back to the GBFS `station_id`
         * string for a station the feed gives no legacy id.
         */
        id: number | string;

        /** GBFS `station_id`. */
        stationId: string;

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

        /** The five closest stations, nearest first. */
        nearbyStations?: NearbyLegacyStation[];
    }

    /** One entry of a `LegacyStation`'s `nearbyStations`. */
    export interface NearbyLegacyStation {
        /** The neighbour's `id`, as in `LegacyStation`. */
        id: number | string;

        /** Straight-line distance in miles, as 2.x reported it. */
        distance: number;
    }

    /** What `getStations` passes to its callback on success. */
    export interface StationsResult {
        /** Always `true`. */
        ok: true;

        /** Always `[]`. Kept for 2.x compatibility. */
        meta: never[];

        /** The stations. */
        results: LegacyStation[];

        /** How many stations in `results` have `status: "Active"`. */
        activeStations: number;

        /** `results.length`. */
        totalStations: number;

        /** The `station_status` feed's `last_updated`, as a Unix timestamp in seconds. */
        lastUpdate: number;
    }

    /**
     * What every callback method passes to its callback when something goes wrong:
     * network error, timeout, non-2xx status, invalid JSON, an unexpected
     * payload, or a discontinued method. Check `data.ok` first.
     */
    export interface ErrorResult {
        /** Always `false`. */
        ok: false;

        /** Always `[]`. */
        meta: never[];

        /** Always `[]`. */
        results: never[];

        /** What went wrong. */
        error: string;

        /** The matching `CitibikeError` code, or `"EDISCONTINUED"` for a discontinued method. */
        code?: ErrorCode | "EDISCONTINUED";
    }
}

export = Citibike;
