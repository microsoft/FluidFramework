/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview implements (U)Int64 Datastructures
 */

(function() {

  /**
   * A data representation class for 64 bit integer types.
   * This is necessary since js doesn't support 64bit
   * integers natively yet.
   *
   * Please note this class is immutable.
   * There are and there won't be set functions!
   * (see javascript String class)
   *
   * @param {number} in_low  - lower 32 bit
   * @param {number} in_high - higher 32 bit
   * @constructor
   * @protected
   * @alias property-common.Datastructures.Integer64
   * @private
   */
  var Integer64 = function(in_low, in_high ) {
    this._low = in_low  || 0;
    this._high  = in_high || 0;
  };

  /**
   * @return {number} the higher 32 bit integer part
  */
  Integer64.prototype.getValueHigh = function() {
    return this._high;
  };

  /**
   * @return {number} the higher 32 bit integer part
   * @deprecated
   */
  Integer64.prototype.getHigh = function() {
    console.log('Integer64.prototype.getHigh() is deprecated. Please use getValueHigh() instead.');
    return this._high;
  };

  /**
   * @return {number} the lower 32 bit integer part
  */
  Integer64.prototype.getValueLow = function() {
    return this._low;
  };

  /**
   * @return {number} the lower 32 bit integer part
   * @deprecated
  */
  Integer64.prototype.getLow = function() {
    console.log('Integer64.prototype.getLow() is deprecated. Please use getValueLow() instead.');
    return this._low;
  };

  /**
   * A data representation class for the signed 64 bit integer type
   *
   * @param {number} in_low  - lower 32 bit
   * @param {number} in_high - higher 32 bit
   * @constructor
   * @extends property-common.Datastructures.Integer64
   * @alias property-common.Datastructures.Int64
   * @private
   */
  var Int64 = function(in_low, in_high) {
    Integer64.call( this, in_low, in_high);
  };
  Int64.prototype = Object.create(Integer64.prototype);

  /**
   * @return {Int64} in_other - the  copy
   */
  Int64.prototype.clone = function() {
    return new Int64(this._low, this._high);
  };

  /**
   * A data representation class for the unsigned 64 bit integer type
   *
   * @param {number} in_low  - lower 32 bit
   * @param {number} in_high - higher 32 bit
   * @constructor
   * @extends property-common.Datastructures.Integer64
   * @alias property-common.Datastructures.Uint64
   * @private
   */
  var Uint64 = function(in_low, in_high) {
    Integer64.call( this, in_low, in_high);
  };
  Uint64.prototype = Object.create(Integer64.prototype);

  /**
   * @return {Uint64} in_other - the  copy
   */
  Uint64.prototype.clone = function() {
    return new Uint64(this._low, this._high);
  };

  module.exports = { Integer64, Int64, Uint64 };
})();
