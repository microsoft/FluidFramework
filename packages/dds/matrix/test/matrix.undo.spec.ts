/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import "mocha";

import { strict as assert } from "assert";
import { Serializable } from "@fluidframework/datastore-definitions";
import {
    MockFluidDataStoreRuntime,
    MockEmptyDeltaConnection,
    MockStorage,
    MockContainerRuntimeFactory,
} from "@fluidframework/test-runtime-utils";
import { SharedMatrix, SharedMatrixFactory } from "../src";
import { extract, expectSize } from "./utils";
import { TestConsumer } from "./testconsumer";
import { UndoRedoStackManager } from "./undoRedoStackManager";

describe("Matrix", () => {
    describe("undo/redo", () => {
        let dataStoreRuntime: MockFluidDataStoreRuntime;
        let matrix1: SharedMatrix<number>;
        let consumer1: TestConsumer<undefined | null | number>;     // Test IMatrixConsumer that builds a copy of `matrix` via observed events.
        let undo1: UndoRedoStackManager;
        let expect: <T extends Serializable>(expected: ReadonlyArray<ReadonlyArray<T>>) => Promise<void>;

        function singleClientTests() {
            it("undo/redo setCell", async () => {
                matrix1.insertRows(/* start: */ 0, /* count: */ 1);
                matrix1.insertCols(/* start: */ 0, /* count: */ 1);
                await expect([[undefined]]);

                undo1.closeCurrentOperation();

                matrix1.setCell(/* row: */ 0, /* col: */ 0, 1);
                await expect([[1]]);

                undo1.undoOperation();
                await expect([[undefined]]);

                undo1.redoOperation();
                await expect([[1]]);
            });

            it("undo/redo insertRow", async () => {
                matrix1.insertRows(/* start: */ 0, /* count: */ 1);
                undo1.closeCurrentOperation();

                expectSize(matrix1, /* rowCount */ 1, /* colCount: */ 0);

                undo1.undoOperation();
                expectSize(matrix1, /* rowCount */ 0, /* colCount: */ 0);

                undo1.redoOperation();
                expectSize(matrix1, /* rowCount */ 1, /* colCount: */ 0);
            });

            it("undo/redo removeRow", async () => {
                matrix1.insertRows(/* start: */ 0, /* count: */ 1);
                matrix1.insertCols(/* start: */ 0, /* count: */ 1);
                await expect([[undefined]]);

                matrix1.setCell(/* row: */ 0, /* col: */ 0, 1);
                await expect([[1]]);
                undo1.closeCurrentOperation();

                matrix1.removeRows(/* rowStart: */ 0, /* rowCount: */ 1);
                undo1.closeCurrentOperation();

                expectSize(matrix1, /* rowCount */ 0, /* colCount: */ 1);

                undo1.undoOperation();
                await expect([[1]]);

                undo1.redoOperation();
                expectSize(matrix1, /* rowCount */ 0, /* colCount: */ 1);
            });

            it("undo/redo removeRow 0 of 2x2", async () => {
                matrix1.insertRows(/* start: */ 0, /* count: */ 2);
                matrix1.insertCols(/* start: */ 0, /* count: */ 2);
                matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 2, [
                    0, 1,
                    2, 3,
                ]);
                undo1.closeCurrentOperation();
                await expect([
                    [0, 1],
                    [2, 3],
                ]);

                matrix1.removeRows(/* rowStart: */ 0, /* rowCount: */ 1);
                undo1.closeCurrentOperation();
                await expect([
                    [2, 3]
                ]);

                undo1.undoOperation();
                await expect([
                    [0, 1],
                    [2, 3],
                ]);

                undo1.redoOperation();
                await expect([
                    [2, 3]
                ]);
            });

            it("undo/redo removeRow 1 of 2x2", async () => {
                matrix1.insertRows(/* start: */ 0, /* count: */ 2);
                matrix1.insertCols(/* start: */ 0, /* count: */ 2);
                matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 2, [
                    0, 1,
                    2, 3,
                ]);
                undo1.closeCurrentOperation();
                await expect([
                    [0, 1],
                    [2, 3],
                ]);

                matrix1.removeRows(/* rowStart: */ 1, /* rowCount: */ 1);
                undo1.closeCurrentOperation();
                await expect([
                    [0, 1]
                ]);

                undo1.undoOperation();
                await expect([
                    [0, 1],
                    [2, 3],
                ]);

                undo1.redoOperation();
                await expect([
                    [0, 1]
                ]);
            });

            it("undo/redo removeRow 0..1 of 3x3", async () => {
                matrix1.insertRows(/* start: */ 0, /* count: */ 3);
                matrix1.insertCols(/* start: */ 0, /* count: */ 3);
                matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 3, [
                    0, 1, 2,
                    3, 4, 5,
                    6, 7, 8,
                ]);
                undo1.closeCurrentOperation();
                await expect([
                    [0, 1, 2],
                    [3, 4, 5],
                    [6, 7, 8],
                ]);

                matrix1.removeRows(/* rowStart: */ 0, /* rowCount: */ 2);
                undo1.closeCurrentOperation();
                await expect([
                    [6, 7, 8],
                ]);

                undo1.undoOperation();
                await expect([
                    [0, 1, 2],
                    [3, 4, 5],
                    [6, 7, 8],
                ]);

                undo1.redoOperation();
                await expect([
                    [6, 7, 8],
                ]);
            });

            it("undo/redo removeRow 2..3 of 3x3", async () => {
                matrix1.insertRows(/* start: */ 0, /* count: */ 3);
                matrix1.insertCols(/* start: */ 0, /* count: */ 3);
                matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 3, [
                    0, 1, 2,
                    3, 4, 5,
                    6, 7, 8,
                ]);
                undo1.closeCurrentOperation();
                await expect([
                    [0, 1, 2],
                    [3, 4, 5],
                    [6, 7, 8],
                ]);

                matrix1.removeRows(/* rowStart: */ 1, /* rowCount: */ 2);
                undo1.closeCurrentOperation();
                await expect([
                    [0, 1, 2],
                ]);

                undo1.undoOperation();
                await expect([
                    [0, 1, 2],
                    [3, 4, 5],
                    [6, 7, 8],
                ]);

                undo1.redoOperation();
                await expect([
                    [0, 1, 2],
                ]);
            });

            it("undo/redo insertCol", async () => {
                matrix1.insertCols(/* start: */ 0, /* count: */ 1);
                undo1.closeCurrentOperation();

                expectSize(matrix1, /* rowCount */ 0, /* colCount: */ 1);

                undo1.undoOperation();
                expectSize(matrix1, /* rowCount */ 0, /* colCount: */ 0);

                undo1.redoOperation();
                expectSize(matrix1, /* rowCount */ 0, /* colCount: */ 1);
            });

            it("undo/redo removeCol", async () => {
                matrix1.insertRows(/* start: */ 0, /* count: */ 1);
                matrix1.insertCols(/* start: */ 0, /* count: */ 1);
                await expect([[undefined]]);

                matrix1.setCell(/* row: */ 0, /* col: */ 0, 1);
                await expect([[1]]);
                undo1.closeCurrentOperation();

                matrix1.removeCols(/* colStart: */ 0, /* colCount: */ 1);
                undo1.closeCurrentOperation();

                expectSize(matrix1, /* rowCount */ 1, /* colCount: */ 0);

                undo1.undoOperation();
                await expect([[1]]);

                undo1.redoOperation();
                expectSize(matrix1, /* rowCount */ 1, /* colCount: */ 0);
            });

            it("undo/redo removeCol 0 of 2x2", async () => {
                matrix1.insertRows(/* start: */ 0, /* count: */ 2);
                matrix1.insertCols(/* start: */ 0, /* count: */ 2);
                matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 2, [
                    0, 1,
                    2, 3,
                ]);
                await expect([
                    [0, 1],
                    [2, 3],
                ]);
                undo1.closeCurrentOperation();

                matrix1.removeCols(/* colStart: */ 0, /* colCount: */ 1);
                undo1.closeCurrentOperation();
                await expect([
                    [1],
                    [3],
                ]);

                undo1.undoOperation();
                await expect([
                    [0, 1],
                    [2, 3],
                ]);

                undo1.redoOperation();
                await expect([
                    [1],
                    [3],
                ]);
            });

            it("undo/redo removeCol 1 of 2x2", async () => {
                matrix1.insertRows(/* start: */ 0, /* count: */ 2);
                matrix1.insertCols(/* start: */ 0, /* count: */ 2);
                matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 2, [
                    0, 1,
                    2, 3,
                ]);
                await expect([
                    [0, 1],
                    [2, 3],
                ]);
                undo1.closeCurrentOperation();

                matrix1.removeCols(/* colStart: */ 1, /* colCount: */ 1);
                undo1.closeCurrentOperation();
                await expect([
                    [0],
                    [2],
                ]);

                undo1.undoOperation();
                await expect([
                    [0, 1],
                    [2, 3],
                ]);

                undo1.redoOperation();
                await expect([
                    [0],
                    [2],
                ]);
            });

            it("undo/redo removeCol 0..1 of 3x3", async () => {
                matrix1.insertRows(/* start: */ 0, /* count: */ 3);
                matrix1.insertCols(/* start: */ 0, /* count: */ 3);
                matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 3, [
                    0, 1, 2,
                    3, 4, 5,
                    6, 7, 8,
                ]);
                undo1.closeCurrentOperation();
                await expect([
                    [0, 1, 2],
                    [3, 4, 5],
                    [6, 7, 8],
                ]);

                matrix1.removeCols(/* colStart: */ 0, /* colCount: */ 2);
                undo1.closeCurrentOperation();
                await expect([
                    [2],
                    [5],
                    [8],
                ]);

                undo1.undoOperation();
                await expect([
                    [0, 1, 2],
                    [3, 4, 5],
                    [6, 7, 8],
                ]);

                undo1.redoOperation();
                await expect([
                    [2],
                    [5],
                    [8],
                ]);
            });

            it("undo/redo removeCol 1..2 of 3x3", async () => {
                matrix1.insertRows(/* start: */ 0, /* count: */ 3);
                matrix1.insertCols(/* start: */ 0, /* count: */ 3);
                matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 3, [
                    0, 1, 2,
                    3, 4, 5,
                    6, 7, 8,
                ]);
                undo1.closeCurrentOperation();
                await expect([
                    [0, 1, 2],
                    [3, 4, 5],
                    [6, 7, 8],
                ]);

                matrix1.removeCols(/* colStart: */ 1, /* colCount: */ 2);
                undo1.closeCurrentOperation();
                await expect([
                    [0],
                    [3],
                    [6],
                ]);

                undo1.undoOperation();
                await expect([
                    [0, 1, 2],
                    [3, 4, 5],
                    [6, 7, 8],
                ]);

                undo1.redoOperation();
                await expect([
                    [0],
                    [3],
                    [6],
                ]);
            });
        }

        describe("local client", () => {
            // Snapshots the given `SharedMatrix`, loads the snapshot into a 2nd SharedMatrix, vets that the two are
            // equivalent, and then returns the 2nd matrix.
            async function snapshot<T extends Serializable>(matrix: SharedMatrix<T>) {
                // Create a snapshot
                const objectStorage = new MockStorage(matrix.snapshot());

                // Create a local DataStoreRuntime since we only want to load the snapshot for a local client.
                const dataStoreRuntime = new MockFluidDataStoreRuntime();
                dataStoreRuntime.local = true;

                // Load the snapshot into a newly created 2nd SharedMatrix.
                const matrix2 = new SharedMatrix<T>(dataStoreRuntime, `load(${matrix.id})`, SharedMatrixFactory.Attributes);
                await matrix2.load(/*branchId: */ null as any, {
                    deltaConnection: new MockEmptyDeltaConnection(),
                    objectStorage
                });

                // Vet that the 2nd matrix is equivalent to the original.
                //
                // BUG: In the case of a disconnected client, the MergeTree snapshot is missing segments
                //      inserted via 'insertAtReferencePositionLocal()'.
                //
                //      (See https://github.com/microsoft/FluidFramework/issues/3950)
                //
                // expectSize(matrix2, matrix.rowCount, matrix.colCount);
                // assert.deepEqual(extract(matrix), extract(matrix2), 'Matrix must round-trip through snapshot/load.');

                return matrix2;
            }

            before(() => {
                expect = async <T extends Serializable>(expected: ReadonlyArray<ReadonlyArray<T>>) => {
                    const actual = extract(matrix1);
                    assert.deepEqual(actual, expected, "Matrix must match expected.");
                    assert.deepEqual(extract(consumer1), actual, "Matrix must notify IMatrixConsumers of all changes.");
                }
            })

            beforeEach(async () => {
                dataStoreRuntime = new MockFluidDataStoreRuntime();
                matrix1 = new SharedMatrix(dataStoreRuntime, "matrix1", SharedMatrixFactory.Attributes);

                // Attach a new IMatrixConsumer
                consumer1 = new TestConsumer(matrix1);

                undo1 = new UndoRedoStackManager();
                matrix1.openUndo(undo1);
            });

            afterEach(async () => {
                // Paranoid check that ensures that the SharedMatrix loaded from the snapshot also
                // round-trips through snapshot/load.  (Also, may help detect snapshot/loaded bugs
                // in the event that the test case forgets to call/await `expect()`.)
                await snapshot(await snapshot(matrix1));

                // Ensure that IMatrixConsumer observed all changes to matrix.
                assert.deepEqual(extract(consumer1), extract(matrix1), "Matrix must notify IMatrixConsumers of all changes.");

                // Sanity check that removing the consumer stops change notifications.
                matrix1.closeMatrix(consumer1);
                matrix1.insertCols(0, 1);
                assert.equal(consumer1.colCount, matrix1.colCount - 1);
            });

            singleClientTests();
        });

        describe("Connected with two clients", () => {
            let matrix2: SharedMatrix;
            let undo2: UndoRedoStackManager;
            let consumer2: TestConsumer;     // Test IMatrixConsumer that builds a copy of `matrix` via observed events.
            let containerRuntimeFactory: MockContainerRuntimeFactory;

            before(() => {
                expect = async (expected?: readonly (readonly any[])[]) => {
                    containerRuntimeFactory.processAllMessages();

                    const actual1 = extract(matrix1);
                    const actual2 = extract(matrix2);

                    assert.deepEqual(actual1, actual2);

                    if (expected !== undefined) {
                        assert.deepEqual(actual1, expected);
                    }

                    for (const consumer of [consumer1, consumer2]) {
                        assert.deepEqual(extract(consumer), actual1, "Matrix must notify IMatrixConsumers of all changes.");
                    }
                };
            });

            beforeEach(async () => {
                containerRuntimeFactory = new MockContainerRuntimeFactory();

                // Create and connect the first SharedMatrix.
                const dataStoreRuntime1 = new MockFluidDataStoreRuntime();
                matrix1 = new SharedMatrix(dataStoreRuntime1, "matrix1", SharedMatrixFactory.Attributes);
                matrix1.connect({
                    deltaConnection: containerRuntimeFactory
                        .createContainerRuntime(dataStoreRuntime1)
                        .createDeltaConnection(),
                    objectStorage: new MockStorage(),
                });
                consumer1 = new TestConsumer(matrix1);
                undo1 = new UndoRedoStackManager();
                matrix1.openUndo(undo1);

                // Create and connect the second SharedMatrix.
                const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
                matrix2 = new SharedMatrix(dataStoreRuntime2, "matrix2", SharedMatrixFactory.Attributes);
                matrix2.connect({
                    deltaConnection: containerRuntimeFactory
                        .createContainerRuntime(dataStoreRuntime2)
                        .createDeltaConnection(),
                    objectStorage: new MockStorage(),
                });
                consumer2 = new TestConsumer(matrix2);
                undo2 = new UndoRedoStackManager();
                matrix2.openUndo(undo2);
            });

            afterEach(async () => {
                // Paranoid check that the matrices are have converged on the same state.
                await expect(undefined as any);

                matrix1.closeMatrix(consumer1);
                matrix2.closeMatrix(consumer2);
            });

            singleClientTests();

            it("reorder row insertion via undo/redo", async () => {
                matrix1.insertCols(/* start: */ 0, /* count: */ 2);
                undo1.closeCurrentOperation();

                await expect([]);

                matrix2.insertRows(/* start: */ 0, /* count: */ 1);
                matrix2.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 2, [
                    2, 3,
                ]);
                undo2.closeCurrentOperation();

                await expect([
                    [2, 3],
                ]);

                matrix1.insertRows(/* start: */ 0, /* count: */ 1);
                matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 2, [
                    0, 1,
                ]);
                undo1.closeCurrentOperation();

                await expect([
                    [0, 1],
                    [2, 3],
                ]);

                undo2.undoOperation();
                await expect([
                    [0, 1],
                ]);

                undo1.undoOperation();
                await expect([
                ]);

                undo2.redoOperation();
                await expect([
                    [2, 3],
                ]);

                undo1.redoOperation();
                await expect([
                    [0, 1],
                    [2, 3],
                ]);

                undo1.undoOperation();
                await expect([
                    [2, 3],
                ]);

                undo1.undoOperation();
                await expect([
                    []
                ]);

                undo1.redoOperation();
                await expect([
                    [2, 3],
                ]);
            });
        });
    });
});
