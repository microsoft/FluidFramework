/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { assert } from "@fluidframework/core-utils/internal";
import { AttributionKey } from "@fluidframework/runtime-definitions/internal";

import { IAttributionCollection } from "./attributionCollection.js";
import {
	LocalClientId,
	UnassignedSequenceNumber,
	UniversalSequenceNumber,
} from "./constants.js";
// eslint-disable-next-line import/no-deprecated
import { LocalReferenceCollection, type LocalReferencePosition } from "./localReference.js";
import { TrackingGroupCollection } from "./mergeTreeTracking.js";
import { IJSONSegment, IMarkerDef, ReferenceType } from "./ops.js";
import { computeHierarchicalOrdinal } from "./ordinal.js";
import type { PartialSequenceLengths } from "./partialLengths.js";
import { PropertySet, clone, createMap, type MapLike } from "./properties.js";
import {
	ReferencePosition,
	refGetTileLabels,
	refTypeIncludesFlag,
} from "./referencePositions.js";
// eslint-disable-next-line import/no-deprecated
import { SegmentGroupCollection } from "./segmentGroupCollection.js";
// eslint-disable-next-line import/no-deprecated
import {
	hasInsertionInfo,
	hasMoveInfo,
	hasRemovalInfo,
	type IInsertionInfo,
	// eslint-disable-next-line import/no-deprecated
	type IMoveInfo,
	// eslint-disable-next-line import/no-deprecated
	type IRemovalInfo,
} from "./segmentInfos.js";
import { PropertiesManager } from "./segmentPropertiesManager.js";

/**
 * Common properties for a node in a merge tree.
 * @legacy
 * @alpha
 * @deprecated - This interface will be removed in 2.20 with no replacement.
 */
export interface IMergeNodeCommon {
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

/**
 * This interface exposes internal things to dds that leverage merge tree,
 * like sequence and matrix.
 *
 * We use tiered interface to control visibility of segment properties.
 * This sits between ISegment and ISegmentLeaf. It should only expose
 * things tagged internal.
 *
 * @internal
 */
export type ISegmentInternal = Omit<
	ISegment,
	// eslint-disable-next-line import/no-deprecated
	keyof IRemovalInfo | keyof IMoveInfo
> &
	// eslint-disable-next-line import/no-deprecated
	Partial<IInsertionInfo & IRemovalInfo & IMoveInfo & IMergeNodeCommon> & {
		// eslint-disable-next-line import/no-deprecated
		localRefs?: LocalReferenceCollection;
	};

/**
 * We use tiered interface to control visibility of segment properties.
 * This is the lowest interface and is not exported, it site below ISegment and ISegmentInternal.
 * It should only expose unexported things.
 *
 * someday we may split tree leaves from segments, but for now they are the same
 * this is just a convenience type that makes it clear that we need something that is both a segment and a leaf node
 */
export type ISegmentLeaf = ISegmentInternal & {
	parent?: MergeBlock;
	// eslint-disable-next-line import/no-deprecated
	segmentGroups?: SegmentGroupCollection;
	// eslint-disable-next-line import/no-deprecated
	propertyManager?: PropertiesManager;
	/**
	 * If a segment is inserted into an obliterated range,
	 * but the newest obliteration of that range was by the inserting client,
	 * then the segment is not obliterated because it is aware of the latest obliteration.
	 */
	prevObliterateByInserter?: ObliterateInfo;
};
export type IMergeNode = MergeBlock | ISegmentLeaf;

/**
 * A segment representing a portion of the merge tree.
 * Segments are leaf nodes of the merge tree and contain data.
 * @legacy
 * @alpha
 */
export interface ISegment {
	readonly type: string;

