/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle, IFluidSerializer } from "@fluidframework/core-interfaces";
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import { IFluidDataStoreRuntime, IChannelStorageService } from "@fluidframework/datastore-definitions";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, Trace } from "@fluidframework/common-utils";
import { IIntegerRange } from "./base";
import * as Collections from "./collections";
import { UnassignedSequenceNumber, UniversalSequenceNumber } from "./constants";
import { LocalReference } from "./localReference";
import {
    ClientIds,
    compareStrings,
    elapsedMicroseconds,
    IConsensusInfo,
    ISegment,
    ISegmentAction,
    Marker,
    MergeTree,
    RegisterCollection,
    SegmentGroup,
} from "./mergeTree";
import { MergeTreeDeltaCallback } from "./mergeTreeDeltaCallback";
import * as OpBuilder from "./opBuilder";
import * as ops from "./ops";
import * as Properties from "./properties";
import { SnapshotLegacy } from "./snapshotlegacy";
import { SnapshotLoader } from "./snapshotLoader";
import { MergeTreeTextHelper } from "./textSegment";
import { SnapshotV1 } from "./snapshotV1";
import {
    IMergeTreeClientSequenceArgs,
    IMergeTreeDeltaOpArgs,
    MergeTreeMaintenanceCallback,
    ReferencePosition,
} from "./index";

export class Client {
    public verboseOps = false;
    public noVerboseRemoteAnnotate = false;
    public measureOps = false;
    public registerCollection = new RegisterCollection();
    public accumTime = 0;
    public localTime = 0;
    public localOps = 0;
    public accumWindowTime = 0;
    public accumWindow = 0;
    public accumOps = 0;
    public maxWindowTime = 0;
    public longClientId: string | undefined;

    get mergeTreeDeltaCallback(): MergeTreeDeltaCallback { return this.mergeTree.mergeTreeDeltaCallback; }
    set mergeTreeDeltaCallback(callback: MergeTreeDeltaCallback) { this.mergeTree.mergeTreeDeltaCallback = callback; }

    get mergeTreeMaintenanceCallback(): MergeTreeMaintenanceCallback {
        return this.mergeTree.mergeTreeMaintenanceCallback;
    }

    set mergeTreeMaintenanceCallback(callback: MergeTreeMaintenanceCallback) {
        this.mergeTree.mergeTreeMaintenanceCallback = callback;
    }

    protected readonly mergeTree: MergeTree;

    private readonly clientNameToIds = new Collections.RedBlackTree<string, ClientIds>(compareStrings);
    private readonly shortClientIdMap: string[] = [];
    private readonly shortClientBranchIdMap: number[] = [];
    private readonly pendingConsensus = new Map<string, IConsensusInfo>();

    constructor(
        // Passing this callback would be unnecessary if Client were merged with SharedSegmentSequence
        public readonly specToSegment: (spec: ops.IJSONSegment) => ISegment,
        public readonly logger: ITelemetryLogger,
        options?: Properties.PropertySet,
    ) {
        this.mergeTree = new MergeTree(options);
        this.mergeTree.getLongClientId = (id) => this.getLongClientId(id);
        this.mergeTree.clientIdToBranchId = this.shortClientBranchIdMap;
    }

    /**
     * The merge tree maintains a queue of segment groups for each local operation.
     * These segment groups track segments modified by an operation.
     * This method peeks the tail of that queue, and returns the segments groups there.
     * It is used to get the segment group(s) for the previous operations.
     * @param count - The number segment groups to get peek from the tail of the queue. Default 1.
     */
    public peekPendingSegmentGroups(count: number = 1) {
        if (count === 1) {
            return this.mergeTree.pendingSegments?.last();
        }
        let taken = 0;
        return this.mergeTree.pendingSegments?.some(() => {
            if (taken < count) {
                taken++;
                return true;
            }
            return false;
        }, true);
    }

