/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import {
	LoggingError,
	tagData,
	TelemetryDataTag,
} from "@fluidframework/telemetry-utils/internal";

import { ICompressionRuntimeOptions } from "../compressionDefinitions.js";
import { isContainerMessageDirtyable } from "../containerRuntime.js";
import { asBatchMetadata, type IBatchMetadata } from "../metadata.js";
import type { IPendingMessage } from "../pendingStateManager.js";

import { LocalBatchMessage, IBatchCheckpoint, type LocalBatch } from "./definitions.js";
import { serializeOp } from "./opSerialization.js";
import type { BatchStartInfo } from "./remoteMessageProcessor.js";

export interface IBatchManagerOptions {
	readonly compressionOptions?: ICompressionRuntimeOptions;

	/**
	 * If true, the outbox is allowed to rebase the batch during flushing.
	 */
	readonly canRebase: boolean;

	/**
	 * If true, don't compare batchID of incoming batches to this. e.g. ID Allocation Batch IDs should be ignored
	 */
	readonly ignoreBatchId?: boolean;
}

export interface BatchSequenceNumbers {
	referenceSequenceNumber?: number;
	clientSequenceNumber?: number;
}

/**
 * Type alias for the batchId stored in batch metadata
 */
export type BatchId = string;

/**
 * Compose original client ID and client sequence number into BatchId to stamp on the message during reconnect
 */
export function generateBatchId(originalClientId: string, batchStartCsn: number): BatchId {
	return `${originalClientId}_[${batchStartCsn}]`;
}

/**
 * Get the effective batch ID for the input argument.
 * Supports either an IPendingMessage or BatchStartInfo.
 * If the batch ID is explicitly present, return it.
 * Otherwise, generate a new batch ID using the client ID and batch start CSN.
 */
export function getEffectiveBatchId(
	pendingMessageOrBatchStartInfo: IPendingMessage | BatchStartInfo,
): string {
	if ("localOpMetadata" in pendingMessageOrBatchStartInfo) {
		const pendingMessage: IPendingMessage = pendingMessageOrBatchStartInfo;
		return (
			asBatchMetadata(pendingMessage.opMetadata)?.batchId ??
			generateBatchId(
				pendingMessage.batchInfo.clientId,
				pendingMessage.batchInfo.batchStartCsn,
			)
		);
	}

	const batchStart: BatchStartInfo = pendingMessageOrBatchStartInfo;
	return batchStart.batchId ?? generateBatchId(batchStart.clientId, batchStart.batchStartCsn);
}

/**
 * Helper class that manages partial batch & rollback.
 */
export class BatchManager {
	private pendingBatch: LocalBatchMessage[] = [];
	private hasReentrantOps = false;

	public get length(): number {
		return this.pendingBatch.length;
	}

	public get sequenceNumbers(): BatchSequenceNumbers {
		return {
			referenceSequenceNumber: this.referenceSequenceNumber,
			clientSequenceNumber: this.clientSequenceNumber,
		};
	}

	private get referenceSequenceNumber(): number | undefined {
		return this.pendingBatch.length === 0
			? undefined
			: // NOTE: In case of reentrant ops, there could be multiple reference sequence numbers, but we will rebase before submitting.
				this.pendingBatch[this.pendingBatch.length - 1].referenceSequenceNumber;
	}

	/**
	 * The last-processed CSN when this batch started.
	 * This is used to ensure that while the batch is open, no incoming ops are processed.
	 */
	private clientSequenceNumber: number | undefined;

	constructor(public readonly options: IBatchManagerOptions) {}

	public push(
		message: LocalBatchMessage,
		reentrant: boolean,
		currentClientSequenceNumber?: number,
	): void {
		this.hasReentrantOps = this.hasReentrantOps || reentrant;

		if (this.pendingBatch.length === 0) {
			this.clientSequenceNumber = currentClientSequenceNumber;
		}

		this.pendingBatch.push(message);
	}

