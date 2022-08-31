/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITreeCursor, mapCursorField, reduceField } from "../../../forest";

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
