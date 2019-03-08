import { IDeltaQueue } from "@prague/container-definitions";
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

    public get paused(): boolean {
        return this._paused;
    }

    public get length(): number {
        return this.q.length;
    }

    public get idle(): boolean {
        return this.processing || this.q.length > 0;
    }

    constructor(private worker: (value: T, callback: (error) => void) => void) {
        super();
    }

    public clear() {
        this.q.clear();
        this.updatePause();
    }

    public peek(): T {
        return this.q.peekFront();
    }

    public push(task: T) {
        this.q.push(task);
        this.processDeltas();
    }

    public pause() {
        this.userPause = true;
        this.updatePause();
    }

    public resume() {
        this.userPause = false;
        this.updatePause();
    }

    public systemPause() {
        this.sysPause = true;
        this.updatePause();
    }

    public systemResume() {
        this.sysPause = false;
        this.updatePause();
    }

    private updatePause() {
        const paused = this.sysPause || this.userPause;
        if (paused === this._paused) {
            return;
        }

        if (paused) {
            this._paused = true;
            this.emit("pause");
        } else {
            this._paused = false;
            this.processDeltas();
            this.emit("resume");
        }
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
