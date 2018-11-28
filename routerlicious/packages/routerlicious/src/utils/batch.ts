import * as coreUtils from "@prague/client-api";
import * as assert from "assert";
import { EventEmitter } from "events";

/**
 * A batch takes in a key type and then a value type that is accumulated against the key. The key type must be
 * able to be stringified so that we can properly batch work.
 */
export class Batch<K, T> {
    private pendingWork = new Map<string, T[]>();

    public add(id: K, work: T) {
        const encoded = JSON.stringify(id);

        if (!this.pendingWork.has(encoded)) {
            this.pendingWork.set(encoded, []);
        }

        this.pendingWork.get(encoded).push(work);
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
    public async map(fn: (id: K, work: T[]) => Promise<void>): Promise<void> {
        const processedP = new Array<Promise<void>>();
        for (const [key, value] of this.pendingWork) {
            const mapP = fn(JSON.parse(key) as K, value);
            processedP.push(mapP);
        }

        await Promise.all(processedP);
    }
}

/**
 * Wrapper class to combine a batch with the log offset that maps to it
 */
class OffsetBatch<K, T> {
    public offset: number;
    public batch = new Batch<K, T>();

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
export class BatchManager<K, T> extends EventEmitter {
    public static MinRangeValue = Number.NEGATIVE_INFINITY;

    public range = new coreUtils.Range(BatchManager.MinRangeValue, BatchManager.MinRangeValue);

    // The manager maintains a pending batch of operations as well as a current batch. The current batch is the
    // one that is in the process of being sent. The pending batch is the next batch that will be sent.
    private pending = new OffsetBatch<K, T>();
    private current = new OffsetBatch<K, T>();

    private closed = false;

    constructor(private sendFn: (batch: Batch<K, T>) => Promise<void>) {
        super();
    }

    /**
     * Adds a new value to the batch and updates the log offset
     */
    public add(id: K, value: T, offset: number) {
        // Track whether we are transitioning from empty to not-empty. In that case we adjust
        // the tail of the range to be one less than the offset. This is the lowest offset we could
        // checkpoint at since it does not include the new batch of work.
        const wasEmpty = this.range.empty;
        this.range.head = offset;
        if (wasEmpty) {
            this.range.tail = offset - 1;
        }

        this.pending.batch.add(id, value);
        this.pending.offset = offset;
        this.requestSend();
    }

    public close() {
        this.closed = true;
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
        // Exit early if closed
        if (this.closed) {
            return;
        }

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
        const doneP = processedP.then(
            () => {
                // Processing was successful. Update the tail of the offset...
                this.range.tail = this.current.offset;
                this.emit("workComplete", this.current.offset);

                // And then clear the processed batch and start on pending.
                this.current.clear();
                this.sendPending();
            });

        doneP.catch((error) => {
            // Notify of the error
            this.emit("error", error);
        });
    }
}

export class WorkManager extends EventEmitter {
    private work = new Array<BatchManager<any, any>>();

    // Start out at negative infinity. This represents an unknown offset and matches how the range is stored. We
    // won't fire an offset event until this changes
    private lastOffset = BatchManager.MinRangeValue;

    constructor() {
        super();
    }

    public createBatchedWork<K, T>(processFn: (batch: Batch<K, T>) => Promise<void>): BatchManager<K, T> {
        const batchedWork = new BatchManager<K, T>(processFn);

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

    public close() {
        for (const work of this.work) {
            work.close();
        }
    }

    private updateOffset() {
        let maxHead = this.lastOffset;
        let range = new coreUtils.Range();

        for (const work of this.work) {
            maxHead = Math.max(maxHead, work.range.head);
            range = coreUtils.Range.union(range, work.range);
        }

        // If all the offsets are empty we take the max of the heads (which will be the largest offset seen). Otherwise
        // it is the smallest tail
        const offset = range.empty ? maxHead : range.tail;
        assert.ok(offset >= this.lastOffset);
        if (offset !== this.lastOffset) {
            this.lastOffset = offset;
            this.emit("offsetChanged", offset);
        }
    }
}
