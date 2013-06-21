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
  , utils = require('./utils')

/**
 * Class for handling communications with Citibike's API.
 *
 * @param {Options} options The Client's options object.
 */
function Citibike( options ) {
    if (!(this instanceof Citibike)) 
        return new Citibike(options);

    // Default Client Options
    this.defaults = {
        api_key: null,

        headers: {
            'Accept': '*/*',
            'Connection': 'close',
            'User-Agent': 'node-citibike/'
        },

        rest_base:              'http://appservices.citibikenyc.com/',
        helmet_url:             'v1/helmet/list',
        branch_url:             'v1/branch/list',
        stations_url:           'data2/stations.php',
        stations_stream_url:    'data2/stations.php?updateOnly=true', // TODO : make param not separate url

    };

    this.options = utils.merge(this.defaults, options);
}

/** 
 * Issues an HTTP Get request.
 *
 * @param {String}      url         String of the URL to issue the request to.
 * @param {Object}      params      Object containing query string parameters to issue in the Get request.
 * @param {Function}    callback    Callback function that will be called when the processing is done.
 */
Citibike.prototype.get = function( url, params, callback ) {
    if (typeof params === 'function') {
        callback = params;
        params = null;
    }

    if ( typeof callback !== 'function' ) {
        throw "ERROR: Invalid callback function.";
        return this;
    }

    if (url.charAt(0) == '/')
        url = this.options.rest_base + url;

    // Holds data from HTTP response body
    var body = []
      , req = http.get(url, function(res){

        res.on('data', function (chunk){
            body += chunk;
        });

        res.on('end',function(){
            callback(JSON.parse(body));
        });
    })
    req.on('error', function(e) {
        console.log("ERROR: " + e.message);
    });

    return this;
}

/**
 * Function for requesting and returning Citibike Stations data in JSON form.
 *
 * @param {Object}      params      Object containing query string parameters to issue in the request.
 * @param {Function}    callback    Callback function that will be called when the processing is done.
 */
Citibike.prototype.getStations = function( params, callback ) {
    var url = this.options.rest_base + this.options.stations_url;
    this.get(url, params, function(data) {
      callback(data);
    });
    return this;
}

/**
 * Function for requesting and returning Citibike Branch data in JSON form.
 *
 * @param {Object}      params      Object containing query string parameters to issue in the request.
 * @param {Function}    callback    Callback function that will be called when the processing is done.
 */
Citibike.prototype.getBranches = function( params, callback ) {
    var url = this.options.rest_base + this.options.branch_url;
    this.get(url, params, function(data) {
    callback(data);
    });
    return this;
}

/**
 * Function for requesting and returning Citibike Helmets data in JSON form.
 *
 * @param {Object}      params      Object containing query string parameters to issue in the request.
 * @param {Function}    callback    Callback function that will be called when the processing is done.
 */
Citibike.prototype.getHelmets = function( params, callback ) {
    var url = this.options.rest_base + this.options.helmet_url;
    this.get(url, params, function(data) {
      callback(data);
    });
    return this;
}

module.exports = Citibike;