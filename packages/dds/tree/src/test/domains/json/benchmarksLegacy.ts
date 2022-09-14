/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITreeCursor, reduceField } from "../../../forest";

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

export function averageLocation(
    cursor: ITreeCursor,
    extractCoordinates: (cursor: ITreeCursor, calculate: (x: number, y: number) => void) => number,
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
