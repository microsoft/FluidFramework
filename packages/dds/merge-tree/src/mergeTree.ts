/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/consistent-type-assertions */

/* eslint-disable @typescript-eslint/prefer-optional-chain, no-bitwise */

import { assert } from "@fluidframework/common-utils";
import { UsageError } from "@fluidframework/container-utils";
import {
    Comparer,
    Heap,
    List,
    ListMakeHead,
    Stack,
} from "./collections";
import {
    LocalClientId,
    NonCollabClient,
    TreeMaintenanceSequenceNumber,
    UnassignedSequenceNumber,
    UniversalSequenceNumber,
} from "./constants";
import { LocalReference, LocalReferenceCollection, LocalReferencePosition } from "./localReference";
import {
    IMergeTreeDeltaOpArgs,
    IMergeTreeSegmentDelta,
    MergeTreeDeltaCallback,
    MergeTreeMaintenanceCallback,
    MergeTreeMaintenanceType,
} from "./mergeTreeDeltaCallback";
import { TrackingGroupCollection } from "./mergeTreeTracking";
import {
    ICombiningOp,
    IJSONSegment,
    IMarkerDef,
    IRelativePosition,
    MergeTreeDeltaType,
    ReferenceType,
} from "./ops";
import { PartialSequenceLengths } from "./partialLengths";
import {
    clone,
    createMap,
    extend,
    extendIfUndefined,
    MapLike,
    matchProperties,
    PropertySet,
} from "./properties";
import {
    refTypeIncludesFlag,
    RangeStackMap,
    ReferencePosition,
    refGetRangeLabels,
    refGetTileLabels,
    refHasRangeLabel,
    refHasRangeLabels,
    refHasTileLabel,
    refHasTileLabels,
 } from "./referencePositions";
import { SegmentGroupCollection } from "./segmentGroupCollection";
import { PropertiesManager } from "./segmentPropertiesManager";
import { Client } from "./client";

export interface IMergeNodeCommon {
    parent?: IMergeBlock;
    /**
     * The length of the contents of the node.
     */
    cachedLength: number;
    index: number;
    ordinal: string;
    isLeaf(): this is ISegment;
}

export type IMergeNode = IMergeBlock | ISegment;

// Node with segments as children
export interface IMergeBlock extends IMergeNodeCommon {
    needsScour?: boolean;
    childCount: number;
    children: IMergeNode[];
    partialLengths?: PartialSequenceLengths;
    hierBlock(): IHierBlock | undefined;
    assignChild(child: IMergeNode, index: number, updateOrdinal?: boolean): void;
    setOrdinal(child: IMergeNode, index: number): void;
}

export interface IHierBlock extends IMergeBlock {
    hierToString(indentCount: number): string;
    addNodeReferences(mergeTree: MergeTree, node: IMergeNode): void;
    rightmostTiles: MapLike<ReferencePosition>;
    leftmostTiles: MapLike<ReferencePosition>;
    rangeStacks: RangeStackMap;
}

export interface IRemovalInfo {
    removedSeq: number;
    removedClientIds: number[];
}
export function toRemovalInfo(maybe: Partial<IRemovalInfo> | undefined): IRemovalInfo | undefined {
    if (maybe?.removedClientIds !== undefined && maybe?.removedSeq !== undefined) {
        return maybe as IRemovalInfo;
    }
    assert(maybe?.removedClientIds === undefined && maybe?.removedSeq === undefined,
        0x2bf /* "both removedClientIds and removedSeq should be set or not set" */);
}

function isRemoved(segment: ISegment): boolean {
    return toRemovalInfo(segment) !== undefined;
}

function isRemovedAndAcked(segment: ISegment): boolean {
    const removalInfo = toRemovalInfo(segment);
    return removalInfo !== undefined && removalInfo.removedSeq !== UnassignedSequenceNumber;
}

/**
 * A segment representing a portion of the merge tree.
 */
export interface ISegment extends IMergeNodeCommon, Partial<IRemovalInfo> {
    readonly type: string;
    readonly segmentGroups: SegmentGroupCollection;
    readonly trackingCollection: TrackingGroupCollection;
    propertyManager?: PropertiesManager;
    localSeq?: number;
    localRemovedSeq?: number;
    seq?: number;  // If not present assumed to be previous to window min
    clientId: number;
    localRefs?: LocalReferenceCollection;
    properties?: PropertySet;
    addProperties(
        newProps: PropertySet,
        op?: ICombiningOp,
        seq?: number,
        collabWindow?: CollaborationWindow,
    ): PropertySet | undefined;
    clone(): ISegment;
    canAppend(segment: ISegment): boolean;
    append(segment: ISegment): void;
    splitAt(pos: number): ISegment | undefined;
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
    // eslint-disable-next-line @typescript-eslint/prefer-function-type
    (marker: Marker): void;
}

export interface ISegmentAction<TClientData> {
    // eslint-disable-next-line @typescript-eslint/prefer-function-type
    (segment: ISegment, pos: number, refSeq: number, clientId: number, start: number,
        end: number, accum: TClientData): boolean;
}

export interface ISegmentChanges {
    next?: ISegment;
    replaceCurrent?: ISegment;
}

export interface BlockAction<TClientData> {
    // eslint-disable-next-line @typescript-eslint/prefer-function-type
    (
        block: IMergeBlock,
        pos: number,
        refSeq: number,
        clientId: number,
        start: number | undefined,
        end: number | undefined,
        accum: TClientData,
    ): boolean;
}

export interface NodeAction<TClientData> {
    // eslint-disable-next-line @typescript-eslint/prefer-function-type
    (
        node: IMergeNode,
        pos: number,
        refSeq: number,
        clientId: number,
        start: number | undefined,
        end: number | undefined,
        clientData: TClientData,
    ): boolean;
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
    leaf: (segment: ISegment | undefined, pos: number, ic: InsertContext) => ISegmentChanges;
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
    localSeq: number;
}

export class MergeNode implements IMergeNodeCommon {
    index: number = 0;
    ordinal: string = "";
    parent?: IMergeBlock;
    cachedLength: number = 0;

    isLeaf() {
        return false;
    }
}

function addTile(tile: ReferencePosition, tiles: object) {
    const tileLabels = refGetTileLabels(tile);
    if (tileLabels) {
        for (const tileLabel of tileLabels) {
            tiles[tileLabel] = tile;
        }
    }
}

function addTileIfNotPresent(tile: ReferencePosition, tiles: object) {
    const tileLabels = refGetTileLabels(tile);
    if (tileLabels) {
        for (const tileLabel of tileLabels) {
            if (tiles[tileLabel] === undefined) {
                tiles[tileLabel] = tile;
            }
        }
    }
}

function applyStackDelta(currentStackMap: RangeStackMap, deltaStackMap: RangeStackMap) {
    // eslint-disable-next-line guard-for-in, no-restricted-syntax
    for (const label in deltaStackMap) {
        const deltaStack = deltaStackMap[label];
        if (!deltaStack.empty()) {
            let currentStack = currentStackMap[label];
            if (currentStack === undefined) {
                currentStack = new Stack<ReferencePosition>();
                currentStackMap[label] = currentStack;
            }
            for (const delta of deltaStack.items) {
                applyRangeReference(currentStack, delta);
            }
        }
    }
}

function applyRangeReference(stack: Stack<ReferencePosition>, delta: ReferencePosition) {
    if (refTypeIncludesFlag(delta, ReferenceType.NestBegin)) {
        stack.push(delta);
        return true;
    } else {
        // Assume delta is end reference
        const top = stack.top();
        // TODO: match end with begin
        if (top && (refTypeIncludesFlag(top, ReferenceType.NestBegin))) {
            stack.pop();
        } else {
            stack.push(delta);
        }
        return false;
    }
}

function addNodeReferences(
    mergeTree: MergeTree, node: IMergeNode,
    rightmostTiles: MapLike<ReferencePosition>,
    leftmostTiles: MapLike<ReferencePosition>, rangeStacks: RangeStackMap) {
    function updateRangeInfo(label: string, refPos: ReferencePosition) {
        let stack = rangeStacks[label];
        if (stack === undefined) {
            stack = new Stack<ReferencePosition>();
            rangeStacks[label] = stack;
        }
        applyRangeReference(stack, refPos);
    }
    if (node.isLeaf()) {
        const segment = node;
        if ((mergeTree.localNetLength(segment) ?? 0) > 0) {
            if (Marker.is(segment)) {
                const markerId = segment.getId();
                // Also in insertMarker but need for reload segs case
                // can add option for this only from reload segs
                if (markerId) {
                    mergeTree.mapIdToSegment(markerId, segment);
                }
                if (refTypeIncludesFlag(segment, ReferenceType.Tile)) {
                    addTile(segment, rightmostTiles);
                    addTileIfNotPresent(segment, leftmostTiles);
                }
                if (segment.refType & (ReferenceType.NestBegin | ReferenceType.NestEnd)) {
                    const rangeLabels = refGetRangeLabels(segment);
                    if (rangeLabels) {
                        for (const label of rangeLabels) {
                            updateRangeInfo(label, segment);
                        }
                    }
                }
            } else {
                const baseSegment = node as BaseSegment;
                if (baseSegment.localRefs && (baseSegment.localRefs.hierRefCount !== undefined) &&
                    (baseSegment.localRefs.hierRefCount > 0)) {
                    for (const lref of baseSegment.localRefs) {
                        if (refTypeIncludesFlag(lref, ReferenceType.Tile)) {
                            addTile(lref, rightmostTiles);
                            addTileIfNotPresent(lref, leftmostTiles);
                        }
                        if (lref.refType & (ReferenceType.NestBegin | ReferenceType.NestEnd)) {
                            for (const label of refGetRangeLabels(lref)!) {
                                updateRangeInfo(label, lref);
                            }
                        }
                    }
                }
            }
        }
    } else {
        const block = <IHierBlock>node;
        applyStackDelta(rangeStacks, block.rangeStacks);
        extend(rightmostTiles, block.rightmostTiles);
        extendIfUndefined(leftmostTiles, block.leftmostTiles);
    }
}

export function ordinalToArray(ord: string) {
    const a: number[] = [];
    if (ord) {
        for (let i = 0, len = ord.length; i < len; i++) {
            a.push(ord.charCodeAt(i));
        }
    }
    return a;
}

// Note that the actual branching factor of the MergeTree is `MaxNodesInBlock - 1`.  This is because
// the MergeTree always inserts first, then checks for overflow and splits if the child count equals
// `MaxNodesInBlock`.  (i.e., `MaxNodesInBlock` contains 1 extra slot for temporary storage to
// facilitate splits.)
export const MaxNodesInBlock = 8;

export class MergeBlock extends MergeNode implements IMergeBlock {
    public children: IMergeNode[];
    public constructor(public childCount: number) {
        super();
        this.children = new Array<IMergeNode>(MaxNodesInBlock);
    }

    public hierBlock(): HierMergeBlock | undefined {
        return undefined;
    }

