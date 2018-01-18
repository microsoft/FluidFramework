import * as winston from "winston";
import * as core from "../core";
import { IContext, IPartitionLambda } from "../kafka-service/lambdas";
import * as utils from "../utils";

export class Batch<T> {
    private pendingWork = new Map<string, T[]>();

    public add(id: string, work: T) {
        if (!this.pendingWork.has(id)) {
            this.pendingWork.set(id, []);
        }

        this.pendingWork.get(id).push(work);
    }

    /**
     * Clears all the pending work
     */
    public clear() {
        this.pendingWork.clear();
    }

    /**
     * Runs the given async mapping function on the batch
     */
    public async map(fn: (id: string, work: T[]) => Promise<void>): Promise<void> {
        const processedP = new Array<Promise<void>>();
        for (const [key, value] of this.pendingWork) {
            const mapP = fn(key, value);
            processedP.push(mapP);
        }

        await Promise.all(processedP);
    }
}

/**
 * Wrapper class to combine a batch with the log offset that maps to it
 */
class OffsetBatch<T> {
    public offset: number;
    public batch = new Batch<T>();

    public clear() {
        this.offset = undefined;
        this.batch.clear();
    }

    /**
     * Returns whether or not this batch is empty
     */
    public isEmpty() {
        return this.offset === undefined;
    }
}

/**
 * The BatchManager is used to manage async work triggered by messages to a pub/sub log
 */
class BatchManager<T> {
    // The manager maintains a pending batch of operations as well as a current batch. The current batch is the
    // one that is in the process of being sent. The pending batch is the next batch that will be sent.
    private pending = new OffsetBatch<T>();
    private current = new OffsetBatch<T>();

    constructor(private sendFn: (batch: Batch<T>, offset: number) => Promise<void>, private errorFn: (error) => void) {
    }

    /**
     * Adds a new value to the batch and updates the log offset
     */
    public add(id: string, value: T, offset: number) {
        this.pending.batch.add(id, value);
        this.pending.offset = offset;
        this.requestSend();
    }

    /**
     * Updates the offset parameter but without adding a new value to the batch
     */
    public updateOffset(offset: number) {
        this.pending.offset = offset;
        this.requestSend();
    }

    /**
     * Requests a send of the current batch
     */
    private requestSend() {
        // If the current batch is not empty then there is a send in flight. Otherwise begin a new send.
        if (!this.current.isEmpty()) {
            return;
        } else {
            this.sendPending();
        }
    }

    private sendPending() {
        // If pending is empty return early - there is no work to do
        if (this.pending.isEmpty()) {
            return;
        }

        // Swap current and pending
        const temp = this.current;
        this.current = this.pending;
        this.pending = temp;

        // Serialize the current batch to Mongo
        const processedP = this.sendFn(this.current.batch, this.current.offset);

        // Once processed update the log offset and then begin the next batch
        processedP.then(
            () => {
                // Processing was successful. We can clear the processed batch and start on pending.
                this.current.clear();
                this.sendPending();
            },
            (error) => {
                // After an error we will stop all processing
                this.errorFn(error);
            });
    }
}

export class ScriptoriumLambda implements IPartitionLambda {
    private batchManager = new BatchManager<core.ISequencedOperationMessage>(
        (batch, offset) => this.processBatch(batch, offset),
        (error) => this.batchError(error));

    constructor(private io: core.IPublisher, private collection: core.ICollection<any>, protected context: IContext) {
        this.io.on("error", (error) => {
            // After an IO error we need to recreate the lambda
            this.context.close(error, true);
        });
    }

    public handler(message: utils.kafkaConsumer.IMessage): void {
        const baseMessage = JSON.parse(message.value.toString()) as core.IMessage;
        if (baseMessage.type === core.SequencedOperationType) {
            const value = baseMessage as core.ISequencedOperationMessage;

            // Add trace.
            if (value.operation.traces !== undefined) {
                value.operation.traces.push( {service: "scriptorium", action: "start", timestamp: Date.now()});
            }

            // Batch up work to more efficiently send to socket.io and mongodb
            this.batchManager.add(value.documentId, value, message.offset);
        } else {
            this.batchManager.updateOffset(message.offset);
        }
    }

    /**
     * BatchManager callback invoked once a new batch is ready to be processed
     */
    private async processBatch(batch, offset): Promise<void> {
        // Serialize the current batch to Mongo
        await batch.map(async (id, work) => {
            // Add trace to each message before routing.
            work.map((value) => {
                if (value.operation.traces !== undefined) {
                    value.operation.traces.push( {service: "scriptorium", action: "end", timestamp: Date.now()});
                }
            });

            // Route the message to clients
            winston.verbose(`Routing to clients ${id}@${work[0].operation.sequenceNumber}:${work.length}`);
            this.io.to(id).emit("op", id, work.map((value) => value.operation));

            winston.verbose(`Inserting to mongodb ${id}@${work[0].operation.sequenceNumber}:${work.length}`);
            return this.collection.insertMany(work, false)
                .catch((error) => {
                    // Duplicate key errors are ignored since a replay may cause us to insert twice into Mongo.
                    // All other errors result in a rejected promise.
                    if (error.name !== "MongoError" || error.code !== 11000) {
                        // Needs to be a full rejection here
                        return Promise.reject(error);
                    }
                });
        });

        // Update the current log offset
        this.context.checkpoint(offset);
    }

    /**
     * BatchManager callback invoked after an error
     */
    private batchError(error: string) {
        winston.error(error);
        this.context.close(error, true);
    }
}
