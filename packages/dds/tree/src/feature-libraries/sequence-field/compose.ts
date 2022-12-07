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
    Mark,
    MarkList,
    Modify,
    ModifyingMark,
    ModifyInsert,
    ModifyMoveIn,
    ModifyMoveOut,
    ModifyReattach,
    MoveId,
    MoveIn,
    MoveOut,
    ObjectMark,
    SizedMark,
} from "./format";
import { MarkListFactory } from "./markListFactory";
import {
    deleteMoveSource,
    getInputLength,
    getOutputLength,
    isAttach,
    isDetachMark,
    isModifyingMark,
    isObjMark,
    isSkipMark,
    MoveEffectTable,
    MovePartition,
    replaceMoveDest,
    splitMarkOnInput,
    splitMarkOnOutput,
    newMoveEffectTable,
    replaceMoveId,
    changeSrcMoveId,
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
    const baseIter = new StackyIterator(baseMarkList);
    const newIter = new StackyIterator(newMarkList);
    for (let newMark of newIter) {
        let baseMark: Mark<TNodeChange> | undefined = baseIter.pop();
        if (baseMark === undefined) {
            // We have reached a region of the field that the base change does not affect.
            // We therefore adopt the new mark as is.
            factory.push(composeMark(newMark, newRev, composeChild, genId, moveEffects));
        } else if (isAttach(newMark)) {
            if (isDetachMark(baseMark) && newRev !== undefined && baseMark.revision === newRev) {
                // We assume that baseMark and newMark having the same revision means that they are inverses of each other,
                // so neither has an effect in the composition.
                assert(
                    getInputLength(baseMark) === getOutputLength(newMark),
                    "Inverse marks should be the same length",
                );
            } else {
                factory.pushContent(composeMark(newMark, newRev, composeChild, genId, moveEffects));
                baseIter.push(baseMark);
            }
        } else if (isDetachMark(baseMark)) {
            // Content that is being detached by the base changeset can interact with the new changes.
            // This can happen in two cases:
            // - The new change contains reattach marks for this detach. (see above)
            // - The new change contains tombs for this detach.
            // We're ignoring these cases for now. The impact of ignoring them is that the relative order of
            // reattached content and concurrently attached content is not preserved.
            // TODO: properly compose detach marks with their matching new marks if any.
            factory.pushContent(baseMark);
            newIter.push(newMark);
        } else {
            // If we've reached this branch then `baseMark` and `newMark` start at the same location
            // in the document field at the revision after the base changes and before the new changes.
            // Despite that, it's not necessarily true that they affect the same range in that document
            // field because they may be of different lengths.
            // We perform any necessary splitting in order to end up with a pair of marks that do have the same length.

            // TODO: Handle MMoveOut and MMoveIn
            if (isObjMark(newMark) && newMark.type === "MoveOut") {
                const newId = getUniqueMoveId(newMark, newRev, genId, moveEffects);
                if (newId !== newMark.id) {
                    newMark = clone(newMark);
                    newMark.id = newId;
                    moveEffects.validatedMarks.add(newMark);
                }
                const effect = moveEffects.srcEffects.get(newId);
                if (effect !== undefined) {
                    const splitMarks = splitMoveOut(newMark, effect);
                    for (const mark of splitMarks) {
                        moveEffects.validatedMarks.add(mark);
                    }
                    newMark = splitMarks[0];
                    for (let i = splitMarks.length - 1; i > 0; i--) {
                        newIter.push(splitMarks[i]);
                    }
                }
            }

            if (isObjMark(baseMark) && baseMark.type === "MoveIn") {
                const effect = moveEffects.dstEffects.get(baseMark.id);
                if (effect !== undefined) {
                    const splitMarks = splitMoveIn(baseMark, effect);
                    baseMark = splitMarks[0];
                    for (let i = splitMarks.length - 1; i > 0; i--) {
                        newIter.push(splitMarks[i]);
                    }
                }
            }

            const newMarkLength = getInputLength(newMark);
            const baseMarkLength = getOutputLength(baseMark);
            if (newMarkLength < baseMarkLength) {
                let nextBaseMark;
                [baseMark, nextBaseMark] = splitMarkOnOutput(
                    baseMark,
                    newMarkLength,
                    genId,
                    moveEffects,
                );
                baseIter.push(nextBaseMark);
            } else if (newMarkLength > baseMarkLength) {
                if (
                    isObjMark(newMark) &&
                    (newMark.type === "MoveOut" || newMark.type === "MMoveOut")
                ) {
                    const newId = getUniqueMoveId(newMark, newRev, genId, moveEffects);
                    if (newId !== newMark.id) {
                        newMark = clone(newMark);
                        newMark.id = newId;
                    }
                }
                let nextNewMark;
                [newMark, nextNewMark] = splitMarkOnInput(
                    newMark,
                    baseMarkLength,
                    genId,
                    moveEffects,
                );

                moveEffects.validatedMarks.add(newMark);
                moveEffects.validatedMarks.add(nextNewMark);
                newIter.push(nextNewMark);
            }
            // Past this point, we are guaranteed that `newMark` and `baseMark` have the same length and
            // start at the same location in the revision after the base changes.
            // They therefore refer to the same range for that revision.
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
    // Push the remaining base marks if any
    for (const baseMark of baseIter) {
        factory.push(baseMark);
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
                    fail("Not implemented");
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
                case "MoveOut": {
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
                case "MoveOut": {
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
                    deleteMoveSource(moveEffects, baseMark.id);
                    return newMark;
                }
                case "MoveOut": {
                    changeSrcMoveId(
                        moveEffects,
                        baseMark.id,
                        getUniqueMoveId(newMark, newMark.revision ?? newRev, genId, moveEffects),
                    );
                    return 0;
                }
                default:
                    fail("Not implemented");
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
    if (revision !== undefined) {
        (cloned as ObjectMark<TNodeChange>).revision = revision;
    }

    switch (mark.type) {
        case "MoveIn":
        case "MMoveIn":
        case "MoveOut":
        case "MMoveOut": {
            (cloned as MoveMark<TNodeChange>).id = getUniqueMoveId(
                mark,
                mark.revision ?? revision,
                genId,
                moveEffects,
            );
            break;
        }
        default:
            break;
    }

    if (isModifyingMark(mark)) {
        (cloned as ModifyingMark<TNodeChange>).changes = composeChild([
            tagChange(mark.changes, revision),
        ]);
        return cloned;
    }

    return cloned;
}

type MoveMark<T> = MoveOut | ModifyMoveOut<T> | MoveIn | ModifyMoveIn<T>;

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
                case "MoveIn": {
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
                case "MoveOut": {
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

function splitMoveIn<T>(mark: MoveIn, parts: MovePartition<T>[]): Attach<T>[] {
    const result: Attach<T>[] = [];
    for (const part of parts) {
        if (part.replaceWith !== undefined) {
            result.push(...part.replaceWith);
        } else {
            result.push({
                ...mark,
                id: part.id,
                count: part.count ?? mark.count,
            });
        }
    }
    return result;
}

function splitModifyMoveIn<T>(
    mark: ModifyMoveIn<T>,
    parts: MovePartition<T>[],
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

function splitMoveOut(mark: MoveOut, parts: MovePartition<unknown>[]): MoveOut[] {
    const result: MoveOut[] = [];
    for (const part of parts) {
        assert(part.replaceWith === undefined, "MoveOut marks cannot be replaced");
        result.push({
            ...mark,
            id: part.id,
            count: part.count ?? mark.count,
        });
    }
    return result;
}

function splitModifyMoveOut<T>(
    mark: ModifyMoveOut<T>,
    parts: MovePartition<T>[],
): ModifyMoveOut<T>[] {
    if (parts.length === 0) {
        return [];
    }

    assert(parts.length === 1, "Cannot split ModifyMoveOut marks");
    assert(parts[0].replaceWith === undefined, "ModifyMoveOut marks cannot be replaced");
    return [
        {
            ...mark,
            id: parts[0].id,
        },
    ];
}
