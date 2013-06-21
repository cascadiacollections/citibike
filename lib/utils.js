"use strict";

/**
 *
 * Merge defaults and options objects
 * 
 * MIT Licensed
 * 
 * @param {Object} defaults
 * @param {Object} options
 * @return {Object} merged options
 */

exports.merge = function(defaults, options) {
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
 * Print message to console as error
 *
 * @param {String} msg
 */
exports.errorLog = function(msg) {
  console.error(msg);
};
