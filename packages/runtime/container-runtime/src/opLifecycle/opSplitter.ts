/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { IBatchMessage } from "@fluidframework/container-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { ContainerMessageType } from "../containerRuntime";
import { IChunkedOp } from "./definitions";

const DefaultChunkSize = 500 * 1024; // 500kb

/**
 * Responsible for creating and reconstructing chunked messages.
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

    public processRemoteMessage(message: ISequencedDocumentMessage): boolean {
        if (message.type !== ContainerMessageType.ChunkedOp) {
            return false;
        }

        const clientId = message.clientId;
        const chunkedContent = message.contents as IChunkedOp;
        this.addChunk(clientId, chunkedContent);

        if (chunkedContent.chunkId < chunkedContent.totalChunks) {
            // We are processing the op in chunks but haven't reached
            // the last chunk yet in order to reconstruct the original op
            return false;
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const serializedContent = this.chunkMap.get(clientId)!.join("");
        this.clearPartialChunks(clientId);
        message.contents = serializedContent === "" ? undefined : JSON.parse(serializedContent);
        message.type = chunkedContent.originalType;
        message.metadata = chunkedContent.metadata;
        message.compression = chunkedContent.compression;
        return true;
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
