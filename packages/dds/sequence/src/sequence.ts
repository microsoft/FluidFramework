/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { Deferred, fromBase64ToUtf8, assert } from "@fluidframework/common-utils";
import { IFluidSerializer } from "@fluidframework/core-interfaces";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { IValueChanged, MapKernel } from "@fluidframework/map";
import * as MergeTree from "@fluidframework/merge-tree";
import {
    FileMode,
    ISequencedDocumentMessage,
    ITree,
    MessageType,
    TreeEntry,
} from "@fluidframework/protocol-definitions";
import {
    IChannelAttributes,
    IFluidDataStoreRuntime,
    IChannelStorageService,
} from "@fluidframework/datastore-definitions";
import { ObjectStoragePartition } from "@fluidframework/runtime-utils";
import {
    makeHandlesSerializable,
    parseHandles,
    SharedObject,
    ISharedObjectEvents,
} from "@fluidframework/shared-object-base";
import { IEventThisPlaceHolder } from "@fluidframework/common-definitions";

import { debug } from "./debug";
import {
    IntervalCollection,
    SequenceInterval,
    SequenceIntervalCollectionValueType,
} from "./intervalCollection";
import { SequenceDeltaEvent, SequenceMaintenanceEvent } from "./sequenceDeltaEvent";
import { ISharedIntervalCollection } from "./sharedIntervalCollection";

const snapshotFileName = "header";
const contentPath = "content";

export interface ISharedSegmentSequenceEvents
    extends ISharedObjectEvents {

    (event: "sequenceDelta", listener: (event: SequenceDeltaEvent, target: IEventThisPlaceHolder) => void);
    (event: "maintenance",
        listener: (event: SequenceMaintenanceEvent, target: IEventThisPlaceHolder) => void);
}

