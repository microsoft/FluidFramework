/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { RevisionTag, TaggedChange } from "../../core";
import { fail } from "../../util";
import { Changeset, Mark, MarkList, MoveId } from "./format";
import { getInputLength, isObjMark, isSkipMark } from "./utils";

export type NodeChangeInverter<TNodeChange> = (change: TNodeChange) => TNodeChange;

/**
 * Inverts a given changeset.
 * @param change - The changeset to produce the inverse of.
 * @returns The inverse of the given `change` such that the inverse can be applied after `change`.
 *
 * WARNING! This implementation is incomplete:
 * - Support for slices is not implemented.
 */
export function invert<TNodeChange>(
    change: TaggedChange<Changeset<TNodeChange>>,
    invertChild: NodeChangeInverter<TNodeChange>,
): Changeset<TNodeChange> {
    return invertMarkList(change.change, change.revision, invertChild);
}

function invertMarkList<TNodeChange>(
    markList: MarkList<TNodeChange>,
    revision: RevisionTag | undefined,
    invertChild: NodeChangeInverter<TNodeChange>,
): MarkList<TNodeChange> {
    const inverseMarkList: MarkList<TNodeChange> = [];
    let inputIndex = 0;
    const movedChanges = new Map<MoveId, TNodeChange>();

    for (const mark of markList) {
        const inverseMarks = invertMark(mark, inputIndex, revision, invertChild, movedChanges);
        inverseMarkList.push(...inverseMarks);
        inputIndex += getInputLength(mark);
    }

    transferMovedChanges(inverseMarkList, movedChanges);
    return inverseMarkList;
}

function invertMark<TNodeChange>(
    mark: Mark<TNodeChange>,
    inputIndex: number,
    revision: RevisionTag | undefined,
    invertChild: NodeChangeInverter<TNodeChange>,
    movedChanges: Map<MoveId, TNodeChange>,
): Mark<TNodeChange>[] {
    if (isSkipMark(mark)) {
        return [mark];
    } else {
        switch (mark.type) {
            case "Insert": {
                return [
                    {
                        type: "Delete",
                        count: mark.type === "Insert" ? mark.content.length : 1,
                    },
                ];
            }
            case "Delete": {
                return [
                    {
                        type: "Revive",
                        detachedBy: mark.revision ?? revision,
                        detachIndex: inputIndex,
                        count: mark.count,
                    },
                ];
            }
            case "Revive": {
                return [
                    {
                        type: "Delete",
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
            case "MoveOut":
            case "ReturnFrom": {
                if (mark.changes !== undefined) {
                    movedChanges.set(mark.id, mark.changes);
                }
                return [
                    {
                        type: "ReturnTo",
                        id: mark.id,
                        count: mark.count,
                        detachedBy: mark.revision ?? revision,
                        detachIndex: inputIndex,
                    },
                ];
            }
            case "MoveIn":
            case "ReturnTo": {
                return [
                    {
                        type: "ReturnFrom",
                        id: mark.id,
                        count: mark.count,
                        detachedBy: mark.revision ?? revision,
                    },
                ];
            }
            default:
                fail("Not implemented");
        }
    }
}

function transferMovedChanges<TNodeChange>(
    marks: MarkList<TNodeChange>,
    movedChanges: Map<MoveId, TNodeChange>,
): void {
    for (const mark of marks) {
        if (isObjMark(mark) && (mark.type === "MoveOut" || mark.type === "ReturnFrom")) {
            const change = movedChanges.get(mark.id);
            if (change !== undefined) {
                mark.changes = change;
            }
        }
    }
}
