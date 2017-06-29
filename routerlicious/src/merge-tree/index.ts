// tslint:disable

import * as MergeTree from "./mergeTree";
import { EventEmitter } from "events";
import * as Paparazzo from "./snapshot";
import * as API from "../api";

export * from "./mergeTree";

import { loadSegments, loadSrcSegments, findRandomWord } from "./text";
export { loadSegments, loadSrcSegments, findRandomWord };

export class CollaboritiveStringExtension implements API.IExtension {
    public static Type = "https://graph.microsoft.com/types/mergeTree";

    public type: string = CollaboritiveStringExtension.Type;

    load(id: string, services: API.ICollaborationServices, registry: API.Registry): API.ICollaborativeObject {
        let coString = new SharedString(id);
        coString.load(services, registry);
        return coString;
    }

    create(id: string): API.ICollaborativeObject {
        let coString = new SharedString(id);
        return coString;
    }
}

function textsToSegments(texts: API.IPropertyString[]) {
    let segments = <MergeTree.TextSegment[]>[];
    for (let ptext of texts) {
        let segment = MergeTree.TextSegment.make(ptext.text, ptext.props,
            MergeTree.UniversalSequenceNumber,
            MergeTree.LocalClientId);
        segments.push(segment);
    }
    return segments;
}

export class SharedString implements API.ICollaborativeObject {
    client: MergeTree.Client;
    type: string = CollaboritiveStringExtension.Type;
    services: API.ICollaborationServices;
    connection: API.IDeltaConnection;
    deltaManager: API.DeltaManager;
    __collaborativeObject__: boolean = true;
    initialSeq: number;
    private events = new EventEmitter();
    private clientSequenceNumber = 1;
    private isLoaded = false;

    constructor(public id: string) {
        this.client = new MergeTree.Client("");
        this.__collaborativeObject__ = true;
    }

    async load(services: API.ICollaborationServices, registry: API.Registry) {
        this.services = services;

        this.connection = await this.services.deltaNotificationService.connect(this.id, this.type);

        let headerChunkP = Paparazzo.Snapshot.loadChunk(services, this.id, "header");
        let bodyChunkP = Paparazzo.Snapshot.loadChunk(services, this.id, this.id);
        let chunk = await headerChunkP;

        if (chunk.totalSegmentCount >= 0) {
            this.client.mergeTree.reloadFromSegments(textsToSegments(chunk.segmentTexts));
            this.events.emit('partialLoad', chunk);
            chunk = await bodyChunkP;
            for (let text of chunk.segmentTexts) {
                this.client.mergeTree.appendTextSegment(text.text, text.props);
            }
            this.initialSeq = chunk.chunkSequenceNumber;
        } else {
            this.initialSeq = 0;
            this.events.emit('partialLoad', chunk);
        }

        this.isLoaded = true;
        this.client.startCollaboration(this.connection.clientId, this.initialSeq);
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

    private makeInsertMsg(text: string, pos: number, props?: Object) {
        return <API.IMessage>{
            referenceSequenceNumber: this.client.getCurrentSeq(),
            objectId: this.id,
            clientSequenceNumber: this.clientSequenceNumber++,
            op: {
                type: API.MergeTreeMsgType.INSERT, text: text, pos1: pos, props,
            }
        };
    }

    private makeRemoveMsg(start: number, end: number) {
        return <API.IMessage>{
            referenceSequenceNumber: this.client.getCurrentSeq(),
            objectId: this.id,
            clientSequenceNumber: this.clientSequenceNumber++,
            op: {
                type: API.MergeTreeMsgType.REMOVE, pos1: start, pos2: end
            }
        };
    }

    public insertText(text: string, pos: number, props?: Object) {
        const insertMessage = this.makeInsertMsg(text, pos, props);
        this.client.insertSegmentLocal(text, pos, props);
        this.deltaManager.submitOp(insertMessage);
    }

    public removeText(start: number, end: number) {
        const removeMessage = this.makeRemoveMsg(start, end);
        this.client.removeSegmentLocal(start, end);
        this.deltaManager.submitOp(removeMessage);
    }

    private processRemoteOperation(message: API.IBase) {
        if (this.isLoaded) {
            this.client.applyMsg(message);
        } else {
            this.client.enqueueMsg(message);
        }

        this.events.emit("op", message);
    }

    private listenForUpdates() {
        this.deltaManager = new API.DeltaManager(
            this.initialSeq,
            this.services.deltaStorageService,
            this.connection,
            {
                getReferenceSequenceNumber: () => {
                    return this.client.getCurrentSeq();
                },
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
        this.isLoaded = true;
        this.client.startCollaboration(this.connection.clientId, this.initialSeq);
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