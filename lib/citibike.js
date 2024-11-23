"use strict";

/*!
 * CitibikeNYC API Node.js library
 * Author: Kevin Coughlin @kevintcoughlin
 * MIT Licensed
 */
const axios = require("axios");

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
   */
  constructor(options = {}) {
    this.defaults = {
      apiKey: null,
      restBase: 'https://gbfs.citibikenyc.com/gbfs/gbfs.json'
    };
    this.options = { ...this.defaults, ...options };
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
      throw error;
    }
  }
}

module.exports = Citibike;