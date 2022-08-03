/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Map uniform distribution in the range [0..1) to a normal distribution with
// mean 'mu' and standard deviation 'sigma'.
//
// https://en.wikipedia.org/wiki/Marsaglia_polar_method
export const normal = (float64Source: () => number, mu = 0, sigma = 1) => {
    return () => {
        let x: number;
        let y: number;
        let r: number;

        do {
            x = float64Source() * 2 - 1;
            y = float64Source() * 2 - 1;
            r = x * x + y * y;
        } while (r > 1 || r === 0);

        return mu + sigma * y * Math.sqrt(-2 * Math.log(r) / r);
    };
};
