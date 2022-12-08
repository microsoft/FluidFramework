/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as crypto from "crypto";
import { strict as assert } from "assert";
import { ContainerMessageType } from "@fluidframework/container-runtime-previous";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IBatchMessage } from "@fluidframework/container-definitions";
import { BatchMessage, IChunkedOp, OpSplitter, splitOp } from "../../opLifecycle";
import { CompressionAlgorithms } from "../../containerRuntime";

describe("OpSplitter", () => {
    const mockSubmitBatchFn = (_batch: IBatchMessage[]): number => {
        return -1;
    };

    const chunkSizeInBytes = 50 * 1024;

    it("Reconstruct original chunked op", () => {
        const op1 = generateChunkableOp(chunkSizeInBytes * 2);
        const op2 = generateChunkableOp(chunkSizeInBytes * 3);
        const chunks1 = wrapChunkedOps(splitOp(op1, chunkSizeInBytes), "testClient1");
        const chunks2 = wrapChunkedOps(splitOp(op2, chunkSizeInBytes), "testClient2");
        const opSplitter = new OpSplitter([], mockSubmitBatchFn, 0);

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
        const opSplitter = new OpSplitter([], mockSubmitBatchFn, 0);
        opSplitter.processRemoteMessage(chunks[0]);
        opSplitter.processRemoteMessage(chunks[1]);

        const otherOpSplitter = new OpSplitter(Array.from(opSplitter.chunks), mockSubmitBatchFn, 0);
        opSplitter.clearPartialChunks("testClient");

        otherOpSplitter.processRemoteMessage(chunks[2]);;
        assertSameMessage(otherOpSplitter.processRemoteMessage(chunks[3]).message, op);
    });

    it("Clear chunks", () => {
        const chunks = wrapChunkedOps(splitOp(generateChunkableOp(chunkSizeInBytes * 3), chunkSizeInBytes), "testClient");
        const opSplitter = new OpSplitter([], mockSubmitBatchFn, 0);
        opSplitter.processRemoteMessage(chunks[0]);

        assert.equal(opSplitter.chunks.size, 1);
        opSplitter.clearPartialChunks("noClient");
        assert.equal(opSplitter.chunks.size, 1);
        opSplitter.clearPartialChunks("testClient");
        assert.equal(opSplitter.chunks.size, 0);
    });

    it("Throw when processing out-of-order chunks", () => {
        const chunks = wrapChunkedOps(splitOp(generateChunkableOp(chunkSizeInBytes * 3), chunkSizeInBytes), "testClient1");
        const opSplitter = new OpSplitter([], mockSubmitBatchFn, 0);
        assert.throws(() => opSplitter.processRemoteMessage(chunks[2]));
    });

    it("Don't accept non-chunk ops", () => {
        const chunks = wrapChunkedOps(splitOp(generateChunkableOp(chunkSizeInBytes * 3), chunkSizeInBytes), "testClient1")
            .map((op) => ({ ...op, type: ContainerMessageType.FluidDataStoreOp }));
        const opSplitter = new OpSplitter([], mockSubmitBatchFn, 0);
        for (const op of chunks) {
            assert.deepStrictEqual(opSplitter.processRemoteMessage(op), { message: op, state: "Skipped" });
        }
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
