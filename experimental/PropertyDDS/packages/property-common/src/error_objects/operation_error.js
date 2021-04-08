/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable no-use-before-define */
/**
 * An operation error maintains additional information compared to a plain {@link #Error}:
 * - The operation name
 * - A status code
 * - Extensible flags. {@see ExtendedError.FLAGS}.
 */
(function() {
  var _ = require('lodash');
  var FlaggedError = require('./flagged_error');

  /**
   * Instantiates an OperationError, which mimics the {@link #Error} class with added properties
   * meant for reporting the result of operations.
   * @param {string} message The error message.
   * @param {?string} operation The operation name.
   * @param {?number} statusCode The operation result as a numerical status code.
   * @param {?number} flags Flags that characterize the error. See {@link FlaggedError#FLAGS}.
   * @constructor
   * @alias property-common.OperationError
   */
  var OperationError = function(message, operation, statusCode, flags) {
    Error.call(this, message);
    this.name = 'OperationError';
    this.operation = operation;
    this.statusCode = statusCode;
    this.flags = flags || 0;
    var stack = Error(message).stack;

    Object.defineProperty(this, 'message', {
      enumerable: false,
      get: function() {
        return message;
      }
    });

    Object.defineProperty(this, 'stack', {
      enumerable: false,
      get: function() {
        return stack;
      },
      set: function(s) {
        stack = s;
      }
    });
  };

  OperationError.prototype = Object.create(Error.prototype);
  OperationError.prototype.constructor = OperationError;
  OperationError.FLAGS = FlaggedError.FLAGS;
  OperationError.prototype.isQuiet = FlaggedError.prototype.isQuiet;
  OperationError.prototype.isTransient = FlaggedError.prototype.isTransient;

  /**
   * @return {string} A string representation of the error flags.
   * @private
   * @this OperationError
   */
  var _flagsToString = function() {
    var that = this;
    var flagArray = [];
    _.mapValues(FlaggedError.FLAGS, function(flagValue, flagName) {
      if ((that.flags & flagValue) === flagValue) {
        flagArray.push(flagName);
      }
    });
    return that.flags + ' [' + flagArray.join(',') + ']';
  };

  /**
   * Returns a string representing the OperationError object
   * @return {string} a string representing the OperationError object
   */
  OperationError.prototype.toString = function() {
    var extendedFieldsArray = [];
    if (this.operation) {
      extendedFieldsArray.push(this.operation);
    }

    if (this.statusCode) {
      extendedFieldsArray.push(this.statusCode);
    }

    if (this.flags) {
      extendedFieldsArray.push(_flagsToString.call(this));
    }

    var msg = this.name;

    if (extendedFieldsArray.length > 0) {
      msg += '[' + extendedFieldsArray.join(', ') + ']';
    }

    msg += ': ' + this.message;

    if (this.stack) {
      msg += `, stack: ${this.stack}`;
    }

    return msg;
  };

  module.exports = OperationError;
})();
