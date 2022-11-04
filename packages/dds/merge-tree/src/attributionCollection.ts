/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { RedBlackTree } from "./collections";
import { compareNumbers, ISegment as ISegmentCurrent } from "./mergeTreeNodes";

// TODO: Once integrated into merge-tree, this interface can be removed
interface ISegment extends ISegmentCurrent {
    attribution?: AttributionCollection<unknown>;
}

export interface SerializedAttributionCollection {
    keys: unknown[];
    posBreakpoints: number[];
    /* Total length; only necessary for validation */
    length: number;
}

export class AttributionCollection<T> {
    private readonly entries: RedBlackTree<number, T> = new RedBlackTree(compareNumbers);

    public constructor(baseEntry: T, private _length: number) {
        this.entries.put(0, baseEntry);
    }

    public getAtOffset(offset: number): T {
        assert(offset >= 0 && offset < this._length, "Requested offset should be valid");
        const node = this.entries.floor(offset);
        assert(node !== undefined, "Collection should have at least one entry");
        return node.data;
    }

    public get length(): number {
        return this._length;
    }

    /**
     * Splits this attribution collection into two with entries for [0, pos) and [pos, length).
     */
    public splitAt(pos: number): AttributionCollection<T> {
        const splitBaseEntry = this.getAtOffset(pos);
        const splitCollection = new AttributionCollection(splitBaseEntry, this.length - pos);
        for (let current = this.entries.ceil(pos); current !== undefined; current = this.entries.ceil(pos)) {
            // If there happened to be an attribution change at exactly pos, it's already set in the base entry
            if (current.key !== pos) {
                splitCollection.entries.put(current.key - pos, current.data);
            }
            this.entries.remove(current.key);
        }
        this._length = pos;
        return splitCollection;
    }

    public append(other: AttributionCollection<T>): void {
        const lastEntry = this.getAtOffset(this.length - 1);
        other.entries.map(({ key, data }) => {
            if (key !== 0 || lastEntry !== data) {
                this.entries.put(key + this.length, data);
            }
            return true;
        });
        this._length += other.length;
    }

    public getAll(): { offset: number; key: T; }[] {
        const results: { offset: number; key: T; }[] = [];
        this.entries.map(({ key, data }) => {
            results.push({ offset: key, key: data });
            return true;
        });
        return results;
    }

    public clone(): AttributionCollection<T> {
        const copy = new AttributionCollection(this.getAtOffset(0), this.length);
        this.entries.map(({ key, data }) => {
            copy.entries.put(key, data);
            return true;
        });
        return copy;
    }

    /**
     * Rehydrates attribution information from its serialized form into the provided iterable of consecutive segments.
     */
    public static populateAttributionCollections(
        segments: Iterable<ISegment>,
        summary: SerializedAttributionCollection,
    ): void {
        const { keys, posBreakpoints } = summary;
        assert(keys.length === posBreakpoints.length && keys.length > 0, "Invalid attribution summary blob provided");
        let curIndex = 0;
        let cumulativeSegPos = 0;
        let currentInfo = keys[curIndex];

        for (const segment of segments) {
            const attribution = new AttributionCollection(currentInfo, segment.cachedLength);
            while (posBreakpoints[curIndex] < cumulativeSegPos + segment.cachedLength) {
                currentInfo = keys[curIndex];
                attribution.entries.put(posBreakpoints[curIndex] - cumulativeSegPos, currentInfo);
                curIndex++;
            }

            segment.attribution = attribution;
            cumulativeSegPos += segment.cachedLength;
        }
    }

    /**
     * Condenses attribution information on consecutive segments into a `SerializedAttributionCollection`
     */
    public static serializeAttributionCollections(
        segments: Iterable<ISegment>,
    ): SerializedAttributionCollection {
        const posBreakpoints: number[] = [];
        const keys: unknown[] = [];
        let mostRecentAttributionKey: unknown | undefined;
        let cumulativePos = 0;

        let segmentsWithAttribution = 0;
        let segmentsWithoutAttribution = 0;
        for (const segment of segments) {
            if (segment.attribution) {
                segmentsWithAttribution++;
                for (const { offset, key: info } of segment.attribution.getAll() ?? []) {
                    if (info !== mostRecentAttributionKey) {
                        posBreakpoints.push(offset + cumulativePos);
                        keys.push(info);
                    }
                    mostRecentAttributionKey = info;
                }
            } else {
                segmentsWithoutAttribution++;
            }

            cumulativePos += segment.cachedLength;
        }

        assert(segmentsWithAttribution === 0 || segmentsWithoutAttribution === 0,
            "Expected either all segments or no segments to have attribution information.");

        const blobContents: SerializedAttributionCollection = { keys, posBreakpoints, length: cumulativePos };
        return blobContents;
    }
}
