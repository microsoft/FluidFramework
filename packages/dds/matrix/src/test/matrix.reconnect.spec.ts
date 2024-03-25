/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	MockContainerRuntimeFactoryForReconnection,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import { SharedMatrix } from "../matrix.js";
import { extract } from "./utils.js";

describe("SharedMatrix reconnect", () => {
	/**
	 * This test case is interesting because it exercises the logic in merge-tree to normalize segment order on resubmit.
	 * Specifically, this logic ensures that the column inserted by matrix 2 is inserted before the 2 existing columns once
	 * acked, since it gets sequenced with refSeq beyond the removal of the 2 existing columns.
	 * This logic needs to be accounted for in some way by matrix's resubmit codepath (it must use a mechanism stable to that
	 * rearrangement of segments like local references, or otherwise listen to the right events on its row/col clients to
	 * make sure positions are rebased appropriately).
	 */
	it("rebase setCell in inserted column with overlapping remove", () => {
		const factory = SharedMatrix.getFactory();
		const containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
		const dataRuntime1 = new MockFluidDataStoreRuntime();
		containerRuntimeFactory.createContainerRuntime(dataRuntime1);
		const dataRuntime2 = new MockFluidDataStoreRuntime();
		const containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataRuntime2);

		const matrix1 = factory.create(dataRuntime1, "A") as SharedMatrix<number>;
		matrix1.connect({
			deltaConnection: dataRuntime1.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		const matrix2 = factory.create(dataRuntime2, "B") as SharedMatrix<number>;
		matrix2.connect({
			deltaConnection: dataRuntime2.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		// Create a 1x2 matrix
		matrix1.insertRows(0, 1);
		matrix1.insertCols(0, 2);
		containerRuntimeFactory.processAllMessages();

		// Concurrently:
		//
		//   A) Remove all columns (of matrix1)
		//   B) Insert a column and set a cell in the inserted column (of matrix2)
		//
		// We do this while matrix2 is disconnected so can force a resubmission that rebases
		// over the removal of the set cell.
		containerRuntime2.connected = false;
		matrix1.removeCols(0, 2);
		matrix2.insertCols(1, 1);
		matrix2.setCell(0, 1, 42);
		containerRuntimeFactory.processAllMessages();

		// Because matrix2 is disconnected, our local states will have temporarily diverged.
		assert.deepEqual(extract(matrix1), [[]]);
		assert.deepEqual(extract(matrix2), [[undefined, 42, undefined]]);

		// Reconnect matrix2 and process all messages.  This will cause the 'setCell(0,0)' to
		// be rebased over the removal of the first column.
		containerRuntime2.connected = true;
		containerRuntimeFactory.processAllMessages();

		// The overlapping remove should leave just the cell inserted and set by matrix2.
		const expected = [[42]];
		assert.deepEqual(extract(matrix1), expected);
		assert.deepEqual(extract(matrix2), expected);
	});

	it("discards setCell in removed column", () => {
		const factory = SharedMatrix.getFactory();
		const containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
		const dataRuntime1 = new MockFluidDataStoreRuntime();
		containerRuntimeFactory.createContainerRuntime(dataRuntime1);
		const dataRuntime2 = new MockFluidDataStoreRuntime();
		const containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataRuntime2);

		const matrix1 = factory.create(dataRuntime1, "A") as SharedMatrix<number>;
		matrix1.connect({
			deltaConnection: dataRuntime1.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		const matrix2 = factory.create(dataRuntime2, "B") as SharedMatrix<number>;
		matrix2.connect({
			deltaConnection: dataRuntime2.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		// Create a 1x2 matrix
		matrix1.insertRows(0, 1);
		matrix1.insertCols(0, 2);
		containerRuntimeFactory.processAllMessages();

		// Concurrently:
		//
		//   A) Remove the first column (of matrix1)
		//   B) Set a cell in the first column (of matrix2)
		//
		// We do this while matrix2 is disconnected so can force a resubmission that rebases
		// over the removal of the set cell.
		containerRuntime2.connected = false;
		matrix1.removeCols(0, 1);
		matrix2.setCell(0, 0, 42);
		containerRuntimeFactory.processAllMessages();

		// Because matrix2 is disconnected, our local states will have temporarily diverged.
		assert.deepEqual(extract(matrix1), [[undefined]]);
		assert.deepEqual(extract(matrix2), [[42, undefined]]);

		// Reconnect matrix2 and process all messages.  This will cause the 'setCell(0,0)' to
		// be rebased over the removal of the first column.
		containerRuntime2.connected = true;
		containerRuntimeFactory.processAllMessages();

		// Because the cell the user intended to set has been removed, the remaining cell should
		// continue to be empty (undefined).
		const expected = [[undefined]];
		assert.deepEqual(extract(matrix1), expected);
		assert.deepEqual(extract(matrix2), expected);
	});

	// This test demonstrates the need to use the `currentSeq` on the collab window at resubmission time
	// rather than the refSeq of the original op. Since that information is only used in local op metadata
	// and only used for resubmitting ops, disconnecting twice is necessary to reproduce the issue.
	it("resolves insert+set against concurrent insert after disconnecting twice", () => {
		const factory = SharedMatrix.getFactory();
		const containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
		const dataRuntime1 = new MockFluidDataStoreRuntime();
		const containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataRuntime1);
		const dataRuntime2 = new MockFluidDataStoreRuntime();
		const containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataRuntime2);
		const matrix1 = factory.create(dataRuntime1, "A") as SharedMatrix<number>;
		matrix1.connect({
			deltaConnection: dataRuntime1.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});
		const matrix2 = factory.create(dataRuntime2, "B") as SharedMatrix<number>;
		matrix2.connect({
			deltaConnection: dataRuntime2.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		matrix1.insertCols(0, 1);
		containerRuntimeFactory.processAllMessages();

		containerRuntime1.connected = false;
		matrix1.insertRows(0, 1);
		matrix2.insertRows(0, 1);

		containerRuntimeFactory.processAllMessages();
		containerRuntime1.connected = true;
		containerRuntime2.connected = false;

		// Matrix2 hasn't yet seen the row inserted by matrix1, so this set should refer to the row that matrix2 inserted.
		matrix2.setCell(0, 0, 42);
		containerRuntimeFactory.processAllMessages();
		containerRuntime2.connected = true;
		containerRuntime2.connected = false;
		containerRuntime2.connected = true;
		containerRuntimeFactory.processAllMessages();

		const expected = [[undefined], [42]];
		assert.deepEqual(extract(matrix1), expected);
		assert.deepEqual(extract(matrix2), expected);
	});

	// This is a fuzz test minimization of a scenario where resubmit requires information outside of the collab
	// window dictated by incoming messages. It motivates the need for Client's minSeq updating logic to take into
	// account in-flight ops.
	// See "client.applyMsg updates minSeq" in merge-tree's test suite for a lower-level unit test of some relevant behavior.
	it("avoids zamboni of information required to resubmit", async () => {
		const factory = SharedMatrix.getFactory();
		const containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
		const dataRuntime1 = new MockFluidDataStoreRuntime();
		const containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataRuntime1);
		const dataRuntime2 = new MockFluidDataStoreRuntime();
		const containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataRuntime2);
		const dataRuntime3 = new MockFluidDataStoreRuntime();
		const containerRuntime3 = containerRuntimeFactory.createContainerRuntime(dataRuntime3);
		const matrix1 = factory.create(dataRuntime1, "A") as SharedMatrix<number>;

		matrix1.insertCols(0, 2);
		const { summary } = matrix1.getAttachSummary();
		matrix1.connect({
			deltaConnection: dataRuntime1.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		const matrix2 = (await factory.load(
			dataRuntime2,
			"B",
			{
				deltaConnection: dataRuntime2.createDeltaConnection(),
				objectStorage: MockStorage.createFromSummary(summary),
			},
			factory.attributes,
		)) as SharedMatrix<number>;
		const matrix3 = (await factory.load(
			dataRuntime3,
			"C",
			{
				deltaConnection: dataRuntime3.createDeltaConnection(),
				objectStorage: MockStorage.createFromSummary(summary),
			},
			factory.attributes,
		)) as SharedMatrix<number>;

		containerRuntime3.connected = false;
		containerRuntime1.connected = false;

		matrix2.insertCols(0, 1);
		matrix1.insertCols(0, 1);
		matrix3.insertRows(0, 1);
		matrix3.setCell(0, 1, 42);

		containerRuntimeFactory.processAllMessages();
		containerRuntime2.connected = false;
		containerRuntime1.connected = true;
		containerRuntimeFactory.processAllMessages();
		containerRuntime3.connected = true;
		containerRuntimeFactory.processAllMessages();
		const expected = [[undefined, undefined, undefined, 42]];
		assert.deepEqual(extract(matrix1), expected);
		assert.deepEqual(extract(matrix3), expected);
	});
});