export abstract class SharedSegmentSequence<T extends MergeTree.ISegment>
    extends SharedObject<ISharedSegmentSequenceEvents>
    implements ISharedIntervalCollection<SequenceInterval> {
    get loaded(): Promise<void> {
        return this.loadedDeferred.promise;
    }

    private static createOpsFromDelta(event: SequenceDeltaEvent): MergeTree.IMergeTreeDeltaOp[] {
        const ops: MergeTree.IMergeTreeDeltaOp[] = [];
        for (const r of event.ranges) {
            switch (event.deltaOperation) {
                case MergeTree.MergeTreeDeltaType.ANNOTATE: {
                    const lastAnnotate = ops[ops.length - 1] as MergeTree.IMergeTreeAnnotateMsg;
                    const props = {};
                    for (const key of Object.keys(r.propertyDeltas)) {
                        props[key] =
                            // eslint-disable-next-line no-null/no-null
                            r.segment.properties[key] === undefined ? null : r.segment.properties[key];
                    }
                    if (lastAnnotate && lastAnnotate.pos2 === r.position &&
                        MergeTree.matchProperties(lastAnnotate.props, props)) {
                        lastAnnotate.pos2 += r.segment.cachedLength;
                    } else {
                        ops.push(MergeTree.createAnnotateRangeOp(
                            r.position,
                            r.position + r.segment.cachedLength,
                            props,
                            undefined));
                    }
                    break;
                }

                case MergeTree.MergeTreeDeltaType.INSERT:
                    ops.push(MergeTree.createInsertOp(
                        r.position,
                        r.segment.clone().toJSONObject()));
                    break;

                case MergeTree.MergeTreeDeltaType.REMOVE: {
                    const lastRem = ops[ops.length - 1] as MergeTree.IMergeTreeRemoveMsg;
                    if (lastRem?.pos1 === r.position) {
                        lastRem.pos2 += r.segment.cachedLength;
                    } else {
                        ops.push(MergeTree.createRemoveRangeOp(
                            r.position,
                            r.position + r.segment.cachedLength));
                    }
                    break;
                }

                default:
            }
        }
        return ops;
    }

    protected client: MergeTree.Client;
    // Deferred that triggers once the object is loaded
    protected loadedDeferred = new Deferred<void>();
    // cache out going ops created when parital loading
    private readonly loadedDeferredOutgoingOps:
        [MergeTree.IMergeTreeOp, MergeTree.SegmentGroup | MergeTree.SegmentGroup[]][] = [];
    // cache incoming ops that arrive when partial loading
    private deferIncomingOps = true;
    private readonly loadedDeferredIncomingOps: ISequencedDocumentMessage[] = [];

    private messagesSinceMSNChange: ISequencedDocumentMessage[] = [];
    private readonly intervalMapKernel: MapKernel;
    constructor(
        private readonly dataStoreRuntime: IFluidDataStoreRuntime,
        public id: string,
        attributes: IChannelAttributes,
        public readonly segmentFromSpec: (spec: MergeTree.IJSONSegment) => MergeTree.ISegment,
    ) {
        super(id, dataStoreRuntime, attributes);

        this.loadedDeferred.promise.catch((error)=>{
            this.logger.sendErrorEvent({ eventName: "SequenceLoadFailed" }, error);
        });

        this.client = new MergeTree.Client(
            segmentFromSpec,
            ChildLogger.create(this.logger, "SharedSegmentSequence.MergeTreeClient"),
            dataStoreRuntime.options);

        super.on("newListener", (event) => {
            switch (event) {
                case "sequenceDelta":
                    if (!this.client.mergeTreeDeltaCallback) {
                        this.client.mergeTreeDeltaCallback = (opArgs, deltaArgs) => {
                            this.emit("sequenceDelta", new SequenceDeltaEvent(opArgs, deltaArgs, this.client), this);
                        };
                    }
                    break;
                case "maintenance":
                    if (!this.client.mergeTreeMaintenanceCallback) {
                        this.client.mergeTreeMaintenanceCallback = (args) => {
                            this.emit("maintenance", new SequenceMaintenanceEvent(args, this.client), this);
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
                        this.client.mergeTreeDeltaCallback = undefined;
                    }
                    break;
                case "maintenance":
                    if (super.listenerCount(event) === 0) {
                        this.client.mergeTreeMaintenanceCallback = undefined;
                    }
                    break;
                default:
                    break;
            }
        });

        this.intervalMapKernel = new MapKernel(
            this.serializer,
            this.handle,
            (op, localOpMetadata) => this.submitLocalMessage(op, localOpMetadata),
            () => this.isAttached(),
            [new SequenceIntervalCollectionValueType()]);
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
        return this.client.getContainingSegment<T>(pos);
    }

    /**
     * Returns the length of the current sequence for the client
     */
    public getLength() {
        return this.client.getLength();
    }

    /**
     * Returns the current position of a segment, and -1 if the segment
     * does not exist in this sequence
     * @param segment - The segment to get the position of
     */
    public getPosition(segment: MergeTree.ISegment): number {
        return this.client.getPosition(segment);
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

    public createPositionReference(
        segment: T,
        offset: number,
        refType: MergeTree.ReferenceType): MergeTree.LocalReference {
        const lref = new MergeTree.LocalReference(this.client, segment, offset, refType);
        if (refType !== MergeTree.ReferenceType.Transient) {
            this.addLocalReference(lref);
        }
        return lref;
    }

    public localRefToPos(localRef: MergeTree.LocalReference) {
        if (localRef.segment) {
            return localRef.offset + this.getPosition(localRef.segment);
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
        return this.client.resolveRemoteClientPosition(
            remoteClientPosition,
            remoteClientRefSeq,
            remoteClientId);
    }

    public submitSequenceMessage(message: MergeTree.IMergeTreeOp) {
        if (!this.isAttached()) {
            return;
        }
        const translated = makeHandlesSerializable(message, this.serializer, this.handle);
        const metadata = this.client.peekPendingSegmentGroups(
            message.type === MergeTree.MergeTreeDeltaType.GROUP ? message.ops.length : 1);

        // if loading isn't complete, we need to cache
        // local ops until loading is complete, and then
        // they will be resent
        if (!this.loadedDeferred.isCompleted) {
            this.loadedDeferredOutgoingOps.push([translated, metadata]);
        } else {
            this.submitLocalMessage(translated, metadata);
        }
    }

    public addLocalReference(lref) {
        return this.client.addLocalReference(lref);
    }

    public removeLocalReference(lref) {
        return this.client.removeLocalReference(lref);
    }

    /**
     * Given a position specified relative to a marker id, lookup the marker
     * and convert the position to a character position.
     * @param relativePos - Id of marker (may be indirect) and whether position is before or after marker.
     */
    public posFromRelativePos(relativePos) {
        return this.client.posFromRelativePos(relativePos);
    }

    /**
     * Walk the underlying segments of the sequence.
     * The walked segments may extend beyond the range
     * if the segments cross the ranges start or end boundaries.
     * Set split range to true to ensure only segments within the
     * range are walked.
     *
     * @param handler - The function to handle each segment
     * @param start - Optional. The start of range walk.
     * @param end - Optional. The end of range walk
     * @param accum - Optional. An object that will be passed to the handler for accumulation
     * @param splitRange - Optional. Splits boundary segments on the range boundaries
     */
    public walkSegments<TClientData>(
        handler: MergeTree.ISegmentAction<TClientData>,
        start?: number, end?: number, accum?: TClientData,
        splitRange: boolean = false) {
        return this.client.walkSegments<TClientData>(handler, start, end, accum, splitRange);
    }

    public getStackContext(startPos: number, rangeLabels: string[]) {
        return this.client.getStackContext(startPos, rangeLabels);
    }

    public getCurrentSeq() {
        return this.client.getCurrentSeq();
    }

    public insertAtReferencePosition(pos: MergeTree.ReferencePosition, segment: T) {
        const insertOp = this.client.insertAtReferencePositionLocal(pos, segment);
        if (insertOp) {
            this.submitSequenceMessage(insertOp);
        }
    }

    public async waitIntervalCollection(
        label: string,
    ): Promise<IntervalCollection<SequenceInterval>> {
        return this.intervalMapKernel.wait<IntervalCollection<SequenceInterval>>(
            this.getIntervalCollectionPath(label));
    }

    // TODO: fix race condition on creation by putting type on every operation
    public getIntervalCollection(label: string): IntervalCollection<SequenceInterval> {
        const labelPath = this.getIntervalCollectionPath(label);
        if (!this.intervalMapKernel.has(labelPath)) {
            this.intervalMapKernel.createValueType(
                labelPath,
                SequenceIntervalCollectionValueType.Name,
                undefined);
        }

        const sharedCollection =
            this.intervalMapKernel.get<IntervalCollection<SequenceInterval>>(labelPath);
        return sharedCollection;
    }

    protected snapshotCore(serializer: IFluidSerializer): ITree {
        const tree: ITree = {
            entries: [
                {
                    mode: FileMode.File,
                    path: snapshotFileName,
                    type: TreeEntry.Blob,
                    value: {
                        contents: this.intervalMapKernel.serialize(serializer),
                        encoding: "utf-8",
                    },
                },
                {
                    mode: FileMode.Directory,
                    path: contentPath,
                    type: TreeEntry.Tree,
                    value: this.snapshotMergeTree(serializer),
                },

            ],
            // eslint-disable-next-line no-null/no-null
            id: null,
        };

        return tree;
    }

    /**
     * Replace the range specified from start to end with the provided segment
     * This is done by inserting the segment at the end of the range, followed
     * by removing the contents of the range
     * For a zero range (start == end), insert at end do not remove anything
     * For a reverse range (start \> end), insert the segment at the greater of
     * start/end and allow Client to attempt to remove the range
     *
     * @param start - The start of the range to replace
     * @param end - The end of the range to replace
     * @param segment - The segment that will replace the range
     */
    protected replaceRange(start: number, end: number, segment: MergeTree.ISegment) {
        // Insert at the max end of the range when start > end, but still remove the range later
        const insertIndex: number = Math.max(start, end);

        // Insert first, so local references can slide to the inserted seg if any
        const insert = this.client.insertSegmentLocal(insertIndex, segment);
        if (insert) {
            if (start !== end) {
                const remove = this.client.removeRangeLocal(start, end);
                this.submitSequenceMessage(MergeTree.createGroupOp(insert, remove));
            } else {
                this.submitSequenceMessage(insert);
            }
        }
    }

    protected onConnect() {
        // Update merge tree collaboration information with new client ID and then resend pending ops
        this.client.startOrUpdateCollaboration(this.runtime.clientId);
    }

    protected onDisconnect() {
        debug(`${this.id} is now disconnected`);
    }

    protected reSubmitCore(content: any, localOpMetadata: unknown) {
        if (!this.intervalMapKernel.trySubmitMessage(content, localOpMetadata)) {
            this.submitSequenceMessage(
                this.client.regeneratePendingOp(
                    content as MergeTree.IMergeTreeOp,
                    localOpMetadata as MergeTree.SegmentGroup | MergeTree.SegmentGroup[]));
        }
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
     */
    protected async loadCore(storage: IChannelStorageService) {
        const header = await storage.read(snapshotFileName);

        const data: string = header ? fromBase64ToUtf8(header) : undefined;
        this.intervalMapKernel.populate(data);

        try {
            // this will load the header, and return a promise
            // that will resolve when the body is loaded
            // and the catchup ops are available.
            const { catchupOpsP } = await this.client.load(
                this.runtime,
                new ObjectStoragePartition(storage, contentPath),
                this.serializer);

            // setup a promise to process the
            // catch up ops, and finishing the loading process
            const loadCatchUpOps = catchupOpsP
                .then((msgs) => {
                    msgs.forEach((m) => {
                        const collabWindow = this.client.getCollabWindow();
                        if (m.minimumSequenceNumber < collabWindow.minSeq
                            || m.referenceSequenceNumber < collabWindow.minSeq
                            || m.sequenceNumber <= collabWindow.minSeq
                            || m.sequenceNumber <= collabWindow.currentSeq) {
                            throw new Error(`Invalid catchup operations in snapshot: ${
                                JSON.stringify({
                                    op:{
                                        seq: m.sequenceNumber,
                                        minSeq: m.minimumSequenceNumber,
                                        refSeq:m.referenceSequenceNumber,
                                    },
                                    collabWindow:{
                                        seq: collabWindow.currentSeq,
                                        minSeq: collabWindow.minSeq,
                                    },
                                })}`);
                        }
                        this.processMergeTreeMsg(m);
                    });
                    this.loadFinished();
                })
                .catch((error) => {
                    this.loadFinished(error);
                });
            if (this.dataStoreRuntime.options?.sequenceInitializeFromHeaderOnly !== true) {
                // if we not doing parital load, await the catch up ops,
                // and the finalization of the load
                await loadCatchUpOps;
            }
        } catch (error) {
            this.loadFinished(error);
        }
    }

    protected processCore(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
        // if loading isn't complete, we need to cache all
        // incoming ops to be applied after loading is complete
        if (this.deferIncomingOps) {
            assert(!local, "Unexpected local op when loading not finished");
            this.loadedDeferredIncomingOps.push(message);
        } else {
            assert(message.type === MessageType.Operation, "Sequence message not operation");

            const handled = this.intervalMapKernel.tryProcessMessage(message, local, localOpMetadata);

            if (!handled) {
                this.processMergeTreeMsg(message);
            }
        }
    }

    protected registerCore() {
        for (const value of this.intervalMapKernel.values()) {
            if (SharedObject.is(value)) {
                value.bindToContext();
            }
        }

        this.client.startOrUpdateCollaboration(this.runtime.clientId);
    }

    protected didAttach() {
        // If we are not local, and we've attached we need to start generating and sending ops
        // so start collaboration and provide a default client id incase we are not connected
        if (this.isAttached()) {
            this.client.startOrUpdateCollaboration(this.runtime.clientId ?? "attached");
        }
    }

    protected initializeLocalCore() {
        super.initializeLocalCore();
        this.loadFinished();
    }

    private snapshotMergeTree(serializer: IFluidSerializer): ITree {
        // Are we fully loaded? If not, things will go south
        assert(this.loadedDeferred.isCompleted, "Snapshot called when not fully loaded");
        const minSeq = this.runtime.deltaManager.minimumSequenceNumber;

        this.processMinSequenceNumberChanged(minSeq);

        this.messagesSinceMSNChange.forEach((m) => m.minimumSequenceNumber = minSeq);

        return this.client.snapshot(this.runtime, this.handle, serializer, this.messagesSinceMSNChange);
    }

    private processMergeTreeMsg(
        rawMessage: ISequencedDocumentMessage) {
        const message = parseHandles(rawMessage, this.serializer);

        const ops: MergeTree.IMergeTreeDeltaOp[] = [];
        function transfromOps(event: SequenceDeltaEvent) {
            ops.push(...SharedSegmentSequence.createOpsFromDelta(event));
        }
        const needsTransformation = message.referenceSequenceNumber !== message.sequenceNumber - 1;
        let stashMessage: Readonly<ISequencedDocumentMessage> = message;
        if (this.runtime.options?.newMergeTreeSnapshotFormat !== true) {
            if (needsTransformation) {
                this.on("sequenceDelta", transfromOps);
            }
        }

        this.client.applyMsg(message);

        if (this.runtime.options?.newMergeTreeSnapshotFormat !== true) {
            if (needsTransformation) {
                this.removeListener("sequenceDelta", transfromOps);
                // shallow clone the message as we only overwrite top level properties,
                // like referenceSequenceNumber and content only
                stashMessage = {
                    ... message,
                    referenceSequenceNumber: stashMessage.sequenceNumber - 1,
                    contents: ops.length !== 1 ? MergeTree.createGroupOp(...ops) : ops[0],
                };
            }

            this.messagesSinceMSNChange.push(stashMessage);

            // Do GC every once in a while...
            if (this.messagesSinceMSNChange.length > 20
                && this.messagesSinceMSNChange[20].sequenceNumber < message.minimumSequenceNumber) {
                this.processMinSequenceNumberChanged(message.minimumSequenceNumber);
            }
        }
    }

    private getIntervalCollectionPath(label: string) {
        return `intervalCollections/${label}`;
    }

    private processMinSequenceNumberChanged(minSeq: number) {
        let index = 0;
        for (; index < this.messagesSinceMSNChange.length; index++) {
            if (this.messagesSinceMSNChange[index].sequenceNumber > minSeq) {
                break;
            }
        }
        if (index !== 0) {
            this.messagesSinceMSNChange = this.messagesSinceMSNChange.slice(index);
        }
    }

    private loadFinished(error?: any) {
        if (!this.loadedDeferred.isCompleted) {
            // Initialize the interval collections
            this.initializeIntervalCollections();
            if (error) {
                this.loadedDeferred.reject(error);
                throw error;
            } else {
                // it is important this series remains synchronous
                // first we stop defering incoming ops, and apply then all
                this.deferIncomingOps = false;
                while (this.loadedDeferredIncomingOps.length > 0) {
                    this.processCore(this.loadedDeferredIncomingOps.shift(), false, undefined);
                }
                // then resolve the loaded promise
                // and resubmit all the outstanding ops, as the snapshot
                // is fully loaded, and all outstanding ops are applied
                this.loadedDeferred.resolve();

                while (this.loadedDeferredOutgoingOps.length > 0) {
                    const opData = this.loadedDeferredOutgoingOps.shift();
                    this.reSubmitCore(opData[0], opData[1]);
                }
            }
        }
    }

    private initializeIntervalCollections() {
        // Listen and initialize new SharedIntervalCollections
        this.intervalMapKernel.eventEmitter.on("valueChanged", (ev: IValueChanged) => {
            const intervalCollection = this.intervalMapKernel.get<IntervalCollection<SequenceInterval>>(ev.key);
            if (!intervalCollection.attached) {
                intervalCollection.attachGraph(this.client, ev.key);
            }
        });

        // Initialize existing SharedIntervalCollections
        for (const key of this.intervalMapKernel.keys()) {
            const intervalCollection = this.intervalMapKernel.get<IntervalCollection<SequenceInterval>>(key);
            intervalCollection.attachGraph(this.client, key);
        }
    }
}
