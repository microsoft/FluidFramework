/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * Base Controller class packaging common code across controllers
 * @fileoverview
 */
(function() {
  var _ = require('lodash');
  var HttpStatus = require('http-status-codes');
  var { ModuleLogger } = require('@fluid-experimental/property-query');

  var OperationError = require('@fluid-experimental/property-common').OperationError;
  var HTTPError = require('@fluid-experimental/property-common').HTTPError;

  /**
   * The BaseController class
   * @constructor
   * @param {object=} [in_params] List of parameters
   * @param {string=} [in_params.name] Name of the controller
   * @param {function=} [in_params.log=console.info] The logging function
   * @param {function=} [in_params.logError=console.error] The error loggging function
   */
  var BaseController = function(in_params) {
    this._logger = ModuleLogger.getLogger(in_params.name || 'HFDM.ServerUtils.BaseServer');
    this._log = in_params.log || this._logger.info.bind(this._logger);
    this._logError = in_params.logError || this._logger.error.bind(this._logger);
    this._pathVersionNumRE = new RegExp('/v(\\d+)/.*');
  };

  /**
   * Generic JSON object response to client
   * @param {object} in_response the response object
   * @param {(object|bool|number|string)=} in_body ie. {foo: 'bar'} || {errors: [error]} || true|false
   * @param {number} in_statusCode the status code
   * @param {object=} in_options additional options
   */
  BaseController.prototype.render = function(in_response, in_body, in_statusCode, in_options) {
    in_options = in_options || {};
    var that = this;

    if (_.isUndefined(in_body) || _.isNull(in_body)) {
      in_body = {};
    }

    in_response.writeHead(in_statusCode, { 'Content-Type': 'application/json' });

    // Avoid unnecessary string concatenations
    if (this._logger.isLevelEnabled(ModuleLogger.levels.TRACE)) {
      this._logger.trace('HTTP <<<< [' + in_response.req.method + '] [' + in_response.req.url + ']: [' +
        in_statusCode + ']');
    }

    // NOTE: .isEmpty incorrectly(?) returns true when in_body.errors is an Error object, so check that.
    if (in_statusCode === HttpStatus.BAD_REQUEST && _.isEmpty(in_body.errors) && !_.isError(in_body.errors)) {
      in_body = {errors: [{message: 'Bad Request. One or more parameters are malformed or missing.'}]};
    } else if (in_statusCode >= 400) {
      var errorMsg = 'Unknown HTTP error format';
      if (!in_body.errors) {
        throw new Error(errorMsg);
      }

      if (!_.isArray(in_body.errors)) {
        in_body.errors = [in_body.errors];
      }

      in_body.errors = _.flatten(in_body.errors);

      // Not all errors should be logged, this prevents log flooding
      // TypeError, OperationError and HTTPError with status code < 500 aren't logged
      in_body.errors = _.map(in_body.errors, function(error) {
        if (error instanceof Error) {
          if (error instanceof TypeError) {
            return {message: error.message};
          } else if ((error instanceof HTTPError) || (error instanceof OperationError)) {
            if (!error.statusCode || error.statusCode >= 500) {
              that._logError(error);
            }
            return {message: error.message, flags: error.flags};
          } else {
            that._logError(error);
            return {message: error.message};
          }
        } else if (_.isString(error)) {
          if (in_statusCode && in_statusCode >= 500) {
            that._logError(error);
          }
          return {message: error};
        } else if (error.message) {
          that._logError(JSON.stringify(error));
          return error;
        }

        that._logError(errorMsg);
        throw new Error(errorMsg);
      });
    }

    var isWritableType = typeof in_body === 'string' || in_body instanceof Buffer;
    if (!isWritableType) {
      in_body = JSON.stringify(in_body);
    }
    in_response.write(in_body);
    in_response.end();
  };

  /**
   * Method used to transform the contents of the query object
   * from string to their respective type
   * @param {Object} in_query query object
   * @return {Object} Converted query object
   */
  BaseController.prototype.convertQuery = function(in_query) {
    var result;
    if (_.isArray(in_query)) {
      result = [];
    } else {
      result = {};
    }

    var that = this,
        value;
    _.each(in_query, function(queryValue, queryKey) {
      value = undefined;
      if (queryValue === 'true') {
        value = true;
      } else if (queryValue === 'false') {
        value = false;
      } else if (!_.isNaN(Number(queryValue)) && queryValue !== '') {
        value = Number(queryValue);
      } else if (queryValue instanceof Object) {
        value = that.convertQuery(queryValue);
      } else if (queryValue !== 'undefined' && queryValue !== 'null') {
        value = queryValue;
      }

      result[queryKey] = value;
    });

    return result;
  };

  /**
   * Create express suitable array of v1 routings for this path
   * @param {string} path_mount Express path mount for v1 and unversioned handler
   * @return {array} The two paths that are serviced by the handlers
   */
  BaseController.prototype.getV1Paths = function(path_mount) {
    return ['/v1' + path_mount, path_mount];
  };


  /**
   * Create express suitable array of v2 routings for this path
   * @param {string} path_mount Express path mount for v2, v1 and unversioned handler
   * @return {array} The three paths that are serviced by the handlers
   */
  BaseController.prototype.getV2Paths = function(path_mount) {
    return ['/v2' + path_mount, '/v1' + path_mount, path_mount];
  };

  /**
   * Checks to see if the path was a V1 or unversioned path
   * @param {string} path (usually from Express request.path) to check
   * @return {boolean} true if path is V1 or unversioned path, false otherwise
   */
  BaseController.prototype.isV1Path = function(path) {
    if (!_.isString(path)) {
      return false;
    }
    var array = this._pathVersionNumRE.exec(path);
    if (array === null) {
      // Could be a "v0" path (no /v1 at the beginning)
      if (path.startsWith('/')) {
        return true;
      }
    } else {
      // If version number is 1 or less, then return true
      if (array[1] <= 1) {
        return true;
      }
    }
    return false;
  };

  module.exports = BaseController;
})();
