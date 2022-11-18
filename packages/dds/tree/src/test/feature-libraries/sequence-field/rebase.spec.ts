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
import {
    cases,
    checkDeltaEquality,
    createDeleteChangeset,
    createInsertChangeset,
    createModifyChangeset,
    createReviveChangeset,
    rebaseTagged,
    TestChangeset,
} from "./utils";

const tag1: RevisionTag = brand(41);
const tag2: RevisionTag = brand(42);

function rebase(change: TestChangeset, base: TestChangeset): TestChangeset {
    deepFreeze(change);
    deepFreeze(base);
    return SF.rebase(change, makeAnonChange(base), TestChange.rebase);
}

describe("SequenceField - Rebase", () => {
    describe("no changes ↷ *", () => {
        for (const [name, testCase] of Object.entries(cases)) {
            it(`no changes ↷ ${name}`, () => {
                const actual = rebase([], testCase);
                assert.deepEqual(actual, cases.no_change);
            });
        }
    });

    describe("* ↷ no changes", () => {
        for (const [name, testCase] of Object.entries(cases)) {
            it(`${name} ↷ no changes`, () => {
                const actual = rebase(testCase, cases.no_change);
                assert.deepEqual(actual, testCase);
            });
        }
    });

    it("modify ↷ modify", () => {
        const change1 = createModifyChangeset(0, TestChange.mint([0], 1));
        const change2 = createModifyChangeset(0, TestChange.mint([0], 2));
        const expected = createModifyChangeset(0, TestChange.mint([0, 1], 2));
        const actual = rebase(change2, change1);
        assert.deepEqual(actual, expected);
    });

    it("insert ↷ modify", () => {
        const actual = rebase(cases.insert, cases.modify);
        assert.deepEqual(actual, cases.insert);
    });

    it("modify insert ↷ modify", () => {
        const actual = rebase(cases.modify_insert, cases.modify);
        assert.deepEqual(actual, cases.modify_insert);
    });

    it("delete ↷ modify", () => {
        const actual = rebase(cases.delete, cases.modify);
        assert.deepEqual(actual, cases.delete);
    });

    it("revive ↷ modify", () => {
        const revive = SF.sequenceFieldChangeRebaser.compose(
            [
                createReviveChangeset(0, 2, 0, tag1),
                createReviveChangeset(4, 2, 2, tag1),
                createReviveChangeset(10, 2, 4, tag1),
            ],
            TestChange.compose,
        );
        const mods = SF.sequenceFieldChangeRebaser.compose(
            [
                createModifyChangeset(0, TestChange.mint([0], 1)),
                createModifyChangeset(3, TestChange.mint([0], 2)),
                createModifyChangeset(8, TestChange.mint([0], 3)),
            ],
            TestChange.compose,
        );
        const actual = rebase(revive, mods);
        assert.deepEqual(actual, revive);
    });

    it("modify ↷ delete", () => {
        const mods = SF.sequenceFieldChangeRebaser.compose(
            [
                createModifyChangeset(0, TestChange.mint([0], 1)),
                createModifyChangeset(3, TestChange.mint([0], 2)),
                createModifyChangeset(8, TestChange.mint([0], 3)),
            ],
            TestChange.compose,
        );
        const deletion = createDeleteChangeset(1, 3);
        const actual = rebase(mods, deletion);
        const expected = SF.sequenceFieldChangeRebaser.compose(
            [
                // Modify at an earlier index is unaffected by a delete at a later index
                createModifyChangeset(0, TestChange.mint([0], 1)),
                // Modify as the same index as a delete is muted by the delete
                // Modify at a later index moves to an earlier index due to a delete at an earlier index
                createModifyChangeset(5, TestChange.mint([0], 3)),
            ],
            TestChange.compose,
        );
        assert.deepEqual(actual, expected);
    });

    it("insert ↷ delete", () => {
        const insert = SF.sequenceFieldChangeRebaser.compose(
            [
                createInsertChangeset(0, 1, 1),
                createInsertChangeset(3, 1, 2),
                createInsertChangeset(8, 1, 3),
            ],
            TestChange.compose,
        );
        const deletion = createDeleteChangeset(1, 3);
        const actual = rebase(insert, deletion);
        const expected = SF.sequenceFieldChangeRebaser.compose(
            [
                // Earlier insert is unaffected
                createInsertChangeset(0, 1, 1),
                // Overlapping insert has its index reduced
                createInsertChangeset(2, 1, 2),
                // Later insert has its index reduced
                createInsertChangeset(5, 1, 3),
            ],
            TestChange.compose,
        );
        assert.deepEqual(actual, expected);
    });

    it("revive ↷ delete", () => {
        const revive = SF.sequenceFieldChangeRebaser.compose(
            [
                createReviveChangeset(0, 1, 0, tag1),
                createReviveChangeset(3, 1, 1, tag1),
                createReviveChangeset(8, 1, 2, tag1),
            ],
            TestChange.compose,
        );
        const deletion = createDeleteChangeset(1, 3);
        const actual = rebase(revive, deletion);
        const expected = SF.sequenceFieldChangeRebaser.compose(
            [
                // Earlier revive is unaffected
                createReviveChangeset(0, 1, 0, tag1),
                // Overlapping revive has its index reduced
                createReviveChangeset(2, 1, 1, tag1),
                // Later revive has its index reduced
                createReviveChangeset(5, 1, 2, tag1),
            ],
            TestChange.compose,
        );
        assert.deepEqual(actual, expected);
    });

    it("delete ↷ overlapping delete", () => {
        // Deletes ---DEFGH--
        const deleteA = createDeleteChangeset(3, 5);
        // Deletes --CD-F-HI
        const deleteB = SF.sequenceFieldChangeRebaser.compose(
            [createDeleteChangeset(2, 2), createDeleteChangeset(3, 1), createDeleteChangeset(4, 2)],
            TestChange.compose,
        );
        const actual = rebase(deleteA, deleteB);
        // Deletes --E-G
        const expected = createDeleteChangeset(2, 2);
        assert.deepEqual(actual, expected);
    });

    it("delete ↷ earlier delete", () => {
        // Deletes ---DE
        const deleteA = createDeleteChangeset(3, 2);
        // Deletes AB--
        const deleteB = createDeleteChangeset(0, 2);
        const actual = rebase(deleteA, deleteB);
        // Deletes -DE
        const expected = createDeleteChangeset(1, 2);
        assert.deepEqual(actual, expected);
    });

    it("delete ↷ later delete", () => {
        // Deletes AB--
        const deleteA = createDeleteChangeset(0, 2);
        // Deletes ---DE
        const deleteB = createDeleteChangeset(2, 2);
        const actual = rebase(deleteA, deleteB);
        assert.deepEqual(actual, deleteA);
    });

    it("modify ↷ insert", () => {
        const mods = SF.sequenceFieldChangeRebaser.compose(
            [
                createModifyChangeset(0, TestChange.mint([0], 1)),
                createModifyChangeset(3, TestChange.mint([0], 2)),
            ],
            TestChange.compose,
        );
        const insert = createInsertChangeset(2, 1, 2);
        const expected = SF.sequenceFieldChangeRebaser.compose(
            [
                // Modify at earlier index is unaffected
                createModifyChangeset(0, TestChange.mint([0], 1)),
                // Modify at later index has its index increased
                createModifyChangeset(4, TestChange.mint([0], 2)),
            ],
            TestChange.compose,
        );
        const actual = rebase(mods, insert);
        assert.deepEqual(actual, expected);
    });

    it("delete ↷ insert", () => {
        // Deletes A-CD-E
        const deletion = SF.sequenceFieldChangeRebaser.compose(
            [createDeleteChangeset(0, 1), createDeleteChangeset(1, 2), createDeleteChangeset(2, 1)],
            TestChange.compose,
        );
        // Inserts between C and D
        const insert = createInsertChangeset(3, 1, 2);
        const expected = SF.sequenceFieldChangeRebaser.compose(
            [
                // Delete with earlier index is unaffected
                createDeleteChangeset(0, 1),
                // Delete at overlapping index is split
                createDeleteChangeset(1, 1),
                createDeleteChangeset(2, 1),
                // Delete at later index has its index increased
                createDeleteChangeset(3, 1),
            ],
            TestChange.compose,
        );
        const actual = rebase(deletion, insert);
        assert.deepEqual(actual, expected);
    });

    it("insert ↷ insert", () => {
        const insertA = SF.sequenceFieldChangeRebaser.compose(
            [createInsertChangeset(0, 1, 1), createInsertChangeset(3, 1, 2)],
            TestChange.compose,
        );
        const insertB = createInsertChangeset(1, 1, 3);
        const actual = rebase(insertA, insertB);
        const expected = SF.sequenceFieldChangeRebaser.compose(
            [createInsertChangeset(0, 1, 1), createInsertChangeset(4, 1, 2)],
            TestChange.compose,
        );
        assert.deepEqual(actual, expected);
    });

    it("revive ↷ insert", () => {
        const revive = SF.sequenceFieldChangeRebaser.compose(
            [
                createReviveChangeset(0, 1, 0, tag1),
                createReviveChangeset(3, 2, 1, tag1),
                createReviveChangeset(7, 1, 3, tag1),
            ],
            TestChange.compose,
        );
        // TODO: test both tiebreak policies
        const insert = createInsertChangeset(2, 1);
        const actual = rebase(revive, insert);
        const expected = SF.sequenceFieldChangeRebaser.compose(
            [
                createReviveChangeset(0, 1, 0, tag1),
                createReviveChangeset(3, 2, 1, tag1),
                createReviveChangeset(8, 1, 3, tag1),
            ],
            TestChange.compose,
        );
        assert.deepEqual(actual, expected);
    });

    it("modify ↷ revive", () => {
        const mods = SF.sequenceFieldChangeRebaser.compose(
            [
                createModifyChangeset(0, TestChange.mint([0], 1)),
                createModifyChangeset(3, TestChange.mint([0], 2)),
            ],
            TestChange.compose,
        );
        const revive = createReviveChangeset(2, 1, 0, tag1);
        const expected = SF.sequenceFieldChangeRebaser.compose(
            [
                // Modify at earlier index is unaffected
                createModifyChangeset(0, TestChange.mint([0], 1)),
                // Modify at later index has its index increased
                createModifyChangeset(4, TestChange.mint([0], 2)),
            ],
            TestChange.compose,
        );
        const actual = rebase(mods, revive);
        assert.deepEqual(actual, expected);
    });

    it("delete ↷ revive", () => {
        // Deletes A-CD-E
        const deletion = SF.sequenceFieldChangeRebaser.compose(
            [createDeleteChangeset(0, 1), createDeleteChangeset(1, 2), createDeleteChangeset(2, 1)],
            TestChange.compose,
        );
        // Revives content between C and D
        const revive = createReviveChangeset(3, 1, 0, tag1);
        const expected = SF.sequenceFieldChangeRebaser.compose(
            [
                // Delete with earlier index is unaffected
                createDeleteChangeset(0, 1),
                // Delete at overlapping index is split
                createDeleteChangeset(1, 1),
                createDeleteChangeset(2, 1),
                // Delete at later index has its index increased
                createDeleteChangeset(3, 1),
            ],
            TestChange.compose,
        );
        const actual = rebase(deletion, revive);
        assert.deepEqual(actual, expected);
    });

    it("insert ↷ revive", () => {
        const insert = SF.sequenceFieldChangeRebaser.compose(
            [createInsertChangeset(0, 1, 1), createInsertChangeset(3, 1, 2)],
            TestChange.compose,
        );
        const revive = createReviveChangeset(1, 1, 0, tag1);
        const actual = rebase(insert, revive);
        const expected = SF.sequenceFieldChangeRebaser.compose(
            [createInsertChangeset(0, 1, 1), createInsertChangeset(4, 1, 2)],
            TestChange.compose,
        );
        assert.deepEqual(actual, expected);
    });

    it("revive ↷ different revive", () => {
        const reviveA = SF.sequenceFieldChangeRebaser.compose(
            [
                createReviveChangeset(0, 1, 0, tag1),
                createReviveChangeset(3, 2, 1, tag1),
                createReviveChangeset(7, 1, 3, tag1),
            ],
            TestChange.compose,
        );
        const reviveB = createReviveChangeset(2, 1, 0, tag2);
        const actual = rebase(reviveA, reviveB);
        // TODO: test cases for both ordering of revived data
        const expected = SF.sequenceFieldChangeRebaser.compose(
            [
                createReviveChangeset(0, 1, 0, tag1),
                createReviveChangeset(3, 2, 1, tag1),
                createReviveChangeset(8, 1, 3, tag1),
            ],
            TestChange.compose,
        );
        assert.deepEqual(actual, expected);
    });

    // TODO: update rebase to detect overlap of revives
    it.skip("revive ↷ same revive", () => {
        const reviveA = SF.sequenceFieldChangeRebaser.compose(
            [
                createReviveChangeset(0, 1, 0, tag1),
                createReviveChangeset(2, 2, 1, tag1),
                createReviveChangeset(4, 1, 3, tag1),
            ],
            TestChange.compose,
        );
        const reviveB = createReviveChangeset(2, 1, 1, tag1);
        const actual = rebase(reviveA, reviveB);
        const expected = SF.sequenceFieldChangeRebaser.compose(
            [
                createReviveChangeset(0, 1, 0, tag1),
                createReviveChangeset(2, 1, 2, tag1),
                createReviveChangeset(5, 1, 3, tag1),
            ],
            TestChange.compose,
        );
        assert.deepEqual(actual, expected);
    });

    it("concurrent inserts ↷ delete", () => {
        const delA = tagChange(createDeleteChangeset(0, 1), brand(1));
        const insertB = tagChange(createInsertChangeset(0, 1), brand(2));
        const insertC = tagChange(createInsertChangeset(1, 1), brand(3));
        const insertB2 = rebaseTagged(insertB, delA);
        const insertC2 = rebaseTagged(insertC, delA, insertB2);
        const expected = createInsertChangeset(1, 1);
        checkDeltaEquality(insertC2.change, expected);
    });

    it("concurrent inserts ↷ connected delete", () => {
        const delA = tagChange(createDeleteChangeset(0, 1), brand(1));
        const delB = tagChange(createDeleteChangeset(1, 1), brand(2));
        const delC = tagChange(createDeleteChangeset(0, 1), brand(3));

        const insertD = tagChange(createInsertChangeset(0, 1), brand(4));
        const insertE = tagChange(createInsertChangeset(3, 1), brand(5));
        const insertD2 = rebaseTagged(insertD, delA, delB, delC);
        const insertE2 = rebaseTagged(insertE, delA, delB, delC, insertD2);
        const expected = createInsertChangeset(1, 1);
        checkDeltaEquality(insertE2.change, expected);
    });
});
