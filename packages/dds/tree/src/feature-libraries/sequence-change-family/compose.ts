/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    getInputLength,
    getOutputLength,
    isAttachGroup,
    isDetachMark,
    isGapEffectMark,
    isReattach,
    isSkipMark,
    isTomb,
    MarkListFactory,
    splitMarkOnInput,
    splitMarkOnOutput,
    Transposed as T,
} from "../../changeset";
import { clone, fail, StackyIterator } from "../../util";
import { SequenceChangeset } from "./sequenceChangeset";

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
export function compose(changes: SequenceChangeset[]): SequenceChangeset {
    if (changes.length === 1) {
        return changes[0];
    }
    let composedFieldMarks: T.FieldMarks = {};
    for (const change of changes) {
        composedFieldMarks = composeFieldMarks(composedFieldMarks, change.marks);
    }
    return {
        marks: composedFieldMarks,
    };
}

function composeFieldMarks(baseFieldMarks: T.FieldMarks, newFieldMarks: T.FieldMarks): T.FieldMarks {
    const composed: T.FieldMarks = {};
    for (const key of Object.keys(newFieldMarks)) {
        const composedMarkList = composeMarkLists(baseFieldMarks[key] ?? [], newFieldMarks[key]);
        if (composedMarkList.length > 0) {
            composed[key] = composedMarkList;
        }
    }
    for (const key of Object.keys(baseFieldMarks)) {
        if (!(key in newFieldMarks)) {
            composed[key] = baseFieldMarks[key];
        }
    }
    return composed;
}

function composeMarkLists(
    baseMarkList: T.MarkList,
    newMarkList: T.MarkList,
): T.MarkList {
    const factory = new MarkListFactory();
    const baseIter = new StackyIterator(baseMarkList);
    const newIter = new StackyIterator(newMarkList);
    for (let newMark of newIter) {
        let baseMark: T.Mark | undefined = baseIter.pop();
        if (baseMark === undefined) {
            // We have reached a region of the field that the base change does not affect.
            // We therefore adopt the new mark as is.
            factory.push(clone(newMark));
        } else if (isAttachGroup(newMark)) {
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
        } else if (isTomb(baseMark) || isGapEffectMark(baseMark) || isTomb(newMark) || isGapEffectMark(newMark)) {
            // We don't currently support Tomb and Gap marks (and don't offer ways to generate them).
            fail("TODO: support Tomb and Gap marks");
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
            const composedMark = composeMarks(baseMark, newMark);
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
function composeMarks(baseMark: T.Mark, newMark: T.SizedMark): T.Mark {
    if (isSkipMark(baseMark)) {
        return clone(newMark);
    }
    if (isSkipMark(newMark)) {
        return baseMark;
    }
    if (isAttachGroup(baseMark)) {
        return composeWithAttachGroup(baseMark, newMark);
    }
    const baseType = baseMark.type;
    const newType = newMark.type;
    if (newType === "MDelete" || baseType === "MDelete") {
        // This should not occur yet because we discard all modifications to deleted subtrees
        // In the long run we want to preserve them.
        fail("TODO: support modifications to deleted subtree");
    }
    switch (baseType) {
        case "Modify": {
            switch (newType) {
                case "Modify": {
                    updateModifyLike(newMark, baseMark);
                    if (baseMark.fields === undefined && baseMark.value === undefined) {
                        return 1;
                    }
                    return baseMark;
                }
                case "Delete": {
                    // For now the deletion obliterates all other modifications.
                    // In the long run we want to preserve them.
                    return clone(newMark);
                }
                default: fail("Not implemented");
            }
        }
        case "Revive": {
            switch (newType) {
                case "Modify": {
                    const modRevive: T.ModifyReattach = {
                        type: "MRevive",
                        id: baseMark.id,
                        tomb: baseMark.tomb,
                    };
                    updateModifyLike(newMark, modRevive);
                    return modRevive;
                }
                case "Delete": {
                    // The deletion undoes the revival
                    return 0;
                }
                default: fail("Not implemented");
            }
        }
        default: fail("Not implemented");
    }
}

function composeWithAttachGroup(baseMark: T.AttachGroup, newMark: T.SizedObjectMark): T.Mark {
    const newType = newMark.type;
    switch (newType) {
        case "Modify": {
            const attach = baseMark[0];
            const baseType = attach.type;
            switch (baseType) {
                case "Insert":
                    return [{
                        ...newMark,
                        type: "MInsert",
                        id: attach.id,
                        content: attach.content[0],
                    }];
                case "MInsert": {
                    updateModifyLike(newMark, attach);
                    return [attach];
                }
                default: fail("Not implemented");
            }
        }
        case "Delete": {
            // The insertion of the previous change is subsequently deleted.
            // TODO: preserve the insertion as muted
            return 0;
        }
        default: fail("Not implemented");
    }
}

function updateModifyLike(curr: T.Modify, base: T.ModifyInsert | T.Modify | T.ModifyReattach) {
    if (curr.fields !== undefined) {
        base.fields = composeFieldMarks(base.fields ?? {}, curr.fields);
        if (Object.keys(base.fields).length === 0) {
            delete base.fields;
        }
    }
    if (curr.value !== undefined) {
        // Later values override earlier ones
        base.value = clone(curr.value);
    }
}
