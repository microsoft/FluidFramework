/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDeltaQueue, IDeltaQueueEvents } from "@fluidframework/container-definitions";
import { assert, performance, TypedEventEmitter } from "@fluidframework/common-utils";
import Deque from "double-ended-queue";

export interface IDeltaQueueWriter<T> {
    push(task: T): void;
    clear(): void;
}

export class DeltaQueue<T>
    extends TypedEventEmitter<IDeltaQueueEvents<T>>
    implements IDeltaQueue<T>, IDeltaQueueWriter<T> {
    private isDisposed: boolean = false;
    private readonly q = new Deque<T>();

    /**
     * Tracks the number of pause requests for the queue
     * The DeltaQueue is create initially paused.
     */
    private pauseCount = 1;

    private error: any | undefined;

    /**
     * When processing is ongoing, holds a deferred that will resolve once processing stops.
     * Undefined when not processing.
     */
    private processingPromise: Promise<{ count: number; duration: number; }> | undefined;

    public get disposed(): boolean {
        return this.isDisposed;
    }

    /**
     * @returns True if the queue is paused, false if not.
     */
    public get paused(): boolean {
        return this.pauseCount !== 0;
    }

    public get length(): number {
        return this.q.length;
    }

    public get idle(): boolean {
        return this.processingPromise === undefined && this.q.length === 0;
    }

    public async waitTillProcessingDone() {
        return this.processingPromise ?? { count: 0, duration: 0 };
    }

    /**
     * @param worker - A callback to process a delta.
     * @param logger - For logging telemetry.
     */
    constructor(
        private readonly worker: (delta: T) => void,
    ) {
        super();
    }

    public dispose() {
        throw new Error("Not implemented.");
        this.isDisposed = true;
    }

    public clear(): void {
        this.q.clear();
    }

    public peek(): T | undefined {
        return this.q.peekFront();
    }

    public toArray(): T[] {
        return this.q.toArray();
    }

    public push(task: T) {
        try {
            this.q.push(task);
            this.emit("push", task);
            this.ensureProcessing();
        } catch (error) {
            this.emit("error", error);
        }
    }

    public async pause(): Promise<void> {
        this.pauseCount++;
        // If called from within the processing loop, we are in the middle of processing an op. Return a promise
        // that will resolve when processing has actually stopped.
        await this.waitTillProcessingDone();
    }

    public resume(): void {
        assert(this.pauseCount > 0, 0x0f4 /* "Nonzero pause-count on resume()" */);
        this.pauseCount--;
        this.ensureProcessing();
    }

    /**
     * There are several actions that may need to kick off delta processing, so we want to guard against
     * accidental reentrancy. ensureProcessing can be called safely to start the processing loop if it is
     * not already started.
     */
    private ensureProcessing() {
        if (this.anythingToProcess() && this.processingPromise === undefined) {
            // Use a resolved promise to start the processing on a separate stack.
            this.processingPromise = Promise.resolve().then(() => {
                assert(this.processingPromise !== undefined, "reentrancy?");
                const result = this.processDeltas();
                assert(this.processingPromise !== undefined, "reentrancy?");
                // WARNING: Do not move next line to .finally() clause!
                // It runs async and creates a race condition where incoming ensureProcessing() call observes
                // from previous run while previous run is over (but finally clause was not scheduled yet)
                this.processingPromise = undefined;
                return result;
            }).catch((error) => {
                this.error = error;
                this.processingPromise = undefined;
                this.emit("error", error);
                return { count: 0, duration: 0 };
            });
            assert(this.processingPromise !== undefined, "processDeltas() should run async");
        }
    }

    private anythingToProcess() {
        return this.q.length !== 0 && !this.paused && this.error === undefined;
    }

    /**
     * Executes the delta processing loop until a stop condition is reached.
     */
    private processDeltas() {
        const start = performance.now();
        let count = 0;

        // For grouping to work we must process all local messages immediately and in the single turn.
        // So loop over them until no messages to process, we have become paused, or hit an error.
        while (this.anythingToProcess()) {
            // Get the next message in the queue
            const next = this.q.shift();
            count++;
            // Process the message.
            // We know next is defined since we did a length check just prior to shifting.
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.worker(next!);
            this.emit("op", next);
        }

        const duration = performance.now() - start;
        if (this.q.length === 0) {
            this.emit("idle", count, duration);
        }
        return { count, duration };
    }
}
