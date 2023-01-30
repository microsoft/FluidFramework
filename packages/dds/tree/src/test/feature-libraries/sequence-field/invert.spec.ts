/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SequenceField as SF } from "../../../feature-libraries";
import { RevisionTag, tagChange } from "../../../core";
import { brand } from "../../../util";
import { TestChange } from "../../testChange";
import { deepFreeze } from "../../utils";
import { composeAnonChanges } from "./utils";
import { ChangeMaker as Change, TestChangeset } from "./testEdits";

function invert(change: TestChangeset): TestChangeset {
    deepFreeze(change);
    return SF.invert(tagChange(change, tag), TestChange.invert);
}

const tag: RevisionTag = brand(41);
const tag2: RevisionTag = brand(42);
const tag3: RevisionTag = brand(43);

function shallowInvert(change: SF.Changeset<unknown>): SF.Changeset<unknown> {
    deepFreeze(change);
    return SF.invert(tagChange(change, tag), () =>
        assert.fail("Unexpected call to child inverter"),
    );
}

const childChange1 = TestChange.mint([0], 1);
const childChange2 = TestChange.mint([1], 2);
const childChange3 = TestChange.mint([2], 3);
const inverseChildChange1 = TestChange.invert(childChange1);
const inverseChildChange2 = TestChange.invert(childChange2);
const inverseChildChange3 = TestChange.invert(childChange3);

