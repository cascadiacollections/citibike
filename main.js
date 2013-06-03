/**
 *  CitibikeNYC API node.js library
 *  Author: Kevin Coughlin @kevintcoughlin
 *  Version: 0.0.1
 *  Last Modified: 6/3/13
 */

// API Endpoint
var REST_ROOT = 'http://citibikenyc.com/stations/json';

// Client
var Citibike = function ( apiKey, options ) {  

	// COMTOR Attributes
	this.options = options || {};
	this.key = apiKey;

}

module.exports = Citibike;