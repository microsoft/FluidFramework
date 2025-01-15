/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "assert";
import * as crypto from "crypto";

import { IBatchMessage } from "@fluidframework/container-definitions/internal";
import { ContainerMessageType } from "@fluidframework/container-runtime-previous/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";

import { CompressionAlgorithms } from "../../containerRuntime.js";
import {
	BatchMessage,
	IChunkedOp,
	OpSplitter,
	isChunkedMessage,
	splitOp,
} from "../../opLifecycle/index.js";

function typeFromBatchedOp(op: IBatchMessage) {
	assert(op.contents !== undefined);
	return JSON.parse(op.contents).type as string;
}

describe("OpSplitter", () => {
	const batchesSubmitted: { messages: IBatchMessage[]; referenceSequenceNumber?: number }[] =
		[];

	const mockSubmitBatchFn = (
		batch: IBatchMessage[],
		referenceSequenceNumber?: number,
	): number => {
		batchesSubmitted.push({ messages: batch, referenceSequenceNumber });
		return batchesSubmitted.length;
	};

	beforeEach(() => {
		batchesSubmitted.splice(0);
		mockLogger.clear();
	});

	const chunkSizeInBytes = 50 * 1024;
	const maxBatchSizeInBytes = 10 * 50 * 1024;
	const mockLogger = new MockLogger();

	it("Reconstruct original chunked op", () => {
		const op1 = generateChunkableOp(chunkSizeInBytes * 2);
		const op2 = generateChunkableOp(chunkSizeInBytes * 3);
		const chunks1 = wrapChunkedOps(splitOp(op1, chunkSizeInBytes), "testClient1");
		const chunks2 = wrapChunkedOps(splitOp(op2, chunkSizeInBytes), "testClient2");
		const opSplitter = new OpSplitter(
			[],
			mockSubmitBatchFn,
			0,
			maxBatchSizeInBytes,
			mockLogger,
		);

		assert.equal(opSplitter.processChunk(chunks1[0]).isFinalChunk, false);
		assert.equal(opSplitter.processChunk(chunks2[0]).isFinalChunk, false);

		assert.equal(opSplitter.processChunk(chunks1[1]).isFinalChunk, false);
		assert.equal(opSplitter.processChunk(chunks2[1]).isFinalChunk, false);

		const chunks1LastResult = opSplitter.processChunk(chunks1[2]);
		// The last chunk will reconstruct the original message
		assert.equal(chunks1LastResult.isFinalChunk, true);
		assertSameMessage(chunks1LastResult.message, op1);
		assert.equal(opSplitter.chunks.size, 1);

		assert.equal(opSplitter.processChunk(chunks2[2]).isFinalChunk, false);

		const chunks2LastResult = opSplitter.processChunk(chunks2[3]);
		// The last chunk will reconstruct the original message
		assert.equal(chunks2LastResult.isFinalChunk, true);
		assertSameMessage(chunks2LastResult.message, op2);

		assert.equal(opSplitter.chunks.size, 0);
	});

	it("Reconstruct original chunked op with extra empty op", () => {
		const op1 = generateChunkableOp(chunkSizeInBytes * 2);
		const op2 = generateChunkableOp(chunkSizeInBytes * 3);
		const chunks1 = wrapChunkedOps(splitOp(op1, chunkSizeInBytes, true), "testClient1");
		const chunks2 = wrapChunkedOps(splitOp(op2, chunkSizeInBytes, true), "testClient2");
		const opSplitter = new OpSplitter(
			[],
			mockSubmitBatchFn,
			0,
			maxBatchSizeInBytes,
			mockLogger,
		);

		assert.equal(opSplitter.processChunk(chunks1[0]).isFinalChunk, false);
		assert.equal(opSplitter.processChunk(chunks2[0]).isFinalChunk, false);

		assert.equal(opSplitter.processChunk(chunks1[1]).isFinalChunk, false);
		assert.equal(opSplitter.processChunk(chunks2[1]).isFinalChunk, false);

		assert.equal(opSplitter.processChunk(chunks1[2]).isFinalChunk, false);

		const chunks1LastResult = opSplitter.processChunk(chunks1[3]);
		// The last chunk will reconstruct the original message
		assert.equal(chunks1LastResult.isFinalChunk, true);
		assertSameMessage(chunks1LastResult.message, op1);
		assert.equal(opSplitter.chunks.size, 1);

		assert.equal(opSplitter.processChunk(chunks2[2]).isFinalChunk, false);
		assert.equal(opSplitter.processChunk(chunks2[3]).isFinalChunk, false);

		const chunks2LastResult = opSplitter.processChunk(chunks2[4]);
		// The last chunk will reconstruct the original message
		assert.equal(chunks2LastResult.isFinalChunk, true);
		assertSameMessage(chunks2LastResult.message, op2);

		assert.equal(opSplitter.chunks.size, 0);
	});

	it("Reconstruct original chunked op with initial chunks", () => {
		const op = generateChunkableOp(chunkSizeInBytes * 3);
		const chunks = wrapChunkedOps(splitOp(op, chunkSizeInBytes), "testClient");
		const opSplitter = new OpSplitter(
			[],
			mockSubmitBatchFn,
			0,
			maxBatchSizeInBytes,
			mockLogger,
		);
		opSplitter.processChunk(chunks[0]);
		opSplitter.processChunk(chunks[1]);

		const otherOpSplitter = new OpSplitter(
			Array.from(opSplitter.chunks),
			mockSubmitBatchFn,
			0,
			maxBatchSizeInBytes,
			mockLogger,
		);
		opSplitter.clearPartialChunks("testClient");

		otherOpSplitter.processChunk(chunks[2]);

		const processResult = otherOpSplitter.processChunk(chunks[3]);
		assert.equal(processResult.isFinalChunk, true);
		assertSameMessage(processResult.message, op);
	});

	it("Clear chunks", () => {
		const chunks = wrapChunkedOps(
			splitOp(generateChunkableOp(chunkSizeInBytes * 3), chunkSizeInBytes),
			"testClient",
		);
		const opSplitter = new OpSplitter(
			[],
			mockSubmitBatchFn,
			0,
			maxBatchSizeInBytes,
			mockLogger,
		);
		opSplitter.processChunk(chunks[0]);

		assert.equal(opSplitter.chunks.size, 1);
		opSplitter.clearPartialChunks("noClient");
		assert.equal(opSplitter.chunks.size, 1);
		opSplitter.clearPartialChunks("testClient");
		assert.equal(opSplitter.chunks.size, 0);
	});

	it("Throw when processing out-of-order chunks", () => {
		const chunks = wrapChunkedOps(
			splitOp(generateChunkableOp(chunkSizeInBytes * 3), chunkSizeInBytes),
			"testClient1",
		);
		const opSplitter = new OpSplitter(
			[],
			mockSubmitBatchFn,
			0,
			maxBatchSizeInBytes,
			mockLogger,
		);
		assert.throws(() => opSplitter.processChunk(chunks[2]));
	});

	it("Don't accept non-chunked ops", () => {
		const chunks = wrapChunkedOps(
			splitOp(generateChunkableOp(chunkSizeInBytes * 3), chunkSizeInBytes),
			"testClient1",
		).map((op) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(op.contents as any).type = ContainerMessageType.FluidDataStoreOp;
			return op;
		});
		const opSplitter = new OpSplitter(
			[],
			mockSubmitBatchFn,
			0,
			maxBatchSizeInBytes,
			mockLogger,
		);
		for (const op of chunks) {
			assert.deepStrictEqual(isChunkedMessage(op), false);
			assert.throws(() => opSplitter.processChunk(op));
		}
	});

	it("Chunk metadata", () => {
		const originalOp = generateChunkableOp(chunkSizeInBytes * 4);
		const chunks = splitOp(originalOp, chunkSizeInBytes);
		assert.equal(
			chunks
				.slice(0, -1)
				.every(
					(chunk) =>
						chunk.originalCompression === undefined && chunk.originalMetadata === undefined,
				),
			true,
		);

		const lastChunk = chunks[chunks.length - 1];
		assert.deepStrictEqual(lastChunk.originalMetadata, originalOp.metadata);
		assert.equal(lastChunk.originalCompression, originalOp.compression);
	});

	it("Batch split invariants", () => {
		const opSplitter = new OpSplitter(
			[],
			mockSubmitBatchFn,
			50,
			maxBatchSizeInBytes,
			mockLogger,
		);
		const regularMessage = generateChunkableOp(20);
		const compressedMessage = { ...regularMessage, metadata: { compressed: true } };

		// Empty batch
		assert.throws(() =>
			opSplitter.splitFirstBatchMessage({
				messages: [compressedMessage],
				contentSizeInBytes: 0,
				referenceSequenceNumber: 0,
			}),
		);

		// Empty batch
		assert.throws(() =>
			opSplitter.splitFirstBatchMessage({
				messages: [],
				contentSizeInBytes: 1,
				referenceSequenceNumber: 0,
			}),
		);

		// Batch is too small to be chunked
		assert.throws(() =>
			opSplitter.splitFirstBatchMessage({
				messages: [compressedMessage],
				contentSizeInBytes: 1,
				referenceSequenceNumber: 0,
			}),
		);

		// Batch is not compressed
		assert.throws(() =>
			opSplitter.splitFirstBatchMessage({
				messages: [regularMessage],
				contentSizeInBytes: 3,
				referenceSequenceNumber: 0,
			}),
		);

		// Misconfigured op splitter
		assert.throws(() =>
			new OpSplitter(
				[],
				mockSubmitBatchFn,
				0,
				maxBatchSizeInBytes,
				mockLogger,
			).splitFirstBatchMessage({
				messages: [compressedMessage],
				contentSizeInBytes: 3,
				referenceSequenceNumber: 0,
			}),
		);

		// Old loader
		assert.throws(() =>
			new OpSplitter([], undefined, 0, maxBatchSizeInBytes, mockLogger).splitFirstBatchMessage(
				{
					messages: [compressedMessage],
					contentSizeInBytes: 3,
					referenceSequenceNumber: 0,
				},
			),
		);

		// Misconfigured op splitter
		assert.throws(() =>
			new OpSplitter([], mockSubmitBatchFn, 2, 1, mockLogger).splitFirstBatchMessage({
				messages: [compressedMessage],
				contentSizeInBytes: 3,
				referenceSequenceNumber: 0,
			}),
		);

		// Not enabled
		assert.throws(() =>
			new OpSplitter(
				[],
				mockSubmitBatchFn,
				Number.POSITIVE_INFINITY,
				maxBatchSizeInBytes,
				mockLogger,
			).splitFirstBatchMessage({
				messages: [compressedMessage],
				contentSizeInBytes: 3,
				referenceSequenceNumber: 0,
			}),
		);
	});

	describe("Compressed batches", () => {
		[false, true].forEach((extraOp) => {
			it(`Split compressed batch with multiple messages with${
				extraOp ? "" : "out"
			} extra empty op.`, () => {
				const chunkSize = 20;
				const opSplitter = new OpSplitter(
					[],
					mockSubmitBatchFn,
					chunkSize,
					extraOp ? chunkSize * 2 : maxBatchSizeInBytes,
					mockLogger,
				);
				const largeMessage = generateChunkableOp(100);
				const emptyMessage = generateChunkableOp(0);

				const result = opSplitter.splitFirstBatchMessage({
					messages: [largeMessage, emptyMessage, emptyMessage, emptyMessage],
					contentSizeInBytes: largeMessage.contents?.length ?? 0,
					referenceSequenceNumber: 0,
				});

				assert.equal(batchesSubmitted.length, 5 + (extraOp ? 1 : 0));
				for (const batch of batchesSubmitted) {
					assert.equal(batch.messages.length, 1);
					assert.equal(typeFromBatchedOp(batch.messages[0]), ContainerMessageType.ChunkedOp);
					assert.equal(batch.referenceSequenceNumber, 0);
				}

				assert.equal(result.messages.length, 4);
				const lastChunk = JSON.parse(result.messages[0].contents!).contents as IChunkedOp;
				assert.equal(lastChunk.chunkId, lastChunk.totalChunks);
				assert.deepStrictEqual(result.messages.slice(1), new Array(3).fill(emptyMessage));
				assert.equal(
					!extraOp ||
						JSON.parse(result.messages[0].contents!).contents?.contents?.length === 0,
					true,
				);
				assert.notEqual(result.contentSizeInBytes, largeMessage.contents?.length ?? 0);
				const contentSentSeparately = batchesSubmitted.map(
					(x) =>
						(JSON.parse((x.messages[0] as BatchMessage).contents!).contents as IChunkedOp)
							.contents,
				);
				const sentContent = [...contentSentSeparately, lastChunk.contents].reduce(
					(accumulator, current) => `${accumulator}${current}`,
				);
				assert.equal(sentContent, largeMessage.contents);

				assert(
					mockLogger.matchEvents([
						{
							eventName: "OpSplitter:CompressedChunkedBatch",
							length: result.messages.length,
							chunks: 100 / 20 + 1 + (extraOp ? 1 : 0),
							chunkSizeInBytes: 20,
						},
					]),
				);
			});

			it(`Split compressed batch with single message with${
				extraOp ? "" : "out"
			} extra empty op.`, () => {
				const chunkSize = 20;
				const opSplitter = new OpSplitter(
					[],
					mockSubmitBatchFn,
					20,
					extraOp ? chunkSize * 2 : maxBatchSizeInBytes,
					mockLogger,
				);
				const largeMessage = generateChunkableOp(100);

				const result = opSplitter.splitFirstBatchMessage({
					messages: [largeMessage],
					contentSizeInBytes: largeMessage.contents?.length ?? 0,
					referenceSequenceNumber: 0,
				});

				assert.equal(batchesSubmitted.length, 5 + (extraOp ? 1 : 0));
				for (const batch of batchesSubmitted) {
					assert.equal(batch.messages.length, 1);
					assert.equal(typeFromBatchedOp(batch.messages[0]), ContainerMessageType.ChunkedOp);
					assert.equal(batch.referenceSequenceNumber, 0);
				}

				assert.equal(result.messages.length, 1);
				assert.notEqual(result.contentSizeInBytes, largeMessage.contents?.length ?? 0);
				const lastChunk = JSON.parse(result.messages[0].contents!).contents as IChunkedOp;
				assert.equal(lastChunk.chunkId, lastChunk.totalChunks);
				assert.equal(
					!extraOp ||
						JSON.parse(result.messages[0].contents!).contents?.contents?.length === 0,
					true,
				);
				assert.notEqual(result.contentSizeInBytes, largeMessage.contents?.length ?? 0);
				const contentSentSeparately = batchesSubmitted.map(
					(x) =>
						(JSON.parse((x.messages[0] as BatchMessage).contents!).contents as IChunkedOp)
							.contents,
				);
				const sentContent = [...contentSentSeparately, lastChunk.contents].reduce(
					(accumulator, current) => `${accumulator}${current}`,
				);
				assert.equal(sentContent, largeMessage.contents);

				assert(
					mockLogger.matchEvents([
						{
							eventName: "OpSplitter:CompressedChunkedBatch",
							length: result.messages.length,
							chunks: 100 / 20 + 1 + (extraOp ? 1 : 0),
							chunkSizeInBytes: 20,
						},
					]),
				);
			});
		});
	});
	const assertSameMessage = (result: ISequencedDocumentMessage, original: BatchMessage) => {
		assert.deepStrictEqual(result.contents, JSON.parse(original.contents!));
		// type = "component" is used to force 1.3 to crash on compressed & chunked ops, as it does not understand it.
		// 2.x does not care about type, as it will get right type after decompressing the op.
		// see code & comment in splitOp()
		assert.strictEqual(result.type, "component");
		assert.strictEqual(result.metadata, original.metadata);
		assert.strictEqual(result.compression, original.compression);
	};

	const generateChunkableOp = (contentSizeInBytes: number): BatchMessage => {
		const contents = {
			// There should be a type here, but there is no validation for that,
			// and tests would need to be adjusted (sizing and assumptions) if we add it here.
			// type: ContainerMessageType.FluidDataStoreOp,
			value: crypto.randomBytes(contentSizeInBytes / 2).toString("hex"),
		};
		return {
			referenceSequenceNumber: Infinity,
			metadata: { meta: "data" },
			compression: CompressionAlgorithms.lz4,
			contents: JSON.stringify(contents),
		};
	};

	const wrapChunkedOps = (ops: IChunkedOp[], clientId: string): ISequencedDocumentMessage[] =>
		ops.map((op) => {
			const result = {
				contents: {
					type: ContainerMessageType.ChunkedOp,
					contents: op,
				},
				clientId,
			};

			return result as ISequencedDocumentMessage;
		});
});
