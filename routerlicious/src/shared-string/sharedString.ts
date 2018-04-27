// tslint:disable:whitespace align no-bitwise ordered-imports
import * as assert from "assert";
import performanceNow = require("performance-now");
import * as resources from "gitresources";
import * as api from "../api-core";
import { Deferred } from "../core-utils";
import { IMap, IMapView, IValueChanged } from "../data-types";
import { CollaborativeMap, MapExtension } from "../map";
import * as MergeTree from "../merge-tree";
import { CollaboritiveStringExtension } from "./extension";
import {
    Interval, SharedIntervalCollection,
    SharedIntervalCollectionValueType,
} from "./intervalCollection";
import { IContentModelExtension } from "../api-core";
import { IRelativePosition } from "../merge-tree";

function textsToSegments(texts: MergeTree.IPropertyString[]) {
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
                ptext.marker.refType,
                ptext.props as MergeTree.PropertySet,
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
    private contentModel: IContentModelExtension;
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
        this.contentModel = document.getContentModel("shared-string");
    }

    public insertNestRelative(beginNestRelPos: IRelativePosition, endNestRelPos: IRelativePosition,
     beginNestProps?: MergeTree.PropertySet, endNestProps?: MergeTree.PropertySet) {
        let pairedMarkerDef =  <MergeTree.IPairedMarkerDef>{
            props: endNestProps,
            refType: MergeTree.ReferenceType.NestEnd,
            relativePos1: endNestRelPos,
        };
        const insertMessage: MergeTree.IMergeTreeInsertMsg = {
            marker: { refType: MergeTree.ReferenceType.NestBegin },
            pairedMarker: pairedMarkerDef,
            props: beginNestProps,
            relativePos1: beginNestRelPos,
            type: MergeTree.MergeTreeDeltaType.INSERT,
        };
        let pos = this.client.mergeTree.posFromRelativePos(beginNestRelPos);
        this.client.insertNestLocal(pos, MergeTree.ReferenceType.NestBegin,
            beginNestProps, pairedMarkerDef);
        this.submitIfAttached(insertMessage);
    }

    public insertMarker(
        pos: number,
        refType: MergeTree.ReferenceType,
        props?: MergeTree.PropertySet) {

        const insertMessage: MergeTree.IMergeTreeInsertMsg = {
            marker: { refType },
            pos1: pos,
            props,
            type: MergeTree.MergeTreeDeltaType.INSERT,
        };

        this.client.insertMarkerLocal(pos, refType, props);
        this.submitIfAttached(insertMessage);
    }

    public getDocument(): api.IDocument {
        return <api.IDocument>this.document;
    }

    public getText(start?: number, end?: number): string {
        return this.client.getText(start, end);
    }

    public paste(register: string, pos: number) {
        const insertMessage: MergeTree.IMergeTreeInsertMsg = {
            pos1: pos,
            register,
            type: MergeTree.MergeTreeDeltaType.INSERT,
        };

        pos = this.client.pasteLocal(register, pos);
        this.submitIfAttached(insertMessage);
        return pos;
    }

    public copy(register: string, start: number, end: number) {
        const insertMessage: MergeTree.IMergeTreeInsertMsg = {
            pos1: start,
            pos2: end,
            register,
            type: MergeTree.MergeTreeDeltaType.INSERT,
        };

        this.client.copy(start, end, register, this.client.getCurrentSeq(),
            this.client.getClientId(), this.client.longClientId);
        this.submitIfAttached(insertMessage);
    }

    public insertText(text: string, pos: number, props?: MergeTree.PropertySet) {
        const insertMessage: MergeTree.IMergeTreeInsertMsg = {
            pos1: pos,
            props,
            type: MergeTree.MergeTreeDeltaType.INSERT,
            text,
        };

        this.client.insertTextLocal(text, pos, props);
        this.submitIfAttached(insertMessage);
    }

    public replaceText(text: string, start: number, end: number, props?: MergeTree.PropertySet) {
        const insertMessage: MergeTree.IMergeTreeInsertMsg = {
            pos1: start,
            pos2: end,
            props,
            type: MergeTree.MergeTreeDeltaType.INSERT,
            text,
        };
        this.client.mergeTree.startGroupOperation();
        this.client.removeSegmentLocal(start, end);
        this.client.insertTextLocal(text, start, props);
        this.client.mergeTree.endGroupOperation();
        this.submitIfAttached(insertMessage);
    }

    public cut(register: string, start: number, end: number) {
        const removeMessage: MergeTree.IMergeTreeRemoveMsg = {
            pos1: start,
            pos2: end,
            register,
            type: MergeTree.MergeTreeDeltaType.REMOVE,
        };
        this.client.copy(start, end, register, this.client.getCurrentSeq(),
            this.client.getClientId(), this.client.longClientId);
        this.client.removeSegmentLocal(start, end);
        this.submitIfAttached(removeMessage);
    }

    public removeText(start: number, end: number) {
        const removeMessage: MergeTree.IMergeTreeRemoveMsg = {
            pos1: start,
            pos2: end,
            type: MergeTree.MergeTreeDeltaType.REMOVE,
        };

        this.client.removeSegmentLocal(start, end);
        this.submitIfAttached(removeMessage);
    }

    public annotateRangeFromPast(
        props: MergeTree.PropertySet,
        start: number,
        end: number,
        fromSeq: number) {

        let ranges = this.client.mergeTree.tardisRange(start, end, fromSeq, this.client.getCurrentSeq(),
            this.client.getClientId());
        ranges.map((range: MergeTree.IIntegerRange) => {
            this.annotateRange(props, range.start, range.end);
        });
    }

    public transaction(groupOp: MergeTree.IMergeTreeGroupMsg): MergeTree.SegmentGroup {
        let segmentGroup = this.client.localTransaction(groupOp);
        this.submitIfAttached(groupOp);
        return segmentGroup;
    }

    public annotateRange(props: MergeTree.PropertySet, start: number, end: number, op?: MergeTree.ICombiningOp) {
        let annotateMessage: MergeTree.IMergeTreeAnnotateMsg = {
            pos1: start,
            pos2: end,
            props,
            type: MergeTree.MergeTreeDeltaType.ANNOTATE,
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

    public createPositionReference(pos: number, refType: MergeTree.ReferenceType, refSeq = this.client.getCurrentSeq(),
        clientId = this.client.getClientId()): MergeTree.LocalReference {
        let segoff = this.client.mergeTree.getContainingSegment(pos,
            refSeq, this.client.getClientId());
        if (segoff && segoff.segment) {
            let baseSegment = <MergeTree.BaseSegment>segoff.segment;
            let lref = new MergeTree.LocalReference(baseSegment, segoff.offset, refType);
            if (refType !== MergeTree.ReferenceType.Transient) {
                this.client.mergeTree.addLocalReference(lref);
            }
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

    public sendNACKed() {
        let orderedSegments = <MergeTree.Segment[]>[];
        while (!this.client.mergeTree.pendingSegments.empty()) {
            let NACKedSegmentGroup = this.client.mergeTree.pendingSegments.dequeue();
            for (let segment of NACKedSegmentGroup.segments) {
                orderedSegments.push(segment);
            }
        }

        orderedSegments.sort((a, b) => {
            if (a === b) {
                return 0;
            } else if (a.ordinal < b.ordinal) {
                return -1;
            } else {
                return 1;
            }
        });

        let segmentGroup = <MergeTree.SegmentGroup>{
            segments: orderedSegments,
        };
        let opList = <MergeTree.IMergeTreeOp[]>[];
        let prevSeg: MergeTree.Segment;
        for (let segment of orderedSegments) {
            if (prevSeg !== segment) {
                segment.segmentGroup = segmentGroup;
                this.client.segmentToOps(segment, opList);
                prevSeg = segment;
            }
        }
        let groupOp = <MergeTree.IMergeTreeGroupMsg>{
            ops: opList,
            type: MergeTree.MergeTreeDeltaType.GROUP,
        };
        this.client.mergeTree.pendingSegments.enqueue(segmentGroup);
        this.submitIfAttached(groupOp);
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
                console.error("initializeContent", error);
            });
    }

    protected snapshotContent(): api.ITree {
        this.client.mergeTree.commitGlobalMin();
        let snap = new MergeTree.Snapshot(this.client.mergeTree);
        snap.extractSync();
        return snap.emit();
    }

    protected prepareContent(): Promise<void> {
        return this.loadedDeferred.promise;
    }

    protected processContent(message: api.ISequencedObjectMessage) {
        this.client.applyMsg(message);
        if (this.contentModel) {
            this.applyContentModel(message);
        }
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
        // Update merge tree collaboration information with new client ID and then resend pending ops
        this.client.updateCollaboration(this.document.clientId);
        this.sendNACKed();

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

        let chunk: MergeTree.MergeTreeChunk;

        console.log(`Async load ${this.id} - ${performanceNow()}`);

        if (header) {
            chunk = MergeTree.Snapshot.processChunk(header);
            let segs = textsToSegments(chunk.segmentTexts);
            this.client.mergeTree.reloadFromSegments(segs);
            console.log(`Loading ${this.id} body - ${performanceNow()}`);
            chunk = await MergeTree.Snapshot.loadChunk(services, "body");
            console.log(`Loaded ${this.id} body - ${performanceNow()}`);
            for (let segSpec of chunk.segmentTexts) {
                this.client.mergeTree.appendSegment(segSpec);
            }
        } else {
            chunk = MergeTree.Snapshot.EmptyChunk;
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

        console.log(`Load ${this.id} finished - ${performanceNow()}`);
        this.loadFinished(chunk);
    }

    private initializeIntervalCollections() {
        for (let key of this.intervalCollections.keys()) {
            let intervalCollection = this.intervalCollections.get<SharedIntervalCollection>(key);
            intervalCollection.initialize(this, key);
        }
    }

    private loadFinished(chunk: MergeTree.MergeTreeChunk) {
        this.isLoaded = true;
        this.loadedDeferred.resolve();
        this.emit("loadFinished", chunk, true);

        // Update the MSN if larger than the set value
        if (this.pendingMinSequenceNumber > this.client.mergeTree.getCollabWindow().minSeq) {
            this.client.updateMinSeq(this.pendingMinSequenceNumber);
        }
    }

    private applyContentModel(message: api.ISequencedObjectMessage) {
        if ((message.type === api.OperationType) &&
            (message.clientId !== this.document.clientId)) {
            let delta = <MergeTree.IMergeTreeOp>message.contents;
            if ((delta.type === MergeTree.MergeTreeDeltaType.GROUP) && (delta.macroOp)) {
                this.contentModel.exec(message, this);
            }
        }
    }
}
