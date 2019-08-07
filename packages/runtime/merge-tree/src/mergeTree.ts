/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable
import * as Base from "./base";
import * as Collections from "./collections";
import * as ops from "./ops";
import * as Properties from "./properties";
import * as assert from "assert";
import { SegmentGroupCollection } from "./segmentGroupCollection";
import { MergeTreeDeltaCallback, IMergeTreeDeltaOpArgs, IMergeTreeSegmentDelta } from "./mergeTreeDeltaCallback";
import { SegmentPropertiesManager } from "./segmentPropertiesManager";
import { TrackingGroupCollection } from "./mergeTreeTracking";
import { PartialSequenceLengths } from "./partialLengths";

export interface ReferencePosition {
    properties: Properties.PropertySet;
    refType: ops.ReferenceType;
    /** True if this reference is a segment. */
    isLeaf(): boolean;
    getSegment(): ISegment;
    getOffset(): number;
    addProperties(newProps: Properties.PropertySet, op?: ops.ICombiningOp);
    hasTileLabels();
    hasRangeLabels();
    hasTileLabel(label: string);
    hasRangeLabel(label: string);
    getTileLabels();
    getRangeLabels();
}

export type RangeStackMap = Properties.MapLike<Collections.Stack<ReferencePosition>>;

export interface IMergeNode {
    parent: IMergeBlock;
    cachedLength: number;
    index: number;
    ordinal: string;
    isLeaf(): boolean;
}

// node with segments as children
export interface IMergeBlock extends IMergeNode {
    childCount: number;
    children: IMergeNode[];
    partialLengths?: PartialSequenceLengths;
    hierBlock(): IHierBlock;
    assignChild(child: IMergeNode, index: number, updateOrdinal?: boolean);
    setOrdinal(child: IMergeNode, index: number);
}

export interface IHierBlock extends IMergeBlock {
    hierToString(indentCount: number);
    addNodeReferences(mergeTree: MergeTree, node: IMergeNode);
    rightmostTiles: Properties.MapLike<ReferencePosition>;
    leftmostTiles: Properties.MapLike<ReferencePosition>;
    rangeStacks: RangeStackMap;
}

export class LocalReference implements ReferencePosition {
    public static readonly DetachedPosition: number = -1;

    properties: Properties.PropertySet;
    pairedRef?: LocalReference;

    constructor(public segment: ISegment, public offset = 0,
        public refType = ops.ReferenceType.Simple) {
    }

    min(b: LocalReference) {
        if (this.compare(b) < 0) {
            return this;
        } else {
            return b;
        }
    }

    max(b: LocalReference) {
        if (this.compare(b) > 0) {
            return this;
        } else {
            return b;
        }
    }

    compare(b: LocalReference) {
        if (this.segment === b.segment) {
            return this.offset - b.offset;
        } else {
            if (this.segment === undefined
                || ( b.segment !== undefined &&
                    this.segment.ordinal < b.segment.ordinal)) {
                return -1;
            } else {
                return 1;
            }
        }
    }

    toPosition(mergeTree: MergeTree, refSeq: number, clientId: number) {
        if (this.segment) {
            return this.offset + mergeTree.getOffset(this.segment, refSeq, clientId);
        } else {
            return LocalReference.DetachedPosition;
        }
    }

    hasTileLabels() {
        return refHasTileLabels(this);
    }

    hasRangeLabels() {
        return refHasRangeLabels(this);
    }

    hasTileLabel(label: string) {
        return refHasTileLabel(this, label);
    }

    hasRangeLabel(label: string) {
        return refHasRangeLabel(this, label);
    }

    getTileLabels() {
        return refGetTileLabels(this);
    }

    getRangeLabels() {
        return refGetRangeLabels(this);
    }

    isLeaf() {
        return false;
    }

    addProperties(newProps: Properties.PropertySet, op?: ops.ICombiningOp) {
        this.properties = Properties.addProperties(this.properties, newProps, op);
    }

    getSegment() {
        return this.segment;
    }

    getOffset() {
        return this.offset;
    }

    getProperties() {
        return this.properties;
    }
}

export interface IRemovalInfo {
    removedSeq?: number;
    removedClientId?: number;
    removedClientOverlap?: number[];
}

export interface ISegment extends IMergeNode, IRemovalInfo {
    readonly type: string;
    readonly segmentGroups: SegmentGroupCollection;
    readonly trackingCollection: TrackingGroupCollection;
    propertyManager: SegmentPropertiesManager;
    seq?: number;  // if not present assumed to be previous to window min
    clientId?: number;
    localRefs?: LocalReference[];
    removalsByBranch?: IRemovalInfo[];
    properties?: Properties.PropertySet;
    addLocalRef(lref: LocalReference);
    removeLocalRef(lref: LocalReference);
    addProperties(newProps: Properties.PropertySet, op?: ops.ICombiningOp, seq?: number, collabWindow?: CollaborationWindow): Properties.PropertySet;
    clone(): ISegment;
    canAppend(segment: ISegment): boolean;
    append(segment: ISegment): void;
    removeRange(start: number, end: number): boolean;
    splitAt(pos: number): ISegment;
    toJSONObject(): any;
    /**
     * Acks the current segment against the segment group, op, and merge tree.
     *
     * Throws error if the segment state doesn't match segment group or op.
     * E.g. Segment group not first is pending queue.
     * Inserted segment does not have unassigned sequence number.
     *
     * Returns true if the op  modifies the segment, otherwise false.
     * The only current false case is overlapping remove, where a segment is removed
     * by a previously sequenced operation before the current operation is acked.
     */
    ack(segmentGroup: SegmentGroup, opArgs: IMergeTreeDeltaOpArgs, mergeTree: MergeTree): boolean;
}

export interface IMarkerModifiedAction {
    (marker: Marker): void;
}

export interface ISegmentAction<TClientData> {
    (segment: ISegment, pos: number, refSeq: number, clientId: number, start: number,
        end: number, accum?: TClientData): boolean;
}

export interface ISegmentChanges {
    next?: ISegment;
    replaceCurrent?: ISegment;
}

export interface BlockAction<TClientData> {
    (block: IMergeBlock, pos: number, refSeq: number, clientId: number, start: number, end: number,
        accum?: TClientData): boolean;
}

export interface NodeAction<TClientData> {
    (node: IMergeNode, pos: number, refSeq: number, clientId: number, start: number, end: number,
        clientData?: TClientData): boolean;
}

export interface IncrementalSegmentAction<TContext> {
    (segment: ISegment, state: IncrementalMapState<TContext>);
}

export interface IncrementalBlockAction<TContext> {
    (state: IncrementalMapState<TContext>);
}

export interface BlockUpdateActions {
    child: (block: IMergeBlock, index: number) => void;
}

export interface InsertContext {
    candidateSegment?: ISegment;
    prepareEvents?: boolean;
    structureChange?: boolean;
    leaf: (segment: ISegment, pos: number, ic: InsertContext) => ISegmentChanges;
    continuePredicate?: (continueFromBlock: IMergeBlock) => boolean;
}

export interface SegmentActions<TClientData> {
    leaf?: ISegmentAction<TClientData>;
    shift?: NodeAction<TClientData>;
    contains?: NodeAction<TClientData>;
    pre?: BlockAction<TClientData>;
    post?: BlockAction<TClientData>;
}

export interface IncrementalSegmentActions<TContext> {
    leaf: IncrementalSegmentAction<TContext>;
    pre?: IncrementalBlockAction<TContext>;
    post?: IncrementalBlockAction<TContext>;
}

export interface SearchResult {
    text: string;
    pos: number;
}

export interface MergeTreeStats {
    maxHeight: number;
    nodeCount: number;
    leafCount: number;
    removedLeafCount: number;
    liveCount: number;
    histo: number[];
    windowTime?: number;
    packTime?: number;
    ordTime?: number;
    maxOrdTime?: number;
}

export interface SegmentGroup {
    segments: ISegment[];
    onAck?(seq: number);
}

export class MergeNode implements IMergeNode {
    index: number;
    ordinal: string;
    parent: IMergeBlock;
    cachedLength: number;
    isLeaf() {
        return false;
    }
}

function addTile(tile: ReferencePosition, tiles: Object) {
    for (let tileLabel of tile.getTileLabels()) {
        tiles[tileLabel] = tile;
    }
}

function addTileIfNotPresent(tile: ReferencePosition, tiles: Object) {
    for (let tileLabel of tile.getTileLabels()) {
        if (tiles[tileLabel] === undefined) {
            tiles[tileLabel] = tile;
        }
    }
}

function applyStackDelta(currentStackMap: RangeStackMap, deltaStackMap: RangeStackMap) {
    for (let label in deltaStackMap) {
        let deltaStack = deltaStackMap[label];
        if (!deltaStack.empty()) {
            let currentStack = currentStackMap[label];
            if (currentStack === undefined) {
                currentStack = new Collections.Stack<ReferencePosition>();
                currentStackMap[label] = currentStack;
            }
            for (let delta of deltaStack.items) {
                applyRangeReference(currentStack, delta);
            }
        }
    }
}

function applyRangeReference(stack: Collections.Stack<ReferencePosition>, delta: ReferencePosition) {
    if (delta.refType & ops.ReferenceType.NestBegin) {
        stack.push(delta);
        return true;
    }
    else {
        // assume delta is end reference
        let top = stack.top();
        // TODO: match end with begin
        if (top && (top.refType & ops.ReferenceType.NestBegin)) {
            stack.pop();
        }
        else {
            stack.push(delta);
        }
        return false;
    }
}

function addNodeReferences(mergeTree: MergeTree, node: IMergeNode,
    rightmostTiles: Properties.MapLike<ReferencePosition>,
    leftmostTiles: Properties.MapLike<ReferencePosition>, rangeStacks: RangeStackMap) {
    function updateRangeInfo(label: string, refPos: ReferencePosition) {
        let stack = rangeStacks[label];
        if (stack === undefined) {
            stack = new Collections.Stack<ReferencePosition>();
            rangeStacks[label] = stack;
        }
        applyRangeReference(stack, refPos);
    }
    if (node.isLeaf()) {
        let segment = <ISegment>node;
        if (mergeTree.localNetLength(segment) > 0) {
            if (Marker.is(segment)) {
                let markerId = segment.getId();
                // also in insertMarker but need for reload segs case
                // can add option for this only from reload segs
                if (markerId) {
                    mergeTree.mapIdToSegment(markerId, segment);
                }
                if (segment.refType & ops.ReferenceType.Tile) {
                    addTile(segment, rightmostTiles);
                    addTileIfNotPresent(segment, leftmostTiles);
                }
                if (segment.refType & (ops.ReferenceType.NestBegin | ops.ReferenceType.NestEnd)) {
                    for (let label of segment.getRangeLabels()) {
                        updateRangeInfo(label, segment);
                    }
                }
            } else {
                const baseSegment = node as BaseSegment;
                if (baseSegment.localRefs && (baseSegment.hierRefCount !== undefined) &&
                    (baseSegment.hierRefCount > 0)) {
                    for (let lref of baseSegment.localRefs) {
                        if (lref.refType & ops.ReferenceType.Tile) {
                            addTile(lref, rightmostTiles);
                            addTileIfNotPresent(lref, leftmostTiles);
                        }
                        if (lref.refType & (ops.ReferenceType.NestBegin | ops.ReferenceType.NestEnd)) {
                            for (let label of lref.getRangeLabels()) {
                                updateRangeInfo(label, lref);
                            }
                        }
                    }
                }
            }
        }
    } else {
        let block = <IHierBlock>node;
        applyStackDelta(rangeStacks, block.rangeStacks);
        Properties.extend(rightmostTiles, block.rightmostTiles);
        Properties.extendIfUndefined(leftmostTiles, block.leftmostTiles);
    }
}

export function ordinalToArray(ord: string) {
    let a = <number[]>[];
    if (ord) {
        for (let i = 0, len = ord.length; i < len; i++) {
            a.push(ord.charCodeAt(i));
        }
    }
    return a;
}

export const MaxNodesInBlock = 8;
export class MergeBlock extends MergeNode implements IMergeBlock {
    static traceOrdinals = false;
    children: MergeNode[];
    constructor(public childCount: number) {
        super();
        this.children = new Array<MergeNode>(MaxNodesInBlock);
    }

    hierBlock() {
        return undefined;
    }

    setOrdinal(child: IMergeNode, index: number) {
        let childCount = this.childCount;
        if (childCount === 8) {
            childCount = 7;
        }
        assert((childCount >= 1) && (childCount <= 7));
        let localOrdinal: number;
        let ordinalWidth = 1 << (MaxNodesInBlock - (childCount + 1));
        if (index === 0) {
            localOrdinal = ordinalWidth - 1;
        } else {
            let prevOrd = this.children[index - 1].ordinal;
            let prevOrdCode = prevOrd.charCodeAt(prevOrd.length - 1);
            localOrdinal = prevOrdCode + ordinalWidth;
        }
        child.ordinal = this.ordinal + String.fromCharCode(localOrdinal);
        if (MergeBlock.traceOrdinals) {
            console.log(`so: prnt chld prev ${ordinalToArray(this.ordinal)} ${ordinalToArray(child.ordinal)} ${(index > 0) ? ordinalToArray(this.children[index - 1].ordinal) : "NA"}`);
        }
        assert(child.ordinal.length === (this.ordinal.length + 1));
        if (index > 0) {
            assert(child.ordinal > this.children[index - 1].ordinal);
            //console.log(`${ordinalToArray(this.ordinal)} ${ordinalToArray(child.ordinal)} ${ordinalToArray(this.children[index - 1].ordinal)}`);
            //    console.log(`ord width ${ordinalWidth}`);
        }
    }

