/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICompressionRuntimeOptions } from "../containerRuntime";
import { BatchMessage, IBatch, IBatchCheckpoint } from "./definitions";

export interface IBatchManagerOptions {
	readonly hardLimit: number;
	readonly softLimit?: number;
	readonly compressionOptions?: ICompressionRuntimeOptions;
}

/**
 * Helper class that manages partial batch & rollback.
 */
export class BatchManager {
	private pendingBatch: BatchMessage[] = [];
	private batchContentSize = 0;

	public get length() {
		return this.pendingBatch.length;
	}
	public get contentSizeInBytes() {
		return this.batchContentSize;
	}

	public get referenceSequenceNumber(): number | undefined {
		return this.pendingBatch.length === 0
			? undefined
			: this.pendingBatch[this.pendingBatch.length - 1].referenceSequenceNumber;
	}

	constructor(public readonly options: IBatchManagerOptions) {}

	public push(message: BatchMessage): boolean {
		const contentSize = this.batchContentSize + (message.contents?.length ?? 0);
		const opCount = this.pendingBatch.length;

		// Attempt to estimate batch size, aka socket message size.
		// Each op has pretty large envelope, estimating to be 200 bytes.
		// Also content will be strigified, and that adds a lot of overhead due to a lot of escape characters.
		// Not taking it into account, as compression work should help there - compressed payload will be
		// initially stored as base64, and that requires only 2 extra escape characters.
		const socketMessageSize = contentSize + 200 * opCount;

		// If we were provided soft limit, check for exceeding it.
		// But only if we have any ops, as the intention here is to flush existing ops (on exceeding this limit)
		// and start over. That's not an option if we have no ops.
		// If compression is enabled, the soft and hard limit are ignored and the message will be pushed anyways.
		// Cases where the message is still too large will be handled by the maxConsecutiveReconnects path.
		if (
			this.options.softLimit !== undefined &&
			this.length > 0 &&
			socketMessageSize >= this.options.softLimit
		) {
			return false;
		}

		if (socketMessageSize >= this.options.hardLimit) {
			return false;
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
		};

		this.pendingBatch = [];
		this.batchContentSize = 0;

		return addBatchMetadata(batch);
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

const addBatchMetadata = (batch: IBatch): IBatch => {
	if (batch.content.length > 1) {
		batch.content[0].metadata = {
			...batch.content[0].metadata,
			batch: true,
		};
		batch.content[batch.content.length - 1].metadata = {
			...batch.content[batch.content.length - 1].metadata,
			batch: false,
		};
	}

	return batch;
};