    /**
     * Annotate a maker and call the callback on concensus.
     * @param marker - The marker to annotate
     * @param props - The properties to annotate the marker with
     * @param consensusCallback - The callback called when consensus is reached
     * @returns The annotate op if valid, otherwise undefined
     */
    public annotateMarkerNotifyConsensus(
        marker: Marker,
        props: Properties.PropertySet,
        consensusCallback: (m: Marker) => void): ops.IMergeTreeAnnotateMsg | undefined {
        const combiningOp: ops.ICombiningOp = {
            name: "consensus",
        };

        const annotateOp =
            this.annotateMarker(marker, props, combiningOp);

        if (annotateOp) {
            const consensusInfo: IConsensusInfo = {
                callback: consensusCallback,
                marker,
            };
            this.pendingConsensus.set(marker.getId(), consensusInfo);
            return annotateOp;
        } else {
            return undefined;
        }
    }
    /**
     * Annotates the markers with the provided properties
     * @param marker - The marker to annotate
     * @param props - The properties to annotate the marker with
     * @param combiningOp - Optional. Specifies how to combine values for the property, such as "incr" for increment.
     * @returns The annotate op if valid, otherwise undefined
     */
    public annotateMarker(
        marker: Marker,
        props: Properties.PropertySet,
        combiningOp: ops.ICombiningOp): ops.IMergeTreeAnnotateMsg | undefined {
        const annotateOp =
            OpBuilder.createAnnotateMarkerOp(marker, props, combiningOp);

        if (this.applyAnnotateRangeOp({ op: annotateOp })) {
            return annotateOp;
        } else {
            return undefined;
        }
    }
    /**
     * Annotates the range with the provided properties
     * @param start - The inclusive start postition of the range to annotate
     * @param end - The exclusive end position of the range to annotate
     * @param props - The properties to annotate the range with
     * @param combiningOp - Specifies how to combine values for the property, such as "incr" for increment.
     * @returns The annotate op if valid, otherwise undefined
     */
    public annotateRangeLocal(
        start: number,
        end: number,
        props: Properties.PropertySet,
        combiningOp: ops.ICombiningOp): ops.IMergeTreeAnnotateMsg | undefined {
        const annotateOp = OpBuilder.createAnnotateRangeOp(
            start,
            end,
            props,
            combiningOp);

        if (this.applyAnnotateRangeOp({ op: annotateOp })) {
            return annotateOp;
        }
        return undefined;
    }

    /**
     * Removes the range and puts the content of the removed range in a register
     * if a register name is provided
     *
     * @param start - The inclusive start of the range to remove
     * @param end - The exclusive end of the range to remove
     * @param register - Optional. The name of the register to store the removed range in
     */
    public removeRangeLocal(start: number, end: number, register?: string) {
        const removeOp = OpBuilder.createRemoveRangeOp(start, end, register);

        if (this.applyRemoveRangeOp({ op: removeOp })) {
            return removeOp;
        }
        return undefined;
    }

    /**
     * @param pos - The position to insert the segment at
     * @param segment - The segment to insert
     */
    public insertSegmentLocal(pos: number, segment: ISegment): ops.IMergeTreeInsertMsg | undefined {
        if (segment.cachedLength <= 0) {
            return undefined;
        }
        const insertOp = OpBuilder.createInsertSegmentOp(pos, segment);
        if (this.applyInsertOp({ op: insertOp })) {
            return insertOp;
        }
        return undefined;
    }

    /**
     * @param refPos - The reference position to insert the segment at
     * @param segment - The segment to insert
     */
    public insertAtReferencePositionLocal(
        refPos: ReferencePosition,
        segment: ISegment,
    ): ops.IMergeTreeInsertMsg | undefined {
        const pos = this.mergeTree.referencePositionToLocalPosition(
            refPos,
            this.getCurrentSeq(),
            this.getClientId());

        if (pos === LocalReference.DetachedPosition) {
            return undefined;
        }
        const op = OpBuilder.createInsertSegmentOp(
            pos,
            segment);

        const opArgs = { op };
        let traceStart: Trace | undefined;
        if (this.measureOps) {
            traceStart = Trace.start();
        }

        this.mergeTree.insertAtReferencePosition(
            refPos,
            segment,
            opArgs);

        this.completeAndLogOp(
            opArgs,
            this.getClientSequenceArgs(opArgs),
            { start: op.pos1, end: undefined },
            traceStart);

        return op;
    }

    /**
     * @param pos - The position to insert the register contents at
     * @param register - The name of the register to insert the value of
     */
    public pasteLocal(pos: number, register: string) {
        const insertOp = OpBuilder.createInsertFromRegisterOp(pos, register);
        if (this.applyInsertOp({ op: insertOp })) {
            return insertOp;
        }
        return undefined;
    }

    /**
     *
     * @param start - he inclusive start of the range to copy into the register
     * @param end - The exclusive end of the range to copy into the register
     * @param register - The name of the register to insert the range contents into
     */
    public copyLocal(start: number, end: number, register: string) {
        const insertOp = OpBuilder.createInsertToRegisterOp(start, end, register);
        if (this.applyInsertOp({ op: insertOp })) {
            return insertOp;
        }
        return undefined;
    }

    public walkSegments<TClientData>(
        handler: ISegmentAction<TClientData>,
        start?: number, end?: number, accum?: TClientData, splitRange: boolean = false) {
        this.mergeTree.mapRange(
            {
                leaf: handler,
            },
            this.getCurrentSeq(), this.getClientId(),
            accum, start, end, splitRange);
    }

    public getCollabWindow() {
        return this.mergeTree.getCollabWindow();
    }

