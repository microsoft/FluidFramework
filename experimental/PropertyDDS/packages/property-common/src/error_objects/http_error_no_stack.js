/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
(function() {
  var HTTPError = require('./http_error');
  var FlaggedError = require('./flagged_error');

  /**
   * Class extending HTTPError without storing the stack
   * @param {string} message The error message
   * @param {number} statusCode A numeric HTTP status code
   * @param {string} statusMessage A string message representing the response status message
   * @param {string} method The HTTP method used in the request
   * @param {string} url The URL that the request was sent to
   * @param {?number} flags Flags that characterize the error. See {@link FlaggedError#FLAGS}.
   * @constructor
   * @alias property-common.HTTPErrorNoStack
   * @private
   */
  var HTTPErrorNoStack = function(message, statusCode, statusMessage, method, url, flags) {
    HTTPError.apply(this, arguments);
    delete this.stack;
  };

  HTTPErrorNoStack.prototype = Object.create(HTTPError.prototype);
  HTTPErrorNoStack.FLAGS = FlaggedError.FLAGS;

  /**
   * Returns a string representing the HTTPErrorNoStack object
   * @return {string} a string representing the HTTPErrorNoStack object
   */
  HTTPErrorNoStack.prototype.toString = function() {
    return this.message;
  };

  module.exports = HTTPErrorNoStack;
})();
