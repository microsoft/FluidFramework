import * as queue from "async/queue";
import { EventEmitter } from "events";
import { IDeltaQueue } from "./document";

export class DeltaQueue<T> extends EventEmitter implements IDeltaQueue {
    private q: async.AsyncQueue<T>;

    // We expose access to the DeltaQueue in order to allow users (from the console or code) to be able to pause/resume.
    // But the internal system itself also sometimes needs to override these changes. The system field takes precedence.
    private sysPause = true;
    private userPause = false;

    public get paused(): boolean {
        return this.q.paused;
    }

    public get length(): number {
        return this.q.length();
    }

    public get empty(): boolean {
        return this.length === 0;
    }

    constructor(private worker: async.AsyncWorker<T, void>) {
        super();

        // Clear creates a new queue
        this.clear();
    }

    public clear() {
        // Remove any tasks and stop the old queue
        if (this.q) {
            this.q.kill();
        }

        // Then create a new one
        this.q = queue<T, void>((task, callback) => {
            this.emit("pre-op", task);
            this.worker(task, (error) => {
                this.emit("op", task);
                callback(error);
            });
        });

        this.q.error = (error) => {
            this.emit("error", error);
            this.q.kill();
        };

        this.updatePause();
    }

    public push(task: T) {
        this.q.push(task);
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
        if (paused === this.q.paused) {
            return;
        }

        if (paused) {
            this.q.pause();
            this.emit("pause");
        } else {
            this.q.resume();
            this.emit("resume");
        }
    }
}