    /**
     * Returns the current position of a segment, and -1 if the segment
     * does not exist in this merge tree
     * @param segment - The segment to get the position of
     */
    public getPosition(segment: ISegment): number {
        if (segment?.parent === undefined) {
            return -1;
        }
        return this.mergeTree.getPosition(segment, this.getCurrentSeq(), this.getClientId());
    }

    public addLocalReference(lref: LocalReference) {
        return this.mergeTree.addLocalReference(lref);
    }

    public removeLocalReference(lref: LocalReference) {
        return this.mergeTree.removeLocalReference(lref.segment, lref);
    }

    /**
     * Given a position specified relative to a marker id, lookup the marker
     * and convert the position to a character position.
     * @param relativePos - Id of marker (may be indirect) and whether position is before or after marker.
     */
    public posFromRelativePos(relativePos: ops.IRelativePosition) {
        return this.mergeTree.posFromRelativePos(relativePos);
    }

    public getMarkerFromId(id: string) {
        return this.mergeTree.getMarkerFromId(id);
    }

    /**
     * Performs the annotate based on the provided op
     * @param opArgs - The ops args for the op
     * @returns True if the annotate was applied. False if it could not be.
     */
    private applyRemoveRangeOp(opArgs: IMergeTreeDeltaOpArgs): boolean {
        assert(opArgs.op.type === ops.MergeTreeDeltaType.REMOVE);
        const op = opArgs.op;
        const clientArgs = this.getClientSequenceArgs(opArgs);
        const range = this.getValidOpRange(op, clientArgs);
        if (!range) {
            return false;
        }

        if (op.register) {
            // Cut
            this.copy(range, op.register, clientArgs);
        }

        let traceStart: Trace | undefined;
        if (this.measureOps) {
            traceStart = Trace.start();
        }

        this.mergeTree.markRangeRemoved(
            range.start,
            range.end,
            clientArgs.referenceSequenceNumber,
            clientArgs.clientId,
            clientArgs.sequenceNumber,
            false,
            opArgs);

        this.completeAndLogOp(opArgs, clientArgs, range, traceStart);

        return true;
    }

    /**
     * Performs the annotate based on the provided op
     * @param opArgs - The ops args for the op
     * @returns True if the annotate was applied. False if it could not be.
     */
    private applyAnnotateRangeOp(opArgs: IMergeTreeDeltaOpArgs): boolean {
        assert(opArgs.op.type === ops.MergeTreeDeltaType.ANNOTATE);
        const op = opArgs.op;
        const clientArgs = this.getClientSequenceArgs(opArgs);
        const range = this.getValidOpRange(op, clientArgs);

        if (!range) {
            return false;
        }

        let traceStart: Trace | undefined;
        if (this.measureOps) {
            traceStart = Trace.start();
        }

        this.mergeTree.annotateRange(
            range.start,
            range.end,
            op.props,
            op.combiningOp,
            clientArgs.referenceSequenceNumber,
            clientArgs.clientId,
            clientArgs.sequenceNumber,
            opArgs);

        this.completeAndLogOp(opArgs, clientArgs, range, traceStart);

        return true;
    }

    /**
     * Performs the insert based on the provided op
     * @param opArgs - The ops args for the op
     * @returns True if the insert was applied. False if it could not be.
     */
    private applyInsertOp(opArgs: IMergeTreeDeltaOpArgs): boolean {
        assert(opArgs.op.type === ops.MergeTreeDeltaType.INSERT);
        const op = opArgs.op;
        const clientArgs = this.getClientSequenceArgs(opArgs);
        const range = this.getValidOpRange(op, clientArgs);

        if (!range) {
            return false;
        }

        let segments: ISegment[] | undefined;
        if (op.seg) {
            segments = [this.specToSegment(op.seg)];
        } else if (op.register) {
            if (range.end) {
                this.copy(range, op.register, clientArgs);
                // Enqueue an empty segment group to be dequeued on ack
                //
                if (clientArgs.sequenceNumber === UnassignedSequenceNumber) {
                    this.mergeTree.pendingSegments.enqueue({ segments: [], localSeq: this.getCollabWindow().localSeq });
                }
                return true;
            }
            segments = this.registerCollection.get(
                this.getLongClientId(clientArgs.clientId),
                op.register);
        }

        if (!segments || segments.length === 0) {
            return false;
        }

        let traceStart: Trace | undefined;
        if (this.measureOps) {
            traceStart = Trace.start();
        }

        this.mergeTree.insertSegments(
            range.start,
            segments,
            clientArgs.referenceSequenceNumber,
            clientArgs.clientId,
            clientArgs.sequenceNumber,
            opArgs);

        this.completeAndLogOp(opArgs, clientArgs, range, traceStart);

        return true;
    }

