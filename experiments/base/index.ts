import * as MergeTree from "./mergeTree";
import { EventEmitter } from "events";
import * as Paparazzo from "./snapshot";
import * as API from "../../routerlicious/src/api";
import * as Protocol from "../../routerlicious/src/api/protocol";

class CollaboritiveStringExtension implements API.IExtension {
    type: string;

    load(id: string, services: API.ICollaborationServices, registry: API.Registry): API.ICollaborativeObject {
        let coString = new CollaborativeString(id);
        coString.load(services, registry);
        return coString;
    }

    create(id: string): API.ICollaborativeObject {
        let coString = new CollaborativeString(id);
        return coString;
    }
}

function textsToSegments(texts: string[]) {
    let segments = <MergeTree.TextSegment[]>[];
    for (let text of texts) {
        let segment = new MergeTree.TextSegment(text,
            MergeTree.UniversalSequenceNumber,
            MergeTree.LocalClientId);
        segments.push(segment);
    }
    return segments;
}

class CollaborativeString implements API.ICollaborativeObject {
    client: MergeTree.Client;
    type: string;
    services: API.ICollaborationServices;
    connection: API.IDeltaConnection;
    deltaManager: API.DeltaManager;
    __collaborativeObject__: boolean;
    initialSeq: number;
    private events = new EventEmitter();

    constructor(public id: string) {
        this.client = new MergeTree.Client("", "HappyCat");
        this.__collaborativeObject__ = true;
    }

    async load(services: API.ICollaborationServices, registry: API.Registry) {
        this.services = services;
        let chunk = await Paparazzo.Snapshot.loadChunk(services, this.id + "header");
        this.events.emit('partialLoad', chunk);
        this.client.mergeTree.reloadFromSegments(textsToSegments(chunk.segmentTexts));
        chunk = await Paparazzo.Snapshot.loadChunk(services, this.id);
        for (let text of chunk.segmentTexts) {
            this.client.mergeTree.appendTextSegment(text);
        }
        this.initialSeq = chunk.chunkSequenceNumber;
        this.listenForUpdates();
        this.events.emit('loadFinshed', chunk);
    }

    public on(event: string, listener: Function): this {
        this.events.on(event, listener);
        return this;
    }

    public removeListener(event: string, listener: Function): this {
        this.events.removeListener(event, listener);
        return this;
    }

    public removeAllListeners(event?: string): this {
        this.events.removeAllListeners(event);
        return this;
    }

    private processRemoteOperation(message: Protocol.ISequencedMessage) {
        this.client.applyMsg(message.op); // TODO: change to ISeqMSG
    }

    private listenForUpdates() {
        this.deltaManager = new API.DeltaManager(
            this.initialSeq,
            this.services.deltaStorageService,
            this.connection,
            {
                op: (message) => {
                    this.processRemoteOperation(message);
                },
            });
    }

    async attach(services: API.ICollaborationServices, registry: API.Registry): Promise<void> {
        this.services = services;
        this.initialSeq = 0;
        this.connection = await this.services.deltaNotificationService.connect(this.id, "string");
        this.listenForUpdates();
    }

    isLocal(): boolean {
        return !this.client.mergeTree.collabWindow.collaborating;
    }

    async snapshot(): Promise<void> {
        let snap = new Paparazzo.Snapshot(this.client.mergeTree);
        snap.extractSync();
        await snap.emit(this.services, this.id);
    }
}