	public get empty(): boolean {
		return this.pendingBatch.length === 0;
	}

	/**
	 * Gets the pending batch and clears state for the next batch.
	 */
	public popBatch(): LocalBatch {
		assert(this.pendingBatch[0] !== undefined, 0xb8a /* expected non-empty batch */);
		const batch: LocalBatch = {
			messages: this.pendingBatch,
			referenceSequenceNumber: this.referenceSequenceNumber,
			hasReentrantOps: this.hasReentrantOps,
			staged: this.pendingBatch[0].staged,
		};

		this.pendingBatch = [];
		this.clientSequenceNumber = undefined;
		this.hasReentrantOps = false;

		// Do NOT add batch metadata here anymore. This is now handled in Outbox before virtualizeBatch.
		return batch;
	}

	/**
	 * Capture the pending state at this point
	 */
	public checkpoint(): IBatchCheckpoint {
		const startSequenceNumber = this.clientSequenceNumber;
		const startPoint = this.pendingBatch.length;
		return {
			rollback: (process: (message: LocalBatchMessage) => void) => {
				this.clientSequenceNumber = startSequenceNumber;
				const rollbackOpsLifo = this.pendingBatch.splice(startPoint).reverse();
				for (const message of rollbackOpsLifo) {
					process(message);
				}
				const count = this.pendingBatch.length - startPoint;
				if (count !== 0) {
					throw new LoggingError("Ops generated during rollback", {
						count,
						...tagData(TelemetryDataTag.UserData, {
							ops: serializeOp(this.pendingBatch.slice(startPoint).map((b) => b.runtimeOp)),
						}),
					});
				}
			},
		};
	}

	/**
	 * Does this batch current contain user changes ("dirtyable" ops)?
	 */
	public containsUserChanges(): boolean {
		return this.pendingBatch.some((message) => isContainerMessageDirtyable(message.runtimeOp));
	}
}

/**
 * Adds the batch metadata to the first and last messages of the batch
 * to indicate the start and end of the batch, as well as the batch ID if provided.
 * Modifies the messages in the batch in place.
 * @param batch - The batch to which metadata will be added.
 * @param batchId - Optional batch ID to stamp on the first message.
 */
export const addBatchMetadata = (batch: LocalBatch, batchId?: BatchId): void => {
	const batchEnd = batch.messages.length - 1;

	const firstMsg = batch.messages[0];
	const lastMsg = batch.messages[batchEnd];
	assert(
		firstMsg !== undefined && lastMsg !== undefined,
		0x9d1 /* expected non-empty batch */,
	);

	const firstMetadata: Partial<IBatchMetadata> = firstMsg.metadata ?? {};
	const lastMetadata: Partial<IBatchMetadata> = lastMsg.metadata ?? {};

	// Multi-message batches: mark the first and last messages with the "batch" flag indicating batch start/end
	if (batch.messages.length > 1) {
		firstMetadata.batch = true;
		lastMetadata.batch = false;
		firstMsg.metadata = firstMetadata;
		lastMsg.metadata = lastMetadata;
	}

	// If batchId is provided (e.g. in case of resubmit): stamp it on the first message
	if (batchId !== undefined) {
		firstMetadata.batchId = batchId;
		firstMsg.metadata = firstMetadata;
	}
};

export const sequenceNumbersMatch = (
	seqNums: BatchSequenceNumbers,
	otherSeqNums: BatchSequenceNumbers,
): boolean => {
	return (
		(seqNums.referenceSequenceNumber === undefined ||
			otherSeqNums.referenceSequenceNumber === undefined ||
			seqNums.referenceSequenceNumber === otherSeqNums.referenceSequenceNumber) &&
		(seqNums.clientSequenceNumber === undefined ||
			otherSeqNums.clientSequenceNumber === undefined ||
			seqNums.clientSequenceNumber === otherSeqNums.clientSequenceNumber)
	);
};
