// tslint:disable:whitespace align no-bitwise
import {
    CollaborativeMap,
    IMap,
    IMapView,
    IValueChanged,
    MapExtension,
} from "@prague/map";
import * as MergeTree from "@prague/merge-tree";
import {
    IDistributedObjectServices,
    IObjectMessage,
    IObjectStorageService,
    IRuntime,
    ISequencedObjectMessage,
    ITree,
} from "@prague/runtime-definitions";
import { Deferred } from "@prague/utils";
import * as assert from "assert";
// tslint:disable-next-line:no-submodule-imports
import * as uuid from "uuid/v4";
import {
    CollaborativeNumberSequenceExtension,
    CollaborativeObjectSequenceExtension,
    CollaborativeStringExtension,
} from "./extension";
import {
    SharedIntervalCollection,
    SharedStringInterval,
    SharedStringIntervalCollectionValueType,
} from "./intervalCollection";

export type SharedStringSegment = MergeTree.TextSegment | MergeTree.Marker | MergeTree.ExternalSegment;
type SharedStringJSONSegment = MergeTree.IJSONTextSegment & MergeTree.IJSONMarkerSegment;

function textsToSegments(texts: SharedStringJSONSegment[]) {
    const segments: MergeTree.ISegment[] = [];
    for (const ptext of texts) {
        let segment: MergeTree.ISegment;
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

export abstract class SegmentSequence<T extends MergeTree.ISegment> extends CollaborativeMap {
    public client: MergeTree.Client;
    public intervalCollections: IMapView;
    protected autoApply = true;
    protected isLoaded = false;
    protected collabStarted = false;
    protected pendingMinSequenceNumber: number = 0;
    // Deferred that triggers once the object is loaded
    protected loadedDeferred = new Deferred<void>();

    get loaded(): Promise<void> {
        return this.loadedDeferred.promise;
    }

    constructor(
        document: IRuntime,
        public id: string,
        sequenceNumber: number,
        extensionType: string,
        services?: IDistributedObjectServices) {

        super(id, document, extensionType);
        /* tslint:disable:no-unsafe-any */
        this.client = new MergeTree.Client("", document.options);
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

    public transaction(groupOp: MergeTree.IMergeTreeGroupMsg): MergeTree.SegmentGroup {
        const segmentGroup = this.client.localTransaction(groupOp);
        this.submitIfAttached(groupOp);
        return segmentGroup;
    }

    public annotateRange(props: MergeTree.PropertySet, start: number, end: number, op?: MergeTree.ICombiningOp) {
        const annotateMessage: MergeTree.IMergeTreeAnnotateMsg = {
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
        const segoff = this.client.mergeTree.getContainingSegment(pos,
            refSeq, this.client.getClientId());
        if (segoff && segoff.segment) {
            const lref = new MergeTree.LocalReference(segoff.segment, segoff.offset, refType);
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
    public getSharedIntervalCollection(label: string): SharedIntervalCollection<SharedStringInterval> {
        if (!this.intervalCollections.has(label)) {
            this.intervalCollections.set<SharedIntervalCollection<SharedStringInterval>>(
                label,
                undefined,
                SharedStringIntervalCollectionValueType.Name);
        }

        const sharedCollection =
            this.intervalCollections.get<SharedIntervalCollection<SharedStringInterval>>(label);
        return sharedCollection;
    }

    public sendNACKed() {
        const orderedSegments = [] as MergeTree.ISegment[];
        while (!this.client.mergeTree.pendingSegments.empty()) {
            const NACKedSegmentGroup = this.client.mergeTree.pendingSegments.dequeue();
            for (const segment of NACKedSegmentGroup.segments) {
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

        /* tslint:disable:no-object-literal-type-assertion */
        const segmentGroup = {
            segments: orderedSegments,
        } as MergeTree.SegmentGroup;
        const opList = [] as MergeTree.IMergeTreeOp[];
        let prevSeg: MergeTree.ISegment;
        for (const segment of orderedSegments) {
            if (prevSeg !== segment) {
                segment.segmentGroups.clear();
                segment.segmentGroups.enqueue(segmentGroup);
                this.client.segmentToOps(segment, opList);
                prevSeg = segment;
            }
        }
        const groupOp = {
            ops: opList,
            type: MergeTree.MergeTreeDeltaType.GROUP,
        } as MergeTree.IMergeTreeGroupMsg;

        if (groupOp.ops.length > 0) {
            this.client.mergeTree.pendingSegments.enqueue(segmentGroup);
            this.submitIfAttached(groupOp);
        }
    }

    protected transformContent(message: IObjectMessage, toSequenceNumber: number): IObjectMessage {
        if (message.contents) {
            this.client.transform(message as ISequencedObjectMessage, toSequenceNumber);
        }
        message.referenceSequenceNumber = toSequenceNumber;
        return message;
    }

    protected async loadContent(
        sequenceNumber: number,
        minimumSequenceNumber: number,
        messages: ISequencedObjectMessage[],
        headerOrigin: string,
        storage: IObjectStorageService): Promise<void> {

        const header = await storage.read("header");

        return this.initialize(sequenceNumber, minimumSequenceNumber, messages, header, true, headerOrigin, storage);
    }

    protected initializeContent() {
        const intervalCollections = this.runtime.createChannel(uuid(), MapExtension.Type) as IMap;
        this.set("intervalCollections", intervalCollections);
        // TODO will want to update initialize to operate synchronously
        this.initialize(0, 0, [], null, false, this.id, null)
            .catch((error) => {
                console.error("initializeContent", error);
            });
    }

    protected snapshotContent(): ITree {
        this.client.mergeTree.commitGlobalMin();
        const snap = new MergeTree.Snapshot(this.client.mergeTree);
        snap.extractSync();
        return snap.emit();
    }

    /* tslint:disable:promise-function-async */
    protected prepareContent(): Promise<void> {
        return this.loadedDeferred.promise;
    }

    protected processContent(message: ISequencedObjectMessage) {
        if (this.autoApply) {
            this.client.applyMsg(message);
            if (this.client.mergeTree.minSeqPending) {
                this.client.mergeTree.notifyMinSeqListeners();
            }
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
        this.client.startCollaboration(this.runtime.clientId, this.runtime.user, 0);
        this.collabStarted = true;
    }

    protected onConnectContent(pending: IObjectMessage[]) {
        // Update merge tree collaboration information with new client ID and then resend pending ops
        if (this.collabStarted) {
            this.client.updateCollaboration(this.runtime.clientId);
        }

        this.sendNACKed();

        return;
    }

    protected readyContent(): Promise<void> {
        return this.loaded;
    }

    protected submitIfAttached(message: any) {
        if (this.isLocal()) {
            return;
        }

        this.submitLocalMessage(message);
    }

    protected abstract appendSegment(segSpec: MergeTree.IJSONSegment);
    protected abstract segmentsFromSpecs(segSpecs: MergeTree.IJSONSegment[]): MergeTree.ISegment[];

    private loadHeader(
        sequenceNumber: number,
        minimumSequenceNumber: number,
        header: string,
        collaborative: boolean,
        originBranch: string,
        services: IObjectStorageService) {

        if (!header) {
            return;
        }

        const chunk = MergeTree.Snapshot.processChunk(header);
        const segs = this.segmentsFromSpecs(chunk.segmentTexts);
        this.client.mergeTree.reloadFromSegments(segs);
        if (collaborative) {
            // TODO currently only assumes two levels of branching
            const branchId = originBranch === this.runtime.id ? 0 : 1;
            this.collabStarted = true;
            this.client.startCollaboration(
                this.runtime.clientId, this.runtime.user, minimumSequenceNumber, branchId);
        }
    }

    private async loadBody(
        sequenceNumber: number,
        minimumSequenceNumber: number,
        header: string,
        messages: ISequencedObjectMessage[],
        collaborative: boolean,
        originBranch: string,
        services: IObjectStorageService) {

        // If loading from a snapshot load in the body
        if (header) {
            const chunk = await MergeTree.Snapshot.loadChunk(services, "body");
            for (const segSpec of chunk.segmentTexts) {
                this.appendSegment(segSpec);
            }
        }

        // Apply all pending messages
        for (const message of messages) {
            this.processContent(message);
        }

        // And initialize the interval collections
        await this.initializeIntervalCollections();
    }

    private async initialize(
        sequenceNumber: number,
        minimumSequenceNumber: number,
        messages: ISequencedObjectMessage[],
        header: string,
        collaborative: boolean,
        originBranch: string,
        services: IObjectStorageService) {

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
            services)
            .then(
                () => {
                    this.loadFinished();
                },
                (error) => {
                    this.loadFinished(error);
                });
    }

    private async initializeIntervalCollections() {
        const intervalCollections = await this.get("intervalCollections") as IMap;
        this.intervalCollections = await intervalCollections.getView();

        // Listen and initialize new SharedIntervalCollections
        intervalCollections.on("valueChanged", (ev: IValueChanged) => {
            const intervalCollection =
                this.intervalCollections.get<SharedIntervalCollection<SharedStringInterval>>(ev.key);
            if (!intervalCollection.attached) {
                intervalCollection.attach(this.client, ev.key);
            }
        });

        // Initialize existing SharedIntervalCollections
        for (const key of this.intervalCollections.keys()) {
            const intervalCollection =
                this.intervalCollections.get<SharedIntervalCollection<SharedStringInterval>>(key);
            intervalCollection.attach(this.client, key);
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

export interface IJSONRunSegment<T> extends MergeTree.IJSONSegment {
    items: T[];
}

const MaxRun = 128;

export class SubSequence<T> extends MergeTree.BaseSegment {
    constructor(public items: T[], seq?: number, clientId?: number) {
        super(seq, clientId);
        this.cachedLength = items.length;
    }

    public toJSONObject() {
        const obj = { items: this.items } as IJSONRunSegment<T>;
        super.addSerializedProps(obj);
        return obj;
    }

    public splitAt(pos: number) {
        if (pos > 0) {
            const remainingItems = this.items.slice(pos);
            this.items = this.items.slice(0, pos);
            this.cachedLength = this.items.length;
            const leafSegment = new SubSequence(remainingItems, this.seq, this.clientId);
            if (this.properties) {
                leafSegment.addProperties(MergeTree.extend(MergeTree.createMap<any>(), this.properties));
            }
            MergeTree.segmentCopy(this, leafSegment);
            if (this.localRefs) {
                this.splitLocalRefs(pos, leafSegment);
            }
            return leafSegment;
        }
    }

    public clone(start = 0, end?: number) {
        let clonedItems = this.items;
        if (end === undefined) {
            clonedItems = clonedItems.slice(start);
        } else {
            clonedItems = clonedItems.slice(start, end);
        }
        const b = new SubSequence(clonedItems, this.seq, this.clientId);
        this.cloneInto(b);
        return b;
    }

    public getType() {
        return MergeTree.SegmentType.Run;
    }

    public canAppend(segment: MergeTree.ISegment, mergeTree: MergeTree.MergeTree) {
        if (!this.removedSeq) {
            if (segment.getType() === MergeTree.SegmentType.Run) {
                if (this.matchProperties(segment as SubSequence<T>)) {
                    const branchId = mergeTree.getBranchId(this.clientId);
                    const segBranchId = mergeTree.getBranchId(segment.clientId);
                    if ((segBranchId === branchId) && (mergeTree.localNetLength(segment) > 0)) {
                        return ((this.cachedLength <= MaxRun) ||
                            (segment.cachedLength <= MaxRun));
                    }
                }
            }
        }
        return false;
    }

    public toString() {
        return this.items.toString();
    }

    public append(segment: MergeTree.ISegment) {
        if (segment.getType() === MergeTree.SegmentType.Run) {
            const rseg = segment as SubSequence<T>;
            if (segment.localRefs) {
                const adj = this.cachedLength;
                for (const localRef of segment.localRefs) {
                    localRef.offset += adj;
                    localRef.segment = this;
                }
            }
            this.items= this.items.concat(rseg.items);
            this.cachedLength = this.items.length;
                        return this;
        } else {
            throw new Error("can only append another run segment");
        }
    }

    // TODO: retain removed items for undo
    // returns true if entire run removed
    public removeRange(start: number, end: number) {
        let remnantItems = [] as T[];
        const len = this.items.length;
        if (start > 0) {
            remnantItems = remnantItems.concat(this.items.slice(0,start));
        }
        if (end < len) {
            remnantItems= remnantItems.concat(this.items.slice(end));
        }
        this.items = remnantItems;
        this.cachedLength = this.items.length;
        return (this.items.length === 0);
    }

}

function runToSeg<T>(segSpec: IJSONRunSegment<T>) {
    const seg = new SubSequence<T>(segSpec.items);
    if (segSpec.props) {
        seg.addProperties(segSpec.props);
    }
    return seg;
}

export class SharedSequence<T> extends SegmentSequence<SubSequence<T>> {
    constructor(
        document: IRuntime,
        public id: string,
        sequenceNumber: number,
        extensionType: string,
        services?: IDistributedObjectServices) {
        super(document, id, sequenceNumber, extensionType, services);
    }

    public appendSegment(segSpec: IJSONRunSegment<T>) {
        const mergeTree = this.client.mergeTree;
        const pos = mergeTree.root.cachedLength;
        mergeTree.insertSegment(pos, MergeTree.UniversalSequenceNumber,
            mergeTree.collabWindow.clientId, MergeTree.UniversalSequenceNumber,
            runToSeg(segSpec));
    }

    public segmentsFromSpecs(segSpecs: Array<IJSONRunSegment<T>>) {
        return segSpecs.map(runToSeg);
    }
}

export class SharedObjectSequence extends SharedSequence<object> {
    constructor(
        document: IRuntime,
        public id: string,
        sequenceNumber: number,
        services?: IDistributedObjectServices) {
        super(document, id, sequenceNumber, CollaborativeObjectSequenceExtension.Type, services);
    }
}

export class SharedNumberSequence extends SharedSequence<number> {
    constructor(
        document: IRuntime,
        public id: string,
        sequenceNumber: number,
        services?: IDistributedObjectServices) {
        super(document, id, sequenceNumber, CollaborativeNumberSequenceExtension.Type, services);
    }
}

export class SharedString extends SegmentSequence<SharedStringSegment> {
    constructor(
        document: IRuntime,
        public id: string,
        sequenceNumber: number,
        services?: IDistributedObjectServices) {

        super(document, id, sequenceNumber, CollaborativeStringExtension.Type, services);
    }

    public appendSegment(segSpec: SharedStringJSONSegment) {
        const mergeTree = this.client.mergeTree;
        const pos = mergeTree.root.cachedLength;

        if (segSpec.text) {
            mergeTree.insertText(pos, MergeTree.UniversalSequenceNumber,
                mergeTree.collabWindow.clientId, MergeTree.UniversalSequenceNumber, segSpec.text,
                segSpec.props as MergeTree.PropertySet);
        } else {
            // assume marker for now
            mergeTree.insertMarker(pos, MergeTree.UniversalSequenceNumber, mergeTree.collabWindow.clientId,
                MergeTree.UniversalSequenceNumber, segSpec.marker.refType, segSpec.props as MergeTree.PropertySet);
        }

    }

    public segmentsFromSpecs(segSpecs: SharedStringJSONSegment[]) {
        return textsToSegments(segSpecs);
    }

    public insertMarkerRelative(relativePos1: MergeTree.IRelativePosition, refType, props?: MergeTree.PropertySet) {
        const insertMessage: MergeTree.IMergeTreeInsertMsg = {
            marker: { refType },
            props,
            relativePos1,
            type: MergeTree.MergeTreeDeltaType.INSERT,
        };

        const pos = this.client.mergeTree.posFromRelativePos(relativePos1);
        this.client.insertMarkerLocal(pos, refType, props);
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

    public getText(start?: number, end?: number): string {
        return this.client.getText(start, end);
    }

    public paste(register: string, pos: number) {
        const insertMessage: MergeTree.IMergeTreeInsertMsg = {
            pos1: pos,
            register,
            type: MergeTree.MergeTreeDeltaType.INSERT,
        };

        // tslint:disable-next-line:no-parameter-reassignment
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

    public insertTextRelative(relativePos1: MergeTree.IRelativePosition, text: string, props?: MergeTree.PropertySet) {
        const insertMessage: MergeTree.IMergeTreeInsertMsg = {
            props,
            relativePos1,
            text,
            type: MergeTree.MergeTreeDeltaType.INSERT,
        };

        const pos = this.client.mergeTree.posFromRelativePos(relativePos1);
        this.client.insertTextLocal(text, pos, props);
        this.submitIfAttached(insertMessage);
    }

    public insertText(text: string, pos: number, props?: MergeTree.PropertySet) {
        const insertMessage: MergeTree.IMergeTreeInsertMsg = {
            pos1: pos,
            props,
            text,
            type: MergeTree.MergeTreeDeltaType.INSERT,
        };

        this.client.insertTextLocal(text, pos, props);
        this.submitIfAttached(insertMessage);
    }

    public replaceText(text: string, start: number, end: number, props?: MergeTree.PropertySet) {
        const insertMessage: MergeTree.IMergeTreeInsertMsg = {
            pos1: start,
            pos2: end,
            props,
            text,
            type: MergeTree.MergeTreeDeltaType.INSERT,
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
        const start = this.client.mergeTree.getOffset(nestStart,
            MergeTree.UniversalSequenceNumber, this.client.getClientId());
        const end = nestEnd.cachedLength + this.client.mergeTree.getOffset(nestEnd,
            MergeTree.UniversalSequenceNumber, this.client.getClientId());
        console.log(`removing nest ${nestStart.getId()} from [${start},${end})`);
        const removeMessage: MergeTree.IMergeTreeRemoveMsg = {
            checkNest: { id1: nestStart.getId(), id2: nestEnd.getId() },
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

        const ranges = this.client.mergeTree.tardisRange(start, end, fromSeq, this.client.getCurrentSeq(),
            this.client.getClientId());
        ranges.map((range: MergeTree.IIntegerRange) => {
            this.annotateRange(props, range.start, range.end);
        });
    }

    public transaction(groupOp: MergeTree.IMergeTreeGroupMsg): MergeTree.SegmentGroup {
        const segmentGroup = this.client.localTransaction(groupOp);
        this.submitIfAttached(groupOp);
        return segmentGroup;
    }

    public annotateMarkerNotifyConsensus(marker: MergeTree.Marker, props: MergeTree.PropertySet,
        callback: (m: MergeTree.Marker) => void) {
        const id = marker.getId();
        const annotateMessage: MergeTree.IMergeTreeAnnotateMsg = {
            combiningOp: { name: "consensus" },
            props,
            relativePos1: { id, before: true },
            relativePos2: { id },
            type: MergeTree.MergeTreeDeltaType.ANNOTATE,
        };
        this.client.annotateMarkerNotifyConsensus(marker, props, callback);
        this.submitIfAttached(annotateMessage);
    }

    public annotateMarker(props: MergeTree.PropertySet, marker: MergeTree.Marker, op?: MergeTree.ICombiningOp) {
        const id = marker.getId();
        const annotateMessage: MergeTree.IMergeTreeAnnotateMsg = {
            props,
            relativePos1: { id, before: true },
            relativePos2: { id },
            type: MergeTree.MergeTreeDeltaType.ANNOTATE,
        };

        if (op) {
            annotateMessage.combiningOp = op;
        }
        this.client.annotateMarker(props, marker, op);
        this.submitIfAttached(annotateMessage);
    }

    public annotateRange(props: MergeTree.PropertySet, start: number, end: number, op?: MergeTree.ICombiningOp) {
        const annotateMessage: MergeTree.IMergeTreeAnnotateMsg = {
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
        const segoff = this.client.mergeTree.getContainingSegment(pos,
            refSeq, this.client.getClientId());
        if (segoff && segoff.segment) {
            const baseSegment = segoff.segment as MergeTree.BaseSegment;
            const lref = new MergeTree.LocalReference(baseSegment, segoff.offset, refType);
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
    public getSharedIntervalCollection(label: string): SharedIntervalCollection<SharedStringInterval> {
        if (!this.intervalCollections.has(label)) {
            this.intervalCollections.set<SharedIntervalCollection<SharedStringInterval>>(
                label,
                undefined,
                SharedStringIntervalCollectionValueType.Name);
        }

        const sharedCollection =
            this.intervalCollections.get<SharedIntervalCollection<SharedStringInterval>>(label);
        return sharedCollection;
    }

    public sendNACKed() {
        const orderedSegments = [] as MergeTree.ISegment[];
        while (!this.client.mergeTree.pendingSegments.empty()) {
            const NACKedSegmentGroup = this.client.mergeTree.pendingSegments.dequeue();
            for (const segment of NACKedSegmentGroup.segments) {
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

        /* tslint:disable:no-object-literal-type-assertion */
        const segmentGroup = {
            segments: orderedSegments,
        } as MergeTree.SegmentGroup;
        const opList = [] as MergeTree.IMergeTreeOp[];
        let prevSeg: MergeTree.ISegment;
        for (const segment of orderedSegments) {
            if (prevSeg !== segment) {
                segment.segmentGroups.clear();
                segment.segmentGroups.enqueue(segmentGroup);
                this.client.segmentToOps(segment, opList);
                prevSeg = segment;
            }
        }
        const groupOp = {
            ops: opList,
            type: MergeTree.MergeTreeDeltaType.GROUP,
        } as MergeTree.IMergeTreeGroupMsg;

        if (groupOp.ops.length > 0) {
            this.client.mergeTree.pendingSegments.enqueue(segmentGroup);
            this.submitIfAttached(groupOp);
        }
    }

    public findTile(startPos: number, tileLabel: string, preceding = true) {
        return this.client.findTile(startPos, tileLabel, preceding);
    }

}
