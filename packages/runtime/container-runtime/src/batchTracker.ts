/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { EventEmitter } from "@fluid-internal/client-utils";
import { performance } from "@fluid-internal/client-utils";
import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions";
import {
	ITelemetryLoggerExt,
	LoggingError,
	createChildLogger,
} from "@fluidframework/telemetry-utils/internal";
import { asBatchMetadata } from "./metadata.js";

export const DUPLICATE_BATCH_MSG = "Duplicate batch";

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

		this.batchEventEmitter.on("batchBegin", (message: ISequencedDocumentMessage) => {
			this.startBatchSequenceNumber = message.sequenceNumber;
			this.batchProcessingStartTimeStamp = dateTimeProvider();
			this.trackedBatchCount++;

			// Check this batch against the tracked batchIds to see if it's a duplicate
			// ScheduleManager will catch this error and tell the ContainerRuntime not to process the message
			if (this.checkForAlreadySequencedBatchId(message)) {
				//* TODO: Don't use exception handling for control flow!!
				throw new LoggingError(DUPLICATE_BATCH_MSG);
			}

			const metadata = asBatchMetadata(message.metadata);
			if (metadata?.batch === true || metadata?.batchId !== undefined) {
				const batchId = metadata.batchId ?? "BACK-COMPAT-BATCH-ID"; //* Necessary for tests to pass?
				(message.metadata as any).batchId = batchId; //* back compat hack for prototype
				this.addBatchId(batchId, message.sequenceNumber);
			} // else: single message (no batch semantics)
		});

		this.batchEventEmitter.on(
			"batchEnd",
			(error: any | undefined, message: ISequencedDocumentMessage) => {
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

	//* TODO: Also track clientIds that have lost a race, and ignore future ops from them?
	//* TODO: There could be some really whacky race conditions with two parallel rehydrations reconnecting, need to think more.
	private readonly batchIdsAll = new Set<string>();
	private readonly batchIdsBySeqNum = new Map<number, Set<string>>();

	public checkForAlreadySequencedBatchId(message: ISequencedDocumentMessage): boolean {
		//* TODO: Move this side effect to its own function called elsewhere
		this.clearOldBatchIds(message.minimumSequenceNumber);

		const metadata = asBatchMetadata(message.metadata);
		if (metadata?.batchId !== undefined && this.batchIdsAll.has(metadata.batchId)) {
			return true;
		}
		return false;
	}

	private addBatchId(batchId: string, sequenceNumber: number) {
		let batchIds = this.batchIdsBySeqNum.get(sequenceNumber);
		if (batchIds === undefined) {
			batchIds = new Set<string>();
			this.batchIdsBySeqNum.set(sequenceNumber, batchIds);
		}
		batchIds.add(batchId);
		this.batchIdsAll.add(batchId);
	}

	/**
	 * Batches that started before the MSN are not at risk for a sequenced duplicate to arrive,
	 * since the batch start has been processed by all clients, and local batches are deduped and the forked client would close.
	 */
	private clearOldBatchIds(msn: number) {
		const sequenceNumbers = Array.from(this.batchIdsBySeqNum.keys());
		for (const sequenceNumber of sequenceNumbers) {
			if (sequenceNumber < msn) {
				const batchIds = this.batchIdsBySeqNum.get(sequenceNumber);
				this.batchIdsBySeqNum.delete(sequenceNumber);
				batchIds?.forEach((batchId) => this.batchIdsAll.delete(batchId));
			}
		}
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
