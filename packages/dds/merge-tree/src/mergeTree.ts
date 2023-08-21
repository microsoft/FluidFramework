/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/consistent-type-assertions */

/* eslint-disable @typescript-eslint/prefer-optional-chain, no-bitwise */

import { assert } from "@fluidframework/common-utils";
import { UsageError } from "@fluidframework/container-utils";
import { IAttributionCollectionSerializer } from "./attributionCollection";
import { Comparer, Heap, List, ListNode, Stack } from "./collections";
import {
	LocalClientId,
	NonCollabClient,
	TreeMaintenanceSequenceNumber,
	UnassignedSequenceNumber,
	UniversalSequenceNumber,
} from "./constants";
import {
	anyLocalReferencePosition,
	filterLocalReferencePositions,
	LocalReferenceCollection,
	LocalReferencePosition,
	SlidingPreference,
} from "./localReference";
import {
	BaseSegment,
	BlockAction,
	CollaborationWindow,
	IHierBlock,
	IMergeBlock,
	IMergeLeaf,
	IMergeNode,
	IncrementalExecOp,
	IncrementalMapState,
	InsertContext,
	internedSpaces,
	IRemovalInfo,
	ISegment,
	ISegmentAction,
	ISegmentChanges,
	Marker,
	MaxNodesInBlock,
	MergeBlock,
	MinListener,
	reservedMarkerIdKey,
	SegmentActions,
	SegmentGroup,
	seqLTE,
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
import { createMap, extend, MapLike, PropertySet } from "./properties";
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
import type { TrackingGroup } from "./mergeTreeTracking";
import { zamboniSegments } from "./zamboni";
import { Client } from "./client";

/**
 * someday we may split tree leaves from segments, but for now they are the same
 * this is just a convenience type that makes it clear that we need something that is both a segment and a leaf node
 */
export type ISegmentLeaf = ISegment & IMergeLeaf;

const minListenerComparer: Comparer<MinListener> = {
	min: {
		minRequired: Number.MIN_VALUE,
		onMinGE: () => {
			assert(false, 0x048 /* "onMinGE()" */);
		},
	},
	compare: (a, b) => a.minRequired - b.minRequired,
};

function isRemoved(segment: ISegment): boolean {
	return toRemovalInfo(segment) !== undefined;
}

function isRemovedAndAcked(segment: ISegment): segment is ISegment & IRemovalInfo {
	const removalInfo = toRemovalInfo(segment);
	return removalInfo !== undefined && removalInfo.removedSeq !== UnassignedSequenceNumber;
}

function nodeTotalLength(mergeTree: MergeTree, node: IMergeNode): number | undefined {
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
	segment: ISegment,
	segpos: number,
	refSeq: number,
	clientId: number,
	start: number | undefined,
	end: number | undefined,
	searchInfo: IMarkerSearchRangeInfo,
) {
	if (Marker.is(segment)) {
		if (segment.refType & (ReferenceType.NestBegin | ReferenceType.NestEnd)) {
			applyLeafRangeMarker(segment, searchInfo);
		}
	}
	return false;
}

function rangeShift(
	node: IMergeNode,
	segpos: number,
	refSeq: number,
	clientId: number,
	offset: number | undefined,
	end: number | undefined,
	searchInfo: IMarkerSearchRangeInfo,
) {
	if (node.isLeaf()) {
		const seg = node;
		if ((searchInfo.mergeTree.localNetLength(seg) ?? 0) > 0 && Marker.is(seg)) {
			if (seg.refType & (ReferenceType.NestBegin | ReferenceType.NestEnd)) {
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
	searchInfo: IReferenceSearchInfo,
) {
	if (Marker.is(segment)) {
		if (refHasTileLabel(segment, searchInfo.tileLabel)) {
			searchInfo.tile = segment;
		}
	}
	return false;
}

function tileShift(
	node: IMergeNode,
	segpos: number,
	refSeq: number,
	clientId: number,
	offset: number | undefined,
	end: number | undefined,
	searchInfo: IReferenceSearchInfo,
) {
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
		if (top && refTypeIncludesFlag(top, ReferenceType.NestBegin)) {
			stack.pop();
		} else {
			stack.push(delta);
		}
		return false;
	}
}

/**
 * Reference types which have special bookkeeping within the merge tree (in {@link HierMergeBlock}s)
 * and thus require updating path lengths when changed.
 *
 * TODO:AB#4069: This functionality is old and not well-tested. It's not clear how much of it is needed--
 * we should better test the parts that are necessary and remove the rest.
 */
const hierRefTypes = ReferenceType.NestBegin | ReferenceType.NestEnd | ReferenceType.Tile;

function addNodeReferences(
	mergeTree: MergeTree,
	node: IMergeNode,
	rightmostTiles: MapLike<ReferencePosition>,
	leftmostTiles: MapLike<ReferencePosition>,
	rangeStacks: RangeStackMap,
) {
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
				if (
					baseSegment.localRefs &&
					baseSegment.localRefs.hierRefCount !== undefined &&
					baseSegment.localRefs.hierRefCount > 0
				) {
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
 * @internal
 */
export interface ClientSeq {
	refSeq: number;
	clientId: string;
}

export interface IMergeTreeOptions {
	catchUpBlobName?: string;
	/**
	 * Whether to enable the length calculations implemented in
	 * https://github.com/microsoft/FluidFramework/pull/11678
	 *
	 * These calculations resolve bugginess that causes eventual consistency issues in certain conflicting
	 * removal cases, but regress some index-based undo-redo implementations. The suggested path for
	 * consumers is to switch to LocalReference-based undo-redo implementation (see
	 * https://github.com/microsoft/FluidFramework/pull/11899) and enable this feature flag.
	 *
	 * default: false
	 */
	mergeTreeUseNewLengthCalculations?: boolean;
	mergeTreeSnapshotChunkSize?: number;
	/**
	 * Whether to use the SnapshotV1 format over SnapshotLegacy.
	 *
	 * SnapshotV1 stores a view of the merge-tree at the current sequence number, preserving merge metadata
	 * (e.g. clientId, seq, etc.) only for segment changes within the collab window.
	 *
	 * SnapshotLegacy stores a view of the merge-tree at the minimum sequence number along with the ops between
	 * the minimum sequence number and the current sequence number.
	 *
	 * Both formats merge segments where possible (see {@link ISegment.canAppend})
	 *
	 * default: false
	 *
	 * @remarks
	 * Despite the "legacy"/"V1" naming, both formats are actively used at the time of writing. SharedString
	 * uses legacy and Matrix uses V1.
	 */
	newMergeTreeSnapshotFormat?: boolean;

	/**
	 * Options related to attribution
	 */
	attribution?: IMergeTreeAttributionOptions;
}

export interface IMergeTreeAttributionOptions {
	/**
	 * If enabled, segments will store attribution keys which can be used with the runtime to determine
	 * attribution information (i.e. who created the content and when it was created).
	 *
	 * This flag only applied to new documents: if a snapshot is loaded, whether or not attribution keys
	 * are tracked is determined by the presence of existing attribution keys in the snapshot.
	 *
	 * default: false
	 * @alpha
	 */
	track?: boolean;

	/**
	 * Provides a policy for how to track attribution data on segments.
	 * This option must be provided if either:
	 * - `track` is set to true
	 * - a document containing existing attribution information is loaded
	 * @alpha
	 */
	policyFactory?: () => AttributionPolicy;
}

/**
 * Implements policy dictating which kinds of operations should be attributed and how.
 * @alpha
 * @sealed
 */
export interface AttributionPolicy {
	/**
	 * Enables tracking attribution information for operations on this merge-tree.
	 * This function is expected to subscribe to appropriate change events in order
	 * to manage any attribution data it stores on segments.
	 *
	 * This must be done in an eventually consistent fashion.
	 * @internal
	 */
	attach: (client: Client) => void;
	/**
	 * Disables tracking attribution information on segments.
	 * @internal
	 */
	detach: () => void;
	/**
	 * @internal
	 */
	isAttached: boolean;
	/**
	 * Serializer capable of serializing any attribution data this policy stores on segments.
	 * @internal
	 */
	serializer: IAttributionCollectionSerializer;
}

/**
 * @internal
 */
export const clientSeqComparer: Comparer<ClientSeq> = {
	min: { refSeq: -1, clientId: "" },
	compare: (a, b) => a.refSeq - b.refSeq,
};

/**
 * @internal
 */
export interface LRUSegment {
	segment?: ISegmentLeaf;
	maxSeq: number;
}

export interface IRootMergeBlock extends IMergeBlock {
	mergeTree?: MergeTree;
}

export function findRootMergeBlock(
	segmentOrNode: IMergeNode | undefined,
): IRootMergeBlock | undefined {
	if (segmentOrNode === undefined) {
		return undefined;
	}
	let maybeRoot: IRootMergeBlock | undefined = segmentOrNode.isLeaf()
		? segmentOrNode.parent
		: segmentOrNode;
	while (maybeRoot?.parent !== undefined) {
		maybeRoot = maybeRoot.parent;
	}

	return maybeRoot?.mergeTree !== undefined ? maybeRoot : undefined;
}

/**
 * @param segment - The segment to slide from.
 * @param cache - Optional cache mapping segments to their sliding destinations.
 * Excursions will be avoided for segments in the cache, and the cache will be populated with
 * entries for all segments visited during excursion.
 * This can reduce the number of times the tree needs to be scanned if a range containing many
 * SlideOnRemove references is removed.
 * @returns The segment a SlideOnRemove reference should slide to, or undefined if there is no
 * valid segment (i.e. the tree is empty).
 * @internal
 */
function getSlideToSegment(
	segment: ISegment | undefined,
	slidingPreference: SlidingPreference = SlidingPreference.FORWARD,
	cache?: Map<ISegment, { seg?: ISegment }>,
): ISegment | undefined {
	if (!segment || !isRemovedAndAcked(segment)) {
		return segment;
	}

	const cachedSegment = cache?.get(segment);
	if (cachedSegment !== undefined) {
		return cachedSegment.seg;
	}
	const result: { seg?: ISegment } = {};
	cache?.set(segment, result);
	const goFurtherToFindSlideToSegment = (seg) => {
		if (seg.seq !== UnassignedSequenceNumber && !isRemovedAndAcked(seg)) {
			result.seg = seg;
			return false;
		}
		if (cache !== undefined && seg.removedSeq === segment.removedSeq) {
			cache.set(seg, result);
		}
		return true;
	};

	if (slidingPreference === SlidingPreference.BACKWARD) {
		backwardExcursion(segment, goFurtherToFindSlideToSegment);
	} else {
		forwardExcursion(segment, goFurtherToFindSlideToSegment);
	}
	if (result.seg !== undefined) {
		return result.seg;
	}

	if (slidingPreference === SlidingPreference.BACKWARD) {
		forwardExcursion(segment, goFurtherToFindSlideToSegment);
	} else {
		backwardExcursion(segment, goFurtherToFindSlideToSegment);
	}

	return result.seg;
}

/**
 * Returns the position to slide a reference to if a slide is required.
 * @param segoff - The segment and offset to slide from
 * @returns - segment and offset to slide the reference to
 * @internal
 */
export function getSlideToSegoff(
	segoff: { segment: ISegment | undefined; offset: number | undefined },
	slidingPreference: SlidingPreference = SlidingPreference.FORWARD,
) {
	if (segoff.segment === undefined) {
		return segoff;
	}
	const segment = getSlideToSegment(segoff.segment, slidingPreference);
	if (segment === segoff.segment) {
		return segoff;
	}
	const offset =
		segment && segment.ordinal < segoff.segment.ordinal ? segment.cachedLength - 1 : 0;
	return {
		segment,
		offset,
	};
}

/**
 * @internal
 */
export class MergeTree {
	public static readonly options = {
		incrementalUpdate: true,
		insertAfterRemovedSegs: true,
		zamboniSegments: true,
	};

	private static readonly theUnfinishedNode = <IMergeBlock>{ childCount: -1 };

	public readonly collabWindow = new CollaborationWindow();

	public readonly pendingSegments = new List<SegmentGroup>();
	public readonly segmentsToScour = new Heap<LRUSegment>([], LRUSegmentComparer);

	public readonly attributionPolicy: AttributionPolicy | undefined;

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

	public constructor(public options?: IMergeTreeOptions) {
		this._root = this.makeBlock(0);
		this._root.mergeTree = this;
		this.attributionPolicy = options?.attribution?.policyFactory?.();
	}

	private _root: IRootMergeBlock;
	public get root(): IRootMergeBlock {
		return this._root;
	}

	public set root(value) {
		this._root = value;
		value.mergeTree = this;
	}

	public makeBlock(childCount: number) {
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
				const segment = child.clone();
				bBlock.assignChild(segment, i);
				segments?.push(segment);
			} else {
				bBlock.assignChild(this.blockClone(child, segments), i);
			}
		}
		this.nodeUpdateLengthNewStructure(bBlock);
		this.nodeUpdateOrdinals(bBlock);
		return bBlock;
	}

	/**
	 * Compute the net length of this segment from a local perspective.
	 * @param segment - Segment whose length to find
	 * @param localSeq - localSeq at which to find the length of this segment. If not provided,
	 * default is to consider the local client's current perspective. Only local sequence
	 * numbers corresponding to un-acked operations give valid results.
	 */
	public localNetLength(
		segment: ISegment,
		refSeq?: number,
		localSeq?: number,
	): number | undefined {
		const removalInfo = toRemovalInfo(segment);
		if (localSeq === undefined) {
			if (removalInfo !== undefined) {
				if (this.options?.mergeTreeUseNewLengthCalculations !== false) {
					if (!seqLTE(removalInfo.removedSeq, this.collabWindow.minSeq)) {
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
			if (
				seq > refSeq ||
				(removedSeq !== undefined &&
					removedSeq !== UnassignedSequenceNumber &&
					removedSeq <= refSeq) ||
				(localRemovedSeq !== undefined && localRemovedSeq <= localSeq)
			) {
				return 0;
			}
			return segment.cachedLength;
		} else {
			assert(
				segment.localSeq !== undefined,
				0x39a /* unacked segment with undefined localSeq */,
			);
			// inserted locally, still un-acked
			if (
				segment.localSeq > localSeq ||
				(localRemovedSeq !== undefined && localRemovedSeq <= localSeq)
			) {
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

	public reloadFromSegments(segments: ISegment[]) {
		// This code assumes that a later call to `startCollaboration()` will initialize partial lengths.
		assert(
			!this.collabWindow.collaborating,
			0x049 /* "Trying to reload from segments while collaborating!" */,
		);

		const maxChildren = MaxNodesInBlock - 1;

		// Starting with the leaf segments, recursively builds the B-Tree layer by layer from the bottom up.
		const buildMergeBlock = (nodes: IMergeNode[]) => {
			const blockCount = Math.ceil(nodes.length / maxChildren); // Compute # blocks require for this level of B-Tree
			const blocks: IMergeBlock[] = new Array(blockCount); // Pre-alloc array to collect nodes

			// For each block in this level of the B-Tree...
			for (
				let nodeIndex = 0, blockIndex = 0; // Start with the first block and first node
				blockIndex < blockCount; // If we have more blocks, we also have more nodes to insert
				blockIndex++ // Advance to next block in this layer.
			) {
				const block = (blocks[blockIndex] = this.makeBlock(0));

				// For each child of the current block, insert a node (while we have nodes left)
				// and update the block's info.
				for (
					let childIndex = 0;
					childIndex < maxChildren && nodeIndex < nodes.length; // While we still have children & nodes left
					childIndex++, nodeIndex++ // Advance to next child & node
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
			return blocks.length === 1 // If there is only one block at this layer...
				? blocks[0] // ...then we're done.  Return the root.
				: buildMergeBlock(blocks); // ...otherwise recursively build the next layer above blocks.
		};
		if (segments.length > 0) {
			this.root = buildMergeBlock(segments);
			this.nodeUpdateOrdinals(this.root);
		} else {
			this.root = this.makeBlock(0);
		}
	}

	// For now assume min starts at zero
	public startCollaboration(localClientId: number, minSeq: number, currentSeq: number) {
		this.collabWindow.clientId = localClientId;
		this.collabWindow.minSeq = minSeq;
		this.collabWindow.collaborating = true;
		this.collabWindow.currentSeq = currentSeq;
		this.nodeUpdateLengthNewStructure(this.root, true);
	}

	private addToLRUSet(leaf: IMergeLeaf, seq: number) {
		// If the parent node has not yet been marked for scour (i.e., needsScour is not false or undefined),
		// add the segment and mark the mark the node now.

		// TODO: 'seq' may be less than the current sequence number when inserting pre-ACKed
		//       segments from a snapshot.  We currently skip these for now.
		if (leaf.parent!.needsScour !== true && seq > this.collabWindow.currentSeq) {
			leaf.parent!.needsScour = true;
			this.segmentsToScour.add({ segment: leaf, maxSeq: seq });
		}
	}

	public getCollabWindow() {
		return this.collabWindow;
	}

	public getLength(refSeq: number, clientId: number): number {
		return this.blockLength(this.root, refSeq, clientId);
	}

	/**
	 * Returns the current length of the MergeTree for the local client.
	 */
	public get length() {
		return this.root.cachedLength;
	}

	public getPosition(node: IMergeNode, refSeq: number, clientId: number, localSeq?: number) {
		let totalOffset = 0;
		let parent = node.parent;
		let prevParent: IMergeBlock | undefined;
		while (parent) {
			const children = parent.children;
			for (let childIndex = 0; childIndex < parent.childCount; childIndex++) {
				const child = children[childIndex];
				if ((prevParent && child === prevParent) || child === node) {
					break;
				}
				totalOffset += this.nodeLength(child, refSeq, clientId, localSeq) ?? 0;
			}
			prevParent = parent;
			parent = parent.parent;
		}
		return totalOffset;
	}

	public getContainingSegment<T extends ISegment>(
		pos: number,
		refSeq: number,
		clientId: number,
		localSeq?: number,
	) {
		assert(
			localSeq === undefined || clientId === this.collabWindow.clientId,
			0x39b /* localSeq provided for non-local client */,
		);
		let segment: T | undefined;
		let offset: number | undefined;

		const leaf = (
			leafSeg: ISegment,
			segpos: number,
			_refSeq: number,
			_clientId: number,
			start: number,
		) => {
			segment = leafSeg as T;
			offset = start;
			return false;
		};
		this.nodeMap(refSeq, clientId, leaf, undefined, undefined, pos, pos + 1, localSeq);
		return { segment, offset };
	}

	/**
	 * Slides or removes references from the provided list of segments.
	 *
	 * The order of the references is preserved for references of the same sliding
	 * preference. Relative order between references that slide backward and those
	 * that slide forward is not preserved, even in the case when they slide to
	 * the same segment.
	 * @remarks -
	 * 1. Preserving the order of the references is a useful property for reference-based undo/redo
	 * (see revertibles.ts).
	 * 2. For use cases which necessitate eventual consistency across clients,
	 * this method should only be called with segments for which the current client sequence number is
	 * max(remove segment sequence number, add reference sequence number).
	 * See `packages\dds\merge-tree\REFERENCEPOSITIONS.md`
	 * @param segments - An array of (not necessarily contiguous) segments with increasing ordinals.
	 */
	private slideAckedRemovedSegmentReferences(segments: ISegment[]) {
		// References are slid in groups to preserve their order.
		let currentSlideGroup: LocalReferenceCollection[] = [];

		let currentForwardSlideDestination: ISegment | undefined;
		let currentForwardSlideIsForward: boolean | undefined;
		const forwardPred = (ref: LocalReferencePosition) =>
			ref.slidingPreference !== SlidingPreference.BACKWARD;

		let currentBackwardSlideDestination: ISegment | undefined;
		let currentBackwardSlideIsForward: boolean | undefined;
		const backwardPred = (ref: LocalReferencePosition) =>
			ref.slidingPreference === SlidingPreference.BACKWARD;

		const slideGroup = (
			currentSlideDestination: ISegmentLeaf | undefined,
			currentSlideIsForward: boolean | undefined,
			pred: (ref: LocalReferencePosition) => boolean,
		) => {
			if (currentSlideIsForward === undefined) {
				return;
			}

			if (currentSlideDestination !== undefined) {
				const localRefs = (currentSlideDestination.localRefs ??=
					new LocalReferenceCollection(currentSlideDestination));
				if (currentSlideIsForward) {
					localRefs.addBeforeTombstones(
						...currentSlideGroup.map((collection) =>
							filterLocalReferencePositions(collection, pred),
						),
					);
				} else {
					localRefs.addAfterTombstones(
						...currentSlideGroup.map((collection) =>
							filterLocalReferencePositions(collection, pred),
						),
					);
				}
			} else {
				for (const collection of currentSlideGroup) {
					for (const ref of collection) {
						if (!refTypeIncludesFlag(ref, ReferenceType.StayOnRemove)) {
							ref.callbacks?.beforeSlide?.(ref);
							collection.removeLocalRef(ref);
							ref.callbacks?.afterSlide?.(ref);
						}
					}
				}
			}

			// TODO:AB#4069: This update might be avoidable by checking if the old segment
			// had hierarchical refs before sliding using `segment.localRefs?.hierRefCount`.
			if (currentSlideDestination) {
				this.blockUpdatePathLengths(
					currentSlideDestination.parent,
					TreeMaintenanceSequenceNumber,
					LocalClientId,
				);
			}
		};

		const trySlideSegment = (
			segment: ISegment,
			currentSlideDestination: ISegment | undefined,
			currentSlideIsForward: boolean | undefined,
			pred: (ref: LocalReferencePosition) => boolean,
			slidingPreference: SlidingPreference,
			reassign: (
				localRefs: LocalReferenceCollection,
				slideToSegment: ISegment | undefined,
				slideIsForward: boolean,
			) => void,
		) => {
			// avoid sliding logic if this segment doesn't have any references
			// with the given sliding preference
			if (!segment.localRefs || !anyLocalReferencePosition(segment.localRefs, pred)) {
				return;
			}

			const slideToSegment = getSlideToSegment(segment, slidingPreference, segmentCache);
			const slideIsForward =
				slideToSegment === undefined ? false : slideToSegment.ordinal > segment.ordinal;

			if (
				slideToSegment !== currentSlideDestination ||
				slideIsForward !== currentSlideIsForward
			) {
				slideGroup(currentSlideDestination, currentSlideIsForward, pred);
				reassign(segment.localRefs, slideToSegment, slideIsForward);
			} else {
				currentSlideGroup.push(segment.localRefs);
			}
		};

		const segmentCache = new Map<ISegment, { seg?: ISegment }>();
		for (const segment of segments) {
			assert(
				isRemovedAndAcked(segment),
				0x2f1 /* slideReferences from a segment which has not been removed and acked */,
			);
			if (segment.localRefs === undefined || segment.localRefs.empty) {
				continue;
			}

			trySlideSegment(
				segment,
				currentForwardSlideDestination,
				currentForwardSlideIsForward,
				forwardPred,
				SlidingPreference.FORWARD,
				(localRefs, slideToSegment, slideIsForward) => {
					currentSlideGroup = [localRefs];
					currentForwardSlideDestination = slideToSegment;
					currentForwardSlideIsForward = slideIsForward;
				},
			);

			trySlideSegment(
				segment,
				currentBackwardSlideDestination,
				currentBackwardSlideIsForward,
				backwardPred,
				SlidingPreference.BACKWARD,
				(localRefs, slideToSegment, slideIsForward) => {
					currentSlideGroup = [localRefs];
					currentBackwardSlideDestination = slideToSegment;
					currentBackwardSlideIsForward = slideIsForward;
				},
			);
		}

		slideGroup(currentForwardSlideDestination, currentForwardSlideIsForward, forwardPred);
		slideGroup(currentBackwardSlideDestination, currentBackwardSlideIsForward, backwardPred);
	}

	private blockLength(node: IMergeBlock, refSeq: number, clientId: number): number {
		return this.collabWindow.collaborating && clientId !== this.collabWindow.clientId
			? node.partialLengths!.getPartialLength(refSeq, clientId)
			: node.cachedLength ?? 0;
	}

	/**
	 * Compute local partial length information
	 *
	 * Public only for use by internal tests
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

	private nodeLength(
		node: IMergeNode,
		refSeq: number,
		clientId: number,
		localSeq?: number,
	): number | undefined {
		if (!this.collabWindow.collaborating || this.collabWindow.clientId === clientId) {
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
				if (this.options?.mergeTreeUseNewLengthCalculations !== false) {
					if (removalInfo !== undefined) {
						if (seqLTE(removalInfo.removedSeq, this.collabWindow.minSeq)) {
							return undefined;
						}
						if (
							seqLTE(removalInfo.removedSeq, refSeq) ||
							removalInfo.removedClientIds.includes(clientId)
						) {
							return 0;
						}
					}

					return seqLTE(node.seq ?? 0, refSeq) || segment.clientId === clientId
						? segment.cachedLength
						: 0;
				}

				if (
					removalInfo !== undefined &&
					removalInfo.removedSeq !== UnassignedSequenceNumber &&
					removalInfo.removedSeq <= refSeq
				) {
					// this segment is a tombstone eligible for zamboni
					// so should never be considered, as it may not exist
					// on other clients
					return undefined;
				}
				if (
					segment.clientId === clientId ||
					(segment.seq !== UnassignedSequenceNumber && segment.seq! <= refSeq)
				) {
					// Segment happened by reference sequence number or segment from requesting client
					if (removalInfo !== undefined) {
						return removalInfo.removedClientIds.includes(clientId)
							? 0
							: segment.cachedLength;
					} else {
						return segment.cachedLength;
					}
				} else {
					// the segment was inserted and removed before the
					// this context, so it will never exist for this
					// context
					if (
						removalInfo !== undefined &&
						removalInfo.removedSeq !== UnassignedSequenceNumber
					) {
						return undefined;
					}
					// Segment invisible to client at reference sequence number/branch id/client id of op
					return 0;
				}
			}
		}
	}

	public addMinSeqListener(minRequired: number, onMinGE: (minSeq: number) => void) {
		this.minSeqListeners ??= new Heap<MinListener>([], minListenerComparer);
		this.minSeqListeners.add({ minRequired, onMinGE });
	}

	private notifyMinSeqListeners() {
		if (this.minSeqListeners) {
			while (
				this.minSeqListeners.count() > 0 &&
				this.minSeqListeners.peek().minRequired <= this.collabWindow.minSeq
			) {
				const minListener = this.minSeqListeners.get()!;
				minListener.onMinGE(this.collabWindow.minSeq);
			}
		}
	}

	public setMinSeq(minSeq: number) {
		assert(
			minSeq <= this.collabWindow.currentSeq,
			0x04e /* "Trying to set minSeq above currentSeq of collab window!" */,
		);

		// Only move forward
		assert(
			this.collabWindow.minSeq <= minSeq,
			0x04f /* "minSeq of collab window > target minSeq!" */,
		);

		if (minSeq > this.collabWindow.minSeq) {
			this.collabWindow.minSeq = minSeq;
			if (MergeTree.options.zamboniSegments) {
				zamboniSegments(this);
			}
			this.notifyMinSeqListeners();
		}
	}

	public referencePositionToLocalPosition(
		refPos: ReferencePosition,
		refSeq = this.collabWindow.currentSeq,
		clientId = this.collabWindow.clientId,
	): number {
		const seg: ISegmentLeaf | undefined = refPos.getSegment();
		if (seg?.parent === undefined) {
			return DetachedReferencePosition;
		}
		if (refPos.isLeaf()) {
			return this.getPosition(refPos, refSeq, clientId);
		}
		if (refTypeIncludesFlag(refPos, ReferenceType.Transient) || seg.localRefs?.has(refPos)) {
			const offset = isRemoved(seg) ? 0 : refPos.getOffset();
			return offset + this.getPosition(seg, refSeq, clientId);
		}
		return DetachedReferencePosition;
	}

	/**
	 * @deprecated - this functionality is no longer supported and will be removed
	 */
	public getStackContext(startPos: number, clientId: number, rangeLabels: string[]) {
		const searchInfo: IMarkerSearchRangeInfo = {
			mergeTree: this,
			stacks: createMap<Stack<Marker>>(),
			rangeLabels,
		};

		this.search(
			startPos,
			UniversalSequenceNumber,
			clientId,
			{ leaf: recordRangeLeaf, shift: rangeShift },
			searchInfo,
		);
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
			this.search(
				startPos,
				UniversalSequenceNumber,
				clientId,
				{ leaf: recordTileStart, shift: tileShift },
				searchInfo,
			);
		} else {
			this.backwardSearch(
				startPos,
				UniversalSequenceNumber,
				clientId,
				{ leaf: recordTileStart, shift: tileShift },
				searchInfo,
			);
		}

		if (searchInfo.tile) {
			let pos: number;
			if (searchInfo.tile.isLeaf()) {
				const marker = <Marker>searchInfo.tile;
				pos = this.getPosition(marker, UniversalSequenceNumber, clientId);
			} else {
				const localRef = searchInfo.tile;
				pos = this.referencePositionToLocalPosition(
					localRef,
					UniversalSequenceNumber,
					clientId,
				);
			}
			return { tile: searchInfo.tile, pos };
		}

		return undefined;
	}

	private search<TClientData>(
		pos: number,
		refSeq: number,
		clientId: number,
		actions: SegmentActions<TClientData> | undefined,
		clientData: TClientData,
	): ISegment | undefined {
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
		const { pre, post, contains, leaf, shift } = actions ?? {};
		let _pos = pos;
		let _segpos = segpos;
		const children = block.children;
		pre?.(block, _segpos, refSeq, clientId, undefined, undefined, clientData);
		for (let childIndex = 0; childIndex < block.childCount; childIndex++) {
			const child = children[childIndex];
			const len = this.nodeLength(child, refSeq, clientId, localSeq) ?? 0;
			if (
				(!contains && _pos < len) ||
				contains?.(child, _pos, refSeq, clientId, undefined, undefined, clientData)
			) {
				// Found entry containing pos
				if (!child.isLeaf()) {
					return this.searchBlock(
						child,
						_pos,
						_segpos,
						refSeq,
						clientId,
						actions,
						clientData,
						localSeq,
					);
				} else {
					leaf?.(child, _segpos, refSeq, clientId, _pos, -1, clientData);
					return child;
				}
			} else {
				shift?.(child, _segpos, refSeq, clientId, _pos, undefined, clientData);
				_pos -= len;
				_segpos += len;
			}
		}
		post?.(block, _segpos, refSeq, clientId, undefined, undefined, clientData);
	}

	private backwardSearch<TClientData>(
		pos: number,
		refSeq: number,
		clientId: number,
		actions: SegmentActions<TClientData> | undefined,
		clientData: TClientData,
	): ISegment | undefined {
		const len = this.getLength(refSeq, clientId);
		if (pos > len) {
			return undefined;
		}
		return this.backwardSearchBlock(this.root, pos, len, refSeq, clientId, actions, clientData);
	}

	private backwardSearchBlock<TClientData>(
		block: IMergeBlock,
		pos: number,
		segEnd: number,
		refSeq: number,
		clientId: number,
		actions: SegmentActions<TClientData> | undefined,
		clientData: TClientData,
	): ISegment | undefined {
		const { pre, post, contains, leaf, shift } = actions ?? {};
		let _segEnd = segEnd;
		const children = block.children;
		pre?.(block, _segEnd, refSeq, clientId, undefined, undefined, clientData);
		for (let childIndex = block.childCount - 1; childIndex >= 0; childIndex--) {
			const child = children[childIndex];
			const len = this.nodeLength(child, refSeq, clientId) ?? 0;
			const segpos = _segEnd - len;
			if (
				(!contains && pos >= segpos) ||
				contains?.(child, pos, refSeq, clientId, undefined, undefined, clientData)
			) {
				// Found entry containing pos
				if (!child.isLeaf()) {
					return this.backwardSearchBlock(
						child,
						pos,
						_segEnd,
						refSeq,
						clientId,
						actions,
						clientData,
					);
				} else {
					leaf?.(child, segpos, refSeq, clientId, pos, -1, clientData);
					return child;
				}
			} else {
				shift?.(child, segpos, refSeq, clientId, pos, undefined, clientData);
				_segEnd = segpos;
			}
		}
		post?.(block, _segEnd, refSeq, clientId, undefined, undefined, clientData);
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
		const pendingSegmentGroup = this.pendingSegments.shift()?.data;
		const nodesToUpdate: IMergeBlock[] = [];
		let overwrite = false;
		if (pendingSegmentGroup !== undefined) {
			const deltaSegments: IMergeTreeSegmentDelta[] = [];
			const overlappingRemoves: boolean[] = [];
			pendingSegmentGroup.segments.map((pendingSegment: ISegmentLeaf) => {
				const overlappingRemove = !pendingSegment.ack(pendingSegmentGroup, opArgs);
				overwrite = overlappingRemove || overwrite;
				overlappingRemoves.push(overlappingRemove);
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

			// Perform slides after all segments have been acked, so that
			// positions after slide are final
			if (opArgs.op.type === MergeTreeDeltaType.REMOVE) {
				this.slideAckedRemovedSegmentReferences(pendingSegmentGroup.segments);
			}

			this.mergeTreeMaintenanceCallback?.(
				{
					deltaSegments,
					operation: MergeTreeMaintenanceType.ACKNOWLEDGED,
				},
				opArgs,
			);
			const clientId = this.collabWindow.clientId;
			for (const node of nodesToUpdate) {
				this.blockUpdatePathLengths(node, seq, clientId, overwrite);
			}
		}
		if (MergeTree.options.zamboniSegments) {
			zamboniSegments(this);
		}
	}

	private addToPendingList(
		segment: ISegment,
		segmentGroup?: SegmentGroup,
		localSeq?: number,
		previousProps?: PropertySet,
	) {
		let _segmentGroup = segmentGroup;
		if (_segmentGroup === undefined) {
			// TODO: review the cast
			_segmentGroup = {
				segments: [],
				localSeq,
				refSeq: this.collabWindow.currentSeq,
			} as SegmentGroup;
			if (previousProps) {
				_segmentGroup.previousProps = [];
			}
			this.pendingSegments.push(_segmentGroup);
		}

		if (
			(!_segmentGroup.previousProps && previousProps) ||
			(_segmentGroup.previousProps && !previousProps)
		) {
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
		clientId = this.collabWindow.clientId,
	) {
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

		const localSeq =
			seq === UnassignedSequenceNumber ? ++this.collabWindow.localSeq : undefined;

		this.blockInsert(pos, refSeq, clientId, seq, localSeq, segments);

		// opArgs == undefined => loading snapshot or test code
		if (opArgs !== undefined) {
			this.mergeTreeDeltaCallback?.(opArgs, {
				operation: MergeTreeDeltaType.INSERT,
				deltaSegments: segments.map((segment) => ({ segment })),
			});
		}

		if (
			this.collabWindow.collaborating &&
			MergeTree.options.zamboniSegments &&
			seq !== UnassignedSequenceNumber
		) {
			zamboniSegments(this);
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
		remoteClientId: number,
	): number | undefined {
		if (remoteClientRefSeq < this.collabWindow.minSeq) {
			return undefined;
		}

		const segmentInfo = this.getContainingSegment(
			remoteClientPosition,
			remoteClientRefSeq,
			remoteClientId,
		);

		const { currentSeq, clientId } = this.collabWindow;

		if (segmentInfo && segmentInfo.segment) {
			const segmentPosition = this.getPosition(segmentInfo.segment, currentSeq, clientId);
			return segmentPosition + segmentInfo.offset!;
		} else {
			if (remoteClientPosition === this.getLength(remoteClientRefSeq, remoteClientId)) {
				return this.getLength(currentSeq, clientId);
			}
		}
	}

	private blockInsert<T extends ISegmentLeaf>(
		pos: number,
		refSeq: number,
		clientId: number,
		seq: number,
		localSeq: number | undefined,
		newSegments: T[],
	) {
		const continueFrom = (node: IMergeBlock) => {
			let siblingExists = false;
			forwardExcursion(node, () => {
				siblingExists = true;
				return false;
			});
			return siblingExists;
		};

		let segmentGroup: SegmentGroup;
		const saveIfLocal = (locSegment: ISegment) => {
			// Save segment so can assign sequence number when acked by server
			if (this.collabWindow.collaborating) {
				if (
					locSegment.seq === UnassignedSequenceNumber &&
					clientId === this.collabWindow.clientId
				) {
					segmentGroup = this.addToPendingList(locSegment, segmentGroup, localSeq);
				}
				// LocSegment.seq === 0 when coming from SharedSegmentSequence.loadBody()
				// In all other cases this has to be true (checked by addToLRUSet):
				// locSegment.seq > this.collabWindow.currentSeq
				else if (
					locSegment.seq! > this.collabWindow.minSeq &&
					MergeTree.options.zamboniSegments
				) {
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

				const splitNode = this.insertingWalk(this.root, insertPos, refSeq, clientId, seq, {
					leaf: onLeaf,
					candidateSegment: newSegment,
					continuePredicate: continueFrom,
				});

				if (newSegment.parent === undefined) {
					throw new UsageError("MergeTree insert failed", {
						currentSeq: this.collabWindow.currentSeq,
						minSeq: this.collabWindow.minSeq,
						segSeq: newSegment.seq,
					});
				}

				this.updateRoot(splitNode);
				saveIfLocal(newSegment);

				insertPos += newSegment.cachedLength;
			}
		}
	}

	private readonly splitLeafSegment = (
		segment: ISegment | undefined,
		pos: number,
	): ISegmentChanges => {
		if (!(pos > 0 && segment)) {
			return {};
		}

		const next = segment.splitAt(pos)!;
		this.mergeTreeMaintenanceCallback?.(
			{
				operation: MergeTreeMaintenanceType.SPLIT,
				deltaSegments: [{ segment }, { segment: next }],
			},
			undefined,
		);

		return { next };
	};

	private ensureIntervalBoundary(pos: number, refSeq: number, clientId: number) {
		const splitNode = this.insertingWalk(
			this.root,
			pos,
			refSeq,
			clientId,
			TreeMaintenanceSequenceNumber,
			{ leaf: this.splitLeafSegment },
		);
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
				const segSeq =
					node.seq === UnassignedSequenceNumber
						? Number.MAX_SAFE_INTEGER - 1
						: node.seq ?? 0;
				return newSeq > segSeq;
			}
			return false;
		} else {
			return true;
		}
	}

	private insertingWalk(
		block: IMergeBlock,
		pos: number,
		refSeq: number,
		clientId: number,
		seq: number,
		context: InsertContext,
		isLastChildBlock: boolean = true,
	) {
		let _pos = pos;
		const children = block.children;
		let childIndex: number;
		let child: IMergeNode;
		let newNode: IMergeNode | undefined;
		let fromSplit: IMergeBlock | undefined;
		for (childIndex = 0; childIndex < block.childCount; childIndex++) {
			child = children[childIndex];
			// ensure we walk down the far edge of the tree, even if all sub-tree is eligible for zamboni
			const isLastNonLeafBlock =
				isLastChildBlock && !child.isLeaf() && childIndex === block.childCount - 1;
			const len =
				this.nodeLength(child, refSeq, clientId) ?? (isLastChildBlock ? 0 : undefined);
			if (len === undefined) {
				// if the seg len in undefined, the segment
				// will be removed, so should just be skipped for now
				continue;
			} else {
				assert(len >= 0, 0x4bc /* Length should not be negative */);
			}

			if (_pos < len || (_pos === len && this.breakTie(_pos, child, seq))) {
				// Found entry containing pos
				if (!child.isLeaf()) {
					const childBlock = child;
					// Internal node
					const splitNode = this.insertingWalk(
						childBlock,
						_pos,
						refSeq,
						clientId,
						seq,
						context,
						isLastNonLeafBlock,
					);
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
				if (context.continuePredicate?.(block)) {
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

	public nodeUpdateOrdinals(block: IMergeBlock) {
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
		start: number,
		end: number,
		props: PropertySet,
		combiningOp: ICombiningOp | undefined,
		refSeq: number,
		clientId: number,
		seq: number,
		opArgs: IMergeTreeDeltaOpArgs,
		rollback: PropertiesRollback = PropertiesRollback.None,
	) {
		this.ensureIntervalBoundary(start, refSeq, clientId);
		this.ensureIntervalBoundary(end, refSeq, clientId);
		const deltaSegments: IMergeTreeSegmentDelta[] = [];
		const localSeq =
			seq === UnassignedSequenceNumber ? ++this.collabWindow.localSeq : undefined;
		let segmentGroup: SegmentGroup | undefined;
		const annotateSegment = (segment: ISegment) => {
			assert(
				!Marker.is(segment) ||
					!(reservedMarkerIdKey in props) ||
					props.markerId === segment.properties?.markerId,
				0x5ad /* Cannot change the markerId of an existing marker */,
			);
			const propertyDeltas = segment.addProperties(
				props,
				combiningOp,
				seq,
				this.collabWindow,
				rollback,
			);
			deltaSegments.push({ segment, propertyDeltas });
			if (this.collabWindow.collaborating) {
				if (seq === UnassignedSequenceNumber) {
					segmentGroup = this.addToPendingList(
						segment,
						segmentGroup,
						localSeq,
						propertyDeltas ? propertyDeltas : {},
					);
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
		if (deltaSegments.length > 0) {
			this.mergeTreeDeltaCallback?.(opArgs, {
				operation: MergeTreeDeltaType.ANNOTATE,
				deltaSegments,
			});
		}
		if (this.collabWindow.collaborating && seq !== UnassignedSequenceNumber) {
			if (MergeTree.options.zamboniSegments) {
				zamboniSegments(this);
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
		const localSeq =
			seq === UnassignedSequenceNumber ? ++this.collabWindow.localSeq : undefined;
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
				if (
					segment.removedSeq === UnassignedSequenceNumber &&
					clientId === this.collabWindow.clientId
				) {
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
		this.slideAckedRemovedSegmentReferences(localOverlapWithRefs);
		// opArgs == undefined => test code
		if (removedSegments.length > 0) {
			this.mergeTreeDeltaCallback?.(opArgs, {
				operation: MergeTreeDeltaType.REMOVE,
				deltaSegments: removedSegments,
			});
		}
		// these events are newly removed
		// so we slide after eventing in case the consumer wants to make reference
		// changes at remove time, like add a ref to track undo redo.
		if (!this.collabWindow.collaborating || clientId !== this.collabWindow.clientId) {
			this.slideAckedRemovedSegmentReferences(removedSegments.map(({ segment }) => segment));
		}

		if (this.collabWindow.collaborating && seq !== UnassignedSequenceNumber) {
			if (MergeTree.options.zamboniSegments) {
				zamboniSegments(this);
			}
		}
	}

	/**
	 * Revert an unacked local op
	 */
	public rollback(op: IMergeTreeDeltaOp, localOpMetadata: SegmentGroup) {
		if (op.type === MergeTreeDeltaType.REMOVE) {
			const pendingSegmentGroup = this.pendingSegments.pop?.()?.data;
			if (pendingSegmentGroup === undefined || pendingSegmentGroup !== localOpMetadata) {
				throw new Error("Rollback op doesn't match last edit");
			}
			pendingSegmentGroup.segments.forEach((segment: ISegmentLeaf) => {
				const segmentSegmentGroup = segment.segmentGroups?.pop?.();
				assert(
					segmentSegmentGroup === pendingSegmentGroup,
					0x3ee /* Unexpected segmentGroup in segment */,
				);

				assert(
					segment.removedClientIds !== undefined &&
						segment.removedClientIds[0] === this.collabWindow.clientId,
					0x39d /* Rollback segment removedClientId does not match local client */,
				);
				segment.removedClientIds = undefined;
				segment.removedSeq = undefined;
				segment.localRemovedSeq = undefined;

				// Note: optional chaining short-circuits:
				// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining#short-circuiting
				this.mergeTreeDeltaCallback?.(
					{ op: createInsertSegmentOp(this.findRollbackPosition(segment), segment) },
					{
						operation: MergeTreeDeltaType.INSERT,
						deltaSegments: [{ segment }],
					},
				);

				for (
					let updateNode = segment.parent;
					updateNode !== undefined;
					updateNode = updateNode.parent
				) {
					this.blockUpdateLength(
						updateNode,
						UnassignedSequenceNumber,
						this.collabWindow.clientId,
					);
				}
			});
		} else if (
			op.type === MergeTreeDeltaType.INSERT ||
			op.type === MergeTreeDeltaType.ANNOTATE
		) {
			const pendingSegmentGroup = this.pendingSegments.pop?.()?.data;
			if (
				pendingSegmentGroup === undefined ||
				pendingSegmentGroup !== localOpMetadata ||
				(op.type === MergeTreeDeltaType.ANNOTATE && !pendingSegmentGroup.previousProps)
			) {
				throw new Error("Rollback op doesn't match last edit");
			}
			let i = 0;
			for (const segment of pendingSegmentGroup.segments) {
				const segmentSegmentGroup = segment.segmentGroups.pop?.();
				assert(
					segmentSegmentGroup === pendingSegmentGroup,
					0x3ef /* Unexpected segmentGroup in segment */,
				);

				const start = this.findRollbackPosition(segment);
				if (op.type === MergeTreeDeltaType.INSERT) {
					segment.seq = UniversalSequenceNumber;
					segment.localSeq = undefined;
					const removeOp = createRemoveRangeOp(start, start + segment.cachedLength);
					this.markRangeRemoved(
						start,
						start + segment.cachedLength,
						UniversalSequenceNumber,
						this.collabWindow.clientId,
						UniversalSequenceNumber,
						false,
						{ op: removeOp },
					);
				} /* op.type === MergeTreeDeltaType.ANNOTATE */ else {
					const props = pendingSegmentGroup.previousProps![i];
					const rollbackType =
						op.combiningOp?.name === "rewrite"
							? PropertiesRollback.Rewrite
							: PropertiesRollback.Rollback;
					const annotateOp = createAnnotateRangeOp(
						start,
						start + segment.cachedLength,
						props,
						undefined,
					);
					this.annotateRange(
						start,
						start + segment.cachedLength,
						props,
						undefined,
						UniversalSequenceNumber,
						this.collabWindow.clientId,
						UniversalSequenceNumber,
						{ op: annotateOp },
						rollbackType,
					);
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

	public nodeUpdateLengthNewStructure(node: IMergeBlock, recur = false) {
		this.blockUpdate(node);
		if (this.collabWindow.collaborating) {
			this.localPartialsComputed = false;
			node.partialLengths = PartialSequenceLengths.combine(node, this.collabWindow, recur);
		}
	}

	public removeLocalReferencePosition(
		lref: LocalReferencePosition,
	): LocalReferencePosition | undefined {
		const segment: ISegmentLeaf | undefined = lref.getSegment();
		if (segment) {
			const removedRefs = segment?.localRefs?.removeLocalRef(lref);
			if (removedRefs !== undefined && refTypeIncludesFlag(lref, hierRefTypes)) {
				this.blockUpdatePathLengths(
					segment.parent,
					TreeMaintenanceSequenceNumber,
					LocalClientId,
				);
			}
			return removedRefs;
		}
	}

	public createLocalReferencePosition(
		segment: ISegmentLeaf,
		offset: number,
		refType: ReferenceType,
		properties: PropertySet | undefined,
		slidingPreference?: SlidingPreference,
	): LocalReferencePosition {
		if (
			isRemovedAndAcked(segment) &&
			!refTypeIncludesFlag(refType, ReferenceType.SlideOnRemove | ReferenceType.Transient)
		) {
			throw new UsageError(
				"Can only create SlideOnRemove or Transient local reference position on a removed segment",
			);
		}
		const localRefs = segment.localRefs ?? new LocalReferenceCollection(segment);
		segment.localRefs = localRefs;

		const segRef = localRefs.createLocalRef(offset, refType, properties, slidingPreference);

		if (refTypeIncludesFlag(refType, hierRefTypes)) {
			this.blockUpdatePathLengths(
				segment.parent,
				TreeMaintenanceSequenceNumber,
				LocalClientId,
			);
		}
		return segRef;
	}

	// Segments should either be removed remotely, removed locally, or inserted locally
	private normalizeAdjacentSegments(affectedSegments: List<ISegmentLeaf>): void {
		// Eagerly demand this since we're about to shift elements in the list around
		const currentOrder = Array.from(affectedSegments, ({ data: seg }) => ({
			parent: seg.parent,
			index: seg.index,
			ordinal: seg.ordinal,
		}));

		// Last segment which was not affected locally.
		let lastLocalSegment = affectedSegments.last;
		while (lastLocalSegment !== undefined && isRemovedAndAcked(lastLocalSegment.data)) {
			lastLocalSegment = lastLocalSegment.prev;
		}

		if (!lastLocalSegment) {
			return;
		}

		for (
			let segmentToSlide: ListNode<ISegment> | undefined = lastLocalSegment,
				nearerSegment = lastLocalSegment?.prev;
			segmentToSlide !== undefined;
			segmentToSlide = nearerSegment, nearerSegment = nearerSegment?.prev
		) {
			// Slide iterCur forward as far as possible
			if (isRemovedAndAcked(segmentToSlide.data)) {
				// Slide past all segments that are not also remotely removed
				affectedSegments.remove(segmentToSlide);
				affectedSegments.insertAfter(lastLocalSegment, segmentToSlide.data);
			} else if (isRemoved(segmentToSlide.data)) {
				assert(
					segmentToSlide.data.localRemovedSeq !== undefined,
					0x54d /* Removed segment that hasnt had its removal acked should be locally removed */,
				);
				// Slide each locally removed item past all segments that have localSeq > lremoveItem.localSeq
				// but not past remotely removed segments;
				let cur = segmentToSlide;
				let scan = cur.next;
				while (
					scan !== undefined &&
					!isRemovedAndAcked(scan.data) &&
					scan.data.localSeq !== undefined &&
					scan.data.localSeq > segmentToSlide.data.localRemovedSeq
				) {
					cur = scan;
					scan = scan.next;
				}
				if (cur !== segmentToSlide) {
					affectedSegments.remove(segmentToSlide);
					affectedSegments.insertAfter(cur, segmentToSlide.data);
				}
			}
		}

		const newOrder = Array.from(affectedSegments.map(({ data }) => data));
		newOrder.forEach((seg) =>
			seg.localRefs?.walkReferences((lref) => lref.callbacks?.beforeSlide?.(lref)),
		);
		const perSegmentTrackingGroups = new Map<ISegment, TrackingGroup[]>();
		for (const segment of newOrder) {
			const { trackingCollection } = segment;
			const trackingGroups = Array.from(trackingCollection.trackingGroups);
			perSegmentTrackingGroups.set(segment, trackingGroups);
			for (const group of trackingCollection.trackingGroups) {
				trackingCollection.unlink(group);
			}
		}

		for (let i = 0; i < newOrder.length; i++) {
			const seg = newOrder[i];
			const { parent, index, ordinal } = currentOrder[i];
			parent?.assignChild(seg, index, false);
			seg.ordinal = ordinal;
		}

		for (const [segment, groups] of perSegmentTrackingGroups.entries()) {
			for (const group of groups) {
				segment.trackingCollection.link(group);
			}
		}

		// Finally, update internal node bookkeeping on ancestors of the swapped nodes.
		// Toposort would improve this by a log factor, but probably not worth the added code size
		const depths = new Map<IMergeNode, number>();
		const computeDepth = (block: IMergeNode): number => {
			if (!depths.has(block)) {
				depths.set(block, block.parent === undefined ? 0 : 1 + computeDepth(block.parent));
			}
			return depths.get(block)!;
		};
		newOrder.forEach(computeDepth);
		for (const [node] of Array.from(depths.entries()).sort((a, b) => b[1] - a[1])) {
			if (!node.isLeaf()) {
				this.nodeUpdateLengthNewStructure(node, false);
			}
		}
		newOrder.forEach((seg) =>
			seg.localRefs?.walkReferences((lref) => lref.callbacks?.afterSlide?.(lref)),
		);
	}

	/**
	 * Normalizes the segments nearby `segmentGroup` to be ordered as they would if the op submitting `segmentGroup`
	 * is rebased to the current sequence number.
	 * This primarily affects the ordering of adjacent segments that were removed between the original submission of
	 * the local ops and now.
	 * Consider the following sequence of events:
	 * Initial state: "hi my friend" (seq: 0)
	 * - Client 1 inserts "good " to make "hi my good friend" (op1, refSeq: 0)
	 * - Client 2 deletes "my " to make "hi friend" (op2, refSeq: 0)
	 * - op2 is sequenced giving seq 1
	 * - Client 1 disconnects and reconnects at seq: 1.
	 *
	 * At this point in time, client 1 will have segments ["hi ", Removed"my ", Local"good ", "friend"].
	 * However, the rebased op that it submits will cause client 2 to have segments
	 * ["hi ", Local"good ", Removed"my ", "friend"].
	 *
	 * The difference in ordering can be problematic for tie-breaking concurrently inserted segments in some scenarios.
	 * Rather than incur extra work tie-breaking these scenarios for all clients, when client 1 rebases its operation,
	 * it can fix up its local state to align with what would be expected of the op it resubmits.
	 */
	public normalizeSegmentsOnRebase(): void {
		let currentRangeToNormalize = new List<ISegment>();
		let rangeContainsLocalSegs = false;
		let rangeContainsRemoteRemovedSegs = false;
		const normalize = () => {
			if (
				rangeContainsLocalSegs &&
				rangeContainsRemoteRemovedSegs &&
				currentRangeToNormalize.length > 1
			) {
				this.normalizeAdjacentSegments(currentRangeToNormalize);
			}
		};
		walkAllChildSegments(this.root, (seg) => {
			if (isRemoved(seg) || seg.seq === UnassignedSequenceNumber) {
				if (isRemovedAndAcked(seg)) {
					rangeContainsRemoteRemovedSegs = true;
				}
				if (seg.seq === UnassignedSequenceNumber) {
					rangeContainsLocalSegs = true;
				}
				currentRangeToNormalize.push(seg);
			} else {
				normalize();
				currentRangeToNormalize = new List<ISegment>();
				rangeContainsLocalSegs = false;
				rangeContainsRemoteRemovedSegs = false;
			}

			return true;
		});

		normalize();
	}

	private blockUpdate(block: IMergeBlock) {
		let len: number | undefined;
		const hierBlock = block.hierBlock();
		if (hierBlock) {
			hierBlock.rightmostTiles = createMap<Marker>();
			hierBlock.leftmostTiles = createMap<Marker>();
			hierBlock.rangeStacks = {};
		}
		for (let i = 0; i < block.childCount; i++) {
			const child = block.children[i];
			const nodeLength = nodeTotalLength(this, child);
			if (nodeLength !== undefined) {
				len ??= 0;
				len += nodeLength;
			}
			if (hierBlock) {
				addNodeReferences(
					this,
					child,
					hierBlock.rightmostTiles,
					hierBlock.leftmostTiles,
					hierBlock.rangeStacks,
				);
			}
		}

		block.cachedLength = len;
	}

	public blockUpdatePathLengths(
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
			this.collabWindow.collaborating &&
			seq !== UnassignedSequenceNumber &&
			seq !== TreeMaintenanceSequenceNumber
		) {
			if (
				node.partialLengths !== undefined &&
				MergeTree.options.incrementalUpdate &&
				clientId !== NonCollabClient
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
				state.start ??= 0;
				state.end ??= this.blockLength(state.block, state.refSeq, state.clientId);
				state.actions.pre?.(state);
			}
			if (state.op === IncrementalExecOp.Go && state.childIndex < state.block.childCount) {
				const child = state.block.children[state.childIndex];
				const len = this.nodeLength(child, state.refSeq, state.clientId) ?? 0;
				if (len > 0 && state.start < len && state.end > 0) {
					if (!child.isLeaf()) {
						const childState = new IncrementalMapState(
							child,
							state.actions,
							state.pos,
							state.refSeq,
							state.clientId,
							state.context,
							state.start,
							state.end,
							0,
						);
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
					if (state.op === IncrementalExecOp.Go) {
						state.actions.post?.(state);
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
					if (
						leaf(node, pos, refSeq, clientId, start - pos, endPos - pos, accum) ===
						false
					) {
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
