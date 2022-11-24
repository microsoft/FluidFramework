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

const DefaultChunkSize = 700 * 1024; // 700kb

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

    processOutgoing(batch: IBatch): IBatch {

    }
}
