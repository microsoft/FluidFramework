/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { assert } from "@fluidframework/core-utils";
import { AttributionKey } from "@fluidframework/runtime-definitions";
import { IAttributionCollection } from "./attributionCollection.js";
import { LocalClientId, UnassignedSequenceNumber, UniversalSequenceNumber } from "./constants.js";
import { LocalReferenceCollection } from "./localReference.js";
import { IMergeTreeDeltaOpArgs } from "./mergeTreeDeltaCallback.js";
import { TrackingGroupCollection } from "./mergeTreeTracking.js";
import { IJSONSegment, IMarkerDef, MergeTreeDeltaType, ReferenceType } from "./ops.js";
import { computeHierarchicalOrdinal } from "./ordinal.js";
import { PartialSequenceLengths } from "./partialLengths.js";
// eslint-disable-next-line import/no-deprecated
import { clone, createMap, MapLike, PropertySet } from "./properties.js";
import { refTypeIncludesFlag, ReferencePosition, refGetTileLabels } from "./referencePositions.js";
import { SegmentGroupCollection } from "./segmentGroupCollection.js";
import { PropertiesManager, PropertiesRollback } from "./segmentPropertiesManager.js";

/**
 * Common properties for a node in a merge tree.
 * @alpha
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
 * someday we may split tree leaves from segments, but for now they are the same
 * this is just a convenience type that makes it clear that we need something that is both a segment and a leaf node
 */
export type ISegmentLeaf = ISegment & { parent?: IMergeBlock };
export type IMergeNode = IMergeBlock | ISegmentLeaf;
/**
 * Internal (i.e. non-leaf) node in a merge tree.
 * @internal
 */
export interface IMergeBlock extends IMergeNodeCommon {
	parent?: IMergeBlock;

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
	/**
	 * The length of the contents of the node.
	 */
	cachedLength: number | undefined;
	hierBlock(): IHierBlock | undefined;
	assignChild(child: IMergeNode, index: number, updateOrdinal?: boolean): void;
	setOrdinal(child: IMergeNode, index: number): void;
}

/**
 * @internal
 */
export interface IHierBlock extends IMergeBlock {
	rightmostTiles: MapLike<ReferencePosition>;
	leftmostTiles: MapLike<ReferencePosition>;
}

/**
 * Contains removal information associated to an {@link ISegment}.
 * @alpha
 */
export interface IRemovalInfo {
	/**
	 * Local seq at which this segment was removed, if the removal is yet-to-be acked.
	 */
	localRemovedSeq?: number;
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

/**
 * @internal
 */
export function toRemovalInfo(maybe: Partial<IRemovalInfo> | undefined): IRemovalInfo | undefined {
	if (maybe?.removedClientIds !== undefined && maybe?.removedSeq !== undefined) {
		return maybe as IRemovalInfo;
	}
	assert(
		maybe?.removedClientIds === undefined && maybe?.removedSeq === undefined,
		0x2bf /* "both removedClientIds and removedSeq should be set or not set" */,
	);
}

/**
 * Tracks information about when and where this segment was moved to.
 *
 * Note that merge-tree does not currently support moving and only supports
 * obliterate. The fields below include "move" in their names to avoid renaming
 * in the future, when moves _are_ supported.
 * @alpha
 */
export interface IMoveInfo {
	/**
	 * Local seq at which this segment was moved if the move is yet-to-be
	 * acked.
	 */
	localMovedSeq?: number;

	/**
	 * The first seq at which this segment was moved.
	 */
	movedSeq: number;

	/**
	 * All seqs at which this segment was moved. In the case of overlapping,
	 * concurrent moves this array will contain multiple seqs.
	 *
	 * The seq at  `movedSeqs[i]` corresponds to the client id at `movedClientIds[i]`.
	 *
	 * The first element corresponds to the seq of the first move
	 */
	movedSeqs: number[];

	/**
	 * A reference to the inserted destination segment corresponding to this
	 * segment's move.
	 *
	 * If undefined, the move was an obliterate.
	 *
	 * Currently this field is unused, as we only support obliterate operations
	 */
	moveDst?: ReferencePosition;

	/**
	 * List of client IDs that have moved this segment.
	 *
	 * The client that actually moved the segment (i.e. whose move op was sequenced
	 * first) is stored as the first client in this list. Other clients in the
	 * list have all issued concurrent ops to move the segment.
	 */
	movedClientIds: number[];

