/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { MockLogger } from "@fluidframework/telemetry-utils/internal";

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
		messages,
		contentSizeInBytes: messages
			.map((message) => JSON.stringify(message).length)
			.reduce((a, b) => a + b),
		referenceSequenceNumber: messages[0].referenceSequenceNumber,
	});
	const createMessage = (contents: string) => ({
		metadata: { flag: true },
		type: ContainerMessageType.FluidDataStoreOp,
		contents,
		referenceSequenceNumber: 0,
	});
	const generateStringOfSize = (sizeInBytes: number): string =>
		new Array(sizeInBytes + 1).join("0");
	const toMB = (bytes: number) => (bytes / (1024 * 1024)).toFixed(2);

	describe("Compressing batches", () => {
		for (const batch of [
			// batch with one small message
			createBatch(1, 100 * 1024),
			// batch with one large message
			createBatch(1, 100 * 100 * 1024),
		]) {
			it(`Batch of ${batch.messages.length} ops of total size ${toMB(
				batch.contentSizeInBytes,
			)} MB`, () => {
				const compressedBatch = compressor.compressBatch(batch);
				assert.strictEqual(compressedBatch.messages.length, batch.messages.length);
				assert.strictEqual(compressedBatch.messages[0].compression, "lz4");
				assert.strictEqual(compressedBatch.messages[0].metadata?.flag, true);
			}).timeout(3000);
		}
	});

	describe("Unsupported batches", () => {
		for (const batch of [
			// large batch with small messages
			createBatch(6000, 100 * 1024),
			// small batch with large messages
			createBatch(6, 100 * 1024 * 1024),
		]) {
			it(`Not compressing batch of ${batch.messages.length} ops of total size ${toMB(
				batch.contentSizeInBytes,
			)} MB`, () => {
				assert.throws(
					() => {
						compressor.compressBatch(batch);
					},
					(error: Error) => {
						assert.strictEqual(
							error.message,
							"0x5a4" /* Batch should not be empty and should contain a single message */,
						);
						return true;
					},
					"Expected error was not thrown",
				);
			});
		}
	});
});
