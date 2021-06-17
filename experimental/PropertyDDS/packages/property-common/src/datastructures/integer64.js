/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview implements (U)Int64 Datastructures
 */

const _ = require("lodash");
const ConsoleUtils = require('../console_utils');
const { MSG } = require('../constants');

const BIT32 = 4294967296;

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
var Integer64 = function (in_low = 0, in_high = 0) {
  this._low = in_low;
  this._high = in_high;
};

/**
 * @return {number} the higher 32 bit integer part
*/
Integer64.prototype.getValueHigh = function () {
  return this._high;
};

/**
 * @return {number} the lower 32 bit integer part
*/
Integer64.prototype.getValueLow = function () {
  return this._low;
};

/**
 * stringToInt function parses a string argument updates object's lower and higher 32 bit integer parts.
 *
 * @param {boolean} [in_signed] If the expect response should be signed or unsigned.
 * @param {string} in_string The value to parse. Leading whitespace in the string argument is ignored.
 * @param {number} [in_radix = 10] An integer between 2 and 36 that represents the
 *     radix (the base in mathematical numeral systems) of the above mentioned string.
 * @throws if in_string is not a string
 * @throws if in_radix is entered but is not a number between 2 and 36
 * @throws if the property is a Uint64 property and in_string is a negative number
 * @throws if in_string contains characters other than numbers
 * @return {Array<Number>} low and high bits of Int64
 * @ignore
 */
function _stringToInt64(in_signed, in_string, in_radix = 10) {
  ConsoleUtils.assert(_.isString(in_string), MSG.IN_STRING_MUST_BE_STRING + in_string);
  var string = in_string.trim();

  ConsoleUtils.assert(_.isNumber(in_radix), MSG.IN_RADIX_BETWEEN_2_36 + in_radix);
  ConsoleUtils.assert(in_radix >= 2 && 36 >= in_radix, MSG.BASE_OUT_OF_RANGE + in_radix);

  var position = 0;
  var negative = false;
  var high = 0;
  var low = 0;
  if (string[0] === '-') {
    negative = true;
    position += 1;
  }

  ConsoleUtils.assert(!negative || in_signed, MSG.CANNOT_UPDATE_TO_NEGATIVE + string);

  while (position < string.length) {
    var digit = parseInt(string[position++], in_radix);
    if (isNaN(digit)) {
      throw new Error(MSG.CANNOT_PARSE_INVALID_CHARACTERS + string);
    }
    low = low * in_radix + digit;
    high = high * in_radix + Math.floor(low / BIT32);
    low %= BIT32;
  }

  if (negative) {
    high = ~high;
    if (low) {
      low = BIT32 - low;
    } else {
      high += 1;
    }
  }

  return [low, high];
};

function _int64toString(isSigned, in_radix = 10) {
  ConsoleUtils.assert(_.isNumber(in_radix), MSG.IN_RADIX_MUST_BE_NUMBER + in_radix);
  ConsoleUtils.assert(in_radix >= 2 && 36 >= in_radix, MSG.BASE_OUT_OF_RANGE + in_radix);

  var high = this.getValueHigh();
  var low = this.getValueLow();
  var result = '';
  var sign = isSigned && (high & 0x80000000);
  if (sign) {
    high = ~high;
    low = BIT32 - low;
  }
  do {
    var mod = (high % in_radix) * BIT32 + low;
    high = Math.floor(high / in_radix);
    low = Math.floor(mod / in_radix);
    result = (mod % in_radix).toString(in_radix) + result;
  } while (high || low);

  return sign ? '-' + result : result;
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
var Int64 = function (in_low, in_high) {
  Integer64.call(this, in_low, in_high);
};
Int64.prototype = Object.create(Integer64.prototype);

/**
 * @return {Int64} in_other - the  copy
 */
Int64.prototype.clone = function () {
  return new Int64(this._low, this._high);
};

Int64.prototype.toString = function (radix) {
  return _int64toString.call(this, true, radix);
};

Int64.fromString = function (in_string, in_radix = 10) {
  const [low, high] = _stringToInt64.call(this, true, in_string, in_radix);
  return new Int64(low, high);
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
var Uint64 = function (in_low, in_high) {
  Integer64.call(this, in_low, in_high);
};
Uint64.prototype = Object.create(Integer64.prototype);

/**
 * @return {Uint64} in_other - the  copy
 */
Uint64.prototype.clone = function () {
  return new Uint64(this._low, this._high);
};

Uint64.prototype.toString = function (radix) {
  return _int64toString.call(this, false, radix);
};

Uint64.fromString = function (in_string, in_radix = 10) {
  const [low, high] = _stringToInt64.call(this, false, in_string, in_radix);
  return new Uint64(low, high);
};

module.exports = { Integer64, Int64, Uint64 };
