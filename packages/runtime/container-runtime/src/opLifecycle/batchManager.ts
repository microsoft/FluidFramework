/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICompressionRuntimeOptions } from "../containerRuntime.js";

import { BatchMessage, IBatch, IBatchCheckpoint } from "./definitions.js";

export interface IBatchManagerOptions {
	readonly hardLimit: number;
	readonly compressionOptions?: ICompressionRuntimeOptions;

	/**
	 * If true, the outbox is allowed to rebase the batch during flushing.
	 */
	readonly canRebase: boolean;
}

export interface BatchSequenceNumbers {
	referenceSequenceNumber?: number;
	clientSequenceNumber?: number;
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
		const lastPendingBatch = this.pendingBatch[this.pendingBatch.length - 1];
		if (this.pendingBatch.length === 0 || lastPendingBatch === undefined) {
			return undefined;
		}
		return lastPendingBatch.referenceSequenceNumber;
	}

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

	public popBatch(): IBatch {
		const batch: IBatch = {
			content: this.pendingBatch,
			contentSizeInBytes: this.batchContentSize,
			referenceSequenceNumber: this.referenceSequenceNumber,
			hasReentrantOps: this.hasReentrantOps,
		};

		this.pendingBatch = [];
		this.batchContentSize = 0;
		this.clientSequenceNumber = undefined;
		this.hasReentrantOps = false;

		return addBatchMetadata(batch);
	}

	/**
	 * Capture the pending state at this point
	 */
	public checkpoint(): IBatchCheckpoint {
		const startPoint = this.pendingBatch.length;
		return {
			rollback: (process: (message: BatchMessage) => void) => {
				const pendingBatchSlice = this.pendingBatch
					.slice(startPoint + 1, this.pendingBatch.length)
					.reverse();
				for (const message of pendingBatchSlice) {
					this.batchContentSize -= message?.contents?.length ?? 0;
					process(message);
				}

				this.pendingBatch.length = startPoint;
			},
		};
	}
}

const addBatchMetadata = (batch: IBatch): IBatch => {
	const firstContent = batch.content[0];
	const lastContent = batch.content[batch.content.length - 1];
	if (firstContent !== undefined && lastContent !== undefined) {
		firstContent.metadata = {
			...firstContent.metadata,
			batch: true,
		};
		lastContent.metadata = {
			...lastContent.metadata,
			batch: false,
		};
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
	return batch.contentSizeInBytes + opOverhead * batch.content.length;
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