    assignChild(child: MergeNode, index: number, updateOrdinal = true) {
        child.parent = this;
        child.index = index;
        if (updateOrdinal) {
            this.setOrdinal(child, index);
        }
        this.children[index] = child;
    }
}

class HierMergeBlock extends MergeBlock implements IMergeBlock {
    rightmostTiles: Properties.MapLike<ReferencePosition>;
    leftmostTiles: Properties.MapLike<ReferencePosition>;
    rangeStacks: Properties.MapLike<Collections.Stack<ReferencePosition>>;

    constructor(childCount: number) {
        super(childCount);
        this.rightmostTiles = Properties.createMap<ReferencePosition>();
        this.leftmostTiles = Properties.createMap<ReferencePosition>();
        this.rangeStacks = Properties.createMap<Collections.Stack<ReferencePosition>>();
    }

    addNodeReferences(mergeTree: MergeTree, node: MergeNode) {
        addNodeReferences(mergeTree, node, this.rightmostTiles, this.leftmostTiles,
            this.rangeStacks);
    }

    hierBlock() {
        return this;
    }

    hierToString(indentCount: number) {
        let strbuf = "";
        for (let key in this.rangeStacks) {
            let stack = this.rangeStacks[key];
            strbuf += internedSpaces(indentCount);
            strbuf += `${key}: `;
            for (let item of stack.items) {
                strbuf += `${item.toString()} `;
            }
            strbuf += "\n";
        }
        return strbuf;
    }
}

function nodeTotalLength(mergeTree: MergeTree, node: IMergeNode) {
    if (!node.isLeaf()) {
        return node.cachedLength;
    }
    else {
        return mergeTree.localNetLength(<ISegment>node);
    }
}

export abstract class BaseSegment extends MergeNode implements ISegment {

    constructor(public seq?: number, public clientId?: number) {
        super();
    }
    index: number;
    ordinal: string;
    removedSeq: number;
    removedClientId: number;
    removedClientOverlap: number[];
    removalsByBranch?: IRemovalInfo[];
    readonly segmentGroups: SegmentGroupCollection = new SegmentGroupCollection(this);
    readonly trackingCollection: TrackingGroupCollection = new TrackingGroupCollection(this);
    propertyManager: SegmentPropertiesManager;
    properties: Properties.PropertySet;
    localRefs: LocalReference[];
    hierRefCount?: number;
    abstract readonly type: string;

    addLocalRef(lref: LocalReference) {
        if ((this.hierRefCount === undefined) || (this.hierRefCount === 0)) {
            if (lref.hasRangeLabels() || lref.hasTileLabels()) {
                this.hierRefCount = 1;
            }
        }
        if (!this.localRefs) {
            this.localRefs = [lref];
        } else {
            let i = 0, len = this.localRefs.length;
            for (; i < len; i++) {
                if (this.localRefs[i].offset > lref.offset) {
                    break;
                }
            }
            if (i < len) {
                for (let k = len; k > i; k--) {
                    this.localRefs[k] = this.localRefs[k - 1];
                }
                this.localRefs[i] = lref;
            } else {
                this.localRefs.push(lref);
            }
        }
    }

    removeLocalRef(lref: LocalReference) {
        if (this.localRefs) {
            for (let i = 0, len = this.localRefs.length; i < len; i++) {
                if (lref === this.localRefs[i]) {
                    for (let j = i; j < (len - 1); j++) {
                        this.localRefs[j] = this.localRefs[j + 1];
                    }
                    this.localRefs.length--;
                    if (lref.hasRangeLabels() || lref.hasTileLabels()) {
                        this.hierRefCount--;
                    }
                    return lref;
                }
            }
        }
    }

    /**
     * Called by 'append()' implementations to append local refs from the given 'other' segment to the
     * end of 'this' segment.
     *
     * Note: This method should be invoked after the caller has ensured that segments can be merged,
     *       but before 'this' segment's cachedLength has changed, or the adjustment to the local refs
     *       will be incorrect.
     */
    protected appendLocalRefs(other: ISegment) {
        if (!other.localRefs) {
            return;
        }

        const leftLength = this.cachedLength;
        for (const localRef of other.localRefs) {
            localRef.offset += leftLength;
            localRef.segment = this;
        }

        // Concat or adopt
        this.localRefs = this.localRefs
            ? this.localRefs.concat(other.localRefs)
            : other.localRefs;
    }

    splitLocalRefs(pos: number, leafSegment: BaseSegment) {
        let aRefs = <LocalReference[]>[];
        let bRefs = <LocalReference[]>[];
        for (let localRef of this.localRefs) {
            if (localRef.offset < pos) {
                aRefs.push(localRef);
            } else {
                localRef.segment = leafSegment;
                localRef.offset -= pos;
                bRefs.push(localRef);
            }
        }
        this.localRefs = aRefs;
        leafSegment.localRefs = bRefs;
    }

    addProperties(newProps: Properties.PropertySet, op?: ops.ICombiningOp, seq?: number, collabWindow?: CollaborationWindow) {
        if (!this.propertyManager) {
            this.propertyManager = new SegmentPropertiesManager(this);
        }
        return this.propertyManager.addProperties(newProps, op, seq, collabWindow);
    }

    hasProperty(key: string) {
        return this.properties && (this.properties[key] !== undefined);
    }

    isLeaf() {
        return true;
    }

    cloneInto(b: ISegment) {
        b.clientId = this.clientId;
        // TODO: deep clone properties
        b.properties = Properties.clone(this.properties);
        b.removedClientId = this.removedClientId;
        // TODO: copy removed client overlap and branch removal info
        b.removedSeq = this.removedSeq;
        b.seq = this.seq;
    }

    canAppend(segment: ISegment) {
        return false;
    }

    addSerializedProps(jseg: ops.IJSONSegment) {
        if (this.properties) {
            jseg.props = this.properties;
        }
    }

    abstract toJSONObject(): any;

    public ack(segmentGroup: SegmentGroup, opArgs: IMergeTreeDeltaOpArgs, mergeTree: MergeTree): boolean {

        const currentSegmentGroup = this.segmentGroups.dequeue();
        assert.equal(currentSegmentGroup, segmentGroup);

        switch (opArgs.op.type) {

            case ops.MergeTreeDeltaType.ANNOTATE:
                assert(this.propertyManager);
                this.propertyManager.ackPendingProperties(opArgs.op);
                return true;

            case ops.MergeTreeDeltaType.INSERT:
                assert.equal(this.seq, UnassignedSequenceNumber);
                this.seq = opArgs.sequencedMessage.sequenceNumber;
                return true;

            case ops.MergeTreeDeltaType.REMOVE:
                const segBranchId = mergeTree.getBranchId(this.clientId);
                const removalInfo = mergeTree.getRemovalInfo(mergeTree.localBranchId, segBranchId, this);
                assert(removalInfo);
                assert(removalInfo.removedSeq);
                if (removalInfo.removedSeq === UnassignedSequenceNumber) {
                    removalInfo.removedSeq = opArgs.sequencedMessage.sequenceNumber;
                    return true;
                }
                if (MergeTree.diagOverlappingRemove) {
                    console.log(`grump @seq ${opArgs.sequencedMessage.sequenceNumber} ` +
                        `cli ${glc(mergeTree, mergeTree.collabWindow.clientId)} ` +
                        `from ${removalInfo.removedSeq} text ${mergeTree.toString()}`);
                }
                return false;

            default:
                assert.fail(`${opArgs.op.type} is in unrecognised operation type`);
        }
    }

    public splitAt(pos: number): ISegment{
        if (pos > 0) {
            const leafSegment = this.createSplitSegmentAt(pos);
            if (leafSegment) {
                if (this.propertyManager) {
                    this.propertyManager.copyTo(leafSegment);
                }
                leafSegment.parent = this.parent;

                // give the leaf a temporary yet valid ordinal.
                // when this segment is put in the tree, it will get it's real ordinal,
                // but this ordinal meets all the necessary invarients for now.
                leafSegment.ordinal = this.ordinal + String.fromCharCode(0);

                leafSegment.removedClientId = this.removedClientId;
                leafSegment.removedSeq = this.removedSeq;
                if (this.removalsByBranch) {
                    leafSegment.removalsByBranch = <IRemovalInfo[]>[];
                    for (let i = 0, len = this.removalsByBranch.length; i < len; i++) {
                        let fromRemovalInfo = this.removalsByBranch[i];
                        if (fromRemovalInfo) {
                            leafSegment.removalsByBranch[i] = {
                                removedClientId: fromRemovalInfo.removedClientId,
                                removedSeq: fromRemovalInfo.removedSeq,
                                removedClientOverlap: fromRemovalInfo.removedClientOverlap,
                            }
                        }
                    }
                }
                leafSegment.seq = this.seq;
                leafSegment.clientId = this.clientId;
                leafSegment.removedClientOverlap = this.removedClientOverlap;
                this.segmentGroups.copyTo(leafSegment);
                this.trackingCollection.copyTo(leafSegment);
                if (this.localRefs) {
                    this.splitLocalRefs(pos, leafSegment);
                }
            }
            return leafSegment;
        }
    }

    abstract clone(): ISegment;
    abstract append(segment: ISegment): void;
    abstract removeRange(start: number, end: number): boolean;
    protected abstract createSplitSegmentAt(pos: number): BaseSegment
}

interface IJSONExternalSegment extends ops.IJSONSegment {
    sequenceIndex: number;
    sequenceLength: number;
}
/**
 * A non-shared placeholder for external content.
 */
export class ExternalSegment extends BaseSegment {
    public static readonly type = "ExternalSegment";
    public readonly type = ExternalSegment.type;

    constructor(public placeholderSeq, public sequenceLength: number,
        public sequenceIndex: number) {
        super();
    }

    toJSONObject() {
        let obj = <IJSONExternalSegment>{ sequenceIndex: this.sequenceIndex, sequenceLength: this.sequenceLength };
        super.addSerializedProps(obj);
        return obj;
    }

    mergeTreeInsert(mergeTree: MergeTree, pos: number, refSeq: number, clientId: number, seq: number, opArgs: IMergeTreeDeltaOpArgs) {
        mergeTree.insertSegments(pos, [this], refSeq, clientId, seq, opArgs);
    }

    clone(): ISegment {
        throw new Error('clone not implemented');
    }

    append() {
        throw new Error('Can not append to external segment');
    }

    removeRange(start: number, end: number): boolean {
        throw new Error('Method not implemented.');
    }

    protected createSplitSegmentAt(pos: number): BaseSegment {
        throw new Error('Method not implemented.');
    }
}

export let reservedTileLabelsKey = "referenceTileLabels";
export let reservedRangeLabelsKey = "referenceRangeLabels";
export let reservedMarkerIdKey = "markerId";
export let reservedMarkerSimpleTypeKey = "markerSimpleType";

function refHasTileLabels(refPos: ReferencePosition) {
    return (refPos.refType & ops.ReferenceType.Tile) &&
        refPos.properties && refPos.properties[reservedTileLabelsKey];
}

function refHasRangeLabels(refPos: ReferencePosition) {
    return (refPos.refType & (ops.ReferenceType.NestBegin | ops.ReferenceType.NestEnd)) &&
        refPos.properties && refPos.properties[reservedRangeLabelsKey];

}

function refHasTileLabel(refPos: ReferencePosition, label: string) {
    if (refPos.hasTileLabels()) {
        for (let refLabel of refPos.properties[reservedTileLabelsKey]) {
            if (label === refLabel) {
                return true;
            }
        }
    }
    return false;
}

function refHasRangeLabel(refPos: ReferencePosition, label: string) {
    if (refPos.hasRangeLabels()) {
        for (let refLabel of refPos.properties[reservedRangeLabelsKey]) {
            if (label === refLabel) {
                return true;
            }
        }
    }
    return false;
}

function refGetTileLabels(refPos: ReferencePosition) {
    if (refPos.hasTileLabels()) {
        return <string[]>refPos.properties[reservedTileLabelsKey];
    } else {
        return [];
    }
}

function refGetRangeLabels(refPos: ReferencePosition) {
    if (refPos.hasRangeLabels()) {
        return <string[]>refPos.properties[reservedRangeLabelsKey];
    } else {
        return [];
    }
}

export interface IJSONMarkerSegment extends ops.IJSONSegment {
    marker: ops.IMarkerDef;
}

export class Marker extends BaseSegment implements ReferencePosition {
    public static readonly type = "Marker";
    public static is(segment: ISegment): segment is Marker {
        return segment.type === Marker.type;
    }
    public readonly type = Marker.type;

    nestBuddy: Marker;
    public static make(refType: ops.ReferenceType, props?: Properties.PropertySet,
        seq?: number, clientId?: number) {
        let marker = new Marker(refType, seq, clientId);
        if (props) {
            marker.addProperties(props);
        }
        return marker;
    }

    constructor(public refType: ops.ReferenceType, seq?: number, clientId?: number) {
        super(seq, clientId);
        this.cachedLength = 1;
    }

    toJSONObject() {
        let obj = <IJSONMarkerSegment>{ marker: <ops.IMarkerDef>{ refType: this.refType } };
        super.addSerializedProps(obj);
        return obj;
    }

    static fromJSONObject(spec: any) {
        if (spec && typeof spec === "object" && "marker" in spec) {
            return Marker.make(
                spec.marker.refType,
                spec.props as Properties.PropertySet,
                UniversalSequenceNumber,
                LocalClientId);
        }
        return undefined;
    }

    clone() {
        let b = Marker.make(this.refType, this.properties, this.seq, this.clientId);
        this.cloneInto(b);
        return b;
    }

    getSegment() {
        return this;
    }

    getOffset() {
        return 0;
    }

