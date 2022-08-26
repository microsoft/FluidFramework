/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 *
 * @param setA - A set.
 * @param setB - A set.
 * @returns A new set containing the difference of Set A and Set B. That is, it returns a Set containing the items in
 * Set A that are not in Set B.
 *
 * @remarks
 *
 * Implementation from {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set}.
 */
export function difference<T>(setA: Set<T>, setB: Set<T>) {
    const _difference = new Set(setA);
    for (const elem of setB) {
        _difference.delete(elem);
    }

    return _difference;
}
