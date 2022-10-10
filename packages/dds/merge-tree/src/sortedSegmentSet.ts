/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { LocalReferencePosition } from "./localReference";
import { ISegment } from "./mergeTreeNodes";
import { SortedSet } from "./sortedSet";

export type SortedSegmentSetItem =
    ISegment
    | LocalReferencePosition
    | { readonly segment: ISegment; };
/**
 * Stores a unique and sorted set of segments, or objects with segments
 *
 * This differs from a normal sorted set in that the keys are not fixed.
 * The segments are sorted via their ordinals which can change as the merge tree is modified.
 * Even though the values of the ordinals can change their ordering and uniqueness cannot, so the order of a set of
 * segments ordered by their ordinals will always have the same order even if the ordinal values on
 * the segments changes. This invariant allows us to ensure the segments stay
 * ordered and unique, and that new segments can be inserted into that order.
 */
export class SortedSegmentSet<T extends SortedSegmentSetItem = ISegment>
    extends SortedSet<T, string> {
    protected getKey(item: T): string {
        const maybeRef = item as Partial<LocalReferencePosition>;
        if (maybeRef.getSegment !== undefined && maybeRef.isLeaf?.() === false) {
            const lref = maybeRef as LocalReferencePosition;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const segment = lref.getSegment()!;
            return segment.ordinal;
        }
        const maybeObject = item as { readonly segment: ISegment; };
        if (maybeObject?.segment) {
            return maybeObject.segment.ordinal;
        }

        const maybeSegment = item as ISegment;
        return maybeSegment.ordinal;
    }

    protected findItemPosition(item: T): { exists: boolean; index: number; } {
        if (this.keySortedItems.length === 0) {
            return { exists: false, index: 0 };
        }
        let start = 0;
        let end = this.keySortedItems.length - 1;
        const itemKey = this.getKey(item);
        let index = -1;

        while (start <= end) {
            index = start + Math.floor((end - start) / 2);
            const indexKey = this.getKey(this.keySortedItems[index]);
            if (indexKey > itemKey) {
                if (start === index) {
                    return { exists: false, index };
                }
                end = index - 1;
            } else if (indexKey < itemKey) {
                if (index === end) {
                    return { exists: false, index: index + 1 };
                }
                start = index + 1;
            } else if (indexKey === itemKey) {
                // at this point we've found the key of the item
                // so we need to find the index of the item instance
                //
                if (item === this.keySortedItems[index]) {
                    return { exists: true, index };
                }
                for (let b = index - 1; b >= 0 && this.getKey(this.keySortedItems[b]) === itemKey; b--) {
                    if (this.keySortedItems[b] === item) {
                        return { exists: true, index: b };
                    }
                }
                for (index + 1;
                    index < this.keySortedItems.length
                    && this.getKey(this.keySortedItems[index]) === itemKey;
                    index++
                ) {
                    if (this.keySortedItems[index] === item) {
                        return { exists: true, index };
                    }
                }
                return { exists: false, index };
            }
        }
        return { exists: false, index };
    }
}
