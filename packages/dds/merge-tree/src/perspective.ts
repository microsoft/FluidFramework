/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UnassignedSequenceNumber } from "./constants.js";
import { type MergeTree } from "./mergeTree.js";
import { LeafAction, backwardExcursion, forwardExcursion } from "./mergeTreeNodeWalk.js";
import { seqLTE, type ISegment } from "./mergeTreeNodes.js";

/**
 * Provides a view of a MergeTree from the perspective of a specific client at a specific sequence number.
 */
export interface Perspective {
	nextSegment(segment: ISegment, forward?: boolean): ISegment;
	previousSegment(segment: ISegment): ISegment;
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
 * See {@link Client.createPerspective}.
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
	public nextSegment(segment: ISegment, forward: boolean = true): ISegment {
		let next: ISegment | undefined;
		const action = (seg: ISegment) => {
			if (isSegmentPresent(seg, this._seqTime)) {
				next = seg;
				return LeafAction.Exit;
			}
		};
		(forward ? forwardExcursion : backwardExcursion)(segment, action);
		return next ?? (forward ? this._mergeTree.endOfTree : this._mergeTree.startOfTree);
	}

	/**
	 * @param segment - The segment to start from.
	 * @returns the previous segment, or the start of the tree if there is no previous segment.
	 * @remarks This is a convenient equivalent to calling `nextSegment(segment, false)`.
	 */
	public previousSegment(segment: ISegment): ISegment {
		return this.nextSegment(segment, false);
	}
}

/**
 * @param seg - The segment to check.
 * @param seq - The latest sequence number to consider.
 * @param localSeq - The latest local sequence number to consider.
 * @returns true iff this segment was removed in the given perspective.
 */
export function wasRemovedBefore(seg: ISegment, { refSeq, localSeq }: SeqTime): boolean {
	if (
		seg.removedSeq === UnassignedSequenceNumber &&
		localSeq !== undefined &&
		seg.localRemovedSeq !== undefined
	) {
		return seg.localRemovedSeq <= localSeq;
	}
	return seg.removedSeq !== undefined && seqLTE(seg.removedSeq, refSeq);
}

/**
 * @param seg - The segment to check.
 * @param refSeq - The latest sequence number to consider.
 * @param localSeq - The latest local sequence number to consider.
 * @returns true iff this segment was moved (aka obliterated) in the given perspective.
 */
export function wasMovedBefore(seg: ISegment, { refSeq, localSeq }: SeqTime): boolean {
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
 */
export function wasRemovedOrMovedBefore(seg: ISegment, seqTime: SeqTime): boolean {
	return wasRemovedBefore(seg, seqTime) || wasMovedBefore(seg, seqTime);
}

/**
 *
 * @param seg - The segment to check.
 * @param seqTime - The latest sequence number and local sequence number to consider.
 * @returns true iff this segment was inserted before the given perspective,
 * and it was not removed or moved in the given perspective.
 */
export function isSegmentPresent(seg: ISegment, seqTime: SeqTime): boolean {
	const { refSeq, localSeq } = seqTime;
	// If seg.seq is undefined, then this segment has existed since minSeq.
	// It may have been moved or removed since.
	if (seg.seq !== undefined) {
		if (seg.seq !== UnassignedSequenceNumber) {
			if (!seqLTE(seg.seq, refSeq)) {
				return false;
			}
		} else if (seg.localSeq !== undefined) {
			// seg.seq === UnassignedSequenceNumber
			// If the current perspective does not include local sequence numbers,
			// then this segment does not exist yet.
			if (localSeq === undefined || seg.localSeq > localSeq) {
				return false;
			}
		}
	}
	if (wasRemovedOrMovedBefore(seg, seqTime)) {
		return false;
	}
	return true;
}
