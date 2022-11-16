/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { ContainerMessageType } from "../containerRuntime";

export interface IChunkedOp {
    chunkId: number;
    totalChunks: number;
    contents: string;
    originalType: MessageType | ContainerMessageType;
}

/**
 * Responsible for keeping track of remote chunked messages.
 */
export class OpSplitter {
    // Local copy of incomplete received chunks.
    private readonly chunkMap: Map<string, string[]>;

    constructor(
        chunks: [string, string[]][],
    ) {
        this.chunkMap = new Map<string, string[]>(chunks);
    }

    public get hasChunks(): boolean {
        return this.chunkMap.size > 0;
    }

    public get chunks(): ReadonlyMap<string, string[]> {
        return this.chunkMap;
    }

    public processIncoming(message: ISequencedDocumentMessage) {
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
}
