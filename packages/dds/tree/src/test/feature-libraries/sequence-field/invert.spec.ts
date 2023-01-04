/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SequenceField as SF } from "../../../feature-libraries";
import { makeAnonChange, RevisionTag, tagChange } from "../../../rebase";
import { brand } from "../../../util";
import { TestChange } from "../../testChange";
import { deepFreeze } from "../../utils";
import { composeAnonChanges } from "./utils";
import { ChangeMaker as Change, TestChangeset } from "./testEdits";

function invert(change: TestChangeset): TestChangeset {
    deepFreeze(change);
    return SF.invert(makeAnonChange(change), TestChange.invert);
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
const inverseChildChange1 = TestChange.invert(childChange1);
const inverseChildChange2 = TestChange.invert(childChange2);

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
        const input = Change.revive(0, 2, tag, 0);
        const expected = Change.delete(0, 2);
        const actual = shallowInvert(input);
        assert.deepEqual(actual, expected);
    });

    it("revert-only muted revive => skip", () => {
        const input = composeAnonChanges([
            Change.modify(0, childChange1),
            Change.revive(0, 2, tag, 0, tag2),
            Change.modify(0, childChange2),
        ]);
        const expected = composeAnonChanges([
            Change.modify(0, inverseChildChange2),
            Change.modify(2, inverseChildChange1),
        ]);
        const actual = invert(input);
        assert.deepEqual(actual, expected);
    });

    it("revert-only blocked revive => no-op", () => {
        const input = composeAnonChanges([
            Change.modify(0, childChange1),
            Change.revive(0, 2, tag, 0, tag2, undefined, tag3),
            Change.modify(0, childChange2),
        ]);
        const expected = composeAnonChanges([Change.modify(0, inverseChildChange1)]);
        const actual = invert(input);
        assert.deepEqual(actual, expected);
    });

    it("intentional active revive => delete", () => {
        const input = Change.intentionalRevive(0, 2, tag, 0);
        const expected = Change.delete(0, 2);
        const actual = shallowInvert(input);
        assert.deepEqual(actual, expected);
    });

    it("intentional muted revive => skip", () => {
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
        const input = Change.move(0, 2, 3);
        const expected = Change.return(3, 2, 0, tag, 0);
        const actual = shallowInvert(input);
        assert.deepEqual(actual, expected);
    });

    it("return => return", () => {
        const input = Change.return(0, 2, 3, brand(41), 0);
        const expected = Change.return(3, 2, 0, tag, 0);
        const actual = shallowInvert(input);
        assert.deepEqual(actual, expected);
    });

    it("muted-move out + move-in => nil + nil", () => {
        const input: SF.Changeset<never> = [
            {
                type: "MoveOut",
                count: 1,
                id: brand(0),
                mutedBy: tag,
            },
            {
                type: "MoveIn",
                count: 1,
                id: brand(0),
                isSrcMuted: true,
            },
        ];
        const actual = shallowInvert(input);
        assert.deepEqual(actual, []);
    });

    it("muted return-from + return-to => nil + nil", () => {
        const input: SF.Changeset<never> = [
            {
                type: "ReturnFrom",
                count: 1,
                id: brand(0),
                detachedBy: tag2,
                mutedBy: tag,
            },
            {
                type: "ReturnTo",
                count: 1,
                id: brand(0),
                detachedBy: tag2,
                detachIndex: 0,
                isSrcMuted: true,
            },
        ];
        const actual = shallowInvert(input);
        assert.deepEqual(actual, []);
    });

    it("move-out + muted move-in => skip + skip", () => {
        const input: TestChangeset = [
            {
                type: "MoveOut",
                count: 1,
                id: brand(0),
                isDstMuted: true,
            },
            {
                type: "MoveIn",
                count: 1,
                id: brand(0),
                mutedBy: tag,
            },
            {
                type: "Modify",
                changes: childChange1,
            },
        ];
        const actual = invert(input);
        const expected = Change.modify(2, inverseChildChange1);
        assert.deepEqual(actual, expected);
    });

    it("return-from + muted return-to => skip + skip", () => {
        const input: TestChangeset = [
            {
                type: "ReturnFrom",
                count: 1,
                id: brand(0),
                detachedBy: tag2,
                isDstMuted: true,
            },
            {
                type: "ReturnTo",
                count: 1,
                id: brand(0),
                detachedBy: tag2,
                detachIndex: 0,
                mutedBy: tag,
            },
            {
                type: "Modify",
                changes: childChange1,
            },
        ];
        const actual = invert(input);
        const expected = Change.modify(2, inverseChildChange1);
        assert.deepEqual(actual, expected);
    });

    it("muted move-out + muted move-in => nil + skip", () => {
        const input: TestChangeset = [
            {
                type: "MoveOut",
                count: 1,
                id: brand(0),
                mutedBy: tag,
                isDstMuted: true,
            },
            {
                type: "Modify",
                changes: childChange1,
            },
            {
                type: "MoveIn",
                count: 1,
                id: brand(0),
                mutedBy: tag,
                isSrcMuted: true,
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

    it("muted return-from + muted return-to => nil + skip", () => {
        const input: TestChangeset = [
            {
                type: "ReturnFrom",
                count: 1,
                id: brand(0),
                detachedBy: tag2,
                mutedBy: tag,
                isDstMuted: true,
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
                mutedBy: tag,
                isSrcMuted: true,
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
                isDstMuted: true,
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
                mutedBy: tag,
                lastDetachedBy: tag3,
            },
            {
                type: "Modify",
                changes: childChange2,
            },
        ];
        const actual = invert(input);
        const expected = composeAnonChanges([
            Change.modify(1, inverseChildChange1),
            Change.modify(2, inverseChildChange2),
        ]);
        assert.deepEqual(actual, expected);
    });

    it("muted return-from + blocked return-to => nil + nil", () => {
        const input: TestChangeset = [
            {
                type: "ReturnFrom",
                count: 1,
                id: brand(0),
                detachedBy: tag2,
                mutedBy: tag,
                isDstMuted: true,
            },
            {
                type: "ReturnTo",
                count: 1,
                id: brand(0),
                detachedBy: tag2,
                detachIndex: 0,
                mutedBy: tag,
                lastDetachedBy: tag3,
                isSrcMuted: true,
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
