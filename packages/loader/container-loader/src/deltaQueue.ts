/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { EventEmitter } from "events";
import { IDeltaQueue } from "@microsoft/fluid-container-definitions";
import { Deferred } from "@microsoft/fluid-common-utils";
import * as Deque from "double-ended-queue";

export class DeltaQueue<T> extends EventEmitter implements IDeltaQueue<T> {
    private isDisposed: boolean = false;
    private readonly q = new Deque<T>();

    /**
     * Tracks whether the system has requested the queue be paused.
     */
    private sysPause = true;

    /**
     * Tracks whether the user of the container has requested the queue be paused.
     */
    private userPause = false;

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
        return this.sysPause || this.userPause;
    }

    public get length(): number {
        return this.q.length;
    }

    public get idle(): boolean {
        return !this.processingDeferred && this.q.length === 0;
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
        assert.fail("Not implemented.");
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
        this.userPause = true;
        // If called from within the processing loop, we are in the middle of processing an op. Return a promise
        // that will resolve when processing has actually stopped.
        if (this.processingDeferred) {
            return this.processingDeferred.promise;
        }
    }

    public resume(): void {
        this.userPause = false;
        if (!this.paused) {
            this.ensureProcessing();
        }
    }

    public async systemPause(): Promise<void> {
        this.sysPause = true;
        // If called from within the processing loop, we are in the middle of processing an op. Return a promise
        // that will resolve when processing has actually stopped.
        if (this.processingDeferred) {
            return this.processingDeferred.promise;
        }
    }

    public systemResume(): void {
        this.sysPause = false;
        if (!this.paused) {
            this.ensureProcessing();
        }
    }

    /**
     * There are several actions that may need to kick off delta processing, so we want to guard against
     * accidental reentrancy. ensureProcessing can be called safely to start the processing loop if it is
     * not already started.
     */
    private ensureProcessing() {
        if (!this.processingDeferred) {
            this.processingDeferred = new Deferred<void>();
            // Use a resolved promise to start the processing on a separate stack.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            Promise.resolve().then(() => {
                this.processDeltas();
                if (this.processingDeferred) {
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
        while (!(this.q.length === 0 || this.paused || this.error)) {
            // Get the next message in the queue
            const next = this.q.shift();

            // Process the message.
            try {
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
