import { ISequencedDocumentMessage, ITelemetryLogger, MessageType } from "@prague/container-definitions";
import * as assert from "assert";
import { IIntegerRange } from "./base";
import * as Collections from "./collections";
import { IMergeTreeClientSequenceArgs, IMergeTreeDeltaOpArgs } from "./index";
import {
    ClientIds,
    clock,
    compareStrings,
    elapsedMicroseconds,
    IConsensusInfo,
    ISegment,
    IUndoInfo,
    Marker,
    MergeTree,
    RegisterCollection,
    SegmentGroup,
    UnassignedSequenceNumber,
    UniversalSequenceNumber,
} from "./mergeTree";
import * as OpBuilder from "./opBuilder";
import * as ops from "./ops";
import * as Properties from "./properties";

export class Client {
    public readonly mergeTree: MergeTree;

    public verboseOps = false;
    public noVerboseRemoteAnnote = false;
    public measureOps = false;
    public registerCollection = new RegisterCollection();
    public accumTime = 0;
    public localTime = 0;
    public localOps = 0;
    public accumWindowTime = 0;
    public accumWindow = 0;
    public accumOps = 0;
    public maxWindowTime = 0;
    public longClientId: string;
    public undoSegments: IUndoInfo[];
    public redoSegments: IUndoInfo[];

    private readonly clientNameToIds = new Collections.RedBlackTree<string, ClientIds>(compareStrings);
    private readonly shortClientIdMap: string[] = [];
    private readonly shortClientBranchIdMap: number[] = [];
    private readonly pendingConsensus = new Map<string, IConsensusInfo>();

