/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type MergeTree } from "./mergeTree.js";
import { LeafAction, backwardExcursion, forwardExcursion } from "./mergeTreeNodeWalk.js";
import { seqLTE, type ISegmentLeaf } from "./mergeTreeNodes.js";
import { isInserted, isRemoved } from "./segmentInfos.js";

export interface Perspective {
	readonly refSeq: number;
	readonly clientId: number;
	readonly localSeq?: number;
	isSegmentPresent(segment: ISegmentLeaf): boolean;

	nextSegment(mergeTree: MergeTree, segment: ISegmentLeaf, forward?: boolean): ISegmentLeaf;
	previousSegment(mergeTree: MergeTree, segment: ISegmentLeaf): ISegmentLeaf;
	// May want this instead of letting merge-tree calculate it? Or maybe not. This is nice and self contained.
	// lengthOf(segment: ISegmentLeaf): number | undefined;
}

abstract class PerspectiveBase {
	abstract isSegmentPresent(seg: ISegmentLeaf): boolean;
	/**
	 * Returns the immediately adjacent segment in the specified direction from this perspective.
	 * There may actually be multiple segments between the given segment and the returned segment,
	 * but they were either inserted after this perspective, or have been removed or moved before this perspective.
	 *
	 * @param segment - The segment to start from.
	 * @param forward - The direction to search.
	 * @returns the next segment in the specified direction, or the start or end of the tree if there is no next segment.
	 */
	public nextSegment(
		mergeTree: MergeTree,
		segment: ISegmentLeaf,
		forward: boolean = true,
	): ISegmentLeaf {
		let next: ISegmentLeaf | undefined;
		const action = (seg: ISegmentLeaf): boolean | undefined => {
			if (this.isSegmentPresent(seg)) {
				next = seg;
				return LeafAction.Exit;
			}
		};
		(forward ? forwardExcursion : backwardExcursion)(segment, action);
		return next ?? (forward ? mergeTree.endOfTree : mergeTree.startOfTree);
	}

	/**
	 * Finds the segment prior to the given segment.
	 * @param segment - The segment to start from.
	 * @returns the previous segment, or the start of the tree if there is no previous segment.
	 * @remarks This is a convenient equivalent to calling `nextSegment(segment, false)`.
	 */
	public previousSegment(mergeTree: MergeTree, segment: ISegmentLeaf): ISegmentLeaf {
		return this.nextSegment(mergeTree, segment, false);
	}
}

/**
 * A perspective which includes edits at or before some reference sequence number alongside all edits from some particular client.
 *
 * @remarks
 * This works for both the local client as well as remote clients since refSeq-based checks disallow unacked edits, but the clientId check
 * catches unacked edits from the local client.
 */
export class PriorPerspective extends PerspectiveBase implements Perspective {
	public constructor(
		public readonly refSeq: number,
		public readonly clientId: number,
	) {
		super();
	}

	public isSegmentPresent(seg: ISegmentLeaf): boolean {
		// If seg.seq is undefined, then this segment has existed since minSeq.
		// It may have been moved or removed since.
		if (isInserted(seg)) {
			const visibleViaRefSeq = seqLTE(seg.insert.seq, this.refSeq);
			const visibleViaSameClient = seg.insert.clientId === this.clientId;
			if (!visibleViaRefSeq && !visibleViaSameClient) {
				return false;
			}
		}

		if (isRemoved(seg)) {
			const removalViaRefSeq = seqLTE(seg.removes[0].seq, this.refSeq);
			if (removalViaRefSeq) {
				return false;
			}
			const removalViaSameClient = seg.removes.some(
				({ clientId }) => clientId === this.clientId,
			);
			return !removalViaSameClient;
		}

		return true;
	}
}

/**
 * A perspective which includes edits which were either:
 * - acked and at or before some reference sequence number
 * - unacked, but at or before some local sequence number
 *
 * This is a useful perspective when the local client is in the process of reconnecting, since it must
 * rederive positions for unacked ops while only considering a portion of its own edits as having been applied.
 */
export class LocalReconnectingPerspective extends PerspectiveBase implements Perspective {
	public constructor(
		public readonly refSeq: number,
		public readonly clientId: number,
		public readonly localSeq: number,
	) {
		super();
	}

	public isSegmentPresent(seg: ISegmentLeaf): boolean {
		if (isInserted(seg)) {
			const visibleViaRefSeq = seqLTE(seg.insert.seq, this.refSeq);
			const visibleViaLocalSeq =
				seg.insert.localSeq !== undefined && seg.insert.localSeq <= this.localSeq;
			if (!visibleViaRefSeq && !visibleViaLocalSeq) {
				return false;
			}
		}

		if (isRemoved(seg)) {
			const removalViaRefSeq = seqLTE(seg.removes[0].seq, this.refSeq);
			if (removalViaRefSeq) {
				return false;
			}

			const lastRemove = seg.removes[seg.removes.length - 1];
			const removalViaLocalSeq =
				lastRemove.localSeq !== undefined && lastRemove.localSeq <= this.localSeq;
			if (removalViaLocalSeq) {
				return false;
			}
		}

		return true;
	}
}
