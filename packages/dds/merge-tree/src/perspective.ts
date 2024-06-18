/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { isSegmentPresent, wasRemovedOrMovedBefore, type MergeTree } from "./mergeTree.js";
import { LeafAction, backwardExcursion, forwardExcursion } from "./mergeTreeNodeWalk.js";
import type { ISegment } from "./mergeTreeNodes.js";

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
	slidePlace(
		place: Place,
		sourceSeqNum: number,
		sourceClientId: number,
		sourceLocalSeq?: number,
	): Place;
}

/**
 * Implementation of {@link Perspective}.
 * See {@link Client.createPerspective}.
 *
 * @internal
 */
export class PerspectiveImpl implements Perspective {
	/**
	 * @param _mergeTree -
	 * @param _sequenceNumber -
	 * @param _clientId -
	 * @param _localSequenceNumber -
	 */
	public constructor(
		private readonly _mergeTree: MergeTree,
		private readonly _sequenceNumber: number,
		private readonly _clientId: number,
		private readonly _refSeq: number = _sequenceNumber,
		private readonly _localSequenceNumber?: number,
	) {}

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

	public previousSegment(segment: ISegment): ISegment {
		return this.nextSegment(segment, false);
	}

	public getContainingSegment(pos: number): {
		segment: ISegment | undefined;
		offset: number | undefined;
	} {
		return this._mergeTree.getContainingSegment(
			pos,
			this._refSeq,
			this._clientId,
			this._localSequenceNumber,
		);
	}

	/**
	 * Returns the position of the given place from this perspective.
	 */
	public slidePlace(
		place: Place,
		sourceSeqNum: number,
		sourceClientId: number,
		sourceLocalSeq?: number,
	): Place {
		const { pos, side } = place;
		if (pos === undefined) {
			return place;
		}
		const { segment, offset } = this._mergeTree.getContainingSegment(
			pos,
			sourceSeqNum,
			sourceClientId,
			sourceLocalSeq,
		);

		if (segment === undefined || offset === undefined) {
			// the given place's position was beyond the end of the sequence from the perspective of the source.
			return { pos: undefined, side: Side.Before };
		}

		if (
			!wasRemovedOrMovedBefore(
				segment,
				this._sequenceNumber,
				this._clientId,
				this._refSeq,
				this._localSequenceNumber,
			)
		) {
			// the segment still exists
			return {
				pos:
					// calculate where the segment is in this perspective
					this._mergeTree.getPosition(
						segment,
						this._sequenceNumber,
						this._clientId,
						this._localSequenceNumber,
					) + offset,
				side,
			};
		}
		assert(segment.moveDst === undefined, "Non-obliterate moves are not yet implemented.");
		// the segment was removed before this perspective
		// slide to the nearest segment that was not removed from this perspective
		const slidSegment =
			side === Side.Before ? this.nextSegment(segment) : this.previousSegment(segment);

		if (slidSegment === undefined) {
			// All segments between this place and the extent of the sequence were removed or moved from this perspective.
			return { pos: undefined, side };
		}

		return {
			pos:
				this._mergeTree.getPosition(
					slidSegment,
					this._sequenceNumber,
					this._clientId,
					this._localSequenceNumber,
				) + (side === Side.Before ? 0 : slidSegment.cachedLength),
			side,
		};
	}
}
