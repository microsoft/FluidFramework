/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UnassignedSequenceNumber } from "./constants.js";
import { type MergeTree } from "./mergeTree.js";
import { LeafAction, backwardExcursion, forwardExcursion } from "./mergeTreeNodeWalk.js";
import { type ISegment } from "./mergeTreeNodes.js";

/**
 * Defines a side relative to an element in a sequence.
 *
 * @public
 */
export enum Side {
	Before = 0,
	After = 1,
}

/**
 * A place between two elements in a sequence.
 * A `pos` of `undefined` means the extents of the sequence.
 * Before undefined is the end of the sequence, After undefined is the start of the sequence.
 *
 * @public
 */
export interface Place {
	/**
	 * The index of the reference sibling measured from the start of the sequence.
	 */
	readonly pos: number | undefined;
	readonly side: Side;
}

/**
 * Provides a view of a MergeTree from the perspective of a specific client at a specific sequence number.
 *
 * @public
 */
export interface Perspective {
	nextSegment(segment: ISegment, forward?: boolean): ISegment;
	previousSegment(segment: ISegment): ISegment;
}

/**
 * Implementation of {@link Perspective}.
 * See {@link Client.createPerspective}.
 *
 * @internal
 */
export class PerspectiveImpl implements Perspective {
	/**
	 * @param _mergeTree - The {@link MergeTree} to view.
	 * @param _sequenceNumber - The latest sequence number to include in the view.
	 * @param _clientId - The client ID to view from.
	 * @param _localSequenceNumber - The latest local sequence number to include in the view.
	 */
	public constructor(
		private readonly _mergeTree: MergeTree,
		private readonly _sequenceNumber: number,
		private readonly _clientId: number,
		private readonly _refSeq: number = _sequenceNumber,
		private readonly _localSequenceNumber?: number,
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
			if (
				isSegmentPresent(
					seg,
					this._sequenceNumber,
					this._clientId,
					this._refSeq,
					this._localSequenceNumber,
				)
			) {
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
 * @param clientId - The ID of the client to consider.
 * @param refSeq - The reference sequence number,
 * aka the latest sequence number to consider for other clients' changes.
 * @param localSeq - The latest local sequence number to consider.
 * @returns true iff this segment was removed in the given perspective.
 */
export function wasRemovedBefore(
	seg: ISegment,
	seq: number,
	clientId: number,
	refSeq: number,
	localSeq?: number,
): boolean {
	if (
		seg.removedSeq === UnassignedSequenceNumber &&
		localSeq !== undefined &&
		seg.localRemovedSeq !== undefined
	) {
		return seg.localRemovedSeq <= localSeq;
	}
	if (seg.removedClientIds !== undefined && seg.removedClientIds.includes(clientId)) {
		return (
			seg.removedSeq !== undefined &&
			seg.removedSeq !== UnassignedSequenceNumber &&
			seg.removedSeq <= seq
		);
	}
	return (
		seg.removedSeq !== undefined &&
		seg.removedSeq !== UnassignedSequenceNumber &&
		seg.removedSeq <= refSeq
	);
}

/**
 * @param seg - The segment to check.
 * @param seq - The latest sequence number to consider.
 * @param clientId - The ID of the client to consider.
 * @param refSeq - The reference sequence number,
 * aka the latest sequence number to consider for other clients' changes.
 * @param localSeq - The latest local sequence number to consider.
 * @returns true iff this segment was moved (aka obliterated) in the given perspective.
 */
export function wasMovedBefore(
	seg: ISegment,
	seq: number,
	clientId: number,
	refSeq: number,
	localSeq?: number,
): boolean {
	if (
		seg.movedSeq === UnassignedSequenceNumber &&
		localSeq !== undefined &&
		seg.localMovedSeq !== undefined
	) {
		return seg.localMovedSeq <= localSeq;
	}
	if (seg.movedClientIds !== undefined && seg.movedClientIds.includes(clientId)) {
		return (
			seg.movedSeq !== undefined &&
			seg.movedSeq !== UnassignedSequenceNumber &&
			seg.movedSeq <= seq
		);
	}
	return (
		seg.movedSeq !== undefined &&
		seg.movedSeq !== UnassignedSequenceNumber &&
		seg.movedSeq <= refSeq
	);
}

/**
 * See {@link wasRemovedBefore} and {@link wasMovedBefore}.
 */
export function wasRemovedOrMovedBefore(
	seg: ISegment,
	seq: number,
	clientId: number,
	refSeq: number,
	localSeq?: number,
): boolean {
	return (
		wasRemovedBefore(seg, seq, clientId, refSeq, localSeq) ||
		wasMovedBefore(seg, seq, clientId, refSeq, localSeq)
	);
}

/**
 *
 * @param seg - The segment to check.
 * @param seq - The latest sequence number to consider.
 * @param clientId - The ID of the client to consider.
 * @param refSeq - The reference sequence number,
 * aka the latest sequence number to consider for other clients' changes.
 * @param localSeq - The latest local sequence number to consider.
 * @returns true iff this segment was inserted before the given perspective,
 * and it was not removed or moved in the given perspective.
 */
export function isSegmentPresent(
	seg: ISegment,
	seq: number,
	clientId: number,
	refSeq: number,
	localSeq?: number,
) {
	// If seg.seq is undefined, then this segment has existed since minSeq.
	// It may have been moved or removed since.
	if (seg.seq !== undefined) {
		if (seg.seq !== UnassignedSequenceNumber) {
			if (
				// Clients can only see insertions made by other clients before refseq.
				(seg.clientId !== clientId && seg.seq > refSeq) ||
				// Clients can see their own insertions before seq
				(seg.clientId === clientId && seg.seq > seq)
			) {
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
	if (wasRemovedOrMovedBefore(seg, seq, clientId, refSeq, localSeq)) {
		return false;
	}
	return true;
}
