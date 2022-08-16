/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangesetTag, isAttachGroup, isSkipMark, OpId, Transposed as T } from "../../changeset";
import { fail } from "../../util";
import { SequenceChangeset } from "./sequenceChangeset";

export const DUMMY_INVERT_TAG: ChangesetTag = "Dummy Invert Changeset Tag";

/**
 * Inverts a given changeset.
 * @param change - The changeset to produce the inverse of.
 * @returns The inverse of the given `change` such that the inverse can be applied after `change`.
 *
 * WARNING! This implementation is incomplete:
 * - It is unable to produce adequate inverses for set-value and delete operations.
 *   This is because changesets are not given IDs.
 * - Support for moves is not implemented.
 * - Support for slices is not implemented.
 */
export function invert(change: SequenceChangeset): SequenceChangeset {
    // TODO: support the input change being a squash
    const opIdToTag = (id: OpId): ChangesetTag => {
        return DUMMY_INVERT_TAG;
    };
    const total: SequenceChangeset = {
        marks: invertFieldMarks(change.marks, opIdToTag),
    };
    return total;
}

function invertFieldMarks(fieldMarks: T.FieldMarks, opIdToTag: (id: OpId) => ChangesetTag): T.FieldMarks {
    const inverseFieldMarks: T.FieldMarks = {};
    for (const key of Object.keys(fieldMarks)) {
        const markList = fieldMarks[key];
        inverseFieldMarks[key] = invertMarkList(markList, opIdToTag);
    }
    return inverseFieldMarks;
}

function invertMarkList(markList: T.MarkList, opIdToTag: (id: OpId) => ChangesetTag): T.MarkList {
    const inverseMarkList: T.MarkList = [];
    for (const mark of markList) {
        if (isSkipMark(mark)) {
            inverseMarkList.push(mark);
        } else if (isAttachGroup(mark)) {
            for (const attach of mark) {
                const type = attach.type;
                switch (type) {
                    case "Insert": {
                        inverseMarkList.push({
                            type: "Delete",
                            id: attach.id,
                            count: attach.content.length,
                        });
                        break;
                    }
                    case "MInsert": {
                        inverseMarkList.push({
                            type: "Delete",
                            id: attach.id,
                            count: 1,
                        });
                        break;
                    }
                    default: fail("Not implemented");
                }
            }
        } else {
            const type = mark.type;
            switch (type) {
                case "Delete": {
                    inverseMarkList.push({
                        type: "Revive",
                        id: mark.id,
                        tomb: opIdToTag(mark.id),
                        count: mark.count,
                    });
                    break;
                }
                case "Revive": {
                    inverseMarkList.push({
                        type: "Delete",
                        id: mark.id,
                        count: mark.count,
                    });
                    break;
                }
                case "Modify": {
                    const modify: T.Modify = {
                        type: "Modify",
                    };
                    if (mark.value !== undefined) {
                        modify.value = {
                            id: mark.value.id,
                            value: DUMMY_INVERSE_VALUE,
                        };
                    }
                    if (mark.fields !== undefined) {
                        modify.fields = invertFieldMarks(mark.fields, opIdToTag);
                    }
                    inverseMarkList.push(modify);
                    break;
                }
                default: fail("Not implemented");
            }
        }
    }
    return inverseMarkList;
}

/**
 * Dummy value used in place of actual repair data.
 * TODO: have `invert` access real repair data.
 */
export const DUMMY_INVERSE_VALUE = "Dummy inverse value";
