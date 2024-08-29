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

import type { InboundBatch } from "./opLifecycle/index.js";
import { getEffectiveBatchId } from "./pendingStateManager.js";

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

	public processInboundBatch(inboundBatch: InboundBatch) {
		//* TODO: Improve/simplify this to account for empty batches.
		//* Maybe put the empty grouped batch on here instead of just the sequence number?
		const { sequenceNumber, minimumSequenceNumber } = inboundBatch.messages[0] ?? {
			sequenceNumber: inboundBatch.emptyBatchSequenceNumber ?? -1, //* FIX - don't need the ??
			//* TODO: Include this in empty batches
			minimumSequenceNumber: -1,
		};

		this.clearOldBatchIds(minimumSequenceNumber);

		//* Revisit and/or try to test
		//* This would be SUPER rare/weird to have original (not resubmitted, no batchId) batch
		//* arrive in parallel with a resubmitted batch, but maybe it's possible
		//* If it's NOT possible, we can skip all this if there's no explicit batchId
		const batchId = getEffectiveBatchId(inboundBatch);

		// Check this batch against the tracked batchIds to see if it's a duplicate
		if (this.batchIdsAll.has(batchId)) {
			assert(
				this.batchIdBySeqNum.has(sequenceNumber),
				"Shouldn't add a batchId that's already tracked",
			);

			//* Or return the info for logging?  Or log here?
			return true;
		}

		//* Add it after checking to avoid finding itself
		assert(
			!this.batchIdBySeqNum.has(sequenceNumber),
			"Shouldn't add a batchId that's already tracked",
		);
		this.batchIdBySeqNum.set(sequenceNumber, batchId);
		this.batchIdsAll.add(batchId);
	}

	/**
	 * Batches that started before the MSN are not at risk for a sequenced duplicate to arrive,
	 * since the batch start has been processed by all clients, and local batches are deduped and the forked client would close.
	 */
	private clearOldBatchIds(msn: number) {
		//* Switch to iterating over Object.entries to avoid the undefined check
		const sequenceNumbers = Array.from(this.batchIdBySeqNum.keys());
		for (const sequenceNumber of sequenceNumbers) {
			if (sequenceNumber < msn) {
				const batchId = this.batchIdBySeqNum.get(sequenceNumber);
				if (batchId !== undefined) {
					this.batchIdBySeqNum.delete(sequenceNumber);
					this.batchIdsAll.delete(batchId);
				}
			}
		}
	}
}
