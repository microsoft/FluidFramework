/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { clone, fail, StackyIterator } from "../../util";
import {
    getInputLength,
    getOutputLength,
    isAttach,
    isModify,
    isReattach,
    isSkipMark,
    splitMarkOnInput,
} from "./utils";
import { Changeset, Mark, MarkList, SizedMark } from "./format";
import { MarkListFactory } from "./markListFactory";

/**
 * Rebases `change` over `base` assuming they both apply to the same initial state.
 * @param change - The changeset to rebase.
 * @param base - The changeset to rebase over.
 * @returns A changeset that performs the changes in `change` but does so assuming `base` has been applied first.
 *
 * WARNING! This implementation is incomplete:
 * - Marks that affect existing content are removed instead of muted when rebased over the deletion of that content.
 * This prevents us from then reinstating the mark when rebasing over the revive.
 * - Tombs are not added when rebasing an insert over a gap that is immediately left of deleted content.
 * This prevents us from being able to accurately track the position of the insert.
 * - Tiebreak ordering is not respected.
 * - Support for moves is not implemented.
 * - Support for slices is not implemented.
 */
export function rebase<TNodeChange>(
    change: Changeset<TNodeChange>,
    base: Changeset<TNodeChange>,
    rebaseChild: NodeChangeRebaser<TNodeChange>,
): Changeset<TNodeChange> {
    return rebaseMarkList(change, base, rebaseChild);
}

export type NodeChangeRebaser<TNodeChange> = (
    change: TNodeChange,
    baseChange: TNodeChange,
) => TNodeChange;

function rebaseMarkList<TNodeChange>(
    currMarkList: MarkList<TNodeChange>,
    baseMarkList: MarkList<TNodeChange>,
    rebaseChild: NodeChangeRebaser<TNodeChange>,
): MarkList<TNodeChange> {
    const factory = new MarkListFactory<TNodeChange>();
    const baseIter = new StackyIterator(baseMarkList);
    const currIter = new StackyIterator(currMarkList);
    for (let baseMark of baseIter) {
        let currMark: Mark<TNodeChange> | undefined = currIter.pop();
        if (currMark === undefined) {
            break;
        }

        if (isAttach(currMark)) {
            // We currently ignore the ways in which base marks could affect attaches.
            // These are:
            // 1. Slices with which the attach would commute.
            // 2. Attaches that target the same gap.
            // We ignore #1 because slices are not yet supported.
            // We ignore #2 because we do not yet support specifying the tiebreak.
            factory.pushContent(clone(currMark));
            baseIter.push(baseMark);
        } else if (isReattach(currMark)) {
            // We currently ignore the ways in which base marks could affect re-attaches.
            // These are:
            // 1. A reattach that targets the same tombs.
            // 2. Attaches that target the same gap.
            // We ignore #1 because it could only occur if undo were supported.
            // We ignore #2 because we do not yet support specifying the tiebreak.
            factory.pushContent(clone(currMark));
            baseIter.push(baseMark);
        } else if (isReattach(baseMark)) {
            // We currently ignore the ways in which curr marks overlap with this re-attach.
            // These are:
            // 1. A reattach that matches this re-attach.
            // 2. A tomb that matches this re-attach.
            // We ignore #1 because it could only occur if undo were supported.
            // We ignore #2 because we do not yet produce tombs.
            factory.pushOffset(getOutputLength(baseMark));
            currIter.push(currMark);
        } else if (isAttach(baseMark)) {
            // We currently ignore the ways in which curr marks overlap with these attaches.
            // These are:
            // 1. Slice ranges that include prior insertions
            // We ignore #1 because we do not yet support slices.
            factory.pushOffset(getOutputLength(baseMark));
            currIter.push(currMark);
        } else {
            // If we've reached this branch then `baseMark` and `currMark` start at the same location
            // in the document field at the revision to which both changesets apply.
            // Despite that, it's not necessarily true that they affect the same range in that document
            // field because they may be of different lengths.
            // We perform any necessary splitting in order to end up with a pair of marks that do have the same length.
            const currMarkLength = getInputLength(currMark);
            const baseMarkLength = getInputLength(baseMark);
            if (currMarkLength < baseMarkLength) {
                let nextBaseMark;
                [baseMark, nextBaseMark] = splitMarkOnInput(baseMark, currMarkLength);
                baseIter.push(nextBaseMark);
            } else if (currMarkLength > baseMarkLength) {
                let nextCurrMark;
                [currMark, nextCurrMark] = splitMarkOnInput(currMark, baseMarkLength);
                currIter.push(nextCurrMark);
            }
            // Past this point, we are guaranteed that `baseMark` and `currMark` have the same length and
            // start at the same location at the revision to which both changesets apply.
            // They therefore refer to the same range for that revision.
            const rebasedMark = rebaseMark(currMark, baseMark, rebaseChild);
            factory.push(rebasedMark);
        }
    }
    for (const currMark of currIter) {
        factory.push(currMark);
    }
    return factory.list;
}

function rebaseMark<TNodeChange>(
    currMark: SizedMark<TNodeChange>,
    baseMark: SizedMark<TNodeChange>,
    rebaseChild: NodeChangeRebaser<TNodeChange>,
): SizedMark<TNodeChange> {
    if (isSkipMark(baseMark)) {
        return clone(currMark);
    }
    const baseType = baseMark.type;
    switch (baseType) {
        case "Delete":
        case "MDelete":
            return 0;
        case "Modify": {
            if (isModify(currMark)) {
                return {
                    ...clone(currMark),
                    changes: rebaseChild(currMark.changes, baseMark.changes),
                };
            }
            return clone(currMark);
        }
        default:
            fail("Not implemented");
    }
}
