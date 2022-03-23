/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { Client } from "./client";
import {
    ISegment,
    ReferencePosition,
    refGetRangeLabels,
    refGetTileLabels,
    refHasRangeLabel,
    refHasTileLabel,
} from "./mergeTree";
import { ICombiningOp, ReferenceType } from "./ops";
import { addProperties, PropertySet } from "./properties";

export class LocalReference implements ReferencePosition {
    public static readonly DetachedPosition: number = -1;

    public properties: PropertySet | undefined;
    public pairedRef?: LocalReference;
    public segment: ISegment | undefined;

    constructor(
        private readonly client: Client,
        initSegment: ISegment,
        public offset = 0,
        public refType = ReferenceType.Simple,
    ) {
        this.segment = initSegment;
    }

    public min(b: LocalReference) {
        if (this.compare(b) < 0) {
            return this;
        } else {
            return b;
        }
    }

    public max(b: LocalReference) {
        if (this.compare(b) > 0) {
            return this;
        } else {
            return b;
        }
    }

    public compare(b: LocalReference) {
        if (this.segment === b.segment) {
            return this.offset - b.offset;
        } else {
            if (this.segment === undefined
                || (b.segment !== undefined &&
                    this.segment.ordinal < b.segment.ordinal)) {
                return -1;
            } else {
                return 1;
            }
        }
    }

    public toPosition() {
        if (this.segment && this.segment.parent) {
            return this.getOffset() + this.client.getPosition(this.segment);
        } else {
            return LocalReference.DetachedPosition;
        }
    }

    public hasTileLabels() {
        return !!this.getTileLabels();
    }

    public hasRangeLabels() {
        return !!this.getRangeLabels();
    }

    public hasTileLabel(label: string): boolean {
        return refHasTileLabel(this, label);
    }

    public hasRangeLabel(label: string): boolean {
        return refHasRangeLabel(this, label);
    }

    public getTileLabels(): string[] | undefined {
        return refGetTileLabels(this);
    }

    public getRangeLabels(): string[] | undefined {
        return refGetRangeLabels(this);
    }

    public isLeaf() {
        return false;
    }

    public addProperties(newProps: PropertySet, op?: ICombiningOp) {
        this.properties = addProperties(this.properties, newProps, op);
    }

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
    before?: LocalReference[];
    at?: LocalReference[];
    after?: LocalReference[];
}

export class LocalReferenceCollection {
    public static append(seg1: ISegment, seg2: ISegment) {
        if (seg2.localRefs && !seg2.localRefs.empty) {
            if (!seg1.localRefs) {
                seg1.localRefs = new LocalReferenceCollection(seg1);
            }
            assert(seg1.localRefs.refsByOffset.length === seg1.cachedLength, "LocalReferences array contains a gap");
            seg1.localRefs.append(seg2.localRefs);
        }
        else if (seg1.localRefs) {
            // Since creating the LocalReferenceCollection, we may have appended
            // segments that had no local references. Account for them now by padding the array.
            seg1.localRefs.refsByOffset.length += seg2.cachedLength;
        }
    }

    public hierRefCount: number = 0;
    private readonly refsByOffset: (IRefsAtOffset | undefined)[];
    private refCount: number = 0;

    constructor(
        private readonly segment: ISegment,
        initialRefsByfOffset = new Array<IRefsAtOffset | undefined>(segment.cachedLength)) {
        // Since javascript arrays are sparse the above won't populate any of the
        // indicies, but it will ensure the length property of the array matches
        // the length of the segment.
        this.refsByOffset = initialRefsByfOffset;
    }

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

    public clear() {
        this.refCount = 0;
        this.hierRefCount = 0;
        const detachSegments = (refs: LocalReference[] | undefined) => {
            if (refs) {
                refs.forEach((r) => {
                    if (r.segment === this.segment) {
                        r.segment = undefined;
                    }
                });
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

    public get empty() {
        return this.refCount === 0;
    }

    public addLocalRef(lref: LocalReference) {
        const refsAtOffset = this.refsByOffset[lref.offset];
        if (refsAtOffset === undefined) {
            this.refsByOffset[lref.offset] = {
                at: [lref],
            };
        } else if (refsAtOffset.at === undefined) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.refsByOffset[lref.offset]!.at = [lref];
        } else {
            refsAtOffset.at.push(lref);
        }

        if (lref.hasRangeLabels() || lref.hasTileLabels()) {
            this.hierRefCount++;
        }
        this.refCount++;
    }

    public removeLocalRef(lref: LocalReference) {
        const tryRemoveRef = (refs: LocalReference[] | undefined) => {
            if (refs) {
                const index = refs.indexOf(lref);
                if (index >= 0) {
                    refs.splice(index, 1);
                    if (lref.hasRangeLabels() || lref.hasTileLabels()) {
                        this.hierRefCount--;
                    }
                    this.refCount--;
                    return lref;
                }
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
                if (lref.hasRangeLabels() || lref.hasTileLabels()) {
                    this.hierRefCount--;
                    localRefs.hierRefCount++;
                }
                this.refCount--;
                localRefs.refCount++;
            }
        }
    }

    public addBeforeTombstones(...refs: Iterable<LocalReference>[]) {
        const beforeRefs: LocalReference[] = [];

        for (const iterable of refs) {
            for (const lref of iterable) {
                // eslint-disable-next-line no-bitwise
                if (lref.refType & ReferenceType.SlideOnRemove) {
                    beforeRefs.push(lref);
                    lref.segment = this.segment;
                    lref.offset = 0;
                    if (lref.hasRangeLabels() || lref.hasTileLabels()) {
                        this.hierRefCount++;
                    }
                    this.refCount++;
                } else {
                    lref.segment = undefined;
                }
            }
        }
        if (beforeRefs.length > 0) {
            if (this.refsByOffset[0] === undefined) {
                this.refsByOffset[0] = { before: beforeRefs };
            } else if (this.refsByOffset[0].before === undefined) {
                this.refsByOffset[0].before = beforeRefs;
            } else {
                this.refsByOffset[0].before.unshift(...beforeRefs);
            }
        }
    }

    public addAfterTombstones(...refs: Iterable<LocalReference>[]) {
        const afterRefs: LocalReference[] = [];

        for (const iterable of refs) {
            for (const lref of iterable) {
                // eslint-disable-next-line no-bitwise
                if (lref.refType & ReferenceType.SlideOnRemove) {
                    afterRefs.push(lref);
                    lref.segment = this.segment;
                    lref.offset = this.segment.cachedLength - 1;
                    if (lref.hasRangeLabels() || lref.hasTileLabels()) {
                        this.hierRefCount++;
                    }
                    this.refCount++;
                } else {
                    lref.segment = undefined;
                }
            }
        }
        if (afterRefs.length > 0) {
            const refsAtOffset = this.refsByOffset[this.segment.cachedLength - 1];
            if (refsAtOffset === undefined) {
                this.refsByOffset[this.segment.cachedLength - 1] = { after: afterRefs };
            } else if (refsAtOffset.after === undefined) {
                refsAtOffset.after = afterRefs;
            } else {
                refsAtOffset.after.push(...afterRefs);
            }
        }
    }
}
