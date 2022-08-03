/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getMarkLength, isAttachGroup, splitMark, Transposed as T } from "../../changeset";
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

function foldInMarkList(markList: T.MarkList<T.Mark>, totalMarkList: T.MarkList<T.Mark>): void {
    let iTotal = 0;
    let iIn = 0;
    let nextMark: T.Mark | undefined = markList[iIn];
    while (nextMark !== undefined) {
        let mark: T.Mark = nextMark;
        nextMark = undefined;
        let totalMark = totalMarkList[iTotal];
        if (totalMark === undefined) {
            totalMarkList.push(mark);
        } else {
            if (isAttachGroup(mark)) {
                totalMarkList.splice(iTotal, 0, clone(mark));
            } else {
                const markLength = getMarkLength(mark);
                const totalMarkLength = getMarkLength(totalMark);
                if (markLength < totalMarkLength) {
                    const totalMarkPair = splitMark(totalMark, markLength);
                    totalMark = totalMarkPair[0];
                    totalMarkList.splice(iTotal, 1, ...totalMarkPair);
                } else if (markLength > totalMarkLength) {
                    [mark, nextMark] = splitMark(mark, totalMarkLength);
                }
                // Passed this point, we are guaranteed that mark and total mark have the same length
                const composedMark = composeMarks(mark, totalMark);
                if (composedMark !== 0) {
                    totalMarkList.splice(iTotal, 1, composedMark);
                } else {
                    totalMarkList.splice(iTotal, 1);
                }
            }
        }
        if (nextMark === undefined) {
            iIn += 1;
            nextMark = markList[iIn];
        }
        iTotal += 1;
    }
}

function composeMarks(mark: T.SizedMark, totalMark: T.Mark): T.Mark {
    if (typeof mark === "number") {
        return totalMark;
    }
    if (typeof totalMark === "number") {
        return clone(mark);
    }
    const markType = mark.type;
    if (isAttachGroup(totalMark)) {
        switch (markType) {
            case "Modify": {
                const attach = totalMark[0];
                if (attach.type === "Insert") {
                    return [{
                        ...mark,
                        type: "MInsert",
                        id: attach.id,
                        content: attach.content[0],
                    }];
                } else if (attach.type === "MInsert") {
                    updateModifyLike(mark, attach);
                    return [{
                        ...mark,
                        type: "MInsert",
                        id: attach.id,
                        content: attach.content,
                    }];
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
    const totalType = totalMark.type;
    if (markType === "MDelete" || totalType === "MDelete") {
        // This should not occur yet because we discard all modifications to deleted subtrees
        // In the long run we want to preserve them.
        fail("TODO: support modifications to deleted subtree");
    }
    switch (totalType) {
        case "Modify": {
            switch (markType) {
                case "Modify": {
                    updateModifyLike(mark, totalMark);
                    return totalMark;
                }
                case "Delete": {
                    // For now the deletion obliterates all other modifications.
                    // In the long run we want to preserve them.
                    return clone(mark);
                }
                default: fail("Not implemented");
            }
        }
        case "Delete": {
            switch (markType) {
                case "Delete": {
                    // For now we discard double deletions instead of marking them as muted
                    return totalMark;
                }
                case "Modify": {
                    // For now the deletion obliterates all other modifications.
                    // In the long run we want to preserve them.
                    return totalMark;
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
