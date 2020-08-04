/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import "mocha";

import { strict as assert } from "assert";
import { Serializable, IChannelServices } from "@fluidframework/component-runtime-definitions";
import {
    MockFluidDataStoreRuntime,
    MockContainerRuntimeFactory,
    MockContainerRuntimeFactoryForReconnection,
    MockContainerRuntimeForReconnection,
    MockEmptyDeltaConnection,
    MockStorage,
} from "@fluidframework/test-runtime-utils";
import { SharedMatrix, SharedMatrixFactory } from "../src";
import { fill, check, insertFragmented, extract, expectSize, checkValue } from "./utils";
import { TestConsumer } from "./testconsumer";

describe("Matrix", () => {
    describe("local client", () => {
        let componentRuntime: MockFluidDataStoreRuntime;
        let matrix: SharedMatrix<number>;
        let consumer: TestConsumer<undefined | null | number>;     // Test IMatrixConsumer that builds a copy of `matrix` via observed events.

        // Snapshots the given `SharedMatrix`, loads the snapshot into a 2nd SharedMatrix, vets that the two are
        // equivalent, and then returns the 2nd matrix.
        async function snapshot<T extends Serializable>(matrix: SharedMatrix<T>) {
            // Create a snapshot
            const objectStorage = new MockStorage(matrix.snapshot());

            // Create a local ComponentRuntime since we only want to load the snapshot for a local client.
            const componentRuntime = new MockFluidDataStoreRuntime();
            componentRuntime.local = true;

            // Load the snapshot into a newly created 2nd SharedMatrix.
            const matrix2 = new SharedMatrix<T>(componentRuntime, `load(${matrix.id})`, SharedMatrixFactory.Attributes);
            await matrix2.load(/*branchId: */ null as any, {
                deltaConnection: new MockEmptyDeltaConnection(),
                objectStorage
            });

            // Vet that the 2nd matrix is equivalent to the original.
            expectSize(matrix2, matrix.rowCount, matrix.colCount);
            assert.deepEqual(extract(matrix), extract(matrix2), 'Matrix must round-trip through snapshot/load.');

            return matrix2;
        }

        async function expect<T extends Serializable>(expected: ReadonlyArray<ReadonlyArray<T>>) {
            const actual = extract(matrix);
            assert.deepEqual(actual, expected, "Matrix must match expected.");
            assert.deepEqual(consumer.extract(), actual, "Matrix must notify IMatrixConsumers of all changes.");

            // Ensure ops are ACKed prior to snapshot. Otherwise, unACKed segments won't be included.
            return snapshot(matrix);
        }

        beforeEach(async () => {
            componentRuntime = new MockFluidDataStoreRuntime();
            matrix = new SharedMatrix(componentRuntime, "matrix1", SharedMatrixFactory.Attributes);

            // Attach a new IMatrixConsumer
            consumer = new TestConsumer(matrix);
        });

        afterEach(async () => {
            // Paranoid check that ensures that the SharedMatrix loaded from the snapshot also
            // round-trips through snapshot/load.  (Also, may help detect snapshot/loaded bugs
            // in the event that the test case forgets to call/await `expect()`.)
            await snapshot(await snapshot(matrix));

            // Ensure that IMatrixConsumer observed all changes to matrix.
            assert.deepEqual(consumer.extract(), extract(matrix));

            // Sanity check that removing the consumer stops change notifications.
            matrix.closeMatrix(consumer);
            matrix.insertCols(0, 1);
            assert.equal(consumer.colCount, matrix.colCount - 1);
        });

        // Vet our three variants of an empty matrix (no rows, no cols, and both no rows and no cols).
        describe("empty matrices", () => {
            // Note: We check the num rows/cols explicitly in these tests to differentiate between
            //       matrices that are 0 length in one or both dimensions.
            it("0x0", async () => {
                expectSize(matrix, /* rowCount: */ 0, /* colCount: */ 0);
                expectSize(await expect([]), /* rowCount: */ 0, /* colCount: */ 0);
            });

            it("0x1", async () => {
                matrix.insertCols(/* start: */ 0, /* count: */ 1);
                expectSize(matrix, /* rowCount: */ 0, /* colCount: */ 1);
                expectSize(await expect([]), /* rowCount: */ 0, /* colCount: */ 1);
            });

            it("1x0", async () => {
                matrix.insertRows(/* start: */ 0, /* count: */ 1);
                expectSize(matrix, /* rowCount: */ 1, /* colCount: */ 0);
                expectSize(await expect([[]]), /* rowCount: */ 1, /* colCount: */ 0);
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
            matrix.setCells(/* row: */ 1, /* col: */ 1, /* colCount: */ 2, [
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

        // Vet that we can set and read back the cell in a 1x1 matrix.
        it("out-of-bounds read must throw", async () => {
            // Reading cell (0,0) of an empty matrix must throw.
            assert.throws(() => { matrix.getCell(0, 0); });

            matrix.insertRows(0, 1);
            matrix.insertCols(0, 2);

            // Reading negative indices must throw.
            assert.throws(() => { matrix.getCell(-1, 0); });
            assert.throws(() => { matrix.getCell(0, -1); });

            // Reading past end of matrix must throw.
            assert.throws(() => { matrix.getCell(1, 0);  });
            assert.throws(() => { matrix.getCell(0, 2); });
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

        // Vets that the matrix correctly handles noncontiguous handles when allocating a range
        // of more than one handle.
        it("remove 1 row, insert 2 rows", async () => {
            matrix.insertRows(0,4);
            matrix.insertCols(0,1);
            matrix.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, [0,1,2,3]);
            matrix.removeRows(2,1);
            matrix.insertRows(0,2);
            matrix.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, [84,45]);
            await expect([
                [84],
                [45],
                [0],
                [1],
                [3],
            ]);
        });

        describe("contiguous", () => {
            it("read/write 256x256", () => {
                matrix.insertRows(0, 256);
                matrix.insertCols(0, 256);
                fill(matrix, /* row: */ 0, /* col: */ 0, /* rowCount: */ 16, /* colCount: */ 16);
                check(matrix, /* row: */ 0, /* col: */ 0, /* rowCount: */ 16, /* colCount: */ 16);
            });

            it("forEach 16x16", () => {
                matrix.insertRows(0, 16);
                matrix.insertCols(0, 16);
                fill(matrix, /* row: */ 0, /* col: */ 0, /* rowCount: */ 16, /* colCount: */ 16);
                matrix.forEachCell((v, row, col) => {
                    checkValue(matrix, v, row, col, /* row: */ 0, /* rowCount: */ 16);
                })
            });

            it("forEachCell 16x16 empty with blanks skipped", () => {
                matrix.insertRows(0, 16);
                matrix.insertCols(0, 16);
                matrix.forEachCell(() => {
                    assert.fail();
                });
            });

            it("forEachCell 16x16 empty with blanks", () => {
                matrix.insertRows(0, 16);
                matrix.insertCols(0, 16);
                let count = 0;
                matrix.forEachCell((v) => {
                    assert.equal(v, undefined);
                    count++;
                }, { includeEmpty: true });
                assert.equal(count, 16 * 16);
            });

            it("forEachCell 16x16 empty with 1 cell", () => {
                matrix.insertRows(0, 16);
                matrix.insertCols(0, 16);
                matrix.setCell(0, 0, -42);
                let count = 0;
                matrix.forEachCell((v) => {
                    assert.equal(v, -42);
                    count++;
                });
                assert.equal(count, 1);
            });

            it("forEachCell 16x16 empty with 1 cell and blanks", () => {
                matrix.insertRows(0, 16);
                matrix.insertCols(0, 16);
                matrix.setCell(0, 0, -42);
                let count = 0;
                matrix.forEachCell((v, r, c) => {
                    assert.equal(v, r === 0 && c === 0 ? -42 : undefined);
                    count++;
                }, { includeEmpty: true });
                assert.equal(count, 16 * 16);
            });
        });

        describe("fragmented", () => {
            it("read/write 16x16", () => {
                insertFragmented(matrix, 16, 16);
                fill(matrix, /* row: */ 0, /* col: */ 0, /* rowCount: */ 16, /* colCount: */ 16);
                check(matrix, /* row: */ 0, /* col: */ 0, /* rowCount: */ 16, /* colCount: */ 16);
            });
        });

        describe("annotations", () => {
            it("read/write 16x16", () => {
                matrix.insertRows(0, 256);
                matrix.insertCols(0, 256);
                matrix.setAnnotation(0, 0, -42);
                assert.equal(matrix.getAnnotation(0, 0), -42);
                matrix.setCell(0, 0, 1);
                // Setting a cell should clear existing annotation.
                assert.equal(matrix.getAnnotation(0, 0), undefined);
            });
        });

        describe("snapshot", () => {
            it("mutate after load", async () => {
                matrix.insertCols(0, 2);
                matrix.insertRows(0, 2);
                matrix.setCells(0, 0, 2, [
                    0, 1,
                    2, 3,
                ]);

                // The 'matrix' returned by 'expect' is the result of snapshotting and loading 'matrix'.
                const matrix2 = await expect([
                    [0, 1],
                    [2, 3],
                ]);

                matrix2.insertRows(1, 1);
                assert.deepEqual(extract(matrix2), [
                    [0, 1],
                    [undefined, undefined],
                    [2, 3],
                ]);

                matrix2.setCells(1, 0, 2, [10, 11]);
                assert.deepEqual(extract(matrix2), [
                    [0, 1],
                    [10, 11],
                    [2, 3],
                ]);

                matrix2.insertCols(1, 1);
                assert.deepEqual(extract(matrix2), [
                    [0, undefined, 1],
                    [10, undefined, 11],
                    [2, undefined, 3],
                ]);
            });
        })
    });

    describe("Connected with two clients", () => {
        let matrix1: SharedMatrix;
        let matrix2: SharedMatrix;
        let consumer1: TestConsumer;     // Test IMatrixConsumer that builds a copy of `matrix` via observed events.
        let consumer2: TestConsumer;     // Test IMatrixConsumer that builds a copy of `matrix` via observed events.
        let containterRuntimeFactory: MockContainerRuntimeFactory;

        const expect = async (expected?: readonly (readonly any[])[]) => {
            containterRuntimeFactory.processAllMessages();

            const actual1 = extract(matrix1);
            const actual2 = extract(matrix2);

            assert.deepEqual(actual1, actual2);

            if (expected !== undefined) {
                assert.deepEqual(actual1, expected);
            }

            for (const consumer of [consumer1, consumer2]) {
                assert.deepEqual(consumer.extract(), actual1, "Matrix must notify IMatrixConsumers of all changes.");
            }
        };

        beforeEach(async () => {
            containterRuntimeFactory = new MockContainerRuntimeFactory();

            // Create and connect the first SharedMatrix.
            const componentRuntime1 = new MockFluidDataStoreRuntime();
            const containerRuntime1 = containterRuntimeFactory.createContainerRuntime(componentRuntime1);
            const services1: IChannelServices = {
                deltaConnection: containerRuntime1.createDeltaConnection(),
                objectStorage: new MockStorage(),
            };
            matrix1 = new SharedMatrix(componentRuntime1, "matrix1", SharedMatrixFactory.Attributes);
            matrix1.connect(services1);
            consumer1 = new TestConsumer(matrix1);

            // Create and connect the second SharedMatrix.
            const componentRuntime2 = new MockFluidDataStoreRuntime();
            const containerRuntime2 = containterRuntimeFactory.createContainerRuntime(componentRuntime2);
            const services2: IChannelServices = {
                deltaConnection: containerRuntime2.createDeltaConnection(),
                objectStorage: new MockStorage(),
            };
            matrix2 = new SharedMatrix(componentRuntime2, "matrix2", SharedMatrixFactory.Attributes);
            matrix2.connect(services2);
            consumer2 = new TestConsumer(matrix2);
        });

        afterEach(async () => {
            await expect();

            matrix1.closeMatrix(consumer1);
            matrix2.closeMatrix(consumer2);
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

            // Vets that clearing a cell at an unallocated row/col will locally discard
            // the an earlier remote write.
            it("clear unallocated cell", async () => {
                matrix1.insertCols(0, 1);
                matrix1.insertRows(0, 1);
                await expect([
                    [undefined]
                ]);

                matrix1.setCell(0, 0, "x");
                matrix2.setCell(0, 0, undefined);

                await expect([
                    [undefined],
                ]);
            });

            it("insert and set in new row", async () => {
                matrix1.insertCols(0,2);
                await expect();
                matrix1.insertRows(0,1);
                matrix1.setCells(/* row: */ 0, /* col: */ 1, /* colCount: */ 1, ["x"]);
                await expect([[undefined, "x"]]);
            });

            it("insert and set in new col", async () => {
                matrix1.insertRows(0,2);
                await expect([
                    [],
                    [],
                ]);
                matrix1.insertCols(0,1);
                matrix1.setCells(/* row: */ 1, /* col: */ 0, /* colCount: */ 1, ["x"]);
                await expect([
                    [undefined],
                    ["x"]
                ]);
            });

            it("insert col conflict", async () => {
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

            it("insert row conflict", async () => {
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

            it("overlapping remove col", async () => {
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

            it("overlapping remove row", async () => {
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
                matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 2, [
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
                matrix1.setCells(/* row: */ 0, /* col: */ 1, /* colCount: */ 1, [
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
                matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 3, [
                    "A1", "B1", "C1",
                    "A3", "B3", "C3",
                ]);

                await expect([
                    ["A1", "B1", "C1"],
                    ["A3", "B3", "C3"],
                ]);

                matrix1.insertRows(1, 1);
                matrix1.setCells(/* row: */ 1, /* col: */ 0, /* colCount: */ 3, [
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
                matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 3, [
                    "A1", "B1", "C1",
                    "A3", "B3", "C3",
                ]);

                await expect([
                    ["A1", "B1", "C1"],
                    ["A3", "B3", "C3"],
                ]);

                matrix1.insertRows(1, 1);
                matrix1.setCells(/* row: */ 1, /* col: */ 0, /* colCount: */ 3, [
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
                matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 2, [
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
                matrix2.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 4, ["A","B","C","D"]);
                matrix1.insertCols(1,1);

                await expect();
            });

            // Vets that writes to delete handles are ignored.
            it("remove rows vs. set cells", async () => {
                matrix1.insertRows(0,3);
                matrix1.insertCols(0,2);
                matrix1.setCells(0, 0, 2, [0, 1, 2, 3]);

                // In order to hit the recycled handle case, ensure that the 'setCells()' below intersects
                // an empty row, which will cause the next available handle to be allocated.
                matrix2.insertRows(0,1);
                await expect();

                matrix1.removeRows(1,1);
                matrix2.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["A", "B", "C"]);
                await expect();
            });

            // This case is interesting because the removal of [0..1] is split on client2 to straddle the
            // inserted "B".
            it("overlapping insert/set vs. remove/insert/set", async () => {
                matrix1.insertRows(0,1);    // rowCount: 0, colCount: 0
                matrix1.insertCols(0,4);    // rowCount: 1, colCount: 0
                matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 4, [0,1,2,3]);
                await expect([
                    [0, 1, 2, 3]
                ]);
                matrix2.insertCols(1,1);    // rowCount: 1, colCount: 5
                matrix2.setCells(/* row: */ 0, /* col: */ 1, /* colCount: */ 1, ["A"]);
                matrix1.removeCols(0,2);    // rowCount: 1, colCount: 2
                matrix1.insertCols(0,1);    // rowCount: 1, colCount: 3
                matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["B"]);
                await expect([
                    ["B", "A", 2, 3]
                ]);
            });
        });
    });

    describe("SharedMatrix reconnection", () => {
        let matrix1: SharedMatrix;
        let matrix2: SharedMatrix;
        let consumer1: TestConsumer;     // Test IMatrixConsumer that builds a copy of `matrix` via observed events.
        let consumer2: TestConsumer;     // Test IMatrixConsumer that builds a copy of `matrix` via observed events.
        let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
        let containerRuntime1: MockContainerRuntimeForReconnection;
        let containerRuntime2: MockContainerRuntimeForReconnection;

        const expect = async (expected?: readonly (readonly any[])[]) => {
            containerRuntimeFactory.processAllMessages();

            const actual1 = extract(matrix1);
            const actual2 = extract(matrix2);

            assert.deepEqual(actual1, actual2);

            if (expected !== undefined) {
                assert.deepEqual(actual1, expected);
            }

            for (const consumer of [consumer1, consumer2]) {
                assert.deepEqual(consumer.extract(), actual1, "Matrix must notify IMatrixConsumers of all changes.");
            }
        };

        beforeEach(async () => {
            containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();

            // Create and connect the first SharedMatrix.
            const componentRuntime1 = new MockFluidDataStoreRuntime();
            containerRuntime1 = containerRuntimeFactory.createContainerRuntime(componentRuntime1);
            const services1: IChannelServices = {
                deltaConnection: containerRuntime1.createDeltaConnection(),
                objectStorage: new MockStorage(),
            };
            matrix1 = new SharedMatrix(componentRuntime1, "matrix1", SharedMatrixFactory.Attributes);
            matrix1.connect(services1);
            consumer1 = new TestConsumer(matrix1);

            // Create and connect the second SharedMatrix.
            const componentRuntime2 = new MockFluidDataStoreRuntime();
            containerRuntime2 = containerRuntimeFactory.createContainerRuntime(componentRuntime2);
            const services2: IChannelServices = {
                deltaConnection: containerRuntime2.createDeltaConnection(),
                objectStorage: new MockStorage(),
            };
            matrix2 = new SharedMatrix(componentRuntime2, "matrix2", SharedMatrixFactory.Attributes);
            matrix2.connect(services2);
            consumer2 = new TestConsumer(matrix2);
        });

        afterEach(async () => {
            await expect();

            matrix1.closeMatrix(consumer1);
            matrix2.closeMatrix(consumer2);
        });

        it("can resend unacked ops on reconnection", async () => {
            // Insert a row and a column in the first shared matrix.
            matrix1.insertCols(0, 1);
            matrix1.insertRows(0, 1);

            // Disconnect and reconnect the first client.
            containerRuntime1.connected = false;
            containerRuntime1.connected = true;

            // Verify that both the matrices have expected content.
            await expect([
                [undefined]
            ]);

            // Set a cell in the second shared matrix.
            matrix2.setCell(0, 0, "2nd");

            // Disconnect and reconnect the second client.
            containerRuntime2.connected = false;
            containerRuntime2.connected = true;

            // Verify that both the matrices have expected content.
            await expect([
                ["2nd"],
            ]);
        });

        it("can store ops in disconnected state and resend them on reconnection", async () => {
            // Disconnect the first client.
            containerRuntime1.connected = false;

            // Insert a row and a column in the first shared matrix.
            matrix1.insertCols(0, 1);
            matrix1.insertRows(0, 1);

            // Reconnect the first client.
            containerRuntime1.connected = true;

            // Verify that both the matrices have expected content.
            await expect([
                [undefined]
            ]);

            // Disconnect the second client.
            containerRuntime2.connected = false;

            // Set a cell in the second shared matrix.
            matrix2.setCell(0, 0, "2nd");

            // Reconnect the second client.
            containerRuntime2.connected = true;

            // Verify that both the matrices have expected content.
            await expect([
                ["2nd"],
            ]);
        });

        it("resubmission omits writes to recycled row/col handles", async () => {
            matrix1.insertRows(0,2);
            matrix1.insertCols(0,2);
            matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 2, [
                0, 1,
                2, 3
            ]);
            matrix1.removeRows(1,1);

            containerRuntime1.connected = false;

            matrix1.insertRows(0,1);
            matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 2, [
                28, 49
            ]);

            containerRuntime1.connected = true;

            await expect([
                [28, 49],
                [ 0,  1]
            ]);
        });

        it("omits not-yet-locally deleted row/cols during resubmission", async () => {
            matrix1.insertRows(/* rowStart: */ 0, /* rowCount: */ 2);
            matrix1.insertCols(/* colStart: */ 0, /* colCount: */ 4);
            matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 4, [
                0, 1, 2, 3,
                4, 5, 6, 7
            ]);

            matrix1.insertRows(/* rowStart: */ 0, /* rowCount: */ 1);    // rowCount: 3, colCount: 4
            matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 4, [
                61, 57, 7, 62
            ]);

            containerRuntime1.connected = false;
            containerRuntime1.connected = true;
            await expect([
                [61, 57,  7, 62],
                [ 0,  1,  2,  3],
                [ 4,  5,  6,  7],
            ]);

            matrix1.setCells(/* row: */ 2, /* col: */ 3, /* colCount: */ 1, [65]);    // rowCount: 3 colCount: 4 stride: 4 length: 1
            containerRuntime1.connected = false;

            matrix1.removeRows(/* rowStart: */ 0, /* rowCount: */ 1);    // rowCount: 2, colCount: 4
            containerRuntime1.connected = true;

            await expect([
                [ 0,  1,  2,  3],
                [ 4,  5,  6, 65],
            ]);
        });
    });
});
