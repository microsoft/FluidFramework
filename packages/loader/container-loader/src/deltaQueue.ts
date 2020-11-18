/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDeltaQueue, IDeltaQueueEvents } from "@fluidframework/container-definitions";
import { assert, Deferred, TypedEventEmitter } from "@fluidframework/common-utils";
import Deque from "double-ended-queue";
import { ITelemetryLogger } from "@fluidframework/common-definitions";

export class DeltaQueue<T> extends TypedEventEmitter<IDeltaQueueEvents<T>> implements IDeltaQueue<T> {
    private isDisposed: boolean = false;
    private readonly q = new Deque<T>();

    /**
     * Tracks whether the system has requested the queue be paused.
     */
    private sysPause = 1;

    /**
     * Tracks whether the user of the container has requested the queue be paused.
     */
    private userPause = 0;

    private error: any | undefined;

    /**
     * When processing is ongoing, holds a deferred that will resolve once processing stops.
     * Undefined when not processing.
     */
    private processingDeferred: Deferred<void> | undefined;

    public get disposed(): boolean {
        return this.isDisposed;
    }

    /**
     * @returns True if the queue is paused, false if not.
     */
    public get paused(): boolean {
        // The queue can be paused by either the user or by the system (e.g. during snapshotting).  If either requests
        // a pause, then the queue will pause.
        return this.sysPause !== 0 || this.userPause !== 0;
    }

    public get length(): number {
        return this.q.length;
    }

    public get idle(): boolean {
        return this.processingDeferred === undefined && this.q.length === 0;
    }

    /**
     * @param worker - A callback to process a delta.
     * @param logger - For logging telemetry.
     */
    constructor(
        private readonly worker: (delta: T) => void,
        private readonly logger?: ITelemetryLogger,
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
        this.q.push(task);
        this.emit("push", task);
        this.ensureProcessing();
    }

    public async pause(): Promise<void> {
        this.userPause++;
        // If called from within the processing loop, we are in the middle of processing an op. Return a promise
        // that will resolve when processing has actually stopped.
        if (this.processingDeferred !== undefined) {
            return this.processingDeferred.promise;
        }
        if (this.logger) {
            this.logger.sendTelemetryEvent({
                eventName: "DeltaQueuePause",
            },  this.userPause);
        }
    }

    public resume(): void {
        assert(this.userPause > 0);
        this.userPause--;
        if (!this.paused) {
            this.ensureProcessing();
        }
        if (this.logger) {
            this.logger.sendTelemetryEvent({
                eventName: "DeltaQueueResume",
            },  this.userPause);
        }
    }

    public async systemPause(): Promise<void> {
        this.sysPause++;
        // If called from within the processing loop, we are in the middle of processing an op. Return a promise
        // that will resolve when processing has actually stopped.
        if (this.processingDeferred !== undefined) {
            return this.processingDeferred.promise;
        }
        if (this.logger) {
            this.logger.sendTelemetryEvent({
                eventName: "DeltaQueueSystemPause",
            },  this.sysPause);
        }
    }

    public systemResume(): void {
        assert(this.sysPause > 0);
        this.sysPause--;
        if (!this.paused) {
            this.ensureProcessing();
        }
        if (this.logger) {
            this.logger.sendTelemetryEvent({
                eventName: "DeltaQueueSystemResume",
            },  this.sysPause);
        }
    }

    /**
     * There are several actions that may need to kick off delta processing, so we want to guard against
     * accidental reentrancy. ensureProcessing can be called safely to start the processing loop if it is
     * not already started.
     */
    private ensureProcessing() {
        if (this.processingDeferred === undefined) {
            this.processingDeferred = new Deferred<void>();
            // Use a resolved promise to start the processing on a separate stack.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            Promise.resolve().then(() => {
                this.processDeltas();
                if (this.processingDeferred !== undefined) {
                    this.processingDeferred.resolve();
                    this.processingDeferred = undefined;
                }
            });
        }
    }

    /**
     * Executes the delta processing loop until a stop condition is reached.
     */
    private processDeltas() {
        // For grouping to work we must process all local messages immediately and in the single turn.
        // So loop over them until no messages to process, we have become paused, or hit an error.
        while (!(this.q.length === 0 || this.paused || this.error !== undefined)) {
            // Get the next message in the queue
            const next = this.q.shift();
            // Process the message.
            try {
                // We know next is defined since we did a length check just prior to shifting.
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                this.worker(next!);
                this.emit("op", next);
            } catch (error) {
                this.error = error;
                this.emit("error", error);
            }
        }

        if (this.q.length === 0) {
            this.emit("idle");
        }
    }
}
