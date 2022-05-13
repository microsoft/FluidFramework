/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Deferred, bufferToString, assert } from "@fluidframework/common-utils";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import {
    ISequencedDocumentMessage,
    MessageType,
} from "@fluidframework/protocol-definitions";
import {
    IChannelAttributes,
    IFluidDataStoreRuntime,
    IChannelStorageService,
} from "@fluidframework/datastore-definitions";
import {
    Client,
    createAnnotateRangeOp,
    createGroupOp,
    createInsertOp,
    createRemoveRangeOp,
    ICombiningOp,
    IJSONSegment,
    IMergeTreeAnnotateMsg,
    IMergeTreeDeltaOp,
    IMergeTreeGroupMsg,
    IMergeTreeOp,
    IMergeTreeRemoveMsg,
    IRelativePosition,
    ISegment,
    ISegmentAction,
    LocalReference,
    matchProperties,
    MergeTreeDeltaType,
    PropertySet,
    RangeStackMap,
    ReferencePosition,
    ReferenceType,
    SegmentGroup,
} from "@fluidframework/merge-tree";
import { ObjectStoragePartition, SummaryTreeBuilder } from "@fluidframework/runtime-utils";
import {
    IFluidSerializer,
    makeHandlesSerializable,
    parseHandles,
    SharedObject,
    ISharedObjectEvents,
    SummarySerializer,
} from "@fluidframework/shared-object-base";
import { IEventThisPlaceHolder } from "@fluidframework/common-definitions";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";

import {
    IntervalCollection,
    SequenceInterval,
    SequenceIntervalCollectionValueType,
} from "./intervalCollection";
import { IMapMessageLocalMetadata, DefaultMap } from "./defaultMap";
import { IValueChanged } from "./defaultMapInterfaces";
import { SequenceDeltaEvent, SequenceMaintenanceEvent } from "./sequenceDeltaEvent";
import { ISharedIntervalCollection } from "./sharedIntervalCollection";

const snapshotFileName = "header";
const contentPath = "content";

/**
 * Events emitted in response to changes to the sequence data.
 *
 * ### "sequenceDelta"
 *
 * The sequenceDelta event is emitted when segments are inserted, annotated, or removed.
 *
 * #### Listener signature
 *
 * ```typescript
 * (event: SequenceDeltaEvent, target: IEventThisPlaceHolder) => void
 * ```
 * - `event` - Various information on the segments that were modified.
 *
 * - `target` - The sequence itself.
 *
 * ### "maintenance"
 *
 * The maintenance event is emitted when segments are modified during merge-tree maintenance.
 *
 * #### Listener signature
 *
 * ```typescript
 * (event: SequenceMaintenanceEvent, target: IEventThisPlaceHolder) => void
 * ```
 * - `event` - Various information on the segments that were modified.
 *
 * - `target` - The sequence itself.
 */
export interface ISharedSegmentSequenceEvents extends ISharedObjectEvents {
    (event: "createIntervalCollection",
        listener: (label: string, local: boolean, target: IEventThisPlaceHolder) => void);
    (event: "sequenceDelta", listener: (event: SequenceDeltaEvent, target: IEventThisPlaceHolder) => void);
    (event: "maintenance",
        listener: (event: SequenceMaintenanceEvent, target: IEventThisPlaceHolder) => void);
}

