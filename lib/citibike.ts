import { get } from 'http';
import { defaults } from 'lodash';
import { stringify } from 'querystring';

/**
 * Class for handling communications with Citibike's API.
 *
 * @param {Object} options The Client's options object.
 */
export default class Citibike {
  getStations(arg0: null, arg1: (data: any) => void): any {
    throw new Error("Method not implemented.");
  }
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
   * @param {Object}      params      Object containing query string parameters to issue in the Get request.
   * @param {Function}    callback    Callback function that will be called when the processing is done.
   */
  get(url, params, callback) {
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
  
    if (params !== null) { url = `${url}?${stringify(params)}`; }
  
    // Holds data from HTTP response body
    let body: any = [];
    const req = get(url, (res) => {
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
  }

  /**
   * Function for requesting and returning Citibike Branch data in JSON form.
   *
   * @param {Object}      params      Object containing query string parameters to issue in the request.
   * @param {Function}    callback    Callback function that will be called when the processing is done.
   */
  getBranches(params, callback) {
    const url = this.options.restBase + this.options.branchesURL;
    this.get(url, params, (data) => {
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
  getHelmets(params, callback) {
    const url = this.options.restBase + this.options.helmetsURL;
    this.get(url, params, (data) => {
      callback(data);
    });
    return this;
  }
}
