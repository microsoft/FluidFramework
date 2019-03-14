// tslint:disable
import { MessageType, ISequencedDocumentMessage } from "@prague/container-definitions";
import { IMergeTreeDeltaOpCallbackArgs, IRelativePosition } from "./index";
import {
    MergeTree, ClientIds, compareStrings, RegisterCollection, UnassignedSequenceNumber, Marker, SubSequence,
    IConsensusInfo, IUndoInfo, ISegment, SegmentType, TextSegment, UniversalSequenceNumber, SegmentGroup, clock, elapsedMicroseconds
} from "./mergeTree";
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
    q: Collections.List<ISequencedDocumentMessage>;
    checkQ: Collections.List<string>;
    clientNameToIds = new Collections.RedBlackTree<string, ClientIds>(compareStrings);
    shortClientIdMap = <string[]>[];
    shortClientBranchIdMap = <number[]>[];
    registerCollection = new RegisterCollection();
    localSequenceNumber = UnassignedSequenceNumber;
    opMarkersModified = <Marker[]>[];
    pendingConsensus = new Map<string, IConsensusInfo>();
    public longClientId: string;
    public undoSegments: IUndoInfo[];
    public redoSegments: IUndoInfo[];
    constructor(initText: string, options?: Properties.PropertySet) {
        this.mergeTree = new MergeTree(initText, options);
        this.mergeTree.getLongClientId = id => this.getLongClientId(id);
        this.mergeTree.markerModifiedHandler = marker => this.markerModified(marker);
        this.mergeTree.clientIdToBranchId = this.shortClientBranchIdMap;
        this.q = Collections.ListMakeHead<ISequencedDocumentMessage>();
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
                type: ops.MergeTreeDeltaType.INSERT, text: text, pos1: pos
            },
            timestamp: Date.now(),
            traces: [],
            type: MessageType.Operation,
        };
    }
    makeRemoveMsg(start: number, end: number, seq: number, refSeq: number, objectId: string) {
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
                type: ops.MergeTreeDeltaType.REMOVE, pos1: start, pos2: end,
            },
            timestamp: Date.now(),
            traces: [],
            type: MessageType.Operation,
        };
    }
    makeAnnotateMsg(props: Properties.PropertySet, start: number, end: number, seq: number, refSeq: number, objectId: string) {
        return <ISequencedDocumentMessage>{
            clientId: this.longClientId,
            sequenceNumber: seq,
            referenceSequenceNumber: refSeq,
            objectId: objectId,
            clientSequenceNumber: 1,
            userId: undefined,
            minimumSequenceNumber: undefined,
            offset: seq,
            origin: null,
            contents: {
                type: ops.MergeTreeDeltaType.ANNOTATE, pos1: start, pos2: end, props
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
            if (segment.properties) {
                insertOp.props = segment.properties;
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
    transformOp(op: ops.IMergeTreeOp, referenceSequenceNumber, toSequenceNumber: number) {
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
    copy(start: number, end: number, registerId: string, refSeq: number, clientId: number, longClientId: string) {
        let segs = this.mergeTree.cloneSegments(refSeq, clientId, start, end);
        this.registerCollection.set(longClientId, registerId, segs);
    }
    pasteLocal(register: string, pos: number, opArgs?: IMergeTreeDeltaOpCallbackArgs) {
        let segs = this.registerCollection.get(this.longClientId, register);
        if (segs) {
            this.mergeTree.startGroupOperation();
            // TODO: build tree from segs and insert all at once
            for (let seg of segs) {
                if (seg.getType() === SegmentType.Text) {
                    let textSegment = <TextSegment>seg;
                    this.insertTextLocal(textSegment.text, pos, textSegment.properties, opArgs);
                    pos += textSegment.cachedLength;
                }
                else {
                    let marker = <Marker>seg;
                    this.insertMarkerLocal(pos, marker.refType, marker.properties, opArgs);
                    pos += marker.cachedLength;
                }
            }
            this.mergeTree.endGroupOperation();
        }
        return pos;
    }
    pasteRemote(pos: number, registerId: string, seq: number, refSeq: number, clientId: number, longClientId, opArgs?: IMergeTreeDeltaOpCallbackArgs) {
        let segs = this.registerCollection.get(longClientId, registerId);
        if (segs) {
            // TODO: build tree from segs and insert all at once
            for (let seg of segs) {
                if (seg.getType() === SegmentType.Text) {
                    let textSegment = <TextSegment>seg;
                    this.insertTextRemote(textSegment.text, pos, textSegment.properties, seq, refSeq, clientId, opArgs);
                    pos += textSegment.cachedLength;
                }
                else {
                    let marker = <Marker>seg;
                    this.insertMarkerRemote({ refType: marker.refType }, pos, marker.properties, seq, refSeq, clientId, opArgs);
                    pos += marker.cachedLength;
                }
            }
        }
        // TODO: error reporting
    }
    checkNest(op: ops.IMergeTreeRemoveMsg, msg: ISequencedDocumentMessage, clid: number) {
        let beginMarker = this.mergeTree.getSegmentFromId(op.checkNest.id1);
        let endMarker = this.mergeTree.getSegmentFromId(op.checkNest.id2);
        let beginPos = this.mergeTree.getOffset(beginMarker, msg.referenceSequenceNumber, clid);
        let endPos = endMarker.cachedLength + this.mergeTree.getOffset(endMarker, msg.referenceSequenceNumber, clid);
        if ((beginPos !== op.pos1) || (endPos !== op.pos2)) {
            console.log(`remove nest mismatch ${beginPos} ${op.pos1} ${endPos} ${op.pos2}`);
        }
    }
    applyOp(opArgs: IMergeTreeDeltaOpCallbackArgs) {
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
                if (op.text !== undefined) {
                    if (op.pos2 !== undefined) {
                        // replace
                        this.removeSegmentRemote(op.pos1, op.pos2, msg.sequenceNumber, msg.referenceSequenceNumber, clid, opArgs);
                    }
                    this.insertTextRemote(op.text, op.pos1, op.props as Properties.PropertySet, msg.sequenceNumber, msg.referenceSequenceNumber, clid, opArgs);
                }
                else if (op.marker !== undefined) {
                    this.insertMarkerRemote(op.marker, op.pos1, op.props as Properties.PropertySet, msg.sequenceNumber, msg.referenceSequenceNumber, clid, opArgs);
                }
                else if (op.items !== undefined) {
                    this.insertItemsRemote(op.items, op.pos1, op.props,
                        msg.sequenceNumber, msg.referenceSequenceNumber, clid, opArgs);
                }
                else if (op.register !== undefined) {
                    // TODO: relative addressing
                    if (op.pos2 !== undefined) {
                        // copy
                        this.copy(op.pos1, op.pos2, op.register, msg.referenceSequenceNumber, clid, msg.clientId);
                    }
                    else {
                        // paste
                        this.pasteRemote(op.pos1, op.register, msg.sequenceNumber, msg.referenceSequenceNumber, clid, msg.clientId, opArgs);
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
                this.removeSegmentRemote(op.pos1, op.pos2, msg.sequenceNumber, msg.referenceSequenceNumber, clid, opArgs);
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
                this.annotateSegmentRemote(op.props, op.pos1, op.pos2, msg.sequenceNumber, msg.referenceSequenceNumber, clid, op.combiningOp, opArgs);
                break;
            case ops.MergeTreeDeltaType.GROUP: {
                for (let memberOp of op.ops) {
                    this.applyOp({
                        op: memberOp,
                        groupOp: op,
                        sequencedMessage: msg,
                    });
                }
                break;
            }
        }
    }
    getModifiedMarkersForOp() {
        return this.opMarkersModified;
    }
    coreApplyMsg(opArgs: IMergeTreeDeltaOpCallbackArgs) {
        this.resetModifiedMarkers();
        this.applyOp(opArgs);
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
            const opArgs: IMergeTreeDeltaOpCallbackArgs = {
                op: msg.contents as ops.IMergeTreeOp,
                sequencedMessage: msg,
            };
            if (msg.clientId === this.longClientId) {
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
                this.coreApplyMsg(opArgs);
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
            const opArgs: IMergeTreeDeltaOpCallbackArgs = {
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
                    if (op.marker) {
                        this.insertMarkerLocal(op.pos1, op.marker.refType, op.props, opArgs);
                    }
                    else {
                        this.insertTextLocal(op.text, op.pos1, op.props, opArgs);
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
                    this.annotateSegmentLocal(op.props, op.pos1, op.pos2, op.combiningOp, opArgs);
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
                    this.removeSegmentLocal(op.pos1, op.pos2, opArgs);
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
        this.mergeTree.addMinSeqListener(msg.sequenceNumber, (minSeq) => consensusInfo.callback(consensusInfo.marker));
    }
    // marker must have an id
    annotateMarkerNotifyConsensus(marker: Marker, props: Properties.PropertySet, consensusCallback: (m: Marker) => void, opArgs?: IMergeTreeDeltaOpCallbackArgs) {
        let combiningOp = <ops.ICombiningOp>{
            name: "consensus"
        };
        let consensusInfo = <IConsensusInfo>{
            callback: consensusCallback,
            marker,
        };
        let id = marker.getId();
        this.pendingConsensus.set(id, consensusInfo);
        this.annotateMarker(props, marker, combiningOp, opArgs);
    }
    annotateMarker(props: Properties.PropertySet, marker: Marker, op: ops.ICombiningOp, opArgs?: IMergeTreeDeltaOpCallbackArgs) {
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
        this.mergeTree.annotateRange(props, start, start + marker.cachedLength, refSeq, clientId, seq, op, opArgs);
        if (this.measureOps) {
            this.localTime += elapsedMicroseconds(clockStart);
            this.localOps++;
        }
        if (this.verboseOps) {
            console.log(`annotate local cli ${this.getLongClientId(clientId)} ref seq ${refSeq}`);
        }
    }
    annotateSegmentLocal(props: Properties.PropertySet, start: number, end: number, op: ops.ICombiningOp, opArgs?: IMergeTreeDeltaOpCallbackArgs) {
        let segWindow = this.mergeTree.getCollabWindow();
        let clientId = segWindow.clientId;
        let refSeq = segWindow.currentSeq;
        let seq = this.getLocalSequenceNumber();
        this.resetModifiedMarkers();
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        this.mergeTree.annotateRange(props, start, end, refSeq, clientId, seq, op, opArgs);
        if (this.measureOps) {
            this.localTime += elapsedMicroseconds(clockStart);
            this.localOps++;
        }
        if (this.verboseOps) {
            console.log(`annotate local cli ${this.getLongClientId(clientId)} ref seq ${refSeq}`);
        }
    }
    annotateSegmentRemote(props: Properties.PropertySet, start: number, end: number, seq: number, refSeq: number, clientId: number, combiningOp: ops.ICombiningOp, opArgs?: IMergeTreeDeltaOpCallbackArgs) {
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        this.mergeTree.annotateRange(props, start, end, refSeq, clientId, seq, combiningOp, opArgs);
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
    removeSegmentLocal(start: number, end: number, opArgs?: IMergeTreeDeltaOpCallbackArgs) {
        let segWindow = this.mergeTree.getCollabWindow();
        let clientId = segWindow.clientId;
        let refSeq = segWindow.currentSeq;
        let seq = this.getLocalSequenceNumber();
        this.resetModifiedMarkers();
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        this.mergeTree.markRangeRemoved(start, end, refSeq, clientId, seq, false, opArgs);
        if (this.measureOps) {
            this.localTime += elapsedMicroseconds(clockStart);
            this.localOps++;
        }
        if (this.verboseOps) {
            console.log(`remove local cli ${this.getLongClientId(clientId)} ref seq ${refSeq} [${start},${end})`);
        }
    }
    removeSegmentRemote(start: number, end: number, seq: number, refSeq: number, clientId: number, opArgs?: IMergeTreeDeltaOpCallbackArgs) {
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        this.mergeTree.markRangeRemoved(start, end, refSeq, clientId, seq, false, opArgs);
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
    insertTextLocal(text: string, pos: number, props?: Properties.PropertySet, opArgs?: IMergeTreeDeltaOpCallbackArgs) {
        let segWindow = this.mergeTree.getCollabWindow();
        let clientId = segWindow.clientId;
        let refSeq = segWindow.currentSeq;
        let seq = this.getLocalSequenceNumber();
        this.resetModifiedMarkers();
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        this.mergeTree.insertText(pos, refSeq, clientId, seq, text, props, opArgs);
        if (this.measureOps) {
            this.localTime += elapsedMicroseconds(clockStart);
            this.localOps++;
        }
        if (this.verboseOps) {
            console.log(`insert local text ${text} pos ${pos} cli ${this.getLongClientId(clientId)} ref seq ${refSeq}`);
        }
    }
    insertTextMarkerRelative(text: string, markerPos: IRelativePosition, props?: Properties.PropertySet, opArgs?: IMergeTreeDeltaOpCallbackArgs) {
        let segWindow = this.mergeTree.getCollabWindow();
        let clientId = segWindow.clientId;
        let refSeq = segWindow.currentSeq;
        let seq = this.getLocalSequenceNumber();
        this.resetModifiedMarkers();
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        this.mergeTree.insertTextMarkerRelative(markerPos, refSeq, clientId, seq, text, props, opArgs);
        if (this.measureOps) {
            this.localTime += elapsedMicroseconds(clockStart);
            this.localOps++;
        }
        if (this.verboseOps) {
            console.log(`insert local text marker relative ${text} pos ${markerPos.id} cli ${this.getLongClientId(clientId)} ref seq ${refSeq}`);
        }
    }

    insertSegmentLocal(pos: number, segment: ISegment, props?: Properties.PropertySet, opArgs?: IMergeTreeDeltaOpCallbackArgs) {
        let segWindow = this.mergeTree.getCollabWindow();
        let clientId = segWindow.clientId;
        let refSeq = segWindow.currentSeq;
        let seq = this.getLocalSequenceNumber();
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        segment.seq = seq;
        segment.clientId = clientId;
        this.mergeTree.insertSegment(pos, refSeq, clientId, seq, segment, opArgs);
        if (this.measureOps) {
            this.localTime += elapsedMicroseconds(clockStart);
            this.localOps++;
        }
        if (this.verboseOps) {
            console.log(`insert local segment pos ${pos} cli ${this.getLongClientId(clientId)} ${segment.toString()} ref seq ${refSeq}`);
        }
    }

    insertMarkerLocal(pos: number, behaviors: ops.ReferenceType, props?: Properties.PropertySet, opArgs?: IMergeTreeDeltaOpCallbackArgs) {
        let segWindow = this.mergeTree.getCollabWindow();
        let clientId = segWindow.clientId;
        let refSeq = segWindow.currentSeq;
        let seq = this.getLocalSequenceNumber();
        this.resetModifiedMarkers();
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        let marker = this.mergeTree.insertMarker(pos, refSeq, clientId, seq, behaviors, props, opArgs);
        if (this.measureOps) {
            this.localTime += elapsedMicroseconds(clockStart);
            this.localOps++;
        }
        if (this.verboseOps) {
            console.log(`insert local marker pos ${pos} cli ${this.getLongClientId(clientId)} ${marker.toString()} ref seq ${refSeq}`);
        }
    }

    insertItemsRemote(items: ops.SequenceItem[], pos: number, props: Properties.PropertySet, seq: number,
        refSeq: number, clientId: number, opArgs?: IMergeTreeDeltaOpCallbackArgs) {
        const traceItems = false;
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        const segment = new SubSequence(items, seq, clientId);
        if (props) {
            segment.addProperties(props);
        }
        if (traceItems) {
            console.log(`pre-length: ${this.mergeTree.getLength(UniversalSequenceNumber, this.mergeTree.collabWindow.clientId)} pos: ${pos}`);
        }
        this.mergeTree.insertSegment(pos, refSeq, clientId, seq, segment, opArgs);
        if (traceItems) {
            console.log(`post-length: ${this.mergeTree.getLength(UniversalSequenceNumber, this.mergeTree.collabWindow.clientId)} pos: ${pos}`);
        }
        this.mergeTree.getCollabWindow().currentSeq = seq;
        if (this.measureOps) {
            this.accumTime += elapsedMicroseconds(clockStart);
            this.accumOps++;
            this.accumWindow += (this.getCurrentSeq() - this.mergeTree.getCollabWindow().minSeq);
        }
        if (this.verboseOps) {
            console.log(`@cli ${this.getLongClientId(this.mergeTree.getCollabWindow().clientId)} ${segment.toString()} seq ${seq} insert remote pos ${pos} refseq ${refSeq} cli ${clientId}`);
        }
    }

    insertMarkerRemote(markerDef: ops.IMarkerDef, pos: number, props: Properties.PropertySet, seq: number,
        refSeq: number, clientId: number, opArgs?: IMergeTreeDeltaOpCallbackArgs) {
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        let marker = this.mergeTree.insertMarker(pos, refSeq, clientId, seq, markerDef.refType, props, opArgs);
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

    insertTextRemote(text: string, pos: number, props: Properties.PropertySet, seq: number, refSeq: number, clientId: number, opArgs?: IMergeTreeDeltaOpCallbackArgs) {
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }
        this.mergeTree.insertText(pos, refSeq, clientId, seq, text, props, opArgs);
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
    ackPendingSegment(opArgs: IMergeTreeDeltaOpCallbackArgs) {
        let clockStart;
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