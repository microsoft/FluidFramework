/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IBatchMetadata } from "../../metadata.js";
import { BatchManager, generateBatchId } from "../../opLifecycle/index.js";
import type { IBatchManagerOptions, LocalBatchMessage } from "../../opLifecycle/index.js";

describe("BatchManager", () => {
	const smallMessageSize = 10;
	const defaultOptions: IBatchManagerOptions = {
		canRebase: true,
	};

	const generateStringOfSize = (sizeInBytes: number): string => "0".repeat(sizeInBytes);

	const smallMessage = (): LocalBatchMessage => ({
		serializedOp: generateStringOfSize(smallMessageSize),
		referenceSequenceNumber: 0,
	});

	for (const includeBatchId of [true, false])
		it(`Batch metadata is set correctly [with${includeBatchId ? "" : "out"} batchId]`, () => {
			const batchManager = new BatchManager(defaultOptions);
			const batchId = includeBatchId ? "BATCH_ID" : undefined;
			assert.equal(
				batchManager.push(
					{ ...smallMessage(), referenceSequenceNumber: 0 },
					/* reentrant */ false,
				),
				true,
			);
			assert.equal(
				batchManager.push(
					{ ...smallMessage(), referenceSequenceNumber: 1 },
					/* reentrant */ false,
				),
				true,
			);
			assert.equal(
				batchManager.push(
					{ ...smallMessage(), referenceSequenceNumber: 2 },
					/* reentrant */ false,
				),
				true,
			);

			const batch = batchManager.popBatch(batchId);
			assert.deepEqual(
				batch.messages.map((m) => m.metadata as IBatchMetadata),
				[
					{ batch: true, ...(includeBatchId ? { batchId } : undefined) }, // batchId propertly should be omitted (v. set to undefined) if not provided
					undefined, // metadata not touched for intermediate messages
					{ batch: false },
				],
			);

			assert.equal(
				batchManager.push(
					{ ...smallMessage(), referenceSequenceNumber: 0 },
					/* reentrant */ false,
				),
				true,
			);
			const singleOpBatch = batchManager.popBatch(batchId);
			assert.deepEqual(
				singleOpBatch.messages.map((m) => m.metadata as IBatchMetadata),
				[
					includeBatchId ? { batchId } : undefined, // batchId propertly should be omitted (v. set to undefined) if not provided
				],
			);
		});

	it("BatchId Format", () => {
		const clientId = "3627a2a9-963f-4e3b-a4d2-a31b1267ef29";
		const batchStartCsn = 123;
		const batchId = generateBatchId(clientId, batchStartCsn);
		const serialized = JSON.stringify({ batchId });
		assert.equal(serialized, `{"batchId":"3627a2a9-963f-4e3b-a4d2-a31b1267ef29_[123]"}`);
	});

	it("Batch content size is tracked correctly", () => {
		const batchManager = new BatchManager(defaultOptions);
		assert.equal(batchManager.push(smallMessage(), /* reentrant */ false), true);
		assert.equal(batchManager.push(smallMessage(), /* reentrant */ false), true);
		assert.equal(batchManager.push(smallMessage(), /* reentrant */ false), true);
	});

	it("Batch reference sequence number maps to the last message", () => {
		const batchManager = new BatchManager(defaultOptions);
		assert.equal(
			batchManager.push(
				{ ...smallMessage(), referenceSequenceNumber: 0 },
				/* reentrant */ false,
			),
			true,
		);
		assert.equal(
			batchManager.push(
				{ ...smallMessage(), referenceSequenceNumber: 1 },
				/* reentrant */ false,
			),
			true,
		);
		assert.equal(
			batchManager.push(
				{ ...smallMessage(), referenceSequenceNumber: 2 },
				/* reentrant */ false,
			),
			true,
		);

		assert.equal(batchManager.sequenceNumbers.referenceSequenceNumber, 2);
	});

	it("Batch op reentry state preserved during its lifetime", () => {
		const batchManager = new BatchManager(defaultOptions);
		assert.equal(
			batchManager.push(
				{ ...smallMessage(), referenceSequenceNumber: 0 },
				/* reentrant */ false,
			),
			true,
		);
		assert.equal(
			batchManager.push(
				{ ...smallMessage(), referenceSequenceNumber: 1 },
				/* reentrant */ false,
			),
			true,
		);
		assert.equal(
			batchManager.push(
				{ ...smallMessage(), referenceSequenceNumber: 2 },
				/* reentrant */ false,
			),
			true,
		);

		assert.equal(batchManager.popBatch().hasReentrantOps, false);

		assert.equal(
			batchManager.push(
				{ ...smallMessage(), referenceSequenceNumber: 0 },
				/* reentrant */ false,
			),
			true,
		);
		assert.equal(
			batchManager.push(
				{ ...smallMessage(), referenceSequenceNumber: 1 },
				/* reentrant */ true,
				/* currentClientSequenceNumber */ undefined,
			),
			true,
		);
		assert.equal(
			batchManager.push(
				{ ...smallMessage(), referenceSequenceNumber: 2 },
				/* reentrant */ false,
			),
			true,
		);
		assert.equal(batchManager.popBatch().hasReentrantOps, true);

		assert.equal(
			batchManager.push(
				{ ...smallMessage(), referenceSequenceNumber: 0 },
				/* reentrant */ false,
			),
			true,
		);
		assert.equal(batchManager.popBatch().hasReentrantOps, false);
	});

	it("should rollback to checkpoint correctly", () => {
		const batchManager = new BatchManager(defaultOptions);

		// Push initial messages
		batchManager.push(smallMessage(), /* reentrant */ false);
		batchManager.push(smallMessage(), /* reentrant */ false);

		// Create checkpoint
		const checkpoint = batchManager.checkpoint();

		// Push more messages
		batchManager.push(smallMessage(), /* reentrant */ false);
		batchManager.push(smallMessage(), /* reentrant */ false);

		// Rollback to checkpoint
		checkpoint.rollback((message) => {
			// Process rollback message (no-op in this test)
		});

		// Verify state after rollback
		assert.equal(batchManager.length, 2);
	});

	it("should handle rollback with no additional messages", () => {
		const batchManager = new BatchManager(defaultOptions);

		// Push initial messages
		batchManager.push(smallMessage(), /* reentrant */ false);

		// Create checkpoint
		const checkpoint = batchManager.checkpoint();

		// Rollback to checkpoint without pushing more messages
		checkpoint.rollback((message) => {
			// Process rollback message (no-op in this test)
		});

		// Verify state after rollback
		assert.equal(batchManager.length, 1);
	});

	it("should throw error if ops are generated during rollback", () => {
		const batchManager = new BatchManager(defaultOptions);

		// Push initial messages
		batchManager.push(smallMessage(), /* reentrant */ false);

		// Create checkpoint
		const checkpoint = batchManager.checkpoint();

		// Push more messages
		batchManager.push(smallMessage(), /* reentrant */ false);

		// Attempt rollback and generate ops during rollback
		assert.throws(() => {
			checkpoint.rollback((message) => {
				// Generate ops during rollback
				batchManager.push(smallMessage(), /* reentrant */ false);
			});
		}, /Error: Ops generated during rollback/);
	});

	it("Popping the batch then rolling is not allowed", () => {
		const batchManager = new BatchManager(defaultOptions);

		batchManager.push(
			{ ...smallMessage(), referenceSequenceNumber: 0 },
			/* reentrant */ false,
		);
		const checkpoint = batchManager.checkpoint();
		batchManager.popBatch();

		// Attempt rollback and generate ops during rollback
		assert.throws(() => {
			checkpoint.rollback((message) => {
				// Generate ops during rollback
				batchManager.push(smallMessage(), /* reentrant */ false);
			});
		}, /Error: Ops generated during rollback/);
	});
});
