/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { AttributionKey } from "@fluidframework/runtime-definitions/internal";

import { IAttributionCollection } from "./attributionCollection.js";
import { LocalClientId, NonCollabClient, UnassignedSequenceNumber } from "./constants.js";
import { LocalReferenceCollection, type LocalReferencePosition } from "./localReference.js";
import { TrackingGroupCollection } from "./mergeTreeTracking.js";
import { IJSONSegment, IMarkerDef, ReferenceType } from "./ops.js";
import { computeHierarchicalOrdinal } from "./ordinal.js";
import type { PartialSequenceLengths } from "./partialLengths.js";
import { PriorPerspective, type Perspective } from "./perspective.js";
import { PropertySet, clone, createMap, type MapLike } from "./properties.js";
import { ReferencePosition } from "./referencePositions.js";
import { SegmentGroupCollection } from "./segmentGroupCollection.js";
import {
	hasProp,
	isInserted,
	isMergeNodeInfo as isMergeNode,
	isRemoved,
	overwriteInfo,
	type IHasInsertionInfo,
	type IMergeNodeInfo,
	type IHasRemovalInfo,
	type SegmentWithInfo,
} from "./segmentInfos.js";
import { PropertiesManager } from "./segmentPropertiesManager.js";
import type { OperationStamp, SliceRemoveOperationStamp } from "./stamps.js";

/**
 * This interface exposes internal things to dds that leverage merge tree,
 * like sequence and matrix.
 *
 * We use tiered interface to control visibility of segment properties.
 * This sits between ISegment and ISegmentPrivate. It should only expose
 * things tagged internal.
 *
 * Everything added here beyond ISegment should be optional to keep the ability
 * to implicitly convert between the tiered interfaces.
 *
 * @internal
 */
export interface ISegmentInternal extends ISegment {
	localRefs?: LocalReferenceCollection;
	/**
	 * Whether or not this segment is a special segment denoting the start or
	 * end of the tree
	 *
	 * Endpoint segments are imaginary segments positioned immediately before or
	 * after the tree. These segments cannot be referenced by regular operations
	 * and exist primarily as a bucket for local references to slide onto during
	 * deletion of regular segments.
	 */
	readonly endpointType?: "start" | "end";
}

/**
 * We use tiered interface to control visibility of segment properties.
 * This is the lowest interface and is not exported, it site below ISegment and ISegmentInternal.
 * It should only expose unexported things.
 *
 * Everything added here beyond ISegmentInternal should be optional to keep the ability
 * to implicitly convert between the tiered interfaces.
 *
 * someday we may split tree leaves from segments, but for now they are the same
 * this is just a convenience type that makes it clear that we need something that is both a segment and a leaf node
 */
export interface ISegmentPrivate extends ISegmentInternal {
	segmentGroups?: SegmentGroupCollection;
	propertyManager?: PropertiesManager;
	/**
	 * Populated iff this segment was inserted into a range affected by concurrent obliterates at the time of its insertion.
	 * Contains information about the 'most recent' (i.e. 'winning' in the sense below) obliterate.
	 *
	 * BEWARE: We have opted for a certain form of last-write wins (LWW) semantics for obliterates:
	 * the client which last obliterated a range is considered to have "won ownership" of that range and may insert into it
	 * without that insertion being obliterated by other clients' concurrent obliterates.
	 *
	 * Therefore, this field can be populated even if the segment has not been obliterated (i.e. is still visible).
	 * This happens precisely when the segment was inserted by the same client that 'won' the obliterate (in a scenario where
	 * a client first issues a sided obliterate impacting a range, then inserts into that range before the server has acked the obliterate).
	 *
	 * See the test case "obliterate with mismatched final states" for an example of such a scenario.
	 *
	 * TODO:AB#29553: This property is not persisted in the summary, but it should be.
	 */
	obliteratePrecedingInsertion?: ObliterateInfo;
}
/**
 * Segment leafs are segments that have both IMergeNodeInfo and IHasInsertionInfo. This means they
 * are inserted at a position, and bound via their parent MergeBlock to the merge tree. MergeBlocks'
 * children are either a segment leaf, or another merge block for interior nodes of the tree. When working
 * within the tree it is generally unnecessary to use type coercions methods common to the infos, and segment
 * leafs, as the children of MergeBlocks are already well typed. However, when segments come from outside the
 * merge tree, like via client's public methods, it becomes necessary to use the type coercions methods
 * to ensure the passed in segment objects are correctly bound to the merge tree.
 */
export type ISegmentLeaf = SegmentWithInfo<IMergeNodeInfo & IHasInsertionInfo>;
/**
 * A type-guard which determines if the segment has segment leaf, and
 * returns true if it does, along with applying strong typing.
 * @param nodeLike - The segment-like object to check.
 * @returns True if the segment is a segment leaf, otherwise false.
 */
export const isSegmentLeaf = (segmentLike: unknown): segmentLike is ISegmentLeaf =>
	isInserted(segmentLike) && isMergeNode(segmentLike);

/**
 * Converts a segment-like object to a segment leaf object if possible.
 *
 * @param segmentLike - The segment-like object to convert.
 * @returns The segment leaf if the conversion is possible, otherwise undefined.
 */
