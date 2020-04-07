/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import "mocha";

import { TestHost } from "@microsoft/fluid-local-test-utils";
import { Serializable } from "@microsoft/fluid-runtime-definitions";
import { MockEmptyDeltaConnection, MockRuntime, MockStorage } from "@microsoft/fluid-test-runtime-utils";
import { strict as assert } from "assert";
import { SharedMatrix, SharedMatrixFactory } from "../src";
import { fill, check, insertFragmented, extract, expectSize, randomId } from "./utils";
import { TestConsumer } from "./testconsumer";

// Snapshots the given `SharedMatrix`, loads the snapshot into a 2nd SharedMatrix, vets that the two are
// equivalent, and then returns the 2nd matrix.
async function snapshot<T extends Serializable>(matrix: SharedMatrix<T>) {
    // Create a snapshot
    const objectStorage = new MockStorage(matrix.snapshot());

    // Load the snapshot into a newly created 2nd SharedMatrix.
    const runtime = new MockRuntime();
    const matrix2 = new SharedMatrix(runtime, `load(${matrix.id})`, SharedMatrixFactory.Attributes);
    await matrix2.load(/*branchId: */ null as any, {
        deltaConnection: new MockEmptyDeltaConnection(),
        objectStorage
    });

    // Vet that the 2nd matrix is equivalent to the original.
    expectSize(matrix2, matrix.numRows, matrix.numCols);
    assert.deepEqual(extract(matrix), extract(matrix2), 'Matrix must round-trip through snapshot/load.');

    return matrix2;
}

