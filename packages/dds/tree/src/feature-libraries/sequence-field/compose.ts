/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { makeAnonChange, RevisionTag, tagChange, TaggedChange } from "../../core";
import { clone, fail, StackyIterator } from "../../util";
import { IdAllocator } from "../modular-schema";
import {
    Changeset,
    HasChanges,
    HasRevisionTag,
    Mark,
    MarkList,
    InputSpanningMark,
    ObjectMark,
} from "./format";
import { MarkListFactory } from "./markListFactory";
import {
    replaceMoveSrc,
    getInputLength,
    getOutputLength,
    isActiveReattach,
    isAttach,
    isDetachMark,
    isSkipMark,
    MoveEffectTable,
    replaceMoveDest,
    splitMarkOnInput,
    splitMarkOnOutput,
    newMoveEffectTable,
    changeSrcMoveId,
    removeMoveDest,
    removeMoveSrc,
    isMoveMark,
    getUniqueMoveId,
    applyMoveEffectsToMark,
    modifyMoveSrc,
    isMutedDetach,
    isReattach,
} from "./utils";

export type NodeChangeComposer<TNodeChange> = (changes: TaggedChange<TNodeChange>[]) => TNodeChange;

/**
 * Composes a sequence of changesets into a single changeset.
 * @param changes - The changesets to be applied.
 * Parts of the input may be reused in the output, but the input is not mutated.
 * Each changeset in the list is assumed to be applicable after the previous one.
 * @returns A changeset that is equivalent to applying each of the given `changes` in order.
 *
 * WARNING! This implementation is incomplete:
 * - Tombstone information is ignored.
 * - Support for moves is not implemented.
 * - Support for slices is not implemented.
 */
export function compose<TNodeChange>(
    changes: TaggedChange<Changeset<TNodeChange>>[],
    composeChild: NodeChangeComposer<TNodeChange>,
    genId: IdAllocator,
): Changeset<TNodeChange> {
    let composed: Changeset<TNodeChange> = [];
    for (const change of changes) {
        const moveEffects: MoveEffectTable<TNodeChange> = newMoveEffectTable();

        composed = composeMarkLists(
            composed,
            change.revision,
            change.change,
            composeChild,
            genId,
            moveEffects,
        );
    }
    return composed;
}

function composeMarkLists<TNodeChange>(
    baseMarkList: MarkList<TNodeChange>,
    newRev: RevisionTag | undefined,
    newMarkList: MarkList<TNodeChange>,
    composeChild: NodeChangeComposer<TNodeChange>,
    genId: IdAllocator,
    moveEffects: MoveEffectTable<TNodeChange>,
): MarkList<TNodeChange> {
    const factory = new MarkListFactory<TNodeChange>(moveEffects);
    const queue = new ComposeQueue(
        baseMarkList,
        newRev,
        newMarkList,
        genId,
        moveEffects,
        true,
        true,
        (a, b) => composeChildChanges(a, b, newRev, composeChild),
    );
    while (!queue.isEmpty()) {
        const { baseMark, newMark, areInverses } = queue.pop();
        if (areInverses) {
            continue;
        }
        if (newMark === undefined) {
            assert(baseMark !== undefined, "Non-empty queue should not return two undefined marks");
            factory.push(baseMark);
        } else if (baseMark === undefined) {
            factory.push(composeMark(newMark, newRev, composeChild, genId, moveEffects));
        } else {
            // Past this point, we are guaranteed that `newMark` and `baseMark` have the same length and
            // start at the same location in the revision after the base changes.
            // They therefore refer to the same range for that revision.
            assert(
                !isAttach(newMark),
                "A new attach cannot be at the same position as a base mark",
            );
            const composedMark = composeMarks(
                baseMark,
                newRev,
                newMark,
                composeChild,
                genId,
                moveEffects,
            );
            factory.push(composedMark);
        }
    }

    return applyMoveEffects(factory.list, composeChild, moveEffects);
}

