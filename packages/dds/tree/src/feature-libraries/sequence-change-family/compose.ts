/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    getMarkLength,
    isAttachGroup,
    isDetachMark,
    isReattach,
    MarkListFactory,
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
        const baseMarkList = foldInMarkList(newMarkList, baseFieldMarks[key]);
        baseFieldMarks[key] = baseMarkList;
        while (typeof baseMarkList[baseMarkList.length - 1] === "number") {
            baseMarkList.pop();
        }
        if (baseMarkList.length === 0) {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete baseFieldMarks[key];
        }
    }
}

function foldInMarkList(
    newMarkList: T.MarkList,
    baseMarkList: T.MarkList,
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
            const newMarkLength = getMarkLength(newMark);
            const baseMarkLength = getMarkLength(baseMark);
            if (newMarkLength < baseMarkLength) {
                [baseMark, nextBaseMark] = splitMark(baseMark, newMarkLength);
            } else if (newMarkLength > baseMarkLength) {
                [newMark, nextNewMark] = splitMark(newMark, baseMarkLength);
            }
            // Passed this point, we are guaranteed that `newMark` and `baseMark` have the same length
            if (typeof baseMark === "number") {
                // TODO: insert new tombs and reattaches without replacing the offset
                factory.push(newMark);
            } else {
                const composedMark = composeMarks(newMark, baseMark);
                factory.push(...composedMark);
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
                    if (baseMark.fields === undefined && baseMark.value === undefined) {
                        return [1];
                    }
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
        base.fields ??= {};
        foldInFieldMarks(curr.fields, base.fields);
        if (Object.keys(base.fields).length === 0) {
            delete base.fields;
        }
    }
    if (curr.value !== undefined) {
        // Later values override earlier ones
        base.value = clone(curr.value);
    }
}