    hasSimpleType(simpleTypeName: string) {
        return this.hasProperty(reservedMarkerSimpleTypeKey) &&
            this.properties[reservedMarkerSimpleTypeKey] === simpleTypeName;
    }

    getProperties() {
        return this.properties;
    }

    getId(): string {
        if (this.properties && this.properties[reservedMarkerIdKey]) {
            return this.properties[reservedMarkerIdKey];
        }
    }

    hasTileLabels() {
        return refHasTileLabels(this);
    }

    hasRangeLabels() {
        return refHasRangeLabels(this);
    }

    hasTileLabel(label: string) {
        return refHasTileLabel(this, label);
    }

    hasRangeLabel(label: string) {
        return refHasRangeLabel(this, label);
    }

    getTileLabels() {
        return refGetTileLabels(this);
    }

    getRangeLabels() {
        return refGetRangeLabels(this);
    }

    toString() {
        let bbuf = "";
        if (this.refType & ops.ReferenceType.Tile) {
            bbuf += "Tile";
        }
        if (this.refType & ops.ReferenceType.NestBegin) {
            if (bbuf.length > 0) {
                bbuf += "; ";
            }
            bbuf += "RangeBegin";
        }
        if (this.refType & ops.ReferenceType.NestEnd) {
            if (bbuf.length > 0) {
                bbuf += "; ";
            }
            bbuf += "RangeEnd";
        }
        let lbuf = "";
        let id = this.getId();
        if (id) {
            bbuf += ` (${id}) `;
        }
        if (this.hasTileLabels()) {
            lbuf += "tile -- ";
            let labels = this.properties[reservedTileLabelsKey];
            for (let i = 0, len = labels.length; i < len; i++) {
                let tileLabel = labels[i];
                if (i > 0) {
                    lbuf += "; ";
                }
                lbuf += tileLabel;
            }
        }
        if (this.hasRangeLabels()) {
            let rangeKind = "begin";
            if (this.refType & ops.ReferenceType.NestEnd) {
                rangeKind = "end";
            }
            if (this.hasTileLabels()) {
                lbuf += " ";
            }
            lbuf += `range ${rangeKind} -- `;
            let labels = this.properties[reservedRangeLabelsKey];
            for (let i = 0, len = labels.length; i < len; i++) {
                let rangeLabel = labels[i];
                if (i > 0) {
                    lbuf += "; ";
                }
                lbuf += rangeLabel;
            }
        }
        let pbuf = "";
        if (this.properties) {
            pbuf += JSON.stringify(this.properties);
        }
        return `M ${bbuf}: ${lbuf} ${pbuf}`;
    }

    removeRange(start: number, end: number): boolean {
        console.log("remove range called on marker");
        return false;
    }

    protected createSplitSegmentAt(pos: number) {
        return undefined;
    }

    canAppend(segment: ISegment) {
        return false;
    }

    append() { throw new Error("Can not append to marker"); }
}


export enum IncrementalExecOp {
    Go,
    Stop,
    Yield
}

export class IncrementalMapState<TContext> {
    op = IncrementalExecOp.Go;
    constructor(
        public block: IMergeBlock,
        public actions: IncrementalSegmentActions<TContext>,
        public pos: number,
        public refSeq: number,
        public clientId: number,
        public context: TContext,
        public start: number,
        public end: number,
        public childIndex = 0
    ) {
    }
}

/**
 * Sequence numbers for shared segments start at 1 or greater.  Every segment marked
 * with sequence number zero will be counted as part of the requested string.
 */
export const UniversalSequenceNumber = 0;
export const UnassignedSequenceNumber = -1;
export const TreeMaintenanceSequenceNumber = -2;
export const LocalClientId = -1;
export const NonCollabClient = -2;

export class CollaborationWindow {
    clientId = LocalClientId;
    collaborating = false;
    localMinSeq?: number;
    globalMinSeq?: number;
    // lowest-numbered segment in window; no client can reference a state before this one
    minSeq = 0;
    // highest-numbered segment in window and current
    // reference segment for this client
    currentSeq = 0;

    loadFrom(a: CollaborationWindow) {
        this.clientId = a.clientId;
        this.collaborating = a.collaborating;
        this.localMinSeq = a.localMinSeq;
        this.globalMinSeq = a.globalMinSeq;
        this.minSeq = a.minSeq;
        this.currentSeq = a.currentSeq;
    }
}

export function compareNumbers(a: number, b: number) {
    return a - b;
}

export function compareStrings(a: string, b: string) {
    return a.localeCompare(b);
}

export function clock() {
    if (process.hrtime) {
        return process.hrtime();
    } else {
        return Date.now();
    }
}

export function elapsedMicroseconds(start: [number, number] | number) {
    if (process.hrtime) {
        let end: number[] = process.hrtime(start as [number, number]);
        let duration = Math.round((end[0] * 1000000) + (end[1] / 1000));
        return duration;
    } else {
        return 1000 * (Date.now() - (start as number));
    }
}

let indentStrings = ["", " ", "  "];
export function internedSpaces(n: number) {
    if (indentStrings[n] === undefined) {
        indentStrings[n] = "";
        for (let i = 0; i < n; i++) {
            indentStrings[n] += " ";
        }
    }
    return indentStrings[n];
}

export interface ClientIds {
    clientId: number;
    branchId: number;
}

export interface IUndoInfo {
    seq: number;
    seg: ISegment;
    op: ops.MergeTreeDeltaType;
}

export class RegisterCollection {
    clientCollections: Properties.MapLike<Properties.MapLike<ISegment[]>> =
        Properties.createMap();
    set(clientId: string, id: string, segments: ISegment[]) {
        if (!this.clientCollections[clientId]) {
            this.clientCollections[clientId] = Properties.createMap();
        }
        this.clientCollections[clientId][id] = segments;
    }

    get(clientId: string, id: string) {
        let clientCollection = this.clientCollections[clientId];
        if (clientCollection) {
            return clientCollection[id];
        }
    }

    getLength(clientId: string, id: string) {
        let segs = this.get(clientId, id);
        let len = 0;
        if (segs) {
            for (let seg of segs) {
                len += seg.cachedLength;
            }
        }
        return len;
    }

    removeClient(clientId: string) {
        this.clientCollections[clientId] = undefined;
    }

    // TODO: snapshot
}

export interface IConsensusInfo {
    marker: Marker;
    callback: (m: Marker) => void;
}

export interface ClientSeq {
    refSeq: number;
    clientId: string;
}

export var clientSeqComparer: Collections.Comparer<ClientSeq> = {
    min: { refSeq: -1, clientId: "" },
    compare: (a, b) => a.refSeq - b.refSeq
}

export interface LRUSegment {
    segment?: ISegment;
    maxSeq: number;
}

var LRUSegmentComparer: Collections.Comparer<LRUSegment> = {
    min: { maxSeq: -2 },
    compare: (a, b) => a.maxSeq - b.maxSeq
}

export function glc(mergeTree: MergeTree, id: number) {
    if (mergeTree.getLongClientId) {
        return mergeTree.getLongClientId(id);
    }
    else {
        return id.toString();
    }
}

export interface SegmentAccumulator {
    segments: ISegment[];
}


interface IReferenceSearchInfo {
    mergeTree: MergeTree;
    tileLabel: string;
    posPrecedesTile?: boolean;
    tile?: ReferencePosition;
}

interface IMarkerSearchRangeInfo {
    mergeTree: MergeTree;
    rangeLabels: string[];
    stacks: RangeStackMap;
}

function applyLeafRangeMarker(marker: Marker, searchInfo: IMarkerSearchRangeInfo) {
    for (let rangeLabel of searchInfo.rangeLabels) {
        if (marker.hasRangeLabel(rangeLabel)) {
            let currentStack = searchInfo.stacks[rangeLabel];
            if (currentStack === undefined) {
                currentStack = new Collections.Stack<Marker>();
                searchInfo.stacks[rangeLabel] = currentStack;
            }
            applyRangeReference(currentStack, marker);
        }
    }
}
function recordRangeLeaf(segment: ISegment, segpos: number,
    refSeq: number, clientId: number, start: number, end: number,
    searchInfo: IMarkerSearchRangeInfo) {
    if (Marker.is(segment)) {
        if (segment.refType &
            (ops.ReferenceType.NestBegin | ops.ReferenceType.NestEnd)) {
            applyLeafRangeMarker(segment, searchInfo);
        }
    }
    return false;
}

function rangeShift(node: IMergeNode, segpos: number, refSeq: number, clientId: number,
    offset: number, end: number, searchInfo: IMarkerSearchRangeInfo) {
    if (node.isLeaf()) {
        let seg = <ISegment>node;
        if ((searchInfo.mergeTree.localNetLength(seg) > 0) && Marker.is(seg)) {
            if (seg.refType &
                (ops.ReferenceType.NestBegin | ops.ReferenceType.NestEnd)) {
                applyLeafRangeMarker(seg, searchInfo);
            }
        }
    } else {
        let block = <IHierBlock>node;
        applyStackDelta(searchInfo.stacks, block.rangeStacks)
    }
    return true;
}

function recordTileStart(segment: ISegment, segpos: number,
    refSeq: number, clientId: number, start: number, end: number,
    searchInfo: IReferenceSearchInfo) {
    if (Marker.is(segment)) {
        if (segment.hasTileLabel(searchInfo.tileLabel)) {
            searchInfo.tile = segment;
        }
    }
    return false;
}

function tileShift(node: IMergeNode, segpos: number, refSeq: number, clientId: number,
    offset: number, end: number, searchInfo: IReferenceSearchInfo) {
    if (node.isLeaf()) {
        let seg = <ISegment>node;
        if ((searchInfo.mergeTree.localNetLength(seg) > 0) && Marker.is(seg)) {
            if (seg.hasTileLabel(searchInfo.tileLabel)) {
                searchInfo.tile = seg;
            }
        }
    } else {
        let block = <IHierBlock>node;
        let marker: Marker;
        if (searchInfo.posPrecedesTile) {
            marker = <Marker>block.rightmostTiles[searchInfo.tileLabel];
        } else {
            marker = <Marker>block.leftmostTiles[searchInfo.tileLabel];
        }
        if (marker !== undefined) {
            searchInfo.tile = marker;
        }

    }
    return true;
}

export interface MinListener {
    minRequired: number;
    onMinGE?(minSeq: number);
}

let minListenerComparer = <Collections.Comparer<MinListener>>{
    min: { minRequired: Number.MIN_VALUE },
    compare: (a, b) => a.minRequired - b.minRequired,
}

export interface RemoveRangeInfo {
    highestBlockRemovingChildren: IMergeBlock;
}

export type LocalReferenceMapper = (id: string) => LocalReference;

// represents a sequence of text segments
export class MergeTree {
    // must be an even number
    static TextSegmentGranularity = 128;
    static zamboniSegmentsMaxCount = 2;
    static options = {
        incrementalUpdate: true,
        insertAfterRemovedSegs: true,
        zamboniSegments: true,
        measureWindowTime: true,
        measureOrdinalTime: true,
    };
    static traceAppend = false;
    static traceZRemove = false;
    static traceOrdinals = false;
    static traceGatherText = false;
    static diagInsertTie = false;
    static skipLeftShift = true;
    static diagOverlappingRemove = false;
    static traceTraversal = false;
    static traceIncrTraversal = false;
    static initBlockUpdateActions: BlockUpdateActions;
    static theUnfinishedNode = <IMergeBlock>{ childCount: -1 };

    windowTime = 0;
    packTime = 0;
    ordTime = 0;
    maxOrdTime = 0;

    root: IMergeBlock;
    blockUpdateMarkers = false;
    blockUpdateActions: BlockUpdateActions;
    collabWindow = new CollaborationWindow();
    pendingSegments: Collections.List<SegmentGroup>;
    segmentsToScour: Collections.Heap<LRUSegment>;
    // TODO: change this to ES6 map; add remove on segment remove
    // for now assume only markers have ids and so point directly at the Segment
    // if we need to have pointers to non-markers, we can change to point at local refs
    idToSegment = Properties.createMap<ISegment>();
    clientIdToBranchId: number[] = [];
    localBranchId = 0;
    minSeqListeners: Collections.Heap<MinListener>;
    minSeqPending = false;
    // for diagnostics
    getLongClientId: (id: number) => string;
    mergeTreeDeltaCallback: MergeTreeDeltaCallback;

    // TODO: make and use interface describing options
    constructor(public options?: Properties.PropertySet) {
        this.blockUpdateActions = MergeTree.initBlockUpdateActions;
        if (options) {
            if (options.blockUpdateMarkers) {
                this.blockUpdateMarkers = options.blockUpdateMarkers;
            }
            if (options.localMinSeq !== undefined) {
                this.collabWindow.localMinSeq = options.localMinSeq;
            }
        }
        this.root = this.initialNode();
    }

    private makeBlock(childCount: number) {
        let block: MergeBlock;
        if (this.blockUpdateMarkers) {
            block = new HierMergeBlock(childCount);
        }
        else {
            block = new MergeBlock(childCount);
        }
        block.ordinal = "";
        return block;
    }

    private initialNode() {
        let block = this.makeBlock(0);
        block.cachedLength = 0
        return block;
    }

    clone() {
        let options = {
            blockUpdateMarkers: this.blockUpdateMarkers,
            localMinSeq: this.collabWindow.localMinSeq
        };
        let b = new MergeTree(options);
        // for now assume that b will not collaborate
        b.root = b.blockClone(this.root);
    }

