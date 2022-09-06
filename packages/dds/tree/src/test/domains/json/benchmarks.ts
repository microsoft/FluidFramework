/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "assert";
import { assert } from "console";
import { ITreeCursor, mapCursorField, reduceField, TreeNavigationResult } from "../../../forest";
import { FieldKey } from "../../../tree";

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

export function mahattanPerimeter(cursor: ITreeCursor): number {
    let total = 0;
    let current: [number, number] | undefined;

    let result = cursor.down(key, 0);
    if (result !== TreeNavigationResult.Ok) {
        assert(result === TreeNavigationResult.NotFound, "pending not supported in reduceField");
        // This has to be special cased (and not fall through the code below)
        // since the call to `up` needs to be skipped.
        return output;
    }
    while (result === TreeNavigationResult.Ok) {
        output = (f(cursor, output));
        result = cursor.seek(1);
    }

    // Read x and y values
    if (cursor.down("" as FieldKey, 0) !== TreeNavigationResult.Ok) {
        fail("no x");
    }
    const x = cursor.value;
    cursor.up();
    if (cursor.down("" as FieldKey, 1) !== TreeNavigationResult.Ok) {
        fail("no y");
    }
    const y = cursor.value;
    cursor.up();

    if (current !== undefined) {
        total += Math.abs(current[0] - x) + Math.abs(current[1] - y);
    }
    current = [x, y];

    return total;
}
