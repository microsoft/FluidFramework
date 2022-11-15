/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-use-before-define */
(function() {
  'use strict';

  var sanitize = require('sanitize');

  /**
   * Input param filters.
   */
  var INPUT_PARAM_FILTERS = {
    /**
     * When applied to a string, this regex filters out any character that is not a word or a dot.
     */
    MODULE_NAME: /[^0-9a-zA-Z\.]/g, // eslint-disable-line no-useless-escape

    /**
     * Filter out non-alphanumeric characters from a log level string.
     */
    LOG_LEVEL: /\W/g
  };

  /**
   * A custom sanitizer to validate input to the '/logger' routes.
   */
  class LoggerSanitizer extends sanitize.Sanitizer {
    /**
     * Sanitizes logger module names.
     * @param {string} value An untrusted logger module name.
     * @return {string} A filtered logger module name.
     */
    moduleName(value) {
      return _filterInputParam(value, INPUT_PARAM_FILTERS.MODULE_NAME);
    }

    /**
     * Sanitizes logger level names.
     * @param {string} value An untrusted logger level name.
     * @return {string} A filtered logger level name.
     */
    logLevel(value) {
      return _filterInputParam(value, INPUT_PARAM_FILTERS.LOG_LEVEL);
    }
  }

  /**
   * Filters out illegal characters from a supplied input parameter.
   * @param {string} in_inputParam An unfiltered input parameter value from which illegal characters
   *   are to be stripped.
   * @param {RegEx} in_filterRegEx A regex to apply to in_inputParam to strip it from invalid
   *   characters.
   * @return {string|undefined} The filtered value, or undefined if in_inputParam is falsey, empty,
   *   or contains only invalid characters.
   */
  var _filterInputParam = function(in_inputParam, in_filterRegEx) {
    if (!in_inputParam) {
      return undefined;
    }

    var result = in_inputParam.replace(in_filterRegEx, '');
    if (result.length === 0) {
      return undefined;
    }

    return result;
  };

  module.exports = LoggerSanitizer;
})();
