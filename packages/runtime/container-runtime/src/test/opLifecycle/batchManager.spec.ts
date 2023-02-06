/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { BatchManager, BatchMessage } from "../../opLifecycle";
import { ContainerMessageType } from "../../containerRuntime";

describe("BatchManager", () => {
	const mockLogger = new MockLogger();
	const softLimit = 1024;
	const hardLimit = 950 * 1024;
	const smallMessageSize = 10;

	beforeEach(() => {
		mockLogger.clear();
	});

	const generateStringOfSize = (sizeInBytes: number): string =>
		new Array(sizeInBytes + 1).join("0");

	const smallMessage = (): BatchMessage =>
		({
			contents: generateStringOfSize(smallMessageSize),
			deserializedContent: { type: ContainerMessageType.FluidDataStoreOp },
		} as any as BatchMessage);

	it("BatchManager's soft limit: a bunch of small messages", () => {
		const message = { contents: generateStringOfSize(softLimit / 2) } as any as BatchMessage;
		const batchManager = new BatchManager({ hardLimit, softLimit }, mockLogger);

		// Can push one large message
		assert.equal(batchManager.push(message), true);
		assert.equal(batchManager.length, 1);

		// Can't push another large message
		assert.equal(batchManager.push(message), false);
		assert.equal(batchManager.length, 1);

		// But can push one small message
		assert.equal(batchManager.push(smallMessage()), true);
		assert.equal(batchManager.length, 2);

		// Pop and check batch
		const batch = batchManager.popBatch();
		assert.equal(batch.content.length, 2);
		assert.equal(batch.contentSizeInBytes, softLimit / 2 + smallMessageSize);

		// Validate that can push large message again
		assert.equal(batchManager.push(message), true);
		assert.equal(batchManager.length, 1);

		assert.equal(batchManager.push(message), false);
		assert.equal(batchManager.length, 1);
	});

	it("BatchManager's soft limit: single large message", () => {
		const message = { contents: generateStringOfSize(softLimit * 2) } as any as BatchMessage;
		const batchManager = new BatchManager({ hardLimit, softLimit }, mockLogger);

		// Can push one large message, even above soft limit
		assert.equal(batchManager.push(message), true);
		assert.equal(batchManager.length, 1);

		// Can't push another small message
		assert.equal(batchManager.push(smallMessage()), false);
		assert.equal(batchManager.length, 1);

		// Pop and check batch
		const batch = batchManager.popBatch();
		assert.equal(batch.content.length, 1);
		assert.equal(batch.contentSizeInBytes, softLimit * 2);

		// Validate that we can't push large message above soft limit if we have already at least one message.
		assert.equal(batchManager.push(smallMessage()), true);
		assert.equal(batchManager.length, 1);

		assert.equal(batchManager.push(message), false);
		assert.equal(batchManager.length, 1);
	});

	it("BatchManager: no soft limit", () => {
		const batchManager = new BatchManager({ hardLimit }, mockLogger);
		const third = Math.floor(hardLimit / 3) + 1;
		const message = { contents: generateStringOfSize(third) } as any as BatchMessage;

		// Can push one large message, even above soft limit
		assert.equal(batchManager.push(message), true);
		assert.equal(batchManager.length, 1);

		// Can push second large message, even above soft limit
		assert.equal(batchManager.push(message), true);
		assert.equal(batchManager.length, 2);

		// Can't push another message
		assert.equal(batchManager.push(message), false);
		assert.equal(batchManager.length, 2);

		// Pop and check batch
		const batch = batchManager.popBatch();
		assert.equal(batch.content.length, 2);

		// Can push messages again
		assert.equal(batchManager.push(message), true);
		assert.equal(batchManager.length, 1);

		assert.equal(batchManager.push(message), true);
		assert.equal(batchManager.length, 2);

		assert.equal(batchManager.push(smallMessage()), true);
		assert.equal(batchManager.length, 3);
	});

	it("BatchManager: soft limit is higher than hard limit", () => {
		const batchManager = new BatchManager({ hardLimit, softLimit: hardLimit * 2 }, mockLogger);
		const twoThird = Math.floor((hardLimit * 2) / 3);
		const message = { contents: generateStringOfSize(twoThird) } as any as BatchMessage;
		const largeMessage = {
			contents: generateStringOfSize(hardLimit + 1),
		} as any as BatchMessage;

		// Can't push very large message, above hard limit
		assert.equal(batchManager.push(largeMessage), false);
		assert.equal(batchManager.length, 0);

		// Can push one message
		assert.equal(batchManager.push(message), true);
		assert.equal(batchManager.length, 1);

		// Can't push second message
		assert.equal(batchManager.push(message), false);
		assert.equal(batchManager.length, 1);

		// Pop and check batch
		const batch = batchManager.popBatch();
		assert.equal(batch.content.length, 1);
	});

	it("BatchManager: 'infinity' hard limit allows everything", () => {
		const message = { contents: generateStringOfSize(softLimit) } as any as BatchMessage;
		const batchManager = new BatchManager({ hardLimit: Infinity }, mockLogger);

		for (let i = 1; i <= 10; i++) {
			assert.equal(batchManager.push(message), true);
			assert.equal(batchManager.length, i);
		}
	});

	it("Batch metadata is set correctly", () => {
		const batchManager = new BatchManager({ hardLimit }, mockLogger);
		assert.equal(batchManager.push({ ...smallMessage(), referenceSequenceNumber: 0 }), true);
		assert.equal(batchManager.push({ ...smallMessage(), referenceSequenceNumber: 1 }), true);
		assert.equal(batchManager.push({ ...smallMessage(), referenceSequenceNumber: 2 }), true);

		const batch = batchManager.popBatch();
		assert.equal(batch.content[0].metadata?.batch, true);
		assert.equal(batch.content[1].metadata?.batch, undefined);
		assert.equal(batch.content[2].metadata?.batch, false);

		assert.equal(batchManager.push({ ...smallMessage(), referenceSequenceNumber: 0 }), true);
		const singleOpBatch = batchManager.popBatch();
		assert.equal(singleOpBatch.content[0].metadata?.batch, undefined);
	});

	it("Batch content size is tracked correctly", () => {
		const batchManager = new BatchManager({ hardLimit }, mockLogger);
		assert.equal(batchManager.push(smallMessage()), true);
		assert.equal(batchManager.contentSizeInBytes, smallMessageSize * batchManager.length);
		assert.equal(batchManager.push(smallMessage()), true);
		assert.equal(batchManager.contentSizeInBytes, smallMessageSize * batchManager.length);
		assert.equal(batchManager.push(smallMessage()), true);
		assert.equal(batchManager.contentSizeInBytes, smallMessageSize * batchManager.length);
	});

	it("Don't verify op ordering by default", () => {
		const batchManager = new BatchManager({ hardLimit }, mockLogger);
		assert.equal(batchManager.push({ ...smallMessage(), referenceSequenceNumber: 0 }), true);
		assert.equal(batchManager.push({ ...smallMessage(), referenceSequenceNumber: 0 }), true);
		assert.equal(batchManager.push({ ...smallMessage(), referenceSequenceNumber: 1 }), true);
	});

	it("Verify op ordering if requested", () => {
		const batchManager = new BatchManager(
			{ enableOpReentryCheck: true, hardLimit },
			mockLogger,
		);
		assert.equal(batchManager.push({ ...smallMessage(), referenceSequenceNumber: 0 }), true);
		assert.equal(batchManager.push({ ...smallMessage(), referenceSequenceNumber: 0 }), true);
		assert.throws(() => batchManager.push({ ...smallMessage(), referenceSequenceNumber: 1 }));
	});

	it("Don't verify op ordering by default, but log at most 5 events when it occurs", () => {
		const batchManager = new BatchManager({ hardLimit }, mockLogger);
		assert.equal(batchManager.push({ ...smallMessage(), referenceSequenceNumber: 0 }), true);
		assert.equal(batchManager.push({ ...smallMessage(), referenceSequenceNumber: 0 }), true);

		for (let i = 0; i < 10; i++) {
			assert.equal(
				batchManager.push({ ...smallMessage(), referenceSequenceNumber: 1 }),
				true,
			);
		}

		mockLogger.assertMatch(
			new Array(5).fill({
				eventName: "BatchManager:ReferenceSequenceNumberMismatch",
				category: "error",
				enableOpReentryCheck: false,
			}),
		);
	});

	it("Verify op ordering if requested and log all instances before throwing", () => {
		const batchManager = new BatchManager(
			{ enableOpReentryCheck: true, hardLimit },
			mockLogger,
		);
		assert.equal(batchManager.push({ ...smallMessage(), referenceSequenceNumber: 0 }), true);
		assert.equal(batchManager.push({ ...smallMessage(), referenceSequenceNumber: 0 }), true);

		for (let i = 0; i < 10; i++) {
			assert.throws(() =>
				batchManager.push({ ...smallMessage(), referenceSequenceNumber: 1 }),
			);
		}

		mockLogger.assertMatch(
			new Array(10).fill({
				eventName: "BatchManager:ReferenceSequenceNumberMismatch",
				category: "error",
				enableOpReentryCheck: true,
			}),
		);
	});
});
