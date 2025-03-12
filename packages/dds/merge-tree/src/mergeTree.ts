/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable no-bitwise */

import { assert, Heap, IComparer } from "@fluidframework/core-utils/internal";
import { DataProcessingError, UsageError } from "@fluidframework/telemetry-utils/internal";

import { IAttributionCollectionSerializer } from "./attributionCollection.js";
import { Client } from "./client.js";
import { DoublyLinkedList, ListNode } from "./collections/index.js";
import {
	NonCollabClient,
	TreeMaintenanceSequenceNumber,
	UnassignedSequenceNumber,
	UniversalSequenceNumber,
} from "./constants.js";
import { EndOfTreeSegment, StartOfTreeSegment } from "./endOfTreeSegment.js";
import {
	LocalReferenceCollection,
	LocalReferencePosition,
	SlidingPreference,
	anyLocalReferencePosition,
	createDetachedLocalReferencePosition,
	filterLocalReferencePositions,
} from "./localReference.js";
import {
	IMergeTreeDeltaOpArgs,
	IMergeTreeSegmentDelta,
	MergeTreeDeltaCallback,
	MergeTreeMaintenanceCallback,
	MergeTreeMaintenanceType,
} from "./mergeTreeDeltaCallback.js";
import {
	NodeAction,
	backwardExcursion,
	depthFirstNodeWalk,
	forwardExcursion,
	walkAllChildSegments,
} from "./mergeTreeNodeWalk.js";
import {
	CollaborationWindow,
	IMergeNode,
	ISegmentAction,
	ISegmentChanges,
	InsertContext,
	Marker,
	MaxNodesInBlock,
	MergeBlock,
	SegmentGroup,
	assertSegmentLeaf,
	assignChild,
	isSegmentLeaf,
	reservedMarkerIdKey,
	opstampUtils,
	type IMergeNodeBuilder,
	type ISegmentInternal,
	type ISegmentLeaf,
	type ISegmentPrivate,
	type InsertOperationStamp,
	type ObliterateInfo,
	type OperationStamp,
	type RemoveOperationStamp,
	type SetRemoveOperationStamp,
	type SliceRemoveOperationStamp,
} from "./mergeTreeNodes.js";
import type { TrackingGroup } from "./mergeTreeTracking.js";
import {
	createAnnotateRangeOp,
	createInsertSegmentOp,
	createRemoveRangeOp,
} from "./opBuilder.js";
import {
	IMergeTreeDeltaOp,
	IRelativePosition,
	MergeTreeDeltaType,
	ReferenceType,
} from "./ops.js";
import { PartialSequenceLengths } from "./partialLengths.js";
import {
	PriorPerspective,
	LocalReconnectingPerspective,
	type Perspective,
	LocalDefaultPerspective,
	RemoteObliteratePerspective,
} from "./perspective.js";
import { PropertySet, createMap, extend, extendIfUndefined } from "./properties.js";
import {
	DetachedReferencePosition,
	ReferencePosition,
	refGetTileLabels,
	refHasTileLabel,
	refTypeIncludesFlag,
} from "./referencePositions.js";
import { SegmentGroupCollection } from "./segmentGroupCollection.js";
import {
	assertRemoved,
	isMergeNodeInfo,
	isRemoved,
	overwriteInfo,
	removeRemovalInfo,
	toRemovalInfo,
	type IHasInsertionInfo,
	type IHasRemovalInfo,
	type SegmentWithInfo,
} from "./segmentInfos.js";
import {
	copyPropertiesAndManager,
	PropertiesManager,
	PropertiesRollback,
	type PropsOrAdjust,
} from "./segmentPropertiesManager.js";
import { Side, type InteriorSequencePlace } from "./sequencePlace.js";
import { SortedSegmentSet } from "./sortedSegmentSet.js";
import { zamboniSegments } from "./zamboni.js";

export function isRemovedAndAcked(
	segment: ISegmentPrivate,
): segment is ISegmentLeaf & IHasRemovalInfo {
	const removalInfo = toRemovalInfo(segment);
	return removalInfo !== undefined && opstampUtils.isAcked(removalInfo.removes[0]);
}

function nodeTotalLength(mergeTree: MergeTree, node: IMergeNode): number | undefined {
	if (!node.isLeaf()) {
		return node.cachedLength;
	}
	return mergeTree.leafLength(node);
}

const LRUSegmentComparer: IComparer<LRUSegment> = {
	min: { maxSeq: -2 },
	compare: (a, b) => a.maxSeq - b.maxSeq,
};

function ackSegment(
	segment: ISegmentLeaf,
	segmentGroup: SegmentGroup,
	opArgs: IMergeTreeDeltaOpArgs,
): boolean {
	const currentSegmentGroup = segment.segmentGroups?.dequeue();
	assert(currentSegmentGroup === segmentGroup, 0x043 /* "On ack, unexpected segmentGroup!" */);
	assert(opArgs.sequencedMessage !== undefined, 0xa6e /* must have sequencedMessage */);
	const {
		op,
		sequencedMessage: { sequenceNumber, minimumSequenceNumber },
	} = opArgs;
	let allowIncrementalPartialLengthsUpdate = true;
	switch (op.type) {
		case MergeTreeDeltaType.ANNOTATE: {
			assert(
				!!segment.propertyManager,
				0x044 /* "On annotate ack, missing segment property manager!" */,
			);
			segment.propertyManager.ack(sequenceNumber, minimumSequenceNumber, op);
			break;
		}

		case MergeTreeDeltaType.INSERT: {
			assert(
				opstampUtils.isLocal(segment.insert),
				0x045 /* "On insert, seq number already assigned!" */,
			);

			segment.insert = {
				type: "insert",
				seq: sequenceNumber,
				clientId: segment.insert.clientId,
			};
			break;
		}

		case MergeTreeDeltaType.REMOVE: {
			assertRemoved(segment);
			const latestRemove = segment.removes[segment.removes.length - 1];
			assert(opstampUtils.isLocal(latestRemove), "Expected last remove to be unacked");
			assert(
				segment.removes.length === 1 ||
					opstampUtils.isAcked(segment.removes[segment.removes.length - 2]),
				"Expected prior remove to be acked",
			);
			// TODO: You had a weird condition with segmentGroup here before while code was a work in progress
			// also seems like you should probably account for overlapping move here...
			allowIncrementalPartialLengthsUpdate = segment.removes.length === 1;
			segment.removes[segment.removes.length - 1] = {
				type: "setRemove",
				seq: sequenceNumber,
				clientId: latestRemove.clientId,
			};
			break;
		}

		case MergeTreeDeltaType.OBLITERATE:
		case MergeTreeDeltaType.OBLITERATE_SIDED: {
			// TODO: Can combine this codepath with above one. Seems worth.
			assertRemoved(segment);
			const latestMove = segment.removes[segment.removes.length - 1];
			assert(opstampUtils.isLocal(latestMove), "Expected last move to be unacked");
			assert(
				segment.removes.length === 1 ||
					opstampUtils.isAcked(segment.removes[segment.removes.length - 2]),
				"Expected prior move to be acked",
			);
			allowIncrementalPartialLengthsUpdate = segment.removes.length === 1;
			const obliterateInfo = segmentGroup.obliterateInfo;
			assert(obliterateInfo !== undefined, 0xa40 /* must have obliterate info */);
			obliterateInfo.stamp = {
				type: "sliceRemove",
				seq: sequenceNumber,
				clientId: latestMove.clientId,
			};
			segment.removes[segment.removes.length - 1] = {
				type: "sliceRemove",
				seq: sequenceNumber,
				clientId: latestMove.clientId,
			};

			break;
		}

		default: {
			throw new Error(`${op.type} is in unrecognized operation type`);
		}
	}

	return allowIncrementalPartialLengthsUpdate;
}

/**
 * @legacy
 * @alpha
 */
export interface IMergeTreeOptions {
	catchUpBlobName?: string;
	/**
	 * Whether or not reference positions can slide to special endpoint segments
	 * denoting the positions immediately before the start and immediately after
	 * the end of the string.
	 *
	 * This is primarily useful in the case of interval stickiness.
	 */
	mergeTreeReferencesCanSlideToEndpoint?: boolean;
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
	 * Enables support for the obliterate operation -- a stronger form of remove
	 * which deletes concurrently inserted segments
	 *
	 * Obliterate is currently experimental and may not work in all scenarios.
	 *
	 * Default value: false
	 */
	mergeTreeEnableObliterate?: boolean;

	/**
	 * Enables support for reconnecting when obliterate operations are present
	 *
	 * Obliterate is currently experimental and may not work in all scenarios.
	 *
	 * @defaultValue `false`
	 */
	mergeTreeEnableObliterateReconnect?: boolean;

	/**
	 * Enables support for obliterate endpoint expansion.
	 * When enabled, obliterate operations can have sidedness specified for their endpoints.
	 * If an endpoint is externally anchored
	 * (aka the start is after a given position, or the end is before a given position),
	 * then concurrent inserts adjacent to the exclusive endpoint of an obliterated range will be included in the obliteration
	 *
	 * @defaultValue `false`
	 */
	mergeTreeEnableSidedObliterate?: boolean;

	/**
	 * Enables support for annotate adjust operations, which allow for specifying
	 * a summand which is summed with the current value to compute the new value.
	 *
	 * @defaultValue `false`
	 */
	mergeTreeEnableAnnotateAdjust?: boolean;
}

/**
 * @internal
 */
export interface IMergeTreeOptionsInternal extends IMergeTreeOptions {
	/**
	 * Options related to attribution
	 */
	attribution?: IMergeTreeAttributionOptions;
}

export function errorIfOptionNotTrue(
	options: IMergeTreeOptions | undefined,
	option: keyof IMergeTreeOptions,
): void {
	if (options?.[option] !== true) {
		throw new Error(`${option} is not enabled.`);
	}
}

/**
 * @internal
 */
export interface IMergeTreeAttributionOptions {
	/**
	 * If enabled, segments will store attribution keys which can be used with the runtime to determine
	 * attribution information (i.e. who created the content and when it was created).
	 *
	 * This flag only applied to new documents: if a snapshot is loaded, whether or not attribution keys
	 * are tracked is determined by the presence of existing attribution keys in the snapshot.
	 *
	 * default: false
	 */
	track?: boolean;

	/**
	 * Provides a policy for how to track attribution data on segments.
	 * This option must be provided if either:
	 * - `track` is set to true
	 * - a document containing existing attribution information is loaded
	 */
	policyFactory?: () => AttributionPolicy;
}

/**
 * Implements policy dictating which kinds of operations should be attributed and how.
 * @sealed
 * @internal
 */