    /**
     *
     * @param opArgs - The op args of the op to complete
     * @param clientArgs - The client args for the op
     * @param range - The range the op applied to
     * @param clockStart - Optional. The clock start if timing data should be updated.
     */
    private completeAndLogOp(
        opArgs: IMergeTreeDeltaOpArgs,
        clientArgs: IMergeTreeClientSequenceArgs,
        range: IIntegerRange,
        traceStart?: Trace) {
        if (!opArgs.sequencedMessage) {
            if (traceStart) {
                this.localTime += elapsedMicroseconds(traceStart);
                this.localOps++;
            }
        } else {
            assert(this.mergeTree.getCollabWindow().currentSeq < clientArgs.sequenceNumber,
                "Incoming remote op sequence# <= local collabWindow's currentSequence#");
            assert(this.mergeTree.getCollabWindow().minSeq <= opArgs.sequencedMessage.minimumSequenceNumber,
                "Incoming remote op minSequence# < local collabWindow's minSequence#");
            if (traceStart) {
                this.accumTime += elapsedMicroseconds(traceStart);
                this.accumOps++;
                this.accumWindow += (this.getCurrentSeq() - this.getCollabWindow().minSeq);
            }
        }
        if (this.verboseOps && (!opArgs.sequencedMessage || !this.noVerboseRemoteAnnotate)) {
            console.log(
                `@cli ${this.getLongClientId(this.getCollabWindow().clientId)} ` +
                `seq ${clientArgs.sequenceNumber} ${opArgs.op.type} local ${!opArgs.sequencedMessage} ` +
                `start ${range.start} end ${range.end} refseq ${clientArgs.referenceSequenceNumber} ` +
                `cli ${clientArgs.clientId}`);
        }
    }

    /**
     * Returns a valid range for the op, or undefined
     * @param op - The op to generate the range for
     * @param clientArgs - The client args for the op
     */
    private getValidOpRange(
        op: ops.IMergeTreeAnnotateMsg | ops.IMergeTreeInsertMsg | ops.IMergeTreeRemoveMsg,
        clientArgs: IMergeTreeClientSequenceArgs): IIntegerRange | undefined {
        let start: number | undefined = op.pos1;
        if (start === undefined && op.relativePos1) {
            start = this.mergeTree.posFromRelativePos(
                op.relativePos1,
                clientArgs.referenceSequenceNumber,
                clientArgs.clientId);
        }

        let end: number | undefined = op.pos2;
        if (end === undefined && op.relativePos2) {
            end = this.mergeTree.posFromRelativePos(
                op.relativePos2,
                clientArgs.referenceSequenceNumber,
                clientArgs.clientId);
        }

        // Validate if local op
        if (clientArgs.clientId === this.getClientId()) {
            const length = this.getLength();

            const invalidPositions: string[] = [];

            // Validate start position
            //
            if (start === undefined
                || start < 0
                || start > length
                || start === length && op.type !== ops.MergeTreeDeltaType.INSERT) {
                invalidPositions.push("start");
            }
            // Validate end if not insert, or insert has end
            //
            if (op.type !== ops.MergeTreeDeltaType.INSERT || end !== undefined) {
                if (end === undefined || end <= start) {
                    invalidPositions.push("end");
                }
            }

            if (invalidPositions.length > 0) {
                this.logger.sendErrorEvent({
                    currentSeq: this.getCurrentSeq(),
                    end,
                    eventName: "InvalidOpRange",
                    invalidPositions: invalidPositions.toString(),
                    length,
                    opPos1: op.pos1,
                    opPos1Relative: op.relativePos1 !== undefined,
                    opPos2: op.pos2,
                    opPos2Relative: op.relativePos2 !== undefined,
                    opRefSeq: clientArgs.referenceSequenceNumber,
                    opSeq: clientArgs.sequenceNumber,
                    opType: op.type,
                    start,
                });
                return undefined;
            }
        }

        return { start, end };
    }

    /**
     * Gets the client args from the op if remote, otherwise uses the local clients info
     * @param opArgs - The op arg to get the client sequence args for
     */
    private getClientSequenceArgs(opArgs: IMergeTreeDeltaOpArgs): IMergeTreeClientSequenceArgs {
        // If there this no sequenced message, then the op is local
        // and unacked, so use this clients sequenced args
        //
        if (!opArgs.sequencedMessage) {
            const segWindow = this.getCollabWindow();
            return {
                clientId: segWindow.clientId,
                referenceSequenceNumber: segWindow.currentSeq,
                sequenceNumber: this.getLocalSequenceNumber(),
            };
        } else {
            return {
                clientId: this.getShortClientId(opArgs.sequencedMessage.clientId),
                referenceSequenceNumber: opArgs.sequencedMessage.referenceSequenceNumber,
                sequenceNumber: opArgs.sequencedMessage.sequenceNumber,
            };
        }
    }

