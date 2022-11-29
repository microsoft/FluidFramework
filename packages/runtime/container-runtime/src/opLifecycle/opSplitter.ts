/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { IBatchMessage } from "@fluidframework/container-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { ContainerMessageType, ContainerRuntimeMessage } from "../containerRuntime";
import { BatchMessage, IBatch, IBatchProcessor, IChunkedOp } from "./definitions";
import { IProcessingResult, IRemoteMessageProcessor } from "./inbox";

const DefaultChunkSize = 500 * 1024; // 500kb

/**
 * Responsible for creating and reconstructing chunked messages.
 */
export class OpSplitter implements IRemoteMessageProcessor, IBatchProcessor {
    // Local copy of incomplete received chunks.
    private readonly chunkMap: Map<string, string[]>;

    constructor(
        chunks: [string, string[]][],
        private readonly submitBatchFn: (batch: IBatchMessage[]) => number,
        public readonly chunkSizeInBytes: number = DefaultChunkSize,
    ) {
        this.chunkMap = new Map<string, string[]>(chunks);
    }

    public get hasChunks(): boolean {
        return this.chunkMap.size > 0;
    }

    public get chunks(): ReadonlyMap<string, string[]> {
        return this.chunkMap;
    }

    public processRemoteMessage(message: ISequencedDocumentMessage): IProcessingResult {
        if (message.type !== ContainerMessageType.ChunkedOp) {
            return { message, state: "Skipped" };
        }

        const clientId = message.clientId;
        const chunkedContent = message.contents as IChunkedOp;
        this.addChunk(clientId, chunkedContent);
        if (chunkedContent.chunkId === chunkedContent.totalChunks) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const serializedContent = this.chunkMap.get(clientId)!.join("");
            this.clearPartialChunks(clientId);
            return {
                message: {
                    ...message,
                    contents: serializedContent === "" ? undefined : JSON.parse(serializedContent),
                    type: chunkedContent.originalType,
                    metadata: chunkedContent.metadata,
                    compression: chunkedContent.compression,
                },
                state: "Processed",
            };
        }

        return { message, state: "NotReady" };
    }

    public clearPartialChunks(clientId: string) {
        if (this.chunkMap.has(clientId)) {
            this.chunkMap.delete(clientId);
        }
    }

    private addChunk(clientId: string, chunkedContent: IChunkedOp) {
        let map = this.chunkMap.get(clientId);
        if (map === undefined) {
            map = [];
            this.chunkMap.set(clientId, map);
        }
        assert(chunkedContent.chunkId === map.length + 1,
            0x131 /* "Mismatch between new chunkId and expected chunkMap" */); // 1-based indexing
        map.push(chunkedContent.contents);
    }

    private splitOp(op: BatchMessage): IChunkedOp[] {
        const chunks: IChunkedOp[] = [];
        assert(op.contents !== undefined && op.contents !== null, "We should have something to chunk");

        const contentLength = op.contents.length;
        const chunkN = Math.floor((contentLength - 1) / this.chunkSizeInBytes) + 1;
        let offset = 0;
        for (let i = 1; i <= chunkN; i++) {
            chunks.push({
                chunkId: i,
                contents: op.contents.substr(offset, this.chunkSizeInBytes),
                originalType: op.deserializedContent.type,
                totalChunks: chunkN,
                metadata: op.metadata,
                compression: op.compression,
            });

            offset += this.chunkSizeInBytes;
        }

        return chunks;
    }

    private chunkToBatchMessage(chunk: IChunkedOp, referenceSequenceNumber: number): BatchMessage {
        const payload: ContainerRuntimeMessage = { type: ContainerMessageType.ChunkedOp, contents: chunk };
        return {
            contents: JSON.stringify(payload),
            deserializedContent: payload,
            metadata: undefined,
            localOpMetadata: undefined,
            referenceSequenceNumber,
        };
    }

    public processOutgoing(batch: IBatch): IBatch {
        const car = batch.content[0]; // we expect this to be the large compressed op, which needs to be split
        const cdr = batch.content.slice(1); // we expect these to be empty ops, created to reserve sequence numbers

        assert((car.contents?.length ?? 0) >= this.chunkSizeInBytes, "Batch needs to be chunkable");
        const chunks = this.splitOp(car);

        // Send the first N-1 chunks immediately
        for (const chunk of chunks.slice(0, -1)) {
            this.submitBatchFn([this.chunkToBatchMessage(chunk, car.referenceSequenceNumber)]);
        }

        // The last chunk will be part of the new batch
        const lastChunk = this.chunkToBatchMessage(chunks[chunks.length - 1], car.referenceSequenceNumber);
        return {
            content: [lastChunk, ...cdr],
            contentSizeInBytes: lastChunk.contents?.length ?? 0,
        };
    }
}