    public setOrdinal(child: IMergeNode, index: number) {
        let childCount = this.childCount;
        if (childCount === 8) {
            childCount = 7;
        }
        assert((childCount >= 1) && (childCount <= 7), 0x040 /* "Child count is not within [1,7] range!" */);
        let localOrdinal: number;
        const ordinalWidth = 1 << (MaxNodesInBlock - (childCount + 1));
        if (index === 0) {
            localOrdinal = ordinalWidth - 1;
        } else {
            const prevOrd = this.children[index - 1].ordinal;
            const prevOrdCode = prevOrd.charCodeAt(prevOrd.length - 1);
            localOrdinal = prevOrdCode + ordinalWidth;
        }
        child.ordinal = this.ordinal + String.fromCharCode(localOrdinal);
        assert(child.ordinal.length === (this.ordinal.length + 1), 0x041 /* "Unexpected child ordinal length!" */);
        if (index > 0) {
            assert(
                child.ordinal > this.children[index - 1].ordinal,
                0x042, /* "Child ordinal <= previous sibling ordinal!" */
            );
        }
    }

    public assignChild(child: IMergeNode, index: number, updateOrdinal = true) {
        child.parent = this;
        child.index = index;
        if (updateOrdinal) {
            this.setOrdinal(child, index);
        }
        this.children[index] = child;
    }
}

class HierMergeBlock extends MergeBlock implements IMergeBlock {
    public rightmostTiles: MapLike<ReferencePosition>;
    public leftmostTiles: MapLike<ReferencePosition>;
    public rangeStacks: MapLike<Stack<ReferencePosition>>;

    constructor(childCount: number) {
        super(childCount);
        this.rightmostTiles = createMap<ReferencePosition>();
        this.leftmostTiles = createMap<ReferencePosition>();
        this.rangeStacks = createMap<Stack<ReferencePosition>>();
    }

    public addNodeReferences(mergeTree: MergeTree, node: IMergeNode) {
        addNodeReferences(mergeTree, node, this.rightmostTiles, this.leftmostTiles,
            this.rangeStacks);
    }

    public hierBlock() {
        return this;
    }

