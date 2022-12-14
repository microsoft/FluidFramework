/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { RevisionTag, tagChange, TaggedChange } from "../../core";
import { clone, fail, StackyIterator } from "../../util";
import { IdAllocator } from "../modular-schema";
import {
    Attach,
    Changeset,
    HasRevisionTag,
    Mark,
    MarkList,
    Modify,
    ModifyingMark,
    ModifyInsert,
    ModifyMoveIn,
    ModifyMoveOut,
    ModifyReattach,
    MoveId,
    SizedMark,
    SizedObjectMark,
} from "./format";
import { MarkListFactory } from "./markListFactory";
import {
    replaceMoveSrc,
    getInputLength,
    getOutputLength,
    isAttach,
    isDetachMark,
    isModifyingMark,
    isObjMark,
    isSkipMark,
    MoveEffectTable,
    replaceMoveDest,
    splitMarkOnInput,
    splitMarkOnOutput,
    newMoveEffectTable,
    replaceMoveId,
    changeSrcMoveId,
    isReattach,
    MoveSrcPartition,
    MoveDstPartition,
    MoveMark,
    splitMoveIn,
    splitMoveOut,
    removeMoveDest,
    removeMoveSrc,
    isMoveMark,
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
        composed = applyMoveEffects(composed, composeChild, moveEffects);
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
    const factory = new MarkListFactory<TNodeChange>();
    const queue = new ComposeQueue(baseMarkList, newRev, newMarkList, genId, moveEffects);
    while (!queue.isEmpty()) {
        const { baseMark, newMark, areInverses } = queue.pop();
        if (areInverses) {
            continue;
        }
        if (newMark === undefined) {
            assert(baseMark !== undefined, "Non-empty queue should not return two undefined marks");
            factory.push(baseMark);
        } else if (baseMark === undefined) {
            assert(newMark !== undefined, "Non-empty queue should not return two undefined marks");
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
    return factory.list;
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
    newMark: SizedMark<TNodeChange>,
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
    if (newType === "MDelete" || baseType === "MDelete") {
        // This should not occur yet because we discard all modifications to deleted subtrees
        // In the long run we want to preserve them.
        fail("TODO: support modifications to deleted subtree");
    }
    switch (baseType) {
        case "Insert":
            switch (newType) {
                case "Modify": {
                    return {
                        ...baseMark,
                        type: "MInsert",
                        content: baseMark.content[0],
                        changes: newMark.changes,
                    };
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
                        getUniqueMoveId(newMark, newMark.revision ?? newRev, genId, moveEffects),
                        clone(baseMark),
                    );
                    return 0;

                case "MMoveOut": {
                    // The insert has been moved by `newMark`.
                    // We can represent net effect of the two marks as an insert at the move destination.
                    const composedMark: ModifyInsert<TNodeChange> = {
                        ...baseMark,
                        type: "MInsert",
                        content: baseMark.content[0],
                        changes: newMark.changes,
                    };

                    replaceMoveDest(
                        moveEffects,
                        getUniqueMoveId(newMark, newMark.revision ?? newRev, genId, moveEffects),
                        composedMark,
                    );
                    return 0;
                }
                default:
                    fail(`Not implemented: ${newType}`);
            }
        case "MRevive":
        case "MInsert": {
            switch (newType) {
                case "Modify": {
                    updateModifyLike(newRev, newMark.changes, baseMark, composeChild);
                    return baseMark;
                }
                case "Delete": {
                    // The insertion made by the base change is subsequently deleted.
                    // TODO: preserve the insertions as muted
                    return 0;
                }
                case "MoveOut":
                case "ReturnFrom": {
                    // The insert has been moved by `newMark`.
                    // We can represent net effect of the two marks as an insert at the move destination.
                    // TODO: Fix repair data when moving revive.
                    // TODO: Handle MMoveOut
                    replaceMoveDest(
                        moveEffects,
                        getUniqueMoveId(newMark, newMark.revision ?? newRev, genId, moveEffects),
                        clone(baseMark),
                    );
                    return 0;
                }
                default:
                    fail("Not implemented");
            }
        }
        case "Modify": {
            switch (newType) {
                case "Modify": {
                    updateModifyLike(newRev, newMark.changes, baseMark, composeChild);
                    return baseMark;
                }
                case "Delete": {
                    // For now the deletion obliterates all other modifications.
                    // In the long run we want to preserve them.
                    return clone(newMark);
                }
                default:
                    fail("Not implemented");
            }
        }
        case "Revive": {
            switch (newType) {
                case "Modify": {
                    const modRevive: ModifyReattach<TNodeChange> = {
                        type: "MRevive",
                        detachedBy: baseMark.detachedBy,
                        detachIndex: baseMark.detachIndex,
                        changes: newMark.changes,
                    };
                    return modRevive;
                }
                case "Delete": {
                    // The deletion undoes the revival
                    return 0;
                }
                case "MoveOut":
                case "ReturnFrom": {
                    // The insert has been moved by `newMark`.
                    // We can represent net effect of the two marks as an insert at the move destination.
                    // TODO: Fix repair data when moving revive.
                    // TODO: Are we now unable to cancel the moved mark if we compose with its inverse?
                    // TODO: Handle MMoveOut
                    replaceMoveDest(
                        moveEffects,
                        getUniqueMoveId(newMark, newMark.revision ?? newRev, genId, moveEffects),
                        clone(baseMark),
                    );
                    return 0;
                }
                default:
                    fail("Not implemented");
            }
        }
        case "MoveIn": {
            switch (newType) {
                case "Delete": {
                    replaceMoveSrc(moveEffects, baseMark.id, newMark);
                    return 0;
                }
                case "MoveOut": {
                    changeSrcMoveId(
                        moveEffects,
                        baseMark.id,
                        getUniqueMoveId(newMark, newMark.revision ?? newRev, genId, moveEffects),
                    );
                    return 0;
                }
                case "ReturnFrom": {
                    if (newMark.detachedBy === baseMark.revision) {
                        removeMoveSrc(moveEffects, baseMark.id);
                        removeMoveDest(
                            moveEffects,
                            getUniqueMoveId(
                                newMark,
                                newMark.revision ?? newRev,
                                genId,
                                moveEffects,
                            ),
                        );
                        return 0;
                    } else {
                        changeSrcMoveId(
                            moveEffects,
                            baseMark.id,
                            getUniqueMoveId(
                                newMark,
                                newMark.revision ?? newRev,
                                genId,
                                moveEffects,
                            ),
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
                case "Delete": {
                    replaceMoveSrc(moveEffects, baseMark.id, newMark);
                    return 0;
                }
                case "MoveOut": {
                    if (baseMark.detachedBy === (newMark.revision ?? newRev)) {
                        removeMoveSrc(moveEffects, baseMark.id);
                        removeMoveDest(
                            moveEffects,
                            getUniqueMoveId(
                                newMark,
                                newMark.revision ?? newRev,
                                genId,
                                moveEffects,
                            ),
                        );
                        return 0;
                    } else {
                        changeSrcMoveId(
                            moveEffects,
                            baseMark.id,
                            getUniqueMoveId(
                                newMark,
                                newMark.revision ?? newRev,
                                genId,
                                moveEffects,
                            ),
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
                            getUniqueMoveId(
                                newMark,
                                newMark.revision ?? newRev,
                                genId,
                                moveEffects,
                            ),
                        );
                        return 0;
                    } else {
                        changeSrcMoveId(
                            moveEffects,
                            baseMark.id,
                            getUniqueMoveId(
                                newMark,
                                newMark.revision ?? newRev,
                                genId,
                                moveEffects,
                            ),
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

function updateModifyLike<TNodeChange>(
    currRev: RevisionTag | undefined,
    currChanges: TNodeChange,
    base: ModifyInsert<TNodeChange> | Modify<TNodeChange> | ModifyReattach<TNodeChange>,
    composeChild: NodeChangeComposer<TNodeChange>,
) {
    // `base.changes` is assumed to be the result of a call to `composeChildren`, so it does not need a revision tag.
    // See the contract of `FieldChangeHandler.compose`.
    base.changes = composeChild([
        tagChange(base.changes, undefined),
        tagChange(currChanges, currRev),
    ]);
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
    if (revision !== undefined && mark.type !== "Modify") {
        (cloned as HasRevisionTag).revision = revision;
    }

    if (isMoveMark(mark)) {
        (cloned as MoveMark<TNodeChange>).id = getUniqueMoveId(
            mark,
            mark.revision ?? revision,
            genId,
            moveEffects,
        );
    }

    if (isModifyingMark(mark)) {
        (cloned as ModifyingMark<TNodeChange>).changes = composeChild([
            tagChange(mark.changes, revision),
        ]);
        return cloned;
    }

    return cloned;
}

function getUniqueMoveId<T>(
    mark: MoveMark<T>,
    revision: RevisionTag | undefined,
    genId: IdAllocator,
    moveEffects: MoveEffectTable<T>,
): MoveId {
    if (!moveEffects.validatedMarks.has(mark) && (mark.revision ?? revision === undefined)) {
        let newId = moveEffects.idRemappings.get(mark.id);
        if (newId === undefined) {
            newId = genId();
            replaceMoveId(moveEffects, mark.id, newId);
        }
        return newId;
    }
    return mark.id;
}

function applyMoveEffects<TNodeChange>(
    marks: MarkList<TNodeChange>,
    composeChild: NodeChangeComposer<TNodeChange>,
    moveEffects: MoveEffectTable<TNodeChange>,
): MarkList<TNodeChange> {
    const factory = new MarkListFactory<TNodeChange>();
    for (const mark of marks) {
        if (isObjMark(mark)) {
            switch (mark.type) {
                case "MoveIn":
                case "ReturnTo": {
                    const effect = moveEffects.dstEffects.get(mark.id);
                    if (effect !== undefined) {
                        factory.push(...splitMoveIn(mark, effect));
                        continue;
                    }
                    break;
                }
                case "MMoveIn": {
                    const effect = moveEffects.dstEffects.get(mark.id);
                    if (effect !== undefined) {
                        factory.push(...splitModifyMoveIn(mark, effect, composeChild));
                        continue;
                    }
                    break;
                }
                case "MoveOut":
                case "ReturnFrom": {
                    const effect = moveEffects.srcEffects.get(mark.id);
                    if (effect !== undefined) {
                        factory.push(...splitMoveOut(mark, effect));
                        continue;
                    }
                    break;
                }
                case "MMoveOut": {
                    const effect = moveEffects.srcEffects.get(mark.id);
                    if (effect !== undefined) {
                        factory.push(...splitModifyMoveOut(mark, effect));
                        continue;
                    }
                    break;
                }
                default:
                    break;
            }
        }

        factory.push(mark);
    }

    return factory.list;
}

function splitModifyMoveIn<T>(
    mark: ModifyMoveIn<T>,
    parts: MoveDstPartition<T>[],
    composeChild: NodeChangeComposer<T>,
): Attach<T>[] {
    if (parts.length === 0) {
        return [];
    }

    assert(parts.length === 1, "Cannot split a ModifyMoveIn mark");
    assert((parts[0].count ?? 1) === 1, "Cannot change the size of a ModifyMoveIn mark");
    if (parts[0].replaceWith !== undefined) {
        assert(parts[0].replaceWith.length === 1, "Can only modify a single moved mark");
        let movedMark = parts[0].replaceWith[0];
        switch (movedMark.type) {
            case "Insert": {
                movedMark = {
                    ...movedMark,
                    type: "MInsert",
                    content: movedMark.content[0],
                    changes: mark.changes,
                };
                break;
            }
            case "MInsert": {
                updateModifyLike(undefined, mark.changes, movedMark, composeChild);
                break;
            }
            default:
                fail(`Unhandled case: ${movedMark.type}`);
        }
        return [movedMark];
    } else {
        return [
            {
                ...mark,
                id: parts[0].id,
            },
        ];
    }
}

function splitModifyMoveOut<T>(
    mark: ModifyMoveOut<T>,
    parts: MoveSrcPartition<T>[],
): SizedObjectMark<T>[] {
    if (parts.length === 0) {
        return [];
    }

    assert(parts.length === 1, "Cannot split ModifyMoveOut marks");
    if (parts[0].replaceWith !== undefined) {
        // TODO: Apply modifications
        return parts[0].replaceWith;
    }
    return [
        {
            ...mark,
            id: parts[0].id,
        },
    ];
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
    ) {
        this.baseMarks = new StackyIterator(baseMarks);
        this.newMarks = new StackyIterator(newMarks);
    }

    // TODO: Don't know if lists are empty until applying move effects.
    // Probably should redesign this class to just be an iterator.
    public isEmpty(): boolean {
        return this.baseMarks.done && this.newMarks.done;
    }

    public pop(): ComposeMarks<T> {
        let baseMark: Mark<T> | undefined = this.baseMarks.pop();
        let newMark: Mark<T> | undefined = this.newMarks.pop();

        if (baseMark !== undefined) {
            const splitMarks = applyMoveEffectsToMark(
                baseMark,
                undefined,
                this.moveEffects,
                this.genId,
                false,
            );
            baseMark = splitMarks[0];
            for (let i = splitMarks.length - 1; i >= 0; i--) {
                this.baseMarks.push(splitMarks[i]);
            }
        }

        if (newMark !== undefined) {
            const splitMarks = applyMoveEffectsToMark(
                newMark,
                this.newRevision,
                this.moveEffects,
                this.genId,
                this.reassignNewMoveIds,
            );
            newMark = splitMarks[0];
            for (let i = splitMarks.length - 1; i >= 0; i--) {
                this.newMarks.push(splitMarks[i]);
            }
        }

        if (baseMark === undefined || newMark === undefined) {
            return { baseMark: this.baseMarks.pop(), newMark: this.newMarks.pop() };
        } else if (isAttach(newMark)) {
            const newRev = newMark.revision ?? this.newRevision;
            if (
                isReattach(newMark) &&
                isDetachMark(baseMark) &&
                newRev !== undefined &&
                baseMark.revision === newRev
            ) {
                // We assume that baseMark and newMark having the same revision means that they are inverses of each other,
                // so neither has an effect in the composition.
                assert(
                    getInputLength(baseMark) === getOutputLength(newMark),
                    0x4ac /* Inverse marks should be the same length */,
                );
                return {
                    baseMark: this.baseMarks.pop(),
                    newMark: this.newMarks.pop(),
                    areInverses: true,
                };
            } else {
                return { newMark: this.newMarks.pop() };
            }
        } else if (isDetachMark(baseMark)) {
            return { baseMark: this.baseMarks.pop() };
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
}

function applyMoveEffectsToMark<T>(
    inputMark: Mark<T>,
    revision: RevisionTag | undefined,
    moveEffects: MoveEffectTable<T>,
    genId: IdAllocator,
    reassignIds: boolean,
): Mark<T>[] {
    let mark = inputMark;
    if (isMoveMark(mark)) {
        if (reassignIds) {
            const newId = getUniqueMoveId(mark, revision, genId, moveEffects);
            if (newId !== mark.id) {
                mark = clone(mark);
                mark.id = newId;
                moveEffects.validatedMarks.add(mark);
            }
        }

        switch (mark.type) {
            case "MoveOut":
            case "ReturnFrom": {
                const effect = moveEffects.srcEffects.get(mark.id);
                if (effect !== undefined) {
                    const splitMarks = splitMoveOut(mark, effect);
                    for (const splitMark of splitMarks) {
                        moveEffects.validatedMarks.add(splitMark);
                    }
                    return splitMarks;
                }
                break;
            }
            case "MoveIn":
            case "ReturnTo": {
                const effect = moveEffects.dstEffects.get(mark.id);
                if (effect !== undefined) {
                    const splitMarks = splitMoveIn(mark, effect);
                    for (const splitMark of splitMarks) {
                        moveEffects.validatedMarks.add(splitMark);
                    }
                    return splitMarks;
                }
                break;
            }
            default:
                fail(`Unhandled mark type: ${mark.type}`);
        }
    }
    return [mark];
}

interface ComposeMarks<T> {
    baseMark?: Mark<T>;
    newMark?: Mark<T>;
    areInverses?: boolean;
}
