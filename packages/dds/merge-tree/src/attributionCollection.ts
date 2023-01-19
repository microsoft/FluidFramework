/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { AttributionChangeEntry, AttributionChannelChange } from "./mergeTree";
import { AttributionKey, ISegment } from "./mergeTreeNodes";
import { PropertiesManager } from "./segmentPropertiesManager";

/**
 * @internal
 */
export interface SequenceOffsets {
    /**
     * Parallel array with posBreakpoints which tracks the seq of insertion.
     * Ex: if seqs is [45, 46] and posBreakpoints is [0, 3], the section of the string
     * between offsets 0 and 3 was inserted at seq 45 and the section of the string between
     * 3 and the length of the string was inserted at seq 46.
     * 
     * @remarks - We use null here rather than undefined as round-tripping through JSON converts
     * undefineds to null anyway
     */
    seqs: (number | null)[];
    posBreakpoints: number[]
};

/**
 * @internal
 */
export interface SerializedAttributionCollection extends SequenceOffsets {
    channels?: { [name: string]: SequenceOffsets };
    /* Total length; only necessary for validation */
    length: number;
}

export interface IAttributionCollectionSpec<T> {
    root: Iterable<{ offset: number; key: T | undefined }>; 
    channels?: { [name: string]: Iterable<{ offset: number; key: T | undefined }> }
}

/**
 * @alpha
 */
export interface IAttributionCollection<T> {
    /**
     * Retrieves the attribution key associated with the provided offset.
     */
    getAtOffset(offset: number, channel?: string): AttributionKey | undefined;

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
    getAll(): IAttributionCollectionSpec<T>;

    /** @internal */
    splitAt(pos: number): IAttributionCollection<T>;

    /** @internal */
    append(other: IAttributionCollection<T>): void;

    /** @internal */
    clone(): IAttributionCollection<T>;

    /** @internal */
    ackDeltas(deltas: AttributionChangeEntry[], propertyManager: PropertiesManager | undefined): void;
}


export class AttributionCollection implements IAttributionCollection<AttributionKey> {
    private offsets: number[] = [];
    private seqs: (number | null)[] = [];

    private channels?: { [name: string]: AttributionCollection };

    private get channelEntries(): [string, AttributionCollection][] {
        return Object.entries(this.channels ?? {});
    }

    public constructor(private _length: number, baseEntry?: number) {
        if (baseEntry !== undefined) {
            this.offsets.push(0);
            this.seqs.push(baseEntry);
        }
    }

