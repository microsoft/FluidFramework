/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { Client } from "./client";
import { List, ListMakeHead, ListRemoveEntry } from "./collections";
import {
    ISegment,
} from "./mergeTree";
import { ICombiningOp, ReferenceType } from "./ops";
import { addProperties, PropertySet } from "./properties";
import {
    minReferencePosition,
    maxReferencePosition,
    compareReferencePositions,
    refHasTileLabels,
    refHasRangeLabels,
    ReferencePosition,
    refGetRangeLabels,
    refGetTileLabels,
    refHasRangeLabel,
    refHasTileLabel,
    refTypeIncludesFlag,
} from "./referencePositions";

/**
 * @deprecated - Use ReferencePosition
 */
export class LocalReference implements ReferencePosition {
    /**
     * @deprecated - use DetachedReferencePosition
     */
    public static readonly DetachedPosition: number = -1;

    public properties: PropertySet | undefined;
    /**
     * @deprecated - use properties to store pair
     */
    public pairedRef?: LocalReference;
    /**
     * @deprecated - use getSegment
     */
    public segment: ISegment | undefined;

    /**
     * @deprecated - use createReferencePosition
     */
    constructor(
        private readonly client: Client,
        initSegment: ISegment,
        /**
         * @deprecated - use getOffset
         */
        public offset: number = 0,
        public refType = ReferenceType.Simple,
        properties?: PropertySet,
    ) {
        this.segment = initSegment;
        this.properties = properties;
    }

    /**
     * @deprecated - use minReferencePosition
     */
    public min(b: LocalReference) {
        return minReferencePosition(this, b);
    }
    /**
     * @deprecated - use maxReferencePosition
     */
    public max(b: LocalReference) {
        return maxReferencePosition(this, b);
    }
    /**
     * @deprecated - use compareReferencePositions
     */
    public compare(b: LocalReference) {
        return compareReferencePositions(this, b);
    }

    /**
     * @deprecated - use getLocalReferencePosition
     */
    public toPosition() {
        return this.getClient().localReferencePositionToPosition(this);
    }

    /**
     * @deprecated - use refHasTileLabels
     */
    public hasTileLabels(): boolean {
        return refHasTileLabels(this);
    }
    /**
     * @deprecated - use refHasRangeLabels
     */
    public hasRangeLabels(): boolean {
        return refHasRangeLabels(this);
    }
    /**
     * @deprecated - use refHasTileLabel
     */
    public hasTileLabel(label: string): boolean {
        return refHasTileLabel(this, label);
    }
    /**
     * @deprecated - use refHasRangeLabel
     */
    public hasRangeLabel(label: string): boolean {
        return refHasRangeLabel(this, label);
    }
    /**
     * @deprecated - use refGetTileLabels
     */
    public getTileLabels(): string[] | undefined {
        return refGetTileLabels(this);
    }
    /**
     * @deprecated - use refGetRangeLabels
     */
    public getRangeLabels(): string[] | undefined {
        return refGetRangeLabels(this);
    }

    public isLeaf() {
        return false;
    }

    public addProperties(newProps: PropertySet, op?: ICombiningOp) {
        this.properties = addProperties(this.properties, newProps, op);
    }

    /**
     * @deprecated - no longer supported
     */
    public getClient() {
        return this.client;
    }

    public getSegment() {
        return this.segment;
    }

    public getOffset() {
        if (this.segment?.removedSeq) {
            return 0;
        }
        return this.offset;
    }

    public getProperties() {
        return this.properties;
    }
}

interface IRefsAtOffset {
    before?: List<LocalReference>;
    at?: List<LocalReference>;
    after?: List<LocalReference>;
}

function assertLocalReferences(lref: ReferencePosition | LocalReference): asserts lref is LocalReference {
    assert(lref instanceof LocalReference, 0x2e0 /* "lref not a Local Reference" */);
}

/**
 * Represents a collection of {@link ReferencePosition}s associated with one segment in a merge-tree.
 */
export class LocalReferenceCollection {
    public static append(seg1: ISegment, seg2: ISegment) {
        if (seg2.localRefs && !seg2.localRefs.empty) {
            if (!seg1.localRefs) {
                seg1.localRefs = new LocalReferenceCollection(seg1);
            }
            assert(seg1.localRefs.refsByOffset.length === seg1.cachedLength,
                0x2be /* "LocalReferences array contains a gap" */);
            seg1.localRefs.append(seg2.localRefs);
        } else if (seg1.localRefs) {
            // Since creating the LocalReferenceCollection, we may have appended
            // segments that had no local references. Account for them now by padding the array.
            seg1.localRefs.refsByOffset.length += seg2.cachedLength;
        }
    }

