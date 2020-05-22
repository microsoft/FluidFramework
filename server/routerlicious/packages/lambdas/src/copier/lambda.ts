/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    extractBoxcar,
    ICollection,
    IContext,
    IQueuedMessage,
    IPartitionLambda,
    IRawOperationMessage,
    IRawOperationMessageBatch,
} from "@fluidframework/server-services-core";

export class CopierLambda implements IPartitionLambda {
    // Below, one job corresponds to the task of sending one batch to Mongo:
    private pendingJobs = new Map<string, IRawOperationMessageBatch[]>();
    private pendingOffset: IQueuedMessage;
    private currentJobs = new Map<string, IRawOperationMessageBatch[]>();

    constructor(
        private readonly rawOpCollection: ICollection<any>,
        protected context: IContext) {
    }

    public handler(message: IQueuedMessage): void {
        // Extract batch of raw ops from Kafka message:
        const boxcar = extractBoxcar(message);
        const batch = boxcar.contents;
        const topic = `${boxcar.tenantId}/${boxcar.documentId}`;

        // Extract boxcar contents and group the ops into the message batch:
        const submittedBatch: IRawOperationMessageBatch = {
            index: message.offset,
            documentId: boxcar.documentId,
            tenantId: boxcar.tenantId,
            contents: batch.map((m) => (m as IRawOperationMessage)),
        };

        // Write the batch directly to Mongo:
        if (!this.pendingJobs.has(topic)) {
            this.pendingJobs.set(topic, []);
        }
        this.pendingJobs.get(topic).push(submittedBatch);

        // Update current offset (will be tied to this batch):
        this.pendingOffset = message;
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
        for (const [, batch] of this.currentJobs) {
            const processP = this.processMongoCore(batch);
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

    private async processMongoCore(kafkaBatches: IRawOperationMessageBatch[]): Promise<void> {
        await this.rawOpCollection
            .insertMany(kafkaBatches, false)
            // eslint-disable-next-line @typescript-eslint/promise-function-async
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
