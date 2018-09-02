import { core } from "@prague/client-api";
import * as utils from "@prague/utils";
import * as assert from "assert";
import { EventEmitter } from "events";

export class TestDeltaQueue extends EventEmitter implements core.IDeltaQueue {
    public paused: boolean;
    public length: number;
    public empty: boolean;
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

export class TestDeltaManager implements core.IDeltaManager {
    public inbound = new TestDeltaQueue();

    public outbound = new TestDeltaQueue();
}

export class TestDocument implements core.IDocument {
    public deltaManager = new TestDeltaManager();
    public options: any;
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

    public getUser(): core.ITenantUser {
        throw new Error("Method not implemented.");
    }

    public getContentModel(): core.IContentModelExtension {
        throw new Error("Method not implemented.");
    }

    public snapshot(message: string): Promise<void> {
        this.snapshotRequests++;
        return this.snapshotCore(message);
    }

    public uploadBlob(blob: core.IGenericBlob): Promise<core.IGenericBlob> {
        return null;
    }

    public getBlob(sha: string): Promise<core.IGenericBlob> {
        return null;
    }

    // Allow derived classes to override the snapshot processing
    public snapshotCore = (message: string) => Promise.resolve();

    public submitObjectMessage(envelope: core.IEnvelope) {
        throw new Error("Method not implemented.");
    }
}
