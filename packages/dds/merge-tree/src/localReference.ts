/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { UsageError } from "@fluidframework/container-utils";
import { List, ListMakeHead, ListRemoveEntry } from "./collections";
import {
    ISegment,
} from "./mergeTreeNodes";
import { ICombiningOp, ReferenceType } from "./ops";
import { addProperties, PropertySet } from "./properties";
import {
    refHasTileLabels,
    refHasRangeLabels,
    ReferencePosition,
    refTypeIncludesFlag,
} from "./referencePositions";

/**
 * @internal
 */
export function _validateReferenceType(refType: ReferenceType) {
    let exclusiveCount = 0;
    if (refTypeIncludesFlag(refType, ReferenceType.Transient)) {
        ++exclusiveCount;
    }
    if (refTypeIncludesFlag(refType, ReferenceType.SlideOnRemove)) {
        ++exclusiveCount;
    }
    if (refTypeIncludesFlag(refType, ReferenceType.StayOnRemove)) {
        ++exclusiveCount;
    }
    if (exclusiveCount > 1) {
        throw new UsageError(
            "Reference types can only be one of Transient, SlideOnRemove, and StayOnRemove");
    }
}

export interface LocalReferencePosition extends ReferencePosition {
    callbacks?: Partial<Record<"beforeSlide" | "afterSlide", () => void>>;
}

/**
 * @privateRemarks This should not be exported outside merge tree.
 * @internal
 */
class LocalReference implements LocalReferencePosition {
    public properties: PropertySet | undefined;

    private segment: ISegment | undefined;
    private offset: number = 0;
    private listNode: List<LocalReference> | undefined;

    public callbacks?: Partial<Record<"beforeSlide" | "afterSlide", () => void>> | undefined;

    constructor(
        public refType = ReferenceType.Simple,
        properties?: PropertySet,
    ) {
        _validateReferenceType(refType);
        this.properties = properties;
    }

    public link(segment: ISegment | undefined, offset: number, listNode: List<LocalReference> | undefined) {
        if (listNode !== this.listNode
            && this.listNode !== undefined) {
            this.segment?.localRefs?.removeLocalRef(this);
        }
        this.segment = segment;
        this.offset = offset;
        this.listNode = listNode;
    }

    public isLeaf() {
        return false;
    }

    public addProperties(newProps: PropertySet, op?: ICombiningOp) {
        this.properties = addProperties(this.properties, newProps, op);
    }

    public getSegment() {
        return this.segment;
    }

    public getOffset() {
        return this.offset;
    }

    public getListNode() {
        return this.listNode;
    }

    public getProperties() {
        return this.properties;
    }
}

export function createDetachedLocalReferencePosition(refType?: ReferenceType): LocalReferencePosition {
    return new LocalReference(refType, undefined);
}

interface IRefsAtOffset {
    before?: List<LocalReference>;
    at?: List<LocalReference>;
    after?: List<LocalReference>;
}

export function assertLocalReferences(
    lref: any,
): asserts lref is LocalReference {
    assert(lref instanceof LocalReference, 0x2e0 /* "lref not a Local Reference" */);
}

