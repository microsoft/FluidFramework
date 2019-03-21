import { ISequencedDocumentMessage, MessageType } from "@prague/container-definitions";
import * as assert from "assert";
import { IIntegerRange } from "./base";
import * as Collections from "./collections";
import { IMergeTreeClientSequenceArgs, IMergeTreeDeltaOpArgs } from "./index";
import {
    ClientIds, clock, compareStrings, elapsedMicroseconds, IConsensusInfo, ISegment,
    IUndoInfo, Marker, MergeTree, RegisterCollection, SegmentGroup, TextSegment,
    UnassignedSequenceNumber, UniversalSequenceNumber,
} from "./mergeTree";
import * as OpBuilder from "./opBuilder";
import * as ops from "./ops";
import * as Properties from "./properties";

export class Client {
    public readonly mergeTree: MergeTree;
    public readonly q: Collections.List<ISequencedDocumentMessage>;
    public readonly checkQ: Collections.List<string>;

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

    private localSequenceNumber = UnassignedSequenceNumber;

    constructor(
        initText: string,
        // Passing this callback would be unnecessary if Client were merged with SegmentSequence
        // (See https://github.com/Microsoft/Prague/issues/1791).
        private readonly specToSegment: (spec: ops.IJSONSegment) => ISegment,
        options?: Properties.PropertySet,
    ) {
        this.mergeTree = new MergeTree(initText, options);
        this.mergeTree.getLongClientId = (id) => this.getLongClientId(id);
        this.mergeTree.clientIdToBranchId = this.shortClientBranchIdMap;
        this.q = Collections.ListMakeHead<ISequencedDocumentMessage>();
        this.checkQ = Collections.ListMakeHead<string>();
    }
    /**
     * Annotate a maker and call the callback on concensus.
     * @param marker The marker to annotate
     * @param props The properties to annotate the marker with
     * @param consensusCallback The callback called when consensus is reached
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
     * @param marker The marker to annotate
     * @param props The properties to annotate the marker with
     * @param combiningOp Optional. Specifies how to combine values for the property, such as "incr" for increment.
     * @returns The annotate op if valid, otherwise undefined
     */
    public annotateMarker(
        marker: Marker,
        props: Properties.PropertySet,
        combiningOp: ops.ICombiningOp): ops.IMergeTreeAnnotateMsg {

        const annotateOp =
            OpBuilder.createAnnotateMarkerOp(marker, props, combiningOp);

        if (this.applyAnnotateRangeOp({local: true, op: annotateOp})) {
            return annotateOp;
        } else {
            return undefined;
        }
    }
    /**
     * Annotates the range with the provided properties
     * @param start The inclusive start postition of the range to annotate
     * @param end The exclusive end position of the range to annotate
     * @param props The properties to annotate the range with
     * @param combiningOp Optional. Specifies how to combine values for the property, such as "incr" for increment.
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

        if (this.applyAnnotateRangeOp({local: true, op: annotateOp})) {
            return annotateOp;
        } else {
            return undefined;
        }
    }

    /**
     * Removes the range and puts the content of the removed range in a register
     * if a register name is provided
     *
     * @param start The inclusive start of the range to remove
     * @param end The exclusive end of the range to remove
     * @param register Optional. The name of the register to store the removed range in
     */
    public removeRangeLocal(start: number, end: number, register?: string) {

        const removeOp = OpBuilder.createRemoveRangeOp(start, end, register);

        if (this.applyRemoveRangeOp({local: true, op: removeOp})) {
            return removeOp;
        } else {
            return undefined;
        }
    }

