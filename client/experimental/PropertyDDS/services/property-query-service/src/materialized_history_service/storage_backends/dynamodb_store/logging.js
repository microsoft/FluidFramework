/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const _ = require('lodash');
var chalk = require('chalk');
const style = require('ansi-styles');

/**
 * The maximum length of the changeSet field in a log message.
 * @type {number}
 */
var MAX_LOGGED_STRING_LENGTH = 300;

/**
 * The maximum length of arrays in a log message.
 * @type {number}
 */
var MAX_ARRAY_LENGTH = 12;

/**
 * @fileoverview
 * PropertyGraph logging utilities.
 */
class Logging {
  /**
   * Filters an object intended for logging.
   * @param {Object} in_obj An object that may contain properties that shouldn't be logged.
   * @param {Object} in_filters An array of keys containing the names of properties to filter out.
   * @param {?number=} in_maxArrayLength Overrides the maximum length of arrays in a log message.
   *   Defaults to MAX_ARRAY_LENGTH if left unspecified.
   * @return {Object} The filtered object.
   * @static
   */
  static filterLogObject(in_obj, in_filters, in_maxArrayLength) {
    in_maxArrayLength = in_maxArrayLength || MAX_ARRAY_LENGTH;
    return _.mapValues(in_obj, function(value, key) {
      if (value && in_filters.indexOf(key) > -1) {
        if (key === 'changeSet' || key === 'value') {
          var loggedValue = value;
          if (typeof value !== 'string' && _.isObject(value)) {
            loggedValue = JSON.stringify(value);
          }
          return loggedValue.length > MAX_LOGGED_STRING_LENGTH ?
            loggedValue.substring(0, MAX_LOGGED_STRING_LENGTH) + `... string[${loggedValue.length}]` :
            value;
        }
        return '<redacted>';
      }

      if (typeof value === 'string') {
        return value.length > MAX_LOGGED_STRING_LENGTH ?
          value.substring(0, MAX_LOGGED_STRING_LENGTH) + `... string[${value.length}]` : value;
      }

      if (value instanceof Date) {
        return value.getTime();
      }

      if (value && value.constructor === Array) {
        let loggedArray = [];
        const arrayLength = Math.min(value.length, in_maxArrayLength);
        for (let i = 0; i < arrayLength; i++) {
          loggedArray.push(Logging.filterLogObject(value[i], in_filters, in_maxArrayLength));
        }

        if (value.length > in_maxArrayLength) {
          loggedArray.push('... Array[' + value.length + ']');
        }

        return loggedArray;
      }

      if (_.isObject(value)) {
        return Logging.filterLogObject(value, in_filters, in_maxArrayLength);
      }

      return value;
    });
  }
}

/**
 * @param {string} in_msg Either '-->' or '<--', which precedes a query or its results in the
 *   logs.
 * @return {string} The logging color style to use when tracing '-->' or '<--', which denotes
 *   either a query or its results.
 */
Logging.getBlueTrace = chalk.supportsColor ?
  function(in_msg) {return style.blue.open + in_msg + style.blue.close;} :
  function(in_msg) {return in_msg;};

/**
 * @return {string} The logging color style to use when tracing database queries.
 */
Logging.getDbInStyle = Logging.getBlueTrace.bind(null, '-->');

/**
 * @return {string} The logging color style to use when tracing query results.
 */
Logging.getDbOutStyle = Logging.getBlueTrace.bind(null, '<--');

/**
 * An array of keys containing the names of properties to filter out when logging db input or
 * output.
 */
Logging.filterKeys = {
  input: ['admin_user', 'admin_password', 'agent', 'changeSet', 'username', 'password', 'value'],
  output: ['agent', 'changeSet']
};

module.exports = Logging;