describe("SequenceField - Invert", () => {
    it("no changes", () => {
        const input: SF.Changeset = [];
        const expected: SF.Changeset = [];
        const actual = shallowInvert(input);
        assert.deepEqual(actual, expected);
    });

    it("child changes", () => {
        const input = Change.modify(0, childChange1);
        const expected = Change.modify(0, inverseChildChange1);
        const actual = invert(input);
        assert.deepEqual(actual, expected);
    });

    it("insert => delete", () => {
        const input = Change.insert(0, 2);
        const expected = Change.delete(0, 2);
        const actual = shallowInvert(input);
        assert.deepEqual(actual, expected);
    });

    it("modified insert => delete", () => {
        const insert = Change.insert(0, 1);
        const modify = Change.modify(0, TestChange.mint([], 42));
        const input = composeAnonChanges([insert, modify]);
        const expected = Change.delete(0, 1);
        const actual = shallowInvert(input);
        assert.deepEqual(actual, expected);
    });

    it("delete => revive", () => {
        const input = Change.delete(0, 2);
        const expected = Change.revive(0, 2, tag, 0);
        const actual = shallowInvert(input);
        assert.deepEqual(actual, expected);
    });

    it("revert-only active revive => delete", () => {
        const revive = Change.revive(0, 2, tag, 0);
        const modify = Change.modify(0, TestChange.mint([], 42));
        const input = composeAnonChanges([revive, modify]);
        const expected = Change.delete(0, 2);
        const actual = shallowInvert(input);
        assert.deepEqual(actual, expected);
    });

    it("revert-only conflicted revive => skip", () => {
        const input: TestChangeset = [
            {
                type: "Modify",
                changes: childChange1,
            },
            {
                type: "Revive",
                count: 1,
                detachedBy: tag,
                detachIndex: 0,
                conflictsWith: tag2,
                changes: childChange2,
            },
            {
                type: "Modify",
                changes: childChange3,
            },
        ];
        const expected = composeAnonChanges([
            Change.modify(0, inverseChildChange1),
            Change.modify(1, inverseChildChange2),
            Change.modify(2, inverseChildChange3),
        ]);
        const actual = invert(input);
        assert.deepEqual(actual, expected);
    });

    it("revert-only blocked revive => no-op", () => {
        const input = composeAnonChanges([
            Change.modify(0, childChange1),
            Change.revive(1, 2, tag, 1, tag2, undefined, tag3),
            Change.modify(1, childChange2),
        ]);
        const expected = composeAnonChanges([
            Change.modify(0, inverseChildChange1),
            Change.modify(1, inverseChildChange2),
        ]);
        const actual = invert(input);
        assert.deepEqual(actual, expected);
    });

    it("intentional active revive => delete", () => {
        const input = Change.intentionalRevive(0, 2, tag, 0);
        const expected = Change.delete(0, 2);
        const actual = shallowInvert(input);
        assert.deepEqual(actual, expected);
    });

    it("intentional conflicted revive => skip", () => {
        const input = composeAnonChanges([
            Change.modify(0, childChange1),
            Change.intentionalRevive(0, 2, tag, 0, tag2),
            Change.modify(0, childChange2),
        ]);
        const expected = composeAnonChanges([
            Change.modify(0, inverseChildChange2),
            Change.modify(2, inverseChildChange1),
        ]);
        const actual = invert(input);
        assert.deepEqual(actual, expected);
    });

    it("move => return", () => {
        const input = composeAnonChanges([Change.modify(0, childChange1), Change.move(0, 2, 3)]);
        const expected = composeAnonChanges([
            Change.modify(3, inverseChildChange1),
            Change.return(3, 2, 0, tag),
        ]);
        const actual = invert(input);
        assert.deepEqual(actual, expected);
    });

    it("move backward => return", () => {
        const input = composeAnonChanges([Change.modify(3, childChange1), Change.move(2, 2, 0)]);
        const expected = composeAnonChanges([
            Change.modify(1, inverseChildChange1),
            Change.return(0, 2, 2, tag),
        ]);
        const actual = invert(input);
        assert.deepEqual(actual, expected);
    });

    it("return => return", () => {
        const input = composeAnonChanges([
            Change.modify(0, childChange1),
            Change.return(0, 2, 3, brand(41)),
        ]);
        const expected = composeAnonChanges([
            Change.modify(3, inverseChildChange1),
            Change.return(3, 2, 0, tag),
        ]);
        const actual = invert(input);
        assert.deepEqual(actual, expected);
    });

    it("conflicted-move out + move-in => nil + nil", () => {
        const input: TestChangeset = [
            {
                type: "MoveOut",
                count: 1,
                id: brand(0),
                conflictsWith: tag,
            },
            {
                type: "MoveIn",
                count: 1,
                id: brand(0),
                isSrcConflicted: true,
            },
            {
                type: "Modify",
                changes: childChange2,
            },
        ];
        const actual = invert(input);
        const expected = Change.modify(0, inverseChildChange2);
        assert.deepEqual(actual, expected);
    });

    it("conflicted return-from + return-to => nil + nil", () => {
        const input: TestChangeset = [
            {
                type: "ReturnFrom",
                count: 1,
                id: brand(0),
                detachedBy: tag2,
                conflictsWith: tag,
            },
            {
                type: "ReturnTo",
                count: 1,
                id: brand(0),
                detachedBy: tag2,
                detachIndex: 0,
                isSrcConflicted: true,
            },
            {
                type: "Modify",
                changes: childChange2,
            },
        ];
        const actual = invert(input);
        const expected = Change.modify(0, inverseChildChange2);
        assert.deepEqual(actual, expected);
    });

    it("move-out + conflicted move-in => skip + skip", () => {
        const input: TestChangeset = [
            {
                type: "MoveOut",
                count: 1,
                id: brand(0),
                isDstConflicted: true,
                changes: childChange1,
            },
            {
                type: "MoveIn",
                count: 1,
                id: brand(0),
                conflictsWith: tag,
            },
            {
                type: "Modify",
                changes: childChange2,
            },
        ];
        const actual = invert(input);
        const expected = composeAnonChanges([
            Change.modify(0, inverseChildChange1),
            Change.modify(1, inverseChildChange2),
        ]);
        assert.deepEqual(actual, expected);
    });

    it("return-from + conflicted return-to => skip + skip", () => {
        const input: TestChangeset = [
            {
                type: "ReturnFrom",
                count: 1,
                id: brand(0),
                detachedBy: tag2,
                isDstConflicted: true,
                changes: childChange1,
            },
            {
                type: "ReturnTo",
                count: 1,
                id: brand(0),
                detachedBy: tag2,
                detachIndex: 0,
                conflictsWith: tag,
            },
            {
                type: "Modify",
                changes: childChange2,
            },
        ];
        const actual = invert(input);
        const expected = composeAnonChanges([
            Change.modify(0, inverseChildChange1),
            Change.modify(2, inverseChildChange2),
        ]);
        assert.deepEqual(actual, expected);
    });

    it("conflicted move-out + conflicted move-in => nil + skip", () => {
        const input: TestChangeset = [
            {
                type: "MoveOut",
                count: 1,
                id: brand(0),
                conflictsWith: tag,
                isDstConflicted: true,
            },
            {
                type: "Modify",
                changes: childChange1,
            },
            {
                type: "MoveIn",
                count: 1,
                id: brand(0),
                conflictsWith: tag,
                isSrcConflicted: true,
            },
            {
                type: "Modify",
                changes: childChange2,
            },
        ];
        const actual = invert(input);
        const expected = composeAnonChanges([
            Change.modify(0, inverseChildChange1),
            Change.modify(1, inverseChildChange2),
        ]);
        assert.deepEqual(actual, expected);
    });

    it("conflicted return-from + conflicted return-to => nil + skip", () => {
        const input: TestChangeset = [
            {
                type: "ReturnFrom",
                count: 1,
                id: brand(0),
                detachedBy: tag2,
                conflictsWith: tag,
                isDstConflicted: true,
            },
            {
                type: "Modify",
                changes: childChange1,
            },
            {
                type: "ReturnTo",
                count: 1,
                id: brand(0),
                detachedBy: tag2,
                detachIndex: 0,
                conflictsWith: tag,
                isSrcConflicted: true,
            },
            {
                type: "Modify",
                changes: childChange2,
            },
        ];
        const actual = invert(input);
        const expected = composeAnonChanges([
            Change.modify(0, inverseChildChange1),
            Change.modify(2, inverseChildChange2),
        ]);
        assert.deepEqual(actual, expected);
    });

    it("return-from + blocked return-to => skip + nil", () => {
        const input: TestChangeset = [
            {
                type: "ReturnFrom",
                count: 1,
                id: brand(0),
                detachedBy: tag2,
                isDstConflicted: true,
                changes: childChange1,
            },
            {
                type: "Modify",
                changes: childChange2,
            },
            {
                type: "ReturnTo",
                count: 1,
                id: brand(0),
                detachedBy: tag2,
                detachIndex: 0,
                conflictsWith: tag,
                lastDetachedBy: tag3,
            },
            {
                type: "Modify",
                changes: childChange3,
            },
        ];
        const actual = invert(input);
        const expected = composeAnonChanges([
            Change.modify(0, inverseChildChange1),
            Change.modify(1, inverseChildChange2),
            Change.modify(2, inverseChildChange3),
        ]);
        assert.deepEqual(actual, expected);
    });

    it("conflicted return-from + blocked return-to => nil + nil", () => {
        const input: TestChangeset = [
            {
                type: "ReturnFrom",
                count: 1,
                id: brand(0),
                detachedBy: tag2,
                conflictsWith: tag,
                isDstConflicted: true,
            },
            {
                type: "ReturnTo",
                count: 1,
                id: brand(0),
                detachedBy: tag2,
                detachIndex: 0,
                conflictsWith: tag,
                lastDetachedBy: tag3,
                isSrcConflicted: true,
            },
            {
                type: "Modify",
                changes: childChange1,
            },
        ];
        const actual = invert(input);
        const expected = Change.modify(0, inverseChildChange1);
        assert.deepEqual(actual, expected);
    });
});
