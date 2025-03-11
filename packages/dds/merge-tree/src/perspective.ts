/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type MergeTree } from "./mergeTree.js";
import { LeafAction, backwardExcursion, forwardExcursion } from "./mergeTreeNodeWalk.js";
import {
	seqLTE,
	timestampUtils,
	type ISegmentLeaf,
	type OperationTimestamp,
	type RemoveOperationTimestamp,
} from "./mergeTreeNodes.js";
import { isInserted, isRemoved } from "./segmentInfos.js";

export interface Perspective {
	readonly refSeq: number;
	readonly clientId: number;
	readonly localSeq?: number;
	isSegmentPresent(segment: ISegmentLeaf): boolean;

	hasOccurred(stamp: OperationTimestamp): boolean;

	nextSegment(mergeTree: MergeTree, segment: ISegmentLeaf, forward?: boolean): ISegmentLeaf;
	previousSegment(mergeTree: MergeTree, segment: ISegmentLeaf): ISegmentLeaf;
}

abstract class PerspectiveBase {
	abstract hasOccurred(stamp: OperationTimestamp): boolean;

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

	public isSegmentPresent(seg: ISegmentLeaf): boolean {
		if (isInserted(seg) && !this.hasOccurred(seg.insert)) {
			return false;
		}

		// TODO: Previous factoring was able to fast-path refSeq and localSeq based remove (which look at first and last timestamp before others)
		if (isRemoved(seg) && seg.removes.some((remove) => this.hasOccurred(remove))) {
			return false;
		}

		return true;
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

	public hasOccurred(stamp: OperationTimestamp): boolean {
		const predatesViaRefSeq = seqLTE(stamp.seq, this.refSeq);
		const predatesViaSameClient = stamp.clientId === this.clientId;
		return predatesViaRefSeq || predatesViaSameClient;
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

	// public isSegmentPresent(seg: ISegmentLeaf): boolean {
	// 	if (isInserted(seg)) {
	// 		const visibleViaRefSeq = seqLTE(seg.insert.seq, this.refSeq);
	// 		const visibleViaLocalSeq =
	// 			seg.insert.localSeq !== undefined && seg.insert.localSeq <= this.localSeq;
	// 		if (!visibleViaRefSeq && !visibleViaLocalSeq) {
	// 			return false;
	// 		}
	// 	}

	// 	if (isRemoved(seg)) {
	// 		const removalViaRefSeq = seqLTE(seg.removes[0].seq, this.refSeq);
	// 		if (removalViaRefSeq) {
	// 			return false;
	// 		}

	// 		const lastRemove = seg.removes[seg.removes.length - 1];
	// 		const removalViaLocalSeq =
	// 			lastRemove.localSeq !== undefined && lastRemove.localSeq <= this.localSeq;
	// 		if (removalViaLocalSeq) {
	// 			return false;
	// 		}
	// 	}

	// 	return true;
	// }

	public hasOccurred(stamp: OperationTimestamp): boolean {
		const predatesViaRefSeq = seqLTE(stamp.seq, this.refSeq);
		const predatesViaLocalSeq =
			stamp.localSeq !== undefined && stamp.localSeq <= this.localSeq;
		return predatesViaRefSeq || predatesViaLocalSeq;
	}
}

/**
 * A perspective which includes all known edits.
 *
 * This is the perspective that the application sees.
 * @remarks
 * This should be representable using {@link PriorPerspective} with a refSeq of `Number.MAX_SAFE_INTEGER`, but having an explicit
 * variant of this perspective renders extra refSeq checks unnecessary and is a bit easier to read.
 */
export class LocalDefaultPerspective extends PerspectiveBase implements Perspective {
	public readonly refSeq = Number.MAX_SAFE_INTEGER;

	public constructor(public readonly clientId: number) {
		super();
	}

	public hasOccurred(_stamp: OperationTimestamp): boolean {
		return true;
	}
}

/**
 * A perspective dictating whether segments are 'visible' to a remote obliterate operation.
 *
 * NOTE: Beware that partial lengths doesn't support this perspective, in the sense that consulting partial lengths' for the length of a block
 * can give different results than summing the lengths of present segments in that block.
 * This ends up not affecting the current obliterate implementation (which has some special casing in the mapRange calls it uses),
 * but use with caution.
 */
export class RemoteObliteratePerspective extends PerspectiveBase implements Perspective {
	public readonly refSeq = Number.MAX_SAFE_INTEGER;

	constructor(public readonly clientId: number) {
		super();
	}

	public hasOccurred(stamp: OperationTimestamp): boolean {
		// Local-only removals are not visible to an obliterate operation, since this means the local removal was concurrent
		// to a remote obliterate and we may need to mark the segment appropriately to reflect this overlapping remove.
		// Every other type of operation is visible: obliterates do not affect segments that have already been removed and acked,
		// and they always affect segments within their range that have not been removed, even if those segments were inserted
		// after the obliterate's refSeq.
		if (isRemoveOperationTimestamp(stamp) && timestampUtils.isLocal(stamp)) {
			return false;
		}

		return true;
	}
}

function isRemoveOperationTimestamp(
	stamp: OperationTimestamp,
): stamp is RemoveOperationTimestamp {
	return (stamp as any).type === "slice" || (stamp as any).type === "set";
}