    blockClone(block: IMergeBlock, segments?: ISegment[]) {
        let bBlock = this.makeBlock(block.childCount);
        for (let i = 0; i < block.childCount; i++) {
            let child = block.children[i];
            if (child.isLeaf()) {
                let segment = this.segmentClone(<ISegment>child);
                bBlock.assignChild(segment, i);
                if (segments) {
                    segments.push(segment);
                }
            } else {
                bBlock.assignChild(this.blockClone(<IMergeBlock>child, segments), i);
            }
        }
        this.nodeUpdateLengthNewStructure(bBlock);
        this.nodeUpdateOrdinals(bBlock);
        return bBlock;
    }

    private segmentClone(segment: ISegment) {
        let b = segment.clone();
        return b;
    }

    localNetLength(segment: ISegment) {
        let segBranchId = this.getBranchId(segment.clientId);
        let removalInfo = <IRemovalInfo>segment;
        if (this.localBranchId > segBranchId) {
            removalInfo = this.getRemovalInfo(this.localBranchId, segBranchId, segment);
        }
        if (removalInfo.removedSeq !== undefined) {
            return 0;
        } else {
            return segment.cachedLength;
        }
    }

    getBranchId(clientId: number) {
        if ((this.clientIdToBranchId.length > clientId) && (clientId >= 0)) {
            return this.clientIdToBranchId[clientId];
        } else if (clientId === LocalClientId) {
            return 0;
        } else {
            return this.localBranchId;
        }
    }

    // TODO: remove id when segment removed
    mapIdToSegment(id: string, segment: ISegment) {
        this.idToSegment[id] = segment;
    }

    private addNode(block: IMergeBlock, node: IMergeNode) {
        let index = block.childCount++;
        block.assignChild(node, index, false);
        return index;
    }

    reloadFromSegments(segments: ISegment[]) {
        let segCap = MaxNodesInBlock - 1;
        const measureReloadTime = false;
        let buildMergeBlock: (nodes: IMergeNode[]) => IMergeBlock = (nodes: IMergeNode[]) => {
            const nodeCount = Math.ceil(nodes.length / segCap);
            const blocks: IMergeBlock[] = [];
            let nodeIndex = 0;
            for (let i = 0; i < nodeCount; i++) {
                let len = 0;
                blocks[i] = this.makeBlock(0);
                for (let j = 0; j < segCap; j++) {
                    if (nodeIndex < nodes.length) {
                        let childIndex = this.addNode(blocks[i], nodes[nodeIndex]);
                        len += nodes[nodeIndex].cachedLength;
                        if (this.blockUpdateMarkers) {
                            let hierBlock = blocks[i].hierBlock();
                            hierBlock.addNodeReferences(this, nodes[nodeIndex]);
                        }
                        if (this.blockUpdateActions) {
                            this.blockUpdateActions.child(blocks[i], childIndex);
                        }
                    } else {
                        break;
                    }
                    nodeIndex++;
                }
                blocks[i].cachedLength = len;
            }
            if (blocks.length == 1) {
                return blocks[0];
            }
            else {
                return buildMergeBlock(blocks);
            }
        }
        let clockStart;
        if (measureReloadTime) {
            clockStart = clock();
        }
        if (segments.length > 0) {
            this.root = this.makeBlock(1);
            let block = buildMergeBlock(segments);
            this.root.assignChild(block, 0, false);
            if (this.blockUpdateMarkers) {
                let hierRoot = this.root.hierBlock();
                hierRoot.addNodeReferences(this, block);
            }
            if (this.blockUpdateActions) {
                this.blockUpdateActions.child(this.root, 0);
            }
            this.nodeUpdateOrdinals(this.root);
            this.root.cachedLength = block.cachedLength;
        }
        else {
            this.root = this.makeBlock(0);
            this.root.cachedLength = 0;
        }
        this.root.index = 0;
        if (measureReloadTime) {
            console.log(`reload time ${elapsedMicroseconds(clockStart)}`);
        }
    }

    // for now assume min starts at zero
    startCollaboration(localClientId: number, minSeq: number, branchId: number) {
        this.collabWindow.clientId = localClientId;
        this.collabWindow.minSeq = minSeq;
        this.collabWindow.collaborating = true;
        this.collabWindow.currentSeq = minSeq;
        this.localBranchId = branchId;
        this.segmentsToScour = new Collections.Heap<LRUSegment>([], LRUSegmentComparer);
        this.pendingSegments = Collections.ListMakeHead<SegmentGroup>();
        let measureFullCollab = false;
        let clockStart;
        if (measureFullCollab) {
            clockStart = clock();
        }
        this.nodeUpdateLengthNewStructure(this.root, true);
        if (measureFullCollab) {
            console.log(`update partial lengths at start ${elapsedMicroseconds(clockStart)}`);
        }
    }

    private addToLRUSet(segment: ISegment, seq: number) {
        this.segmentsToScour.add({ segment: segment, maxSeq: seq });
    }

    private underflow(node: IMergeBlock) {
        return node.childCount < (MaxNodesInBlock / 2);
    }

    private scourNode(node: IMergeBlock, holdNodes: IMergeNode[]) {
        let prevSegment: ISegment;
        for (let k = 0; k < node.childCount; k++) {
            let childNode = node.children[k];
            if (childNode.isLeaf()) {
                const segment = <ISegment>childNode;
                if (segment.segmentGroups.empty && segment.trackingCollection.empty) {
                    if (segment.removedSeq !== undefined) {
                        let createBrid = this.getBranchId(segment.clientId);
                        let removeBrid = this.getBranchId(segment.removedClientId);
                        if ((removeBrid != createBrid) || (segment.removedSeq > this.collabWindow.minSeq)) {
                            holdNodes.push(segment);
                        }
                        else {
                            if (MergeTree.traceZRemove) {
                                console.log(`${this.getLongClientId(this.collabWindow.clientId)}: Zremove ${segment["text"]}; cli ${this.getLongClientId(segment.clientId)}`);
                            }
                            segment.parent = undefined;
                        }
                        prevSegment = undefined;
                    }
                    else {
                        if (segment.seq <= this.collabWindow.minSeq) {

                            const canAppend = prevSegment
                                && prevSegment.canAppend(segment)
                                && Properties.matchProperties(prevSegment.properties, segment.properties)
                                && prevSegment.trackingCollection.matches(segment.trackingCollection)
                                && this.getBranchId(prevSegment.clientId) === this.getBranchId(segment.clientId)
                                && this.localNetLength(segment) > 0;

                            if (canAppend) {
                                if (MergeTree.traceAppend) {
                                    console.log(`${this.getLongClientId(this.collabWindow.clientId)}: append ${prevSegment["text"]} + ${segment["text"]}; cli ${this.getLongClientId(prevSegment.clientId)} + cli ${this.getLongClientId(segment.clientId)}`);
                                }
                                prevSegment.append(segment);
                                segment.parent = undefined;
                                segment.trackingCollection.trackingGroups.forEach((tg) => tg.unlink(segment));
                            }
                            else {
                                holdNodes.push(segment);
                                if (this.localNetLength(segment) > 0) {
                                    prevSegment = segment;
                                } else {
                                    prevSegment = undefined;
                                }
                            }
                        }
                        else {
                            holdNodes.push(segment);
                            prevSegment = undefined;
                        }
                    }
                } else {
                    holdNodes.push(segment);
                    prevSegment = undefined;
                }
            }
            else {
                holdNodes.push(childNode);
                prevSegment = undefined;
            }
        }
    }

    // interior node with all node children
    pack(block: IMergeBlock) {
        let parent = block.parent;
        let children = parent.children;
        let childIndex: number;
        let childBlock: IMergeBlock;
        let holdNodes = <IMergeNode[]>[];
        for (childIndex = 0; childIndex < parent.childCount; childIndex++) {
            // debug assert not isLeaf()
            childBlock = <IMergeBlock>children[childIndex];
            this.scourNode(childBlock, holdNodes);
            // will replace this block with a packed block
            childBlock.parent = undefined;
        }
        let totalNodeCount = holdNodes.length;
        let halfCount = MaxNodesInBlock / 2;
        let childCount = Math.min(MaxNodesInBlock - 1, Math.floor(totalNodeCount / halfCount));
        if (childCount < 1) {
            childCount = 1;
        }
        let baseCount = Math.floor(totalNodeCount / childCount);
        let extraCount = totalNodeCount % childCount;
        let packedBlocks = <IMergeBlock[]>new Array(MaxNodesInBlock);
        let readCount = 0;
        for (let nodeIndex = 0; nodeIndex < childCount; nodeIndex++) {
            let nodeCount = baseCount;
            if (extraCount > 0) {
                nodeCount++;
                extraCount--;
            }
            let packedBlock = this.makeBlock(nodeCount);
            for (let packedNodeIndex = 0; packedNodeIndex < nodeCount; packedNodeIndex++) {
                let nodeToPack = holdNodes[readCount++];
                packedBlock.assignChild(nodeToPack, packedNodeIndex, false);
            }
            packedBlock.parent = parent;
            packedBlocks[nodeIndex] = packedBlock;
            this.nodeUpdateLengthNewStructure(packedBlock);
        }
        if (readCount != totalNodeCount) {
            console.log(`total count ${totalNodeCount} readCount ${readCount}`);
        }
        parent.children = packedBlocks;
        for (let j = 0; j < childCount; j++) {
            parent.assignChild(packedBlocks[j], j, false);
        }
        parent.childCount = childCount;
        if (this.underflow(parent) && (parent.parent)) {
            this.pack(parent);
        }
        else {
            this.nodeUpdateOrdinals(parent);
            this.blockUpdatePathLengths(parent, UnassignedSequenceNumber, -1, true);
        }
    }

    private zamboniSegments() {
        //console.log(`scour line ${segmentsToScour.count()}`);
        let clockStart;
        if (MergeTree.options.measureWindowTime) {
            clockStart = clock();
        }

        let segmentToScour = this.segmentsToScour.peek();
        if (segmentToScour && (segmentToScour.maxSeq <= this.collabWindow.minSeq)) {
            for (let i = 0; i < MergeTree.zamboniSegmentsMaxCount; i++) {
                segmentToScour = this.segmentsToScour.get();
                if (segmentToScour && segmentToScour.segment.parent &&
                    (segmentToScour.maxSeq <= this.collabWindow.minSeq)) {
                    let block = segmentToScour.segment.parent;
                    let childrenCopy = <IMergeNode[]>[];
                    //                console.log(`scouring from ${segmentToScour.segment.seq}`);
                    this.scourNode(block, childrenCopy);
                    let newChildCount = childrenCopy.length;

                    if (newChildCount < block.childCount) {
                        block.childCount = newChildCount;
                        block.children = childrenCopy;
                        for (let j = 0; j < newChildCount; j++) {
                            block.assignChild(childrenCopy[j], j, false);
                        }

                        if (this.underflow(block) && block.parent) {
                            //nodeUpdatePathLengths(node, UnassignedSequenceNumber, -1, true);
                            let packClockStart;
                            if (MergeTree.options.measureWindowTime) {
                                packClockStart = clock();
                            }
                            this.pack(block);

                            if (MergeTree.options.measureWindowTime) {
                                this.packTime += elapsedMicroseconds(packClockStart);
                            }
                        }
                        else {
                            this.nodeUpdateOrdinals(block);
                            this.blockUpdatePathLengths(block, UnassignedSequenceNumber, -1, true);
                        }

                    }
                }
                else {
                    break;
                }
            }
        }

        if (MergeTree.options.measureWindowTime) {
            this.windowTime += elapsedMicroseconds(clockStart);
        }
    }

    getCollabWindow() {
        return this.collabWindow;
    }

    getStats() {
        let nodeGetStats = (block: IMergeBlock) => {
            let stats = { maxHeight: 0, nodeCount: 0, leafCount: 0, removedLeafCount: 0, liveCount: 0, histo: [] };
            for (let k = 0; k < MaxNodesInBlock; k++) {
                stats.histo[k] = 0;
            }
            for (let i = 0; i < block.childCount; i++) {
                let child = block.children[i];
                let height = 1;
                if (!child.isLeaf()) {
                    let childStats = nodeGetStats(<IMergeBlock>child);
                    height = 1 + childStats.maxHeight;
                    stats.nodeCount += childStats.nodeCount;
                    stats.leafCount += childStats.leafCount;
                    stats.removedLeafCount += childStats.removedLeafCount;
                    stats.liveCount += childStats.liveCount;
                    for (let i = 0; i < MaxNodesInBlock; i++) {
                        stats.histo[i] += childStats.histo[i];
                    }
                }
                else {
                    stats.leafCount++;
                    let segment = <ISegment>child;
                    if (segment.removedSeq !== undefined) {
                        stats.removedLeafCount++;
                    }
                }
                if (height > stats.maxHeight) {
                    stats.maxHeight = height;
                }
            }
            stats.histo[block.childCount]++;
            stats.nodeCount++;
            stats.liveCount += block.childCount;
            return stats;
        }
        let rootStats = <MergeTreeStats>nodeGetStats(this.root);
        if (MergeTree.options.measureWindowTime) {
            rootStats.windowTime = this.windowTime;
            rootStats.packTime = this.packTime;
            rootStats.ordTime = this.ordTime;
            rootStats.maxOrdTime = this.maxOrdTime;
        }
        return rootStats;
    }

    tardisPosition(pos: number, fromSeq: number, toSeq: number, toClientId = NonCollabClient) {
        return this.tardisPositionFromClient(pos, fromSeq, toSeq, NonCollabClient, toClientId);
    }

    tardisPositionFromClient(pos: number, fromSeq: number, toSeq: number, fromClientId: number,
        toClientId = NonCollabClient) {
        if (((fromSeq < toSeq) || (toClientId === this.collabWindow.clientId)) && pos < this.getLength(fromSeq, fromClientId)) {
            if (toSeq <= this.collabWindow.currentSeq) {
                let segoff = this.getContainingSegment(pos, fromSeq, fromClientId);
                let toPos = this.getOffset(segoff.segment, toSeq, toClientId);
                let ret = toPos + segoff.offset;
                assert(ret !== undefined);
                return ret;
            }
            assert(false);
        } else {
            return pos;
        }
    }

