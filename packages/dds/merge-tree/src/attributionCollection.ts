/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { AttributionKey, ISegment } from "./mergeTreeNodes";

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
    private offsets: number[];
    private seqs: number[];

    public constructor(baseEntry: number, private _length: number) {
        this.offsets = [0];
        this.seqs = [baseEntry];
    }

    public getAtOffset(offset: number): AttributionKey {
        assert(offset >= 0 && offset < this._length, 0x443 /* Requested offset should be valid */);
        return { type: "op", seq: this.seqs[this.findIndex(offset)] };
    }

    private findIndex(offset: number): number {
        // Note: maximum length here is 256 for text segments. Perf testing shows that linear scan beats binary search
        // for attribution collections with under ~64 entries, and even at maximum size (which would require a maximum
        // length segment with every offset having different attribution), getAtOffset is on the order of 100ns.
        let i = 0;
        while (i < this.offsets.length && offset > this.offsets[i]) {
            i++;
        }
        return this.offsets[i] === offset ? i : i - 1;
    }

    public get length(): number {
        return this._length;
    }

    /**
     * Splits this attribution collection into two with entries for [0, pos) and [pos, length).
     */
    public splitAt(pos: number): AttributionCollection {
        const splitIndex = this.findIndex(pos);
        const splitBaseEntry = this.seqs[splitIndex];
        const splitCollection = new AttributionCollection(splitBaseEntry, this.length - pos);
        for (let i = splitIndex + 1; i < this.seqs.length; i++) {
            splitCollection.offsets.push(this.offsets[i] - pos);
            splitCollection.seqs.push(this.seqs[i]);
        }

        const spliceIndex = this.offsets[splitIndex] === pos ? splitIndex : splitIndex + 1
        this.seqs.splice(spliceIndex);
        this.offsets.splice(spliceIndex);
        this._length = pos;
        return splitCollection;
    }

    public append(other: AttributionCollection): void {
        const lastEntry = this.seqs[this.seqs.length - 1];
        for (let i = 0; i < other.seqs.length; i++) {
            if (i !== 0 || lastEntry !== other.seqs[i]) {
                this.offsets.push(other.offsets[i] + this.length);
                this.seqs.push(other.seqs[i]);
            }
        }
        this._length += other.length;
    }

    public getAll(): { offset: number; key: AttributionKey; }[] {
        const results: { offset: number; key: AttributionKey }[] = new Array(this.seqs.length);
        for (let i = 0; i < this.seqs.length; i++) {
            results[i] = { offset: this.offsets[i], key: { type: "op", seq: this.seqs[i] }};
        }
        return results;
    }

    public clone(): AttributionCollection {
        const copy = new AttributionCollection(0, this.length);
        copy.seqs = this.seqs.slice();
        copy.offsets = this.offsets.slice();
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
        let currentInfo = seqs[curIndex];
        let cumulativeSegPos = 0;
        
        for (const segment of segments) {
            const attribution = new AttributionCollection(currentInfo, segment.cachedLength);
            while (posBreakpoints[curIndex] < cumulativeSegPos + segment.cachedLength) {
                currentInfo = seqs[curIndex];
                const nextOffset = posBreakpoints[curIndex] - cumulativeSegPos;
                if (attribution.offsets[attribution.offsets.length - 1] !== nextOffset) {
                    attribution.offsets.push(nextOffset);
                    attribution.seqs.push(currentInfo);
                }
                curIndex++;
            }

            if (posBreakpoints[curIndex] === cumulativeSegPos + segment.cachedLength) {
                currentInfo = seqs[curIndex];
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
