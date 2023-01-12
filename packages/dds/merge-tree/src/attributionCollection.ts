/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { RedBlackTree } from "./collections";
import { AttributionKey, compareNumbers, ISegment } from "./mergeTreeNodes";

export interface SerializedAttributionCollection {
    /**
     * Parallel array with posBreakpoints which tracks the seq of insertion.
     * Ex: if seqs is [45, 46] and posBreakpoints is [0, 3], the section of the string
     * between offsets 0 and 3 was inserted at seq 45 and the section of the string between
     * 3 and the length of the string was inserted at seq 46.
     */
    seqs: number[];
    posBreakpoints: number[];
    /* Total length; only necessary for validation */
    length: number;
}

/**
 * @alpha
 */
export interface IAttributionCollection<T> {
    /**
     * Retrieves the attribution key associated with the provided offset.
     */
    getAtOffset(offset: number): T;

    /**
     * Total length of all attribution keys in this collection.
     */
    readonly length: number;

    /**
     * Retrieve all key/offset pairs stored on this segment. Entries should be ordered by offset, such that
     * the `i`th result's attribution key applies to offsets in the open range between the `i`th offset and the
     * `i+1`th offset.
     * The last entry's key applies to the open interval from the last entry's offset to this collection's length.
     * @internal
     */
    getAll(): Iterable<{ offset: number; key: T; }>;

    /** @internal */
    splitAt(pos: number): IAttributionCollection<T>;

    /** @internal */
    append(other: IAttributionCollection<T>): void;

    /** @internal */
    clone(): IAttributionCollection<T>;
}

export class AttributionCollection implements IAttributionCollection<AttributionKey> {
    private readonly entries: RedBlackTree<number, number> = new RedBlackTree(compareNumbers);

    public constructor(baseEntry: number, private _length: number) {
        this.entries.put(0, baseEntry);
    }

    public getAtOffset(offset: number): AttributionKey {
        assert(offset >= 0 && offset < this._length, 0x443 /* Requested offset should be valid */);
        const node = this.entries.floor(offset);
        assert(node !== undefined, 0x444 /* Collection should have at least one entry */);
        return { type: "op", seq: node.data };
    }

    public get length(): number {
        return this._length;
    }

    /**
     * Splits this attribution collection into two with entries for [0, pos) and [pos, length).
     */
    public splitAt(pos: number): AttributionCollection {
        const splitBaseEntry = this.getAtOffset(pos);
        const splitCollection = new AttributionCollection(splitBaseEntry.seq, this.length - pos);
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

    public append(other: AttributionCollection): void {
        const lastEntry = this.getAtOffset(this.length - 1).seq;
        other.entries.map(({ key, data }) => {
            if (key !== 0 || lastEntry !== data) {
                this.entries.put(key + this.length, data);
            }
            return true;
        });
        this._length += other.length;
    }

    public getAll(): { offset: number; key: AttributionKey; }[] {
        const results: { offset: number; key: AttributionKey; }[] = [];
        this.entries.map(({ key, data }) => {
            results.push({ offset: key, key: { type: "op", seq: data } });
            return true;
        });
        return results;
    }

    public clone(): AttributionCollection {
        const copy = new AttributionCollection(this.getAtOffset(0).seq, this.length);
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
        const { seqs, posBreakpoints } = summary;
        assert(
            seqs.length === posBreakpoints.length && seqs.length > 0,
            0x445 /* Invalid attribution summary blob provided */);
        let curIndex = 0;
        let cumulativeSegPos = 0;
        let currentInfo = seqs[curIndex];

        for (const segment of segments) {
            const attribution = new AttributionCollection(currentInfo, segment.cachedLength);
            while (posBreakpoints[curIndex] < cumulativeSegPos + segment.cachedLength) {
                currentInfo = seqs[curIndex];
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
        segments: Iterable<{ attribution?: IAttributionCollection<AttributionKey>; cachedLength: number; }>,
    ): SerializedAttributionCollection {
        const posBreakpoints: number[] = [];
        const seqs: number[] = [];
        let mostRecentAttributionKey: number | undefined;
        let cumulativePos = 0;

        let segmentsWithAttribution = 0;
        let segmentsWithoutAttribution = 0;
        for (const segment of segments) {
            if (segment.attribution) {
                segmentsWithAttribution++;
                for (const { offset, key: info } of segment.attribution?.getAll() ?? []) {
                    if (info.seq !== mostRecentAttributionKey) {
                        posBreakpoints.push(offset + cumulativePos);
                        seqs.push(info.seq);
                    }
                    mostRecentAttributionKey = info.seq;
                }
            } else {
                segmentsWithoutAttribution++;
            }

            cumulativePos += segment.cachedLength;
        }

        assert(segmentsWithAttribution === 0 || segmentsWithoutAttribution === 0,
            0x446 /* Expected either all segments or no segments to have attribution information. */);

        const blobContents: SerializedAttributionCollection = { seqs, posBreakpoints, length: cumulativePos };
        return blobContents;
    }
}
