/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    extractBoxcar,
    ICollection,
    IContext,
    IQueuedMessage,
    IPartitionLambda,
    ISequencedOperationMessage,
    SequencedOperationType,
    runWithRetry,
    isRetryAble,
} from "@fluidframework/server-services-core";
import { getLumberBaseProperties } from "@fluidframework/server-services-telemetry";

export class ScriptoriumLambda implements IPartitionLambda {
    private pending = new Map<string, ISequencedOperationMessage[]>();
    private pendingOffset: IQueuedMessage | undefined;
    private current = new Map<string, ISequencedOperationMessage[]>();
    private readonly clientFacadeRetryEnabled: boolean;

    constructor(
        private readonly opCollection: ICollection<any>,
        protected context: IContext,
        protected readonly tenantId: string,
        protected readonly documentId: string) {
        this.clientFacadeRetryEnabled = isRetryAble(this.opCollection);
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
        return runWithRetry(
            async () => this.opCollection.insertMany(dbOps, false),
            "insertOpScriptorium",
            3 /* maxRetries */,
            1000 /* retryAfterMs */,
            getLumberBaseProperties(this.documentId, this.tenantId),
            (error) => error.code === 11000,
            (error) => !this.clientFacadeRetryEnabled, /* shouldRetry */
        );
    }
}