	readonly trackingCollection: TrackingGroupCollection;
	/**
	 * Whether or not this segment is a special segment denoting the start or
	 * end of the tree
	 *
	 * Endpoint segments are imaginary segments positioned immediately before or
	 * after the tree. These segments cannot be referenced by regular operations
	 * and exist primarily as a bucket for local references to slide onto during
	 * deletion of regular segments.
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	readonly endpointType?: "start" | "end";

	/**
	 * The length of the contents of the node.
	 */
	cachedLength: number;
	/**
	 * Stores attribution keys associated with offsets of this segment.
	 * This data is only persisted if MergeTree's `attributions.track` flag is set to true.
	 * Pending segments (i.e. ones that only exist locally and haven't been acked by the server) also have
	 * `attribution === undefined` until ack.
	 *
	 * Keys can be used opaquely with an IAttributor or a container runtime that provides attribution.
	 * @remarks There are plans to make the shape of the data stored extensible in a couple ways:
	 *
	 * 1. Injection of custom attribution information associated with the segment (ex: copy-paste of
	 * content but keeping the old attribution information).
	 *
	 * 2. Storage of multiple "channels" of information (ex: track property changes separately from insertion,
	 * or only attribute certain property modifications, etc.)
	 */
	attribution?: IAttributionCollection<AttributionKey>;

	/**
	 * Local seq at which this segment was inserted.
	 * This is defined if and only if the insertion of the segment is pending ack, i.e. `seq` is UnassignedSequenceNumber.
	 * Once the segment is acked, this field is cleared.
	 *
	 * @privateRemarks
	 * See {@link CollaborationWindow.localSeq} for more information on the semantics of localSeq.
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	localSeq?: number;
	/**
	 * Seq at which this segment was inserted.
	 * If undefined, it is assumed the segment was inserted prior to the collab window's minimum sequence number.
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	seq?: number;
	/**
	 * Short clientId for the client that inserted this segment.
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	clientId: number;
	/**
	 * Local references added to this segment.
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	// eslint-disable-next-line import/no-deprecated
	localRefs?: LocalReferenceCollection;
	/**
	 * Properties that have been added to this segment via annotation.
	 */
	properties?: PropertySet;

	clone(): ISegment;
	canAppend(segment: ISegment): boolean;
	append(segment: ISegment): void;
	splitAt(pos: number): ISegment | undefined;
	// Changing this to something other than any would break consumers.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	toJSONObject(): any;
	isLeaf(): this is ISegment;