	/**
	 * If this segment was inserted into a concurrently moved range and
	 * the move op was sequenced before the insertion op. In this case,
	 * the segment is visible only to the inserting client
	 *
	 * `wasMovedOnInsert` only applies for acked obliterates. That is, if
	 * a segment inserted by a remote client is moved on insertion by a local
	 * and unacked obliterate, we do not consider it as having been moved
	 * on insert
	 *
	 * If a segment is moved on insertion, its length is only ever visible to
	 * the client that inserted the segment. This is relevant in partial length
	 * calculations
	 */
	wasMovedOnInsert: boolean;
}

export function toMoveInfo(maybe: Partial<IMoveInfo> | undefined): IMoveInfo | undefined {
	if (maybe?.movedClientIds !== undefined && maybe?.movedSeq !== undefined) {
		return maybe as IMoveInfo;
	}
	assert(
		maybe?.movedClientIds === undefined &&
			maybe?.movedSeq === undefined &&
			maybe?.movedSeqs === undefined &&
			maybe?.wasMovedOnInsert === undefined,
		0x86d /* movedClientIds, movedSeq, wasMovedOnInsert, and movedSeqs should all be either set or not set */,
	);
}

/**
 * A segment representing a portion of the merge tree.
 * Segments are leaf nodes of the merge tree and contain data.
 * @alpha
 */
export interface ISegment extends IMergeNodeCommon, Partial<IRemovalInfo>, Partial<IMoveInfo> {
	readonly type: string;
	readonly segmentGroups: SegmentGroupCollection;
	readonly trackingCollection: TrackingGroupCollection;
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
	 * Manages pending local state for properties on this segment.
	 */
	propertyManager?: PropertiesManager;
	/**
	 * Local seq at which this segment was inserted.
	 * This is defined if and only if the insertion of the segment is pending ack, i.e. `seq` is UnassignedSequenceNumber.
	 * Once the segment is acked, this field is cleared.
	 *
	 * See {@link CollaborationWindow.localSeq} for more information on the semantics of localSeq.
	 */
	localSeq?: number;
	/**
	 * Local seq at which this segment was removed. If this is defined, `removedSeq` will initially be set to
	 * UnassignedSequenceNumber. However, if another client concurrently removes the same segment, `removedSeq`
	 * will be updated to the seq at which that client removed this segment.
	 *
	 * Like {@link ISegment.localSeq}, this field is cleared once the local removal of the segment is acked.
	 * See {@link CollaborationWindow.localSeq} for more information on the semantics of localSeq.
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

	/**
	 * Add properties to this segment via annotation.
	 *
	 * @remarks This function should not be called directly. Properties should
	 * be added through the `annotateRange` functions.
	 */
	addProperties(
		newProps: PropertySet,
		seq?: number,
		collaborating?: boolean,
		rollback?: PropertiesRollback,
	): PropertySet;
	clone(): ISegment;
	canAppend(segment: ISegment): boolean;
	append(segment: ISegment): void;
	splitAt(pos: number): ISegment | undefined;
	toJSONObject(): any;
	/**
	 * Acks the current segment against the segment group, op, and merge tree.
	 *
	 * @param segmentGroup - Pending segment group associated with this op.
	 * @param opArgs - Information about the op that was acked
	 * @returns `true` if the op modifies the segment, otherwise `false`.
	 * The only current false case is overlapping remove, where a segment is removed
	 * by a previously sequenced operation before the current operation is acked.
	 * @throws - error if the segment state doesn't match segment group or op.
	 * E.g. if the segment group is not first in the pending queue, or
	 * an inserted segment does not have unassigned sequence number.
	 */
	ack(segmentGroup: SegmentGroup, opArgs: IMergeTreeDeltaOpArgs): boolean;
}

/**
 * @internal
 */
export interface IMarkerModifiedAction {
	// eslint-disable-next-line @typescript-eslint/prefer-function-type
	(marker: Marker): void;
}

/**
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
	next?: ISegment;
	replaceCurrent?: ISegment;
}
/**
 * @internal
 */
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
	candidateSegment?: ISegment;
	leaf: (segment: ISegment | undefined, pos: number, ic: InsertContext) => ISegmentChanges;
	continuePredicate?: (continueFromBlock: IMergeBlock) => boolean;
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
 * @deprecated This functionality was not meant to be exported and will be removed in a future release
 * @alpha
 */
export interface SegmentGroup {
	segments: ISegment[];
	previousProps?: PropertySet[];
	localSeq?: number;
	refSeq: number;
}

/**
 * @alpha
 */
export class MergeNode implements IMergeNodeCommon {
	index: number = 0;
	ordinal: string = "";
	cachedLength: number = 0;

