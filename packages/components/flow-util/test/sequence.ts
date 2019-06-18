/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable:no-bitwise
// tslint:disable:insecure-random

export function randomSequence(length: number) {
    return Array.from({length}, () => (Math.random() * length * 2) | 0);
}
