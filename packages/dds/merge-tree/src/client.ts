/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { type IEventThisPlaceHolder, IFluidHandle } from "@fluidframework/core-interfaces";
import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import {
	IFluidDataStoreRuntime,
	IChannelStorageService,
} from "@fluidframework/datastore-definitions/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions";
import { MessageType } from "@fluidframework/driver-definitions/internal";
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
import { UnassignedSequenceNumber, UniversalSequenceNumber } from "./constants.js";
import { LocalReferencePosition, SlidingPreference } from "./localReference.js";
import { IMergeTreeOptions, MergeTree } from "./mergeTree.js";
import type {
	IMergeTreeClientSequenceArgs,
	IMergeTreeDeltaCallbackArgs,
	IMergeTreeDeltaOpArgs,
	IMergeTreeMaintenanceCallbackArgs,
} from "./mergeTreeDeltaCallback.js";
import { walkAllChildSegments } from "./mergeTreeNodeWalk.js";
import {
	// eslint-disable-next-line import/no-deprecated
	CollaborationWindow,
	IMoveInfo,
	ISegment,
	ISegmentAction,
	ISegmentLeaf,
	Marker,
	// eslint-disable-next-line import/no-deprecated
	SegmentGroup,
	compareStrings,
} from "./mergeTreeNodes.js";
import {
	createAnnotateMarkerOp,
	createAnnotateRangeOp,
	// eslint-disable-next-line import/no-deprecated
	createGroupOp,
	createInsertSegmentOp,
	createObliterateRangeOp,
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
} from "./ops.js";
// eslint-disable-next-line import/no-deprecated
import { PropertySet, createMap } from "./properties.js";
import { DetachedReferencePosition, ReferencePosition } from "./referencePositions.js";
import { SnapshotLoader } from "./snapshotLoader.js";
import { SnapshotV1 } from "./snapshotV1.js";
import { SnapshotLegacy } from "./snapshotlegacy.js";
// eslint-disable-next-line import/no-deprecated
import { IMergeTreeTextHelper } from "./textSegment.js";

type IMergeTreeDeltaRemoteOpArgs = Omit<IMergeTreeDeltaOpArgs, "sequencedMessage"> &
	Required<Pick<IMergeTreeDeltaOpArgs, "sequencedMessage">>;

function removeMoveInfo(segment: Partial<IMoveInfo>): void {
	delete segment.movedSeq;
	delete segment.movedSeqs;
	delete segment.localMovedSeq;
	delete segment.movedClientIds;
	delete segment.wasMovedOnInsert;
}

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
 * @alpha
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

