import { EventEmitter } from "events";
import * as Collections from "./collections";
import * as MergeTree from "./mergeTree";
import { IMergeTreeInsertMsg, IPropertyString, MarkerBehaviors, MergeTreeDeltaType } from "./ops";
import * as Paparazzo from "./snapshot";
import { findRandomWord, loadSegments } from "./text";
export * from "./mergeTree";
import * as api from "../api";

export * from "./ops";
export { Collections };
export { loadSegments, findRandomWord };

// tslint:disable

export class CollaboritiveStringExtension implements api.IExtension {
    public static Type = "https://graph.microsoft.com/types/mergeTree";

    public type: string = CollaboritiveStringExtension.Type;

    public load(
        document: api.Document,
        id: string,
        services: api.IDistributedObjectServices,
        version: string,
        header: string): api.ICollaborativeObject {

        let coString = new SharedString(document, id);
        coString.load(services, version, header);
        return coString;
    }

    public create(document: api.Document, id: string): api.ICollaborativeObject {
        let coString = new SharedString(document, id);
        return coString;
    }
}

function textsToSegments(texts: IPropertyString[]) {
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

export class SharedString implements api.ICollaborativeObject {
    client: MergeTree.Client;
    type: string = CollaboritiveStringExtension.Type;
    services: api.IDistributedObjectServices;
    connection: api.IDeltaConnection;
    __collaborativeObject__: boolean = true;
    initialSeq: number;
    private events = new EventEmitter();
    private clientSequenceNumber = 1;
    private isLoaded = false;

    constructor(private document: api.Document, public id: string) {
        this.client = new MergeTree.Client("");
        this.__collaborativeObject__ = true;
    }

    async load(services: api.IDistributedObjectServices, version: string, header: string) {
        this.services = services;

        let chunk = Paparazzo.Snapshot.processChunk(header);
        let bodyChunkP = Paparazzo.Snapshot.loadChunk(services, this.id, version, "body");

        if (chunk.totalSegmentCount >= 0) {
            this.client.mergeTree.reloadFromSegments(textsToSegments(chunk.segmentTexts));
            this.events.emit('partialLoad', chunk, true);
            chunk = await bodyChunkP;
            for (let segSpec of chunk.segmentTexts) {
                this.client.mergeTree.appendSegment(segSpec);
            }
            this.initialSeq = chunk.chunkSequenceNumber;
        } else {
            this.initialSeq = 0;
            this.events.emit('partialLoad', chunk, true);
        }

        this.isLoaded = true;
        this.client.startCollaboration(this.document.clientId, this.initialSeq);
        this.listenForUpdates();

        this.events.emit('loadFinshed', chunk, true);
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

    private makeInsertMarkerMsg(pos: number, markerType: string, behaviors: MarkerBehaviors, props?: Object, end?: number) {
        return <api.IObjectMessage>{
            clientSequenceNumber: this.clientSequenceNumber++,
            contents: <IMergeTreeInsertMsg>{
                type: MergeTreeDeltaType.INSERT, pos1: pos, props, marker: { type: markerType, behaviors, end },
            },
            objectId: this.id,
            referenceSequenceNumber: this.client.getCurrentSeq(),
            type: api.ObjectOperation,
        };

    }
    private makeInsertMsg(text: string, pos: number, props?: Object) {
        return <api.IObjectMessage>{
            clientSequenceNumber: this.clientSequenceNumber++,
            referenceSequenceNumber: this.client.getCurrentSeq(),
            objectId: this.id,
            contents: {
                type: MergeTreeDeltaType.INSERT, text, pos1: pos, props,
            },
            type: api.ObjectOperation,
        };
    }

    private makeRemoveMsg(start: number, end: number) {
        return <api.IObjectMessage>{
            clientSequenceNumber: this.clientSequenceNumber++,
            referenceSequenceNumber: this.client.getCurrentSeq(),
            objectId: this.id,
            contents: {
                type: MergeTreeDeltaType.REMOVE, pos1: start, pos2: end
            },
            type: api.ObjectOperation,
        };
    }

    public insertMarker(pos: number, type: string, behaviors: MarkerBehaviors, props?: Object, end?: number) {
        const insertMessage = this.makeInsertMarkerMsg(pos, type, behaviors, props, end);
        this.client.insertMarkerLocal(pos, type, behaviors, props, end);
        if (this.services) {
            this.services.deltaConnection.submit(insertMessage);
        }
    }

    public insertText(text: string, pos: number, props?: Object) {
        const insertMessage = this.makeInsertMsg(text, pos, props);
        this.client.insertTextLocal(text, pos, props);
        if (this.services) {
            this.services.deltaConnection.submit(insertMessage);
        }
    }

    public removeText(start: number, end: number) {
        const removeMessage = this.makeRemoveMsg(start, end);
        this.client.removeSegmentLocal(start, end);
        if (this.services) {
            this.services.deltaConnection.submit(removeMessage);
        }
    }

    private processRemoteOperation(message: api.ISequencedDocumentMessage) {
        this.events.emit("pre-op", message);
        
        if (this.isLoaded) {
            this.client.applyMsg(message);
        } else {
            this.client.enqueueMsg(message);
        }

        this.events.emit("op", message);
    }

    private listenForUpdates() {
        this.services.deltaConnection.on("op", (message) => {
            this.processRemoteOperation(message);
        });
    }

    public attach(): this {
        if (!this.isLocal()) {
            return this;
        }

        this.services = this.document.attach(this);
        this.initialSeq = 0;
        this.listenForUpdates();
        this.isLoaded = true;
        this.client.startCollaboration(this.document.clientId, this.initialSeq);

        return this;
    }

    isLocal(): boolean {
        return !this.client.mergeTree.collabWindow.collaborating;
    }

    public snapshot(): Promise<api.IObject[]> {
        let snap = new Paparazzo.Snapshot(this.client.mergeTree);
        snap.extractSync();
        return snap.emit();
    }
}