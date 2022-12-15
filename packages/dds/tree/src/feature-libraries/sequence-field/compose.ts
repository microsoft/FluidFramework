/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { RevisionTag, tagChange, TaggedChange } from "../../core";
import { clone, fail, StackyIterator } from "../../util";
import {
    Changeset,
    HasRevisionTag,
    Mark,
    MarkList,
    Modify,
    ModifyingMark,
    ModifyInsert,
    ModifyReattach,
    SizedMark,
} from "./format";
import { MarkListFactory } from "./markListFactory";
import {
    getInputLength,
    getOutputLength,
    isAttach,
    isDetachMark,
    isModifyingMark,
    isReattach,
    isSkipMark,
    splitMarkOnInput,
    splitMarkOnOutput,
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
): Changeset<TNodeChange> {
    let composed: Changeset<TNodeChange> = [];
    for (const change of changes) {
        composed = composeMarkLists(composed, change.revision, change.change, composeChild);
    }
    return composed;
}

function composeMarkLists<TNodeChange>(
    baseMarkList: MarkList<TNodeChange>,
    newRev: RevisionTag | undefined,
    newMarkList: MarkList<TNodeChange>,
    composeChild: NodeChangeComposer<TNodeChange>,
): MarkList<TNodeChange> {
    const factory = new MarkListFactory<TNodeChange>();
    const queue = new ComposeQueue(baseMarkList, newRev, newMarkList);
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
            const composedMark = composeMarks(baseMark, newRev, newMark, composeChild);
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
): Mark<TNodeChange> {
    if (isSkipMark(baseMark)) {
        return composeMark(newMark, newRev, composeChild);
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
                default:
                    fail("Not implemented");
            }
        case "MRevive":
        case "MInsert": {
            switch (newType) {
                case "Modify": {
                    updateModifyLike(newRev, newMark, baseMark, composeChild);
                    return baseMark;
                }
                case "Delete": {
                    // The insertion made by the base change is subsequently deleted.
                    // TODO: preserve the insertions as muted
                    return 0;
                }
                default:
                    fail("Not implemented");
            }
        }
        case "Modify": {
            switch (newType) {
                case "Modify": {
                    updateModifyLike(newRev, newMark, baseMark, composeChild);
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
                default:
                    fail("Not implemented");
            }
        }
        default:
            fail("Not implemented");
    }
}

function updateModifyLike<TNodeChange>(
    currRev: RevisionTag | undefined,
    curr: Modify<TNodeChange>,
    base: ModifyInsert<TNodeChange> | Modify<TNodeChange> | ModifyReattach<TNodeChange>,
    composeChild: NodeChangeComposer<TNodeChange>,
) {
    // `base.changes` is assumed to be the result of a call to `composeChildren`, so it does not need a revision tag.
    // See the contract of `FieldChangeHandler.compose`.
    base.changes = composeChild([
        tagChange(base.changes, undefined),
        tagChange(curr.changes, currRev),
    ]);
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
    if (revision !== undefined && mark.type !== "Modify") {
        (cloned as HasRevisionTag).revision = revision;
    }

    if (isModifyingMark(mark)) {
        (cloned as ModifyingMark<TNodeChange>).changes = composeChild([
            tagChange(mark.changes, revision),
        ]);
        return cloned;
    }

    return cloned;
}

class ComposeQueue<T> {
    private readonly baseMarks: StackyIterator<Mark<T>>;
    private readonly newMarks: StackyIterator<Mark<T>>;

    public constructor(
        baseMarks: Changeset<T>,
        private readonly newRevision: RevisionTag | undefined,
        newMarks: Changeset<T>,
    ) {
        this.baseMarks = new StackyIterator(baseMarks);
        this.newMarks = new StackyIterator(newMarks);
    }

    public isEmpty(): boolean {
        return this.baseMarks.done && this.newMarks.done;
    }

    public pop(): ComposeMarks<T> {
        let baseMark: Mark<T> | undefined = this.baseMarks.peek();
        let newMark: Mark<T> | undefined = this.newMarks.peek();
        if (baseMark === undefined || newMark === undefined) {
            return { baseMark: this.baseMarks.pop(), newMark: this.newMarks.pop() };
        } else if (isAttach(newMark)) {
            const newRev = newMark.revision ?? this.newRevision;
            if (isReattach(newMark) && isDetachMark(baseMark)) {
                if (
                    (newRev !== undefined && baseMark.revision === newRev) ||
                    newMark.detachedBy === baseMark.revision
                ) {
                    this.baseMarks.pop();
                    this.newMarks.pop();
                    const baseMarkLength = getInputLength(baseMark);
                    const newMarkLength = getOutputLength(newMark);
                    if (baseMarkLength === newMarkLength) {
                        // The two marks fully cancel out
                    } else if (baseMarkLength > newMarkLength) {
                        // Only a portion of the base mark is cancelled out
                        let nextBaseMark;
                        [baseMark, nextBaseMark] = splitMarkOnInput(baseMark, newMarkLength);
                        this.baseMarks.push(nextBaseMark);
                    } else {
                        // Only a portion of the new mark is cancelled out
                        let nextNewMark;
                        [newMark, nextNewMark] = splitMarkOnOutput(newMark, baseMarkLength);
                        this.newMarks.push(nextNewMark);
                    }
                    return {
                        baseMark,
                        newMark,
                        areInverses: true,
                    };
                }
            }
            return { newMark: this.newMarks.pop() };
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
                [baseMark, nextBaseMark] = splitMarkOnOutput(baseMark, newMarkLength);
                this.baseMarks.push(nextBaseMark);
            } else if (newMarkLength > baseMarkLength) {
                let nextNewMark;
                [newMark, nextNewMark] = splitMarkOnInput(newMark, baseMarkLength);
                this.newMarks.push(nextNewMark);
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
