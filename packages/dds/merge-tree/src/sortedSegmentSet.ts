/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISegment } from "./mergeTreeNodes";
import { SortedSet } from "./sortedSet";

export type SortedSegmentSetItem = ISegment | { readonly segment: ISegment; };

/**
 * Stores a unique and sorted set of segments, or objects with segments
 *
 * This differs from a normal sorted set in that the keys are not fixed.
 * The segments are sorted via their ordinals which can change as the merge tree is modified.
 * Even though the values of the ordinals can change their ordering and uniqueness cannot, so the order of a set of
 * segments ordered by their ordinals will always have the same order even if the ordinal values on
 * the segments changes. This invariant allows ensure the segments stay ordered and unique, and that new segments
 * can be inserted into that order.
 */
export class SortedSegmentSet<T extends SortedSegmentSetItem = ISegment>
    extends SortedSet<T, string> {
    protected getOrdinal(item: T): string {
        const maybeObject = item as { readonly segment: ISegment; };
        if (maybeObject?.segment) {
            return maybeObject.segment.ordinal;
        }

        const maybeSegment = item as ISegment;
        return maybeSegment.ordinal;
    }
}