	/**
	 * {@inheritDoc @fluidframework/merge-tree#IMergeNodeCommon.index}
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	index: number;
	/**
	 * {@inheritDoc @fluidframework/merge-tree#IMergeNodeCommon.ordinal}
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	ordinal: string;

	/**
	 * Local seq at which this segment was removed. If this is defined, `removedSeq` will initially be set to
	 * UnassignedSequenceNumber. However, if another client concurrently removes the same segment, `removedSeq`
	 * will be updated to the seq at which that client removed this segment.
	 *
	 * Like {@link ISegment.localSeq}, this field is cleared once the local removal of the segment is acked.
	 *
	 * @privateRemarks
	 * See {@link CollaborationWindow.localSeq} for more information on the semantics of localSeq.
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	localRemovedSeq?: number;
	/**
	 * {@inheritDoc @fluidframework/merge-tree#IRemovalInfo.removedSeq}
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	removedSeq?: number;
	/**
	 * {@inheritDoc @fluidframework/merge-tree#IRemovalInfo.removedClientIds}
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	removedClientIds?: number[];
	/**
	 * {@inheritDoc @fluidframework/merge-tree#IMoveInfo.localMovedSeq}
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	localMovedSeq?: number;
	/**
	 * {@inheritDoc @fluidframework/merge-tree#IMoveInfo.movedSeq}
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	movedSeq?: number;

	/**
	 * {@inheritDoc @fluidframework/merge-tree#IMoveInfo.movedSeqs}
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	movedSeqs?: number[];
	/**
	 * {@inheritDoc @fluidframework/merge-tree#IMoveInfo.moveDst}
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	moveDst?: ReferencePosition;
	/**
	 * {@inheritDoc @fluidframework/merge-tree#IMoveInfo.movedClientIds}
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	movedClientIds?: number[];
	/**
	 * {@inheritDoc @fluidframework/merge-tree#IMoveInfo.wasMovedOnInsert}
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	wasMovedOnInsert?: boolean;
}

/**
 * Determine if a segment has been removed.
 * @legacy
 * @alpha
 */
export function segmentIsRemoved(segment: ISegment): boolean {
	const leaf: ISegmentLeaf = segment;
	return leaf.removedSeq !== undefined;
}

/**
 * @internal
 */
export interface IMarkerModifiedAction {
	// eslint-disable-next-line @typescript-eslint/prefer-function-type
	(marker: Marker): void;
}

/**
 * @legacy
 * @alpha
 */
export interface ISegmentAction<TClientData> {
	// eslint-disable-next-line @typescript-eslint/prefer-function-type
	(
		segment: ISegment,
		pos: number,
		refSeq: number,
		clientId: number,
		start: number,
		end: number,
		accum: TClientData,
	): boolean;
}
/**
 * @internal
 */
export interface ISegmentChanges {
	next?: ISegmentInternal;
	replaceCurrent?: ISegmentInternal;
}
/**
 * @internal
 */
export interface BlockAction<TClientData> {
	// eslint-disable-next-line @typescript-eslint/prefer-function-type
	(
		block: MergeBlock,
		pos: number,
		refSeq: number,
		clientId: number,
		start: number | undefined,
		end: number | undefined,
		accum: TClientData,
	): boolean;
}

/**
 * @internal
 */
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

/**
 * @internal
 */
export interface InsertContext {
	candidateSegment?: ISegmentInternal;
	leaf: (
		segment: ISegmentInternal | undefined,
		pos: number,
		ic: InsertContext,
	) => ISegmentChanges;
	continuePredicate?: (continueFromBlock: MergeBlock) => boolean;
}

/**
 * @internal
 */
export interface SegmentActions<TClientData> {
	leaf?: ISegmentAction<TClientData>;
	shift?: NodeAction<TClientData>;
	contains?: NodeAction<TClientData>;
	pre?: BlockAction<TClientData>;
	post?: BlockAction<TClientData>;
}

/**
 * @internal
 */
export interface ObliterateInfo {
	start: LocalReferencePosition;
	end: LocalReferencePosition;
	refSeq: number;
	clientId: number;
	seq: number;
	localSeq: number | undefined;
	segmentGroup: SegmentGroup | undefined;
}

/**
 * @internal
 */
export interface SegmentGroup<S extends ISegmentInternal = ISegmentInternal> {
	segments: S[];
	previousProps?: PropertySet[];
	localSeq?: number;
	refSeq: number;
	obliterateInfo?: ObliterateInfo;
}

/**
 * Note that the actual branching factor of the MergeTree is `MaxNodesInBlock - 1`.  This is because
 * the MergeTree always inserts first, then checks for overflow and splits if the child count equals
 * `MaxNodesInBlock`.  (i.e., `MaxNodesInBlock` contains 1 extra slot for temporary storage to
 * facilitate splits.)
 * @internal
 */
export const MaxNodesInBlock = 8;
/**
 * @internal
 */
export class MergeBlock implements IMergeNodeCommon {
	public children: IMergeNode[];
	public needsScour?: boolean;
	public parent?: MergeBlock;
	public index: number = 0;
	public ordinal: string = "";
	public cachedLength: number | undefined = 0;

	/**
	 * Maps each tile label in this block to the rightmost (i.e. furthest) marker associated with that tile label.
	 * When combined with the tree structure of MergeBlocks, this allows accelerated queries for nearest tile
	 * with a certain label before a given position
	 */
	public rightmostTiles: Readonly<MapLike<Marker>>;
	/**
	 * Maps each tile label in this block to the leftmost (i.e. nearest) marker associated with that tile label.
	 * When combined with the tree structure of MergeBlocks, this allows accelerated queries for nearest tile
	 * with a certain label before a given position
	 */
	public leftmostTiles: Readonly<MapLike<Marker>>;