export interface AttributionPolicy {
	/**
	 * Enables tracking attribution information for operations on this merge-tree.
	 * This function is expected to subscribe to appropriate change events in order
	 * to manage any attribution data it stores on segments.
	 *
	 * This must be done in an eventually consistent fashion.
	 */
	attach: (client: Client) => void;
	/**
	 * Disables tracking attribution information on segments.
	 */
	detach: () => void;
	/***/
	isAttached: boolean;
	/**
	 * Serializer capable of serializing any attribution data this policy stores on segments.
	 */
	serializer: IAttributionCollectionSerializer;
}

/**
 * @internal
 */
export interface LRUSegment {
	segment?: ISegmentLeaf;
	maxSeq: number;
}

export interface IRootMergeBlock extends MergeBlock {
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

	return maybeRoot?.mergeTree === undefined ? undefined : maybeRoot;
}

/**
 * Find the segment to which a reference will slide if it needs to slide, or undefined if there
 * is no valid segment (i.e. the tree is empty).
 *
 * @param segment - The segment to slide from.
 * @param cache - Optional cache mapping segments to their sliding destinations.
 * Excursions will be avoided for segments in the cache, and the cache will be populated with
 * entries for all segments visited during excursion.
 * This can reduce the number of times the tree needs to be scanned if a range containing many
 * SlideOnRemove references is removed.
 */
