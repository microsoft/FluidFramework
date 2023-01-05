/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { clone, fail, getOrAddEmptyToMap, StackyIterator } from "../../util";
import { RevisionTag, TaggedChange } from "../../core";
import { IdAllocator } from "../modular-schema";
import {
    applyMoveEffectsToMark,
    getInputLength,
    getOutputLength,
    isAttach,
    isDetachMark,
    isModify,
    isMuted,
    isMutedReattach,
    isReattach,
    isNewAttach,
    isSkipMark,
    MoveEffectTable,
    newMoveEffectTable,
    removeMoveDest,
    splitMarkOnInput,
    splitMarkOnOutput,
    isAttachInGap,
    isActiveReattach,
    isObjMark,
    isSkipLikeReattach,
    isMutedDetach,
    updateMoveSrcDetacher,
    updateMoveSrcPairing,
    updateMoveDestPairing,
    PairedMarkUpdate,
    lineUpRelatedReattaches,
} from "./utils";
import {
    Attach,
    Changeset,
    LineageEvent,
    Mark,
    MarkList,
    Reattach,
    CellSpanningMark,
    Mutable,
    ReturnFrom,
    Muted,
    Detach,
    NewAttach,
} from "./format";
import { MarkListFactory } from "./markListFactory";
import { ComposeQueue } from "./compose";

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
    genId: IdAllocator,
): Changeset<TNodeChange> {
    return rebaseMarkList(change, base.change, base.revision, rebaseChild, genId);
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
    genId: IdAllocator,
): MarkList<TNodeChange> {
    const moveEffects = newMoveEffectTable<TNodeChange>();

    // Necessary so we don't have to re-split any marks when applying move effects.
    moveEffects.allowMerges = false;
    const factory = new MarkListFactory<TNodeChange>(moveEffects);

    const splitBaseMarks: MarkList<TNodeChange> = [];
    const queue = new RebaseQueue(baseRevision, baseMarkList, currMarkList, genId, moveEffects);

    // Each attach mark in `currMarkList` should have a lineage event added for `baseRevision` if a node adjacent to
    // the attach position was detached by `baseMarkList`.
    // At the time we process an attach we don't know whether the following node will be detached, so we record attach
    // marks which should have their lineage updated if we encounter a detach.
    const lineageRequests: LineageRequest<TNodeChange>[] = [];
    let baseDetachOffset = 0;
    // The offset of the next base mark in the input context of the base change.
    // This assumes the base changeset is not composite (and asserts if it is).
    let baseInputOffset = 0;
    while (!queue.isEmpty()) {
        const { baseMark, newMark: currMark } = queue.pop();
        if (isObjMark(baseMark) && baseMark.type !== "Modify" && baseMark.revision !== undefined) {
            // TODO support rebasing over composite changeset
            assert(
                baseMark.revision === baseRevision,
                "Unable to keep track of the base input offset in composite changeset",
            );
        }
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
                factory.push(clone(currMark));
            }
        } else if (currMark === undefined) {
            if (isDetachMark(baseMark)) {
                const detachLength = getInputLength(baseMark);
                baseDetachOffset += detachLength;
                baseInputOffset += detachLength;
            } else if (isAttach(baseMark)) {
                factory.pushOffset(getOutputLength(baseMark));
            }
        } else {
            assert(
                !isNewAttach(baseMark) && !isNewAttach(currMark),
                "A new attach cannot be at the same position as another mark",
            );
            assert(
                getInputLength(baseMark) === getInputLength(currMark),
                "The two marks should be the same size",
            );

            const rebasedMark = rebaseMark(
                currMark,
                baseMark,
                baseRevision,
                baseInputOffset,
                rebaseChild,
                moveEffects,
            );
            factory.push(rebasedMark);

            const detachLength = getInputLength(baseMark);
            baseInputOffset += detachLength;
            if (isDetachMark(baseMark)) {
                baseDetachOffset += detachLength;
            } else {
                if (baseDetachOffset > 0 && baseRevision !== undefined) {
                    updateLineage(lineageRequests, baseRevision);
                }

                lineageRequests.length = 0;
                baseDetachOffset = 0;
            }
        }
        if (baseMark !== undefined) {
            splitBaseMarks.push(baseMark);
        }
    }

    if (baseDetachOffset > 0 && baseRevision !== undefined) {
        updateLineage(lineageRequests, baseRevision);
    }

    moveEffects.allowMerges = true;
    return applyMoveEffects(splitBaseMarks, factory.list, moveEffects);
}

