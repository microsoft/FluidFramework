// tslint:disable
import { OperationType } from "@prague/api-definitions";
import { ISequencedObjectMessage, IUser } from "@prague/runtime-definitions";
import { IRelativePosition } from "./index";
import { MergeTree, ClientIds, compareStrings, RegisterCollection, UnassignedSequenceNumber, Marker, IConsensusInfo, IUndoInfo, Segment, BaseSegment, SegmentType, TextSegment, UniversalSequenceNumber, SegmentGroup, clock, elapsedMicroseconds } from "./mergeTree";
import * as Collections from "./collections";
import * as ops from "./ops";
import * as Properties from "./properties";

export class Client {
    mergeTree: MergeTree;
    accumTime = 0;
    localTime = 0;
    localOps = 0;
    accumWindowTime = 0;
    maxWindowTime = 0;
    accumWindow = 0;
    accumOps = 0;
    verboseOps = false;
    noVerboseRemoteAnnote = false;
    measureOps = false;
    q: Collections.List<ISequencedObjectMessage>;
    checkQ: Collections.List<string>;
    clientSequenceNumber = 1;
    clientNameToIds = new Collections.RedBlackTree<string, ClientIds>(compareStrings);
    shortClientIdMap = <string[]>[];
    shortClientBranchIdMap = <number[]>[];
    shortClientUserInfoMap = <IUser[]>[];
    registerCollection = new RegisterCollection();
    localSequenceNumber = UnassignedSequenceNumber;
    opMarkersModified = <Marker[]>[];
    pendingConsensus = new Map<string, IConsensusInfo>();
    public longClientId: string;
    public userInfo: IUser;
    public undoSegments: IUndoInfo[];
    public redoSegments: IUndoInfo[];
    constructor(initText: string, options?: Properties.PropertySet) {
        this.mergeTree = new MergeTree(initText, options);
        this.mergeTree.getLongClientId = id => this.getLongClientId(id);
        this.mergeTree.getUserInfo = id => this.getUserInfo(id);
        this.mergeTree.markerModifiedHandler = marker => this.markerModified(marker);
        this.mergeTree.clientIdToBranchId = this.shortClientBranchIdMap;
        this.q = Collections.ListMakeHead<ISequencedObjectMessage>();
        this.checkQ = Collections.ListMakeHead<string>();
    }
    resetModifiedMarkers() {
        this.opMarkersModified = [];
    }
    markerModified(marker: Marker) {
        this.opMarkersModified.push(marker);
    }
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
        let clone = new Client("", this.mergeTree.options);
        let segments = <Segment[]>[];
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
    getUserInfo(shortClientId: number) {
        if (shortClientId >= 0) {
            return this.shortClientUserInfoMap[shortClientId];
        }
        else {
            return null;
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
        return <ISequencedObjectMessage>{
            clientId: this.longClientId,
            user: this.userInfo,
            minimumSequenceNumber: undefined,
            clientSequenceNumber: this.clientSequenceNumber,
            sequenceNumber: seq,
            referenceSequenceNumber: refSeq,
            objectId: objectId,
            userId: undefined,
            offset: seq,
            origin: null,
            contents: {
                type: ops.MergeTreeDeltaType.INSERT, marker: { type: markerType, behaviors }, pos1: pos
            },
            traces: [],
            type: OperationType,
        };
    }
    makeInsertMsg(text: string, pos: number, seq: number, refSeq: number, objectId: string) {
        return <ISequencedObjectMessage>{
            clientId: this.longClientId,
            user: this.userInfo,
            sequenceNumber: seq,
            referenceSequenceNumber: refSeq,
            clientSequenceNumber: this.clientSequenceNumber,
            minimumSequenceNumber: undefined,
            objectId: objectId,
            userId: undefined,
            offset: seq,
            origin: null,
            contents: {
                type: ops.MergeTreeDeltaType.INSERT, text: text, pos1: pos
            },
            traces: [],
            type: OperationType,
        };
    }
    makeRemoveMsg(start: number, end: number, seq: number, refSeq: number, objectId: string) {
        return <ISequencedObjectMessage>{
            clientId: this.longClientId,
            user: this.userInfo,
            sequenceNumber: seq,
            referenceSequenceNumber: refSeq,
            clientSequenceNumber: this.clientSequenceNumber,
            minimumSequenceNumber: undefined,
            objectId: objectId,
            userId: undefined,
            offset: seq,
            origin: null,
            contents: {
                type: ops.MergeTreeDeltaType.REMOVE, pos1: start, pos2: end,
            },
            traces: [],
            type: OperationType,
        };
    }
    makeAnnotateMsg(props: Properties.PropertySet, start: number, end: number, seq: number, refSeq: number, objectId: string) {
        return <ISequencedObjectMessage>{
            clientId: this.longClientId,
            user: this.userInfo,
            sequenceNumber: seq,
            referenceSequenceNumber: refSeq,
            objectId: objectId,
            clientSequenceNumber: this.clientSequenceNumber,
            userId: undefined,
            minimumSequenceNumber: undefined,
            offset: seq,
            origin: null,
            contents: {
                type: ops.MergeTreeDeltaType.ANNOTATE, pos1: start, pos2: end, props
            },
            traces: [],
            type: OperationType,
        };
    }
    hasMessages(): boolean {
        return this.q.count() > 0;
    }
    enqueueMsg(msg: ISequencedObjectMessage) {
        this.q.enqueue(msg);
    }
    dequeueMsg(): ISequencedObjectMessage {
        return this.q.dequeue();
    }
    enqueueTestString() {
        this.checkQ.enqueue(this.getText());
    }
    segmentToOps(segment: Segment, opList: ops.IMergeTreeOp[]) {
        // TODO: branches
        if (segment.seq === UnassignedSequenceNumber) {
            let pos = this.mergeTree.getOffset(segment, this.getCurrentSeq(), this.getClientId());
            let baseSegment = <BaseSegment>segment;
            let insertOp = <ops.IMergeTreeInsertMsg>{
                pos1: pos,
                type: ops.MergeTreeDeltaType.INSERT,
            };
            if (segment.getType() === SegmentType.Text) {
                let textSegment = <TextSegment>segment;
                insertOp.text = textSegment.text;
            }
            else {
                // assume marker
                let marker = <Marker>segment;
                insertOp.marker = { refType: marker.refType };
            }
            if (baseSegment.properties) {
                insertOp.props = baseSegment.properties;
            }
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
    transformOp(op: ops.IMergeTreeOp, msg: ISequencedObjectMessage, toSequenceNumber: number) {
        if ((op.type == ops.MergeTreeDeltaType.ANNOTATE) ||
            (op.type == ops.MergeTreeDeltaType.REMOVE)) {
            let ranges = this.mergeTree.tardisRange(op.pos1, op.pos2, msg.referenceSequenceNumber, toSequenceNumber);
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
            op.pos1 = this.mergeTree.tardisPosition(op.pos1, msg.referenceSequenceNumber, toSequenceNumber);
        }
        else if (op.type === ops.MergeTreeDeltaType.GROUP) {
            for (let i = 0, len = op.ops.length; i < len; i++) {
                op.ops[i] = this.transformOp(op.ops[i], msg, toSequenceNumber);
            }
        }
        return op;
    }
    transform(msg: ISequencedObjectMessage, toSequenceNumber: number) {
        if (msg.referenceSequenceNumber >= toSequenceNumber) {
            return msg;
        }
        let op = <ops.IMergeTreeOp>msg.contents;
        msg.contents = this.transformOp(op, msg, toSequenceNumber);
    }
    copy(start: number, end: number, registerId: string, refSeq: number, clientId: number, longClientId: string) {
        let segs = this.mergeTree.cloneSegments(refSeq, clientId, start, end);
        this.registerCollection.set(longClientId, registerId, segs);
    }
    pasteLocal(register: string, pos: number) {
        let segs = this.registerCollection.get(this.longClientId, register);
        if (segs) {
            this.mergeTree.startGroupOperation();
            // TODO: build tree from segs and insert all at once
            for (let seg of segs) {
                if (seg.getType() === SegmentType.Text) {
                    let textSegment = <TextSegment>seg;
                    this.insertTextLocal(textSegment.text, pos, textSegment.properties);
                    pos += textSegment.cachedLength;
                }
                else {
                    let marker = <Marker>seg;
                    this.insertMarkerLocal(pos, marker.refType, marker.properties);
                    pos += marker.cachedLength;
                }
            }
            this.mergeTree.endGroupOperation();
        }
        return pos;
    }
    pasteRemote(pos: number, registerId: string, seq: number, refSeq: number, clientId: number, longClientId) {
        let segs = this.registerCollection.get(longClientId, registerId);
        if (segs) {
            // TODO: build tree from segs and insert all at once
            for (let seg of segs) {
                if (seg.getType() === SegmentType.Text) {
                    let textSegment = <TextSegment>seg;
                    this.insertTextRemote(textSegment.text, pos, textSegment.properties, seq, refSeq, clientId);
                    pos += textSegment.cachedLength;
                }
                else {
                    let marker = <Marker>seg;
                    this.insertMarkerRemote({ refType: marker.refType }, pos, marker.properties, seq, refSeq, clientId);
                    pos += marker.cachedLength;
                }
            }
        }
        // TODO: error reporting
    }
    checkNest(op: ops.IMergeTreeRemoveMsg, msg: ISequencedObjectMessage, clid: number) {
        let beginMarker = this.mergeTree.getSegmentFromId(op.checkNest.id1);
        let endMarker = this.mergeTree.getSegmentFromId(op.checkNest.id2);
        let beginPos = this.mergeTree.getOffset(beginMarker, msg.referenceSequenceNumber, clid);
        let endPos = endMarker.cachedLength + this.mergeTree.getOffset(endMarker, msg.referenceSequenceNumber, clid);
        if ((beginPos !== op.pos1) || (endPos !== op.pos2)) {
            console.log(`remove nest mismatch ${beginPos} ${op.pos1} ${endPos} ${op.pos2}`);
        }
    }
    applyOp(op: ops.IMergeTreeOp, msg: ISequencedObjectMessage) {
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
                if (op.text !== undefined) {
                    if (op.pos2 !== undefined) {
                        // replace
                        this.removeSegmentRemote(op.pos1, op.pos2, msg.sequenceNumber, msg.referenceSequenceNumber, clid);
                    }
                    this.insertTextRemote(op.text, op.pos1, op.props as Properties.PropertySet, msg.sequenceNumber, msg.referenceSequenceNumber, clid);
                }
                else if (op.marker !== undefined) {
                    this.insertMarkerRemote(op.marker, op.pos1, op.props as Properties.PropertySet, msg.sequenceNumber, msg.referenceSequenceNumber, clid);
                }
                else if (op.register !== undefined) {
                    // TODO: relative addressing
                    if (op.pos2 !== undefined) {
                        // copy
                        this.copy(op.pos1, op.pos2, op.register, msg.referenceSequenceNumber, clid, msg.clientId);
                    }
                    else {
                        // paste
                        this.pasteRemote(op.pos1, op.register, msg.sequenceNumber, msg.referenceSequenceNumber, clid, msg.clientId);
                    }
                }
                break;
            case ops.MergeTreeDeltaType.REMOVE:
                if (op.relativePos1) {
                    op.pos1 = this.mergeTree.posFromRelativePos(op.relativePos1, msg.referenceSequenceNumber, clid);
                    if (op.pos1 < 0) {
                        // TODO: event when marker id not found
                        return;
                    }
                }
                if (op.relativePos2) {
                    op.pos2 = this.mergeTree.posFromRelativePos(op.relativePos2, msg.referenceSequenceNumber, clid);
                    if (op.pos2 < 0) {
                        // TODO: event when marker id not found
                        return;
                    }
                }
                if (op.register) {
                    // cut
                    this.copy(op.pos1, op.pos2, op.register, msg.referenceSequenceNumber, clid, msg.clientId);
                }
                if (op.checkNest) {
                    this.checkNest(op, msg, clid);
                }
                this.removeSegmentRemote(op.pos1, op.pos2, msg.sequenceNumber, msg.referenceSequenceNumber, clid);
                break;
            case ops.MergeTreeDeltaType.ANNOTATE:
                if (op.relativePos1) {
                    op.pos1 = this.mergeTree.posFromRelativePos(op.relativePos1, msg.referenceSequenceNumber, clid);
                    if (op.pos1 < 0) {
                        // TODO: event when marker id not found
                        return;
                    }
                }
                if (op.relativePos2) {
                    op.pos2 = this.mergeTree.posFromRelativePos(op.relativePos2, msg.referenceSequenceNumber, clid);
                    if (op.pos2 < 0) {
                        // TODO: event when marker id not found
                        return;
                    }
                }
                this.annotateSegmentRemote(op.props, op.pos1, op.pos2, msg.sequenceNumber, msg.referenceSequenceNumber, clid, op.combiningOp);
                break;
            case ops.MergeTreeDeltaType.GROUP: {
                for (let memberOp of op.ops) {
                    this.applyOp(memberOp, msg);
                }
                break;
            }
        }
    }
    getModifiedMarkersForOp() {
        return this.opMarkersModified;
    }
    coreApplyMsg(msg: ISequencedObjectMessage) {
        this.resetModifiedMarkers();
        this.applyOp(<ops.IMergeTreeOp>msg.contents, msg);
    }
    applyMsg(msg: ISequencedObjectMessage) {
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
        if (msg.type === OperationType) {
            const operationMessage = msg as ISequencedObjectMessage;
            if (msg.clientId === this.longClientId) {
                let op = <ops.IMergeTreeOp>msg.contents;
                if (op.type !== ops.MergeTreeDeltaType.ANNOTATE) {
                    this.ackPendingSegment(operationMessage.sequenceNumber);
                }
                else {
                    if (op.combiningOp && (op.combiningOp.name === "consensus")) {
                        this.updateConsensusProperty(op, operationMessage);
                    }
                }
            }
            else {
                this.coreApplyMsg(operationMessage);
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
            switch (op.type) {
                case ops.MergeTreeDeltaType.INSERT:
                    if (op.relativePos1) {
                        op.pos1 = this.mergeTree.posFromRelativePos(op.relativePos1);
                        if (op.pos1 < 0) {
                            // TODO: raise exception or other error flow
                            break;
                        }
                    }
                    if (op.marker) {
                        this.insertMarkerLocal(op.pos1, op.marker.refType, op.props);
                    }
                    else {
                        this.insertTextLocal(op.text, op.pos1, op.props);
                    }
                    break;
                case ops.MergeTreeDeltaType.ANNOTATE:
                    if (op.relativePos1) {
                        op.pos1 = this.mergeTree.posFromRelativePos(op.relativePos1);
                        if (op.pos1 < 0) {
                            // TODO: raise exception or other error flow
                            break;
                        }
                    }
                    if (op.relativePos2) {
                        op.pos2 = this.mergeTree.posFromRelativePos(op.relativePos2);
                        if (op.pos2 < 0) {
                            // TODO: raise exception or other error flow
                            break;
                        }
                    }
                    this.annotateSegmentLocal(op.props, op.pos1, op.pos2, op.combiningOp);
                    break;
                case ops.MergeTreeDeltaType.REMOVE:
                    if (op.relativePos1) {
                        op.pos1 = this.mergeTree.posFromRelativePos(op.relativePos1);
                        if (op.pos1 < 0) {
                            // TODO: raise exception or other error flow
                            break;
                        }
                    }
                    if (op.relativePos2) {
                        op.pos2 = this.mergeTree.posFromRelativePos(op.relativePos2);
                        if (op.pos2 < 0) {
                            // TODO: raise exception or other error flow
                            break;
                        }
                    }
                    this.removeSegmentLocal(op.pos1, op.pos2);
                    break;
                case ops.MergeTreeDeltaType.GROUP:
                    console.log("unhandled nested group op");
                    break;
            }
        }
        this.mergeTree.endGroupOperation();
        return segmentGroup;
    }
    updateConsensusProperty(op: ops.IMergeTreeAnnotateMsg, msg: ISequencedObjectMessage) {
        let markerId = op.relativePos1.id;
        let consensusInfo = this.pendingConsensus.get(markerId);
        if (consensusInfo) {
            consensusInfo.marker.addProperties(op.props, op.combiningOp, msg.sequenceNumber);
        }
        this.mergeTree.addMinSeqListener(msg.sequenceNumber, (minSeq) => consensusInfo.callback(consensusInfo.marker));
    }
    // marker must have an id
    annotateMarkerNotifyConsensus(marker: Marker, props: Properties.PropertySet, callback: (m: Marker) => void) {
        let combiningOp = <ops.ICombiningOp>{
            name: "consensus"
        };
        let consensusInfo = <IConsensusInfo>{
            callback,
            marker,
        };
        let id = marker.getId();
        this.pendingConsensus.set(id, consensusInfo);
        this.annotateMarker(props, marker, combiningOp);
    }
    annotateMarker(props: Properties.PropertySet, marker: Marker, op: ops.ICombiningOp) {
        let segWindow = this.mergeTree.getCollabWindow();
        let clientId = segWindow.clientId;
        let refSeq = segWindow.currentSeq;
        let seq = this.getLocalSequenceNumber();
        this.resetModifiedMarkers();
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        let start = this.mergeTree.getOffset(marker, UniversalSequenceNumber, this.getClientId());
        this.mergeTree.annotateRange(props, start, start + marker.cachedLength, refSeq, clientId, seq, op);
        if (this.measureOps) {
            this.localTime += elapsedMicroseconds(clockStart);
            this.localOps++;
        }
        if (this.verboseOps) {
            console.log(`annotate local cli ${this.getLongClientId(clientId)} ref seq ${refSeq}`);
        }
    }
    annotateSegmentLocal(props: Properties.PropertySet, start: number, end: number, op: ops.ICombiningOp) {
        let segWindow = this.mergeTree.getCollabWindow();
        let clientId = segWindow.clientId;
        let refSeq = segWindow.currentSeq;
        let seq = this.getLocalSequenceNumber();
        this.resetModifiedMarkers();
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        this.mergeTree.annotateRange(props, start, end, refSeq, clientId, seq, op);
        if (this.measureOps) {
            this.localTime += elapsedMicroseconds(clockStart);
            this.localOps++;
        }
        if (this.verboseOps) {
            console.log(`annotate local cli ${this.getLongClientId(clientId)} ref seq ${refSeq}`);
        }
    }
    annotateSegmentRemote(props: Properties.PropertySet, start: number, end: number, seq: number, refSeq: number, clientId: number, combiningOp: ops.ICombiningOp) {
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        this.mergeTree.annotateRange(props, start, end, refSeq, clientId, seq, combiningOp);
        this.mergeTree.getCollabWindow().currentSeq = seq;
        if (this.measureOps) {
            this.accumTime += elapsedMicroseconds(clockStart);
            this.accumOps++;
            this.accumWindow += (this.getCurrentSeq() - this.mergeTree.getCollabWindow().minSeq);
        }
        if (this.verboseOps && (!this.noVerboseRemoteAnnote)) {
            console.log(`@cli ${this.getLongClientId(this.mergeTree.getCollabWindow().clientId)} seq ${seq} annotate remote start ${start} end ${end} refseq ${refSeq} cli ${clientId} props ${props}`);
        }
    }
    removeSegmentLocal(start: number, end: number) {
        let segWindow = this.mergeTree.getCollabWindow();
        let clientId = segWindow.clientId;
        let refSeq = segWindow.currentSeq;
        let seq = this.getLocalSequenceNumber();
        this.resetModifiedMarkers();
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        this.mergeTree.markRangeRemoved(start, end, refSeq, clientId, seq);
        if (this.measureOps) {
            this.localTime += elapsedMicroseconds(clockStart);
            this.localOps++;
        }
        if (this.verboseOps) {
            console.log(`remove local cli ${this.getLongClientId(clientId)} ref seq ${refSeq} [${start},${end})`);
        }
    }
    removeSegmentRemote(start: number, end: number, seq: number, refSeq: number, clientId: number) {
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        this.mergeTree.markRangeRemoved(start, end, refSeq, clientId, seq);
        this.mergeTree.getCollabWindow().currentSeq = seq;
        if (this.measureOps) {
            this.accumTime += elapsedMicroseconds(clockStart);
            this.accumOps++;
            this.accumWindow += (this.getCurrentSeq() - this.mergeTree.getCollabWindow().minSeq);
        }
        if (this.verboseOps) {
            console.log(`@cli ${this.getLongClientId(this.mergeTree.getCollabWindow().clientId)} seq ${seq} remove remote start ${start} end ${end} refseq ${refSeq} cli ${this.getLongClientId(clientId)}`);
        }
    }
    insertTextLocal(text: string, pos: number, props?: Properties.PropertySet) {
        let segWindow = this.mergeTree.getCollabWindow();
        let clientId = segWindow.clientId;
        let refSeq = segWindow.currentSeq;
        let seq = this.getLocalSequenceNumber();
        this.resetModifiedMarkers();
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        this.mergeTree.insertText(pos, refSeq, clientId, seq, text, props);
        if (this.measureOps) {
            this.localTime += elapsedMicroseconds(clockStart);
            this.localOps++;
        }
        if (this.verboseOps) {
            console.log(`insert local text ${text} pos ${pos} cli ${this.getLongClientId(clientId)} ref seq ${refSeq}`);
        }
    }
    insertTextMarkerRelative(text: string, markerPos: IRelativePosition, props?: Properties.PropertySet) {
        let segWindow = this.mergeTree.getCollabWindow();
        let clientId = segWindow.clientId;
        let refSeq = segWindow.currentSeq;
        let seq = this.getLocalSequenceNumber();
        this.resetModifiedMarkers();
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        this.mergeTree.insertTextMarkerRelative(markerPos, refSeq, clientId, seq, text, props);
        if (this.measureOps) {
            this.localTime += elapsedMicroseconds(clockStart);
            this.localOps++;
        }
        if (this.verboseOps) {
            console.log(`insert local text marker relative ${text} pos ${markerPos.id} cli ${this.getLongClientId(clientId)} ref seq ${refSeq}`);
        }
    }
    insertMarkerLocal(pos: number, behaviors: ops.ReferenceType, props?: Properties.PropertySet) {
        let segWindow = this.mergeTree.getCollabWindow();
        let clientId = segWindow.clientId;
        let refSeq = segWindow.currentSeq;
        let seq = this.getLocalSequenceNumber();
        this.resetModifiedMarkers();
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        let marker = this.mergeTree.insertMarker(pos, refSeq, clientId, seq, behaviors, props);
        if (this.measureOps) {
            this.localTime += elapsedMicroseconds(clockStart);
            this.localOps++;
        }
        if (this.verboseOps) {
            console.log(`insert local marker pos ${pos} cli ${this.getLongClientId(clientId)} ${marker.toString()} ref seq ${refSeq}`);
        }
    }
    insertMarkerRemote(markerDef: ops.IMarkerDef, pos: number, props: Properties.PropertySet, seq: number, refSeq: number, clientId: number) {
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        let marker = this.mergeTree.insertMarker(pos, refSeq, clientId, seq, markerDef.refType, props);
        this.mergeTree.getCollabWindow().currentSeq = seq;
        if (this.measureOps) {
            this.accumTime += elapsedMicroseconds(clockStart);
            this.accumOps++;
            this.accumWindow += (this.getCurrentSeq() - this.mergeTree.getCollabWindow().minSeq);
        }
        if (this.verboseOps) {
            console.log(`@cli ${this.getLongClientId(this.mergeTree.getCollabWindow().clientId)} ${marker.toString()} seq ${seq} insert remote pos ${pos} refseq ${refSeq} cli ${clientId}`);
        }
    }
    insertTextRemote(text: string, pos: number, props: Properties.PropertySet, seq: number, refSeq: number, clientId: number) {
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        this.mergeTree.insertText(pos, refSeq, clientId, seq, text, props);
        this.mergeTree.getCollabWindow().currentSeq = seq;
        if (this.measureOps) {
            this.accumTime += elapsedMicroseconds(clockStart);
            this.accumOps++;
            this.accumWindow += (this.getCurrentSeq() - this.mergeTree.getCollabWindow().minSeq);
        }
        if (this.verboseOps) {
            console.log(`@cli ${this.getLongClientId(this.mergeTree.getCollabWindow().clientId)} text ${text} seq ${seq} insert remote pos ${pos} refseq ${refSeq} cli ${this.getLongClientId(clientId)}`);
        }
    }
    ackPendingSegment(seq: number) {
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        this.mergeTree.ackPendingSegment(seq, this.verboseOps);
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
        let clockStart;
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
    startCollaboration(longClientId: string, userInfo: IUser = null, minSeq = 0, branchId = 0) {
        this.longClientId = longClientId;
        this.userInfo = userInfo;
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
}