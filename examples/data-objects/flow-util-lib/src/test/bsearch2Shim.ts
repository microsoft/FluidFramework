/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bsearch2 } from "../bsearch2";

export function bsearch2Shim<T>(array: Readonly<ArrayLike<T>>, value: T, start = 0, end = array.length) {
    return bsearch2((index) => array[index] < value, start, end);
}
