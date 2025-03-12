/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { type IEventThisPlaceHolder, IFluidHandle } from "@fluidframework/core-interfaces";
import { assert, unreachableCase, isObject } from "@fluidframework/core-utils/internal";
import {
	IFluidDataStoreRuntime,
	IChannelStorageService,
} from "@fluidframework/datastore-definitions/internal";
import {
	MessageType,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions/internal";
import { toDeltaManagerInternal } from "@fluidframework/runtime-utils/internal";
import { IFluidSerializer } from "@fluidframework/shared-object-base/internal";
import {
	ITelemetryLoggerExt,
	LoggingError,
	UsageError,
} from "@fluidframework/telemetry-utils/internal";

import { MergeTreeTextHelper } from "./MergeTreeTextHelper.js";
import { DoublyLinkedList, RedBlackTree } from "./collections/index.js";
import { NonCollabClient, UniversalSequenceNumber } from "./constants.js";
import { LocalReferencePosition, SlidingPreference } from "./localReference.js";
import {
	MergeTree,
	errorIfOptionNotTrue,
	isRemovedAndAcked,
	type IMergeTreeOptionsInternal,
} from "./mergeTree.js";
import type {
	IMergeTreeDeltaCallbackArgs,
	IMergeTreeDeltaOpArgs,
	IMergeTreeMaintenanceCallbackArgs,
} from "./mergeTreeDeltaCallback.js";
import { walkAllChildSegments } from "./mergeTreeNodeWalk.js";
import {
	CollaborationWindow,
	ISegment,
	ISegmentAction,
	ISegmentPrivate,
	Marker,
	SegmentGroup,
	compareStrings,
	isSegmentLeaf,
	opstampUtils,
	type OperationStamp,
} from "./mergeTreeNodes.js";
import {
	createAdjustRangeOp,
	createAnnotateMarkerOp,
	createAnnotateRangeOp,
	// eslint-disable-next-line import/no-deprecated
	createGroupOp,
	createInsertSegmentOp,
	createObliterateRangeOp,
	createObliterateRangeOpSided,
	createRemoveRangeOp,
} from "./opBuilder.js";
import {
	IJSONSegment,
	IMergeTreeAnnotateMsg,
	IMergeTreeDeltaOp,
	// eslint-disable-next-line import/no-deprecated
	IMergeTreeGroupMsg,
	IMergeTreeInsertMsg,
	// eslint-disable-next-line import/no-deprecated
	IMergeTreeObliterateMsg,
	IMergeTreeOp,
	IMergeTreeRemoveMsg,
	IRelativePosition,
	MergeTreeDeltaType,
	ReferenceType,
	type AdjustParams,
	type IMergeTreeAnnotateAdjustMsg,
	type IMergeTreeObliterateSidedMsg,
} from "./ops.js";
import { PropertySet, type MapLike } from "./properties.js";
import { DetachedReferencePosition, ReferencePosition } from "./referencePositions.js";
import {
	isInserted,
	isRemoved,
	overwriteInfo,
	toRemovalInfo,
	type IHasInsertionInfo,
} from "./segmentInfos.js";
import { Side, type InteriorSequencePlace } from "./sequencePlace.js";
import { SnapshotLoader } from "./snapshotLoader.js";
import { SnapshotV1 } from "./snapshotV1.js";
import { SnapshotLegacy } from "./snapshotlegacy.js";
import { IMergeTreeTextHelper } from "./textSegment.js";
import {
	LocalReconnectingPerspective,
	PriorPerspective,
	type Perspective,
} from "./perspective.js";

type IMergeTreeDeltaRemoteOpArgs = Omit<IMergeTreeDeltaOpArgs, "sequencedMessage"> &
	Required<Pick<IMergeTreeDeltaOpArgs, "sequencedMessage">>;

/**
 * A range [start, end)
 * @internal
 */
export interface IIntegerRange {
	start: number;
	end: number;
}

/**
 * Emitted before this client's merge-tree normalizes its segments on reconnect, potentially
 * ordering them. Useful for DDS-like consumers built atop the merge-tree to compute any information
 * they need for rebasing their ops on reconnection.
 * @internal
 */
export interface IClientEvents {
	(event: "normalize", listener: (target: IEventThisPlaceHolder) => void): void;
	(
		event: "delta",
		listener: (
			opArgs: IMergeTreeDeltaOpArgs,
			deltaArgs: IMergeTreeDeltaCallbackArgs,
			target: IEventThisPlaceHolder,
		) => void,
	): void;
	(
		event: "maintenance",
		listener: (
			args: IMergeTreeMaintenanceCallbackArgs,
			deltaArgs: IMergeTreeDeltaOpArgs | undefined,
			target: IEventThisPlaceHolder,
		) => void,
	): void;
}

const UNBOUND_SEGMENT_ERROR = "The provided segment is not bound to this DDS.";

/**
 * This class encapsulates a merge-tree, and provides a local client specific view over it and
 * the capability to modify it as the local client. Additionally it provides
 * binding for processing remote ops on the encapsulated merge tree, and projects local and remote events
 * caused by all modification to the underlying merge-tree.
 *
 * @internal
 */
export class Client extends TypedEventEmitter<IClientEvents> {
	public longClientId: string | undefined;

	private readonly _mergeTree: MergeTree;

	private readonly clientNameToIds = new RedBlackTree<string, number>(compareStrings);
	private readonly shortClientIdMap: string[] = [];

	/**
	 * @param specToSegment - Rehydrates a segment from its JSON representation
	 * @param logger - Telemetry logger for diagnostics
	 * @param options - Options for this client. See {@link IMergeTreeOptions} for details.
	 * @param getMinInFlightRefSeq - Upon applying a message (see {@link Client.applyMsg}), client purges collab-window information which
	 * is no longer necessary based on that message's minimum sequence number.
	 * However, if the user of this client has in-flight messages which refer to positions in this Client,
	 * they may wish to preserve additional merge information.
	 * The effective minimum sequence number will be the minimum of the message's minimumSequenceNumber and the result of this function.
	 * If this function returns undefined, the message's minimumSequenceNumber will be used.
	 *
	 * @privateRemarks
	 * - Passing specToSegment would be unnecessary if Client were merged with SharedSegmentSequence
	 * - AB#6866 tracks a more unified approach to collab window min seq handling.
	 */
	constructor(
		public readonly specToSegment: (spec: IJSONSegment) => ISegment,
		public readonly logger: ITelemetryLoggerExt,
		options?: IMergeTreeOptionsInternal & PropertySet,
		private readonly getMinInFlightRefSeq: () => number | undefined = (): undefined =>
			undefined,
	) {
		super();
		this._mergeTree = new MergeTree(options);
		this._mergeTree.mergeTreeDeltaCallback = (opArgs, deltaArgs): void => {
			this.emit("delta", opArgs, deltaArgs, this);
		};
		this._mergeTree.mergeTreeMaintenanceCallback = (args, opArgs): void => {
			this.emit("maintenance", args, opArgs, this);
		};

		if (options?.attribution?.track) {
			const policy = this._mergeTree?.attributionPolicy;
			if (policy === undefined) {
				throw new UsageError(
					"Attribution policy must be provided when attribution tracking is requested.",
				);
			}
			policy.attach(this);
		}
	}

	/**
	 * The merge tree maintains a queue of segment groups for each local operation.
	 * These segment groups track segments modified by an operation.
	 * This method peeks the tail of that queue, and returns the segments groups there.
	 * It is used to get the segment group(s) for the previous operations.
	 * @param count - The number segment groups to get peek from the tail of the queue. Default 1.
	 */

	public peekPendingSegmentGroups(count: number = 1): unknown {
		const pending = this._mergeTree.pendingSegments;
		let node = pending?.last;
		if (count === 1 || pending === undefined) {
			return node?.data;
		}

		const taken: SegmentGroup[] = Array.from({ length: Math.min(count, pending.length) });
		for (let i = taken.length - 1; i >= 0; i--) {
			taken[i] = node!.data;
			node = node!.prev;
		}
		return taken;
	}

	/**
	 * Annotates the markers with the provided properties
	 * @param marker - The marker to annotate
	 * @param props - The properties to annotate the marker with
	 * @returns The annotate op if valid, otherwise undefined
	 */
	public annotateMarker(
		marker: Marker,
		props: PropertySet,
	): IMergeTreeAnnotateMsg | undefined {
		const annotateOp = createAnnotateMarkerOp(marker, props)!;
		this.applyAnnotateRangeOp({ op: annotateOp });
		return annotateOp;
	}

	/**
	 * Annotates the range with the provided properties
	 * @param start - The inclusive start position of the range to annotate
	 * @param end - The exclusive end position of the range to annotate
	 * @param props - The properties to annotate the range with
	 * @returns The annotate op if valid, otherwise undefined
	 */
	public annotateRangeLocal(
		start: number,
		end: number,
		props: PropertySet,
	): IMergeTreeAnnotateMsg | undefined {
		const annotateOp = createAnnotateRangeOp(start, end, props);
		this.applyAnnotateRangeOp({ op: annotateOp });
		return annotateOp;
	}

	/**
	 * adjusts a value
	 */
	public annotateAdjustRangeLocal(
		start: number,
		end: number,
		adjust: MapLike<AdjustParams>,
	): IMergeTreeAnnotateAdjustMsg {
		const annotateOp = createAdjustRangeOp(start, end, adjust);

		for (const [key, value] of Object.entries(adjust)) {
			if (value.min !== undefined && value.max !== undefined && value.min > value.max) {
				throw new UsageError(`min is greater than max for ${key}`);
			}
		}

		this.applyAnnotateRangeOp({ op: annotateOp });
		return annotateOp;
	}

	/**
	 * Removes the range
	 *
	 * @param start - The inclusive start of the range to remove
	 * @param end - The exclusive end of the range to remove
	 */
	public removeRangeLocal(start: number, end: number): IMergeTreeRemoveMsg {
		const removeOp = createRemoveRangeOp(start, end);
		this.applyRemoveRangeOp({ op: removeOp });
		return removeOp;
	}

	/**
	 * Obliterates the range. This is similar to removing the range, but also
	 * includes any concurrently inserted content.
	 *
	 * @param start - The start of the range to obliterate. Inclusive is side is Before (default).
	 * @param end - The end of the range to obliterate. Exclusive is side is After
	 * (default is to be after the last included character, but number index is exclusive).
	 */
	public obliterateRangeLocal(
		start: number | InteriorSequencePlace,
		end: number | InteriorSequencePlace,
		// eslint-disable-next-line import/no-deprecated
	): IMergeTreeObliterateMsg | IMergeTreeObliterateSidedMsg {
		// eslint-disable-next-line import/no-deprecated
		let obliterateOp: IMergeTreeObliterateMsg | IMergeTreeObliterateSidedMsg;
		if (this._mergeTree.options?.mergeTreeEnableSidedObliterate) {
			obliterateOp = createObliterateRangeOpSided(start, end);
		} else {
			assert(
				typeof start === "number" && typeof end === "number",
				0xa42 /* Start and end must be numbers if mergeTreeEnableSidedObliterate is not enabled. */,
			);
			obliterateOp = createObliterateRangeOp(start, end);
		}
		this.applyObliterateRangeOp({ op: obliterateOp });
		return obliterateOp;
	}

	/**
	 * Create and insert a segment at the specified position.
	 * @param pos - The position to insert the segment at
	 * @param segment - The segment to insert
	 */
	public insertSegmentLocal(pos: number, segment: ISegment): IMergeTreeInsertMsg | undefined {
		if (segment.cachedLength <= 0) {
			return undefined;
		}
		const insertOp = createInsertSegmentOp(pos, segment);
		this.applyInsertOp({ op: insertOp });
		return insertOp;
	}

	/**
	 * Create and insert a segment at the specified reference position.
	 * @param refPos - The reference position to insert the segment at
	 * @param segment - The segment to insert
	 */
	public insertAtReferencePositionLocal(
		refPos: ReferencePosition,
		segment: ISegment,
	): IMergeTreeInsertMsg | undefined {
		const pos = this._mergeTree.referencePositionToLocalPosition(
			refPos,
			this.getCurrentSeq(),
			this.getClientId(),
		);

		if (pos === DetachedReferencePosition) {
			throw new UsageError("Cannot insert at detached local reference.");
		}
		return this.insertSegmentLocal(pos, segment);
	}

	public walkSegments<TClientData>(
		handler: ISegmentAction<TClientData>,
		start: number | undefined,
		end: number | undefined,
		accum: TClientData,
		splitRange?: boolean,
	): void;
	public walkSegments(
		handler: ISegmentAction<undefined>,
		start?: number,
		end?: number,
		accum?: undefined,
		splitRange?: boolean,
	): void;
	public walkSegments<TClientData>(
		handler: ISegmentAction<TClientData>,
		start: number | undefined,
		end: number | undefined,
		accum: TClientData,
		splitRange: boolean = false,
	): void {
		this._mergeTree.mapRange(
			handler,
			this._mergeTree.localPerspective,
			accum,
			start,
			end,
			splitRange,
		);
	}

	protected walkAllSegments<TClientData>(
		action: (segment: ISegment, accum?: TClientData) => boolean,
		accum?: TClientData,
	): boolean {
		return walkAllChildSegments(
			this._mergeTree.root,
			accum === undefined ? action : (seg): boolean => action(seg, accum),
		);
	}

	/**
	 * Serializes the data required for garbage collection. The IFluidHandles stored in all segments that haven't
	 * been removed represent routes to other objects. We serialize the data in these segments using the passed in
	 * serializer which keeps track of all serialized handles.
	 */
	public serializeGCData(
		handle: IFluidHandle,
		handleCollectingSerializer: IFluidSerializer,
	): void {
		let localInserts = 0;
		let localRemoves = 0;
		let localObliterates = 0;
		walkAllChildSegments(this._mergeTree.root, (seg: ISegmentPrivate) => {
			if (isInserted(seg) && opstampUtils.isLocal(seg.insert)) {
				localInserts++;
			}
			if (isRemoved(seg) && opstampUtils.isLocal(seg.removes[seg.removes.length - 1])) {
				if (seg.removes[seg.removes.length - 1].type === "setRemove") {
					localRemoves++;
				} else {
					localObliterates++;
				}
			}
			// Only serialize segments that have not been removed.
			if (!isRemoved(seg)) {
				handleCollectingSerializer.stringify(seg.clone().toJSONObject(), handle);
			}
			return true;
		});

		if (localInserts > 0 || localRemoves > 0) {
			this.logger.sendErrorEvent({
				eventName: "LocalEditsInProcessGCData",
				localInserts,
				localRemoves,
				localObliterates,
			});
		}
	}

	public getCollabWindow(): CollaborationWindow {
		return this._mergeTree.collabWindow;
	}

	/**
	 * Returns the current position of a segment, and -1 if the segment
	 * does not exist in this merge tree
	 * @param segment - The segment to get the position of
	 */
	public getPosition(segment: ISegment | undefined, localSeq?: number): number {
		if (!isSegmentLeaf(segment)) {
			return -1;
		}

		const perspective =
			localSeq !== undefined
				? new LocalReconnectingPerspective(this.getCurrentSeq(), this.getClientId(), localSeq)
				: this._mergeTree.localPerspective;
		return this._mergeTree.getPosition(segment, perspective);
	}

	/**
	 * Creates a `LocalReferencePosition` on this client. If the refType does not include ReferenceType.Transient,
	 * the returned reference will be added to the localRefs on the provided segment.
	 * @param segment - Segment to add the local reference on
	 * @param offset - Offset on the segment at which to place the local reference
	 * @param refType - ReferenceType for the created local reference
	 * @param properties - PropertySet to place on the created local reference
	 * @param canSlideToEndpoint - Whether or not the created local reference can
	 * slide onto one of the special endpoint segments denoting the position
	 * before the start of or after the end of the tree
	 */
	public createLocalReferencePosition(
		segment: ISegment | "start" | "end",
		offset: number | undefined,
		refType: ReferenceType,
		properties: PropertySet | undefined,
		slidingPreference?: SlidingPreference,
		canSlideToEndpoint?: boolean,
	): LocalReferencePosition {
		if (!isSegmentLeaf(segment) && typeof segment !== "string") {
			throw new UsageError(UNBOUND_SEGMENT_ERROR);
		}
		return this._mergeTree.createLocalReferencePosition(
			segment,
			offset ?? 0,
			refType,
			properties,
			slidingPreference,
			canSlideToEndpoint,
		);
	}

	/**
	 * Removes a `LocalReferencePosition` from this client.
	 */
	public removeLocalReferencePosition(
		lref: LocalReferencePosition,
	): LocalReferencePosition | undefined {
		return this._mergeTree.removeLocalReferencePosition(lref);
	}

	/**
	 * Resolves a `ReferencePosition` into a character position using this client's perspective.
	 *
	 * Reference positions that point to a character that has been removed will
	 * always return the position of the nearest non-removed character, regardless
	 * of {@link ReferenceType}. To handle this case specifically, one may wish
	 * to look at the segment returned by {@link ReferencePosition.getSegment}.
	 */
	public localReferencePositionToPosition(lref: ReferencePosition): number {
		return this._mergeTree.referencePositionToLocalPosition(lref);
	}

	/**
	 * Given a position specified relative to a marker id, lookup the marker
	 * and convert the position to a character position.
	 * @param relativePos - Id of marker (may be indirect) and whether position is before or after marker.
	 */
	public posFromRelativePos(relativePos: IRelativePosition): number {
		return this._mergeTree.posFromRelativePos(relativePos, this._mergeTree.localPerspective);
	}

	public getMarkerFromId(id: string): ISegment | undefined {
		return this._mergeTree.getMarkerFromId(id);
	}

	/**
	 * Revert an op
	 */
	public rollback?(op: unknown, localOpMetadata: unknown): void {
		this._mergeTree.rollback(op as IMergeTreeDeltaOp, localOpMetadata as SegmentGroup);
	}

	private applyObliterateRangeOp(opArgs: IMergeTreeDeltaOpArgs): void {
		const { op, sequencedMessage } = opArgs;
		assert(
			op.type === MergeTreeDeltaType.OBLITERATE ||
				op.type === MergeTreeDeltaType.OBLITERATE_SIDED,
			0x866 /* Unexpected op type on range obliterate! */,
		);
		const perspective = this.getOperationPerspective(sequencedMessage);
		const stamp = this.getOperationStamp(sequencedMessage);

		if (this._mergeTree.options?.mergeTreeEnableSidedObliterate) {
			const { start, end } = this.getValidSidedRange(op, perspective);
			this._mergeTree.obliterateRange(start, end, perspective, stamp, opArgs);
		} else {
			assert(
				op.type === MergeTreeDeltaType.OBLITERATE,
				0xa43 /* Unexpected sided obliterate while mergeTreeEnableSidedObliterate is disabled */,
			);
			const { start, end } = this.getValidOpRange(op, perspective);
			this._mergeTree.obliterateRange(start, end, perspective, stamp, opArgs);
		}
	}

	private getOperationPerspective(
		sequencedMessage: ISequencedDocumentMessage | undefined,
	): Perspective {
		if (!sequencedMessage) {
			return this._mergeTree.localPerspective;
		}

		const clientId = this.getOrAddShortClientIdFromMessage(sequencedMessage);
		const { referenceSequenceNumber: refSeq } = sequencedMessage;
		return new PriorPerspective(refSeq, clientId);
	}

	/**
	 * Returns the operation stamp to apply for a change, minting a new one local one if necessary.
	 */
	private getOperationStamp(
		sequencedMessage: ISequencedDocumentMessage | undefined,
	): OperationStamp {
		if (!sequencedMessage) {
			return this._mergeTree.mintNextLocalOperationStamp();
		}

		const { sequenceNumber: seq } = sequencedMessage;
		const clientId = this.getOrAddShortClientIdFromMessage(sequencedMessage);
		return {
			seq,
			clientId,
		};
	}

	/**
	 * Performs the remove based on the provided op
	 * @param opArgs - The ops args for the op
	 */
	private applyRemoveRangeOp(opArgs: IMergeTreeDeltaOpArgs): void {
		const { op, sequencedMessage } = opArgs;
		assert(
			op.type === MergeTreeDeltaType.REMOVE,
			0x02d /* "Unexpected op type on range remove!" */,
		);
		const perspective = this.getOperationPerspective(sequencedMessage);
		const stamp = this.getOperationStamp(sequencedMessage);
		const range = this.getValidOpRange(op, perspective);

		this._mergeTree.markRangeRemoved(range.start, range.end, perspective, stamp, opArgs);
	}

	/**
	 * Performs the annotate based on the provided op
	 * @param opArgs - The ops args for the op
	 */
	private applyAnnotateRangeOp(opArgs: IMergeTreeDeltaOpArgs): void {
		const { op, sequencedMessage } = opArgs;
		assert(
			op.type === MergeTreeDeltaType.ANNOTATE,
			0x02e /* "Unexpected op type on range annotate!" */,
		);
		const perspective = this.getOperationPerspective(sequencedMessage);
		const stamp = this.getOperationStamp(sequencedMessage);
		const range = this.getValidOpRange(op, perspective);

		this._mergeTree.annotateRange(range.start, range.end, op, perspective, stamp, opArgs);
	}

	/**
	 * Performs the insert based on the provided op
	 * @param opArgs - The ops args for the op
	 * @returns True if the insert was applied. False if it could not be.
	 */
	private applyInsertOp(opArgs: IMergeTreeDeltaOpArgs): void {
		const { op, sequencedMessage } = opArgs;
		assert(
			op.type === MergeTreeDeltaType.INSERT,
			0x02f /* "Unexpected op type on range insert!" */,
		);
		const perspective = this.getOperationPerspective(sequencedMessage);
		const stamp = this.getOperationStamp(sequencedMessage);
		const range = this.getValidOpRange(op, perspective);

		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		const segments = [this.specToSegment(op.seg)];

		this._mergeTree.insertSegments(range.start, segments, perspective, stamp, opArgs);
	}

	/**
	 * Returns a valid range for the op, or throws if the range is invalid
	 * @param op - The op to generate the range for
	 * @param clientArgs - The client args for the op
	 * @throws LoggingError if the range is invalid
	 */
	private getValidSidedRange(
		// eslint-disable-next-line import/no-deprecated
		op: IMergeTreeObliterateSidedMsg | IMergeTreeObliterateMsg,
		perspective: Perspective,
	): {
		start: InteriorSequencePlace;
		end: InteriorSequencePlace;
	} {
		const invalidPositions: string[] = [];
		let start: InteriorSequencePlace | undefined;
		let end: InteriorSequencePlace | undefined;
		if (op.pos1 === undefined) {
			invalidPositions.push("start");
		} else {
			start =
				typeof op.pos1 === "object"
					? { pos: op.pos1.pos, side: op.pos1.before ? Side.Before : Side.After }
					: { pos: op.pos1, side: Side.Before };
		}
		if (op.pos2 === undefined) {
			invalidPositions.push("end");
		} else {
			end =
				typeof op.pos2 === "object"
					? { pos: op.pos2.pos, side: op.pos2.before ? Side.Before : Side.After }
					: { pos: op.pos2 - 1, side: Side.After };
		}

		// Validate if local op
		if (perspective.clientId === this.getClientId()) {
			const length = this._mergeTree.getLength(this._mergeTree.localPerspective);
			if (start !== undefined && (start.pos >= length || start.pos < 0)) {
				// start out of bounds
				invalidPositions.push("start");
			}
			if (end !== undefined && (end.pos >= length || end.pos < 0)) {
				invalidPositions.push("end");
			}
			if (
				start !== undefined &&
				end !== undefined &&
				(start.pos > end.pos ||
					(start.pos === end.pos && start.side !== end.side && start.side === Side.After))
			) {
				// end is before start
				invalidPositions.push("inverted");
			}
			if (invalidPositions.length > 0) {
				throw new LoggingError("InvalidRange", {
					usageError: true,
					invalidPositions: invalidPositions.toString(),
					length,
					opType: op.type,
					opPos1Relative: op.relativePos1 !== undefined,
					opPos2Relative: op.relativePos2 !== undefined,
					opPos1: JSON.stringify(op.pos1),
					opPos2: JSON.stringify(op.pos2),
					start: JSON.stringify(start),
					end: JSON.stringify(end),
				});
			}
		}

		assert(
			start !== undefined && end !== undefined,
			0xa44 /* Missing start or end of range */,
		);
		return { start, end };
	}

	/**
	 * Returns a valid range for the op, or undefined
	 * @param op - The op to generate the range for
	 * @param clientArgs - The client args for the op
	 */
	private getValidOpRange(
		op:
			| IMergeTreeAnnotateMsg
			| IMergeTreeAnnotateAdjustMsg
			| IMergeTreeInsertMsg
			| IMergeTreeRemoveMsg
			// eslint-disable-next-line import/no-deprecated
			| IMergeTreeObliterateMsg,
		perspective: Perspective,
	): IIntegerRange {
		let start: number | undefined = op.pos1;
		if (start === undefined && op.relativePos1) {
			start = this._mergeTree.posFromRelativePos(op.relativePos1, perspective);
		}

		let end: number | undefined = op.pos2;
		if (end === undefined && op.relativePos2) {
			end = this._mergeTree.posFromRelativePos(op.relativePos2, perspective);
		}

		// Validate if local op
		if (perspective.clientId === this.getClientId()) {
			const length = this.getLength();

			const invalidPositions: string[] = [];

			// Validate start position
			//
			if (
				start === undefined ||
				start < 0 ||
				start > length ||
				(start === length && op.type !== MergeTreeDeltaType.INSERT)
			) {
				invalidPositions.push("start");
			}
			// Validate end if not insert, or insert has end
			if (
				(op.type !== MergeTreeDeltaType.INSERT || end !== undefined) &&
				(end === undefined || end <= start!)
			) {
				invalidPositions.push("end");
			}

			if (op.type === MergeTreeDeltaType.OBLITERATE && end !== undefined && end > length) {
				invalidPositions.push("end");
			}

			if (invalidPositions.length > 0) {
				throw new LoggingError("RangeOutOfBounds", {
					usageError: true,
					end,
					invalidPositions: invalidPositions.toString(),
					length,
					opPos1: op.pos1,
					opPos1Relative: op.relativePos1 !== undefined,
					opPos2: op.pos2,
					opPos2Relative: op.relativePos2 !== undefined,
					opType: op.type,
					start,
				});
			}
		}

		// start and end are guaranteed to be non-null here, otherwise we throw above.
		return { start: start!, end: end! };
	}

	private ackPendingSegment(opArgs: IMergeTreeDeltaRemoteOpArgs): void {
		if (opArgs.op.type === MergeTreeDeltaType.GROUP) {
			for (const memberOp of opArgs.op.ops) {
				this._mergeTree.ackPendingSegment({
					groupOp: opArgs.op,
					op: memberOp,
					sequencedMessage: opArgs.sequencedMessage,
				});
			}
		} else {
			this._mergeTree.ackPendingSegment(opArgs);
		}
	}

	getOrAddShortClientId(longClientId: string): number {
		if (!this.clientNameToIds.get(longClientId)) {
			this.addLongClientId(longClientId);
		}
		return this.getShortClientId(longClientId);
	}

	protected getShortClientId(longClientId: string): number {
		return this.clientNameToIds.get(longClientId)!.data;
	}

	getLongClientId(shortClientId: number): string {
		return shortClientId >= 0 ? this.shortClientIdMap[shortClientId] : "original";
	}

	addLongClientId(longClientId: string): void {
		this.clientNameToIds.put(longClientId, this.shortClientIdMap.length);
		this.shortClientIdMap.push(longClientId);
	}

	private getOrAddShortClientIdFromMessage(
		msg: Pick<ISequencedDocumentMessage, "clientId">,
	): number {
		return this.getOrAddShortClientId(msg.clientId ?? "server");
	}

	/**
	 * During reconnect, we must find the positions to pending segments
	 * relative to other pending segments. This methods computes that
	 * position relative to a localSeq. Pending segments above the localSeq
	 * will be ignored.
	 *
	 * @param segment - The segment to find the position for
	 * @param localSeq - The localSeq to find the position of the segment at
	 */
	public findReconnectionPosition(segment: ISegment, localSeq: number): number {
		assert(
			localSeq <= this._mergeTree.collabWindow.localSeq,
			0x032 /* "localSeq greater than collab window" */,
		);
		const { currentSeq, clientId } = this.getCollabWindow();
		if (!isSegmentLeaf(segment)) {
			throw new UsageError(UNBOUND_SEGMENT_ERROR);
		}
		const perspective = new LocalReconnectingPerspective(currentSeq, clientId, localSeq);
		return this._mergeTree.getPosition(segment, perspective);
	}

	private resetPendingDeltaToOps(
		resetOp: IMergeTreeDeltaOp,

		segmentGroup: SegmentGroup,
	): IMergeTreeDeltaOp[] {
		assert(!!segmentGroup, 0x033 /* "Segment group undefined" */);
		const NACKedSegmentGroup = this.pendingRebase?.shift()?.data;
		assert(
			segmentGroup === NACKedSegmentGroup,
			0x034 /* "Segment group not at head of pending rebase queue" */,
		);
		if (this.pendingRebase?.empty) {
			this.pendingRebase = undefined;
		}

		// if this is an obliterate op, keep all segments in same segment group

		const obliterateSegmentGroup: SegmentGroup = {
			segments: [],
			localSeq: segmentGroup.localSeq,
			refSeq: this.getCollabWindow().currentSeq,
			obliterateInfo: {
				...segmentGroup.obliterateInfo!,
			},
		};

		const opList: IMergeTreeDeltaOp[] = [];
		// We need to sort the segments by ordinal, as the segments are not sorted in the segment group.
		// The reason they need them sorted, as they have the same local sequence number and which means
		// farther segments will  take into account nearer segments when calculating their position.
		// By sorting we ensure the nearer segment will be applied and sequenced before the farther segments
		// so their recalculated positions will be correct.
		for (const segment of segmentGroup.segments.sort((a, b) =>
			a.ordinal < b.ordinal ? -1 : 1,
		)) {
			assert(
				segment.segmentGroups?.remove(segmentGroup) === true,
				0x035 /* "Segment group not in segment pending queue" */,
			);
			assert(
				segmentGroup.localSeq !== undefined,
				0x867 /* expected segment group localSeq to be defined */,
			);
			const segmentPosition = this.findReconnectionPosition(segment, segmentGroup.localSeq);
			let newOp: IMergeTreeDeltaOp | undefined;
			switch (resetOp.type) {
				case MergeTreeDeltaType.ANNOTATE: {
					assert(
						segment.propertyManager?.hasPendingProperties(resetOp.props ?? resetOp.adjust) ===
							true,
						0x036 /* "Segment has no pending properties" */,
					);
					// if the segment has been removed or obliterated, there's no need to send the annotate op
					// unless the remove was local, in which case the annotate must have come
					// before the remove
					if (!isRemovedAndAcked(segment)) {
						newOp =
							resetOp.props === undefined
								? createAdjustRangeOp(
										segmentPosition,
										segmentPosition + segment.cachedLength,
										resetOp.adjust,
									)
								: createAnnotateRangeOp(
										segmentPosition,
										segmentPosition + segment.cachedLength,
										resetOp.props,
									);
					}
					break;
				}

				case MergeTreeDeltaType.INSERT: {
					assert(
						isInserted(segment) && opstampUtils.isLocal(segment.insert),
						0x037 /* "Segment already has assigned sequence number" */,
					);
					const removeInfo = toRemovalInfo(segment);

					if (removeInfo !== undefined && opstampUtils.isAcked(removeInfo.removes[0])) {
						assert(
							removeInfo.removes[0].type === "sliceRemove",
							"Remove on insertion must be caused by obliterate.",
						);
						errorIfOptionNotTrue(
							this._mergeTree.options,
							"mergeTreeEnableObliterateReconnect",
						);
						// the segment was remotely obliterated, so is considered removed
						// we set the seq to the universal seq and remove the local seq,
						// so its length is not considered for subsequent local changes
						// this allows us to not send the op as even the local client will ignore the segment
						overwriteInfo<IHasInsertionInfo>(segment, {
							insert: {
								type: "insert",
								seq: UniversalSequenceNumber,
								localSeq: undefined,
								clientId: NonCollabClient,
							},
						});
						break;
					}

					const segInsertOp: ISegment = segment.clone();
					const opProps =
						isObject(resetOp.seg) && "props" in resetOp.seg && isObject(resetOp.seg.props)
							? { ...resetOp.seg.props }
							: undefined;
					segInsertOp.properties = opProps;
					newOp = createInsertSegmentOp(segmentPosition, segInsertOp);
					break;
				}

				case MergeTreeDeltaType.REMOVE: {
					// Only bother resubmitting if nobody else has removed it in the meantime.
					// When that happens, the first removal will have been acked.
					if (isRemoved(segment) && opstampUtils.isLocal(segment.removes[0])) {
						newOp = createRemoveRangeOp(
							segmentPosition,
							segmentPosition + segment.cachedLength,
						);
					}
					break;
				}
				case MergeTreeDeltaType.OBLITERATE: {
					errorIfOptionNotTrue(this._mergeTree.options, "mergeTreeEnableObliterateReconnect");
					// Only bother resubmitting if nobody else has removed it in the meantime.
					// When that happens, the first removal will have been acked.
					if (isRemoved(segment) && opstampUtils.isLocal(segment.removes[0])) {
						newOp = createObliterateRangeOp(
							segmentPosition,
							segmentPosition + segment.cachedLength,
						);
					}
					break;
				}
				default: {
					throw new Error(`Invalid op type`);
				}
			}

			if (newOp && resetOp.type === MergeTreeDeltaType.OBLITERATE) {
				segment.segmentGroups.enqueue(obliterateSegmentGroup);

				const first = opList[0];

				if (
					!!first &&
					first.pos2 !== undefined &&
					first.type !== MergeTreeDeltaType.OBLITERATE_SIDED &&
					newOp.type !== MergeTreeDeltaType.OBLITERATE_SIDED
				) {
					first.pos2 += newOp.pos2! - newOp.pos1!;
				} else {
					opList.push(newOp);
				}
			} else if (newOp) {
				const newSegmentGroup: SegmentGroup = {
					segments: [],
					localSeq: segmentGroup.localSeq,
					refSeq: this.getCollabWindow().currentSeq,
				};
				segment.segmentGroups.enqueue(newSegmentGroup);

				this._mergeTree.pendingSegments.push(newSegmentGroup);

				opList.push(newOp);
			}
		}

		if (
			resetOp.type === MergeTreeDeltaType.OBLITERATE &&
			obliterateSegmentGroup.segments.length > 0
		) {
			this._mergeTree.pendingSegments.push(obliterateSegmentGroup);
		}

		return opList;
	}

	private applyRemoteOp(opArgs: IMergeTreeDeltaRemoteOpArgs): void {
		const op = opArgs.op;
		const msg = opArgs.sequencedMessage;
		this.getOrAddShortClientIdFromMessage(msg);
		switch (op.type) {
			case MergeTreeDeltaType.INSERT: {
				this.applyInsertOp(opArgs);
				break;
			}
			case MergeTreeDeltaType.REMOVE: {
				this.applyRemoveRangeOp(opArgs);
				break;
			}
			case MergeTreeDeltaType.ANNOTATE: {
				this.applyAnnotateRangeOp(opArgs);
				break;
			}
			case MergeTreeDeltaType.OBLITERATE:
			case MergeTreeDeltaType.OBLITERATE_SIDED: {
				this.applyObliterateRangeOp(opArgs);
				break;
			}
			case MergeTreeDeltaType.GROUP: {
				for (const memberOp of op.ops) {
					this.applyRemoteOp({
						op: memberOp,
						groupOp: op,
						sequencedMessage: msg,
					});
				}
				break;
			}
			default: {
				break;
			}
		}
	}

	public applyStashedOp(op: IMergeTreeOp): void {
		switch (op.type) {
			case MergeTreeDeltaType.INSERT: {
				this.applyInsertOp({ op });
				break;
			}
			case MergeTreeDeltaType.REMOVE: {
				this.applyRemoveRangeOp({ op });
				break;
			}
			case MergeTreeDeltaType.ANNOTATE: {
				this.applyAnnotateRangeOp({ op });
				break;
			}
			case MergeTreeDeltaType.OBLITERATE_SIDED:
			case MergeTreeDeltaType.OBLITERATE: {
				this.applyObliterateRangeOp({ op });
				break;
			}
			case MergeTreeDeltaType.GROUP: {
				op.ops.map((o) => this.applyStashedOp(o));
				break;
			}
			default: {
				unreachableCase(op, "unrecognized op type");
			}
		}
	}

	public applyMsg(msg: ISequencedDocumentMessage, local: boolean = false): void {
		// Ensure client ID is registered
		this.getOrAddShortClientIdFromMessage(msg);
		// Apply if an operation message
		if (msg.type === MessageType.Operation) {
			const opArgs: IMergeTreeDeltaRemoteOpArgs = {
				op: msg.contents as IMergeTreeOp,
				sequencedMessage: msg,
			};
			if (opArgs.sequencedMessage?.clientId === this.longClientId || local) {
				this.ackPendingSegment(opArgs);
			} else {
				this.applyRemoteOp(opArgs);
			}
		}

		const min = Math.min(
			this.getMinInFlightRefSeq() ?? Number.POSITIVE_INFINITY,
			msg.minimumSequenceNumber,
		);
		this.updateSeqNumbers(min, msg.sequenceNumber);
	}

	private updateSeqNumbers(min: number, seq: number): void {
		const collabWindow = this.getCollabWindow();
		// Equal is fine here due to SharedSegmentSequence<>.snapshotContent() potentially updating with same #
		assert(
			collabWindow.currentSeq <= seq,
			0x038 /* "Incoming op sequence# < local collabWindow's currentSequence#" */,
		);
		collabWindow.currentSeq = seq;
		assert(min <= seq, 0x039 /* "Incoming op sequence# < minSequence#" */);
		this.updateMinSeq(min);
	}

	/**
	 * Resolves a remote client's position against the local sequence
	 * and returns the remote client's position relative to the local
	 * sequence
	 * @param remoteClientPosition - The remote client's position to resolve
	 * @param remoteClientRefSeq - The reference sequence number of the remote client
	 * @param remoteClientId - The client id of the remote client
	 */
	public resolveRemoteClientPosition(
		remoteClientPosition: number,
		remoteClientRefSeq: number,
		remoteClientId: string,
	): number | undefined {
		const shortRemoteClientId = this.getOrAddShortClientId(remoteClientId);
		return this._mergeTree.resolveRemoteClientPosition(
			remoteClientPosition,
			remoteClientRefSeq,
			shortRemoteClientId,
		);
	}

	private lastNormalizationRefSeq = 0;

	private pendingRebase: DoublyLinkedList<SegmentGroup> | undefined;

	/**
	 * Given a pending operation and segment group, regenerate the op, so it
	 * can be resubmitted
	 * @param resetOp - The op to reset
	 * @param segmentGroup - The segment group associated with the op
	 */
	public regeneratePendingOp(resetOp: IMergeTreeOp, localOpMetadata: unknown): IMergeTreeOp {
		const segmentGroup = localOpMetadata as SegmentGroup | SegmentGroup[];
		if (this.pendingRebase === undefined || this.pendingRebase.empty) {
			let firstGroup: SegmentGroup;
			if (Array.isArray(segmentGroup)) {
				if (segmentGroup.length === 0) {
					// sometimes we rebase to an empty op
					// eslint-disable-next-line import/no-deprecated
					return createGroupOp();
				}
				firstGroup = segmentGroup[0];
			} else {
				firstGroup = segmentGroup;
			}
			const firstGroupNode = this._mergeTree.pendingSegments.find(
				(node) => node.data === firstGroup,
			);
			assert(
				firstGroupNode !== undefined,
				0x70e /* segment group must exist in pending list */,
			);
			this.pendingRebase = this._mergeTree.pendingSegments.splice(firstGroupNode);
		}

		const rebaseTo = this.getCollabWindow().currentSeq;
		if (rebaseTo !== this.lastNormalizationRefSeq) {
			this.emit("normalize", this);
			this._mergeTree.normalizeSegmentsOnRebase();
			this.lastNormalizationRefSeq = rebaseTo;
		}

		const opList: IMergeTreeDeltaOp[] = [];
		if (resetOp.type === MergeTreeDeltaType.GROUP) {
			if (Array.isArray(segmentGroup)) {
				assert(
					resetOp.ops.length === segmentGroup.length,
					0x03a /* "Number of ops in 'resetOp' must match the number of segment groups provided." */,
				);

				for (let i = 0; i < resetOp.ops.length; i++) {
					opList.push(...this.resetPendingDeltaToOps(resetOp.ops[i], segmentGroup[i]));
				}
			} else {
				// A group op containing a single op will pass a direct reference to 'segmentGroup'
				// rather than an array of segment groups.  (See 'peekPendingSegmentGroups()')
				assert(
					resetOp.ops.length === 1,
					0x03b /* "Number of ops in 'resetOp' must match the number of segment groups provided." */,
				);
				opList.push(...this.resetPendingDeltaToOps(resetOp.ops[0], segmentGroup));
			}
		} else {
			assert(
				(resetOp.type as unknown) !== MergeTreeDeltaType.GROUP,
				0x03c /* "Reset op has 'group' delta type!" */,
			);
			assert(
				!Array.isArray(segmentGroup),
				0x03d /* "segmentGroup is array rather than singleton!" */,
			);
			opList.push(...this.resetPendingDeltaToOps(resetOp, segmentGroup));
		}
		// eslint-disable-next-line import/no-deprecated
		return opList.length === 1 ? opList[0] : createGroupOp(...opList);
	}

	public createTextHelper(): IMergeTreeTextHelper {
		return new MergeTreeTextHelper(this._mergeTree);
	}

	public summarize(
		runtime: IFluidDataStoreRuntime,
		handle: IFluidHandle,
		serializer: IFluidSerializer,
		catchUpMsgs: ISequencedDocumentMessage[],
	): ISummaryTreeWithStats {
		const deltaManager = toDeltaManagerInternal(runtime.deltaManager);
		const minSeq = deltaManager.minimumSequenceNumber;

		// Catch up to latest MSN, if we have not had a chance to do it.
		// Required for case where FluidDataStoreRuntime.attachChannel()
		// generates summary right after loading data store.

		this.updateSeqNumbers(minSeq, deltaManager.lastSequenceNumber);

		// One of the summaries (from SPO) I observed to have chunk.chunkSequenceNumber > minSeq!
		// Not sure why - need to catch it sooner
		assert(
			this.getCollabWindow().minSeq === minSeq,
			0x03e /* "minSeq mismatch between collab window and delta manager!" */,
		);

		// Must continue to support legacy
		//       (See https://github.com/microsoft/FluidFramework/issues/84)
		if (this._mergeTree.options?.newMergeTreeSnapshotFormat === true) {
			assert(
				catchUpMsgs === undefined || catchUpMsgs.length === 0,
				0x03f /* "New format should not emit catchup ops" */,
			);
			const snap = new SnapshotV1(this._mergeTree, this.logger, (id) =>
				this.getLongClientId(id),
			);
			snap.extractSync();
			return snap.emit(serializer, handle);
		} else {
			const snap = new SnapshotLegacy(this._mergeTree, this.logger);
			snap.extractSync();
			return snap.emit(catchUpMsgs, serializer, handle);
		}
	}

	public async load(
		runtime: IFluidDataStoreRuntime,
		storage: IChannelStorageService,
		serializer: IFluidSerializer,
	): Promise<{ catchupOpsP: Promise<ISequencedDocumentMessage[]> }> {
		const loader = new SnapshotLoader(runtime, this, this._mergeTree, this.logger, serializer);

		return loader.initialize(storage);
	}

	// eslint-disable-next-line import/no-deprecated
	localTransaction(groupOp: IMergeTreeGroupMsg): void {
		for (const op of groupOp.ops) {
			const opArgs: IMergeTreeDeltaOpArgs = {
				op,
				groupOp,
			};
			switch (op.type) {
				case MergeTreeDeltaType.INSERT: {
					this.applyInsertOp(opArgs);
					break;
				}
				case MergeTreeDeltaType.ANNOTATE: {
					this.applyAnnotateRangeOp(opArgs);
					break;
				}
				case MergeTreeDeltaType.REMOVE: {
					this.applyRemoveRangeOp(opArgs);
					break;
				}
				case MergeTreeDeltaType.OBLITERATE_SIDED:
				case MergeTreeDeltaType.OBLITERATE: {
					this.applyObliterateRangeOp(opArgs);
					break;
				}
				default: {
					break;
				}
			}
		}
	}

	updateMinSeq(minSeq: number): void {
		this._mergeTree.setMinSeq(minSeq);
	}

	getContainingSegment<T extends ISegment>(
		pos: number,
		sequenceArgs?: Pick<ISequencedDocumentMessage, "referenceSequenceNumber" | "clientId">,
		localSeq?: number,
	): {
		segment: T | undefined;
		offset: number | undefined;
	} {
		let perspective: Perspective;
		const clientId =
			sequenceArgs !== undefined
				? this.getOrAddShortClientIdFromMessage(sequenceArgs)
				: this.getClientId();
		const refSeq = sequenceArgs?.referenceSequenceNumber ?? this.getCollabWindow().currentSeq;
		if (localSeq !== undefined) {
			perspective = new LocalReconnectingPerspective(refSeq, clientId, localSeq);
		} else if (sequenceArgs !== undefined) {
			perspective = new PriorPerspective(refSeq, clientId);
		} else {
			perspective = this._mergeTree.localPerspective;
		}

		return this._mergeTree.getContainingSegment(pos, perspective) as {
			segment: T | undefined;
			offset: number | undefined;
		};
	}

	getPropertiesAtPosition(pos: number): PropertySet | undefined {
		let propertiesAtPosition: PropertySet | undefined;
		const segoff = this.getContainingSegment(pos);
		const seg = segoff.segment;
		if (seg) {
			propertiesAtPosition = seg.properties;
		}
		return propertiesAtPosition;
	}

	getRangeExtentsOfPosition(pos: number): {
		posStart: number | undefined;
		posAfterEnd: number | undefined;
	} {
		let posStart: number | undefined;
		let posAfterEnd: number | undefined;

		const segoff = this.getContainingSegment(pos);
		const seg = segoff.segment;
		if (seg) {
			posStart = this.getPosition(seg);
			posAfterEnd = posStart + seg.cachedLength;
		}
		return { posStart, posAfterEnd };
	}

	getCurrentSeq(): number {
		return this.getCollabWindow().currentSeq;
	}

	getClientId(): number {
		return this.getCollabWindow().clientId;
	}

	getLength(): number {
		return this._mergeTree.length ?? 0;
	}

	startOrUpdateCollaboration(
		longClientId: string | undefined,
		minSeq = 0,
		currentSeq = 0,
	): void {
		// we should always have a client id if we are collaborating
		// if the client id is undefined we are likely bound to a detached
		// container, so we should keep going in local mode. once
		// the container attaches this will be called again on connect with the
		// client id
		if (longClientId !== undefined) {
			if (this.longClientId === undefined) {
				this.longClientId = longClientId;
				this.addLongClientId(this.longClientId);
				this._mergeTree.startCollaboration(
					this.getShortClientId(this.longClientId),
					minSeq,
					currentSeq,
				);
			} else {
				const oldClientId = this.longClientId;
				const oldData = this.clientNameToIds.get(oldClientId)!.data;
				this.longClientId = longClientId;
				this.clientNameToIds.put(longClientId, oldData);
				this.shortClientIdMap[oldData] = longClientId;
			}
		}
	}

	/**
	 * Searches a string for the nearest marker in either direction to a given start position.
	 * The search will include the start position, so markers at the start position are valid
	 * results of the search. Makes use of block-accelerated search functions for log(n) complexity.
	 *
	 * @param startPos - Position at which to start the search
	 * @param markerLabel - Label of the marker to search for
	 * @param forwards - Whether the desired marker comes before (false) or after (true) `startPos`
	 */
	searchForMarker(startPos: number, markerLabel: string, forwards = true): Marker | undefined {
		return this._mergeTree.searchForMarker(
			startPos,
			this._mergeTree.localPerspective,
			markerLabel,
			forwards,
		);
	}
}
