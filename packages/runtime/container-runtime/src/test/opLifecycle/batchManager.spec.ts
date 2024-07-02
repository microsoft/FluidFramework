/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ContainerMessageType } from "../../messageTypes.js";
import { BatchManager, BatchMessage, estimateSocketSize } from "../../opLifecycle/index.js";

describe("BatchManager", () => {
	const hardLimit = 950 * 1024;
	const smallMessageSize = 10;

	const generateStringOfSize = (sizeInBytes: number): string =>
		new Array(sizeInBytes + 1).join("0");

	const smallMessage = (): BatchMessage =>
		({
			contents: generateStringOfSize(smallMessageSize),
			type: ContainerMessageType.FluidDataStoreOp,
		}) as any as BatchMessage;

	it("BatchManager: 'infinity' hard limit allows everything", () => {
		const message = { contents: generateStringOfSize(1024) } as any as BatchMessage;
		const batchManager = new BatchManager({ hardLimit: Infinity, canRebase: true });

		for (let i = 1; i <= 10; i++) {
			assert.equal(batchManager.push(message, /* reentrant */ false), true);
			assert.equal(batchManager.length, i);
		}
	});

	it("Batch metadata is set correctly", () => {
		const batchManager = new BatchManager({ hardLimit, canRebase: true });
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

		const batch = batchManager.popBatch();
		assert.equal(batch.messages[0].metadata?.batch, true);
		assert.equal(batch.messages[1].metadata?.batch, undefined);
		assert.equal(batch.messages[2].metadata?.batch, false);

		assert.equal(
			batchManager.push(
				{ ...smallMessage(), referenceSequenceNumber: 0 },
				/* reentrant */ false,
			),
			true,
		);
		const singleOpBatch = batchManager.popBatch();
		assert.equal(singleOpBatch.messages[0].metadata?.batch, undefined);
	});

	it("Batch content size is tracked correctly", () => {
		const batchManager = new BatchManager({ hardLimit, canRebase: true });
		assert.equal(batchManager.push(smallMessage(), /* reentrant */ false), true);
		assert.equal(batchManager.contentSizeInBytes, smallMessageSize * batchManager.length);
		assert.equal(batchManager.push(smallMessage(), /* reentrant */ false), true);
		assert.equal(batchManager.contentSizeInBytes, smallMessageSize * batchManager.length);
		assert.equal(batchManager.push(smallMessage(), /* reentrant */ false), true);
		assert.equal(batchManager.contentSizeInBytes, smallMessageSize * batchManager.length);
	});

	it("Batch reference sequence number maps to the last message", () => {
		const batchManager = new BatchManager({ hardLimit, canRebase: true });
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

	it("Batch size estimates", () => {
		const batchManager = new BatchManager({ hardLimit, canRebase: true });
		batchManager.push(smallMessage(), /* reentrant */ false);
		// 10 bytes of content + 200 bytes overhead
		assert.equal(estimateSocketSize(batchManager.popBatch()), 210);

		for (let i = 0; i < 10; i++) {
			batchManager.push(smallMessage(), /* reentrant */ false);
		}

		// (10 bytes of content + 200 bytes overhead) x 10
		assert.equal(estimateSocketSize(batchManager.popBatch()), 2100);

		batchManager.push(smallMessage(), /* reentrant */ false);
		for (let i = 0; i < 9; i++) {
			batchManager.push(
				{
					contents: undefined,
					type: ContainerMessageType.FluidDataStoreOp,
				} as any as BatchMessage,
				/* reentrant */ false,
			); // empty op
		}

		// 10 bytes of content + 200 bytes overhead x 10
		assert.equal(estimateSocketSize(batchManager.popBatch()), 2010);
	});

	it("Batch op reentry state preserved during its lifetime", () => {
		const batchManager = new BatchManager({ hardLimit, canRebase: true });
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
});
