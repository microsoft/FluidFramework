/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { BatchMessage } from "./batchManager";
import { ContainerMessageType, ContainerRuntimeMessage } from "./containerRuntime";

export interface IChunkedOp {
    chunkId: number;
    totalChunks: number;
    contents: string;
    originalType: MessageType | ContainerMessageType;
}

const DefaultChunkSize = 500 * 1024; // 500kb

/**
 * Responsible for keeping track of remote chunked messages.
 */
export class OpSplitter {
    // Local copy of incomplete received chunks.
    private readonly chunkMap: Map<string, string[]>;

    constructor(
        chunks: [string, string[]][],
        private readonly submitFn: (type: MessageType, contents: any, batch: boolean, appData?: any) => number,
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
            const newMessage = { ...message };
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const serializedContent = this.chunkMap.get(clientId)!.join("");
            newMessage.contents = JSON.parse(serializedContent);
            newMessage.type = chunkedContent.originalType;
            this.clearPartialChunks(clientId);
            return newMessage;
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

    public submitChunkedBatch(batch: BatchMessage[]): number {
        const cons = batch[0];
        const contentToChunk = cons.contents ?? "";
        if (cons.compression === undefined || contentToChunk.length < this.chunkSizeInBytes) {
            return -1;
        }

        const contentLength = contentToChunk.length;
        const chunkN = Math.floor((contentLength - 1) / this.chunkSizeInBytes) + 1;
        let offset = 0;
        let clientSequenceNumber: number = 0;
        for (let i = 1; i <= chunkN; i++) {
            const chunkedOp: IChunkedOp = {
                chunkId: i,
                contents: contentToChunk.substring(offset, offset + this.chunkSizeInBytes + 1),
                originalType: cons.deserializedContent.type,
                totalChunks: chunkN,
            };

            offset += this.chunkSizeInBytes;

            const payload: ContainerRuntimeMessage = { type: cons.deserializedContent.type, contents: chunkedOp };
            clientSequenceNumber = this.submitFn(
                MessageType.Operation,
                payload,
                false);
        }

        return clientSequenceNumber;
    }
}
