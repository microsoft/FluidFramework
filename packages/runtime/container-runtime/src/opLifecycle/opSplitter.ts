/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataCorruptionError, extractSafePropertiesFromMessage } from "@fluidframework/container-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { ContainerMessageType } from "../containerRuntime";
import { IChunkedOp } from "./definitions";

/**
 * Responsible for creating and reconstructing chunked messages.
 */
export class OpSplitter {
    // Local copy of incomplete received chunks.
    private readonly chunkMap: Map<string, string[]>;

    constructor(chunks: [string, string[]][]) {
        this.chunkMap = new Map<string, string[]>(chunks);
    }

    public get chunks(): ReadonlyMap<string, string[]> {
        return this.chunkMap;
    }

    public processRemoteMessage(message: ISequencedDocumentMessage): ISequencedDocumentMessage {
        if (message.type !== ContainerMessageType.ChunkedOp) {
            return message;
        }

        const clientId = message.clientId;
        const chunkedContent = message.contents as IChunkedOp;
        this.addChunk(clientId, chunkedContent, message);

        if (chunkedContent.chunkId < chunkedContent.totalChunks) {
            // We are processing the op in chunks but haven't reached
            // the last chunk yet in order to reconstruct the original op
            return message;
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const serializedContent = this.chunkMap.get(clientId)!.join("");
        this.clearPartialChunks(clientId);

        const newMessage = { ...message };
        newMessage.contents = serializedContent === "" ? undefined : JSON.parse(serializedContent);
        newMessage.type = chunkedContent.originalType;
        return newMessage;
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
}
