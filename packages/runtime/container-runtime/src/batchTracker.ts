/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert } from "@fluidframework/common-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import EventEmitter from "events";

export class BatchTracker {
    private readonly logger: ITelemetryLogger;
    private startBatchSequenceNumber: number | undefined;
    private trackedBatchCount: number = 0;
    private batchProcessingStartTimeStamp: number | undefined;

    constructor(
        private readonly batchEventEmitter: EventEmitter,
        logger: ITelemetryLogger,
        private readonly opCountThreshold: number,
        private readonly batchCountSamplingRate: number,
        private readonly dateTimeProvider: () => number = () => Date.now(),
    ) {
        this.logger = ChildLogger.create(logger, "Batching");

        this.batchEventEmitter.on("batchBegin", (message: ISequencedDocumentMessage) => {
            this.startBatchSequenceNumber = message.sequenceNumber;
            this.batchProcessingStartTimeStamp = this.dateTimeProvider();
            this.trackedBatchCount++;
        });

        this.batchEventEmitter.on("batchEnd", (error: any | undefined, message: ISequencedDocumentMessage) => {
            assert(
                this.startBatchSequenceNumber !== undefined && this.batchProcessingStartTimeStamp !== undefined,
                "batchBegin must fire before batchEnd");

            const opCount = message.sequenceNumber - this.startBatchSequenceNumber + 1;
            if (opCount >= this.opCountThreshold) {
                this.logger.sendErrorEvent({
                    eventName: "TooManyOps",
                    opCount,
                    threshold: opCountThreshold,
                    referenceSequenceNumber: message.referenceSequenceNumber,
                    batchEndSequenceNumber: message.sequenceNumber,
                    timeSpanMs: this.dateTimeProvider() - this.batchProcessingStartTimeStamp,
                    batchError: error !== undefined,
                });
            }

            if (this.trackedBatchCount % this.batchCountSamplingRate === 0) {
                this.logger.sendPerformanceEvent({
                    eventName: "OpCount",
                    opCount,
                    samplingRate: batchCountSamplingRate,
                    referenceSequenceNumber: message.referenceSequenceNumber,
                    batchEndSequenceNumber: message.sequenceNumber,
                    timeSpanMs: this.dateTimeProvider() - this.batchProcessingStartTimeStamp,
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
 * @param logger - logger
 * @param opCountThreshold - threshold for the count of ops in a batch when to send an error event
 * @param batchCountSamplingRate - rate for batches for which to send an event with its characteristics
 * @returns
 */
export const BindBatchTracker = (
    batchEventEmitter: EventEmitter,
    logger: ITelemetryLogger,
    opCountThreshold: number = 128,
    batchCountSamplingRate: number = 1000,
) => new BatchTracker(batchEventEmitter, logger, opCountThreshold, batchCountSamplingRate)
