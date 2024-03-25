/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "@fluid-internal/client-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { BatchTracker } from "../batchTracker.js";

describe("Runtime", () => {
	const emitter = new EventEmitter();
	let mockLogger: MockLogger;

	beforeEach(() => {
		mockLogger = new MockLogger();
	});

	it("Track only batches with op count over a threshold", () => {
		let ticks = 0;
		new BatchTracker(emitter, mockLogger, 5, 100, () => ticks);

		emitter.emit("batchBegin", batchMessage(2));
		emitter.emit("batchEnd", /* error */ undefined, batchMessage(5));

		emitter.emit("batchBegin", batchMessage(1));
		ticks += 10;
		emitter.emit("batchEnd", /* error */ undefined, batchMessage(5));

		emitter.emit("batchBegin", batchMessage(1));
		ticks += 20;
		emitter.emit("batchEnd", new Error(), batchMessage(8));

		mockLogger.assertMatch([
			{
				eventName: "Batching:LengthTooBig",
				length: 5,
				threshold: 5,
				batchEndSequenceNumber: 5,
				duration: 10,
				batchError: false,
				category: "performance",
			},
			{
				eventName: "Batching:LengthTooBig",
				length: 8,
				threshold: 5,
				batchEndSequenceNumber: 8,
				duration: 20,
				batchError: true,
				category: "performance",
			},
		]);
	});

	it("Track batch sizes based on rate", async () => {
		let ticks = 0;
		new BatchTracker(emitter, mockLogger, 100, 3, () => ticks);

		for (let i = 1; i <= 10; i++) {
			emitter.emit("batchBegin", batchMessage(1));
			ticks += i;
			emitter.emit("batchEnd", /* error */ undefined, batchMessage(i));
		}

		mockLogger.assertMatch([
			{
				eventName: "Batching:Length",
				length: 3,
				samplingRate: 3,
				batchEndSequenceNumber: 3,
				duration: 3,
				category: "performance",
			},
			{
				eventName: "Batching:Length",
				length: 6,
				samplingRate: 3,
				batchEndSequenceNumber: 6,
				duration: 6,
				category: "performance",
			},
			{
				eventName: "Batching:Length",
				length: 9,
				samplingRate: 3,
				batchEndSequenceNumber: 9,
				duration: 9,
				category: "performance",
			},
		]);
	});

	const batchMessage = (sequenceNumber: number): ISequencedDocumentMessage =>
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		({
			sequenceNumber,
			referenceSequenceNumber: sequenceNumber,
		}) as ISequencedDocumentMessage;
});
