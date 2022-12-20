/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangesetLocalId, SequenceField as SF } from "../../../feature-libraries";
import { Delta, TaggedChange } from "../../../core";
import { TestChange } from "../../testChange";
import { assertMarkListEqual, deepFreeze, fakeRepair } from "../../utils";
import { makeAnonChange, tagChange } from "../../../rebase";
import { brand } from "../../../util";
import { TestChangeset } from "./testEdits";

export function composeAnonChanges(changes: TestChangeset[]): TestChangeset {
    const taggedChanges = changes.map(makeAnonChange);
    return SF.sequenceFieldChangeRebaser.compose(
        taggedChanges,
        TestChange.compose,
        TestChange.newIdAllocator(getMaxIdTagged(taggedChanges)),
    );
}

export function rebaseTagged(
    change: TaggedChange<TestChangeset>,
    ...base: TaggedChange<TestChangeset>[]
): TaggedChange<TestChangeset> {
    deepFreeze(change);
    deepFreeze(base);

    let currChange = change;
    for (const baseChange of base) {
        currChange = tagChange(
            SF.rebase(
                currChange.change,
                baseChange,
                TestChange.rebase,
                TestChange.newIdAllocator(getMaxId(currChange.change, baseChange.change)),
            ),
            change.revision,
        );
    }
    return currChange;
}

export function checkDeltaEquality(actual: TestChangeset, expected: TestChangeset) {
    assertMarkListEqual(toDelta(actual), toDelta(expected));
}

function toDelta(change: TestChangeset): Delta.MarkList {
    return SF.sequenceFieldToDelta(change, TestChange.toDelta, fakeRepair);
}

export function getMaxId(...changes: SF.Changeset<unknown>[]): ChangesetLocalId | undefined {
    let max: ChangesetLocalId | undefined;
    for (const change of changes) {
        for (const mark of change) {
            if (SF.isMoveMark(mark)) {
                max = max === undefined ? mark.id : brand(Math.max(max, mark.id));
            }
        }
    }

    return max;
}

export function getMaxIdTagged(
    changes: TaggedChange<SF.Changeset<unknown>>[],
): ChangesetLocalId | undefined {
    return getMaxId(...changes.map((c) => c.change));
}

export function normalizeMoveIds(change: SF.Changeset<unknown>): void {
    let nextId = 0;
    const mappings = new Map<SF.MoveId, SF.MoveId>();
    for (const mark of change) {
        if (SF.isMoveMark(mark)) {
            let newId = mappings.get(mark.id);
            if (newId === undefined) {
                newId = brand(nextId++);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                mappings.set(mark.id, newId!);
            }
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            mark.id = newId!;
        }
    }
}
