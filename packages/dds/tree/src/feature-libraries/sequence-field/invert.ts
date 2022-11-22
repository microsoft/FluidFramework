/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { RevisionTag, TaggedChange } from "../../core";
import { fail } from "../../util";
import { Changeset, Mark, MarkList, OpId } from "./format";
import { getInputLength, isSkipMark } from "./utils";

export type NodeChangeInverter<TNodeChange> = (change: TNodeChange) => TNodeChange;

/**
 * Inverts a given changeset.
 * @param change - The changeset to produce the inverse of.
 * @returns The inverse of the given `change` such that the inverse can be applied after `change`.
 *
 * WARNING! This implementation is incomplete:
 * - It is unable to produce adequate inverses for set-value and delete operations.
 * This is because changesets are not given IDs.
 * - Support for moves is not implemented.
 * - Support for slices is not implemented.
 */
export function invert<TNodeChange>(
    change: TaggedChange<Changeset<TNodeChange>>,
    invertChild: NodeChangeInverter<TNodeChange>,
): Changeset<TNodeChange> {
    // TODO: support the input change being a squash
    const opIdToTag = (id: OpId): RevisionTag | undefined => {
        return change.revision;
    };
    return invertMarkList(change.change, opIdToTag, invertChild);
}

type IdToTagLookup = (id: OpId) => RevisionTag | undefined;

function invertMarkList<TNodeChange>(
    markList: MarkList<TNodeChange>,
    opIdToTag: IdToTagLookup,
    invertChild: NodeChangeInverter<TNodeChange>,
): MarkList<TNodeChange> {
    const inverseMarkList: MarkList<TNodeChange> = [];
    let inputIndex = 0;
    for (const mark of markList) {
        const inverseMarks = invertMark(mark, inputIndex, opIdToTag, invertChild);
        inverseMarkList.push(...inverseMarks);
        inputIndex += getInputLength(mark);
    }
    return inverseMarkList;
}

function invertMark<TNodeChange>(
    mark: Mark<TNodeChange>,
    inputIndex: number,
    opIdToTag: IdToTagLookup,
    invertChild: NodeChangeInverter<TNodeChange>,
): Mark<TNodeChange>[] {
    if (isSkipMark(mark)) {
        return [mark];
    } else {
        switch (mark.type) {
            case "Insert":
            case "MInsert": {
                return [
                    {
                        type: "Delete",
                        id: mark.id,
                        count: mark.type === "Insert" ? mark.content.length : 1,
                    },
                ];
            }
            case "Delete": {
                return [
                    {
                        type: "Revive",
                        id: mark.id,
                        detachedBy: opIdToTag(mark.id),
                        detachIndex: inputIndex,
                        count: mark.count,
                    },
                ];
            }
            case "Revive": {
                return [
                    {
                        type: "Delete",
                        id: mark.id,
                        count: mark.count,
                    },
                ];
            }
            case "Modify": {
                return [
                    {
                        type: "Modify",
                        changes: invertChild(mark.changes),
                    },
                ];
            }
            default:
                fail("Not implemented");
        }
    }
}