    public hierToString(indentCount: number) {
        let strbuf = "";
        // eslint-disable-next-line guard-for-in, no-restricted-syntax
        for (const key in this.rangeStacks) {
            const stack = this.rangeStacks[key];
            strbuf += internedSpaces(indentCount);
            strbuf += `${key}: `;
            for (const item of stack.items) {
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
    return mergeTree.localNetLength(node);
}

export abstract class BaseSegment extends MergeNode implements ISegment {
    public clientId: number = LocalClientId;
    public seq: number = UniversalSequenceNumber;
    public removedSeq?: number;
    public removedClientIds?: number[];
    public readonly segmentGroups: SegmentGroupCollection = new SegmentGroupCollection(this);
    public readonly trackingCollection: TrackingGroupCollection = new TrackingGroupCollection(this);
    public propertyManager?: PropertiesManager;
    public properties?: PropertySet;
    public localRefs?: LocalReferenceCollection;
    public abstract readonly type: string;
    public localSeq?: number;
    public localRemovedSeq?: number;

    public addProperties(newProps: PropertySet, op?: ICombiningOp, seq?: number, collabWindow?: CollaborationWindow) {
        if (!this.propertyManager) {
            this.propertyManager = new PropertiesManager();
        }
        if (!this.properties) {
            this.properties = createMap<any>();
        }
        return this.propertyManager.addProperties(
            this.properties,
            newProps,
            op,
            seq,
            collabWindow && collabWindow.collaborating,
        );
    }

    public hasProperty(key: string): boolean {
        return !!this.properties && (this.properties[key] !== undefined);
    }

    public isLeaf() {
        return true;
    }

    protected cloneInto(b: ISegment) {
        b.clientId = this.clientId;
        // TODO: deep clone properties
        b.properties = clone(this.properties);
        b.removedClientIds = this.removedClientIds?.slice();
        // TODO: copy removed client overlap and branch removal info
        b.removedSeq = this.removedSeq;
        b.seq = this.seq;
    }

    public canAppend(segment: ISegment): boolean {
        return false;
    }

    protected addSerializedProps(jseg: IJSONSegment) {
        if (this.properties) {
            jseg.props = this.properties;
        }
    }

    public abstract toJSONObject(): any;

    public ack(segmentGroup: SegmentGroup, opArgs: IMergeTreeDeltaOpArgs, mergeTree: MergeTree): boolean {
        const currentSegmentGroup = this.segmentGroups.dequeue();
        assert(currentSegmentGroup === segmentGroup, 0x043 /* "On ack, unexpected segmentGroup!" */);
        switch (opArgs.op.type) {
            case MergeTreeDeltaType.ANNOTATE:
                assert(!!this.propertyManager, 0x044 /* "On annotate ack, missing segment property manager!" */);
                this.propertyManager.ackPendingProperties(opArgs.op);
                return true;

            case MergeTreeDeltaType.INSERT:
                assert(this.seq === UnassignedSequenceNumber, 0x045 /* "On insert, seq number already assigned!" */);
                this.seq = opArgs.sequencedMessage!.sequenceNumber;
                this.localSeq = undefined;
                return true;

            case MergeTreeDeltaType.REMOVE:
                const removalInfo: IRemovalInfo | undefined = toRemovalInfo(this);
                assert(removalInfo !== undefined, 0x046 /* "On remove ack, missing removal info!" */);
                this.localRemovedSeq = undefined;
                if (removalInfo.removedSeq === UnassignedSequenceNumber) {
                    removalInfo.removedSeq = opArgs.sequencedMessage!.sequenceNumber;
                    return true;
                }
                return false;

            default:
                throw new Error(`${opArgs.op.type} is in unrecognized operation type`);
        }
    }

    public splitAt(pos: number): ISegment | undefined {
        if (pos > 0) {
            const leafSegment = this.createSplitSegmentAt(pos);
            if (leafSegment) {
                this.copyPropertiesTo(leafSegment);
                leafSegment.parent = this.parent;

                // Give the leaf a temporary yet valid ordinal.
                // when this segment is put in the tree, it will get it's real ordinal,
                // but this ordinal meets all the necessary invariants for now.
                leafSegment.ordinal = this.ordinal + String.fromCharCode(0);

                leafSegment.removedClientIds = this.removedClientIds?.slice();
                leafSegment.removedSeq = this.removedSeq;
                leafSegment.localRemovedSeq = this.localRemovedSeq;
                leafSegment.seq = this.seq;
                leafSegment.localSeq = this.localSeq;
                leafSegment.clientId = this.clientId;
                this.segmentGroups.copyTo(leafSegment);
                this.trackingCollection.copyTo(leafSegment);
                if (this.localRefs) {
                    this.localRefs.split(pos, leafSegment);
                }
            }
            return leafSegment;
        }
    }

    private copyPropertiesTo(other: ISegment) {
        if (this.propertyManager) {
            if (this.properties) {
                other.propertyManager = new PropertiesManager();
                other.properties = this.propertyManager.copyTo(
                    this.properties,
                    other.properties,
                    other.propertyManager,
                );
            }
        }
    }

    public abstract clone(): ISegment;
    public abstract append(segment: ISegment): void;
    protected abstract createSplitSegmentAt(pos: number): BaseSegment | undefined;
}

export const reservedMarkerIdKey = "markerId";
export const reservedMarkerSimpleTypeKey = "markerSimpleType";

export interface IJSONMarkerSegment extends IJSONSegment {
    marker: IMarkerDef;
}

export class Marker extends BaseSegment implements ReferencePosition {
    public static readonly type = "Marker";
    public static is(segment: ISegment): segment is Marker {
        return segment.type === Marker.type;
    }
    public readonly type = Marker.type;

    public static make(
        refType: ReferenceType, props?: PropertySet) {
        const marker = new Marker(refType);
        if (props) {
            marker.addProperties(props);
        }
        return marker;
    }

    constructor(public refType: ReferenceType) {
        super();
        this.cachedLength = 1;
    }

    toJSONObject() {
        const obj: IJSONMarkerSegment = { marker: { refType: this.refType } };
        super.addSerializedProps(obj);
        return obj;
    }

    static fromJSONObject(spec: any) {
        if (spec && typeof spec === "object" && "marker" in spec) {
            return Marker.make(
                spec.marker.refType,
                spec.props as PropertySet);
        }
        return undefined;
    }

    clone() {
        const b = Marker.make(this.refType, this.properties);
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
        return !!this.properties &&
            this.properties[reservedMarkerSimpleTypeKey] === simpleTypeName;
    }

    getProperties() {
        return this.properties;
    }

    getId(): string | undefined {
        if (this.properties && this.properties[reservedMarkerIdKey]) {
            return this.properties[reservedMarkerIdKey] as string;
        }
    }

    /**
     * @deprecated - use refHasTileLabels
     */
    hasTileLabels() {
        return refHasTileLabels(this);
    }
    /**
     * @deprecated - use refHasRangeLabels
     */
    hasRangeLabels() {
        return refHasRangeLabels(this);
    }
    /**
     * @deprecated - use refHasTileLabel
     */
    hasTileLabel(label: string): boolean {
        return refHasTileLabel(this, label);
    }
    /**
     * @deprecated - use refHasRangeLabel
     */
    hasRangeLabel(label: string): boolean {
        return refHasRangeLabel(this, label);
    }
    /**
     * @deprecated - use refGetTileLabels
     */
    getTileLabels(): string[] | undefined {
        return refGetTileLabels(this);
    }
    /**
     * @deprecated - use refGetRangeLabels
     */
    getRangeLabels(): string[] | undefined {
        return refGetRangeLabels(this);
    }

    toString() {
        let bbuf = "";
        if (refTypeIncludesFlag(this, ReferenceType.Tile)) {
            bbuf += "Tile";
        }
        if (refTypeIncludesFlag(this, ReferenceType.NestBegin)) {
            if (bbuf.length > 0) {
                bbuf += "; ";
            }
            bbuf += "RangeBegin";
        }
        if (refTypeIncludesFlag(this, ReferenceType.NestEnd)) {
            if (bbuf.length > 0) {
                bbuf += "; ";
            }
            bbuf += "RangeEnd";
        }
        let lbuf = "";
        const id = this.getId();
        if (id) {
            bbuf += ` (${id}) `;
        }
        const tileLabels = refGetTileLabels(this);
        if (tileLabels) {
            lbuf += "tile -- ";
            for (let i = 0, len = tileLabels.length; i < len; i++) {
                const tileLabel = tileLabels[i];
                if (i > 0) {
                    lbuf += "; ";
                }
                lbuf += tileLabel;
            }
        }
        const rangeLabels = refGetRangeLabels(this);
        if (rangeLabels) {
            let rangeKind = "begin";
            if (refTypeIncludesFlag(this, ReferenceType.NestEnd)) {
                rangeKind = "end";
            }
            if (tileLabels) {
                lbuf += " ";
            }
            lbuf += `range ${rangeKind} -- `;
            const labels = rangeLabels;
            for (let i = 0, len = labels.length; i < len; i++) {
                const rangeLabel = labels[i];
                if (i > 0) {
                    lbuf += "; ";
                }
                lbuf += rangeLabel;
            }
        }
        let pbuf = "";
        if (this.properties) {
            pbuf += JSON.stringify(this.properties, (key, value) => {
                // Avoid circular reference when stringifying makers containing handles.
                // (Substitute a debug string instead.)
                const handle = !!value && value.IFluidHandle;

                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                return handle
                    ? `#Handle(${handle.routeContext.path}/${handle.path})`
                    : value;
            });
        }
        return `M ${bbuf}: ${lbuf} ${pbuf}`;
    }

    protected createSplitSegmentAt(pos: number) {
        return undefined;
    }

    canAppend(segment: ISegment): boolean {
        return false;
    }

    append() { throw new Error("Can not append to marker"); }
}

export enum IncrementalExecOp {
    Go,
    Stop,
    Yield,
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
        public childIndex = 0,
    ) {
    }
}

export class CollaborationWindow {
    clientId = LocalClientId;
    collaborating = false;
    // Lowest-numbered segment in window; no client can reference a state before this one
    minSeq = 0;
    // Highest-numbered segment in window and current
    // reference segment for this client
    currentSeq = 0;

    localSeq = 0;

    loadFrom(a: CollaborationWindow) {
        this.clientId = a.clientId;
        this.collaborating = a.collaborating;
        this.minSeq = a.minSeq;
        this.currentSeq = a.currentSeq;
    }
}

export const compareNumbers = (a: number, b: number) => a - b;

export const compareStrings = (a: string, b: string) => a.localeCompare(b);

const indentStrings = ["", " ", "  "];
export function internedSpaces(n: number) {
    if (indentStrings[n] === undefined) {
        indentStrings[n] = "";
        for (let i = 0; i < n; i++) {
            indentStrings[n] += " ";
        }
    }
    return indentStrings[n];
}

export interface IConsensusInfo {
    marker: Marker;
    callback: (m: Marker) => void;
}

export interface ClientSeq {
    refSeq: number;
    clientId: string;
}

export const clientSeqComparer: Comparer<ClientSeq> = {
    min: { refSeq: -1, clientId: "" },
    compare: (a, b) => a.refSeq - b.refSeq,
};

export interface LRUSegment {
    segment?: ISegment;
    maxSeq: number;
}

const LRUSegmentComparer: Comparer<LRUSegment> = {
    min: { maxSeq: -2 },
    compare: (a, b) => a.maxSeq - b.maxSeq,
};

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
    for (const rangeLabel of searchInfo.rangeLabels) {
        if (refHasRangeLabel(marker, rangeLabel)) {
            let currentStack = searchInfo.stacks[rangeLabel];
            if (currentStack === undefined) {
                currentStack = new Stack<Marker>();
                searchInfo.stacks[rangeLabel] = currentStack;
            }
            applyRangeReference(currentStack, marker);
        }
    }
}
function recordRangeLeaf(
    segment: ISegment, segpos: number,
    refSeq: number, clientId: number, start: number | undefined, end: number | undefined,
    searchInfo: IMarkerSearchRangeInfo) {
    if (Marker.is(segment)) {
        if (segment.refType &
            (ReferenceType.NestBegin | ReferenceType.NestEnd)) {
            applyLeafRangeMarker(segment, searchInfo);
        }
    }
    return false;
}

function rangeShift(
    node: IMergeNode, segpos: number, refSeq: number, clientId: number,
    offset: number | undefined, end: number | undefined, searchInfo: IMarkerSearchRangeInfo) {
    if (node.isLeaf()) {
        const seg = node;
        if (((searchInfo.mergeTree.localNetLength(seg) ?? 0) > 0) && Marker.is(seg)) {
            if (seg.refType &
                (ReferenceType.NestBegin | ReferenceType.NestEnd)) {
                applyLeafRangeMarker(seg, searchInfo);
            }
        }
    } else {
        const block = <IHierBlock>node;
        applyStackDelta(searchInfo.stacks, block.rangeStacks);
    }
    return true;
}

function recordTileStart(
    segment: ISegment,
    segpos: number,
    refSeq: number,
    clientId: number,
    start: number,
    end: number,
    searchInfo: IReferenceSearchInfo) {
    if (Marker.is(segment)) {
        if (refHasTileLabel(segment, searchInfo.tileLabel)) {
            searchInfo.tile = segment;
        }
    }
    return false;
}

function tileShift(
    node: IMergeNode, segpos: number, refSeq: number, clientId: number,
    offset: number | undefined, end: number | undefined, searchInfo: IReferenceSearchInfo) {
    if (node.isLeaf()) {
        const seg = node;
        if ((searchInfo.mergeTree.localNetLength(seg) > 0) && Marker.is(seg)) {
            if (refHasTileLabel(seg, searchInfo.tileLabel)) {
                searchInfo.tile = seg;
            }
        }
    } else {
        const block = <IHierBlock>node;
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
    onMinGE(minSeq: number): void;
}

const minListenerComparer: Comparer<MinListener> = {
    min: { minRequired: Number.MIN_VALUE, onMinGE: () => { assert(false, 0x048 /* "onMinGE()" */); } },
    compare: (a, b) => a.minRequired - b.minRequired,
};

export type LocalReferenceMapper = (id: string) => LocalReference;

// Represents a sequence of text segments
export class MergeTree {
    private static readonly zamboniSegmentsMaxCount = 2;
    public static readonly options = {
        incrementalUpdate: true,
        insertAfterRemovedSegs: true,
        zamboniSegments: true,
    };

    private static readonly initBlockUpdateActions: BlockUpdateActions;
    private static readonly theUnfinishedNode = <IMergeBlock>{ childCount: -1 };

    root: IMergeBlock;
    private readonly blockUpdateActions: BlockUpdateActions = MergeTree.initBlockUpdateActions;
    public readonly collabWindow = new CollaborationWindow();
    public pendingSegments: List<SegmentGroup> | undefined;
    private segmentsToScour: Heap<LRUSegment> | undefined;
    // TODO: add remove on segment remove
    // for now assume only markers have ids and so point directly at the Segment
    // if we need to have pointers to non-markers, we can change to point at local refs
    private readonly idToSegment = new Map<string, ISegment>();
    private minSeqListeners: Heap<MinListener> | undefined;
    public mergeTreeDeltaCallback?: MergeTreeDeltaCallback;
    public mergeTreeMaintenanceCallback?: MergeTreeMaintenanceCallback;

    // TODO: make and use interface describing options
    public constructor(public options?: PropertySet) {
        this.root = this.makeBlock(0);
    }

    private makeBlock(childCount: number) {
        const block: MergeBlock = new HierMergeBlock(childCount);
        block.ordinal = "";
        return block;
    }

    public clone() {
        const b = new MergeTree(this.options);
        // For now assume that b will not collaborate
        b.root = b.blockClone(this.root);
    }

    public blockClone(block: IMergeBlock, segments?: ISegment[]) {
        const bBlock = this.makeBlock(block.childCount);
        for (let i = 0; i < block.childCount; i++) {
            const child = block.children[i];
            if (child.isLeaf()) {
                const segment = this.segmentClone(child);
                bBlock.assignChild(segment, i);
                if (segments) {
                    segments.push(segment);
                }
            } else {
                bBlock.assignChild(this.blockClone(child, segments), i);
            }
        }
        this.nodeUpdateLengthNewStructure(bBlock);
        this.nodeUpdateOrdinals(bBlock);
        return bBlock;
    }

    private segmentClone(segment: ISegment) {
        const b = segment.clone();
        return b;
    }

    public localNetLength(segment: ISegment) {
        const removalInfo = toRemovalInfo(segment);
        if (removalInfo !== undefined) {
            return 0;
        } else {
            return segment.cachedLength;
        }
    }

    // TODO: remove id when segment removed
    public mapIdToSegment(id: string, segment: ISegment) {
        this.idToSegment.set(id, segment);
    }

    private addNode(block: IMergeBlock, node: IMergeNode) {
        const index = block.childCount++;
        block.assignChild(node, index, false);
        return index;
    }

    /* eslint-disable max-len */
    public reloadFromSegments(segments: ISegment[]) {
        // This code assumes that a later call to `startCollaboration()` will initialize partial lengths.
        assert(!this.collabWindow.collaborating, 0x049 /* "Trying to reload from segments while collaborating!" */);

        const maxChildren = MaxNodesInBlock - 1;

        // Starting with the leaf segments, recursively builds the B-Tree layer by layer from the bottom up.
        const buildMergeBlock = (nodes: IMergeNode[]) => {
            const blockCount = Math.ceil(nodes.length / maxChildren);   // Compute # blocks require for this level of B-Tree
            const blocks: IMergeBlock[] = new Array(blockCount);        // Pre-alloc array to collect nodes

            // For each block in this level of the B-Tree...
            for (let nodeIndex = 0, blockIndex = 0;     // Start with the first block and first node
                blockIndex < blockCount;                // If we have more blocks, we also have more nodes to insert
                blockIndex++                            // Advance to next block in this layer.
            ) {
                const block = blocks[blockIndex] = this.makeBlock(0);

                // For each child of the current block, insert a node (while we have nodes left)
                // and update the block's info.
                for (let childIndex = 0;
                    childIndex < maxChildren && nodeIndex < nodes.length;   // While we still have children & nodes left
                    childIndex++, nodeIndex++                               // Advance to next child & node
                ) {
                    // Insert the next node into the current block
                    this.addNode(block, nodes[nodeIndex]);
                }

                // Calculate this block's info.  Previously this was inlined into the above loop as a micro-optimization,
                // but it turns out to be negligible in practice since `reloadFromSegments()` is only invoked for the
                // snapshot header.  The bulk of the segments in long documents are inserted via `insertSegments()`.
                this.blockUpdate(block);
            }

            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return blocks.length === 1          // If there is only one block at this layer...
                ? blocks[0]                     // ...then we're done.  Return the root.
                : buildMergeBlock(blocks);      // ...otherwise recursively build the next layer above blocks.
        };
        if (segments.length > 0) {
            this.root = buildMergeBlock(segments);
            this.nodeUpdateOrdinals(this.root);
        } else {
            this.root = this.makeBlock(0);
        }
    }
    /* eslint-enable max-len */

    // For now assume min starts at zero
    public startCollaboration(localClientId: number, minSeq: number, currentSeq: number) {
        this.collabWindow.clientId = localClientId;
        this.collabWindow.minSeq = minSeq;
        this.collabWindow.collaborating = true;
        this.collabWindow.currentSeq = currentSeq;
        this.segmentsToScour = new Heap<LRUSegment>([], LRUSegmentComparer);
        this.pendingSegments = ListMakeHead<SegmentGroup>();
        this.nodeUpdateLengthNewStructure(this.root, true);
    }

    private addToLRUSet(segment: ISegment, seq: number) {
        // If the parent node has not yet been marked for scour (i.e., needsScour is not false or undefined),
        // add the segment and mark the mark the node now.

        // TODO: 'seq' may be less than the current sequence number when inserting pre-ACKed
        //       segments from a snapshot.  We currently skip these for now.
        if (segment.parent!.needsScour !== true && seq > this.collabWindow.currentSeq) {
            segment.parent!.needsScour = true;
            this.segmentsToScour!.add({ segment, maxSeq: seq });
        }
    }

    private underflow(node: IMergeBlock) {
        return node.childCount < (MaxNodesInBlock / 2);
    }

    private scourNode(node: IMergeBlock, holdNodes: IMergeNode[]) {
        let prevSegment: ISegment | undefined;
        for (let k = 0; k < node.childCount; k++) {
            const childNode = node.children[k];
            if (childNode.isLeaf()) {
                const segment = childNode;
                if (segment.segmentGroups.empty) {
                    if (segment.removedSeq !== undefined) {
                        if (segment.removedSeq > this.collabWindow.minSeq) {
                            holdNodes.push(segment);
                        } else if (!segment.trackingCollection.empty) {
                            holdNodes.push(segment);
                        } else {
                            // Notify maintenance event observers that the segment is being unlinked from the MergeTree
                            if (this.mergeTreeMaintenanceCallback) {
                                this.mergeTreeMaintenanceCallback(
                                    {
                                        operation: MergeTreeMaintenanceType.UNLINK,
                                        deltaSegments: [{ segment }],
                                    },
                                    undefined,
                                );
                            }

                            segment.parent = undefined;
                        }
                        prevSegment = undefined;
                    } else {
                        if (segment.seq! <= this.collabWindow.minSeq) {
                            const canAppend = prevSegment
                                && prevSegment.canAppend(segment)
                                && matchProperties(prevSegment.properties, segment.properties)
                                && prevSegment.trackingCollection.matches(segment.trackingCollection)
                                && this.localNetLength(segment) > 0;

                            if (canAppend) {
                                prevSegment!.append(segment);
                                if (this.mergeTreeMaintenanceCallback) {
                                    this.mergeTreeMaintenanceCallback(
                                        {
                                            operation: MergeTreeMaintenanceType.APPEND,
                                            deltaSegments: [{ segment: prevSegment! }, { segment }],
                                        },
                                        undefined,
                                    );
                                }
                                segment.parent = undefined;
                                segment.trackingCollection.trackingGroups.forEach((tg) => tg.unlink(segment));
                            } else {
                                holdNodes.push(segment);
                                if (this.localNetLength(segment) > 0) {
                                    prevSegment = segment;
                                } else {
                                    prevSegment = undefined;
                                }
                            }
                        } else {
                            holdNodes.push(segment);
                            prevSegment = undefined;
                        }
                    }
                } else {
                    holdNodes.push(segment);
                    prevSegment = undefined;
                }
            } else {
                holdNodes.push(childNode);
                prevSegment = undefined;
            }
        }
    }

    // Interior node with all node children
    private packParent(parent: IMergeBlock) {
        const children = parent.children;
        let childIndex: number;
        let childBlock: IMergeBlock;
        const holdNodes: IMergeNode[] = [];
        for (childIndex = 0; childIndex < parent.childCount; childIndex++) {
            // Debug assert not isLeaf()
            childBlock = <IMergeBlock>children[childIndex];
            this.scourNode(childBlock, holdNodes);
            // Will replace this block with a packed block
            childBlock.parent = undefined;
        }
        const totalNodeCount = holdNodes.length;
        const halfCount = MaxNodesInBlock / 2;
        let childCount = Math.min(MaxNodesInBlock - 1, Math.floor(totalNodeCount / halfCount));
        if (childCount < 1) {
            childCount = 1;
        }
        const baseCount = Math.floor(totalNodeCount / childCount);
        let extraCount = totalNodeCount % childCount;
        const packedBlocks = new Array<IMergeBlock>(MaxNodesInBlock);
        let readCount = 0;
        for (let nodeIndex = 0; nodeIndex < childCount; nodeIndex++) {
            let nodeCount = baseCount;
            if (extraCount > 0) {
                nodeCount++;
                extraCount--;
            }
            const packedBlock = this.makeBlock(nodeCount);
            for (let packedNodeIndex = 0; packedNodeIndex < nodeCount; packedNodeIndex++) {
                const nodeToPack = holdNodes[readCount++];
                packedBlock.assignChild(nodeToPack, packedNodeIndex, false);
            }
            packedBlock.parent = parent;
            packedBlocks[nodeIndex] = packedBlock;
            this.nodeUpdateLengthNewStructure(packedBlock);
        }
        parent.children = packedBlocks;
        for (let j = 0; j < childCount; j++) {
            parent.assignChild(packedBlocks[j], j, false);
        }
        parent.childCount = childCount;
        if (this.underflow(parent) && (parent.parent)) {
            this.packParent(parent.parent);
        } else {
            this.nodeUpdateOrdinals(parent);
            this.blockUpdatePathLengths(parent, UnassignedSequenceNumber, -1, true);
        }
    }

    private zamboniSegments(zamboniSegmentsMaxCount = MergeTree.zamboniSegmentsMaxCount) {
        if (!this.collabWindow.collaborating) {
            return;
        }

        for (let i = 0; i < zamboniSegmentsMaxCount; i++) {
            let segmentToScour = this.segmentsToScour!.peek();
            if (!segmentToScour || segmentToScour.maxSeq > this.collabWindow.minSeq) {
                break;
            }
            segmentToScour = this.segmentsToScour!.get();
            // Only skip scouring if needs scour is explicitly false, not true or undefined
            if (segmentToScour.segment!.parent && segmentToScour.segment!.parent.needsScour !== false) {
                const block = segmentToScour.segment!.parent;
                const childrenCopy: IMergeNode[] = [];
                this.scourNode(block, childrenCopy);
                // This will avoid the cost of re-scouring nodes
                // that have recently been scoured
                block.needsScour = false;

                const newChildCount = childrenCopy.length;

                if (newChildCount < block.childCount) {
                    block.childCount = newChildCount;
                    block.children = childrenCopy;
                    for (let j = 0; j < newChildCount; j++) {
                        block.assignChild(childrenCopy[j], j, false);
                    }

                    if (this.underflow(block) && block.parent) {
                        this.packParent(block.parent);
                    } else {
                        this.nodeUpdateOrdinals(block);
                        this.blockUpdatePathLengths(block, UnassignedSequenceNumber, -1, true);
                    }
                }
            }
        }
    }

    public getCollabWindow() {
        return this.collabWindow;
    }

    public getStats() {
        const nodeGetStats = (block: IMergeBlock): MergeTreeStats => {
            const stats: MergeTreeStats = {
                maxHeight: 0,
                nodeCount: 0,
                leafCount: 0,
                removedLeafCount: 0,
                liveCount: 0,
                histo: [],
            };
            for (let k = 0; k < MaxNodesInBlock; k++) {
                stats.histo[k] = 0;
            }
            for (let i = 0; i < block.childCount; i++) {
                const child = block.children[i];
                let height = 1;
                if (!child.isLeaf()) {
                    const childStats = nodeGetStats(child);
                    height = 1 + childStats.maxHeight;
                    stats.nodeCount += childStats.nodeCount;
                    stats.leafCount += childStats.leafCount;
                    stats.removedLeafCount += childStats.removedLeafCount;
                    stats.liveCount += childStats.liveCount;
                    for (let j = 0; j < MaxNodesInBlock; j++) {
                        stats.histo[j] += childStats.histo[j];
                    }
                } else {
                    stats.leafCount++;
                    const segment = child;
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
        };
        const rootStats = nodeGetStats(this.root);
        return rootStats;
    }

    public getLength(refSeq: number, clientId: number) {
        return this.blockLength(this.root, refSeq, clientId);
    }

    /**
     * Returns the current length of the MergeTree for the local client.
     */
    public get length() { return this.root.cachedLength; }

    public getPosition(node: MergeNode, refSeq: number, clientId: number) {
        let totalOffset = 0;
        let parent = node.parent;
        let prevParent: IMergeBlock | undefined;
        while (parent) {
            const children = parent.children;
            for (let childIndex = 0; childIndex < parent.childCount; childIndex++) {
                const child = children[childIndex];
                if ((prevParent && (child === prevParent)) || (child === node)) {
                    break;
                }
                totalOffset += this.nodeLength(child, refSeq, clientId) ?? 0;
            }
            prevParent = parent;
            parent = parent.parent;
        }
        return totalOffset;
    }

    public getContainingSegment<T extends ISegment>(pos: number, refSeq: number, clientId: number) {
        let segment: T | undefined;
        let offset: number | undefined;

        const leaf = (leafSeg: ISegment, segpos: number, _refSeq: number, _clientId: number, start: number) => {
            segment = leafSeg as T;
            offset = start;
            return false;
        };
        this.searchBlock(this.root, pos, 0, refSeq, clientId, { leaf }, undefined);
        return { segment, offset };
    }

    /**
     * @internal must only be used by client
     * @param segoff - The segment and offset to slide from
     * @returns The segment and offset to slide to
     */
    public _getSlideToSegment(segoff: { segment: ISegment | undefined; offset: number | undefined; }) {
        if (!segoff.segment || !isRemovedAndAcked(segoff.segment)) {
            return segoff;
        }
        let slideToSegment: ISegment | undefined;
        const goFurtherToFindSlideToSegment = (seg) => {
            if (seg.seq !== UnassignedSequenceNumber && !isRemovedAndAcked(seg)) {
                slideToSegment = seg;
                return false;
            }
            return true;
        };
        // Slide to the next farthest valid segment in the tree.
        this.rightExcursion(segoff.segment, goFurtherToFindSlideToSegment);
        if (slideToSegment) {
            return { segment: slideToSegment, offset: 0 };
        }
        // If no such segment is found, slide to the last valid segment.
        this.leftExcursion(segoff.segment, goFurtherToFindSlideToSegment);

        // Workaround TypeScript issue (https://github.com/microsoft/TypeScript/issues/9998)
        slideToSegment = slideToSegment as ISegment | undefined;

        if (slideToSegment) {
            // If slid nearer then offset should be at the end of the segment
            return { segment: slideToSegment, offset: slideToSegment.cachedLength - 1 };
        }

        return { segment: undefined, offset: 0 };
    }

    /**
     * This method should only be called when the current client sequence number is
     * max(remove segment sequence number, add reference sequence number).
     * Otherwise eventual consistency is not guaranteed.
     * See `packages\dds\merge-tree\REFERENCEPOSITIONS.md`
     */
    private slideReferences(segment: ISegment, refsToSlide: LocalReference[]) {
        assert(
            isRemovedAndAcked(segment),
            0x2f1 /* slideReferences from a segment which has not been removed and acked */);
        assert(!!segment.localRefs, 0x2f2 /* Ref not in the segment localRefs */);
        const newSegoff = this._getSlideToSegment({ segment, offset: 0 });
        const newSegment = newSegoff.segment;
        if (newSegment && !newSegment.localRefs) {
            newSegment.localRefs = new LocalReferenceCollection(newSegment);
        }
        for (const ref of refsToSlide) {
            ref.callbacks?.beforeSlide?.();
            const removedRef = segment.localRefs.removeLocalRef(ref);
            assert(ref === removedRef, 0x2f3 /* Ref not in the segment localRefs */);
            if (!newSegment) {
                // No valid segments (all nodes removed or not yet created)
                ref.segment = undefined;
                ref.offset = 0;
            } else {
                ref.segment = newSegment;
                ref.offset = newSegoff.offset ?? 0;
                assert(!!newSegment.localRefs, 0x2f4 /* localRefs must be allocated */);
                newSegment.localRefs.addLocalRef(ref);
            }
            ref.callbacks?.afterSlide?.();
        }
        // TODO is it required to update the path lengths?
        if (newSegment) {
            this.blockUpdatePathLengths(newSegment.parent, TreeMaintenanceSequenceNumber,
                LocalClientId);
        }
    }

    private updateSegmentRefsAfterMarkRemoved(segment: ISegment, pending: boolean) {
        if (!segment.localRefs || segment.localRefs.empty) {
            return;
        }
        const refsToSlide: LocalReference[] = [];
        const refsToStay: LocalReference[] = [];
        for (const lref of segment.localRefs) {
            if (refTypeIncludesFlag(lref, ReferenceType.StayOnRemove)) {
                refsToStay.push(lref);
            } else if (refTypeIncludesFlag(lref, ReferenceType.SlideOnRemove)) {
                if (pending) {
                    refsToStay.push(lref);
                } else {
                    refsToSlide.push(lref);
                }
            }
        }
        // Rethink implementation of keeping and sliding refs once other reference
        // changes are complete. This works but is fragile and possibly slow.
        if (!pending) {
            this.slideReferences(segment, refsToSlide);
        }
        segment.localRefs.clear();
        for (const lref of refsToStay) {
            lref.segment = segment;
            segment.localRefs.addLocalRef(lref);
        }
    }

    private blockLength(node: IMergeBlock, refSeq: number, clientId: number) {
        if ((this.collabWindow.collaborating) && (clientId !== this.collabWindow.clientId)) {
            return node.partialLengths!.getPartialLength(refSeq, clientId);
        } else {
            return node.cachedLength;
        }
    }

    private nodeLength(node: IMergeNode, refSeq: number, clientId: number) {
        if ((!this.collabWindow.collaborating) || (this.collabWindow.clientId === clientId)) {
            // Local client sees all segments, even when collaborating
            if (!node.isLeaf()) {
                return node.cachedLength;
            } else {
                return this.localNetLength(node);
            }
        } else {
            // Sequence number within window
            if (!node.isLeaf()) {
                return node.partialLengths!.getPartialLength(refSeq, clientId);
            } else {
                const segment = node;
                const removalInfo = toRemovalInfo(segment);

                if (removalInfo !== undefined
                    && removalInfo.removedSeq !== UnassignedSequenceNumber
                    && removalInfo.removedSeq <= refSeq) {
                    // this segment is a tombstone eligible for zamboni
                    // so should never be considered, as it may not exist
                    // on other clients
                    return undefined;
                }
                if (((segment.clientId === clientId) ||
                    ((segment.seq !== UnassignedSequenceNumber) && (segment.seq! <= refSeq)))) {
                    // Segment happened by reference sequence number or segment from requesting client
                    if (removalInfo !== undefined) {
                        if (removalInfo.removedClientIds.includes(clientId)) {
                            return 0;
                        } else {
                            return segment.cachedLength;
                        }
                    } else {
                        return segment.cachedLength;
                    }
                } else {
                    // the segment was inserted and removed before the
                    // this context, so it will never exist for this
                    // context
                    if (removalInfo !== undefined
                        && removalInfo.removedSeq !== UnassignedSequenceNumber) {
                        return undefined;
                    }
                    // Segment invisible to client at reference sequence number/branch id/client id of op
                    return 0;
                }
            }
        }
    }

    public addMinSeqListener(minRequired: number, onMinGE: (minSeq: number) => void) {
        if (!this.minSeqListeners) {
            this.minSeqListeners = new Heap<MinListener>([],
                minListenerComparer);
        }
        this.minSeqListeners.add({ minRequired, onMinGE });
    }

    private notifyMinSeqListeners() {
        if (this.minSeqListeners) {
            while ((this.minSeqListeners.count() > 0) &&
                (this.minSeqListeners.peek().minRequired <= this.collabWindow.minSeq)) {
                const minListener = this.minSeqListeners.get()!;
                minListener.onMinGE(this.collabWindow.minSeq);
            }
        }
    }

    public setMinSeq(minSeq: number) {
        assert(
            minSeq <= this.collabWindow.currentSeq,
            0x04e, /* "Trying to set minSeq above currentSeq of collab window!" */
        );

        // Only move forward
        assert(this.collabWindow.minSeq <= minSeq, 0x04f /* "minSeq of collab window > target minSeq!" */);

        if (minSeq > this.collabWindow.minSeq) {
            this.collabWindow.minSeq = minSeq;
            if (MergeTree.options.zamboniSegments) {
                this.zamboniSegments();
            }
            this.notifyMinSeqListeners();
        }
    }

    public referencePositionToLocalPosition(
        refPos: ReferencePosition,
        refSeq = this.collabWindow.currentSeq,
        clientId = this.collabWindow.clientId) {
        const seg = refPos.getSegment();
        if (seg && seg.parent) {
            const offset = !seg.removedSeq ? refPos.getOffset() : 0;
            return offset + this.getPosition(seg, refSeq, clientId);
        }
        return LocalReference.DetachedPosition;
    }

    public getStackContext(startPos: number, clientId: number, rangeLabels: string[]) {
        const searchInfo: IMarkerSearchRangeInfo = {
            mergeTree: this,
            stacks: createMap<Stack<Marker>>(),
            rangeLabels,
        };

        this.search(startPos, UniversalSequenceNumber, clientId,
            { leaf: recordRangeLeaf, shift: rangeShift }, searchInfo);
        return searchInfo.stacks;
    }

    // TODO: filter function
    public findTile(startPos: number, clientId: number, tileLabel: string, posPrecedesTile = true) {
        const searchInfo: IReferenceSearchInfo = {
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
                const marker = <Marker>searchInfo.tile;
                pos = this.getPosition(marker, UniversalSequenceNumber, clientId);
            } else {
                const localRef = <LocalReference>searchInfo.tile;
                pos = localRef.toPosition();
            }
            return { tile: searchInfo.tile, pos };
        }
    }

    private search<TClientData>(
        pos: number, refSeq: number, clientId: number,
        actions: SegmentActions<TClientData> | undefined, clientData: TClientData): ISegment | undefined {
        return this.searchBlock(this.root, pos, 0, refSeq, clientId, actions, clientData);
    }

    private searchBlock<TClientData>(
        block: IMergeBlock, pos: number, segpos: number, refSeq: number, clientId: number,
        actions: SegmentActions<TClientData> | undefined, clientData: TClientData): ISegment | undefined {
        let _pos = pos;
        let _segpos = segpos;
        const children = block.children;
        if (actions && actions.pre) {
            actions.pre(block, _segpos, refSeq, clientId, undefined, undefined, clientData);
        }
        const contains = actions && actions.contains;
        for (let childIndex = 0; childIndex < block.childCount; childIndex++) {
            const child = children[childIndex];
            const len = this.nodeLength(child, refSeq, clientId) ?? 0;
            if (
                (!contains && _pos < len)
                || (contains && contains(child, _pos, refSeq, clientId, undefined, undefined, clientData))
            ) {
                // Found entry containing pos
                if (!child.isLeaf()) {
                    return this.searchBlock(child, _pos, _segpos, refSeq, clientId, actions, clientData);
                } else {
                    if (actions && actions.leaf) {
                        actions.leaf(child, _segpos, refSeq, clientId, _pos, -1, clientData);
                    }
                    return child;
                }
            } else {
                if (actions && actions.shift) {
                    actions.shift(child, _segpos, refSeq, clientId, _pos, undefined, clientData);
                }
                _pos -= len;
                _segpos += len;
            }
        }
        if (actions && actions.post) {
            actions.post(block, _segpos, refSeq, clientId, undefined, undefined, clientData);
        }
    }

    private backwardSearch<TClientData>(
        pos: number, refSeq: number, clientId: number,
        actions: SegmentActions<TClientData> | undefined, clientData: TClientData): ISegment | undefined {
        const len = this.getLength(refSeq, clientId);
        if (pos > len) {
            return undefined;
        }
        return this.backwardSearchBlock(this.root, pos, len, refSeq, clientId, actions, clientData);
    }

    private backwardSearchBlock<TClientData>(
        block: IMergeBlock, pos: number, segEnd: number, refSeq: number, clientId: number,
        actions: SegmentActions<TClientData> | undefined, clientData: TClientData): ISegment | undefined {
        let _segEnd = segEnd;
        const children = block.children;
        if (actions && actions.pre) {
            actions.pre(block, _segEnd, refSeq, clientId, undefined, undefined, clientData);
        }
        const contains = actions && actions.contains;
        for (let childIndex = block.childCount - 1; childIndex >= 0; childIndex--) {
            const child = children[childIndex];
            const len = this.nodeLength(child, refSeq, clientId) ?? 0;
            const segpos = _segEnd - len;
            if (((!contains) && (pos >= segpos)) ||
                (contains && contains(child, pos, refSeq, clientId, undefined, undefined, clientData))) {
                // Found entry containing pos
                if (!child.isLeaf()) {
                    return this.backwardSearchBlock(child, pos, _segEnd, refSeq, clientId, actions, clientData);
                } else {
                    if (actions && actions.leaf) {
                        actions.leaf(child, segpos, refSeq, clientId, pos, -1, clientData);
                    }
                    return child;
                }
            } else {
                if (actions && actions.shift) {
                    actions.shift(child, segpos, refSeq, clientId, pos, undefined, clientData);
                }
                _segEnd = segpos;
            }
        }
        if (actions && actions.post) {
            actions.post(block, _segEnd, refSeq, clientId, undefined, undefined, clientData);
        }
    }

    private updateRoot(splitNode: IMergeBlock | undefined) {
        if (splitNode !== undefined) {
            const newRoot = this.makeBlock(2);
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
    public ackPendingSegment(opArgs: IMergeTreeDeltaOpArgs) {
        const seq = opArgs.sequencedMessage!.sequenceNumber;
        const pendingSegmentGroup = this.pendingSegments!.dequeue();
        const nodesToUpdate: IMergeBlock[] = [];
        let overwrite = false;
        if (pendingSegmentGroup !== undefined) {
            const deltaSegments: IMergeTreeSegmentDelta[] = [];
            pendingSegmentGroup.segments.map((pendingSegment) => {
                const overlappingRemove = !pendingSegment.ack(pendingSegmentGroup, opArgs, this);
                overwrite = overlappingRemove || overwrite;

                if (!overlappingRemove && opArgs.op.type === MergeTreeDeltaType.REMOVE) {
                    this.updateSegmentRefsAfterMarkRemoved(pendingSegment, false);
                }
                if (MergeTree.options.zamboniSegments) {
                    this.addToLRUSet(pendingSegment, seq);
                }
                if (!nodesToUpdate.includes(pendingSegment.parent!)) {
                    nodesToUpdate.push(pendingSegment.parent!);
                }
                deltaSegments.push({
                    segment: pendingSegment,
                });
            });
            if (this.mergeTreeMaintenanceCallback) {
                this.mergeTreeMaintenanceCallback(
                    {
                        deltaSegments,
                        operation: MergeTreeMaintenanceType.ACKNOWLEDGED,
                    },
                    opArgs,
                );
            }
            const clientId = this.collabWindow.clientId;
            for (const node of nodesToUpdate) {
                this.blockUpdatePathLengths(node, seq, clientId, overwrite);
                // NodeUpdatePathLengths(node, seq, clientId, true);
            }
        }
        if (MergeTree.options.zamboniSegments) {
            this.zamboniSegments();
        }
    }

    private addToPendingList(segment: ISegment, segmentGroup?: SegmentGroup, localSeq?: number) {
        let _segmentGroup = segmentGroup;
        if (_segmentGroup === undefined) {
            // TODO: review the cast
            _segmentGroup = { segments: [], localSeq } as SegmentGroup;
            this.pendingSegments!.enqueue(_segmentGroup);
        }
        segment.segmentGroups.enqueue(_segmentGroup);
        return _segmentGroup;
    }

    // TODO: error checking
    public getMarkerFromId(id: string) {
        return this.idToSegment.get(id);
    }

    /**
     * Given a position specified relative to a marker id, lookup the marker
     * and convert the position to a character position.
     * @param relativePos - Id of marker (may be indirect) and whether position is before or after marker.
     * @param refseq - The reference sequence number at which to compute the position.
     * @param clientId - The client id with which to compute the position.
     */
    public posFromRelativePos(
        relativePos: IRelativePosition,
        refseq = this.collabWindow.currentSeq,
        clientId = this.collabWindow.clientId) {
        let pos = -1;
        let marker: Marker | undefined;
        if (relativePos.id) {
            marker = this.getMarkerFromId(relativePos.id) as Marker;
        }
        if (marker) {
            pos = this.getPosition(marker, refseq, clientId);
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

    public insertSegments(
        pos: number,
        segments: ISegment[],
        refSeq: number,
        clientId: number,
        seq: number,
        opArgs: IMergeTreeDeltaOpArgs | undefined,
    ) {
        this.ensureIntervalBoundary(pos, refSeq, clientId);

        const localSeq = seq === UnassignedSequenceNumber ? ++this.collabWindow.localSeq : undefined;

        this.blockInsert(pos, refSeq, clientId, seq, localSeq, segments);

        // opArgs == undefined => loading snapshot or test code
        if (this.mergeTreeDeltaCallback && opArgs !== undefined) {
            this.mergeTreeDeltaCallback(
                opArgs,
                {
                    operation: MergeTreeDeltaType.INSERT,
                    deltaSegments: segments.map((segment) => ({ segment })),
                });
        }

        if (this.collabWindow.collaborating && MergeTree.options.zamboniSegments &&
            (seq !== UnassignedSequenceNumber)) {
            this.zamboniSegments();
        }
    }

    public insertAtReferencePosition(
        referencePosition: ReferencePosition,
        insertSegment: ISegment,
        opArgs: IMergeTreeDeltaOpArgs,
    ): void {
        if (insertSegment.cachedLength === 0) {
            return;
        }
        if (insertSegment.parent
            || insertSegment.removedSeq
            || insertSegment.seq !== UniversalSequenceNumber) {
            throw new Error("Cannot insert segment that has already been inserted.");
        }

        const rebalanceTree = (segment: ISegment) => {
            // Blocks should never be left full
            // if the inserts makes the block full
            // then we need to walk up the chain of parents
            // and split the blocks until we find a block with
            // room
            let block = segment.parent;
            let ordinalUpdateNode: IMergeBlock | undefined = block;
            while (block !== undefined) {
                if (block.childCount >= MaxNodesInBlock) {
                    const splitNode = this.split(block);
                    if (block === this.root) {
                        this.updateRoot(splitNode);
                        // Update root already updates all it's children ordinals
                        ordinalUpdateNode = undefined;
                    } else {
                        this.insertChildNode(block.parent!, splitNode, block.index + 1);
                        ordinalUpdateNode = splitNode.parent;
                        this.blockUpdateLength(block.parent!, UnassignedSequenceNumber, clientId);
                    }
                } else {
                    this.blockUpdateLength(block, UnassignedSequenceNumber, clientId);
                }
                block = block.parent;
            }
            // Only update ordinals once, for all children,
            // on the path
            if (ordinalUpdateNode) {
                this.nodeUpdateOrdinals(ordinalUpdateNode);
            }
        };

        const clientId = this.collabWindow.clientId;
        const refSegment = referencePosition.getSegment()!;
        const refOffset = referencePosition.getOffset();
        const refSegLen = this.nodeLength(refSegment, this.collabWindow.currentSeq, clientId);
        let startSeg = refSegment;
        // if the change isn't at a boundary, we need to split the segment
        if (refOffset !== 0 && refSegLen !== undefined && refSegLen !== 0) {
            const splitSeg = this.splitLeafSegment(refSegment, refOffset);
            assert(!!splitSeg.next, 0x050 /* "Next segment changes are undefined!" */);
            this.insertChildNode(refSegment.parent!, splitSeg.next, refSegment.index + 1);
            rebalanceTree(splitSeg.next);
            startSeg = splitSeg.next;
        }
        // walk back from the segment, to see if there is a previous tie break seg
        this.leftExcursion(startSeg, (backSeg) => {
            if (!backSeg.isLeaf()) {
                return true;
            }
            const backLen = this.nodeLength(backSeg, this.collabWindow.currentSeq, clientId);
            // ignore removed segments
            if (backLen === undefined) {
                return true;
            }
            // Find the nearest 0 length seg we can insert over, as all other inserts
            // go near to far
            if (backLen === 0) {
                if (this.breakTie(0, backSeg, UnassignedSequenceNumber)) {
                    startSeg = backSeg;
                }
                return true;
            }
            return false;
        });

        if (this.collabWindow.collaborating) {
            insertSegment.localSeq = ++this.collabWindow.localSeq;
            insertSegment.seq = UnassignedSequenceNumber;
        } else {
            insertSegment.seq = UniversalSequenceNumber;
        }

        insertSegment.clientId = clientId;

        if (Marker.is(insertSegment)) {
            const markerId = insertSegment.getId();
            if (markerId) {
                this.mapIdToSegment(markerId, insertSegment);
            }
        }

        this.insertChildNode(startSeg.parent!, insertSegment, startSeg.index);

        rebalanceTree(insertSegment);

        if (this.mergeTreeDeltaCallback) {
            this.mergeTreeDeltaCallback(
                opArgs,
                {
                    deltaSegments: [{ segment: insertSegment }],
                    operation: MergeTreeDeltaType.INSERT,
                });
        }

        if (this.collabWindow.collaborating) {
            this.addToPendingList(insertSegment, undefined, insertSegment.localSeq);
        }
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
        remoteClientId: number): number | undefined {
        if (remoteClientRefSeq < this.collabWindow.minSeq) {
            return undefined;
        }

        const segmentInfo = this.getContainingSegment(
            remoteClientPosition,
            remoteClientRefSeq,
            remoteClientId);

        const segwindow = this.getCollabWindow();

        if (segmentInfo && segmentInfo.segment) {
            const segmentPosition = this.getPosition(segmentInfo.segment, segwindow.currentSeq, segwindow.clientId);

            return segmentPosition + segmentInfo.offset!;
        } else {
            if (remoteClientPosition === this.getLength(remoteClientRefSeq, remoteClientId)) {
                return this.getLength(segwindow.currentSeq, segwindow.clientId);
            }
        }
    }

    private insertChildNode(block: IMergeBlock, child: IMergeNode, childIndex: number) {
        assert(block.childCount < MaxNodesInBlock, 0x051 /* "Too many children on merge block!" */);

        for (let i = block.childCount; i > childIndex; i--) {
            block.children[i] = block.children[i - 1];
            block.children[i].index = i;
        }

        block.childCount++;
        block.assignChild(child, childIndex, false);
    }

    private blockInsert<T extends ISegment>(
        pos: number,
        refSeq: number,
        clientId: number,
        seq: number,
        localSeq: number | undefined,
        newSegments: T[],
    ) {
        let segIsLocal = false;
        const checkSegmentIsLocal = (segment: ISegment) => {
            if (segment.seq === UnassignedSequenceNumber) {
                segIsLocal = true;
            }
            // Only need to look at first segment that follows finished node
            return false;
        };

        const continueFrom = (node: IMergeBlock) => {
            segIsLocal = false;
            this.rightExcursion(node, checkSegmentIsLocal);
            return segIsLocal;
        };

        let segmentGroup: SegmentGroup;
        const saveIfLocal = (locSegment: ISegment) => {
            // Save segment so can assign sequence number when acked by server
            if (this.collabWindow.collaborating) {
                if ((locSegment.seq === UnassignedSequenceNumber) && (clientId === this.collabWindow.clientId)) {
                    segmentGroup = this.addToPendingList(locSegment, segmentGroup, localSeq);
                    // eslint-disable-next-line @typescript-eslint/brace-style
                }
                // LocSegment.seq === 0 when coming from SharedSegmentSequence.loadBody()
                // In all other cases this has to be true (checked by addToLRUSet):
                // locSegment.seq > this.collabWindow.currentSeq
                else if ((locSegment.seq! > this.collabWindow.minSeq) &&
                    MergeTree.options.zamboniSegments) {
                    this.addToLRUSet(locSegment, locSegment.seq!);
                }
            }
        };
        const onLeaf = (segment: ISegment | undefined, _pos: number, context: InsertContext) => {
            const segmentChanges: ISegmentChanges = {};
            if (segment) {
                // Insert before segment
                segmentChanges.replaceCurrent = context.candidateSegment;
                segmentChanges.next = segment;
            } else {
                segmentChanges.next = context.candidateSegment;
            }
            return segmentChanges;
        };

        // TODO: build tree from segs and insert all at once
        let insertPos = pos;
        for (const newSegment of newSegments) {
            segIsLocal = false;
            if (newSegment.cachedLength > 0) {
                newSegment.seq = seq;
                newSegment.localSeq = localSeq;
                newSegment.clientId = clientId;
                if (Marker.is(newSegment)) {
                    const markerId = newSegment.getId();
                    if (markerId) {
                        this.mapIdToSegment(markerId, newSegment);
                    }
                }

                const splitNode = this.insertingWalk(this.root, insertPos, refSeq, clientId, seq,
                    { leaf: onLeaf, candidateSegment: newSegment, continuePredicate: continueFrom });

                if (newSegment.parent === undefined) {
                    throw new Error(`MergeTree insert failed: ${JSON.stringify({
                        currentSeq: this.collabWindow.currentSeq,
                        minSeq: this.collabWindow.minSeq,
                        segSeq: newSegment.seq,
                    })}`);
                }

                this.updateRoot(splitNode);
                saveIfLocal(newSegment);

                insertPos += newSegment.cachedLength;
            }
        }
    }
    private readonly splitLeafSegment = (segment: ISegment | undefined, pos: number): ISegmentChanges => {
        if (!(pos > 0 && segment)) {
            return {};
        }

        const next = segment.splitAt(pos)!;
        if (this.mergeTreeMaintenanceCallback) {
            this.mergeTreeMaintenanceCallback({
                operation: MergeTreeMaintenanceType.SPLIT,
                deltaSegments: [{ segment }, { segment: next }],
            },
                undefined);
        }

        return { next };
    };

    private ensureIntervalBoundary(pos: number, refSeq: number, clientId: number) {
        const splitNode = this.insertingWalk(this.root, pos, refSeq, clientId, TreeMaintenanceSequenceNumber,
            { leaf: this.splitLeafSegment });
        this.updateRoot(splitNode);
    }

    // Assume called only when pos == len
    private breakTie(pos: number, node: IMergeNode, seq: number) {
        if (node.isLeaf()) {
            if (pos === 0) {
                // normalize the seq numbers
                // if the new seg is local (UnassignedSequenceNumber) give it the highest possible
                // seq for comparison, as it will get a seq higher than any other seq once sequences
                // if the current seg is local (UnassignedSequenceNumber) give it the second highest
                // possible seq, as the highest is reserved for the previous.
                const newSeq = seq === UnassignedSequenceNumber ? Number.MAX_SAFE_INTEGER : seq;
                const segSeq = node.seq === UnassignedSequenceNumber ? Number.MAX_SAFE_INTEGER - 1 : node.seq ?? 0;
                return newSeq > segSeq;
            }
            return false;
        } else {
            return true;
        }
    }

    // Visit segments starting from node's left siblings, then up to node's parent
    private leftExcursion(node: IMergeNode, leafAction: ISegmentAction<undefined>) {
        let go = true;
        let startNode = node;
        let parent = startNode.parent;
        while (parent) {
            const children = parent.children;
            let childIndex: number;
            let _node: IMergeNode;
            let matchedStart = false;
            for (childIndex = parent.childCount - 1; childIndex >= 0; childIndex--) {
                _node = children[childIndex];
                if (matchedStart) {
                    if (!_node.isLeaf()) {
                        const childBlock = _node;
                        go = this.nodeMapReverse(childBlock, leafAction, 0, UniversalSequenceNumber,
                            this.collabWindow.clientId);
                    } else {
                        go = leafAction(_node, 0, UniversalSequenceNumber, this.collabWindow.clientId, 0, 0, undefined);
                    }
                    if (!go) {
                        return;
                    }
                } else {
                    matchedStart = (startNode === _node);
                }
            }
            startNode = parent;
            parent = parent.parent;
        }
    }

    /**
     * Visit segments starting from node's right siblings, then up to node's parent.
     * All segments past `node` are visited, regardless of their visibility.
     */
    private rightExcursion(node: IMergeNode, leafAction: (seg: ISegment) => boolean) {
        let go = true;
        let startNode = node;
        let parent = startNode.parent;
        while (parent) {
            const children = parent.children;
            let childIndex: number;
            let _node: IMergeNode;
            let matchedStart = false;
            for (childIndex = 0; childIndex < parent.childCount; childIndex++) {
                _node = children[childIndex];
                if (matchedStart) {
                    if (!_node.isLeaf()) {
                        const childBlock = _node;
                        go = this.walkAllSegments(childBlock, leafAction);
                    } else {
                        go = leafAction(_node);
                    }
                    if (!go) {
                        return;
                    }
                } else {
                    matchedStart = (startNode === _node);
                }
            }
            startNode = parent;
            parent = parent.parent;
        }
    }

    private insertingWalk(
        block: IMergeBlock, pos: number, refSeq: number, clientId: number, seq: number,
        context: InsertContext) {
        let _pos = pos;
        const children = block.children;
        let childIndex: number;
        let child: IMergeNode;
        let newNode: IMergeNode | undefined;
        let fromSplit: IMergeBlock | undefined;
        for (childIndex = 0; childIndex < block.childCount; childIndex++) {
            child = children[childIndex];
            const len = this.nodeLength(child, refSeq, clientId);
            if (len === undefined) {
                // if the seg len in undefined, the segment
                // will be removed, so should just be skipped for now
                continue;
            }

            if ((_pos < len) || ((_pos === len) && this.breakTie(_pos, child, seq))) {
                // Found entry containing pos
                if (!child.isLeaf()) {
                    const childBlock = child;
                    // Internal node
                    const splitNode = this.insertingWalk(childBlock, _pos, refSeq, clientId,
                        seq, context);
                    if (splitNode === undefined) {
                        if (context.structureChange) {
                            this.nodeUpdateLengthNewStructure(block);
                        } else {
                            this.blockUpdateLength(block, seq, clientId);
                        }
                        return undefined;
                    } else if (splitNode === MergeTree.theUnfinishedNode) {
                        _pos -= len; // Act as if shifted segment
                        continue;
                    } else {
                        newNode = splitNode;
                        fromSplit = splitNode;
                        childIndex++; // Insert after
                    }
                } else {
                    const segment = child;
                    const segmentChanges = context.leaf(segment, _pos, context);
                    if (segmentChanges.replaceCurrent) {
                        block.assignChild(segmentChanges.replaceCurrent, childIndex, false);
                        segmentChanges.replaceCurrent.ordinal = child.ordinal;
                    }
                    if (segmentChanges.next) {
                        newNode = segmentChanges.next;
                        childIndex++; // Insert after
                    } else {
                        // No change
                        if (context.structureChange) {
                            this.nodeUpdateLengthNewStructure(block);
                        }
                        return undefined;
                    }
                }
                break;
            } else {
                _pos -= len;
            }
        }
        if (!newNode) {
            if (_pos === 0) {
                if ((seq !== UnassignedSequenceNumber) && context.continuePredicate &&
                    context.continuePredicate(block)) {
                    return MergeTree.theUnfinishedNode;
                } else {
                    const segmentChanges = context.leaf(undefined, _pos, context);
                    newNode = segmentChanges.next;
                    // Assert segmentChanges.replaceCurrent === undefined
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
                    this.nodeUpdateOrdinals(fromSplit);
                }
                if (context.structureChange) {
                    this.nodeUpdateLengthNewStructure(block);
                } else {
                    this.blockUpdateLength(block, seq, clientId);
                }
                return undefined;
            } else {
                // Don't update ordinals because higher block will do it
                return this.split(block);
            }
        } else {
            return undefined;
        }
    }

    private split(node: IMergeBlock) {
        const halfCount = MaxNodesInBlock / 2;
        const newNode = this.makeBlock(halfCount);
        node.childCount = halfCount;
        // Update ordinals to reflect lowered child count
        this.nodeUpdateOrdinals(node);
        for (let i = 0; i < halfCount; i++) {
            newNode.assignChild(node.children[halfCount + i], i, false);
            node.children[halfCount + i] = undefined!;
        }
        this.nodeUpdateLengthNewStructure(node);
        this.nodeUpdateLengthNewStructure(newNode);
        return newNode;
    }

    private nodeUpdateOrdinals(block: IMergeBlock) {
        for (let i = 0; i < block.childCount; i++) {
            const child = block.children[i];
            block.setOrdinal(child, i);
            if (!child.isLeaf()) {
                this.nodeUpdateOrdinals(child);
            }
        }
    }

    /**
     * Annotate a range with properties
     * @param start - The inclusive start position of the range to annotate
     * @param end - The exclusive end position of the range to annotate
     * @param props - The properties to annotate the range with
     * @param combiningOp - Optional. Specifies how to combine values for the property, such as "incr" for increment.
     * @param refSeq - The reference sequence number to use to apply the annotate
     * @param clientId - The id of the client making the annotate
     * @param seq - The sequence number of the annotate operation
     * @param opArgs - The op args for the annotate op. this is passed to the merge tree callback if there is one
     */
    public annotateRange(
        start: number, end: number, props: PropertySet, combiningOp: ICombiningOp | undefined, refSeq: number,
        clientId: number, seq: number, opArgs: IMergeTreeDeltaOpArgs) {
        this.ensureIntervalBoundary(start, refSeq, clientId);
        this.ensureIntervalBoundary(end, refSeq, clientId);
        const deltaSegments: IMergeTreeSegmentDelta[] = [];
        const localSeq = seq === UnassignedSequenceNumber ? ++this.collabWindow.localSeq : undefined;
        let segmentGroup: SegmentGroup | undefined;

        const annotateSegment = (segment: ISegment) => {
            const propertyDeltas = segment.addProperties(props, combiningOp, seq, this.collabWindow);
            deltaSegments.push({ segment, propertyDeltas });
            if (this.collabWindow.collaborating) {
                if (seq === UnassignedSequenceNumber) {
                    segmentGroup = this.addToPendingList(segment, segmentGroup, localSeq);
                } else {
                    if (MergeTree.options.zamboniSegments) {
                        this.addToLRUSet(segment, seq);
                    }
                }
            }
            return true;
        };

        this.mapRange({ leaf: annotateSegment }, refSeq, clientId, undefined, start, end);

        // OpArgs == undefined => test code
        if (this.mergeTreeDeltaCallback && deltaSegments.length > 0) {
            this.mergeTreeDeltaCallback(
                opArgs,
                {
                    operation: MergeTreeDeltaType.ANNOTATE,
                    deltaSegments,
                });
        }
        if (this.collabWindow.collaborating && (seq !== UnassignedSequenceNumber)) {
            if (MergeTree.options.zamboniSegments) {
                this.zamboniSegments();
            }
        }
    }

    public markRangeRemoved(
        start: number,
        end: number,
        refSeq: number,
        clientId: number,
        seq: number,
        overwrite = false,
        opArgs: IMergeTreeDeltaOpArgs,
    ) {
        let _overwrite = overwrite;
        this.ensureIntervalBoundary(start, refSeq, clientId);
        this.ensureIntervalBoundary(end, refSeq, clientId);
        let segmentGroup: SegmentGroup;
        const removedSegments: IMergeTreeSegmentDelta[] = [];
        const segmentsWithRefs: ISegment[] = [];
        const localSeq = seq === UnassignedSequenceNumber ? ++this.collabWindow.localSeq : undefined;
        const markRemoved = (segment: ISegment, pos: number, _start: number, _end: number) => {
            const existingRemovalInfo = toRemovalInfo(segment);
            if (existingRemovalInfo !== undefined) {
                _overwrite = true;
                if (existingRemovalInfo.removedSeq === UnassignedSequenceNumber) {
                    // we removed this locally, but someone else removed it first
                    // so put them at the head of the list
                    // the list isn't ordered, but we
                    // keep first removal at the head.
                    existingRemovalInfo.removedClientIds.unshift(clientId);
                    existingRemovalInfo.removedSeq = seq;
                    segment.localRemovedSeq = undefined;
                } else {
                    // Do not replace earlier sequence number for remove
                    existingRemovalInfo.removedClientIds.push(clientId);
                }
            } else {
                segment.removedClientIds = [clientId];
                segment.removedSeq = seq;
                segment.localRemovedSeq = localSeq;

                removedSegments.push({ segment });
            }
            if (segment.localRefs && !segment.localRefs.empty) {
                segmentsWithRefs.push(segment);
            }

            // Save segment so can assign removed sequence number when acked by server
            if (this.collabWindow.collaborating) {
                if (segment.removedSeq === UnassignedSequenceNumber && clientId === this.collabWindow.clientId) {
                    segmentGroup = this.addToPendingList(segment, segmentGroup, localSeq);
                } else {
                    if (MergeTree.options.zamboniSegments) {
                        this.addToLRUSet(segment, seq);
                    }
                }
            }
            return true;
        };
        const afterMarkRemoved = (node: IMergeBlock, pos: number, _start: number, _end: number) => {
            if (_overwrite) {
                this.nodeUpdateLengthNewStructure(node);
            } else {
                this.blockUpdateLength(node, seq, clientId);
            }
            return true;
        };
        this.mapRange({ leaf: markRemoved, post: afterMarkRemoved }, refSeq, clientId, undefined, start, end);
        const pending = this.collabWindow.collaborating && clientId === this.collabWindow.clientId;
        for (const segment of segmentsWithRefs) {
            this.updateSegmentRefsAfterMarkRemoved(segment, pending);
        }

        // opArgs == undefined => test code
        if (this.mergeTreeDeltaCallback && removedSegments.length > 0) {
            this.mergeTreeDeltaCallback(
                opArgs,
                {
                    operation: MergeTreeDeltaType.REMOVE,
                    deltaSegments: removedSegments,
                });
        }
        if (this.collabWindow.collaborating && (seq !== UnassignedSequenceNumber)) {
            if (MergeTree.options.zamboniSegments) {
                this.zamboniSegments();
            }
        }
    }

    private nodeUpdateLengthNewStructure(node: IMergeBlock, recur = false) {
        this.blockUpdate(node);
        if (this.collabWindow.collaborating) {
            node.partialLengths = PartialSequenceLengths.combine(this, node, this.collabWindow, recur);
        }
    }

    public removeLocalReferencePosition(lref: LocalReferencePosition): LocalReferencePosition | undefined {
        const segment = lref.getSegment();
        if (segment) {
            const removedRefs = segment?.localRefs?.removeLocalRef(lref);
            if (removedRefs !== undefined) {
                this.blockUpdatePathLengths(segment.parent, TreeMaintenanceSequenceNumber,
                    LocalClientId);
            }
            return removedRefs;
        }
    }
    public createLocalReferencePosition(
        segment: ISegment, offset: number | undefined, refType: ReferenceType, properties: PropertySet | undefined,
        client: Client,
    ): LocalReferencePosition {
        if (isRemoved(segment)) {
            if (!refTypeIncludesFlag(refType, ReferenceType.SlideOnRemove | ReferenceType.Transient)) {
                throw new UsageError(
                    "Can only create SlideOnRemove or Transient local reference position on a removed segment");
            }
        }
        const localRefs = segment.localRefs ?? new LocalReferenceCollection(segment);
        segment.localRefs = localRefs;

        const segRef = localRefs.createLocalRef(offset, refType, properties, client);

        this.blockUpdatePathLengths(segment.parent, TreeMaintenanceSequenceNumber,
            LocalClientId);
        return segRef;
    }

    /**
     * @deprecated - use removeLocalReferencePosition
     */
    public removeLocalReference(segment: ISegment, lref: LocalReference) {
        if (segment.localRefs) {
            const removedRef = segment.localRefs.removeLocalRef(lref);
            if (removedRef) {
                this.blockUpdatePathLengths(segment.parent, TreeMaintenanceSequenceNumber,
                    LocalClientId);
            }
        }
    }

    /**
     * @deprecated - use createLocalReference
     */
    public addLocalReference(lref: LocalReference) {
        const segment = lref.segment!;
        let localRefs = segment.localRefs;
        if (!localRefs) {
            localRefs = new LocalReferenceCollection(segment);
            segment.localRefs = localRefs;
        }
        localRefs.addLocalRef(lref);
        this.blockUpdatePathLengths(segment.parent, TreeMaintenanceSequenceNumber,
            LocalClientId);
    }

    private blockUpdate(block: IMergeBlock) {
        let len = 0;
        const hierBlock = block.hierBlock();
        if (hierBlock) {
            hierBlock.rightmostTiles = createMap<Marker>();
            hierBlock.leftmostTiles = createMap<Marker>();
            hierBlock.rangeStacks = {};
        }
        for (let i = 0; i < block.childCount; i++) {
            const child = block.children[i];
            len += nodeTotalLength(this, child) ?? 0;
            if (hierBlock) {
                hierBlock.addNodeReferences(this, child);
            }
            if (this.blockUpdateActions) {
                this.blockUpdateActions.child(block, i);
            }
        }
        block.cachedLength = len;
    }

    private blockUpdatePathLengths(
        startBlock: IMergeBlock | undefined,
        seq: number,
        clientId: number,
        newStructure = false,
    ) {
        let block: IMergeBlock | undefined = startBlock;
        while (block !== undefined) {
            if (newStructure) {
                this.nodeUpdateLengthNewStructure(block);
            } else {
                this.blockUpdateLength(block, seq, clientId);
            }
            block = block.parent;
        }
    }

    private blockUpdateLength(node: IMergeBlock, seq: number, clientId: number) {
        this.blockUpdate(node);
        if (
            this.collabWindow.collaborating
            && seq !== UnassignedSequenceNumber
            && seq !== TreeMaintenanceSequenceNumber
        ) {
            if (
                node.partialLengths !== undefined
                && MergeTree.options.incrementalUpdate
                && clientId !== NonCollabClient
            ) {
                node.partialLengths.update(this, node, seq, clientId, this.collabWindow);
            } else {
                node.partialLengths = PartialSequenceLengths.combine(this, node, this.collabWindow);
            }
        }
    }

    public map<TClientData>(
        actions: SegmentActions<TClientData>,
        refSeq: number,
        clientId: number,
        accum: TClientData,
    ) {
        // TODO: optimize to avoid comparisons
        this.nodeMap(this.root, actions, 0, refSeq, clientId, accum);
    }

    public mapRange<TClientData>(
        actions: SegmentActions<TClientData>,
        refSeq: number,
        clientId: number,
        accum: TClientData,
        start?: number,
        end?: number,
        splitRange: boolean = false,
    ) {
        if (splitRange) {
            if (start) {
                this.ensureIntervalBoundary(start, refSeq, clientId);
            }
            if (end) {
                this.ensureIntervalBoundary(end, refSeq, clientId);
            }
        }
        this.nodeMap(this.root, actions, 0, refSeq, clientId, accum, start, end);
    }

    public incrementalBlockMap<TContext>(stateStack: Stack<IncrementalMapState<TContext>>) {
        while (!stateStack.empty()) {
            // We already check the stack is not empty
            const state = stateStack.top()!;
            if (state.op !== IncrementalExecOp.Go) {
                return;
            }
            if (state.childIndex === 0) {
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
            if ((state.op === IncrementalExecOp.Go) && (state.childIndex < state.block.childCount)) {
                const child = state.block.children[state.childIndex];
                const len = this.nodeLength(child, state.refSeq, state.clientId) ?? 0;
                if ((len > 0) && (state.start < len) && (state.end > 0)) {
                    if (!child.isLeaf()) {
                        const childState = new IncrementalMapState(child, state.actions, state.pos,
                            state.refSeq, state.clientId, state.context, state.start, state.end, 0);
                        stateStack.push(childState);
                    } else {
                        state.actions.leaf(child, state);
                    }
                }
                state.pos += len;
                state.start -= len;
                state.end -= len;
                state.childIndex++;
            } else {
                if (state.childIndex === state.block.childCount) {
                    if ((state.op === IncrementalExecOp.Go) && state.actions.post) {
                        state.actions.post(state);
                    }
                    stateStack.pop();
                }
            }
        }
    }

    private nodeMap<TClientData>(
        node: IMergeBlock, actions: SegmentActions<TClientData>, pos: number, refSeq: number,
        clientId: number, accum: TClientData, start?: number, end?: number) {
        let _start = start;
        let _end = end;
        let _pos = pos;
        if (_start === undefined) {
            _start = 0;
        }
        if (_end === undefined) {
            _end = this.blockLength(node, refSeq, clientId);
        }
        let go = true;
        if (actions.pre) {
            go = actions.pre(node, _pos, refSeq, clientId, _start, _end, accum);
            if (!go) {
                // Cancel this node but not entire traversal
                return true;
            }
        }
        const children = node.children;
        for (let childIndex = 0; childIndex < node.childCount; childIndex++) {
            const child = children[childIndex];
            const len = this.nodeLength(child, refSeq, clientId) ?? 0;
            if (go && (_end > 0) && (len > 0) && (_start < len)) {
                // Found entry containing pos
                if (!child.isLeaf()) {
                    if (go) {
                        go = this.nodeMap(child, actions, _pos, refSeq, clientId, accum, _start, _end);
                    }
                } else {
                    if (actions.leaf) {
                        go = actions.leaf(child, _pos, refSeq, clientId, _start, _end, accum);
                    }
                }
            }
            if (!go) {
                break;
            }
            if (actions.shift) {
                actions.shift(child, _pos, refSeq, clientId, _start, _end, accum);
            }
            _pos += len;
            _start -= len;
            _end -= len;
        }
        if (go && actions.post) {
            go = actions.post(node, _pos, refSeq, clientId, _start, _end, accum);
        }

        return go;
    }

    // Invokes the leaf action for all segments.  Note that *all* segments are visited
    // regardless of if they would be visible to the current `clientId` and `refSeq`.
    public walkAllSegments<TClientData>(
        block: IMergeBlock,
        action: (segment: ISegment, accum?: TClientData) => boolean,
        accum?: TClientData,
    ): boolean {
        let go = true;
        const children = block.children;
        for (let childIndex = 0; go && childIndex < block.childCount; childIndex++) {
            const child = children[childIndex];
            go = child.isLeaf()
                ? action(child, accum)
                : this.walkAllSegments(child, action, accum);
        }
        return go;
    }

    // Straight call every segment; goes until leaf action returns false
    private nodeMapReverse(
        block: IMergeBlock, leafAction: ISegmentAction<undefined>, pos: number, refSeq: number,
        clientId: number) {
        let go = true;
        const children = block.children;
        for (let childIndex = block.childCount - 1; childIndex >= 0; childIndex--) {
            const child = children[childIndex];
            if (go) {
                // Found entry containing pos
                if (!child.isLeaf()) {
                    if (go) {
                        go = this.nodeMapReverse(child, leafAction, pos, refSeq, clientId);
                    }
                } else {
                    go = leafAction(child, pos, refSeq, clientId, 0, 0, undefined);
                }
            }
            if (!go) {
                break;
            }
        }
        return go;
    }
}
