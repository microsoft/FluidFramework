/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
(function() {

  const _ = require('lodash');
  const async = require('async');
  const HTTPError = require('@fluid-experimental/property-common').HTTPErrorNoStack;
  const request = require('request');
  const generateGUID = require('@fluid-experimental/property-common').GuidUtils.generateGUID;
  const secretsRedactor = require('./secrets_redactor');
  const { ModuleLogger } = require('@fluid-experimental/property-query');
  const logger = ModuleLogger.getLogger('HFDM.Utils.RequestUtils');

  const RequestUtils = {};

  // Pre-compile a regexp
  RequestUtils.httpStatusRegex = new RegExp('HTTP Status \\[(\\d+)\\]');

  const secretsRedactorWrap = loggerFunc => {
    return message => {
      loggerFunc.call(logger, secretsRedactor(message));
    };
  };

  // Wrap these logger functions
  logger.info = secretsRedactorWrap(logger.info);
  logger.warn = secretsRedactorWrap(logger.warn);
  logger.error = secretsRedactorWrap(logger.error);

  /*
   * Process the request error and turn it into a Error object
   * @param {Error|string|undefined} in_error Error object returned by the request
   * @param {object|undefined} in_response Response object (may contain errors)
   * @return {Error} The Error object returned from building the request error
   */
  RequestUtils.buildErrorMessage = function(in_error, in_response) {
    const response = in_response || {};
    response.request = response.request || { uri: { format: function() { } } };
    response.request.uri = response.request.uri || { format: function() { } };
    response.request.uri.format = response.request.uri.format || function() { };

    // XMLHttpRequest uses statusText
    const statusMessage = response.statusMessage || response.statusText;

    try {
      if (in_error) {
        if (_.isString(in_error)) {
          return new HTTPError(
            in_error,
            response.statusCode,
            statusMessage,
            response.request.method,
            response.request.uri.format()
          );
        } else {
          return in_error;
        }
      } else if (response.body && response.body.errors) {
        const bodyErrors = response.body.errors.filter((err) => err);
        const isQuietError = _.every(bodyErrors, function(err) {
          return (err.flags & HTTPError.FLAGS.QUIET) === HTTPError.FLAGS.QUIET;
        });
        const errorMessages = _.map(bodyErrors, function(err) {
          return err.message;
        }).join('\n');
        return new HTTPError(
          errorMessages,
          response.statusCode,
          statusMessage,
          response.request.method,
          response.request.uri.format(),
          isQuietError ? HTTPError.FLAGS.QUIET : 0
        );
      } else if (response.statusCode < 200 || response.statusCode > 399) {
        // Allowing redirects...
        let errorMsg = 'HTTP Status [' + response.statusCode + ']';
        if (response.body) {
          errorMsg += '. Error: ';
          if (typeof response.body === 'string') {
            errorMsg += response.body;
          } else {
            try {
              errorMsg += JSON.stringify(response.body);
            } catch (e) {
              logger.error(e);
            }
          }
        }
        return new HTTPError(
          errorMsg,
          response.statusCode,
          statusMessage,
          response.request.method,
          response.request.uri.format()
        );
      }
      return null;    // No error
    } catch (e) {
      logger.error(e);
      return new HTTPError(
          'failed building error message',
          response.statusCode,
          statusMessage,
          response.request.method,
          response.request.uri.format()
        );
    }
  };

  /**
   * REST request callback that passes parameters without modifying them
   * @param {function(?Error, ?body)} in_callback Callback to invoke
   * @param {Error|string|undefined} in_error Error object returned by the request
   * @param {object} in_response Response object (may contain errors)
   * @param {string} in_body Response body string
   */
  RequestUtils.passthroughCallback = function(in_callback, in_error, in_response, in_body) {
    try {
      in_callback(in_error, in_response, in_body);
    } catch (e) {
      logger.error(e);
    }
  };

  /**
   * Handle REST request callback which passes only body to callback
   * @param {function(?Error, ?body)} in_callback Callback to invoke
   * @param {Error|string|undefined} in_error Error object returned by the request
   * @param {object} in_response Response object (may contain errors)
   */
  RequestUtils.handleRequestCallback = function(in_callback, in_error, in_response) {
    try {
      const errorMsg = RequestUtils.buildErrorMessage(in_error, in_response);

      in_callback(errorMsg, in_response && in_response.body);
    } catch (e) {
      logger.error(e);
    }
  };

  /**
   * Handle REST request callback which passes both body and response object to callback
   * @param {function(?Error, ?body, ?response)} in_callback Callback to invoke
   * @param {Error|string|undefined} in_error Error object returned by the request
   * @param {object} in_response Response object (may contain errors)
   */
  RequestUtils.handleRequestCallbackWithResponse = function(in_callback, in_error, in_response) {
    try {
      const errorMsg = RequestUtils.buildErrorMessage(in_error, in_response);

      in_callback(errorMsg, in_response && in_response.body, in_response);
    } catch (e) {
      logger.error(e);
    }
  };

  /**
   * Retry request with exponential backoff
   * @param {object} in_params Input parameters
   * @param {number=} in_params.retries Number of retries to attempt before failure (default: 10)
   * @param {boolean=} in_params.useExponentialBackoff Use exponential or fixed backoff (default: true)
   * @param {number=} in_params.initialRetryInterval First retry interval (default: 100)
   * @param {number=} in_params.maximumRetryInterval Maximum value that the interval can reach (default 120000)
   * @param {object} in_params.requestParams Parameters to pass to request function
   * @param {string=} in_params.logFilterRegExp filter out logging for response matching this regexp
   *   (default: undefined)
   * @param {array=}  in_params.retryStatusCodes Array of HTTP status codes to retry (default: [502, 503, 504])
   * @param {array=}  in_params.retryErrorStrings Array of strings to search in Error message.  If found, retry.
   *   (default: [ 'ECONNREFUSED' ])
   * @param {string=} in_params.logMessage message to print on each error (default: message with url)
   * @param {function=} in_params.requestCallbackHandler function called with request callback, error
   * @param {function=} in_params.errorFilter function that determines if the request should be retried
   * @param {function=} in_params.prepareRetryCallback Function, if provided, will be called before each retry
   *
   *   and response parameters.  Defaults to RequestUtils.handleRequestCallback
   * @param {function(?Error, ?body)} in_callback Callback to invoke with Error or body
   */
  RequestUtils.requestWithRetries = function(in_params, in_callback) {
    const uri = in_params.requestParams.uri || in_params.requestParams.url;
    const regexp = in_params.logFilterRegExp && new RegExp(in_params.logFilterRegExp);
    let startTime;
    let lastStartTime;

    console.assert(in_params.requestParams,
      '[RequestUtils.requestWithRetries] in_params.requestParams must be supplied.');

    if (typeof in_params.useExponentialBackoff !== 'boolean') {
      in_params.useExponentialBackoff = true;
    }
    in_params.retryStatusCodes = in_params.retryStatusCodes || [500, 502, 503, 504];
    in_params.retryErrorStrings = in_params.retryErrorStrings ||
      [ 'ECONNREFUSED', 'Parse Error', 'ESOCKETTIMEDOUT', 'ETIMEDOUT', 'socket hang up', 'ENOTFOUND' ];
    in_params.initialRetryInterval = in_params.initialRetryInterval || 100;
    in_params.maximumRetryInterval = in_params.maximumRetryInterval || 120000;
    in_params.logMessage = in_params.logMessage || 'Error requesting ' + uri + ' ';
    in_params.requestCallbackHandler = in_params.requestCallbackHandler || RequestUtils.handleRequestCallback;
    in_params.requestParams.timeout = in_params.requestParams.timeout || 5000;

    // Retry indefinitely if a retry condition is present
    in_params.retries = in_params.errorFilter ? Number.MAX_SAFE_INTEGER : in_params.retries;

    let cancelKeepAliveErrors = [ 'ECONNRESET' ];

    let attempt = 0;
    let previousInterval = 0;
    let id = '';

    const getTracking = function(in_id = '') {
      id = id || in_id;
      if (id) {
        return `id:${id}. Request attempt: ${attempt}`;
      } else {
        return '';
      }
    };

    const defaultErrorFilter = function(err) {
      // Keep track of this retrying request
      const tracking = getTracking(generateGUID());

      // When ECONNRESET occurs cancel KeepAlives on retry...
      if (in_params.requestParams.forever === true && cancelKeepAliveErrors.indexOf(err.code) > -1) {
        if (!regexp || !(err.message || '').match(regexp)) {
          logger.warn(`${in_params.logMessage} ${err.message}, without keepAlive, ${tracking}`);
        }
        in_params.requestParams.forever = false;
        if (in_params.prepareRetryCallback) {
          try {
            in_params.prepareRetryCallback(in_params);
          } catch (e) {
            logger.error(e);
          }
        }
        return true;
      }

      // Find error status and check if its in the retry status code list
      if (Array.isArray(in_params.retryStatusCodes)) {
        const results = err.message.match(RequestUtils.httpStatusRegex);
        if (results) {
          const httpStatus = parseInt(results[1], 10);
          if (in_params.retryStatusCodes.indexOf(httpStatus) !== -1) {
            // Retry
            if (!regexp || !(err.message || '').match(regexp)) {
              logger.warn(`${in_params.logMessage} ${err.message}, ${tracking}`);
            }
            if (in_params.prepareRetryCallback) {
              try {
                in_params.prepareRetryCallback(in_params);
              } catch (e) {
                logger.error(e);
              }
            }
            return true;
          }
        }
      }
      // Search error message string for retry error strings
      if (Array.isArray(in_params.retryErrorStrings) &&
        _.find(in_params.retryErrorStrings, function(item) { return err.message.includes(item); })) {
        if (err.message.includes('ETIMEDOUT') || err.message.includes('ESOCKETTIMEDOUT')) {
          err.message = err.message + '(' + in_params.requestParams.timeout + 'ms)';
        }
        if (!regexp || !(err.message || '').match(regexp)) {
          logger.warn(`${in_params.logMessage} ${err.message}, ${tracking}`);
        }
        if (in_params.prepareRetryCallback) {
          try {
            in_params.prepareRetryCallback(in_params);
          } catch (e) {
            logger.error(e);
          }
        }
        return true;
      }

      // Do not retry
      if (!regexp || (err.message && !err.message.match(regexp))) {
        logger.warn(`${in_params.logMessage} ${err.message}, ${tracking}`);
      }
      return false;
    };

    // Retry request up to in_params.retries times with exponential backoff
    // but chooses a random time between 0 and the exponential backoff interval
    // (i.e. intervals of 100, 200, 400, 800, 1600, ... milliseconds)
    // See http://caolan.github.io/async/docs.html#retry
    async.retry(
      // Retry options
      {
        times: in_params.retries || 10,
        // Calculate exponential interval, but choose random time between 0 and max interval
        interval: function(retryCount) {
          // The attempt is considers the first call and the retries thus + 1
          if (in_params.useExponentialBackoff) {
            const exponent = Math.pow(2, retryCount - 1);
            const tentativeInterval = Math.random() * in_params.initialRetryInterval * 0.25 +
              in_params.initialRetryInterval * exponent;

            if (tentativeInterval > in_params.maximumRetryInterval) {
              return previousInterval;
            } else {
              previousInterval = tentativeInterval;
              return tentativeInterval;
            }
          } else {
            return Math.floor(
              Math.random() * in_params.initialRetryInterval * 0.25 + in_params.initialRetryInterval
            );
          }
        },
        errorFilter: function(err) {
          return in_params.errorFilter ?
            in_params.errorFilter(err, attempt, Date.now() - startTime) :
            defaultErrorFilter(err);
        }
      },
      // Task to execute
      function(callback, results) {
        lastStartTime = Date.now();
        startTime = startTime || lastStartTime;
        attempt++;
        request(in_params.requestParams, in_params.requestCallbackHandler.bind(null, callback));
      },
      // Callback called after success or final retry
      // Might receive 1 or 2 results depending on the type of request handler callback that was provided
      function(err, res1, res2) {
        const tracking = getTracking();

        if (tracking) {
          const now = Date.now();
          const totalDuration = now - startTime;
          const lastDuration = now - lastStartTime;
          const duration = `totalDuration: ${totalDuration}ms, lastDuration: ${lastDuration}ms`;

          if (err) {
            // In the 400 range, only trace it as a warning and let the caller decide if this is an error or not
            if (400 <= err.statusCode && err.statusCode < 500) {
              logger.warn(`${uri} (${duration}): code: ${err.statusCode}, failed, ${tracking}`);
            } else {
              logger.error(`${uri} (${duration}): code: ${err.statusCode}, err: ${err.message}, failed, ${tracking}`);
            }
          } else {
            logger.info(`${uri} (${duration}): succeded, ${tracking}`);
          }
        }
        if (arguments.length === 3) {
          in_callback(err, res1, res2);
        } else {
          in_callback(err, res1);
        }
      }
    );
  };

  module.exports = RequestUtils;
})();