	isLeaf(): this is ISegment {
		return false;
	}
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
export class MergeBlock extends MergeNode implements IMergeBlock {
	parent?: IMergeBlock;
	public children: IMergeNode[];
	public constructor(public childCount: number) {
		super();
		this.children = new Array<IMergeNode>(MaxNodesInBlock);
	}

	public hierBlock(): IHierBlock | undefined {
		return undefined;
	}

	public setOrdinal(child: IMergeNode, index: number) {
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

	public assignChild(child: IMergeNode, index: number, updateOrdinal = true) {
		child.parent = this;
		child.index = index;
		if (updateOrdinal) {
			this.setOrdinal(child, index);
		}
		this.children[index] = child;
	}
}

export function seqLTE(seq: number, minOrRefSeq: number) {
	return seq !== UnassignedSequenceNumber && seq <= minOrRefSeq;
}

/**
 * @alpha
 */
export abstract class BaseSegment extends MergeNode implements ISegment {
	public clientId: number = LocalClientId;
	public seq: number = UniversalSequenceNumber;
	public removedSeq?: number;
	public removedClientIds?: number[];
	public movedSeq?: number;
	public movedSeqs?: number[];
	public movedClientIds?: number[];
	public wasMovedOnInsert?: boolean | undefined;
	public readonly segmentGroups: SegmentGroupCollection = new SegmentGroupCollection(this);
	public readonly trackingCollection: TrackingGroupCollection = new TrackingGroupCollection(this);
	/***/
	public attribution?: IAttributionCollection<AttributionKey>;
	public propertyManager?: PropertiesManager;
	public properties?: PropertySet;
	public localRefs?: LocalReferenceCollection;
	public abstract readonly type: string;
	public localSeq?: number;
	public localRemovedSeq?: number;
	public localMovedSeq?: number;

	public addProperties(
		newProps: PropertySet,
		seq?: number,
		collaborating?: boolean,
		rollback: PropertiesRollback = PropertiesRollback.None,
	) {
		this.propertyManager ??= new PropertiesManager();
		// eslint-disable-next-line import/no-deprecated
		this.properties ??= createMap<any>();
		return this.propertyManager.addProperties(
			this.properties,
			newProps,
			seq,
			collaborating,
			rollback,
		);
	}

	public hasProperty(key: string): boolean {
		return !!this.properties && this.properties[key] !== undefined;
	}

	public isLeaf(): this is ISegment {
		return true;
	}

