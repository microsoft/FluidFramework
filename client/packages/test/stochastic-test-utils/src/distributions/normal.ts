/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Map uniform distribution in the range [0..1) to a normal distribution with the
 * given 'mean' and 'standardDeviation'.
 */
export const normal = (float64Source: () => number) => {
    // Marsaglia polar method
    // See: https://en.wikipedia.org/wiki/Marsaglia_polar_method

    // PERF: Caching and using the 'v' coordinate on alternating calls yields an
    //       ~16% speed improvement (node 14 x64).

    let cache = 0;
    let hasCache = true;

    return (mean = 0, stdDev = 1) => {
        hasCache = !hasCache;

        if (hasCache) {
            return cache * stdDev + mean;
        } else {
            let u: number;
            let v: number;
            let s: number;

            do {
                u = float64Source() * 2 - 1;
                v = float64Source() * 2 - 1;
                s = u * u + v * v;
            } while (s >= 1 || s === 0);

            cache = s = Math.sqrt(-2 * Math.log(s) / s);
            cache *= v;

            return mean + stdDev * u * s;
        }
    };
};
