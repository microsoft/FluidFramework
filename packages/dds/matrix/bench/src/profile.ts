/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { createContiguousMatrix } from "./util";
import { fill } from "./imports";

const row = 0, col = 0, numRows = 256, numCols = 256, shouldFill = true;

const rowSize = row + numRows;
const colSize = col + numCols;

const arr = createContiguousMatrix(rowSize, colSize);

if (shouldFill) {
    fill(arr);
}

let sum = 0;

for (let i = 0; i < 1000; i++) {
    for (let r = row; r < numRows; r++) {
        for (let c = col; c < numCols; c++) {
            sum += (arr.read(r, c) as any | 0);
        }
    }
}

console.log(sum);
