/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { INack, ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import {
    extractBoxcar,
    IContext,
    IMessageBatch,
    INackMessage,
    IPartitionLambda,
    IPublisher,
    IQueuedMessage,
    ISequencedOperationMessage,
    NackOperationType,
    SequencedOperationType,
} from "@fluidframework/server-services-core";

/**
 * Container for a batch of messages being sent for a specific tenant/document id
 */
type BroadcasterMessageBatch = IMessageBatch<ISequencedDocumentMessage | INack>;

// Set immediate is not available in all environments, specifically it does not work in a browser.
// Fallback to set timeout in those cases
let taskScheduleFunction: (cb: () => any) => unknown;
let clearTaskScheduleTimerFunction: (timer: any) => void;

if (typeof setImmediate === "function") {
    taskScheduleFunction = setImmediate;
    clearTaskScheduleTimerFunction = clearImmediate;
} else {
    taskScheduleFunction = setTimeout;
    clearTaskScheduleTimerFunction = clearTimeout;
}

export class BroadcasterLambda implements IPartitionLambda {
    private pending = new Map<string, BroadcasterMessageBatch>();
    private pendingOffset: IQueuedMessage | undefined;
    private current = new Map<string, BroadcasterMessageBatch>();
    private messageSendingTimerId: unknown | undefined;

    constructor(
        private readonly publisher: IPublisher<ISequencedDocumentMessage | INack>,
        protected context: IContext) {
    }

    public handler(message: IQueuedMessage) {
        const boxcar = extractBoxcar(message);

        for (const baseMessage of boxcar.contents) {
            let topic: string | undefined;
            let event: string | undefined;

            if (baseMessage.type === SequencedOperationType) {
                const value = baseMessage as ISequencedOperationMessage;
                topic = `${value.tenantId}/${value.documentId}`;
                event = "op";
            } else if (baseMessage.type === NackOperationType) {
                const value = baseMessage as INackMessage;
                topic = `client#${value.clientId}`;
                event = "nack";
            }

            if (topic && event) {
                const value = baseMessage as INackMessage | ISequencedOperationMessage;

                let pendingBatch = this.pending.get(topic);
                if (!pendingBatch) {
                    pendingBatch = {
                        tenantId: value.tenantId,
                        documentId: value.documentId,
                        event,
                        messages: [value.operation],
                    };
                    this.pending.set(topic, pendingBatch);
                } else {
                    pendingBatch.messages.push(value.operation);
                }
            }
        }

        this.pendingOffset = message;
        this.sendPending();

        return undefined;
    }

    public close() {
        this.pending.clear();
        this.current.clear();
        this.pendingOffset = undefined;

        if (this.messageSendingTimerId !== undefined) {
            clearTaskScheduleTimerFunction(this.messageSendingTimerId);
            this.messageSendingTimerId = undefined;
        }
    }

    public hasPendingWork() {
        return this.pending.size !== 0 || this.current.size !== 0;
    }

    private sendPending() {
        if (this.messageSendingTimerId !== undefined) {
            // a send is in progress
            return;
        }

        if (this.pending.size === 0) {
            // no pending work. checkpoint now if we have a pending offset
            if (this.pendingOffset) {
                this.context.checkpoint(this.pendingOffset);
                this.pendingOffset = undefined;
            }
            return;
        }

        // Invoke the next send after a delay to give IO time to create more batches
        this.messageSendingTimerId = taskScheduleFunction(async () => {
            const batchOffset = this.pendingOffset;

            this.current = this.pending;
            this.pending = new Map<string, BroadcasterMessageBatch>();
            this.pendingOffset = undefined;

            // Process all the batches + checkpoint
            if (this.publisher.emitBatch) {
                const promises: Promise<void>[] = [];

                for (const [topic, batch] of this.current) {
                    promises.push(this.publisher.emitBatch(topic, batch));
                }

                try {
                    await Promise.all(promises);
                } catch (ex) {
                    this.context.error(ex, { restart: true });
                    return;
                }
            } else if (this.publisher.emit) {
                const promises: Promise<void>[] = [];

                for (const [topic, batch] of this.current) {
                    promises.push(this.publisher.emit(topic, batch.event, batch.documentId, batch.messages));
                }

                try {
                    await Promise.all(promises);
                } catch (ex) {
                    this.context.error(ex, { restart: true });
                    return;
                }
            } else {
                for (const [topic, batch] of this.current) {
                    this.publisher.to(topic).emit(batch.event, batch.documentId, batch.messages);
                }
            }

            this.messageSendingTimerId = undefined;

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.context.checkpoint(batchOffset!);
            this.current.clear();
            this.sendPending();
        });
    }
}