    /**
     * @param range - The range to copy into the register
     * @param register - The name of the register to copy to range into
     * @param clientArgs - The client args to use when evaluating the range for copying
     */
    private copy(range: IIntegerRange, register: string, clientArgs: IMergeTreeClientSequenceArgs) {
        const segs = this.mergeTree.cloneSegments(
            clientArgs.referenceSequenceNumber,
            clientArgs.clientId,
            range.start,
            range.end);
        this.registerCollection.set(
            this.getLongClientId(clientArgs.clientId), register, segs);
    }

    private ackPendingSegment(opArgs: IMergeTreeDeltaOpArgs) {
        const ackOp = (deltaOpArgs: IMergeTreeDeltaOpArgs) => {
            let trace: Trace | undefined;
            if (this.measureOps) {
                trace = Trace.start();
            }

            this.mergeTree.ackPendingSegment(deltaOpArgs, this.verboseOps);
            if (deltaOpArgs.op.type === ops.MergeTreeDeltaType.ANNOTATE) {
                if (deltaOpArgs.op.combiningOp && (deltaOpArgs.op.combiningOp.name === "consensus")) {
                    this.updateConsensusProperty(deltaOpArgs.op, deltaOpArgs.sequencedMessage);
                }
            }

            if (trace) {
                this.accumTime += elapsedMicroseconds(trace);
                this.accumOps++;
                this.accumWindow += (this.getCurrentSeq() - this.getCollabWindow().minSeq);
            }

            if (this.verboseOps) {
                console.log(`@cli ${this.getLongClientId(this.getCollabWindow().clientId)} ` +
                    `ack seq # ${deltaOpArgs.sequencedMessage.sequenceNumber}`);
            }
        };

        if (opArgs.op.type === ops.MergeTreeDeltaType.GROUP) {
            for (const memberOp of opArgs.op.ops) {
                ackOp({
                    groupOp: opArgs.op,
                    op: memberOp,
                    sequencedMessage: opArgs.sequencedMessage,
                });
            }
        } else {
            ackOp(opArgs);
        }
    }

    // as functions are modified move them above the eslint-disabled waterline and lint them

    cloneFromSegments() {
        const clone = new Client(this.specToSegment, this.logger, this.mergeTree.options);
        const segments: ISegment[] = [];
        const newRoot = this.mergeTree.blockClone(this.mergeTree.root, segments);
        clone.mergeTree.root = newRoot;
        return clone;
    }
    getOrAddShortClientId(longClientId: string, branchId = 0) {
        if (!this.clientNameToIds.get(longClientId)) {
            this.addLongClientId(longClientId, branchId);
        }
        return this.getShortClientId(longClientId);
    }
    getShortClientId(longClientId: string) {
        return this.clientNameToIds.get(longClientId).data.clientId;
    }
    getLongClientId(shortClientId: number) {
        if (shortClientId >= 0) {
            return this.shortClientIdMap[shortClientId];
        }
        else {
            return "original";
        }
    }
    addLongClientId(longClientId: string, branchId = 0) {
        this.clientNameToIds.put(longClientId, {
            branchId,
            clientId: this.shortClientIdMap.length,
        });
        this.shortClientIdMap.push(longClientId);
        this.shortClientBranchIdMap.push(branchId);
    }
    getBranchId(clientId: number) {
        return this.shortClientBranchIdMap[clientId];
    }

    /**
     * During reconnect, we must find the positions to pending segments
     * relative to other pending segments. This methods computes that
     * position relative to a localSeq. Pending segments above the localSeq
     * will be ignored.
     *
     * @param segment - The segment to find the position for
     * @param localSeq - The localSeq to find the position of the segment at
     */
    public findReconnectionPostition(segment: ISegment, localSeq: number) {
        assert(localSeq <= this.mergeTree.collabWindow.localSeq, "localSeq greater than collab window");
        let segmentPosition = 0;
        /*
            Walk the segments up to the current segment, and calculate it's
            position taking into account local segments that were modified,
            after the current segment.

            TODO: Consider embedding this information into the tree for
            more efficient look up of pending segment positions.
        */
        this.mergeTree.walkAllSegments(this.mergeTree.root, (seg) => {
            // If we've found the desired segment, terminate the walk and return 'segmentPosition'.
            if (seg === segment) {
                return false;
            }

            // Otherwise, advance segmentPosition if the segment has been inserted and not removed
            // with respect to the given 'localSeq'.
            //
            // Note that all ACKed / remote ops are applied and we only need concern ourself with
            // determining if locally pending ops fall before/after the given 'localSeq'.
            if ((seg.localSeq === undefined || seg.localSeq <= localSeq)                // Is inserted
                && (seg.removedSeq === undefined || seg.localRemovedSeq > localSeq)     // Not removed
            ) {
                segmentPosition += seg.cachedLength;
            }

            return true;
        });

        return segmentPosition;
    }

