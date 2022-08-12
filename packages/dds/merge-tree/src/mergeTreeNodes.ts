/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

/* eslint-disable @typescript-eslint/prefer-optional-chain, no-bitwise */

import { assert } from "@fluidframework/common-utils";
import {
    LocalClientId,
    UnassignedSequenceNumber,
    UniversalSequenceNumber,
} from "./constants";
import {
     LocalReferenceCollection,
     LocalReferencePosition,
} from "./localReference";
import { MergeTree } from "./mergeTree";
import {
    IMergeTreeDeltaOpArgs,
} from "./mergeTreeDeltaCallback";
import { TrackingGroupCollection } from "./mergeTreeTracking";
import {
    ICombiningOp,
    IJSONSegment,
    IMarkerDef,
    MergeTreeDeltaType,
    ReferenceType,
} from "./ops";
import { PartialSequenceLengths } from "./partialLengths";
import {
    clone,
    createMap,
    MapLike,
    PropertySet,
} from "./properties";
import {
    refTypeIncludesFlag,
    RangeStackMap,
    ReferencePosition,
    refGetRangeLabels,
    refGetTileLabels,
 } from "./referencePositions";
import { SegmentGroupCollection } from "./segmentGroupCollection";
import { PropertiesManager, PropertiesRollback } from "./segmentPropertiesManager";

/**
 * Common properties for a node in a merge tree.
 */
export interface IMergeNodeCommon {
    parent?: IMergeBlock;
    /**
     * The length of the contents of the node.
     */
    cachedLength: number;
    /**
     * The index of this node in its parent's list of children.
     */
    index: number;
    /**
     * A string that can be used for comparing the location of this node to other `MergeNode`s in the same tree.
     * `a.ordinal < b.ordinal` if and only if `a` comes before `b` in a pre-order traversal of the tree.
     */
    ordinal: string;
    isLeaf(): this is ISegment;
}

export type IMergeNode = IMergeBlock | ISegment;

/**
 * Internal (i.e. non-leaf) node in a merge tree.
 */
export interface IMergeBlock extends IMergeNodeCommon {
    needsScour?: boolean;
    /**
     * Number of direct children of this node
     */
    childCount: number;
    /**
     * Array of child nodes.
     *
     * @remarks To avoid reallocation, this is always initialized to have maximum length as deemed by
     * the merge tree's branching factor. Use `childCount` to determine how many children this node actually has.
     */
    children: IMergeNode[];
    /**
     * Supports querying the total length of all descendants of this IMergeBlock from the perspective of any
     * (clientId, seq) within the collab window.
     *
     * @remarks This is only optional for implementation reasons (internal nodes can be created/moved without
     * immediately initializing the partial lengths). Aside from mid-update on tree operations, these lengths
     * objects are always defined.
     */
    partialLengths?: PartialSequenceLengths;
    hierBlock(): IHierBlock | undefined;
    assignChild(child: IMergeNode, index: number, updateOrdinal?: boolean): void;
    setOrdinal(child: IMergeNode, index: number): void;
}

export interface IHierBlock extends IMergeBlock {
    hierToString(indentCount: number): string;
    /**
     * @deprecated  for internal use only. public export will be removed.
     * @internal
     */
    addNodeReferences(mergeTree: MergeTree, node: IMergeNode): void;
    rightmostTiles: MapLike<ReferencePosition>;
    leftmostTiles: MapLike<ReferencePosition>;
    /**
     * @deprecated  for internal use only. public export will be removed.
     * @internal
     */
    rangeStacks: RangeStackMap;
}

/**
 * Contains removal information associated to an {@link ISegment}.
 */
export interface IRemovalInfo {
    /**
     * Seq at which this segment was removed.
     */
    removedSeq: number;
    /**
     * List of client IDs that have removed this segment.
     * The client that actually removed the segment (i.e. whose removal op was sequenced first) is stored as the first
     * client in this list. Other clients in the list have all issued concurrent ops to remove the segment.
     * @remarks When this list has length \> 1, this is referred to as the "overlapping remove" case.
     */
    removedClientIds: number[];
}

export function toRemovalInfo(maybe: Partial<IRemovalInfo> | undefined): IRemovalInfo | undefined {
    if (maybe?.removedClientIds !== undefined && maybe?.removedSeq !== undefined) {
        return maybe as IRemovalInfo;
    }
    assert(maybe?.removedClientIds === undefined && maybe?.removedSeq === undefined,
        0x2bf /* "both removedClientIds and removedSeq should be set or not set" */);
}

/**
 * A segment representing a portion of the merge tree.
 * Segments are leaf nodes of the merge tree and contain data.
 */
export interface ISegment extends IMergeNodeCommon, Partial<IRemovalInfo> {
    readonly type: string;
    readonly segmentGroups: SegmentGroupCollection;
    readonly trackingCollection: TrackingGroupCollection;
    /**
     * Manages pending local state for properties on this segment.
     */
    propertyManager?: PropertiesManager;
    /**
     * Local seq at which this segment was inserted. If this is defined, `seq` will be UnassignedSequenceNumber.
     * Once the segment is acked, this field is cleared.
     */
    localSeq?: number;
    /**
     * Local seq at which this segment was removed. If this is defined, `removedSeq` will initially be set to
     * UnassignedSequenceNumber. However, if another client concurrently removes the same segment, `removedSeq`
     * will be updated to the seq at which that client removed this segment.
     *
     * Like `localSeq`, this field is cleared once the local removal of the segment is acked.
     */
    localRemovedSeq?: number;
    /**
     * Seq at which this segment was inserted.
     * If undefined, it is assumed the segment was inserted prior to the collab window's minimum sequence number.
     */
    seq?: number;
    /**
     * Short clientId for the client that inserted this segment.
     */
    clientId: number;
    /**
     * Local references added to this segment.
     */
    localRefs?: LocalReferenceCollection;
    /**
     * Properties that have been added to this segment via annotation.
     */
    properties?: PropertySet;
    addProperties(
        newProps: PropertySet,
        op?: ICombiningOp,
        seq?: number,
        collabWindow?: CollaborationWindow,
        rollback?: PropertiesRollback,
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
     *
     * @deprecated  for internal use only. public export will be removed.
     * @internal
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
    previousProps?: PropertySet[];
    removedReferences?: LocalReferencePosition[];
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

    public hierBlock(): IHierBlock | undefined {
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

    public addProperties(newProps: PropertySet, op?: ICombiningOp, seq?: number,
        collabWindow?: CollaborationWindow, rollback: PropertiesRollback = PropertiesRollback.None) {
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
            rollback,
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

    /**
     * @deprecated  for internal use only. public export will be removed.
     * @internal
     */
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

export interface SegmentAccumulator {
    segments: ISegment[];
}

export interface MinListener {
    minRequired: number;
    onMinGE(minSeq: number): void;
}
