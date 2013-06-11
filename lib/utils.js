"use strict";

/**
 *
 * Merge object `b` with object `a`.
 * 
 * Link: https://github.com/LearnBoost/knox/blob/master/lib/utils.js
 * Copyright(c) 2010 LearnBoost <dev@learnboost.com>
 * MIT Licensed
 * 
 * @param {Object} a
 * @param {Object} b
 * @return {Object} a
 * @api private
 */

exports.merge = function(a, b){
  var keys = Object.keys(b);
  for (var i = 0, len = keys.length; i < len; ++i) {
    var key = keys[i];
    a[key] = b[key]
  }
  return a;
};