/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    extractBoxcar,
    ICollection,
    IContext,
    IKafkaMessage,
    IPartitionLambda,
    IRawOperationMessage,
    IRawSingleKafkaMessage,
} from "@microsoft/fluid-server-services-core";
import winston = require("winston");

export class CopierLambda implements IPartitionLambda {
    // Below, one job corresponds to the task of sending one batch to Mongo:
    private pendingJobs = new Map<string, IRawOperationMessage[][]>();
    private pendingOffset: number;
    private currentJobs = new Map<string, IRawOperationMessage[][]>();

    constructor(
        private rawOpCollection: ICollection<any>,
        protected context: IContext) {
    }

    public handler(message: IKafkaMessage): void {
        // Extract batch of raw ops from Kafka message:
        const boxcar = extractBoxcar(message);
        const batch = boxcar.contents;
        const topic = `${boxcar.tenantId}/${boxcar.documentId}`;

        winston.info("LOG: handler ->boxcar");
        winston.info(`boxcar doc id: ${boxcar.documentId}`);
        winston.info(`boxcar tenant id: ${boxcar.tenantId}`);
        winston.info(batch);
        winston.info("LOG: handler ->batch[0]")
        winston.info(`batch0 doc id: ${(batch[0] as IRawOperationMessage).documentId}`)
        winston.info(`batch0 tenant id: ${(batch[0] as IRawOperationMessage).tenantId}`)
        winston.info(`batch0 client id: ${(batch[0] as IRawOperationMessage).clientId}`)

        const convertedBatch = batch.map(m => (m as IRawOperationMessage));

        // Write the batch directly to Mongo:
        if (!this.pendingJobs.has(topic)) {
            this.pendingJobs.set(topic, []);
        }
        this.pendingJobs.get(topic).push(convertedBatch);

        // Update current offset (will be tied to this batch):
        this.pendingOffset = message.offset;
        this.sendPending();
    }

    public close() {
        this.pendingJobs.clear();
        this.currentJobs.clear();

        return;
    }

    private sendPending() {
        // If there is work currently being sent or we have no pending work return early
        if (this.currentJobs.size > 0 || this.pendingJobs.size === 0) {
            return;
        }

        // Swap current and pending
        const temp = this.currentJobs;
        this.currentJobs = this.pendingJobs;
        this.pendingJobs = temp;
        const batchOffset = this.pendingOffset;

        const allProcessed = [];

        // Process all current jobs on all current topics:
        for (const [, convertedBatch] of this.currentJobs) {
            const processP = this.processMongoCore(convertedBatch);
            allProcessed.push(processP);
        }

        Promise.all(allProcessed).then(
            () => {
                this.currentJobs.clear();
                this.context.checkpoint(batchOffset);
                this.sendPending();
            },
            (error) => {
                this.context.error(error, true);
            });
    }

    private async processMongoCore(kafkaBatches: IRawOperationMessage[][]): Promise<void> {
        await this.rawOpCollection
            .insertMany(kafkaBatches, false)
            .catch((error) => {
            // Duplicate key errors are ignored since a replay may cause us to insert twice into Mongo.
            // All other errors result in a rejected promise.
            if (error.code !== 11000) {
                // Needs to be a full rejection here
                return Promise.reject(error);
            }
        });
    }
}
