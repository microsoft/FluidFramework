/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ContainerMessageType } from "../../messageTypes.js";
import type { IBatchMetadata } from "../../metadata.js";
import {
	BatchManager,
	BatchMessage,
	IBatchManagerOptions,
	estimateSocketSize,
	generateBatchId,
} from "../../opLifecycle/index.js";

describe("BatchManager", () => {
	const hardLimit = 950 * 1024;
	const smallMessageSize = 10;
	const defaultOptions: IBatchManagerOptions = {
		hardLimit,
		canRebase: true,
	};

	const generateStringOfSize = (sizeInBytes: number): string =>
		new Array(sizeInBytes + 1).join("0");

	const smallMessage = (): BatchMessage =>
		({
			contents: generateStringOfSize(smallMessageSize),
			type: ContainerMessageType.FluidDataStoreOp,
		}) as unknown as BatchMessage;

	it("BatchManager: 'infinity' hard limit allows everything", () => {
		const message = { contents: generateStringOfSize(1024) } as unknown as BatchMessage;
		const batchManager = new BatchManager({ ...defaultOptions, hardLimit: Infinity });

		for (let i = 1; i <= 10; i++) {
			assert.equal(batchManager.push(message, /* reentrant */ false), true);
			assert.equal(batchManager.length, i);
		}
	});

	[true, false].forEach((includeBatchId) =>
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
		}),
	);

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
		assert.equal(batchManager.contentSizeInBytes, smallMessageSize * batchManager.length);
		assert.equal(batchManager.push(smallMessage(), /* reentrant */ false), true);
		assert.equal(batchManager.contentSizeInBytes, smallMessageSize * batchManager.length);
		assert.equal(batchManager.push(smallMessage(), /* reentrant */ false), true);
		assert.equal(batchManager.contentSizeInBytes, smallMessageSize * batchManager.length);
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

	it("Batch size estimates", () => {
		const batchManager = new BatchManager(defaultOptions);
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
				} as unknown as BatchMessage,
				/* reentrant */ false,
			); // empty op
		}

		// 10 bytes of content + 200 bytes overhead x 10
		assert.equal(estimateSocketSize(batchManager.popBatch()), 2010);
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
});
