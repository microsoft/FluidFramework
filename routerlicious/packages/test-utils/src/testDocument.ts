import { ISnapshotDocument } from "@prague/agent";
import { IDeltaManager, IDeltaQueue } from "@prague/runtime-definitions";
import * as utils from "@prague/utils";
import * as assert from "assert";
import { EventEmitter } from "events";

export class TestDeltaQueue extends EventEmitter implements IDeltaQueue {
    public paused: boolean;
    public length: number;
    public idle: boolean;
    private resumeDeferred: utils.Deferred<void>;

    public pause() {
        if (!this.paused) {
            this.paused = true;
            this.resumeDeferred = new utils.Deferred<void>();
        }
    }

    public resume() {
        this.paused = false;
        this.resumeDeferred.resolve();
    }

    public waitForResume(): Promise<void> {
        assert(this.paused);
        return this.resumeDeferred.promise;
    }
}

export class TestDeltaManager implements IDeltaManager {
    public inbound = new TestDeltaQueue();

    public outbound = new TestDeltaQueue();

    public clientType = "Browser";

    public enableReadonlyMode() {
        return;
    }
}

export class TestDocument implements ISnapshotDocument {
    public deltaManager = new TestDeltaManager();
    public snapshotRequests = 0;

    constructor(public id: string, public clientId: string) {
    }

    public snapshot(message: string): Promise<void> {
        this.snapshotRequests++;
        return this.snapshotCore(message);
    }

    // Allow derived classes to override the snapshot processing
    public snapshotCore = (message: string) => Promise.resolve();
}
