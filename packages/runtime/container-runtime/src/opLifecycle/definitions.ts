/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IBatchMessage } from "@fluidframework/container-definitions";
import { MessageType } from "@fluidframework/protocol-definitions";
import { CompressionAlgorithms, ContainerMessageType, ContainerRuntimeMessage } from "..";

/**
 * Batch message type used internally by the runtime
 */
export type BatchMessage = IBatchMessage & {
    localOpMetadata: unknown;
    deserializedContent: ContainerRuntimeMessage;
    referenceSequenceNumber: number;
    compression?: CompressionAlgorithms;
};

/**
 * Batch interface used internally by the runtime.
 */
export interface IBatch {
    /**
     * Sum of all content sizes of the messages in the batch
     */
    readonly contentSizeInBytes: number;
    /**
     * All the messages in the batch
     */
    readonly content: BatchMessage[];
}

export interface IBatchCheckpoint {
    rollback: (action: (message: BatchMessage) => void) => void;
}

export interface IChunkedOp {
    chunkId: number;
    totalChunks: number;
    contents: string;
    originalType: MessageType | ContainerMessageType;
    metadata?: Record<string, unknown>;
    compression?: string;
}
