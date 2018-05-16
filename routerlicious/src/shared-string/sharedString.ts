// tslint:disable:whitespace align no-bitwise ordered-imports
import * as assert from "assert";
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
import { ISequencedObjectMessage } from "../api-core";

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
    private isLoaded = false;
    private collabStarted = false;
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
        refType: MergeTree.ReferenceType,
        props?: MergeTree.PropertySet,
        pairId?: number) {

        const insertMessage: MergeTree.IMergeTreeInsertMsg = {
            marker: { pairId, refType },
            pos1: pos,
            props,
            type: MergeTree.MergeTreeDeltaType.INSERT,
        };

        this.client.insertMarkerLocal(pos, refType, props, pairId);
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

    public removeNest(nestStart: MergeTree.Marker, nestEnd: MergeTree.Marker) {
        let start = this.client.mergeTree.getOffset(nestStart,
            MergeTree.UniversalSequenceNumber, this.client.getClientId());
        let end = nestEnd.cachedLength + this.client.mergeTree.getOffset(nestEnd,
            MergeTree.UniversalSequenceNumber, this.client.getClientId());
        console.log(`removing nest ${nestStart.getId()} from [${start},${end})`);
        const removeMessage: MergeTree.IMergeTreeRemoveMsg = {
            checkNest: {id1: nestStart.getId(), id2: nestEnd.getId()},
            pos1: start,
            pos2: end,
            type: MergeTree.MergeTreeDeltaType.REMOVE,
        };
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

    public annotateMarkerNotifyConsensus(marker: MergeTree.Marker, props: MergeTree.PropertySet,
        callback: (m: MergeTree.Marker) => void) {
        let id = marker.getId();
        let annotateMessage: MergeTree.IMergeTreeAnnotateMsg = {
            combiningOp: { name: "consensus"},
            relativePos1: { id, before: true },
            relativePos2: { id },
            props,
            type: MergeTree.MergeTreeDeltaType.ANNOTATE,
        };
        this.client.annotateMarkerNotifyConsensus(marker, props, callback);
        this.submitIfAttached(annotateMessage);
    }

    public annotateMarker(props: MergeTree.PropertySet, marker: MergeTree.Marker, op?: MergeTree.ICombiningOp) {
        let id = marker.getId();
        let annotateMessage: MergeTree.IMergeTreeAnnotateMsg = {
            relativePos1: { id, before: true },
            relativePos2: { id },
            props,
            type: MergeTree.MergeTreeDeltaType.ANNOTATE,
        };

        if (op) {
            annotateMessage.combiningOp = op;
        }
        this.client.annotateMarker(props, marker, op);
        this.submitIfAttached(annotateMessage);
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
        sequenceNumber: number,
        minimumSequenceNumber: number,
        messages: api.ISequencedObjectMessage[],
        headerOrigin: string,
        storage: api.IObjectStorageService): Promise<void> {

        const header = await storage.read("header");

        return this.initialize(sequenceNumber, minimumSequenceNumber, messages, header, true, headerOrigin, storage);
    }

    protected initializeContent() {
        const intervalCollections = this.document.create(MapExtension.Type) as IMap;
        this.set("intervalCollections", intervalCollections);
        // TODO will want to update initialize to operate synchronously
        this.initialize(0, 0, [], null, false, this.id, null).catch(
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
        if (this.client.mergeTree.minSeqPending) {
            this.client.mergeTree.notifyMinSeqListeners();
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
        this.collabStarted = true;
    }

    protected onConnectContent(pending: api.IObjectMessage[]) {
        // Update merge tree collaboration information with new client ID and then resend pending ops
        if (this.collabStarted) {
            this.client.updateCollaboration(this.document.clientId);
        }

        this.sendNACKed();

        return;
    }

    private submitIfAttached(message: any) {
        if (this.isLocal()) {
            return;
        }

        this.submitLocalMessage(message);
    }

    private loadHeader(
        sequenceNumber: number,
        minimumSequenceNumber: number,
        header: string,
        collaborative: boolean,
        originBranch: string,
        services: api.IObjectStorageService) {

        if (!header) {
            return;
        }

        const chunk = MergeTree.Snapshot.processChunk(header);
        let segs = textsToSegments(chunk.segmentTexts);
        this.client.mergeTree.reloadFromSegments(segs);
    }

    private async loadBody(
        sequenceNumber: number,
        minimumSequenceNumber: number,
        header: string,
        messages: ISequencedObjectMessage[],
        collaborative: boolean,
        originBranch: string,
        services: api.IObjectStorageService) {

        // If loading from a snapshot load in the body
        if (header) {
            const chunk = await MergeTree.Snapshot.loadChunk(services, "body");
            for (let segSpec of chunk.segmentTexts) {
                this.client.mergeTree.appendSegment(segSpec);
            }
        }

        // This should happen if we have collab services
        if (collaborative) {
            // TODO currently only assumes two levels of branching
            const branchId = originBranch === this.document.id ? 0 : 1;
            this.collabStarted = true;
            this.client.startCollaboration(
                this.document.clientId, this.document.getUser(), minimumSequenceNumber, branchId);
        }

        // Apply all pending messages
        for (const message of messages) {
            this.processContent(message);
        }

        // Do we want to break the dependence on the interval collection
        // Register the filter callback on the reference collections
        let intervalCollections = await this.get("intervalCollections") as IMap;

        this.intervalCollections = await intervalCollections.getView();
        intervalCollections.on("valueChanged", (ev: IValueChanged) => {
            let intervalCollection = this.intervalCollections.get<SharedIntervalCollection>(ev.key);
            intervalCollection.initialize(this, ev.key);
        });
    }

    private async initialize(
        sequenceNumber: number,
        minimumSequenceNumber: number,
        messages: ISequencedObjectMessage[],
        header: string,
        collaborative: boolean,
        originBranch: string,
        services: api.IObjectStorageService) {

        if (!header) {
            assert.equal(minimumSequenceNumber, MergeTree.Snapshot.EmptyChunk.chunkSequenceNumber);
        }

        this.loadHeader(sequenceNumber, minimumSequenceNumber, header, collaborative, originBranch, services);
        this.loadBody(
            sequenceNumber,
            minimumSequenceNumber,
            header,
            messages,
            collaborative,
            originBranch,
            services).then(
                () => {
                    this.loadFinished();
                    this.initializeIntervalCollections();
                },
                (error) => {
                    this.loadFinished(error);
                });
    }

    private initializeIntervalCollections() {
        for (let key of this.intervalCollections.keys()) {
            let intervalCollection = this.intervalCollections.get<SharedIntervalCollection>(key);
            intervalCollection.initialize(this, key);
        }
    }

    private loadFinished(error?: any) {
        if (error) {
            this.loadedDeferred.reject(error);
        } else {
            this.isLoaded = true;
            this.loadedDeferred.resolve();

            // Update the MSN if larger than the set value
            if (this.pendingMinSequenceNumber > this.client.mergeTree.getCollabWindow().minSeq) {
                this.client.updateMinSeq(this.pendingMinSequenceNumber);
            }
        }
    }
}
