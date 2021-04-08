/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview
 * The ValidationResultBuilder maintains validation context that ultimately gets returned as a
 * single result.
 */

/**
 * Instantiates a ValidationResultBuilder
 * @param {string} in_typeid A template typeid.
 * @constructor
 */
var ValidationResultBuilder = function(in_typeid) {
  this._result = {
    isValid: true,
    errors: [],
    warnings: [],
    resolvedTypes: [],
    unresolvedTypes: []
  };

  if (in_typeid) {
    this._result.typeid = in_typeid;
  }

  /**
   * Fetches the validation result. Example: {
   *   isValid: false,
   *   errors: ['Something went wrong. Validation failed.'],
   *   warnings: ['A non-fatal warning'],
   *   typeid: 'SomeNamespace:PointID-1.0.0'
   * }
   */
  Object.defineProperty(this, 'result', {
    get: function() {
      return this._result;
    }
  });
};

/**
 * Add a validation error.
 * @param {Error} in_error An Error instance.
 */
ValidationResultBuilder.prototype.addError = function(in_error) {
  this._result.isValid = false;
  // remove empty error messages before logging.
  if (in_error.message) {
    this._result.errors.push(in_error);
  }
};

/**
 * Add a validation warning.
 * @param {string} in_msg A warning description.
 */
ValidationResultBuilder.prototype.addWarning = function(in_msg) {
  this._result.warnings.push(in_msg);
};

/**
 * Fetches the boolean validation result.
 * @return {boolean} True if validation produced no error, false otherwise. Warnings don't affect
 *   this value.
 */
ValidationResultBuilder.prototype.isValid = function() {
  return this._result.isValid;
};

module.exports = ValidationResultBuilder;
