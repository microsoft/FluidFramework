/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { ContainerMessageType } from "../../index.js";
import { BatchMessage, IBatch, OpCompressor } from "../../opLifecycle/index.js";

describe("OpCompressor", () => {
	let compressor: OpCompressor;
	const mockLogger = new MockLogger();
	beforeEach(() => {
		compressor = new OpCompressor(mockLogger);
		mockLogger.clear();
	});

	const createBatch = (length: number, messageSize: number) =>
		messagesToBatch(new Array(length).fill(createMessage(generateStringOfSize(messageSize))));
	const messagesToBatch = (messages: BatchMessage[]): IBatch => ({
		content: messages,
		contentSizeInBytes: messages
			.map((message) => JSON.stringify(message).length)
			.reduce((a, b) => a + b),
		referenceSequenceNumber: messages[0].referenceSequenceNumber,
	});
	const createMessage = (contents: string) => ({
		metadata: { flag: true },
		localOpMetadata: undefined,
		type: ContainerMessageType.FluidDataStoreOp,
		contents,
		referenceSequenceNumber: 0,
	});
	const generateStringOfSize = (sizeInBytes: number): string =>
		new Array(sizeInBytes + 1).join("0");
	const toMB = (bytes: number) => (bytes / (1024 * 1024)).toFixed(2);

	describe("Compressing batches", () =>
		[
			// small batch with one small message
			createBatch(1, 100 * 1024),
			// small batch with small messages
			createBatch(10, 100 * 1024),
			// small batch with large messages
			createBatch(2, 100 * 1024 * 1024),
			// large batch with small messages
			createBatch(1000, 100 * 1024),
		].forEach((batch) => {
			it(`Batch of ${batch.content.length} ops of total size ${toMB(
				batch.contentSizeInBytes,
			)} MB`, () => {
				const compressedBatch = compressor.compressBatch(batch);
				assert.strictEqual(compressedBatch.content.length, batch.content.length);
				assert.strictEqual(compressedBatch.content[0].compression, "lz4");
				assert.strictEqual(compressedBatch.content[0].metadata?.flag, true);
				if (compressedBatch.content.length > 1) {
					assert.strictEqual(compressedBatch.content[1].contents, undefined);
					assert.strictEqual(compressedBatch.content[1].compression, undefined);
					assert.strictEqual(compressedBatch.content[1].contents, undefined);
				}
			}).timeout(3000);
		}));

	describe("Unsupported batches", () =>
		[
			// large batch with small messages
			createBatch(6000, 100 * 1024),
			// small batch with large messages
			createBatch(6, 100 * 1024 * 1024),
		].forEach((batch) => {
			it(`Not compressing batch of ${batch.content.length} ops of total size ${toMB(
				batch.contentSizeInBytes,
			)} MB`, () => {
				assert.throws(() => compressor.compressBatch(batch));
				mockLogger.assertMatch([
					{
						eventName: "OpCompressor:BatchTooLarge",
						category: "error",
						length: batch.content.length,
						size: batch.contentSizeInBytes,
					},
				]);
			});
		}));
});
