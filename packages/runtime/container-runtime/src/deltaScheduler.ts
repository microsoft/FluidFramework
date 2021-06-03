/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { performance } from "@fluidframework/common-utils";
import { IDeltaManager } from "@fluidframework/container-definitions";
import {
    IDocumentMessage,
    ISequencedDocumentMessage,
} from "@fluidframework/protocol-definitions";

/**
 * DeltaScheduler is responsible for the scheduling of inbound delta queue in cases where there
 * is more than one op a particular run of the queue. It does not schedule if there is just one
 * op or just one batch in the run. It does the following two things:
 * 1. If the ops have been processed for more than a specific amount of time, it pauses the queue
 *    and calls setTimeout to schedule a resume of the queue. This ensures that we don't block
 *    the JS thread for a long time processing ops synchronously (for example, when catching up
 *    ops right after boot or catching up ops / delayed realizing data stores by summarizer).
 * 2. If we scheduled a particular run of the queue, it logs telemetry for the number of ops
 *    processed, the time and number of turns it took to process the ops.
 */
export class DeltaScheduler {
    private readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    // The time for processing ops in a single turn.
    public static readonly processingTime = 20;

    // The increase in time for processing ops after each turn.
    private readonly processingTimeIncrement = 10;

    private processingStartTime: number | undefined;
    private totalProcessingTime: number = DeltaScheduler.processingTime;

    // This keeps track of whether the delta scheduler is scheduling a particular run of the
    // the inbound delta queue. Basically, every time the delta queue starts processing with
    // more than one op, this will be set to true until the run completes.
    private isScheduling: boolean = false;

    // This keeps track of the number of times inbound queue has been scheduled. After a particular
    // count, we log telemetry for the number of ops processed, the time and number of turns it took
    // to process the ops.
    private schedulingCount: number = 0;

    private schedulingLog: {
        numberOfOps: number;
        totalProcessingTime: number;
        numberOfTurns: number;
    } | undefined;

    constructor(
        deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        private readonly logger: ITelemetryLogger,
    ) {
        this.deltaManager = deltaManager;
        this.deltaManager.inbound.on("idle", () => { this.inboundQueueIdle(); });
    }

    public batchBegin() {
        if (!this.processingStartTime) {
            this.processingStartTime = performance.now();
        }
    }

    public batchEnd() {
        if (this.shouldRunScheduler()) {
            if (!this.isScheduling) {
                this.isScheduling = true;
                // Every 2000th time we are scheduling the inbound queue, we log telemetry for the
                // number of ops processed, the time and number of turns it took to process the ops.
                if (this.schedulingCount % 2000 === 0) {
                    this.schedulingLog = {
                        numberOfOps: this.deltaManager.inbound.length,
                        numberOfTurns: 1,
                        totalProcessingTime: 0,
                    };
                }
            }

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const elapsedTime = performance.now() - this.processingStartTime!;
            if (elapsedTime > this.totalProcessingTime) {
                // We have processed ops for more than the total processing time. So, pause the
                // queue, yield the thread and schedule a resume.

                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                this.deltaManager.inbound.pause();
                setTimeout(() => {
                    this.deltaManager.inbound.resume();
                });

                this.processingStartTime = undefined;
                // Increase the total processing time. Keep doing this after each turn until all the ops have
                // been processed. This way we keep the responsiveness at the beginning while also making sure
                // that all the ops process fairly quickly.
                this.totalProcessingTime += this.processingTimeIncrement;

                // If we are logging the telemetry this time, update the telemetry log object.
                if (this.schedulingLog) {
                    this.schedulingLog.numberOfTurns++;
                    this.schedulingLog.totalProcessingTime += elapsedTime;
                }
            }
        }
    }

    private inboundQueueIdle() {
        if (this.schedulingLog) {
            // Add the time taken for processing the final ops to the total processing time in the
            // telemetry log object.
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.schedulingLog.totalProcessingTime += performance.now() - this.processingStartTime!;

            this.logger.sendTelemetryEvent({
                eventName: "InboundOpsProcessingTime",
                numberOfOps: this.schedulingLog.numberOfOps,
                numberOfTurns: this.schedulingLog.numberOfTurns,
                processingTime: this.schedulingLog.totalProcessingTime,
            });

            this.schedulingLog = undefined;
        }

        // If we scheduled this batch of the inbound queue, increment the counter that tracks the
        // number of times we have done this.
        if (this.isScheduling) {
            this.isScheduling = false;
            this.schedulingCount++;
        }

        // Reset the processing times.
        this.processingStartTime = undefined;
        this.totalProcessingTime = DeltaScheduler.processingTime;
    }

    /**
     * This function tells whether we should run the scheduler.
     */
    private shouldRunScheduler(): boolean {
        // If there are still ops in the queue after the one we are processing now, we should
        // run the scheduler.
        return this.deltaManager.inbound.length > 0;
    }
}
