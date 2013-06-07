/**
 *  CitibikeNYC API node.js library
 *  Author: Kevin Coughlin @kevintcoughlin
 *  Version: 0.0.1
 *  Last Modified: 6/7/13
 */

var	VERSION 	= '0.0.1',
	http 		= require('http'),
	querystring = require('querystring');

/** 
 *  Merge default options with user passed options 
 */
function merge( defaults, options ) {
	defaults = defaults || {};
	if (options && typeof options === 'object') {
		var keys = Object.keys(options);
		for (var i = 0, len = keys.length; i < len; i++) {
			var k = keys[i];
			if (options[k] !== undefined) defaults[k] = options[k];
		}
	}
	return defaults;
}

/**
 *  Citibike API Object
 */
function Citibike( options ) {
	if (!(this instanceof Citibike)) return new Citibike(options);

	var defaults = {
		api_key: null,

		headers: {
			'Accept': '*/*',
			'Connection': 'close',
			'User-Agent': 'node-Citibike/' + VERSION
		},

		rest_base: 				'http://appservices.citibikenyc.com/',
		helmet_url: 			'v1/helmet/list',
		branch_url: 			'v1/branch/list',
		stations_url: 			'data2/stations.php',
		stations_stream_url: 	'data2/stations.php?updateOnly=true', // TODO : make param not separate url

	};
	this.options = merge(defaults, options);
}

/** 
 *  GET: 
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

	return this;
}


/** 
 *  POST: 
 *  TODO: No use right now
Citibike.prototype.post = function( url, content, content_type, callback ) {
	if (typeof content === 'function') {
		callback = content;
		content = null;
		content_type = null;
	} else if (typeof content_type === 'function') {
		callback = content_type;
		content_type = null;
	}

	if ( typeof callback !== 'function' ) {
		throw "ERROR: Invalid callback function.";
		return this;
	}

	// Forgot base url, add it
	if (url.charAt(0) == '/')
		url = this.options.rest_base + url;

	return this;
}
*/


/** 
 *  Stream
 *  TODO: Stream
Citibike.prototype.streamStations = function( method, params, callback ) {
	if (typeof params === 'function') {
		callback = params;
		params = null;
	}

	if ( typeof callback === 'function' ) callback(stream);
	return this;
}
*/

/** */
Citibike.prototype.getStations = function( params, callback ) {
	var url = this.options.rest_base + stations_url;
	this.get(url, params, callback);
	return this;
}

/** 
 *  GET: Citi Branches
 */
Citibike.prototype.getBranches = function( params, callback ) {
	var url = this.options.rest_base + branch_url;
	this.get(url, params, callback);
	return this;
}

/**
 *  GET: Citibike Helmets 
 */
Citibike.prototype.getHelmets = function( params, callback ) {
	var url = this.options.rest_base + helmet_url;
	this.get(url, params, callback);
	return this;
}

Citibike.VERSION = VERSION;
module.exports = Citibike;