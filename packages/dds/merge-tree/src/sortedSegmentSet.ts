/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISegment } from "./mergeTree";

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
export class SortedSegmentSet<T extends ISegment | { readonly segment: ISegment } = ISegment> {
    private readonly ordinalSortedItems: T[] = [];

    public get size(): number {
        return this.ordinalSortedItems.length;
    }

    public get items(): readonly T[] {
        return this.ordinalSortedItems;
    }

    public addOrUpdate(newItem: T, update?: (existingItem: T, newItem: T) => T) {
        const position = this.findOrdinalPosition(this.getOrdinal(newItem));
        if (position.exists) {
            if (update) {
                update(this.ordinalSortedItems[position.index], newItem);
            }
        } else {
            this.ordinalSortedItems.splice(position.index, 0, newItem);
        }
    }

    public remove(item: T): boolean {
        const position = this.findOrdinalPosition(this.getOrdinal(item));
        if (position.exists) {
            this.ordinalSortedItems.splice(position.index, 1);
            return true;
        }
        return false;
    }

    public has(item: T): boolean {
        const position = this.findOrdinalPosition(this.getOrdinal(item));
        return position.exists;
    }

    private getOrdinal(item: T): string {
        const maybeObject = item as { readonly segment: ISegment };
        if (maybeObject && maybeObject.segment) {
            return maybeObject.segment.ordinal;
        }

        const maybeSegment = item as ISegment;
        return maybeSegment.ordinal;
    }

    private findOrdinalPosition(ordinal: string, start?: number, end?: number): { exists: boolean, index: number } {
        if (this.ordinalSortedItems.length === 0) {
            return { exists: false, index: 0 };
        }
        if (start === undefined || end === undefined) {
            return this.findOrdinalPosition(ordinal, 0, this.ordinalSortedItems.length - 1);
        }
        const index = start + Math.floor((end - start) / 2);
        if (this.getOrdinal(this.ordinalSortedItems[index]) > ordinal) {
            if (start === index) {
                return { exists: false, index };
            }
            return this.findOrdinalPosition(ordinal, start, index - 1);
        } else if (this.getOrdinal(this.ordinalSortedItems[index]) < ordinal) {
            if (index === end) {
                return { exists: false, index: index + 1 };
            }
            return this.findOrdinalPosition(ordinal, index + 1, end);
        }
        return { exists: true, index };
    }
}
