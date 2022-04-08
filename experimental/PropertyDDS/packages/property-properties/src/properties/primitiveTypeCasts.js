/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Helper functions to cast a JavaScript type to a value that is compatible with a given primitive type
 */
const _ = require('lodash');
const { MSG } = require('@fluid-experimental/property-common').constants;
const { Int64, Uint64 } = require('@fluid-experimental/property-common');

var castArrays = {
    Uint32: new Uint32Array(1),
    Uint16: new Uint16Array(1),
    Uint8: new Uint8Array(1),
    Int32: new Int32Array(1),
    Int16: new Int16Array(1),
    Int8: new Int8Array(1),
    Float32: new Float32Array(1),
    Float64: new Float64Array(1),
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

/**
 * Helper functions to cast the input value to the given type
 * @protected
 * @alias property-properties._castFunctors
 */
const _castFunctors = {
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
            return Uint64.fromString(in_value, in_radix);
        }
        if (typeof in_value === 'number') {
            return Uint64.fromString(String(in_value), in_radix);
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
            return Int64.fromString(in_value, in_radix);
        }
        if (typeof in_value === 'number') {
            return Int64.fromString(String(in_value), in_radix);
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
    },
};

export { _castFunctors };
