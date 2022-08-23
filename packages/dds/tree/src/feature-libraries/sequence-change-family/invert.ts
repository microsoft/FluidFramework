/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangesetTag, isSkipMark, OpId, Transposed as T } from "../../changeset";
import { fail } from "../../util";
import { SequenceChangeset } from "./sequenceChangeset";

/**
 * Dummy value used in place of the actual tag.
 * TODO: give `invert` access real tag data.
 */
 export const DUMMY_INVERT_TAG: ChangesetTag = "Dummy Invert Changeset Tag";

/**
 * Dummy value used in place of actual repair data.
 * TODO: give `invert` access real repair data.
 */
export const DUMMY_INVERSE_VALUE = "Dummy inverse value";

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
    return {
        marks: invertFieldMarks(change.marks, opIdToTag),
    };
}

type IdToTagLookup = (id: OpId) => ChangesetTag;

function invertFieldMarks(fieldMarks: T.FieldMarks, opIdToTag: IdToTagLookup): T.FieldMarks {
    const inverseFieldMarks: T.FieldMarks = {};
    for (const key of Object.keys(fieldMarks)) {
        const markList = fieldMarks[key];
        inverseFieldMarks[key] = invertMarkList(markList, opIdToTag);
    }
    return inverseFieldMarks;
}

function invertMarkList(markList: T.MarkList, opIdToTag: IdToTagLookup): T.MarkList {
    const inverseMarkList: T.MarkList = [];
    for (const mark of markList) {
        const inverseMarks = invertMark(mark, opIdToTag);
        inverseMarkList.push(...inverseMarks);
    }
    return inverseMarkList;
}

function invertMark(mark: T.Mark, opIdToTag: IdToTagLookup): T.Mark[] {
    if (isSkipMark(mark)) {
        return [mark];
    } else {
        switch (mark.type) {
            case "Insert":
            case "MInsert": {
                return [{
                    type: "Delete",
                    id: mark.id,
                    count: mark.type === "Insert" ? mark.content.length : 1,
                }];
            }
            case "Delete": {
                return [{
                    type: "Revive",
                    id: mark.id,
                    tomb: opIdToTag(mark.id),
                    count: mark.count,
                }];
            }
            case "Revive": {
                return [{
                    type: "Delete",
                    id: mark.id,
                    count: mark.count,
                }];
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
                return [modify];
            }
            default: fail("Not implemented");
        }
    }
}
