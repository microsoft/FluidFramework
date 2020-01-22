/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export function randomSequence(length: number) {
    // eslint-disable-next-line no-bitwise
    return Array.from({length}, () => (Math.random() * length * 2) | 0);
}
