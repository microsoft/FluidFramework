/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IBatchMessage } from "@fluidframework/container-definitions/internal";

import { CompressionAlgorithms } from "../containerRuntime.js";

/**
 * Batch message type used internally by the runtime
 */
export type BatchMessage = IBatchMessage & {
	localOpMetadata?: unknown;
	referenceSequenceNumber: number;
	compression?: CompressionAlgorithms;
	staged?: boolean; //* NEXT: not sure about this... but necessary at the moment to plumb this around on original submit
};

/**
 * Batch interface used internally by the runtime.
 */
export interface IBatch<TMessages extends BatchMessage[] = BatchMessage[]> {
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

	readonly staged?: boolean; //* NEXT: not sure about this... but necessary at the moment to plumb this around on original submit
}

export interface IBatchCheckpoint {
	rollback: (action: (message: BatchMessage) => void) => void;
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
