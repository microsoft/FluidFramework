import * as assert from "assert";
import { EventEmitter } from "events";
import * as winston from "winston";
import * as api from "../api-core";
import * as core from "../core";
import { Range } from "../core-utils";
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
export class BatchManager<T> extends EventEmitter {
    public static MinRangeValue = Number.NEGATIVE_INFINITY;

    public range = new Range(BatchManager.MinRangeValue, BatchManager.MinRangeValue);

    // The manager maintains a pending batch of operations as well as a current batch. The current batch is the
    // one that is in the process of being sent. The pending batch is the next batch that will be sent.
    private pending = new OffsetBatch<T>();
    private current = new OffsetBatch<T>();

    constructor(private sendFn: (batch: Batch<T>) => Promise<void>) {
        super();
    }

    /**
     * Adds a new value to the batch and updates the log offset
     */
    public add(id: string, value: T, offset: number) {
        this.range.head = offset;
        this.pending.batch.add(id, value);
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
        const processedP = this.sendFn(this.current.batch);

        // Once processed update the log offset and then begin the next batch
        processedP.then(
            () => {
                // Processing was successful. Update the tail of the offset...
                this.range.tail = this.current.offset;
                this.emit("workComplete", this.current.offset);

                // And then clear the processed batch and start on pending.
                this.current.clear();
                this.sendPending();
            },
            (error) => {
                // Notify of the error
                this.emit("error", error);
            });
    }
}

export class WorkManager extends EventEmitter {
    private work = new Array<BatchManager<any>>();

    // Start out at negative infinity. This represents an unknown offset and matches how the range is stored. We
    // won't fire an offset event until this changes
    private lastOffset = BatchManager.MinRangeValue;

    constructor() {
        super();
    }

    public createBatchedWork<T>(processFn: (batch: Batch<T>) => Promise<void>): BatchManager<T> {
        const batchedWork = new BatchManager<T>(processFn);

        // Listen for error events as well as when a batch is complete - and the offset may have changed
        batchedWork.on("error", (error) => {
            this.emit("error", error);
        });

        batchedWork.on("workComplete", () => {
            this.updateOffset();
        });

        this.work.push(batchedWork);
        return batchedWork;
    }

    private updateOffset() {
        let maxHead = this.lastOffset;
        let range = new Range();

        winston.info(`Start offset compute ${this.lastOffset}`);
        for (const work of this.work) {
            winston.info(`${range.tail} => ${range.head}`);
            maxHead = Math.max(maxHead, work.range.head);
            range = Range.union(range, work.range);
        }

        // If all the offsets are empty we take the max of the heads (which will be the largest offset seen). Otherwise
        // it is the smallest tail
        const offset = range.empty ? maxHead : range.tail;
        winston.info(`Offset is ${offset}`);
        assert.ok(offset >= this.lastOffset);
        if (offset !== this.lastOffset) {
            this.lastOffset = offset;
            this.emit("offsetChanged", offset);
        }
    }
}

export class ScriptoriumLambda implements IPartitionLambda {
    // We maintain two batches of work - one for MongoDB and the other for Socket.IO
    // By splitting the two we can update each independently and on their own cadence
    private mongoManager: BatchManager<core.ISequencedOperationMessage>;
    private ioManager: BatchManager<core.INack | api.ISequencedDocumentMessage>;
    private idleManager: BatchManager<void>;

    private workManager = new WorkManager();

    constructor(private io: core.IPublisher, private collection: core.ICollection<any>, protected context: IContext) {
        // Listen for work errors
        this.workManager.on("error", (error) => {
            this.batchError(error);
        });

        // Listen for offset changes and checkpoint accordingly
        this.workManager.on("offsetChanged", (offset: number) => {
            context.checkpoint(offset);
        });

        // Create all the batched workers
        this.mongoManager = this.workManager.createBatchedWork((batch) => this.processMongoBatch(batch));
        this.ioManager = this.workManager.createBatchedWork((batch) => this.processIoBatch(batch));
        this.idleManager = this.workManager.createBatchedWork<void>(async (batch) => { return; });

        this.io.on("error", (error) => {
            // After an IO error we need to recreate the lambda
            this.context.error(error, true);
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
            this.mongoManager.add(value.documentId, value, message.offset);
            this.ioManager.add(value.documentId, value.operation, message.offset);
        } else if (baseMessage.type === core.NackOperationType) {
            const value = baseMessage as core.INackMessage;
            this.ioManager.add(`client#${value.clientId}`, value.operation, message.offset);
        } else {
            // Treat all other messages as an idle batch of work for simplicity
            this.idleManager.add(null, null, message.offset);
        }
    }

    /**
     * BatchManager callback invoked once a new batch is ready to be processed
     */
    private async processMongoBatch(batch: Batch<core.ISequencedOperationMessage>): Promise<void> {
        // Serialize the current batch to Mongo
        await batch.map(async (id, work) => {
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
    }

    /**
     * BatchManager callback invoked once a new batch is ready to be processed
     */
    private async processIoBatch(batch: Batch<core.INack | api.ISequencedDocumentMessage>): Promise<void> {
        // Serialize the current batch to Mongo
        await batch.map(async (id, work) => {
            // Add trace to each message before routing.
            work.map((value) => {
                const valueAsSequenced = value as api.ISequencedDocumentMessage;
                if (valueAsSequenced && valueAsSequenced.traces !== undefined) {
                    valueAsSequenced.traces.push( {service: "scriptorium", action: "end", timestamp: Date.now()});
                }
            });

            this.io.to(id).emit("op", id, work);
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
