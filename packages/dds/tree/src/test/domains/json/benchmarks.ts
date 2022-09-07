/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, strict as assert } from "assert";
import { ITreeCursor, reduceField, TreeNavigationResult } from "../../../forest";
import { EmptyKey, FieldKey } from "../../../tree";

export function sum(cursor: ITreeCursor): number {
    let total = 0;
    const value = cursor.value;
    if (typeof value === "number") {
        total += value;
    }
    for (const key of cursor.keys) {
        total += reduceField(cursor, key, total, sum);
    }
    return total;
}

export function mahattanPerimeter(
    cursor: ITreeCursor,
    extractCoordinates: (cursor: ITreeCursor) => Generator<[number, number]>,
): number {
    let total = 0;
    // let count = 0;
    let current: [number, number] | undefined;

    for (const [x, y] of extractCoordinates(cursor)) {
        if (current !== undefined) {
            total += Math.abs(current[0] - x) + Math.abs(current[1] - y);
        }
        current = [x, y];
    }

    return total;
}
