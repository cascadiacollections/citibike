"use strict";

/*!
 *  CitibikeNYC API Node.js library
 *  Author: Kevin Coughlin @kevintcoughlin
 *  MIT Licensed
 */

/**
 * Module Dependencies
 */
var querystring = require('querystring')
  , pkg = require('../package.json');

/**
 * Error message used by methods whose data Citi Bike no longer publishes.
 *
 * @private
 */
var DISCONTINUED = 'is not available: Citi Bike retired the appservices.citibikenyc.com API ' +
  'and its GBFS feeds have no equivalent data.';

var EARTH_RADIUS_M = 6371008.8;
var METERS_PER_MILE = 1609.344;

/** How many neighbours 2.x listed in each station's `nearbyStations`. @private */
var NEARBY_COUNT = 5;

/**
 * The error every promise method rejects with. `code` says what went wrong:
 *
 * `ETIMEDOUT` the request took longer than `options.timeout`.
 * `EABORTED` the `signal` you passed was aborted.
 * `ENETWORK` the connection failed, or closed before the response finished.
 * `EHTTP` the server answered with a non-2xx status (see `status`).
 * `EPARSE` the response was not valid JSON.
 * `EPAYLOAD` the JSON was valid but not shaped like the GBFS feed that was asked for.
 *
 * @private
 */
class CitibikeError extends Error {
    constructor( code, message, details ) {
        super(message, details && details.cause ? { cause: details.cause } : undefined);
        this.name = 'CitibikeError';
        this.code = code;
        this.url = details && details.url != null ? details.url : null;
        this.status = details && details.status != null ? details.status : null;
    }
}

/**
 * Client for Citi Bike's public GBFS feeds. Works with or without `new`.
 * Every option is optional; options you pass override the defaults.
 *
 * The client has two sets of methods. The promise methods
 * ({@link Citibike#stations}, {@link Citibike#station}, {@link Citibike#nearest}
 * and {@link Citibike#feed}) are the 3.x API. The callback methods
 * ({@link Citibike#getStations}, {@link Citibike#get}, {@link Citibike#getBranches}
 * and {@link Citibike#getHelmets}) keep the 2.x signatures and result shapes,
 * so code written for 2.x keeps working.
 *
 * @class Citibike
 * @param {Options} [options] Client options.
 * @example
 * const Citibike = require('citibike');
 * const citibike = new Citibike({
 *   timeout: 5000,
 *   headers: { 'User-Agent': 'my-app/1.0' }
 * });
 */
function Citibike( options ) {
    if (!(this instanceof Citibike))
        return new Citibike(options);

    // Default Client Options
    this.defaults = {
        apiKey: null,

        headers: {
            'Accept': 'application/json',
            'User-Agent': 'node-citibike/' + pkg.version
        },

        timeout:               10000,
        cache:                 true,

        restBase:              'https://gbfs.citibikenyc.com/gbfs/en',
        stationInformationURL: '/station_information.json',
        stationStatusURL:      '/station_status.json'
    };

    options = options || {};
    this.options = Object.assign({}, this.defaults, options, {
        headers: Object.assign({}, this.defaults.headers, options.headers)
    });

    // Feed cache and in-flight requests, both keyed by URL. Not enumerable, so
    // logging or serialising a client shows only `defaults` and `options`.
    Object.defineProperty(this, '_cache', { value: new Map() });
    Object.defineProperty(this, '_pending', { value: new Map() });
}

/**
 * Builds the result envelope passed to callbacks on failure.
 *
 * @private
 * @param {String|Error} error Description of what went wrong, or the error itself.
 */
function failure( error ) {
    var result = { ok: false, meta: [], results: [], error: String(error && error.message || error) };
    if (error && error.code) result.code = error.code;
    return result;
}

/**
 * Hands a result to a 2.x-style callback outside the promise chain, so an
 * exception thrown by the callback surfaces as an ordinary uncaught exception
 * instead of an unhandled rejection.
 *
 * @private
 */
function deliver( promise, callback ) {
    promise.then(function(data) { return data; }, failure).then(function(data) {
        queueMicrotask(function() { callback(data); });
    });
}

/**
 * Resolves a URL or a `/path` against `restBase`.
 *
 * @private
 */
