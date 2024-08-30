/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { EventEmitter } from "@fluid-internal/client-utils";
import { performance } from "@fluid-internal/client-utils";
import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import {
	ITelemetryLoggerExt,
	createChildLogger,
} from "@fluidframework/telemetry-utils/internal";

import { getEffectiveBatchId, type InboundBatch } from "./opLifecycle/index.js";

type BatchTrackerMessage = Pick<ISequencedDocumentMessage, "sequenceNumber">;

export class BatchTracker {
	private readonly logger: ITelemetryLoggerExt;
	private startBatchSequenceNumber: number | undefined;
	private trackedBatchCount: number = 0;
	private batchProcessingStartTimeStamp: number | undefined;

	constructor(
		private readonly batchEventEmitter: EventEmitter,
		logger: ITelemetryBaseLogger,
		batchLengthThreshold: number,
		batchCountSamplingRate: number,
		dateTimeProvider: () => number = () => performance.now(),
	) {
		this.logger = createChildLogger({ logger, namespace: "Batching" });

		this.batchEventEmitter.on("batchBegin", (message: BatchTrackerMessage) => {
			this.startBatchSequenceNumber = message.sequenceNumber;
			this.batchProcessingStartTimeStamp = dateTimeProvider();
			this.trackedBatchCount++;
		});

		this.batchEventEmitter.on(
			"batchEnd",
			(error: any | undefined, message: BatchTrackerMessage) => {
				assert(
					this.startBatchSequenceNumber !== undefined &&
						this.batchProcessingStartTimeStamp !== undefined,
					0x2ba /* "batchBegin must fire before batchEnd" */,
				);

				const length = message.sequenceNumber - this.startBatchSequenceNumber + 1;
				if (length >= batchLengthThreshold) {
					this.logger.sendPerformanceEvent({
						eventName: "LengthTooBig",
						length,
						threshold: batchLengthThreshold,
						batchEndSequenceNumber: message.sequenceNumber,
						duration: dateTimeProvider() - this.batchProcessingStartTimeStamp,
						batchError: error !== undefined,
					});
				}

				if (this.trackedBatchCount % batchCountSamplingRate === 0) {
					this.logger.sendPerformanceEvent({
						eventName: "Length",
						length,
						samplingRate: batchCountSamplingRate,
						batchEndSequenceNumber: message.sequenceNumber,
						duration: dateTimeProvider() - this.batchProcessingStartTimeStamp,
					});
				}

				this.startBatchSequenceNumber = undefined;
				this.batchProcessingStartTimeStamp = undefined;
			},
		);
	}
}

/**
 * Track batch sizes in terms of op counts and processing times
 *
 * @param batchEventEmitter - event emitter which tracks the lifecycle of batch operations
 * @param logger - See {@link @fluidframework/core-interfaces#ITelemetryLoggerExt}
 * @param batchLengthThreshold - threshold for the length of a batch when to send an error event
 * @param batchCountSamplingRate - rate for batches for which to send an event with its characteristics
 */
export const BindBatchTracker = (
	batchEventEmitter: EventEmitter,
	logger: ITelemetryLoggerExt,
	batchLengthThreshold: number = 1000,
	batchCountSamplingRate: number = 1000,
) => new BatchTracker(batchEventEmitter, logger, batchLengthThreshold, batchCountSamplingRate);

/**
 * This class tracks recent batchIds we've seen, and checks incoming batches for duplicates.
 */
export class DuplicateBatchDetector {
	private readonly batchIdsAll = new Set<string>();

	private readonly batchIdBySeqNum = new Map<number, string>();

	public processInboundBatch(
		inboundBatch: InboundBatch,
	): { duplicate: true; otherSequenceNumber: number } | { duplicate: false } {
		const { sequenceNumber, minimumSequenceNumber } = inboundBatch.keyMessage;

		this.clearOldBatchIds(minimumSequenceNumber);

		// getEffectiveBatchId is only needed in the SUPER rare/surprising case where
		// the original batch (not resubmitted, so no batchId) arrives in parallel with a resubmitted batch.
		// In the presence of typical network conditions, this would not be possible
		// (the original batch should roundtrip WAY before another container could rehydrate, connect, and resubmit)
		const batchId = getEffectiveBatchId(inboundBatch);

		// Check this batch against the tracked batchIds to see if it's a duplicate
		if (this.batchIdsAll.has(batchId)) {
			for (const [trackedSequenceNumber, trackedBatchId] of this.batchIdBySeqNum.entries()) {
				if (trackedBatchId === batchId) {
					return {
						duplicate: true,
						otherSequenceNumber: trackedSequenceNumber,
					};
				}
			}
			assert(false, "Should have found the batchId in batchIdBySeqNum map");
		}
		// Now we know it's not a duplicate, so add it to the tracked batchIds and return.
		assert(
			!this.batchIdBySeqNum.has(sequenceNumber),
			"Shouldn't add a batchId that's already tracked",
		);
		this.batchIdBySeqNum.set(sequenceNumber, batchId);
		this.batchIdsAll.add(batchId);

		return { duplicate: false };
	}

	/**
	 * Batches that started before the MSN are not at risk for a sequenced duplicate to arrive,
	 * since the batch start has been processed by all clients, and local batches are deduped and the forked client would close.
	 */
	private clearOldBatchIds(msn: number) {
		this.batchIdBySeqNum.forEach((batchId, sequenceNumber) => {
			if (sequenceNumber < msn) {
				this.batchIdBySeqNum.delete(sequenceNumber);
				this.batchIdsAll.delete(batchId);
			}
		});
	}
}
