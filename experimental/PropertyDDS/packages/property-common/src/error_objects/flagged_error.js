/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
(function() {
  var FlaggedError = function() {};

  /**
   * Flags that may be set on an error instance.
   * @type {{TRANSIENT: number, QUIET: number}}
   */
  FlaggedError.FLAGS = {
    /**
     * A transient error results from an operation that could succeed if retried.
     */
    TRANSIENT: 1,
    /**
     * A quiet error should not trigger an error log.
     */
    QUIET: 2
  };

  /**
   * Checks if a flag is set
   * @param {number} flag A flag value
   * @return {boolean} True if the flag is set in passed flags, false otherwise.
   * @private
   */
  var _isFlagSet = function(flag) {
    return (this.flags & flag) === flag;
  };

  /**
   * @return {boolean} True if the quiet flag is set.
   */
  FlaggedError.prototype.isQuiet = function() {
    return _isFlagSet.call(this, FlaggedError.FLAGS.QUIET);
  };

  /**
   * @return {boolean} True if the transient flag is set.
   */
  FlaggedError.prototype.isTransient = function() {
    return _isFlagSet.call(this, FlaggedError.FLAGS.TRANSIENT);
  };

  module.exports = FlaggedError;
})();