    tardisRangeFromClient(rangeStart: number, rangeEnd: number, fromSeq: number, toSeq: number, fromClientId: number,
        toClientId = NonCollabClient) {
        let ranges = <Base.IIntegerRange[]>[];
        let recordRange = (segment: ISegment, pos: number, refSeq: number, clientId: number, segStart: number,
            segEnd: number) => {
            if (this.nodeLength(segment, toSeq, toClientId) > 0) {
                let offset = this.getOffset(segment, toSeq, toClientId);
                if (segStart < 0) {
                    segStart = 0;
                }
                if (segEnd > segment.cachedLength) {
                    segEnd = segment.cachedLength;
                }
                ranges.push({ start: offset + segStart, end: offset + segEnd });
            }
            return true;
        }
        this.mapRange({ leaf: recordRange }, fromSeq, fromClientId, undefined, rangeStart, rangeEnd);
        return ranges;
    }

    tardisRange(rangeStart: number, rangeEnd: number, fromSeq: number, toSeq: number, toClientId = NonCollabClient) {
        return this.tardisRangeFromClient(rangeStart, rangeEnd, fromSeq, toSeq, NonCollabClient, toClientId);
    }

    getLength(refSeq: number, clientId: number) {
        return this.blockLength(this.root, refSeq, clientId);
    }

    getOffset(node: MergeNode, refSeq: number, clientId: number) {
        let totalOffset = 0;
        let parent = node.parent;
        let prevParent: IMergeBlock;
        while (parent) {
            let children = parent.children;
            for (let childIndex = 0; childIndex < parent.childCount; childIndex++) {
                let child = children[childIndex];
                if ((prevParent && (child == prevParent)) || (child == node)) {
                    break;
                }
                totalOffset += this.nodeLength(child, refSeq, clientId);
            }
            prevParent = parent;
            parent = parent.parent;
        }
        return totalOffset;
    }

    cloneSegments(refSeq: number, clientId: number, start = 0, end?: number) {

        const gatherSegment = (segment: ISegment, pos: number, refSeq: number, clientId: number, start: number,
            end: number, accumSegments: SegmentAccumulator) => {
            accumSegments.segments.push(segment.clone());
            return true;
        }

        if (end === undefined) {
            end = this.blockLength(this.root, refSeq, clientId);
        }
        let accum = <SegmentAccumulator>{
            segments: <ISegment[]>[]
        };
        this.mapRange<SegmentAccumulator>({ leaf: gatherSegment }, refSeq, clientId, accum, start, end);
        return accum.segments;
    }


    getContainingSegment(pos: number, refSeq: number, clientId: number) {
        let segment: ISegment;
        let offset: number;

        let leaf = (leafSeg: ISegment, segpos: number, refSeq: number, clientId: number, start: number) => {
            segment = leafSeg;
            offset = start;
            return false;
        };
        this.searchBlock(this.root, pos, 0, refSeq, clientId, { leaf });
        return { segment, offset };
    }

    private blockLength(node: IMergeBlock, refSeq: number, clientId: number) {
        if ((this.collabWindow.collaborating) && (clientId != this.collabWindow.clientId)) {
            return node.partialLengths.getPartialLength(this, refSeq, clientId);
        }
        else {
            return node.cachedLength;
        }
    }

    getRemovalInfo(branchId: number, segBranchId: number, segment: ISegment) {
        if (branchId > segBranchId) {
            let index = (branchId - segBranchId) - 1;
            if (!segment.removalsByBranch) {
                segment.removalsByBranch = <IRemovalInfo[]>[];
            }
            if (!segment.removalsByBranch[index]) {
                segment.removalsByBranch[index] = <IRemovalInfo>{};
            }
            return segment.removalsByBranch[index];
        } else {
            return <IRemovalInfo>segment;
        }
    }

    private nodeLength(node: IMergeNode, refSeq: number, clientId: number) {
        if ((!this.collabWindow.collaborating) || (this.collabWindow.clientId == clientId)) {
            // local client sees all segments, even when collaborating
            if (!node.isLeaf()) {
                return node.cachedLength;
            }
            else {
                return this.localNetLength(<ISegment>node);
            }
        }
        else {
            // sequence number within window
            let branchId = this.getBranchId(clientId);
            if (!node.isLeaf()) {
                return (<IMergeBlock>node).partialLengths.getPartialLength(this, refSeq, clientId);
            }
            else {
                let segment = <ISegment>node;
                let segBranchId = this.getBranchId(segment.clientId);
                if ((segBranchId <= branchId) && ((segment.clientId === clientId) ||
                    ((segment.seq != UnassignedSequenceNumber) && (segment.seq <= refSeq)))) {
                    let removalInfo = <IRemovalInfo>segment;
                    if (branchId > segBranchId) {
                        removalInfo = this.getRemovalInfo(branchId, segBranchId, segment);
                    }
                    // segment happened by reference sequence number or segment from requesting client
                    if (removalInfo.removedSeq !== undefined) {
                        if ((removalInfo.removedClientId === clientId) ||
                            (removalInfo.removedClientOverlap && (removalInfo.removedClientOverlap.indexOf(clientId) >= 0)) ||
                            ((removalInfo.removedSeq != UnassignedSequenceNumber) && (removalInfo.removedSeq <= refSeq))) {
                            return 0;
                        }
                        else {
                            return segment.cachedLength;
                        }
                    } else {
                        return segment.cachedLength;
                    }
                }
                else {
                    // segment invisible to client at reference sequence number/branch id/client id of op
                    return 0;
                }
            }
        }
    }

    updateLocalMinSeq(localMinSeq: number) {
        this.collabWindow.localMinSeq = localMinSeq;
        this.setMinSeq(Math.min(this.collabWindow.globalMinSeq, localMinSeq));
    }

    addMinSeqListener(minRequired: number, onMinGE: (minSeq: number) => void) {
        if (!this.minSeqListeners) {
            this.minSeqListeners = new Collections.Heap<MinListener>([],
                minListenerComparer);
        }
        this.minSeqListeners.add({ minRequired, onMinGE });
    }

    notifyMinSeqListeners() {
        this.minSeqPending = false;
        while ((this.minSeqListeners.count() > 0) &&
            (this.minSeqListeners.peek().minRequired <= this.collabWindow.minSeq)) {
            let minListener = this.minSeqListeners.get();
            minListener.onMinGE(this.collabWindow.minSeq);
        }
    }

    setMinSeq(minSeq: number) {
        if (minSeq > this.collabWindow.minSeq) {
            this.collabWindow.minSeq = minSeq;
            if (MergeTree.options.zamboniSegments) {
                this.zamboniSegments();
            }
            if (this.minSeqListeners && this.minSeqListeners.count()) {
                this.minSeqPending = true;
            }
        }
    }

    commitGlobalMin() {
        if (this.collabWindow.globalMinSeq !== undefined) {
            this.collabWindow.localMinSeq = this.collabWindow.globalMinSeq;
            this.setMinSeq(this.collabWindow.globalMinSeq);
        }
    }

    updateGlobalMinSeq(globalMinSeq: number) {
        if (this.collabWindow.localMinSeq === undefined) {
            this.setMinSeq(globalMinSeq);
        }
        else {
            this.collabWindow.globalMinSeq = globalMinSeq;
            this.setMinSeq(Math.min(globalMinSeq, this.collabWindow.localMinSeq));
        }
    }

    referencePositionToLocalPosition(refPos: ReferencePosition,
        refSeq = UniversalSequenceNumber, clientId = this.collabWindow.clientId) {
        let seg = refPos.getSegment();
        let offset = refPos.getOffset();
        return offset + this.getOffset(seg, refSeq, clientId);
    }

    getStackContext(startPos: number, clientId: number, rangeLabels: string[]) {
        let searchInfo = <IMarkerSearchRangeInfo>{
            mergeTree: this,
            stacks: Properties.createMap<Collections.Stack<Marker>>(),
            rangeLabels
        };

        this.search(startPos, UniversalSequenceNumber, clientId,
            { leaf: recordRangeLeaf, shift: rangeShift }, searchInfo);
        return searchInfo.stacks;
    }

    // TODO: with annotation op change value
    cherryPickedUndo(undoInfo: IUndoInfo) {
        let segment = undoInfo.seg;
        // no branches
        if (segment.removedSeq !== undefined) {
            segment.removedSeq = undefined;
            segment.removedClientId = undefined;
        } else {
            if (undoInfo.op === ops.MergeTreeDeltaType.REMOVE) {
                segment.removedSeq = undoInfo.seq;
            } else {
                segment.removedSeq = UnassignedSequenceNumber;
            }
            segment.removedClientId = this.collabWindow.clientId;
        }
        this.blockUpdatePathLengths(segment.parent, UnassignedSequenceNumber, -1, true);
    }

    // TODO: filter function
    findTile(startPos: number, clientId: number, tileLabel: string, posPrecedesTile = true) {
        let searchInfo = <IReferenceSearchInfo>{
            mergeTree: this,
            posPrecedesTile,
            tileLabel,
        };

        if (posPrecedesTile) {
            this.search(startPos, UniversalSequenceNumber, clientId,
                { leaf: recordTileStart, shift: tileShift }, searchInfo);
        } else {
            this.backwardSearch(startPos, UniversalSequenceNumber, clientId,
                { leaf: recordTileStart, shift: tileShift }, searchInfo);
        }

        if (searchInfo.tile) {
            let pos: number;
            if (searchInfo.tile.isLeaf()) {
                let marker = <Marker>searchInfo.tile;
                pos = this.getOffset(marker, UniversalSequenceNumber, clientId);
            } else {
                let localRef = <LocalReference>searchInfo.tile;
                pos = localRef.toPosition(this, UniversalSequenceNumber, clientId);
            }
            return { tile: searchInfo.tile, pos };
        }
    }

    private search<TClientData>(pos: number, refSeq: number, clientId: number,
        actions?: SegmentActions<TClientData>, clientData?: TClientData): ISegment {
        return this.searchBlock(this.root, pos, 0, refSeq, clientId, actions, clientData);
    }

    private searchBlock<TClientData>(block: IMergeBlock, pos: number, segpos: number, refSeq: number, clientId: number,
        actions?: SegmentActions<TClientData>, clientData?: TClientData): ISegment {
        let children = block.children;
        if (actions && actions.pre) {
            actions.pre(block, segpos, refSeq, clientId, undefined, undefined, clientData);
        }
        let contains = actions && actions.contains;
        for (let childIndex = 0; childIndex < block.childCount; childIndex++) {
            let child = children[childIndex];
            let len = this.nodeLength(child, refSeq, clientId);
            if (((!contains) && (pos < len)) || (contains && contains(child, pos, refSeq, clientId, undefined, undefined, clientData))) {
                // found entry containing pos
                if (!child.isLeaf()) {
                    return this.searchBlock(<IMergeBlock>child, pos, segpos, refSeq, clientId, actions, clientData);
                }
                else {
                    if (actions && actions.leaf) {
                        actions.leaf(<ISegment>child, segpos, refSeq, clientId, pos, -1, clientData);
                    }
                    return <ISegment>child;
                }
            }
            else {
                if (actions && actions.shift) {
                    actions.shift(child, segpos, refSeq, clientId, pos, undefined, clientData);
                }
                pos -= len;
                segpos += len;
            }
        }
        if (actions && actions.post) {
            actions.post(block, segpos, refSeq, clientId, undefined, undefined, clientData);
        }
    }

    private backwardSearch<TClientData>(pos: number, refSeq: number, clientId: number,
        actions?: SegmentActions<TClientData>, clientData?: TClientData): ISegment {
        return this.backwardSearchBlock(this.root, pos, this.getLength(refSeq, clientId), refSeq, clientId, actions, clientData);
    }

    private backwardSearchBlock<TClientData>(block: IMergeBlock, pos: number, segEnd: number, refSeq: number, clientId: number,
        actions?: SegmentActions<TClientData>, clientData?: TClientData): ISegment {
        let children = block.children;
        if (actions && actions.pre) {
            actions.pre(block, segEnd, refSeq, clientId, undefined, undefined, clientData);
        }
        let contains = actions && actions.contains;
        for (let childIndex = block.childCount - 1; childIndex >= 0; childIndex--) {
            let child = children[childIndex];
            let len = this.nodeLength(child, refSeq, clientId);
            let segpos = segEnd - len;
            if (((!contains) && (pos >= segpos)) ||
                (contains && contains(child, pos, refSeq, clientId, undefined, undefined, clientData))) {
                // found entry containing pos
                if (!child.isLeaf()) {
                    return this.backwardSearchBlock(<IMergeBlock>child, pos, segEnd, refSeq, clientId, actions, clientData);
                }
                else {
                    if (actions && actions.leaf) {
                        actions.leaf(<ISegment>child, segpos, refSeq, clientId, pos, -1, clientData);
                    }
                    return <ISegment>child;
                }
            }
            else {
                if (actions && actions.shift) {
                    actions.shift(child, segpos, refSeq, clientId, pos, undefined, clientData);
                }
                segEnd = segpos;
            }
        }
        if (actions && actions.post) {
            actions.post(block, segEnd, refSeq, clientId, undefined, undefined, clientData);
        }
    }

