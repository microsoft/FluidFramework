/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UnassignedSequenceNumber } from "./constants.js";
import { type MergeTree } from "./mergeTree.js";
import { LeafAction, backwardExcursion, forwardExcursion } from "./mergeTreeNodeWalk.js";
import { seqLTE, timestampUtils, type ISegmentLeaf } from "./mergeTreeNodes.js";
import {
	isInserted,
	isMoved,
	isRemoved,
	type IHasInsertionInfo,
	type IMoveInfo,
	type IHasRemovalInfo,
	type SegmentWithInfo,
} from "./segmentInfos.js";

/**
 * Provides a view of a MergeTree from the perspective of a specific client at a specific sequence number.
 */
export interface Perspective {
	nextSegment(segment: ISegmentLeaf, forward?: boolean): ISegmentLeaf;
	previousSegment(segment: ISegmentLeaf): ISegmentLeaf;
}

/**
 * Represents a point in time inside the collaboration window.
 */
export interface SeqTime {
	refSeq: number;
	localSeq?: number;
}

/**
 * Implementation of {@link Perspective}.
 * @privateRemarks
 * TODO:AB#29765: This class does not support non-local-client perspectives, but should.
 */
export class PerspectiveImpl implements Perspective {
	/**
	 * @param _mergeTree - The {@link MergeTree} to view.
	 * @param _seqTime - The latest sequence number and local sequence number to consider.
	 */
	public constructor(
		private readonly _mergeTree: MergeTree,
		private readonly _seqTime: SeqTime,
	) {}

	/**
	 * Returns the immediately adjacent segment in the specified direction from this perspective.
	 * There may actually be multiple segments between the given segment and the returned segment,
	 * but they were either inserted after this perspective, or have been removed or moved before this perspective.
	 *
	 * @param segment - The segment to start from.
	 * @param forward - The direction to search.
	 * @returns the next segment in the specified direction, or the start or end of the tree if there is no next segment.
	 */
	public nextSegment(segment: ISegmentLeaf, forward: boolean = true): ISegmentLeaf {
		let next: ISegmentLeaf | undefined;
		const action = (seg: ISegmentLeaf): boolean | undefined => {
			if (isSegmentPresent(seg, this._seqTime)) {
				next = seg;
				return LeafAction.Exit;
			}
		};
		(forward ? forwardExcursion : backwardExcursion)(segment, action);
		return next ?? (forward ? this._mergeTree.endOfTree : this._mergeTree.startOfTree);
	}

	/**
	 * Finds the segment prior to the given segment.
	 * @param segment - The segment to start from.
	 * @returns the previous segment, or the start of the tree if there is no previous segment.
	 * @remarks This is a convenient equivalent to calling `nextSegment(segment, false)`.
	 */
	public previousSegment(segment: ISegmentLeaf): ISegmentLeaf {
		return this.nextSegment(segment, false);
	}
}

/**
 * Determines if the given segment was removed before the given perspective.
 * @param seg - The segment to check.
 * @param seq - The latest sequence number to consider.
 * @param localSeq - The latest local sequence number to consider.
 * @returns true iff this segment was removed in the given perspective.
 * @privateRemarks
 * TODO:AB#29765: This function does not support non-local-client perspectives, but should.
 */
export function wasRemovedBefore(
	seg: SegmentWithInfo<IHasInsertionInfo & IHasRemovalInfo>,
	{ refSeq, localSeq }: SeqTime,
): boolean {
	const firstRemove = seg.removes?.[0];
	if (firstRemove === undefined) {
		return false;
	}

	if (timestampUtils.isLocal(firstRemove) && localSeq !== undefined) {
		return firstRemove.localSeq! <= localSeq;
	}

	return seqLTE(firstRemove.seq, refSeq);
}

/**
 * Determines if the given segment was moved before the given perspective.
 * @param seg - The segment to check.
 * @param refSeq - The latest sequence number to consider.
 * @param localSeq - The latest local sequence number to consider.
 * @returns true iff this segment was moved (aka obliterated) in the given perspective.
 * @privateRemarks
 * TODO:AB#29765: This function does not support non-local-client perspectives, but should.
 */
export function wasMovedBefore(
	seg: SegmentWithInfo<IHasInsertionInfo & IMoveInfo>,
	{ refSeq, localSeq }: SeqTime,
): boolean {
	if (
		seg.movedSeq === UnassignedSequenceNumber &&
		localSeq !== undefined &&
		seg.localMovedSeq !== undefined
	) {
		return seg.localMovedSeq <= localSeq;
	}
	return seg.movedSeq !== undefined && seqLTE(seg.movedSeq, refSeq);
}

/**
 * See {@link wasRemovedBefore} and {@link wasMovedBefore}.
 * @privateRemarks
 * TODO:AB#29765: This function does not support non-local-client perspectives, but should.
 */
export function wasRemovedOrMovedBefore(seg: ISegmentLeaf, seqTime: SeqTime): boolean {
	return (
		isInserted(seg) &&
		((isRemoved(seg) && wasRemovedBefore(seg, seqTime)) ||
			(isMoved(seg) && wasMovedBefore(seg, seqTime)))
	);
}

/**
 * Determines if the given segment is present in the given perspective.
 * @param seg - The segment to check.
 * @param seqTime - The latest sequence number and local sequence number to consider.
 * @returns true iff this segment was inserted before the given perspective,
 * and it was not removed or moved in the given perspective.
 * @privateRemarks
 * TODO:AB#29765: This function does not support non-local-client perspectives, but should.
 */
export function isSegmentPresent(seg: ISegmentLeaf, seqTime: SeqTime): boolean {
	const { refSeq, localSeq } = seqTime;
	// If seg.seq is undefined, then this segment has existed since minSeq.
	// It may have been moved or removed since.
	if (isInserted(seg)) {
		// TODO: This function should be replaceable with things in the spirit of the following:
		// if (
		// 	timestampUtils.greaterThan(seg.insert, {
		// 		seq: refSeq,
		// 		clientId: NonCollabClient,
		// 		localSeq,
		// 	})
		// ) {
		// 	return false;
		// }
		// However, it may need some special casing for the local client + unassigned seqs similar to what we have in localNetLength...
		if (seg.insert.seq !== UnassignedSequenceNumber) {
			if (!seqLTE(seg.insert.seq, refSeq)) {
				return false;
			}
		} else if (
			seg.insert.localSeq !== undefined && // seg.seq === UnassignedSequenceNumber
			// If the current perspective does not include local sequence numbers,
			// then this segment does not exist yet.
			(localSeq === undefined || seg.insert.localSeq > localSeq)
		) {
			return false;
		}
	}
	if (wasRemovedOrMovedBefore(seg, seqTime)) {
		return false;
	}
	return true;
}
