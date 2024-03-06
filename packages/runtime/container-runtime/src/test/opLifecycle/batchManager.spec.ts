/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { BatchManager, BatchMessage, estimateSocketSize } from "../../opLifecycle/index.js";
import { ContainerMessageType } from "../../messageTypes.js";

describe("BatchManager", () => {
	const softLimit = 1024;
	const hardLimit = 950 * 1024;
	const smallMessageSize = 10;

	const generateStringOfSize = (sizeInBytes: number): string =>
		new Array(sizeInBytes + 1).join("0");

	const smallMessage = (): BatchMessage =>
		({
			contents: generateStringOfSize(smallMessageSize),
			type: ContainerMessageType.FluidDataStoreOp,
		}) as any as BatchMessage;

	it("BatchManager's soft limit: a bunch of small messages", () => {
		const message = { contents: generateStringOfSize(softLimit / 2) } as any as BatchMessage;
		const batchManager = new BatchManager({ hardLimit, softLimit });

		// Can push one large message
		assert.equal(batchManager.push(message, /* reentrant */ false), true);
		assert.equal(batchManager.length, 1);

		// Can't push another large message
		assert.equal(batchManager.push(message, /* reentrant */ false), false);
		assert.equal(batchManager.length, 1);

		// But can push one small message
		assert.equal(batchManager.push(smallMessage(), /* reentrant */ false), true);
		assert.equal(batchManager.length, 2);

		// Pop and check batch
		const batch = batchManager.popBatch();
		assert.equal(batch.content.length, 2);
		assert.equal(batch.contentSizeInBytes, softLimit / 2 + smallMessageSize);

		// Validate that can push large message again
		assert.equal(batchManager.push(message, /* reentrant */ false), true);
		assert.equal(batchManager.length, 1);

		assert.equal(batchManager.push(message, /* reentrant */ false), false);
		assert.equal(batchManager.length, 1);
	});

	it("BatchManager's soft limit: single large message", () => {
		const message = { contents: generateStringOfSize(softLimit * 2) } as any as BatchMessage;
		const batchManager = new BatchManager({ hardLimit, softLimit });

		// Can push one large message, even above soft limit
		assert.equal(batchManager.push(message, /* reentrant */ false), true);
		assert.equal(batchManager.length, 1);

		// Can't push another small message
		assert.equal(batchManager.push(smallMessage(), /* reentrant */ false), false);
		assert.equal(batchManager.length, 1);

		// Pop and check batch
		const batch = batchManager.popBatch();
		assert.equal(batch.content.length, 1);
		assert.equal(batch.contentSizeInBytes, softLimit * 2);

		// Validate that we can't push large message above soft limit if we have already at least one message.
		assert.equal(batchManager.push(smallMessage(), /* reentrant */ false), true);
		assert.equal(batchManager.length, 1);

		assert.equal(batchManager.push(message, /* reentrant */ false), false);
		assert.equal(batchManager.length, 1);
	});

	it("BatchManager: no soft limit", () => {
		const batchManager = new BatchManager({ hardLimit });
		const third = Math.floor(hardLimit / 3) + 1;
		const message = { contents: generateStringOfSize(third) } as any as BatchMessage;

		// Can push one large message, even above soft limit
		assert.equal(batchManager.push(message, /* reentrant */ false), true);
		assert.equal(batchManager.length, 1);

		// Can push second large message, even above soft limit
		assert.equal(batchManager.push(message, /* reentrant */ false), true);
		assert.equal(batchManager.length, 2);

		// Can't push another message
		assert.equal(batchManager.push(message, /* reentrant */ false), false);
		assert.equal(batchManager.length, 2);

		// Pop and check batch
		const batch = batchManager.popBatch();
		assert.equal(batch.content.length, 2);

		// Can push messages again
		assert.equal(batchManager.push(message, /* reentrant */ false), true);
		assert.equal(batchManager.length, 1);

		assert.equal(batchManager.push(message, /* reentrant */ false), true);
		assert.equal(batchManager.length, 2);

		assert.equal(batchManager.push(smallMessage(), /* reentrant */ false), true);
		assert.equal(batchManager.length, 3);
	});

	it("BatchManager: soft limit is higher than hard limit", () => {
		const batchManager = new BatchManager({ hardLimit, softLimit: hardLimit * 2 });
		const twoThird = Math.floor((hardLimit * 2) / 3);
		const message = { contents: generateStringOfSize(twoThird) } as any as BatchMessage;
		const largeMessage = {
			contents: generateStringOfSize(hardLimit + 1),
		} as any as BatchMessage;

		// Can't push very large message, above hard limit
		assert.equal(batchManager.push(largeMessage, /* reentrant */ false), false);
		assert.equal(batchManager.length, 0);

		// Can push one message
		assert.equal(batchManager.push(message, /* reentrant */ false), true);
		assert.equal(batchManager.length, 1);

		// Can't push second message
		assert.equal(batchManager.push(message, /* reentrant */ false), false);
		assert.equal(batchManager.length, 1);

		// Pop and check batch
		const batch = batchManager.popBatch();
		assert.equal(batch.content.length, 1);
	});

	it("BatchManager: 'infinity' hard limit allows everything", () => {
		const message = { contents: generateStringOfSize(softLimit) } as any as BatchMessage;
		const batchManager = new BatchManager({ hardLimit: Infinity });

		for (let i = 1; i <= 10; i++) {
			assert.equal(batchManager.push(message, /* reentrant */ false), true);
			assert.equal(batchManager.length, i);
		}
	});

	it("Batch metadata is set correctly", () => {
		const batchManager = new BatchManager({ hardLimit });
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
		assert.equal(batch.content[0].metadata?.batch, true);
		assert.equal(batch.content[1].metadata?.batch, undefined);
		assert.equal(batch.content[2].metadata?.batch, false);

		assert.equal(
			batchManager.push(
				{ ...smallMessage(), referenceSequenceNumber: 0 },
				/* reentrant */ false,
			),
			true,
		);
		const singleOpBatch = batchManager.popBatch();
		assert.equal(singleOpBatch.content[0].metadata?.batch, undefined);
	});

	it("Batch content size is tracked correctly", () => {
		const batchManager = new BatchManager({ hardLimit });
		assert.equal(batchManager.push(smallMessage(), /* reentrant */ false), true);
		assert.equal(batchManager.contentSizeInBytes, smallMessageSize * batchManager.length);
		assert.equal(batchManager.push(smallMessage(), /* reentrant */ false), true);
		assert.equal(batchManager.contentSizeInBytes, smallMessageSize * batchManager.length);
		assert.equal(batchManager.push(smallMessage(), /* reentrant */ false), true);
		assert.equal(batchManager.contentSizeInBytes, smallMessageSize * batchManager.length);
	});

	it("Batch reference sequence number maps to the last message", () => {
		const batchManager = new BatchManager({ hardLimit });
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
		const batchManager = new BatchManager({ hardLimit });
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
		const batchManager = new BatchManager({ hardLimit });
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
