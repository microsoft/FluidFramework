/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Random } from "best-random";

// eslint-disable-next-line no-bitwise
export const rnd = new Random((Math.random() * 0x100000000) | 0);

export function randomColor() {
    // eslint-disable-next-line no-bitwise
    const channel = () => (32 + (rnd.float64() * 196) | 0).toString(16).padStart(2, "0");
    return `#${channel()}${channel()}${channel()}`;
}

export function normal() {
    // Produce normal distribution from uniform distribution using polar Box-Muller transform.
    for (;;) {
        const u = 2 * rnd.float64() - 1;
        const v = 2 * rnd.float64() - 1;
        const r = u * u + v * v;

        if (0 <= r && r <= 1) {
            // Note: 'v' could be used to compute a second independant sample instead of discarded.
            return u * Math.sqrt(-2 * Math.log(r) / r);
        }
    }
}
