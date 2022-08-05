/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Uniform distribution in the range [min, max] (both inclusive).  'min' and 'max'
 * are expected to be integers with 'max - min' in the range [0..2**53).
 *
 * @param uint53Source - Source for integers in the range [0, 2**53).
 * @param min - Smallest number included in this distribution.
 * @param max - Largest number included in this distribution.
 * @returns A number 'n' where 'min &lt;= n &lt;= max'.
 */
export const integer = (uint53Source: () => number) =>
    (min: number, max: number) => {
        // We use the division and rejection technique to avoid bias and deemphasize the
        // weaker low bits of the XSadd engine.  However, since XSadd discards low bits
        // when constructing a Uint53, deemphasizing the low bits may be redundant.
        //
        // See: https://www.pcg-random.org/posts/bounded-rands.html
        //
        // Perf: While the above site ranks division and rejection among the slowest options,
        //       this approach compared favorably vs. a modified bitmask with rejection that
        //       discards low bits.  (node 14 x64)
        const range = max - min + 1;
        const divisor = Math.floor(2 ** 53 / range);

        for (;;) {
            const candidate = uint53Source() / divisor;

            if (candidate < range) {
                return Math.floor(candidate) + min;
            }
        }
    };
