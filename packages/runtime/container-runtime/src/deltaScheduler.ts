/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@microsoft/fluid-common-definitions";
import { IDeltaManager } from "@microsoft/fluid-container-definitions";
import {
    IDocumentMessage,
    ISequencedDocumentMessage,
} from "@microsoft/fluid-protocol-definitions";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const performanceNow = require("performance-now") as (() => number);

/**
 * The number of times inbound queue has been processed when there is more than one op in the
 * queue. This is used to log the time taken to process large number of ops.
 * For example, when catching up ops right after boot or catching up ops / delayed reaziling
 * components by summarizer.
 */
let inboundQueueProcessingCount = -1;

export class DeltaScheduler {
    private readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    // The time for processing ops in a single turn.
    private readonly processingTime = 20;

    // The increase in time for processing ops after each turn.
    private readonly processingTimeIncrement = 10;

    private processingStartTime: number | undefined;
    private totalProcessingTime: number = this.processingTime;

    private opProcessingLog: {
        numberOfOps: number;
        numberOfBatches: number;
        totalProcessingTime: number;
    } | undefined;

    constructor(
        deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        private readonly logger: ITelemetryLogger,
    ) {
        this.deltaManager = deltaManager;

        this.deltaManager.inbound.on("idle", () => { this.inboundQueueIdle(); });
    }

    public batchBegin() {
        if (this.deltaManager.inbound.length > 0 && !this.processingStartTime) {
            // Start the timer that keeps track of how long we have processed ops in the delta queue
            // in this call.
            this.processingStartTime = performanceNow();

            // Initialize the object that will be used to log the time taken to process the ops.
            if (this.opProcessingLog === undefined) {
                inboundQueueProcessingCount++;
                this.opProcessingLog = {
                    numberOfOps: this.deltaManager.inbound.length,
                    numberOfBatches: 1,
                    totalProcessingTime: 0,
                };
            }
        }
    }

    public batchEnd() {
        // If we have processed ops for more than the total processing time, we pause the
        // queue, yield the thread and schedule a resume. This ensures that we don't block
        // the JS threads for a long time (for example, when catching up ops right after
        // boot or catching up ops / delayed reaziling components by summarizer).
        //
        // We keep increasing the total processing time after each turn until all the ops have been
        // processed. This way we keep the responsiveness at the beginning while also making sure
        // that all the ops process fairly quickly.
        if (this.processingStartTime && this.deltaManager.inbound.length > 0) {
            const elaspedTime = performanceNow() - this.processingStartTime;
            if (elaspedTime > this.totalProcessingTime) {
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                this.deltaManager.inbound.systemPause();

                setTimeout(() => {
                    this.deltaManager.inbound.systemResume();
                });

                this.processingStartTime = undefined;
                this.totalProcessingTime += this.processingTimeIncrement;

                // Update the telemetry log object since.
                this.opProcessingLog.numberOfBatches++;
                this.opProcessingLog.totalProcessingTime += elaspedTime;
            }
        }
    }

    private inboundQueueIdle() {
        if (this.processingStartTime) {
            // Log telemetry for the time taken to process ops in the inbound queue every 2000th time
            // we process more than one op.
            if (inboundQueueProcessingCount % 2000 === 0) {
                // Add the time taken for processing the final ops to the total processing time in the
                // telemetry log object.
                this.opProcessingLog.totalProcessingTime += performanceNow() - this.processingStartTime;

                this.logger.sendTelemetryEvent({
                    eventName: "InboundOpsProcessingTime",
                    numberOfOps: this.opProcessingLog.numberOfOps,
                    numberOfBatches: this.opProcessingLog.numberOfBatches,
                    processingTime: this.opProcessingLog.totalProcessingTime,
                });

                this.opProcessingLog = undefined;
            }

            this.processingStartTime = undefined;
            this.totalProcessingTime = this.processingTime;
        }
    }
}
