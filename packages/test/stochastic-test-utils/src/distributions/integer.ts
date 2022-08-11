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
        if (max < min || Math.trunc(max) !== max || Math.trunc(min) !== min) {
            // const t = min;
            // min = max;
            // max = t;

            throw new RangeError(`Degenerate interval [${min}..${max}].`);
        }

        const range = max - min + 1;

        // Use affine combination if the range exceeds 53b (or is nonfinite).
        if (!(range <= 0x1fffffffffffff)) {
            // Similar to implementation of 'real' distribution, but with a smaller divisor
            // to produce [0..1] (inclusive).
            const alpha = uint53Source() / 0x1fffffffffffff;
            return Math.trunc((1 - alpha) * min + alpha * max);
        }

        // We use the division and rejection technique to avoid bias and deemphasize the
        // weaker low bits of the XSadd engine.  However, since XSadd discards low bits
        // when constructing a Uint53, deemphasizing the low bits may be redundant.
        //
        // See: https://www.pcg-random.org/posts/bounded-rands.html
        //
        // Perf: While the above site ranks division and rejection among the slowest options,
        //       this approach compared favorably vs. a modified bitmask with rejection that
        //       discards low bits.  (node 14 x64)

        const divisor = Math.trunc(0x20000000000000 / range);
        let result: number;

        do {
            result = uint53Source() / divisor;
        } while (result >= range);

        return Math.trunc(result) + min;
    };