    /**
     * Performs the annotate based on the provided op
     * @param opArgs The ops args for the op
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
            this.copy(
                op.pos1,
                op.pos2,
                op.register,
                clientArgs.referenceSequenceNumber,
                clientArgs.clientId);
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
     * @param opArgs The ops args for the op
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
     *
     * @param opArgs The op args of the op to complete
     * @param clientArgs The client args for the op
     * @param range The range the op applied to
     * @param clockStart Optional. The clock start if timing data should be updated.
     */
    private completeAndLogOp(
        opArgs: IMergeTreeDeltaOpArgs,
        clientArgs: IMergeTreeClientSequenceArgs,
        range: IIntegerRange,
        clockStart?: number | [ number, number ]) {
        if (opArgs.local) {
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
        if (this.verboseOps && (opArgs.local || !this.noVerboseRemoteAnnote)) {
            console.log(
                `@cli ${this.getLongClientId(this.mergeTree.getCollabWindow().clientId)} ` +
                `seq ${clientArgs.sequenceNumber} ${opArgs.op.type} local ${opArgs.local} start ${range.start} ` +
                `end ${range.end} refseq ${clientArgs.referenceSequenceNumber} ` +
                `cli ${clientArgs.clientId}`);
        }
    }

    /**
     * Returns a valid range for the op, or undefined
     * @param op The op to generate the range for
     * @param clientArgs The client args for the op
     */
    private getValidOpRange(
        op: ops.IMergeTreeAnnotateMsg | ops.IMergeTreeInsertMsg | ops.IMergeTreeRemoveMsg,
        clientArgs: IMergeTreeClientSequenceArgs): IIntegerRange {

        const range: IIntegerRange = {
            end: op.pos2,
            start: op.pos1,
        };

        if (!range.start && op.relativePos1) {
            range.start = this.mergeTree.posFromRelativePos(op.relativePos1);
        }
        if (!range.end && op.relativePos2) {
            range.end = this.mergeTree.posFromRelativePos(op.relativePos2);
        }

        // valid start position
        //
        const length = this.mergeTree.getLength(clientArgs.referenceSequenceNumber, clientArgs.clientId);
        if (range.start === undefined
            || range.start < 0
            || range.start > length) {
            return undefined;
        }

        // valid end if not insert, or insert has end
        //
        if (op.type !== ops.MergeTreeDeltaType.INSERT || range.end !== undefined) {
            if (range.end === undefined || range.end < 0 || range.end - range.start < 0) {
                return undefined;
            }
        }

        return range;
    }

    /**
     * Get's the client args from the op if remote, otherwise uses the local clients info
     * @param opArgs The op arge to get the client sequence args for
     */
    private getClientSequenceArgs(opArgs: IMergeTreeDeltaOpArgs): IMergeTreeClientSequenceArgs {

        if (opArgs.local) {
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

// tslint:disable
// as functions are modified move them above the tslint: disabled waterline and lint them

    setLocalSequenceNumber(seq: number) {
        this.localSequenceNumber = seq;
    }
    resetLocalSequenceNumber() {
        this.localSequenceNumber = UnassignedSequenceNumber;
    }
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
        let clone = new Client("", this.specToSegment, this.mergeTree.options);
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
    // TODO: props, end
    makeInsertMarkerMsg(markerType: string, behaviors: ops.ReferenceType, pos: number, seq: number, refSeq: number, objectId: string) {
        return <ISequencedDocumentMessage>{
            clientId: this.longClientId,
            minimumSequenceNumber: undefined,
            clientSequenceNumber: 1,
            sequenceNumber: seq,
            referenceSequenceNumber: refSeq,
            objectId: objectId,
            userId: undefined,
            offset: seq,
            origin: null,
            contents: {
                type: ops.MergeTreeDeltaType.INSERT, marker: { type: markerType, behaviors }, pos1: pos
            },
            timestamp: Date.now(),
            traces: [],
            type: MessageType.Operation,
        };
    }
    makeInsertMsg(text: string, pos: number, seq: number, refSeq: number, objectId: string) {
        return <ISequencedDocumentMessage>{
            clientId: this.longClientId,
            sequenceNumber: seq,
            referenceSequenceNumber: refSeq,
            clientSequenceNumber: 1,
            minimumSequenceNumber: undefined,
            objectId: objectId,
            userId: undefined,
            offset: seq,
            origin: null,
            contents: {
                type: ops.MergeTreeDeltaType.INSERT, seg: new TextSegment(text).toJSONObject(), pos1: pos
            },
            timestamp: Date.now(),
            traces: [],
            type: MessageType.Operation,
        };
    }

    hasMessages(): boolean {
        return this.q.count() > 0;
    }
    enqueueMsg(msg: ISequencedDocumentMessage) {
        this.q.enqueue(msg);
    }
    dequeueMsg(): ISequencedDocumentMessage {
        return this.q.dequeue();
    }
    enqueueTestString() {
        this.checkQ.enqueue(this.getText());
    }
    segmentToOps(segment: ISegment, opList: ops.IMergeTreeOp[]) {
        // TODO: branches
        if (segment.seq === UnassignedSequenceNumber) {
            let pos = this.mergeTree.getOffset(segment, this.getCurrentSeq(), this.getClientId());
            let insertOp = <ops.IMergeTreeInsertMsg>{
                pos1: pos,
                seg: segment.toJSONObject(),
                type: ops.MergeTreeDeltaType.INSERT,
            };
            opList.push(insertOp);
        }
        if (segment.removedSeq === UnassignedSequenceNumber) {
            let start = this.mergeTree.getOffset(segment, this.getCurrentSeq(), this.getClientId());
            let removeOp = <ops.IMergeTreeRemoveMsg>{
                pos1: start,
                pos2: start + segment.cachedLength,
                type: ops.MergeTreeDeltaType.REMOVE,
            };
            opList.push(removeOp);
        }
    }
    transformOp(op: ops.IMergeTreeOp, referenceSequenceNumber: number, toSequenceNumber: number) {
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
    copy(start: number, end: number, registerId: string, refSeq: number, clientId: number) {
        let segs = this.mergeTree.cloneSegments(refSeq, clientId, start, end);
        this.registerCollection.set(
            this.getLongClientId(clientId), registerId, segs);
    }
    pasteLocal(register: string, pos: number, opArgs?: IMergeTreeDeltaOpArgs) {
        let segs = this.registerCollection.get(this.longClientId, register);
        if (segs) {
            this.mergeTree.startGroupOperation();
            // TODO: build tree from segs and insert all at once
            for (let seg of segs) {
                this.insertSegmentLocal(pos, seg, opArgs);
            }
            this.mergeTree.endGroupOperation();
        }
        return pos;
    }
    pasteRemote(pos: number, registerId: string, seq: number, refSeq: number, clientId: number, longClientId: string, opArgs?: IMergeTreeDeltaOpArgs) {
        let segs = this.registerCollection.get(longClientId, registerId);
        if (segs) {
            // TODO: build tree from segs and insert all at once
            for (let seg of segs) {
                this.insertSegmentRemote(seg, pos, seq, refSeq, clientId, opArgs);
            }
        }
        // TODO: error reporting
    }
    applyRemoteOp(opArgs: IMergeTreeDeltaOpArgs) {
        const op = opArgs.op;
        const msg = opArgs.sequencedMessage;
        let clid = this.getOrAddShortClientId(msg.clientId);
        switch (op.type) {
            case ops.MergeTreeDeltaType.INSERT:
                if (op.relativePos1) {
                    op.pos1 = this.mergeTree.posFromRelativePos(op.relativePos1, msg.referenceSequenceNumber, clid);
                    if (op.pos1 < 0) {
                        // TODO: event when marker id not found
                        return;
                    }
                }
                if (op.seg !== undefined) {
                    this.insertSegmentRemote(this.specToSegment(op.seg), op.pos1, msg.sequenceNumber, msg.referenceSequenceNumber, clid, opArgs);
                }
                else if (op.register !== undefined) {
                    // TODO: relative addressing
                    if (op.pos2 !== undefined) {
                        // copy
                        this.copy(op.pos1, op.pos2, op.register, msg.referenceSequenceNumber, clid);
                    }
                    else {
                        // paste
                        this.pasteRemote(op.pos1, op.register, msg.sequenceNumber, msg.referenceSequenceNumber, clid, msg.clientId, opArgs);
                    }
                }
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
                        local: opArgs.local,
                        op: memberOp,
                        groupOp: op,
                        sequencedMessage: msg,
                    });
                }
                break;
            }
        }
    }