describe("Matrix", () => {
    let host1: TestHost;    // Note: Single client tests also require two clients to externally observe
    let host2: TestHost;    //       when all ops have processed with `TestHost.sync()`.

    before(async () => {
        host1 = new TestHost([], [SharedMatrix.getFactory()]);
        host2 = host1.clone();
    });

    after(async () => {
        await Promise.all([host1.close(), host2.close()]);
    });

    describe("local client", () => {
        let matrix: SharedMatrix<number>;       // SharedMatrix under test
        let consumer: TestConsumer<number>;     // Test IMatrixConsumer that builds a copy of `matrix` via observed events.

        async function sync() {
            await TestHost.sync(host1, host2);
        }

        async function expect<T extends Serializable>(expected: ReadonlyArray<ReadonlyArray<T>>) {
            const actual = extract(matrix);
            assert.deepEqual(actual, expected, "Matrix must match expected.");
            assert.deepEqual(consumer.extract(), actual, "Matrix must notify IMatrixConsumers of all changes.");

            // Ensure ops are ACKed prior to snapshot.  Otherwise, unACKed segments won't be included.
            await sync();
            return snapshot(matrix);
        }

        before(async () => {
            host1 = new TestHost([], [SharedMatrix.getFactory()]);
            host2 = host1.clone();
        });

        beforeEach(async () => {
            // Create a new matrix for each test case
            matrix = await host1.createType(randomId(), SharedMatrixFactory.Type);

            // Attach a new IMatrixConsumer
            consumer = new TestConsumer();
            matrix.openMatrix(consumer);
        });

        afterEach(async () => {
            // Paranoid check that ensures that the SharedMatrix loaded from the snapshot also
            // round-trips through snapshot/load.  (Also, may help detect snapshot/loaded bugs
            // in the event that the test case forgets to call/await `expect()`.)
            await sync();
            await snapshot(await snapshot(matrix));

            // Ensure that IMatrixConsumer observed all changes to matrix.
            assert.deepEqual(consumer.extract(), extract(matrix));

            // Sanity check that removing the consumer stops change notifications.
            matrix.removeMatrixConsumer(consumer);
            matrix.insertCols(0, 1);
            assert.equal(consumer.numCols, matrix.numCols - 1);
        });

        // Vet our three variants of an empty matrix (no rows, no cols, and both no rows and no cols).
        describe("empty matrices", () => {
            // Note: We check the num rows/cols explicitly in these tests to differentiate between
            //       matrices that are 0 length in one or both dimensions.
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

        // Vet that we can set and read back the cell in a 1x1 matrix.
        it("get/set cell", async () => {
            matrix.insertRows(/* start: */ 0, /* count: */ 1);
            matrix.insertCols(/* start: */ 0, /* count: */ 1);
            await expect([[undefined]]);

            matrix.setCell(/* row: */ 0, /* col: */ 0, 1);
            await expect([[1]]);
        });

        // Vet that we can set a range of cells with `setCells()`.
        it("get/set cells", async () => {
            matrix.insertRows(/* start: */ 0, /* count: */ 4);
            matrix.insertCols(/* start: */ 0, /* count: */ 4);

            await expect([
                [undefined, undefined, undefined, undefined],
                [undefined, undefined, undefined, undefined],
                [undefined, undefined, undefined, undefined],
                [undefined, undefined, undefined, undefined],
            ]);

            // Note: It's valid to leave the last row incomplete.
            matrix.setCells(/* row: */ 1, /* col: */ 1, /* numCols: */ 2, [
                1, 2,
                3, 4,
                5
            ]);

            await expect([
                [undefined, undefined, undefined, undefined],
                [undefined,         1,         2, undefined],
                [undefined,         3,         4, undefined],
                [undefined,         5, undefined, undefined],
            ]);
        });

        // Vet that we can insert a column in a 1x2 matrix.
        it("column insertion", async () => {
            matrix.insertRows(0, 1);
            matrix.insertCols(0, 2);
            await expect([[undefined, undefined]]);

            matrix.setCell(0, 0, 0);
            matrix.setCell(0, 1, 1);
            await expect([[0, 1]]);

            matrix.insertCols(1, 1);
            await expect([[0, undefined, 1]]);
        });

        // Vet that we can insert a row in a 2x1 matrix.
        it("row insertion", async () => {
            matrix.insertRows(0, 2);
            matrix.insertCols(0, 1);
            await expect([[undefined], [undefined]]);

            matrix.setCell(0, 0, 0);
            matrix.setCell(1, 0, 1);
            await expect([
                [0],
                [1]
            ]);

            matrix.insertRows(1, 1);
            await expect([
                [0],
                [undefined],
                [1]
            ]);
        });

        describe("contiguous", () => {
            it("read/write 256x256", () => {
                matrix.insertRows(0, 256);
                matrix.insertCols(0, 256);
                fill(matrix, /* row: */ 0, /* col: */ 0, /* numRows: */ 16, /* numCols: */ 16);
                check(matrix, /* row: */ 0, /* col: */ 0, /* numRows: */ 16, /* numCols: */ 16);
            });
        });

        describe("fragmented", () => {
            it("read/write 16x16", () => {
                insertFragmented(matrix, 16, 16);
                fill(matrix, /* row: */ 0, /* col: */ 0, /* numRows: */ 16, /* numCols: */ 16);
                check(matrix, /* row: */ 0, /* col: */ 0, /* numRows: */ 16, /* numCols: */ 16);
            });
        });
    });

    describe("2 clients", () => {
        let matrix1: SharedMatrix;
        let matrix2: SharedMatrix;

        // TODO: Vet IMatrixConsumers w/multiple clients

        const expect = async (expected?: readonly (readonly any[])[]) => {
            await TestHost.sync(host1, host2);

            const actual1 = extract(matrix1);
            const actual2 = extract(matrix2);

            assert.deepEqual(actual1, actual2);

            if (expected !== undefined) {
                assert.deepEqual(actual1, expected);
            }
        };

        beforeEach(async () => {
            matrix1 = await host1.createType(randomId(), SharedMatrixFactory.Type);
            matrix2 = await host2.getType(matrix1.id);
        });

        afterEach(async () => {
            await expect();
        });

        describe("conflict", () => {
            it("setCell", async () => {
                matrix1.insertCols(0, 1);
                matrix1.insertRows(0, 1);
                await expect([
                    [undefined]
                ]);

                matrix1.setCell(0, 0, "1st");
                matrix2.setCell(0, 0, "2nd");

                await expect([
                    ["2nd"],
                ]);
            });

            it("insert col", async () => {
                matrix1.insertRows(0, 1);
                await expect([
                    []
                ]);

                matrix1.insertCols(0, 1);
                matrix1.setCell(0, 0, "1st");

                matrix2.insertCols(0, 1);
                matrix2.setCell(0, 0, "2nd");

                await expect([
                    ["2nd", "1st"],
                ]);
            });

            it("insert row", async () => {
                matrix1.insertCols(0, 1);
                await expect([]);

                matrix1.insertRows(0, 1);
                matrix1.setCell(0, 0, "1st");

                matrix2.insertRows(0, 1);
                matrix2.setCell(0, 0, "2nd");

                await expect([
                    ["2nd"],
                    ["1st"],
                ]);
            });

            it("remove col", async () => {
                matrix1.insertCols(0, 3);
                matrix1.insertRows(0, 1);
                matrix1.setCell(0, 0, "A");
                matrix1.setCell(0, 1, "B");
                matrix1.setCell(0, 2, "C");
                await expect([
                    ["A", "B", "C"],
                ]);

                matrix1.removeCols(1, 1);
                matrix2.removeCols(1, 1);

                await expect([
                    ["A", "C"],
                ]);
            });

            it("remove row", async () => {
                matrix1.insertCols(0, 1);
                matrix1.insertRows(0, 3);
                matrix1.setCell(0, 0, "A");
                matrix1.setCell(1, 0, "B");
                matrix1.setCell(2, 0, "C");
                await expect([
                    ["A"],
                    ["B"],
                    ["C"],
                ]);

                matrix1.removeRows(1, 1);
                matrix2.removeRows(1, 1);

                await expect([
                    ["A"],
                    ["C"],
                ]);
            });

            it("insert col vs. remove row", async () => {
                matrix1.insertCols(0, 2);
                matrix1.insertRows(0, 3);
                matrix1.setCells(/* row: */ 0, /* col: */ 0, /* numCols: */ 2, [
                    "A1", "C1",
                    "A2", "C2",
                    "A3", "C3",
                ]);

                await expect([
                    ["A1", "C1"],
                    ["A2", "C2"],
                    ["A3", "C3"],
                ]);

                matrix1.insertCols(1, 1);
                matrix1.setCells(/* row: */ 0, /* col: */ 1, /* numCols: */ 1, [
                    "B1",
                    "B2",
                    "B3",
                ]);

                matrix2.removeRows(1, 1);

                await expect([
                    ["A1", "B1", "C1"],
                    ["A3", "B3", "C3"],
                ]);
            });

            it("insert row vs. remove col", async () => {
                matrix1.insertRows(0, 2);
                matrix1.insertCols(0, 3);
                matrix1.setCells(/* row: */ 0, /* col: */ 0, /* numCols: */ 3, [
                    "A1", "B1", "C1",
                    "A3", "B3", "C3",
                ]);

                await expect([
                    ["A1", "B1", "C1"],
                    ["A3", "B3", "C3"],
                ]);

                matrix1.insertRows(1, 1);
                matrix1.setCells(/* row: */ 1, /* col: */ 0, /* numCols: */ 3, [
                    "A2", "B2", "C2",
                ]);

                matrix2.removeCols(1, 1);

                await expect([
                    ["A1", "C1"],
                    ["A2", "C2"],
                    ["A3", "C3"],
                ]);
            });

            it("insert row vs. remove col", async () => {
                matrix1.insertRows(0, 2);
                matrix1.insertCols(0, 3);
                matrix1.setCells(/* row: */ 0, /* col: */ 0, /* numCols: */ 3, [
                    "A1", "B1", "C1",
                    "A3", "B3", "C3",
                ]);

                await expect([
                    ["A1", "B1", "C1"],
                    ["A3", "B3", "C3"],
                ]);

                matrix1.insertRows(1, 1);
                matrix1.setCells(/* row: */ 1, /* col: */ 0, /* numCols: */ 3, [
                    "A2", "B2", "C2",
                ]);

                matrix2.removeCols(1, 1);

                await expect([
                    ["A1", "C1"],
                    ["A2", "C2"],
                    ["A3", "C3"],
                ]);
            });

            // Vets that the row/col of local set operations are correctly adjusted.
            it("insert col vs. insert & remove row", async () => {
                matrix1.insertRows(0, 2);
                matrix1.insertCols(0, 2);
                matrix1.setCells(/* row: */ 0, /* col: */ 0, /* numCols: */ 2, [
                    "A1", "C1",
                    "A2", "C2",
                ]);

                matrix1.removeRows(1, 1);
                matrix1.insertCols(1, 1);

                await expect([
                    ["A1", undefined, "C1"],
                ]);
            });

            // Vets that the row/col of remote set operations are correctly adjusted.
            it("insert row & col vs. insert row and set", async () => {
                matrix1.insertRows(0,4);
                matrix1.insertCols(0,4);

                const v = new Array(16).fill(0).map((_, index) => index);

                matrix1.setCells(0, 0, 4, v);
                await expect();

                matrix1.insertRows(0,1);
                matrix2.insertRows(0,2);
                matrix2.setCells(/* row: */ 0, /* col: */ 0, /* numCols: */ 4, ["A","B","C","D"]);
                matrix1.insertCols(1,1);

                await expect();
            });
        });
    });
});
