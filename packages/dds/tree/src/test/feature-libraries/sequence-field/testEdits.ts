/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SequenceField as SF, singleTextCursor } from "../../../feature-libraries";
import { brand } from "../../../util";
import { RevisionTag, TreeSchemaIdentifier } from "../../../core";
import { TestChange } from "../../testChange";
import { makeAnonChange } from "../../../rebase";

const type: TreeSchemaIdentifier = brand("Node");
const tag: RevisionTag = brand(42);

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
    insert: createInsertChangeset(1, 2, 1),
    modify: SF.sequenceFieldEditor.buildChildChange(0, TestChange.mint([], 1)),
    modify_insert: SF.sequenceFieldChangeRebaser.compose(
        [
            makeAnonChange(createInsertChangeset(1, 1, 1)),
            makeAnonChange(createModifyChangeset(1, TestChange.mint([], 2))),
        ],
        TestChange.compose,
    ),
    delete: createDeleteChangeset(1, 3),
    revive: createReviveChangeset(2, 2, 0, tag),
};

function createInsertChangeset(
    index: number,
    size: number,
    startingValue: number = 0,
): SF.Changeset<never> {
    const content = [];
    while (content.length < size) {
        content.push({ type, value: startingValue + content.length });
    }
    return SF.sequenceFieldEditor.insert(index, content.map(singleTextCursor));
}

function createDeleteChangeset(startIndex: number, size: number): SF.Changeset<never> {
    return SF.sequenceFieldEditor.delete(startIndex, size);
}

function createReviveChangeset(
    startIndex: number,
    count: number,
    detachIndex: number,
    revision: RevisionTag,
): SF.Changeset<never> {
    return SF.sequenceFieldEditor.revive(startIndex, count, detachIndex, revision);
}

function createModifyChangeset<TNodeChange>(
    index: number,
    change: TNodeChange,
): SF.Changeset<TNodeChange> {
    return SF.sequenceFieldEditor.buildChildChange(index, change);
}

export const ChangeMaker = {
    insert: createInsertChangeset,
    delete: createDeleteChangeset,
    revive: createReviveChangeset,
    modify: createModifyChangeset,
};
