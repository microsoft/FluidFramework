/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark, getTestArgs } from '../harness';
import { fill, IArray2D } from '../imports';

const { row, col, numRows, numCols, fill: shouldFill } = getTestArgs();

export function pointwise<T>(name: string | undefined, arr: IArray2D<T>) {
    if (shouldFill) {
        fill(arr);
    }

    benchmark(
        `SUM ${name !== undefined ? name : arr.constructor.name} (${
            shouldFill
                ? 'full'
                : 'empty'
        }) Pointwise Read ${numRows}x${numCols} @${row},${col}`,
        () => {
            let sum = 0;
            for (let r = row; r < numRows; r++) {
                for (let c = col; c < numCols; c++) {
                    sum += (arr.read(r, c) as any | 0);
                }
            }
            return sum;
        }
    );
}
