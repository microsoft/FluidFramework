/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IBatchMessage } from "@fluidframework/container-definitions/internal";

import { CompressionAlgorithms } from "../compatUtils.js";

/**
 * Local Batch message, before it is virtualized and sent to the ordering service
 */
export interface LocalBatchMessage {
	serializedOp: string;
	metadata?: Record<string, unknown>;
	localOpMetadata?: unknown;
	referenceSequenceNumber: number;
	compression?: CompressionAlgorithms;

	/**
	 * @deprecated Use serializedOp
	 */
	contents?: never; // To ensure we don't leave this one when converting from OutboundBatchMessage
}

/**
 * Virtualized Batch message, on its way out the door to the ordering service
 */
export type OutboundBatchMessage = IBatchMessage & {
	localOpMetadata?: unknown;
	referenceSequenceNumber: number;
	compression?: CompressionAlgorithms;

	/**
	 * @deprecated Use contents
	 */
	serializedOp?: never; // To ensure we don't leave this one when converting from LocalBatchMessage
};

/**
 * A batch of messages we have accumulated locally, but haven't sent to the ordering service yet.
 */
export type LocalBatch = IBatch<LocalBatchMessage[]>;

/**
 * A batch of messages that has been virtualized as needed (grouped, compressed, chunked)
 * and is ready to be sent to the ordering service.
 */
export type OutboundBatch = IBatch<OutboundBatchMessage[]>;

/**
 * An {@link OutboundBatch} with exactly one message
 * This type is helpful as Grouping yields this kind of batch, and Compression only operates on this type of batch.
 */
export type OutboundSingletonBatch = IBatch<[OutboundBatchMessage]>;

/**
 * Base batch interface used internally by the runtime.
 * See {@link LocalBatch} and {@link OutboundBatch} for the concrete types.
 */
interface IBatch<TMessages extends LocalBatchMessage[] | OutboundBatchMessage[]> {
	/**
	 * Sum of the in-memory content sizes of all messages in the batch.
	 * If the batch is compressed, this number reflects the post-compression size.
	 */
	readonly contentSizeInBytes: number;
	/**
	 * All the messages in the batch
	 */
	readonly messages: TMessages;
	/**
	 * The reference sequence number for the batch
	 */
	readonly referenceSequenceNumber: number | undefined;
	/**
	 * Wether or not the batch contains at least one op which was produced as the result
	 * of processing another op. This means that the batch must be rebased before
	 * submitted, to ensure that all ops have the same reference sequence numbers and a
	 * consistent view of the data model. This happens when the op is created within a
	 * 'changed' event handler of a DDS and will have a different reference sequence number
	 * than the rest of the ops in the batch, meaning that it has a different view of the
	 * state of the data model, therefore all ops must be resubmitted and rebased to the current
	 * reference sequence number to be in agreement about the data model state.
	 */
	readonly hasReentrantOps?: boolean;
}

export interface IBatchCheckpoint {
	rollback: (action: (message: LocalBatchMessage) => void) => void;
}

/**
 * @internal
 */
export interface IChunkedOp {
	chunkId: number;
	totalChunks: number;
	contents: string;
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
