/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { clone, fail, StackyIterator } from "../../util";
import {
    Changeset,
    Mark,
    MarkList,
    Modify,
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
    isReattach,
    isSkipMark,
    isTomb,
    splitMarkOnInput,
    splitMarkOnOutput,
} from "./utils";

export type NodeChangeComposer<TNodeChange> = (changes: TNodeChange[]) => TNodeChange;

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
    changes: Changeset<TNodeChange>[],
    composeChild: NodeChangeComposer<TNodeChange>,
): Changeset<TNodeChange> {
    if (changes.length === 1) {
        return changes[0];
    }
    let composed: Changeset<TNodeChange> = [];
    for (const change of changes) {
        composed = composeMarkLists(composed, change, composeChild);
    }
    return composed;
}

function composeMarkLists<TNodeChange>(
    baseMarkList: MarkList<TNodeChange>,
    newMarkList: MarkList<TNodeChange>,
    composeChild: NodeChangeComposer<TNodeChange>,
): MarkList<TNodeChange> {
    const factory = new MarkListFactory<TNodeChange>();
    const baseIter = new StackyIterator(baseMarkList);
    const newIter = new StackyIterator(newMarkList);
    for (let newMark of newIter) {
        let baseMark: Mark<TNodeChange> | undefined = baseIter.pop();
        if (baseMark === undefined) {
            // We have reached a region of the field that the base change does not affect.
            // We therefore adopt the new mark as is.
            factory.push(clone(newMark));
        } else if (isAttach(newMark)) {
            // Content that is being attached by the new changeset cannot interact with base changes.
            // Note that attach marks from different changesets can only target the same gap if they are concurrent.
            // This method assumes that `newMarkList` is based on `baseMarkList`, so they are not concurrent.
            factory.pushContent(clone(newMark));
            baseIter.push(baseMark);
        } else if (isReattach(newMark)) {
            // Content that is being re-attached by the new changeset can interact with base changes.
            // This can happen in two cases:
            // - The base change contains the detach that the re-attach is the inverse of.
            // - The base change contains a tombstone for the detach that the re-attach is the inverse of.
            // We're ignoring these cases for now. The impact of ignoring them is that the relative order of
            // reattached content and concurrently attached content is not preserved.
            // TODO: properly compose reattach marks with their matching base marks if any.
            factory.pushContent(clone(newMark));
            baseIter.push(baseMark);
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
        } else if (isTomb(baseMark) || isTomb(newMark)) {
            // We don't currently support Tomb marks (and don't offer ways to generate them).
            fail("TODO: support Tomb marks");
        } else {
            // If we've reached this branch then `baseMark` and `newMark` start at the same location
            // in the document field at the revision after the base changes and before the new changes.
            // Despite that, it's not necessarily true that they affect the same range in that document
            // field because they may be of different lengths.
            // We perform any necessary splitting in order to end up with a pair of marks that do have the same length.
            const newMarkLength = getInputLength(newMark);
            const baseMarkLength = getOutputLength(baseMark);
            if (newMarkLength < baseMarkLength) {
                let nextBaseMark;
                [baseMark, nextBaseMark] = splitMarkOnOutput(baseMark, newMarkLength);
                baseIter.push(nextBaseMark);
            } else if (newMarkLength > baseMarkLength) {
                let nextNewMark;
                [newMark, nextNewMark] = splitMarkOnInput(newMark, baseMarkLength);
                newIter.push(nextNewMark);
            }
            // Past this point, we are guaranteed that `newMark` and `baseMark` have the same length and
            // start at the same location in the revision after the base changes.
            // They therefore refer to the same range for that revision.
            const composedMark = composeMarks(baseMark, newMark, composeChild);
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
 * @param newMark - The mark to compose with `baseMark`.
 * Its input range should be the same as `baseMark`'s output range.
 * @param baseMark - The mark to compose with `newMark`.
 * Its output range should be the same as `newMark`'s input range.
 * @returns A mark that is equivalent to applying both `baseMark` and `newMark` successively.
 */
function composeMarks<TNodeChange>(
    baseMark: Mark<TNodeChange>,
    newMark: SizedMark<TNodeChange>,
    composeChild: NodeChangeComposer<TNodeChange>,
): Mark<TNodeChange> {
    if (isSkipMark(baseMark)) {
        return clone(newMark);
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
                        ...newMark,
                        type: "MInsert",
                        id: baseMark.id,
                        content: baseMark.content[0],
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
        case "MInsert": {
            switch (newType) {
                case "Modify": {
                    updateModifyLike(newMark, baseMark, composeChild);
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
                    updateModifyLike(newMark, baseMark, composeChild);
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
                        id: baseMark.id,
                        tomb: baseMark.tomb,
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
    curr: Modify<TNodeChange>,
    base: ModifyInsert<TNodeChange> | Modify<TNodeChange> | ModifyReattach<TNodeChange>,
    composeChild: NodeChangeComposer<TNodeChange>,
) {
    base.changes = composeChild([base.changes, curr.changes]);
}
