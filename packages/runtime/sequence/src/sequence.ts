/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IValueChanged,
    IValueType,
    SharedMap,
} from "@prague/map";
import * as MergeTree from "@prague/merge-tree";
import {
    FileMode,
    ISequencedDocumentMessage,
    ITree,
    TreeEntry,
} from "@prague/protocol-definitions";
import {
    IComponentRuntime,
    IObjectStorageService,
} from "@prague/runtime-definitions";
import { ChildLogger, Deferred } from "@prague/utils";
import * as assert from "assert";
// tslint:disable-next-line:no-submodule-imports no-var-requires no-require-imports
const cloneDeep = require("lodash/cloneDeep") as <T>(value: T) => T;
import {
    ISerializableInterval,
    SharedIntervalCollection,
    SharedIntervalCollectionValueType,
    SharedStringInterval,
    SharedStringIntervalCollectionValueType,
} from "./intervalCollection";
import { SequenceDeltaEvent } from "./sequenceDeltaEvent";

const valueTypes: Array<IValueType<any>> = [
    new SharedStringIntervalCollectionValueType(),
    new SharedIntervalCollectionValueType(),
];

const intervalCollectionMapPath = "intervalCollections/";

function getIntervalCollectionPath(label: string): string {
    return `${intervalCollectionMapPath}${label}`;
}

export abstract class SharedSegmentSequence<T extends MergeTree.ISegment> extends SharedMap {
    get loaded(): Promise<void> {
        return this.loadedDeferred.promise;
    }

    public client: MergeTree.Client;
    protected isLoaded = false;
    protected collabStarted = false;
    protected pendingMinSequenceNumber: number = 0;
    // Deferred that triggers once the object is loaded
    protected loadedDeferred = new Deferred<void>();
    private messagesSinceMSNChange = new Array<ISequencedDocumentMessage>();