export const toSegmentLeaf = (segmentLike: unknown): ISegmentLeaf | undefined =>
	isSegmentLeaf(segmentLike) ? segmentLike : undefined;
/**
 * Asserts that the segment is a segment leaf. Usage of this function should not produce a user facing error.
 *
 * @param segmentLike - The segment-like object to check.
 * @throws Will throw an error if the segment is not a segment leaf.
 */
export const assertSegmentLeaf: (segmentLike: unknown) => asserts segmentLike is ISegmentLeaf =
	(segmentLike) => assert(isSegmentLeaf(segmentLike), 0xaab /* must be segment leaf */);
/**
 * This type is used for building MergeBlocks from segments and other MergeBlocks. We need this
 * type as segments may not yet be bound to the tree, so lack merge node info which is required for
 * segment leafs.
 */
export type IMergeNodeBuilder = MergeBlock | SegmentWithInfo<IHasInsertionInfo>;

/**
 * This type is used by MergeBlocks to define their children, which are either segments or other
 * MergeBlocks.
 */
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
}

/**
 * Determine if a segment has been removed.
 * @legacy
 * @alpha
 */
export function segmentIsRemoved(segment: ISegment): boolean {
	return isRemoved(segment);
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
export interface ISegmentChanges {
	next?: SegmentWithInfo<IHasInsertionInfo>;
	replaceCurrent?: SegmentWithInfo<IHasInsertionInfo>;
}

export interface InsertContext {
	candidateSegment?: SegmentWithInfo<IHasInsertionInfo>;
	leaf: (segment: ISegmentLeaf | undefined, pos: number, ic: InsertContext) => ISegmentChanges;
	continuePredicate?: (continueFromBlock: MergeBlock) => boolean;
}

export interface ObliterateInfo {
	start: LocalReferencePosition;
	end: LocalReferencePosition;
	refSeq: number;
	stamp: SliceRemoveOperationStamp;
	segmentGroup: SegmentGroup | undefined;
}

export interface SegmentGroup {
	segments: ISegmentLeaf[];
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
 */
export const MaxNodesInBlock = 8;
export class MergeBlock implements Partial<IMergeNodeInfo> {
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
}
export function assignChild<C extends IMergeNodeBuilder>(
	parent: MergeBlock,
	child: C,
	index: number,
	updateOrdinal = true,
): asserts child is C & IMergeNodeInfo {
	const node = Object.assign<C, IMergeNodeInfo>(child, {
		parent,
		index,
		ordinal: hasProp(child, "ordinal", "string") ? child.ordinal : "",
	});
	if (updateOrdinal) {
		parent.setOrdinal(node, index);
	}
	parent.children[index] = node;
}

export function seqLTE(seq: number, minOrRefSeq: number): boolean {
	return seq !== UnassignedSequenceNumber && seq <= minOrRefSeq;
}

/**
 * @legacy
 * @alpha
 */
export abstract class BaseSegment implements ISegment {
	public cachedLength: number = 0;

	public readonly trackingCollection: TrackingGroupCollection = new TrackingGroupCollection(
		this,
	);
	/***/
	public attribution?: IAttributionCollection<AttributionKey>;

	public properties?: PropertySet;
	public abstract readonly type: string;
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

	protected cloneInto(b: ISegment): void {
		const seg: ISegmentPrivate = b;
		if (isInserted(this)) {
			overwriteInfo<IHasInsertionInfo>(seg, {
				insert: this.insert,
			});
		}
		// TODO: deep clone properties
		seg.properties = clone(this.properties);
		if (isRemoved(this)) {
			overwriteInfo<IHasRemovalInfo>(seg, {
				removes: [...this.removes],
			});
		}

		seg.attribution = this.attribution?.clone();
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

		const leafSegment: ISegmentPrivate | undefined = this.createSplitSegmentAt(pos);

		if (!leafSegment) {
			return undefined;
		}

		if (isMergeNode(this)) {
			overwriteInfo<IMergeNodeInfo>(leafSegment, {
				index: this.index + 1,
				// Give the leaf a temporary yet valid ordinal.
				// when this segment is put in the tree, it will get its real ordinal,
				// but this ordinal meets all the necessary invariants for now.
				// Ordinals exist purely for lexicographical sort order and use a small set of valid bytes for each string character.
				// The extra handling fromCodePoint has for things like surrogate pairs is therefore unnecessary.
				// eslint-disable-next-line unicorn/prefer-code-point
				ordinal: this.ordinal + String.fromCharCode(0),
				parent: this.parent,
			});
		}

		if (isInserted(this)) {
			overwriteInfo<IHasInsertionInfo>(leafSegment, { insert: this.insert });
		}
		if (isRemoved(this)) {
			overwriteInfo<IHasRemovalInfo>(leafSegment, {
				removes: [...this.removes],
			});
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

	public get minSeqStamp(): OperationStamp {
		return { seq: this.minSeq, clientId: NonCollabClient };
	}

	public get minSeqPerspective(): Perspective {
		return new PriorPerspective(this.minSeq, NonCollabClient);
	}

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
	 * (note that localSeq tracks the localSeq at which a segment was inserted)
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
