/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISegment } from "./mergeTreeNodes";
import { combineOverlapClients, PartialSequenceLength } from "./partialLengths";

export abstract class SortedSet<T, U extends string | number> {
    protected abstract getOrdinal(t: T): U;

    protected readonly ordinalSortedItems: T[] = [];

    public get size(): number {
        return this.ordinalSortedItems.length;
    }

    public get items(): readonly T[] {
        return this.ordinalSortedItems;
    }

    public addOrUpdate(newItem: T, update?: (existingItem: T, newItem: T) => void) {
        const position = this.findItemPosition(newItem);
        if (position.exists) {
            if (update) {
                update(this.ordinalSortedItems[position.index], newItem);
            }
        } else {
            this.ordinalSortedItems.splice(position.index, 0, newItem);
        }
    }

    public remove(item: T): boolean {
        const position = this.findItemPosition(item);
        if (position.exists) {
            this.ordinalSortedItems.splice(position.index, 1);
            return true;
        }
        return false;
    }

    public has(item: T): boolean {
        const position = this.findItemPosition(item);
        return position.exists;
    }

    private findItemPosition(item: T): { exists: boolean; index: number; } {
        if (this.ordinalSortedItems.length === 0) {
            return { exists: false, index: 0 };
        }
        let start = 0;
        let end = this.ordinalSortedItems.length - 1;
        const itemOrdinal = this.getOrdinal(item);
        let index = -1;

        while (start <= end) {
            index = start + Math.floor((end - start) / 2);
            const indexOrdinal = this.getOrdinal(this.ordinalSortedItems[index]);
            if (indexOrdinal > itemOrdinal) {
                if (start === index) {
                    return { exists: false, index };
                }
                end = index - 1;
            } else if (indexOrdinal < itemOrdinal) {
                if (index === end) {
                    return { exists: false, index: index + 1 };
                }
                start = index + 1;
            } else if (indexOrdinal === itemOrdinal) {
                // at this point we've found the ordinal of the item
                // so we need to find the index of the item instance
                //
                if (item === this.ordinalSortedItems[index]) {
                    return { exists: true, index };
                }
                for (let b = index - 1; b >= 0 && this.getOrdinal(this.ordinalSortedItems[b]) === itemOrdinal; b--) {
                    if (this.ordinalSortedItems[b] === item) {
                        return { exists: true, index: b };
                    }
                }
                for (index + 1;
                    index < this.ordinalSortedItems.length
                        && this.getOrdinal(this.ordinalSortedItems[index]) === itemOrdinal;
                    index++
                ) {
                    if (this.ordinalSortedItems[index] === item) {
                        return { exists: true, index };
                    }
                }
                return { exists: false, index };
            }
        }
        return { exists: false, index };
    }
}

export class PartialSequenceLengthsSet extends SortedSet<PartialSequenceLength, number> {
    protected getOrdinal(item: PartialSequenceLength): number {
        return item.seq;
    }

    public addOrUpdate(
        newItem: PartialSequenceLength,
        update?: (existingItem: PartialSequenceLength, newItem: PartialSequenceLength) => void,
    ) {
        const prev = this.latestLEQ(newItem.seq);

        if (prev?.seq !== newItem.seq) {
            // new element, update len
            newItem.len = (prev?.len ?? 0) + newItem.seglen;
        }

        // update the len of all following elements
        for (const e of this.ordinalSortedItems) {
            if (e.seq <= newItem.seq) {
                continue;
            }

            e.len += newItem.seglen;
        }

        super.addOrUpdate(newItem, (currentPartial, partialLength) => {
            currentPartial.seglen += partialLength.seglen;
            currentPartial.len += partialLength.seglen;
            combineOverlapClients(currentPartial, partialLength);
        });
    }

    /**
     * Returns the partial length whose sequence number is the greatest sequence
     * number that is less than or equal to key.
     * @param key - sequence number
     */
    latestLEQ(key: number): PartialSequenceLength | undefined {
        return this.items[this.latestLeqIndex(key)];
    }

    /**
     * Returns the partial length whose sequence number is the lowest sequence
     * number that is greater than or equal to key.
     * @param key - sequence number
     */
    firstGte(key: number): PartialSequenceLength | undefined {
        let indexFirstGTE = 0;
        for (; indexFirstGTE < this.size; indexFirstGTE++) {
            if (this.ordinalSortedItems[indexFirstGTE].seq >= key) {
                break;
            }
        }
        return this.ordinalSortedItems[indexFirstGTE];
    }

    private latestLeqIndex(key: number): number {
        let best = -1;
        let lo = 0;
        let hi = this.size - 1;
        while (lo <= hi) {
            const mid = lo + Math.floor((hi - lo) / 2);
            if (this.items[mid].seq <= key) {
                if ((best < 0) || (this.items[best].seq < this.items[mid].seq)) {
                    best = mid;
                }
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return best;
    }

    copyDown(minSeq: number): number {
        const mindex = this.latestLeqIndex(minSeq);
        let minLength = 0;
        if (mindex >= 0) {
            minLength = this.ordinalSortedItems[mindex].len;
            const seqCount = this.size;
            if (mindex <= (seqCount - 1)) {
                // Still some entries remaining
                const remainingCount = (seqCount - mindex) - 1;
                // Copy down
                for (let i = 0; i < remainingCount; i++) {
                    this.ordinalSortedItems[i] = this.ordinalSortedItems[i + mindex + 1];
                    this.ordinalSortedItems[i].len -= minLength;
                }
                this.ordinalSortedItems.length = remainingCount;
            }
        }
        return minLength;
    }
}

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
