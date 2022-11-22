/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SequenceField as SF } from "../../../feature-libraries";
import { brand } from "../../../util";
import { Delta, RevisionTag, TaggedChange, TreeSchemaIdentifier } from "../../../core";
import { TestChange } from "../../testChange";
import { assertMarkListEqual, deepFreeze, fakeRepair } from "../../utils";
import { tagChange } from "../../../rebase";

const type: TreeSchemaIdentifier = brand("Node");
const detachedBy: RevisionTag = brand(42);

export type TestChangeset = SF.Changeset<TestChange>;

export const cases: {
    no_change: TestChangeset;
    insert: TestChangeset;
    modify: TestChangeset;
    modify_insert: TestChangeset;
    delete: TestChangeset;
    revive: TestChangeset;
} = {
    no_change: [],
    insert: [
        1,
        {
            type: "Insert",
            id: 1,
            content: [
                { type, value: 1 },
                { type, value: 2 },
            ],
        },
    ],
    modify: [{ type: "Modify", changes: TestChange.mint([], 1) }],
    modify_insert: [
        1,
        {
            type: "MInsert",
            id: 1,
            content: { type, value: 1 },
            changes: TestChange.mint([], 2),
        },
    ],
    delete: [1, { type: "Delete", id: 1, count: 3 }],
    revive: [2, { type: "Revive", id: 1, count: 2, detachedBy, detachIndex: 0 }],
};

export function createInsertChangeset(index: number, size: number): TestChangeset {
    const content = [];
    while (content.length < size) {
        content.push({ type, value: content.length });
    }

    const insertMark: SF.Insert = {
        type: "Insert",
        id: 0,
        content,
    };

    const factory = new SF.MarkListFactory<TestChange>();
    factory.pushOffset(index);
    factory.pushContent(insertMark);
    return factory.list;
}

export function createDeleteChangeset(startIndex: number, size: number): TestChangeset {
    const deleteMark: SF.Detach = {
        type: "Delete",
        id: 0,
        count: size,
    };

    const factory = new SF.MarkListFactory<TestChange>();
    factory.pushOffset(startIndex);
    factory.pushContent(deleteMark);
    return factory.list;
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
