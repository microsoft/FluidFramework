/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { makeAnonChange, RevisionTag, tagChange, TaggedChange } from "../../core";
import { clone, fail } from "../../util";
import { IdAllocator } from "../modular-schema";
import {
    Changeset,
    HasChanges,
    HasRevisionTag,
    Mark,
    MarkList,
    SizedMark,
    SizedObjectMark,
} from "./format";
import { MarkListFactory } from "./markListFactory";
import { MarkQueue } from "./markQueue";
import { getOrCreateEffect, MoveEffectTable, MoveEnd, newMoveEffectTable } from "./moveEffectTable";
import {
    getInputLength,
    getOutputLength,
    isAttach,
    isDetachMark,
    isReattach,
    isSkipMark,
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
    const queue = new ComposeQueue(baseMarkList, newRev, newMarkList, genId, moveEffects, (a, b) =>
        composeChildChanges(a, b, newRev, composeChild),
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
            factory.push(composeMark(newMark, newRev, composeChild));
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
    newMark: SizedMark<TNodeChange>,
    composeChild: NodeChangeComposer<TNodeChange>,
    genId: IdAllocator,
    moveEffects: MoveEffectTable<TNodeChange>,
): Mark<TNodeChange> {
    if (isSkipMark(baseMark)) {
        return composeMark(newMark, newRev, composeChild);
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
                    getOrCreateEffect(moveEffects, MoveEnd.Dest, newMark.id).mark =
                        mergeInNewChildChanges(
                            baseMark,
                            newMark.changes,
                            newMark.revision ?? newRev,
                            composeChild,
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
                    return clone(newMark);
                }
                case "MoveOut":
                case "ReturnFrom": {
                    return composeWithBaseChildChanges(
                        newMark,
                        newRev,
                        baseMark.changes,
                        composeChild,
                    );
                }
                default:
                    fail(`Not implemented: ${newType}`);
            }
        }
        case "MoveIn": {
            switch (newType) {
                case "Delete": {
                    getOrCreateEffect(moveEffects, MoveEnd.Source, baseMark.id).mark = newMark;
                    return 0;
                }
                case "MoveOut": {
                    getOrCreateEffect(moveEffects, MoveEnd.Source, baseMark.id).id = newMark.id;
                    return 0;
                }
                case "ReturnFrom": {
                    if (newMark.detachedBy === baseMark.revision) {
                        getOrCreateEffect(moveEffects, MoveEnd.Source, baseMark.id).count = 0;
                        getOrCreateEffect(moveEffects, MoveEnd.Dest, newMark.id).count = 0;
                        return 0;
                    } else {
                        getOrCreateEffect(moveEffects, MoveEnd.Source, baseMark.id).id = newMark.id;
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
                    getOrCreateEffect(moveEffects, MoveEnd.Source, baseMark.id).modifyAfter =
                        newMark.changes;
                    return baseMark;
                }
                case "Delete": {
                    getOrCreateEffect(moveEffects, MoveEnd.Source, baseMark.id).mark = newMark;
                    return 0;
                }
                case "MoveOut": {
                    if (baseMark.detachedBy === (newMark.revision ?? newRev)) {
                        getOrCreateEffect(moveEffects, MoveEnd.Source, baseMark.id).count = 0;
                        getOrCreateEffect(moveEffects, MoveEnd.Dest, newMark.id).count = 0;
                        return 0;
                    } else {
                        getOrCreateEffect(moveEffects, MoveEnd.Source, baseMark.id).id = newMark.id;
                        return 0;
                    }
                }
                case "ReturnFrom": {
                    if (
                        baseMark.detachedBy === (newMark.revision ?? newRev) ||
                        newMark.detachedBy === baseMark.revision
                    ) {
                        getOrCreateEffect(moveEffects, MoveEnd.Source, baseMark.id).count = 0;
                        getOrCreateEffect(moveEffects, MoveEnd.Dest, newMark.id).count = 0;
                        return 0;
                    } else {
                        if (newMark.changes !== undefined) {
                            getOrCreateEffect(
                                moveEffects,
                                MoveEnd.Source,
                                baseMark.id,
                            ).modifyAfter = newMark.changes;
                        }
                        getOrCreateEffect(moveEffects, MoveEnd.Source, baseMark.id).id = newMark.id;
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
    TMark extends SizedObjectMark<TNodeChange> & HasChanges<TNodeChange> & HasRevisionTag,
>(
    newMark: TMark,
    newRevision: RevisionTag | undefined,
    baseChanges: TNodeChange | undefined,
    composeChild: NodeChangeComposer<TNodeChange>,
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
): TMark {
    if (isSkipMark(mark)) {
        return mark;
    }

    const cloned = clone(mark);
    assert(!isSkipMark(cloned), "Cloned should be same type as input mark");
    if (revision !== undefined && cloned.type !== "Modify" && cloned.revision === undefined) {
        cloned.revision = revision;
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
    const queue = new MarkQueue(
        marks,
        undefined,
        moveEffects,
        true,
        () => fail("Should not generate IDs"),
        // TODO: Should pass in revision for new changes
        (a, b) => composeChildChanges(a, b, undefined, composeChild),
    );

    while (!queue.isEmpty()) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        factory.push(queue.dequeue()!);
    }

    return factory.list;
}

export class ComposeQueue<T> {
    private readonly baseMarks: MarkQueue<T>;
    private readonly newMarks: MarkQueue<T>;

    public constructor(
        baseMarks: Changeset<T>,
        newRevision: RevisionTag | undefined,
        newMarks: Changeset<T>,
        genId: IdAllocator,
        moveEffects: MoveEffectTable<T>,
        composeChanges?: (a: T | undefined, b: T | undefined) => T | undefined,
    ) {
        this.baseMarks = new MarkQueue(
            baseMarks,
            undefined,
            moveEffects,
            true,
            genId,
            composeChanges,
        );
        this.newMarks = new MarkQueue(
            newMarks,
            newRevision,
            moveEffects,
            true,
            genId,
            composeChanges,
        );
    }

    public isEmpty(): boolean {
        return this.baseMarks.isEmpty() && this.newMarks.isEmpty();
    }

    public pop(): ComposeMarks<T> {
        let baseMark = this.baseMarks.peek();
        let newMark = this.newMarks.peek();
        if (baseMark === undefined || newMark === undefined) {
            return { baseMark: this.baseMarks.dequeue(), newMark: this.newMarks.dequeue() };
        } else if (isAttach(newMark)) {
            const newRev = newMark.revision ?? this.newMarks.revision;
            if (
                isReattach(newMark) &&
                isDetachMark(baseMark) &&
                newRev !== undefined &&
                baseMark.revision === newRev
            ) {
                // We assume that baseMark and newMark having the same revision means that they are inverses of each other.
                assert(
                    getInputLength(baseMark) === getOutputLength(newMark),
                    0x4ac /* Inverse marks should be the same length */,
                );
                return {
                    baseMark: this.baseMarks.dequeue(),
                    newMark: this.newMarks.dequeue(),
                    areInverses: true,
                };
            } else {
                return { newMark: this.newMarks.dequeue() };
            }
        } else if (isDetachMark(baseMark)) {
            return { baseMark: this.baseMarks.dequeue() };
        } else {
            // If we've reached this branch then `baseMark` and `newMark` start at the same location
            // in the document field at the revision after the base changes and before the new changes.
            // Despite that, it's not necessarily true that they affect the same range in that document
            // field because they may be of different lengths.
            // We perform any necessary splitting in order to end up with a pair of marks that do have the same length.
            const newMarkLength = getInputLength(newMark);
            const baseMarkLength = getOutputLength(baseMark);
            if (newMarkLength < baseMarkLength) {
                this.newMarks.dequeue();
                baseMark = this.baseMarks.dequeueOutput(newMarkLength);
            } else if (newMarkLength > baseMarkLength) {
                this.baseMarks.dequeue();
                newMark = this.newMarks.dequeueInput(baseMarkLength);
            } else {
                this.baseMarks.dequeue();
                this.newMarks.dequeue();
            }
            // Past this point, we are guaranteed that `newMark` and `baseMark` have the same length and
            // start at the same location in the revision after the base changes.
            // They therefore refer to the same range for that revision.
            return { baseMark, newMark };
        }
    }
}

interface ComposeMarks<T> {
    baseMark?: Mark<T>;
    newMark?: Mark<T>;
    areInverses?: boolean;
}
