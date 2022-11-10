/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { IBatchMessage } from "@fluidframework/container-definitions";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { BatchMessage } from "./batchManager";
import { ContainerMessageType, ContainerRuntimeMessage } from "./containerRuntime";

export interface IChunkedOp {
    chunkId: number;
    totalChunks: number;
    contents: string;
    originalType: MessageType | ContainerMessageType;
    metadata?: Record<string, unknown>;
    compression?: string;
}

const DefaultChunkSize = 700 * 1024; // 700kb

/**
 * Responsible for keeping track of remote chunked messages.
 */
export class OpSplitter {
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

    public processRemoteMessage(message: ISequencedDocumentMessage) {
        if (message.type !== ContainerMessageType.ChunkedOp) {
            return message;
        }

        const clientId = message.clientId;
        const chunkedContent = message.contents as IChunkedOp;
        this.addChunk(clientId, chunkedContent);
        if (chunkedContent.chunkId === chunkedContent.totalChunks) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const serializedContent = this.chunkMap.get(clientId)!.join("");
            this.clearPartialChunks(clientId);
            return {
                ...message,
                contents: serializedContent === "" ? undefined : JSON.parse(serializedContent),
                type: chunkedContent.originalType,
                metadata: chunkedContent.metadata,
                compression: chunkedContent.compression,
            };
        }
        return message;
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

    private splitOp(op: BatchMessage): number {
        const contentToChunk = op.contents ?? "";
        const contentLength = contentToChunk.length;
        const chunkN = Math.floor((Math.max(contentLength, 1) - 1) / this.chunkSizeInBytes) + 1;
        let offset = 0;
        let clientSequenceNumber: number = 0;
        for (let i = 1; i <= chunkN; i++) {
            const chunkedOp: IChunkedOp = {
                chunkId: i,
                contents: contentToChunk.substr(offset, this.chunkSizeInBytes),
                originalType: op.deserializedContent.type,
                totalChunks: chunkN,
                metadata: op.metadata,
                compression: op.compression,
            };

            offset += this.chunkSizeInBytes;

            const payload: ContainerRuntimeMessage = { type: ContainerMessageType.ChunkedOp, contents: chunkedOp };
            const messageToSend: BatchMessage = {
                contents: JSON.stringify(payload),
                deserializedContent: payload,
                metadata: undefined,
                localOpMetadata: undefined,
                referenceSequenceNumber: op.referenceSequenceNumber,
            };

            clientSequenceNumber = this.submitBatchFn([messageToSend]);
        }

        return clientSequenceNumber;
    }

    public submitChunkedBatch(batch: BatchMessage[]): number {
        // We're only interested in the last clientSequenceNumber
        return batch.reduce((_sequenceNumber: number, op: BatchMessage) => this.splitOp(op), -1);
    }
}
