// tslint:disable

import * as MergeTree from "./mergeTree";
import { EventEmitter } from "events";
import * as Paparazzo from "./snapshot";
import * as API from "../api";
import * as Collections from "./collections";

export * from "./mergeTree";
export { Collections };
import { loadSegments, findRandomWord } from "./text";
export { loadSegments, findRandomWord };

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
    let segments = <MergeTree.Segment[]>[];
    for (let ptext of texts) {
        let segment: MergeTree.Segment;
        if (ptext.text!==undefined) {
            segment = MergeTree.TextSegment.make(ptext.text, ptext.props,
                MergeTree.UniversalSequenceNumber,
                MergeTree.LocalClientId);
        }
        else {
            // for now assume marker
            segment = MergeTree.Marker.make(ptext.marker.type, ptext.marker.behaviors, ptext.props,
                MergeTree.UniversalSequenceNumber, MergeTree.LocalClientId);
        }
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
        const version = this.connection.versions.length > 0 ? this.connection.versions[0].hash : null;

        let headerChunkP = Paparazzo.Snapshot.loadChunk(services, this.id, version, "header");
        let bodyChunkP = Paparazzo.Snapshot.loadChunk(services, this.id, version, "body");
        let chunk = await headerChunkP;

        if (chunk.totalSegmentCount >= 0) {
            this.client.mergeTree.reloadFromSegments(textsToSegments(chunk.segmentTexts));
            this.events.emit('partialLoad', chunk, this.connection.existing);
            chunk = await bodyChunkP;
            for (let segSpec of chunk.segmentTexts) {
                this.client.mergeTree.appendSegment(segSpec);
            }
            this.initialSeq = chunk.chunkSequenceNumber;
        } else {
            this.initialSeq = 0;
            this.events.emit('partialLoad', chunk, this.connection.existing);
        }

        this.isLoaded = true;
        this.client.startCollaboration(this.connection.clientId, this.initialSeq);
        this.listenForUpdates();

        this.events.emit('loadFinshed', chunk, this.connection.existing);
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    public removeListener(event: string, listener: (...args: any[]) => void): this {
        this.events.removeListener(event, listener);
        return this;
    }

    public removeAllListeners(event?: string): this {
        this.events.removeAllListeners(event);
        return this;
    }

    private makeInsertMarkerMsg(pos: number, markerType: string, behaviors: API.MarkerBehaviors, props?: Object, end?: number) {
        return <API.IMessage>{
            referenceSequenceNumber: this.client.getCurrentSeq(),
            objectId: this.id,
            clientSequenceNumber: this.clientSequenceNumber++,
            op: <API.IMergeTreeInsertMsg>{
                type: API.MergeTreeDeltaType.INSERT, pos1: pos, props, marker: { type: markerType, behaviors, end },
            }
        };

    }
    private makeInsertMsg(text: string, pos: number, props?: Object) {
        return <API.IMessage>{
            referenceSequenceNumber: this.client.getCurrentSeq(),
            objectId: this.id,
            clientSequenceNumber: this.clientSequenceNumber++,
            op: {
                type: API.MergeTreeDeltaType.INSERT, text, pos1: pos, props,
            }
        };
    }

    private makeRemoveMsg(start: number, end: number) {
        return <API.IMessage>{
            referenceSequenceNumber: this.client.getCurrentSeq(),
            objectId: this.id,
            clientSequenceNumber: this.clientSequenceNumber++,
            op: {
                type: API.MergeTreeDeltaType.REMOVE, pos1: start, pos2: end
            }
        };
    }

    public insertMarker(pos: number, type: string, behaviors: API.MarkerBehaviors, props?: Object, end?: number) {
        const insertMessage = this.makeInsertMarkerMsg(pos, type, behaviors, props, end);
        this.client.insertMarkerLocal(pos, type, behaviors, props, end);
        this.deltaManager.submitOp(insertMessage);
    }

    public insertText(text: string, pos: number, props?: Object) {
        const insertMessage = this.makeInsertMsg(text, pos, props);
        this.client.insertTextLocal(text, pos, props);
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