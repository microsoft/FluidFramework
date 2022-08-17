/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    getInputLength,
    getOutputLength,
    isAttachGroup,
    isDetachMark,
    isReattach,
    isSkipMark,
    MarkListFactory,
    splitMarkOnInput,
    splitMarkOnOutput,
    Transposed as T,
} from "../../changeset";
import { clone, fail } from "../../util";
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
    let iBase = 0;
    let iNew = 0;
    let nextBaseMark: T.Mark | undefined = baseMarkList[iBase];
    let nextNewMark: T.Mark | undefined = newMarkList[iNew];
    while (nextNewMark !== undefined) {
        let newMark: T.Mark = nextNewMark;
        let baseMark: T.Mark = nextBaseMark;
        nextNewMark = undefined;
        nextBaseMark = undefined;
        if (baseMark === undefined) {
            factory.push(clone(newMark));
        } else if (isAttachGroup(newMark) || isReattach(newMark)) {
            factory.pushContent(clone(newMark));
            nextBaseMark = baseMark;
        } else if (isDetachMark(baseMark)) {
            // TODO: match base detaches to tombs and reattach in the newMarkList
            factory.pushContent(baseMark);
            nextNewMark = newMark;
        } else {
            const newMarkLength = getInputLength(newMark);
            const baseMarkLength = getOutputLength(baseMark);
            if (newMarkLength < baseMarkLength) {
                [baseMark, nextBaseMark] = splitMarkOnOutput(baseMark, newMarkLength);
            } else if (newMarkLength > baseMarkLength) {
                [newMark, nextNewMark] = splitMarkOnInput(newMark, baseMarkLength);
            }
            // Past this point, we are guaranteed that `newMark` and `baseMark` have the same length
            if (isSkipMark(baseMark)) {
                // TODO: insert new tombs and reattaches without replacing the offset
                factory.push(newMark);
            } else {
                const composedMark = composeMarks(baseMark, newMark);
                factory.push(composedMark);
            }
        }
        if (nextBaseMark === undefined) {
            iBase += 1;
            nextBaseMark = baseMarkList[iBase];
        }
        if (nextNewMark === undefined) {
            iNew += 1;
            nextNewMark = newMarkList[iNew];
        }
    }
    if (nextBaseMark !== undefined) {
        factory.push(nextBaseMark);
    }
    factory.push(...baseMarkList.slice(iBase + 1));
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
function composeMarks(
    baseMark: T.ObjectMark,
    newMark: T.SizedMark,
): T.Mark {
    if (isSkipMark(newMark)) {
        return baseMark;
    }
    const newType = newMark.type;
    if (isAttachGroup(baseMark)) {
        switch (newType) {
            case "Modify": {
                const attach = baseMark[0];
                if (attach.type === "Insert") {
                    return [{
                        ...newMark,
                        type: "MInsert",
                        id: attach.id,
                        content: attach.content[0],
                    }];
                } else if (attach.type === "MInsert") {
                    updateModifyLike(newMark, attach);
                    return [attach];
                }
                fail("Not implemented");
            }
            case "Delete": {
                // The insertion of the previous change is subsequently deleted.
                // TODO: preserve the insertion as muted
                return 0;
            }
            default: fail("Not implemented");
        }
    }
    const baseType = baseMark.type;
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
                    return {
                        type: "Delete",
                        id: newMark.id,
                        count: newMark.count,
                    };
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