	isLeaf(): this is ISegmentInternal {
		return false;
	}

	/**
	 * Supports querying the total length of all descendants of this IMergeBlock from the perspective of any
	 * (clientId, seq) within the collab window.
	 *
	 * @remarks This is only optional for implementation reasons (internal nodes can be created/moved without
	 * immediately initializing the partial lengths). Aside from mid-update on tree operations, these lengths
	 * objects are always defined.
	 */
	partialLengths?: PartialSequenceLengths;

	public constructor(public childCount: number) {
		// Suppression needed due to the way the merge tree children are initalized - we
		// allocate 8 children blocks, but any unused blocks are not counted in the childCount.
		// Using Array.from leads to unused children being undefined, which are counted in childCount.
		// eslint-disable-next-line unicorn/no-new-array
		this.children = new Array<IMergeNode>(MaxNodesInBlock);
		this.rightmostTiles = createMap<Marker>();
		this.leftmostTiles = createMap<Marker>();
	}

	public setOrdinal(child: IMergeNode, index: number): void {
		const childCount = this.childCount;
		assert(
			childCount >= 1 && childCount <= MaxNodesInBlock,
			0x040 /* "Child count is not within [1,8] range!" */,
		);
		child.ordinal = computeHierarchicalOrdinal(
			MaxNodesInBlock,
			childCount,
			this.ordinal,
			index === 0 ? undefined : this.children[index - 1]?.ordinal,
		);
	}

	public assignChild(child: IMergeNode, index: number, updateOrdinal = true): void {
		child.parent = this;
		child.index = index;
		if (updateOrdinal) {
			this.setOrdinal(child, index);
		}
		this.children[index] = child;
	}
}

export function seqLTE(seq: number, minOrRefSeq: number): boolean {
	return seq !== UnassignedSequenceNumber && seq <= minOrRefSeq;
}

/**
 * @legacy
 * @alpha
 */
export abstract class BaseSegment implements ISegment {
	/**
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	public clientId: number = LocalClientId;
	/**
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	public seq: number = UniversalSequenceNumber;
	/**
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	public removedSeq?: number;
	/**
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	public removedClientIds?: number[];
	/**
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	public movedSeq?: number;
	/**
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	public movedSeqs?: number[];
	/**
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	public movedClientIds?: number[];
	/**
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	public wasMovedOnInsert?: boolean | undefined;
	/**
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	public index: number = 0;
	/**
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	public ordinal: string = "";
	public cachedLength: number = 0;

	public readonly trackingCollection: TrackingGroupCollection = new TrackingGroupCollection(
		this,
	);
	/***/
	public attribution?: IAttributionCollection<AttributionKey>;

	public properties?: PropertySet;
	/**
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	// eslint-disable-next-line import/no-deprecated
	public localRefs?: LocalReferenceCollection;
	public abstract readonly type: string;
	/**
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	public localSeq?: number;
	/**
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	public localRemovedSeq?: number;
	/**
	 * @deprecated - This property will be removed in 2.20 with no replacement.
	 */
	public localMovedSeq?: number;

	public constructor(properties?: PropertySet) {
		if (properties !== undefined) {
			this.properties = clone(properties);
		}
	}

	public hasProperty(key: string): boolean {
		return !!this.properties && this.properties[key] !== undefined;
	}

	public isLeaf(): this is ISegment {
		return true;
	}

