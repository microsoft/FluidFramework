/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IBatchMessage } from "@fluidframework/container-definitions";
import { CompressionAlgorithms, ContainerRuntimeMessage, ICompressionRuntimeOptions } from "..";

export interface IOutboxOptions {
    readonly compressionOptions?: ICompressionRuntimeOptions;
    readonly enableOpReentryCheck?: boolean;
    readonly maxBatchSizeInBytes: number;
};

export interface IBatchProcessor {
    processOutgoing(batch: IBatch): IBatch;
}

export interface IBatchProcessors {
    readonly compressor: IBatchProcessor;
}

export interface IBatchManagerOptions {
    readonly hardLimit: number;
    readonly softLimit?: number;
    readonly compressionOptions?: ICompressionRuntimeOptions;
}

/**
 * Batch message type used internally by the runtime
 */
export type BatchMessage = IBatchMessage & {
    localOpMetadata: unknown;
    deserializedContent: ContainerRuntimeMessage;
    referenceSequenceNumber: number;
    compression?: CompressionAlgorithms;
};

export interface IBatch {
    readonly contentSizeInBytes: number;
    readonly content: BatchMessage[];
}

export interface IBatchCheckpoint {
    rollback: (action: (message: BatchMessage) => void) => void;
}