class RebaseQueue<T> {
    private reattachOffset: number = 0;
    private readonly baseMarks: StackyIterator<Mark<T>>;
    private readonly newMarks: StackyIterator<Mark<T>>;

    public constructor(
        private readonly baseRevision: RevisionTag | undefined,
        baseMarks: Changeset<T>,
        newMarks: Changeset<T>,
        private readonly genId: IdAllocator,
        readonly moveEffects: MoveEffectTable<T>,
    ) {
        this.baseMarks = new StackyIterator(baseMarks);
        this.newMarks = new StackyIterator(newMarks);
    }

    public isEmpty(): boolean {
        return (this.getNextBaseMark() ?? this.getNextNewMark()) === undefined;
    }

    public pop(): RebaseMarks<T> {
        const baseMark = this.getNextBaseMark();
        const newMark = this.getNextNewMark();

        if (baseMark === undefined || newMark === undefined) {
            return {
                baseMark: this.baseMarks.pop(),
                newMark: this.newMarks.pop(),
            };
        } else if (isAttach(baseMark) && isAttach(newMark)) {
            if (
                isReattach(baseMark) &&
                isReattach(newMark) &&
                areRelatedReattaches(baseMark, newMark)
            ) {
                const { newMarkHead, newMarkTail, baseMarkHead, baseMarkTail } =
                    lineUpRelatedReattaches(newMark, baseMark, this.genId, this.moveEffects);
                this.newMarks.pop();
                if (newMarkTail !== undefined) {
                    this.newMarks.push(newMarkTail);
                }
                this.baseMarks.pop();
                if (baseMarkTail !== undefined) {
                    this.baseMarks.push(baseMarkTail);
                }
                return { newMark: newMarkHead, baseMark: baseMarkHead };
            }
            const revision = baseMark.revision ?? this.baseRevision;
            const reattachOffset = getOffsetInReattach(newMark.lineage, revision);
            if (reattachOffset !== undefined) {
                const offset = reattachOffset - this.reattachOffset;
                if (offset === 0) {
                    return { newMark: this.newMarks.pop() };
                } else if (offset >= getOutputLength(baseMark)) {
                    this.reattachOffset += getOutputLength(baseMark);
                    return { baseMark: this.baseMarks.pop() };
                } else {
                    const [baseMark1, baseMark2] = splitMarkOnOutput(
                        baseMark,
                        offset,
                        this.genId,
                        this.moveEffects,
                    );
                    this.baseMarks.push(baseMark2);
                    this.reattachOffset += offset;
                    return { baseMark: baseMark1 };
                }
            } else if (isAttachAfterBaseAttach(newMark, baseMark) || isMutedReattach(newMark)) {
                return { baseMark: this.baseMarks.pop() };
            } else {
                return { newMark: this.newMarks.pop() };
            }
        } else if (isAttachInGap(newMark)) {
            return { newMark: this.newMarks.pop() };
        } else if (
            isAttach(baseMark) &&
            // The `isNewAttach(baseMark)` bit is needed because of the way sandwich rebasing makes
            // the rebased local new attaches relevant to later local changes.
            (isNewAttach(baseMark) || isActiveReattach(baseMark)) &&
            isMutedDetach(newMark) &&
            // TODO: support muting/unmuting other detach mark types
            newMark.type === "ReturnFrom" &&
            isBaseAttachRelatedToMutedDetach(baseMark, newMark, this.baseRevision)
        ) {
            assert(
                newMark.detachIndex !== undefined,
                "A muted ReturnFrom should have a detachIndex",
            );
            const newMarkLength = newMark.count;
            const baseMarkLength = getOutputLength(baseMark);
            if (isNewAttach(baseMark) || newMark.detachIndex === baseMark.detachIndex) {
                this.baseMarks.pop();
                this.newMarks.pop();
                if (newMarkLength < baseMarkLength) {
                    const [baseMark1, baseMark2] = splitMarkOnOutput(
                        baseMark,
                        newMarkLength,
                        this.genId,
                        this.moveEffects,
                    );
                    this.baseMarks.push(baseMark2);
                    return { baseMark: baseMark1, newMark };
                } else if (newMarkLength > baseMarkLength) {
                    const [newMark1, newMark2] = splitMarkOnInput(
                        newMark,
                        baseMarkLength,
                        this.genId,
                        this.moveEffects,
                    );
                    this.newMarks.push(newMark2);
                    return { baseMark, newMark: newMark1 };
                } else {
                    return { baseMark, newMark };
                }
            } else if (newMark.detachIndex < baseMark.detachIndex) {
                this.newMarks.pop();
                if (newMark.detachIndex + newMarkLength <= baseMark.detachIndex) {
                    return { newMark };
                }
                const [newMark1, newMark2] = splitMarkOnInput(
                    newMark,
                    baseMark.detachIndex - newMark.detachIndex,
                    this.genId,
                    this.moveEffects,
                );
                this.newMarks.push(newMark2);
                return { newMark: newMark1 };
            } else {
                this.baseMarks.pop();
                if (baseMark.detachIndex + baseMarkLength <= newMark.detachIndex) {
                    return { baseMark };
                }
                const [baseMark1, baseMark2] = splitMarkOnOutput(
                    baseMark,
                    newMark.detachIndex - baseMark.detachIndex,
                    this.genId,
                    this.moveEffects,
                );
                this.baseMarks.push(baseMark2);
                return { baseMark: baseMark1 };
            }
        }

        // TODO: Handle case where `baseMarks` has adjacent or nested inverse reattaches from multiple revisions
        this.reattachOffset = 0;
        if (isAttachInGap(baseMark)) {
            return { baseMark: this.baseMarks.pop() };
        } else {
            this.reattachOffset = 0;
            this.baseMarks.pop();
            this.newMarks.pop();
            const newMarkLength = getInputLength(newMark);
            const baseMarkLength = getInputLength(baseMark);
            if (newMarkLength < baseMarkLength) {
                const [baseMark1, baseMark2] = splitMarkOnInput(
                    baseMark,
                    newMarkLength,
                    this.genId,
                    this.moveEffects,
                );
                this.baseMarks.push(baseMark2);
                return { baseMark: baseMark1, newMark };
            } else if (newMarkLength > baseMarkLength) {
                const [newMark1, newMark2] = splitMarkOnInput(
                    newMark,
                    baseMarkLength,
                    this.genId,
                    this.moveEffects,
                );
                this.newMarks.push(newMark2);
                this.moveEffects.validatedMarks.add(newMark1);
                this.moveEffects.validatedMarks.add(newMark2);
                return { baseMark, newMark: newMark1 };
            } else {
                return { baseMark, newMark };
            }
        }
    }

