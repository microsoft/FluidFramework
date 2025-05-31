/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { GarbageCollectionMessage } from "../../gc/index.js";
import {
	ContainerMessageType,
	type LocalContainerRuntimeMessage,
} from "../../messageTypes.js";
import type { IBatchMetadata } from "../../metadata.js";
import {
	BatchManager,
	estimateSocketSize,
	generateBatchId,
	localBatchToOutboundBatch,
} from "../../opLifecycle/index.js";
import {
	addBatchMetadata,
	type IBatchManagerOptions,
	type LocalBatchMessage,
} from "../../opLifecycle/index.js";

// Make a mock op with distinguishable contents
function op(data: string = "Some Data"): LocalContainerRuntimeMessage {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	return {
		type: ContainerMessageType.FluidDataStoreOp,
		contents: data as unknown,
	} as LocalContainerRuntimeMessage;
}

function nonDirtyableOp(): LocalContainerRuntimeMessage {
	return {
		type: ContainerMessageType.GC,
		contents: {} as unknown as GarbageCollectionMessage,
	};
}

const generateStringOfSize = (sizeInBytes: number): string => "0".repeat(sizeInBytes);

const smallMessage = (size: number = 100): LocalBatchMessage => {
	// JSON envelope of op returned by op fn above
	const contentSize = (size ?? 0) - JSON.stringify(op("")).length; // (36 chars overhead per op)
	return {
		runtimeOp: op(generateStringOfSize(contentSize)),
		referenceSequenceNumber: 0,
	};
};

describe("BatchManager", () => {
	const defaultOptions: IBatchManagerOptions = {
		canRebase: true,
	};

	for (const includeBatchId of [true, false])
		it(`Batch metadata is set correctly [${includeBatchId ? "with" : "without"} batchId]`, () => {
			const batchManager = new BatchManager(defaultOptions);
			const batchId = includeBatchId ? "BATCH_ID" : undefined;
			batchManager.push(
				{ runtimeOp: op(), referenceSequenceNumber: 0 },
				/* reentrant */ false,
			);
			batchManager.push(
				{ runtimeOp: op(), referenceSequenceNumber: 1 },
				/* reentrant */ false,
			);
			batchManager.push(
				{ runtimeOp: op(), referenceSequenceNumber: 2 },
				/* reentrant */ false,
			);

			const batch = batchManager.popBatch();
			addBatchMetadata(batch, batchId);
			assert.deepEqual(
				batch.messages.map((m) => m.metadata as IBatchMetadata),
				[
					{ batch: true, ...(includeBatchId ? { batchId } : undefined) }, // batchId propertly should be omitted (v. set to undefined) if not provided
					undefined, // metadata not touched for intermediate messages
					{ batch: false },
				],
			);

			batchManager.push(
				{ runtimeOp: op(), referenceSequenceNumber: 0 },
				/* reentrant */ false,
			);
			const singleOpBatch = batchManager.popBatch();
			addBatchMetadata(singleOpBatch, batchId);
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

	it("Batch reference sequence number maps to the last message", () => {
		const batchManager = new BatchManager(defaultOptions);
		batchManager.push({ runtimeOp: op(), referenceSequenceNumber: 0 }, /* reentrant */ false);
		batchManager.push({ runtimeOp: op(), referenceSequenceNumber: 1 }, /* reentrant */ false);
		batchManager.push({ runtimeOp: op(), referenceSequenceNumber: 2 }, /* reentrant */ false);

		assert.equal(batchManager.sequenceNumbers.referenceSequenceNumber, 2);
	});

	it("estimateSocketSize", () => {
		// 40 bytes of content + 200 bytes overhead
		assert.equal(
			estimateSocketSize(
				localBatchToOutboundBatch({
					messages: [smallMessage(40)],
					referenceSequenceNumber: 0,
				}),
			),
			240,
		);

		const messages: LocalBatchMessage[] = [];
		for (let i = 0; i < 10; i++) {
			messages.push(smallMessage(40));
		}

		// (40 bytes of content + 200 bytes overhead) x 10
		assert.equal(
			estimateSocketSize(localBatchToOutboundBatch({ messages, referenceSequenceNumber: 0 })),
			2400,
		);
	});

	it("Batch op reentry state preserved during its lifetime", () => {
		const batchManager = new BatchManager(defaultOptions);
		batchManager.push({ runtimeOp: op(), referenceSequenceNumber: 0 }, /* reentrant */ false);
		batchManager.push({ runtimeOp: op(), referenceSequenceNumber: 1 }, /* reentrant */ false);
		batchManager.push({ runtimeOp: op(), referenceSequenceNumber: 2 }, /* reentrant */ false);

		assert.equal(batchManager.popBatch().hasReentrantOps, false);

		batchManager.push({ runtimeOp: op(), referenceSequenceNumber: 0 }, /* reentrant */ false);
		batchManager.push(
			{ runtimeOp: op(), referenceSequenceNumber: 1 },
			/* reentrant */ true,
			/* currentClientSequenceNumber */ undefined,
		);
		batchManager.push({ runtimeOp: op(), referenceSequenceNumber: 2 }, /* reentrant */ false);
		assert.equal(batchManager.popBatch().hasReentrantOps, true);

		batchManager.push({ runtimeOp: op(), referenceSequenceNumber: 0 }, /* reentrant */ false);
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

		batchManager.push({ runtimeOp: op(), referenceSequenceNumber: 0 }, /* reentrant */ false);
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

	describe("containsUserChanges", () => {
		// default op used in other tests is dirtyable
		const dirtyableOp = op;

		it("returns false when there are no messages", () => {
			const batchManager = new BatchManager(defaultOptions);
			assert.equal(
				batchManager.containsUserChanges(),
				false,
				"Should be false for empty batch",
			);
		});

		it("returns true if at least one message is dirtyable", () => {
			const batchManager = new BatchManager(defaultOptions);
			batchManager.push({ runtimeOp: dirtyableOp(), referenceSequenceNumber: 0 }, false);
			assert.equal(
				batchManager.containsUserChanges(),
				true,
				"Should be true if dirtyable op present",
			);
		});

		it("returns false if all messages are non-dirtyable", () => {
			const batchManager = new BatchManager(defaultOptions);
			batchManager.push({ runtimeOp: nonDirtyableOp(), referenceSequenceNumber: 0 }, false);
			batchManager.push({ runtimeOp: nonDirtyableOp(), referenceSequenceNumber: 1 }, false);
			assert.equal(
				batchManager.containsUserChanges(),
				false,
				"Should be false if no dirtyable ops",
			);
		});

		it("returns true if mixed dirtyable and non-dirtyable messages", () => {
			const batchManager = new BatchManager(defaultOptions);
			batchManager.push({ runtimeOp: nonDirtyableOp(), referenceSequenceNumber: 0 }, false);
			batchManager.push({ runtimeOp: dirtyableOp(), referenceSequenceNumber: 1 }, false);
			batchManager.push({ runtimeOp: nonDirtyableOp(), referenceSequenceNumber: 2 }, false);
			assert.equal(
				batchManager.containsUserChanges(),
				true,
				"Should be true if any dirtyable op present",
			);
		});
	});
});
