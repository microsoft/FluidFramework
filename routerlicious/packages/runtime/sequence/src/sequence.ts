// tslint:disable:whitespace align no-bitwise
import {
    ISequencedDocumentMessage,
    ITree,
} from "@prague/container-definitions";
import {
    IMapView,
    ISharedMap,
    IValueChanged,
    MapExtension,
    SharedMap,
} from "@prague/map";
import * as MergeTree from "@prague/merge-tree";
import {
    IDistributedObjectServices,
    IObjectStorageService,
    IRuntime,
} from "@prague/runtime-definitions";
import { Deferred } from "@prague/utils";
import * as assert from "assert";
// tslint:disable-next-line:no-submodule-imports
import * as uuid from "uuid/v4";
import {
    SharedNumberSequenceExtension,
    SharedObjectSequenceExtension,
} from "./extension";
import {
    SharedIntervalCollection,
    SharedStringInterval,
    SharedStringIntervalCollectionValueType,
} from "./intervalCollection";
import { SequenceDeltaEvent } from "./sequenceDeltaEvent";

export abstract class SegmentSequence<T extends MergeTree.ISegment> extends SharedMap {
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
        extensionType: string,
        services?: IDistributedObjectServices) {

        super(id, document, extensionType);
        /* tslint:disable:no-unsafe-any */
        this.client = new MergeTree.Client("", document.options);

        super.on("newListener", (event) => {
            switch (event) {
                case "sequenceDelta":
                    if (!this.client.mergeTree.mergeTreeDeltaCallback) {
                        this.client.mergeTree.mergeTreeDeltaCallback = (opArgs, deltaArgs) => {
                            this.emit("sequenceDelta", this, new SequenceDeltaEvent(opArgs, this.client, deltaArgs));
                        };
                    }
                    break;
                default:
            }
        });
        super.on("removeListener", (event) => {
            switch (event) {
                case "sequenceDelta":
                    if (super.listenerCount(event) === 0) {
                        this.client.mergeTree.mergeTreeDeltaCallback = undefined;
                    }
                    break;
                default:
            }
        });
    }

    public on(event: "sequenceDelta", listener: (sender: this, event: SequenceDeltaEvent) => void): this;
    public on(event: "pre-op" | "op", listener: (op: ISequencedDocumentMessage, local: boolean) => void): this;
    public on(
        event: "valueChanged",
        listener: (changed: IValueChanged, local: boolean, op: ISequencedDocumentMessage) => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this;
    // tslint:disable-next-line:no-unnecessary-override
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    public removeRange(start: number, end: number) {
        const removeMessage: MergeTree.IMergeTreeRemoveMsg = {
            pos1: start,
            pos2: end,
            type: MergeTree.MergeTreeDeltaType.REMOVE,
        };

        this.client.removeSegmentLocal(start, end, {op: removeMessage});
        this.submitIfAttached(removeMessage);
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
        this.client.removeSegmentLocal(start, end, {op: removeMessage});
        this.submitIfAttached(removeMessage);
    }

    public paste(register: string, pos: number) {
        const insertMessage: MergeTree.IMergeTreeInsertMsg = {
            pos1: pos,
            register,
            type: MergeTree.MergeTreeDeltaType.INSERT,
        };

        // tslint:disable-next-line:no-parameter-reassignment
        pos = this.client.pasteLocal(register, pos, {op: insertMessage});
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

    public groupOperation(groupOp: MergeTree.IMergeTreeGroupMsg): MergeTree.SegmentGroup {
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
        this.client.annotateSegmentLocal(props, start, end, op, {op: annotateMessage});
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
            segments: [],
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

    protected transformContent(
        message: any,
        fromSequenceNumber: number,
        toSequenceNumber: number,
    ): any {
        return this.client.transform(message, fromSequenceNumber, toSequenceNumber);
    }

    protected async loadContent(
        minimumSequenceNumber: number,
        messages: ISequencedDocumentMessage[],
        headerOrigin: string,
        storage: IObjectStorageService): Promise<void> {

        const header = await storage.read("header");

        return this.initialize(minimumSequenceNumber, messages, header, true, headerOrigin, storage);
    }

    protected initializeContent() {
        const intervalCollections = this.runtime.createChannel(uuid(), MapExtension.Type) as ISharedMap;
        this.set("intervalCollections", intervalCollections);
        // TODO will want to update initialize to operate synchronously
        this.initialize(0, [], null, false, this.id, null)
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

    protected processContent(message: ISequencedDocumentMessage) {
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
        this.client.startCollaboration(this.runtime.clientId, 0);
        this.collabStarted = true;
    }

    protected onConnectContent(pending: any[]) {
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
        minimumSequenceNumber: number,
        header: string,
        shared: boolean,
        originBranch: string,
        services: IObjectStorageService) {

        if (!header) {
            return;
        }

        const chunk = MergeTree.Snapshot.processChunk(header);
        const segs = this.segmentsFromSpecs(chunk.segmentTexts);
        this.client.mergeTree.reloadFromSegments(segs);
        if (shared) {
            // TODO currently only assumes two levels of branching
            const branchId = originBranch === this.runtime.id ? 0 : 1;
            this.collabStarted = true;
            this.client.startCollaboration(
                this.runtime.clientId, minimumSequenceNumber, branchId);
        }
    }

    private async loadBody(
        minimumSequenceNumber: number,
        header: string,
        messages: ISequencedDocumentMessage[],
        shared: boolean,
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
        minimumSequenceNumber: number,
        messages: ISequencedDocumentMessage[],
        header: string,
        shared: boolean,
        originBranch: string,
        services: IObjectStorageService) {

        if (!header) {
            assert.equal(minimumSequenceNumber, MergeTree.Snapshot.EmptyChunk.chunkSequenceNumber);
        }

        this.loadHeader(minimumSequenceNumber, header, shared, originBranch, services);

        this.loadBody(
            minimumSequenceNumber,
            header,
            messages,
            shared,
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
        const intervalCollections = await this.get("intervalCollections") as ISharedMap;
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

export class SharedSequence<T extends MergeTree.SequenceItem> extends SegmentSequence<MergeTree.SubSequence<T>> {
    public isNumeric;

    constructor(
        document: IRuntime,
        public id: string,
        extensionType: string,
        services?: IDistributedObjectServices) {
        super(document, id, extensionType, services);
        if (extensionType === SharedNumberSequenceExtension.Type) {
            this.isNumeric = true;
        }
    }

    public appendSegment(segSpec: MergeTree.IJSONRunSegment<T>) {
        const mergeTree = this.client.mergeTree;
        const pos = mergeTree.root.cachedLength;
        mergeTree.insertSegment(pos, MergeTree.UniversalSequenceNumber,
            mergeTree.collabWindow.clientId, MergeTree.UniversalSequenceNumber,
            MergeTree.runToSeg(segSpec), undefined);
    }

    public insert(pos: number, items: T[], props?: MergeTree.PropertySet) {
        const insertMessage: MergeTree.IMergeTreeInsertMsg = {
            items,
            pos1: pos,
            props,
            type: MergeTree.MergeTreeDeltaType.INSERT,
        };
        if (this.isNumeric) {
            insertMessage.isNumberSequence = true;
        }
        const segment = new MergeTree.SubSequence<T>(items);
        this.client.insertSegmentLocal(pos, segment, props, {op: insertMessage});
        this.submitIfAttached(insertMessage);
    }

    public remove(start: number, end: number) {
        this.removeRange(start, end);
    }

    public getItemCount() {
        return this.client.mergeTree.getLength(this.client.getCurrentSeq(), this.client.getClientId());
    }

    // tslint:disable: no-parameter-reassignment
    public getItems<U>(start: number, end?: number) {
        if (end === undefined) {
            end = this.getItemCount();
        }
        return this.client.mergeTree.getItems<U>(this.client.getCurrentSeq(), this.client.getClientId(),
            start, end);
    }

    public segmentsFromSpecs(segSpecs: Array<MergeTree.IJSONRunSegment<T>>) {
        return segSpecs.map(MergeTree.runToSeg);
    }
}

export class SharedObjectSequence<T extends MergeTree.SequenceItem> extends SharedSequence<T> {
    constructor(
        document: IRuntime,
        public id: string,
        services?: IDistributedObjectServices) {
        super(document, id, SharedObjectSequenceExtension.Type, services);
    }

    public getRange(start: number, end?: number) {
        return this.getItems<T>(start,end);
    }

}

export class SharedNumberSequence extends SharedSequence<number> {
    constructor(
        document: IRuntime,
        public id: string,
        services?: IDistributedObjectServices) {
        super(document, id, SharedNumberSequenceExtension.Type, services);
    }

    public getRange(start: number, end?: number) {
        return this.getItems<number>(start, end);
    }
}
