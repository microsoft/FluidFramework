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
    Stack,
} from "./collections";
import {
    LocalClientId,
    NonCollabClient,
    TreeMaintenanceSequenceNumber,
    UnassignedSequenceNumber,
    UniversalSequenceNumber,
} from "./constants";
import {
    LocalReferenceCollection,
    LocalReferencePosition,
} from "./localReference";
import {
	BaseSegment,
	BlockAction,
	BlockUpdateActions,
	CollaborationWindow,
	IHierBlock,
	IMergeBlock,
	IMergeNode,
	IncrementalExecOp,
	IncrementalMapState,
	InsertContext,
	internedSpaces,
	ISegment,
	ISegmentAction,
	ISegmentChanges,
	Marker,
	MaxNodesInBlock,
	MergeBlock,
	MergeNode,
	MinListener,
	SegmentActions,
	SegmentGroup,
	toRemovalInfo,
 } from "./mergeTreeNodes";
import {
    IMergeTreeDeltaOpArgs,
    IMergeTreeSegmentDelta,
    MergeTreeDeltaCallback,
    MergeTreeMaintenanceCallback,
    MergeTreeMaintenanceType,
} from "./mergeTreeDeltaCallback";
import { createAnnotateRangeOp, createInsertSegmentOp, createRemoveRangeOp } from "./opBuilder";
import {
    ICombiningOp,
    IMergeTreeDeltaOp,
    IRelativePosition,
    MergeTreeDeltaType,
    ReferenceType,
} from "./ops";
import { PartialSequenceLengths } from "./partialLengths";
import {
    createMap,
    extend,
    MapLike,
    matchProperties,
    PropertySet,
} from "./properties";
import {
    refTypeIncludesFlag,
    ReferencePosition,
    DetachedReferencePosition,
	RangeStackMap,
	refHasRangeLabel,
	refGetRangeLabels,
	refGetTileLabels,
	refHasTileLabel,
 } from "./referencePositions";
import { PropertiesRollback } from "./segmentPropertiesManager";
import {
    backwardExcursion,
    depthFirstNodeWalk,
    forwardExcursion,
    NodeAction,
    walkAllChildSegments,
} from "./mergeTreeNodeWalk";

const minListenerComparer: Comparer<MinListener> = {
    min: { minRequired: Number.MIN_VALUE, onMinGE: () => { assert(false, 0x048 /* "onMinGE()" */); } },
    compare: (a, b) => a.minRequired - b.minRequired,
};

function isRemoved(segment: ISegment): boolean {
    return toRemovalInfo(segment) !== undefined;
}

function isRemovedAndAcked(segment: ISegment): boolean {
    const removalInfo = toRemovalInfo(segment);
    return removalInfo !== undefined && removalInfo.removedSeq !== UnassignedSequenceNumber;
}

function nodeTotalLength(mergeTree: MergeTree, node: IMergeNode) {
    if (!node.isLeaf()) {
        return node.cachedLength;
    }
    return mergeTree.localNetLength(node);
}

const LRUSegmentComparer: Comparer<LRUSegment> = {
    min: { maxSeq: -2 },
    compare: (a, b) => a.maxSeq - b.maxSeq,
};

interface IReferenceSearchInfo {
    mergeTree: MergeTree;
    tileLabel: string;
    tilePrecedesPos?: boolean;
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
        if ((searchInfo.mergeTree.localNetLength(seg) ?? 0) > 0 && Marker.is(seg)) {
            if (refHasTileLabel(seg, searchInfo.tileLabel)) {
                searchInfo.tile = seg;
            }
        }
    } else {
        const block = <IHierBlock>node;
        const marker = searchInfo.tilePrecedesPos
            ? <Marker>block.rightmostTiles[searchInfo.tileLabel]
            : <Marker>block.leftmostTiles[searchInfo.tileLabel];
        if (marker !== undefined) {
            searchInfo.tile = marker;
        }
    }
    return true;
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

function extendIfUndefined<T>(base: MapLike<T>, extension: MapLike<T> | undefined) {
    if (extension !== undefined) {
        // eslint-disable-next-line no-restricted-syntax
        for (const key in extension) {
            if (base[key] === undefined) {
                base[key] = extension[key];
            }
        }
    }
    return base;
}
class HierMergeBlock extends MergeBlock implements IHierBlock {
    public rightmostTiles: MapLike<ReferencePosition>;
    public leftmostTiles: MapLike<ReferencePosition>;
    public rangeStacks: MapLike<Stack<ReferencePosition>>;