    applyMsg(msg: ISequencedDocumentMessage) {
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
                local: msg.clientId === this.longClientId,
                op: msg.contents as ops.IMergeTreeOp,
                sequencedMessage: msg,
            };
            if (opArgs.local) {
                if (opArgs.op.type !== ops.MergeTreeDeltaType.ANNOTATE) {
                    this.ackPendingSegment(opArgs);
                } else {
                    const op = opArgs.op as ops.IMergeTreeAnnotateMsg;
                    if (op.combiningOp && (op.combiningOp.name === "consensus")) {
                        this.updateConsensusProperty(op, opArgs.sequencedMessage);
                    }
                }
            }
            else {
                this.applyRemoteOp(opArgs);
            }
        }
    }
    applyMessages(msgCount: number) {
        while (msgCount > 0) {
            let msg = this.q.dequeue();
            if (msg) {
                this.applyMsg(msg);
            }
            else {
                break;
            }
            msgCount--;
        }

        return true;
    }
    getLocalSequenceNumber() {
        let segWindow = this.mergeTree.getCollabWindow();
        if (segWindow.collaborating) {
            return this.localSequenceNumber;
        }
        else {
            return UniversalSequenceNumber;
        }
    }
    localTransaction(groupOp: ops.IMergeTreeGroupMsg, segmentGroup?: SegmentGroup) {
        segmentGroup = this.mergeTree.startGroupOperation(segmentGroup);
        for (let op of groupOp.ops) {
            const opArgs: IMergeTreeDeltaOpArgs = {
                local: true,
                op,
                groupOp,
            }
            switch (op.type) {
                case ops.MergeTreeDeltaType.INSERT:
                    if (op.relativePos1) {
                        op.pos1 = this.mergeTree.posFromRelativePos(op.relativePos1);
                        if (op.pos1 < 0) {
                            // TODO: raise exception or other error flow
                            break;
                        }
                    }
                    this.insertSegmentLocal(op.pos1, this.specToSegment(op.seg), opArgs);
                    break;
                case ops.MergeTreeDeltaType.ANNOTATE:
                    this.applyAnnotateRangeOp( opArgs);
                    break;
                case ops.MergeTreeDeltaType.REMOVE:
                    this.applyRemoveRangeOp(opArgs);
                    break;
                case ops.MergeTreeDeltaType.GROUP:
                    console.log("unhandled nested group op");
                    break;
            }
        }
        this.mergeTree.endGroupOperation();
        return segmentGroup;
    }
    updateConsensusProperty(op: ops.IMergeTreeAnnotateMsg, msg: ISequencedDocumentMessage) {
        let markerId = op.relativePos1.id;
        let consensusInfo = this.pendingConsensus.get(markerId);
        if (consensusInfo) {
            consensusInfo.marker.addProperties(op.props, op.combiningOp, msg.sequenceNumber);
        }
        this.mergeTree.addMinSeqListener(msg.sequenceNumber, () => consensusInfo.callback(consensusInfo.marker));
    }

    insertSegmentLocal(pos: number, segment: ISegment, opArgs?: IMergeTreeDeltaOpArgs) {
        let segWindow = this.mergeTree.getCollabWindow();
        let clientId = segWindow.clientId;
        let refSeq = segWindow.currentSeq;
        let seq = this.getLocalSequenceNumber();
        let clockStart: number | [ number, number ];
        if (this.measureOps) {
            clockStart = clock();
        }
        this.mergeTree.insertSegment(pos, refSeq, clientId, seq, segment, opArgs);
        if (this.measureOps) {
            this.localTime += elapsedMicroseconds(clockStart);
            this.localOps++;
        }
        if (this.verboseOps) {
            console.log(`insert local segment pos ${pos} cli ${this.getLongClientId(clientId)} ${segment.toString()} ref seq ${refSeq}`);
        }
    }

    insertSegmentRemote(segment: ISegment, pos: number, seq: number, refSeq: number, clientId: number, opArgs?: IMergeTreeDeltaOpArgs) {
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }

        this.mergeTree.insertSegment(pos, refSeq, clientId, seq, segment, opArgs);
        this.mergeTree.getCollabWindow().currentSeq = seq;
        if (this.measureOps) {
            this.accumTime += elapsedMicroseconds(clockStart);
            this.accumOps++;
            this.accumWindow += (this.getCurrentSeq() - this.mergeTree.getCollabWindow().minSeq);
        }
        if (this.verboseOps) {
            console.log(`@cli ${this.getLongClientId(this.mergeTree.getCollabWindow().clientId)} seg ${JSON.stringify(segment)} seq ${seq} insert remote pos ${pos} refseq ${refSeq} cli ${this.getLongClientId(clientId)}`);
        }
    }

    ackPendingSegment(opArgs: IMergeTreeDeltaOpArgs) {
        let clockStart: number | [ number, number ];
        if (this.measureOps) {
            clockStart = clock();
        }
        this.mergeTree.ackPendingSegment(opArgs, this.verboseOps);
        const seq = opArgs.sequencedMessage.sequenceNumber;
        this.mergeTree.getCollabWindow().currentSeq = seq;
        if (this.measureOps) {
            this.accumTime += elapsedMicroseconds(clockStart);
            this.accumOps++;
            this.accumWindow += (this.getCurrentSeq() - this.mergeTree.getCollabWindow().minSeq);
        }
        if (this.verboseOps) {
            console.log(`@cli ${this.getLongClientId(this.mergeTree.getCollabWindow().clientId)} ack seq # ${seq}`);
        }
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
    getTextAndMarkers(label: string) {
        let segmentWindow = this.mergeTree.getCollabWindow();
        return this.mergeTree.getTextAndMarkers(segmentWindow.currentSeq, segmentWindow.clientId, label);
    }
    getText(start?: number, end?: number) {
        let segmentWindow = this.mergeTree.getCollabWindow();
        return this.mergeTree.getText(segmentWindow.currentSeq, segmentWindow.clientId, "", start, end);
    }
    /**
     * Adds spaces for markers and components, so that position calculations account for them
     */
    getTextWithPlaceholders() {
        let segmentWindow = this.mergeTree.getCollabWindow();
        return this.mergeTree.getText(segmentWindow.currentSeq, segmentWindow.clientId, " ");
    }
    getTextRangeWithPlaceholders(start: number, end: number) {
        let segmentWindow = this.mergeTree.getCollabWindow();
        return this.mergeTree.getText(segmentWindow.currentSeq, segmentWindow.clientId, " ", start, end);
    }
    getTextRangeWithMarkers(start: number, end: number) {
        let segmentWindow = this.mergeTree.getCollabWindow();
        return this.mergeTree.getText(segmentWindow.currentSeq, segmentWindow.clientId, "*", start, end);
    }
    getLength() {
        let segmentWindow = this.mergeTree.getCollabWindow();
        return this.mergeTree.getLength(segmentWindow.currentSeq, segmentWindow.clientId);
    }
    relText(clientId: number, refSeq: number) {
        return `cli: ${this.getLongClientId(clientId)} refSeq: ${refSeq}: ` + this.mergeTree.getText(refSeq, clientId);
    }
    relItems(clientId: number, refSeq: number) {
        return `cli: ${this.getLongClientId(clientId)} refSeq: ${refSeq}: ` + this.mergeTree.getItems(refSeq, clientId).toString();
    }
    startCollaboration(longClientId: string,  minSeq = 0, branchId = 0) {
        this.longClientId = longClientId;
        this.addLongClientId(longClientId, branchId);
        this.mergeTree.startCollaboration(this.getShortClientId(this.longClientId), minSeq, branchId);
    }
    updateCollaboration(longClientId: string) {
        const oldClientId = this.longClientId;
        let oldData = this.clientNameToIds.get(oldClientId).data;
        this.longClientId = longClientId;
        this.clientNameToIds.put(longClientId, oldData);
        this.shortClientIdMap[oldData.clientId] = longClientId;
    }
    findTile(startPos: number, tileLabel: string, preceding = true) {
        const clientId = this.getClientId();
        return this.mergeTree.findTile(startPos, clientId, tileLabel, preceding);
    }
}