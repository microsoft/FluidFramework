/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ChangesetTag,
    getInputLength,
    getOutputLength,
    isAttachGroup,
    isReattach,
    isSkipMark,
    MarkListFactory,
    splitMarkOnInput,
    Transposed as T,
} from "../../changeset";
import { clone, fail } from "../../util";
import { SequenceChangeset } from "./sequenceChangeset";

/**
 * Rebases `change` over `base` assuming they both apply to the same initial state.
 * @param change - The changeset to rebase.
 * @param base - The changeset to rebase over.
 * @returns A changeset that performs the changes in `change` but does so assuming `base` has been applied first.
 *
 * WARNING! This implementation is incomplete:
 * - Marks that affect existing content are removed instead of muted when rebased over the deletion of that content.
 *   This prevents us from then reinstating the mark when rebasing over the revive.
 * - Tombs are not added when rebasing an insert over a gap that is immediately left of deleted content.
 *   This prevents us from being able to accurately track the position of the insert.
 * - Tiebreak ordering is not respected.
 * - Support for moves is not implemented.
 * - Support for slices is not implemented.
 */
export function rebase(change: SequenceChangeset, base: SequenceChangeset): SequenceChangeset {
    const fields = rebaseFieldMarks(change.marks, base.marks);
    return {
        marks: fields,
    };
}

function rebaseFieldMarks(change: T.FieldMarks, base: T.FieldMarks): T.FieldMarks {
    const fields: T.FieldMarks = {};
    for (const key of Object.keys(change)) {
        if (key in base) {
            fields[key] = rebaseMarkList(change[key], base[key]);
        } else {
            fields[key] = clone(change[key]);
        }
    }
    return fields;
}

function rebaseMarkList(currMarkList: T.MarkList, baseMarkList: T.MarkList): T.MarkList {
    const factory = new MarkListFactory();
    let iBase = 0;
    let iCurr = 0;
    let nextCurrMark: T.Mark | undefined = currMarkList[iCurr];
    let nextBaseMark: T.Mark | undefined = baseMarkList[iBase];
    while (nextCurrMark !== undefined && nextBaseMark !== undefined) {
        let currMark: T.Mark = nextCurrMark;
        let baseMark: T.Mark = nextBaseMark;
        nextCurrMark = undefined;
        nextBaseMark = undefined;

        if (isAttachGroup(currMark) || isReattach(currMark)) {
            // TODO: respect tiebreak
            factory.pushContent(clone(currMark));
            nextBaseMark = baseMark;
        } else if (isAttachGroup(baseMark) || isReattach(baseMark)) {
            factory.pushOffset(getOutputLength(baseMark));
            nextCurrMark = currMark;
        } else {
            const currMarkLength = getInputLength(currMark);
            const baseMarkLength = getInputLength(baseMark);
            if (currMarkLength < baseMarkLength) {
                [baseMark, nextBaseMark] = splitMarkOnInput(baseMark, currMarkLength);
            } else if (currMarkLength > baseMarkLength) {
                [currMark, nextCurrMark] = splitMarkOnInput(currMark, baseMarkLength);
            }
            const rebasedMark = rebaseMark(currMark, baseMark);
            // Past this point, we are guaranteed that:
            //  * `currMark` and `baseMark` have the same length
            //  * `currMark` and `baseMark` are `T.SizedMark`s
            factory.push(rebasedMark);
        }
        if (nextCurrMark === undefined) {
            iCurr += 1;
            nextCurrMark = currMarkList[iCurr];
        }
        if (nextBaseMark === undefined) {
            iBase += 1;
            nextBaseMark = baseMarkList[iBase];
        }
    }
    if (nextCurrMark !== undefined) {
        factory.push(nextCurrMark, ...currMarkList.slice(iCurr + 1));
    }
    return factory.list;
}

export const DUMMY_TOMB_TAG: ChangesetTag = "Dummy Tombstone Changeset Tag";

function rebaseMark(currMark: T.SizedMark, baseMark: T.SizedMark): T.SizedMark {
    if (isSkipMark(baseMark)) {
        return clone(currMark);
    }
    const baseType = baseMark.type;
    switch (baseType) {
        case "Delete":
        case "MDelete":
            return 0;
        case "Modify":
            return clone(currMark);
        default: fail("Not implemented");
    }
}
