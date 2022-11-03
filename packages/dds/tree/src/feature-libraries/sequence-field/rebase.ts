/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { clone, fail, StackyIterator } from "../../util";
import { RevisionTag, TaggedChange } from "../../core";
import {
    getInputLength,
    getOutputLength,
    isAttach,
    isDetachMark,
    isModify,
    isSkipMark,
    splitMarkOnInput,
} from "./utils";
import { Attach, Changeset, LineageEvent, Mark, MarkList, SizedMark } from "./format";
import { MarkListFactory } from "./markListFactory";

/**
 * Rebases `change` over `base` assuming they both apply to the same initial state.
 * @param change - The changeset to rebase.
 * @param base - The changeset to rebase over.
 * @returns A changeset that performs the changes in `change` but does so assuming `base` has been applied first.
 *
 * WARNING! This implementation is incomplete:
 * - Marks that affect existing content are removed instead of muted when rebased over the deletion of that content.
 * This prevents us from then reinstating the mark when rebasing over the revive.
 * - Tombs are not added when rebasing an insert over a gap that is immediately left of deleted content.
 * This prevents us from being able to accurately track the position of the insert.
 * - Tiebreak ordering is not respected.
 * - Support for moves is not implemented.
 * - Support for slices is not implemented.
 */
export function rebase<TNodeChange>(
    change: Changeset<TNodeChange>,
    base: TaggedChange<Changeset<TNodeChange>>,
    rebaseChild: NodeChangeRebaser<TNodeChange>,
): Changeset<TNodeChange> {
    return rebaseMarkList(change, base.change, base.revision, rebaseChild);
}

export type NodeChangeRebaser<TNodeChange> = (
    change: TNodeChange,
    baseChange: TNodeChange,
) => TNodeChange;

function rebaseMarkList<TNodeChange>(
    currMarkList: MarkList<TNodeChange>,
    baseMarkList: MarkList<TNodeChange>,
    baseRevision: RevisionTag | undefined,
    rebaseChild: NodeChangeRebaser<TNodeChange>,
): MarkList<TNodeChange> {
    const factory = new MarkListFactory<TNodeChange>();
    const baseIter = new StackyIterator(baseMarkList);
    const currIter = new StackyIterator(currMarkList);

    // Each attach mark in `currMarkList` should have a lineage event added for `baseRevision` if a node adjacent to
    // the attach position was detached by `baseMarkList`.
    // At the time we process an attach we don't know whether the following node will be detached, so we record attach
    // marks which should have their lineage updated if we encounter a detach.
    const lineageRequests: LineageRequest<TNodeChange>[] = [];
    let baseDetachOffset = 0;
    while (!baseIter.done || !currIter.done) {
        let currMark: Mark<TNodeChange> | undefined = currIter.peek();
        let baseMark: Mark<TNodeChange> | undefined = baseIter.peek();

        if (baseMark === undefined) {
            assert(
                currMark !== undefined,
                "Loop condition should prevent both iterators from being empty",
            );
            if (baseDetachOffset > 0 && isAttach(currMark)) {
                currIter.pop();
                handleCurrAttach(currMark, factory, lineageRequests, baseDetachOffset);
            } else {
                break;
            }
        } else if (currMark === undefined) {
            assert(
                baseMark !== undefined,
                "Loop condition should prevent both iterators from being empty",
            );
            baseIter.pop();
            if (isDetachMark(baseMark)) {
                baseDetachOffset += getInputLength(baseMark);
            } else if (!isAttach(baseMark)) {
                break;
            }
        } else if (isAttach(currMark)) {
            if (isAttach(baseMark) && isAttachAfterBaseAttach(currMark, baseMark)) {
                baseIter.pop();
                factory.pushOffset(getOutputLength(baseMark));
            } else {
                currIter.pop();
                handleCurrAttach(currMark, factory, lineageRequests, baseDetachOffset);
            }
        } else if (isAttach(baseMark)) {
            baseIter.pop();
            factory.pushOffset(getOutputLength(baseMark));
        } else {
            // If we've reached this branch then `baseMark` and `currMark` start at the same location
            // in the document field at the revision to which both changesets apply.
            // Despite that, it's not necessarily true that they affect the same range in that document
            // field because they may be of different lengths.
            // We perform any necessary splitting in order to end up with a pair of marks that do have the same length.
            currIter.pop();
            baseIter.pop();
            const currMarkLength = getInputLength(currMark);
            const baseMarkLength = getInputLength(baseMark);
            if (currMarkLength < baseMarkLength) {
                let nextBaseMark;
                [baseMark, nextBaseMark] = splitMarkOnInput(baseMark, currMarkLength);
                baseIter.push(nextBaseMark);
            } else if (currMarkLength > baseMarkLength) {
                let nextCurrMark;
                [currMark, nextCurrMark] = splitMarkOnInput(currMark, baseMarkLength);
                currIter.push(nextCurrMark);
            }
            // Past this point, we are guaranteed that `baseMark` and `currMark` have the same length and
            // start at the same location at the revision to which both changesets apply.
            // They therefore refer to the same range for that revision.
            const rebasedMark = rebaseMark(currMark, baseMark, rebaseChild);
            factory.push(rebasedMark);

            if (isDetachMark(baseMark)) {
                baseDetachOffset += getInputLength(baseMark);
            } else {
                if (baseDetachOffset > 0 && baseRevision !== undefined) {
                    updateLineage(lineageRequests, baseRevision);
                }

                lineageRequests.length = 0;
                baseDetachOffset = 0;
            }
        }
    }

    if (baseDetachOffset > 0 && baseRevision !== undefined) {
        updateLineage(lineageRequests, baseRevision);
    }

    for (const currMark of currIter) {
        factory.push(currMark);
    }
    return factory.list;
}

