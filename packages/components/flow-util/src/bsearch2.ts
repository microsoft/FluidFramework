/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export function bsearch2<T>(callback: (index: number) => boolean, start: number, end: number) {
    while (start < end) {
        // tslint:disable-next-line:no-bitwise - Bitwise ops ~2x faster than 'mid = start + Math.floor((end - start) / 2)'.
        const mid = (start + end) >> 1;
        if (callback(mid)) {
            start = mid + 1;
        } else {
            end = mid;
        }
    }
    return start;
}
