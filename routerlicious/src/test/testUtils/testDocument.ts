import * as assert from "assert";
import { EventEmitter } from "events";
import * as core from "../../api-core";
import { Deferred, IAuthenticatedUser } from "../../core-utils";

export class TestDeltaQueue extends EventEmitter implements core.IDeltaQueue {
    public paused: boolean;
    public length: number;
    private resumeDeferred: Deferred<void>;

    public pause() {
        if (!this.paused) {
            this.paused = true;
            this.resumeDeferred = new Deferred<void>();
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

export class TestDeltaManager implements core.IDeltaManager {
    public inbound = new TestDeltaQueue();

    public outbound = new TestDeltaQueue();
}

export class TestDocument implements core.IDocument {
    public deltaManager = new TestDeltaManager();
    public options: Object;
    public snapshotRequests = 0;

    constructor(public id: string, public clientId: string) {
    }

    public create(type: string, id?: string): core.ICollaborativeObject {
        throw new Error("Method not implemented.");
    }

    public attach(object: core.ICollaborativeObject): core.IDistributedObjectServices {
        throw new Error("Method not implemented.");
    }

    public get(id: string): Promise<core.ICollaborativeObject> {
        throw new Error("Method not implemented.");
    }

    public getUser(): IAuthenticatedUser {
        throw new Error("Method not implemented.");
    }

    public snapshot(message: string): Promise<void> {
        this.snapshotRequests++;
        return this.snapshotCore(message);
    }

    // Allow derived classes to override the snapshot processing
    public snapshotCore = (message: string) => Promise.resolve();

    public submitObjectMessage(envelope: core.IEnvelope) {
        throw new Error("Method not implemented.");
    }

    public submitLatencyMessage(message: core.ILatencyMessage) {
        throw new Error("Method not implemented.");
    }
}
