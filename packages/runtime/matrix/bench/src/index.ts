/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable-next-line:no-import-side-effect
import { MockRuntime } from "@microsoft/fluid-test-runtime-utils";
import { Suite } from "benchmark";
import { SharedMatrix, SharedMatrixFactory } from "../../dist";
import { runSuites } from "./util";

const runtime = new MockRuntime();
let matrix: SharedMatrix;

const prepare = () => {
    // tslint:disable-next-line:insecure-random
    matrix = new SharedMatrixFactory().create(runtime, Math.random().toString(36).slice(2)) as SharedMatrix;
    matrix.insertCols(0, 100);
    matrix.insertRows(0, 100);
    for (let r = 0; r < matrix.numRows; r++) {
        for (let c = 0; c < matrix.numCols; c++) {
            matrix.setCell(r, c, r + c);
        }
    }
};

runSuites([
    new Suite("100x100")
        .on("start", prepare)
        .on("cycle", prepare)
        .add("set", () => {
            for (let r = 0; r < matrix.numRows; r++) {
                for (let c = 0; c < matrix.numCols; c++) {
                    matrix.setCell(r, c, r + c);
                }
            }
        })
        .add("transpose", () => {
            for (let r = 0; r < matrix.numRows; r++) {
                for (let c = 0; c < matrix.numCols; c++) {
                    const temp = matrix.getCell(r, c);
                    matrix.setCell(r, c, matrix.getCell(c, r));
                    matrix.setCell(c, r, temp);
                }
            }
        }),
    ]);
