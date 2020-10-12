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
} from "@fluidframework/test-runtime-utils";
import { SharedMatrix, SharedMatrixFactory } from "../src";
import { extract, expectSize } from "./utils";
import { TestConsumer } from "./testconsumer";
import { UndoRedoStackManager } from "./undoRedoStackManager";

describe("Matrix", () => {
    describe("undo/redo", () => {
        describe("local client", () => {
            let dataStoreRuntime: MockFluidDataStoreRuntime;
            let matrix: SharedMatrix<number>;
            let consumer: TestConsumer<undefined | null | number>;     // Test IMatrixConsumer that builds a copy of `matrix` via observed events.
            let undo: UndoRedoStackManager;

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
                dataStoreRuntime = new MockFluidDataStoreRuntime();
                matrix = new SharedMatrix(dataStoreRuntime, "matrix1", SharedMatrixFactory.Attributes);

                // Attach a new IMatrixConsumer
                consumer = new TestConsumer(matrix);

                undo = new UndoRedoStackManager();
                matrix.openUndo(undo);
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

            it("undo/redo setCell", async () => {
                matrix.insertRows(/* start: */ 0, /* count: */ 1);
                matrix.insertCols(/* start: */ 0, /* count: */ 1);
                await expect([[undefined]]);

                undo.closeCurrentOperation();

                matrix.setCell(/* row: */ 0, /* col: */ 0, 1);
                await expect([[1]]);

                undo.undoOperation();
                await expect([[undefined]]);

                undo.redoOperation();
                await expect([[1]]);
            });

            it("undo/redo insertRow", async () => {
                matrix.insertRows(/* start: */ 0, /* count: */ 1);
                undo.closeCurrentOperation();

                expectSize(matrix, /* rowCount */ 1, /* colCount: */ 0);

                undo.undoOperation();
                expectSize(matrix, /* rowCount */ 0, /* colCount: */ 0);

                undo.redoOperation();
                expectSize(matrix, /* rowCount */ 1, /* colCount: */ 0);
            });

            it("undo/redo removeRow", async () => {
                matrix.insertRows(/* start: */ 0, /* count: */ 1);
                matrix.insertCols(/* start: */ 0, /* count: */ 1);
                await expect([[undefined]]);

                matrix.setCell(/* row: */ 0, /* col: */ 0, 1);
                await expect([[1]]);
                undo.closeCurrentOperation();

                matrix.removeRows(/* rowStart: */ 0, /* rowCount: */ 1);
                undo.closeCurrentOperation();

                expectSize(matrix, /* rowCount */ 0, /* colCount: */ 1);

                undo.undoOperation();
                await expect([[1]]);

                undo.redoOperation();
                expectSize(matrix, /* rowCount */ 0, /* colCount: */ 1);
            });

            it("undo/redo removeRow 0 of 2x2", async () => {
                matrix.insertRows(/* start: */ 0, /* count: */ 2);
                matrix.insertCols(/* start: */ 0, /* count: */ 2);
                matrix.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 2, [
                    0, 1,
                    2, 3,
                ]);
                undo.closeCurrentOperation();
                await expect([
                    [0, 1],
                    [2, 3],
                ]);

                matrix.removeRows(/* rowStart: */ 0, /* rowCount: */ 1);
                undo.closeCurrentOperation();
                await expect([
                    [2, 3]
                ]);

                undo.undoOperation();
                await expect([
                    [0, 1],
                    [2, 3],
                ]);

                undo.redoOperation();
                await expect([
                    [2, 3]
                ]);
            });

            it("undo/redo removeRow 1 of 2x2", async () => {
                matrix.insertRows(/* start: */ 0, /* count: */ 2);
                matrix.insertCols(/* start: */ 0, /* count: */ 2);
                matrix.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 2, [
                    0, 1,
                    2, 3,
                ]);
                undo.closeCurrentOperation();
                await expect([
                    [0, 1],
                    [2, 3],
                ]);

                matrix.removeRows(/* rowStart: */ 1, /* rowCount: */ 1);
                undo.closeCurrentOperation();
                await expect([
                    [0, 1]
                ]);

                undo.undoOperation();
                await expect([
                    [0, 1],
                    [2, 3],
                ]);

                undo.redoOperation();
                await expect([
                    [0, 1]
                ]);
            });

            it("undo/redo insertCol", async () => {
                matrix.insertCols(/* start: */ 0, /* count: */ 1);
                undo.closeCurrentOperation();

                expectSize(matrix, /* rowCount */ 0, /* colCount: */ 1);

                undo.undoOperation();
                expectSize(matrix, /* rowCount */ 0, /* colCount: */ 0);

                undo.redoOperation();
                expectSize(matrix, /* rowCount */ 0, /* colCount: */ 1);
            });

            it("undo/redo removeCol", async () => {
                matrix.insertRows(/* start: */ 0, /* count: */ 1);
                matrix.insertCols(/* start: */ 0, /* count: */ 1);
                await expect([[undefined]]);

                matrix.setCell(/* row: */ 0, /* col: */ 0, 1);
                await expect([[1]]);
                undo.closeCurrentOperation();

                matrix.removeCols(/* colStart: */ 0, /* colCount: */ 1);
                undo.closeCurrentOperation();

                expectSize(matrix, /* rowCount */ 1, /* colCount: */ 0);

                undo.undoOperation();
                await expect([[1]]);

                undo.redoOperation();
                expectSize(matrix, /* rowCount */ 1, /* colCount: */ 0);
            });

            it("undo/redo removeCol 0 of 2x2", async () => {
                matrix.insertRows(/* start: */ 0, /* count: */ 2);
                matrix.insertCols(/* start: */ 0, /* count: */ 2);
                matrix.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 2, [
                    0, 1,
                    2, 3,
                ]);
                await expect([
                    [0, 1],
                    [2, 3],
                ]);
                undo.closeCurrentOperation();

                matrix.removeCols(/* colStart: */ 0, /* colCount: */ 1);
                undo.closeCurrentOperation();
                await expect([
                    [1],
                    [3],
                ]);

                undo.undoOperation();
                await expect([
                    [0, 1],
                    [2, 3],
                ]);

                undo.redoOperation();
                await expect([
                    [1],
                    [3],
                ]);
            });

            it("undo/redo removeCol 1 of 2x2", async () => {
                matrix.insertRows(/* start: */ 0, /* count: */ 2);
                matrix.insertCols(/* start: */ 0, /* count: */ 2);
                matrix.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 2, [
                    0, 1,
                    2, 3,
                ]);
                await expect([
                    [0, 1],
                    [2, 3],
                ]);
                undo.closeCurrentOperation();

                matrix.removeCols(/* colStart: */ 1, /* colCount: */ 1);
                undo.closeCurrentOperation();
                await expect([
                    [0],
                    [2],
                ]);

                undo.undoOperation();
                await expect([
                    [0, 1],
                    [2, 3],
                ]);

                undo.redoOperation();
                await expect([
                    [0],
                    [2],
                ]);
            });
        });
    });
});
