/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert } from "@fluidframework/common-utils";
import { IBatchMessage } from "@fluidframework/container-definitions";
import { DataCorruptionError, extractSafePropertiesFromMessage } from "@fluidframework/container-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { ContainerMessageType, ContainerRuntimeMessage } from "../containerRuntime";
import { BatchMessage, IBatch, IChunkedOp, IMessageProcessingResult } from "./definitions";

/**
 * Responsible for creating and reconstructing chunked messages.
 */
export class OpSplitter {
    // Local copy of incomplete received chunks.
    private readonly chunkMap: Map<string, string[]>;
    private readonly logger;

    constructor(
        chunks: [string, string[]][],
        private readonly submitBatchFn: ((batch: IBatchMessage[]) => number) | undefined,
        private readonly chunkSizeInBytes: number,
        private readonly maxBatchSizeInBytes: number,
        logger: ITelemetryLogger,
    ) {
        this.chunkMap = new Map<string, string[]>(chunks);
        this.logger = ChildLogger.create(logger, "OpSplitter");
    }

    public get isBatchChunkingEnabled(): boolean {
        return this.chunkSizeInBytes < Number.POSITIVE_INFINITY && this.submitBatchFn !== undefined;
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
        newMessage.metadata = chunkedContent.originalMetadata;
        newMessage.compression = chunkedContent.originalCompression;
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

    /**
     * Splits the first op of a compressed batch in chunks, sends the chunks separately and
     * returns a new batch composed of the last chunk and the rest of the ops in the original batch.
     *
     * A compressed batch is formed by one large op at the first position, followed by a series of placeholder ops
     * which are used in order to reserve the sequence numbers for when the first op gets unrolled into the original
     * uncompressed ops at ingestion in the runtime.
     *
     * If the first op is too large, it can be chunked (split into smaller op) which can be sent individually over the wire
     * and accumulate at ingestion, until the last op in the chunk is processed, when the original op is unrolled.
     *
     * This method will send the first N - 1 chunks separately and use the last chunk as the first message in the result batch
     * and then appends the original placeholder ops. This will ensure that the batch semantics of the original (non-compressed) batch
     * are preserved, as the original chunked op will be unrolled by the runtime when the first message in the batch is processed
     * (as it is the last chunk).
     *
     * To illustrate, if the input is `[largeOp, emptyOp, emptyOp]`, `largeOp` will be split into `[chunk1, chunk2, chunk3, chunk4]`.
     * `chunk1`, `chunk2` and `chunk3` will be sent individually and `[chunk4, emptyOp, emptyOp]` will be returned.
     *
     * @param batch - the compressed batch which needs to be processed
     * @returns A new adjusted batch which can be sent over the wire
     */
    public splitCompressedBatch(batch: IBatch): IBatch {
        assert(this.isBatchChunkingEnabled, "Chunking needs to be enabled");
        assert(batch.contentSizeInBytes > 0 && batch.content.length > 0, "Batch needs to be non-empty");
        assert(this.chunkSizeInBytes !== 0, "Chunk size needs to be non-zero");
        assert(this.chunkSizeInBytes < this.maxBatchSizeInBytes, "Chunk size needs to be smaller than the max batch size");

        const firstMessage = batch.content[0]; // we expect this to be the large compressed op, which needs to be split
        assert(firstMessage.metadata?.compressed === true || firstMessage.compression !== undefined, "Batch needs to be compressed");
        assert((firstMessage.contents?.length ?? 0) >= this.chunkSizeInBytes, "First message in the batch needs to be chunkable");

        const restOfMessages = batch.content.slice(1); // we expect these to be empty ops, created to reserve sequence numbers
        const chunks = splitOp(firstMessage, this.chunkSizeInBytes);

        assert(this.submitBatchFn !== undefined, "We don't support old loaders");
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

        this.logger.sendPerformanceEvent({
            eventName: "Chunked compressed batch",
            length: batch.content.length,
            sizeInBytes: batch.contentSizeInBytes,
            chunks: chunks.length,
            chunkSizeInBytes: this.chunkSizeInBytes,
        });

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
        const chunk: IChunkedOp = {
            chunkId: i,
            contents: op.contents.substr(offset, chunkSizeInBytes),
            originalType: op.deserializedContent.type,
            totalChunks: chunkN,
        }

        if (i === chunkN) {
            // We don't need to port these to all the chunks,
            // as we rebuild the original op when we process the
            // last chunk, therefore it is the only one that needs it.
            chunk.originalMetadata = op.metadata;
            chunk.originalCompression = op.compression;
        }

        chunks.push(chunk);
        offset += chunkSizeInBytes;
    }

    return chunks;
};
