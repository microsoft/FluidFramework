/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { FlushMode } from "@fluidframework/runtime-definitions/internal";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { extract, matrixFactory } from "./utils.js";

describe("SharedMatrix rollback", () => {
	it("should rollback a setCell operation", () => {
		const containerRuntimeFactory = new MockContainerRuntimeFactory({
			flushMode: FlushMode.TurnBased,
		});
		const dataRuntime = new MockFluidDataStoreRuntime();
		const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataRuntime);
		const matrix = matrixFactory.create(dataRuntime, "A");
		matrix.connect({
			deltaConnection: dataRuntime.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		matrix.insertRows(0, 1);
		matrix.insertCols(0, 1);
		// Do not process messages yet, keep ops local

		// Initial state after insert
		assert.deepEqual(extract(matrix), [[undefined]], "initial state after insert");

		matrix.setCell(0, 0, 42);
		assert.deepEqual(extract(matrix), [[42]], "after setCell(0, 0, 42)");

		// Rollback all unacked changes using containerRuntime.rollback
		containerRuntime.rollback?.();
		// Should revert to state after insert
		assert.deepEqual(extract(matrix), [], "after rollback of setCell");

		// Now process messages to ensure no-op
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();
		assert.deepEqual(extract(matrix), [], "after processAllMessages post-rollback");
	});

	it("should rollback an insertCols operation", () => {
		const containerRuntimeFactory = new MockContainerRuntimeFactory({
			flushMode: FlushMode.TurnBased,
		});
		const dataRuntime = new MockFluidDataStoreRuntime();
		const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataRuntime);
		const matrix = matrixFactory.create(dataRuntime, "A");
		matrix.connect({
			deltaConnection: dataRuntime.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		matrix.insertRows(0, 1);
		// Initial state after row insert
		assert.deepEqual(extract(matrix), [[]], "initial state after row insert");

		matrix.insertCols(0, 2);
		assert.deepEqual(extract(matrix), [[undefined, undefined]], "after insertCols(0, 2)");

		// Rollback all unacked changes using containerRuntime.rollback
		containerRuntime.rollback?.();
		// Should revert to state after row insert
		assert.deepEqual(extract(matrix), [], "after rollback of insertCols");

		// Now process messages to ensure no-op
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();
		assert.deepEqual(extract(matrix), [], "after processAllMessages post-rollback");
	});

	it("should rollback a removeCols operation", () => {
		const containerRuntimeFactory = new MockContainerRuntimeFactory({
			flushMode: FlushMode.TurnBased,
		});
		const dataRuntime = new MockFluidDataStoreRuntime();
		const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataRuntime);
		const matrix = matrixFactory.create(dataRuntime, "A");
		matrix.connect({
			deltaConnection: dataRuntime.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		matrix.insertRows(0, 1);
		matrix.insertCols(0, 2);
		matrix.setCell(0, 0, 1);
		matrix.setCell(0, 1, 2);
		containerRuntime.flush();
		// State after sets
		assert.deepEqual(extract(matrix), [[1, 2]], "after setCell(0, 0, 1) and setCell(0, 1, 2)");

		matrix.removeCols(0, 1);
		assert.deepEqual(extract(matrix), [[2]], "after removeCols(0, 1)");

		// Rollback all unacked changes using containerRuntime.rollback
		containerRuntime.rollback?.();
		// Should revert to state after setCell
		assert.deepEqual(extract(matrix), [[1, 2]], "after rollback of removeCols");

		// Now process messages to ensure no-op
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();
		assert.deepEqual(extract(matrix), [[1, 2]], "after processAllMessages post-rollback");
	});

	it("should rollback an insertRows operation", () => {
		const containerRuntimeFactory = new MockContainerRuntimeFactory({
			flushMode: FlushMode.TurnBased,
		});
		const dataRuntime = new MockFluidDataStoreRuntime();
		const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataRuntime);
		const matrix = matrixFactory.create(dataRuntime, "A");
		matrix.connect({
			deltaConnection: dataRuntime.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		// Initial state
		assert.deepEqual(extract(matrix), [], "initial state");

		matrix.insertRows(0, 2);
		assert.deepEqual(extract(matrix), [[], []], "after insertRows(0, 2)");

		containerRuntime.rollback?.();
		assert.deepEqual(extract(matrix), [], "after rollback of insertRows");
	});

	it("should rollback a removeRows operation", () => {
		const containerRuntimeFactory = new MockContainerRuntimeFactory({
			flushMode: FlushMode.TurnBased,
		});
		const dataRuntime = new MockFluidDataStoreRuntime();
		const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataRuntime);
		const matrix = matrixFactory.create(dataRuntime, "A");
		matrix.connect({
			deltaConnection: dataRuntime.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		matrix.insertRows(0, 2);
		matrix.insertCols(0, 1);
		matrix.setCell(0, 0, 10);
		matrix.setCell(1, 0, 20);
		containerRuntime.flush();
		assert.deepEqual(extract(matrix), [[10], [20]], "after setCell");

		matrix.removeRows(0, 1);
		assert.deepEqual(extract(matrix), [[20]], "after removeRows(0, 1)");

		containerRuntime.rollback?.();
		assert.deepEqual(extract(matrix), [[10], [20]], "after rollback of removeRows");
	});

	it("should rollback multiple operations in sequence", () => {
		const containerRuntimeFactory = new MockContainerRuntimeFactory({
			flushMode: FlushMode.TurnBased,
		});
		const dataRuntime = new MockFluidDataStoreRuntime();
		const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataRuntime);
		const matrix = matrixFactory.create(dataRuntime, "A");
		matrix.connect({
			deltaConnection: dataRuntime.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		matrix.insertRows(0, 1);
		matrix.insertCols(0, 1);
		matrix.setCell(0, 0, 5);
		containerRuntime.flush();
		assert.deepEqual(extract(matrix), [[5]], "after setCell");

		matrix.insertCols(1, 1);
		matrix.setCell(0, 1, 15);
		assert.deepEqual(extract(matrix), [[5, 15]], "after insertCols and setCell");

		containerRuntime.rollback?.();
		assert.deepEqual(extract(matrix), [[5]], "after rollback of multiple ops");
	});

	it("should be a no-op if rollback is called with no pending changes", () => {
		const containerRuntimeFactory = new MockContainerRuntimeFactory({
			flushMode: FlushMode.TurnBased,
		});
		const dataRuntime = new MockFluidDataStoreRuntime();
		const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataRuntime);
		const matrix = matrixFactory.create(dataRuntime, "A");
		matrix.connect({
			deltaConnection: dataRuntime.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		matrix.insertRows(0, 1);
		matrix.insertCols(0, 1);
		containerRuntime.flush();
		assert.deepEqual(extract(matrix), [[undefined]], "after flush");

		containerRuntime.rollback?.();
		assert.deepEqual(extract(matrix), [[undefined]], "rollback with no pending changes");
	});

	it("should not rollback already flushed (acked) operations", () => {
		const containerRuntimeFactory = new MockContainerRuntimeFactory({
			flushMode: FlushMode.TurnBased,
		});
		const dataRuntime = new MockFluidDataStoreRuntime();
		const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataRuntime);
		const matrix = matrixFactory.create(dataRuntime, "A");
		matrix.connect({
			deltaConnection: dataRuntime.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		matrix.insertRows(0, 1);
		matrix.insertCols(0, 1);
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();
		assert.deepEqual(extract(matrix), [[undefined]], "after flush and process");

		containerRuntime.rollback?.();
		assert.deepEqual(extract(matrix), [[undefined]], "rollback after flush (no effect)");
	});

	it("should rollback with interleaved operations", () => {
		const containerRuntimeFactory = new MockContainerRuntimeFactory({
			flushMode: FlushMode.TurnBased,
		});
		const dataRuntime = new MockFluidDataStoreRuntime();
		const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataRuntime);
		const matrix = matrixFactory.create(dataRuntime, "A");
		matrix.connect({
			deltaConnection: dataRuntime.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		// Start with empty matrix
		assert.deepEqual(extract(matrix), [], "initial state");

		// Insert 2 rows and 2 columns
		matrix.insertRows(0, 2);
		matrix.insertCols(0, 2);
		assert.deepEqual(
			extract(matrix),
			[
				[undefined, undefined],
				[undefined, undefined],
			],
			"after insertRows and insertCols",
		);

		// Set some cells
		matrix.setCell(0, 0, 1);
		matrix.setCell(1, 1, 2);
		assert.deepEqual(
			extract(matrix),
			[
				[1, undefined],
				[undefined, 2],
			],
			"after setCell",
		);

		// Remove a column
		matrix.removeCols(0, 1);
		assert.deepEqual(extract(matrix), [[undefined], [2]], "after removeCols(0, 1)");

		// Insert a row
		matrix.insertRows(1, 1);
		assert.deepEqual(
			extract(matrix),
			[[undefined], [undefined], [2]],
			"after insertRows(1, 1)",
		);

		// Set a cell in the new row
		matrix.setCell(1, 0, 99);
		assert.deepEqual(extract(matrix), [[undefined], [99], [2]], "after setCell(1, 0, 99)");

		// Rollback all unacked changes
		containerRuntime.rollback?.();
		// Should revert to initial state (empty matrix)
		assert.deepEqual(extract(matrix), [], "after rollback of interleaved operations");
	});
});