    constructor(
        // Passing this callback would be unnecessary if Client were merged with SharedSegmentSequence
        // (See https://github.com/Microsoft/Prague/issues/1791).
        private readonly specToSegment: (spec: ops.IJSONSegment) => ISegment,
        private readonly logger: ITelemetryLogger,
        options?: Properties.PropertySet,
    ) {
        this.mergeTree = new MergeTree(options);
        this.mergeTree.getLongClientId = (id) => this.getLongClientId(id);
        this.mergeTree.clientIdToBranchId = this.shortClientBranchIdMap;
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
        consensusCallback: (m: Marker) => void): ops.IMergeTreeAnnotateMsg {

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
        combiningOp: ops.ICombiningOp): ops.IMergeTreeAnnotateMsg {

        const annotateOp =
            OpBuilder.createAnnotateMarkerOp(marker, props, combiningOp);

        if (this.applyAnnotateRangeOp({op: annotateOp})) {
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
     * @param combiningOp - Optional. Specifies how to combine values for the property, such as "incr" for increment.
     * @returns The annotate op if valid, otherwise undefined
     */
    public annotateRangeLocal(
        start: number,
        end: number,
        props: Properties.PropertySet,
        combiningOp: ops.ICombiningOp): ops.IMergeTreeAnnotateMsg {

        const annotateOp = OpBuilder.createAnnotateRangeOp(
            start,
            end,
            props,
            combiningOp);

        if (this.applyAnnotateRangeOp({op: annotateOp})) {
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

        if (this.applyRemoveRangeOp({op: removeOp})) {
            return removeOp;
        }
        return undefined;
    }

    /**
     * @param pos - The position to insert the segment at
     * @param segment - The segment to insert
     */
    public insertSegmentLocal(pos: number, segment: ISegment): ops.IMergeTreeInsertMsg {

        const insertOp = OpBuilder.createInsertSegmentOp(pos, segment);
        if (this.applyInsertOp({op: insertOp})) {
            return insertOp;
        }
        return undefined;
    }

    /**
     * @param leftSibling - The segment that should be the left sibling of the inserted segment
     * @param segment - The segment to insert
     */
    public insertSiblingSegment(leftSibling: ISegment, segment: ISegment): ops.IMergeTreeInsertMsg {
        // generate the op for the expected position of the new sibling segment
        let opPos =
            this.mergeTree.getOffset(leftSibling, this.getCurrentSeq(), this.getClientId());
        // only add the length if the segment isn't removed
        if (!leftSibling.removedSeq) {
            opPos += leftSibling.cachedLength;
        }
        const insertOp = OpBuilder.createInsertSegmentOp(opPos, segment);

        let clockStart: number | [ number, number ];
        if (this.measureOps) {
            clockStart = clock();
        }
        const opArgs = { op: insertOp };
        this.mergeTree.insertSiblingSegment(
            leftSibling,
            segment,
            UnassignedSequenceNumber,
            this.getClientId(),
            opArgs);

        this.completeAndLogOp(opArgs, this.getClientSequenceArgs(opArgs), {start: opPos, end: undefined}, clockStart);

        return insertOp;
    }

    /**
     * @param pos - The position to insert the register contents at
     * @param register - The name of the register to insert the value of
     */
    public pasteLocal(pos: number, register: string) {
        const insertOp = OpBuilder.createInsertFromRegisterOp(pos, register);
        if (this.applyInsertOp({op: insertOp})) {
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
        if (this.applyInsertOp({op: insertOp})) {
            return insertOp;
        }
        return undefined;
    }

    public walkSegments(start: number, end: number, handler: (segment: ISegment) => void) {

        this.mergeTree.mapRange(
            {
                leaf: (segment) => {
                    handler(segment);
                    return true;
                },
            },
            this.getCurrentSeq(),
            this.getClientId(),
            undefined,
            start,
            (end === undefined) ? this.getLength() : end);
    }

    public getOffset(segment: ISegment): number {
        return this.mergeTree.getOffset(segment, this.getCurrentSeq(), this.getClientId());
    }

    /**
     * Performs the annotate based on the provided op
     * @param opArgs - The ops args for the op
     * @returns True if the annotate was applied. False if it could not be.
     */
    private applyRemoveRangeOp(opArgs: IMergeTreeDeltaOpArgs): boolean {
        assert.equal(opArgs.op.type, ops.MergeTreeDeltaType.REMOVE);
        const op = opArgs.op as ops.IMergeTreeRemoveMsg;
        const clientArgs = this.getClientSequenceArgs(opArgs);
        const range = this.getValidOpRange(op, clientArgs);
        if (!range) {
            return false;
        }

        if (op.register) {
            // cut
            this.copy(range, op.register, clientArgs);
        }

        let clockStart: number | [ number, number ];
        if (this.measureOps) {
            clockStart = clock();
        }

        this.mergeTree.markRangeRemoved(
            range.start,
            range.end,
            clientArgs.referenceSequenceNumber,
            clientArgs.clientId,
            clientArgs.sequenceNumber,
            false,
            opArgs);

        this.completeAndLogOp(opArgs, clientArgs, range, clockStart);

        return true;
    }

    /**
     * Performs the annotate based on the provided op
     * @param opArgs - The ops args for the op
     * @returns True if the annotate was applied. False if it could not be.
     */
    private applyAnnotateRangeOp(opArgs: IMergeTreeDeltaOpArgs): boolean {
        assert.equal(opArgs.op.type, ops.MergeTreeDeltaType.ANNOTATE);
        const op = opArgs.op as ops.IMergeTreeAnnotateMsg;
        const clientArgs = this.getClientSequenceArgs(opArgs);
        const range = this.getValidOpRange(op, clientArgs);

        if (!range) {
            return false;
        }

        let clockStart: number | [ number, number ];
        if (this.measureOps) {
            clockStart = clock();
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

        this.completeAndLogOp(opArgs, clientArgs, range, clockStart);

        return true;
    }

    /**
     * Performs the insert based on the provided op
     * @param opArgs - The ops args for the op
     * @returns True if the insert was applied. False if it could not be.
     */
    private applyInsertOp(opArgs: IMergeTreeDeltaOpArgs): boolean {
        assert.equal(opArgs.op.type, ops.MergeTreeDeltaType.INSERT);
        const op = opArgs.op as ops.IMergeTreeInsertMsg;
        const clientArgs = this.getClientSequenceArgs(opArgs);
        const range = this.getValidOpRange(op, clientArgs);

        if (!range) {
            return false;
        }

        let segments: ISegment[];
        if (op.seg) {
            // tslint:disable-next-line: no-unsafe-any
            segments = [this.specToSegment(op.seg)];
        } else if (op.register) {
            if (range.end) {
                this.copy(range, op.register, clientArgs);
                // enqueue an empty segment group to be dequeued on ack
                //
                if (clientArgs.sequenceNumber === UnassignedSequenceNumber) {
                    this.mergeTree.pendingSegments.enqueue({segments: []});
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

        let clockStart: number | [ number, number ];
        if (this.measureOps) {
            clockStart = clock();
        }

        this.mergeTree.insertSegments(
            range.start,
            segments,
            clientArgs.referenceSequenceNumber,
            clientArgs.clientId,
            clientArgs.sequenceNumber,
            opArgs);

        this.completeAndLogOp(opArgs, clientArgs, range, clockStart);

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
        clockStart?: number | [ number, number ]) {
        if (!opArgs.sequencedMessage) {
            if (clockStart) {
                this.localTime += elapsedMicroseconds(clockStart);
                this.localOps++;
            }
        } else {
            this.mergeTree.getCollabWindow().currentSeq = clientArgs.sequenceNumber;
            if (clockStart) {
                this.accumTime += elapsedMicroseconds(clockStart);
                this.accumOps++;
                this.accumWindow += (this.getCurrentSeq() - this.mergeTree.getCollabWindow().minSeq);
            }
        }
        if (this.verboseOps && (!opArgs.sequencedMessage || !this.noVerboseRemoteAnnote)) {
            console.log(
                `@cli ${this.getLongClientId(this.mergeTree.getCollabWindow().clientId)} ` +
                `seq ${clientArgs.sequenceNumber} ${opArgs.op.type} local ${!opArgs.sequencedMessage} ` +
                `start ${ range.start } end ${range.end} refseq ${clientArgs.referenceSequenceNumber} ` +
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
        clientArgs: IMergeTreeClientSequenceArgs): IIntegerRange {

        let start: number = op.pos1;
        if (start === undefined && op.relativePos1) {
            start = this.mergeTree.posFromRelativePos(op.relativePos1);
        }

        let end: number = op.pos2;
        if (end === undefined && op.relativePos2) {
            end = this.mergeTree.posFromRelativePos(op.relativePos2);
        }

        // validate if local op
        if (clientArgs.clientId === this.getClientId()) {
            const length = this.getLength();

            const invalidPositions: string[] = [];

            // validate start position
            //
            if (start === undefined
                || start < 0
                || start > length
                || start === length && op.type !== ops.MergeTreeDeltaType.INSERT) {
                invalidPositions.push("start");
            }
            // validate end if not insert, or insert has end
            //
            if (op.type !== ops.MergeTreeDeltaType.INSERT || end !== undefined) {
                if (end === undefined || end < start) {
                    invalidPositions.push("end");
                }
            }

            if (invalidPositions.length > 0) {
                this.logger.sendErrorEvent({
                    currentSeq: this.getCurrentSeq(),
                    end,
                    eventName: "InvalidOpRange",
                    invalidPositions,
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

        return {start, end};
    }

    /**
     * Get's the client args from the op if remote, otherwise uses the local clients info
     * @param opArgs - The op arge to get the client sequence args for
     */
    private getClientSequenceArgs(opArgs: IMergeTreeDeltaOpArgs): IMergeTreeClientSequenceArgs {

        // if there this no sequenced message, then the op is local
        // and unacked, so use this clients sequenced args
        //
        if (!opArgs.sequencedMessage) {
            const segWindow = this.mergeTree.getCollabWindow();
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
            let clockStart: number | [ number, number ];
            if (this.measureOps) {
                clockStart = clock();
            }

            this.mergeTree.ackPendingSegment(deltaOpArgs, this.verboseOps);
            if (deltaOpArgs.op.type === ops.MergeTreeDeltaType.ANNOTATE) {
                if (deltaOpArgs.op.combiningOp && (deltaOpArgs.op.combiningOp.name === "consensus")) {
                    this.updateConsensusProperty(deltaOpArgs.op, deltaOpArgs.sequencedMessage);
                }
            }

            if (this.measureOps) {
                this.accumTime += elapsedMicroseconds(clockStart);
                this.accumOps++;
                this.accumWindow += (this.getCurrentSeq() - this.mergeTree.getCollabWindow().minSeq);
            }

            if (this.verboseOps) {
                console.log(`@cli ${this.getLongClientId(this.mergeTree.getCollabWindow().clientId)} ` +
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
        this.mergeTree.collabWindow.currentSeq = opArgs.sequencedMessage.sequenceNumber;
    }
// tslint:disable
// as functions are modified move them above the tslint: disabled waterline and lint them

    undoSingleSequenceNumber(undoSegments: IUndoInfo[], redoSegments: IUndoInfo[]) {
        let len = undoSegments.length;
        let index = len - 1;
        let seq = undoSegments[index].seq;
        if (seq === 0) {
            return 0;
        }
        while (index >= 0) {
            let undoInfo = undoSegments[index];
            if (seq === undoInfo.seq) {
                this.mergeTree.cherryPickedUndo(undoInfo);
                redoSegments.push(undoInfo);
            }
            else {
                break;
            }
            index--;
        }
        undoSegments.length = index + 1;
        return seq;
    }
    historyToPct(pct: number) {
        let count = this.undoSegments.length + this.redoSegments.length;
        let curPct = this.undoSegments.length / count;
        let seq = -1;
        if (curPct >= pct) {
            while (curPct > pct) {
                seq = this.undoSingleSequenceNumber(this.undoSegments, this.redoSegments);
                curPct = this.undoSegments.length / count;
            }
        }
        else {
            while (curPct < pct) {
                seq = this.undoSingleSequenceNumber(this.redoSegments, this.undoSegments);
                curPct = this.undoSegments.length / count;
            }
        }
        return seq;
    }
    undo() {
        return this.undoSingleSequenceNumber(this.undoSegments, this.redoSegments);
    }
    redo() {
        return this.undoSingleSequenceNumber(this.redoSegments, this.undoSegments);
    }
    cloneFromSegments() {
        let clone = new Client(this.specToSegment, this.logger, this.mergeTree.options);
        let segments = <ISegment[]>[];
        let newRoot = this.mergeTree.blockClone(this.mergeTree.root, segments);
        clone.mergeTree.root = newRoot;
        let undoSeg = <IUndoInfo[]>[];
        for (let segment of segments) {
            if (segment.seq !== 0) {
                undoSeg.push({
                    seq: segment.seq,
                    seg: segment,
                    op: ops.MergeTreeDeltaType.INSERT
                });
            }
            if (segment.removedSeq !== undefined) {
                undoSeg.push({
                    seq: segment.removedSeq,
                    seg: segment,
                    op: ops.MergeTreeDeltaType.REMOVE
                });
            }
        }
        undoSeg = undoSeg.sort((a, b) => {
            if (b.seq === a.seq) {
                return 0;
            }
            else if (b.seq === UnassignedSequenceNumber) {
                return -1;
            }
            else if (a.seq === UnassignedSequenceNumber) {
                return 1;
            }
            else {
                return a.seq - b.seq;
            }
        });
        clone.undoSegments = undoSeg;
        clone.redoSegments = [];
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

    resetPendingSegmentToOp(segment: ISegment): ops.IMergeTreeOp {
        let op: ops.IMergeTreeOp;
        if (!segment.segmentGroups.empty) {
            segment.segmentGroups.clear();

            // the segment was added and removed, so we don't need to send any ops for it
            if (segment.seq === UnassignedSequenceNumber && segment.removedSeq === UnassignedSequenceNumber) {
                // set to the universal sequence number so it can be zambonied
                segment.removedSeq = UniversalSequenceNumber;
                segment.seq = UniversalSequenceNumber
                return undefined;
            }

            const segmentOffset = this.mergeTree.getOffset(segment, this.getCurrentSeq(), this.getClientId());

            // if removed we only need to send a remove op
            // if inserted, we only need to send insert, as that will contain props
            // if pending properties send annotate
            if (segment.removedSeq === UnassignedSequenceNumber) {

                op = OpBuilder.createRemoveRangeOp(
                    segmentOffset,
                    segmentOffset + segment.cachedLength);

            } else if (segment.seq === UnassignedSequenceNumber) {

                op = OpBuilder.createInsertSegmentOp(
                    segmentOffset,
                    segment);

                if (segment.propertyManager) {
                    segment.propertyManager.clearPendingProperties();
                }

            } else if (segment.propertyManager && segment.propertyManager.hasPendingProperties()) {

                const annotateInfo = segment.propertyManager.resetPendingPropertiesToOpDetails();
                op = OpBuilder.createAnnotateRangeOp(
                    segmentOffset,
                    segmentOffset + segment.cachedLength,
                    annotateInfo.props,
                    annotateInfo.combiningOp);
            }

            if (op) {
                const segmentGroup: SegmentGroup = { segments: [] };
                segment.segmentGroups.enqueue(segmentGroup);
                this.mergeTree.pendingSegments.enqueue(segmentGroup);
            }
        }
        return op;
    }

    private transformOp(op: ops.IMergeTreeOp, referenceSequenceNumber: number, toSequenceNumber: number) {
        if ((op.type == ops.MergeTreeDeltaType.ANNOTATE) ||
            (op.type == ops.MergeTreeDeltaType.REMOVE)) {
            let ranges = this.mergeTree.tardisRange(op.pos1, op.pos2, referenceSequenceNumber, toSequenceNumber);
            if (ranges.length == 1) {
                op.pos1 = ranges[0].start;
                op.pos2 = ranges[0].end;
            }
            else {
                let groupOp = <ops.IMergeTreeGroupMsg>{ type: ops.MergeTreeDeltaType.GROUP };
                groupOp.ops = ranges.map((range) => <ops.IMergeTreeOp>{
                    type: op.type,
                    pos1: range.start,
                    pos2: range.end,
                });
                return groupOp;
            }
        }
        else if (op.type == ops.MergeTreeDeltaType.INSERT) {
            op.pos1 = this.mergeTree.tardisPosition(op.pos1, referenceSequenceNumber, toSequenceNumber);
        }
        else if (op.type === ops.MergeTreeDeltaType.GROUP) {
            for (let i = 0, len = op.ops.length; i < len; i++) {
                op.ops[i] = this.transformOp(op.ops[i], referenceSequenceNumber, toSequenceNumber);
            }
        }
        return op;
    }
    transform(op: ops.IMergeTreeOp, referenceSequenceNumber: number, toSequenceNumber: number): ops.IMergeTreeOp {
        if (referenceSequenceNumber >= toSequenceNumber) {
            return op;
        }

        return this.transformOp(op, referenceSequenceNumber, toSequenceNumber);
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
                for (let memberOp of op.ops) {
                    this.applyRemoteOp({
                        op: memberOp,
                        groupOp: op,
                        sequencedMessage: msg,
                    });
                }
                break;
            }
        }
    }

    public applyMsg(msg: ISequencedDocumentMessage) {
        if ((msg !== undefined) && (msg.minimumSequenceNumber > this.mergeTree.getCollabWindow().minSeq)) {
            this.updateMinSeq(msg.minimumSequenceNumber);
        }
        // Ensure client ID is registered
        // TODO support for more than two branch IDs
        // The existance of msg.origin means we are a branch message - and so should be marked as 0
        // The non-existance of msg.origin indicates we are local - and should inherit the collab mode ID
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
    }
    private getLocalSequenceNumber() {
        let segWindow = this.mergeTree.getCollabWindow();
        if (segWindow.collaborating) {
            return UnassignedSequenceNumber;
        }
        else {
            return UniversalSequenceNumber;
        }
    }
    localTransaction(groupOp: ops.IMergeTreeGroupMsg) {
        for (let op of groupOp.ops) {
            const opArgs: IMergeTreeDeltaOpArgs = {
                op,
                groupOp,
            }
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
            }
        }
    }
    updateConsensusProperty(op: ops.IMergeTreeAnnotateMsg, msg: ISequencedDocumentMessage) {
        let markerId = op.relativePos1.id;
        let consensusInfo = this.pendingConsensus.get(markerId);
        if (consensusInfo) {
            consensusInfo.marker.addProperties(op.props, op.combiningOp, msg.sequenceNumber);
        }
        this.mergeTree.addMinSeqListener(msg.sequenceNumber, () => consensusInfo.callback(consensusInfo.marker));
    }

    updateMinSeq(minSeq: number) {
        let clockStart: number | [ number, number ];
        if (this.measureOps) {
            clockStart = clock();
        }
        this.mergeTree.updateGlobalMinSeq(minSeq);
        if (this.measureOps) {
            let elapsed = elapsedMicroseconds(clockStart);
            this.accumWindowTime += elapsed;
            if (elapsed > this.maxWindowTime) {
                this.maxWindowTime = elapsed;
            }
        }
    }
    getPropertiesAtPosition(pos: number) {
        let segWindow = this.mergeTree.getCollabWindow();
        if (this.verboseOps) {
            console.log(`getPropertiesAtPosition cli ${this.getLongClientId(segWindow.clientId)} ref seq ${segWindow.currentSeq}`);
        }

        let propertiesAtPosition: Properties.PropertySet;
        let segoff = this.mergeTree.getContainingSegment(pos, segWindow.currentSeq, segWindow.clientId);
        let seg = segoff.segment;
        if (seg) {
            propertiesAtPosition = seg.properties;
        }
        return propertiesAtPosition;
    }
    getRangeExtentsOfPosition(pos: number) {
        let segWindow = this.mergeTree.getCollabWindow();
        if (this.verboseOps) {
            console.log(`getRangeExtentsOfPosition cli ${this.getLongClientId(segWindow.clientId)} ref seq ${segWindow.currentSeq}`);
        }

        let posStart: number;
        let posAfterEnd: number;

        let segoff = this.mergeTree.getContainingSegment(pos, segWindow.currentSeq, segWindow.clientId);
        let seg = segoff.segment;
        if (seg) {
            posStart = this.mergeTree.getOffset(seg, segWindow.currentSeq, segWindow.clientId);
            posAfterEnd = posStart + seg.cachedLength;
        }
        return { posStart, posAfterEnd };
    }
    getCurrentSeq() {
        return this.mergeTree.getCollabWindow().currentSeq;
    }
    getClientId() {
        return this.mergeTree.getCollabWindow().clientId;
    }

    getLength() {
        let segmentWindow = this.mergeTree.getCollabWindow();
        return this.mergeTree.getLength(segmentWindow.currentSeq, segmentWindow.clientId);
    }
    startCollaboration(longClientId: string | undefined,  minSeq = 0, branchId = 0) {
        this.longClientId = longClientId ? longClientId : "original";
        this.addLongClientId(this.longClientId , branchId);
        this.mergeTree.startCollaboration(this.getShortClientId(this.longClientId), minSeq, branchId);
    }
    updateCollaboration(longClientId: string) {
        const oldClientId = this.longClientId;
        let oldData = this.clientNameToIds.get(oldClientId).data;
        this.longClientId = longClientId;
        this.clientNameToIds.put(longClientId, oldData);
        this.shortClientIdMap[oldData.clientId] = longClientId;
    }
    findTile(startPos: number | undefined, tileLabel: string, preceding = true) {
        const clientId = this.getClientId();
        return this.mergeTree.findTile(startPos, clientId, tileLabel, preceding);
    }
}