function rebaseMark<TNodeChange>(
    currMark: SizedMark<TNodeChange>,
    baseMark: SizedMark<TNodeChange>,
    rebaseChild: NodeChangeRebaser<TNodeChange>,
): SizedMark<TNodeChange> {
    if (isSkipMark(baseMark)) {
        return clone(currMark);
    }
    const baseType = baseMark.type;
    switch (baseType) {
        case "Delete":
        case "MDelete":
            return 0;
        case "Modify": {
            if (isModify(currMark)) {
                return {
                    ...clone(currMark),
                    changes: rebaseChild(currMark.changes, baseMark.changes),
                };
            }
            return clone(currMark);
        }
        default:
            fail(`Unsupported mark type: ${baseType}`);
    }
}

function handleCurrAttach<T>(
    currMark: Attach<T>,
    factory: MarkListFactory<T>,
    lineageRequests: LineageRequest<T>[],
    offset: number,
) {
    const rebasedMark = clone(currMark);
    factory.pushContent(rebasedMark);
    lineageRequests.push({ mark: rebasedMark, offset });
}

function isAttachAfterBaseAttach<T>(currMark: Attach<T>, baseMark: Attach<T>): boolean {
    const lineageCmp = compareLineages(currMark.lineage, baseMark.lineage);
    if (lineageCmp < 0) {
        return false;
    } else if (lineageCmp > 0) {
        return true;
    }

    // TODO: Handle tiebreaking, including support for the following scenario
    // Staring state: a b
    // A1) Delete a b
    // A2) Insert c
    // B) Insert x between a and b
    // Instead of using B's tiebreak policy, we should first consider the relative positions of a, b, and c if A1 were undone.
    // The best outcome seems to be that c is positioned relative to ab according to A2's tiebreak policy.
    return false;
}

function compareLineages(
    lineage1: LineageEvent[] | undefined,
    lineage2: LineageEvent[] | undefined,
): number {
    if (lineage1 === undefined || lineage2 === undefined) {
        return 0;
    }

    const lineage1Offsets = new Map<RevisionTag, number>();
    for (const event of lineage1) {
        lineage1Offsets.set(event.revision, event.offset);
    }

    for (let i = lineage2.length - 1; i >= 0; i--) {
        const event2 = lineage2[i];
        const offset1 = lineage1Offsets.get(event2.revision);
        if (offset1 !== undefined) {
            const offset2 = event2.offset;
            if (offset1 < offset2) {
                return -1;
            } else if (offset1 > offset2) {
                return 1;
            }
        }
    }
    return 0;
}

interface LineageRequest<T> {
    mark: Attach<T>;
    offset: number;
}

function updateLineage<T>(requests: LineageRequest<T>[], revision: RevisionTag) {
    for (const request of requests) {
        const mark = request.mark;
        if (mark.lineage === undefined) {
            mark.lineage = [];
        }

        mark.lineage.push({ revision, offset: request.offset });
    }
}