	protected cloneInto(b: ISegment) {
		b.clientId = this.clientId;
		// TODO: deep clone properties
		// eslint-disable-next-line import/no-deprecated
		b.properties = clone(this.properties);
		b.removedClientIds = this.removedClientIds?.slice();
		// TODO: copy removed client overlap and branch removal info
		b.removedSeq = this.removedSeq;
		b.movedClientIds = this.movedClientIds?.slice();
		b.movedSeq = this.movedSeq;
		b.movedSeqs = this.movedSeqs;
		b.wasMovedOnInsert = this.wasMovedOnInsert;
		b.seq = this.seq;
		b.attribution = this.attribution?.clone();
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

	/***/
	public ack(segmentGroup: SegmentGroup, opArgs: IMergeTreeDeltaOpArgs): boolean {
		const currentSegmentGroup = this.segmentGroups.dequeue();
		assert(
			currentSegmentGroup === segmentGroup,
			0x043 /* "On ack, unexpected segmentGroup!" */,
		);
		switch (opArgs.op.type) {
			case MergeTreeDeltaType.ANNOTATE:
				assert(
					!!this.propertyManager,
					0x044 /* "On annotate ack, missing segment property manager!" */,
				);
				this.propertyManager.ackPendingProperties(opArgs.op);
				return true;

			case MergeTreeDeltaType.INSERT:
				assert(
					this.seq === UnassignedSequenceNumber,
					0x045 /* "On insert, seq number already assigned!" */,
				);
				this.seq = opArgs.sequencedMessage!.sequenceNumber;
				this.localSeq = undefined;
				return true;

			case MergeTreeDeltaType.REMOVE:
				const removalInfo: IRemovalInfo | undefined = toRemovalInfo(this);
				assert(
					removalInfo !== undefined,
					0x046 /* "On remove ack, missing removal info!" */,
				);
				this.localRemovedSeq = undefined;
				if (removalInfo.removedSeq === UnassignedSequenceNumber) {
					removalInfo.removedSeq = opArgs.sequencedMessage!.sequenceNumber;
					return true;
				}
				return false;

			case MergeTreeDeltaType.OBLITERATE:
				const moveInfo: IMoveInfo | undefined = toMoveInfo(this);
				assert(moveInfo !== undefined, 0x86e /* On obliterate ack, missing move info! */);
				this.localMovedSeq = undefined;
				const seqIdx = moveInfo.movedSeqs.indexOf(UnassignedSequenceNumber);
				assert(seqIdx !== -1, 0x86f /* expected movedSeqs to contain unacked seq */);
				moveInfo.movedSeqs[seqIdx] = opArgs.sequencedMessage!.sequenceNumber;

				if (moveInfo.movedSeq === UnassignedSequenceNumber) {
					moveInfo.movedSeq = opArgs.sequencedMessage!.sequenceNumber;
					return true;
				}

				return false;

			default:
				throw new Error(`${opArgs.op.type} is in unrecognized operation type`);
		}
	}

	public splitAt(pos: number): ISegment | undefined {
		if (pos <= 0) {
			return undefined;
		}

		const leafSegment: ISegmentLeaf | undefined = this.createSplitSegmentAt(pos);

		if (!leafSegment) {
			return undefined;
		}

		this.copyPropertiesTo(leafSegment);
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const thisAsMergeSegment: ISegmentLeaf = this;
		leafSegment.parent = thisAsMergeSegment.parent;

		// Give the leaf a temporary yet valid ordinal.
		// when this segment is put in the tree, it will get its real ordinal,
		// but this ordinal meets all the necessary invariants for now.
		leafSegment.ordinal = this.ordinal + String.fromCharCode(0);

		leafSegment.removedClientIds = this.removedClientIds?.slice();
		leafSegment.removedSeq = this.removedSeq;
		leafSegment.localRemovedSeq = this.localRemovedSeq;
		leafSegment.seq = this.seq;
		leafSegment.localSeq = this.localSeq;
		leafSegment.clientId = this.clientId;
		leafSegment.movedClientIds = this.movedClientIds?.slice();
		leafSegment.movedSeq = this.movedSeq;
		leafSegment.movedSeqs = this.movedSeqs?.slice();
		leafSegment.localMovedSeq = this.localMovedSeq;
		leafSegment.wasMovedOnInsert = this.wasMovedOnInsert;
		this.segmentGroups.copyTo(leafSegment);
		this.trackingCollection.copyTo(leafSegment);
		if (this.localRefs) {
			this.localRefs.split(pos, leafSegment);
		}
		if (this.attribution) {
			leafSegment.attribution = this.attribution.splitAt(pos);
		}

		return leafSegment;
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
 * @internal
 */
export const reservedMarkerIdKey = "markerId";
/**
 * @internal
 */
export const reservedMarkerSimpleTypeKey = "markerSimpleType";

/**
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
 * @alpha
 */
export class Marker extends BaseSegment implements ReferencePosition, ISegment {
	public static readonly type = "Marker";
	public static is(segment: ISegment): segment is Marker {
		return segment.type === Marker.type;
	}
	public readonly type = Marker.type;

	public static make(refType: ReferenceType, props?: PropertySet) {
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
			return Marker.make(spec.marker.refType, spec.props as PropertySet);
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

	getProperties() {
		return this.properties;
	}

	getId(): string | undefined {
		return this.properties?.[reservedMarkerIdKey] as string;
	}

	toString() {
		return `M${this.getId()}`;
	}

	protected createSplitSegmentAt(pos: number) {
		return undefined;
	}

	canAppend(segment: ISegment): boolean {
		return false;
	}

	append() {
		throw new Error("Can not append to marker");
	}
}

/**
 * @deprecated This functionality was not meant to be exported and will be removed in a future release
 * @alpha
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
	 * (note that {@link ISegment.localSeq} tracks the localSeq at which a segment was inserted)
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

	loadFrom(a: CollaborationWindow) {
		this.clientId = a.clientId;
		this.collaborating = a.collaborating;
		this.minSeq = a.minSeq;
		this.currentSeq = a.currentSeq;
	}
}

/**
 * @internal
 */
export const compareNumbers = (a: number, b: number) => a - b;

/**
 * @internal
 */
export const compareStrings = (a: string, b: string) => a.localeCompare(b);

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
			const handle = !!value && value.IFluidHandle;

			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return handle ? `#Handle(${handle.routeContext.path}/${handle.path})` : value;
		});
	}
	return `M ${bbuf}: ${lbuf} ${pbuf}`;
}
