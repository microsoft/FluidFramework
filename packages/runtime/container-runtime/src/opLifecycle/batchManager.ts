/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { ICompressionRuntimeOptions } from "../containerRuntime.js";
import { asBatchMetadata, type IBatchMetadata } from "../metadata.js";
import type { IPendingMessage } from "../pendingStateManager.js";

import { BatchMessage, IBatch, IBatchCheckpoint } from "./definitions.js";
import type { BatchStartInfo } from "./remoteMessageProcessor.js";

export interface IBatchManagerOptions {
	readonly hardLimit: number;
	readonly compressionOptions?: ICompressionRuntimeOptions;

	/**
	 * If true, the outbox is allowed to rebase the batch during flushing.
	 */
	readonly canRebase: boolean;

	/** If true, don't compare batchID of incoming batches to this. e.g. ID Allocation Batch IDs should be ignored */
	readonly ignoreBatchId?: boolean;
}

export interface BatchSequenceNumbers {
	referenceSequenceNumber?: number;
	clientSequenceNumber?: number;
}

/** Type alias for the batchId stored in batch metadata */
export type BatchId = string;

/** Compose original client ID and client sequence number into BatchId to stamp on the message during reconnect */
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
 * Estimated size of the stringification overhead for an op accumulated
 * from runtime to loader to the service.
 */
const opOverhead = 200;

/**
 * Helper class that manages partial batch & rollback.
 */
export class BatchManager {
	private pendingBatch: BatchMessage[] = [];
	private batchContentSize = 0;
	private hasReentrantOps = false;

	public get length() {
		return this.pendingBatch.length;
	}
	public get contentSizeInBytes() {
		return this.batchContentSize;
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
			: this.pendingBatch[this.pendingBatch.length - 1].referenceSequenceNumber;
	}

	/**
	 * The last-processed CSN when this batch started.
	 * This is used to ensure that while the batch is open, no incoming ops are processed.
	 */
	private clientSequenceNumber: number | undefined;

	constructor(public readonly options: IBatchManagerOptions) {}

	public push(
		message: BatchMessage,
		reentrant: boolean,
		currentClientSequenceNumber?: number,
	): boolean {
		const contentSize = this.batchContentSize + (message.contents?.length ?? 0);
		const opCount = this.pendingBatch.length;
		this.hasReentrantOps = this.hasReentrantOps || reentrant;

		// Attempt to estimate batch size, aka socket message size.
		// Each op has pretty large envelope, estimating to be 200 bytes.
		// Also content will be strigified, and that adds a lot of overhead due to a lot of escape characters.
		// Not taking it into account, as compression work should help there - compressed payload will be
		// initially stored as base64, and that requires only 2 extra escape characters.
		const socketMessageSize = contentSize + opOverhead * opCount;

		if (socketMessageSize >= this.options.hardLimit) {
			return false;
		}

		if (this.pendingBatch.length === 0) {
			this.clientSequenceNumber = currentClientSequenceNumber;
		}

		this.batchContentSize = contentSize;
		this.pendingBatch.push(message);
		return true;
	}

	public get empty() {
		return this.pendingBatch.length === 0;
	}

	/**
	 * Gets the pending batch and clears state for the next batch.
	 */
	public popBatch(batchId?: BatchId): IBatch {
		const batch: IBatch = {
			messages: this.pendingBatch,
			contentSizeInBytes: this.batchContentSize,
			referenceSequenceNumber: this.referenceSequenceNumber,
			hasReentrantOps: this.hasReentrantOps,
		};

		this.pendingBatch = [];
		this.batchContentSize = 0;
		this.clientSequenceNumber = undefined;
		this.hasReentrantOps = false;

		return addBatchMetadata(batch, batchId);
	}

	/**
	 * Capture the pending state at this point
	 */
	public checkpoint(): IBatchCheckpoint {
		const startPoint = this.pendingBatch.length;
		return {
			rollback: (process: (message: BatchMessage) => void) => {
				for (let i = this.pendingBatch.length; i > startPoint; ) {
					i--;
					const message = this.pendingBatch[i];
					this.batchContentSize -= message.contents?.length ?? 0;
					process(message);
				}

				this.pendingBatch.length = startPoint;
			},
		};
	}
}

const addBatchMetadata = (batch: IBatch, batchId?: BatchId): IBatch => {
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

	return batch;
};

/**
 * Estimates the real size in bytes on the socket for a given batch. It assumes that
 * the envelope size (and the size of an empty op) is 200 bytes, taking into account
 * extra overhead from stringification.
 *
 * @param batch - the batch to inspect
 * @returns An estimate of the payload size in bytes which will be produced when the batch is sent over the wire
 */
export const estimateSocketSize = (batch: IBatch): number => {
	return batch.contentSizeInBytes + opOverhead * batch.messages.length;
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
