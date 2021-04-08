/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
(function() {
  var FlaggedError = require('./flagged_error');

  /**
   * Class extending Error with HTTP-specific error information like statusCode and statusMessage
   * @param {string} title The error title
   * @param {number} statusCode A numeric HTTP status code
   * @param {string} statusMessage A string message representing the response status message
   * @param {string} method The HTTP method used in the request
   * @param {string} url The URL that the request was sent to
   * @param {?number} flags Flags that characterize the error. See {@link FlaggedError#FLAGS}.
   * @constructor
   * @alias property-common.HTTPError
   * @private
   */
  var HTTPError = function(title, statusCode, statusMessage, method, url, flags) {
    this.name = 'HTTPError';
    this.title = title;
    this.statusCode = statusCode;
    this.statusMessage = statusMessage;
    this.method = method;
    this.url = url;
    this.flags = flags || 0;
    this.message = this._generateMessage(title, statusCode, statusMessage, method, url);
    this.stack = (new Error(this.message)).stack;
    Error.call(this);
  };

  HTTPError.prototype = Object.create(Error.prototype);
  HTTPError.FLAGS = FlaggedError.FLAGS;
  HTTPError.prototype.isQuiet = FlaggedError.prototype.isQuiet;
  HTTPError.prototype.isTransient = FlaggedError.prototype.isTransient;

  HTTPError.prototype._generateMessage = function(title, statusCode, statusMessage, method, url) {
    title = (title === undefined) ? '' : String(title);
    statusCode = (statusCode === undefined) ? '' : String(statusCode);
    statusMessage = (statusMessage === undefined) ? '' : String(statusMessage);
    method = (method === undefined) ? '' : String(method);
    url = (url === undefined) ? '' : String(url);

    return `HTTPError: ${title}, statusCode:${statusCode}, ` +
           `statusMessage:${statusMessage}, method:${method}, url:${url}`;
  };

  /**
   * Returns a string representing the HTTPError object
   * @return {string} a string representing the HTTPError object
   */
  HTTPError.prototype.toString = function() {
    var stack = this.stack;
    stack = (stack === undefined) ? '' : String(stack);

    var isFirefox = typeof window !== 'undefined' &&
      typeof window.navigator !== 'undefined' &&
      typeof window.navigator.userAgent !== 'undefined' &&
      window.navigator.userAgent.toLowerCase().indexOf('firefox') > -1;

    return isFirefox ? `${this.message}, stack:${stack}` : `stack:${stack}`;
  };

  module.exports = HTTPError;
})();