/**
 * @deprecated This functionality was not meant to be exported and will be removed in a future release
 * @alpha
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
		options?: IMergeTreeOptions & PropertySet,
		private readonly getMinInFlightRefSeq: () => number | undefined = () => undefined,
	) {
		super();
		this._mergeTree = new MergeTree(options);
		this._mergeTree.mergeTreeDeltaCallback = (opArgs, deltaArgs) => {
			this.emit("delta", opArgs, deltaArgs, this);
		};
		this._mergeTree.mergeTreeMaintenanceCallback = (args, opArgs) => {
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
	// eslint-disable-next-line import/no-deprecated
	public peekPendingSegmentGroups(): SegmentGroup | undefined;
	// eslint-disable-next-line import/no-deprecated
	public peekPendingSegmentGroups(count: number): SegmentGroup | SegmentGroup[] | undefined;
	// eslint-disable-next-line import/no-deprecated
	public peekPendingSegmentGroups(count: number = 1): SegmentGroup | SegmentGroup[] | undefined {
		const pending = this._mergeTree.pendingSegments;
		let node = pending?.last;
		if (count === 1 || pending === undefined) {
			return node?.data;
		}
		// eslint-disable-next-line import/no-deprecated
		const taken: SegmentGroup[] = new Array(Math.min(count, pending.length));
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
	public annotateMarker(marker: Marker, props: PropertySet): IMergeTreeAnnotateMsg | undefined {
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
	 * @param start - The inclusive start of the range to obliterate
	 * @param end - The exclusive end of the range to obliterate
	 */
	// eslint-disable-next-line import/no-deprecated
	public obliterateRangeLocal(start: number, end: number): IMergeTreeObliterateMsg {
		const obliterateOp = createObliterateRangeOp(start, end);
		this.applyObliterateRangeOp({ op: obliterateOp });
		return obliterateOp;
	}

	/**
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
	public walkSegments<undefined>(
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
			this.getCurrentSeq(),
			this.getClientId(),
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
			accum === undefined ? action : (seg) => action(seg, accum),
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
		walkAllChildSegments(this._mergeTree.root, (seg) => {
			if (seg.seq === UnassignedSequenceNumber) {
				localInserts++;
			}
			if (seg.removedSeq === UnassignedSequenceNumber) {
				localRemoves++;
			}
			// Only serialize segments that have not been removed.
			if (seg.removedSeq === undefined) {
				handleCollectingSerializer.stringify(seg.clone().toJSONObject(), handle);
			}
			return true;
		});

		if (localInserts > 0 || localRemoves > 0) {
			this.logger.sendErrorEvent({
				eventName: "LocalEditsInProcessGCData",
				localInserts,
				localRemoves,
			});
		}
	}

	// eslint-disable-next-line import/no-deprecated
	public getCollabWindow(): CollaborationWindow {
		return this._mergeTree.collabWindow;
	}

	/**
	 * Returns the current position of a segment, and -1 if the segment
	 * does not exist in this merge tree
	 * @param segment - The segment to get the position of
	 */
	public getPosition(segment: ISegment | undefined, localSeq?: number): number {
		const mergeSegment: ISegmentLeaf | undefined = segment;
		if (mergeSegment?.parent === undefined) {
			return -1;
		}
		return this._mergeTree.getPosition(
			mergeSegment,
			this.getCurrentSeq(),
			this.getClientId(),
			localSeq,
		);
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
	public removeLocalReferencePosition(lref: LocalReferencePosition) {
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
	public posFromRelativePos(relativePos: IRelativePosition) {
		return this._mergeTree.posFromRelativePos(relativePos);
	}

	public getMarkerFromId(id: string): ISegment | undefined {
		return this._mergeTree.getMarkerFromId(id);
	}

	/**
	 * Revert an op
	 */
	public rollback?(op: any, localOpMetadata: unknown) {
		// eslint-disable-next-line import/no-deprecated
		this._mergeTree.rollback(op as IMergeTreeDeltaOp, localOpMetadata as SegmentGroup);
	}

	private applyObliterateRangeOp(opArgs: IMergeTreeDeltaOpArgs): void {
		assert(
			opArgs.op.type === MergeTreeDeltaType.OBLITERATE,
			0x866 /* Unexpected op type on range obliterate! */,
		);
		const op = opArgs.op;
		const clientArgs = this.getClientSequenceArgs(opArgs);
		const range = this.getValidOpRange(op, clientArgs);

		this._mergeTree.obliterateRange(
			range.start,
			range.end,
			clientArgs.referenceSequenceNumber,
			clientArgs.clientId,
			clientArgs.sequenceNumber,
			false,
			opArgs,
		);
	}

	/**
	 * Performs the remove based on the provided op
	 * @param opArgs - The ops args for the op
	 */
	private applyRemoveRangeOp(opArgs: IMergeTreeDeltaOpArgs): void {
		assert(
			opArgs.op.type === MergeTreeDeltaType.REMOVE,
			0x02d /* "Unexpected op type on range remove!" */,
		);
		const op = opArgs.op;
		const clientArgs = this.getClientSequenceArgs(opArgs);
		const range = this.getValidOpRange(op, clientArgs);

		this._mergeTree.markRangeRemoved(
			range.start,
			range.end,
			clientArgs.referenceSequenceNumber,
			clientArgs.clientId,
			clientArgs.sequenceNumber,
			false,
			opArgs,
		);
	}

	/**
	 * Performs the annotate based on the provided op
	 * @param opArgs - The ops args for the op
	 */
	private applyAnnotateRangeOp(opArgs: IMergeTreeDeltaOpArgs): void {
		assert(
			opArgs.op.type === MergeTreeDeltaType.ANNOTATE,
			0x02e /* "Unexpected op type on range annotate!" */,
		);
		const op = opArgs.op;
		const clientArgs = this.getClientSequenceArgs(opArgs);
		const range = this.getValidOpRange(op, clientArgs);

		this._mergeTree.annotateRange(
			range.start,
			range.end,
			op.props,
			clientArgs.referenceSequenceNumber,
			clientArgs.clientId,
			clientArgs.sequenceNumber,
			opArgs,
		);
	}

	/**
	 * Performs the insert based on the provided op
	 * @param opArgs - The ops args for the op
	 * @returns True if the insert was applied. False if it could not be.
	 */
	private applyInsertOp(opArgs: IMergeTreeDeltaOpArgs): void {
		assert(
			opArgs.op.type === MergeTreeDeltaType.INSERT,
			0x02f /* "Unexpected op type on range insert!" */,
		);
		const op = opArgs.op;
		const clientArgs = this.getClientSequenceArgs(opArgs);
		const range = this.getValidOpRange(op, clientArgs);

		const segments = [this.specToSegment(op.seg)];

		this._mergeTree.insertSegments(
			range.start,
			segments,
			clientArgs.referenceSequenceNumber,
			clientArgs.clientId,
			clientArgs.sequenceNumber,
			opArgs,
		);
	}

	/**
	 * Returns a valid range for the op, or undefined
	 * @param op - The op to generate the range for
	 * @param clientArgs - The client args for the op
	 */
	private getValidOpRange(
		op:
			| IMergeTreeAnnotateMsg
			| IMergeTreeInsertMsg
			| IMergeTreeRemoveMsg
			// eslint-disable-next-line import/no-deprecated
			| IMergeTreeObliterateMsg,
		clientArgs: IMergeTreeClientSequenceArgs,
	): IIntegerRange {
		let start: number | undefined = op.pos1;
		if (start === undefined && op.relativePos1) {
			start = this._mergeTree.posFromRelativePos(
				op.relativePos1,
				clientArgs.referenceSequenceNumber,
				clientArgs.clientId,
			);
		}

		let end: number | undefined = op.pos2;
		if (end === undefined && op.relativePos2) {
			end = this._mergeTree.posFromRelativePos(
				op.relativePos2,
				clientArgs.referenceSequenceNumber,
				clientArgs.clientId,
			);
		}

		// Validate if local op
		if (clientArgs.clientId === this.getClientId()) {
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
			//
			if (op.type !== MergeTreeDeltaType.INSERT || end !== undefined) {
				if (end === undefined || end <= start!) {
					invalidPositions.push("end");
				}
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

	/**
	 * Gets the client args from the op if remote, otherwise uses the local clients info
	 * @param sequencedMessage - The sequencedMessage to get the client sequence args for
	 */
	private getClientSequenceArgsForMessage(
		sequencedMessage:
			| ISequencedDocumentMessage
			| Pick<ISequencedDocumentMessage, "referenceSequenceNumber" | "clientId">
			| undefined,
	) {
		// If there this no sequenced message, then the op is local
		// and unacked, so use this clients sequenced args
		//
		if (!sequencedMessage) {
			const segWindow = this.getCollabWindow();
			return {
				clientId: segWindow.clientId,
				referenceSequenceNumber: segWindow.currentSeq,
				sequenceNumber: this.getLocalSequenceNumber(),
			};
		} else {
			return {
				clientId: this.getOrAddShortClientIdFromMessage(sequencedMessage),
				referenceSequenceNumber: sequencedMessage.referenceSequenceNumber,
				// Note: return value satisfies overload signatures despite the cast, as if input argument doesn't contain sequenceNumber,
				// return value isn't expected to have it either.
				sequenceNumber: (sequencedMessage as ISequencedDocumentMessage).sequenceNumber,
			};
		}
	}

	/**
	 * Gets the client args from the op if remote, otherwise uses the local clients info
	 * @param opArgs - The op arg to get the client sequence args for
	 */
	private getClientSequenceArgs(opArgs: IMergeTreeDeltaOpArgs): IMergeTreeClientSequenceArgs {
		return this.getClientSequenceArgsForMessage(opArgs.sequencedMessage);
	}

	private ackPendingSegment(opArgs: IMergeTreeDeltaRemoteOpArgs) {
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

	getOrAddShortClientId(longClientId: string) {
		if (!this.clientNameToIds.get(longClientId)) {
			this.addLongClientId(longClientId);
		}
		return this.getShortClientId(longClientId);
	}

	protected getShortClientId(longClientId: string) {
		return this.clientNameToIds.get(longClientId)!.data;
	}

	getLongClientId(shortClientId: number) {
		return shortClientId >= 0 ? this.shortClientIdMap[shortClientId] : "original";
	}

	addLongClientId(longClientId: string) {
		this.clientNameToIds.put(longClientId, this.shortClientIdMap.length);
		this.shortClientIdMap.push(longClientId);
	}

	private getOrAddShortClientIdFromMessage(msg: Pick<ISequencedDocumentMessage, "clientId">) {
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
	public findReconnectionPosition(segment: ISegment, localSeq: number) {
		assert(
			localSeq <= this._mergeTree.collabWindow.localSeq,
			0x032 /* "localSeq greater than collab window" */,
		);
		const { currentSeq, clientId } = this.getCollabWindow();
		return this._mergeTree.getPosition(segment, currentSeq, clientId, localSeq);
	}

	private resetPendingDeltaToOps(
		resetOp: IMergeTreeDeltaOp,
		// eslint-disable-next-line import/no-deprecated
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
		// eslint-disable-next-line import/no-deprecated
		const obliterateSegmentGroup: SegmentGroup = {
			segments: [],
			localSeq: segmentGroup.localSeq,
			refSeq: this.getCollabWindow().currentSeq,
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
				segment.segmentGroups.remove?.(segmentGroup) === true,
				0x035 /* "Segment group not in segment pending queue" */,
			);
			assert(
				segmentGroup.localSeq !== undefined,
				0x867 /* expected segment group localSeq to be defined */,
			);
			const segmentPosition = this.findReconnectionPosition(segment, segmentGroup.localSeq);
			let newOp: IMergeTreeDeltaOp | undefined;
			switch (resetOp.type) {
				case MergeTreeDeltaType.ANNOTATE:
					assert(
						segment.propertyManager?.hasPendingProperties(resetOp.props) === true,
						0x036 /* "Segment has no pending properties" */,
					);
					// if the segment has been removed or obliterated, there's no need to send the annotate op
					// unless the remove was local, in which case the annotate must have come
					// before the remove
					if (
						(segment.removedSeq === undefined ||
							(segment.localRemovedSeq !== undefined &&
								segment.removedSeq === UnassignedSequenceNumber)) &&
						(segment.movedSeq === undefined ||
							(segment.localMovedSeq !== undefined &&
								segment.movedSeq === UnassignedSequenceNumber))
					) {
						newOp = createAnnotateRangeOp(
							segmentPosition,
							segmentPosition + segment.cachedLength,
							resetOp.props,
						);
					}
					break;

				case MergeTreeDeltaType.INSERT:
					assert(
						segment.seq === UnassignedSequenceNumber,
						0x037 /* "Segment already has assigned sequence number" */,
					);
					let segInsertOp = segment;
					if (typeof resetOp.seg === "object" && resetOp.seg.props !== undefined) {
						segInsertOp = segment.clone();
						// eslint-disable-next-line import/no-deprecated
						segInsertOp.properties = createMap();
						segInsertOp.addProperties(resetOp.seg.props);
					}
					if (segment.movedSeq !== UnassignedSequenceNumber) {
						removeMoveInfo(segment);
					}
					newOp = createInsertSegmentOp(segmentPosition, segInsertOp);
					break;

				case MergeTreeDeltaType.REMOVE:
					if (
						segment.localRemovedSeq !== undefined &&
						segment.removedSeq === UnassignedSequenceNumber &&
						(segment.movedSeq === undefined ||
							(segment.localMovedSeq !== undefined &&
								segment.movedSeq === UnassignedSequenceNumber))
					) {
						newOp = createRemoveRangeOp(
							segmentPosition,
							segmentPosition + segment.cachedLength,
						);
					}
					break;
				case MergeTreeDeltaType.OBLITERATE:
					if (
						segment.localMovedSeq !== undefined &&
						segment.movedSeq === UnassignedSequenceNumber &&
						(segment.removedSeq === undefined ||
							(segment.localRemovedSeq !== undefined &&
								segment.removedSeq === UnassignedSequenceNumber))
					) {
						newOp = createObliterateRangeOp(
							segmentPosition,
							segmentPosition + segment.cachedLength,
						);
					}
					break;
				default:
					throw new Error(`Invalid op type`);
			}

			if (newOp && resetOp.type === MergeTreeDeltaType.OBLITERATE) {
				segment.segmentGroups.enqueue(obliterateSegmentGroup);

				const first = opList[0];

				if (!!first && first.pos2 !== undefined) {
					first.pos2 += newOp.pos2! - newOp.pos1!;
				} else {
					opList.push(newOp);
				}
			} else if (newOp) {
				// eslint-disable-next-line import/no-deprecated
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

	private applyRemoteOp(opArgs: IMergeTreeDeltaRemoteOpArgs) {
		const op = opArgs.op;
		const msg = opArgs.sequencedMessage;
		this.getOrAddShortClientIdFromMessage(msg);
		switch (op.type) {
			case MergeTreeDeltaType.INSERT:
				this.applyInsertOp(opArgs);
				break;
			case MergeTreeDeltaType.REMOVE:
				this.applyRemoveRangeOp(opArgs);
				break;
			case MergeTreeDeltaType.ANNOTATE:
				this.applyAnnotateRangeOp(opArgs);
				break;
			case MergeTreeDeltaType.OBLITERATE:
				this.applyObliterateRangeOp(opArgs);
				break;
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
			default:
				break;
		}
	}

	public applyStashedOp(op: IMergeTreeOp): void {
		switch (op.type) {
			case MergeTreeDeltaType.INSERT:
				this.applyInsertOp({ op });
				break;
			case MergeTreeDeltaType.REMOVE:
				this.applyRemoveRangeOp({ op });
				break;
			case MergeTreeDeltaType.ANNOTATE:
				this.applyAnnotateRangeOp({ op });
				break;
			case MergeTreeDeltaType.OBLITERATE:
				this.applyObliterateRangeOp({ op });
				break;
			case MergeTreeDeltaType.GROUP:
				op.ops.map((o) => this.applyStashedOp(o));
				break;
			default:
				unreachableCase(op, "unrecognized op type");
		}
	}

	public applyMsg(msg: ISequencedDocumentMessage, local: boolean = false) {
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

	private updateSeqNumbers(min: number, seq: number) {
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

	// eslint-disable-next-line import/no-deprecated
	private pendingRebase: DoublyLinkedList<SegmentGroup> | undefined;

	/**
	 * Given a pending operation and segment group, regenerate the op, so it
	 * can be resubmitted
	 * @param resetOp - The op to reset
	 * @param segmentGroup - The segment group associated with the op
	 */
	public regeneratePendingOp(
		resetOp: IMergeTreeOp,
		// eslint-disable-next-line import/no-deprecated
		segmentGroup: SegmentGroup | SegmentGroup[],
	): IMergeTreeOp {
		if (this.pendingRebase === undefined || this.pendingRebase.empty) {
			// eslint-disable-next-line import/no-deprecated
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
				(resetOp.type as any) !== MergeTreeDeltaType.GROUP,
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

	// eslint-disable-next-line import/no-deprecated
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

	private getLocalSequenceNumber() {
		const segWindow = this.getCollabWindow();
		return segWindow.collaborating ? UnassignedSequenceNumber : UniversalSequenceNumber;
	}

	// eslint-disable-next-line import/no-deprecated
	localTransaction(groupOp: IMergeTreeGroupMsg) {
		for (const op of groupOp.ops) {
			const opArgs: IMergeTreeDeltaOpArgs = {
				op,
				groupOp,
			};
			switch (op.type) {
				case MergeTreeDeltaType.INSERT:
					this.applyInsertOp(opArgs);
					break;
				case MergeTreeDeltaType.ANNOTATE:
					this.applyAnnotateRangeOp(opArgs);
					break;
				case MergeTreeDeltaType.REMOVE:
					this.applyRemoveRangeOp(opArgs);
					break;
				case MergeTreeDeltaType.OBLITERATE:
					this.applyObliterateRangeOp(opArgs);
					break;
				default:
					break;
			}
		}
	}

	updateMinSeq(minSeq: number) {
		this._mergeTree.setMinSeq(minSeq);
	}

	getContainingSegment<T extends ISegment>(
		pos: number,
		sequenceArgs?: Pick<ISequencedDocumentMessage, "referenceSequenceNumber" | "clientId">,
		localSeq?: number,
	) {
		const { referenceSequenceNumber, clientId } =
			this.getClientSequenceArgsForMessage(sequenceArgs);
		return this._mergeTree.getContainingSegment<T>(
			pos,
			referenceSequenceNumber,
			clientId,
			localSeq,
		);
	}

	getPropertiesAtPosition(pos: number) {
		let propertiesAtPosition: PropertySet | undefined;
		const segoff = this.getContainingSegment(pos);
		const seg = segoff.segment;
		if (seg) {
			propertiesAtPosition = seg.properties;
		}
		return propertiesAtPosition;
	}

	getRangeExtentsOfPosition(pos: number) {
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

	getCurrentSeq() {
		return this.getCollabWindow().currentSeq;
	}

	getClientId() {
		return this.getCollabWindow().clientId;
	}

	getLength() {
		return this._mergeTree.length ?? 0;
	}

	startOrUpdateCollaboration(longClientId: string | undefined, minSeq = 0, currentSeq = 0) {
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
	searchForMarker(startPos: number, markerLabel: string, forwards = true) {
		const clientId = this.getClientId();
		return this._mergeTree.searchForMarker(startPos, clientId, markerLabel, forwards);
	}
}