/**
 * Composes two marks where `newMark` is based on the state produced by `baseMark`.
 * @param baseMark - The mark to compose with `newMark`.
 * Its output range should be the same as `newMark`'s input range.
 * @param newRev - The revision the new mark is part of.
 * @param newMark - The mark to compose with `baseMark`.
 * Its input range should be the same as `baseMark`'s output range.
 * @returns A mark that is equivalent to applying both `baseMark` and `newMark` successively.
 */
function composeMarks<TNodeChange>(
    baseMark: Mark<TNodeChange>,
    newRev: RevisionTag | undefined,
    newMark: InputSpanningMark<TNodeChange>,
    composeChild: NodeChangeComposer<TNodeChange>,
    genId: IdAllocator,
    moveEffects: MoveEffectTable<TNodeChange>,
): Mark<TNodeChange> {
    if (isSkipMark(baseMark)) {
        return composeMark(newMark, newRev, composeChild, genId, moveEffects);
    }
    if (isSkipMark(newMark)) {
        return baseMark;
    }

    const baseType = baseMark.type;
    const newType = newMark.type;
    if (
        (newType === "Delete" && newMark.changes !== undefined) ||
        (baseType === "Delete" && baseMark.changes !== undefined)
    ) {
        // This should not occur yet because we discard all modifications to deleted subtrees
        // In the long run we want to preserve them.
        fail("TODO: support modifications to deleted subtree");
    }
    switch (baseType) {
        case "Insert":
        case "Revive":
            switch (newType) {
                case "Modify": {
                    return mergeInNewChildChanges(baseMark, newMark.changes, newRev, composeChild);
                }
                case "Delete": {
                    // The insertion made by the base change is subsequently deleted.
                    // TODO: preserve the insertions as muted
                    return 0;
                }
                case "MoveOut":
                case "ReturnFrom":
                    // The insert has been moved by `newMark`.
                    // We can represent net effect of the two marks as an insert at the move destination.
                    replaceMoveDest(
                        moveEffects,
                        getUniqueMoveId(newMark, newRev, genId, moveEffects),
                        mergeInNewChildChanges(
                            baseMark,
                            newMark.changes,
                            newMark.revision ?? newRev,
                            composeChild,
                        ),
                    );
                    return 0;
                default:
                    fail(`Not implemented: ${newType}`);
            }
        case "Modify": {
            switch (newType) {
                case "Modify": {
                    return mergeInNewChildChanges(baseMark, newMark.changes, newRev, composeChild);
                }
                case "Delete": {
                    // For now the deletion obliterates all other modifications.
                    // In the long run we want to preserve them.
                    return clone(composeMark(newMark, newRev, composeChild, genId, moveEffects));
                }
                case "MoveOut":
                case "ReturnFrom": {
                    return composeWithBaseChildChanges(
                        newMark,
                        newRev,
                        baseMark.changes,
                        composeChild,
                        genId,
                        moveEffects,
                    );
                }
                default:
                    fail(`Not implemented: ${newType}`);
            }
        }
        case "MoveIn": {
            switch (newType) {
                case "Delete": {
                    replaceMoveSrc(
                        moveEffects,
                        baseMark.id,
                        composeMark(newMark, newRev, composeChild, genId, moveEffects),
                    );
                    return 0;
                }
                case "MoveOut": {
                    changeSrcMoveId(
                        moveEffects,
                        baseMark.id,
                        getUniqueMoveId(newMark, newRev, genId, moveEffects),
                    );
                    return 0;
                }
                case "ReturnFrom": {
                    if (newMark.detachedBy === baseMark.revision) {
                        removeMoveSrc(moveEffects, baseMark.id);
                        removeMoveDest(
                            moveEffects,
                            getUniqueMoveId(newMark, newRev, genId, moveEffects),
                        );
                        return 0;
                    } else {
                        changeSrcMoveId(
                            moveEffects,
                            baseMark.id,
                            getUniqueMoveId(newMark, newRev, genId, moveEffects),
                        );
                        return 0;
                    }
                }
                default:
                    fail(`Not implemented: ${newType}`);
            }
        }
        case "ReturnTo": {
            switch (newType) {
                case "Modify": {
                    modifyMoveSrc(moveEffects, baseMark.id, newMark.changes);
                    return baseMark;
                }
                case "Delete": {
                    replaceMoveSrc(
                        moveEffects,
                        baseMark.id,
                        composeMark(newMark, newRev, composeChild, genId, moveEffects),
                    );
                    return 0;
                }
                case "MoveOut": {
                    if (baseMark.detachedBy === (newMark.revision ?? newRev)) {
                        removeMoveSrc(moveEffects, baseMark.id);
                        removeMoveDest(
                            moveEffects,
                            getUniqueMoveId(newMark, newRev, genId, moveEffects),
                        );
                        return 0;
                    } else {
                        changeSrcMoveId(
                            moveEffects,
                            baseMark.id,
                            getUniqueMoveId(newMark, newRev, genId, moveEffects),
                        );
                        return 0;
                    }
                }
                case "ReturnFrom": {
                    if (
                        baseMark.detachedBy === (newMark.revision ?? newRev) ||
                        newMark.detachedBy === baseMark.revision
                    ) {
                        removeMoveSrc(moveEffects, baseMark.id);
                        removeMoveDest(
                            moveEffects,
                            getUniqueMoveId(newMark, newRev, genId, moveEffects),
                        );
                        return 0;
                    } else {
                        if (newMark.changes !== undefined) {
                            modifyMoveSrc(moveEffects, baseMark.id, newMark.changes);
                        }
                        changeSrcMoveId(
                            moveEffects,
                            baseMark.id,
                            getUniqueMoveId(newMark, newRev, genId, moveEffects),
                        );
                        return 0;
                    }
                }
                default:
                    fail(`Not implemented: ${newType}`);
            }
        }
        default:
            fail(`Composing ${baseType} and ${newType} is not implemented`);
    }
}

