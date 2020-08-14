/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

 /**
  * Ensures that 0 <= 'value' < 'limit'.  Throws a RangeError otherwise.
  */
export function ensureRange(value: number, limit: number) {
    // Coerce 'value' to Uint32 so that we can range check with a single branch.
    value >>>= 0;   // eslint-disable-line no-param-reassign, no-bitwise

    if (value >= limit) {
        throw new RangeError("Invalid (row, col) coordinate.");
    }
}
