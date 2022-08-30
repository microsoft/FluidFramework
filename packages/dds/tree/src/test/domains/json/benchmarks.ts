/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITreeCursor, mapCursorField, TreeNavigationResult } from "../../../forest";

export function sum(cursor: ITreeCursor): number {
    let total = 0;
    const value = cursor.value;
    if (typeof value === "number") {
        total += value;
    }
    for (const field of cursor.keys) {
        for (let i = 0; i < cursor.length(field); i++) {
            if (cursor.down(field, i) === TreeNavigationResult.Ok) {
                total += sum(cursor);
            }

            cursor.up();
        }
    }
    return total;
}

export function sumMap(cursor: ITreeCursor): number {
    let total = 0;
    const value = cursor.value;
    if (typeof value === "number") {
        total += value;
    }
    for (const field of cursor.keys) {
        mapCursorField(cursor, field, sumMap);
    }
    return total;
}
