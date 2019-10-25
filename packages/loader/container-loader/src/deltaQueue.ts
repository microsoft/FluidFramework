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

    constructor(private readonly worker: (value: T, callback: (error?) => void) => void) {
        super();
    }

    public dispose() {
        assert.fail("Not implemented.");
        this.isDisposed = true;
    }

    public clear() {
        this.q.clear();
        // tslint:disable-next-line:no-floating-promises
        this.updatePause();
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

    public pause(): Promise<void> {
        this.userPause = true;
        return this.updatePause();
    }

    public resume(): Promise<void> {
        this.userPause = false;
        return this.updatePause();
    }

    public systemPause(): Promise<void> {
        this.sysPause = true;
        return this.updatePause();
    }

    public systemResume(): Promise<void> {
        this.sysPause = false;
        return this.updatePause();
    }

    private updatePause(): Promise<void> {
        const paused = this.sysPause || this.userPause;
        if (paused !== this._paused) {
            if (paused) {
                if (this.processing) {
                    this.pauseDeferred = new Deferred<void>();
                }

                this._paused = true;
                this.emit("pause");
            } else {
                if (this.pauseDeferred) {
                    this.pauseDeferred.reject(new Error("Resumed while waiting to pause"));
                    this.pauseDeferred = undefined;
                }

                this._paused = false;
                this.processDeltas();
                this.emit("resume");
            }
        }

        return this.pauseDeferred ? this.pauseDeferred.promise : Promise.resolve();
    }

    private processDeltas() {
        // For grouping to work we must process all local messages immediately and in the single turn.
        // So loop over them until one of the conditions below is false.
        while (true) {
            // Return early if no messages to process, we have become paused, or are already processing a delta
            if (this.q.length === 0 || this._paused || this.processing || this.error) {
                return;
            }

            // Process the next message in the queue and then call back into processDeltas once complete
            this.processing = true;
            const next = this.q.shift();
            this.emit("pre-op", next);

            // Track when callback is called - whether it is called asynchronously or not.
            let async = false;

            const callback = (error) => {
                this.processing = false;

                // Signal any pending messages
                if (this.pauseDeferred) {
                    if (error) {
                        this.pauseDeferred.reject(error);
                    } else {
                        this.pauseDeferred.resolve();
                    }
                    this.pauseDeferred = undefined;
                }

                if (error) {
                    this.error = error;
                    this.emit("error", error);
                    this.q.clear();
                } else {
                    this.emit("op", next);
                    // If this callback is called asynchronously, then kick processing of new task
                    // Otherwise (when called synchronously) doing so would result in re-entrancy and stack overflow.
                    // So for synchronously called callback we do nothing here and rely on the loop in processDeltas()
                    // itself to process next message.
                    if (async) {
                        this.processDeltas();
                    }
                }
            };

            this.worker(next!, callback);

            // If callback was not called yet, let it know it is called asynchronously.
            // In such case loop will terminate, because this.processing is still true and we will kick next task
            // whenever callback is called.
            // Otherwise looping over will execute next task.
            async = true;
        }
    }
}
