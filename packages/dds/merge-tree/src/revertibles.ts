/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import { UsageError } from "@fluidframework/container-utils";
import { List } from "./collections";
import { EndOfTreeSegment } from "./endOfTreeSegment";
import { LocalReferenceCollection, LocalReferencePosition } from "./localReference";
import {
    IMergeTreeDeltaCallbackArgs,
} from "./mergeTreeDeltaCallback";
import { ISegment, toRemovalInfo } from "./mergeTreeNodes";
import { depthFirstNodeWalk } from "./mergeTreeNodeWalk";
import { TrackingGroup } from "./mergeTreeTracking";
import {
    IJSONSegment,
    MergeTreeDeltaType,
    ReferenceType,
} from "./ops";
import { matchProperties, PropertySet } from "./properties";
import { DetachedReferencePosition } from "./referencePositions";

/**
 * Revertibles are new and require the option
 * mergeTreeUseNewLengthCalculations to be set as true on the underlying merge tree
 * in order to function correctly.
 *
 * @alpha
 */
export type MergeTreeDeltaRevertible =
    {
        operation: typeof MergeTreeDeltaType.INSERT;
        trackingGroup: TrackingGroup;
    } | {
        operation: typeof MergeTreeDeltaType.REMOVE;
        trackingGroup: TrackingGroup;
    } | {
        operation: typeof MergeTreeDeltaType.ANNOTATE;
        trackingGroup: TrackingGroup;
        propertyDeltas: PropertySet;
    };

type TypedRevertible<T extends MergeTreeDeltaRevertible["operation"]> =
    MergeTreeDeltaRevertible & { operation: T; };

interface RemoveSegmentRefProperties{
    /**
     * the serialized form of the segment, so it can be re-inserted
     */
    segSpec: IJSONSegment;
    /**
     * a tag  so the reference can be identified as being created for revert
     */
    referenceSpace: "mergeTreeDeltaRevertible";
}

/**
 * Revertibles are new and require the option
 * mergeTreeUseNewLengthCalculations to be set as true on the underlying merge tree
 * in order to function correctly.
 *
 * @alpha
 */
export interface MergeTreeRevertibleDriver{
    insertFromSpec(pos: number, spec: IJSONSegment);
    removeRange(start: number, end: number);
    annotateRange(
        start: number,
        end: number,
        props: PropertySet);
    createLocalReferencePosition(
        segment: ISegment,
        offset: number,
        refType: ReferenceType,
        properties: PropertySet | undefined): LocalReferencePosition;
    localReferencePositionToPosition(lref: LocalReferencePosition): number;
    getPosition(segment: ISegment): number;
    getContainingSegment(pos: number): { segment: ISegment | undefined; offset: number | undefined; };
}

/**
 * exported for test only. should not be exported out the the package
 * @internal
 */
export type InternalRevertDriver = MergeTreeRevertibleDriver & {
    __mergeTreeRevertible?: {
        detachedReferences?: EndOfTreeSegment;
        refCallbacks?: LocalReferencePosition["callbacks"]; };
};

function appendLocalInsertToRevertibles(
    deltaArgs: IMergeTreeDeltaCallbackArgs,
    revertibles: MergeTreeDeltaRevertible[],
) {
    if (revertibles[revertibles.length - 1]?.operation !== MergeTreeDeltaType.INSERT) {
        revertibles.push({
            operation: MergeTreeDeltaType.INSERT,
            trackingGroup: new TrackingGroup(),
        });
    }
    const last = revertibles[revertibles.length - 1];
    deltaArgs.deltaSegments.forEach((t) => last.trackingGroup.link(t.segment));

    return revertibles;
}

function appendLocalRemoveToRevertibles(
    driver: MergeTreeRevertibleDriver,
    deltaArgs: IMergeTreeDeltaCallbackArgs,
    revertibles: MergeTreeDeltaRevertible[],
) {
    if (revertibles[revertibles.length - 1]?.operation !== MergeTreeDeltaType.REMOVE) {
        revertibles.push({
            operation: MergeTreeDeltaType.REMOVE,
            trackingGroup: new TrackingGroup(),
        });
    }
    const last = revertibles[revertibles.length - 1];

    deltaArgs.deltaSegments.forEach((t) => {
        const props: RemoveSegmentRefProperties = {
            segSpec: t.segment.toJSONObject(),
            referenceSpace: "mergeTreeDeltaRevertible",
        };
        const ref = driver.createLocalReferencePosition(
            t.segment,
            0,
            ReferenceType.SlideOnRemove,
            props);
        const internalDriver: InternalRevertDriver = driver;
        const driverRevertibleProps = internalDriver.__mergeTreeRevertible ??= {};
        ref.callbacks = driverRevertibleProps.refCallbacks ??= {
            afterSlide: (r: LocalReferencePosition) => {
                if (driver.localReferencePositionToPosition(r) === DetachedReferencePosition) {
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    const detached = driverRevertibleProps.detachedReferences ??= new EndOfTreeSegment(r.getSegment()!);
                    const refs = detached.localRefs ??= new LocalReferenceCollection(detached);
                    refs.addAfterTombstones([r]);
                }
            },
        };
        t.segment.trackingCollection.trackingGroups.forEach((tg) => {
            tg.link(ref);
            tg.unlink(t.segment);
        });

        last.trackingGroup.link(ref);
    });
    return revertibles;
}

