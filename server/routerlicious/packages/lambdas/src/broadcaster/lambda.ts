/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { INack, ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import {
    extractBoxcar,
    IContext,
    INackMessage,
    IPartitionLambda,
    IPublisher,
    ISequencedOperationMessage,
    NackOperationType,
    SequencedOperationType,
    IQueuedMessage,
} from "@fluidframework/server-services-core";

class BroadcasterBatch {
    public messages: (ISequencedDocumentMessage | INack)[] = [];

    constructor(
        public documentId: string,
        public tenantId: string,
        public event: string) {
    }
}

export class BroadcasterLambda implements IPartitionLambda {
    private pending = new Map<string, BroadcasterBatch>();
    private pendingOffset: IQueuedMessage;
    private current = new Map<string, BroadcasterBatch>();

    constructor(private readonly publisher: IPublisher, protected context: IContext) {
    }

    public handler(message: IQueuedMessage): void {
        const boxcar = extractBoxcar(message);

        for (const baseMessage of boxcar.contents) {
            let topic: string;
            let event: string;

            if (baseMessage.type === SequencedOperationType) {
                const value = baseMessage as ISequencedOperationMessage;
                topic = `${value.tenantId}/${value.documentId}`;
                event = "op";
            } else if (baseMessage.type === NackOperationType) {
                const value = baseMessage as INackMessage;
                topic = `client#${value.clientId}`;
                event = "nack";
            }

            if (topic) {
                const value = baseMessage as INackMessage | ISequencedOperationMessage;

                if (!this.pending.has(topic)) {
                    this.pending.set(topic, new BroadcasterBatch(value.documentId, value.tenantId, event));
                }

                this.pending.get(topic).messages.push(value.operation);
            }
        }

        this.pendingOffset = message;
        this.sendPending();
    }

    public close() {
        this.pending.clear();
        this.current.clear();

        return;
    }

    public hasPendingWork() {
        return this.pending.size !== 0 || this.current.size !== 0;
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

        // Process all the batches + checkpoint
        this.current.forEach((batch, topic) => {
            this.publisher.to(topic).emit(batch.event, batch.documentId, batch.messages);
        });

        this.context.checkpoint(batchOffset);

        // Invoke the next send after a setImmediate to give IO time to create more batches
        setImmediate(() => {
            this.current.clear();
            this.sendPending();
        });
    }
}
