/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IBatchMessage } from "@fluidframework/container-definitions";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
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
	 * Sum of the in-memory content sizes of all messages in the batch.
	 * If the batch is compressed, this number reflects the post-compression size.
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
	originalMetadata?: Record<string, unknown>;
	originalCompression?: string;
}

/**
 * The state of remote message processing:
 * `Processed` - the message can be considered processed
 * `Skipped` - the message was ignored by the processor
 * `Accepted` - the message was processed partially. Eventually, a message
 * will make the processor return `Processed`.
 */
export type ProcessingState = "Processed" | "Skipped" | "Accepted";

/**
 * Return type for functions which process remote messages
 */
export interface IMessageProcessingResult {
	/**
	 * A shallow copy of the input message if processing happened, or
	 * the original message otherwise
	 */
	readonly message: ISequencedDocumentMessage;
	/**
	 * Processing result of the input message.
	 */
	readonly state: ProcessingState;
}
