

/*!
 *  CitibikeNYC API Node.js library
 *  Author: Kevin Coughlin @kevintcoughlin
 *  MIT Licensed
 */

/**
 * Module Dependencies
 */
const http = require('http');
const _ = require('lodash');
const querystring = require('querystring');

/**
 * Class for handling communications with Citibike's API.
 *
 * @param {Object} options The Client's options object.
 */
function Citibike(options) {
  if (!(this instanceof Citibike)) { return new Citibike(options); }

  // Default Client Options
  this.defaults = {
    apiKey: null,

    headers: {
      Accept: '*/*',
      Connection: 'close',
      'User-Agent': 'node-citibike/',
    },

    restBase: 'http://appservices.citibikenyc.com',
    helmetsURL: '/v1/helmet/list',
    branchesURL: '/v1/branch/list',
  };

  this.options = _.defaults(this.defaults, options);
}

/**
 * Issues an HTTP Get request.
 *
 * @param {String}      url         String of the URL to issue the request to.
 * @param {Object}      params      Object containing query string parameters to issue in the Get request.
 * @param {Function}    callback    Callback function that will be called when the processing is done.
 */
Citibike.prototype.get = function (url, params, callback) {
  if (typeof params === 'function') {
    callback = params;
    params = null;
  }

  if (typeof callback !== 'function') {
    throw new Error('ERROR: Invalid callback function.');
  }

  if (url == null) {
    throw new Error('ERROR: Invalid URL called.');
  }

  if (url.charAt(0) == '/') { url = this.options.restBase + url; }

  if (params !== null) { url = `${url}?${querystring.stringify(params)}`; }

  // Holds data from HTTP response body
  let body = [];
  const req = http.get(url, (res) => {
    res.on('data', (chunk) => {
      body += chunk;
    });

    res.on('end', () => {
      callback(JSON.parse(body));
    });
  });
  req.on('error', (e) => {
    console.log(`ERROR: ${e.message}`);
  });

  return this;
};

/**
 * Function for requesting and returning Citibike Branch data in JSON form.
 *
 * @param {Object}      params      Object containing query string parameters to issue in the request.
 * @param {Function}    callback    Callback function that will be called when the processing is done.
 */
Citibike.prototype.getBranches = function (params, callback) {
  const url = this.options.restBase + this.options.branchesURL;
  this.get(url, params, (data) => {
    callback(data);
  });
  return this;
};

/**
 * Function for requesting and returning Citibike Helmets data in JSON form.
 *
 * @param {Object}      params      Object containing query string parameters to issue in the request.
 * @param {Function}    callback    Callback function that will be called when the processing is done.
 */
Citibike.prototype.getHelmets = function (params, callback) {
  const url = this.options.restBase + this.options.helmetsURL;
  this.get(url, params, (data) => {
    callback(data);
  });
  return this;
};

module.exports = Citibike;
