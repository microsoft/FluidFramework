/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { forEachNode, ITreeCursorNew } from "../../../forest";

export function sum(cursor: ITreeCursorNew): number {
    let total = 0;
    const value = cursor.value;
    if (typeof value === "number") {
        total += value;
    }
    let moreFields = cursor.firstField();
    while (moreFields) {
        let inField = cursor.firstNode();
        while (inField) {
            total += sum(cursor);
            inField = cursor.nextField();
        }
        moreFields = cursor.nextField();
    }
    return total;
}

export function sumMap(cursor: ITreeCursorNew): number {
    let total = 0;
    const value = cursor.value;
    if (typeof value === "number") {
        total += value;
    }
    let moreFields = cursor.firstField();
    while (moreFields) {
        forEachNode(cursor, sumMap);
        moreFields = cursor.nextField();
    }
    return total;
}

export function averageLocation(
    cursor: ITreeCursorNew,
    extractCoordinates: (cursor: ITreeCursorNew, calculate: (x: number, y: number) => void) => number,
): [number, number] {
    let count = 0;
    let xTotal = 0;
    let yTotal = 0;

    const calculate = (x: number, y: number) => {
        count += 1;
        xTotal += x;
        yTotal += y;
    };

    extractCoordinates(cursor, calculate);

    return [xTotal / count, yTotal / count];
}