function composeChildChanges<TNodeChange>(
    baseChange: TNodeChange | undefined,
    newChange: TNodeChange | undefined,
    newRevision: RevisionTag | undefined,
    composeChild: NodeChangeComposer<TNodeChange>,
): TNodeChange | undefined {
    if (newChange === undefined) {
        return baseChange;
    } else if (baseChange === undefined) {
        return composeChild([tagChange(newChange, newRevision)]);
    } else {
        return composeChild([makeAnonChange(baseChange), tagChange(newChange, newRevision)]);
    }
}

function composeWithBaseChildChanges<
    TNodeChange,
    TMark extends InputSpanningMark<TNodeChange> &
        ObjectMark<TNodeChange> &
        HasChanges<TNodeChange> &
        HasRevisionTag,
>(
    newMark: TMark,
    newRevision: RevisionTag | undefined,
    baseChanges: TNodeChange | undefined,
    composeChild: NodeChangeComposer<TNodeChange>,
    genId: IdAllocator,
    moveEffects: MoveEffectTable<TNodeChange>,
): TMark {
    const composedChanges = composeChildChanges(
        baseChanges,
        newMark.changes,
        newMark.revision ?? newRevision,
        composeChild,
    );

    const cloned = clone(newMark);
    if (newRevision !== undefined && cloned.type !== "Modify") {
        cloned.revision = newRevision;
    }

    if (moveEffects.validatedMarks.has(newMark)) {
        moveEffects.validatedMarks.add(cloned);
    }

    if (isMoveMark(cloned)) {
        cloned.id = getUniqueMoveId(cloned, newRevision, genId, moveEffects);
    }

    if (composedChanges !== undefined) {
        cloned.changes = composedChanges;
    } else {
        delete cloned.changes;
    }

    return cloned;
}

function mergeInNewChildChanges<TNodeChange, TMark extends HasChanges<TNodeChange>>(
    baseMark: TMark,
    newChanges: TNodeChange | undefined,
    newRevision: RevisionTag | undefined,
    composeChild: NodeChangeComposer<TNodeChange>,
): TMark {
    const composedChanges = composeChildChanges(
        baseMark.changes,
        newChanges,
        newRevision,
        composeChild,
    );
    if (composedChanges !== undefined) {
        baseMark.changes = composedChanges;
    } else {
        delete baseMark.changes;
    }
    return baseMark;
}

