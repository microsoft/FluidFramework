/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { performanceNow } from "@fluid-internal/client-utils";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

// ISequencedDocumentMessage
export interface IMessage {
	sequenceNumber: number;
}

export type CacheEntry = (IMessage | undefined)[];

export interface IBatch {
	remainingSlots: number;
	batchData: CacheEntry;
	/**
	 * Tells if this batch is  dirty, i.e. it contains ops that were not flushed to cache
	 */
	dirty: boolean;
}

export interface ICache {
	write(batchNumber: string, data: string): Promise<void>;
	read(batchNumber: string): Promise<string | undefined>;
	remove(): void;
}

export class OpsCache {
	private readonly batches: Map<number, null | IBatch> = new Map();
	private timer: ReturnType<typeof setTimeout> | undefined;

	constructor(
		startingSequenceNumber: number,
		private readonly logger: ITelemetryLoggerExt,
		private readonly cache: ICache,
		private readonly batchSize: number,
		private readonly timerGranularity: number,
		private totalOpsToCache: number,
	) {
		/**
		 * Initial batch is a special case because it will never be full - all ops prior (inclusive) to
		 * `startingSequenceNumber` are never going to show up (undefined)
		 */
		const remainingSlots =
			this.batchSize - this.getPositionInBatchArray(startingSequenceNumber) - 1;
		if (remainingSlots !== 0) {
			this.batches.set(this.getBatchNumber(startingSequenceNumber), {
				remainingSlots,
				batchData: this.initializeNewBatchDataArray(),
				dirty: false,
			});
		}
	}

	public dispose(): void {
		this.batches.clear();
		if (this.timer !== undefined) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
	}

	public flushOps(): void {
		for (const [key, value] of this.batches) {
			// Don't flush if the batch has no ops, already flushed or has empty slots at both beginning and end.
			if (
				value === null ||
				!value.dirty ||
				value.batchData.length === 0 ||
				(value.batchData[0] === undefined &&
					value.batchData[value.batchData.length - 1] === undefined)
			) {
				continue;
			}
			value.dirty = false;
			this.write(key, value);
		}
	}

	public addOps(ops: IMessage[]): void {
		if (this.totalOpsToCache <= 0) {
			return;
		}

		for (const op of ops) {
			const batchNumber = this.getBatchNumber(op.sequenceNumber);
			const positionInBatch = this.getPositionInBatchArray(op.sequenceNumber);

			let currentBatch = this.batches.get(batchNumber);

			if (currentBatch === undefined) {
				currentBatch = {
					remainingSlots: this.batchSize - 1,
					batchData: this.initializeNewBatchDataArray(),
					dirty: true,
				};
				currentBatch.batchData[positionInBatch] = op;
				this.batches.set(batchNumber, currentBatch);
			} else if (
				currentBatch !== null &&
				currentBatch.batchData[positionInBatch] === undefined
			) {
				currentBatch.batchData[positionInBatch] = op;
				currentBatch.remainingSlots--;
				currentBatch.dirty = true;
			} else {
				// Either batch was flushed or this op was already there - nothing to do!
				return;
			}

			if (currentBatch.remainingSlots === 0) {
				// batch is full, flush to cache
				this.write(batchNumber, currentBatch);
				// eslint-disable-next-line unicorn/no-null
				this.batches.set(batchNumber, null);
			} else {
				this.scheduleTimer();
			}

			this.totalOpsToCache--;
			if (this.totalOpsToCache === 0) {
				this.logger.sendPerformanceEvent({ eventName: "CacheOpsLimitHit" });
				this.cache.remove();
				this.dispose();
				break;
			}
		}
	}

	/**
	 * Retrieves ops from cache
	 * @param from - inclusive
	 * @param to - exclusive
	 * @returns ops retrieved
	 */
	private async getCore(from: number, to?: number): Promise<IMessage[]> {
		const messages: IMessage[] = [];
		let batchNumber = this.getBatchNumber(from);
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const res = await this.cache.read(`${this.batchSize}_${batchNumber}`);
			if (res === undefined) {
				return messages;
			}
			const result: CacheEntry = JSON.parse(res) as CacheEntry;
			const prevMessagesLength = messages.length;
			for (const op of result) {
				// Note that we write out undefined, but due to JSON.stringify, it turns into null!
				if (op) {
					if (to !== undefined && op.sequenceNumber >= to) {
						return messages;
					}
					if (messages.length === 0) {
						if (op.sequenceNumber > from) {
							return messages;
						} else if (op.sequenceNumber < from) {
							continue;
						}
					}
					messages.push(op);
				} else if (messages.length > 0) {
					// If there is any gap, return the messages till now.
					return messages;
				}
			}

			// If we didn't get any op from this batch, then return messages till now. As it tells us that,
			// either the first message "from" is not present in cache or a gap will occur from 1 batch to next.
			if (prevMessagesLength === messages.length) {
				return messages;
			}
			batchNumber++;
		}
	}

	/**
	 * Retrieves ops from cache
	 * @param from - inclusive
	 * @param to - exclusive
	 * @returns ops retrieved
	 */
	public async get(from: number, to?: number): Promise<IMessage[]> {
		const start = performanceNow();

		const messages = await this.getCore(from, to);

		const duration = performanceNow() - start;
		if (messages.length > 0 || duration > 1000) {
			this.logger.sendPerformanceEvent({
				eventName: "CacheOpsUsed",
				from,
				to,
				length: messages.length,
				duration,
			});
		}
		return messages;
	}

	protected write(batchNumber: number, payload: IBatch): void {
		// Errors are caught and logged by PersistedCacheWithErrorHandling that sits
		// in the adapter chain of cache adapters
		this.cache
			.write(`${this.batchSize}_${batchNumber}`, JSON.stringify(payload.batchData))
			.catch(() => {
				this.totalOpsToCache = 0;
			});
	}

	protected scheduleTimer(): void {
		if (!this.timer && this.timerGranularity > 0) {
			this.timer = setTimeout(() => {
				this.timer = undefined;
				this.flushOps();
			}, this.timerGranularity);
		}
	}

	private getBatchNumber(sequenceNumber: number): number {
		return Math.floor(sequenceNumber / this.batchSize);
	}

	private getPositionInBatchArray(sequenceNumber: number): number {
		return sequenceNumber % this.batchSize;
	}

	private initializeNewBatchDataArray(): IMessage[] {
		const tempArray: IMessage[] = [];
		tempArray.length = this.batchSize; // fill with empty, undefined elements
		return tempArray;
	}
}
