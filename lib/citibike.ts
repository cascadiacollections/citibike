import BaseClient from "./BaseClient";

const PATH_HELMETS = '/v1/helmet/list';
const PATH_BRANCHE = '/v1/branch/list';

interface ICitibikeAPI {
  getHelmets(params?: object): Promise<Response>;
  getStations(params?: object): Promise<Response>;
}

/**
 * Class for handling communications with Citibike's API.
 */
export default class Citibike extends BaseClient implements ICitibikeAPI {
  /**
   * Function for requesting and returning Citibike Branch data in JSON form.
   *
   * @param {Object}      params      Object containing query string parameters to issue in the request.
   */
  public async getBranches(params?: object) {
    return this.get(PATH_BRANCHE, params);
  }

  /**
   * Function for requesting and returning Citibike Helmets data in JSON form.
   *
   * @param {Object}      params      Object containing query string parameters to issue in the request.
   */
  public async getHelmets(params?: object) {
    return this.get(PATH_HELMETS, params);
  }
}