/**
 * Represents a collection of {@link LocalReferencePosition}s associated with one segment in a merge-tree.
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
     * @remarks This method should only be called by mergeTree.
     * @internal
     */
    public hierRefCount: number = 0;
    private readonly refsByOffset: (IRefsAtOffset | undefined)[];
    private refCount: number = 0;

    /**
     *
     * @internal
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
     * @remarks This method should only be called by mergeTree.
     * @internal
     */
    public [Symbol.iterator]() {
        const subiterators: IterableIterator<LocalReferencePosition>[] = [];
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
            next(): IteratorResult<LocalReferencePosition> {
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
     * @remarks This method should only be called by mergeTree.
     * @internal
     */
    public clear() {
        this.refCount = 0;
        this.hierRefCount = 0;
        const detachSegments = (refs: List<LocalReference> | undefined) => {
            if (refs) {
                for (const r of refs) {
                    this.removeLocalRef(r);
                }
            }
        };
        for (let i = 0; i < this.refsByOffset.length; i++) {
            const refsAtOffset = this.refsByOffset[i];
            if (refsAtOffset) {
                detachSegments(refsAtOffset.before);
                detachSegments(refsAtOffset.at);
                detachSegments(refsAtOffset.after);
                this.refsByOffset[i] = undefined;
            }
        }
    }

    /**
     * @remarks This method should only be called by mergeTree.
     * @internal
     */
    public get empty() {
        return this.refCount === 0;
    }

    /**
     * @remarks This method should only be called by mergeTree.
     * @internal
     */
    public createLocalRef(
        offset: number,
        refType: ReferenceType,
        properties: PropertySet | undefined): LocalReferencePosition {
        const ref = new LocalReference(
            refType,
            properties,
        );
        ref.link(this.segment, offset, undefined);
        if (!refTypeIncludesFlag(ref, ReferenceType.Transient)) {
            this.addLocalRef(ref, offset);
        }
        return ref;
    }

    /**
     * @remarks This method should only be called by mergeTree.
     * @internal
     */
    public addLocalRef(lref: LocalReferencePosition, offset: number) {
        assert(
            !refTypeIncludesFlag(lref, ReferenceType.Transient),
            0x2df /* "transient references cannot be bound to segments" */);
        assertLocalReferences(lref);
        assert(offset < this.segment.cachedLength, 0x348 /* offset cannot be beyond segment length */);
        const refsAtOffset = this.refsByOffset[offset] =
            this.refsByOffset[offset]
            ?? { at: ListMakeHead() };
        const atRefs = refsAtOffset.at =
            refsAtOffset.at
            ?? ListMakeHead();

        lref.link(this.segment, offset, atRefs.enqueue(lref));

        if (refHasRangeLabels(lref) || refHasTileLabels(lref)) {
            this.hierRefCount++;
        }
        this.refCount++;
    }

    /**
     * @remarks This method should only be called by mergeTree.
     * @internal
     */
    public removeLocalRef(lref: LocalReferencePosition): LocalReferencePosition | undefined {
        if (this.has(lref)) {
            assertLocalReferences(lref);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            ListRemoveEntry(lref.getListNode()!);
            lref.link(
                lref.getSegment(),
                lref.getOffset(),
                undefined);
            if (refHasRangeLabels(lref) || refHasTileLabels(lref)) {
                this.hierRefCount--;
            }
            this.refCount--;
            return lref;
        }
    }

    /**
     *
     * Called by 'append()' implementations to append local refs from the given 'other' segment to the
     * end of 'this' segment.
     *
     * Note: This method should be invoked after the caller has ensured that segments can be merged,
     * but before 'this' segment's cachedLength has changed, or the adjustment to the local refs
     * will be incorrect.
     *
     * @remarks This method should only be called by mergeTree.
     * @internal
     */
    public append(other: LocalReferenceCollection) {
        if (!other || other.empty) {
            return;
        }
        this.hierRefCount += other.hierRefCount;
        this.refCount += other.refCount;
        other.hierRefCount = 0;
        for (const lref of other) {
            assertLocalReferences(lref);
            lref.link(
                this.segment,
                lref.getOffset() + this.refsByOffset.length,
                lref.getListNode());
        }

        this.refsByOffset.push(...other.refsByOffset);
    }
    /**
     * Returns true of the local reference is in the collection, otherwise false.
     *
     * @remarks This method should only be called by mergeTree.
     * @internal
     */
    public has(lref: ReferencePosition): boolean {
        if (!(lref instanceof LocalReference)
            || refTypeIncludesFlag(lref, ReferenceType.Transient)) {
            return false;
        }
        const seg = lref.getSegment();
        if (seg !== this.segment) {
            return false;
        }
        // we should be able to optimize finding the
        // list head
        const listNode = lref.getListNode();
        if (listNode === undefined) {
            return false;
        }
        let prev = listNode;
        let next = listNode;
        while (prev?.isHead !== true && next?.isHead !== true) {
            prev = prev?.prev;
            next = next?.next;
        }

        const headNode = prev?.isHead === true ? prev : next;
        if (headNode?.isHead !== true || headNode.empty()) {
            return false;
        }
        const offset = lref.getOffset();
        const refsAtOffset = this.refsByOffset[offset];
        if (refsAtOffset?.before === headNode
            || refsAtOffset?.at === headNode
            || refsAtOffset?.after === headNode) {
                return true;
            }
        return false;
    }

    /**
     * Splits this `LocalReferenceCollection` into the intervals [0, offset) and [offset, originalLength).
     * Local references in the former half of this split will remain associated with the segment used on construction.
     * Local references in the latter half of this split will be transferred to `splitSeg`,
     * and its `localRefs` field will be set.
     * @param offset - Offset into the original segment at which the collection should be split
     * @param splitSeg - Split segment which originally corresponded to the indices [offset, originalLength)
     * before splitting.
     *
     * @remarks This method should only be called by mergeTree.
     * @internal
     */
    public split(offset: number, splitSeg: ISegment) {
        if (!this.empty) {
            const localRefs =
                new LocalReferenceCollection(
                    splitSeg,
                    this.refsByOffset.splice(offset, this.refsByOffset.length - offset));

            splitSeg.localRefs = localRefs;
            for (const lref of localRefs) {
                assertLocalReferences(lref);
                lref.link(
                    splitSeg,
                    lref.getOffset() - offset,
                    lref.getListNode());
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

    public addBeforeTombstones(...refs: Iterable<LocalReferencePosition>[]) {
        const beforeRefs = this.refsByOffset[0]?.before ?? ListMakeHead();

        if (this.refsByOffset[0]?.before === undefined) {
            const refsAtOffset = this.refsByOffset[0] ??= { before: beforeRefs };
            refsAtOffset.before ??= beforeRefs;
        }

        for (const iterable of refs) {
            for (const lref of iterable) {
                assertLocalReferences(lref);
                if (refTypeIncludesFlag(lref, ReferenceType.SlideOnRemove)) {
                    lref.callbacks?.beforeSlide?.();
                    beforeRefs.unshift(lref);
                    lref.link(this.segment, 0, beforeRefs.next);
                    if (refHasRangeLabels(lref) || refHasTileLabels(lref)) {
                        this.hierRefCount++;
                    }
                    this.refCount++;
                    lref.callbacks?.afterSlide?.();
                } else {
                    lref.link(undefined, 0, undefined);
                }
            }
        }
    }

    public addAfterTombstones(...refs: Iterable<LocalReferencePosition>[]) {
        const lastOffset = this.segment.cachedLength - 1;
        const afterRefs = this.refsByOffset[lastOffset]?.after ?? ListMakeHead();

        if (this.refsByOffset[lastOffset]?.after === undefined) {
            const refsAtOffset = this.refsByOffset[lastOffset] ??= { after: afterRefs };
            refsAtOffset.after ??= afterRefs;
        }

        for (const iterable of refs) {
            for (const lref of iterable) {
                assertLocalReferences(lref);
                if (refTypeIncludesFlag(lref, ReferenceType.SlideOnRemove)) {
                    lref.callbacks?.beforeSlide?.();
                    afterRefs.enqueue(lref);
                    lref.link(this.segment, lastOffset, afterRefs.prev);
                    if (refHasRangeLabels(lref) || refHasTileLabels(lref)) {
                        this.hierRefCount++;
                    }
                    this.refCount++;
                    lref.callbacks?.afterSlide?.();
                } else {
                    lref.link(undefined, 0, undefined);
                }
            }
        }
    }
}
