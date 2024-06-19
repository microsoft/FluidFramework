/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type MergeTree } from "./mergeTree.js";
import { LeafAction, backwardExcursion, forwardExcursion } from "./mergeTreeNodeWalk.js";
import { isSegmentPresent, type ISegment } from "./mergeTreeNodes.js";

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
