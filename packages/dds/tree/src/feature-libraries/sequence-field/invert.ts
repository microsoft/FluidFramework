/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "../../util";
import { NodeChangeInverter } from "../modular-schema";
import * as F from "./format";
import { isSkipMark } from "./utils";

/**
 * Dummy value used in place of the actual tag.
 * TODO: give `invert` access real tag data.
 */
 export const DUMMY_INVERT_TAG: F.ChangesetTag = "Dummy Invert Changeset Tag";

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
export function invert(change: F.Changeset, invertChild: NodeChangeInverter): F.Changeset {
    // TODO: support the input change being a squash
    const opIdToTag = (id: F.OpId): F.ChangesetTag => {
        return DUMMY_INVERT_TAG;
    };
    return invertMarkList(change, opIdToTag, invertChild);
}

type IdToTagLookup = (id: F.OpId) => F.ChangesetTag;

function invertMarkList(markList: F.MarkList, opIdToTag: IdToTagLookup, invertChild: NodeChangeInverter): F.MarkList {
    const inverseMarkList: F.MarkList = [];
    for (const mark of markList) {
        const inverseMarks = invertMark(mark, opIdToTag, invertChild);
        inverseMarkList.push(...inverseMarks);
    }
    return inverseMarkList;
}

function invertMark(mark: F.Mark, opIdToTag: IdToTagLookup, invertChild: NodeChangeInverter): F.Mark[] {
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
                return [{
                    type: "Modify",
                    changes: invertChild(mark.changes),
                }];
            }
            default: fail("Not implemented");
        }
    }
}
