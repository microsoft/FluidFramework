/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { ISegmentInternal } from "./mergeTreeNodes.js";
import type { ReferencePosition } from "./referencePositions.js";

/**
 * @internal
 */
export interface IInsertionInfo {
	/**
	 * Short clientId for the client that inserted this segment.
	 */
	clientId: number;

	/**
	 * Local seq at which this segment was inserted.
	 * This is defined if and only if the insertion of the segment is pending ack, i.e. `seq` is UnassignedSequenceNumber.
	 * Once the segment is acked, this field is cleared.
	 *
	 * @privateRemarks
	 * See {@link CollaborationWindow.localSeq} for more information on the semantics of localSeq.
	 */
	localSeq?: number;
	/**
	 * Seq at which this segment was inserted.
	 * If undefined, it is assumed the segment was inserted prior to the collab window's minimum sequence number.
	 */
	seq: number;

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
 * Returns the insertion information for a segment.
 */
export function toInsertionInfo(
	maybe: Partial<IInsertionInfo> | undefined,
): IInsertionInfo | undefined {
	if (maybe?.clientId !== undefined && maybe?.seq !== undefined) {
		return maybe as IInsertionInfo;
	}
	assert(
		maybe?.clientId === undefined && maybe?.seq === undefined,
		"both clientId and seq should be set or not set",
	);
}
export const hasInsertionInfo = (
	maybe: Partial<IInsertionInfo> | undefined,
): maybe is IInsertionInfo => toInsertionInfo(maybe) !== undefined;

export const assertInsertionInfo: (
	maybe: Partial<IInsertionInfo>,
) => asserts maybe is IInsertionInfo = (maybe) =>
	assert(hasInsertionInfo(maybe), "must be insertionInfo");

/**
 * Contains removal information associated to an {@link ISegment}.
 * @legacy
 * @alpha
 * @deprecated - This interface will be removed in 2.20 with no replacement.
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
 * Returns the removal information for a segment.
 *
 * @internal
 */
export function toRemovalInfo(
	maybe: Partial<IRemovalInfo> | undefined,
): IRemovalInfo | undefined {
	if (maybe?.removedClientIds !== undefined && maybe?.removedSeq !== undefined) {
		return maybe as IRemovalInfo;
	}
	assert(
		maybe?.removedClientIds === undefined && maybe?.removedSeq === undefined,
		0x2bf /* "both removedClientIds and removedSeq should be set or not set" */,
	);
}

export const hasRemovalInfo = (
	maybe: Partial<IRemovalInfo> | undefined,
): maybe is IRemovalInfo => toRemovalInfo(maybe) !== undefined;

export const assertRemovalInfo: (
	maybe: Partial<IRemovalInfo>,
) => asserts maybe is IRemovalInfo = (maybe) =>
	assert(hasRemovalInfo(maybe), "must be removalInfo");

/**
 * Tracks information about when and where this segment was moved to.
 *
 * Note that merge-tree does not currently support moving and only supports
 * obliterate. The fields below include "move" in their names to avoid renaming
 * in the future, when moves _are_ supported.
 * @legacy
 * @alpha
 * @deprecated - This interface will be removed in 2.20 with no replacement.
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

export const hasMoveInfo = (maybe: Partial<IMoveInfo> | undefined): maybe is IMoveInfo =>
	toMoveInfo(maybe) !== undefined;

export const assertMoveInfo: (maybe: Partial<IMoveInfo>) => asserts maybe is IMoveInfo = (
	maybe,
) => assert(hasMoveInfo(maybe), "must be MoveInfo");

export type SegmentInfo = IInsertionInfo | IMoveInfo | IRemovalInfo;

export type SegmentWithInfo<T extends SegmentInfo> = ISegmentInternal & T;

export const setSegmentInfo = <T extends SegmentInfo>(
	info: T,
	maybe: ISegmentInternal,
): SegmentWithInfo<T> => Object.assign(maybe, info);