	protected cloneInto(seg: ISegment): void {
		const b: ISegmentLeaf = seg;
		if (hasInsertionInfo(this)) {
			b.clientId = this.clientId;
			b.seq = this.seq;
		}
		// TODO: deep clone properties
		b.properties = clone(this.properties);
		if (hasRemovalInfo(this)) {
			b.removedSeq = this.removedSeq;
			b.removedClientIds = [...this.removedClientIds];
		}
		if (hasMoveInfo(this)) {
			b.movedSeq = this.movedSeq;
			b.movedSeqs = [...this.movedSeqs];
			b.wasMovedOnInsert = this.wasMovedOnInsert;
			b.movedClientIds = [...this.movedClientIds];
		}
		b.attribution = this.attribution?.clone();
	}

	public canAppend(segment: ISegment): boolean {
		return false;
	}

	protected addSerializedProps(jseg: IJSONSegment): void {
		if (this.properties) {
			jseg.props = { ...this.properties };
		}
	}
	// This has to return any type because the return type is different for different segment types.
	// TODO: If possible, change the return type to match what should be returned for each segment type.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public abstract toJSONObject(): any;

	public splitAt(pos: number): ISegment | undefined {
		if (pos <= 0) {
			return undefined;
		}

		const leafSegment: ISegmentLeaf | undefined = this.createSplitSegmentAt(pos);

		if (!leafSegment) {
			return undefined;
		}

		// eslint-disable-next-line @typescript-eslint/no-this-alias, unicorn/no-this-assignment
		const thisAsMergeSegment: ISegmentLeaf = this;
		leafSegment.parent = thisAsMergeSegment.parent;

		// Give the leaf a temporary yet valid ordinal.
		// when this segment is put in the tree, it will get its real ordinal,
		// but this ordinal meets all the necessary invariants for now.
		// Ordinals exist purely for lexicographical sort order and use a small set of valid bytes for each string character.
		// The extra handling fromCodePoint has for things like surrogate pairs is therefore unnecessary.
		// eslint-disable-next-line unicorn/prefer-code-point
		leafSegment.ordinal = this.ordinal + String.fromCharCode(0);

		if (hasInsertionInfo(this)) {
			leafSegment.seq = this.seq;
			leafSegment.localSeq = this.localSeq;
			leafSegment.clientId = this.clientId;
		}
		if (hasRemovalInfo(this)) {
			leafSegment.removedClientIds = [...this.removedClientIds];
			leafSegment.removedSeq = this.removedSeq;
			leafSegment.localRemovedSeq = this.localRemovedSeq;
		}
		if (hasMoveInfo(this)) {
			leafSegment.movedClientIds = [...this.movedClientIds];
			leafSegment.movedSeq = this.movedSeq;
			leafSegment.movedSeqs = [...this.movedSeqs];
			leafSegment.localMovedSeq = this.localMovedSeq;
			leafSegment.wasMovedOnInsert = this.wasMovedOnInsert;
		}

		this.trackingCollection.copyTo(leafSegment);
		if (this.attribution) {
			leafSegment.attribution = this.attribution.splitAt(pos);
		}

		return leafSegment;
	}

	public abstract clone(): ISegment;

	public append(other: ISegment): void {
		// Note: Must call 'appendLocalRefs' before modifying this segment's length as
		//       'this.cachedLength' is used to adjust the offsets of the local refs.
		// eslint-disable-next-line import/no-deprecated
		LocalReferenceCollection.append(this, other);
		if (this.attribution) {
			assert(
				other.attribution !== undefined,
				0x4bd /* attribution should be set on appendee */,
			);
			this.attribution.append(other.attribution);
		} else {
			assert(
				other.attribution === undefined,
				0x4be /* attribution should not be set on appendee */,
			);
		}

		this.cachedLength ??= 0;
		this.cachedLength += other.cachedLength;
	}

