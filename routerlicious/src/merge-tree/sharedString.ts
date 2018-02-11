import * as assert from "assert";
import performanceNow = require("performance-now");
import * as resources from "gitresources";
import * as api from "../api-core";
import { Deferred } from "../core-utils";
import { CollaborativeMap } from "../map";
import { CollaboritiveStringExtension } from "./extension";
import * as MergeTree from "./mergeTree";
import * as ops from "./ops";
import * as Properties from "./properties";
import * as Paparazzo from "./snapshot";

function textsToSegments(texts: ops.IPropertyString[]) {
    let segments: MergeTree.Segment[] = [];
    for (let ptext of texts) {
        let segment: MergeTree.Segment;
        if (ptext.text !== undefined) {
            segment = MergeTree.TextSegment.make(ptext.text, ptext.props as Properties.PropertySet,
                MergeTree.UniversalSequenceNumber,
                MergeTree.LocalClientId);
        } else {
            // for now assume marker
            segment = MergeTree.Marker.make(
                ptext.marker.refType,
                ptext.props as Properties.PropertySet,
                MergeTree.UniversalSequenceNumber,
                MergeTree.LocalClientId);
        }
        segments.push(segment);
    }
    return segments;
}

export class SharedString extends CollaborativeMap {
    public client: MergeTree.Client;
    private isLoaded = false;
    private pendingMinSequenceNumber: number = 0;

    // Deferred that triggers once the object is loaded
    private loadedDeferred = new Deferred<void>();

    get loaded(): Promise<void> {
        return this.loadedDeferred.promise;
    }

    constructor(
        document: api.IDocument,
        public id: string,
        sequenceNumber: number,
        services?: api.IDistributedObjectServices) {

        super(id, document, CollaboritiveStringExtension.Type);
        this.client = new MergeTree.Client("", document.options);
    }

    public insertMarker(
        pos: number,
        refType: ops.ReferenceType,
        props?: Properties.PropertySet) {

        const insertMessage: ops.IMergeTreeInsertMsg = {
            marker: { refType },
            pos1: pos,
            props,
            type: ops.MergeTreeDeltaType.INSERT,
        };

        this.client.insertMarkerLocal(pos, refType, props);
        this.submitIfAttached(insertMessage);
    }

    public insertText(text: string, pos: number, props?: Properties.PropertySet) {
        const insertMessage: ops.IMergeTreeInsertMsg = {
            pos1: pos,
            props,
            type: ops.MergeTreeDeltaType.INSERT,
            text,
        };

        this.client.insertTextLocal(text, pos, props);
        this.submitIfAttached(insertMessage);
    }

    public removeText(start: number, end: number) {
        const removeMessage: ops.IMergeTreeRemoveMsg = {
            pos1: start,
            pos2: end,
            type: ops.MergeTreeDeltaType.REMOVE,
        };

        this.client.removeSegmentLocal(start, end);
        this.submitIfAttached(removeMessage);
    }

    public annotateRangeFromPast(
        props: Properties.PropertySet,
        start: number,
        end: number,
        fromSeq: number) {

        let ranges = this.client.mergeTree.tardisRange(start, end, fromSeq, this.client.getCurrentSeq(),
            this.client.getClientId());
        ranges.map((range: MergeTree.IRange) => {
            this.annotateRange(props, range.start, range.end);
        });
    }

    public transaction(groupOp: ops.IMergeTreeGroupMsg) {
        this.client.localTransaction(groupOp);
        this.submitIfAttached(groupOp);
    }

    public annotateRange(props: Properties.PropertySet, start: number, end: number, op?: ops.ICombiningOp) {
        let annotateMessage: ops.IMergeTreeAnnotateMsg = {
            pos1: start,
            pos2: end,
            props,
            type: ops.MergeTreeDeltaType.ANNOTATE,
        };

        if (op) {
            annotateMessage.combiningOp = op;
        }
        this.client.annotateSegmentLocal(props, start, end, op);
        this.submitIfAttached(annotateMessage);
    }

    public setLocalMinSeq(lmseq: number) {
        this.client.mergeTree.updateLocalMinSeq(lmseq);
    }

    public transform(message: api.IObjectMessage, toSequenceNumber: number): api.IObjectMessage {
        if (message.contents) {
            this.client.transform(<api.ISequencedObjectMessage> message, toSequenceNumber);
        }
        message.referenceSequenceNumber = toSequenceNumber;
        return message;
    }

    public createLocalReference(pos: number, slideOnRemove = false) {
        let segoff = this.client.mergeTree.getContainingSegment(pos,
            this.client.getCurrentSeq(), this.client.getClientId());
        if (segoff && segoff.segment) {
            let refType = ops.ReferenceType.Simple;
            if (slideOnRemove) {
                // tslint:disable:no-bitwise
                refType |= ops.ReferenceType.SlideOnRemove;
            }
            return new MergeTree.LocalReference(<MergeTree.BaseSegment> segoff.segment, segoff.offset, refType);
        }
    }

    public localRefToPos(localRef: MergeTree.LocalReference) {
        if (localRef.segment) {
            return localRef.offset + this.client.mergeTree.getOffset(localRef.segment,
                this.client.getCurrentSeq(), this.client.getClientId());
        } else {
            return -1;
        }
    }

    protected loadContent(version: resources.ICommit, header: string, headerOrigin: string) {
        this.initialize(this.sequenceNumber, header, true, headerOrigin).catch((error) => {
            console.error(error);
        });
    }

    protected initializeContent() {
        this.initialize(0, null, false, this.id).catch((error) => {
            console.error(error);
        });
    }

    protected snapshotContent(): api.ITree {
        this.client.mergeTree.commitGlobalMin();
        let snap = new Paparazzo.Snapshot(this.client.mergeTree);
        snap.extractSync();
        return snap.emit();
    }

    protected processContent(message: api.ISequencedObjectMessage) {
        if (!this.isLoaded) {
            this.client.enqueueMsg(message);
            return;
        }

        this.applyMessage(message);
    }

    protected processMinSequenceNumberChangedContent(value: number) {
        // Apply directly once loaded - otherwise track so we can update later
        if (this.isLoaded) {
            this.client.updateMinSeq(value);
        } else {
            this.pendingMinSequenceNumber = value;
        }
    }

    protected attachContent() {
        this.client.startCollaboration(this.document.clientId, 0);
    }

    private submitIfAttached(message: any) {
        if (this.isLocal()) {
            return;
        }

        this.submitLocalMessage(message);
    }

    private async initialize(sequenceNumber: number, header: string, collaborative: boolean, originBranch: string) {
        let chunk: ops.MergeTreeChunk;

        console.log(`Async load ${this.id} - ${performanceNow()}`);

        if (header) {
            chunk = Paparazzo.Snapshot.processChunk(header);
            let segs = textsToSegments(chunk.segmentTexts);
            this.client.mergeTree.reloadFromSegments(segs);
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
            // TODO currently only assumes two levels of branching
            const branchId = originBranch === this.document.id ? 0 : 1;
            this.client.startCollaboration(this.document.clientId, sequenceNumber, branchId);
        }
        console.log(`Apply ${this.id} pending - ${performanceNow()}`);
        this.applyPending();
        console.log(`Load ${this.id} finished - ${performanceNow()}`);
        this.loadFinished(chunk);
    }

    private loadFinished(chunk: ops.MergeTreeChunk) {
        this.isLoaded = true;
        this.loadedDeferred.resolve();
        this.emit("loadFinished", chunk, true);
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
        this.emit("pre-op", message);
        this.client.applyMsg(message);
        this.emit("op", message);
    }
}