function resolveURL( client, url ) {
    return url.charAt(0) == '/' ? client.options.restBase + url : url;
}

/**
 * Settles like `promise`, unless `signal` aborts first.
 *
 * @private
 */
function withSignal( promise, signal, url ) {
    if (!signal) return promise;
    function aborted() {
        return new CitibikeError('EABORTED', 'Request to ' + url + ' was aborted', { url: url, cause: signal.reason });
    }
    if (signal.aborted) {
        promise.catch(function() {});
        return Promise.reject(aborted());
    }
    return new Promise(function(resolve, reject) {
        function onAbort() { reject(aborted()); }
        signal.addEventListener('abort', onAbort, { once: true });
        promise.then(function(value) {
            signal.removeEventListener('abort', onAbort);
            resolve(value);
        }, function(error) {
            signal.removeEventListener('abort', onAbort);
            reject(error);
        });
    });
}

/**
 * Issues one GET request and parses the JSON body. Rejects with a CitibikeError.
 *
 * @private
 * @param {Citibike} client The client whose options apply.
 * @param {String}   url    Absolute URL.
 */
async function request( client, url ) {
    var timeout = client.options.timeout
      , timer = timeout > 0 ? AbortSignal.timeout(timeout) : undefined
      , doFetch = client.options.fetch || globalThis.fetch
      , res
      , body;

    function transportError( e, duringBody ) {
        if (timer && timer.aborted) {
            return new CitibikeError('ETIMEDOUT', 'Request timed out after ' + timeout + 'ms', { url: url, cause: e });
        }
        if (duringBody) {
            return new CitibikeError('ENETWORK', 'Connection closed before response from ' + url + ' finished', { url: url, cause: e });
        }
        // fetch() reports "fetch failed" and keeps the useful part in `cause`.
        var message = e && e.cause && e.cause.message || e && e.message || String(e);
        return new CitibikeError('ENETWORK', message, { url: url, cause: e });
    }

    try {
        res = await doFetch(url, { headers: client.options.headers, signal: timer });
    } catch (e) {
        throw transportError(e, false);
    }

    try {
        body = await res.text();
    } catch (e) {
        throw transportError(e, true);
    }

    if (!res.ok) {
        throw new CitibikeError('EHTTP', 'HTTP ' + res.status + ' from ' + url, { url: url, status: res.status });
    }

    try {
        return JSON.parse(body);
    } catch (e) {
        throw new CitibikeError('EPARSE', 'Invalid JSON from ' + url + ': ' + e.message, { url: url, cause: e });
    }
}

/**
 * Fetches a GBFS feed, honouring the feed's own `ttl` and sharing one request
 * between callers that ask for the same URL at the same time.
 *
 * @private
 * @param {Citibike} client    The client.
 * @param {String}   url       Absolute feed URL.
 * @param {String}   name      Feed name, used in error messages.
 * @param {Object}   [options] `{ signal, fresh }`.
 */
function fetchFeed( client, url, name, options ) {
    var signal = options && options.signal
      , useCache = client.options.cache !== false
      , hit = useCache && !(options && options.fresh) ? client._cache.get(url) : null;

    if (signal && signal.aborted) return withSignal(Promise.resolve(), signal, url);
    if (hit && hit.expires > Date.now()) return withSignal(Promise.resolve(hit.value), signal, url);

    var pending = client._pending.get(url);
    if (!pending) {
        pending = request(client, url).then(function(feed) {
            if (!feed || typeof feed !== 'object' || !feed.data || typeof feed.data !== 'object') {
                throw new CitibikeError('EPAYLOAD', 'Unexpected ' + name + ' payload', { url: url });
            }
            var ttl = Number(feed.ttl);
            if (useCache && ttl > 0) {
                client._cache.set(url, { value: feed, expires: Date.now() + ttl * 1000 });
            } else {
                client._cache.delete(url);
            }
            return feed;
        }).finally(function() {
            client._pending.delete(url);
        });
        client._pending.set(url, pending);
    }
    return withSignal(pending, signal, url);
}

/**
 * Fetches a feed that must carry `data.stations`.
 *
 * @private
 */
