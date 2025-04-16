/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line unicorn/prefer-node-protocol
import { strict as assert } from "assert";

import { SharedMatrix } from "@fluidframework/matrix/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import { UndoRedoStackManager } from "../undoRedoStackManager.js";

// NOTE: This test vets that '@fluidframework/matrix' is compatible with the UndoRedoStackManager
//       defined in '@fluidframework/undo-redo'.  For more extensive testing of the matrix
//       undo/redo implementation, see 'matrix.undo.spec.ts' in the '@fluidframework/matrix' package.

describe("Matrix", () => {
	let dataStoreRuntime: MockFluidDataStoreRuntime;
	let matrix: SharedMatrix<number>;
	let undo: UndoRedoStackManager;

	beforeEach(async () => {
		dataStoreRuntime = new MockFluidDataStoreRuntime();
		const matrixFactory = SharedMatrix.getFactory();
		matrix = matrixFactory.create(dataStoreRuntime, "matrix1");

		undo = new UndoRedoStackManager();
		matrix.openUndo(undo);
	});

	it("is compatible with UndoRedoStackManager", () => {
		matrix.insertRows(/* start: */ 0, /* count: */ 1);
		matrix.insertCols(/* start: */ 0, /* count: */ 1);
		undo.closeCurrentOperation();

		matrix.setCell(/* row: */ 0, /* col: */ 0, 1);
		assert.equal(matrix.getCell(0, 0), 1);

		undo.undoOperation();
		assert.equal(matrix.getCell(0, 0), undefined);

		undo.redoOperation();
		assert.equal(matrix.getCell(0, 0), 1);
	});
});