function composeMark<TNodeChange, TMark extends Mark<TNodeChange>>(
    mark: TMark,
    revision: RevisionTag | undefined,
    composeChild: NodeChangeComposer<TNodeChange>,
    genId: IdAllocator,
    moveEffects: MoveEffectTable<TNodeChange>,
): TMark {
    if (isSkipMark(mark)) {
        return mark;
    }

    const cloned = clone(mark);
    if (moveEffects.validatedMarks.has(mark)) {
        moveEffects.validatedMarks.add(cloned);
    }

    assert(!isSkipMark(cloned), "Cloned should be same type as input mark");
    if (revision !== undefined && cloned.type !== "Modify" && cloned.revision === undefined) {
        cloned.revision = revision;
    }

    if (isMoveMark(cloned)) {
        cloned.id = getUniqueMoveId(cloned, revision, genId, moveEffects);
    }

    if (cloned.type !== "MoveIn" && cloned.type !== "ReturnTo" && cloned.changes !== undefined) {
        cloned.changes = composeChild([tagChange(cloned.changes, revision)]);
        return cloned;
    }

    return cloned;
}

function applyMoveEffects<TNodeChange>(
    marks: MarkList<TNodeChange>,
    composeChild: NodeChangeComposer<TNodeChange>,
    moveEffects: MoveEffectTable<TNodeChange>,
): MarkList<TNodeChange> {
    const factory = new MarkListFactory<TNodeChange>(moveEffects);
    for (const mark of marks) {
        const splitMarks = applyMoveEffectsToMark(
            mark,
            undefined,
            moveEffects,
            () => fail("Should not generate IDs"),
            false,
            false,
            // TODO: Should pass in revision for new changes
            (a, b) => composeChildChanges(a, b, undefined, composeChild),
        );

        for (const splitMark of splitMarks) {
            factory.push(splitMark);
        }
    }

    return factory.list;
}

export class ComposeQueue<T> {
    private readonly baseMarks: StackyIterator<Mark<T>>;
    private readonly newMarks: StackyIterator<Mark<T>>;

    public constructor(
        baseMarks: Changeset<T>,
        private readonly newRevision: RevisionTag | undefined,
        newMarks: Changeset<T>,
        private readonly genId: IdAllocator,
        private readonly moveEffects: MoveEffectTable<T>,
        private readonly reassignNewMoveIds: boolean = true,
        private readonly updatePairedMarkStatus: boolean = true,
        private readonly composeChanges?: (a: T | undefined, b: T | undefined) => T | undefined,
    ) {
        this.baseMarks = new StackyIterator(baseMarks);
        this.newMarks = new StackyIterator(newMarks);
    }

    public isEmpty(): boolean {
        return (this.getNextBaseMark() ?? this.getNextNewMark()) === undefined;
    }

