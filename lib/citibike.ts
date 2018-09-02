import { defaults } from 'lodash';
import fetch from 'node-fetch';
import { isFunction } from 'util';
import queryString from 'query-string';

/**
 * API Client Options interface.
 */
interface IOptions { apiKey: any; headers: { Accept: string; Connection: string; 'User-Agent': string; }; restBase: string; helmetsURL: string; branchesURL: string; }

/**
 * Class for handling communications with Citibike's API.
 */
export default class Citibike {
  private _defaults: IOptions;
  private _options: IOptions;

  /**
   * Constructor.
   * 
   * @param {IOptions} options API options
   */
  constructor(options?: IOptions) {
    this._defaults = {
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
  
    this._options = defaults(this._defaults, options);
  }

  /**
   * Issues an HTTP Get request.
   *
   * @param {String}      url         String of the URL to issue the request to.
   * @param {Function}    callback    Callback function that will be called when the processing is done.
   * @param {Object}      params      Object containing query string parameters to issue in the Get request.
   */
  private get(url: string, callback: Function, params?: object) {
    if (!isFunction(callback)) throw new TypeError('callback is not a function');
    if (url === null) throw new TypeError('url must not be null');
  
    const qs = queryString.stringify(params);
    
    fetch(`${this._options.restBase}${url}?${qs}`).then(res => callback(res.json()));
  }

  /**
   * Function for requesting and returning Citibike Branch data in JSON form.
   *
   * @param {Object}      params      Object containing query string parameters to issue in the request.
   * @param {Function}    callback    Callback function that will be called when the processing is done.
   */
  public getBranches(params: object, callback: Function): void {
    this.get(this._options.branchesURL, callback, params);
  }

  /**
   * Function for requesting and returning Citibike Helmets data in JSON form.
   *
   * @param {Object}      params      Object containing query string parameters to issue in the request.
   * @param {Function}    callback    Callback function that will be called when the processing is done.
   */
  public getHelmets(params: object, callback: Function): void {
    this.get(this._options.helmetsURL, callback, params);
  }
}
