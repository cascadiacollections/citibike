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
 */
var DISCONTINUED = 'is not available: Citi Bike retired the appservices.citibikenyc.com API ' +
  'and its GBFS feeds have no equivalent data.';

/**
 * Class for handling communications with Citi Bike's GBFS feeds.
 *
 * @param {Object} options The Client's options object.
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
 *
 * @param {String}      url         URL (or path relative to `restBase`) to request.
 * @param {Object}      params      Object containing query string parameters to issue in the Get request.
 * @param {Function}    callback    Callback function that will be called when the processing is done.
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
 *
 * @param {Object}      params      Optional. `{ updateOnly: true }` skips station_information
 *                                  and returns only live availability fields.
 * @param {Function}    callback    Callback function that will be called when the processing is done.
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
 * Citi Bank branch locations. No longer published by Citi Bike; always
 * calls back (asynchronously) with `{ ok: false, error, results: [] }`.
 *
 * @param {Object}      params      Ignored.
 * @param {Function}    callback    Callback function that will be called when the processing is done.
 */
Citibike.prototype.getBranches = function( params, callback ) {
    return discontinued(this, 'getBranches()', params, callback);
}

/**
 * Helmet retailer locations. No longer published by Citi Bike; always
 * calls back (asynchronously) with `{ ok: false, error, results: [] }`.
 *
 * @param {Object}      params      Ignored.
 * @param {Function}    callback    Callback function that will be called when the processing is done.
 */
Citibike.prototype.getHelmets = function( params, callback ) {
    return discontinued(this, 'getHelmets()', params, callback);
}

function discontinued( client, name, params, callback ) {
    if (typeof params === 'function') callback = params;
    if ( typeof callback !== 'function' ) {
        throw new Error('ERROR: Invalid callback function.');
    }
    process.nextTick(callback, failure(name + ' ' + DISCONTINUED));
    return client;
}

module.exports = Citibike;