    private getNextBaseMark(): Mark<T> | undefined {
        return this.getNextMark(this.baseMarks, false);
    }

    private getNextNewMark(): Mark<T> | undefined {
        return this.getNextMark(this.newMarks, true);
    }

    private getNextMark(
        marks: StackyIterator<Mark<T>>,
        reassignMoveIds: boolean,
    ): Mark<T> | undefined {
        let mark: Mark<T> | undefined;
        while (mark === undefined) {
            mark = marks.pop();
            if (mark === undefined) {
                return undefined;
            }

            const splitMarks = applyMoveEffectsToMark(
                mark,
                undefined,
                this.moveEffects,
                this.genId,
                reassignMoveIds,
                false,
            );

            mark = splitMarks[0];
            for (let i = splitMarks.length - 1; i >= 0; i--) {
                marks.push(splitMarks[i]);
                this.moveEffects.validatedMarks.add(splitMarks[i]);
            }
        }

        return mark;
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
    currMark: CellSpanningMark<TNodeChange>,
    baseMark: CellSpanningMark<TNodeChange>,
    baseRevision: RevisionTag | undefined,
    baseInputOffset: number,
    rebaseChild: NodeChangeRebaser<TNodeChange>,
    moveEffects: MoveEffectTable<TNodeChange>,
): CellSpanningMark<TNodeChange> {
    if (isSkipMark(baseMark) || isSkipLikeReattach(baseMark)) {
        return clone(currMark);
    }
    const baseType = baseMark.type;
    switch (baseType) {
        case "Delete": {
            const baseMarkRevision = baseMark.revision ?? baseRevision;
            if (isReattach(currMark)) {
                // TODO: add `addedBy: RevisionTag` to inverses of attaches so we can detect when
                // baseMark.addedBy === currMark.mutedBy, which indicates the deletion is the undo of the reattach that
                // muted currMark. When that's the case, the mark should be unmuted.
                // See skipped test: Revive ↷ [Revive, undo(Revive)] => Revive
                if (currMark.isIntention || currMark.mutedBy === baseMarkRevision) {
                    const reattach = {
                        ...(clone(currMark) as Reattach<TNodeChange>),
                        // Update the characterization of the deleted content
                        detachedBy: baseMarkRevision,
                        detachIndex: baseInputOffset,
                    };
                    delete reattach.mutedBy;
                    return reattach;
                }
                // The reattach mark remains muted because the deletion was performed by a different change.
                // The only way to unmute the reattach now is for the nodes to be revived and for the original
                // deletion (currMark.detachedBy) to be re-applied.
                return {
                    ...clone(currMark),
                    lastDetachedBy: baseMarkRevision,
                    detachIndex: baseInputOffset,
                };
            }
            if (
                isObjMark(currMark) &&
                (currMark.type === "MoveOut" || currMark.type === "ReturnFrom")
            ) {
                removeMoveDest(moveEffects, currMark.id);
            }
            return 0;
        }
        case "Revive":
        case "ReturnTo": {
            const baseMarkRevision = baseMark.revision ?? baseRevision;
            assert(
                isDetachMark(currMark) || isReattach(currMark),
                "Only a detach or a reattach can overlap with a non-inert reattach",
            );
            if (isDetachMark(currMark)) {
                assert(
                    currMark.type === "ReturnFrom",
                    "TODO: support mute/unmute for other detach marks",
                );
                assert(
                    isMuted(currMark) && currMark.mutedBy === baseMarkRevision,
                    "Invalid reattach mark overlap",
                );
                // The nodes that currMark aims to detach are being reattached by baseMark
                const newCurrMark = clone(currMark) as ReturnFrom<TNodeChange>;
                delete newCurrMark.mutedBy;
                delete newCurrMark.detachIndex;
                updateMoveDestPairing(moveEffects, newCurrMark.id, PairedMarkUpdate.Reactivated);
                return newCurrMark;
            }
            if (currMark.isIntention) {
                assert(isActiveReattach(currMark), `Invalid reattach mark overlap`);
                // The nodes that currMark aims to reattach are being reattached by baseMark
                return {
                    ...clone(currMark),
                    mutedBy: baseMarkRevision,
                };
            }

            if (isActiveReattach(currMark)) {
                // The nodes that currMark aims to reattach are being reattached by baseMark
                if (currMark.type === "ReturnTo") {
                    updateMoveSrcPairing(moveEffects, currMark.id, PairedMarkUpdate.Deactivated);
                }
                return {
                    ...clone(currMark),
                    mutedBy: baseMarkRevision,
                };
            }
            assert(!isSkipLikeReattach(currMark), `Unsupported reattach mark overlap`);
            // The nodes that currMark aims to reattach and were detached by `currMark.lastDetachedBy`
            // are being reattached by baseMark.
            assert(currMark.lastDetachedBy === baseMark.detachedBy, `Invalid revive mark overlap`);
            const revive = clone(currMark);
            delete revive.lastDetachedBy;
            return revive;
        }
        case "Modify": {
            if (isModify(currMark)) {
                return {
                    ...clone(currMark),
                    changes: rebaseChild(currMark.changes, baseMark.changes),
                };
            }
            return clone(currMark);
        }
        case "MoveOut":
        case "ReturnFrom": {
            if (!isSkipMark(currMark)) {
                const baseMarkRevision = baseMark.revision ?? baseRevision;
                const newCurrMark = clone(currMark);
                if (newCurrMark.type === "ReturnFrom") {
                    // The nodes that currMark aims to detach are being detached by baseMark
                    newCurrMark.mutedBy = baseMarkRevision;
                    newCurrMark.detachIndex = baseInputOffset;
                    updateMoveDestPairing(
                        moveEffects,
                        newCurrMark.id,
                        PairedMarkUpdate.Deactivated,
                    );
                    return newCurrMark;
                } else if (newCurrMark.type === "ReturnTo") {
                    assert(
                        isSkipLikeReattach(newCurrMark),
                        "Only a skip-like reattach can overlap with a ReturnFrom",
                    );
                    if (
                        newCurrMark.mutedBy === baseMarkRevision ||
                        (baseMark.type === "ReturnFrom" &&
                            newCurrMark.mutedBy === baseMark.detachedBy)
                    ) {
                        // The already populated cells that currMark aimed to reattach content into
                        // are having their contents detached by baseMark.
                        // This makes it possible for currMark to be active again.
                        newCurrMark.detachedBy = baseMarkRevision;
                        newCurrMark.detachIndex = baseInputOffset;
                        delete (newCurrMark as Mutable).mutedBy;
                        updateMoveSrcDetacher(moveEffects, newCurrMark.id, baseMarkRevision);
                        updateMoveSrcPairing(
                            moveEffects,
                            newCurrMark.id,
                            PairedMarkUpdate.Reactivated,
                        );
                    }
                    return newCurrMark;
                } else if (newCurrMark.type === "Revive" && !newCurrMark.isIntention) {
                    assert(
                        isSkipLikeReattach(newCurrMark),
                        "Only a skip-like reattach can overlap with a ReturnFrom",
                    );
                    // The already populated cells that currMark aimed to revive content into
                    // are having their contents detached by baseMark.
                    // The revive mark remains muted because the detach was performed by a different change than the
                    // change the revive aims to revert.
                    // The only way to unmute the reattach now is for the nodes to be returned and for the original
                    // deletion (currMark.detachedBy) to be re-applied.
                    // Update the characterization of the deleted content
                    newCurrMark.lastDetachedBy = baseMarkRevision;
                    newCurrMark.detachIndex = baseInputOffset;
                    return newCurrMark;
                } else {
                    getOrAddEmptyToMap(moveEffects.movedMarks, baseMark.id).push(newCurrMark);
                }
            }
            return 0;
        }
        default:
            fail(`Unsupported mark type: ${baseType}`);
    }
}

function applyMoveEffects<TNodeChange>(
    baseMarks: MarkList<TNodeChange>,
    rebasedMarks: MarkList<TNodeChange>,
    moveEffects: MoveEffectTable<TNodeChange>,
): Changeset<TNodeChange> {
    const queue = new ComposeQueue<TNodeChange>(
        baseMarks,
        undefined,
        rebasedMarks,
        () => fail("Should not split moves while applying move effects"),
        moveEffects,
        false,
        true,
    );
    const factory = new MarkListFactory<TNodeChange>(moveEffects);

    let offset = 0;
    while (!queue.isEmpty()) {
        const { baseMark, newMark } = queue.pop();
        if (isObjMark(baseMark) && (baseMark.type === "MoveIn" || baseMark.type === "ReturnTo")) {
            const movedMarks = moveEffects.movedMarks.get(baseMark.id);
            if (movedMarks !== undefined) {
                factory.pushOffset(offset);
                offset = 0;
                factory.push(...movedMarks);
                const size = movedMarks.reduce<number>(
                    (count, mark) => count + getInputLength(mark),
                    0,
                );
                factory.pushOffset(-size);
            }
        }
        if (newMark === undefined) {
            assert(baseMark !== undefined, "Non-empty RebaseQueue should return at least one mark");
            offset += getOutputLength(baseMark);
            continue;
        }

        // TODO: Offset wouldn't be needed if queue returned skip instead of undefined in cases where it should return two marks
        offset = 0;
        factory.push(newMark);
    }

    // We may have discovered new mergeable marks while applying move effects, as we may have moved a MoveOut next to another MoveOut.
    // A second pass through MarkListFactory will handle any remaining merges.
    const factory2 = new MarkListFactory<TNodeChange>(moveEffects);
    for (const mark of factory.list) {
        factory2.push(mark);
    }
    return factory2.list;
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

/**
 * @returns true iff both reattaches target cells that were affected by the same detach.
 * The target cells may or may not overlap depending on detach index information.
 *
 * Only valid in the context of a rebase (i.e., both marks have the same input context).
 */
function areRelatedReattaches<T>(baseMark: Reattach<T>, newMark: Reattach<T>): boolean {
    return (
        baseMark.detachedBy !== undefined &&
        (baseMark.detachedBy === newMark.detachedBy ||
            baseMark.detachedBy === newMark.lastDetachedBy)
    );
}

/**
 * @returns true iff `baseMark` attaches nodes in cells whose contents were detached by the same change
 * that detached muted `newMark`.
 * The target cells may or may not overlap depending on detach index information.
 */
function isBaseAttachRelatedToMutedDetach<T>(
    baseMark: NewAttach<T> | Reattach<T>,
    newMark: Detach<T> & Muted,
    baseRevision: RevisionTag | undefined,
): boolean {
    return (
        (isActiveReattach(baseMark) && baseMark.detachedBy === newMark.mutedBy) ||
        (baseMark.revision ?? baseRevision) === newMark.mutedBy
    );
}
