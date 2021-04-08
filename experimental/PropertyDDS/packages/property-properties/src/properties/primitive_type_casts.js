/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Helper functions to cast a JavaScript type to a value that is compatible with a given primitive type
 */
const MSG = require('@fluid-experimental/property-common').constants.MSG;
const Int64 = require('@fluid-experimental/property-common').Datastructures.Int64;
const Uint64 = require('@fluid-experimental/property-common').Datastructures.Uint64;
const _ = require('lodash');
const ConsoleUtils = require('@fluid-experimental/property-common').ConsoleUtils;

var castArrays = {
  Uint32:  new Uint32Array(1),
  Uint16:  new Uint16Array(1),
  Uint8:   new Uint8Array(1),
  Int32:   new Int32Array(1),
  Int16:   new Int16Array(1),
  Int8:    new Int8Array(1),
  Float32: new Float32Array(1),
  Float64: new Float64Array(1)
};

/**
 * Performs a cast of a value by assigning it into the given data array and returning the resulting value. The
 * result is a native JavaScript datatype, that is compatible with the supplied typed array.
 *
 * @param {TypedArray}                    in_array - The data array to use for the cast
 * @param {number|string|boolean}         in_value - The value to use in the cast
 * @return {number|string|boolean} The casted value
 * @private
 */
var _simpleCastFunctor = function(in_array, in_value) {
  in_array[0] = in_value;
  return in_array[0];
};

var BIT32 = 4294967296;
/**
 * The Integer64.stringToInt() method parses a string argument updates object's lower and higher 32 bit integer parts.
 *
 * @param {string} in_string The value to parse. Leading whitespace in the string argument is ignored.
 * @param {number} [in_radix = 10] An integer between 2 and 36 that represents the
 *     radix (the base in mathematical numeral systems) of the above mentioned string.
 * @param {boolean} [in_signed] If the expect response should be signed or unsigned.
 * @throws if in_string is not a string
 * @throws if in_radix is entered but is not a number between 2 and 36
 * @throws if the property is a Uint64 property and in_string is a negative number
 * @throws if in_string contains characters other than numbers
 * @return {Int64 | Uint64} The in_string value as a Int64
 * @ignore
 */
var stringToInt = function(in_string, in_radix, in_signed) {
  ConsoleUtils.assert(_.isString(in_string), MSG.IN_STRING_MUST_BE_STRING + in_string);
  var string = in_string.trim();
  var radix = in_radix || 10;
  ConsoleUtils.assert(_.isNumber(radix), MSG.IN_RADIX_BETWEEN_2_36 + in_radix);
  if (radix < 2 || 36 < radix) {
    throw new Error(MSG.BASE_OUT_OF_RANGE + radix);
  }
  var position = 0;
  var negative = false;
  var high = 0;
  var low = 0;
  if (string[0] === '-') {
    negative = true;
    ++position;
  }

  if (negative && !in_signed) {
    throw new Error(MSG.CANNOT_UPDATE_TO_NEGATIVE + in_string);
  }

  while (position < string.length) {
    var digit = parseInt(string[position++], radix);
    if (isNaN(digit)) {
      throw new Error(MSG.CANNOT_PARSE_INVALID_CHARACTERS + in_string);
    }
    low = low * radix + digit;
    high = high * radix + Math.floor(low / BIT32);
    low %= BIT32;
  }

  if (negative) {
    high = ~high;
    if (low) {
      low = BIT32 - low;
    } else {
      ++high;
    }
  }

  if (in_signed) {
    return new Int64(low, high);
  } else {
    return new Uint64(low, high);
  }
};

/**
 * Helper functions to cast the input value to the given type
 * @protected
 * @alias property-properties._castFunctors
 */
var _castFunctors = {
  /**
   * Casts the input value to a Uint64
   * @param {number} in_value - The value to use in the cast
   * @param {number} [in_radix = 10] An integer between 2 and 36 that represents the
   *    radix (the base in mathematical numeral systems) of the above in_value if it is a string.
   * @return {number} The casted value
   * @protected
   */
  Uint64: function(in_value, in_radix) {
    if (in_value instanceof Uint64) {
      return in_value;
    }
    if (typeof in_value === 'string') {
      return stringToInt(in_value, in_radix, false);
    }
    if (typeof in_value === 'number') {
      return stringToInt(String(in_value), in_radix, false);
    }
    throw new Error(MSG.INT_64_NON_INT64_TYPE + ' , value: ' + in_value);
  },
  /**
   * Casts the input value to a Uint32
   * @param {number} in_value - The value to use in the cast
   * @return {number} The casted value
   * @protected
   */
  Uint32: _simpleCastFunctor.bind(undefined, castArrays.Uint32),
  /**
   * Casts the input value to a Uint16
   * @param {number} in_value - The value to use in the cast
   * @return {number} The casted value
   * @protected
   */
  Uint16: _simpleCastFunctor.bind(undefined, castArrays.Uint16),
  /**
   * Casts the input value to a Uint8
   * @param {number} in_value - The value to use in the cast
   * @return {number} The casted value
   * @protected
   */
  Uint8: _simpleCastFunctor.bind(undefined, castArrays.Uint8),
  /**
   * Casts the input value to a Int64
   * @param {number} in_value - The value to use in the cast
   * @param {number} [in_radix = 10] An integer between 2 and 36 that represents the
   *    radix (the base in mathematical numeral systems) of the above in_value if it is a string.
   * @return {number} The casted value
   * @protected
   */
  Int64: function(in_value, in_radix) {
    if (in_value instanceof Int64) {
      return in_value;
    }
    if (typeof in_value === 'string') {
      return stringToInt(in_value, in_radix, true);
    }
    if (typeof in_value === 'number') {
      return stringToInt(String(in_value), in_radix, true);
    }
    throw new Error(MSG.INT_64_NON_INT64_TYPE + ' , value: ' + in_value);
  },
  /**
   * Casts the input value to a Int32
   * @param {number} in_value - The value to use in the cast
   * @return {number} The casted value
   * @protected
   */
  Int32: _simpleCastFunctor.bind(undefined, castArrays.Int32),
  /**
   * Casts the input value to a Int16
   * @param {number} in_value - The value to use in the cast
   * @return {number} The casted value
   * @protected
   */
  Int16: _simpleCastFunctor.bind(undefined, castArrays.Int16),
  /**
   * Casts the input value to a Int8
   * @param {number} in_value - The value to use in the cast
   * @return {number} The casted value
   * @protected
   */
  Int8: _simpleCastFunctor.bind(undefined, castArrays.Int8),
  /**
   * Casts the input value to a Float32
   * @param {number} in_value - The value to use in the cast
   * @return {number} The casted value
   * @protected
   */
  Float32: _simpleCastFunctor.bind(undefined, castArrays.Float32),
  /**
   * Casts the input value to a Float64
   * @param {number} in_value - The value to use in the cast
   * @return {number} The casted value
   * @protected
   */
  Float64: _simpleCastFunctor.bind(undefined, castArrays.Float64),
  /**
   * Casts the input value to a String
   * @param {number} in_value - The value to use in the cast
   * @return {number} The casted value
   * @protected
   */
  String: function(in_value) {
    return String(in_value);
  },
  /**
   * Casts the input value to a Boolean value
   * @param {boolean} in_value - The value to use in the cast
   * @return {boolean} The casted value
   * @protected
   */
  Boolean: function(in_value) {
    return !!in_value;
  }
};

module.exports = _castFunctors;
