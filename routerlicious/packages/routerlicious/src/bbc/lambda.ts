
import { INack, ISequencedDocumentMessage } from "@prague/runtime-definitions";
import * as _ from "lodash";
import * as winston from "winston";
import * as core from "../core";
import { IContext, IPartitionLambda } from "../kafka-service/lambdas";
import { Batch, BatchManager, extractBoxcar, IMessage, WorkManager } from "../utils";

/**
 * Wrapper interface to define a topic, event, and documentId to send to
 */
interface IoTarget {
    documentId: string;
    tenantId: string;
    event: string;
    topic: string;
}

export class BBCLambda implements IPartitionLambda {
    // We maintain three batches of work - one for MongoDB and the other two for Socket.IO.
    // One socket.IO group is for sequenced ops and the other for nack'ed messages.
    // By splitting the two we can update each independently and on their own cadence
    private ioManager: BatchManager<IoTarget, ISequencedDocumentMessage | INack>;

    constructor(private io: core.IPublisher, protected context: IContext) {
        // Listen for work errors
        this.workManager.on("error", (error) => {
            this.batchError(error);
        });

        // Listen for offset changes and checkpoint accordingly
        this.workManager.on("offsetChanged", (offset: number) => {
            winston.verbose(`Checkpointing at ${offset}`);
            context.checkpoint(offset);
        });

        this.ioManager = new BatchManager<IoTarget, ISequencedDocumentMessage | INack>(
            (batch) => this.processIoBatch(batch),
            // commit function
            );
    }

    public handler(message: IMessage): void {
        const boxcar = extractBoxcar(message);

        for (const baseMessage of boxcar.contents) {
            if (baseMessage.type === core.SequencedOperationType) {
                const value = baseMessage as core.ISequencedOperationMessage;

                // Send to Socket.IO
                const target: IoTarget = {
                    documentId: value.documentId,
                    event: "op",
                    tenantId: value.tenantId,
                    topic: `${value.tenantId}/${value.documentId}`,
                };
                this.ioManager.add(target, value.operation, message.offset);
            } else if (baseMessage.type === core.NackOperationType) {
                const value = baseMessage as core.INackMessage;

                const target: IoTarget = {
                    documentId: value.documentId,
                    event: "nack",
                    tenantId: value.tenantId,
                    topic: `client#${value.clientId}`,
                };
                this.ioManager.add(target, value.operation, message.offset);
            } else {
                // Treat all other messages as an idle batch of work for simplicity
                this.idleManager.add(null, null, message.offset);
            }
        }
    }

    public close() {
        this.workManager.close();
    }

    /**
     * BatchManager callback invoked once a new batch is ready to be processed
     */
    private async processIoBatch(batch: Batch<IoTarget, INack | ISequencedDocumentMessage>): Promise<void> {
        // Serialize the current batch to Mongo
        await batch.map(async (id, work) => {
            this.io.to(id.topic).emit(id.event, id.documentId, work);
            await new Promise<void>((resolve) => setImmediate(() => resolve()));
        });
    }

    /**
     * BatchManager callback invoked after an error
     */
    private batchError(error: string) {
        winston.error(error);
        this.context.error(error, true);
    }
}
