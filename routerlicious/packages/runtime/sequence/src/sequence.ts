// tslint:disable:whitespace align no-bitwise
import {
    FileMode,
    ISequencedDocumentMessage,
    ITree,
    TreeEntry,
} from "@prague/container-definitions";
import {
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
// tslint:disable-next-line:no-submodule-imports no-var-requires no-require-imports
const cloneDeep = require("lodash/cloneDeep") as <T>(value: T) => T;
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
    public intervalCollections: ISharedMap;
    protected isLoaded = false;
    protected collabStarted = false;
    protected pendingMinSequenceNumber: number = 0;
    // Deferred that triggers once the object is loaded
    protected loadedDeferred = new Deferred<void>();
    private messagesSinceMSNChange = new Array<ISequencedDocumentMessage>();

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

    public getPropertiesAtPosition(pos: number) {
        return this.client.getPropertiesAtPosition(pos);
    }

    public getRangeExtentsOfPosition(pos: number) {
        return this.client.getRangeExtentsOfPosition(pos);
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

    public getIntervalCollections(): ISharedMap {
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

    protected async loadContent(
        minimumSequenceNumber: number,
        headerOrigin: string,
        storage: IObjectStorageService): Promise<void> {

        const header = await storage.read("header");
        assert(header);

        this.initialize(minimumSequenceNumber, header, true, headerOrigin, storage)
            .then(
                () => {
                    this.loadFinished();
                },
                (error) => {
                    this.loadFinished(error);
                });
    }

    protected initializeContent() {
        const intervalCollections = this.runtime.createChannel(uuid(), MapExtension.Type) as ISharedMap;
        this.set("intervalCollections", intervalCollections);
        assert(MergeTree.Snapshot.EmptyChunk.chunkSequenceNumber === 0);
        this.loadFinished();
    }

    protected snapshotContent(): ITree {
        // debug(`Transforming up to ${this.deltaManager.minimumSequenceNumber}`);
        const transformedMessages: ISequencedDocumentMessage[] = [];
        for (const message of this.messagesSinceMSNChange) {
            transformedMessages.push(this.transform(
                message,
                this.runtime.deltaManager.minimumSequenceNumber));
        }

        this.client.mergeTree.commitGlobalMin();
        const snap = new MergeTree.Snapshot(this.client.mergeTree);
        snap.extractSync();
        const mtSnap = snap.emit();

        mtSnap.entries.push({
            mode: FileMode.File,
            path: "tardis",
            type: TreeEntry[TreeEntry.Blob],
            value: {
                contents: JSON.stringify(transformedMessages),
                encoding: "utf-8",
            },
        });

        return mtSnap;
    }

    /* tslint:disable:promise-function-async */
    protected prepareContent(): Promise<void> {
        return this.loadedDeferred.promise;
    }

    protected processContent(message: ISequencedDocumentMessage) {
        this.messagesSinceMSNChange.push(message);
        this.processMessage(message);
    }

    protected processMinSequenceNumberChangedContent(value: number) {
        let index = 0;
        for (; index < this.messagesSinceMSNChange.length; index++) {
            if (this.messagesSinceMSNChange[index].sequenceNumber > value) {
                break;
            }
        }
        if (index !== 0) {
            this.messagesSinceMSNChange = this.messagesSinceMSNChange.slice(index);
        }

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

    private processMessage(message: ISequencedDocumentMessage) {
        this.client.applyMsg(message);
        if (this.client.mergeTree.minSeqPending) {
            this.client.mergeTree.notifyMinSeqListeners();
        }
    }

    private transform(originalMessage: ISequencedDocumentMessage, sequenceNumber: number): ISequencedDocumentMessage {
        let message = originalMessage;

        // Allow the distributed data types to perform custom transformations
        if (message.referenceSequenceNumber < sequenceNumber) {
            // Make a copy of original message since we will be modifying in place
            message = cloneDeep(message);
            message.contents = this.client.transform(
                message.contents, message.referenceSequenceNumber, sequenceNumber);
            message.referenceSequenceNumber = sequenceNumber;
        }

        return message;
    }

    private loadHeader(
        minimumSequenceNumber: number,
        header: string,
        shared: boolean,
        originBranch: string): MergeTree.MergeTreeChunk {

        const chunk = MergeTree.Snapshot.processChunk(header);
        const segs = this.segmentsFromSpecs(chunk.segmentTexts);
        this.client.mergeTree.reloadFromSegments(segs);
        if (shared) {
            // TODO currently only assumes two levels of branching
            const branchId = originBranch === this.runtime.documentId ? 0 : 1;
            this.collabStarted = true;
            this.client.startCollaboration(
                this.runtime.clientId, minimumSequenceNumber, branchId);
        }
        return chunk;
    }

    // If loading from a snapshot load tardis messages
    private async loadTardis(
        rawMessages: Promise<string>,
        originBranch: string,
    ): Promise<void> {
        const messages = JSON.parse(Buffer.from(await rawMessages, "base64").toString()) as ISequencedDocumentMessage[];
        if (originBranch !== this.runtime.documentId) {
            for (const message of messages) {
                // Append branch information when transforming for the case of messages stashed with the snapshot
                message.origin = {
                    id: originBranch,
                    minimumSequenceNumber: message.minimumSequenceNumber,
                    sequenceNumber: message.sequenceNumber,
                };
            }
        }

        // Apply all pending messages
        for (const message of messages) {
            this.processMessage(message);
        }
    }

    private async initialize(
        minimumSequenceNumber: number,
        header: string,
        shared: boolean,
        originBranch: string,
        services: IObjectStorageService): Promise<void> {

        // If loading from a snapshot load tardis messages
        // kick off loading in parallel to loading "body" chunk.
        const rawMessages = services.read("tardis");

        const chunk1 = this.loadHeader(minimumSequenceNumber, header, shared, originBranch);
        await this.loadBody(chunk1, services);
        return this.loadTardis(rawMessages, originBranch);
    }

    private async loadBody(chunk1: MergeTree.MergeTreeChunk, services: IObjectStorageService): Promise<void> {
        assert(chunk1.chunkLengthChars <= chunk1.totalLengthChars);
        assert(chunk1.chunkSegmentCount <= chunk1.totalSegmentCount);
        if (chunk1.chunkSegmentCount === chunk1.totalSegmentCount) {
            return;
        }

        const chunk2 = await MergeTree.Snapshot.loadChunk(services, "body");
        for (const segSpec of chunk2.segmentTexts) {
            this.appendSegment(segSpec);
        }
    }

    private initializeIntervalCollections() {
        this.intervalCollections = this.get("intervalCollections") as ISharedMap;

        // when testing and using mock runtime, intervalCollections would be null.
        if (this.intervalCollections) {
            // Listen and initialize new SharedIntervalCollections
            this.intervalCollections.on("valueChanged", (ev: IValueChanged) => {
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
    }

    private loadFinished(error?: any) {
        // initialize the interval collections
        this.initializeIntervalCollections();

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

    public getItems(start: number, end?: number) {
        if (end === undefined) {
            // tslint:disable-next-line:no-parameter-reassignment
            end = this.getItemCount();
        }
        return this.client.mergeTree.getItems<T>(this.client.getCurrentSeq(), this.client.getClientId(),
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
        return this.getItems(start, end);
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
        return this.getItems(start, end);
    }
}
