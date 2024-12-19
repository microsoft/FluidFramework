/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { ISegmentInternal, ISegmentLeaf } from "./mergeTreeNodes.js";
import type { ReferencePosition } from "./referencePositions.js";

/**
 * Contains insertion information associated to an {@link ISegment}.
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
}

/**
 * Converts a segment-like object to an insertion info object if possible.
 *
 * @param segmentLike - The segment-like object to convert.
 * @returns The insertion info object if the conversion is possible, otherwise undefined.
 */
export function toInsertionInfo(
	segmentLike: ISegmentInternal | Partial<IInsertionInfo> | undefined,
): IInsertionInfo | undefined {
	const maybe = segmentLike as Partial<IInsertionInfo> | undefined;
	if (maybe?.clientId !== undefined && maybe?.seq !== undefined) {
		return segmentLike as IInsertionInfo;
	}
	assert(
		maybe?.clientId === undefined && maybe?.seq === undefined,
		"both clientId and seq should be set or not set",
	);
}

/**
 * A type-guard which determines if the segment has insertion info, and
 * returns true if it does, along with applying strong typing.
 *
 * @param segmentLike - The segment-like object to check.
 * @returns True if the segment has insertion info, otherwise false.
 */
export const isInserted = (
	segmentLike: ISegmentInternal | Partial<IInsertionInfo> | undefined,
): segmentLike is IInsertionInfo => toInsertionInfo(segmentLike) !== undefined;

/**
 * Asserts that the segment has insertion info. Usage of this function should not produce a user facing error.
 *
 * @param segmentLike - The segment-like object to check.
 * @throws Will throw an error if the segment does not have insertion info.
 */
export const assertInserted: <T extends Partial<IInsertionInfo> | undefined>(
	segmentLike: ISegmentInternal | Partial<IInsertionInfo> | T,
) => asserts segmentLike is IInsertionInfo | Exclude<T, Partial<IInsertionInfo>> = (
	segmentLike,
) => assert(segmentLike === undefined || isInserted(segmentLike), "must be insertionInfo");

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
 * Converts a segment-like object to a removal info object if possible.
 *
 * @param segmentLike - The segment-like object to convert.
 * @returns The removal info object if the conversion is possible, otherwise undefined.
 */
export function toRemovalInfo(
	segmentLike: ISegmentInternal | Partial<IRemovalInfo> | undefined,
): IRemovalInfo | undefined {
	const maybe = segmentLike as Partial<IRemovalInfo> | undefined;
	if (maybe?.removedClientIds !== undefined && maybe?.removedSeq !== undefined) {
		return segmentLike as IRemovalInfo;
	}
	assert(
		maybe?.removedClientIds === undefined && maybe?.removedSeq === undefined,
		0x2bf /* "both removedClientIds and removedSeq should be set or not set" */,
	);
}

/**
 * A type-guard which determines if the segment has removal info, and
 * returns true if it does, along with applying strong typing.
 *
 * @param segmentLike - The segment-like object to check.
 * @returns True if the segment has removal info, otherwise false.
 */
export const isRemoved = (
	segmentLike: ISegmentInternal | Partial<IRemovalInfo> | undefined,
): segmentLike is IRemovalInfo => toRemovalInfo(segmentLike) !== undefined;

/**
 * Asserts that the segment has removal info. Usage of this function should not produce a user facing error.
 *
 * @param segmentLike - The segment-like object to check.
 * @throws Will throw an error if the segment does not have removal info.
 */
export const assertRemoved: <T extends Partial<IRemovalInfo> | undefined>(
	segmentLike: ISegmentInternal | Partial<IRemovalInfo> | T,
) => asserts segmentLike is IRemovalInfo | Exclude<T, Partial<IRemovalInfo>> = (segmentLike) =>
	assert(segmentLike === undefined || isRemoved(segmentLike), "must be removalInfo");

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

export function toMoveInfo(
	segmentLike: ISegmentInternal | Partial<IMoveInfo> | undefined,
): IMoveInfo | undefined {
	const maybe = segmentLike as Partial<IMoveInfo> | undefined;
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
 * A type-guard which determines if the segment has move info, and
 * returns true if it does, along with applying strong typing.
 *
 * @param segmentLike - The segment-like object to check.
 * @returns True if the segment has move info, otherwise false.
 */
export const isMoved = (
	segmentLike: ISegmentInternal | Partial<IMoveInfo> | undefined,
): segmentLike is IMoveInfo => toMoveInfo(segmentLike) !== undefined;

/**
 * Asserts that the segment has move info. Usage of this function should not produce a user facing error.
 *
 * @param segmentLike - The segment-like object to check.
 * @throws Will throw an error if the segment does not have move info.
 */
export const assertMoved: <T extends Partial<IMoveInfo> | undefined>(
	segmentLike: ISegmentInternal | Partial<IMoveInfo> | T,
) => asserts segmentLike is IMoveInfo | Exclude<T, Partial<IMoveInfo>> = (segmentLike) =>
	assert(segmentLike === undefined || isMoved(segmentLike), "must be moveInfo");

/**
 * A union type representing any segment info.
 */
export type SegmentInfo = IInsertionInfo | IMoveInfo | IRemovalInfo;

/**
 * A type representing a segment with additional info.
 *
 */
export type SegmentWithInfo<T extends SegmentInfo> = ISegmentLeaf & T;

/**
 * Overwrites the segment info on a segment-like object.
 *
 * @param segmentLike - The segment-like object to set the info on.
 * @param info - The segment info to overwrite.
 * @returns The segment-like object with the info set.
 */
export const overwriteInfo = <T extends SegmentInfo>(
	segmentLike: ISegmentLeaf,
	info: T,
): SegmentWithInfo<T> => Object.assign(segmentLike, info);
