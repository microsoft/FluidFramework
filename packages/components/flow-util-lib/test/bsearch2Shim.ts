/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import { bsearch2 } from "../src/bsearch2";

export function bsearch2Shim<T>(array: Readonly<ArrayLike<T>>, value: T, start = 0, end = array.length) {
    return bsearch2((index) => array[index] < value, start, end);
}
