/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export function bsearch2<T>(callback: (index: number) => boolean, start: number, end: number) {
    let _start = start;
    let _end = end;
    while (_start < _end) {
        // Bitwise ops are ~2x faster than 'mid = start + Math.floor((end - start) / 2)'.
        // eslint-disable-next-line no-bitwise
        const mid = (_start + _end) >> 1;
        if (callback(mid)) {
            _start = mid + 1;
        } else {
            _end = mid;
        }
    }
    return _start;
}
