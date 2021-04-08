/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * Used to replace console.assert to make sure that it always throws an error, both in the browser and in Node
 */
(function() {
  'use strict';

  var ConsoleUtils = {};

  /**
   * Throws an error if the in_condition is false
   * @param {Boolean} in_condition the condition we are testing: a boolean expression.
   * @param {String} in_message the error message that will be thrown if the condition is false.
   */
  ConsoleUtils.assert = function(in_condition, in_message) {
    if (!in_condition) {
      throw new Error(in_message);
    }
  };

  module.exports = ConsoleUtils;
})();
