/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable-next-line:no-import-side-effect
import { MockRuntime } from "@microsoft/fluid-test-runtime-utils";
import { SharedMatrix, SharedMatrixFactory } from "../../dist";

const runtime = new MockRuntime();
let matrix: SharedMatrix;

// tslint:disable-next-line:insecure-random
matrix = new SharedMatrixFactory().create(runtime, Math.random().toString(36).slice(2)) as SharedMatrix;
matrix.insertCols(0, 100);
matrix.insertRows(0, 100);
for (let r = 0; r < matrix.numRows; r++) {
    for (let c = 0; c < matrix.numCols; c++) {
        matrix.setCell(r, c, r + c);
    }
}

for (let r = 0; r < matrix.numRows; r++) {
    for (let c = 0; c < matrix.numCols; c++) {
        matrix.setCell(r, c, r + c);
    }
}

console.time();
for (let i = 0; i < 1000; i++) {
    for (let r = 0; r < matrix.numRows; r++) {
        for (let c = 0; c < matrix.numCols; c++) {
            const temp = matrix.getCell(r, c);
            matrix.setCell(r, c, matrix.getCell(c, r));
            matrix.setCell(c, r, temp);
        }
    }
}
console.timeEnd();