    private updateRoot(splitNode: IMergeBlock) {
        if (splitNode !== undefined) {
            let newRoot = this.makeBlock(2);
            newRoot.index = 0;
            newRoot.ordinal = "";
            newRoot.assignChild(this.root, 0, false);
            newRoot.assignChild(splitNode, 1, false);
            this.root = newRoot;
            this.nodeUpdateOrdinals(this.root);
            this.nodeUpdateLengthNewStructure(this.root);
        }
    }

    /**
     * Assign sequence number to existing segment; update partial lengths to reflect the change
     * @param seq - sequence number given by server to pending segment
     */
    ackPendingSegment(opArgs: IMergeTreeDeltaOpArgs, verboseOps = false) {
        const seq = opArgs.sequencedMessage.sequenceNumber;
        let pendingSegmentGroup = this.pendingSegments.dequeue();
        let nodesToUpdate = <IMergeBlock[]>[];
        let overwrite = false;
        if (pendingSegmentGroup !== undefined) {
            if (verboseOps) {
                console.log(`segment group has ${pendingSegmentGroup.segments.length} segments`);
            }
            pendingSegmentGroup.segments.map((pendingSegment) => {
                overwrite = !pendingSegment.ack(pendingSegmentGroup, opArgs, this) || overwrite;

                if (nodesToUpdate.indexOf(pendingSegment.parent) < 0) {
                    nodesToUpdate.push(pendingSegment.parent);
                }
            });
            const clientId = this.collabWindow.clientId;
            for (let node of nodesToUpdate) {
                this.blockUpdatePathLengths(node, seq, clientId, overwrite);
                //nodeUpdatePathLengths(node, seq, clientId, true);
            }
        }
    }

    private addToPendingList(segment: ISegment, segmentGroup?: SegmentGroup) {
        if (segmentGroup === undefined) {
            segmentGroup = <SegmentGroup>{ segments: [] };
            this.pendingSegments.enqueue(segmentGroup);
        }
        // TODO: share this group with UNDO
        segment.segmentGroups.enqueue(segmentGroup);
        return segmentGroup;
    }

    // TODO: error checking
    getSegmentFromId(id: string) {
        return this.idToSegment[id];
    }

    /**
     * Given a position specified relative to a marker id, lookup the marker
     * and convert the position to a character position.
     * @param relativePos - Id of marker (may be indirect) and whether position is before or after marker.
     * @param refseq - The reference sequence number at which to compute the position.
     * @param clientId - The client id with which to compute the position.
     */
    posFromRelativePos(relativePos: ops.IRelativePosition, refseq = UniversalSequenceNumber,
        clientId = this.collabWindow.clientId) {
        let pos = -1;
        let marker: Marker;
        if (relativePos.id) {
            marker = <Marker>this.getSegmentFromId(relativePos.id);
        }
        if (marker) {
            pos = this.getOffset(marker, refseq, clientId);
            if (!relativePos.before) {
                pos += marker.cachedLength;
                if (relativePos.offset !== undefined) {
                    pos += relativePos.offset;
                }
            } else {
                if (relativePos.offset !== undefined) {
                    pos -= relativePos.offset;
                }
            }

        }
        return pos;
    }

    public insertSegments(pos: number, segments: ISegment[], refSeq: number, clientId: number, seq: number, opArgs: IMergeTreeDeltaOpArgs) {
        // const tt = MergeTree.traceTraversal;
        // MergeTree.traceTraversal = true;
        this.ensureIntervalBoundary(pos, refSeq, clientId);

        if (MergeTree.traceOrdinals) {
            this.ordinalIntegrity();
        }

        this.blockInsert(pos, refSeq, clientId, seq, segments);

        // opArgs == undefined => loading snapshot or test code
        if (this.mergeTreeDeltaCallback && opArgs !== undefined){
            this.mergeTreeDeltaCallback(
                opArgs,
                {
                    mergeTreeClientId: clientId,
                    operation: ops.MergeTreeDeltaType.INSERT,
                    mergeTree: this,
                    deltaSegments: segments.map((segment)=>({segment})),
                });
        }

        // MergeTree.traceTraversal = tt;
        if (MergeTree.traceOrdinals) {
            this.ordinalIntegrity();
        }
        if (this.collabWindow.collaborating && MergeTree.options.zamboniSegments &&
            (seq != UnassignedSequenceNumber)) {
            this.zamboniSegments();
        }
    }

    public insertSiblingSegment(leftSibling: ISegment, insertSegment: ISegment, seq: number, clientId: number, opArgs: IMergeTreeDeltaOpArgs ){

        insertSegment.seq = seq;
        insertSegment.clientId = clientId;

        if (Marker.is(insertSegment)) {
            const markerId = insertSegment.getId();
            if (markerId) {
                this.mapIdToSegment(markerId, insertSegment);
            }
        }

        this.insertChildNode(leftSibling.parent, insertSegment, leftSibling.index + 1);

        // blocks should never be left full
        // if the inserts makes the block full
        // then we need to walk up the chain of parents
        // and split the blocks until we find a block with
        // room
        let ordinalUpdateNode: IMergeBlock;
        let block = leftSibling.parent;
        while (block !== undefined) {
            if (block.childCount >= MaxNodesInBlock) {
                const splitNode = this.split(block);
                if (block === this.root) {
                    this.updateRoot(splitNode);
                    // update root already updates all it's childrens
                    // oridnals
                    ordinalUpdateNode = undefined;
                } else {
                    this.insertChildNode(block.parent, splitNode, block.index + 1);
                    ordinalUpdateNode = splitNode;
                    this.blockUpdateLength(block.parent, seq, clientId);
                }
            } else {
                this.blockUpdateLength(block, seq, clientId);
            }
            block = block.parent;
        }
        // only update oridinals once, for all children,
        // on the path
        if (ordinalUpdateNode){
            this.nodeUpdateOrdinals(ordinalUpdateNode);
        }

        if (this.collabWindow.collaborating) {
            if (seq === UnassignedSequenceNumber) {
                this.addToPendingList(insertSegment);
            } else {
                this.addToLRUSet(insertSegment, seq);
            }
        }

        if (this.mergeTreeDeltaCallback) {
            this.mergeTreeDeltaCallback(
                opArgs,
                {
                    deltaSegments:[{segment: insertSegment}],
                    mergeTreeClientId: clientId,
                    operation: ops.MergeTreeDeltaType.INSERT,
                    mergeTree: this,
                });
        }

        if (this.collabWindow.collaborating && MergeTree.options.zamboniSegments &&
            (seq != UnassignedSequenceNumber)) {
            this.zamboniSegments();
        }
    }

    private insertChildNode(block: IMergeBlock, child: IMergeNode, childIndex: number) {

        assert(block.childCount < MaxNodesInBlock);

        for (let i = block.childCount; i > childIndex; i--) {
            block.children[i] = block.children[i - 1];
            block.children[i].index = i;
        }

        block.childCount++;
        block.assignChild(child, childIndex, true);
    }


    private blockInsert<T extends ISegment>(pos: number, refSeq: number, clientId: number, seq: number, newSegments: T[]) {
        let segIsLocal = false;
        let checkSegmentIsLocal = (segment: ISegment, pos: number, refSeq: number, clientId: number) => {
            if (segment.seq == UnassignedSequenceNumber) {
                if (MergeTree.diagInsertTie) {
                    console.log(`@cli ${glc(this, this.collabWindow.clientId)}: promoting continue due to seq ${segment.seq} text ${segment.toString()} ref ${refSeq}`);
                }
                segIsLocal = true;
            }
            // only need to look at first segment that follows finished node
            return false;
        }

        let continueFrom = (node: IMergeBlock) => {
            segIsLocal = false;
            this.rightExcursion(node, checkSegmentIsLocal);
            if (MergeTree.diagInsertTie && segIsLocal ) {
                console.log(`@cli ${glc(this, this.collabWindow.clientId)}: attempting continue with seq ${seq}  ref ${refSeq} `);
            }
            return segIsLocal;
        }

        let segmentGroup: SegmentGroup;
        let onLeaf = (segment: ISegment, pos: number, context: InsertContext) => {
            let saveIfLocal = (locSegment: ISegment) => {
                // save segment so can assign sequence number when acked by server
                if (this.collabWindow.collaborating) {
                    if ((locSegment.seq == UnassignedSequenceNumber) &&
                        (clientId == this.collabWindow.clientId)) {
                        segmentGroup = this.addToPendingList(locSegment, segmentGroup);
                    }
                    else if ((locSegment.seq >= this.collabWindow.minSeq) &&
                        MergeTree.options.zamboniSegments) {
                        this.addToLRUSet(locSegment, locSegment.seq);
                    }
                }
            }
            let segmentChanges = <ISegmentChanges>{};
            if (segment) {
                // insert before segment
                segmentChanges.replaceCurrent = context.candidateSegment;
                segmentChanges.next = segment;
            }
            else {
                segmentChanges.next = context.candidateSegment;
            }
            saveIfLocal(context.candidateSegment);
            return segmentChanges;
        }

        // TODO: build tree from segs and insert all at once
        let insertPos = pos;
        for(const newSegment of newSegments){

            segIsLocal = false;

            newSegment.seq = seq;
            newSegment.clientId = clientId;
            if (Marker.is(newSegment)) {
                const markerId = newSegment.getId();
                if (markerId) {
                    this.mapIdToSegment(markerId, newSegment);
                }
            }

            const splitNode = this.insertingWalk(this.root, insertPos, refSeq, clientId, seq,
                { leaf: onLeaf, candidateSegment: newSegment, continuePredicate: continueFrom });

            this.updateRoot(splitNode);

            insertPos += newSegment.cachedLength;
        }
    }
    private splitLeafSegment = (segment: ISegment, pos: number) => {
        let segmentChanges = <ISegmentChanges>{};
        if (pos > 0) {
            segmentChanges.next = segment.splitAt(pos);
        }
        return segmentChanges
    }

    private ensureIntervalBoundary(pos: number, refSeq: number, clientId: number) {
        let splitNode = this.insertingWalk(this.root, pos, refSeq, clientId, TreeMaintenanceSequenceNumber,
            { leaf: this.splitLeafSegment });
        this.updateRoot(splitNode);
    }

    // assume called only when pos == len
    private breakTie(pos: number, len: number, seq: number, node: IMergeNode, refSeq: number,
        clientId: number, candidateSegment?: ISegment) {
        if (node.isLeaf()) {
            if (pos === 0) {
                let segment = <ISegment>node;
                if (segment.seq !== UnassignedSequenceNumber) {
                    // ensure we merge right. segments with lower seq should come before segments with higher seq
                    return true
                } else {
                    // if the segment is unacked, and the new segment is unacked, the new segment should go first
                    // if the new segment is not unacked, the old segment should go first as it will have a greater seq
                    if (seq === UnassignedSequenceNumber) {
                        return true;
                    }
                }
            }
            return false;
        } else {
            return true;
        }
    }

    // visit segments starting from node's right siblings, then up to node's parent
    leftExcursion<TClientData>(node: IMergeNode, leafAction: ISegmentAction<TClientData>) {
        let actions = { leaf: leafAction };
        let go = true;
        let startNode = node;
        let parent = startNode.parent;
        while (parent) {
            let children = parent.children;
            let childIndex: number;
            let node: IMergeNode;
            let matchedStart = false;
            for (childIndex = parent.childCount - 1; childIndex >= 0; childIndex--) {
                node = children[childIndex];
                if (matchedStart) {
                    if (!node.isLeaf()) {
                        let childBlock = <IMergeBlock>node;
                        go = this.nodeMapReverse(childBlock, actions, 0, UniversalSequenceNumber,
                            this.collabWindow.clientId, undefined);
                    }
                    else {
                        go = leafAction(<ISegment>node, 0, UniversalSequenceNumber, this.collabWindow.clientId, 0, 0);
                    }
                    if (!go) {
                        return;
                    }
                }
                else {
                    matchedStart = (startNode === node);
                }
            }
            startNode = parent;
            parent = parent.parent;
        }
    }

    // visit segments starting from node's right siblings, then up to node's parent
    rightExcursion<TClientData>(node: IMergeNode, leafAction: ISegmentAction<TClientData>) {
        let actions = { leaf: leafAction };
        let go = true;
        let startNode = node;
        let parent = startNode.parent;
        while (parent) {
            let children = parent.children;
            let childIndex: number;
            let node: IMergeNode;
            let matchedStart = false;
            for (childIndex = 0; childIndex < parent.childCount; childIndex++) {
                node = children[childIndex];
                if (matchedStart) {
                    if (!node.isLeaf()) {
                        let childBlock = <IMergeBlock>node;
                        go = this.nodeMap(childBlock, actions, 0, UniversalSequenceNumber, this.collabWindow.clientId,
                            undefined);
                    }
                    else {
                        go = leafAction(<ISegment>node, 0, UniversalSequenceNumber, this.collabWindow.clientId, 0, 0);
                    }
                    if (!go) {
                        return;
                    }
                }
                else {
                    matchedStart = (startNode === node);
                }
            }
            startNode = parent;
            parent = parent.parent;
        }
    }

