/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview implements an effective repeatString routine which repeats a string $n$ times.
 */

(function() {

  /**
   * @namespace property-common.Strings
   * @alias property-common.Strings
   *
   * Helper functions for string processing
   */

  /**
   * Repeats a string pattern $n$ times effectively. The pattern will be changed by the function. If the number of
   * requested repeats is less than 1, the function behaves as a no-op.
   *
   * @param {String} io_pattern         - The string to be repeated
   * @param {number} in_count           - How many times (may be 0 or negative)
   *
   * @return {String} The repeated string
   * @alias property-common.Strings.repeatString
   */
  var repeatString = function(io_pattern, in_count) {
    if (in_count < 1) { return ''; }
    var result = '';
    while (in_count > 1) {
      if (in_count & 1) { result += io_pattern; }
      in_count >>= 1; io_pattern += io_pattern;
    }
    return result + io_pattern;
  };

  module.exports = repeatString;
})();
