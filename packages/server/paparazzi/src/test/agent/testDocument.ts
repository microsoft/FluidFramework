/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IConnectionDetails,
    IDeltaHandlerStrategy,
    IDeltaManager,
    IDeltaQueue,
} from "@microsoft/fluid-container-definitions";
import * as utils from "@microsoft/fluid-core-utils";
import {
    IClientDetails,
    IDocumentMessage,
    ISequencedDocumentMessage,
    IServiceConfiguration,
    ISignalMessage,
    MessageType,
} from "@microsoft/fluid-protocol-definitions";
import { ISnapshotDocument } from "@microsoft/fluid-server-agent";
import * as assert from "assert";
import { EventEmitter } from "events";

export class TestDeltaQueue<T> extends EventEmitter implements IDeltaQueue<T> {
    public disposed: boolean = false;
    public paused: boolean;
    public length: number;
    public idle: boolean;
    private resumeDeferred: utils.Deferred<void>;

    public dispose() {
        this.disposed = true;
    }

    public pause(): Promise<void> {
        if (!this.paused) {
            this.paused = true;
            this.resumeDeferred = new utils.Deferred<void>();
        }

        return Promise.resolve();
    }

    public resume() {
        this.paused = false;
        this.resumeDeferred.resolve();
    }

    public waitForResume(): Promise<void> {
        assert(this.paused);
        return this.resumeDeferred.promise;
    }

    public take(count: number) {
        throw new Error("Method not implemented.");
    }

    public peek(): T {
        throw new Error("Method not implemented.");
    }

    public toArray(): T[] {
        throw new Error("Method not implemented.");
    }

    public runPaused<U>(callback: () => Promise<U>): Promise<U> {
        throw new Error("Method not implemented");
    }
}

export class TestDeltaManager
    extends EventEmitter implements IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> {

    public disposed: boolean = false;

    public referenceSequenceNumber: number;

    public maxMessageSize: number;

    public minimumSequenceNumber: number;

    public initialSequenceNumber: number;

    public inbound = new TestDeltaQueue<ISequencedDocumentMessage>();

    public outbound = new TestDeltaQueue<IDocumentMessage[]>();

    public inboundSignal = new TestDeltaQueue<ISignalMessage>();

    public clientType = "";
    public clientDetails: IClientDetails = { capabilities: { interactive: true} };

    public version = "^0.1.0";

    public serviceConfiguration: IServiceConfiguration;

    public active = true;
    public get IDeltaSender() { return this; }

    public dispose() {
        this.disposed = true;
    }

    public close(): void {
        return;
    }

    public connect(reason: string): Promise<IConnectionDetails> {
        throw new Error("Method not implemented.");
    }

    public getDeltas(eventName: string, from: number, to?: number): Promise<ISequencedDocumentMessage[]> {
        throw new Error("Method not implemented.");
    }

    public attachOpHandler(
        minSequenceNumber: number,
        sequenceNumber: number,
        handler: IDeltaHandlerStrategy,
        resume: boolean,
    ) {
        throw new Error("Method not implemented.");
    }

    /**
     * Flushes any ops currently being batched to the loader
     */
    public flush(): void {
        throw new Error("Method not implemented.");
    }

    public submit(type: MessageType, contents: string): number {
        throw new Error("Method not implemented.");
    }

    public submitSignal(contents: any): void {
        throw new Error("Method not implemented.");
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