function appendLocalAnnotateToRevertibles(
    deltaArgs: IMergeTreeDeltaCallbackArgs,
    revertibles: MergeTreeDeltaRevertible[],
) {
    let last = revertibles[revertibles.length - 1];
    deltaArgs.deltaSegments.forEach((ds) => {
        const propertyDeltas = ds.propertyDeltas;
        if (propertyDeltas) {
            if (last?.operation === MergeTreeDeltaType.ANNOTATE
                && matchProperties(last?.propertyDeltas, propertyDeltas)) {
                    last.trackingGroup.link(ds.segment);
            } else {
                last = {
                    operation: MergeTreeDeltaType.ANNOTATE,
                    propertyDeltas,
                    trackingGroup: new TrackingGroup(),
                };
                last.trackingGroup.link(ds.segment);
                revertibles.push(last);
            }
        }
    });
    return revertibles;
}

/**
 * Revertibles are new and require the option
 * mergeTreeUseNewLengthCalculations to be set as true on the underlying merge tree
 * in order to function correctly.
 * @alpha
 */
export function appendToMergeTreeDeltaRevertibles(
    driver: MergeTreeRevertibleDriver,
    deltaArgs: IMergeTreeDeltaCallbackArgs,
    revertibles: MergeTreeDeltaRevertible[],
) {
    switch (deltaArgs.operation) {
        case MergeTreeDeltaType.INSERT:
            appendLocalInsertToRevertibles(
                deltaArgs,
                revertibles);
            break;

        case MergeTreeDeltaType.REMOVE:
            appendLocalRemoveToRevertibles(
                driver,
                deltaArgs,
                revertibles);
            break;

        case MergeTreeDeltaType.ANNOTATE:
            appendLocalAnnotateToRevertibles(
                deltaArgs,
                revertibles);
            break;

        default:
            throw new UsageError(`Unsupported event delta type: ${deltaArgs.operation}`);
    }
}

/**
 * Revertibles are new and require the option
 * mergeTreeUseNewLengthCalculations to be set as true on the underlying merge tree
 * in order to function correctly.
 * @alpha
 */
export function discardMergeTreeDeltaRevertible(revertibles: MergeTreeDeltaRevertible[]) {
    revertibles.forEach((r) => {
        r.trackingGroup.tracked.forEach(
            (t) => {
                t.trackingCollection.unlink(r.trackingGroup);
                // remove untracked local references
                if (t.trackingCollection.empty && !t.isLeaf()) {
                    t.getSegment()?.localRefs?.removeLocalRef(t);
                }
            });
    });
}

function revertLocalInsert(
    driver: MergeTreeRevertibleDriver,
    revertible: TypedRevertible<typeof MergeTreeDeltaType.INSERT>,
) {
    while (revertible.trackingGroup.size > 0) {
        const tracked = revertible.trackingGroup.tracked[0];
        assert(
            tracked.trackingCollection.unlink(revertible.trackingGroup),
        "tracking group removed");
        assert(tracked.isLeaf(), "inserts must track segments");
        if (toRemovalInfo(tracked) === undefined) {
            const start = driver.getPosition(tracked);
            driver.removeRange(start, start + tracked.cachedLength);
        }
    }
}

