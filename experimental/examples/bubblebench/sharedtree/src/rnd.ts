/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
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
