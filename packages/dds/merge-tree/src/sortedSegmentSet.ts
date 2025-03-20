/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { LocalReferencePosition } from "./localReference.js";
import { ISegmentInternal } from "./mergeTreeNodes.js";
import { hasProp, toMergeNodeInfo } from "./segmentInfos.js";
import { SortedSet } from "./sortedSet.js";

/**
 * @internal
 */
export type SortedSegmentSetItem =
	| ISegmentInternal
	| LocalReferencePosition
	| { readonly segment: ISegmentInternal };

/**
 * Stores a unique and sorted set of segments, or objects with segments
 *
 * This differs from a normal sorted set in that the keys are not fixed.
 * The segments are sorted via their ordinals which can change as the merge tree is modified.
 * Even though the values of the ordinals can change their ordering and uniqueness cannot, so the order of a set of
 * segments ordered by their ordinals will always have the same order even if the ordinal values on
 * the segments changes. This invariant allows us to ensure the segments stay
 * ordered and unique, and that new segments can be inserted into that order.
 *
 * @internal
 */
export class SortedSegmentSet<
	T extends SortedSegmentSetItem = ISegmentInternal,
> extends SortedSet<T> {
	private getOrdinal(item: T): string {
		const maybeRef = item as Partial<LocalReferencePosition>;
		if (maybeRef.getSegment !== undefined && maybeRef.isLeaf?.() === false) {
			const lref = maybeRef as LocalReferencePosition;
			// If the reference position has no associated segment, assign it a sentinel value.
			// The particular value for comparison doesn't matter because `findItemPosition` tolerates
			// elements with duplicate keys (as it must, since local references use the same key as their segment).
			// All that matters is that it's consistent.
			return toMergeNodeInfo(lref.getSegment())?.ordinal ?? "";
		}
		if (hasProp(item, "segment", "object")) {
			return toMergeNodeInfo(item.segment)?.ordinal ?? "";
		}

		return toMergeNodeInfo(item)?.ordinal ?? "";
	}

	private getOffset(item: T): number {
		const maybeRef = item as Partial<LocalReferencePosition>;
		if (maybeRef.getSegment !== undefined && maybeRef.isLeaf?.() === false) {
			const lref = maybeRef as LocalReferencePosition;
			return lref.getOffset();
		}
		return 0;
	}

	protected compare(a: T, b: T): number {
		const aOrdinal = this.getOrdinal(a);
		const bOrdinal = this.getOrdinal(b);

		if (aOrdinal < bOrdinal) {
			return -1;
		}
		if (aOrdinal > bOrdinal) {
			return 1;
		}
		return this.getOffset(a) - this.getOffset(b);
	}

	protected onFindEquivalent(item: T, startIndex: number): { exists: boolean; index: number } {
		// SortedSegmentSet may contain multiple items with the same key (e.g. a local ref at offset 0 and the segment it is on).
		// Items should compare as reference-equal, so we do a linear walk to find the actual item in this case.
		let index = startIndex;
		if (item === this.sortedItems[index]) {
			return { exists: true, index };
		}
		for (let b = index - 1; b >= 0 && this.compare(item, this.sortedItems[b]) === 0; b--) {
			if (this.sortedItems[b] === item) {
				return { exists: true, index: b };
			}
		}
		for (
			index + 1;
			index < this.sortedItems.length && this.compare(item, this.sortedItems[index]) === 0;
			index++
		) {
			if (this.sortedItems[index] === item) {
				return { exists: true, index };
			}
		}
		return { exists: false, index };
	}
}