	protected abstract createSplitSegmentAt(pos: number): BaseSegment | undefined;
}

/**
 * The special-cased property key that tracks the id of a {@link Marker}.
 *
 * @remarks In general, marker ids should be accessed using the inherent method
 * {@link Marker.getId}. Marker ids should not be updated after creation.
 * @legacy
 * @alpha
 */
export const reservedMarkerIdKey = "markerId";

/**
 * @internal
 */
export const reservedMarkerSimpleTypeKey = "markerSimpleType";

/**
 * @legacy
 * @alpha
 */
export interface IJSONMarkerSegment extends IJSONSegment {
	marker: IMarkerDef;
}

/**
 * Markers are a special kind of segment that do not hold any content.
 *
 * Markers with a reference type of {@link ReferenceType.Tile} support spatially
 * accelerated queries for finding the next marker to the left or right of it in
 * sub-linear time. This is useful, for example, in the case of jumping from the
 * start of a paragraph to the end, assuming a paragraph is bound by markers at
 * the start and end.
 *
 * @legacy
 * @alpha
 */
export class Marker extends BaseSegment implements ReferencePosition, ISegment {
	public static readonly type = "Marker";
	public static is(segment: ISegment): segment is Marker {
		return segment.type === Marker.type;
	}
	public readonly type = Marker.type;

	public static make(refType: ReferenceType, props?: PropertySet): Marker {
		return new Marker(refType, props);
	}

	constructor(
		public refType: ReferenceType,
		props?: PropertySet,
	) {
		super(props);
		this.cachedLength = 1;
	}

	toJSONObject(): IJSONMarkerSegment {
		const obj: IJSONMarkerSegment = { marker: { refType: this.refType } };
		super.addSerializedProps(obj);
		return obj;
	}

	static fromJSONObject(spec: IJSONSegment): Marker | undefined {
		if (spec && typeof spec === "object" && "marker" in spec) {
			return Marker.make((spec.marker as Marker).refType, spec.props as PropertySet);
		}
		return undefined;
	}

	clone(): Marker {
		const b = Marker.make(this.refType, this.properties);
		this.cloneInto(b);
		return b;
	}

	getSegment(): Marker {
		return this;
	}

	getOffset(): number {
		return 0;
	}

	getProperties(): PropertySet | undefined {
		return this.properties;
	}

	getId(): string | undefined {
		return this.properties?.[reservedMarkerIdKey] as string;
	}

	toString(): string {
		return `M${this.getId()}`;
	}

	protected createSplitSegmentAt(pos: number): undefined {
		return undefined;
	}

	canAppend(segment: ISegment): boolean {
		return false;
	}

	append(): void {
		throw new Error("Can not append to marker");
	}
}

/**
 * This class is used to track facts about the current window of collaboration. This window is defined by the server
 * specified minimum sequence number to the last sequence number seen. Additionally, it track state for outstanding
 * local operations.
 * @internal
 */
export class CollaborationWindow {
	clientId = LocalClientId;
	collaborating = false;

	/**
	 * Lowest-numbered segment in window; no client can reference a state before this one
	 */
	minSeq = 0;
	/**
	 * Highest-numbered segment in window and current reference sequence number for this client.
	 */
	currentSeq = 0;

