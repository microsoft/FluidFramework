/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { IBatchMessage } from "@fluidframework/container-definitions";
import { DataCorruptionError, extractSafePropertiesFromMessage } from "@fluidframework/container-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { ContainerMessageType, ContainerRuntimeMessage } from "../containerRuntime";
import { BatchMessage, IBatch, IChunkedOp, IMessageProcessingResult } from "./definitions";

/**
 * Responsible for creating and reconstructing chunked messages.
 */
export class OpSplitter {
    // Local copy of incomplete received chunks.
    private readonly chunkMap: Map<string, string[]>;

    constructor(
        chunks: [string, string[]][],
        private readonly submitBatchFn: (batch: IBatchMessage[]) => number,
        private readonly chunkSizeInBytes: number,
    ) {
        this.chunkMap = new Map<string, string[]>(chunks);
    }

    public get isBatchChunkingEnabled(): boolean {
        return this.chunkSizeInBytes < Number.POSITIVE_INFINITY;
    }

    public get chunks(): ReadonlyMap<string, string[]> {
        return this.chunkMap;
    }

    public processRemoteMessage(message: ISequencedDocumentMessage): IMessageProcessingResult {
        if (message.type !== ContainerMessageType.ChunkedOp) {
            return {
                message,
                state: "Skipped",
            };
        }

        const clientId = message.clientId;
        const chunkedContent = message.contents as IChunkedOp;
        this.addChunk(clientId, chunkedContent, message);

        if (chunkedContent.chunkId < chunkedContent.totalChunks) {
            // We are processing the op in chunks but haven't reached
            // the last chunk yet in order to reconstruct the original op
            return {
                message,
                state: "Accepted",
            };
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const serializedContent = this.chunkMap.get(clientId)!.join("");
        this.clearPartialChunks(clientId);

        const newMessage = { ...message };
        newMessage.contents = serializedContent === "" ? undefined : JSON.parse(serializedContent);
        newMessage.type = chunkedContent.originalType;
        newMessage.metadata = chunkedContent.metadata;
        newMessage.compression = chunkedContent.compression;
        return {
            message: newMessage,
            state: "Processed",
        };
    }

    public clearPartialChunks(clientId: string) {
        if (this.chunkMap.has(clientId)) {
            this.chunkMap.delete(clientId);
        }
    }

    private addChunk(clientId: string, chunkedContent: IChunkedOp, originalMessage: ISequencedDocumentMessage) {
        let map = this.chunkMap.get(clientId);
        if (map === undefined) {
            map = [];
            this.chunkMap.set(clientId, map);
        }

        if (chunkedContent.chunkId !== map.length + 1) {
            // We are expecting the chunks to be processed sequentially, in the same order as they are sent.
            // Therefore, the chunkId of the incoming op needs to match the length of the array (1-based indexing)
            // holding the existing chunks for that particular clientId.
            throw new DataCorruptionError("Chunk Id mismatch", {
                ...extractSafePropertiesFromMessage(originalMessage),
                chunkMapLength: map.length,
                chunkId: chunkedContent.chunkId,
                totalChunks: chunkedContent.totalChunks,
            });
        }

        map.push(chunkedContent.contents);
    }

    public splitCompressedBatch(batch: IBatch): IBatch {
        assert(this.isBatchChunkingEnabled, "Chunking needs to be enabled");
        assert(batch.contentSizeInBytes > 0 && batch.content.length > 0, "Batch needs to be non-empty");
        assert(this.chunkSizeInBytes !== 0, "Chunk size needs to be non-zero");

        const firstMessage = batch.content[0]; // we expect this to be the large compressed op, which needs to be split
        assert(firstMessage.metadata?.compressed === true || firstMessage.compression !== undefined, "Batch needs to be compressed");

        const restOfMessages = batch.content.slice(1); // we expect these to be empty ops, created to reserve sequence numbers

        assert((firstMessage.contents?.length ?? 0) >= this.chunkSizeInBytes, "First message in the batch needs to be chunkable");
        const chunks = splitOp(firstMessage, this.chunkSizeInBytes);

        // Send the first N-1 chunks immediately
        for (const chunk of chunks.slice(0, -1)) {
            this.submitBatchFn([chunkToBatchMessage(chunk, firstMessage.referenceSequenceNumber)]);
        }

        // The last chunk will be part of the new batch and needs to
        // preserve the batch metadata of the original batch
        const lastChunk = chunkToBatchMessage(
            chunks[chunks.length - 1],
            firstMessage.referenceSequenceNumber,
            { batch: firstMessage.metadata?.batch });
        return {
            content: [lastChunk, ...restOfMessages],
            contentSizeInBytes: lastChunk.contents?.length ?? 0,
        };
    }
}

const chunkToBatchMessage = (
    chunk: IChunkedOp,
    referenceSequenceNumber: number,
    metadata: Record<string, unknown> | undefined = undefined,
): BatchMessage => {
    const payload: ContainerRuntimeMessage = { type: ContainerMessageType.ChunkedOp, contents: chunk };
    return {
        contents: JSON.stringify(payload),
        deserializedContent: payload,
        metadata,
        localOpMetadata: undefined,
        referenceSequenceNumber,
    };
}

export const splitOp = (op: BatchMessage, chunkSizeInBytes: number): IChunkedOp[] => {
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
            metadata: op.metadata,
            compression: op.compression,
        });

        offset += chunkSizeInBytes;
    }

    return chunks;
};
