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

		this.batchEventEmitter.on("batchEnd", (error: unknown, message: BatchTrackerMessage) => {
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
		});
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
): BatchTracker =>
	new BatchTracker(batchEventEmitter, logger, batchLengthThreshold, batchCountSamplingRate);