    /**
     *
     * @internal - this method should only be called by mergeTree
     */
    public hierRefCount: number = 0;
    private readonly refsByOffset: (IRefsAtOffset | undefined)[];
    private refCount: number = 0;

    /**
     *
     * @internal - this method should only be called by mergeTree
     */
    constructor(
        /** Segment this `LocalReferenceCollection` is associated to. */
        private readonly segment: ISegment,
        initialRefsByfOffset = new Array<IRefsAtOffset | undefined>(segment.cachedLength)) {
        // Since javascript arrays are sparse the above won't populate any of the
        // indices, but it will ensure the length property of the array matches
        // the length of the segment.
        this.refsByOffset = initialRefsByfOffset;
    }

    /**
     *
     * @internal - this method should only be called by mergeTree
     */
    public [Symbol.iterator]() {
        const subiterators: IterableIterator<LocalReference>[] = [];
        for (const refs of this.refsByOffset) {
            if (refs) {
                if (refs.before) {
                    subiterators.push(refs.before[Symbol.iterator]());
                }
                if (refs.at) {
                    subiterators.push(refs.at[Symbol.iterator]());
                }
                if (refs.after) {
                    subiterators.push(refs.after[Symbol.iterator]());
                }
            }
        }

        const iterator = {
            next(): IteratorResult<LocalReference> {
                while (subiterators.length > 0) {
                    const next = subiterators[0].next();
                    if (next.done === true) {
                        subiterators.shift();
                    } else {
                        return next;
                    }
                }

                return { value: undefined, done: true };
            },
            [Symbol.iterator]() {
                return this;
            },
        };
        return iterator;
    }

    /**
     *
     * @internal - this method should only be called by mergeTree
     */
    public clear() {
        this.refCount = 0;
        this.hierRefCount = 0;
        const detachSegments = (refs: List<LocalReference> | undefined) => {
            if (refs) {
                for (const r of refs) {
                    if (r.segment === this.segment) {
                        r.segment = undefined;
                    }
                }
            }
        };
        for (let i = 0; i < this.refsByOffset.length; i++) {
            const refsAtOffset = this.refsByOffset[i];
            if (refsAtOffset) {
                detachSegments(refsAtOffset.before);
                detachSegments(refsAtOffset.at);
                detachSegments(refsAtOffset.before);
                this.refsByOffset[i] = undefined;
            }
        }
    }

    /**
     *
     * @internal - this method should only be called by mergeTree
     */
    public get empty() {
        return this.refCount === 0;
    }

    /**
     *
     * @internal - this method should only be called by mergeTree
     */
    public createLocalRef(
        offset: number,
        refType: ReferenceType,
        properties: PropertySet | undefined,
        client: Client): ReferencePosition {
        const ref = new LocalReference(
            client,
            this.segment,
            offset,
            refType,
            properties,
        );
        if (!refTypeIncludesFlag(ref, ReferenceType.Transient)) {
            this.addLocalRef(ref);
        }
        return ref;
    }

    /**
     *
     * @internal - this method should only be called by mergeTree
     */
    public addLocalRef(lref: LocalReference | ReferencePosition) {
        assert(
            !refTypeIncludesFlag(lref, ReferenceType.Transient),
            0x2df /* "transient references cannot be bound to segments" */);
        assertLocalReferences(lref);
        const refsAtOffset = this.refsByOffset[lref.getOffset()] =
            this.refsByOffset[lref.getOffset()]
            ?? { at: ListMakeHead() };
        const atRefs = refsAtOffset.at =
            refsAtOffset.at
            ?? ListMakeHead();

        atRefs.enqueue(lref);

        if (refHasRangeLabels(lref) || refHasTileLabels(lref)) {
            this.hierRefCount++;
        }
        this.refCount++;
    }

    /**
     *
     * @internal - this method should only be called by mergeTree
     */
    public removeLocalRef(lref: LocalReference | ReferencePosition) {
        assertLocalReferences(lref);
        const tryRemoveRef = (refs: List<LocalReference> | undefined) => {
            if (refs) {
                let node = refs;
                do {
                    node = node.next;
                    if (node.data === lref) {
                        ListRemoveEntry(node);
                        if (refHasRangeLabels(lref) || refHasTileLabels(lref)) {
                            this.hierRefCount--;
                        }
                        this.refCount--;
                        return lref;
                    }
                } while (!node.isHead);
            }
        };
        const refAtOffset = this.refsByOffset[lref.offset];
        if (refAtOffset !== undefined) {
            let ref = tryRemoveRef(refAtOffset.before);
            if (ref) {
                return ref;
            }

            ref = tryRemoveRef(refAtOffset.at);
            if (ref) {
                return ref;
            }

            ref = tryRemoveRef(refAtOffset.after);
            if (ref) {
                return ref;
            }
        }
    }

