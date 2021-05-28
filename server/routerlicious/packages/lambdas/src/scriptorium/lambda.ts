/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { inspect } from "util";
import {
    extractBoxcar,
    ICollection,
    IContext,
    IQueuedMessage,
    IPartitionLambda,
    ISequencedOperationMessage,
    SequencedOperationType,
} from "@fluidframework/server-services-core";

export class ScriptoriumLambda implements IPartitionLambda {
    private pending = new Map<string, ISequencedOperationMessage[]>();
    private pendingOffset: IQueuedMessage | undefined;
    private current = new Map<string, ISequencedOperationMessage[]>();

    constructor(
        private readonly opCollection: ICollection<any>,
        protected context: IContext) {
    }

    public handler(message: IQueuedMessage) {
        const boxcar = extractBoxcar(message);

        for (const baseMessage of boxcar.contents) {
            if (baseMessage.type === SequencedOperationType) {
                const value = baseMessage as ISequencedOperationMessage;

                // Remove traces and serialize content before writing to mongo.
                value.operation.traces = [];

                const topic = `${value.tenantId}/${value.documentId}`;

                let pendingMessages = this.pending.get(topic);
                if (!pendingMessages) {
                    pendingMessages = [];
                    this.pending.set(topic, pendingMessages);
                }

                pendingMessages.push(value);
            }
        }

        this.pendingOffset = message;
        this.sendPending();

        return undefined;
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

        const allProcessed: Promise<void>[] = [];

        // Process all the batches + checkpoint
        for (const [, messages] of this.current) {
            const processP = this.processMongoCore(messages);
            allProcessed.push(processP);
        }

        Promise.all(allProcessed).then(
            () => {
                this.current.clear();
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                this.context.checkpoint(batchOffset!);
                this.sendPending();
            },
            (error) => {
                this.context.error(error, { restart: true });
            });
    }

    private async processMongoCore(messages: ISequencedOperationMessage[]): Promise<void> {
        return this.insertOp(messages);
    }

    private async insertOp(messages: ISequencedOperationMessage[]) {
        const dbOps = messages.map((message) => ({
            ...message,
            mongoTimestamp: new Date(message.operation.timestamp),
        }));
        return this.opCollection
            .insertMany(dbOps, false)
            .catch(async (error) => {
                this.context.log?.error(`Error inserting operation in the database: ${inspect(error)}`);

                // Duplicate key errors are ignored since a replay may cause us to insert twice into Mongo.
                // All other errors result in a rejected promise.
                if (error.code !== 11000) {
                    // Needs to be a full rejection here
                    return Promise.reject(error);
                }
            });
    }
}