    public getAtOffset(offset: number): AttributionKey;
    public getAtOffset(offset: number, channel: string): AttributionKey | undefined;
    public getAtOffset(offset: number, channel?: string): AttributionKey | undefined {
        if (channel !== undefined) {
            const subCollection = this.channels?.[channel];
            return subCollection?.getAtOffset(offset);
        }
        assert(offset >= 0 && offset < this._length, 0x443 /* Requested offset should be valid */);
        return this.get(this.findIndex(offset));
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

    private get(index: number): AttributionKey | undefined {
        const seq = this.seqs[index];
        return seq !== null ? { type: "op", seq } : undefined;
    }

    public get length(): number {
        return this._length;
    }

    /**
     * Splits this attribution collection into two with entries for [0, pos) and [pos, length).
     */
    public splitAt(pos: number): AttributionCollection {
        const splitIndex = this.findIndex(pos);
        const splitCollection = new AttributionCollection(this.length - pos);
        for (let i = splitIndex; i < this.seqs.length; i++) {
            splitCollection.offsets.push(Math.max(this.offsets[i] - pos, 0));
            splitCollection.seqs.push(this.seqs[i]);
        }

        if (this.channels) {
            splitCollection.channels = {};
            for (const [key, collection] of this.channelEntries) {
                splitCollection[key] = collection.splitAt(pos);
            }
        }

        const spliceIndex = this.offsets[splitIndex] === pos ? splitIndex : splitIndex + 1
        this.seqs.splice(spliceIndex);
        this.offsets.splice(spliceIndex);
        this._length = pos;
        return splitCollection;
    }

    // TODO: clean up private static
    private static makeEmptyCollection(length: number): AttributionCollection {
        const collection = new AttributionCollection(length);
        collection.seqs.push(null);
        collection.offsets.push(0);
        return collection;
    }

    public append(other: AttributionCollection): void {
        const lastEntry = this.seqs[this.seqs.length - 1];
        for (let i = 0; i < other.seqs.length; i++) {
            if (i !== 0 || lastEntry !== other.seqs[i]) {
                this.offsets.push(other.offsets[i] + this.length);
                this.seqs.push(other.seqs[i]);
            }
        }

        // TODO: Write unit tests in attribution collection for changed behavior.
        // other thing to consider: need to handle gaps holistically in all this logic.
        if (other.channels !== undefined || this.channels !== undefined) {
            this.channels ??= {};
            for (const [key, collection] of other.channelEntries) {
                const thisCollection = this.channels[key] ??= AttributionCollection.makeEmptyCollection(this.length);
                thisCollection.append(collection);
            }
            for (const [key, collection] of this.channelEntries) {
                if (other.channels?.[key] === undefined) {
                    collection.append(AttributionCollection.makeEmptyCollection(other.length));                    
                }
            }
        }
        this._length += other.length;
    }

    public getAll(): IAttributionCollectionSpec<AttributionKey> {
        const root: { offset: number; key: AttributionKey | undefined }[] = new Array(this.seqs.length);
        for (let i = 0; i < this.seqs.length; i++) {
            root[i] = { offset: this.offsets[i], key: this.get(i) };
        }
        const result: IAttributionCollectionSpec<AttributionKey> = { root };
        if (this.channels !== undefined) {
            result.channels = {}
            for (const [key, collection] of this.channelEntries) {
                result.channels[key] = collection.getAll().root;
            }
        }
        return result;
    }

    public clone(): AttributionCollection {
        const copy = new AttributionCollection(this.length);
        copy.seqs = this.seqs.slice();
        copy.offsets = this.offsets.slice();
        if (this.channels !== undefined) {
            const channelsCopy = {};
            for (const [key, collection] of this.channelEntries) {
                channelsCopy[key] = collection;
            }
            copy.channels = channelsCopy;
        }
        return copy;
    }

    public ackDeltas(deltas: AttributionChangeEntry[], propertyManager: PropertiesManager | undefined): void {
        const addKeysToCollection = (collection: AttributionCollection, changes: AttributionChannelChange[]): void => {
            collection.offsets = [0];
            collection.seqs = [];
            for (const change of changes) {
                assert(change.key.type === "op", "non-op based attribution keys unsupported.");
                collection.seqs.push(change.key.seq);
                if (change.start !== undefined && change.start > 0) {
                    collection.offsets.push(change.start)
                }
            }
        }
        for (const delta of deltas) {
            switch (delta.type) {
                case "insert": {
                    // TODO: With current representation, consider sorting here.
                    // Note: lots of implicit assumptions here 
                    addKeysToCollection(this, delta.changes);
                    break;
                }
                case "prop": {
                    if (!propertyManager?.hasPendingProperty(delta.dependentPropName)) {
                        this.channels ??= {};
                        const collection = new AttributionCollection(this.length);
                        addKeysToCollection(collection, delta.changes);
                        this.channels[delta.channel] = collection;
                    }
                    break;
                }
            }
        }
    }

    /**
     * Rehydrates attribution information from its serialized form into the provided iterable of consecutive segments.
     */
    public static populateAttributionCollections(
        segments: ISegment[],
        summary: SerializedAttributionCollection,
    ): void {
        const { seqs, posBreakpoints, channels } = summary;
        assert(
            seqs.length === posBreakpoints.length,
            0x445 /* Invalid attribution summary blob provided */);

        const extractOntoSegments = ({ seqs, posBreakpoints }: SequenceOffsets, assignToSegment: (collection: AttributionCollection, segment: ISegment) => void) => {
            let curIndex = 0;
            let cumulativeSegPos = 0;
            
            for (const segment of segments) {
                const attribution = new AttributionCollection(segment.cachedLength);
                const pushEntry = (offset: number, seq: number | null) => {
                    attribution.offsets.push(offset);
                    attribution.seqs.push(seq);
                }
                if (posBreakpoints[curIndex] > cumulativeSegPos) {
                    curIndex--;
                }
    
                while (posBreakpoints[curIndex] < cumulativeSegPos + segment.cachedLength) {
                    const nextOffset = Math.max(posBreakpoints[curIndex] - cumulativeSegPos, 0);
                    pushEntry(nextOffset, seqs[curIndex]);
                    curIndex++;
                }
    
                if (attribution.offsets.length === 0) {
                    pushEntry(0, seqs[curIndex - 1]);
                }

                assignToSegment(attribution, segment);
                cumulativeSegPos += segment.cachedLength;
            }
        }

        extractOntoSegments(summary, (collection, segment) => { segment.attribution = collection; });
        if (channels) {
            for (const [name, collectionSpec] of Object.entries(channels)) {
                extractOntoSegments(
                    collectionSpec,
                    (collection, segment) => {
                        // Cast is valid as we just assigned this field above
                        ((segment.attribution as AttributionCollection).channels ??= {})[name] = collection;
                    }
                )
            }
        }
    }

    /**
     * Condenses attribution information on consecutive segments into a `SerializedAttributionCollection`
     */
    public static serializeAttributionCollections(
        segments: Iterable<{ attribution?: IAttributionCollection<AttributionKey>; cachedLength: number; }>,
    ): SerializedAttributionCollection {
        const allCollectionSpecs: { spec: IAttributionCollectionSpec<AttributionKey>; length: number }[] = [];

        let segmentsWithAttribution = 0;
        let segmentsWithoutAttribution = 0;
        const allChannelNames = new Set<string>();
        for (const segment of segments) {
            if (segment.attribution) {
                segmentsWithAttribution++;
                const spec = segment.attribution.getAll();
                allCollectionSpecs.push({ spec, length: segment.cachedLength });
                if (spec.channels) {
                    for (const name of Object.keys(spec.channels)) {
                        allChannelNames.add(name);
                    }
                }
            } else {
                segmentsWithoutAttribution++;
                allCollectionSpecs.push({ spec: AttributionCollection.makeEmptyCollection(segment.cachedLength).getAll(), length: segment.cachedLength });
            }
        }
        assert(segmentsWithAttribution === 0 || segmentsWithoutAttribution === 0,
            0x446 /* Expected either all segments or no segments to have attribution information. */);

        const extractSequenceOffsets = (
            getSpecEntries: (spec: IAttributionCollectionSpec<AttributionKey>) => Iterable<{ offset: number; key: AttributionKey | undefined }>
        ): SerializedAttributionCollection => {
            const posBreakpoints: number[] = [];
            const seqs: (number | null)[] = [];
            let mostRecentAttributionKey: number | undefined;
            let cumulativePos = 0;
    
            for (const { spec, length } of allCollectionSpecs) {
                for (const { offset, key: info } of getSpecEntries(spec)) {
                    if (info?.seq !== mostRecentAttributionKey) {
                        posBreakpoints.push(offset + cumulativePos);
                        seqs.push(info?.seq ?? null);
                    }
                    mostRecentAttributionKey = info?.seq;
                }
    
                cumulativePos += length;
            }

            return { posBreakpoints, seqs, length: cumulativePos };
        }

        const blobContents = extractSequenceOffsets((spec) => spec.root);
        if (allChannelNames.size > 0) {
            const channels: { [name: string]: SequenceOffsets } = {};
            for (const name of allChannelNames) {
                const { posBreakpoints, seqs } = extractSequenceOffsets((spec) => spec.channels?.[name] ?? [{ offset: 0, key: undefined }]);
                channels[name] = { posBreakpoints, seqs };
            }
            blobContents.channels = channels;
        }

        return blobContents;
    }
}
