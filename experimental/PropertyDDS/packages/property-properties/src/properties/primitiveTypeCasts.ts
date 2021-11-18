/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Helper functions to cast a JavaScript type to a value that is compatible with a given primitive type
 */

import { constants } from '@fluid-experimental/property-common';
import { Int64, Uint64 } from '@fluid-experimental/property-common';

const { MSG } = constants;


const castArrays = {
    Uint32: new Uint32Array(1),
    Uint16: new Uint16Array(1),
    Uint8: new Uint8Array(1),
    Int32: new Int32Array(1),
    Int16: new Int16Array(1),
    Int8: new Int8Array(1),
    Float32: new Float32Array(1),
    Float64: new Float64Array(1)
} as const;

type Keys = keyof typeof castArrays;
type TypedArray = typeof castArrays[Keys];

/**
 * Performs a cast of a value by assigning it into the given data array and returning the resulting value. The
 * result is a native JavaScript datatype, that is compatible with the supplied typed array.
 *
 * @param in_array - The data array to use for the cast
 * @param in_value - The value to use in the cast
 * @returns The casted value
 * @private
 */
const _simpleCastFunctor = function(in_array: TypedArray, in_value: number): number {
    in_array[0] = in_value;
    return in_array[0];
};


/**
 * Helper functions to cast the input value to the given type
 */
export const _castFunctors = {
    /**
     * Casts the input value to a Uint64
     * @param in_value - The value to use in the cast
     * @param in_radix - An integer between 2 and 36 that represents the
     *    radix (the base in mathematical numeral systems) of the above in_value if it is a string.
     * @returns The casted value
     */
    Uint64: function(in_value: Uint64 | string | number, in_radix = 10): Uint64 {
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
     */
    Uint32: _simpleCastFunctor.bind(undefined, castArrays.Uint32),
    /**
     * Casts the input value to a Uint16
     */
    Uint16: _simpleCastFunctor.bind(undefined, castArrays.Uint16),
    /**
     * Casts the input value to a Uint8
     */
    Uint8: _simpleCastFunctor.bind(undefined, castArrays.Uint8),
    /**
     * Casts the input value to a Int64
     * @param in_value - The value to use in the cast
     * @param in_radix - An integer between 2 and 36 that represents the
     *    radix (the base in mathematical numeral systems) of the above in_value if it is a string.
     * @returns The casted value
     */
    Int64: function(in_value: Int64 | string | number, in_radix = 10): Int64 {
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
     */
    Int32: _simpleCastFunctor.bind(undefined, castArrays.Int32),
    /**
     * Casts the input value to a Int16
     */
    Int16: _simpleCastFunctor.bind(undefined, castArrays.Int16),
    /**
     * Casts the input value to a Int8
     */
    Int8: _simpleCastFunctor.bind(undefined, castArrays.Int8),
    /**
     * Casts the input value to a Float32
     */
    Float32: _simpleCastFunctor.bind(undefined, castArrays.Float32),
    /**
     * Casts the input value to a Float64
     */
    Float64: _simpleCastFunctor.bind(undefined, castArrays.Float64),
    /**
     * Casts the input value to a String
     */
    String: function(in_value) {
        return String(in_value);
    },
    /**
     * Casts the input value to a Boolean value
     */
    Boolean: function(in_value) {
        return !!in_value;
    }
};
