/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    getMarkLength,
    isAttachGroup,
    isDetachMark,
    isReattach,
    splitMark,
    Transposed as T,
} from "../../changeset";
import { clone, fail } from "../../util";
import { SequenceChangeset } from "./sequenceChangeset";

export function compose(changes: SequenceChangeset[]): SequenceChangeset {
    const base: SequenceChangeset = {
        marks: {},
    };
    for (const change of changes) {
        foldInFieldMarks(change.marks, base.marks);
    }
    return base;
}

function foldInFieldMarks(newFieldMarks: T.FieldMarks, baseFieldMarks: T.FieldMarks) {
    for (const key of Object.keys(newFieldMarks)) {
        const newMarkList = newFieldMarks[key];
        baseFieldMarks[key] ??= [];
        foldInMarkList(newMarkList, baseFieldMarks[key]);
    }
}

function foldInMarkList(
    newMarkList: T.MarkList<T.Mark>,
    baseMarkList: T.MarkList<T.Mark>,
): void {
    let iBase = 0;
    let iIn = 0;
    let nextNewMark: T.Mark | undefined = newMarkList[iIn];
    while (nextNewMark !== undefined) {
        let newMark: T.Mark = nextNewMark;
        nextNewMark = undefined;
        let baseMark = baseMarkList[iBase];
        if (baseMark === undefined) {
            baseMarkList.push(clone(newMark));
        } else if (isAttachGroup(newMark) || isReattach(newMark)) {
            baseMarkList.splice(iBase, 0, clone(newMark));
        } else if (isDetachMark(baseMark)) {
            // TODO: match base detaches to tombs and reattach in the newMarkList
            nextNewMark = newMark;
        } else {
            const newMarkLength = getMarkLength(newMark);
            const baseMarkLength = getMarkLength(baseMark);
            if (newMarkLength < baseMarkLength) {
                const baseMarkPair = splitMark(baseMark, newMarkLength);
                baseMark = baseMarkPair[0];
                baseMarkList.splice(iBase, 1, ...baseMarkPair);
            } else if (newMarkLength > baseMarkLength) {
                [newMark, nextNewMark] = splitMark(newMark, baseMarkLength);
            }
            // Passed this point, we are guaranteed that `newMark` and `baseMark` have the same length
            if (typeof baseMark === "number") {
                // TODO: insert new tombs and reattaches without replacing the offset
                baseMarkList.splice(iBase, 1, newMark);
            } else {
                const composedMark = composeMarks(newMark, baseMark);
                baseMarkList.splice(iBase, 1, ...composedMark);
                if (composedMark.length === 0) {
                    // If we're not inserting anything then the next base mark to consider will be at
                    // the same index. We decrement the index here to compensate the increment that
                    // always happens below.
                    iBase -= 1;
                }
            }
        }
        if (nextNewMark === undefined) {
            iIn += 1;
            nextNewMark = newMarkList[iIn];
        }
        iBase += 1;
    }
}

function composeMarks(
    newMark: T.SizedMark,
    baseMark: T.ObjectMark | T.AttachGroup,
): T.Mark[] {
    if (typeof newMark === "number") {
        return [baseMark];
    }
    const newType = newMark.type;
    if (isAttachGroup(baseMark)) {
        switch (newType) {
            case "Modify": {
                const attach = baseMark[0];
                if (attach.type === "Insert") {
                    return [[{
                        ...newMark,
                        type: "MInsert",
                        id: attach.id,
                        content: attach.content[0],
                    }]];
                } else if (attach.type === "MInsert") {
                    updateModifyLike(newMark, attach);
                    return [[attach]];
                }
                fail("Not implemented");
            }
            case "Delete": {
                // The insertion of the previous change is subsequently deleted.
                // TODO: preserve the insertion as muted
                return [];
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
                    return [baseMark];
                }
                case "Delete": {
                    // For now the deletion obliterates all other modifications.
                    // In the long run we want to preserve them.
                    return [{
                        type: "Delete",
                        id: newMark.id,
                        count: newMark.count,
                    }];
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
                    return [modRevive];
                }
                case "Delete": {
                    // The deletion undoes the revival
                    return [];
                }
                default: fail("Not implemented");
            }
        }
        default: fail("Not implemented");
    }
}
function updateModifyLike(curr: T.Modify, base: T.ModifyInsert | T.Modify | T.ModifyReattach) {
    if (curr.fields !== undefined) {
        if (base.fields === undefined) {
            base.fields = {};
        }
        foldInFieldMarks(curr.fields, base.fields);
    }
    if (curr.value !== undefined) {
        // Later values override earlier ones
        base.value = clone(curr.value);
    }
}
