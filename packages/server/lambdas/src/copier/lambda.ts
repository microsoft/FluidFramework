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
    RawOperationType,
} from "@microsoft/fluid-server-services-core";

export class CopierLambda implements IPartitionLambda {
    private pending = new Map<string, IRawOperationMessage[]>();
    private pendingOffset: number;
    private current = new Map<string, IRawOperationMessage[]>();

    constructor(
        private rawOpCollection: ICollection<any>,
        protected context: IContext) {
    }

    public handler(message: IKafkaMessage): void {
        // Extract list of raw ops from Kafka message:
        const boxcar = extractBoxcar(message);

        for (const baseMessage of boxcar.contents) {
            // If a particular message is a raw op then push it to a `pending`
            // for eventual addition to Mongo:
            if (baseMessage.type === RawOperationType) {
                const value = baseMessage as IRawOperationMessage;

                // Remove traces and serialize content before writing to mongo.
                value.operation.traces = [];

                const topic = `${value.tenantId}/${value.documentId}`;
                if (!this.pending.has(topic)) {
                    this.pending.set(topic, []);
                }

                this.pending.get(topic).push(value);
            }
        }

        // Update current offset (will be tied to this batch):
        this.pendingOffset = message.offset;
        this.sendPending();
    }

    public close() {
        this.pending.clear();
        this.current.clear();

        return;
    }

    private sendPending() {
        // If there is work currently being sent or we have no pending work return early
        if (this.current.size > 0 || this.pending.size === 0) {
            return;
        }

        // Swap current and pending
        const temp = this.current;
        this.current = this.pending;
        this.pending = temp;
        const batchOffset = this.pendingOffset;

        const allProcessed = [];

        // Process all the batches + checkpoint
        for (const [, messages] of this.current) {

            // Add a custom seq. number to each individual message:
            const orderedMessages = [];
            // tslint:disable-next-line
            for (let i = 0; i < messages.length; i++) {
                const tmp = messages[i] as IRawSingleKafkaMessage;
                tmp.batchedSequenceNumber = {
                    batchNumber: batchOffset,
                    opIndex: i,
                };
                orderedMessages.push(tmp);
            }

            const processP = this.processMongoCore(orderedMessages);
            allProcessed.push(processP);
        }

        Promise.all(allProcessed).then(
            () => {
                this.current.clear();
                this.context.checkpoint(batchOffset);
                this.sendPending();
            },
            (error) => {
                this.context.error(error, true);
            });
    }

    private async processMongoCore(kafkaOrderedMessages: IRawSingleKafkaMessage[]): Promise<void> {
        const insertP = this.insertOp(kafkaOrderedMessages);
        await Promise.all([insertP]);
    }

    private async insertOp(kafkaOrderedMessages: IRawSingleKafkaMessage[]) {
        return this.rawOpCollection
            .insertMany(kafkaOrderedMessages, false)
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
