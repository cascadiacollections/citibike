import queryString from 'query-string';

const BASE_URL = 'http://appservices.citibikenyc.com';

export default class BaseClient {
  private _apiKey: string;

  /**
   * Constructor.
   * 
   * @param {string} the API key for Citibike's API.
   */
  constructor(apiKey: string) {
    this._apiKey = apiKey;
  }

  /**
   * Issues an HTTP GET request.
   *
   * @param {String}      url         String of the URL to issue the request to.
   * @param {Object}      params      Object containing query string parameters to issue in the Get request.
   */
  protected async get(url: string, params?: object) {
    const queryParams = {...{ apiKey: this._apiKey }, ...params };
    const qs = queryString.stringify(queryParams);
    const resource = `${BASE_URL}${url}?${qs}`;
    const requestInit = { 
      headers: {
        'User-Agent': 'node-citibike/',
        'Content-Type': 'application/json; charset=utf-8'
      }
    };

    return fetch(resource, requestInit);
  }
}
