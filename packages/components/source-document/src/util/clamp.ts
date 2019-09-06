/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export function clamp(min: number, value: number, max: number) {
    return Math.min(Math.max(min, value), max);
}