    public pop(): ComposeMarks<T> {
        let baseMark = this.getNextBaseMark();
        let newMark = this.getNextNewMark();
        if (baseMark === undefined || newMark === undefined) {
            return { baseMark: this.baseMarks.pop(), newMark: this.newMarks.pop() };
        } else if (isAttach(newMark)) {
            if (isActiveReattach(newMark) && isDetachMark(baseMark)) {
                const newRev = newMark.revision ?? this.newRevision;
                const areInverses =
                    // The same RevisionTag implies the two changesets are inverses in a rebase sandwich
                    (newRev !== undefined && baseMark.revision === newRev) ||
                    // The new mark is an undo of the base one
                    newMark.detachedBy === baseMark.revision;
                if (areInverses) {
                    this.baseMarks.pop();
                    this.newMarks.pop();
                    const baseMarkLength = getInputLength(baseMark);
                    const newMarkLength = getOutputLength(newMark);
                    if (baseMarkLength === newMarkLength) {
                        // The two marks fully cancel out
                    } else if (baseMarkLength > newMarkLength) {
                        // Only a portion of the base mark is cancelled out
                        let nextBaseMark;
                        [baseMark, nextBaseMark] = splitMarkOnInput(
                            baseMark,
                            newMarkLength,
                            this.genId,
                            this.moveEffects,
                        );
                        this.baseMarks.push(nextBaseMark);
                    } else {
                        // Only a portion of the new mark is cancelled out
                        let nextNewMark;
                        [newMark, nextNewMark] = splitMarkOnOutput(
                            newMark,
                            baseMarkLength,
                            this.genId,
                            this.moveEffects,
                        );
                        this.newMarks.push(nextNewMark);
                    }
                    return {
                        baseMark,
                        newMark,
                        areInverses,
                    };
                }
            }
            if (
                isReattach(newMark) &&
                isReattach(baseMark) &&
                (baseMark.mutedBy ?? newMark.mutedBy) !== undefined &&
                newMark.detachedBy === baseMark.detachedBy
            ) {
                const newMarkLength = newMark.count;
                const baseMarkLength = baseMark.count;
                if (newMark.detachIndex === baseMark.detachIndex) {
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
                        const [newMark1, newMark2] = splitMarkOnOutput(
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
                    const [newMark1, newMark2] = splitMarkOnOutput(
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
            return { newMark: this.newMarks.pop() };
        } else if (isDetachMark(baseMark)) {
            return { baseMark: this.baseMarks.pop() };
        } else if (isMutedDetach(newMark)) {
            return { newMark: this.newMarks.pop() };
        } else {
            // If we've reached this branch then `baseMark` and `newMark` start at the same location
            // in the document field at the revision after the base changes and before the new changes.
            // Despite that, it's not necessarily true that they affect the same range in that document
            // field because they may be of different lengths.
            // We perform any necessary splitting in order to end up with a pair of marks that do have the same length.
            this.newMarks.pop();
            this.baseMarks.pop();
            const newMarkLength = getInputLength(newMark);
            const baseMarkLength = getOutputLength(baseMark);
            if (newMarkLength < baseMarkLength) {
                let nextBaseMark;
                [baseMark, nextBaseMark] = splitMarkOnOutput(
                    baseMark,
                    newMarkLength,
                    this.genId,
                    this.moveEffects,
                );
                this.baseMarks.push(nextBaseMark);
            } else if (newMarkLength > baseMarkLength) {
                let nextNewMark;
                [newMark, nextNewMark] = splitMarkOnInput(
                    newMark,
                    baseMarkLength,
                    this.genId,
                    this.moveEffects,
                );
                this.newMarks.push(nextNewMark);
                this.moveEffects.validatedMarks.add(newMark);
                this.moveEffects.validatedMarks.add(nextNewMark);
            }
            // Past this point, we are guaranteed that `newMark` and `baseMark` have the same length and
            // start at the same location in the revision after the base changes.
            // They therefore refer to the same range for that revision.
            return { baseMark, newMark };
        }
    }

    private getNextBaseMark(): Mark<T> | undefined {
        return this.getNextMark(this.baseMarks, false, false, undefined);
    }

    private getNextNewMark(): Mark<T> | undefined {
        return this.getNextMark(
            this.newMarks,
            this.reassignNewMoveIds,
            this.updatePairedMarkStatus,
            this.newRevision,
        );
    }

    private getNextMark(
        marks: StackyIterator<Mark<T>>,
        reassignMoveIds: boolean,
        updatePairedMarkStatus: boolean,
        revision: RevisionTag | undefined,
    ): Mark<T> | undefined {
        let mark: Mark<T> | undefined;
        while (mark === undefined) {
            mark = marks.pop();
            if (mark === undefined) {
                return undefined;
            }

            const splitMarks = applyMoveEffectsToMark(
                mark,
                revision,
                this.moveEffects,
                this.genId,
                reassignMoveIds,
                updatePairedMarkStatus,
                this.composeChanges,
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

interface ComposeMarks<T> {
    baseMark?: Mark<T>;
    newMark?: Mark<T>;
    areInverses?: boolean;
}
