// tslint:disable:whitespace align no-bitwise ordered-imports
import * as assert from "assert";
import performanceNow = require("performance-now");
import * as resources from "gitresources";
import * as api from "../api-core";
import { Document } from "../api";
// import * as Collections from "./collections";
import { Deferred } from "../core-utils";
import { IMap, IMapView, IValueChanged } from "../data-types";
import { CollaborativeMap, MapExtension } from "../map";
import { IIntegerRange } from "./base";
import { CollaboritiveStringExtension } from "./extension";
import * as MergeTree from "./mergeTree";
import * as ops from "./ops";
import * as Properties from "./properties";
import * as Paparazzo from "./snapshot";
import { Interval, SharedIntervalCollection, SharedIntervalCollectionValueType } from "./intervalCollection";

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
    public intervalCollections: IMapView;
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

    public getDocument() {
        return <Document>this.document;
    }

    public createString() {
        return (<Document>this.document).createString();
    }
    public getText(start?: number, end?: number): string {
        return this.client.getText(start, end);
    }

    public paste(register: string, pos: number) {
        const insertMessage: ops.IMergeTreeInsertMsg = {
            pos1: pos,
            register,
            type: ops.MergeTreeDeltaType.INSERT,
        };

        pos = this.client.pasteLocal(register, pos);
        this.submitIfAttached(insertMessage);
        return pos;
    }

    public copy(register: string, start: number, end: number) {
        const insertMessage: ops.IMergeTreeInsertMsg = {
            pos1: start,
            pos2: end,
            register,
            type: ops.MergeTreeDeltaType.INSERT,
        };

        this.client.copy(start, end, register, this.client.getCurrentSeq(),
            this.client.getClientId(), this.client.longClientId);
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

    public replaceText(text: string, start: number, end: number, props?: Properties.PropertySet) {
        const insertMessage: ops.IMergeTreeInsertMsg = {
            pos1: start,
            pos2: end,
            props,
            type: ops.MergeTreeDeltaType.INSERT,
            text,
        };
        this.client.mergeTree.startGroupOperation();
        this.client.removeSegmentLocal(start,end);
        this.client.insertTextLocal(text, start, props);
        this.client.mergeTree.endGroupOperation();
        this.submitIfAttached(insertMessage);
    }

    public cut(register: string, start: number, end: number) {
        const removeMessage: ops.IMergeTreeRemoveMsg = {
            pos1: start,
            pos2: end,
            register,
            type: ops.MergeTreeDeltaType.REMOVE,
        };
        this.client.copy(start, end, register, this.client.getCurrentSeq(),
            this.client.getClientId(), this.client.longClientId);
        this.client.removeSegmentLocal(start, end);
        this.submitIfAttached(removeMessage);
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
        ranges.map((range: IIntegerRange) => {
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

    public createPositionReference(pos: number, refType: ops.ReferenceType, refSeq = this.client.getCurrentSeq(),
        clientId = this.client.getClientId()) {
        let segoff = this.client.mergeTree.getContainingSegment(pos,
            refSeq, this.client.getClientId());
        if (segoff && segoff.segment) {
            let baseSegment = <MergeTree.BaseSegment>segoff.segment;
            let lref = new MergeTree.LocalReference(baseSegment, segoff.offset, refType);
            this.client.mergeTree.addLocalReference(lref);
            return lref;
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

    public getIntervalCollections(): IMapView {
        return this.intervalCollections;
    }

    // TODO: fix race condition on creation by putting type on every operation
    public getSharedIntervalCollection(label: string, onDeserialize?: (i: Interval) => void) {
        if (!this.intervalCollections.has(label)) {
            this.intervalCollections.set<SharedIntervalCollection>(label, undefined,
                SharedIntervalCollectionValueType.Name);
        }
        let sharedCollection = this.intervalCollections.get<SharedIntervalCollection>(label);
        if (onDeserialize) {
            sharedCollection.onDeserialize = onDeserialize;
        }
        sharedCollection.initialize(this, label);
        return sharedCollection;
    }

    protected transformContent(message: api.IObjectMessage, toSequenceNumber: number): api.IObjectMessage {
        if (message.contents) {
            this.client.transform(<api.ISequencedObjectMessage>message, toSequenceNumber);
        }
        message.referenceSequenceNumber = toSequenceNumber;
        return message;
    }

    protected async loadContent(
        version: resources.ICommit,
        headerOrigin: string,
        storage: api.IObjectStorageService): Promise<void> {

        const header = await storage.read("header");
        return this.initialize(this.sequenceNumber, header, true, headerOrigin, storage);
    }

    protected initializeContent() {
        const intervalCollections = this.document.create(MapExtension.Type) as IMap;
        this.set("intervalCollections", intervalCollections);
        // TODO will want to update initialize to operate synchronously
        this.initialize(0, null, false, this.id, null).then(
            () => {
                this.initializeIntervalCollections();
            },
            (error) => {
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
        this.client.startCollaboration(this.document.clientId, this.document.getUser(), 0);
    }

    protected loadContentComplete(): Promise<void> {
        this.initializeIntervalCollections();
        return Promise.resolve();
    }

    protected onConnectContent(pending: api.IObjectMessage[]) {
        // Update merge tree collaboration information with new client ID
        this.client.updateCollaboration(this.document.clientId);

        // TODO walk the merge tree and create ops for all pending segments
        for (const message of pending) {
            this.submitLocalMessage(message.contents);
        }

        return;
    }

    private submitIfAttached(message: any) {
        if (this.isLocal()) {
            return;
        }

        this.submitLocalMessage(message);
    }

    // TODO I need to split this into two parts - one for the header - one for the body. The loadContent will
    // resolve on the loading of the header
    private async initialize(
        sequenceNumber: number,
        header: string,
        collaborative: boolean,
        originBranch: string,
        services: api.IObjectStorageService) {

        let chunk: ops.MergeTreeChunk;

        console.log(`Async load ${this.id} - ${performanceNow()}`);

        if (header) {
            chunk = Paparazzo.Snapshot.processChunk(header);
            let segs = textsToSegments(chunk.segmentTexts);
            this.client.mergeTree.reloadFromSegments(segs);
            console.log(`Loading ${this.id} body - ${performanceNow()}`);
            chunk = await Paparazzo.Snapshot.loadChunk(services, "body");
            console.log(`Loaded ${this.id} body - ${performanceNow()}`);
            for (let segSpec of chunk.segmentTexts) {
                this.client.mergeTree.appendSegment(segSpec);
            }
        } else {
            chunk = Paparazzo.Snapshot.EmptyChunk;
        }

        // Register the filter callback on the reference collections
        let intervalCollections = await this.get("intervalCollections") as IMap;
        this.intervalCollections = await intervalCollections.getView();
        intervalCollections.on("valueChanged", (ev: IValueChanged) => {
            let intervalCollection = this.intervalCollections.get<SharedIntervalCollection>(ev.key);
            intervalCollection.initialize(this, ev.key);
        });
        // This should happen if we have collab services
        assert.equal(sequenceNumber, chunk.chunkSequenceNumber);
        if (collaborative) {
            console.log(`Start ${this.id} collab - ${performanceNow()}`);
            // TODO currently only assumes two levels of branching
            const branchId = originBranch === this.document.id ? 0 : 1;
            this.client.startCollaboration(this.document.clientId, this.document.getUser(), sequenceNumber, branchId);
        }
        console.log(`Apply ${this.id} pending - ${performanceNow()}`);
        this.applyPending();
        console.log(`Load ${this.id} finished - ${performanceNow()}`);
        this.loadFinished(chunk);
    }

    private initializeIntervalCollections() {
        for (let key of this.intervalCollections.keys()) {
            let intervalCollection = this.intervalCollections.get<SharedIntervalCollection>(key);
            intervalCollection.initialize(this, key);
        }
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
    }
}