    /**
     * @internal - this method should only be called by mergeTree
     *
     * Called by 'append()' implementations to append local refs from the given 'other' segment to the
     * end of 'this' segment.
     *
     * Note: This method should be invoked after the caller has ensured that segments can be merged,
     *       but before 'this' segment's cachedLength has changed, or the adjustment to the local refs
     *       will be incorrect.
     */
    public append(other: LocalReferenceCollection) {
        if (!other || other.empty) {
            return;
        }
        this.hierRefCount += other.hierRefCount;
        this.refCount += other.refCount;
        other.hierRefCount = 0;
        for (const lref of other) {
            lref.segment = this.segment;
            lref.offset += this.refsByOffset.length;
        }

        this.refsByOffset.push(...other.refsByOffset);
    }

    /**
     * @internal - this method should only be called by mergeTree
     *
     * Splits this `LocalReferenceCollection` into the intervals [0, offset) and [offset, originalLength).
     * Local references in the former half of this split will remain associated with the segment used on construction.
     * Local references in the latter half of this split will be transferred to `splitSeg`,
     * and its `localRefs` field will be set.
     * @param offset - Offset into the original segment at which the collection should be split
     * @param splitSeg - Split segment which originally corresponded to the indices [offset, originalLength)
     * before splitting.
     */
    public split(offset: number, splitSeg: ISegment) {
        if (!this.empty) {
            const localRefs =
                new LocalReferenceCollection(
                    splitSeg,
                    this.refsByOffset.splice(offset, this.refsByOffset.length - offset));

            splitSeg.localRefs = localRefs;
            for (const lref of localRefs) {
                lref.segment = splitSeg;
                lref.offset -= offset;
                if (refHasRangeLabels(lref) || refHasTileLabels(lref)) {
                    this.hierRefCount--;
                    localRefs.hierRefCount++;
                }
                this.refCount--;
                localRefs.refCount++;
            }
        } else {
            // shrink the offset array when empty and splitting
            this.refsByOffset.length = offset;
        }
    }

    public addBeforeTombstones(...refs: Iterable<LocalReference | ReferencePosition>[]) {
        const beforeRefs = this.refsByOffset[0]?.before ?? ListMakeHead();

        for (const iterable of refs) {
            for (const lref of iterable) {
                assertLocalReferences(lref);
                if (refTypeIncludesFlag(lref, ReferenceType.SlideOnRemove)) {
                    beforeRefs.push(lref);
                    lref.segment = this.segment;
                    lref.offset = 0;
                    if (refHasRangeLabels(lref) || refHasTileLabels(lref)) {
                        this.hierRefCount++;
                    }
                    this.refCount++;
                } else {
                    lref.segment = undefined;
                }
            }
        }
        if (!beforeRefs.empty() && this.refsByOffset[0]?.before === undefined) {
            const refsAtOffset = this.refsByOffset[0] =
                this.refsByOffset[0]
                ?? { before: beforeRefs };
            refsAtOffset.before = refsAtOffset.before ?? beforeRefs;
        }
    }

    public addAfterTombstones(...refs: Iterable<LocalReference | ReferencePosition>[]) {
        const lastOffset = this.refsByOffset.length - 1;
        const afterRefs =
            this.refsByOffset[lastOffset]?.after ?? ListMakeHead();

        for (const iterable of refs) {
            for (const lref of iterable) {
                assertLocalReferences(lref);
                if (refTypeIncludesFlag(lref, ReferenceType.SlideOnRemove)) {
                    afterRefs.push(lref);
                    lref.segment = this.segment;
                    lref.offset = this.segment.cachedLength - 1;
                    if (refHasRangeLabels(lref) || refHasTileLabels(lref)) {
                        this.hierRefCount++;
                    }
                    this.refCount++;
                } else {
                    lref.segment = undefined;
                }
            }
        }
        if (!afterRefs.empty() && this.refsByOffset[lastOffset]?.after === undefined) {
            const refsAtOffset = this.refsByOffset[lastOffset] =
                this.refsByOffset[lastOffset]
                ?? { after: afterRefs };
            refsAtOffset.after = refsAtOffset.after ?? afterRefs;
        }
    }
}
