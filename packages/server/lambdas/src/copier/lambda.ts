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
} from "@microsoft/fluid-server-services-core";
// tslint:disable-next-line
import winston = require("winston");

export class CopierLambda implements IPartitionLambda {
    // Below, one job corresponds to the task of sending one batch to Mongo:
    private pendingJobs = new Map<string, IRawOperationMessage[]>();
    private pendingOffset: number;
    private currentJobs = new Map<string, IRawOperationMessage[]>();

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

        // Create a stringified array of IRawOperationMessage objects and pack
        // it into a single message that can be split apart on reception:
        const convertedBatch = batch.map((m) => (m as IRawOperationMessage));
        const jsonBatch = JSON.stringify(convertedBatch);
        const combinedMessage: IRawOperationMessage = {
            operation: {
                contents: jsonBatch,
                clientSequenceNumber: -1,
                referenceSequenceNumber: -1,
                type: undefined,
            },
            documentId: boxcar.documentId,
            tenantId: boxcar.tenantId,
            clientId: (batch[0] as IRawOperationMessage).clientId,
            timestamp: undefined,
            type: "rawdeltas_batch",
        };
        winston.info(combinedMessage);

        // Write the batch directly to Mongo:
        if (!this.pendingJobs.has(topic)) {
            this.pendingJobs.set(topic, []);
        }
        this.pendingJobs.get(topic).push(combinedMessage);

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

    private async processMongoCore(kafkaBatches: IRawOperationMessage[]): Promise<void> {
        await this.rawOpCollection
            .insertMany(kafkaBatches, false)
            .then((whatever) => {
                winston.info("test");
            })
            .catch((error) => {
                // Duplicate key errors are ignored since a replay may cause us to insert twice into Mongo.
                // All other errors result in a rejected promise.

                winston.info("DUPLICATE KEY ERROR");

                if (error.code !== 11000) {
                    // Needs to be a full rejection here
                    return Promise.reject(error);
                }
        });
    }
}
