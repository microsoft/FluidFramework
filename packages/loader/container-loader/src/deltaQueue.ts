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

    private _paused = true;

    private error: any | undefined;
    private processing = false;
    private pauseDeferred: Deferred<void> | undefined;

    public get disposed(): boolean {
        return this.isDisposed;
    }

    public get paused(): boolean {
        return this._paused;
    }

    public get length(): number {
        return this.q.length;
    }

    public get idle(): boolean {
        return !this.processing && this.q.length === 0;
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
        this.processDeltas();
    }

    public async pause(): Promise<void> {
        this.userPause = true;
        return this.updatePause();
    }

    public async resume(): Promise<void> {
        this.userPause = false;
        return this.updatePause();
    }

    public async systemPause(): Promise<void> {
        this.sysPause = true;
        return this.updatePause();
    }

    public async systemResume(): Promise<void> {
        this.sysPause = false;
        return this.updatePause();
    }

    private async updatePause(): Promise<void> {
        const paused = this.sysPause || this.userPause;
        if (paused !== this._paused) {
            if (paused) {
                if (this.processing) {
                    this.pauseDeferred = new Deferred<void>();
                }

                this._paused = true;
            } else {
                if (this.pauseDeferred) {
                    this.pauseDeferred.reject(new Error("Resumed while waiting to pause"));
                    this.pauseDeferred = undefined;
                }

                this._paused = false;
                this.processDeltas();
            }
        }

        return this.pauseDeferred ? this.pauseDeferred.promise : Promise.resolve();
    }

    private processDeltas() {
        // For grouping to work we must process all local messages immediately and in the single turn.
        // So loop over them until no messages to process, we have become paused, or are already processing a delta.
        while (!(this.q.length === 0 || this._paused || this.processing || this.error)) {
            // Get the next message in the queue, set processing flag in case we are reentrant.
            this.processing = true;
            const next = this.q.shift();

            // Process the message.
            try {
                this.worker(next!);

                this.processing = false;

                // Signal any pending messages
                if (this.pauseDeferred) {
                    this.pauseDeferred.resolve();
                    this.pauseDeferred = undefined;
                }

                this.emit("op", next);
            } catch (error) {
                this.processing = false;

                // Signal any pending messages
                if (this.pauseDeferred) {
                    this.pauseDeferred.reject(error);
                    this.pauseDeferred = undefined;
                }

                this.error = error;
                this.emit("error", error);
                this.q.clear();
            }
        }
    }
}
