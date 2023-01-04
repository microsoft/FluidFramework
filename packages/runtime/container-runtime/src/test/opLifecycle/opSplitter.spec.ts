/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as crypto from "crypto";
import { strict as assert } from "assert";
import { ContainerMessageType } from "@fluidframework/container-runtime-previous";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IBatchMessage } from "@fluidframework/container-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { BatchMessage, IChunkedOp, OpSplitter, splitOp } from "../../opLifecycle";
import { CompressionAlgorithms } from "../../containerRuntime";

describe("OpSplitter", () => {
    const batchesSubmitted: IBatchMessage[][] = [];

    const mockSubmitBatchFn = (batch: IBatchMessage[]): number => {
        batchesSubmitted.push(batch);
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
        const opSplitter = new OpSplitter([], mockSubmitBatchFn, 0, maxBatchSizeInBytes, mockLogger);

        assert.equal(opSplitter.processRemoteMessage(chunks1[0]).state, "Accepted");
        assert.equal(opSplitter.processRemoteMessage(chunks2[0]).state, "Accepted");

        assert.equal(opSplitter.processRemoteMessage(chunks1[1]).state, "Accepted");
        assert.equal(opSplitter.processRemoteMessage(chunks2[1]).state, "Accepted");

        const chunks1LastResult = opSplitter.processRemoteMessage(chunks1[2]);
        // The last chunk will reconstruct the original message
        assert.equal(chunks1LastResult.state, "Processed");
        assertSameMessage(chunks1LastResult.message, op1);
        assert.equal(opSplitter.chunks.size, 1);

        assert.equal(opSplitter.processRemoteMessage(chunks2[2]).state, "Accepted");

        const chunks2LastResult = opSplitter.processRemoteMessage(chunks2[3]);
        // The last chunk will reconstruct the original message
        assert.equal(chunks2LastResult.state, "Processed");
        assertSameMessage(chunks2LastResult.message, op2);

        assert.equal(opSplitter.chunks.size, 0);
    });

    it("Reconstruct original chunked op with initial chunks", () => {
        const op = generateChunkableOp(chunkSizeInBytes * 3);
        const chunks = wrapChunkedOps(splitOp(op, chunkSizeInBytes), "testClient");
        const opSplitter = new OpSplitter([], mockSubmitBatchFn, 0, maxBatchSizeInBytes, mockLogger);
        opSplitter.processRemoteMessage(chunks[0]);
        opSplitter.processRemoteMessage(chunks[1]);

        const otherOpSplitter = new OpSplitter(
            Array.from(opSplitter.chunks), mockSubmitBatchFn, 0, maxBatchSizeInBytes, mockLogger);
        opSplitter.clearPartialChunks("testClient");

        otherOpSplitter.processRemoteMessage(chunks[2]);;
        assertSameMessage(otherOpSplitter.processRemoteMessage(chunks[3]).message, op);
    });

    it("Clear chunks", () => {
        const chunks = wrapChunkedOps(splitOp(generateChunkableOp(chunkSizeInBytes * 3), chunkSizeInBytes), "testClient");
        const opSplitter = new OpSplitter([], mockSubmitBatchFn, 0, maxBatchSizeInBytes, mockLogger);
        opSplitter.processRemoteMessage(chunks[0]);

        assert.equal(opSplitter.chunks.size, 1);
        opSplitter.clearPartialChunks("noClient");
        assert.equal(opSplitter.chunks.size, 1);
        opSplitter.clearPartialChunks("testClient");
        assert.equal(opSplitter.chunks.size, 0);
    });

    it("Throw when processing out-of-order chunks", () => {
        const chunks = wrapChunkedOps(splitOp(generateChunkableOp(chunkSizeInBytes * 3), chunkSizeInBytes), "testClient1");
        const opSplitter = new OpSplitter([], mockSubmitBatchFn, 0, maxBatchSizeInBytes, mockLogger);
        assert.throws(() => opSplitter.processRemoteMessage(chunks[2]));
    });

    it("Don't accept non-chunked ops", () => {
        const chunks = wrapChunkedOps(splitOp(generateChunkableOp(chunkSizeInBytes * 3), chunkSizeInBytes), "testClient1")
            .map((op) => ({ ...op, type: ContainerMessageType.FluidDataStoreOp }));
        const opSplitter = new OpSplitter([], mockSubmitBatchFn, 0, maxBatchSizeInBytes, mockLogger);
        for (const op of chunks) {
            assert.deepStrictEqual(opSplitter.processRemoteMessage(op), { message: op, state: "Skipped" });
        }
    });

    it("Chunk metadata", () => {
        const originalOp = generateChunkableOp(chunkSizeInBytes * 4);
        const chunks = splitOp(originalOp, chunkSizeInBytes);
        assert.equal(
            chunks
                .slice(0, -1)
                .every((chunk) => chunk.originalCompression === undefined && chunk.originalMetadata === undefined),
            true);

        const lastChunk = chunks[chunks.length - 1];
        assert.deepStrictEqual(lastChunk.originalMetadata, originalOp.metadata);
        assert.equal(lastChunk.originalCompression, originalOp.compression);
    });

    it("Batch split invariants", () => {
        const opSplitter = new OpSplitter([], mockSubmitBatchFn, 50, maxBatchSizeInBytes, mockLogger);
        const regularMessage = generateChunkableOp(20);
        const compressedMessage = { ...regularMessage, metadata: { compressed: true } };

        // Empty batch
        assert.throws(() => opSplitter.splitCompressedBatch({
            content: [compressedMessage],
            contentSizeInBytes: 0,
        }));

        // Empty batch
        assert.throws(() => opSplitter.splitCompressedBatch({
            content: [],
            contentSizeInBytes: 1,
        }));

        // Batch is too small to be chunked
        assert.throws(() => opSplitter.splitCompressedBatch({
            content: [compressedMessage],
            contentSizeInBytes: 1,
        }));

        // Batch is not compressed
        assert.throws(() => opSplitter.splitCompressedBatch({
            content: [regularMessage],
            contentSizeInBytes: 3,
        }));

        // Misconfigured op splitter
        assert.throws(() => new OpSplitter([], mockSubmitBatchFn, 0, maxBatchSizeInBytes, mockLogger).splitCompressedBatch({
            content: [compressedMessage],
            contentSizeInBytes: 3,
        }));

        // Old loader
        assert.throws(() => new OpSplitter([], undefined, 0, maxBatchSizeInBytes, mockLogger).splitCompressedBatch({
            content: [compressedMessage],
            contentSizeInBytes: 3,
        }));

        // Misconfigured op splitter
        assert.throws(() => new OpSplitter([], mockSubmitBatchFn, 2, 1, mockLogger).splitCompressedBatch({
            content: [compressedMessage],
            contentSizeInBytes: 3,
        }));

        // Not enabled
        assert.throws(() => new OpSplitter([], mockSubmitBatchFn, Number.POSITIVE_INFINITY, maxBatchSizeInBytes, mockLogger)
            .splitCompressedBatch({
                content: [compressedMessage],
                contentSizeInBytes: 3,
            }));
    });

    it("Split compressed batch with multiple messages", () => {
        const opSplitter = new OpSplitter([], mockSubmitBatchFn, 20, maxBatchSizeInBytes, mockLogger);
        const largeMessage = generateChunkableOp(100);
        const emptyMessage = generateChunkableOp(0);

        const result = opSplitter.splitCompressedBatch({
            content: [largeMessage, emptyMessage, emptyMessage, emptyMessage],
            contentSizeInBytes: largeMessage.contents?.length ?? 0,
        });

        assert.equal(batchesSubmitted.length, 5);
        for (const batch of batchesSubmitted) {
            assert.equal(batch.length, 1);
            assert.equal((batch[0] as BatchMessage).deserializedContent.type, ContainerMessageType.ChunkedOp);
        }

        assert.equal(result.content.length, 4);
        const lastChunk = result.content[0].deserializedContent.contents as IChunkedOp;
        assert.equal(lastChunk.chunkId, lastChunk.totalChunks);
        assert.deepStrictEqual(result.content.slice(1), [emptyMessage, emptyMessage, emptyMessage]);
        assert.notEqual(result.contentSizeInBytes, largeMessage.contents?.length ?? 0);
        const contentSentSeparately = batchesSubmitted.map((x) => ((x[0] as BatchMessage).deserializedContent.contents as IChunkedOp).contents);
        const sentContent = [...contentSentSeparately, lastChunk.contents].reduce((accumulator, current) => `${accumulator}${current}`);
        assert.equal(sentContent, largeMessage.contents);

        assert(mockLogger.matchEvents([{
            eventName: "OpSplitter:Chunked compressed batch",
            length: result.content.length,
            chunks: 100 / 20 + 1,
            chunkSizeInBytes: 20,
        }]));
    });

    it("Split compressed batch with single message", () => {
        const opSplitter = new OpSplitter([], mockSubmitBatchFn, 20, maxBatchSizeInBytes, mockLogger);
        const largeMessage = generateChunkableOp(100);

        const result = opSplitter.splitCompressedBatch({
            content: [largeMessage],
            contentSizeInBytes: largeMessage.contents?.length ?? 0,
        });

        assert.equal(batchesSubmitted.length, 5);
        for (const batch of batchesSubmitted) {
            assert.equal(batch.length, 1);
            assert.equal((batch[0] as BatchMessage).deserializedContent.type, ContainerMessageType.ChunkedOp);
        }

        assert.equal(result.content.length, 1);
        assert.notEqual(result.contentSizeInBytes, largeMessage.contents?.length ?? 0);
        const lastChunk = result.content[0].deserializedContent.contents as IChunkedOp;
        assert.equal(lastChunk.chunkId, lastChunk.totalChunks);
        const contentSentSeparately = batchesSubmitted.map((x) => ((x[0] as BatchMessage).deserializedContent.contents as IChunkedOp).contents);
        const sentContent = [...contentSentSeparately, lastChunk.contents].reduce((accumulator, current) => `${accumulator}${current}`);
        assert.equal(sentContent, largeMessage.contents);

        assert(mockLogger.matchEvents([{
            eventName: "OpSplitter:Chunked compressed batch",
            length: result.content.length,
            chunks: 100 / 20 + 1,
            chunkSizeInBytes: 20,
        }]));
    });

    const assertSameMessage = (result: ISequencedDocumentMessage, original: BatchMessage) => {
        assert.deepStrictEqual(result.contents, original.deserializedContent.contents);
        assert.strictEqual(result.type, original.deserializedContent.type);
        assert.strictEqual(result.metadata, original.metadata);
        assert.strictEqual(result.compression, original.compression);
    };

    const generateChunkableOp = (contentSizeInBytes: number): BatchMessage => {
        const contents = { value: crypto.randomBytes(contentSizeInBytes / 2).toString("hex") };
        return {
            localOpMetadata: undefined,
            deserializedContent: {
                contents,
                type: ContainerMessageType.FluidDataStoreOp,
            },
            referenceSequenceNumber: Infinity,
            metadata: { meta: "data" },
            compression: CompressionAlgorithms.lz4,
            contents: JSON.stringify(contents),
        };
    };

    const wrapChunkedOps = (ops: IChunkedOp[], clientId: string): ISequencedDocumentMessage[] =>
        ops.map((op) => {
            const result = {
                contents: op,
                clientId,
                type: ContainerMessageType.ChunkedOp,
            };

            return result as ISequencedDocumentMessage;
        });
});