function revertLocalRemove(
    driver: MergeTreeRevertibleDriver,
    revertible: TypedRevertible<typeof MergeTreeDeltaType.REMOVE>,
) {
    while (revertible.trackingGroup.size > 0) {
        const tracked = revertible.trackingGroup.tracked[0];

        assert(
            tracked.trackingCollection.unlink(revertible.trackingGroup),
        "tracking group removed");

        assert(!tracked.isLeaf(), "removes must track local refs");

        let realPos = driver.localReferencePositionToPosition(tracked);
        const refSeg = tracked.getSegment();

        // References which are on EndOfStringSegment don't return detached for pos,
        // they will return the length of the merge-tree. this case just catches
        // random references, likely not created in the revertible flow,
        // that are tying to be reverted for some reason.
        if (realPos === DetachedReferencePosition || refSeg === undefined) {
            throw new UsageError("Cannot insert at detached references position");
        }

        if (toRemovalInfo(refSeg) === undefined
            && refSeg.localRefs?.isAfterTombstone(tracked)) {
            realPos++;
        }

        const props = tracked.properties as RemoveSegmentRefProperties;
        driver.insertFromSpec(
            realPos,
            props.segSpec);
        const insertSegment = driver.getContainingSegment(realPos).segment;
        assert(insertSegment !== undefined, "insert segment must exist at position");

        const localSlideFilter = (lref: LocalReferencePosition) =>
            (lref.properties as Partial<RemoveSegmentRefProperties>)?.referenceSpace === "mergeTreeDeltaRevertible";

        const insertRef: Partial<Record<"before" | "after", List<LocalReferencePosition>>> = {};
        const forward = insertSegment.ordinal < refSeg.ordinal;
        const refHandler = (lref: LocalReferencePosition) => {
            // once we reach it keep the original reference where it is
            // we'll move tracking groups, and remove it as a last step.
            if (tracked === lref) {
                return false;
            }
            if (localSlideFilter(lref)) {
                if (forward) {
                    const before = insertRef.before ??= new List();
                    before.push(lref);
                } else {
                    const after = insertRef.after ??= new List();
                    after.unshift(lref);
                }
            }
        };
        depthFirstNodeWalk(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            insertSegment.parent!,
            insertSegment,
            undefined,
            (seg) => {
                if (seg.localRefs?.empty === false) {
                    return seg.localRefs.walkReferences(
                        refHandler,
                        undefined,
                        forward);
                }
                return true;
            },
            undefined,
            forward);
        const internalDriver: InternalRevertDriver = driver;
        if (internalDriver.__mergeTreeRevertible?.detachedReferences?.localRefs?.has(tracked)) {
            assert(forward, "forward should always be true when detached");
            internalDriver.__mergeTreeRevertible.detachedReferences.localRefs.walkReferences(refHandler);
        }

        if (insertRef !== undefined) {
            const localRefs =
                insertSegment.localRefs ??= new LocalReferenceCollection(insertSegment);
            if (insertRef.before?.empty === false) {
                localRefs.addBeforeTombstones(insertRef.before.map((n) => n.data));
            }
            if (insertRef.after?.empty === false) {
                localRefs.addAfterTombstones(insertRef.after.map((n) => n.data));
            }
        }

        tracked.trackingCollection.trackingGroups.forEach((tg) => {
            tg.link(insertSegment);
            tg.unlink(tracked);
        });
        tracked.getSegment()?.localRefs?.removeLocalRef(tracked);
    }
}

function revertLocalAnnotate(
    driver: MergeTreeRevertibleDriver,
    revertible: TypedRevertible<typeof MergeTreeDeltaType.ANNOTATE>,
) {
    while (revertible.trackingGroup.size > 0) {
        const tracked = revertible.trackingGroup.tracked[0];
        const unlinked = tracked.trackingCollection.unlink(revertible.trackingGroup);
        assert(unlinked && tracked.isLeaf(), "annotates must track segments");
        if (toRemovalInfo(tracked) === undefined) {
            const start = driver.getPosition(tracked);
            driver.annotateRange(
                start,
                start + tracked.cachedLength,
                revertible.propertyDeltas);
        }
    }
}

/**
 * Revertibles are new and require the option
 * mergeTreeUseNewLengthCalculations to be set as true on the underlying merge tree
 * in order to function correctly.
 * @alpha
 */
export function revertMergeTreeDeltaRevertibles(
    driver: MergeTreeRevertibleDriver,
    revertibles: MergeTreeDeltaRevertible[]) {
    while (revertibles.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const r = revertibles.pop()!;
        const operation = r.operation;
        switch (operation) {
            case MergeTreeDeltaType.INSERT:
                revertLocalInsert(driver, r);
                break;
            case MergeTreeDeltaType.REMOVE:
                revertLocalRemove(driver, r);
                break;
            case MergeTreeDeltaType.ANNOTATE:
                revertLocalAnnotate(driver, r);
                break;
            default:
                unreachableCase(operation);
        }
    }
}
