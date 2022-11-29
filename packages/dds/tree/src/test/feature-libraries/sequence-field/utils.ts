/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SequenceField as SF } from "../../../feature-libraries";
import { Delta, TaggedChange } from "../../../core";
import { TestChange } from "../../testChange";
import { assertMarkListEqual, deepFreeze, fakeRepair } from "../../utils";
import { makeAnonChange, tagChange } from "../../../rebase";
import { TestChangeset } from "./testEdits";

export function composeAnonChanges(changes: TestChangeset[]): TestChangeset {
    const taggedChanges = changes.map(makeAnonChange);
    return SF.sequenceFieldChangeRebaser.compose(taggedChanges, TestChange.compose);
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
            SF.rebase(currChange.change, baseChange, TestChange.rebase),
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