function fetchStationFeed( client, name, options ) {
    var path = name === 'station_status' ? client.options.stationStatusURL : client.options.stationInformationURL
      , url = resolveURL(client, path);
    return fetchFeed(client, url, name, options).then(function(feed) {
        if (!Array.isArray(feed.data.stations)) {
            throw new CitibikeError('EPAYLOAD', 'Unexpected ' + name + ' payload', { url: url });
        }
        return feed;
    });
}

/**
 * Great-circle distance between two coordinates, in meters.
 *
 * @private
 */
function haversine( lat1, lon1, lat2, lon2 ) {
    var rad = Math.PI / 180
      , dLat = (lat2 - lat1) * rad
      , dLon = (lon2 - lon1) * rad
      , a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Reads `{ latitude, longitude }` (or the GBFS spelling `{ lat, lon }`) and
 * throws a TypeError unless both are finite numbers in range.
 *
 * @private
 */
function coordinates( point, what ) {
    var lat = point && (point.latitude != null ? point.latitude : point.lat)
      , lon = point && (point.longitude != null ? point.longitude : point.lon);
    if (typeof lat !== 'number' || typeof lon !== 'number' || !isFinite(lat) || !isFinite(lon) ||
        Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        throw new TypeError(what + ' must be { latitude, longitude } with numbers in range');
    }
    return { latitude: lat, longitude: lon };
}

/**
 * Numeric legacy id of a `station_status` entry, or null when it has none.
 *
 * @private
 */
function legacyId( st ) {
    return st && /^\d+$/.test(String(st.legacy_id)) ? Number(st.legacy_id) : null;
}

/**
 * Joins the two station feeds into {@link Station} objects, in
 * `station_information` order.
 *
 * @private
 */
function joinStations( info, status ) {
    var statusById = new Map();
    status.data.stations.forEach(function(st) { statusById.set(st.station_id, st); });

    var stations = [];
    info.data.stations.forEach(function(meta) {
        var st = statusById.get(meta.station_id);
        if (!st) return; // no live status (yet) for this station
        var bikes = st.num_bikes_available || 0
          , ebikes = st.num_ebikes_available || 0;
        stations.push({
            id: meta.station_id,
            legacyId: legacyId(st),
            name: meta.name,
            shortName: meta.short_name != null ? meta.short_name : null,
            latitude: meta.lat,
            longitude: meta.lon,
            capacity: meta.capacity != null ? meta.capacity : null,
            regionId: meta.region_id != null ? meta.region_id : null,
            bikesAvailable: bikes,
            ebikesAvailable: ebikes,
            classicBikesAvailable: Math.max(0, bikes - ebikes),
            docksAvailable: st.num_docks_available || 0,
            bikesDisabled: st.num_bikes_disabled || 0,
            docksDisabled: st.num_docks_disabled || 0,
            isInstalled: !!st.is_installed,
            isRenting: !!st.is_renting,
            isReturning: !!st.is_returning,
            lastReported: st.last_reported != null ? st.last_reported : null
        });
    });
    return stations;
}

/**
 * Every Citi Bike station with its live availability: the GBFS
 * `station_information` and `station_status` feeds joined by station id.
 * Stations that appear in only one of the two feeds are left out.
 *
 * Both feeds are cached for as long as their own `ttl` says (60 seconds at the
 * time of writing), so calling this in a loop does not hammer Citi Bike.
 *
 * @method stations
 * @param {RequestOptions} [options] Per-call options.
 * @returns {Promise<Station[]>} Resolves with every station. Rejects with a {@link CitibikeError}.
 * @example
 * const stations = await citibike.stations();
 * const renting = stations.filter((s) => s.isRenting && s.bikesAvailable > 0);
 * console.log(renting.length + ' stations have a bike right now');
 */
Citibike.prototype.stations = function( options ) {
    return Promise.all([
        fetchStationFeed(this, 'station_information', options),
        fetchStationFeed(this, 'station_status', options)
    ]).then(function(feeds) {
        return joinStations(feeds[0], feeds[1]);
    });
}

/**
 * Looks up one station. `id` can be the GBFS `station_id`, the numeric legacy
 * id that 2.x used (`72`), or the short name printed on the dock (`"6926.01"`).
 *
 * @method station
 * @param {String|Number}  id        Station id, legacy id or short name.
 * @param {RequestOptions} [options] Per-call options.
 * @returns {Promise<Station|null>} Resolves with the station, or `null` if there is no match. Rejects with a {@link CitibikeError}.
 * @example
 * const station = await citibike.station(72);
 * if (station) console.log(station.name, station.bikesAvailable);
 */
Citibike.prototype.station = function( id, options ) {
    var wanted = String(id);
    return this.stations(options).then(function(stations) {
        for (var i = 0; i < stations.length; i++) {
            var s = stations[i];
            if (s.id === wanted || s.shortName === wanted || (s.legacyId !== null && String(s.legacyId) === wanted)) return s;
        }
        return null;
    });
}

/**
 * The stations closest to a point, nearest first. Each one has a `distance`
 * in meters, measured in a straight line.
 *
 * @method nearest
 * @param {Object}  point                Where to measure from.
 * @param {Number}  point.latitude       Latitude in decimal degrees. `lat` is accepted too.
 * @param {Number}  point.longitude      Longitude in decimal degrees. `lon` is accepted too.
 * @param {Object}  [options]            Per-call options. Takes everything in {@link RequestOptions} as well.
 * @param {Number}  [options.limit=5]    The most stations to return.
 * @param {Number}  [options.radius]     Leave out stations further away than this many meters.
 * @param {String}  [options.available]  `"bikes"`, `"ebikes"` or `"docks"`: only stations that can hand
 *                                       one out (or take one back) right now.
 * @returns {Promise<NearbyStation[]>} Resolves with the matching stations. Rejects with a {@link CitibikeError},
 *                                     or a `TypeError` if `point` or an option is invalid.
 * @example
 * const [closest] = await citibike.nearest(
 *   { latitude: 40.7527, longitude: -73.9772 },
 *   { available: 'ebikes', radius: 800 }
 * );
 * if (closest) console.log(closest.name + ' is ' + Math.round(closest.distance) + ' m away');
 */
Citibike.prototype.nearest = function( point, options ) {
    var origin, limit, radius, available;
    try {
        origin = coordinates(point, 'point');
        options = options || {};
        limit = options.limit == null ? NEARBY_COUNT : options.limit;
        radius = options.radius == null ? Infinity : options.radius;
        available = options.available;
        if (!Number.isInteger(limit) || limit < 1) throw new TypeError('options.limit must be a positive integer');
        if (typeof radius !== 'number' || !(radius >= 0)) throw new TypeError('options.radius must be a number of meters');
        if (available != null && ['bikes', 'ebikes', 'docks'].indexOf(available) === -1) {
            throw new TypeError('options.available must be "bikes", "ebikes" or "docks"');
        }
    } catch (e) {
        return Promise.reject(e);
    }

    return this.stations(options).then(function(stations) {
        return stations.filter(function(s) {
            if (typeof s.latitude !== 'number' || typeof s.longitude !== 'number') return false;
            if (available === 'bikes') return s.isInstalled && s.isRenting && s.bikesAvailable > 0;
            if (available === 'ebikes') return s.isInstalled && s.isRenting && s.ebikesAvailable > 0;
            if (available === 'docks') return s.isInstalled && s.isReturning && s.docksAvailable > 0;
            return true;
        }).map(function(s) {
            return Object.assign({}, s, {
                distance: haversine(origin.latitude, origin.longitude, s.latitude, s.longitude)
            });
        }).filter(function(s) {
            return s.distance <= radius;
        }).sort(function(a, b) {
            return a.distance - b.distance;
        }).slice(0, limit);
    });
}

/**
 * Any GBFS feed Citi Bike publishes, exactly as served:
 * `{ last_updated, ttl, version, data }`. Use it for feeds this library has no
 * dedicated method for, such as `system_information`, `system_regions`,
 * `system_alerts`, `system_pricing_plans` or `ebikes_at_stations`.
 *
 * The result is cached for the feed's `ttl` and shared between callers, so
 * treat it as read-only.
 *
 * @method feed
 * @param {String}         name      Feed name (`"system_alerts"`), a path under `restBase`
 *                                   (`"/system_alerts.json"`) or an absolute URL.
 * @param {RequestOptions} [options] Per-call options.
 * @returns {Promise<Object>} Resolves with the feed. Rejects with a {@link CitibikeError}.
 * @example
 * const info = await citibike.feed('system_information');
 * console.log(info.data.name, info.data.timezone);
 */
Citibike.prototype.feed = function( name, options ) {
    if (typeof name !== 'string' || name === '') {
        return Promise.reject(new TypeError('feed name must be a non-empty string'));
    }
    if (name === 'station_information' || name === 'station_status') {
        return fetchStationFeed(this, name, options);
    }
    var url = /^https?:/.test(name) ? name : resolveURL(this, name.charAt(0) === '/' ? name : '/' + name + '.json');
    return fetchFeed(this, url, name, options);
}

/**
 * Forgets every cached feed, so the next call fetches fresh data.
 *
 * @method clearCache
 * @returns {Citibike} The client, for chaining.
 */
Citibike.prototype.clearCache = function() {
    this._cache.clear();
    return this;
}

/**
 * Issues an HTTP(S) GET request and parses the JSON response. 2.x-compatible;
 * new code should use {@link Citibike#feed}.
 *
 * The callback always receives a single object. On failure (network error,
 * non-2xx status, timeout or invalid JSON) it is `{ ok: false, error, results: [] }`.
 * On success it is the parsed JSON body, unchanged. Responses are never cached.
 *
 * Throws synchronously if `url` is null or `callback` is not a function.
 *
 * @method get
 * @param {String}      url         URL, or a path starting with `/` that is resolved against `restBase`.
 * @param {Object}      [params]    Query string parameters to append to the request.
 * @param {Function}    callback    Called once with the parsed JSON body, or an {@link ErrorResult}.
 * @returns {Citibike} The client, for chaining.
 * @example
 * citibike.get('/system_information.json', function (data) {
 *   if (data.ok === false) return console.error(data.error);
 *   console.log(data.data.name);
 * });
 */
Citibike.prototype.get = function( url, params, callback ) {
    if (typeof params === 'function') {
        callback = params;
        params = null;
    }

    if ( typeof callback !== 'function' ) {
        throw new Error('ERROR: Invalid callback function.');
    }

    if (url == null) {
        throw new Error('ERROR: Invalid URL called.');
    }

    url = resolveURL(this, url);

    if (params != null && Object.keys(params).length > 0)
        url = url + "?" + querystring.stringify(params);

    deliver(request(this, url), callback);

    return this;
}

/**
 * Citi Bike station data in the shape 2.x returned. 2.x-compatible; new code
 * should use {@link Citibike#stations}.
 *
 * Joins the GBFS `station_information` and `station_status` feeds into the
 * `{ ok, meta, results, activeStations, totalStations, lastUpdate }` envelope.
 * Station `id` is the same number 2.x reported, and `nearbyStations` is back:
 * the old API is gone, so the library works it out from the coordinates.
 * Stations present in `station_status` but missing from `station_information`
 * are left out of the full response.
 *
 * Throws synchronously if `callback` is not a function.
 *
 * @method getStations
 * @param {Object}      [params]              Pass `null` or omit for the full response.
 * @param {Boolean}     [params.updateOnly]   If true, only `station_status` is fetched and each
 *                                            station has just the live availability fields.
 * @param {Function}    callback              Called once with a {@link StationsResult} or an {@link ErrorResult}.
 * @returns {Citibike} The client, for chaining.
 * @example
 * citibike.getStations(null, function (data) {
 *   if (!data.ok) return console.error(data.error);
 *   console.log(data.activeStations + ' of ' + data.totalStations + ' stations active');
 * });
 * @example
 * // Live availability only: one request, no names or coordinates.
 * citibike.getStations({ updateOnly: true }, function (data) {
 *   if (data.ok) console.log(data.results[0].availableBikes);
 * });
 */
Citibike.prototype.getStations = function( params, callback ) {
    if (typeof params === 'function') {
        callback = params;
        params = null;
    }

    if ( typeof callback !== 'function' ) {
        throw new Error('ERROR: Invalid callback function.');
    }

    var self = this
      , updateOnly = !!(params && params.updateOnly)
      , status = fetchStationFeed(self, 'station_status')
      , info = updateOnly ? Promise.resolve(null) : fetchStationFeed(self, 'station_information');

    // Both requests are in flight; a station_status failure is reported first.
    info.catch(function() {});

    deliver(status.then(function(statusFeed) {
        return info.then(function(infoFeed) {
            return buildStations(statusFeed, infoFeed);
        });
    }), callback);

    return this;
}

/**
 * Maps GBFS station feeds onto the 2.x station result shape.
 *
 * @private
 * @param {Object} status  Parsed station_status feed.
 * @param {Object} info    Parsed station_information feed, or null for updateOnly.
 */
function buildStations( status, info ) {
    var infoById = {};
    if (info) {
        info.data.stations.forEach(function(s) { infoById[s.station_id] = s; });
    }

    var active = 0, results = [];

    status.data.stations.forEach(function(st) {
        var isActive = !!st.is_installed && !!st.is_renting
          , legacy = legacyId(st);
        var station = {
            id: legacy !== null ? legacy : st.station_id,
            stationId: st.station_id,
            status: isActive ? 'Active' : 'Not In Service',
            availableBikes: st.num_bikes_available,
            availableEbikes: st.num_ebikes_available || 0,
            availableDocks: st.num_docks_available,
            lastReported: st.last_reported
        };

        if (info) {
            var meta = infoById[st.station_id];
            if (!meta) return; // status for a station not (yet) in station_information
            station.label = meta.name;
            station.shortName = meta.short_name;
            station.latitude = meta.lat;
            station.longitude = meta.lon;
            station.capacity = meta.capacity;
            station.stationAddress = meta.address || '';
        }

        if (isActive) active++;
        results.push(station);
    });

    if (info) addNearbyStations(results);

    return {
        ok: true,
        meta: [],
        results: results,
        activeStations: active,
        totalStations: results.length,
        lastUpdate: status.last_updated
    };
}

/**
 * Gives every station the `nearbyStations` list 2.x had: its closest
 * neighbours as `{ id, distance }`, nearest first, with `distance` in miles.
 *
 * Stations are walked in latitude order, outwards from each one, and the walk
 * stops as soon as the latitude gap alone is wider than the furthest neighbour
 * kept so far. That keeps a few thousand stations well under a full pairwise scan.
 *
 * @private
 * @param {Object[]} stations 2.x-shaped stations; mutated in place.
 */
function addNearbyStations( stations ) {
    var located = stations.filter(function(s) {
        s.nearbyStations = [];
        return typeof s.latitude === 'number' && typeof s.longitude === 'number';
    }).sort(function(a, b) {
        return a.latitude - b.latitude;
    });

    var metersPerDegree = EARTH_RADIUS_M * Math.PI / 180;

    located.forEach(function(s, pos) {
        var best = []
          , lo = pos - 1
          , hi = pos + 1;

        while (lo >= 0 || hi < located.length) {
            var gapLo = lo >= 0 ? s.latitude - located[lo].latitude : Infinity
              , gapHi = hi < located.length ? located[hi].latitude - s.latitude : Infinity
              , other = gapLo <= gapHi ? located[lo--] : located[hi++]
              , gap = Math.min(gapLo, gapHi) * metersPerDegree;

            if (best.length === NEARBY_COUNT && gap > best[NEARBY_COUNT - 1].meters) break;

            var meters = haversine(s.latitude, s.longitude, other.latitude, other.longitude)
              , at = best.length;
            while (at > 0 && best[at - 1].meters > meters) at--;
            if (at < NEARBY_COUNT) {
                best.splice(at, 0, { id: other.id, meters: meters });
                if (best.length > NEARBY_COUNT) best.pop();
            }
        }

        s.nearbyStations = best.map(function(n) {
            return { id: n.id, distance: n.meters / METERS_PER_MILE };
        });
    });
}

/**
 * Citi Bank branch locations. No longer published by Citi Bike, so this makes
 * no request and always calls back (asynchronously) with an {@link ErrorResult}.
 * It is kept so code written for 2.x does not crash.
 *
 * @method getBranches
 * @deprecated Citi Bike no longer publishes this data and GBFS has no equivalent.
 * @param {Object}      [params]    Ignored.
 * @param {Function}    callback    Called once with an {@link ErrorResult}.
 * @returns {Citibike} The client, for chaining.
 */
Citibike.prototype.getBranches = function( params, callback ) {
    return discontinued(this, 'getBranches()', params, callback);
}

/**
 * Helmet retailer locations. No longer published by Citi Bike, so this makes
 * no request and always calls back (asynchronously) with an {@link ErrorResult}.
 * It is kept so code written for 2.x does not crash.
 *
 * @method getHelmets
 * @deprecated Citi Bike no longer publishes this data and GBFS has no equivalent.
 * @param {Object}      [params]    Ignored.
 * @param {Function}    callback    Called once with an {@link ErrorResult}.
 * @returns {Citibike} The client, for chaining.
 */
Citibike.prototype.getHelmets = function( params, callback ) {
    return discontinued(this, 'getHelmets()', params, callback);
}

/** @private */
function discontinued( client, name, params, callback ) {
    if (typeof params === 'function') callback = params;
    if ( typeof callback !== 'function' ) {
        throw new Error('ERROR: Invalid callback function.');
    }
    var result = failure(name + ' ' + DISCONTINUED);
    result.code = 'EDISCONTINUED';
    process.nextTick(callback, result);
    return client;
}

/**
 * Straight-line (great-circle) distance between two points, in meters.
 * A static helper: call it as `Citibike.distance(a, b)`.
 *
 * @private
 * @param {Object} a `{ latitude, longitude }`.
 * @param {Object} b `{ latitude, longitude }`.
 */
function distance( a, b ) {
    var from = coordinates(a, 'a')
      , to = coordinates(b, 'b');
    return haversine(from.latitude, from.longitude, to.latitude, to.longitude);
}

/**
 * Client options. Pass any of these to `new Citibike(options)`.
 *
 * @typedef {Object} Options
 * @property {String}  [restBase='https://gbfs.citibikenyc.com/gbfs/en']  Base URL for feeds and for paths that start with `/`.
 *   Lyft hosts the same feeds at `https://gbfs.lyft.com/gbfs/1.1/bkn/en`.
 * @property {String}  [stationInformationURL='/station_information.json']  Path of the station information feed, relative to `restBase`.
 * @property {String}  [stationStatusURL='/station_status.json']  Path of the station status feed, relative to `restBase`.
 * @property {Number}  [timeout=10000]  How long one request may take, in milliseconds, from start to the end of the body. `0` turns the timeout off.
 * @property {Boolean} [cache=true]  Keep each feed in memory for as long as its own `ttl` says. `false` fetches on every call.
 * @property {Object}  [headers]  Extra request headers. Merged over the defaults
 *   (`Accept: application/json` and `User-Agent: node-citibike/<version>`).
 * @property {Function} [fetch]  A `fetch` implementation to use instead of the global one, for proxies, retries or tests.
 * @property {String}  [apiKey=null]  Stored on `client.options.apiKey` but not sent anywhere. Kept for code written against 2.x.
 */

/**
 * Per-call options accepted by every promise method.
 *
 * @typedef {Object} RequestOptions
 * @property {AbortSignal} [signal]  Abort the call. The promise rejects with a {@link CitibikeError} whose `code` is `"EABORTED"`.
 * @property {Boolean}     [fresh=false]  Skip the cache and fetch the feeds again.
 */

/**
 * One station, as returned by {@link Citibike#stations}, {@link Citibike#station}
 * and {@link Citibike#nearest}.
 *
 * @typedef {Object} Station
 * @property {String}       id                     GBFS `station_id`.
 * @property {Number|null}  legacyId               The numeric id 2.x used, or `null` if the feed has none for this station.
 * @property {String}       name                   Station name, for example `"W 52 St & 11 Ave"`.
 * @property {String|null}  shortName              Short station code, for example `"6926.01"`.
 * @property {Number}       latitude               Latitude in decimal degrees.
 * @property {Number}       longitude              Longitude in decimal degrees.
 * @property {Number|null}  capacity               Total docks at the station.
 * @property {String|null}  regionId               GBFS `region_id`. Look it up in the `system_regions` feed.
 * @property {Number}       bikesAvailable         Bikes ready to rent, including e-bikes.
 * @property {Number}       ebikesAvailable        E-bikes ready to rent.
 * @property {Number}       classicBikesAvailable  `bikesAvailable` minus `ebikesAvailable`.
 * @property {Number}       docksAvailable         Empty docks that accept a return.
 * @property {Number}       bikesDisabled          Bikes at the station that cannot be rented.
 * @property {Number}       docksDisabled          Docks that are out of service.
 * @property {Boolean}      isInstalled            The station is on the street.
 * @property {Boolean}      isRenting              The station is letting bikes out.
 * @property {Boolean}      isReturning            The station is taking bikes back.
 * @property {Number|null}  lastReported           When the station last reported, as a Unix timestamp in seconds.
 */

/**
 * A {@link Station} with its distance from the point passed to {@link Citibike#nearest}.
 * It has every `Station` field, plus:
 *
 * @typedef {Object} NearbyStation
 * @property {Number}  distance  Straight-line distance from the point, in meters.
 */

/**
 * What every promise method rejects with. It is an `Error`, exported as
 * `Citibike.CitibikeError`, with these extra fields:
 *
 * @typedef {Object} CitibikeError
 * @property {String}       code     `"ETIMEDOUT"`, `"EABORTED"`, `"ENETWORK"`, `"EHTTP"`, `"EPARSE"` or `"EPAYLOAD"`.
 * @property {String}       message  What went wrong.
 * @property {String|null}  url      The URL that was requested.
 * @property {Number|null}  status   The HTTP status, when `code` is `"EHTTP"`.
 * @property {Error}        [cause]  The underlying error, when there is one.
 */

/**
 * One station in a {@link StationsResult}, in the shape 2.x used. The first
 * seven fields are always present. The rest come from `station_information`
 * and are missing when you call `getStations({ updateOnly: true })`.
 *
 * @typedef {Object} LegacyStation
 * @property {Number|String}  id       The numeric station id 2.x reported. Falls back to the GBFS `station_id` string
 *                                     for a station the feed gives no legacy id.
 * @property {String}  stationId       GBFS `station_id`.
 * @property {String}  status          `"Active"` if the station is installed and renting, otherwise `"Not In Service"`.
 * @property {Number}  availableBikes  Bikes ready to rent, including e-bikes.
 * @property {Number}  availableEbikes E-bikes ready to rent. `0` if the feed does not say.
 * @property {Number}  availableDocks  Empty docks.
 * @property {Number}  lastReported    When the station last reported, as a Unix timestamp in seconds.
 * @property {String}  [label]         Station name, for example `"W 52 St & 11 Ave"`.
 * @property {String}  [shortName]     Short station code.
 * @property {Number}  [latitude]      Latitude in decimal degrees.
 * @property {Number}  [longitude]     Longitude in decimal degrees.
 * @property {Number}  [capacity]      Total docks at the station.
 * @property {String}  [stationAddress] Street address, or `""` when the feed has none.
 * @property {Object[]} [nearbyStations] The five closest stations as `{ id, distance }`, nearest first, with `distance` in miles.
 */

/**
 * What {@link Citibike#getStations} passes to its callback on success.
 *
 * @typedef {Object} StationsResult
 * @property {Boolean}   ok              Always `true`.
 * @property {Array}     meta            Always `[]`. Kept for 2.x compatibility.
 * @property {LegacyStation[]} results   The stations.
 * @property {Number}    activeStations  How many stations in `results` have `status: "Active"`.
 * @property {Number}    totalStations   `results.length`.
 * @property {Number}    lastUpdate      The `station_status` feed's `last_updated`, as a Unix timestamp in seconds.
 */

/**
 * What every callback method passes to its callback when something goes wrong:
 * network error, timeout, non-2xx status, invalid JSON, an unexpected payload,
 * or a discontinued method. Check `data.ok` first.
 *
 * @typedef {Object} ErrorResult
 * @property {Boolean}  ok       Always `false`.
 * @property {Array}    meta     Always `[]`.
 * @property {Array}    results  Always `[]`.
 * @property {String}   error    What went wrong.
 * @property {String}   [code]   The matching {@link CitibikeError} code, or `"EDISCONTINUED"` for a discontinued method.
 */

module.exports = Citibike;
module.exports.Citibike = Citibike;
module.exports.CitibikeError = CitibikeError;
module.exports.distance = distance;
module.exports.default = Citibike;