    constructor(childCount: number) {
        super(childCount);
        this.rightmostTiles = createMap<ReferencePosition>();
        this.leftmostTiles = createMap<ReferencePosition>();
        this.rangeStacks = createMap<Stack<ReferencePosition>>();
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

/**
 * @deprecated For internal use only. public export will be removed.
 * @internal
 */
 export interface ClientSeq {
    refSeq: number;
    clientId: string;
}

/**
 * @deprecated For internal use only. public export will be removed.
 * @internal
 */
 export const clientSeqComparer: Comparer<ClientSeq> = {
    min: { refSeq: -1, clientId: "" },
    compare: (a, b) => a.refSeq - b.refSeq,
};

/**
 * @deprecated For internal use only. public export will be removed.
 * @internal
 */
export interface LRUSegment {
    segment?: ISegment;
    maxSeq: number;
}

/**
 * @deprecated For internal use only. public export will be removed.
 * @internal
 */
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
    /**
     * Whether or not all blocks in the mergeTree currently have information about local partial lengths computed.
     * This information is only necessary on reconnect, and otherwise costly to bookkeep.
     * This field enables tracking whether partials need to be recomputed using localSeq information.
     */
    private localPartialsComputed = false;
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

    /**
     * Compute the net length of this segment from a local perspective.
     * @param segment - Segment whose length to find
     * @param localSeq - localSeq at which to find the length of this segment. If not provided,
     * default is to consider the local client's current perspective. Only local sequence
     * numbers corresponding to un-acked operations give valid results.
     */
    public localNetLength(segment: ISegment, refSeq?: number, localSeq?: number) {
        const removalInfo = toRemovalInfo(segment);
        if (localSeq === undefined) {
            if (removalInfo !== undefined) {
                if (this.options?.mergeTreeUseNewLengthCalculations !== true) {
                    const normalizedRemovedSeq = removalInfo.removedSeq === UnassignedSequenceNumber
                        ? Number.MAX_SAFE_INTEGER
                        : removalInfo.removedSeq;
                    if (normalizedRemovedSeq > this.collabWindow.minSeq) {
                        return 0;
                    }
                    // this segment removed and outside the collab window which means it is zamboni eligible
                    // this also means the segment could not exist, so we should not consider it
                    // when making decisions about conflict resolutions
                    return undefined;
                }
                return 0;
            } else {
                return segment.cachedLength;
            }
        }

        assert(refSeq !== undefined, 0x398 /* localSeq provided for local length without refSeq */);
        assert(segment.seq !== undefined, 0x399 /* segment with no seq in mergeTree */);
        const { seq, removedSeq, localRemovedSeq } = segment;
        if (seq !== UnassignedSequenceNumber) {
            // inserted remotely
            if (seq > refSeq
                    || (removedSeq !== undefined && removedSeq !== UnassignedSequenceNumber && removedSeq <= refSeq)
                    || (localRemovedSeq !== undefined && localRemovedSeq <= localSeq)) {
                return 0;
            }
            return segment.cachedLength;
        } else {
            assert(segment.localSeq !== undefined, 0x39a /* unacked segment with undefined localSeq */);
            // inserted locally, still un-acked
            if (segment.localSeq > localSeq || (localRemovedSeq !== undefined && localRemovedSeq <= localSeq)) {
                return 0;
            }
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
        this.pendingSegments = new List<SegmentGroup>();
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
                                && (this.localNetLength(segment) ?? 0) > 0;

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
                                prevSegment = (this.localNetLength(segment) ?? 0) > 0 ? segment : undefined;
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

    public getLength(refSeq: number, clientId: number) {
        return this.blockLength(this.root, refSeq, clientId);
    }

    /**
     * Returns the current length of the MergeTree for the local client.
     */
    public get length() { return this.root.cachedLength; }

    public getPosition(node: MergeNode, refSeq: number, clientId: number, localSeq?: number) {
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
                totalOffset += this.nodeLength(child, refSeq, clientId, localSeq) ?? 0;
            }
            prevParent = parent;
            parent = parent.parent;
        }
        return totalOffset;
    }

    public getContainingSegment<T extends ISegment>(pos: number, refSeq: number, clientId: number, localSeq?: number) {
        assert(localSeq === undefined || clientId === this.collabWindow.clientId,
            0x39b /* localSeq provided for non-local client */);
        let segment: T | undefined;
        let offset: number | undefined;

        const leaf = (leafSeg: ISegment, segpos: number, _refSeq: number, _clientId: number, start: number) => {
            segment = leafSeg as T;
            offset = start;
            return false;
        };
        this.nodeMap(refSeq, clientId, leaf, undefined, undefined, pos, pos + 1, localSeq);
        return { segment, offset };
    }

    /**
     * @remarks Must only be used by client.
     * @param segment - The segment to slide from.
     * @returns The segment to.
     * @internal
     */
    public _getSlideToSegment(segment: ISegment | undefined): ISegment | undefined {
        if (!segment || !isRemovedAndAcked(segment)) {
            return segment;
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
        forwardExcursion(segment, goFurtherToFindSlideToSegment);
        if (slideToSegment) {
            return slideToSegment;
        }
        // If no such segment is found, slide to the last valid segment.
        backwardExcursion(segment, goFurtherToFindSlideToSegment);
        return slideToSegment;
    }

    /**
     * This method should only be called when the current client sequence number is
     * max(remove segment sequence number, add reference sequence number).
     * Otherwise eventual consistency is not guaranteed.
     * See `packages\dds\merge-tree\REFERENCEPOSITIONS.md`
     */
    private slideAckedRemovedSegmentReferences(segment: ISegment) {
        assert(
            isRemovedAndAcked(segment),
            0x2f1 /* slideReferences from a segment which has not been removed and acked */);
        if (segment.localRefs?.empty !== false) {
            return;
        }
        const newSegment = this._getSlideToSegment(segment);
        if (newSegment) {
            const localRefs = newSegment.localRefs ??= new LocalReferenceCollection(newSegment);
            if (newSegment.ordinal < segment.ordinal) {
                localRefs.addAfterTombstones(segment.localRefs);
            } else {
                localRefs.addBeforeTombstones(segment.localRefs);
            }
        } else {
            for (const ref of segment.localRefs) {
                if (!refTypeIncludesFlag(ref, ReferenceType.StayOnRemove)) {
                    ref.callbacks?.beforeSlide?.(ref);
                    segment.localRefs?.removeLocalRef(ref);
                    ref.callbacks?.afterSlide?.(ref);
                }
            }
        }
        // TODO is it required to update the path lengths?
        if (newSegment) {
            this.blockUpdatePathLengths(newSegment.parent, TreeMaintenanceSequenceNumber,
                LocalClientId);
        }
    }

    private blockLength(node: IMergeBlock, refSeq: number, clientId: number) {
        return (this.collabWindow.collaborating) && (clientId !== this.collabWindow.clientId)
            ? node.partialLengths!.getPartialLength(refSeq, clientId)
            : node.cachedLength;
    }

    /**
     * Compute local partial length information
     *
     * Public only for use by internal tests
     *
     * @internal
     */
    public computeLocalPartials(refSeq: number) {
        if (this.localPartialsComputed) {
            return;
        }

        const rebaseCollabWindow = new CollaborationWindow();
        rebaseCollabWindow.loadFrom(this.collabWindow);
        if (refSeq < this.collabWindow.minSeq) {
            rebaseCollabWindow.minSeq = refSeq;
        }
        this.root.partialLengths = PartialSequenceLengths.combine(
            this.root,
            rebaseCollabWindow,
            true,
            true,
        );
        this.localPartialsComputed = true;
    }

    private nodeLength(node: IMergeNode, refSeq: number, clientId: number, localSeq?: number) {
        if ((!this.collabWindow.collaborating) || (this.collabWindow.clientId === clientId)) {
            if (node.isLeaf()) {
                return this.localNetLength(node, refSeq, localSeq);
            } else if (localSeq === undefined) {
                // Local client sees all segments, even when collaborating
                return node.cachedLength;
            } else {
                this.computeLocalPartials(refSeq);
                // Local client should see all segments except those after localSeq.
                return node.partialLengths!.getPartialLength(refSeq, clientId, localSeq);
            }
        } else {
            // Sequence number within window
            if (!node.isLeaf()) {
                return node.partialLengths!.getPartialLength(refSeq, clientId);
            } else {
                const segment = node;
                const removalInfo = toRemovalInfo(segment);
                if (this.options?.mergeTreeUseNewLengthCalculations === true) {
                    // normalize the seq numbers
                    // if the remove is local (UnassignedSequenceNumber) give it the highest possible
                    // seq for comparison, as it will get a seq higher than any other seq once sequenced
                    // if the segments seq is local (UnassignedSequenceNumber) give it the second highest
                    // possible seq, as the highest is reserved for the remove.
                    const seq = node.seq === UnassignedSequenceNumber
                        ? Number.MAX_SAFE_INTEGER - 1
                        : node.seq ?? 0;

                    if (removalInfo !== undefined) {
                        const removedSeq = removalInfo.removedSeq === UnassignedSequenceNumber
                            ? Number.MAX_SAFE_INTEGER
                            : removalInfo?.removedSeq;
                        if (removedSeq <= this.collabWindow.minSeq) {
                            return undefined;
                        }
                        if (removedSeq <= refSeq || removalInfo.removedClientIds.includes(clientId)) {
                            return 0;
                        }
                    }

                    return seq <= refSeq || segment.clientId === clientId ? segment.cachedLength : 0;
                }

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
                        return removalInfo.removedClientIds.includes(clientId) ? 0 : segment.cachedLength;
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
        clientId = this.collabWindow.clientId): number {
        const seg = refPos.getSegment();
        if (seg?.parent === undefined) {
            return DetachedReferencePosition;
        }
        if (refPos.isLeaf()) {
            return this.getPosition(refPos, refSeq, clientId);
        }
        if (refTypeIncludesFlag(refPos, ReferenceType.Transient)
            || seg.localRefs?.has(refPos)) {
                const offset = isRemoved(seg) ? 0 : refPos.getOffset();
                return offset + this.getPosition(seg, refSeq, clientId);
        }
        return DetachedReferencePosition;
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
    /**
     * Finds the nearest reference with ReferenceType.Tile to `startPos` in the direction dictated by `tilePrecedesPos`.
     *
     * @param startPos - Position at which to start the search
     * @param clientId - clientId dictating the perspective to search from
     * @param tileLabel - Label of the tile to search for
     * @param tilePrecedesPos - Whether the desired tile comes before (true) or after (false) `startPos`
     */
    public findTile(startPos: number, clientId: number, tileLabel: string, tilePrecedesPos = true) {
        const searchInfo: IReferenceSearchInfo = {
            mergeTree: this,
            tilePrecedesPos,
            tileLabel,
        };

        if (tilePrecedesPos) {
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
                const localRef = searchInfo.tile;
                pos = this.referencePositionToLocalPosition(localRef, UniversalSequenceNumber, clientId);
            }
            return { tile: searchInfo.tile, pos };
        }

        return undefined;
    }

    private search<TClientData>(
        pos: number, refSeq: number, clientId: number,
        actions: SegmentActions<TClientData> | undefined, clientData: TClientData): ISegment | undefined {
        return this.searchBlock(this.root, pos, 0, refSeq, clientId, actions, clientData);
    }

    private searchBlock<TClientData>(
        block: IMergeBlock,
        pos: number,
        segpos: number,
        refSeq: number,
        clientId: number,
        actions: SegmentActions<TClientData> | undefined,
        clientData: TClientData,
        localSeq?: number,
    ): ISegment | undefined {
        let _pos = pos;
        let _segpos = segpos;
        const children = block.children;
        if (actions && actions.pre) {
            actions.pre(block, _segpos, refSeq, clientId, undefined, undefined, clientData);
        }
        const contains = actions && actions.contains;
        for (let childIndex = 0; childIndex < block.childCount; childIndex++) {
            const child = children[childIndex];
            const len = this.nodeLength(child, refSeq, clientId, localSeq) ?? 0;
            if (
                (!contains && _pos < len)
                || (contains && contains(child, _pos, refSeq, clientId, undefined, undefined, clientData))
            ) {
                // Found entry containing pos
                if (!child.isLeaf()) {
                    return this.searchBlock(child, _pos, _segpos, refSeq, clientId, actions, clientData, localSeq);
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
        const pendingSegmentGroup = this.pendingSegments!.shift()?.data;
        const nodesToUpdate: IMergeBlock[] = [];
        let overwrite = false;
        if (pendingSegmentGroup !== undefined) {
            const deltaSegments: IMergeTreeSegmentDelta[] = [];
            pendingSegmentGroup.segments.map((pendingSegment) => {
                const overlappingRemove = !pendingSegment.ack(pendingSegmentGroup, opArgs);
                overwrite = overlappingRemove || overwrite;

                if (!overlappingRemove && opArgs.op.type === MergeTreeDeltaType.REMOVE) {
                    this.slideAckedRemovedSegmentReferences(pendingSegment);
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

    private addToPendingList(segment: ISegment, segmentGroup?: SegmentGroup, localSeq?: number,
        previousProps?: PropertySet) {
        let _segmentGroup = segmentGroup;
        if (_segmentGroup === undefined) {
            // TODO: review the cast
            _segmentGroup = { segments: [], localSeq } as SegmentGroup;
            if (previousProps) {
                _segmentGroup.previousProps = [];
            }
            this.pendingSegments!.push(_segmentGroup);
        }

        if ((!_segmentGroup.previousProps && previousProps) ||
            (_segmentGroup.previousProps && !previousProps)) {
            throw new Error("All segments in group should have previousProps or none");
        }
        if (previousProps) {
            _segmentGroup.previousProps!.push(previousProps);
        }

        segment.segmentGroups.enqueue(_segmentGroup);
        return _segmentGroup;
    }

    // TODO: error checking
    public getMarkerFromId(id: string): ISegment | undefined {
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
                        // Update root already updates all its children ordinals
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
        backwardExcursion(startSeg, (backSeg) => {
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
            forwardExcursion(node, checkSegmentIsLocal);
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
     * @param rollback - Whether this is for a local rollback and what kind
     */
    public annotateRange(
        start: number, end: number, props: PropertySet, combiningOp: ICombiningOp | undefined, refSeq: number,
        clientId: number, seq: number, opArgs: IMergeTreeDeltaOpArgs,
        rollback: PropertiesRollback = PropertiesRollback.None) {
        this.ensureIntervalBoundary(start, refSeq, clientId);
        this.ensureIntervalBoundary(end, refSeq, clientId);
        const deltaSegments: IMergeTreeSegmentDelta[] = [];
        const localSeq = seq === UnassignedSequenceNumber ? ++this.collabWindow.localSeq : undefined;
        let segmentGroup: SegmentGroup | undefined;

        const annotateSegment = (segment: ISegment) => {
            const propertyDeltas = segment.addProperties(props, combiningOp, seq, this.collabWindow, rollback);
            deltaSegments.push({ segment, propertyDeltas });
            if (this.collabWindow.collaborating) {
                if (seq === UnassignedSequenceNumber) {
                    segmentGroup = this.addToPendingList(segment, segmentGroup, localSeq,
                        propertyDeltas ? propertyDeltas : {});
                } else {
                    if (MergeTree.options.zamboniSegments) {
                        this.addToLRUSet(segment, seq);
                    }
                }
            }
            return true;
        };

        this.nodeMap(refSeq, clientId, annotateSegment, undefined, undefined, start, end);

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
    ): void {
        let _overwrite = overwrite;
        this.ensureIntervalBoundary(start, refSeq, clientId);
        this.ensureIntervalBoundary(end, refSeq, clientId);
        let segmentGroup: SegmentGroup;
        const removedSegments: IMergeTreeSegmentDelta[] = [];
        const localOverlapWithRefs: ISegment[] = [];
        const localSeq = seq === UnassignedSequenceNumber ? ++this.collabWindow.localSeq : undefined;
        const markRemoved = (segment: ISegment, pos: number, _start: number, _end: number) => {
            const existingRemovalInfo = toRemovalInfo(segment);
            if (existingRemovalInfo !== undefined) {
                _overwrite = true;
                if (existingRemovalInfo.removedSeq === UnassignedSequenceNumber) {
                    // we removed this locally, but someone else removed it first
                    // so put them at the head of the list
                    // The list isn't ordered, but we keep the first removal at the head
                    // for partialLengths bookkeeping purposes
                    existingRemovalInfo.removedClientIds.unshift(clientId);

                    existingRemovalInfo.removedSeq = seq;
                    if (segment.localRefs?.empty === false) {
                        localOverlapWithRefs.push(segment);
                    }
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
        this.nodeMap(refSeq, clientId, markRemoved, undefined, afterMarkRemoved, start, end);
        // these segments are already viewed as being removed locally and are not event-ed
        // so can slide non-StayOnRemove refs immediately
        localOverlapWithRefs.forEach(
            (s) => this.slideAckedRemovedSegmentReferences(s),
        );
        // opArgs == undefined => test code
        if (this.mergeTreeDeltaCallback && removedSegments.length > 0) {
            this.mergeTreeDeltaCallback(
                opArgs,
                {
                    operation: MergeTreeDeltaType.REMOVE,
                    deltaSegments: removedSegments,
                });
        }
        // these events are newly removed
        // so we slide after eventing in case the consumer wants to make reference
        // changes at remove time, like add a ref to track undo redo.
        if (!this.collabWindow.collaborating || clientId !== this.collabWindow.clientId) {
            removedSegments.forEach((rSeg) => {
                this.slideAckedRemovedSegmentReferences(rSeg.segment);
            });
        }

        if (this.collabWindow.collaborating && (seq !== UnassignedSequenceNumber)) {
            if (MergeTree.options.zamboniSegments) {
                this.zamboniSegments();
            }
        }
    }

    /**
     * Revert an unacked local op
     */
    public rollback(op: IMergeTreeDeltaOp, localOpMetadata: SegmentGroup) {
        if (op.type === MergeTreeDeltaType.REMOVE) {
            const pendingSegmentGroup = this.pendingSegments?.pop?.()?.data;
            if (pendingSegmentGroup === undefined || pendingSegmentGroup !== localOpMetadata) {
                throw new Error("Rollback op doesn't match last edit");
            }
            for (const segment of pendingSegmentGroup.segments) {
                const segmentSegmentGroup = segment.segmentGroups?.pop?.();
                assert(segmentSegmentGroup === pendingSegmentGroup, 0x3ee /* Unexpected segmentGroup in segment */);

                assert(segment.removedClientIds !== undefined
                    && segment.removedClientIds[0] === this.collabWindow.clientId,
                    0x39d /* Rollback segment removedClientId does not match local client */);
                segment.removedClientIds = undefined;
                segment.removedSeq = undefined;
                segment.localRemovedSeq = undefined;

                if (this.mergeTreeDeltaCallback) {
                    const insertOp = createInsertSegmentOp(this.findRollbackPosition(segment), segment);
                    this.mergeTreeDeltaCallback(
                        { op: insertOp },
                        {
                            operation: MergeTreeDeltaType.INSERT,
                            deltaSegments: [{ segment }],
                        });
                }

                for (let updateNode = segment.parent; updateNode !== undefined; updateNode = updateNode.parent) {
                    this.blockUpdateLength(updateNode, UnassignedSequenceNumber, this.collabWindow.clientId);
                }
            }
        } else if (op.type === MergeTreeDeltaType.INSERT || op.type === MergeTreeDeltaType.ANNOTATE) {
            const pendingSegmentGroup = this.pendingSegments?.pop?.()?.data;
            if (pendingSegmentGroup === undefined || pendingSegmentGroup !== localOpMetadata
                || (op.type === MergeTreeDeltaType.ANNOTATE && !pendingSegmentGroup.previousProps)) {
                throw new Error("Rollback op doesn't match last edit");
            }
            let i = 0;
            for (const segment of pendingSegmentGroup.segments) {
                const segmentSegmentGroup = segment.segmentGroups.pop?.();
                assert(segmentSegmentGroup === pendingSegmentGroup, 0x3ef /* Unexpected segmentGroup in segment */);

                const start = this.findRollbackPosition(segment);
                if (op.type === MergeTreeDeltaType.INSERT) {
                    const removeOp = createRemoveRangeOp(start, start + segment.cachedLength);
                    this.markRangeRemoved(
                        start,
                        start + segment.cachedLength,
                        UniversalSequenceNumber,
                        this.collabWindow.clientId,
                        UniversalSequenceNumber,
                        false,
                        { op: removeOp });
                } else /* op.type === MergeTreeDeltaType.ANNOTATE */ {
                    const props = pendingSegmentGroup.previousProps![i];
                    const rollbackType = (op.combiningOp && op.combiningOp.name === "rewrite") ?
                        PropertiesRollback.Rewrite : PropertiesRollback.Rollback;
                    const annotateOp = createAnnotateRangeOp(start, start + segment.cachedLength, props, undefined);
                    this.annotateRange(
                        start,
                        start + segment.cachedLength,
                        props,
                        undefined,
                        UniversalSequenceNumber,
                        this.collabWindow.clientId,
                        UniversalSequenceNumber,
                        { op: annotateOp },
                        rollbackType);
                    i++;
                }
            }
        } else {
            throw new Error("Unsupported op type for rollback");
        }
    }

    /**
     * Walk the segments up to the current segment and calculate its position
     */
    private findRollbackPosition(segment: ISegment) {
        let segmentPosition = 0;
        walkAllChildSegments(this.root, (seg) => {
            // If we've found the desired segment, terminate the walk and return 'segmentPosition'.
            if (seg === segment) {
                return false;
            }

            // If not removed, increase position
            if (seg.removedSeq === undefined) {
                segmentPosition += seg.cachedLength;
            }

            return true;
        });

        return segmentPosition;
    }

    private nodeUpdateLengthNewStructure(node: IMergeBlock, recur = false) {
        this.blockUpdate(node);
        if (this.collabWindow.collaborating) {
            this.localPartialsComputed = false;
            node.partialLengths = PartialSequenceLengths.combine(node, this.collabWindow, recur);
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
        segment: ISegment, offset: number, refType: ReferenceType, properties: PropertySet | undefined,
    ): LocalReferencePosition {
        if (
            isRemovedAndAcked(segment)
            && !refTypeIncludesFlag(refType, ReferenceType.SlideOnRemove | ReferenceType.Transient)
        ) {
            throw new UsageError(
                "Can only create SlideOnRemove or Transient local reference position on a removed segment",
            );
        }
        const localRefs = segment.localRefs ?? new LocalReferenceCollection(segment);
        segment.localRefs = localRefs;

        const segRef = localRefs.createLocalRef(offset, refType, properties);

        this.blockUpdatePathLengths(segment.parent, TreeMaintenanceSequenceNumber,
            LocalClientId);
        return segRef;
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
                addNodeReferences(
                    this,
                    child,
                    hierBlock.rightmostTiles,
                    hierBlock.leftmostTiles,
                    hierBlock.rangeStacks);
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
        this.localPartialsComputed = false;
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
                node.partialLengths.update(node, seq, clientId, this.collabWindow);
            } else {
                node.partialLengths = PartialSequenceLengths.combine(node, this.collabWindow);
            }
        }
    }

    public mapRange<TClientData>(
        handler: ISegmentAction<TClientData>,
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
        this.nodeMap(refSeq, clientId, handler, accum, undefined, start, end);
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
        refSeq: number,
        clientId: number,
        leaf: ISegmentAction<TClientData>,
        accum: TClientData,
        post?: BlockAction<TClientData>,
        start: number = 0,
        end?: number,
        localSeq?: number,
    ): void {
        const endPos = end ?? this.nodeLength(this.root, refSeq, clientId, localSeq) ?? 0;
        if (endPos === start) {
            return;
        }

        let pos = 0;

        depthFirstNodeWalk(
            this.root,
            this.root.children[0],
            (node) => {
                if (endPos <= pos) {
                    return NodeAction.Exit;
                }
                const len = this.nodeLength(node, refSeq, clientId, localSeq);
                if (len === undefined || len === 0) {
                    return NodeAction.Skip;
                }

                const nextPos = pos + len;
                // start is beyond the current node, so we can skip it
                if (start >= nextPos) {
                    pos = nextPos;
                    return NodeAction.Skip;
                }

                if (node.isLeaf()) {
                    if (leaf(
                        node,
                        pos,
                        refSeq,
                        clientId,
                        start - pos,
                        endPos - pos,
                        accum,
                    ) === false) {
                        return NodeAction.Exit;
                    }
                    pos = nextPos;
                }
            },
            undefined,
            post === undefined
                ? undefined
                : (block) => post(block, pos, refSeq, clientId, start - pos, endPos - pos, accum),
        );
    }
}