function getSlideToSegment(
	segment: ISegmentLeaf | undefined,
	slidingPreference: SlidingPreference = SlidingPreference.FORWARD,
	cache?: Map<ISegmentLeaf, { seg?: ISegmentLeaf }>,
	useNewSlidingBehavior: boolean = false,
): [ISegmentLeaf | undefined, "start" | "end" | undefined] {
	if (!segment || !isRemovedAndAcked(segment) || segment.endpointType !== undefined) {
		return [segment, undefined];
	}

	const cachedSegment = cache?.get(segment);
	if (cachedSegment !== undefined) {
		return [cachedSegment.seg, undefined];
	}
	const result: { seg?: ISegmentLeaf } = {};
	cache?.set(segment, result);
	const goFurtherToFindSlideToSegment = (seg: ISegmentLeaf): boolean => {
		if (opstampUtils.isAcked(seg.insert) && !isRemovedAndAcked(seg)) {
			result.seg = seg;
			return false;
		}
		if (
			cache !== undefined &&
			toRemovalInfo(seg)?.removes[0].seq === toRemovalInfo(segment)?.removes[0].seq
		) {
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
		return [result.seg, undefined];
	}

	// in the new sliding behavior, we don't look in the opposite direction
	// if we fail to find a segment to slide to in the right direction.
	//
	// in other words, rather than going `forward ?? backward ?? detached` (or
	// `backward ?? forward ?? detached`), we would slide `forward ?? detached`
	// or `backward ?? detached`
	//
	// in both of these cases detached may be substituted for one of the special
	// endpoint segments, if such behavior is enabled
	if (!useNewSlidingBehavior) {
		if (slidingPreference === SlidingPreference.BACKWARD) {
			forwardExcursion(segment, goFurtherToFindSlideToSegment);
		} else {
			backwardExcursion(segment, goFurtherToFindSlideToSegment);
		}
	}

	let maybeEndpoint: "start" | "end" | undefined;

	if (slidingPreference === SlidingPreference.BACKWARD) {
		maybeEndpoint = "start";
	} else if (slidingPreference === SlidingPreference.FORWARD) {
		maybeEndpoint = "end";
	}

	return [result.seg, maybeEndpoint];
}

/**
 * Returns the position to slide a reference to if a slide is required.
 * @param segoff - The segment and offset to slide from
 * @returns segment and offset to slide the reference to
 * @internal
 */
export function getSlideToSegoff(
	segoff: { segment: ISegmentInternal | undefined; offset: number | undefined },
	slidingPreference: SlidingPreference = SlidingPreference.FORWARD,
	useNewSlidingBehavior: boolean = false,
): {
	segment: ISegmentInternal | undefined;
	offset: number | undefined;
} {
	if (!isSegmentLeaf(segoff.segment)) {
		return segoff;
	}
	const [segment, _] = getSlideToSegment(
		segoff.segment,
		slidingPreference,
		undefined,
		useNewSlidingBehavior,
	);
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

const forwardPred = (ref: LocalReferencePosition): boolean =>
	ref.slidingPreference !== SlidingPreference.BACKWARD;
const backwardPred = (ref: LocalReferencePosition): boolean =>
	ref.slidingPreference === SlidingPreference.BACKWARD;

class Obliterates {
	/**
	 * Array containing the all move operations within the
	 * collab window.
	 *
	 * The moves are stored in sequence order which accelerates clean up in setMinSeq
	 *
	 * See https://github.com/microsoft/FluidFramework/blob/main/packages/dds/merge-tree/docs/Obliterate.md#remote-perspective
	 * for additional context
	 */

	private readonly seqOrdered = new DoublyLinkedList<ObliterateInfo>();

	/**
	 * This contains a sorted lists of all obliterate starts
	 * and is used to accelerate finding overlapping obliterates
	 * as well as determining if there are any obliterates at all.
	 */
	private readonly startOrdered = new SortedSegmentSet<LocalReferencePosition>();

	constructor(private readonly mergeTree: MergeTree) {}

	public setMinSeq(minSeq: number): void {
		// eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
		while (!this.seqOrdered.empty && this.seqOrdered.first?.data.stamp.seq! <= minSeq) {
			const ob = this.seqOrdered.shift()!;
			this.startOrdered.remove(ob.data.start);
			this.mergeTree.removeLocalReferencePosition(ob.data.start);
			this.mergeTree.removeLocalReferencePosition(ob.data.end);
		}
	}

	public addOrUpdate(obliterateInfo: ObliterateInfo): void {
		const {
			stamp: { seq },
			start,
		} = obliterateInfo;
		if (seq !== UnassignedSequenceNumber) {
			this.seqOrdered.push(obliterateInfo);
		}
		this.startOrdered.addOrUpdate(start);
	}

	public empty(): boolean {
		return this.startOrdered.size === 0;
	}

	public findOverlapping(seg: ISegmentLeaf): Iterable<ObliterateInfo> {
		const overlapping: ObliterateInfo[] = [];
		for (const start of this.startOrdered.items) {
			const startSeg = start.getSegment();
			if (isMergeNodeInfo(startSeg) && startSeg.ordinal <= seg.ordinal) {
				const ob = start.properties?.obliterate as ObliterateInfo;
				const endSeg = ob.end.getSegment();
				if (isMergeNodeInfo(endSeg) && endSeg.ordinal >= seg.ordinal) {
					overlapping.push(ob);
				}
			} else {
				// the start is past the seg, so exit
				break;
			}
		}
		return overlapping;
	}
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

	private static readonly theUnfinishedNode = { childCount: -1 } as unknown as MergeBlock;

	public readonly collabWindow = new CollaborationWindow();

	public readonly pendingSegments = new DoublyLinkedList<SegmentGroup>();

	public readonly segmentsToScour = new Heap<LRUSegment>(LRUSegmentComparer);

	public readonly attributionPolicy: AttributionPolicy | undefined;

	public localPerspective: Perspective = new LocalDefaultPerspective(
		this.collabWindow.clientId,
	);

	/**
	 * Whether or not all blocks in the mergeTree currently have information about local partial lengths computed.
	 * This information is only necessary on reconnect, and otherwise costly to bookkeep.
	 * This field enables tracking whether partials need to be recomputed using localSeq information.
	 */
	private localPartialsComputed = false;
	// for now assume only markers have ids and so point directly at the Segment
	// if we need to have pointers to non-markers, we can change to point at local refs
	private readonly idToMarker = new Map<string, Marker>();
	public mergeTreeDeltaCallback?: MergeTreeDeltaCallback;
	public mergeTreeMaintenanceCallback?: MergeTreeMaintenanceCallback;

	// TODO:AB#29553: This property doesn't seem to be adequately round-tripped through summarization.
	// Specifically, it seems like we drop information about obliterates within the collab window for at least V1 summaries.
	private readonly obliterates = new Obliterates(this);

	public constructor(public options?: IMergeTreeOptionsInternal) {
		this._root = this.makeBlock(0);
		this._root.mergeTree = this;
		this.attributionPolicy = options?.attribution?.policyFactory?.();
	}

	public mintNextLocalOperationStamp(): OperationStamp {
		if (this.collabWindow.collaborating) {
			this.collabWindow.localSeq++;
		}

		return {
			seq: this.collabWindow.collaborating
				? UnassignedSequenceNumber
				: UniversalSequenceNumber,
			clientId: this.collabWindow.clientId,
			localSeq: this.collabWindow.localSeq,
		};
	}

	private _root: IRootMergeBlock;
	public get root(): IRootMergeBlock {
		return this._root;
	}

	public set root(value: IRootMergeBlock) {
		this._root = value;
		value.mergeTree = this;
	}

	public makeBlock(childCount: number): MergeBlock {
		const block = new MergeBlock(childCount);
		block.ordinal = "";
		return block;
	}

	/**
	 * Compute the net length of this segment leaf from some perspective.
	 * @returns - Undefined if the segment has been removed and its removal is common knowledge to all collaborators (and therefore
	 * may not even be present on clients that have loaded from a summary beyond this point). Otherwise, the length of the segment.
	 */
	public leafLength(
		segment: ISegmentLeaf,
		perspective: Perspective = this.localPerspective,
	): number | undefined {
		const removalInfo = toRemovalInfo(segment);
		if (
			removalInfo &&
			this.collabWindow.minSeqPerspective.hasOccurred(removalInfo.removes[0])
		) {
			// this segment's removal has already moved outside the collab window which means it is zamboni eligible
			// this also means the segment could be completely absent from other client's in-memory merge trees,
			// so we should not consider it when making decisions about conflict resolutions
			return undefined;
		}

		return perspective.isSegmentPresent(segment) ? segment.cachedLength : 0;
	}

	public unlinkMarker(marker: Marker): void {
		const id = marker.getId();
		if (id) {
			this.idToMarker.delete(id);
		}
	}

	private addNode(block: MergeBlock, node: IMergeNodeBuilder): number {
		const index = block.childCount++;
		assignChild(block, node, index, false);
		return index;
	}

	public reloadFromSegments(segments: SegmentWithInfo<IHasInsertionInfo>[]): void {
		// This code assumes that a later call to `startCollaboration()` will initialize partial lengths.
		assert(
			!this.collabWindow.collaborating,
			0x049 /* "Trying to reload from segments while collaborating!" */,
		);

		const maxChildren = MaxNodesInBlock - 1;

		// Starting with the leaf segments, recursively builds the B-Tree layer by layer from the bottom up.
		const buildMergeBlock = (nodes: IMergeNodeBuilder[]): IRootMergeBlock => {
			const blockCount = Math.ceil(nodes.length / maxChildren); // Compute # blocks require for this level of B-Tree
			const blocks: MergeBlock[] = Array.from({ length: blockCount }); // Pre-alloc array to collect nodes

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
	public startCollaboration(localClientId: number, minSeq: number, currentSeq: number): void {
		this.collabWindow.clientId = localClientId;
		this.collabWindow.minSeq = minSeq;
		this.collabWindow.collaborating = true;
		this.collabWindow.currentSeq = currentSeq;
		this.localPerspective = new LocalDefaultPerspective(localClientId);
		this.nodeUpdateLengthNewStructure(this.root, true);
	}

	private addToLRUSet(leaf: ISegmentLeaf, seq: number): void {
		// If the parent node has not yet been marked for scour (i.e., needsScour is not false or undefined),
		// add the segment and mark the mark the node now.

		// TODO: 'seq' may be less than the current sequence number when inserting pre-ACKed
		//       segments from a snapshot.  We currently skip these for now.
		if (leaf.parent.needsScour !== true && seq > this.collabWindow.currentSeq) {
			leaf.parent.needsScour = true;
			this.segmentsToScour.add({ segment: leaf, maxSeq: seq });
		}
	}

	public getLength(perspective: Perspective): number {
		return this.nodeLength(this.root, perspective) ?? 0;
	}

	/**
	 * Returns the current length of the MergeTree for the local client.
	 */
	public get length(): number | undefined {
		return this.root.cachedLength;
	}

	public getPosition(node: IMergeNode, perspective: Perspective): number {
		if (node.isLeaf() && node.endpointType === "start") {
			return 0;
		}

		let totalOffset = 0;
		let parent = node.parent;
		let prevParent: MergeBlock | undefined;
		while (parent) {
			const children = parent.children;
			for (let childIndex = 0; childIndex < parent.childCount; childIndex++) {
				const child = children[childIndex];
				if ((!!prevParent && child === prevParent) || child === node) {
					break;
				}
				totalOffset += this.nodeLength(child, perspective) ?? 0;
			}
			prevParent = parent;
			parent = parent.parent;
		}
		return totalOffset;
	}

	public getContainingSegment(
		pos: number,
		perspective: Perspective,
	): {
		segment: ISegmentLeaf | undefined;
		offset: number | undefined;
	} {
		assert(
			perspective.localSeq === undefined ||
				perspective.clientId === this.collabWindow.clientId,
			0x39b /* localSeq provided for non-local client */,
		);

		let segment: ISegmentLeaf | undefined;
		let offset: number | undefined;

		const leaf = (leafSeg: ISegmentLeaf, _: number, start: number): boolean => {
			segment = leafSeg;
			offset = start;
			return false;
		};
		this.nodeMap(perspective, leaf, undefined, pos, pos + 1);
		return { segment, offset };
	}

	/**
	 * Slides or removes references from the provided list of segments.
	 *
	 * The order of the references is preserved for references of the same sliding
	 * preference. Relative order between references that slide backward and those
	 * that slide forward is not preserved, even in the case when they slide to
	 * the same segment.
	 *
	 * @remarks
	 *
	 * 1. Preserving the order of the references is a useful property for reference-based undo/redo
	 * (see revertibles.ts).
	 *
	 * 2. For use cases which necessitate eventual consistency across clients,
	 * this method should only be called with segments for which the current client sequence number is
	 * max(remove segment sequence number, add reference sequence number).
	 * See `packages\dds\merge-tree\REFERENCEPOSITIONS.md`
	 *
	 * @param segments - An array of (not necessarily contiguous) segments with increasing ordinals.
	 */
	private slideAckedRemovedSegmentReferences(segments: ISegmentLeaf[]): void {
		// References are slid in groups to preserve their order.
		let currentForwardSlideGroup: LocalReferenceCollection[] = [];
		let currentBackwardSlideGroup: LocalReferenceCollection[] = [];

		let currentForwardMaybeEndpoint: "start" | "end" | undefined;
		let currentForwardSlideDestination: ISegmentLeaf | undefined;
		let currentForwardSlideIsForward: boolean | undefined;

		let currentBackwardMaybeEndpoint: "start" | "end" | undefined;
		let currentBackwardSlideDestination: ISegmentLeaf | undefined;
		let currentBackwardSlideIsForward: boolean | undefined;

		const slideGroup = (
			currentSlideDestination: ISegmentLeaf | undefined,
			currentSlideIsForward: boolean | undefined,
			currentSlideGroup: LocalReferenceCollection[],
			pred: (ref: LocalReferencePosition) => boolean,
			maybeEndpoint: "start" | "end" | undefined,
		): void => {
			if (currentSlideIsForward === undefined) {
				return;
			}

			const nonEndpointRefsToAdd = currentSlideGroup.map((collection) =>
				filterLocalReferencePositions(
					collection,
					(ref) => pred(ref) && (maybeEndpoint ? !ref.canSlideToEndpoint : true),
				),
			);

			const endpointRefsToAdd = currentSlideGroup.map((collection) =>
				filterLocalReferencePositions(
					collection,
					(ref) => pred(ref) && !!ref.canSlideToEndpoint,
				),
			);

			if (maybeEndpoint) {
				const endpoint = maybeEndpoint === "start" ? this.startOfTree : this.endOfTree;
				const localRefs = LocalReferenceCollection.setOrGet(endpoint);
				if (currentSlideIsForward) {
					localRefs.addBeforeTombstones(...endpointRefsToAdd);
				} else {
					localRefs.addAfterTombstones(...endpointRefsToAdd);
				}
			}

			if (currentSlideDestination === undefined) {
				for (const collection of currentSlideGroup) {
					for (const ref of collection) {
						if (pred(ref) && !refTypeIncludesFlag(ref, ReferenceType.StayOnRemove)) {
							ref.callbacks?.beforeSlide?.(ref);
							collection.removeLocalRef(ref);
							ref.callbacks?.afterSlide?.(ref);
						}
					}
				}
			} else {
				const localRefs = LocalReferenceCollection.setOrGet(currentSlideDestination);
				if (currentSlideIsForward) {
					localRefs.addBeforeTombstones(...nonEndpointRefsToAdd);
				} else {
					localRefs.addAfterTombstones(...nonEndpointRefsToAdd);
				}
			}
		};

		const trySlideSegment = (
			segment: ISegmentLeaf,
			currentSlideDestination: ISegmentLeaf | undefined,
			currentSlideIsForward: boolean | undefined,
			currentSlideGroup: LocalReferenceCollection[],
			pred: (ref: LocalReferencePosition) => boolean,
			slidingPreference: SlidingPreference,
			currentMaybeEndpoint: "start" | "end" | undefined,
			reassign: (
				localRefs: LocalReferenceCollection,
				slideToSegment: ISegmentLeaf | undefined,
				slideIsForward: boolean,
				maybeEndpoint: "start" | "end" | undefined,
			) => void,
		): void => {
			// avoid sliding logic if this segment doesn't have any references
			// with the given sliding preference
			if (!segment.localRefs || !anyLocalReferencePosition(segment.localRefs, pred)) {
				return;
			}

			const [slideToSegment, maybeEndpoint] = getSlideToSegment(
				segment,
				slidingPreference,
				slidingPreference === SlidingPreference.FORWARD
					? forwardSegmentCache
					: backwardSegmentCache,
				this.options?.mergeTreeReferencesCanSlideToEndpoint,
			);
			const slideIsForward =
				slideToSegment === undefined ? false : slideToSegment.ordinal > segment.ordinal;

			if (
				slideToSegment !== currentSlideDestination ||
				slideIsForward !== currentSlideIsForward ||
				maybeEndpoint !== currentMaybeEndpoint
			) {
				slideGroup(
					currentSlideDestination,
					currentSlideIsForward,
					currentSlideGroup,
					pred,
					this.options?.mergeTreeReferencesCanSlideToEndpoint ? maybeEndpoint : undefined,
				);
				reassign(
					segment.localRefs,
					slideToSegment,
					slideIsForward,
					this.options?.mergeTreeReferencesCanSlideToEndpoint ? maybeEndpoint : undefined,
				);
			} else {
				currentSlideGroup.push(segment.localRefs);
			}
		};

		const forwardSegmentCache = new Map<ISegmentLeaf, { seg?: ISegmentLeaf }>();
		const backwardSegmentCache = new Map<ISegmentLeaf, { seg?: ISegmentLeaf }>();
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
				currentForwardSlideGroup,
				forwardPred,
				SlidingPreference.FORWARD,
				currentForwardMaybeEndpoint,
				(localRefs, slideToSegment, slideIsForward, maybeEndpoint) => {
					currentForwardSlideGroup = [localRefs];
					currentForwardSlideDestination = slideToSegment;
					currentForwardSlideIsForward = slideIsForward;
					currentForwardMaybeEndpoint = maybeEndpoint;
				},
			);

			trySlideSegment(
				segment,
				currentBackwardSlideDestination,
				currentBackwardSlideIsForward,
				currentBackwardSlideGroup,
				backwardPred,
				SlidingPreference.BACKWARD,
				currentBackwardMaybeEndpoint,
				(localRefs, slideToSegment, slideIsForward, maybeEndpoint) => {
					currentBackwardSlideGroup = [localRefs];
					currentBackwardSlideDestination = slideToSegment;
					currentBackwardSlideIsForward = slideIsForward;
					currentBackwardMaybeEndpoint = maybeEndpoint;
				},
			);
		}

		slideGroup(
			currentForwardSlideDestination,
			currentForwardSlideIsForward,
			currentForwardSlideGroup,
			forwardPred,
			currentForwardMaybeEndpoint,
		);
		slideGroup(
			currentBackwardSlideDestination,
			currentBackwardSlideIsForward,
			currentBackwardSlideGroup,
			backwardPred,
			currentBackwardMaybeEndpoint,
		);
	}

	/**
	 * Compute local partial length information
	 *
	 * Public only for use by internal tests
	 */
	public computeLocalPartials(refSeq: number): void {
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

	private nodeLength(node: IMergeNode, perspective: Perspective): number | undefined {
		if (node.isLeaf()) {
			return this.leafLength(node, perspective);
		}

		const { refSeq, clientId, localSeq } = perspective;

		const isLocalPerspective =
			!this.collabWindow.collaborating || this.collabWindow.clientId === clientId;
		if (
			isLocalPerspective &&
			(localSeq === undefined ||
				(localSeq === this.collabWindow.localSeq && refSeq >= this.collabWindow.currentSeq))
		) {
			// All changes are visible. Small note on why we allow refSeq >= this.collabWindow.currentSeq rather than just equality:
			// merge-tree eventing occurs before the collab window is updated to account for whatever op it is processing, and we want
			// to support resolving positions from within the event handler which account for that op. e.g. undo-redo relies on this
			// behavior with local references.
			return node.cachedLength;
		}

		if (localSeq !== undefined) {
			this.computeLocalPartials(refSeq);
		}

		const length = node.partialLengths!.getPartialLength(refSeq, clientId, localSeq);

		PartialSequenceLengths.options.verifyExpected?.(this, node, refSeq, clientId, localSeq);
		return length;
	}

	public setMinSeq(minSeq: number): void {
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
			this.obliterates.setMinSeq(minSeq);
			if (MergeTree.options.zamboniSegments) {
				zamboniSegments(this);
			}
		}
	}

	/**
	 * Returns the count of elements before the given reference position from the given perspective.
	 *
	 * @param refPos - The reference position to resolve.
	 * @param refSeq - The number of the latest sequenced change to consider.
	 * Defaults to including all edits which have been applied.
	 * @param clientId - The ID of the client from whose perspective to resolve this reference. Defaults to the current client.
	 * @param localSeq - The local sequence number to consider. Defaults to including all local edits.
	 */
	public referencePositionToLocalPosition(
		refPos: ReferencePosition,
		// Note: this is not `this.collabWindow.currentSeq` because we want to support resolving local reference positions to positions
		// from within event handlers, and the collab window's sequence numbers are not updated in time in all of those cases.
		refSeq = Number.MAX_SAFE_INTEGER,
		clientId = this.collabWindow.clientId,
		localSeq: number | undefined = undefined,
	): number {
		const perspective =
			clientId === this.collabWindow.clientId
				? localSeq !== undefined
					? new LocalReconnectingPerspective(refSeq, clientId, localSeq)
					: this.localPerspective
				: new PriorPerspective(refSeq, clientId);
		const seg = refPos.getSegment();
		if (seg === undefined || !isSegmentLeaf(seg)) {
			// We have no idea where this reference is, because it refers to a segment which is not in the tree.
			return DetachedReferencePosition;
		}
		if (refPos.isLeaf()) {
			return this.getPosition(seg, perspective);
		}
		if (refTypeIncludesFlag(refPos, ReferenceType.Transient) || seg.localRefs?.has(refPos)) {
			// TODO: Most of the time we actually have refSeq at the default value, which we could optimize for further.
			const perspective =
				localSeq !== undefined
					? new LocalReconnectingPerspective(refSeq, this.collabWindow.clientId, localSeq)
					: new PriorPerspective(refSeq, this.collabWindow.clientId);
			if (
				seg !== this.startOfTree &&
				seg !== this.endOfTree &&
				!perspective.isSegmentPresent(seg)
			) {
				const forward = refPos.slidingPreference === SlidingPreference.FORWARD;
				const removeInfo = toRemovalInfo(seg);
				const firstMove = removeInfo?.removes[0];
				const lastMove = removeInfo?.removes[removeInfo.removes.length - 1];
				const slideSeq =
					firstMove !== undefined && opstampUtils.isAcked(firstMove) ? firstMove.seq : refSeq;

				const slidePerspective =
					lastMove?.localSeq === undefined
						? new PriorPerspective(slideSeq, this.collabWindow.clientId)
						: new LocalReconnectingPerspective(
								slideSeq,
								this.collabWindow.clientId,
								lastMove.localSeq,
							);

				const slidSegment = slidePerspective.nextSegment(this, seg, forward);
				return (
					this.getPosition(slidSegment, perspective) +
					(forward ? 0 : slidSegment.cachedLength === 0 ? 0 : slidSegment.cachedLength - 1)
				);
			}
			return this.getPosition(seg, perspective) + refPos.getOffset();
		}
		return DetachedReferencePosition;
	}

	/**
	 * Finds the nearest reference with ReferenceType.Tile to `startPos` in the direction dictated by `forwards`.
	 * Uses depthFirstNodeWalk in addition to block-accelerated functionality. The search position will be included in
	 * the nodes to walk, so searching on all positions, including the endpoints, can be considered inclusive.
	 * Any out of bound search positions will return undefined, so in order to search the whole string, a forward
	 * search can begin at 0, or a backward search can begin at length-1.
	 *
	 * @param startPos - Position at which to start the search
	 * @param clientId - clientId dictating the perspective to search from
	 * @param markerLabel - Label of the marker to search for
	 * @param forwards - Whether the string should be searched in the forward or backward direction
	 */
	public searchForMarker(
		startPos: number,
		perspective: Perspective,
		markerLabel: string,
		forwards = true,
	): Marker | undefined {
		let foundMarker: Marker | undefined;

		const { segment } = this.getContainingSegment(startPos, perspective);
		if (!isSegmentLeaf(segment)) {
			return undefined;
		}

		depthFirstNodeWalk(
			segment.parent,
			segment,
			(node) => {
				if (node.isLeaf()) {
					if (Marker.is(node) && refHasTileLabel(node, markerLabel)) {
						foundMarker = node;
					}
				} else {
					const marker = forwards
						? node.leftmostTiles[markerLabel]
						: node.rightmostTiles[markerLabel];
					if (marker !== undefined) {
						assert(
							marker.isLeaf() && Marker.is(marker),
							0x751 /* Object returned is not a valid marker */,
						);
						foundMarker = marker;
					}
				}
				return foundMarker === undefined ? NodeAction.Skip : NodeAction.Exit;
			},
			undefined,
			undefined,
			forwards,
		);

		return foundMarker;
	}

	private updateRoot(splitNode: MergeBlock | undefined): void {
		if (splitNode !== undefined) {
			const newRoot = this.makeBlock(2);
			assignChild(newRoot, this.root, 0, false);
			assignChild(newRoot, splitNode, 1, false);
			this.root = newRoot;
			this.nodeUpdateOrdinals(this.root);
			this.nodeUpdateLengthNewStructure(this.root);
		}
	}

	/**
	 * Assign sequence number to existing segment; update partial lengths to reflect the change
	 * @param seq - sequence number given by server to pending segment
	 */
	public ackPendingSegment(opArgs: IMergeTreeDeltaOpArgs): void {
		const seq = opArgs.sequencedMessage!.sequenceNumber;
		// TODO: Seems like this info could help simplify implementation of ackSegment.
		const stamp: OperationStamp = {
			seq,
			clientId: this.collabWindow.clientId,
		};
		const pendingSegmentGroup = this.pendingSegments.shift()?.data;
		const nodesToUpdate: MergeBlock[] = [];
		let overwrite = false;
		if (pendingSegmentGroup !== undefined) {
			const deltaSegments: IMergeTreeSegmentDelta[] = [];
			const overlappingRemoves: boolean[] = [];
			pendingSegmentGroup.segments.map((pendingSegment: ISegmentLeaf) => {
				const overlappingRemove = !ackSegment(pendingSegment, pendingSegmentGroup, opArgs);

				overwrite ||= overlappingRemove;

				overlappingRemoves.push(overlappingRemove);
				if (MergeTree.options.zamboniSegments) {
					this.addToLRUSet(pendingSegment, seq);
				}
				if (!nodesToUpdate.includes(pendingSegment.parent)) {
					nodesToUpdate.push(pendingSegment.parent);
				}
				deltaSegments.push({
					segment: pendingSegment,
				});
			});

			if (pendingSegmentGroup.obliterateInfo !== undefined) {
				pendingSegmentGroup.obliterateInfo.stamp = { type: "sliceRemove", ...stamp };
				this.obliterates.addOrUpdate(pendingSegmentGroup.obliterateInfo);
			}

			// Perform slides after all segments have been acked, so that
			// positions after slide are final
			if (
				opArgs.op.type === MergeTreeDeltaType.REMOVE ||
				opArgs.op.type === MergeTreeDeltaType.OBLITERATE ||
				opArgs.op.type === MergeTreeDeltaType.OBLITERATE_SIDED
			) {
				this.slideAckedRemovedSegmentReferences(pendingSegmentGroup.segments);
			}

			this.mergeTreeMaintenanceCallback?.(
				{
					deltaSegments,
					operation: MergeTreeMaintenanceType.ACKNOWLEDGED,
				},
				opArgs,
			);

			for (const node of nodesToUpdate) {
				this.blockUpdatePathLengths(node, stamp, overwrite);
			}
		}
		if (MergeTree.options.zamboniSegments) {
			zamboniSegments(this);
		}
	}

	private addToPendingList(
		segment: ISegmentLeaf,

		segmentGroup?: SegmentGroup,
		localSeq?: number,
		previousProps?: PropertySet,
	): SegmentGroup {
		let _segmentGroup = segmentGroup;
		if (_segmentGroup === undefined) {
			_segmentGroup = {
				segments: [],
				localSeq,
				refSeq: this.collabWindow.currentSeq,
			};
			if (previousProps) {
				_segmentGroup.previousProps = [];
			}
			this.pendingSegments.push(_segmentGroup);
		}

		if (
			(!_segmentGroup.previousProps && !!previousProps) ||
			(!!_segmentGroup.previousProps && !previousProps)
		) {
			throw new Error("All segments in group should have previousProps or none");
		}
		if (previousProps) {
			_segmentGroup.previousProps!.push(previousProps);
		}

		const segmentGroups = (segment.segmentGroups ??= new SegmentGroupCollection(segment));
		segmentGroups.enqueue(_segmentGroup);
		return _segmentGroup;
	}

	// TODO: error checking
	public getMarkerFromId(id: string): Marker | undefined {
		const marker = this.idToMarker.get(id);
		return marker === undefined || isRemoved(marker) ? undefined : marker;
	}

	/**
	 * Given a position specified relative to a marker id, lookup the marker
	 * and convert the position to a character position.
	 * @param relativePos - Id of marker (may be indirect) and whether position is before or after marker.
	 * @param refseq - The reference sequence number at which to compute the position.
	 * @param clientId - The client id with which to compute the position.
	 */
	public posFromRelativePos(relativePos: IRelativePosition, perspective: Perspective): number {
		let pos = -1;
		let marker: Marker | undefined;
		if (relativePos.id) {
			marker = this.getMarkerFromId(relativePos.id);
		}
		if (isSegmentLeaf(marker)) {
			pos = this.getPosition(marker, perspective);
			if (relativePos.before) {
				if (relativePos.offset !== undefined) {
					pos -= relativePos.offset;
				}
			} else {
				pos += marker.cachedLength;
				if (relativePos.offset !== undefined) {
					pos += relativePos.offset;
				}
			}
		}
		return pos;
	}

	public insertSegments(
		pos: number,
		segments: ISegmentPrivate[],
		perspective: Perspective,
		stampArg: OperationStamp,
		opArgs: IMergeTreeDeltaOpArgs | undefined,
	): void {
		const stamp: InsertOperationStamp = { ...stampArg, type: "insert" };
		this.ensureIntervalBoundary(pos, perspective);

		this.blockInsert(pos, perspective, stamp, segments);

		// opArgs == undefined => loading snapshot or test code
		if (opArgs !== undefined) {
			const deltaSegments = segments
				.filter((segment) => !isRemoved(segment))
				.map((segment) => ({ segment }));

			if (deltaSegments.length > 0) {
				this.mergeTreeDeltaCallback?.(opArgs, {
					operation: MergeTreeDeltaType.INSERT,
					deltaSegments,
				});
			}
		}

		if (
			this.collabWindow.collaborating &&
			MergeTree.options.zamboniSegments &&
			opstampUtils.isAcked(stamp)
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

		const remotePerspective = new PriorPerspective(remoteClientRefSeq, remoteClientId);
		const segmentInfo = this.getContainingSegment(remoteClientPosition, remotePerspective);

		if (isSegmentLeaf(segmentInfo?.segment)) {
			const segmentPosition = this.getPosition(segmentInfo.segment, this.localPerspective);
			return segmentPosition + segmentInfo.offset!;
		} else {
			if (remoteClientPosition === this.getLength(remotePerspective)) {
				return this.getLength(this.localPerspective);
			}
		}
	}

	private blockInsert<T extends ISegmentPrivate>(
		pos: number,
		perspective: Perspective,
		stamp: InsertOperationStamp,
		newSegments: T[],
	): void {
		// Keeping this function within the scope of blockInsert for readability.
		// eslint-disable-next-line unicorn/consistent-function-scoping
		const continueFrom = (node: MergeBlock): boolean => {
			let siblingExists = false;
			forwardExcursion(node, () => {
				siblingExists = true;
				return false;
			});
			return siblingExists;
		};

		let segmentGroup: SegmentGroup;
		const saveIfLocal = (locSegment: ISegmentLeaf): void => {
			// Save segment so we can assign sequence number when acked by server
			if (this.collabWindow.collaborating) {
				if (
					opstampUtils.isLocal(locSegment.insert) &&
					stamp.clientId === this.collabWindow.clientId
				) {
					segmentGroup = this.addToPendingList(locSegment, segmentGroup, stamp.localSeq);
				}
				// LocSegment.seq === 0 when coming from SharedSegmentSequence.loadBody()
				// In all other cases this has to be true (checked by addToLRUSet):
				// locSegment.seq > this.collabWindow.currentSeq
				else if (
					MergeTree.options.zamboniSegments &&
					opstampUtils.greaterThan(locSegment.insert, this.collabWindow.minSeqTime)
				) {
					this.addToLRUSet(locSegment, locSegment.insert.seq);
				}
			}
		};
		const onLeaf = (
			segment: ISegmentLeaf | undefined,
			_pos: number,
			context: InsertContext,
			// Keeping this function within the scope of blockInsert for readability.
			// eslint-disable-next-line unicorn/consistent-function-scoping
		): ISegmentChanges => {
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
		for (const newSegment of newSegments
			.filter((s) => s.cachedLength > 0)
			.map((s) => overwriteInfo(s, { insert: stamp }))) {
			if (Marker.is(newSegment)) {
				const markerId = newSegment.getId();
				if (markerId) {
					this.idToMarker.set(markerId, newSegment);
				}
			}

			const splitNode = this.insertingWalk(this.root, insertPos, perspective, stamp, {
				leaf: onLeaf,
				candidateSegment: newSegment,
				continuePredicate: continueFrom,
			});

			if (!isSegmentLeaf(newSegment)) {
				// Indicates an attempt to insert past the end of the merge-tree's content.
				const errorConstructor =
					stamp.localSeq === undefined ? DataProcessingError : UsageError;
				throw new errorConstructor("MergeTree insert failed", {
					currentSeq: this.collabWindow.currentSeq,
					minSeq: this.collabWindow.minSeq,
					segSeq: stamp.seq,
				});
			}

			this.updateRoot(splitNode);

			insertPos += newSegment.cachedLength;

			if (!this.options?.mergeTreeEnableObliterate || this.obliterates.empty()) {
				saveIfLocal(newSegment);
				continue;
			}

			const overlappingAckedObliterates: RemoveOperationStamp[] = [];
			let oldest: ObliterateInfo | undefined;
			let newest: ObliterateInfo | undefined;
			let newestAcked: ObliterateInfo | undefined;
			let oldestUnacked: ObliterateInfo | undefined;
			// TODO: We should maybe be using perspective checks here
			const refSeqStamp: OperationStamp = {
				seq: perspective.refSeq,
				clientId: stamp.clientId,
				localSeq: stamp.localSeq,
			};
			for (const ob of this.obliterates.findOverlapping(newSegment)) {
				if (opstampUtils.greaterThan(ob.stamp, refSeqStamp)) {
					// Any obliterate from the same client that's inserting this segment cannot cause the segment to be marked as
					// obliterated (since that client must have performed the obliterate before this insertion).
					// We still need to consider such obliterates when determining the winning obliterate for the insertion point,
					// see `obliteratePrecedingInsertion` docs.
					if (stamp.clientId !== ob.stamp.clientId) {
						if (opstampUtils.isAcked(ob.stamp)) {
							overlappingAckedObliterates.push(ob.stamp);
						}

						if (oldest === undefined || opstampUtils.lessThan(ob.stamp, oldest.stamp)) {
							oldest = ob;
						}
					}

					if (newest === undefined || opstampUtils.greaterThan(ob.stamp, newest.stamp)) {
						newest = ob;
					}

					if (
						opstampUtils.isAcked(ob.stamp) &&
						(newestAcked === undefined ||
							opstampUtils.greaterThan(ob.stamp, newestAcked.stamp))
					) {
						newestAcked = ob;
					}

					if (
						opstampUtils.isLocal(ob.stamp) &&
						(oldestUnacked === undefined ||
							opstampUtils.greaterThan(oldestUnacked.stamp, ob.stamp))
					) {
						// There can be one local obliterate surrounding a segment if a client repeatedly obliterates
						// a region (ex: in the text ABCDEFG, obliterate D, then obliterate CE, then BF). In this case,
						// the first one that's applied will be the one that actually removes the segment.
						oldestUnacked = ob;
					}
				}
			}

			newSegment.obliteratePrecedingInsertion = newest;
			// See doc comment on obliteratePrecedingInsertion for more details: if the newest obliterate was performed
			// by the same client that's inserting this segment, we let them insert into this range and therefore don't
			// mark it obliterated.
			if (oldest && newest?.stamp.clientId !== stamp.clientId) {
				const removeInfo: IHasRemovalInfo = { removes: [] };
				if (newestAcked === newest || newestAcked?.stamp.clientId !== stamp.clientId) {
					removeInfo.removes = overlappingAckedObliterates;
					// Because we found these by looking at overlapping obliterates, they are not necessarily currently sorted by seq.
					// Address that now.
					removeInfo.removes.sort(opstampUtils.compare);
				}

				// Note that we don't need to worry about preserving any existing remove information since the segment is new.
				overwriteInfo(newSegment, removeInfo);

				// There could be multiple local obliterates that overlap a given insertion point.
				// This occurs e.g. if a client first obliterates "34", then "25"
				// from "123456" while another client attempts to insert between the 3 and the 4.
				// In such a case, the obliterate that actually removes the segment is the earliest overlapping one
				// so we can ignore all the others.
				// TODO: move this comment to a place that makes more sense.
				if (oldestUnacked !== undefined) {
					removeInfo.removes.push(oldestUnacked.stamp);

					assert(
						oldestUnacked.segmentGroup !== undefined,
						0x86c /* expected segment group to exist */,
					);

					this.addToPendingList(newSegment, oldestUnacked.segmentGroup);
				}

				if (newSegment.parent) {
					// The incremental update codepath in theory can handle most cases where segments are obliterated upon insertion,
					// but it's not idempotent with respect to segment insertion in the first place. Since we already update partial
					// lengths inside the inserting walk, we'd be at risk of double-counting the insertion in any case if we allow
					// incremental updates here.
					const newStructure = true;
					this.blockUpdatePathLengths(newSegment.parent, removeInfo.removes[0], newStructure);
				}
			}

			saveIfLocal(newSegment);
		}
	}

	private readonly splitLeafSegment = (
		segment: ISegmentLeaf | undefined,
		pos: number,
	): ISegmentChanges => {
		if (!(pos > 0 && segment)) {
			return {};
		}

		const next = segment.splitAt(pos)!;
		assertSegmentLeaf(next);

		if (segment?.segmentGroups) {
			next.segmentGroups ??= new SegmentGroupCollection(next);
			segment.segmentGroups.copyTo(next.segmentGroups);
		}

		if (segment.obliteratePrecedingInsertion) {
			next.obliteratePrecedingInsertion = segment.obliteratePrecedingInsertion;
		}
		copyPropertiesAndManager(segment, next);
		if (segment.localRefs) {
			segment.localRefs.split(pos, next);
		}

		this.mergeTreeMaintenanceCallback?.(
			{
				operation: MergeTreeMaintenanceType.SPLIT,
				deltaSegments: [{ segment }, { segment: next }],
			},
			undefined,
		);

		return { next };
	};

	private ensureIntervalBoundary(pos: number, perspective: Perspective): void {
		const splitNode = this.insertingWalk(
			this.root,
			pos,
			perspective,
			{ seq: TreeMaintenanceSequenceNumber, clientId: perspective.clientId },
			{ leaf: this.splitLeafSegment },
		);
		this.updateRoot(splitNode);
	}

	// Assume called only when pos == len
	private breakTie(pos: number, node: IMergeNode, insertStamp: OperationStamp): boolean {
		if (node.isLeaf()) {
			if (pos !== 0) {
				return false;
			}

			return (
				opstampUtils.greaterThan(insertStamp, node.insert) ||
				// TODO: conditions here may be subtly different if localseq stuff matters
				// Should this stuff be replaced with something more like a perspective check?
				(isRemoved(node) &&
					opstampUtils.isAcked(node.removes[0]) &&
					opstampUtils.greaterThan(node.removes[0], insertStamp))
			);
		} else {
			return true;
		}
	}

	private insertingWalk(
		block: MergeBlock,
		pos: number,
		perspective: Perspective,
		stamp: OperationStamp,
		context: InsertContext,
		isLastChildBlock: boolean = true,
	): MergeBlock | undefined {
		let _pos: number = pos;

		const children = block.children;
		let childIndex: number;
		let child: IMergeNode;
		let newNode: IMergeNodeBuilder | undefined;
		let fromSplit: MergeBlock | undefined;
		for (childIndex = 0; childIndex < block.childCount; childIndex++) {
			child = children[childIndex];
			// ensure we walk down the far edge of the tree, even if all sub-tree is eligible for zamboni
			const isLastNonLeafBlock =
				isLastChildBlock && !child.isLeaf() && childIndex === block.childCount - 1;
			const len = this.nodeLength(child, perspective) ?? (isLastChildBlock ? 0 : undefined);

			if (len === undefined) {
				// if the seg len is undefined, the segment
				// will be removed, so should just be skipped for now
				continue;
			}

			assert(len >= 0, 0x4bc /* Length should not be negative */);

			if (_pos < len || (_pos === len && this.breakTie(_pos, child, stamp))) {
				// Found entry containing pos
				if (child.isLeaf()) {
					const segment = child;
					const segmentChanges = context.leaf(segment, _pos, context);
					if (segmentChanges.replaceCurrent) {
						assignChild(block, segmentChanges.replaceCurrent, childIndex, false);
						segmentChanges.replaceCurrent.ordinal = child.ordinal;
					}
					if (segmentChanges.next) {
						newNode = segmentChanges.next;
						childIndex++; // Insert after
					} else {
						// No change
						return undefined;
					}
				} else {
					const childBlock = child;
					// Internal node
					const splitNode = this.insertingWalk(
						childBlock,
						_pos,
						perspective,
						stamp,
						context,
						isLastNonLeafBlock,
					);
					if (splitNode === undefined) {
						this.blockUpdateLength(block, stamp);
						return undefined;
					} else if (splitNode === MergeTree.theUnfinishedNode) {
						_pos -= len; // Act as if shifted segment
						continue;
					} else {
						newNode = splitNode;
						fromSplit = splitNode;
						childIndex++; // Insert after
					}
				}
				break;
			} else {
				_pos -= len;
			}
		}
		if (!newNode && _pos === 0) {
			if (context.continuePredicate?.(block)) {
				return MergeTree.theUnfinishedNode;
			} else {
				const segmentChanges = context.leaf(undefined, _pos, context);
				newNode = segmentChanges.next;
				// Assert segmentChanges.replaceCurrent === undefined
			}
		}
		if (newNode) {
			for (let i = block.childCount; i > childIndex; i--) {
				block.children[i] = block.children[i - 1];
				block.children[i].index = i;
			}
			assignChild(block, newNode, childIndex, false);
			block.childCount++;
			block.setOrdinal(newNode, childIndex);
			if (block.childCount < MaxNodesInBlock) {
				if (fromSplit) {
					this.nodeUpdateOrdinals(fromSplit);
				}
				this.blockUpdateLength(block, stamp);
				return undefined;
			} else {
				// Don't update ordinals because higher block will do it
				const newNodeFromSplit = this.split(block);

				PartialSequenceLengths.options.verifyExpected?.(
					this,
					block,
					perspective.refSeq,
					stamp.clientId,
				);
				PartialSequenceLengths.options.verifyExpected?.(
					this,
					newNodeFromSplit,
					perspective.refSeq,
					stamp.clientId,
				);

				return newNodeFromSplit;
			}
		} else {
			return undefined;
		}
	}

	private split(node: MergeBlock): MergeBlock {
		const halfCount = MaxNodesInBlock / 2;
		const newNode = this.makeBlock(halfCount);
		node.childCount = halfCount;
		// Update ordinals to reflect lowered child count
		this.nodeUpdateOrdinals(node);
		for (let i = 0; i < halfCount; i++) {
			assignChild(newNode, node.children[halfCount + i], i, false);
			node.children[halfCount + i] = undefined!;
		}
		this.nodeUpdateLengthNewStructure(node);
		this.nodeUpdateLengthNewStructure(newNode);
		return newNode;
	}

	public nodeUpdateOrdinals(block: MergeBlock): void {
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
	 * @param propsOrAdjust - The properties or adjustments to annotate the range with
	 * @param refSeq - The reference sequence number to use to apply the annotate
	 * @param clientId - The id of the client making the annotate
	 * @param seq - The sequence number of the annotate operation
	 * @param opArgs - The op args for the annotate op. this is passed to the merge tree callback if there is one
	 * @param rollback - Whether this is for a local rollback and what kind
	 */
	public annotateRange(
		start: number,
		end: number,
		propsOrAdjust: PropsOrAdjust,
		perspective: Perspective,
		stamp: OperationStamp,
		opArgs: IMergeTreeDeltaOpArgs,
		rollback: PropertiesRollback = PropertiesRollback.None,
	): void {
		if (propsOrAdjust.adjust !== undefined) {
			errorIfOptionNotTrue(this.options, "mergeTreeEnableAnnotateAdjust");
		}

		this.ensureIntervalBoundary(start, perspective);
		this.ensureIntervalBoundary(end, perspective);
		const deltaSegments: IMergeTreeSegmentDelta[] = [];

		let segmentGroup: SegmentGroup | undefined;
		const opObj = propsOrAdjust.props ?? propsOrAdjust.adjust;
		const annotateSegment = (segment: ISegmentLeaf): boolean => {
			assert(
				!Marker.is(segment) ||
					!(reservedMarkerIdKey in opObj) ||
					opObj.markerId === segment.properties?.markerId,
				0x5ad /* Cannot change the markerId of an existing marker */,
			);

			const propertyManager = (segment.propertyManager ??= new PropertiesManager());
			const propertyDeltas = propertyManager.handleProperties(
				propsOrAdjust,
				segment,
				stamp.seq,
				this.collabWindow.minSeq,
				this.collabWindow.collaborating,
				rollback,
			);

			if (!isRemoved(segment)) {
				deltaSegments.push({ segment, propertyDeltas });
			}
			if (this.collabWindow.collaborating) {
				if (opstampUtils.isLocal(stamp)) {
					segmentGroup = this.addToPendingList(
						segment,
						segmentGroup,
						stamp.localSeq,
						propertyDeltas,
					);
				} else {
					if (MergeTree.options.zamboniSegments) {
						this.addToLRUSet(segment, stamp.seq);
					}
				}
			}
			return true;
		};

		this.nodeMap(perspective, annotateSegment, undefined, start, end);

		// OpArgs == undefined => test code
		if (deltaSegments.length > 0) {
			this.mergeTreeDeltaCallback?.(opArgs, {
				operation: MergeTreeDeltaType.ANNOTATE,
				deltaSegments,
			});
		}
		if (
			this.collabWindow.collaborating &&
			stamp.seq !== UnassignedSequenceNumber &&
			MergeTree.options.zamboniSegments
		) {
			zamboniSegments(this);
		}
	}

	private obliterateRangeSided(
		start: InteriorSequencePlace,
		end: InteriorSequencePlace,
		perspective: Perspective,
		stamp: SliceRemoveOperationStamp,
		opArgs: IMergeTreeDeltaOpArgs,
	): void {
		const startPos = start.side === Side.Before ? start.pos : start.pos + 1;
		const endPos = end.side === Side.Before ? end.pos : end.pos + 1;

		this.ensureIntervalBoundary(startPos, perspective);
		this.ensureIntervalBoundary(endPos, perspective);

		let _overwrite = false;
		const localOverlapWithRefs: ISegmentLeaf[] = [];
		const removedSegments: SegmentWithInfo<IHasRemovalInfo, ISegmentLeaf>[] = [];

		const obliterate: ObliterateInfo = {
			start: createDetachedLocalReferencePosition(undefined),
			end: createDetachedLocalReferencePosition(undefined),
			refSeq: perspective.refSeq,
			stamp,
			segmentGroup: undefined,
		};

		const { segment: startSeg } = this.getContainingSegment(start.pos, perspective);
		const { segment: endSeg } = this.getContainingSegment(end.pos, perspective);
		assert(
			isSegmentLeaf(startSeg) && isSegmentLeaf(endSeg),
			0xa3f /* segments cannot be undefined */,
		);

		obliterate.start = this.createLocalReferencePosition(
			startSeg,
			start.side === Side.Before ? 0 : Math.max(startSeg.cachedLength - 1, 0),
			ReferenceType.StayOnRemove,
			{
				obliterate,
			},
		);

		obliterate.end = this.createLocalReferencePosition(
			endSeg,
			end.side === Side.Before ? 0 : Math.max(endSeg.cachedLength - 1, 0),
			ReferenceType.StayOnRemove,
			{
				obliterate,
			},
		);

		// Always create a segment group for obliterate,
		// even if there are no segments currently in the obliteration range.
		// Segments may be concurrently inserted into the obliteration range,
		// at which point they are added to the segment group.
		obliterate.segmentGroup = {
			segments: [],
			localSeq: stamp.localSeq,
			refSeq: this.collabWindow.currentSeq,
			obliterateInfo: obliterate,
		};
		if (this.collabWindow.collaborating && stamp.clientId === this.collabWindow.clientId) {
			this.pendingSegments.push(obliterate.segmentGroup);
		}
		this.obliterates.addOrUpdate(obliterate);

		const markMoved = (segment: ISegmentLeaf, pos: number): boolean => {
			if (
				(start.side === Side.After && startPos === pos + segment.cachedLength) || // exclusive start segment
				(end.side === Side.Before && endPos === pos && perspective.isSegmentPresent(segment)) // exclusive end segment
			) {
				// We walk these segments because we want to also walk any concurrently inserted segments between here and the obliterated segments.
				// These segments are outside of the obliteration range though, so return true to keep walking.
				return true;
			}
			const existingRemoveInfo = toRemovalInfo(segment);

			// The "last-to-obliterate-gets-to-insert" policy described by the doc comment on `obliteratePrecedingInsertion`
			// is mostly handled by logic at insertion time, but we need a small bit of handling here.
			// Specifically, we want to avoid marking a local-only segment as obliterated when we know one of our own local obliterates
			// will win against the obliterate we're processing, hence the early exit.
			if (
				opstampUtils.isLocal(segment.insert) &&
				segment.obliteratePrecedingInsertion?.stamp.seq === UnassignedSequenceNumber &&
				stamp.seq !== UnassignedSequenceNumber
			) {
				// We chose to not obliterate this segment because we are aware of an unacked local obliteration.
				// The local obliterate has not been sequenced yet, so it is still the newest obliterate we are aware of.
				// Other clients will also choose not to obliterate this segment because the most recent obliteration has the same clientId
				return true;
			}

			// Partial lengths incrementality is not supported for overlapping obliterate/removes.
			_overwrite ||= existingRemoveInfo !== undefined;

			// - Record the segment as moved
			// - If this was the first thing to remove the segment from the local view, add it to movedSegments
			// - Otherwise, if it was the first thing to remove the segment from the acked view, add it to localOverlapWithRefs (so we can slide them)
			if (existingRemoveInfo === undefined) {
				const moved = overwriteInfo<IHasRemovalInfo, ISegmentLeaf>(segment, {
					removes: [stamp],
				});

				removedSegments.push(moved);
			} else {
				// The segment has already been removed, so we don't need to add it to removedSegments. However,
				// if it's only been removed locally, we still need to slide any references that may exist on it.
				if (
					!opstampUtils.hasAnyAckedOperation(existingRemoveInfo.removes) &&
					segment.localRefs?.empty === false
				) {
					localOverlapWithRefs.push(segment);
				}
				opstampUtils.insertIntoList(existingRemoveInfo.removes, stamp);
			}
			assertRemoved(segment);
			// Save segment so can assign moved sequence number when acked by server
			if (this.collabWindow.collaborating) {
				if (
					opstampUtils.isLocal(segment.removes[0]) &&
					stamp.clientId === this.collabWindow.clientId
				) {
					obliterate.segmentGroup = this.addToPendingList(
						segment,
						obliterate.segmentGroup,
						stamp.localSeq,
					);
				} else {
					if (MergeTree.options.zamboniSegments) {
						this.addToLRUSet(segment, stamp.seq);
					}
				}
			}
			return true;
		};

		const afterMarkMoved = (node: MergeBlock): boolean => {
			if (_overwrite) {
				this.nodeUpdateLengthNewStructure(node);
			} else {
				this.blockUpdateLength(node, stamp);
			}
			return true;
		};

		this.nodeMap(
			perspective,
			markMoved,
			afterMarkMoved,
			start.pos,
			end.pos + 1, // include the segment containing the end reference
			// Use a visibilityPerspective which includes all segments (including local ones) which are in the obliteration range.
			// This ensures that concurrently inserted segments will also be marked obliterated.
			opstampUtils.isLocal(stamp)
				? perspective
				: new RemoteObliteratePerspective(stamp.clientId),
		);

		this.slideAckedRemovedSegmentReferences(localOverlapWithRefs);
		// opArgs == undefined => test code
		if (start.pos !== end.pos || start.side !== end.side) {
			this.mergeTreeDeltaCallback?.(opArgs, {
				operation: MergeTreeDeltaType.OBLITERATE,
				deltaSegments: removedSegments.map((segment) => ({ segment })),
			});
		}

		// these events are newly removed
		// so we slide after eventing in case the consumer wants to make reference
		// changes at remove time, like add a ref to track undo redo.
		if (!this.collabWindow.collaborating || stamp.clientId !== this.collabWindow.clientId) {
			this.slideAckedRemovedSegmentReferences(removedSegments);
		}

		if (
			this.collabWindow.collaborating &&
			stamp.seq !== UnassignedSequenceNumber &&
			MergeTree.options.zamboniSegments
		) {
			zamboniSegments(this);
		}
	}

	public obliterateRange(
		start: number | InteriorSequencePlace,
		end: number | InteriorSequencePlace,
		perspective: Perspective,
		stampArg: OperationStamp,
		opArgs: IMergeTreeDeltaOpArgs,
	): void {
		errorIfOptionNotTrue(this.options, "mergeTreeEnableObliterate");
		const stamp: SliceRemoveOperationStamp = { ...stampArg, type: "sliceRemove" };
		if (this.options?.mergeTreeEnableSidedObliterate) {
			assert(
				typeof start === "object" && typeof end === "object",
				0xa45 /* Start and end must be of type InteriorSequencePlace if mergeTreeEnableSidedObliterate is enabled. */,
			);
			this.obliterateRangeSided(start, end, perspective, stamp, opArgs);
		} else {
			assert(
				typeof start === "number" && typeof end === "number",
				0xa46 /* Start and end must be numbers if mergeTreeEnableSidedObliterate is not enabled. */,
			);
			this.obliterateRangeSided(
				{ pos: start, side: Side.Before },
				{ pos: end - 1, side: Side.After },
				perspective,
				stamp,
				opArgs,
			);
		}
	}

	public markRangeRemoved(
		start: number,
		end: number,
		perspective: Perspective,
		stampArg: OperationStamp,
		opArgs: IMergeTreeDeltaOpArgs,
	): void {
		let _overwrite = false;
		const stamp: SetRemoveOperationStamp = { ...stampArg, type: "setRemove" };
		this.ensureIntervalBoundary(start, perspective);
		this.ensureIntervalBoundary(end, perspective);

		let segmentGroup: SegmentGroup;
		const removedSegments: SegmentWithInfo<IHasRemovalInfo, ISegmentLeaf>[] = [];
		const localOverlapWithRefs: ISegmentLeaf[] = [];

		const markRemoved = (
			segment: ISegmentLeaf,
			pos: number,
			_start: number,
			_end: number,
		): boolean => {
			const existingRemovalInfo = toRemovalInfo(segment);

			// Partial lengths incrementality is not supported for overlapping obliterate/removes.
			_overwrite ||= existingRemovalInfo !== undefined;
			if (existingRemovalInfo === undefined) {
				const removed = overwriteInfo<IHasRemovalInfo, ISegmentLeaf>(segment, {
					removes: [stamp],
				});

				removedSegments.push(removed);
			} else {
				if (
					!opstampUtils.hasAnyAckedOperation(existingRemovalInfo.removes) &&
					segment.localRefs?.empty === false
				) {
					localOverlapWithRefs.push(segment);
				}
				opstampUtils.insertIntoList(existingRemovalInfo.removes, stamp);
			}
			assertRemoved(segment);

			// Save segment so we can assign removed sequence number when acked by server
			if (this.collabWindow.collaborating) {
				if (
					opstampUtils.isLocal(segment.removes[0]) &&
					stamp.clientId === this.collabWindow.clientId
				) {
					segmentGroup = this.addToPendingList(segment, segmentGroup, stamp.localSeq);
				} else {
					if (MergeTree.options.zamboniSegments) {
						this.addToLRUSet(segment, stamp.seq);
					}
				}
			}
			return true;
		};
		const afterMarkRemoved = (node: MergeBlock): boolean => {
			if (_overwrite) {
				this.nodeUpdateLengthNewStructure(node);
			} else {
				this.blockUpdateLength(node, stamp);
			}
			return true;
		};
		this.nodeMap(perspective, markRemoved, afterMarkRemoved, start, end);
		// these segments are already viewed as being removed locally and are not event-ed
		// so can slide non-StayOnRemove refs immediately
		this.slideAckedRemovedSegmentReferences(localOverlapWithRefs);
		// opArgs == undefined => test code
		if (removedSegments.length > 0) {
			this.mergeTreeDeltaCallback?.(opArgs, {
				operation: MergeTreeDeltaType.REMOVE,
				deltaSegments: removedSegments.map((segment) => ({ segment })),
			});
		}
		// these events are newly removed
		// so we slide after eventing in case the consumer wants to make reference
		// changes at remove time, like add a ref to track undo redo.
		if (!this.collabWindow.collaborating || stamp.clientId !== this.collabWindow.clientId) {
			this.slideAckedRemovedSegmentReferences(removedSegments);
		}

		if (
			this.collabWindow.collaborating &&
			stamp.seq !== UnassignedSequenceNumber &&
			MergeTree.options.zamboniSegments
		) {
			zamboniSegments(this);
		}
	}

	/**
	 * Revert an unacked local op
	 */
	public rollback(op: IMergeTreeDeltaOp, localOpMetadata: SegmentGroup): void {
		if (op.type === MergeTreeDeltaType.REMOVE) {
			const pendingSegmentGroup = this.pendingSegments.pop()?.data;
			if (pendingSegmentGroup === undefined || pendingSegmentGroup !== localOpMetadata) {
				throw new Error("Rollback op doesn't match last edit");
			}
			// Disabling because a for of loop causes the type of segment to be ISegmentLeaf, which does not have parent information stored
			// eslint-disable-next-line unicorn/no-array-for-each
			pendingSegmentGroup.segments.forEach((segment: ISegmentLeaf) => {
				const segmentSegmentGroup = segment?.segmentGroups?.pop();
				assert(
					segmentSegmentGroup === pendingSegmentGroup,
					0x3ee /* Unexpected segmentGroup in segment */,
				);

				assert(
					isRemoved(segment) &&
						segment.removes[0].clientId === this.collabWindow.clientId &&
						segment.removes[0].type === "setRemove",
					0x39d /* Rollback segment removedClientId does not match local client */,
				);
				let updateNode: MergeBlock | undefined = segment.parent;
				// This also removes obliterates, but that should be ok as we can only remove a segment once.
				// If we were able to remove it locally, that also means there are no remote removals (since rollback is synchronous).
				removeRemovalInfo(segment);

				for (updateNode; updateNode !== undefined; updateNode = updateNode.parent) {
					this.blockUpdateLength(updateNode, {
						seq: UnassignedSequenceNumber,
						clientId: this.collabWindow.clientId,
					});
				}

				// Note: optional chaining short-circuits:
				// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining#short-circuiting
				this.mergeTreeDeltaCallback?.(
					{ op: createInsertSegmentOp(this.findRollbackPosition(segment), segment) },
					{
						operation: MergeTreeDeltaType.INSERT,
						deltaSegments: [{ segment }],
					},
				);
			});
		} else if (
			op.type === MergeTreeDeltaType.INSERT ||
			op.type === MergeTreeDeltaType.ANNOTATE
		) {
			const pendingSegmentGroup = this.pendingSegments.pop()?.data;
			if (
				pendingSegmentGroup === undefined ||
				pendingSegmentGroup !== localOpMetadata ||
				(op.type === MergeTreeDeltaType.ANNOTATE && !pendingSegmentGroup.previousProps)
			) {
				throw new Error("Rollback op doesn't match last edit");
			}
			let i = 0;
			for (const segment of pendingSegmentGroup.segments) {
				const segmentSegmentGroup = segment?.segmentGroups?.pop();
				assert(
					segmentSegmentGroup === pendingSegmentGroup,
					0x3ef /* Unexpected segmentGroup in segment */,
				);

				const start = this.findRollbackPosition(segment);
				if (op.type === MergeTreeDeltaType.INSERT) {
					segment.insert = {
						type: "insert",
						seq: UniversalSequenceNumber,
						clientId: this.collabWindow.clientId,
					};
					const removeOp = createRemoveRangeOp(start, start + segment.cachedLength);
					const removeStamp: SetRemoveOperationStamp = {
						type: "setRemove",
						seq: UniversalSequenceNumber,
						clientId: this.collabWindow.clientId,
					};
					this.markRangeRemoved(
						start,
						start + segment.cachedLength,
						this.localPerspective,
						removeStamp,
						{ op: removeOp },
					);
				} /* op.type === MergeTreeDeltaType.ANNOTATE */ else {
					const props = pendingSegmentGroup.previousProps![i];
					const annotateOp = createAnnotateRangeOp(start, start + segment.cachedLength, props);
					const annotateStamp: OperationStamp = {
						seq: UniversalSequenceNumber,
						clientId: this.collabWindow.clientId,
					};
					this.annotateRange(
						start,
						start + segment.cachedLength,
						{ props },
						this.localPerspective,
						annotateStamp,
						{ op: annotateOp },
						PropertiesRollback.Rollback,
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
	private findRollbackPosition(segment: ISegmentLeaf): number {
		let segmentPosition = 0;
		walkAllChildSegments(this.root, (seg) => {
			// If we've found the desired segment, terminate the walk and return 'segmentPosition'.
			if (seg === segment) {
				return false;
			}

			// If not removed, increase position
			if (!isRemoved(seg)) {
				segmentPosition += seg.cachedLength;
			}

			return true;
		});

		return segmentPosition;
	}

	public nodeUpdateLengthNewStructure(node: MergeBlock, recur = false): void {
		this.blockUpdate(node);
		if (this.collabWindow.collaborating) {
			this.localPartialsComputed = false;
			node.partialLengths = PartialSequenceLengths.combine(node, this.collabWindow, recur);
		}
	}

	public removeLocalReferencePosition(
		lref: LocalReferencePosition,
	): LocalReferencePosition | undefined {
		const segment: ISegmentPrivate | undefined = lref.getSegment();
		return segment?.localRefs?.removeLocalRef(lref);
	}

	startOfTree = new StartOfTreeSegment(this);
	endOfTree = new EndOfTreeSegment(this);

	public createLocalReferencePosition(
		_segment: ISegmentPrivate | "start" | "end",
		offset: number,
		refType: ReferenceType,
		properties: PropertySet | undefined,
		slidingPreference?: SlidingPreference,
		canSlideToEndpoint?: boolean,
	): LocalReferencePosition {
		if (
			_segment !== "start" &&
			_segment !== "end" &&
			isRemovedAndAcked(_segment) &&
			!refTypeIncludesFlag(
				refType,
				ReferenceType.SlideOnRemove | ReferenceType.Transient | ReferenceType.StayOnRemove,
			) &&
			_segment.endpointType === undefined
		) {
			throw new UsageError(
				"Can only create SlideOnRemove or Transient local reference position on a removed or obliterated segment",
			);
		}
		let segment: ISegmentLeaf;

		if (_segment === "start") {
			segment = this.startOfTree;
		} else if (_segment === "end") {
			segment = this.endOfTree;
		} else {
			assertSegmentLeaf(_segment);
			segment = _segment;
		}

		const localRefs = LocalReferenceCollection.setOrGet(segment);

		const segRef = localRefs.createLocalRef(
			offset,
			refType,
			properties,
			slidingPreference,
			canSlideToEndpoint,
		);

		return segRef;
	}

	// Segments should either be removed remotely, removed locally, or inserted locally
	private normalizeAdjacentSegments(affectedSegments: DoublyLinkedList<ISegmentLeaf>): void {
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
			let segmentToSlide: ListNode<ISegmentLeaf> | undefined = lastLocalSegment,
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
					segmentToSlide.data.removes[0].seq !== undefined,
					0x54d /* Removed segment that hasnt had its removal acked should be locally removed */,
				);
				// Slide each locally removed item past all segments that have localSeq > lremoveItem.localSeq
				// but not past remotely removed segments;
				let cur = segmentToSlide;
				let scan = cur.next;
				while (
					scan !== undefined &&
					!isRemovedAndAcked(scan.data) &&
					scan.data.insert.localSeq !== undefined &&
					opstampUtils.greaterThan(scan.data.insert, segmentToSlide.data.removes[0])
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

		const newOrder = Array.from(affectedSegments, ({ data }) => data);
		for (const seg of newOrder)
			seg.localRefs?.walkReferences((lref) => lref.callbacks?.beforeSlide?.(lref));
		const perSegmentTrackingGroups = new Map<ISegmentLeaf, TrackingGroup[]>();
		for (const segment of newOrder) {
			const { trackingCollection } = segment;
			const trackingGroups = [...trackingCollection.trackingGroups];
			perSegmentTrackingGroups.set(segment, trackingGroups);
			for (const group of trackingCollection.trackingGroups) {
				trackingCollection.unlink(group);
			}
		}

		for (let i = 0; i < newOrder.length; i++) {
			const seg = newOrder[i];
			const { parent, index, ordinal } = currentOrder[i];
			assignChild(parent, seg, index, false);
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
		for (const element of newOrder) {
			computeDepth(element);
		}
		for (const [node] of [...depths.entries()].sort((a, b) => b[1] - a[1])) {
			if (!node.isLeaf()) {
				this.nodeUpdateLengthNewStructure(node);
			}
		}
		for (const seg of newOrder)
			seg.localRefs?.walkReferences((lref) => lref.callbacks?.afterSlide?.(lref));
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
		let currentRangeToNormalize = new DoublyLinkedList<ISegmentLeaf>();
		let rangeContainsLocalSegs = false;
		let rangeContainsRemoteRemovedSegs = false;
		const normalize = (): void => {
			if (
				rangeContainsLocalSegs &&
				rangeContainsRemoteRemovedSegs &&
				currentRangeToNormalize.length > 1
			) {
				this.normalizeAdjacentSegments(currentRangeToNormalize);
			}
		};
		walkAllChildSegments(this.root, (seg) => {
			if (isRemoved(seg) || opstampUtils.isLocal(seg.insert)) {
				if (isRemovedAndAcked(seg)) {
					rangeContainsRemoteRemovedSegs = true;
				}
				if (opstampUtils.isLocal(seg.insert)) {
					rangeContainsLocalSegs = true;
				}
				currentRangeToNormalize.push(seg);
			} else {
				normalize();
				currentRangeToNormalize = new DoublyLinkedList<ISegmentLeaf>();
				rangeContainsLocalSegs = false;
				rangeContainsRemoteRemovedSegs = false;
			}

			return true;
		});

		normalize();
	}
	private blockUpdate(block: MergeBlock): void {
		let len: number | undefined;

		const rightmostTiles = createMap<Marker>();
		const leftmostTiles = createMap<Marker>();

		for (let i = 0; i < block.childCount; i++) {
			const node = block.children[i];
			const nodeLength = nodeTotalLength(this, node);
			if (nodeLength !== undefined) {
				len ??= 0;
				len += nodeLength;
			}
			if (node.isLeaf()) {
				const segment = node;
				if ((this.leafLength(segment) ?? 0) > 0 && Marker.is(segment)) {
					const markerId = segment.getId();
					// Also in insertMarker but need for reload segs case
					// can add option for this only from reload segs
					if (markerId) {
						this.idToMarker.set(markerId, segment);
					}

					if (refTypeIncludesFlag(segment, ReferenceType.Tile)) {
						const tileLabels = refGetTileLabels(segment);
						if (tileLabels) {
							for (const tileLabel of tileLabels) {
								// this depends on walking children in order
								// The later, and right most children overwrite
								// whereas early, and left most do not overwrite
								rightmostTiles[tileLabel] = segment;
								leftmostTiles[tileLabel] ??= segment;
							}
						}
					}
				}
			} else {
				extend(rightmostTiles, node.rightmostTiles);
				extendIfUndefined(leftmostTiles, node.leftmostTiles);
			}
		}
		block.leftmostTiles = leftmostTiles;
		block.rightmostTiles = rightmostTiles;
		block.cachedLength = len;
	}

	public blockUpdatePathLengths(
		startBlock: MergeBlock | undefined,
		stamp: OperationStamp,
		newStructure = false,
	): void {
		let block: MergeBlock | undefined = startBlock;
		while (block !== undefined) {
			if (newStructure) {
				this.nodeUpdateLengthNewStructure(block);
			} else {
				this.blockUpdateLength(block, stamp);
			}
			block = block.parent;
		}
	}

	private blockUpdateLength(node: MergeBlock, stamp: OperationStamp): void {
		this.blockUpdate(node);
		this.localPartialsComputed = false;
		if (
			this.collabWindow.collaborating &&
			stamp.seq !== UnassignedSequenceNumber &&
			stamp.seq !== TreeMaintenanceSequenceNumber
		) {
			if (
				node.partialLengths !== undefined &&
				MergeTree.options.incrementalUpdate &&
				stamp.clientId !== NonCollabClient
			) {
				node.partialLengths.update(node, stamp.seq, stamp.clientId, this.collabWindow);
			} else {
				node.partialLengths = PartialSequenceLengths.combine(node, this.collabWindow);
			}

			PartialSequenceLengths.options.verifyExpected?.(this, node, stamp.seq, stamp.clientId);
		}
	}

	/**
	 * Map over all visible segments in a given range
	 *
	 * A segment is visible if its length is greater than 0
	 *
	 * See `this.nodeMap` for additional documentation
	 */
	public mapRange<TClientData>(
		handler: ISegmentAction<TClientData>,
		perspective: Perspective,
		accum: TClientData,
		start?: number,
		end?: number,
		splitRange: boolean = false,
		visibilityPerspective: Perspective = perspective,
	): void {
		if (splitRange) {
			if (start) {
				this.ensureIntervalBoundary(start, perspective);
			}
			if (end) {
				this.ensureIntervalBoundary(end, perspective);
			}
		}
		this.nodeMap(
			perspective,
			(seg, pos, _start, _end) =>
				handler(seg, pos, perspective.refSeq, perspective.clientId, _start, _end, accum),
			undefined,
			start,
			end,
			visibilityPerspective,
		);
	}

	/**
	 * Map over all visible segments in a given range
	 *
	 * A segment is visible if its length is greater than 0
	 *
	 * @param refSeq - The sequence number used to determine the range (start
	 * and end positions) of segments to iterate over.
	 *
	 * @param visibilitySeq - An additional sequence number to further configure
	 * segment visibility during traversal. This is the same as refSeq, except
	 * in the case of obliterate.
	 *
	 * In the case where `refSeq == visibilitySeq`, mapping is done on all
	 * visible segments from `start` to `end`.
	 *
	 * If a segment is invisible at both `visibilitySeq` and `refSeq`, then it
	 * will not be traversed and mapped. Otherwise, if the segment is visible at
	 * either seq, it will be mapped.
	 *
	 * If a segment is only visible at `visibilitySeq`, it will still be mapped,
	 * but it will not count as a segment within the range. That is, it will be
	 * ignored for the purposes of tracking when traversal should end.
	 */
	private nodeMap(
		perspective: Perspective,
		leaf: (segment: ISegmentLeaf, pos: number, start: number, end: number) => boolean,
		post?: (block: MergeBlock) => boolean,
		start: number = 0,
		end?: number,
		visibilityPerspective: Perspective = perspective,
	): void {
		const endPos = end ?? this.nodeLength(this.root, perspective) ?? 0;
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

				const len = this.nodeLength(node, visibilityPerspective);
				const lenAtRefSeq =
					(visibilityPerspective === perspective ? len : this.nodeLength(node, perspective)) ??
					0;

				// NOTE: This code ensures that obliterates have a chance to mark segments which have been inserted locally
				// as also having been obliterated on the local client. With the introduction of RemoteObliteratePerspective,
				// it's feasible we could remove it if the `nodeLength` calculation also respects that perspective for blocks
				// and not just leaves.
				const isUnackedAndInObliterate =
					visibilityPerspective !== perspective &&
					(!node.isLeaf() || opstampUtils.isLocal(node.insert));
				if (
					(len === undefined && lenAtRefSeq === 0) ||
					(len === 0 && !isUnackedAndInObliterate && lenAtRefSeq === 0)
				) {
					return NodeAction.Skip;
				}

				const nextPos = pos + lenAtRefSeq;
				// start is beyond the current node, so we can skip it
				if (start >= nextPos) {
					pos = nextPos;
					return NodeAction.Skip;
				}

				if (node.isLeaf()) {
					if (leaf(node, pos, start - pos, endPos - pos) === false) {
						return NodeAction.Exit;
					}
					pos = nextPos;
				}
			},
			undefined,
			post,
		);
	}
}
