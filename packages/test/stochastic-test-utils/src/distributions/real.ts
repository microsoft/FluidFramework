/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Uniform distribution in the range [min, max) (end exclusive).
 *
 * @param float64Source - Source for float64 values in the range [0, 1) (end exclusive).
 * @param min - Smallest number included in this distribution.
 * @param max - Smallest number greater than min that is excluded in this distribution.
 * @returns A number 'n' where 'min &lt;= n &lt; max'.
 */
export const real = (float64Source: () => number, min: number, max: number) => {
    const delta = max - min;
    return () => float64Source() * delta + min;
};
