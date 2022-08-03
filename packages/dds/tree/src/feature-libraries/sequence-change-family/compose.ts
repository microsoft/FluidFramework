/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getMarkLength, isAttachGroup, isDetachMark, splitMark, Transposed as T } from "../../changeset";
import { clone, fail } from "../../util";
import { SequenceChangeset } from "./sequenceChangeset";

export function compose(...changes: SequenceChangeset[]): SequenceChangeset {
    const total: SequenceChangeset = { marks: {} };
    for (const change of changes) {
        foldInChangeset(change, total);
    }
    return total;
}

function foldInChangeset(change: SequenceChangeset, totalChange: SequenceChangeset): void {
    const totalFieldMarks = totalChange.marks;
    const fieldMarks = change.marks;
    foldInFieldMarks(fieldMarks, totalFieldMarks);
}

function foldInFieldMarks(fieldMarks: T.FieldMarks, totalFieldMarks: T.FieldMarks) {
    for (const key of Object.keys(fieldMarks)) {
        const markList = fieldMarks[key];
        if (key in totalFieldMarks) {
            foldInMarkList(markList, totalFieldMarks[key]);
        } else {
            totalFieldMarks[key] = clone(markList);
        }
    }
}

function foldInMarkList(newMarkList: T.MarkList<T.Mark>, baseMarkList: T.MarkList<T.Mark>): void {
    let iTotal = 0;
    let iIn = 0;
    let nextNewMark: T.Mark | undefined = newMarkList[iIn];
    while (nextNewMark !== undefined) {
        let newMark: T.Mark = nextNewMark;
        nextNewMark = undefined;
        let baseMark = baseMarkList[iTotal];
        if (baseMark === undefined) {
            baseMarkList.push(newMark);
        } else if (isAttachGroup(newMark)) {
            baseMarkList.splice(iTotal, 0, clone(newMark));
        } else if (isDetachMark(baseMark)) {
            // TODO: match base detaches to tombs and reattach in the newMarkList
            nextNewMark = newMark;
        } else {
            const newMarkLength = getMarkLength(newMark);
            const baseMarkLength = getMarkLength(baseMark);
            if (newMarkLength < baseMarkLength) {
                const totalMarkPair = splitMark(baseMark, newMarkLength);
                baseMark = totalMarkPair[0];
                baseMarkList.splice(iTotal, 1, ...totalMarkPair);
            } else if (newMarkLength > baseMarkLength) {
                [newMark, nextNewMark] = splitMark(newMark, baseMarkLength);
            }
            // Passed this point, we are guaranteed that mark and total mark have the same length
            if (typeof baseMark === "number") {
                // TODO: insert new tombs and reattaches without replacing the offset
                baseMarkList.splice(iTotal, 1, newMark);
            } else {
                const composedMark = composeMarks(newMark, baseMark);
                baseMarkList.splice(iTotal, 1, ...composedMark);
            }
        }
        if (nextNewMark === undefined) {
            iIn += 1;
            nextNewMark = newMarkList[iIn];
        }
        iTotal += 1;
    }
}

function composeMarks(newMark: T.SizedMark, baseMark: T.ObjectMark | T.AttachGroup): T.Mark[] {
    if (typeof newMark === "number") {
        return [baseMark];
    }
    const markType = newMark.type;
    if (isAttachGroup(baseMark)) {
        switch (markType) {
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
                    return [[{
                        ...newMark,
                        type: "MInsert",
                        id: attach.id,
                        content: attach.content,
                    }]];
                }
            }
            case "Delete": {
                // The insertion of the previous change is subsequently deleted.
                // TODO: preserve the insertion as muted
                return [];
            }
            default: fail("Not implemented");
        }
    }
    const totalType = baseMark.type;
    if (markType === "MDelete" || totalType === "MDelete") {
        // This should not occur yet because we discard all modifications to deleted subtrees
        // In the long run we want to preserve them.
        fail("TODO: support modifications to deleted subtree");
    }
    switch (totalType) {
        case "Modify": {
            switch (markType) {
                case "Modify": {
                    updateModifyLike(newMark, baseMark);
                    return [baseMark];
                }
                case "Delete": {
                    // For now the deletion obliterates all other modifications.
                    // In the long run we want to preserve them.
                    return [clone(newMark)];
                }
                default: fail("Not implemented");
            }
        }
        default: fail("Not implemented");
    }
}
function updateModifyLike(curr: T.Modify, base: T.ModifyInsert | T.Modify) {
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
