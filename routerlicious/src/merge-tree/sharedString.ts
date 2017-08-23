import * as assert from "assert";
import * as resources from "gitresources";
import performanceNow = require("performance-now");
import * as api from "../api";
import * as shared from "../shared";
import * as MergeTree from "./mergeTree";
import * as ops from "./ops";
import * as Paparazzo from "./snapshot";

export class CollaboritiveStringExtension implements api.IExtension {
    public static Type = "https://graph.microsoft.com/types/mergeTree";

    public type: string = CollaboritiveStringExtension.Type;

    public load(
        document: api.Document,
        id: string,
        sequenceNumber: number,
        services: api.IDistributedObjectServices,
        version: resources.ICommit,
        header: string): api.ICollaborativeObject {

        let collaborativeString = new SharedString(document, id, sequenceNumber, services);
        collaborativeString.load(sequenceNumber, header, true);

        return collaborativeString;
    }

    public create(document: api.Document, id: string, options?: Object): api.ICollaborativeObject {
        let collaborativeString = new SharedString(document, id, 0);
        collaborativeString.load(0, null, false);

        return collaborativeString;
    }
}

function textsToSegments(texts: ops.IPropertyString[]) {
    let segments: MergeTree.Segment[] = [];
    for (let ptext of texts) {
        let segment: MergeTree.Segment;
        if (ptext.text !== undefined) {
            segment = MergeTree.TextSegment.make(ptext.text, ptext.props as MergeTree.PropertySet,
                MergeTree.UniversalSequenceNumber,
                MergeTree.LocalClientId);
        } else {
            // for now assume marker
            segment = MergeTree.Marker.make(
                ptext.marker.type,
                ptext.marker.behaviors,
                ptext.props as MergeTree.PropertySet,
                MergeTree.UniversalSequenceNumber,
                MergeTree.LocalClientId);
        }
        segments.push(segment);
    }
    return segments;
}

export class SharedString extends api.CollaborativeObject {
    public client: MergeTree.Client;
    private isLoaded = false;
    private pendingMinSequenceNumber: number = 0;

    // Deferred that triggers once the object is loaded
    private loadedDeferred = new shared.Deferred<void>();

    get loaded(): Promise<void> {
        return this.loadedDeferred.promise;
    }

    constructor(
        document: api.Document,
        public id: string,
        sequenceNumber: number,
        services?: api.IDistributedObjectServices) {
        super(document, id, CollaboritiveStringExtension.Type, sequenceNumber, services);
        this.client = new MergeTree.Client("", document.options);
    }

    public async load(sequenceNumber: number, header: string, collaborative: boolean) {
        let chunk: ops.MergeTreeChunk;

        console.log(`Async load ${this.id} - ${performanceNow()}`);

        if (header) {
            chunk = Paparazzo.Snapshot.processChunk(header);
            this.client.mergeTree.reloadFromSegments(textsToSegments(chunk.segmentTexts));
            console.log(`Loading ${this.id} body - ${performanceNow()}`);
            chunk = await Paparazzo.Snapshot.loadChunk(this.services, "body");
            console.log(`Loaded ${this.id} body - ${performanceNow()}`);
            for (let segSpec of chunk.segmentTexts) {
                this.client.mergeTree.appendSegment(segSpec);
            }
        } else {
            chunk = Paparazzo.Snapshot.EmptyChunk;
        }

        // This should happen if we have collab services
        assert.equal(sequenceNumber, chunk.chunkSequenceNumber);
        if (collaborative) {
            console.log(`Start ${this.id} collab - ${performanceNow()}`);
            this.client.startCollaboration(this.document.clientId, sequenceNumber);
        }
        console.log(`Apply ${this.id} pending - ${performanceNow()}`);
        this.applyPending();
        console.log(`Load ${this.id} finished - ${performanceNow()}`);
        this.loadFinished(chunk);
    }

