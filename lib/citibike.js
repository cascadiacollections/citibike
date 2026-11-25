"use strict";

/*!
 *  CitibikeNYC API Node.js library
 *  Author: Kevin Coughlin @kevintcoughlin
 *  MIT Licensed
 */

/**
 * Module Dependencies
 */
var http = require('http')
  , https = require('https')
  , querystring = require('querystring')
  , pkg = require('../package.json');

/**
 * Error message used by methods whose data Citi Bike no longer publishes.
 *
 * @private
 */
var DISCONTINUED = 'is not available: Citi Bike retired the appservices.citibikenyc.com API ' +
  'and its GBFS feeds have no equivalent data.';

/**
 * Client for Citi Bike's public GBFS feeds. Works with or without `new`.
 * Every option is optional; options you pass override the defaults.
 *
 * @class Citibike
 * @param {Options} [options] Client options.
 * @example
 * var Citibike = require('citibike');
 * var citibike = new Citibike({
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

        restBase:              'https://gbfs.citibikenyc.com/gbfs/en',
        stationInformationURL: '/station_information.json',
        stationStatusURL:      '/station_status.json'
    };

    options = options || {};
    this.options = Object.assign({}, this.defaults, options, {
        headers: Object.assign({}, this.defaults.headers, options.headers)
    });
}

/**
 * Builds the result envelope passed to callbacks on failure.
 *
 * @private
 * @param {String} message Description of what went wrong.
 */
function failure( message ) {
    return { ok: false, meta: [], results: [], error: message };
}

/**
 * Issues an HTTP(S) GET request and parses the JSON response.
 *
 * The callback always receives a single object. On failure (network error,
 * non-2xx status, timeout or invalid JSON) it is `{ ok: false, error, results: [] }`.
 * On success it is the parsed JSON body, unchanged.
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

    if (url.charAt(0) == '/')
        url = this.options.restBase + url;

    if (params != null && Object.keys(params).length > 0)
        url = url + "?" + querystring.stringify(params);

    var done = false;
    function finish( data ) {
        if (done) return;
        done = true;
        callback(data);
    }

    var transport = url.indexOf('https:') === 0 ? https : http;
    var req = transport.get(url, { headers: this.options.headers }, function(res) {
        var body = '';
        res.setEncoding('utf8');
        // If the socket dies mid-body, 'end' never fires and neither does
        // req 'error', so the response stream is the only place to catch it.
        res.on('aborted', function() {
            finish(failure('Connection closed before response from ' + url + ' finished'));
        });
        res.on('error', function(e) {
            finish(failure(e.message));
        });
        res.on('data', function (chunk) {
            body += chunk;
        });
        res.on('end', function() {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                return finish(failure('HTTP ' + res.statusCode + ' from ' + url));
            }
            var data;
            try {
                data = JSON.parse(body);
            } catch (e) {
                return finish(failure('Invalid JSON from ' + url + ': ' + e.message));
            }
            finish(data);
        });
    });

    req.setTimeout(this.options.timeout, function() {
        req.destroy(new Error('Request timed out after ' + this.options.timeout + 'ms'));
    }.bind(this));

    req.on('error', function(e) {
        finish(failure(e.message));
    });

    return this;
}

/**
 * Function for requesting and returning Citi Bike station data in JSON form.
 *
 * Joins the GBFS `station_information` and `station_status` feeds into the
 * library's `{ ok, meta, results, activeStations, totalStations, lastUpdate }` envelope.
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
      , updateOnly = !!(params && params.updateOnly);

    self.get(self.options.stationStatusURL, function(status) {
        if (status.ok === false) return callback(status);
        if (!status.data || !Array.isArray(status.data.stations)) {
            return callback(failure('Unexpected station_status payload'));
        }

        if (updateOnly) return callback(buildStations(status, null));

        self.get(self.options.stationInformationURL, function(info) {
            if (info.ok === false) return callback(info);
            if (!info.data || !Array.isArray(info.data.stations)) {
                return callback(failure('Unexpected station_information payload'));
            }
            callback(buildStations(status, info));
        });
    });

    return this;
}

/**
 * Maps GBFS station feeds onto the legacy station result shape.
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
        var isActive = !!st.is_installed && !!st.is_renting;
        var station = {
            id: st.station_id,
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
    process.nextTick(callback, failure(name + ' ' + DISCONTINUED));
    return client;
}

/**
 * Client options. Pass any of these to `new Citibike(options)`.
 *
 * @typedef {Object} Options
 * @property {String}  [restBase='https://gbfs.citibikenyc.com/gbfs/en']  Base URL for paths that start with `/`.
 *   Lyft hosts the same feeds at `https://gbfs.lyft.com/gbfs/1.1/bkn/en`.
 * @property {String}  [stationInformationURL='/station_information.json']  Path of the station information feed, relative to `restBase`.
 * @property {String}  [stationStatusURL='/station_status.json']  Path of the station status feed, relative to `restBase`.
 * @property {Number}  [timeout=10000]  Request timeout in milliseconds. A timed-out request calls back with an {@link ErrorResult}.
 * @property {Object}  [headers]  Extra request headers. Merged over the defaults
 *   (`Accept: application/json` and `User-Agent: node-citibike/<version>`).
 * @property {String}  [apiKey=null]  Stored on `client.options.apiKey` but not sent anywhere. Kept for code written against 2.x.
 */

/**
 * One station in a {@link StationsResult}. The first six fields are always present.
 * The rest come from `station_information` and are missing when you call
 * `getStations({ updateOnly: true })`.
 *
 * @typedef {Object} Station
 * @property {String}  id              GBFS `station_id`. A string since 3.0.0.
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
 */

/**
 * What {@link Citibike#getStations} passes to its callback on success.
 *
 * @typedef {Object} StationsResult
 * @property {Boolean}   ok              Always `true`.
 * @property {Array}     meta            Always `[]`. Kept for 2.x compatibility.
 * @property {Station[]} results         The stations.
 * @property {Number}    activeStations  How many stations in `results` have `status: "Active"`.
 * @property {Number}    totalStations   `results.length`.
 * @property {Number}    lastUpdate      The `station_status` feed's `last_updated`, as a Unix timestamp in seconds.
 */

/**
 * What every method passes to its callback when something goes wrong: network
 * error, timeout, non-2xx status, invalid JSON, an unexpected payload, or a
 * discontinued method. Check `data.ok` first.
 *
 * @typedef {Object} ErrorResult
 * @property {Boolean}  ok       Always `false`.
 * @property {Array}    meta     Always `[]`.
 * @property {Array}    results  Always `[]`.
 * @property {String}   error    What went wrong.
 */

module.exports = Citibike;