    private resetPendingDeltaToOps(
        resetOp: ops.IMergeTreeDeltaOp,
        segmentGroup: SegmentGroup): ops.IMergeTreeDeltaOp[] {
        assert(!!segmentGroup, "Segment group undefined");
        const NACKedSegmentGroup = this.mergeTree.pendingSegments.dequeue();
        assert(segmentGroup === NACKedSegmentGroup, "Segment group not at head of merge tree pending queue");

        const opList = [];
        // We need to sort the segments by ordinal, as the segments are not sorted in the segment group.
        // The reason they need them sorted, as they have the same local sequence number and which means
        // farther segments will  take into account nearer segments when calculating their position.
        // By sorting we ensure the nearer segment will be applied and sequenced before the father segments
        // so their recalulated positions will be correct.
        for (const segment of segmentGroup.segments.sort((a, b) => a.ordinal < b.ordinal ? -1 : 1)) {
            const segmentSegGroup = segment.segmentGroups.dequeue();
            assert(segmentGroup === segmentSegGroup,
                "Segment group not at head of segment pending queue");
            const segmentPosition = this.findReconnectionPostition(segment, segmentGroup.localSeq);
            let newOp: ops.IMergeTreeDeltaOp | undefined;
            switch (resetOp.type) {
                case ops.MergeTreeDeltaType.ANNOTATE:
                    assert(segment.propertyManager?.hasPendingProperties() === true,
                        "Segment has no pending properties");
                    newOp = OpBuilder.createAnnotateRangeOp(
                        segmentPosition,
                        segmentPosition + segment.cachedLength,
                        resetOp.props,
                        resetOp.combiningOp);
                    break;

                case ops.MergeTreeDeltaType.INSERT:
                    assert(segment.seq === UnassignedSequenceNumber);
                    newOp = OpBuilder.createInsertSegmentOp(
                        segmentPosition,
                        segment);
                    break;

                case ops.MergeTreeDeltaType.REMOVE:
                    if (segment.localRemovedSeq !== undefined) {
                        newOp = OpBuilder.createRemoveRangeOp(
                            segmentPosition,
                            segmentPosition + segment.cachedLength);
                    }
                    break;

                default:
                    throw new Error(`Invalid op type`);
            }

            if (newOp) {
                const newSegmentGroup: SegmentGroup = { segments: [], localSeq: segmentGroup.localSeq };
                segment.segmentGroups.enqueue(newSegmentGroup);
                this.mergeTree.pendingSegments.enqueue(newSegmentGroup);
                opList.push(newOp);
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return opList;
    }

    private applyRemoteOp(opArgs: IMergeTreeDeltaOpArgs) {
        const op = opArgs.op;
        const msg = opArgs.sequencedMessage;
        this.getOrAddShortClientId(msg.clientId);
        switch (op.type) {
            case ops.MergeTreeDeltaType.INSERT:
                this.applyInsertOp(opArgs);
                break;
            case ops.MergeTreeDeltaType.REMOVE:
                this.applyRemoveRangeOp(opArgs);
                break;
            case ops.MergeTreeDeltaType.ANNOTATE:
                this.applyAnnotateRangeOp(opArgs);
                break;
            case ops.MergeTreeDeltaType.GROUP: {
                for (const memberOp of op.ops) {
                    this.applyRemoteOp({
                        op: memberOp,
                        groupOp: op,
                        sequencedMessage: msg,
                    });
                }
                break;
            }
            default:
                break;
        }
    }

    public applyMsg(msg: ISequencedDocumentMessage) {
        // Ensure client ID is registered
        // TODO support for more than two branch IDs
        // The existence of msg.origin means we are a branch message - and so should be marked as 0
        // The non-existence of msg.origin indicates we are local - and should inherit the collab mode ID
        const branchId = msg.origin ? 0 : this.mergeTree.localBranchId;
        this.getOrAddShortClientId(msg.clientId, branchId);
        // Apply if an operation message
        if (msg.type === MessageType.Operation) {
            const opArgs: IMergeTreeDeltaOpArgs = {
                op: msg.contents as ops.IMergeTreeOp,
                sequencedMessage: msg,
            };
            if (opArgs.sequencedMessage.clientId === this.longClientId) {
                this.ackPendingSegment(opArgs);
            }
            else {
                this.applyRemoteOp(opArgs);
            }
        }

        this.updateSeqNumbers(msg.minimumSequenceNumber, msg.sequenceNumber);
    }

    public updateSeqNumbers(min: number, seq: number) {
        const collabWindow = this.mergeTree.getCollabWindow();
        // Equal is fine here due to SharedSegmentSequence<>.snapshotContent() potentially updating with same #
        assert(collabWindow.currentSeq <= seq, "Incoming op sequence# < local collabWindow's currentSequence#");
        collabWindow.currentSeq = seq;
        assert(min <= seq, "Incoming op sequence# < minSequence#");
        this.updateMinSeq(min);
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
        const shortRemoteClientId = this.getOrAddShortClientId(remoteClientId);
        return this.mergeTree.resolveRemoteClientPosition(
            remoteClientPosition,
            remoteClientRefSeq,
            shortRemoteClientId);
    }

    /**
     *  Given an pending operation and segment group, regenerate the op, so it
     *  can be resubmitted
     * @param resetOp - The op to reset
     * @param segmentGroup - The segment group associated with the op
     */
    public regeneratePendingOp(
        resetOp: ops.IMergeTreeOp,
        segmentGroup: SegmentGroup | SegmentGroup[],
    ): ops.IMergeTreeOp {
        const trace = Trace.start();
        try {
            const opList: ops.IMergeTreeDeltaOp[] = [];

            if (resetOp.type === ops.MergeTreeDeltaType.GROUP) {
                if (Array.isArray(segmentGroup)) {
                    assert(resetOp.ops.length === segmentGroup.length,
                        "Number of ops in 'resetOp' must match the number of segment groups provided.");

                    for (let i = 0; i < resetOp.ops.length; i++) {
                        opList.push(
                            ...this.resetPendingDeltaToOps(resetOp.ops[i], segmentGroup[i]));
                    }
                } else {
                    // A group op containing a single op will pass a direct reference to 'segmentGroup'
                    // rather than an array of segment groups.  (See 'peekPendingSegmentGroups()')
                    assert(resetOp.ops.length === 1,
                        "Number of ops in 'resetOp' must match the number of segment groups provided.");
                    opList.push(...this.resetPendingDeltaToOps(resetOp.ops[0], segmentGroup));
                }
            } else {
                assert((resetOp.type as any) !== ops.MergeTreeDeltaType.GROUP);
                assert(!Array.isArray(segmentGroup));
                opList.push(
                    ...this.resetPendingDeltaToOps(resetOp, segmentGroup));
            }
            return opList.length === 1 ? opList[0] : OpBuilder.createGroupOp(...opList);
        } finally {
            this.logger.sendPerformanceEvent({
                eventName: "MergeTree:RegeneratePendingOp",
                category: "performance",
                duration: elapsedMicroseconds(trace),
            });
        }
    }

    public createTextHelper() {
        return new MergeTreeTextHelper(this.mergeTree);
    }

    // TODO: Remove `catchUpMsgs` once new snapshot format is adopted as default.
    //       (See https://github.com/microsoft/FluidFramework/issues/84)
    public snapshot(
        runtime: IFluidDataStoreRuntime,
        handle: IFluidHandle,
        serializer: IFluidSerializer,
        catchUpMsgs: ISequencedDocumentMessage[],
    ) {
        const deltaManager = runtime.deltaManager;
        const minSeq = deltaManager.minimumSequenceNumber;

        // Catch up to latest MSN, if we have not had a chance to do it.
        // Required for case where FluidDataStoreRuntime.attachChannel()
        // generates snapshot right after loading data store.

        this.updateSeqNumbers(minSeq, deltaManager.lastSequenceNumber);

        // One of the snapshots (from SPO) I observed to have chunk.chunkSequenceNumber > minSeq!
        // Not sure why - need to catch it sooner
        assert(this.getCollabWindow().minSeq === minSeq);

        // TODO: Remove options flag once new snapshot format is adopted as default.
        //       (See https://github.com/microsoft/FluidFramework/issues/84)
        if (this.mergeTree.options?.newMergeTreeSnapshotFormat === true) {
            assert(
                catchUpMsgs === undefined || catchUpMsgs.length === 0,
                "New format should not emit catchup ops");
            const snap = new SnapshotV1(this.mergeTree, this.logger);
            snap.extractSync();
            return snap.emit(serializer, handle);
        } else {
            const snap = new SnapshotLegacy(this.mergeTree, this.logger);
            snap.extractSync();
            return snap.emit(catchUpMsgs, serializer, handle);
        }
    }

    public async load(
        runtime: IFluidDataStoreRuntime,
        storage: IChannelStorageService,
        serializer: IFluidSerializer,
    ): Promise<{ catchupOpsP: Promise<ISequencedDocumentMessage[]> }> {
        const loader = new SnapshotLoader(runtime, this, this.mergeTree, this.logger, serializer);

        return loader.initialize(storage);
    }

    getStackContext(startPos: number, rangeLabels: string[]) {
        return this.mergeTree.getStackContext(startPos, this.getCollabWindow().clientId, rangeLabels);
    }

    private getLocalSequenceNumber() {
        const segWindow = this.getCollabWindow();
        if (segWindow.collaborating) {
            return UnassignedSequenceNumber;
        }
        else {
            return UniversalSequenceNumber;
        }
    }
    localTransaction(groupOp: ops.IMergeTreeGroupMsg) {
        for (const op of groupOp.ops) {
            const opArgs: IMergeTreeDeltaOpArgs = {
                op,
                groupOp,
            };
            switch (op.type) {
                case ops.MergeTreeDeltaType.INSERT:
                    this.applyInsertOp(opArgs);
                    break;
                case ops.MergeTreeDeltaType.ANNOTATE:
                    this.applyAnnotateRangeOp(opArgs);
                    break;
                case ops.MergeTreeDeltaType.REMOVE:
                    this.applyRemoveRangeOp(opArgs);
                    break;
                default:
                    break;
            }
        }
    }
    updateConsensusProperty(op: ops.IMergeTreeAnnotateMsg, msg: ISequencedDocumentMessage) {
        const markerId = op.relativePos1.id;
        const consensusInfo = this.pendingConsensus.get(markerId);
        if (consensusInfo) {
            consensusInfo.marker.addProperties(op.props, op.combiningOp, msg.sequenceNumber);
        }
        this.mergeTree.addMinSeqListener(msg.sequenceNumber, () => consensusInfo.callback(consensusInfo.marker));
    }

    updateMinSeq(minSeq: number) {
        let trace: Trace | undefined;
        if (this.measureOps) {
            trace = Trace.start();
        }
        this.mergeTree.setMinSeq(minSeq);
        if (trace) {
            const elapsed = elapsedMicroseconds(trace);
            this.accumWindowTime += elapsed;
            if (elapsed > this.maxWindowTime) {
                this.maxWindowTime = elapsed;
            }
        }
    }

    getContainingSegment<T extends ISegment>(pos: number) {
        const segWindow = this.mergeTree.getCollabWindow();
        return this.mergeTree.getContainingSegment<T>(pos, segWindow.currentSeq, segWindow.clientId);
    }

    getPropertiesAtPosition(pos: number) {
        const segWindow = this.getCollabWindow();
        if (this.verboseOps) {
            // eslint-disable-next-line max-len
            console.log(`getPropertiesAtPosition cli ${this.getLongClientId(segWindow.clientId)} ref seq ${segWindow.currentSeq}`);
        }

        let propertiesAtPosition: Properties.PropertySet | undefined;
        const segoff = this.getContainingSegment(pos);
        const seg = segoff.segment;
        if (seg) {
            propertiesAtPosition = seg.properties;
        }
        return propertiesAtPosition;
    }
    getRangeExtentsOfPosition(pos: number) {
        const segWindow = this.getCollabWindow();
        if (this.verboseOps) {
            // eslint-disable-next-line max-len
            console.log(`getRangeExtentsOfPosition cli ${this.getLongClientId(segWindow.clientId)} ref seq ${segWindow.currentSeq}`);
        }

        let posStart: number | undefined;
        let posAfterEnd: number | undefined;

        const segoff = this.getContainingSegment(pos);
        const seg = segoff.segment;
        if (seg) {
            posStart = this.getPosition(seg);
            posAfterEnd = posStart + seg.cachedLength;
        }
        return { posStart, posAfterEnd };
    }
    getCurrentSeq() {
        return this.getCollabWindow().currentSeq;
    }
    getClientId() {
        return this.getCollabWindow().clientId;
    }

    getLength() { return this.mergeTree.length; }

    startOrUpdateCollaboration(longClientId: string | undefined, minSeq = 0, currentSeq = 0, branchId = 0) {
        // we should always have a client id if we are collaborating
        // if the client id is undefined we are likely bound to a detached
        // container, so we should keep going in local mode. once
        // the container attaches this will be called again on connect with the
        // client id
        if (longClientId !== undefined) {
            if (this.longClientId === undefined) {
                this.longClientId = longClientId;
                this.addLongClientId(this.longClientId, branchId);
                this.mergeTree.startCollaboration(
                    this.getShortClientId(this.longClientId), minSeq, currentSeq, branchId);
            } else {
                const oldClientId = this.longClientId;
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const oldData = this.clientNameToIds.get(oldClientId)!.data;
                this.longClientId = longClientId;
                this.clientNameToIds.put(longClientId, oldData);
                this.shortClientIdMap[oldData.clientId] = longClientId;
            }
        }
    }

    findTile(startPos: number | undefined, tileLabel: string, preceding = true) {
        const clientId = this.getClientId();
        return this.mergeTree.findTile(startPos, clientId, tileLabel, preceding);
    }
}