    public insertMarker(
        pos: number,
        type: string,
        behaviors: ops.MarkerBehaviors,
        props?: MergeTree.PropertySet,
        end?: number) {

        const insertMessage: ops.IMergeTreeInsertMsg = {
            marker: { type, behaviors, end },
            pos1: pos,
            props,
            type: ops.MergeTreeDeltaType.INSERT,
        };

        this.client.insertMarkerLocal(pos, type, behaviors, props, end);
        this.submitLocalOperation(insertMessage);
    }

    public insertText(text: string, pos: number, props?: MergeTree.PropertySet) {
        const insertMessage: ops.IMergeTreeInsertMsg = {
            pos1: pos,
            props,
            type: ops.MergeTreeDeltaType.INSERT,
            text,
        };

        this.client.insertTextLocal(text, pos, props);
        this.submitLocalOperation(insertMessage);
    }

    public removeText(start: number, end: number) {
        const removeMessage: ops.IMergeTreeRemoveMsg = {
            pos1: start,
            pos2: end,
            type: ops.MergeTreeDeltaType.REMOVE,
        };

        this.client.removeSegmentLocal(start, end);
        this.submitLocalOperation(removeMessage);
    }

    public annotateRangeFromPast(
        props: MergeTree.PropertySet,
        start: number,
        end: number,
        fromSeq: number) {

        let ranges = this.client.mergeTree.tardisRange(start, end, fromSeq, this.client.getCurrentSeq(),
            this.client.getClientId());
        ranges.map((range: MergeTree.IRange) => {
            this.annotateRange(props, range.start, range.end);
        });
    }

    public annotateRange(props: MergeTree.PropertySet, start: number, end: number) {
        const annotateMessage: ops.IMergeTreeAnnotateMsg = {
            pos1: start,
            pos2: end,
            props,
            type: ops.MergeTreeDeltaType.ANNOTATE,
        };

        this.client.annotateSegmentLocal(props, start, end);
        this.submitLocalOperation(annotateMessage);
    }

    public setLocalMinSeq(lmseq: number) {
        this.client.mergeTree.updateLocalMinSeq(lmseq);
    }

    public snapshot(): api.ITree {
        this.client.mergeTree.commitGlobalMin();
        let snap = new Paparazzo.Snapshot(this.client.mergeTree);
        snap.extractSync();
        return snap.emit();
    }

    public transform(message: api.IObjectMessage, toSequenceNumber: number): api.IObjectMessage {
        if (message.contents) {
            this.client.transform(<api.ISequencedObjectMessage> message, toSequenceNumber);
        }
        message.referenceSequenceNumber = toSequenceNumber;
        return message;
    }

    protected processCore(message: api.ISequencedObjectMessage) {
        if (!this.isLoaded) {
            this.client.enqueueMsg(message);
            return;
        }

        this.applyMessage(message);
    }

    protected processMinSequenceNumberChanged(value: number) {
        // Apply directly once loaded - otherwise track so we can update later
        if (this.isLoaded) {
            this.client.updateMinSeq(value);
        } else {
            this.pendingMinSequenceNumber = value;
        }
    }

    protected attachCore() {
        this.client.startCollaboration(this.document.clientId, 0);
    }

    private loadFinished(chunk: ops.MergeTreeChunk) {
        this.isLoaded = true;
        this.loadedDeferred.resolve();
        this.events.emit("loadFinished", chunk, true);
    }

    private applyPending() {
        while (this.client.hasMessages()) {
            const message = this.client.dequeueMsg();
            this.applyMessage(message);
        }

        // Update the MSN if larger than the set value
        if (this.pendingMinSequenceNumber > this.client.mergeTree.getCollabWindow().minSeq) {
            this.client.updateMinSeq(this.pendingMinSequenceNumber);
        }
    }

    private applyMessage(message: api.ISequencedObjectMessage) {
        this.events.emit("pre-op", message);
        this.client.applyMsg(message);
        this.events.emit("op", message);
    }
}
