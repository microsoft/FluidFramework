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
    checkDeltaEquality,
    composeAnonChanges,
    getMaxId,
    normalizeMoveIds,
    rebaseTagged,
} from "./utils";
import { cases, ChangeMaker as Change, TestChangeset } from "./testEdits";

const tag1: RevisionTag = brand(41);
const tag2: RevisionTag = brand(42);

function rebase(change: TestChangeset, base: TestChangeset): TestChangeset {
    deepFreeze(change);
    deepFreeze(base);
    return SF.rebase(
        change,
        makeAnonChange(base),
        TestChange.rebase,
        TestChange.newIdAllocator(getMaxId(change, base)),
    );
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
                normalizeMoveIds(actual);
                assert.deepEqual(actual, testCase);
            });
        }
    });

    it("modify ↷ modify", () => {
        const change1 = Change.modify(0, TestChange.mint([0], 1));
        const change2 = Change.modify(0, TestChange.mint([0], 2));
        const expected = Change.modify(0, TestChange.mint([0, 1], 2));
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
        const revive = composeAnonChanges([
            Change.revive(0, 2, 0, tag1),
            Change.revive(4, 2, 2, tag1),
            Change.revive(10, 2, 4, tag1),
        ]);
        const mods = composeAnonChanges([
            Change.modify(0, TestChange.mint([0], 1)),
            Change.modify(3, TestChange.mint([0], 2)),
            Change.modify(8, TestChange.mint([0], 3)),
        ]);
        const actual = rebase(revive, mods);
        assert.deepEqual(actual, revive);
    });

    it("modify ↷ delete", () => {
        const mods = composeAnonChanges([
            Change.modify(0, TestChange.mint([0], 1)),
            Change.modify(3, TestChange.mint([0], 2)),
            Change.modify(8, TestChange.mint([0], 3)),
        ]);
        const deletion = Change.delete(1, 3);
        const actual = rebase(mods, deletion);
        const expected = composeAnonChanges([
            // Modify at an earlier index is unaffected by a delete at a later index
            Change.modify(0, TestChange.mint([0], 1)),
            // Modify as the same index as a delete is muted by the delete
            // Modify at a later index moves to an earlier index due to a delete at an earlier index
            Change.modify(5, TestChange.mint([0], 3)),
        ]);
        assert.deepEqual(actual, expected);
    });

    it("insert ↷ delete", () => {
        const insert = composeAnonChanges([
            Change.insert(0, 1, 1),
            Change.insert(3, 1, 2),
            Change.insert(8, 1, 3),
        ]);
        const deletion = Change.delete(1, 3);
        const actual = rebase(insert, deletion);
        const expected = composeAnonChanges([
            // Earlier insert is unaffected
            Change.insert(0, 1, 1),
            // Overlapping insert has its index reduced
            Change.insert(2, 1, 2),
            // Later insert has its index reduced
            Change.insert(5, 1, 3),
        ]);
        assert.deepEqual(actual, expected);
    });

    it("revive ↷ delete", () => {
        const revive = composeAnonChanges([
            Change.revive(0, 1, 0, tag1),
            Change.revive(3, 1, 1, tag1),
            Change.revive(8, 1, 2, tag1),
        ]);
        const deletion = Change.delete(1, 3);
        const actual = rebase(revive, deletion);
        const expected = composeAnonChanges([
            // Earlier revive is unaffected
            Change.revive(0, 1, 0, tag1),
            // Overlapping revive has its index reduced
            Change.revive(2, 1, 1, tag1),
            // Later revive has its index reduced
            Change.revive(5, 1, 2, tag1),
        ]);
        assert.deepEqual(actual, expected);
    });

    it("delete ↷ overlapping delete", () => {
        // Deletes ---DEFGH--
        const deleteA = Change.delete(3, 5);
        // Deletes --CD-F-HI
        const deleteB = composeAnonChanges([
            Change.delete(2, 2),
            Change.delete(3, 1),
            Change.delete(4, 2),
        ]);
        const actual = rebase(deleteA, deleteB);
        // Deletes --E-G
        const expected = Change.delete(2, 2);
        assert.deepEqual(actual, expected);
    });

    it("delete ↷ earlier delete", () => {
        // Deletes ---DE
        const deleteA = Change.delete(3, 2);
        // Deletes AB--
        const deleteB = Change.delete(0, 2);
        const actual = rebase(deleteA, deleteB);
        // Deletes -DE
        const expected = Change.delete(1, 2);
        assert.deepEqual(actual, expected);
    });

    it("delete ↷ later delete", () => {
        // Deletes AB--
        const deleteA = Change.delete(0, 2);
        // Deletes ---DE
        const deleteB = Change.delete(2, 2);
        const actual = rebase(deleteA, deleteB);
        assert.deepEqual(actual, deleteA);
    });

    it("move ↷ overlapping delete", () => {
        // Moves ---DEFGH--
        const move = Change.move(3, 5, 0);
        // Deletes --CD-F-HI
        const deletion = composeAnonChanges([
            Change.delete(2, 2),
            Change.delete(3, 1),
            Change.delete(4, 2),
        ]);
        const actual = rebase(move, deletion);
        normalizeMoveIds(actual);

        // Moves --E-G
        const expected = Change.move(2, 2, 0);
        normalizeMoveIds(expected);
        assert.deepEqual(actual, expected);
    });

    it("modify ↷ insert", () => {
        const mods = composeAnonChanges([
            Change.modify(0, TestChange.mint([0], 1)),
            Change.modify(3, TestChange.mint([0], 2)),
        ]);
        const insert = Change.insert(2, 1, 2);
        const expected = composeAnonChanges([
            // Modify at earlier index is unaffected
            Change.modify(0, TestChange.mint([0], 1)),
            // Modify at later index has its index increased
            Change.modify(4, TestChange.mint([0], 2)),
        ]);
        const actual = rebase(mods, insert);
        assert.deepEqual(actual, expected);
    });

    it("delete ↷ insert", () => {
        // Deletes A-CD-E
        const deletion = composeAnonChanges([
            Change.delete(0, 1),
            Change.delete(1, 2),
            Change.delete(2, 1),
        ]);
        // Inserts between C and D
        const insert = Change.insert(3, 1, 2);
        const expected = composeAnonChanges([
            // Delete with earlier index is unaffected
            Change.delete(0, 1),
            // Delete at overlapping index is split
            Change.delete(1, 1),
            Change.delete(2, 1),
            // Delete at later index has its index increased
            Change.delete(3, 1),
        ]);
        const actual = rebase(deletion, insert);
        assert.deepEqual(actual, expected);
    });

    it("insert ↷ insert", () => {
        const insertA = composeAnonChanges([Change.insert(0, 1, 1), Change.insert(3, 1, 2)]);
        const insertB = Change.insert(1, 1, 3);
        const actual = rebase(insertA, insertB);
        const expected = composeAnonChanges([Change.insert(0, 1, 1), Change.insert(4, 1, 2)]);
        assert.deepEqual(actual, expected);
    });

    it("revive ↷ insert", () => {
        const revive = composeAnonChanges([
            Change.revive(0, 1, 0, tag1),
            Change.revive(3, 2, 1, tag1),
            Change.revive(7, 1, 3, tag1),
        ]);
        // TODO: test both tiebreak policies
        const insert = Change.insert(2, 1);
        const actual = rebase(revive, insert);
        const expected = composeAnonChanges([
            Change.revive(0, 1, 0, tag1),
            Change.revive(3, 2, 1, tag1),
            Change.revive(8, 1, 3, tag1),
        ]);
        assert.deepEqual(actual, expected);
    });

    it("modify ↷ revive", () => {
        const mods = composeAnonChanges([
            Change.modify(0, TestChange.mint([0], 1)),
            Change.modify(3, TestChange.mint([0], 2)),
        ]);
        const revive = Change.revive(2, 1, 0, tag1);
        const expected = composeAnonChanges([
            // Modify at earlier index is unaffected
            Change.modify(0, TestChange.mint([0], 1)),
            // Modify at later index has its index increased
            Change.modify(4, TestChange.mint([0], 2)),
        ]);
        const actual = rebase(mods, revive);
        assert.deepEqual(actual, expected);
    });

    it("delete ↷ revive", () => {
        // Deletes A-CD-E
        const deletion = composeAnonChanges([
            Change.delete(0, 1),
            Change.delete(1, 2),
            Change.delete(2, 1),
        ]);
        // Revives content between C and D
        const revive = Change.revive(3, 1, 0, tag1);
        const expected = composeAnonChanges([
            // Delete with earlier index is unaffected
            Change.delete(0, 1),
            // Delete at overlapping index is split
            Change.delete(1, 1),
            Change.delete(2, 1),
            // Delete at later index has its index increased
            Change.delete(3, 1),
        ]);
        const actual = rebase(deletion, revive);
        assert.deepEqual(actual, expected);
    });

    it("insert ↷ revive", () => {
        const insert = composeAnonChanges([Change.insert(0, 1, 1), Change.insert(3, 1, 2)]);
        const revive = Change.revive(1, 1, 0, tag1);
        const actual = rebase(insert, revive);
        const expected = composeAnonChanges([Change.insert(0, 1, 1), Change.insert(4, 1, 2)]);
        assert.deepEqual(actual, expected);
    });

    it("revive ↷ different revive", () => {
        const reviveA = composeAnonChanges([
            Change.revive(0, 1, 0, tag1),
            Change.revive(3, 2, 1, tag1),
            Change.revive(7, 1, 3, tag1),
        ]);
        const reviveB = Change.revive(2, 1, 0, tag2);
        const actual = rebase(reviveA, reviveB);
        // TODO: test cases for both ordering of revived data
        const expected = composeAnonChanges([
            Change.revive(0, 1, 0, tag1),
            Change.revive(3, 2, 1, tag1),
            Change.revive(8, 1, 3, tag1),
        ]);
        assert.deepEqual(actual, expected);
    });

    // TODO: update rebase to detect overlap of revives
    it.skip("revive ↷ same revive", () => {
        const reviveA = composeAnonChanges([
            Change.revive(0, 1, 0, tag1),
            Change.revive(2, 2, 1, tag1),
            Change.revive(4, 1, 3, tag1),
        ]);
        const reviveB = Change.revive(2, 1, 1, tag1);
        const actual = rebase(reviveA, reviveB);
        const expected = composeAnonChanges([
            Change.revive(0, 1, 0, tag1),
            Change.revive(2, 1, 2, tag1),
            Change.revive(5, 1, 3, tag1),
        ]);
        assert.deepEqual(actual, expected);
    });

    it("concurrent inserts ↷ delete", () => {
        const delA = tagChange(Change.delete(0, 1), brand(1));
        const insertB = tagChange(Change.insert(0, 1), brand(2));
        const insertC = tagChange(Change.insert(1, 1), brand(3));
        const insertB2 = rebaseTagged(insertB, delA);
        const insertC2 = rebaseTagged(insertC, delA, insertB2);
        const expected = Change.insert(1, 1);
        checkDeltaEquality(insertC2.change, expected);
    });

    it("concurrent inserts ↷ connected delete", () => {
        const delA = tagChange(Change.delete(0, 1), brand(1));
        const delB = tagChange(Change.delete(1, 1), brand(2));
        const delC = tagChange(Change.delete(0, 1), brand(3));

        const insertD = tagChange(Change.insert(0, 1), brand(4));
        const insertE = tagChange(Change.insert(3, 1), brand(5));
        const insertD2 = rebaseTagged(insertD, delA, delB, delC);
        const insertE2 = rebaseTagged(insertE, delA, delB, delC, insertD2);
        const expected = Change.insert(1, 1);
        checkDeltaEquality(insertE2.change, expected);
    });

    it("concurrent insert and move ↷ delete", () => {
        const delA = tagChange(Change.delete(0, 1), brand(1));
        const insertB = tagChange(Change.insert(0, 1), brand(2));
        const moveC = tagChange(Change.move(2, 1, 1), brand(3));
        const insertB2 = rebaseTagged(insertB, delA);
        const moveC2 = rebaseTagged(moveC, delA, insertB2);
        const expected = Change.move(2, 1, 1);
        normalizeMoveIds(moveC2.change);
        checkDeltaEquality(moveC2.change, expected);
    });

    it("modify ↷ move", () => {
        const inner = TestChange.mint([0], 1);
        const modify = Change.modify(0, inner);
        const move = Change.move(0, 1, 3);
        const expected = Change.modify(3, inner);
        const rebased = rebase(modify, move);
        assert.deepEqual(rebased, expected);
    });

    it("delete ↷ move", () => {
        const deletion = Change.delete(2, 2);
        const move = Change.move(1, 3, 0);
        const expected = Change.delete(1, 2);
        const rebased = rebase(deletion, move);
        assert.deepEqual(rebased, expected);
    });

    it("move ↷ move", () => {
        const moveA = Change.move(2, 2, 0);
        const moveB = Change.move(2, 2, 3);
        const expected = Change.move(0, 2, 3);
        const rebased = rebase(moveB, moveA);
        normalizeMoveIds(rebased);
        assert.deepEqual(rebased, expected);
    });
});
