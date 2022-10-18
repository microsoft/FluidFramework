/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { forEachNode, forEachField, ITreeCursorNew } from "../../../tree";

export function sum(cursor: ITreeCursorNew): number {
    let total = 0;
    const value = cursor.value;
    if (typeof value === "number") {
        total += value;
    }

    for (let inField = cursor.firstField(); inField; inField = cursor.nextField()) {
        for (let inNode = cursor.firstNode(); inNode; inNode = cursor.nextNode()) {
            total += sum(cursor);
        }
    }

    return total;
}

export function sumMap(cursor: ITreeCursorNew): number {
    let total = 0;
    const value = cursor.value;
    if (typeof value === "number") {
        total += value;
    }

    forEachField(cursor, () =>
        forEachNode(cursor, (c) => {
            total += sumMap(c);
        }),
    );

    return total;
}

/**
 * Benchmarking "consumer" that caculates two averages of two values, it takes a callback which enables this benchmark
 * to be used with any shape of tree since the callback defines the tree nagivation.
 * @param cursor - a Shared Tree cursor
 * @param dataConsumer - Function that should use the given cursor to retrieve data and call calculate().
 * @returns a set of two average values.
 */
export function averageTwoValues(
    cursor: ITreeCursorNew,
    dataConsumer: (cursor: ITreeCursorNew, calculate: (x: number, y: number) => void) => number,
): [number, number] {
    let count = 0;
    let xTotal = 0;
    let yTotal = 0;

    const calculate = (x: number, y: number) => {
        count += 1;
        xTotal += x;
        yTotal += y;
    };

    dataConsumer(cursor, calculate);

    return [xTotal / count, yTotal / count];
}
