/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Client } from "./client";
import {
    ISegment,
    ReferencePosition,
    refGetRangeLabels,
    refGetTileLabels,
    refHasRangeLabel,
    refHasRangeLabels,
    refHasTileLabel,
    refHasTileLabels,
} from "./mergeTree";
import { ICombiningOp, ReferenceType } from "./ops";
import { addProperties, PropertySet } from "./properties";

export class LocalReference implements ReferencePosition {
    public static readonly DetachedPosition: number = -1;

    public properties: PropertySet;
    public pairedRef?: LocalReference;

    constructor(
        private readonly client: Client,
        public segment: ISegment,
        public offset = 0,
        public refType = ReferenceType.Simple) {
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
        return refHasTileLabels(this);
    }

    public hasRangeLabels() {
        return refHasRangeLabels(this);
    }

    public hasTileLabel(label: string) {
        return refHasTileLabel(this, label);
    }

    public hasRangeLabel(label: string) {
        return refHasRangeLabel(this, label);
    }

    public getTileLabels() {
        return refGetTileLabels(this);
    }

    public getRangeLabels() {
        return refGetRangeLabels(this);
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
        if (this.segment.removedSeq) {
            return 0;
        }
        return this.offset;
    }

    public getProperties() {
        return this.properties;
    }
}

interface IRefsAtOffest {
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
            seg1.localRefs.append(seg2.localRefs);
        }
    }

    public hierRefCount: number = 0;
    private readonly refsByOffset: IRefsAtOffest[];
    private refCount: number = 0;

    constructor(
        private readonly segment: ISegment,
        initialRefsByfOffset = new Array<IRefsAtOffest>(segment.cachedLength)) {
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
        const detachSegments = (refs: LocalReference[]) => {
            if (refs) {
                refs.forEach((r) => {
                    if (r.segment === this.segment) {
                        r.segment = undefined;
                    }
                });
            }
        };
        for (let i = 0; i < this.refsByOffset.length; i++) {
            if (this.refsByOffset[i]) {
                detachSegments(this.refsByOffset[i].before);
                detachSegments(this.refsByOffset[i].at);
                detachSegments(this.refsByOffset[i].before);
                this.refsByOffset[i] = undefined;
            }
        }
    }

    public get empty() {
        return this.refCount === 0;
    }

    public addLocalRef(lref: LocalReference) {
        if (this.refsByOffset[lref.offset] === undefined) {
            this.refsByOffset[lref.offset] = {
                at: [lref],
            };
        } else {
            this.refsByOffset[lref.offset].at.push(lref);
        }

        if (lref.hasRangeLabels() || lref.hasTileLabels()) {
            this.hierRefCount++;
        }
        this.refCount++;
    }

    public removeLocalRef(lref: LocalReference) {
        const tryRemoveRef = (refs: LocalReference[]) => {
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
            splitSeg.localRefs =
                new LocalReferenceCollection(
                    splitSeg,
                    this.refsByOffset.splice(offset, this.refsByOffset.length - offset));

            for (const lref of splitSeg.localRefs) {
                lref.segment = splitSeg;
                lref.offset -= offset;
                if (lref.hasRangeLabels() || lref.hasTileLabels()) {
                    this.hierRefCount--;
                    splitSeg.localRefs.hierRefCount++;
                }
                this.refCount--;
                splitSeg.localRefs.refCount++;
            }
        }
    }

    public addBeforeTombstones(...refs: Iterable<LocalReference>[]) {
        const beforeRefs = [];

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
        const afterRefs = [];

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
            if (this.refsByOffset[this.segment.cachedLength - 1] === undefined) {
                this.refsByOffset[this.segment.cachedLength - 1] = { after: afterRefs };
            } else if (this.refsByOffset[this.segment.cachedLength - 1].after === undefined) {
                this.refsByOffset[this.segment.cachedLength - 1].after = afterRefs;
            } else {
                this.refsByOffset[this.segment.cachedLength - 1].after.push(...afterRefs);
            }
        }
    }
}
