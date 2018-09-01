import { get } from 'http';
import { defaults } from 'lodash';
import { stringify } from 'querystring';
import fetch from 'node-fetch';
import fs from 'fs';
import { isFunction } from 'util';
import queryString from 'query-string';

/**
 * Class for handling communications with Citibike's API.
 *
 * @param {Object} options The Client's options object.
 */
export default class Citibike {
  defaults: { apiKey: any; headers: { Accept: string; Connection: string; 'User-Agent': string; }; restBase: string; helmetsURL: string; branchesURL: string; };
  options: any;
  constructor(options?) {
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
  
    this.options = defaults(this.defaults, options);
  }

  /**
   * Issues an HTTP Get request.
   *
   * @param {String}      url         String of the URL to issue the request to.
   * @param {Function}    callback    Callback function that will be called when the processing is done.
   * @param {Object}      params      Object containing query string parameters to issue in the Get request.
   */
  private get(url, callback, params?) {
    if (!isFunction(callback)) throw new TypeError('callback is not a function');
    if (url === null) throw new TypeError('url must not be null');
  
    const qs = queryString.stringify(params);
    
    fetch(`${this.options.restBase}${url}?${qs}`).then(res => callback(res.json()));
  }

  // @todo
  getStations(params, callback): any {
    this.get(this.options.branchesURL, params, callback);
  }

  /**
   * Function for requesting and returning Citibike Branch data in JSON form.
   *
   * @param {Object}      params      Object containing query string parameters to issue in the request.
   * @param {Function}    callback    Callback function that will be called when the processing is done.
   */
  getBranches(params, callback) {
    this.get(this.options.branchesURL, params, callback);
  }

  /**
   * Function for requesting and returning Citibike Helmets data in JSON form.
   *
   * @param {Object}      params      Object containing query string parameters to issue in the request.
   * @param {Function}    callback    Callback function that will be called when the processing is done.
   */
  getHelmets(params, callback) {
    this.get(this.options.helmetsURL, params, callback);
  }
}
