/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    MockFluidDataStoreRuntime,
    MockStorage,
    MockContainerRuntimeFactory,
} from "@fluidframework/test-runtime-utils";
import { MatrixItem, SharedMatrix, SharedMatrixFactory } from "..";
import { extract } from "./utils";
import { TestConsumer } from "./testconsumer";
import { UndoRedoStackManager } from "./undoRedoStackManager";

describe("Matrix", () => {
    describe("undo/redo", () => {
        let matrix1: SharedMatrix<number>;
        // Test IMatrixConsumer that builds a copy of `matrix` via observed events.
        let consumer1: TestConsumer<undefined | null | number>;
        let undo1: UndoRedoStackManager;
        let expect: <T>(expected: readonly (readonly (MatrixItem<T>)[])[]) => void;

        describe("Connected with two clients", () => {
            let matrix2: SharedMatrix;
            let undo2: UndoRedoStackManager;
            let consumer2: TestConsumer;     // Test IMatrixConsumer that builds a copy of `matrix` via observed events.
            let containerRuntimeFactory: MockContainerRuntimeFactory;

            before(() => {
                expect = (expected?: readonly (readonly any[])[]) => {
                    containerRuntimeFactory.processAllMessages();

                    const actual1 = extract(matrix1);
                    const actual2 = extract(matrix2);

                    assert.deepEqual(actual1, actual2, "matrices do not match");

                    if (expected !== undefined) {
                        assert.deepEqual(actual1, expected, "matrices do not match expected");
                    }

                    for (const consumer of [consumer1, consumer2]) {
                        assert.deepEqual(extract(consumer), actual1,
                            "Matrix must notify IMatrixConsumers of all changes.");
                    }
                };
            });

            beforeEach(() => {
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

            afterEach(() => {
                // Paranoid check that the matrices are have converged on the same state.
                // expect(undefined as any);

                // matrix1.closeMatrix(consumer1);
                // matrix2.closeMatrix(consumer2);
            });
            it.only("reorder row insertion via undo/redo", () => {
                matrix1.insertCols(/* start: */ 0, /* count: */ 2);
                undo1.closeCurrentOperation();

                containerRuntimeFactory.processAllMessages();

                matrix2.insertRows(/* start: */ 0, /* count: */ 1);
                matrix2.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 2, [
                    2, 3,
                ]);
                undo2.closeCurrentOperation();

                containerRuntimeFactory.processAllMessages();

                matrix1.insertRows(/* start: */ 0, /* count: */ 1);
                matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 2, [
                    0, 1,
                ]);
                undo1.closeCurrentOperation();
                containerRuntimeFactory.processAllMessages();

                undo2.undoOperation();
                containerRuntimeFactory.processAllMessages();

                undo1.redoOperation();
                expect([
                    [0, 1],
                    [2, 3],
                ]);

                undo1.undoOperation();
                expect([
                    [2, 3],
                ]);

                undo1.undoOperation();
                expect([
                    [],
                ]);

                undo1.redoOperation();
                expect([
                    [2, 3],
                ]);
            });
        });
    });
});