    private insertingWalk(block: IMergeBlock, pos: number, refSeq: number, clientId: number, seq: number,
        context: InsertContext) {
        let children = block.children;
        let childIndex: number;
        let child: IMergeNode;
        let newNode: IMergeNode;
        let fromSplit: IMergeBlock;
        let found = false;
        for (childIndex = 0; childIndex < block.childCount; childIndex++) {
            child = children[childIndex];
            const len = this.nodeLength(child, refSeq, clientId);
            if (MergeTree.traceTraversal) {
                let segInfo: string;
                if ((!child.isLeaf()) && this.collabWindow.collaborating) {
                    segInfo = `minLength: ${(<IMergeBlock>child).partialLengths.minLength}`;
                }
                else {
                    let segment = <ISegment>child;
                    segInfo = `cli: ${glc(this, segment.clientId)} seq: ${segment.seq} text: ${segment.toString()}`;
                    if (segment.removedSeq !== undefined) {
                        segInfo += ` rcli: ${glc(this, segment.removedClientId)} rseq: ${segment.removedSeq}`;
                    }
                }
                console.log(`@tcli: ${glc(this, this.collabWindow.clientId)} len: ${len} pos: ${pos} ` + segInfo);
            }

            if ((pos < len) || ((pos == len) && this.breakTie(pos, len, seq, child, refSeq, clientId, context.candidateSegment))) {
                // found entry containing pos
                found = true;
                if (!child.isLeaf()) {
                    let childBlock = <IMergeBlock>child;
                    //internal node
                    let splitNode = this.insertingWalk(childBlock, pos, refSeq, clientId,
                        seq, context);
                    if (splitNode === undefined) {
                        if (context.structureChange) {
                            this.nodeUpdateLengthNewStructure(block);
                        } else {
                            this.blockUpdateLength(block, seq, clientId);
                        }
                        return undefined;
                    }
                    else if (splitNode == MergeTree.theUnfinishedNode) {
                        if (MergeTree.traceTraversal) {
                            console.log(`@cli ${glc(this, this.collabWindow.clientId)} unfinished bus pos ${pos} len ${len}`);
                        }
                        pos -= len; // act as if shifted segment
                        continue;
                    }
                    else {
                        newNode = splitNode;
                        fromSplit = splitNode;
                        childIndex++; // insert after
                    }
                }
                else {
                    if (MergeTree.traceTraversal) {
                        console.log(`@tcli: ${glc(this, this.collabWindow.clientId)}: leaf action`);
                    }
                    const segment = child as ISegment
                    if (MergeTree.options.insertAfterRemovedSegs === true && len === 0) {
                        const branchId = this.getBranchId(clientId);
                        const segmentBranchId = this.getBranchId(segment.clientId);
                        const removalInfo = this.getRemovalInfo(branchId, segmentBranchId, segment);
                        // only skipped ack segments above the refSeq of the insert
                        if (removalInfo && removalInfo.removedSeq >= refSeq) {
                            continue;
                        }
                    }

                    let segmentChanges = context.leaf(segment, pos, context);
                    if (segmentChanges.replaceCurrent) {
                        if (MergeTree.traceOrdinals) {
                            console.log(`assign from leaf with block ord ${ordinalToArray(block.ordinal)}`);
                        }
                        block.assignChild(segmentChanges.replaceCurrent, childIndex, false);
                        segmentChanges.replaceCurrent.ordinal = child.ordinal;
                    }
                    if (segmentChanges.next) {
                        newNode = segmentChanges.next;
                        childIndex++; // insert after
                    }
                    else {
                        // no change
                        if (context.structureChange) {
                            this.nodeUpdateLengthNewStructure(block);
                        }
                        return undefined;
                    }
                }
                break;
            }
            else {
                pos -= len;
            }
        }
        if (MergeTree.traceTraversal) {
            if ((!found) && (pos > 0)) {
                console.log(`inserting walk fell through pos ${pos} len: ${this.blockLength(this.root, refSeq, clientId)}`);
            }
        }
        if (!newNode) {
            if (pos == 0) {
                if ((seq != UnassignedSequenceNumber) && context.continuePredicate &&
                    context.continuePredicate(block)) {
                    return MergeTree.theUnfinishedNode;
                }
                else {
                    if (MergeTree.traceTraversal) {
                        console.log(`@tcli: ${glc(this, this.collabWindow.clientId)}: leaf action pos 0`);
                    }
                    let segmentChanges = context.leaf(undefined, pos, context);
                    newNode = segmentChanges.next;
                    // assert segmentChanges.replaceCurrent === undefined
                }
            }
        }
        if (newNode) {
            for (let i = block.childCount; i > childIndex; i--) {
                block.children[i] = block.children[i - 1];
                block.children[i].index = i;
            }
            block.assignChild(newNode, childIndex, false);
            block.childCount++;
            block.setOrdinal(newNode, childIndex);
            if (block.childCount < MaxNodesInBlock) {
                if (fromSplit) {
                    if (MergeTree.traceOrdinals) {
                        console.log(`split ord ${ordinalToArray(fromSplit.ordinal)}`);
                    }
                    this.nodeUpdateOrdinals(fromSplit);
                }
                if (context.structureChange) {
                    this.nodeUpdateLengthNewStructure(block);
                } else {
                    this.blockUpdateLength(block, seq, clientId);
                }
                return undefined;
            }
            else {
                // don't update ordinals because higher block will do it
                return this.split(block);
            }
        }
        else {
            return undefined;
        }
    }

    private split(node: IMergeBlock) {
        let halfCount = MaxNodesInBlock / 2;
        let newNode = this.makeBlock(halfCount);
        node.childCount = halfCount;
        // update ordinals to reflect lowered child count
        this.nodeUpdateOrdinals(node);
        for (let i = 0; i < halfCount; i++) {
            newNode.assignChild(node.children[halfCount + i], i, false);
            node.children[halfCount + i] = undefined;
        }
        this.nodeUpdateLengthNewStructure(node);
        this.nodeUpdateLengthNewStructure(newNode);
        return newNode;
    }

    private ordinalIntegrity() {
        console.log("chk ordnls");
        this.nodeOrdinalIntegrity(this.root);
    }

    private nodeOrdinalIntegrity(block: IMergeBlock) {
        let olen = block.ordinal.length;
        for (let i = 0; i < block.childCount; i++) {
            if (block.children[i].ordinal) {
                if (olen !== (block.children[i].ordinal.length - 1)) {
                    console.log("node integrity issue");

                }
                if (i > 0) {
                    if (block.children[i].ordinal <= block.children[i - 1].ordinal) {
                        console.log("node sib integrity issue");
                        console.log(`??: prnt chld prev ${ordinalToArray(block.ordinal)} ${ordinalToArray(block.children[i].ordinal)} ${(i > 0) ? ordinalToArray(block.children[i - 1].ordinal) : "NA"}`);
                    }
                }
                if (!block.children[i].isLeaf()) {
                    this.nodeOrdinalIntegrity(<IMergeBlock>block.children[i]);
                }
            } else {
                console.log(`node child ordinal not set ${i}`);
                console.log(`??: prnt ${ordinalToArray(block.ordinal)}`);

            }
        }
    }

    private nodeUpdateOrdinals(block: IMergeBlock) {
        if (MergeTree.traceOrdinals) {
            console.log(`update ordinals for children of node with ordinal ${ordinalToArray(block.ordinal)}`);
        }
        let clockStart;
        if (MergeTree.options.measureOrdinalTime) {
            clockStart = clock();
        }
        for (let i = 0; i < block.childCount; i++) {
            let child = block.children[i];
            block.setOrdinal(child, i);
            if (!child.isLeaf()) {
                this.nodeUpdateOrdinals(<IMergeBlock>child);
            }
        }
        if (MergeTree.options.measureOrdinalTime) {
            let elapsed = elapsedMicroseconds(clockStart);
            if (elapsed > this.maxOrdTime) {
                this.maxOrdTime = elapsed;
            }
            this.ordTime += elapsed;
        }
    }

    private addOverlappingClient(removalInfo: IRemovalInfo, clientId: number) {
        if (!removalInfo.removedClientOverlap) {
            removalInfo.removedClientOverlap = <number[]>[];
        }
        if (MergeTree.diagOverlappingRemove) {
            console.log(`added cli ${glc(this, clientId)} to rseq: ${removalInfo.removedSeq}`);
        }
        removalInfo.removedClientOverlap.push(clientId);
    }

    /**
     * Annotate a range with properites
     * @param start - The inclusive start postition of the range to annotate
     * @param end - The exclusive end position of the range to annotate
     * @param props - The properties to annotate the range with
     * @param combiningOp - Optional. Specifies how to combine values for the property, such as "incr" for increment.
     * @param refSeq - The refernece sequence number to use to apply the annotate
     * @param clientId - The id of the client making the annotate
     * @param seq - The sequence number of the annotate operation
     * @param opArgs - The op args for the annotate op. this is passed to the merge tree callback if there is one
     */
    annotateRange(start: number, end: number, props: Properties.PropertySet, combiningOp: ops.ICombiningOp, refSeq: number,
        clientId: number, seq: number,  opArgs: IMergeTreeDeltaOpArgs) {
        this.ensureIntervalBoundary(start, refSeq, clientId);
        this.ensureIntervalBoundary(end, refSeq, clientId);
        const deltaSegments: IMergeTreeSegmentDelta[] = [];
        let segmentGroup: SegmentGroup;

        const annotateSegment = (segment: ISegment) => {
            const propertyDeltas = segment.addProperties(props, combiningOp, seq, this.collabWindow);
            deltaSegments.push({ segment, propertyDeltas });
            if (this.collabWindow.collaborating){
                if (seq === UnassignedSequenceNumber) {
                    segmentGroup = this.addToPendingList(segment, segmentGroup);
                } else {
                    if (MergeTree.options.zamboniSegments) {
                        this.addToLRUSet(segment, segment.seq);
                    }
                }
            }
            return true;
        }

        this.mapRange({ leaf: annotateSegment }, refSeq, clientId, undefined, start, end);

        // opArgs == undefined => test code
        if (this.mergeTreeDeltaCallback) {
            this.mergeTreeDeltaCallback(
                opArgs,
                {
                    mergeTreeClientId: clientId,
                    operation: ops.MergeTreeDeltaType.ANNOTATE,
                    mergeTree: this,
                    deltaSegments,
                });
        }
        if (this.collabWindow.collaborating && (seq != UnassignedSequenceNumber)) {
            if (MergeTree.options.zamboniSegments) {
                this.zamboniSegments();
            }
        }
    }

    markRangeRemoved(start: number, end: number, refSeq: number, clientId: number, seq: number, overwrite = false, opArgs: IMergeTreeDeltaOpArgs) {
        this.ensureIntervalBoundary(start, refSeq, clientId);
        this.ensureIntervalBoundary(end, refSeq, clientId);
        let segmentGroup: SegmentGroup;
        const removedSegments: IMergeTreeSegmentDelta[] = []
        let savedLocalRefs = <LocalReference[][]>[];
        let markRemoved = (segment: ISegment, pos: number, start: number, end: number) => {
            let branchId = this.getBranchId(clientId);
            let segBranchId = this.getBranchId(segment.clientId);
            for (let brid = branchId; brid <= this.localBranchId; brid++) {
                let removalInfo = this.getRemovalInfo(brid, segBranchId, segment);
                if (removalInfo.removedSeq != undefined) {
                    if (MergeTree.diagOverlappingRemove) {
                        console.log(`yump @seq ${seq} cli ${glc(this, this.collabWindow.clientId)}: overlaps deleted segment ${removalInfo.removedSeq} text '${segment.toString()}'`);
                    }
                    overwrite = true;
                    if (removalInfo.removedSeq === UnassignedSequenceNumber) {
                        // will only happen on local branch (brid === this.localBranchId)
                        // replace because comes later
                        removalInfo.removedClientId = clientId;
                        removalInfo.removedSeq = seq;
                    }
                    else {
                        // do not replace earlier sequence number for remove
                        this.addOverlappingClient(removalInfo, clientId);
                    }
                }
                else {
                    removalInfo.removedClientId = clientId;
                    removalInfo.removedSeq = seq;
                    removedSegments.push({segment});
                    if (segment.localRefs && (brid === this.localBranchId)) {
                        if (segment.localRefs.length > 0) {
                            savedLocalRefs.push(segment.localRefs);
                        }
                        segment.localRefs = undefined;
                    }
                }
            }
            // save segment so can assign removed sequence number when acked by server
            if (this.collabWindow.collaborating) {
                // use removal information
                let removalInfo = this.getRemovalInfo(this.localBranchId, segBranchId, segment);
                if ((removalInfo.removedSeq === UnassignedSequenceNumber) && (clientId === this.collabWindow.clientId)) {
                    segmentGroup = this.addToPendingList(segment, segmentGroup);
                }
                else {
                    if (MergeTree.options.zamboniSegments) {
                        this.addToLRUSet(segment, seq);
                    }
                }
                //console.log(`saved local removed seg with text: ${textSegment.text}`);
            }
            return true;
        }
        let afterMarkRemoved = (node: IMergeBlock, pos: number, start: number, end: number) => {
            if (overwrite) {
                this.nodeUpdateLengthNewStructure(node);
            }
            else {
                this.blockUpdateLength(node, seq, clientId);
            }
            return true;
        }
        // MergeTree.traceTraversal = true;
        this.mapRange({ leaf: markRemoved, post: afterMarkRemoved }, refSeq, clientId, undefined, start, end);
        if (savedLocalRefs.length > 0) {
            const afterSegOff = this.getContainingSegment(start, refSeq, clientId);
            const afterSeg = afterSegOff.segment;
            for (let segSavedRefs of savedLocalRefs) {
                for (let localRef of segSavedRefs) {
                    if (afterSeg && localRef.refType && (localRef.refType & ops.ReferenceType.SlideOnRemove)) {
                        localRef.segment = afterSeg;
                        localRef.offset = 0;
                        afterSeg.addLocalRef(localRef);
                    } else {
                        localRef.segment = undefined;
                        localRef.offset = 0;
                    }
                }
            }
            if (afterSeg) {
                this.blockUpdatePathLengths(afterSeg.parent, TreeMaintenanceSequenceNumber,
                    LocalClientId);
            }
        }

        // opArgs == undefined => test code
        if (this.mergeTreeDeltaCallback) {
            this.mergeTreeDeltaCallback(
                opArgs,
                {
                    mergeTreeClientId: clientId,
                    operation: ops.MergeTreeDeltaType.REMOVE,
                    mergeTree: this,
                    deltaSegments: removedSegments,
                });
        }
        if (this.collabWindow.collaborating && (seq != UnassignedSequenceNumber)) {
            if (MergeTree.options.zamboniSegments) {
                this.zamboniSegments();
            }
        }
        // MergeTree.traceTraversal = false;
    }

