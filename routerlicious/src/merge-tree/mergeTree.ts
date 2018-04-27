// tslint:disable

import * as Base from "./base";
import * as Collections from "./collections";
import * as ops from "./ops";
import * as API from "../api-core";
import { IAuthenticatedUser, ISequencedObjectMessage } from "../api-core";
import * as Properties from "./properties";
import * as assert from "assert";
import { IRelativePosition } from "./index";

export interface ReferencePosition {
    properties: Properties.PropertySet;
    refType: ops.ReferenceType;
    /** True if this reference is a segment. */
    isLeaf(): boolean;
    getSegment(): BaseSegment;
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
    properties: Properties.PropertySet;
    pairedRef?: LocalReference;

    constructor(public segment: BaseSegment, public offset = 0,
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
            if (this.segment.ordinal < b.segment.ordinal) {
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
            return -1;
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

export enum SegmentType {
    Base,
    Text,
    Marker,
    External
}

export interface IRemovalInfo {
    removedSeq?: number;
    removedClientId?: number;
    removedClientOverlap?: number[];
}

export interface Segment extends IMergeNode, IRemovalInfo {
    segmentGroup?: SegmentGroup;
    seq?: number;  // if not present assumed to be previous to window min
    clientId?: number;
    localRefs?: LocalReference[];
    removalsByBranch?: IRemovalInfo[];
    splitAt(pos: number): Segment;
    canAppend(segment: Segment, mergeTree: MergeTree): boolean;
    append(segment: Segment);
    getType(): SegmentType;
    removeRange(start: number, end: number): boolean;
}

export interface SegmentAction<TClientData> {
    (segment: Segment, pos: number, refSeq: number, clientId: number, start: number,
        end: number, accum?: TClientData): boolean;
}

export interface SegmentChanges {
    next?: Segment;
    replaceCurrent?: Segment;
}

export interface BlockAction<TClientData> {
    (block: IMergeBlock, pos: number, refSeq: number, clientId: number, start: number, end: number,
        accum?: TClientData): boolean;
}

export interface NodeAction<TClientData> {
    (node: MergeNode, pos: number, refSeq: number, clientId: number, start: number, end: number,
        clientData?: TClientData): boolean;
}

export interface IncrementalSegmentAction<TContext> {
    (segment: Segment, state: IncrementalMapState<TContext>);
}

export interface IncrementalBlockAction<TContext> {
    (state: IncrementalMapState<TContext>);
}

export interface BlockUpdateActions {
    child: (block: IMergeBlock, index: number) => void;
}

export interface InsertContext {
    prepareEvents?: boolean;
    leaf: (segment: Segment, pos: number) => SegmentChanges;
    continuePredicate?: (continueFromBlock: IMergeBlock) => boolean;
}

export interface SegmentActions<TClientData> {
    leaf?: SegmentAction<TClientData>;
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
    segments: Segment[];
    onAck?(seq: number);
}

export interface OverlapClient {
    clientId: number;
    seglen: number;
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

function addNodeReferences(mergeTree: MergeTree, node: MergeNode,
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
        let segment = <Segment>node;
        if (mergeTree.localNetLength(segment) > 0) {
            if (segment.getType() == SegmentType.Marker) {
                let marker = <Marker>node;
                let markerId = marker.getId();
                // also in insertMarker but need for reload segs case
                // can add option for this only from reload segs
                if (markerId) {
                    mergeTree.mapIdToSegment(markerId, marker);
                }
                let markerLocalId = marker.getLocalId();
                if (markerLocalId) {
                    mergeTree.mapLocalIdToSegment(markerLocalId, marker);
                }
                if (marker.refType & ops.ReferenceType.Tile) {
                    addTile(marker, rightmostTiles);
                    addTileIfNotPresent(marker, leftmostTiles);
                }
                if (marker.refType & (ops.ReferenceType.NestBegin | ops.ReferenceType.NestEnd)) {
                    for (let label of marker.getRangeLabels()) {
                        updateRangeInfo(label, marker);
                    }
                }
            } else {
                // TODO: generalize to other segment types
                let textSegment = <TextSegment>node;
                if (textSegment.localRefs && (textSegment.hierRefCount !== undefined) &&
                    (textSegment.hierRefCount > 0)) {
                    for (let lref of textSegment.localRefs) {
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

function nodeTotalLength(mergeTree: MergeTree, node: MergeNode) {
    if (!node.isLeaf()) {
        return node.cachedLength;
    }
    else {
        return mergeTree.localNetLength(<Segment>node);
    }
}

export abstract class BaseSegment extends MergeNode implements Segment {
    constructor(public seq?: number, public clientId?: number) {
        super();
    }
    index: number;
    ordinal: string;
    removedSeq: number;
    removedClientId: number;
    removedClientOverlap: number[];
    segmentGroup: SegmentGroup;
    properties: Properties.PropertySet;
    localRefs: LocalReference[];
    hierRefCount?: number;

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

    addProperties(newProps: Properties.PropertySet, op?: ops.ICombiningOp) {
        this.properties = Properties.addProperties(this.properties, newProps, op);
    }

    hasProperty(key: string) {
        return this.properties && (this.properties[key]!==undefined);
    }

    isLeaf() {
        return true;
    }

    cloneInto(b: BaseSegment) {
        b.clientId = this.clientId;
        // TODO: deep clone properties
        b.properties = Properties.extend(Properties.createMap<any>(), this.properties);
        b.removedClientId = this.removedClientId;
        // TODO: copy removed client overlap and branch removal info
        b.removedSeq = this.removedSeq;
        b.seq = this.seq;
    }

    canAppend(segment: Segment, mergeTree: MergeTree) {
        return false;
    }

    abstract clone(): BaseSegment;
    abstract append(segment: Segment): Segment;
    abstract getType(): SegmentType;
    abstract removeRange(start: number, end: number): boolean;
    abstract splitAt(pos: number): Segment;
}

/**
 * A non-collaborative placeholder for external content.
 */
export class ExternalSegment extends BaseSegment {
    constructor(public placeholderSeq, public charLength: number, public lengthBytes: number,
        public binPosition: number) {
        super();
    }

    mergeTreeInsert(mergeTree: MergeTree, pos: number, refSeq: number, clientId: number, seq: number) {
        mergeTree.insert(pos, refSeq, clientId, seq, this, (block, pos, refSeq, clientId, seq, eseg) =>
            mergeTree.blockInsert(block, pos, refSeq, clientId, seq, eseg));
    }

    clone(): BaseSegment {
        throw new Error('clone not implemented');
    }

    append(segment: Segment): Segment {
        throw new Error('Can not append to external segment');
    }

    getType(): SegmentType {
        return SegmentType.External;
    }

    removeRange(start: number, end: number): boolean {
        throw new Error('Method not implemented.');
    }

    splitAt(pos: number): Segment {
        throw new Error('Method not implemented.');
    }
}

export let reservedTileLabelsKey = "referenceTileLabels";
export let reservedRangeLabelsKey = "referenceRangeLabels";
export let reservedMarkerIdKey = "markerId";
export let reservedMarkerLocalIdKey = "markerLocalId";

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

export class Marker extends BaseSegment implements ReferencePosition {
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

    getProperties() {
        return this.properties;
    }

    getId() {
        if (this.properties && this.properties[reservedMarkerIdKey]) {
            return this.properties[reservedMarkerIdKey];
        }
    }

    getLocalId() {
        if (this.properties && this.properties[reservedMarkerLocalIdKey]) {
            return this.properties[reservedMarkerLocalIdKey];
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
        } else {
            let localId=this.getLocalId();
            if (localId) {
                bbuf+=` (LOC ${localId}) `;
            }
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
        let pbuf="";
        if (this.properties) {
                pbuf += JSON.stringify(this.properties);
        }
        return `M ${bbuf}: ${lbuf} ${pbuf}`;
    }

    getType() {
        return SegmentType.Marker;
    }

    removeRange(start: number, end: number): boolean {
        console.log("remove range called on marker");
        return false;
    }

    splitAt(pos: number) {
        return undefined;
    }

    canAppend(segment: Segment) {
        return false;
    }

    append(segment: Segment) {
        return undefined;
    }

}

export class TextSegment extends BaseSegment {
    public static make(text: string, props?: Properties.PropertySet, seq?: number, clientId?: number) {
        let tseg = new TextSegment(text, seq, clientId);
        if (props) {
            tseg.addProperties(props);
        }
        return tseg;
    }

    constructor(public text: string, seq?: number, clientId?: number) {
        super(seq, clientId);
        this.cachedLength = text.length;
    }

    splitLocalRefs(pos: number, leafSegment: TextSegment) {
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

    splitAt(pos: number) {
        if (pos > 0) {
            let remainingText = this.text.substring(pos);
            this.text = this.text.substring(0, pos);
            this.cachedLength = this.text.length;
            let leafSegment = new TextSegment(remainingText, this.seq, this.clientId);
            if (this.properties) {
                leafSegment.addProperties(Properties.extend(Properties.createMap<any>(), this.properties));
            }
            segmentCopy(this, leafSegment, true);
            if (this.localRefs) {
                this.splitLocalRefs(pos, leafSegment);
            }
            return leafSegment;
        }
    }

    clone(start = 0, end?: number) {
        let text = this.text;
        if (end === undefined) {
            text = text.substring(start);
        } else {
            text = text.substring(start, end);
        }
        let b = TextSegment.make(text, this.properties, this.seq, this.clientId);
        this.cloneInto(b);
        return b;
    }

    getType() {
        return SegmentType.Text;
    }

    // TODO: use function in properties.ts
    matchProperties(b: TextSegment) {
        if (this.properties) {
            if (!b.properties) {
                return false;
            } else {
                let bProps = b.properties;
                // for now, straightforward; later use hashing
                for (let key in this.properties) {
                    if (bProps[key] === undefined) {
                        return false;
                    } else if (bProps[key] !== this.properties[key]) {
                        return false;
                    }
                }
                for (let key in bProps) {
                    if (this.properties[key] === undefined) {
                        return false;
                    }
                }
            }
        } else {
            if (b.properties) {
                return false;
            }
        }
        return true;
    }

    canAppend(segment: Segment, mergeTree: MergeTree) {
        if ((!this.removedSeq) && (this.text.charAt(this.text.length - 1) != '\n')) {
            if (segment.getType() === SegmentType.Text) {
                if (this.matchProperties(<TextSegment>segment)) {
                    let branchId = mergeTree.getBranchId(this.clientId);
                    let segBranchId = mergeTree.getBranchId(segment.clientId);
                    if ((segBranchId === branchId) && (mergeTree.localNetLength(segment) > 0)) {
                        return ((this.cachedLength <= MergeTree.TextSegmentGranularity) ||
                            (segment.cachedLength <= MergeTree.TextSegmentGranularity));
                    }
                }
            }
        }
        return false;
    }

    toString() {
        return this.text;
    }

    append(segment: Segment) {
        if (segment.getType() === SegmentType.Text) {
            if (segment.localRefs) {
                let adj = this.text.length;
                for (let localRef of segment.localRefs) {
                    localRef.offset += adj;
                    localRef.segment = this;
                }
            }
            this.text += (<TextSegment>segment).text;
            this.cachedLength = this.text.length;
            return this;
        }
        else {
            throw new Error("can only append text segment");
        }
    }

    // TODO: retain removed text for undo
    // returns true if entire string removed
    removeRange(start: number, end: number) {
        let remnantString = "";
        let len = this.text.length;
        if (start > 0) {
            remnantString += this.text.substring(0, start);
        }
        if (end < len) {
            remnantString += this.text.substring(end);
        }
        this.text = remnantString;
        this.cachedLength = remnantString.length;
        return (remnantString.length == 0);
    }
}

function segmentCopy(from: Segment, to: Segment, propSegGroup = false) {
    to.parent = from.parent;
    to.removedClientId = from.removedClientId;
    to.removedSeq = from.removedSeq;
    if (from.removalsByBranch) {
        to.removalsByBranch = <IRemovalInfo[]>[];
        for (let i = 0, len = from.removalsByBranch.length; i < len; i++) {
            let fromRemovalInfo = from.removalsByBranch[i];
            if (fromRemovalInfo) {
                to.removalsByBranch[i] = {
                    removedClientId: fromRemovalInfo.removedClientId,
                    removedSeq: fromRemovalInfo.removedSeq,
                    removedClientOverlap: fromRemovalInfo.removedClientOverlap,
                }
            }
        }
    }
    to.seq = from.seq;
    to.clientId = from.clientId;
    to.removedClientOverlap = from.removedClientOverlap;
    to.segmentGroup = from.segmentGroup;
    if (to.segmentGroup) {
        if (propSegGroup) {
            addToSegmentGroup(to);
        }
        else {
            segmentGroupReplace(from, to);
        }
    }
}

function incrementalGatherText(segment: Segment, state: IncrementalMapState<TextSegment>) {
    if (segment.getType() == SegmentType.Text) {
        let textSegment = <TextSegment>segment;

        if (MergeTree.traceGatherText) {
            console.log(`@cli ${this.collabWindow ? this.collabwindow.clientId : -1} gather seg seq ${textSegment.seq} rseq ${textSegment.removedSeq} text ${textSegment.text}`);
        }
        if ((state.start <= 0) && (state.end >= textSegment.text.length)) {
            state.context.text += textSegment.text;
        }
        else {
            if (state.end >= textSegment.text.length) {
                state.context.text += textSegment.text.substring(state.start);
            }
            else {
                state.context.text += textSegment.text.substring(state.start, state.end);
            }
        }
    }
    state.op = IncrementalExecOp.Go;
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
 * Sequence numbers for collaborative segments start at 1 or greater.  Every segment marked
 * with sequence number zero will be counted as part of the requested string.
 */
export const UniversalSequenceNumber = 0;
export const UnassignedSequenceNumber = -1;
export const TreeMaintainanceSequenceNumber = -2;
export const LocalClientId = -1;
export const NonCollabClient = -2;

export interface PartialSequenceLength {
    seq: number;
    len: number;
    seglen: number;
    clientId?: number;
    overlapClients?: Collections.RedBlackTree<number, OverlapClient>;
}

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

/**
 * Returns the partial length whose sequence number is 
 * the greatest sequence number within a that is
 * less than or equal to key.
 * @param {PartialLength[]} a array of partial segment lengths
 * @param {number} key sequence number
 */
function latestLEQ(a: PartialSequenceLength[], key: number) {
    let best = -1;
    let lo = 0;
    let hi = a.length - 1;
    while (lo <= hi) {
        let mid = lo + Math.floor((hi - lo) / 2);
        if (a[mid].seq <= key) {
            if ((best < 0) || (a[best].seq < a[mid].seq)) {
                best = mid;
            }
            lo = mid + 1;
        }
        else {
            hi = mid - 1;
        }
    }
    return best;
}

export function compareNumbers(a: number, b: number) {
    return a - b;
}

function compareStrings(a: string, b: string) {
    return a.localeCompare(b);
}

/**
 * Keep track of partial sums of segment lengths for all sequence numbers
 * in the current collaboration window (if any).  Only used during active
 * collaboration.
 */
export class PartialSequenceLengths {
    minLength = 0;
    segmentCount = 0;
    partialLengths: PartialSequenceLength[] = [];
    clientSeqNumbers: PartialSequenceLength[][] = [];
    downstreamPartialLengths: PartialSequenceLengths[];
    static options = {
        zamboni: true
    };

    constructor(public minSeq: number) {
    }

    cliLatestLEQ(clientId: number, refSeq: number) {
        let cliSeqs = this.clientSeqNumbers[clientId];
        if (cliSeqs) {
            return latestLEQ(cliSeqs, refSeq);
        }
        else {
            return -1;
        }
    }

    cliLatest(clientId: number) {
        let cliSeqs = this.clientSeqNumbers[clientId];
        if (cliSeqs && (cliSeqs.length > 0)) {
            return cliSeqs.length - 1;
        }
        else {
            return -1;
        }
    }

    compare(b: PartialSequenceLengths) {
        function comparePartialLengths(aList: PartialSequenceLength[], bList: PartialSequenceLength[]) {
            let aLen = aList.length;
            let bLen = bList.length;
            if (aLen != bLen) {
                return false;
            }
            for (let i = 0; i < aLen; i++) {
                let aPartial = aList[i];
                let bPartial = bList[i];
                if ((aPartial.seq != bPartial.seq) || (aPartial.clientId != bPartial.clientId) ||
                    (aPartial.seglen != bPartial.seglen) || (aPartial.len != bPartial.len) || (aPartial.overlapClients && (!bPartial.overlapClients))) {
                    return false;
                }
            }
            return true;
        }
        if (!comparePartialLengths(this.partialLengths, b.partialLengths)) {
            return false;
        }
        for (let clientId in this.clientSeqNumbers) {
            if (!b.clientSeqNumbers[clientId]) {
                return false;
            }
            else if (!comparePartialLengths(this.clientSeqNumbers[clientId], b.clientSeqNumbers[clientId])) {
                return false;
            }
        }
        return true;
    }

    branchToString(glc?: (id: number) => string, branchId = 0) {
        let buf = "";
        for (let partial of this.partialLengths) {
            buf += `(${partial.seq},${partial.len}) `;
        }
        for (let clientId in this.clientSeqNumbers) {
            if (this.clientSeqNumbers[clientId].length > 0) {
                buf += `Client `;
                if (glc) {
                    buf += `${glc(+clientId)}`;
                } else {
                    buf += `${clientId}`;
                }
                buf += '[';
                for (let partial of this.clientSeqNumbers[clientId]) {
                    buf += `(${partial.seq},${partial.len})`
                }
                buf += ']';
            }
        }
        buf = `Br ${branchId}, min(seq ${this.minSeq}): ${this.minLength}; sc: ${this.segmentCount};` + buf;
        return buf;
    }

    toString(glc?: (id: number) => string, indentCount = 0) {
        let buf = this.branchToString(glc);
        if (this.downstreamPartialLengths) {
            for (let i = 0, len = this.downstreamPartialLengths.length; i < len; i++) {
                buf += "\n";
                buf += internedSpaces(indentCount);
                buf += this.downstreamPartialLengths[i].branchToString(glc, i + 1);
            }
        }
        return buf;
    }

    getPartialLength(mergeTree: MergeTree, refSeq: number, clientId: number) {
        let branchId = mergeTree.getBranchId(clientId);
        if (MergeTree.traceTraversal) {
            console.log(`plen branch ${branchId}`);
        }
        if (branchId > 0) {
            return this.downstreamPartialLengths[branchId - 1].getBranchPartialLength(refSeq, clientId);
        } else {
            return this.getBranchPartialLength(refSeq, clientId);
        }
    }

    getBranchPartialLength(refSeq: number, clientId: number) {
        let pLen = this.minLength;
        let seqIndex = latestLEQ(this.partialLengths, refSeq);
        let cliLatestindex = this.cliLatest(clientId);
        let cliSeq = this.clientSeqNumbers[clientId];
        if (seqIndex >= 0) {
            pLen += this.partialLengths[seqIndex].len;
            if (cliLatestindex >= 0) {
                let cliLatest = cliSeq[cliLatestindex];

                if (cliLatest.seq > refSeq) {
                    pLen += cliLatest.len;
                    let precedingCliIndex = this.cliLatestLEQ(clientId, refSeq);
                    if (precedingCliIndex >= 0) {
                        pLen -= cliSeq[precedingCliIndex].len;
                    }
                }
            }
        }
        else {
            if (cliLatestindex >= 0) {
                let cliLatest = cliSeq[cliLatestindex];
                pLen += cliLatest.len;
            }
        }
        return pLen;
    }

    // clear away partial sums for sequence numbers earlier than the current window
    zamboni(segmentWindow: CollaborationWindow) {
        function copyDown(partialLengths: PartialSequenceLength[]) {
            let mindex = latestLEQ(partialLengths, segmentWindow.minSeq);
            let minLength = 0;
            //console.log(`mindex ${mindex}`);
            if (mindex >= 0) {
                minLength = partialLengths[mindex].len;
                let seqCount = partialLengths.length;
                if (mindex <= (seqCount - 1)) {
                    // still some entries remaining
                    let remainingCount = (seqCount - mindex) - 1;
                    //copy down
                    for (let i = 0; i < remainingCount; i++) {
                        partialLengths[i] = partialLengths[i + mindex + 1];
                        partialLengths[i].len -= minLength;
                    }
                    partialLengths.length = remainingCount;
                }
            }
            return minLength;
        }
        this.minLength += copyDown(this.partialLengths);
        for (let clientId in this.clientSeqNumbers) {
            let cliPartials = this.clientSeqNumbers[clientId];
            if (cliPartials) {
                copyDown(cliPartials);
            }
        }
    }

    addClientSeqNumber(clientId: number, seq: number, seglen: number) {
        if (this.clientSeqNumbers[clientId] === undefined) {
            this.clientSeqNumbers[clientId] = [];
        }
        let cli = this.clientSeqNumbers[clientId];
        let pLen = seglen;
        if (cli.length > 0) {
            pLen += cli[cli.length - 1].len;
        }
        cli.push({ seq: seq, len: pLen, seglen: seglen });

    }
    // assumes sequence number already coalesced
    addClientSeqNumberFromPartial(partialLength: PartialSequenceLength) {
        this.addClientSeqNumber(partialLength.clientId, partialLength.seq, partialLength.seglen);
        if (partialLength.overlapClients) {
            partialLength.overlapClients.map((oc: Base.Property<number, OverlapClient>) => {
                this.addClientSeqNumber(oc.data.clientId, partialLength.seq, oc.data.seglen);
                return true;
            });
        }
    }

    update(mergeTree: MergeTree, block: IMergeBlock, seq: number, clientId: number, collabWindow: CollaborationWindow) {
        let segBranchId = mergeTree.getBranchId(clientId);
        // console.log(`seg br ${segBranchId} cli ${glc(mergeTree, segment.clientId)} me ${glc(mergeTree, mergeTree.collabWindow.clientId)}`);
        if (segBranchId == 0) {
            this.updateBranch(mergeTree, 0, block, seq, clientId, collabWindow);
        }
        if (mergeTree.localBranchId > 0) {
            for (let i = 0; i < mergeTree.localBranchId; i++) {
                let branchId = i + 1;
                if (segBranchId <= branchId) {
                    this.downstreamPartialLengths[i].updateBranch(mergeTree, branchId, block, seq, clientId, collabWindow);
                }
            }
        }

    }

    // assume: seq is latest sequence number; no structural change to sub-tree, but a segment
    // with sequence number seq has been added within the sub-tree
    // TODO: assert client id matches
    updateBranch(mergeTree: MergeTree, branchId: number, node: IMergeBlock, seq: number, clientId: number, collabWindow: CollaborationWindow) {
        let seqSeglen = 0;
        let segCount = 0;
        // compute length for seq across children
        for (let i = 0; i < node.childCount; i++) {
            let child = node.children[i];
            if (!child.isLeaf()) {
                let childBlock = <IMergeBlock>child;
                let branchPartialLengths = childBlock.partialLengths.partialLengthsForBranch(branchId);
                let partialLengths = branchPartialLengths.partialLengths;
                let seqIndex = latestLEQ(partialLengths, seq);
                if (seqIndex >= 0) {
                    let leqPartial = partialLengths[seqIndex];
                    if (leqPartial.seq == seq) {
                        seqSeglen += leqPartial.seglen;
                    }
                }
                segCount += branchPartialLengths.segmentCount;
            }
            else {
                let segment = <Segment>child;
                if (segment.seq == seq) {
                    seqSeglen += segment.cachedLength;
                }
                else {
                    let segBranchId = mergeTree.getBranchId(segment.clientId);
                    let removalInfo = mergeTree.getRemovalInfo(branchId, segBranchId, segment);
                    if (removalInfo.removedSeq === seq) {
                        seqSeglen -= segment.cachedLength;
                    }
                }
                segCount++;
            }
        }
        this.segmentCount = segCount;

        function addSeq(partialLengths: PartialSequenceLength[], seq: number, clientId?: number) {
            let seqPartialLen: PartialSequenceLength;
            let penultPartialLen: PartialSequenceLength;
            let leqIndex = latestLEQ(partialLengths, seq);
            if (leqIndex >= 0) {
                let pLen = partialLengths[leqIndex];
                if (pLen.seq == seq) {
                    seqPartialLen = pLen;
                    leqIndex = latestLEQ(partialLengths, seq - 1);
                    if (leqIndex >= 0) {
                        penultPartialLen = partialLengths[leqIndex];
                    }
                }
                else {
                    penultPartialLen = pLen;
                }
            }
            if (seqPartialLen === undefined) {
                seqPartialLen = <PartialSequenceLength>{
                    seq: seq,
                    seglen: seqSeglen,
                    clientId: clientId
                }
                partialLengths.push(seqPartialLen);
            }
            else {
                seqPartialLen.seglen = seqSeglen;
                // assert client id matches
            }
            if (penultPartialLen !== undefined) {
                seqPartialLen.len = seqPartialLen.seglen + penultPartialLen.len;
            }
            else {
                seqPartialLen.len = seqPartialLen.seglen;
            }

        }
        addSeq(this.partialLengths, seq, clientId);
        if (this.clientSeqNumbers[clientId] === undefined) {
            this.clientSeqNumbers[clientId] = [];
        }
        addSeq(this.clientSeqNumbers[clientId], seq);
        //    console.log(this.toString());
        if (PartialSequenceLengths.options.zamboni) {
            this.zamboni(collabWindow);
        }
        //   console.log('ZZZ');
        //   console.log(this.toString());
    }

    static fromLeaves(mergeTree: MergeTree, branchId: number, combinedPartialLengths: PartialSequenceLengths,
        block: IMergeBlock, collabWindow: CollaborationWindow) {
        combinedPartialLengths.minLength = 0;
        combinedPartialLengths.segmentCount = block.childCount;

        function getOverlapClients(overlapClientids: number[], seglen: number) {
            let bst = new Collections.RedBlackTree<number, OverlapClient>(compareNumbers);
            for (let clientId of overlapClientids) {
                bst.put(clientId, <OverlapClient>{ clientId: clientId, seglen: seglen });
            }
            return bst;
        }

        function accumulateClientOverlap(partialLength: PartialSequenceLength, overlapClientIds: number[], seglen: number) {
            if (partialLength.overlapClients) {
                for (let clientId of overlapClientIds) {
                    let ovlapClientNode = partialLength.overlapClients.get(clientId);
                    if (!ovlapClientNode) {
                        partialLength.overlapClients.put(clientId, <OverlapClient>{ clientId: clientId, seglen: seglen });
                    }
                    else {
                        ovlapClientNode.data.seglen += seglen;
                    }
                }
            }
            else {
                partialLength.overlapClients = getOverlapClients(overlapClientIds, seglen);
            }
        }

        function insertSegment(segment: Segment, removedSeq = false, removalInfo = undefined) {
            let seq = segment.seq;
            let segmentLen = segment.cachedLength;
            let clientId = segment.clientId;
            let removedClientOverlap: number[];

            if (removedSeq) {
                seq = removalInfo.removedSeq;
                segmentLen = -segmentLen;
                clientId = removalInfo.removedClientId;
                if (removalInfo.removedClientOverlap) {
                    removedClientOverlap = removalInfo.removedClientOverlap;
                }
            }

            let seqPartials = combinedPartialLengths.partialLengths;
            let seqPartialsLen = seqPartials.length;
            // find the first entry with sequence number greater or equal to seq
            let indexFirstGTE = 0;
            for (; indexFirstGTE < seqPartialsLen; indexFirstGTE++) {
                if (seqPartials[indexFirstGTE].seq >= seq) {
                    break;
                }
            }
            if ((indexFirstGTE < seqPartialsLen) && (seqPartials[indexFirstGTE].seq == seq)) {
                seqPartials[indexFirstGTE].seglen += segmentLen;
                if (removedClientOverlap) {
                    accumulateClientOverlap(seqPartials[indexFirstGTE], removedClientOverlap, segmentLen);
                }
            }
            else {
                let pLen: PartialSequenceLength;
                if (removedClientOverlap) {
                    let overlapClients = getOverlapClients(removedClientOverlap, segmentLen);
                    pLen = { seq: seq, clientId: clientId, len: 0, seglen: segmentLen, overlapClients: overlapClients };
                }
                else {
                    pLen = { seq: seq, clientId: clientId, len: 0, seglen: segmentLen };
                }

                if (indexFirstGTE < seqPartialsLen) {
                    // shift entries with greater sequence numbers
                    // TODO: investigate performance improvement using BST
                    for (let k = seqPartialsLen; k > indexFirstGTE; k--) {
                        seqPartials[k] = seqPartials[k - 1];
                    }
                    seqPartials[indexFirstGTE] = pLen;
                }
                else {
                    seqPartials.push(pLen);
                }
            }
        }

        function seqLTE(seq: number, minSeq: number) {
            return (seq != UnassignedSequenceNumber) && (seq <= minSeq);
        }

        for (let i = 0; i < block.childCount; i++) {
            let child = block.children[i];
            if (child.isLeaf()) {
                // leaf segment
                let segment = <Segment>child;
                let segBranchId = mergeTree.getBranchId(segment.clientId);
                // console.log(`seg br ${segBranchId} cli ${glc(mergeTree, segment.clientId)} me ${glc(mergeTree, mergeTree.collabWindow.clientId)}`);
                if (segBranchId <= branchId) {
                    if (seqLTE(segment.seq, collabWindow.minSeq)) {
                        combinedPartialLengths.minLength += segment.cachedLength;
                    }
                    else {
                        if (segment.seq != UnassignedSequenceNumber) {
                            insertSegment(segment);
                        }
                    }
                    let removalInfo = mergeTree.getRemovalInfo(branchId, segBranchId, segment);
                    if (seqLTE(removalInfo.removedSeq, collabWindow.minSeq)) {
                        combinedPartialLengths.minLength -= segment.cachedLength;
                    }
                    else {
                        if ((removalInfo.removedSeq !== undefined) &&
                            (removalInfo.removedSeq != UnassignedSequenceNumber)) {
                            insertSegment(segment, true, removalInfo);
                        }
                    }
                }
            }
        }
        // post-process correctly-ordered partials computing sums and creating
        // lists for each present client id
        let seqPartials = combinedPartialLengths.partialLengths;
        let seqPartialsLen = seqPartials.length;

        let prevLen = 0;
        for (let i = 0; i < seqPartialsLen; i++) {
            seqPartials[i].len = prevLen + seqPartials[i].seglen;
            prevLen = seqPartials[i].len;
            combinedPartialLengths.addClientSeqNumberFromPartial(seqPartials[i]);
        }
    }

    static combine(mergeTree: MergeTree, block: IMergeBlock, collabWindow: CollaborationWindow, recur = false) {
        let partialLengthsTopBranch = PartialSequenceLengths.combineBranch(mergeTree, block, collabWindow, 0, recur);
        if (mergeTree.localBranchId > 0) {
            partialLengthsTopBranch.downstreamPartialLengths = <PartialSequenceLengths[]>[];
            for (let i = 0; i < mergeTree.localBranchId; i++) {
                partialLengthsTopBranch.downstreamPartialLengths[i] =
                    PartialSequenceLengths.combineBranch(mergeTree, block, collabWindow, i + 1, recur)
            }
        }
        return partialLengthsTopBranch;
    }

    partialLengthsForBranch(branchId: number) {
        if (branchId > 0) {
            return this.downstreamPartialLengths[branchId - 1];
        } else {
            return this;
        }
    }
    /**
     * Combine the partial lengths of block's children
     * @param {IMergeBlock} block an interior node; it is assumed that each interior node child of this block
     * has its partials up to date 
     * @param {CollaborationWindow} collabWindow segment window fo the segment tree containing textSegmentBlock
     */
    static combineBranch(mergeTree: MergeTree, block: IMergeBlock, collabWindow: CollaborationWindow, branchId: number, recur = false) {
        let combinedPartialLengths = new PartialSequenceLengths(collabWindow.minSeq);
        PartialSequenceLengths.fromLeaves(mergeTree, branchId, combinedPartialLengths, block, collabWindow);
        let prevPartial: PartialSequenceLength;

        function combineOverlapClients(a: PartialSequenceLength, b: PartialSequenceLength) {
            if (a.overlapClients) {
                if (b.overlapClients) {
                    b.overlapClients.map((bProp: Base.Property<number, OverlapClient>) => {
                        let aProp = a.overlapClients.get(bProp.key);
                        if (aProp) {
                            aProp.data.seglen += bProp.data.seglen;
                        }
                        else {
                            a.overlapClients.put(bProp.data.clientId, bProp.data);
                        }
                        return true;
                    });
                }
            }
            else {
                a.overlapClients = b.overlapClients;
            }
        }

        function addNext(partialLength: PartialSequenceLength) {
            let seq = partialLength.seq;
            let pLen = 0;

            if (prevPartial) {
                if (prevPartial.seq == partialLength.seq) {
                    prevPartial.seglen += partialLength.seglen;
                    prevPartial.len += partialLength.seglen;
                    combineOverlapClients(prevPartial, partialLength);
                    return;
                }
                else {
                    pLen = prevPartial.len;
                    // previous sequence number is finished
                    combinedPartialLengths.addClientSeqNumberFromPartial(prevPartial);
                }
            }
            prevPartial = {
                seq: seq,
                clientId: partialLength.clientId,
                len: pLen + partialLength.seglen,
                seglen: partialLength.seglen,
                overlapClients: partialLength.overlapClients
            };
            combinedPartialLengths.partialLengths.push(prevPartial);
        }

        let childPartials: PartialSequenceLengths[] = [];
        for (let i = 0; i < block.childCount; i++) {
            let child = block.children[i];
            if (!child.isLeaf()) {
                let childBlock = <IMergeBlock>child;
                if (recur) {
                    childBlock.partialLengths = PartialSequenceLengths.combine(mergeTree, childBlock, collabWindow, true);
                }
                childPartials.push(childBlock.partialLengths.partialLengthsForBranch(branchId));
            }
        }
        let childPartialsLen = childPartials.length;
        if (childPartialsLen != 0) {
            // some children are interior nodes
            if (combinedPartialLengths.partialLengths.length > 0) {
                // some children were leaves; add combined partials from these segments 
                childPartials.push(combinedPartialLengths);
                childPartialsLen++;
                combinedPartialLengths = new PartialSequenceLengths(collabWindow.minSeq);
            }
            let indices = new Array(childPartialsLen);
            let childPartialsCounts = new Array(childPartialsLen);
            for (let i = 0; i < childPartialsLen; i++) {
                indices[i] = 0;
                childPartialsCounts[i] = childPartials[i].partialLengths.length;
                combinedPartialLengths.minLength += childPartials[i].minLength;
                combinedPartialLengths.segmentCount += childPartials[i].segmentCount;
            }
            let outerIndexOfEarliest = 0;
            let earliestPartialLength: PartialSequenceLength;
            while (outerIndexOfEarliest >= 0) {
                outerIndexOfEarliest = -1;
                for (let k = 0; k < childPartialsLen; k++) {
                    // find next earliest sequence number 
                    if (indices[k] < childPartialsCounts[k]) {
                        let cpLen = childPartials[k].partialLengths[indices[k]];
                        if ((outerIndexOfEarliest < 0) || (cpLen.seq < earliestPartialLength.seq)) {
                            outerIndexOfEarliest = k;
                            earliestPartialLength = cpLen;
                        }
                    }
                }
                if (outerIndexOfEarliest >= 0) {
                    addNext(earliestPartialLength);
                    indices[outerIndexOfEarliest]++;
                }
            }
            // add client entry for last partial, if any
            if (prevPartial) {
                combinedPartialLengths.addClientSeqNumberFromPartial(prevPartial);
            }
        }
        // TODO: incremental zamboni during build
        //console.log(combinedPartialLengths.toString());
        //console.log(`ZZZ...(min ${segmentWindow.minSeq})`);
        if (PartialSequenceLengths.options.zamboni) {
            combinedPartialLengths.zamboni(collabWindow);
        }
        //console.log(combinedPartialLengths.toString());
        return combinedPartialLengths;
    }
}

function addToSegmentGroup(segment: Segment) {
    segment.segmentGroup.segments.push(segment);
}

function removeFromSegmentGroup(segmentGroup: SegmentGroup, toRemove: Segment) {
    let index = segmentGroup.segments.indexOf(toRemove);
    if (index >= 0) {
        segmentGroup.segments.splice(index, 1);
    }
    toRemove.segmentGroup = undefined;
}

function segmentGroupReplace(currentSeg: Segment, newSegment: Segment) {
    let segmentGroup = currentSeg.segmentGroup;
    for (let i = 0, len = segmentGroup.segments.length; i < len; i++) {
        if (segmentGroup.segments[i] == currentSeg) {
            segmentGroup.segments[i] = newSegment;
            break;
        }
    }
    currentSeg.segmentGroup = undefined;
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

/**
 * Used for in-memory testing.  This will queue a reference string for each client message.
 */
export const useCheckQ = false;

function checkTextMatchRelative(refSeq: number, clientId: number, server: TestServer,
    msg: API.ISequencedObjectMessage) {
    let client = server.clients[clientId];
    let serverText = server.mergeTree.getText(refSeq, clientId);
    let cliText = client.checkQ.dequeue();
    if ((cliText === undefined) || (cliText != serverText)) {
        console.log(`mismatch `);
        console.log(msg);
        //        console.log(serverText);
        //        console.log(cliText);
        console.log(server.mergeTree.toString());
        console.log(client.mergeTree.toString());
        return true;
    }
    return false;
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
    seg: Segment;
    op: ops.MergeTreeDeltaType;
}

export class RegisterCollection {
    clientCollections: Properties.MapLike<Properties.MapLike<Segment[]>> =
        Properties.createMap();
    set(clientId: string, id: string, segments: Segment[]) {
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
    measureOps = false;
    q: Collections.List<API.ISequencedObjectMessage>;
    checkQ: Collections.List<string>;
    clientSequenceNumber = 1;
    clientNameToIds = new Collections.RedBlackTree<string, ClientIds>(compareStrings);
    shortClientIdMap = <string[]>[];
    shortClientBranchIdMap = <number[]>[];
    shortClientUserInfoMap = <IAuthenticatedUser[]>[];
    registerCollection = new RegisterCollection();
    localSequenceNumber = UnassignedSequenceNumber;
    public longClientId: string;
    public userInfo: IAuthenticatedUser;
    public undoSegments: IUndoInfo[];
    public redoSegments: IUndoInfo[];

    constructor(initText: string, options?: Properties.PropertySet) {
        this.mergeTree = new MergeTree(initText, options);
        this.mergeTree.getLongClientId = id => this.getLongClientId(id);
        this.mergeTree.getUserInfo = id => this.getUserInfo(id);
        this.mergeTree.clientIdToBranchId = this.shortClientBranchIdMap;
        this.q = Collections.ListMakeHead<API.ISequencedObjectMessage>();
        this.checkQ = Collections.ListMakeHead<string>();
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
            } else {
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
        } else {
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
        this.mergeTree.blockCloneFromSegments(this.mergeTree.root, segments);
        clone.mergeTree.reloadFromSegments(segments);
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
            } else if (b.seq === UnassignedSequenceNumber) {
                return -1;
            } else if (a.seq === UnassignedSequenceNumber) {
                return 1;
            } else {
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
    makeInsertMarkerMsg(markerType: string, behaviors: ops.ReferenceType, pos: number, seq: number,
        refSeq: number, objectId: string) {
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
            type: API.OperationType,
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
            type: API.OperationType,
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
            type: API.OperationType,
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
            type: API.OperationType,
        };
    }

    hasMessages(): boolean {
        return this.q.count() > 0;
    }

    enqueueMsg(msg: API.ISequencedObjectMessage) {
        this.q.enqueue(msg);
    }

    dequeueMsg(): API.ISequencedObjectMessage {
        return this.q.dequeue();
    }

    enqueueTestString() {
        this.checkQ.enqueue(this.getText());
    }

    segmentToOps(segment: Segment, opList: ops.IMergeTreeOp[]) {
        // TODO: branches
        if (segment.seq === UnassignedSequenceNumber) {
            let pos = this.mergeTree.getOffset(segment, this.getCurrentSeq(),
                this.getClientId());
            let baseSegment = <BaseSegment>segment;
            let insertOp = <ops.IMergeTreeInsertMsg>{
                pos1: pos,
                type: ops.MergeTreeDeltaType.INSERT,
            };
            if (segment.getType() === SegmentType.Text) {
                let textSegment = <TextSegment>segment;
                insertOp.text = textSegment.text;
            } else {
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
            let start = this.mergeTree.getOffset(segment, this.getCurrentSeq(),
                this.getClientId());
            let removeOp = <ops.IMergeTreeRemoveMsg>{
                pos1: start,
                pos2: start + segment.cachedLength,
                type: ops.MergeTreeDeltaType.REMOVE,
            };
            opList.push(removeOp);
        }
    }

    transformOp(op: ops.IMergeTreeOp, msg: API.ISequencedObjectMessage, toSequenceNumber: number) {
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
            op.pos1 = this.mergeTree.tardisPosition(op.pos1, msg.referenceSequenceNumber,
                toSequenceNumber);
        }
        else if (op.type === ops.MergeTreeDeltaType.GROUP) {
            for (let i = 0, len = op.ops.length; i < len; i++) {
                op.ops[i] = this.transformOp(op.ops[i], msg, toSequenceNumber);
            }
        }
        return op;
    }

    transform(msg: API.ISequencedObjectMessage, toSequenceNumber: number) {
        if (msg.referenceSequenceNumber >= toSequenceNumber) {
            return msg;
        }
        let op = <ops.IMergeTreeOp>msg.contents;
        msg.contents = this.transformOp(op, msg, toSequenceNumber);
    }

    copy(start: number, end: number, registerId: string, refSeq: number, clientId: number,
        longClientId: string) {
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
                } else {
                    let marker = <Marker>seg;
                    this.insertMarkerLocal(pos, marker.refType, marker.properties);
                    pos += marker.cachedLength;
                }
            }
            this.mergeTree.endGroupOperation();
        }
        return pos;
    }

    pasteRemote(pos: number, registerId: string, seq: number, refSeq: number, clientId: number,
        longClientId) {
        let segs = this.registerCollection.get(longClientId, registerId);
        if (segs) {
            // TODO: build tree from segs and insert all at once
            for (let seg of segs) {
                if (seg.getType() === SegmentType.Text) {
                    let textSegment = <TextSegment>seg;
                    this.insertTextRemote(textSegment.text,
                        pos, textSegment.properties, seq, refSeq, clientId);
                    pos += textSegment.cachedLength;
                } else {
                    let marker = <Marker>seg;
                    this.insertMarkerRemote({ refType: marker.refType }, pos,
                        marker.properties, seq, refSeq, clientId);
                    pos += marker.cachedLength;
                }
            }
        }
        // TODO: error reporting
    }

    applyOp(op: ops.IMergeTreeOp, msg: API.ISequencedObjectMessage) {
        let clid = this.getOrAddShortClientId(msg.clientId);
        switch (op.type) {
            case ops.MergeTreeDeltaType.INSERT:
                if (op.relativePos1) {
                    op.pos1 = this.mergeTree.posFromRelativePos(op.relativePos1,
                        msg.referenceSequenceNumber, clid);
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
                    this.insertTextRemote(op.text, op.pos1, op.props as Properties.PropertySet, msg.sequenceNumber, msg.referenceSequenceNumber,
                        clid);
                } else if (op.marker !== undefined) {
                    this.insertMarkerRemote(op.marker, op.pos1, op.props as Properties.PropertySet, msg.sequenceNumber, msg.referenceSequenceNumber,
                        clid);
                } else if (op.register !== undefined) {
                    // TODO: relative addressing
                    if (op.pos2 !== undefined) {
                        // copy
                        this.copy(op.pos1, op.pos2, op.register, msg.referenceSequenceNumber, clid,
                            msg.clientId);
                    } else {
                        // paste
                        this.pasteRemote(op.pos1, op.register, msg.sequenceNumber, msg.referenceSequenceNumber,
                            clid, msg.clientId);
                    }
                }
                break;
            case ops.MergeTreeDeltaType.REMOVE:
                if (op.relativePos1) {
                    op.pos1 = this.mergeTree.posFromRelativePos(op.relativePos1,
                        msg.referenceSequenceNumber, clid);
                    if (op.pos1 < 0) {
                        // TODO: event when marker id not found
                        return;
                    }
                }
                if (op.relativePos2) {
                    op.pos2 = this.mergeTree.posFromRelativePos(op.relativePos2,
                        msg.referenceSequenceNumber, clid);
                    if (op.pos2 < 0) {
                        // TODO: event when marker id not found
                        return;
                    }
                }
                if (op.register) {
                    // cut 
                    this.copy(op.pos1, op.pos2, op.register, msg.referenceSequenceNumber,
                        clid, msg.clientId);
                }
                this.removeSegmentRemote(op.pos1, op.pos2, msg.sequenceNumber, msg.referenceSequenceNumber,
                    clid);
                break;
            case ops.MergeTreeDeltaType.ANNOTATE:
                if (op.relativePos1) {
                    op.pos1 = this.mergeTree.posFromRelativePos(op.relativePos1,
                        msg.referenceSequenceNumber, clid);
                    if (op.pos1 < 0) {
                        // TODO: event when marker id not found
                        return;
                    }
                }
                if (op.relativePos2) {
                    op.pos2 = this.mergeTree.posFromRelativePos(op.relativePos2,
                        msg.referenceSequenceNumber, clid);
                    if (op.pos2 < 0) {
                        // TODO: event when marker id not found
                        return;
                    }
                }
                this.annotateSegmentRemote(op.props, op.pos1, op.pos2, msg.sequenceNumber, msg.referenceSequenceNumber,
                    clid, op.combiningOp);
                break;
            case ops.MergeTreeDeltaType.GROUP: {
                for (let memberOp of op.ops) {
                    this.applyOp(memberOp, msg);
                }
                break;
            }
        }
    }

    coreApplyMsg(msg: API.ISequencedObjectMessage) {
        this.applyOp(<ops.IMergeTreeOp>msg.contents, msg);
    }

    applyMsg(msg: API.ISequencedObjectMessage) {
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
        if (msg.type === API.OperationType) {
            const operationMessage = msg as API.ISequencedObjectMessage;
            if (msg.clientId === this.longClientId) {
                let op = <ops.IMergeTreeOp>msg.contents;
                if (op.type !== ops.MergeTreeDeltaType.ANNOTATE) {
                    this.ackPendingSegment(operationMessage.sequenceNumber);
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
                        this.insertMarkerLocal(op.pos1, op.marker.refType,
                            op.props);
                    } else {
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

    annotateSegmentLocal(props: Properties.PropertySet, start: number, end: number, op: ops.ICombiningOp) {
        let segWindow = this.mergeTree.getCollabWindow();
        let clientId = segWindow.clientId;
        let refSeq = segWindow.currentSeq;
        let seq = this.getLocalSequenceNumber();

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

    annotateSegmentRemote(props: Properties.PropertySet, start: number, end: number, seq: number, refSeq: number,
        clientId: number, combiningOp: ops.ICombiningOp) {
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
        if (this.verboseOps) {
            console.log(`@cli ${this.getLongClientId(this.mergeTree.getCollabWindow().clientId)} seq ${seq} annotate remote start ${start} end ${end} refseq ${refSeq} cli ${clientId}`);
        }
    }

    removeSegmentLocal(start: number, end: number) {
        let segWindow = this.mergeTree.getCollabWindow();
        let clientId = segWindow.clientId;
        let refSeq = segWindow.currentSeq;
        let seq = this.getLocalSequenceNumber();

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
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }

        this.mergeTree.insertMarker(pos, refSeq, clientId, seq, behaviors, props);

        if (this.measureOps) {
            this.localTime += elapsedMicroseconds(clockStart);
            this.localOps++;
        }
        if (this.verboseOps) {
            console.log(`insert local marke pos ${pos} cli ${this.getLongClientId(clientId)} ref seq ${refSeq}`);
        }
    }

    insertMarkerRemote(marker: ops.IMarkerDef, pos: number, props: Properties.PropertySet, seq: number, refSeq: number, clientId: number) {
        let clockStart;
        if (this.measureOps) {
            clockStart = clock();
        }

        this.mergeTree.insertMarker(pos, refSeq, clientId, seq, marker.refType, props);
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

    startCollaboration(longClientId: string, userInfo: IAuthenticatedUser = null, minSeq = 0, branchId = 0) {
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

export interface ClientSeq {
    refSeq: number;
    clientId: string;
}

export var clientSeqComparer: Collections.Comparer<ClientSeq> = {
    min: { refSeq: -1, clientId: "" },
    compare: (a, b) => a.refSeq - b.refSeq
}

/**
 * Server for tests.  Simulates client communication by directing placing
 * messages in client queues.
 */
export class TestServer extends Client {
    seq = 1;
    clients: Client[];
    listeners: Client[]; // listeners do not generate edits
    clientSeqNumbers: Collections.Heap<ClientSeq>;
    upstreamMap: Collections.RedBlackTree<number, number>;
    constructor(initText: string, options?: Properties.PropertySet) {
        super(initText, options);
    }

    addUpstreamClients(upstreamClients: Client[]) {
        // assumes addClients already called
        this.upstreamMap = new Collections.RedBlackTree<number, number>(compareNumbers);
        for (let upstreamClient of upstreamClients) {
            this.clientSeqNumbers.add({
                refSeq: upstreamClient.getCurrentSeq(),
                clientId: upstreamClient.longClientId
            });
        }
    }

    addClients(clients: Client[]) {
        this.clientSeqNumbers = new Collections.Heap<ClientSeq>([], clientSeqComparer);
        this.clients = clients;
        for (let client of clients) {
            this.clientSeqNumbers.add({ refSeq: client.getCurrentSeq(), clientId: client.longClientId });
        }
    }

    addListeners(listeners: Client[]) {
        this.listeners = listeners;
    }

    applyMsg(msg: API.ISequencedObjectMessage) {
        this.coreApplyMsg(msg);
        if (useCheckQ) {
            let clid = this.getShortClientId(msg.clientId);
            return checkTextMatchRelative(msg.referenceSequenceNumber, clid, this, msg);
        }
        else {
            return false;
        }
    }

    // TODO: remove mappings when no longer needed using min seq 
    // in upstream message
    transformUpstreamMessage(msg: ISequencedObjectMessage) {
        if (msg.referenceSequenceNumber > 0) {
            msg.referenceSequenceNumber =
                this.upstreamMap.get(msg.referenceSequenceNumber).data;
        }
        msg.origin = {
            id: "A",
            sequenceNumber: msg.sequenceNumber,
            minimumSequenceNumber: msg.minimumSequenceNumber,
        };
        this.upstreamMap.put(msg.sequenceNumber, this.seq);
        msg.sequenceNumber = -1;
    }

    copyMsg(msg: ISequencedObjectMessage) {
        return <ISequencedObjectMessage>{
            clientId: msg.clientId,
            clientSequenceNumber: msg.clientSequenceNumber,
            contents: msg.contents,
            minimumSequenceNumber: msg.minimumSequenceNumber,
            referenceSequenceNumber: msg.referenceSequenceNumber,
            sequenceNumber: msg.sequenceNumber,
            traces: msg.traces,
            type: msg.type
        }
    }

    applyMessages(msgCount: number) {
        while (msgCount > 0) {
            let msg = this.q.dequeue();
            if (msg) {
                if (msg.sequenceNumber >= 0) {
                    this.transformUpstreamMessage(msg);
                }
                msg.sequenceNumber = this.seq++;
                if (this.applyMsg(msg)) {
                    return true;
                }
                if (this.clients) {
                    let minCli = this.clientSeqNumbers.peek();
                    if (minCli && (minCli.clientId == msg.clientId) &&
                        (minCli.refSeq < msg.referenceSequenceNumber)) {
                        let cliSeq = this.clientSeqNumbers.get();
                        let oldSeq = cliSeq.refSeq;
                        cliSeq.refSeq = msg.referenceSequenceNumber;
                        this.clientSeqNumbers.add(cliSeq);
                        minCli = this.clientSeqNumbers.peek();
                        if (minCli.refSeq > oldSeq) {
                            msg.minimumSequenceNumber = minCli.refSeq;
                            this.updateMinSeq(minCli.refSeq);
                        }
                    }
                    for (let client of this.clients) {
                        client.enqueueMsg(msg);
                    }
                    if (this.listeners) {
                        for (let listener of this.listeners) {
                            listener.enqueueMsg(this.copyMsg(msg));
                        }
                    }
                }
            }
            else {
                break;
            }
            msgCount--;
        }
        return false;
    }

}

export interface LRUSegment {
    segment?: Segment;
    maxSeq: number;
}

var LRUSegmentComparer: Collections.Comparer<LRUSegment> = {
    min: { maxSeq: -2 },
    compare: (a, b) => a.maxSeq - b.maxSeq
}

function glc(mergeTree: MergeTree, id: number) {
    if (mergeTree.getLongClientId) {
        return mergeTree.getLongClientId(id);
    }
    else {
        return id.toString();
    }
}

export interface SegmentAccumulator {
    segments: Segment[];
}

export interface TextAccumulator {
    textSegment: TextSegment;
    placeholder?: string;
    parallelArrays?: boolean;
    parallelText?: string[];
    parallelMarkers?: Marker[];
    parallelMarkerLabel?: string;
    tagsInProgress: string[];
}

interface IReferenceSearchInfo {
    mergeTree: MergeTree;
    tileLabel: string;
    preceding?: boolean;
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
function recordRangeLeaf(segment: Segment, segpos: number,
    refSeq: number, clientId: number, start: number, end: number,
    searchInfo: IMarkerSearchRangeInfo) {
    if (segment.getType() === SegmentType.Marker) {
        let marker = <Marker>segment;
        if (marker.refType &
            (ops.ReferenceType.NestBegin | ops.ReferenceType.NestEnd)) {
            applyLeafRangeMarker(marker, searchInfo);
        }
    }
    return false;
}

function rangeShift(node: MergeNode, segpos: number, refSeq: number, clientId: number,
    offset: number, end: number, searchInfo: IMarkerSearchRangeInfo) {
    if (node.isLeaf()) {
        let seg = <Segment>node;
        if ((searchInfo.mergeTree.localNetLength(seg) > 0) && (seg.getType() === SegmentType.Marker)) {
            let marker = <Marker>seg;
            if (marker.refType &
                (ops.ReferenceType.NestBegin | ops.ReferenceType.NestEnd)) {
                applyLeafRangeMarker(marker, searchInfo);
            }
        }
    } else {
        let block = <IHierBlock>node;
        applyStackDelta(searchInfo.stacks, block.rangeStacks)
    }
    return true;
}

function recordTileStart(segment: Segment, segpos: number,
    refSeq: number, clientId: number, start: number, end: number,
    searchInfo: IReferenceSearchInfo) {
    if (segment.getType() === SegmentType.Marker) {
        let marker = <Marker>segment;
        if (marker.hasTileLabel(searchInfo.tileLabel)) {
            searchInfo.tile = marker;
        }
    }
    return false;
}

function tileShift(node: MergeNode, segpos: number, refSeq: number, clientId: number,
    offset: number, end: number, searchInfo: IReferenceSearchInfo) {
    if (node.isLeaf()) {
        let seg = <Segment>node;
        if ((searchInfo.mergeTree.localNetLength(seg) > 0) && (seg.getType() === SegmentType.Marker)) {
            let marker = <Marker>seg;
            if (marker.hasTileLabel(searchInfo.tileLabel)) {
                searchInfo.tile = marker;
            }
        }
    } else {
        let block = <IHierBlock>node;
        let marker: Marker;
        if (searchInfo.preceding) {
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
        zamboniSegments: true,
        measureWindowTime: true,
        measureOrdinalTime: true,
    };
    static searchChunkSize = 256;
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
    idToSegment = Properties.createMap<Segment>();
    localIdToSegment = Properties.createMap<Segment>();

    clientIdToBranchId: number[] = [];
    localBranchId = 0;
    transactionSegmentGroup: SegmentGroup;
    minSeqListeners: Collections.Heap<MinListener>;
    // for diagnostics
    getLongClientId: (id: number) => string;
    getUserInfo: (id: number) => IAuthenticatedUser;

    // TODO: make and use interface describing options
    constructor(public text: string, public options?: Properties.PropertySet) {
        this.blockUpdateActions = MergeTree.initBlockUpdateActions;
        if (options) {
            if (options.blockUpdateMarkers) {
                this.blockUpdateMarkers = options.blockUpdateMarkers;
            }
            if (options.localMinSeq !== undefined) {
                this.collabWindow.localMinSeq = options.localMinSeq;
            }
        }
        this.root = this.initialTextNode(this.text);
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

    private initialTextNode(text: string) {
        let block = this.makeBlock(1);
        block.ordinal = "";
        block.assignChild(new TextSegment(text, UniversalSequenceNumber, LocalClientId), 0);
        block.cachedLength = text.length;
        return block;
    }

    blockCloneFromSegments(block: IMergeBlock, segments: Segment[]) {
        for (let i = 0; i < block.childCount; i++) {
            let child = block.children[i];
            if (child.isLeaf()) {
                segments.push(this.segmentClone(<Segment>block.children[i]));
            } else {
                this.blockCloneFromSegments(<IMergeBlock>child, segments);
            }
        }
    }

    clone() {
        let options = {
            blockUpdateMarkers: this.blockUpdateMarkers,
            localMinSeq: this.collabWindow.localMinSeq
        };
        let b = new MergeTree("", options);
        // for now assume that b will not collaborate
        b.root = b.blockClone(this.root);
    }

    blockClone(block: IMergeBlock) {
        let bBlock = this.makeBlock(block.childCount);
        for (let i = 0; i < block.childCount; i++) {
            let child = block.children[i];
            if (child.isLeaf()) {
                bBlock.children[i] = this.segmentClone(<Segment>block.children[i]);
            } else {
                bBlock.children[i] = this.blockClone(<IMergeBlock>block.children[i]);
            }
        }
        this.nodeUpdateLengthNewStructure(bBlock);
        return bBlock;
    }

    segmentClone(segment: Segment) {
        let b = (<BaseSegment>segment).clone();
        return b;
    }

    startGroupOperation(liveSegmentGroup?: SegmentGroup) {
        // TODO: assert undefined
        if (this.collabWindow.collaborating) {
            if (liveSegmentGroup) {
                this.transactionSegmentGroup = liveSegmentGroup;
            } else {
                this.transactionSegmentGroup = <SegmentGroup>{ segments: [] };
                this.pendingSegments.enqueue(this.transactionSegmentGroup);
            }
            return this.transactionSegmentGroup;
        }
    }

    endGroupOperation() {
        if (this.collabWindow.collaborating) {
            this.transactionSegmentGroup = undefined;
        }
    }

    localNetLength(segment: Segment) {
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
    mapIdToSegment(id: string, segment: Segment) {
        this.idToSegment[id] = segment;
    }

    mapLocalIdToSegment(id: string, segment: Segment) {
        this.localIdToSegment[id] = segment;
    }

    addNode(block: IMergeBlock, node: MergeNode) {
        let index = block.childCount++;
        block.assignChild(node, index, false);
        return index;
    }

    reloadFromSegments(segments: Segment[]) {
        let segCap = MaxNodesInBlock - 1;
        const measureReloadTime = false;
        let buildMergeBlock: (nodes: MergeNode[]) => IMergeBlock = (nodes: Segment[]) => {
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

    addToLRUSet(segment: Segment, seq: number) {
        this.segmentsToScour.add({ segment: segment, maxSeq: seq });
    }

    underflow(node: IMergeBlock) {
        return node.childCount < (MaxNodesInBlock / 2);
    }

    scourNode(node: IMergeBlock, holdNodes: MergeNode[]) {
        let prevSegment: Segment;
        for (let k = 0; k < node.childCount; k++) {
            let childNode = node.children[k];
            if (childNode.isLeaf()) {
                let segment = <Segment>childNode;
                if ((segment.removedSeq !== undefined) && (segment.removedSeq !== UnassignedSequenceNumber)) {
                    let createBrid = this.getBranchId(segment.clientId);
                    let removeBrid = this.getBranchId(segment.removedClientId);
                    if ((removeBrid != createBrid) || (segment.removedSeq > this.collabWindow.minSeq)) {
                        holdNodes.push(segment);
                    }
                    else {
                        if (MergeTree.traceZRemove) {
                            console.log(`${this.getLongClientId(this.collabWindow.clientId)}: Zremove ${(<TextSegment>segment).text}; cli ${this.getLongClientId(segment.clientId)}`);
                        }
                        segment.parent = undefined;
                    }
                    prevSegment = undefined;
                }
                else {
                    if ((segment.seq <= this.collabWindow.minSeq) &&
                        (!segment.segmentGroup) && (segment.seq != UnassignedSequenceNumber)) {
                        if (prevSegment && prevSegment.canAppend(segment, this)) {
                            if (MergeTree.traceAppend) {
                                console.log(`${this.getLongClientId(this.collabWindow.clientId)}: append ${(<TextSegment>prevSegment).text} + ${(<TextSegment>segment).text}; cli ${this.getLongClientId(prevSegment.clientId)} + cli ${this.getLongClientId(segment.clientId)}`);
                            }
                            prevSegment.append(segment);
                            segment.parent = undefined;
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
        let holdNodes = <MergeNode[]>[];
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

    zamboniSegments() {
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
                    let childrenCopy = <MergeNode[]>[];
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
                    let segment = <Segment>child;
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
            if ((toSeq <= this.collabWindow.currentSeq) && (fromSeq >= this.collabWindow.minSeq)) {
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
        let recordRange = (segment: Segment, pos: number, refSeq: number, clientId: number, segStart: number,
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

    searchFromPos(pos: number, target: RegExp) {
        let start = pos;
        let end = pos + MergeTree.searchChunkSize;
        let chunk = "";
        let found = false;
        while (!found) {
            if (end > this.root.cachedLength) {
                end = this.root.cachedLength;
            }
            chunk += this.getText(UniversalSequenceNumber, this.collabWindow.clientId, "", start, end);
            let result = chunk.match(target);
            if (result !== null) {
                return { text: result[0], pos: result.index };
            }
            start += MergeTree.searchChunkSize;
            if (start >= this.root.cachedLength) {
                break;
            }
            end += MergeTree.searchChunkSize;
        }
    }

    gatherSegment = (segment: Segment, pos: number, refSeq: number, clientId: number, start: number,
        end: number, accumSegments: SegmentAccumulator) => {
        if (start < 0) {
            start = 0;
        }
        if (end > segment.cachedLength) {
            end = segment.cachedLength;
        }
        if (segment.getType() === SegmentType.Text) {
            let textSegment = <TextSegment>segment;
            accumSegments.segments.push(textSegment.clone(start, end));
        } else {
            let marker = <Marker>segment;
            accumSegments.segments.push(marker.clone());
        }
        return true;
    }

    gatherText = (segment: Segment, pos: number, refSeq: number, clientId: number, start: number,
        end: number, accumText: TextAccumulator) => {
        if (segment.getType() == SegmentType.Text) {
            let textSegment = <TextSegment>segment;
            if (MergeTree.traceGatherText) {
                console.log(`@cli ${this.getLongClientId(this.collabWindow.clientId)} gather seg seq ${textSegment.seq} rseq ${textSegment.removedSeq} text ${textSegment.text}`);
            }
            let beginTags = "";
            let endTags = "";
            if (accumText.parallelArrays) {
                // TODO: let clients pass in function to get tag
                let tags = <string[]>[];
                let initTags = <string[]>[];

                if (textSegment.properties && (textSegment.properties["font-weight"])) {
                    tags.push("b");
                }
                if (textSegment.properties && (textSegment.properties["text-decoration"])) {
                    tags.push("u");
                }
                let remTags = <string[]>[];
                if (tags.length > 0) {
                    for (let tag of tags) {
                        if (accumText.tagsInProgress.indexOf(tag) < 0) {
                            beginTags += `<${tag}>`;
                            initTags.push(tag);
                        }
                    }
                    for (let accumTag of accumText.tagsInProgress) {
                        if (tags.indexOf(accumTag) < 0) {
                            endTags += `</${accumTag}>`;
                            remTags.push(accumTag);
                        }
                    }
                    for (let initTag of initTags.reverse()) {
                        accumText.tagsInProgress.push(initTag);
                    }
                } else {
                    for (let accumTag of accumText.tagsInProgress) {
                        endTags += `</${accumTag}>`;
                        remTags.push(accumTag);
                    }
                }
                for (let remTag of remTags) {
                    let remdex = accumText.tagsInProgress.indexOf(remTag);
                    if (remdex >= 0) {
                        accumText.tagsInProgress.splice(remdex, 1);
                    }
                }
            }
            accumText.textSegment.text += endTags;
            accumText.textSegment.text += beginTags;
            if ((start <= 0) && (end >= textSegment.text.length)) {
                accumText.textSegment.text += textSegment.text;
            }
            else {
                if (start < 0) {
                    start = 0;
                }
                if (end >= textSegment.text.length) {
                    accumText.textSegment.text += textSegment.text.substring(start);
                }
                else {
                    accumText.textSegment.text += textSegment.text.substring(start, end);
                }
            }
        }
        else {
            if (accumText.placeholder && (accumText.placeholder.length > 0)) {
                if (accumText.placeholder === "*") {
                    let marker = <Marker>segment;
                    accumText.textSegment.text += `\n${marker.toString()}`;
                } else {
                    for (let i = 0; i < segment.cachedLength; i++) {
                        accumText.textSegment.text += accumText.placeholder;
                    }
                }
            } else if (accumText.parallelArrays) {
                let marker = <Marker>segment;
                if (marker.hasTileLabel(accumText.parallelMarkerLabel)) {
                    accumText.parallelMarkers.push(marker);
                    accumText.parallelText.push(accumText.textSegment.text);
                    accumText.textSegment.text = "";
                }

            }
        }

        return true;
    }

    incrementalGetText(refSeq: number, clientId: number, start?: number, end?: number) {
        if (start === undefined) {
            start = 0;
        }
        if (end === undefined) {
            end = this.blockLength(this.root, refSeq, clientId);
        }
        let context = new TextSegment("");
        let stack = new Collections.Stack<IncrementalMapState<TextSegment>>();
        let initialState = new IncrementalMapState(this.root, { leaf: incrementalGatherText },
            0, refSeq, clientId, context, start, end, 0);
        stack.push(initialState);

        while (!stack.empty()) {
            this.incrementalBlockMap(stack);
        }
        return context.text;
    }

    getTextAndMarkers(refSeq: number, clientId: number, label: string, start?: number, end?: number) {
        if (start === undefined) {
            start = 0;
        }
        if (end === undefined) {
            end = this.blockLength(this.root, refSeq, clientId);
        }
        let accum = <TextAccumulator>{
            textSegment: new TextSegment(""), parallelMarkerLabel: label, parallelArrays: true, parallelMarkers: [], parallelText: [],
            tagsInProgress: []
        };

        if (MergeTree.traceGatherText) {
            console.log(`get text on cli ${glc(this, this.collabWindow.clientId)} ref cli ${glc(this, clientId)} refSeq ${refSeq}`);
        }
        this.mapRange<TextAccumulator>({ leaf: this.gatherText }, refSeq, clientId, accum, start, end);
        return { paralellText: accum.parallelText, parallelMarkers: accum.parallelMarkers };
    }

    cloneSegments(refSeq: number, clientId: number, start = 0, end?: number) {
        if (end === undefined) {
            end = this.blockLength(this.root, refSeq, clientId);
        }
        let accum = <SegmentAccumulator>{
            segments: <Segment[]>[]
        };
        this.mapRange<SegmentAccumulator>({ leaf: this.gatherSegment }, refSeq, clientId, accum, start, end);
        return accum.segments;
    }

    getText(refSeq: number, clientId: number, placeholder = "", start?: number, end?: number) {
        if (start === undefined) {
            start = 0;
        }
        if (end === undefined) {
            end = this.blockLength(this.root, refSeq, clientId);
        }
        let accum = <TextAccumulator>{ textSegment: new TextSegment(""), placeholder };

        if (MergeTree.traceGatherText) {
            console.log(`get text on cli ${glc(this, this.collabWindow.clientId)} ref cli ${glc(this, clientId)} refSeq ${refSeq}`);
        }
        this.mapRange<TextAccumulator>({ leaf: this.gatherText }, refSeq, clientId, accum, start, end);
        return accum.textSegment.text;
    }

    getContainingSegment(pos: number, refSeq: number, clientId: number) {
        let segment: Segment;
        let offset: number;

        let leaf = (leafSeg: Segment, segpos: number, refSeq: number, clientId: number, start: number) => {
            segment = leafSeg;
            offset = start;
            return false;
        };
        this.searchBlock(this.root, pos, 0, refSeq, clientId, { leaf });
        return { segment, offset };
    }

    blockLength(node: IMergeBlock, refSeq: number, clientId: number) {
        if ((this.collabWindow.collaborating) && (clientId != this.collabWindow.clientId)) {
            return node.partialLengths.getPartialLength(this, refSeq, clientId);
        }
        else {
            return node.cachedLength;
        }
    }

    getRemovalInfo(branchId: number, segBranchId: number, segment: Segment) {
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

    nodeLength(node: MergeNode, refSeq: number, clientId: number) {
        if ((!this.collabWindow.collaborating) || (this.collabWindow.clientId == clientId)) {
            // local client sees all segments, even when collaborating
            if (!node.isLeaf()) {
                return node.cachedLength;
            }
            else {
                return this.localNetLength(<Segment>node);
            }
        }
        else {
            // sequence number within window 
            let branchId = this.getBranchId(clientId);
            if (!node.isLeaf()) {
                return (<IMergeBlock>node).partialLengths.getPartialLength(this, refSeq, clientId);
            }
            else {
                let segment = <Segment>node;
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

    addMinSeqListener(minRequired: number, onMinGE: (minSeq:number)=>void ) {
        if (!this.minSeqListeners) {
            this.minSeqListeners = new Collections.Heap<MinListener>([],
                minListenerComparer);
        }
        this.minSeqListeners.add({ minRequired, onMinGE });
    }

    setMinSeq(minSeq: number) {
        if (minSeq > this.collabWindow.minSeq) {
            this.collabWindow.minSeq = minSeq;
            if (MergeTree.options.zamboniSegments) {
                this.zamboniSegments();
            }
            if (this.minSeqListeners) {
                while ((this.minSeqListeners.count()>0) && 
                    (this.minSeqListeners.peek().minRequired<=minSeq)) {
                    let minListener = this.minSeqListeners.get();
                    minListener.onMinGE(minSeq);
                }
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
    findTile(startPos: number, clientId: number, tileLabel: string, preceding = true) {
        let searchInfo = <IReferenceSearchInfo>{
            mergeTree: this,
            preceding,
            tileLabel,
        };

        if (preceding) {
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

    search<TClientData>(pos: number, refSeq: number, clientId: number,
        actions?: SegmentActions<TClientData>, clientData?: TClientData): Segment {
        return this.searchBlock(this.root, pos, 0, refSeq, clientId, actions, clientData);
    }

    searchBlock<TClientData>(block: IMergeBlock, pos: number, segpos: number, refSeq: number, clientId: number,
        actions?: SegmentActions<TClientData>, clientData?: TClientData): Segment {
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
                        actions.leaf(<Segment>child, segpos, refSeq, clientId, pos, -1, clientData);
                    }
                    return <Segment>child;
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

    backwardSearch<TClientData>(pos: number, refSeq: number, clientId: number,
        actions?: SegmentActions<TClientData>, clientData?: TClientData): Segment {
        return this.backwardSearchBlock(this.root, pos, this.getLength(refSeq, clientId), refSeq, clientId, actions, clientData);
    }

    backwardSearchBlock<TClientData>(block: IMergeBlock, pos: number, segEnd: number, refSeq: number, clientId: number,
        actions?: SegmentActions<TClientData>, clientData?: TClientData): Segment {
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
                        actions.leaf(<Segment>child, segpos, refSeq, clientId, pos, -1, clientData);
                    }
                    return <Segment>child;
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

    updateRoot(splitNode: IMergeBlock, refSeq: number, clientId: number, seq: number) {
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
     * @param seq sequence number given by server to pending segment
     */
    ackPendingSegment(seq: number, verboseOps = false) {
        let pendingSegmentGroup = this.pendingSegments.dequeue();
        let nodesToUpdate = <IMergeBlock[]>[];
        let clientId: number;
        let overwrite = false;
        if (pendingSegmentGroup !== undefined) {
            if (verboseOps) {
                console.log(`segment group has ${pendingSegmentGroup.segments.length} segments`);
            }
            pendingSegmentGroup.segments.map((pendingSegment) => {
                if (pendingSegment.seq === UnassignedSequenceNumber) {
                    pendingSegment.seq = seq;
                }
                else {
                    let segBranchId = this.getBranchId(pendingSegment.clientId);
                    let removalInfo = this.getRemovalInfo(this.localBranchId, segBranchId, pendingSegment);
                    if (removalInfo.removedSeq !== undefined) {
                        if (removalInfo.removedSeq != UnassignedSequenceNumber) {
                            overwrite = true;
                            if (MergeTree.diagOverlappingRemove) {
                                console.log(`grump @seq ${seq} cli ${glc(this, this.collabWindow.clientId)} from ${pendingSegment.removedSeq} text ${pendingSegment.toString()}`);
                            }
                        }
                        else {
                            removalInfo.removedSeq = seq;
                        }
                    }
                }
                pendingSegment.segmentGroup = undefined;
                clientId = this.collabWindow.clientId;
                if (nodesToUpdate.indexOf(pendingSegment.parent) < 0) {
                    nodesToUpdate.push(pendingSegment.parent);
                }
            });
            for (let node of nodesToUpdate) {
                this.blockUpdatePathLengths(node, seq, clientId, overwrite);
                //nodeUpdatePathLengths(node, seq, clientId, true);
            }
        }
    }

    addToPendingList(segment: Segment, segmentGroup?: SegmentGroup) {
        if (segmentGroup === undefined) {
            if (this.transactionSegmentGroup) {
                segmentGroup = this.transactionSegmentGroup;
            } else {
                segmentGroup = <SegmentGroup>{ segments: [] };
                this.pendingSegments.enqueue(segmentGroup);
            }
        }
        // TODO: share this group with UNDO
        segment.segmentGroup = segmentGroup;
        addToSegmentGroup(segment);
        return segmentGroup;
    }

    // assumes not collaborating for now
    appendSegment(segSpec: ops.IPropertyString, seq = UniversalSequenceNumber) {
        let pos = this.root.cachedLength;
        if (segSpec.text) {
            this.insertText(pos, UniversalSequenceNumber, LocalClientId, seq, segSpec.text,
                segSpec.props as Properties.PropertySet);
        }
        else {
            // assume marker for now
            this.insertMarker(pos, UniversalSequenceNumber, LocalClientId,
                seq, segSpec.marker.refType, segSpec.props as Properties.PropertySet);
        }
    }

    // TODO: error checking
    getSegmentFromId(id: string) {
        return this.idToSegment[id];
    }

    getSegmentFromLocalId(id: string) {
        return this.localIdToSegment[id];
    }

    /**
     * Given a position specified relative to a marker id, lookup the marker 
     * and convert the position to a character position.
     * @param relativePos Id of marker (may be indirect) and whether position is before or after marker.
     * @param refseq The reference sequence number at which to compute the position.
     * @param clientId The client id with which to compute the position.
     */
    posFromRelativePos(relativePos: IRelativePosition, refseq = UniversalSequenceNumber,
        clientId = this.collabWindow.clientId) {
        let pos = -1;
        let marker: Marker;
        if (relativePos.id) {
            marker = <Marker>this.getSegmentFromId(relativePos.id);
        } else {
            marker = <Marker>this.getSegmentFromLocalId(relativePos.localId);
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

    insert<T>(pos: number, refSeq: number, clientId: number, seq: number, segData: T,
        traverse: (block: IMergeBlock, pos: number, refSeq: number, clientId: number, seq: number, segData: T) => IMergeBlock) {
        this.ensureIntervalBoundary(pos, refSeq, clientId);
        if (MergeTree.traceOrdinals) {
            this.ordinalIntegrity();
        }
        //traceTraversal = true;
        let splitNode = traverse(this.root, pos, refSeq, clientId, seq, segData);
        //traceTraversal = false;
        this.updateRoot(splitNode, refSeq, clientId, seq);
    }

    insertMarker(pos: number, refSeq: number, clientId: number, seq: number,
        behaviors: ops.ReferenceType, props?: Properties.PropertySet, localId?: string) {
        let marker = Marker.make(behaviors, props, seq, clientId);

        let markerId = marker.getId();
        if (markerId) {
            this.mapIdToSegment(markerId, marker);
        }
        let markerLocalId = marker.getLocalId();
        if (markerLocalId) {
            this.mapLocalIdToSegment(markerLocalId, marker);
        }

        this.insert(pos, refSeq, clientId, seq, marker, (block, pos, refSeq, clientId, seq, marker) =>
            this.blockInsert(block, pos, refSeq, clientId, seq, marker));
    }

    insertTextMarkerRelative(markerPos: IRelativePosition, refSeq: number, clientId: number, seq: number,
        text: string, props?: Properties.PropertySet) {
        let pos = this.posFromRelativePos(markerPos, refSeq, clientId);
        if (pos >= 0) {
            let newSegment = TextSegment.make(text, props, seq, clientId);
            // MergeTree.traceTraversal = true;
            this.insert(pos, refSeq, clientId, seq, text, (block, pos, refSeq, clientId, seq, text) =>
                this.blockInsert(this.root, pos, refSeq, clientId, seq, newSegment));
            MergeTree.traceTraversal = false;
            if (this.collabWindow.collaborating && MergeTree.options.zamboniSegments &&
                (seq != UnassignedSequenceNumber)) {
                this.zamboniSegments();
            }
        }
    }

    insertText(pos: number, refSeq: number, clientId: number, seq: number, text: string, props?: Properties.PropertySet) {
        let newSegment = TextSegment.make(text, props, seq, clientId);
        // MergeTree.traceTraversal = true;
        this.insert(pos, refSeq, clientId, seq, text, (block, pos, refSeq, clientId, seq, text) =>
            this.blockInsert(this.root, pos, refSeq, clientId, seq, newSegment));
        MergeTree.traceTraversal = false;
        if (MergeTree.traceOrdinals) {
            this.ordinalIntegrity();
        }
        if (this.collabWindow.collaborating && MergeTree.options.zamboniSegments &&
            (seq != UnassignedSequenceNumber)) {
            this.zamboniSegments();
        }
    }

    blockInsert<T extends Segment>(block: IMergeBlock, pos: number, refSeq: number, clientId: number, seq: number, newSegment: T) {
        let segIsLocal = false;
        let checkSegmentIsLocal = (segment: Segment, pos: number, refSeq: number, clientId: number) => {
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
            if (MergeTree.diagInsertTie && segIsLocal && (newSegment.getType() === SegmentType.Text)) {
                let text = newSegment.toString();
                console.log(`@cli ${glc(this, this.collabWindow.clientId)}: attempting continue with seq ${seq} text ${text} ref ${refSeq}`);
            }
            return segIsLocal;
        }

        let onLeaf = (segment: Segment, pos: number) => {
            let saveIfLocal = (locSegment: Segment) => {
                // save segment so can assign sequence number when acked by server
                if (this.collabWindow.collaborating) {
                    if ((locSegment.seq == UnassignedSequenceNumber) &&
                        (clientId == this.collabWindow.clientId)) {
                        this.addToPendingList(locSegment);
                    }
                    else if ((locSegment.seq >= this.collabWindow.minSeq) &&
                        MergeTree.options.zamboniSegments) {
                        this.addToLRUSet(locSegment, locSegment.seq);
                    }
                }
            }
            let segmentChanges = <SegmentChanges>{};
            if (segment) {
                // insert before segment
                segmentChanges.replaceCurrent = newSegment;
                segmentChanges.next = segment;
            }
            else {
                segmentChanges.next = newSegment;
            }
            saveIfLocal(newSegment);
            return segmentChanges;
        }
        return this.insertingWalk(block, pos, refSeq, clientId, seq, newSegment.getType(),
            { leaf: onLeaf, continuePredicate: continueFrom });
    }

    splitLeafSegment = (segment: Segment, pos: number) => {
        let segmentChanges = <SegmentChanges>{};
        if (pos > 0) {
            segmentChanges.next = segment.splitAt(pos);
        }
        return segmentChanges;
    }

    ensureIntervalBoundary(pos: number, refSeq: number, clientId: number) {
        let splitNode = this.insertingWalk(this.root, pos, refSeq, clientId, TreeMaintainanceSequenceNumber,
            SegmentType.Base, { leaf: this.splitLeafSegment });
        this.updateRoot(splitNode, refSeq, clientId, TreeMaintainanceSequenceNumber);
    }

    // assume called only when pos == len
    breakTie(pos: number, len: number, seq: number, node: MergeNode, refSeq: number, clientId: number, segType: SegmentType) {
        if (node.isLeaf()) {
            let segment = <Segment>node;
            // TODO: marker/marker tie break & collab markers
            if (pos == 0) {
                return segment.seq !== UnassignedSequenceNumber;
            }
            else {
                return false;
            }
        }
        else {
            return true;
        }
    }

    // visit segments starting from node's right siblings, then up to node's parent
    leftExcursion<TClientData>(node: MergeNode, leafAction: SegmentAction<TClientData>) {
        let actions = { leaf: leafAction };
        let go = true;
        let startNode = node;
        let parent = startNode.parent;
        while (parent) {
            let children = parent.children;
            let childIndex: number;
            let node: MergeNode;
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
                        go = leafAction(<Segment>node, 0, UniversalSequenceNumber, this.collabWindow.clientId, 0, 0);
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
    rightExcursion<TClientData>(node: MergeNode, leafAction: SegmentAction<TClientData>) {
        let actions = { leaf: leafAction };
        let go = true;
        let startNode = node;
        let parent = startNode.parent;
        while (parent) {
            let children = parent.children;
            let childIndex: number;
            let node: MergeNode;
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
                        go = leafAction(<Segment>node, 0, UniversalSequenceNumber, this.collabWindow.clientId, 0, 0);
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
        segType: SegmentType, context: InsertContext) {
        let children = block.children;
        let childIndex: number;
        let child: MergeNode;
        let newNode: MergeNode;
        let fromSplit: IMergeBlock;
        let found = false;
        for (childIndex = 0; childIndex < block.childCount; childIndex++) {
            child = children[childIndex];
            let len = this.nodeLength(child, refSeq, clientId);
            if (MergeTree.traceTraversal) {
                let segInfo: string;
                if ((!child.isLeaf()) && this.collabWindow.collaborating) {
                    segInfo = `minLength: ${(<IMergeBlock>child).partialLengths.minLength}`;
                }
                else {
                    let segment = <Segment>child;
                    segInfo = `cli: ${glc(this, segment.clientId)} seq: ${segment.seq} text: ${segment.toString()}`;
                    if (segment.removedSeq !== undefined) {
                        segInfo += ` rcli: ${glc(this, segment.removedClientId)} rseq: ${segment.removedSeq}`;
                    }
                }
                console.log(`@tcli: ${glc(this, this.collabWindow.clientId)} len: ${len} pos: ${pos} ` + segInfo);
            }

            if ((pos < len) || ((pos == len) && this.breakTie(pos, len, seq, child, refSeq, clientId, segType))) {
                // found entry containing pos
                found = true;
                if (!child.isLeaf()) {
                    let childBlock = <IMergeBlock>child;
                    //internal node
                    let splitNode = this.insertingWalk(childBlock, pos, refSeq, clientId,
                        seq, segType, context);
                    if (splitNode === undefined) {
                        this.blockUpdateLength(block, seq, clientId);
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

                    let segmentChanges = context.leaf(<Segment>child, pos);
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
                    let segmentChanges = context.leaf(undefined, pos);
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
                this.blockUpdateLength(block, seq, clientId);
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

    ordinalIntegrity() {
        console.log("chk ordnls");
        this.nodeOrdinalIntegrity(this.root);
    }

    nodeOrdinalIntegrity(block: IMergeBlock) {
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

    nodeUpdateOrdinals(block: IMergeBlock) {
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

    addOverlappingClient(removalInfo: IRemovalInfo, clientId: number) {
        if (!removalInfo.removedClientOverlap) {
            removalInfo.removedClientOverlap = <number[]>[];
        }
        if (MergeTree.diagOverlappingRemove) {
            console.log(`added cli ${glc(this, clientId)} to rseq: ${removalInfo.removedSeq}`);
        }
        removalInfo.removedClientOverlap.push(clientId);
    }

    annotateRange(props: Properties.PropertySet, start: number, end: number, refSeq: number,
        clientId: number, seq: number, combiningOp?: ops.ICombiningOp) {
        this.ensureIntervalBoundary(start, refSeq, clientId);
        this.ensureIntervalBoundary(end, refSeq, clientId);
        let annotateSegment = (segment: Segment) => {
            let segType = segment.getType();
            if ((segType == SegmentType.Marker) || (segType == SegmentType.Text)) {
                let baseSeg = <BaseSegment>segment;
                baseSeg.addProperties(props, combiningOp);
            }
            return true;
        }
        this.mapRange({ leaf: annotateSegment }, refSeq, clientId, undefined, start, end);
    }

    markRangeRemoved(start: number, end: number, refSeq: number, clientId: number, seq: number, overwrite = false) {
        this.ensureIntervalBoundary(start, refSeq, clientId);
        this.ensureIntervalBoundary(end, refSeq, clientId);
        let segmentGroup: SegmentGroup;
        let savedLocalRefs = <LocalReference[][]>[];
        let markRemoved = (segment: Segment, pos: number, start: number, end: number) => {
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
                        if (segment.segmentGroup) {
                            removeFromSegmentGroup(segment.segmentGroup, segment);
                        }
                        else {
                            console.log(`missing segment group for seq ${seq} ref seq ${refSeq}`);
                        }
                    }
                    else {
                        // do not replace earlier sequence number for remove
                        this.addOverlappingClient(removalInfo, clientId);
                    }
                }
                else {
                    removalInfo.removedClientId = clientId;
                    removalInfo.removedSeq = seq;
                    if (segment.localRefs && (brid === this.localBranchId)) {
                        savedLocalRefs.push(segment.localRefs);
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
            let afterSeg: BaseSegment;
            for (let segSavedRefs of savedLocalRefs) {
                for (let localRef of segSavedRefs) {
                    if (localRef.refType && (localRef.refType & ops.ReferenceType.SlideOnRemove)) {
                        if (!afterSeg) {
                            let afterSegOff = this.getContainingSegment(start, refSeq, clientId);
                            afterSeg = <BaseSegment>afterSegOff.segment;
                        }
                        if (afterSeg) {
                            localRef.segment = afterSeg;
                            localRef.offset = 0;
                            afterSeg.addLocalRef(localRef);
                        }
                    }
                }
            }
            if (afterSeg) {
                this.blockUpdatePathLengths(afterSeg.parent, TreeMaintainanceSequenceNumber,
                    LocalClientId);
            }
        }
        if (this.collabWindow.collaborating && (seq != UnassignedSequenceNumber)) {
            if (MergeTree.options.zamboniSegments) {
                this.zamboniSegments();
            }
        }
        // MergeTree.traceTraversal = false;
    }

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
                    let segment = <Segment>child;
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
                            let segment = <Segment>child;
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

    nodeUpdateLengthNewStructure(node: IMergeBlock, recur = false) {
        this.blockUpdate(node);
        if (this.collabWindow.collaborating) {
            node.partialLengths = PartialSequenceLengths.combine(this, node, this.collabWindow, recur);
        }
    }

    removeLocalReference(segment: BaseSegment, lref: LocalReference) {
        let removedRef = segment.removeLocalRef(lref);
        if (removedRef) {
            this.blockUpdatePathLengths(segment.parent, TreeMaintainanceSequenceNumber,
                LocalClientId);
        }
    }

    addLocalReference(lref: LocalReference) {
        let segment = lref.segment;
        segment.addLocalRef(lref);
        this.blockUpdatePathLengths(segment.parent, TreeMaintainanceSequenceNumber,
            LocalClientId);
    }

    blockUpdate(block: IMergeBlock) {
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

    blockUpdatePathLengths(block: IMergeBlock, seq: number, clientId: number, newStructure = false) {
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

    nodeCompareUpdateLength(node: IMergeBlock, seq: number, clientId: number) {
        this.blockUpdate(node);
        if (this.collabWindow.collaborating && (seq != UnassignedSequenceNumber) && (seq != TreeMaintainanceSequenceNumber)) {
            if (node.partialLengths !== undefined) {
                let bplStr = node.partialLengths.toString();
                node.partialLengths.update(this, node, seq, clientId, this.collabWindow);
                let tempPartialLengths = PartialSequenceLengths.combine(this, node, this.collabWindow);
                if (!tempPartialLengths.compare(node.partialLengths)) {
                    console.log(`partial sum update mismatch @cli ${glc(this, this.collabWindow.clientId)} seq ${seq} clientId ${glc(this, clientId)}`);
                    console.log(tempPartialLengths.toString());
                    console.log("b4 " + bplStr);
                    console.log(node.partialLengths.toString());
                }
            }
            else {
                node.partialLengths = PartialSequenceLengths.combine(this, node, this.collabWindow);
            }
        }
    }

    blockUpdateLength(node: IMergeBlock, seq: number, clientId: number) {
        this.blockUpdate(node);
        if (this.collabWindow.collaborating && (seq != UnassignedSequenceNumber) && (seq != TreeMaintainanceSequenceNumber)) {
            if (node.partialLengths !== undefined) {
                //nodeCompareUpdateLength(node, seq, clientId);
                if (MergeTree.options.incrementalUpdate) {
                    node.partialLengths.update(this, node, seq, clientId, this.collabWindow);
                }
                else {
                    node.partialLengths = PartialSequenceLengths.combine(this, node, this.collabWindow);
                }
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
                let segment = <Segment>child;
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

    incrementalBlockMap<TContext>(stateStack: Collections.Stack<IncrementalMapState<TContext>>) {
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
                        console.log(`considering (r ${state.refSeq} c ${glc(this, state.clientId)}) seg with text ${(<TextSegment>child).text} len ${len} seq ${(<Segment>child).seq} rseq ${(<Segment>child).removedSeq} cli ${glc(this, (<Segment>child).clientId)}`);
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
                            console.log(`action on seg with text ${(<TextSegment>child).text}`);
                        }
                        state.actions.leaf(<Segment>child, state);
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
                    let segment = <Segment>child;
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
                    go = actions.leaf(<Segment>child, pos, refSeq, clientId, start, end, accum);
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
                    go = actions.leaf(<Segment>child, pos, refSeq, clientId, 0, 0, accum);
                }
            }
            if (!go) {
                break;
            }
        }
        return go;
    }

}




