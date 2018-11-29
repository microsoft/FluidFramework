
import { INack, ISequencedDocumentMessage } from "@prague/runtime-definitions";
import * as _ from "lodash";
import * as core from "../core";
import { IContext, IPartitionLambda } from "../kafka-service/lambdas";
import { extractBoxcar, IMessage } from "../utils";

class BBCBatch {
    public messages: Array<ISequencedDocumentMessage | INack> = [];

    constructor(
        public documentId: string,
        public tenantId: string,
        public event: string) {
    }
}

export class BBCLambda implements IPartitionLambda {
    // We maintain three batches of work - one for MongoDB and the other two for Socket.IO.
    // One socket.IO group is for sequenced ops and the other for nack'ed messages.
    // By splitting the two we can update each independently and on their own cadence
    private pending = new Map<string, BBCBatch>();
    private pendingOffset: number;
    private current = new Map<string, BBCBatch>();

    constructor(private io: core.IPublisher, protected context: IContext) {
    }

    public handler(message: IMessage): void {
        const boxcar = extractBoxcar(message);

        for (const baseMessage of boxcar.contents) {
            let topic: string;
            let event: string;

            if (baseMessage.type === core.SequencedOperationType) {
                const value = baseMessage as core.ISequencedOperationMessage;
                topic = `${value.tenantId}/${value.documentId}`;
                event = "op";
            } else if (baseMessage.type === core.NackOperationType) {
                const value = baseMessage as core.INackMessage;
                topic = `client#${value.clientId}`;
                event = "nack";
            }

            if (topic) {
                const value = baseMessage as core.INackMessage | core.ISequencedOperationMessage;

                if (!this.pending.has(topic)) {
                    this.pending.set(topic, new BBCBatch(value.documentId, value.tenantId, event));
                }

                this.pending.get(topic).messages.push(value.operation);
            }
        }

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

        // Process all the batches + checkpoint
        this.current.forEach((batch, topic) => {
            this.io.to(topic).emit(batch.event, batch.documentId, batch.messages);
        });
        this.context.checkpoint(batchOffset);

        // Invoke the next send after a setImmediate to give IO time to create more batches
        setImmediate(() => {
            this.current.clear();
            this.sendPending();
        });
    }
}
