/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview implements a joinPaths routine to merge two paths.
 */

(function() {

  /**
   * @namespace property-common.Strings
   * @alias property-common.Strings
   *
   * Helper functions for string processing
   */

  /**
   * Merges two strings with a separator. If one of the two is empty no separator will be added.
   * No duplicated separators will be joined
   *
   * @param {String} in_string1           - The first string to join
   * @param {String} in_string2           - The second string to join
   * @param {String} [in_separator = '/'] - The path separator
   *
   * @return {String} The joined path
   * @alias property-common.Strings.joinPaths
   */
  var  joinPaths = function(in_string1, in_string2, in_separator) {
    if (in_separator === undefined) {
      in_separator = '/';
    }
    in_string1 = in_string1 || '';
    in_string2 = in_string2 || '';

    if (!in_string1 ||
        !in_string2 ||
        in_string1.substr(-in_separator.length) === in_separator ||
        in_string2.substr(0, in_separator.length) === in_separator) {
      in_separator = '';
    }
    return in_string1 + in_separator + in_string2;
  };

  module.exports = joinPaths;
})();
