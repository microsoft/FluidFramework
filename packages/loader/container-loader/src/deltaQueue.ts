/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDeltaQueue } from "@microsoft/fluid-container-definitions";
import { Deferred } from "@microsoft/fluid-core-utils";
import * as assert from "assert";
import * as Deque from "double-ended-queue";
import { EventEmitter } from "events";

export class DeltaQueue<T> extends EventEmitter implements IDeltaQueue<T> {
    private isDisposed: boolean = false;
    private readonly q = new Deque<T>();

    // We expose access to the DeltaQueue in order to allow users (from the console or code) to be able to pause/resume.
    // But the internal system itself also sometimes needs to override these changes. The system field takes precedence.
    private sysPause = true;
    private userPause = false;

    private error: any | undefined;
    private processingDeferred: Deferred<void> | undefined;

    public get disposed(): boolean {
        return this.isDisposed;
    }

    public get paused(): boolean {
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
        // If called from within the processing loop, we are in the middle of processing an op.  Return a promise
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
        // If called from within the processing loop, we are in the middle of processing an op.  Return a promise
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

    private ensureProcessing() {
        // guard against reentrancy
        if (!this.processingDeferred) {
            this.processingDeferred = new Deferred<void>();
            this.processDeltas();
            this.processingDeferred.resolve();
            this.processingDeferred = undefined;
        }
    }

    private processDeltas() {
        // For grouping to work we must process all local messages immediately and in the single turn.
        // So loop over them until no messages to process, we have become paused, or are already processing a delta.
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
    }
}
