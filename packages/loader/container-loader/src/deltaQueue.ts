import { IDeltaQueue } from "@prague/container-definitions";
import { Deferred } from "@prague/utils";
import * as Deque from "double-ended-queue";
import { EventEmitter } from "events";

export class DeltaQueue<T> extends EventEmitter implements IDeltaQueue<T> {
    private q = new Deque<T>();

    // We expose access to the DeltaQueue in order to allow users (from the console or code) to be able to pause/resume.
    // But the internal system itself also sometimes needs to override these changes. The system field takes precedence.
    private sysPause = true;
    private userPause = false;

    // tslint:disable:variable-name
    private _paused = true;
    // tslint:enable:variable-name

    private processing = false;
    private pauseDeferred: Deferred<void> | undefined;

    public get paused(): boolean {
        return this._paused;
    }

    public get length(): number {
        return this.q.length;
    }

    public get idle(): boolean {
        return !this.processing && this.q.length === 0;
    }

    constructor(private worker: (value: T | undefined, callback: (error) => void) => void) {
        super();
    }

    public clear() {
        this.q.clear();
        this.updatePause();
    }

    public peek(): T | undefined {
        return this.q.peekFront();
    }

    public push(task: T) {
        this.q.push(task);
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
                    this.pauseDeferred.reject("Resumed while waiting to pause");
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
        // Return early if no messages to process, we have become paused, or are already processing a delta
        if (this.q.length === 0 || this._paused || this.processing) {
            return;
        }

        // Process the next message in the queue and then call back into processDeltas once complete
        this.processing = true;
        const next = this.q.shift();
        this.emit("pre-op", next);
        this.worker(next, (error) => {
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
                this.emit("error", error);
                this.q.clear();
            } else {
                this.emit("op", next);
                this.processDeltas();
            }
        });
    }
}