    constructor(
        document: IComponentRuntime,
        public id: string,
        extensionType: string,
    ) {
        super(id, document, extensionType);

        for (const valueType of valueTypes) {
            this.registerValueType(valueType);
        }

        /* tslint:disable:no-unsafe-any */
        this.client = new MergeTree.Client(
            this.segmentFromSpec.bind(this),
            ChildLogger.create(this.logger, "SharedSegmentSequence.MergeTreeClient"),
            document.options);

        super.on("newListener", (event) => {
            switch (event) {
                case "sequenceDelta":
                    if (!this.client.mergeTree.mergeTreeDeltaCallback) {
                        this.client.mergeTree.mergeTreeDeltaCallback = (opArgs, deltaArgs) => {
                            this.emit("sequenceDelta", new SequenceDeltaEvent(opArgs, deltaArgs, this.client), this);
                        };
                    }
                    break;
                default:
            }
        });
        super.on("removeListener", (event: string | symbol) => {
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

    /**
     * Registers a listener on the specified events
     */
    public on(event: "sequenceDelta", listener: (event: SequenceDeltaEvent, target: this) => void): this;
    public on(
        event: "pre-op" | "op",
        listener: (op: ISequencedDocumentMessage, local: boolean, target: this) => void): this;
    public on(event: "valueChanged", listener: (changed: IValueChanged,
                                                local: boolean,
                                                op: ISequencedDocumentMessage,
                                                target: this) => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this;
    // tslint:disable-next-line:no-unnecessary-override
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    /**
     * @param start - The inclusive start of the range to remove
     * @param end - The exclusive end of the range to remove
     */
    public removeRange(start: number, end: number) {
        const removeOp = this.client.removeRangeLocal(start, end);
        if (removeOp) {
            this.submitSequenceMessage(removeOp);
        }
        return removeOp;
    }

    /**
     * Removes the range and puts the content of the removed range in a register
     *
     * @param start - The inclusive start of the range to remove
     * @param end - The exclusive end of the range to remove
     * @param register - The name of the register to store the removed range in
     */
    public cut(start: number, end: number, register: string) {
        const removeOp = this.client.removeRangeLocal(start, end, register);
        if (removeOp) {
            this.submitSequenceMessage(removeOp);
        }
    }

    /**
     * Inserts the content of the register.
     *
     * @param pos - The postition to insert the content at.
     * @param register - The name of the register to get the content from
     */
    public paste(pos: number, register: string) {
        const insertOp = this.client.pasteLocal(pos, register);
        if (insertOp) {
            this.submitSequenceMessage(insertOp);
        }
        return pos;
    }

    /**
     * Puts the content of the range in a register
     *
     * @param start - The inclusive start of the range
     * @param end - The exclusive end of the range
     * @param register - The name of the register to store the range in
     */
    public copy(start: number, end: number, register: string) {

        const insertOp = this.client.copyLocal(start, end, register);
        if (insertOp) {
            this.submitSequenceMessage(insertOp);
        }
    }

    public groupOperation(groupOp: MergeTree.IMergeTreeGroupMsg) {
        this.client.localTransaction(groupOp);
        this.submitSequenceMessage(groupOp);

    }

    public getContainingSegment(pos: number) {
        return this.client.getContainingSegment(pos);
    }

    /**
     * Returns the length of the current sequence for the client
     */
    public getLength() {
        return this.client.getLength();
    }

    /**
     * Annotates the range with the provided properties
     *
     * @param start - The inclusive start postition of the range to annotate
     * @param end - The exclusive end position of the range to annotate
     * @param props - The properties to annotate the range with
     * @param combiningOp - Optional. Specifies how to combine values for the property, such as "incr" for increment.
     *
     */
    public annotateRange(
        start: number,
        end: number,
        props: MergeTree.PropertySet,
        combiningOp?: MergeTree.ICombiningOp) {

        const annotateOp =
            this.client.annotateRangeLocal(start, end, props, combiningOp);
        if (annotateOp) {
            this.submitSequenceMessage(annotateOp);
        }
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

    public createPositionReference(
        pos: number,
        refType: MergeTree.ReferenceType): MergeTree.LocalReference {
        const segoff = this.getContainingSegment(pos);
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
            return localRef.offset + this.client.mergeTree.getPosition(localRef.segment,
                this.client.getCurrentSeq(), this.client.getClientId());
        } else {
            return -1;
        }
    }

    /**
     * Resolves a remote client's position against the local sequence
     * and returns the remote client's position relative to the local
     * sequence
     * @param remoteClientPosition - The remote client's position to resolve
     * @param remoteClientRefSeq - The reference sequence number of the remote client
     * @param remoteClientId - The client id of the remote client
     */
    public resolveRemoteClientPosition(
        remoteClientPosition: number,
        remoteClientRefSeq: number,
        remoteClientId: string): number {

        const shortRemoteClientId = this.client.getOrAddShortClientId(remoteClientId);

        const segmentInfo = this.client.mergeTree.getContainingSegment(
            remoteClientPosition,
            remoteClientRefSeq,
            shortRemoteClientId);

        if (segmentInfo && segmentInfo.segment) {

            const segmentPosition = this.client.mergeTree.getPosition(
                segmentInfo.segment,
                this.client.getCurrentSeq(),
                this.client.getClientId());

            return segmentPosition + segmentInfo.offset;
        } else {
            if (remoteClientPosition === this.client.mergeTree.getLength(remoteClientRefSeq, shortRemoteClientId)) {
                return this.client.getLength();
            }
        }
    }

    public async waitSharedIntervalCollection<TInterval extends ISerializableInterval>(
        label: string,
    ): Promise<SharedIntervalCollection<TInterval>> {
        const translatedLabel = getIntervalCollectionPath(label);
        return this.wait<SharedIntervalCollection<TInterval>>(translatedLabel);
    }

    // TODO: fix race condition on creation by putting type on every operation
    public getSharedIntervalCollection(label: string): SharedIntervalCollection<SharedStringInterval> {
        return this.getSharedIntervalCollectionInternal<SharedStringInterval>(
            label,
            SharedStringIntervalCollectionValueType.Name);
    }

    // TODO: fix race condition on creation by putting type on every operation
    public getGenericSharedIntervalCollection<TInterval extends ISerializableInterval>(
        label: string,
    ): SharedIntervalCollection<TInterval> {
        return this.getSharedIntervalCollectionInternal<TInterval>(
            label,
            SharedIntervalCollectionValueType.Name);
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

        const opList: MergeTree.IMergeTreeOp[] = [];
        let prevSeg: MergeTree.ISegment;
        for (const segment of orderedSegments) {
            if (prevSeg !== segment) {
                const op = this.client.resetPendingSegmentToOp(segment);
                if (op) {
                    opList.push(op);
                }
                prevSeg = segment;
            }
        }

        if (opList.length > 0) {
            const groupOp: MergeTree.IMergeTreeGroupMsg = {
                ops: opList,
                type: MergeTree.MergeTreeDeltaType.GROUP,
            };
            this.submitSequenceMessage(groupOp);
        }
    }

    public abstract segmentFromSpec(segSpecs: any): MergeTree.ISegment;

    public submitSequenceMessage(message: MergeTree.IMergeTreeOp) {
        this.submitLocalMessage(message);
    }

    protected replaceRange(start: number, end: number, segment: MergeTree.ISegment) {
        // insert first, so local references can slide to the inserted seg
        // if any

        const insert = this.client.insertSegmentLocal(end, segment);
        if (insert) {
            const remove = this.client.removeRangeLocal(start, end);
            this.submitSequenceMessage(MergeTree.createGroupOp(insert, remove));
        }
    }

    protected async loadContent(
        minimumSequenceNumber: number,
        headerOrigin: string,
        storage: IObjectStorageService): Promise<void> {

        const header = await storage.read("header");
        assert(header);

        try {
            await this.initialize(minimumSequenceNumber, header, true, headerOrigin, storage);
            this.loadFinished();
        } catch (error) {
            this.loadFinished(error);
        }
    }

    protected initializeLocalCore() {
        assert(MergeTree.Snapshot.EmptyChunk.chunkSequenceNumber === 0);
        this.loadFinished();
    }

    protected snapshotContent(): ITree {
        // Catch up to latest MSN, if we have not had a chance to do it.
        // Required for case where ComponentRuntime.attachChannel() generates snapshot right after loading component.
        // Note that we mock runtime in tests and mock does not have deltamanager implementation.
        if (this.runtime.deltaManager) {
            this.processMinSequenceNumberChanged(this.runtime.deltaManager.minimumSequenceNumber);
        }

        // debug(`Transforming up to ${this.deltaManager.minimumSequenceNumber}`);
        const transformedMessages: ISequencedDocumentMessage[] = [];
        for (const message of this.messagesSinceMSNChange) {
            transformedMessages.push(this.transform(
                message,
                this.runtime.deltaManager.minimumSequenceNumber));
        }

        this.client.mergeTree.commitGlobalMin();
        const snap = new MergeTree.Snapshot(this.client.mergeTree, this.logger);
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

    protected registerContent() {
        this.client.startCollaboration(this.runtime.clientId, 0);
        this.collabStarted = true;
    }

    // Need some comment on why we are not using 'pending' content
    protected onConnectContent(pending: any[]) {
        // Update merge tree collaboration information with new client ID and then resend pending ops
        if (this.collabStarted) {
            this.client.updateCollaboration(this.runtime.clientId);
        }

        this.sendNACKed();

        return;
    }

    protected segmentsFromSpecs(segSpecs: MergeTree.IJSONSegment[]): MergeTree.ISegment[] {
        const segToSpec = this.segmentFromSpec.bind(this);
        return segSpecs.map((spec) => {
            const seg = segToSpec(spec);
            if (seg.seq === undefined) {
                this.logger.sendErrorEvent({eventName: "SegmentHasUndefinedSeq"});
                seg.seq = MergeTree.UniversalSequenceNumber;
            }
            return seg;
        });
    }

    protected didAttach() {
        this.runtime.addListener("minSequenceNumberChanged", (msn: number) => {
            this.processMinSequenceNumberChanged(msn);
        });

        super.didAttach();
    }

    private getSharedIntervalCollectionInternal<TInterval extends ISerializableInterval>(
        label: string,
        type: string,
    ): SharedIntervalCollection<TInterval> {
        const translatedLabel = getIntervalCollectionPath(label);

        if (!this.has(translatedLabel)) {
            this.set(
                translatedLabel,
                undefined,
                type);
        }

        const sharedCollection = this.get<SharedIntervalCollection<TInterval>>(translatedLabel);
        return sharedCollection;
    }

    private processMinSequenceNumberChanged(value: number) {
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
                message.contents as MergeTree.IMergeTreeOp,
                this.client.getShortClientId(message.clientId),
                message.referenceSequenceNumber,
                sequenceNumber);
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

            // Do not use minimumSequenceNumber - it's from the "future" in case compoennt is delay loaded.
            // We need the one used when snapshot was created! That's chunk.chunkSequenceNumber
            this.client.startCollaboration(
                this.runtime.clientId, chunk.chunkSequenceNumber, branchId);
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
            this.processContent(message);
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
        this.logger.shipAssert(
            chunk1.chunkLengthChars <= chunk1.totalLengthChars,
            { eventName: "Mismatch in totalLengthChars" });

        this.logger.shipAssert(
            chunk1.chunkSegmentCount <= chunk1.totalSegmentCount,
            { eventName: "Mismatch in totalSegmentCount" });

        if (chunk1.chunkSegmentCount === chunk1.totalSegmentCount) {
            return;
        }

        const chunk2 = await MergeTree.Snapshot.loadChunk(services, "body");

        this.logger.shipAssert(
            chunk1.chunkLengthChars + chunk2.chunkLengthChars === chunk1.totalLengthChars,
            { eventName: "Mismatch in totalLengthChars" });

        this.logger.shipAssert(
            chunk1.chunkSegmentCount  + chunk2.chunkSegmentCount === chunk1.totalSegmentCount,
            { eventName: "Mismatch in totalSegmentCount" });

        const mergeTree = this.client.mergeTree;
        const clientId = mergeTree.collabWindow.clientId;

        // Deserialize each chunk segment and append it to the end of the MergeTree.
        mergeTree.insertSegments(
            mergeTree.root.cachedLength,
            this.segmentsFromSpecs(chunk2.segmentTexts),
            MergeTree.UniversalSequenceNumber,
            clientId,
            MergeTree.UniversalSequenceNumber,
            undefined);

    }

    private initializeIntervalCollections() {
        const intervalCollections = Array.from(this.keys())
            .filter((key) => key.indexOf(intervalCollectionMapPath) === 0);

        // Listen and initialize new SharedIntervalCollections
        this.on("valueChanged", (ev: IValueChanged) => {
            if (ev.key.indexOf(intervalCollectionMapPath) !== 0) {
                return;
            }

            const intervalCollection = this.get<SharedIntervalCollection<SharedStringInterval>>(ev.key);
            if (!intervalCollection.attached) {
                intervalCollection.attach(this.client, ev.key);
            }
        });

        // Initialize existing SharedIntervalCollections
        for (const key of intervalCollections) {
            const intervalCollection = this.get<SharedIntervalCollection<SharedStringInterval>>(key);
            intervalCollection.attach(this.client, key);
        }
    }

    private loadFinished(error?: any) {
        // initialize the interval collections
        this.initializeIntervalCollections();

        if (error) {
            this.logger.sendErrorEvent({eventName: "SequenceLoadFailed" }, error);
            this.loadedDeferred.reject(error);
        } else {
            this.isLoaded = true;
            this.loadedDeferred.resolve();

            // Update the MSN if larger than the set value
            if (this.pendingMinSequenceNumber > this.client.getCollabWindow().minSeq) {
                this.client.updateMinSeq(this.pendingMinSequenceNumber);
            }
        }
    }
}
