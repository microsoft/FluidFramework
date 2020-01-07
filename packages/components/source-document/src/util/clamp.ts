/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export const clamp =
    (min: number, value: number, max: number) =>
        Math.min(Math.max(min, value), max);