    // This method is deprecated should not be used. It modifies existing segments.
    removeRange(start: number, end: number, refSeq: number, clientId: number) {
        let removeInfo = <RemoveRangeInfo>{};
        this.nodeRemoveRange(this.root, start, end, refSeq, clientId, removeInfo);
        if (removeInfo.highestBlockRemovingChildren) {
            let remBlock = removeInfo.highestBlockRemovingChildren;
            this.nodeUpdateOrdinals(remBlock);
        }
    }

    nodeRemoveRange(block: IMergeBlock, start: number, end: number, refSeq: number, clientId: number, removeInfo: RemoveRangeInfo) {
        let children = block.children;
        let startIndex: number;
        if (start < 0) {
            startIndex = -1;
        }
        let endIndex = block.childCount;
        for (let childIndex = 0; childIndex < block.childCount; childIndex++) {
            let child = children[childIndex];
            let len = this.nodeLength(child, refSeq, clientId);
            if ((start >= 0) && (start < len)) {
                startIndex = childIndex;
                if (!child.isLeaf()) {
                    this.nodeRemoveRange(<IMergeBlock>child, start, end, refSeq, clientId, removeInfo);
                }
                else {
                    let segment = <ISegment>child;
                    if (segment.removeRange(start, end)) {
                        startIndex--;
                    }
                }
            }
            // REVIEW: run this clause even if above clause runs
            if (end < len) {
                endIndex = childIndex;
                if (end > 0) {
                    if (endIndex > startIndex) {
                        if (!child.isLeaf()) {
                            this.nodeRemoveRange(<IMergeBlock>child, start, end, refSeq, clientId, removeInfo);
                        }
                        else {
                            let segment = <ISegment>child;
                            if (segment.removeRange(0, end)) {
                                endIndex++;
                            }
                        }
                    }
                }
                break;
            }
            start -= len;
            end -= len;
        }
        let deleteCount = (endIndex - startIndex) - 1;
        let deleteStart = startIndex + 1;
        if (deleteCount > 0) {
            // delete nodes in middle of range
            let copyStart = deleteStart + deleteCount;
            let copyCount = block.childCount - copyStart;
            for (let j = 0; j < copyCount; j++) {
                block.assignChild(children[copyStart + j], deleteStart + j, false);
            }
            block.childCount -= deleteCount;
            if (removeInfo.highestBlockRemovingChildren && removeInfo.highestBlockRemovingChildren.parent &&
                (removeInfo.highestBlockRemovingChildren.parent === block.parent)) {
                removeInfo.highestBlockRemovingChildren = block.parent;
            } else {
                removeInfo.highestBlockRemovingChildren = block;
            }
        }
        this.nodeUpdateLengthNewStructure(block);
    }

    private nodeUpdateLengthNewStructure(node: IMergeBlock, recur = false) {
        this.blockUpdate(node);
        if (this.collabWindow.collaborating) {
            node.partialLengths = PartialSequenceLengths.combine(this, node, this.collabWindow, recur);
        }
    }

    removeLocalReference(segment: ISegment, lref: LocalReference) {
        let removedRef = segment.removeLocalRef(lref);
        if (removedRef) {
            this.blockUpdatePathLengths(segment.parent, TreeMaintenanceSequenceNumber,
                LocalClientId);
        }
    }

    addLocalReference(lref: LocalReference) {
        let segment = lref.segment;
        segment.addLocalRef(lref);
        this.blockUpdatePathLengths(segment.parent, TreeMaintenanceSequenceNumber,
            LocalClientId);
    }

    private blockUpdate(block: IMergeBlock) {
        let len = 0;
        let hierBlock: IHierBlock;
        if (this.blockUpdateMarkers) {
            hierBlock = block.hierBlock();
            hierBlock.rightmostTiles = Properties.createMap<Marker>();
            hierBlock.leftmostTiles = Properties.createMap<Marker>();
            hierBlock.rangeStacks = {};
        }
        for (let i = 0; i < block.childCount; i++) {
            let child = block.children[i];
            len += nodeTotalLength(this, child);
            if (this.blockUpdateMarkers) {
                hierBlock.addNodeReferences(this, child);
            }
            if (this.blockUpdateActions) {
                this.blockUpdateActions.child(block, i);
            }
        }
        block.cachedLength = len;
    }

    private blockUpdatePathLengths(block: IMergeBlock, seq: number, clientId: number, newStructure = false) {
        while (block !== undefined) {
            if (newStructure) {
                this.nodeUpdateLengthNewStructure(block);
            }
            else {
                this.blockUpdateLength(block, seq, clientId);
            }
            block = block.parent;
        }
    }

    private blockUpdateLength(node: IMergeBlock, seq: number, clientId: number) {
        this.blockUpdate(node);
        if (this.collabWindow.collaborating && (seq != UnassignedSequenceNumber) && (seq != TreeMaintenanceSequenceNumber)) {
            if (node.partialLengths !== undefined && MergeTree.options.incrementalUpdate) {
                node.partialLengths.update(this, node, seq, clientId, this.collabWindow);
            } 
            else {
                node.partialLengths = PartialSequenceLengths.combine(this, node, this.collabWindow);
            }
        }
    }

    map<TClientData>(actions: SegmentActions<TClientData>, refSeq: number, clientId: number, accum?: TClientData) {
        // TODO: optimize to avoid comparisons
        this.nodeMap(this.root, actions, 0, refSeq, clientId, accum);
    }

    mapRange<TClientData>(actions: SegmentActions<TClientData>, refSeq: number, clientId: number, accum?: TClientData, start?: number, end?: number) {
        this.nodeMap(this.root, actions, 0, refSeq, clientId, accum, start, end);
    }

    rangeToString(start: number, end: number) {
        let strbuf = "";
        for (let childIndex = 0; childIndex < this.root.childCount; childIndex++) {
            let child = this.root.children[childIndex];
            if (!child.isLeaf()) {
                let block = <IMergeBlock>child;
                let len = this.blockLength(block, UniversalSequenceNumber,
                    this.collabWindow.clientId);
                if ((start <= len) && (end > 0)) {
                    strbuf += this.nodeToString(block, strbuf, 0);
                }
                start -= len;
                end -= len;
            }
        }
        return strbuf;
    }

    nodeToString(block: IMergeBlock, strbuf: string, indentCount = 0) {
        strbuf += internedSpaces(indentCount);
        strbuf += `Node (len ${block.cachedLength}) p len (${block.parent ? block.parent.cachedLength : 0}) ord ${ordinalToArray(block.ordinal)} with ${block.childCount} segs:\n`;
        if (this.blockUpdateMarkers) {
            strbuf += internedSpaces(indentCount);
            strbuf += (<IHierBlock>block).hierToString(indentCount);
        }
        if (this.collabWindow.collaborating) {
            strbuf += internedSpaces(indentCount);
            strbuf += block.partialLengths.toString((id) => glc(this, id), indentCount) + '\n';
        }
        let children = block.children;
        for (let childIndex = 0; childIndex < block.childCount; childIndex++) {
            let child = children[childIndex];
            if (!child.isLeaf()) {
                strbuf = this.nodeToString(<IMergeBlock>child, strbuf, indentCount + 4);
            }
            else {
                let segment = <ISegment>child;
                strbuf += internedSpaces(indentCount + 4);
                strbuf += `cli: ${glc(this, segment.clientId)} seq: ${segment.seq} ord: ${ordinalToArray(segment.ordinal)}`;
                let segBranchId = this.getBranchId(segment.clientId);
                let branchId = this.localBranchId;
                let removalInfo = this.getRemovalInfo(branchId, segBranchId, segment);
                if (removalInfo.removedSeq !== undefined) {
                    strbuf += ` rcli: ${glc(this, removalInfo.removedClientId)} rseq: ${removalInfo.removedSeq}`;
                }
                strbuf += "\n";
                strbuf += internedSpaces(indentCount + 4);
                strbuf += segment.toString();
                strbuf += "\n";
            }
        }
        return strbuf;
    }

    toString() {
        return this.nodeToString(this.root, "", 0);
    }

    public incrementalBlockMap<TContext>(stateStack: Collections.Stack<IncrementalMapState<TContext>>) {
        while (!stateStack.empty()) {
            let state = stateStack.top();
            if (state.op != IncrementalExecOp.Go) {
                return;
            }
            if (state.childIndex == 0) {
                if (state.start === undefined) {
                    state.start = 0;
                }
                if (state.end === undefined) {
                    state.end = this.blockLength(state.block, state.refSeq, state.clientId);
                }

                if (state.actions.pre) {
                    state.actions.pre(state);
                }
            }
            if ((state.op == IncrementalExecOp.Go) && (state.childIndex < state.block.childCount)) {
                let child = state.block.children[state.childIndex];
                let len = this.nodeLength(child, state.refSeq, state.clientId);
                if (MergeTree.traceIncrTraversal) {
                    if (child.isLeaf()) {
                        console.log(`considering (r ${state.refSeq} c ${glc(this, state.clientId)}) seg with text ${child["text"]} len ${len} seq ${(<ISegment>child).seq} rseq ${(<ISegment>child).removedSeq} cli ${glc(this, (<ISegment>child).clientId)}`);
                    }
                }
                if ((len > 0) && (state.start < len) && (state.end > 0)) {
                    if (!child.isLeaf()) {
                        let childState = new IncrementalMapState(<IMergeBlock>child, state.actions, state.pos,
                            state.refSeq, state.clientId, state.context, state.start, state.end, 0);
                        stateStack.push(childState);
                    }
                    else {
                        if (MergeTree.traceIncrTraversal) {
                            console.log(`action on seg with text ${child["text"]}`);
                        }
                        state.actions.leaf(<ISegment>child, state);
                    }
                }
                state.pos += len;
                state.start -= len;
                state.end -= len;
                state.childIndex++;
            }
            else {
                if (state.childIndex == state.block.childCount) {
                    if ((state.op == IncrementalExecOp.Go) && state.actions.post) {
                        state.actions.post(state);
                    }
                    stateStack.pop();
                }
            }
        }
    }

    nodeMap<TClientData>(node: IMergeBlock, actions: SegmentActions<TClientData>, pos: number, refSeq: number,
        clientId: number, accum?: TClientData, start?: number, end?: number) {
        if (start === undefined) {
            start = 0;
        }
        if (end === undefined) {
            end = this.blockLength(node, refSeq, clientId);
        }
        let go = true;
        if (actions.pre) {
            go = actions.pre(node, pos, refSeq, clientId, start, end, accum);
            if (!go) {
                // cancel this node but not entire traversal
                return true;
            }
        }
        let children = node.children;
        for (let childIndex = 0; childIndex < node.childCount; childIndex++) {
            let child = children[childIndex];
            let len = this.nodeLength(child, refSeq, clientId);
            if (MergeTree.traceTraversal) {
                let segInfo: string;
                if ((!child.isLeaf()) && this.collabWindow.collaborating) {
                    segInfo = `minLength: ${(<IMergeBlock>child).partialLengths.minLength}`;
                }
                else {
                    let segment = <ISegment>child;
                    segInfo = `cli: ${glc(this, segment.clientId)} seq: ${segment.seq} text: '${segment.toString()}'`;
                    if (segment.removedSeq !== undefined) {
                        segInfo += ` rcli: ${glc(this, segment.removedClientId)} rseq: ${segment.removedSeq}`;
                    }
                }
                console.log(`@tcli ${glc(this, this.collabWindow.clientId)}: map len: ${len} start: ${start} end: ${end} ` + segInfo);
            }
            let isLeaf = child.isLeaf();
            if (go && (end > 0) && (len > 0) && (start < len)) {
                // found entry containing pos
                if (!isLeaf) {
                    if (go) {
                        go = this.nodeMap(<IMergeBlock>child, actions, pos, refSeq, clientId, accum, start, end);
                    }
                }
                else {
                    if (MergeTree.traceTraversal) {
                        console.log(`@tcli ${glc(this, this.collabWindow.clientId)}: map leaf action`);
                    }
                    go = actions.leaf(<ISegment>child, pos, refSeq, clientId, start, end, accum);
                }
            }
            if (!go) {
                break;
            }
            if (actions.shift) {
                actions.shift(child, pos, refSeq, clientId, start, end, accum);
            }
            pos += len;
            start -= len;
            end -= len;
        }
        if (go && actions.post) {
            go = actions.post(node, pos, refSeq, clientId, start, end, accum);
        }

        return go;
    }

    // straight call every segment; goes until leaf action returns false
    nodeMapReverse<TClientData>(block: IMergeBlock, actions: SegmentActions<TClientData>, pos: number, refSeq: number,
        clientId: number, accum?: TClientData) {
        let go = true;
        let children = block.children;
        for (let childIndex = block.childCount - 1; childIndex >= 0; childIndex--) {
            let child = children[childIndex];
            let isLeaf = child.isLeaf();
            if (go) {
                // found entry containing pos
                if (!isLeaf) {
                    if (go) {
                        go = this.nodeMapReverse(<IMergeBlock>child, actions, pos, refSeq, clientId, accum);
                    }
                }
                else {
                    go = actions.leaf(<ISegment>child, pos, refSeq, clientId, 0, 0, accum);
                }
            }
            if (!go) {
                break;
            }
        }
        return go;
    }

}




