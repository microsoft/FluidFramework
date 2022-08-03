/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export const integer = (uint53Source: () => number, min: number, max: number) => {
    // We use the division and rejection technique to avoid bias and deemphasize the
    // weaker low bits of the XSadd engine.  Note, however, that XSadd discards
    // low bits when constructing a Uint53, so deemphasizing the low bits is possibly
    // redundant.
    //
    // See: https://www.pcg-random.org/posts/bounded-rands.html
    const range = max - min + 1;
    const divisor = Math.floor(2 ** 53 / range);

    return () => {
        for (;;) {
            const candidate = Math.floor(uint53Source() / divisor);

            if (candidate < range) {
                return candidate + min;
            }
        }
    };
};