export abstract class SharedSegmentSequence<T extends ISegment>
    extends SharedObject<ISharedSegmentSequenceEvents>
    implements ISharedIntervalCollection<SequenceInterval> {
    get loaded(): Promise<void> {
        return this.loadedDeferred.promise;
    }

    private static createOpsFromDelta(event: SequenceDeltaEvent): IMergeTreeDeltaOp[] {
        const ops: IMergeTreeDeltaOp[] = [];
        for (const r of event.ranges) {
            switch (event.deltaOperation) {
                case MergeTreeDeltaType.ANNOTATE: {
                    const lastAnnotate = ops[ops.length - 1] as IMergeTreeAnnotateMsg;
                    const props = {};
                    for (const key of Object.keys(r.propertyDeltas)) {
                        props[key] =
                            r.segment.properties[key] === undefined ? null : r.segment.properties[key];
                    }
                    if (lastAnnotate && lastAnnotate.pos2 === r.position &&
                        matchProperties(lastAnnotate.props, props)) {
                        lastAnnotate.pos2 += r.segment.cachedLength;
                    } else {
                        ops.push(createAnnotateRangeOp(
                            r.position,
                            r.position + r.segment.cachedLength,
                            props,
                            undefined));
                    }
                    break;
                }

                case MergeTreeDeltaType.INSERT:
                    ops.push(createInsertOp(
                        r.position,
                        r.segment.clone().toJSONObject()));
                    break;

                case MergeTreeDeltaType.REMOVE: {
                    const lastRem = ops[ops.length - 1] as IMergeTreeRemoveMsg;
                    if (lastRem?.pos1 === r.position) {
                        lastRem.pos2 += r.segment.cachedLength;
                    } else {
                        ops.push(createRemoveRangeOp(
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

    protected client: Client;
    // Deferred that triggers once the object is loaded
    protected loadedDeferred = new Deferred<void>();
    // cache out going ops created when partial loading
    private readonly loadedDeferredOutgoingOps:
        [IMergeTreeOp, SegmentGroup | SegmentGroup[]][] = [];
    // cache incoming ops that arrive when partial loading
    private deferIncomingOps = true;
    private readonly loadedDeferredIncomingOps: ISequencedDocumentMessage[] = [];

    private messagesSinceMSNChange: ISequencedDocumentMessage[] = [];
    private readonly intervalCollections: DefaultMap<IntervalCollection<SequenceInterval>>;
    constructor(
        private readonly dataStoreRuntime: IFluidDataStoreRuntime,
        public id: string,
        attributes: IChannelAttributes,
        public readonly segmentFromSpec: (spec: IJSONSegment) => ISegment,
    ) {
        super(id, dataStoreRuntime, attributes);

        this.loadedDeferred.promise.catch((error) => {
            this.logger.sendErrorEvent({ eventName: "SequenceLoadFailed" }, error);
        });

        this.client = new Client(
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
                        this.client.mergeTreeMaintenanceCallback = (args, opArgs) => {
                            this.emit("maintenance", new SequenceMaintenanceEvent(opArgs, args, this.client), this);
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

        this.intervalCollections = new DefaultMap(
            this.serializer,
            this.handle,
            (op, localOpMetadata) => this.submitLocalMessage(op, localOpMetadata),
            new SequenceIntervalCollectionValueType(),
        );
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

    public groupOperation(groupOp: IMergeTreeGroupMsg) {
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
    public getPosition(segment: ISegment): number {
        return this.client.getPosition(segment);
    }

    /**
     * Annotates the range with the provided properties
     *
     * @param start - The inclusive start position of the range to annotate
     * @param end - The exclusive end position of the range to annotate
     * @param props - The properties to annotate the range with
     * @param combiningOp - Optional. Specifies how to combine values for the property, such as "incr" for increment.
     *
     */
    public annotateRange(
        start: number,
        end: number,
        props: PropertySet,
        combiningOp?: ICombiningOp) {
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

    /**
     * @deprecated - use createLocalReferencePosition
     */
    public createPositionReference(
        segment: T,
        offset: number,
        refType: ReferenceType): LocalReference {
        const lref = new LocalReference(this.client, segment, offset, refType);
        if (refType !== ReferenceType.Transient) {
            this.addLocalReference(lref);
        }
        return lref;
    }

    public createLocalReferencePosition(
        segment: T,
        offset: number,
        refType: ReferenceType,
        properties: PropertySet | undefined): ReferencePosition {
        return this.client.createLocalReferencePosition(
            segment,
            offset,
            refType,
            properties);
    }

    /**
     * @deprecated - use localReferencePositionToPosition
     */
    public localRefToPos(localRef: LocalReference) {
        return this.client.localReferencePositionToPosition(localRef);
    }

    public localReferencePositionToPosition(lref: ReferencePosition): number {
        return this.client.localReferencePositionToPosition(lref);
    }

    /**
     * Resolves a remote client's position against the local sequence
     * and returns the remote client's position relative to the local
     * sequence. The client ref seq must be above the minimum sequence number
     * or the return value will be undefined.
     * Generally this method is used in conjunction with signals which provide
     * point in time values for the below parameters, and is useful for things
     * like displaying user position. It should not be used with persisted values
     * as persisted values will quickly become invalid as the remoteClientRefSeq
     * moves below the minimum sequence number
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

    public submitSequenceMessage(message: IMergeTreeOp) {
        if (!this.isAttached()) {
            return;
        }
        const translated = makeHandlesSerializable(message, this.serializer, this.handle);
        const metadata = this.client.peekPendingSegmentGroups(
            message.type === MergeTreeDeltaType.GROUP ? message.ops.length : 1);

        // if loading isn't complete, we need to cache
        // local ops until loading is complete, and then
        // they will be resent
        if (!this.loadedDeferred.isCompleted) {
            this.loadedDeferredOutgoingOps.push([translated, metadata]);
        } else {
            this.submitLocalMessage(translated, metadata);
        }
    }

    /**
     * @deprecated - use createLocalReferencePosition
     */
    public addLocalReference(lref: LocalReference) {
        return this.client.addLocalReference(lref);
    }

    /**
     * @deprecated - use removeLocalReferencePosition
     */
    public removeLocalReference(lref: LocalReference) {
        return this.client.removeLocalReferencePosition(lref);
    }

    public removeLocalReferencePosition(lref: ReferencePosition) {
        return this.client.removeLocalReferencePosition(lref);
    }

    /**
     * Given a position specified relative to a marker id, lookup the marker
     * and convert the position to a character position.
     * @param relativePos - Id of marker (may be indirect) and whether position is before or after marker.
     */
    public posFromRelativePos(relativePos: IRelativePosition) {
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
        handler: ISegmentAction<TClientData>,
        start?: number, end?: number, accum?: TClientData,
        splitRange: boolean = false) {
        return this.client.walkSegments<TClientData>(handler, start, end, accum, splitRange);
    }

    public getStackContext(startPos: number, rangeLabels: string[]): RangeStackMap {
        return this.client.getStackContext(startPos, rangeLabels);
    }

    public getCurrentSeq() {
        return this.client.getCurrentSeq();
    }

    public insertAtReferencePosition(pos: ReferencePosition, segment: T) {
        const insertOp = this.client.insertAtReferencePositionLocal(pos, segment);
        if (insertOp) {
            this.submitSequenceMessage(insertOp);
        }
    }

    /**
     * @deprecated - IntervalCollections are created on a first-write wins basis, and concurrent creates
     * are supported. Use `getIntervalCollection` instead.
     */
    public async waitIntervalCollection(
        label: string,
    ): Promise<IntervalCollection<SequenceInterval>> {
        return this.intervalCollections.get(this.getIntervalCollectionPath(label));
    }

    public getIntervalCollection(label: string): IntervalCollection<SequenceInterval> {
        const labelPath = this.getIntervalCollectionPath(label);
        const sharedCollection = this.intervalCollections.get(labelPath);
        return sharedCollection;
    }

    /**
     * @returns an iterable object that enumerates the IntervalCollection labels
     * Usage:
     * const iter = this.getIntervalCollectionKeys();
     * for (key of iter)
     *     const collection = this.getIntervalCollection(key);
     *     ...
    */
    public getIntervalCollectionLabels(): IterableIterator<string> {
        return this.intervalCollections.keys();
    }

    protected summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
        const builder = new SummaryTreeBuilder();

        // conditionally write the interval collection blob
        // only if it has entries
        if (this.intervalCollections.size > 0) {
            builder.addBlob(snapshotFileName, this.intervalCollections.serialize(serializer));
        }

        builder.addWithStats(contentPath, this.summarizeMergeTree(serializer));

        return builder.getSummaryTree();
    }

    /**
     * Runs serializer over the GC data for this SharedMatrix.
     * All the IFluidHandle's represent routes to other objects.
     */
    protected processGCDataCore(serializer: SummarySerializer) {
        if (this.intervalCollections.size > 0) {
            this.intervalCollections.serialize(serializer);
        }

        this.client.serializeGCData(this.handle, serializer);
    }

    /**
     * Replace the range specified from start to end with the provided segment
     * This is done by inserting the segment at the end of the range, followed
     * by removing the contents of the range
     * For a zero or reverse range (start \>= end), insert at end do not remove anything
     * @param start - The start of the range to replace
     * @param end - The end of the range to replace
     * @param segment - The segment that will replace the range
     */
    protected replaceRange(start: number, end: number, segment: ISegment) {
        // Insert at the max end of the range when start > end, but still remove the range later
        const insertIndex: number = Math.max(start, end);

        // Insert first, so local references can slide to the inserted seg if any
        const insert = this.client.insertSegmentLocal(insertIndex, segment);
        if (insert) {
            if (start < end) {
                const remove = this.client.removeRangeLocal(start, end);
                this.submitSequenceMessage(createGroupOp(insert, remove));
            } else {
                this.submitSequenceMessage(insert);
            }
        }
    }

    protected onConnect() {
        // Update merge tree collaboration information with new client ID and then resend pending ops
        this.client.startOrUpdateCollaboration(this.runtime.clientId);
    }

    protected onDisconnect() {}

    protected reSubmitCore(content: any, localOpMetadata: unknown) {
        if (!this.intervalCollections.trySubmitMessage(content, localOpMetadata as IMapMessageLocalMetadata)) {
            this.submitSequenceMessage(
                this.client.regeneratePendingOp(
                    content as IMergeTreeOp,
                    localOpMetadata as SegmentGroup | SegmentGroup[]));
        }
    }

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObject.loadCore}
     */
    protected async loadCore(storage: IChannelStorageService) {
        if (await storage.contains(snapshotFileName)) {
            const blob = await storage.readBlob(snapshotFileName);
            const header = bufferToString(blob, "utf8");
            this.intervalCollections.populate(header);
        }

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
                                    op: {
                                        seq: m.sequenceNumber,
                                        minSeq: m.minimumSequenceNumber,
                                        refSeq: m.referenceSequenceNumber,
                                    },
                                    collabWindow: {
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
                // if we not doing partial load, await the catch up ops,
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
            assert(!local, 0x072 /* "Unexpected local op when loading not finished" */);
            this.loadedDeferredIncomingOps.push(message);
        } else {
            assert(message.type === MessageType.Operation, 0x073 /* "Sequence message not operation" */);

            const handled = this.intervalCollections.tryProcessMessage(
                message.contents,
                local,
                message,
                localOpMetadata,
            );

            if (!handled) {
                this.processMergeTreeMsg(message, local);
            }
        }
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

    /**
     * {@inheritDoc @fluidframework/shared-object-base#SharedObjectCore.applyStashedOp}
     */
    protected applyStashedOp(content: any): unknown {
        return this.client.applyStashedOp(content);
    }

    private summarizeMergeTree(serializer: IFluidSerializer): ISummaryTreeWithStats {
        // Are we fully loaded? If not, things will go south
        assert(this.loadedDeferred.isCompleted, 0x074 /* "Snapshot called when not fully loaded" */);
        const minSeq = this.runtime.deltaManager.minimumSequenceNumber;

        this.processMinSequenceNumberChanged(minSeq);

        this.messagesSinceMSNChange.forEach((m) => { m.minimumSequenceNumber = minSeq; });

        return this.client.summarize(this.runtime, this.handle, serializer, this.messagesSinceMSNChange);
    }

    private processMergeTreeMsg(rawMessage: ISequencedDocumentMessage, local?: boolean) {
        const message = parseHandles(rawMessage, this.serializer);

        const ops: IMergeTreeDeltaOp[] = [];
        function transformOps(event: SequenceDeltaEvent) {
            ops.push(...SharedSegmentSequence.createOpsFromDelta(event));
        }
        const needsTransformation = message.referenceSequenceNumber !== message.sequenceNumber - 1;
        let stashMessage: Readonly<ISequencedDocumentMessage> = message;
        if (this.runtime.options?.newMergeTreeSnapshotFormat !== true) {
            if (needsTransformation) {
                this.on("sequenceDelta", transformOps);
            }
        }

        this.client.applyMsg(message, local);

        if (this.runtime.options?.newMergeTreeSnapshotFormat !== true) {
            if (needsTransformation) {
                this.removeListener("sequenceDelta", transformOps);
                // shallow clone the message as we only overwrite top level properties,
                // like referenceSequenceNumber and content only
                stashMessage = {
                    ... message,
                    referenceSequenceNumber: stashMessage.sequenceNumber - 1,
                    contents: ops.length !== 1 ? createGroupOp(...ops) : ops[0],
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
                // first we stop deferring incoming ops, and apply then all
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
        this.intervalCollections.eventEmitter.on("create", ({ key, previousValue }: IValueChanged, local: boolean) => {
            const intervalCollection = this.intervalCollections.get(key);
            if (!intervalCollection.attached) {
                intervalCollection.attachGraph(this.client, key);
            }
            assert(previousValue === undefined, 0x2c1 /* "Creating an interval collection that already exists?" */);
            this.emit("createIntervalCollection", key, local, this);
        });

        // Initialize existing SharedIntervalCollections
        for (const key of this.intervalCollections.keys()) {
            const intervalCollection = this.intervalCollections.get(key);
            intervalCollection.attachGraph(this.client, key);
        }
    }
}
