/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable-next-line:no-import-side-effect
import "mocha";

import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { TestHost } from "@microsoft/fluid-local-test-server";
import { Jsonable, JsonablePrimitive } from "@microsoft/fluid-runtime-definitions";
import { MockDeltaConnectionFactory, MockRuntime, MockStorage } from "@microsoft/fluid-test-runtime-utils";
import { strict as assert } from "assert";
import { SharedMatrix, SharedMatrixFactory } from "../src";

type Json = Jsonable<JsonablePrimitive | IComponentHandle>;

function extract<T extends Json>(actual: SharedMatrix<T>): ReadonlyArray<ReadonlyArray<T>> {
    const m = [];
    for (let r = 0; r < actual.numRows; r++) {
        const row = [];
        m.push(row);

        for (let c = 0; c < actual.numCols; c++) {
            row.push(actual.getCell(r, c));
        }
    }

    return m;
}

function expectSize<T extends Json>(actual: SharedMatrix<T>, numRows: number, numCols: number) {
    assert.equal(actual.numRows, numRows);
    assert.equal(actual.numCols, numCols);
}

async function snapshot<T extends Json>(matrix: SharedMatrix<T>) {
    const objectStorage = new MockStorage(matrix.snapshot());
    const runtime = new MockRuntime();
    const matrix2 = new SharedMatrix(runtime, `load(${matrix.id})`);
    await matrix2.load(/*branchId: */ null, {
        deltaConnection: new MockDeltaConnectionFactory().createDeltaConnection(runtime),
        objectStorage,
    });

    expectSize(matrix2, matrix.numRows, matrix.numCols);
    assert.deepEqual(extract(matrix), extract(matrix2), "Matrix must round-trip through snapshot/load.");

    return matrix2;
}

describe("Matrix", () => {
    describe("local client", () => {
        let host1: TestHost;
        let host2: TestHost;
        let matrix: SharedMatrix<number>;

        async function sync() { await TestHost.sync(host1, host2); }

        async function expect<T extends Json>(expected: ReadonlyArray<ReadonlyArray<T>>) {
            assert.deepEqual(extract(matrix), expected, "Matrix must match expected.");

            // Ensure ops are ACKed prior to snapshot.  Otherwise, the unACKed segments won't be included.
            await sync();
            return snapshot(matrix);
        }

        before(async () => {
            host1 = new TestHost([], [SharedMatrix.getFactory()]);
            host2 = host1.clone();
        });

        beforeEach(async () => {
            // tslint:disable-next-line:insecure-random
            matrix = await host1.createType(Math.random().toString(36).slice(2), SharedMatrixFactory.Type);
        });

        // Note: We check the num rows/cols explicitly in these tests to differentiate between
        //       matrices that are 0 length in one or both dimensions.
        describe("empty matrices", () => {
            it("0x0", async () => {
                expectSize(matrix, /* numRows: */ 0, /* numCols: */ 0);
                expectSize(await expect([]), /* numRows: */ 0, /* numCols: */ 0);
            });

            it("0x1", async () => {
                matrix.insertCols(/* start: */ 0, /* count: */ 1);
                expectSize(matrix, /* numRows: */ 0, /* numCols: */ 1);
                expectSize(await expect([]), /* numRows: */ 0, /* numCols: */ 1);
            });

            it("1x0", async () => {
                matrix.insertRows(/* start: */ 0, /* count: */ 1);
                expectSize(matrix, /* numRows: */ 1, /* numCols: */ 0);
                expectSize(await expect([[]]), /* numRows: */ 1, /* numCols: */ 0);
            });
        });

        it("get/set cell", async () => {
            matrix.insertRows(0, 1);
            matrix.insertCols(0, 1);
            await expect([[undefined]]);

            matrix.setCell(0, 0, 1);
            await expect([[1]]);
        });

        it("column insertion", async () => {
            matrix.insertRows(0, 1);
            matrix.insertCols(0, 2);
            await expect([
                [undefined, undefined],
            ]);

            matrix.setCell(0, 0, 0);
            matrix.setCell(0, 1, 1);
            await expect([
                [ 0, 1 ],
            ]);

            matrix.insertCols(1, 1);
            await expect([
                [ 0, undefined, 1 ],
            ]);
        });

        it("row insertion", async () => {
            matrix.insertRows(0, 2);
            matrix.insertCols(0, 1);
            await expect([
                [undefined],
                [undefined],
            ]);

            matrix.setCell(0, 0, 0);
            matrix.setCell(1, 0, 1);
            await expect([
                [0],
                [1],
            ]);

            matrix.insertRows(1, 1);
            await expect([
                [0],
                [undefined],
                [1],
            ]);
        });

        afterEach(async () => {
            // Paranoid check that ensures that the SharedMatrix loaded from the snapshot also
            // round-trips through snapshot/load.  (Also, may help detect snapshot/loaded bugs
            // in the event that the test case forgets to call/await `expect()`.)
            await sync();
            await snapshot(await snapshot(matrix));
        });

        after(async () => {
            await Promise.all([host1.close(), host2.close()]);
        });
    });
});
