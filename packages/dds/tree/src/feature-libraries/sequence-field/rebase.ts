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
    splitMarkOnOutput,
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
    const queue = new RebaseQueue(baseRevision, baseMarkList, currMarkList);

    // Each attach mark in `currMarkList` should have a lineage event added for `baseRevision` if a node adjacent to
    // the attach position was detached by `baseMarkList`.
    // At the time we process an attach we don't know whether the following node will be detached, so we record attach
    // marks which should have their lineage updated if we encounter a detach.
    const lineageRequests: LineageRequest<TNodeChange>[] = [];
    let baseDetachOffset = 0;
    while (!queue.isEmpty()) {
        const { baseMark, newMark: currMark } = queue.pop();
        if (baseMark === undefined) {
            assert(currMark !== undefined, "Non-empty queue should return at least one mark");
            if (isAttach(currMark)) {
                handleCurrAttach(
                    currMark,
                    factory,
                    lineageRequests,
                    baseDetachOffset,
                    baseRevision,
                );
            } else {
                factory.push(currMark);
            }
        } else if (currMark === undefined) {
            if (isDetachMark(baseMark)) {
                baseDetachOffset += getInputLength(baseMark);
            } else if (isAttach(baseMark)) {
                factory.pushOffset(getOutputLength(baseMark));
            }
        } else {
            assert(
                !isAttach(baseMark) && !isAttach(currMark),
                "An attach cannot be at the same position as another mark",
            );
            assert(
                getInputLength(baseMark) === getInputLength(currMark),
                "The two marks should be the same size",
            );

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

    return factory.list;
}

class RebaseQueue<T> {
    private reattachOffset: number = 0;
    private readonly baseMarks: StackyIterator<Mark<T>>;
    private readonly newMarks: StackyIterator<Mark<T>>;

    public constructor(
        private readonly baseRevision: RevisionTag | undefined,
        baseMarks: Changeset<T>,
        newMarks: Changeset<T>,
    ) {
        this.baseMarks = new StackyIterator(baseMarks);
        this.newMarks = new StackyIterator(newMarks);
    }

    public isEmpty(): boolean {
        return this.baseMarks.done && this.newMarks.done;
    }

    public pop(): RebaseMarks<T> {
        const baseMark = this.baseMarks.peek();
        const newMark = this.newMarks.peek();

        if (baseMark === undefined || newMark === undefined) {
            return {
                baseMark: this.baseMarks.pop(),
                newMark: this.newMarks.pop(),
            };
        } else if (isAttach(baseMark) && isAttach(newMark)) {
            const revision = baseMark.revision ?? this.baseRevision;
            const reattachOffset = getOffsetInReattach(newMark.lineage, revision);
            if (reattachOffset !== undefined) {
                const offset = reattachOffset - this.reattachOffset;
                this.reattachOffset = reattachOffset;
                if (offset === 0) {
                    return { newMark: this.newMarks.pop() };
                } else if (offset >= getOutputLength(baseMark)) {
                    return { baseMark: this.baseMarks.pop() };
                } else {
                    const [baseMark1, baseMark2] = splitMarkOnOutput(baseMark, offset);
                    this.baseMarks.push(baseMark2);
                    return { baseMark: baseMark1 };
                }
            } else if (isAttachAfterBaseAttach(newMark, baseMark)) {
                return { baseMark: this.baseMarks.pop() };
            } else {
                return { newMark: this.newMarks.pop() };
            }
        } else if (isAttach(newMark)) {
            return { newMark: this.newMarks.pop() };
        }

        // TODO: Handle case where `baseMarks` has adjacent or nested inverse reattaches from multiple revisions
        this.reattachOffset = 0;
        if (isAttach(baseMark)) {
            return { baseMark: this.baseMarks.pop() };
        } else {
            this.reattachOffset = 0;
            this.baseMarks.pop();
            this.newMarks.pop();
            const newMarkLength = getInputLength(newMark);
            const baseMarkLength = getInputLength(baseMark);
            if (newMarkLength < baseMarkLength) {
                const [baseMark1, baseMark2] = splitMarkOnInput(baseMark, newMarkLength);
                this.baseMarks.push(baseMark2);
                return { baseMark: baseMark1, newMark };
            } else if (newMarkLength > baseMarkLength) {
                const [newMark1, newMark2] = splitMarkOnInput(newMark, baseMarkLength);
                this.newMarks.push(newMark2);
                return { baseMark, newMark: newMark1 };
            } else {
                return { baseMark, newMark };
            }
        }
    }
}

/**
 * Represents the marks rebasing should process next.
 * If `baseMark` and `newMark` are both defined, then they are `SizedMark`s covering the same range of nodes.
 */
interface RebaseMarks<T> {
    baseMark?: Mark<T>;
    newMark?: Mark<T>;
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
    baseRevision: RevisionTag | undefined,
) {
    const rebasedMark = clone(currMark);

    // If the changeset we are rebasing over has the same revision as an event in rebasedMark's lineage,
    // we assume that the base changeset is the inverse of the changeset in the lineage, so we remove the lineage event.
    // TODO: Handle cases where the base changeset is a composition of multiple revisions.
    // TODO: Don't remove the lineage event in cases where the event isn't actually inverted by the base changeset,
    // e.g., if the inverse of the lineage event is muted after rebasing.
    if (baseRevision !== undefined) {
        tryRemoveLineageEvent(rebasedMark, baseRevision);
    }
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

function getOffsetInReattach(
    lineage: LineageEvent[] | undefined,
    reattachRevision: RevisionTag | undefined,
): number | undefined {
    if (lineage === undefined || reattachRevision === undefined) {
        return undefined;
    }

    for (const event of lineage) {
        if (event.revision === reattachRevision) {
            return event.offset;
        }
    }

    return undefined;
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

function tryRemoveLineageEvent<T>(mark: Attach<T>, revisionToRemove: RevisionTag) {
    if (mark.lineage === undefined) {
        return;
    }
    const index = mark.lineage.findIndex((event) => event.revision === revisionToRemove);
    if (index >= 0) {
        mark.lineage.splice(index, 1);
        if (mark.lineage.length === 0) {
            delete mark.lineage;
        }
    }
}