	/**
	 * Highest-numbered localSeq used for a pending segment.
	 * Semantically, `localSeq`s provide an ordering on in-flight merge-tree operations:
	 * for operations stamped with localSeqs `a` and `b`, `a < b` if and only if `a` was submitted before `b`.
	 *
	 * @remarks - This field is analogous to the `clientSequenceNumber` field on ops, but it's accessible to merge-tree
	 * at op submission time rather than only at ack time. This enables more natural state tracking for in-flight ops.
	 *
	 * It's useful to stamp ops with such an incrementing counter because it enables reasoning about which segments existed from
	 * the perspective of the local client at a given point in 'un-acked' time, which is necessary to support the reconnect flow.
	 *
	 * For example, imagine a client with initial state "123456" submits some ops to create the text "123456ABC".
	 * If they insert the "C" first, then "B", then "A", their local segment state might look like this:
	 * ```js
	 * [
	 *     { seq: 0, text: "1234" },
	 *     { seq: 5, text: "56" },
	 *     { localSeq: 3, seq: UnassignedSequenceNumber, text: "A" },
	 *     { localSeq: 2, seq: UnassignedSequenceNumber, text: "B" },
	 *     { localSeq: 1, seq: UnassignedSequenceNumber, text: "C" },
	 * ]
	 * ```
	 * (note that {@link IInsertionInfo.localSeq} tracks the localSeq at which a segment was inserted)
	 *
	 * Suppose the client then disconnects and reconnects before any of its insertions are acked. The reconnect flow will necessitate
	 * that the client regenerates and resubmits ops based on its current segment state as well as the original op that was sent.
	 *
	 * It will generate the ops
	 * 1. \{ pos: 6, text: "C" \}
	 * 2. \{ pos: 6, text: "B" \}
	 * 3. \{ pos: 6, text: "A" \}
	 *
	 * since when submitting the first op, remote clients don't know that this client is about to submit the "A" and "B".
	 *
	 * On the other hand, imagine if the client had originally submitted the ops in the order "A", "B", "C"
	 * such that the segments' local state was instead:
	 *
	 * ```js
	 * [
	 *     { seq: 0, text: "1234" },
	 *     { seq: 5, text: "56" },
	 *     { localSeq: 1, seq: UnassignedSequenceNumber, text: "A" },
	 *     { localSeq: 2, seq: UnassignedSequenceNumber, text: "B" },
	 *     { localSeq: 3, seq: UnassignedSequenceNumber, text: "C" },
	 * ]
	 * ```
	 *
	 * The resubmitted ops should instead be:
	 * 1. \{ pos: 6, text: "A" \}
	 * 2. \{ pos: 7, text: "B" \}
	 * 3. \{ pos: 8, text: "C" \}
	 *
	 * since remote clients will have seen the "A" when processing the "B" as well as both the "A" and "B" when processing the "C".
	 * As can be seen, the list of resubmitted ops is different in the two cases despite the merge-tree's segment state only differing
	 * in `localSeq`.
	 *
	 * This example is a bit simplified from the general scenario: since no remote clients modified the merge-tree while the client
	 * was disconnected, the resubmitted ops end up matching the original ops exactly.
	 * However, this is not generally true: the production reconnect code takes into account visibility of segments based on both acked
	 * and local information as appropriate.
	 * Nonetheless, this simple scenario is enough to understand why it's useful to be able to determine if a segment should be visible
	 * from a given (seq, localSeq) perspective.
	 */
	localSeq = 0;

	loadFrom(a: CollaborationWindow): void {
		this.clientId = a.clientId;
		this.collaborating = a.collaborating;
		this.minSeq = a.minSeq;
		this.currentSeq = a.currentSeq;
	}
}

/**
 * Compares two numbers.
 */
export const compareNumbers = (a: number, b: number): number => a - b;

/**
 * Compares two strings.
 */
export const compareStrings = (a: string, b: string): number => a.localeCompare(b);

/**
 * Get a human-readable string for a given {@link Marker}.
 *
 * @remarks This function is intended for debugging only. The exact format of
 * this string should not be relied upon between versions.
 * @internal
 */
export function debugMarkerToString(marker: Marker): string {
	let bbuf = "";
	if (refTypeIncludesFlag(marker, ReferenceType.Tile)) {
		bbuf += "Tile";
	}
	let lbuf = "";
	const id = marker.getId();
	if (id) {
		bbuf += ` (${id}) `;
	}
	const tileLabels = refGetTileLabels(marker);
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

	let pbuf = "";
	if (marker.properties) {
		pbuf += JSON.stringify(marker.properties, (key, value) => {
			// Avoid circular reference when stringifying makers containing handles.
			// (Substitute a debug string instead.)
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
			const handle = !!value && value.IFluidHandle;

			// eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
			return handle ? `#Handle(${handle.routeContext.path}/${handle.path})` : value;
		});
	}
	return `M ${bbuf}: ${lbuf} ${pbuf}`;
}
