"use strict";

/*!
 * CitibikeNYC API Node.js library
 * Author: Kevin Coughlin @kevintcoughlin
 * MIT Licensed
 */

const axios = require("axios");
const _ = require("lodash");

/**
 * A client library for interacting with the Citibike NYC API.
 * Provides methods for fetching data such as branch and helmet information.
 */
class Citibike {
  /**
   * Constructs a new Citibike client.
   *
   * @param {Object} [options={}] - Configuration options for the client.
   * @param {string} [options.apiKey=null] - Optional API key for authenticated requests.
   * @param {Object} [options.headers] - HTTP headers to include in all requests.
   * @param {string} [options.restBase='https://gbfs.citibikenyc.com/gbfs/gbfs.json'] - Base URL for the Citibike API.
   * @param {string} [options.helmetsURL='/v1/helmet/list'] - Endpoint for fetching helmet data.
   * @param {string} [options.branchesURL='/v1/branch/list'] - Endpoint for fetching branch data.
   */
  constructor(options = {}) {
    this.defaults = {
      apiKey: null,
      headers: {
        Accept: "*/*",
        Connection: "close",
        "User-Agent": "node-citibike/",
      },
      restBase: "https://gbfs.citibikenyc.com/gbfs/gbfs.json",
      helmetsURL: "/v1/helmet/list",
      branchesURL: "/v1/branch/list",
    };

    // Merge user-provided options with defaults
    this.options = _.defaults(options, this.defaults);

    // Create an Axios instance with default configuration
    this.client = axios.create({
      baseURL: this.options.restBase,
      headers: this.options.headers,
    });
  }

  /**
   * Issues an HTTP GET request to a specified URL.
   *
   * @param {string} url - The URL to request.
   * @param {Object} [params={}] - Query parameters to include in the request.
   * @returns {Promise<Object>} - A promise that resolves with the parsed JSON response data.
   * @throws {Error} - Throws an error if the request fails.
   */
  async get(url, params = {}) {
    try {
      const response = await this.client.get(url, { params });
      return response.data;
    } catch (error) {
      throw new Error(`HTTP GET failed: ${error.message}`);
    }
  }

  /**
   * Fetches Citibike branch data in JSON format.
   *
   * @param {Object} [params={}] - Query parameters to include in the request.
   * @returns {Promise<Object>} - A promise that resolves with the branch data.
   * @throws {Error} - Throws an error if the request fails.
   */
  async getBranches(params = {}) {
    try {
      return await this.get(this.options.branchesURL, params);
    } catch (error) {
      throw new Error(`Failed to fetch branches: ${error.message}`);
    }
  }

  /**
   * Fetches Citibike helmet data in JSON format.
   *
   * @param {Object} [params={}] - Query parameters to include in the request.
   * @returns {Promise<Object>} - A promise that resolves with the helmet data.
   * @throws {Error} - Throws an error if the request fails.
   */
  async getHelmets(params = {}) {
    try {
      return await this.get(this.options.helmetsURL, params);
    } catch (error) {
      throw new Error(`Failed to fetch helmets: ${error.message}`);
    }
  }
}

module.exports = Citibike;