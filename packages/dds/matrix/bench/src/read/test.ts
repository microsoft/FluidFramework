/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark, getTestArgs } from "hotloop";
import { fill, IArray2D } from "../imports";

const { row, col, rowCount, colCount, fill: shouldFill } = getTestArgs();

export function pointwise<T>(name: string | undefined, arr: IArray2D<T>) {
    if (shouldFill) {
        fill(arr, row, col, rowCount, colCount);
    }

    benchmark(
        `SUM ${name !== undefined ? name : arr.constructor.name} (${
            shouldFill
                ? "full"
                : "empty"
        }) Pointwise Read ${rowCount}x${colCount} @${row},${col}`,
        () => {
            let sum = 0;
            for (let r = row; r < rowCount; r++) {
                for (let c = col; c < colCount; c++) {
                    sum += (arr.getCell(r, c) as any | 0);
                }
            }
            return sum;
        }
    );
}
