/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

// Note that the exponents sum to 2^53, which fully utilizes the exact integer range of a Float64.
export const maxRows = 0x100000000 as const;    // 2^32 = x4096 Excel maximum of 1,048,576 rows
export const maxCols = 0x200000 as const;       // 2^21 =  x128 Excel maximum of 16,384 columns
const colMask = 0x1fffff as const;              // = maxCols - 1

/**
 * Encode the given RC0 `row`/`col` as a 53b integer key.
 */
export const pointToKey = (row: number, col: number) =>
    row * maxCols + col;    // Note: Can not replace multiply with shift as product exceeds 32b.

/**
 * Decode the given `key` to its 0-indexed row/col.
 */
export function keyToPoint(position: number) {
    // Can not replace division with shift as numerator exceeds 32b, but the quotient can
    // be safely converted to a Uint32 in lieu of 'Math.floor()' for a measurable speedup.
    const row = (position / maxCols) >>> 0;

    // The column portion is less than 32b and resides in the low bits of the Uint53.  We
    // can safely extract it with mask.
    const col = position & colMask;
    return [row, col];
}
