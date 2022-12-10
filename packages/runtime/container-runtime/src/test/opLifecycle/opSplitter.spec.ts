/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as crypto from "crypto";
import { strict as assert } from "assert";
import { ContainerMessageType } from "@fluidframework/container-runtime-previous";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { BatchMessage, IChunkedOp, OpSplitter } from "../../opLifecycle";
import { CompressionAlgorithms } from "../../containerRuntime";

describe("OpSplitter", () => {
    it("Reconstruct original chunked op", () => {
        const op1 = generateChunkableOp(chunkSizeInBytes * 2);
        const op2 = generateChunkableOp(chunkSizeInBytes * 3);
        const chunks1 = wrapChunkedOps(splitOp(op1), "testClient1");
        const chunks2 = wrapChunkedOps(splitOp(op2), "testClient2");
        const opSplitter = new OpSplitter([]);

        opSplitter.processRemoteMessage(chunks1[0]);
        opSplitter.processRemoteMessage(chunks2[0]);

        opSplitter.processRemoteMessage(chunks1[1]);
        opSplitter.processRemoteMessage(chunks2[1]);

        // The last chunk will reconstruct the original message
        assertSameMessage(opSplitter.processRemoteMessage(chunks1[2]), op1);
        assert.equal(opSplitter.chunks.size, 1);

        opSplitter.processRemoteMessage(chunks2[2]);

        // The last chunk will reconstruct the original message
        assertSameMessage(opSplitter.processRemoteMessage(chunks2[3]), op2);

        assert.equal(opSplitter.chunks.size, 0);
    });

    it("Reconstruct original chunked op with initial chunks", () => {
        const op = generateChunkableOp(chunkSizeInBytes * 3);
        const chunks = wrapChunkedOps(splitOp(op), "testClient");
        const opSplitter = new OpSplitter([]);
        opSplitter.processRemoteMessage(chunks[0]);
        opSplitter.processRemoteMessage(chunks[1]);

        const otherOpSplitter = new OpSplitter(Array.from(opSplitter.chunks));
        opSplitter.clearPartialChunks("testClient");

        otherOpSplitter.processRemoteMessage(chunks[2]);;
        assertSameMessage(otherOpSplitter.processRemoteMessage(chunks[3]), op);
    });

    it("Clear chunks", () => {
        const chunks = wrapChunkedOps(splitOp(generateChunkableOp(chunkSizeInBytes * 3)), "testClient");
        const opSplitter = new OpSplitter([]);
        opSplitter.processRemoteMessage(chunks[0]);

        assert.equal(opSplitter.chunks.size, 1);
        opSplitter.clearPartialChunks("noClient");
        assert.equal(opSplitter.chunks.size, 1);
        opSplitter.clearPartialChunks("testClient");
        assert.equal(opSplitter.chunks.size, 0);
    });

    it("Throw when processing out-of-order chunks", () => {
        const chunks = wrapChunkedOps(splitOp(generateChunkableOp(chunkSizeInBytes * 3)), "testClient1");
        const opSplitter = new OpSplitter([]);
        assert.throws(() => opSplitter.processRemoteMessage(chunks[2]));
    });

    const chunkSizeInBytes = 50 * 1024;

    const assertSameMessage = (result: ISequencedDocumentMessage, original: BatchMessage) => {
        assert.deepStrictEqual(result.contents, original.deserializedContent.contents);
        assert.strictEqual(result.type, original.deserializedContent.type);
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

    const splitOp = (op: BatchMessage): IChunkedOp[] => {
        const chunks: IChunkedOp[] = [];
        assert(op.contents !== undefined && op.contents !== null, "We should have something to chunk");

        const contentLength = op.contents.length;
        const chunkN = Math.floor((contentLength - 1) / chunkSizeInBytes) + 1;
        let offset = 0;
        for (let i = 1; i <= chunkN; i++) {
            chunks.push({
                chunkId: i,
                contents: op.contents.substr(offset, chunkSizeInBytes),
                originalType: op.deserializedContent.type,
                totalChunks: chunkN,
            });

            offset += chunkSizeInBytes;
        }

        return chunks;
    }
});
