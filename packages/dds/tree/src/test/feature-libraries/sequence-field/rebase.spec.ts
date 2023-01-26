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
import {
    checkDeltaEquality,
    composeAnonChanges,
    getMaxId,
    idAllocatorFromMaxId,
    normalizeMoveIds,
    rebaseTagged,
} from "./utils";
import { cases, ChangeMaker as Change, TestChangeset } from "./testEdits";

const tag1: RevisionTag = brand(41);
const tag2: RevisionTag = brand(42);
const tag3: RevisionTag = brand(43);

function rebase(change: TestChangeset, base: TestChangeset, baseRev?: RevisionTag): TestChangeset {
    deepFreeze(change);
    deepFreeze(base);
    return SF.rebase(
        change,
        tagChange(base, baseRev),
        TestChange.rebase,
        idAllocatorFromMaxId(getMaxId(change, base)),
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
            Change.revive(0, 2, tag1, 0),
            Change.revive(4, 2, tag1, 2),
            Change.revive(10, 2, tag1, 4),
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
            Change.revive(0, 1, tag1, 0),
            Change.revive(3, 1, tag1, 1),
            Change.revive(8, 1, tag1, 2),
        ]);
        const deletion = Change.delete(1, 3);
        const actual = rebase(revive, deletion, tag2);
        const expected = composeAnonChanges([
            // Earlier revive is unaffected
            Change.revive(0, 1, tag1, 0),
            // Overlapping revive has its index reduced
            Change.revive(2, 1, tag1, 1, undefined, [{ revision: tag2, offset: 1 }]),
            // Later revive has its index reduced
            Change.revive(5, 1, tag1, 2),
        ]);
        assert.deepEqual(actual, expected);
    });

    it("conflicted revive ↷ related delete", () => {
        const revive = Change.revive(0, 3, tag1, 1, tag2);
        const deletion = Change.delete(1, 1);
        const actual = rebase(revive, deletion, tag2);
        const expected = composeAnonChanges([
            // Earlier revive is unaffected
            Change.revive(0, 1, tag1, 1, tag2),
            // Overlapping revive is no longer conflicted
            Change.revive(1, 1, tag2, 1),
            // Later revive is unaffected
            Change.revive(2, 1, tag1, 3, tag2),
        ]);
        assert.deepEqual(actual, expected);
    });

    it("conflicted revive ↷ unrelated delete", () => {
        const revive = Change.revive(0, 3, tag1, 1, tag2);
        const deletion = Change.delete(1, 1);
        const actual = rebase(revive, deletion, tag3);
        const expected = composeAnonChanges([
            // Earlier revive is unaffected
            Change.revive(0, 1, tag1, 1, tag2),
            // Overlapping revive is now blocked
            Change.revive(1, 1, tag1, 1, tag2, undefined, tag3),
            // Later revive gets linage
            Change.revive(1, 1, tag1, 3, tag2),
        ]);
        assert.deepEqual(actual, expected);
    });

    it("blocked revive ↷ revive", () => {
        const revive1 = Change.revive(0, 3, tag1, 1, tag2, undefined, tag3);
        const revive2 = Change.revive(0, 1, tag3, 2);
        const actual = rebase(revive1, revive2, tag3);
        const expected = composeAnonChanges([
            // Earlier revive is unaffected
            Change.revive(0, 1, tag1, 1, tag2, undefined, tag3),
            // Overlapping revive remains conflicted but is no longer blocked
            Change.revive(0, 1, tag1, 2, tag2),
            // Later revive is unaffected
            Change.revive(1, 1, tag1, 3, tag2, undefined, tag3),
        ]);
        assert.deepEqual(actual, expected);
    });

    it("conflicted intent-full revive ↷ related delete", () => {
        const revive = Change.intentionalRevive(0, 3, tag1, 1, tag2);
        const deletion = Change.delete(1, 1);
        const actual = rebase(revive, deletion, tag2);
        const expected = composeAnonChanges([
            // Earlier revive is unaffected
            Change.intentionalRevive(0, 1, tag1, 1, tag2),
            // Overlapping revive is no longer conflicted.
            // It now references the target node to revive using the latest delete.
            Change.intentionalRevive(1, 1, tag2, 1),
            // Later revive is unaffected
            Change.intentionalRevive(2, 1, tag1, 3, tag2),
        ]);
        assert.deepEqual(actual, expected);
    });

    it("conflicted intent-full revive ↷ unrelated delete", () => {
        const revive = Change.intentionalRevive(0, 3, tag1, 1, tag2);
        const deletion = Change.delete(1, 1);
        const actual = rebase(revive, deletion, tag3);
        const expected = composeAnonChanges([
            // Earlier revive is unaffected
            Change.intentionalRevive(0, 1, tag1, 1, tag2),
            // Overlapping revive is no longer conflicted.
            // It now references the target node to revive using the latest delete.
            Change.intentionalRevive(1, 1, tag3, 1),
            // Later revive gets linage
            Change.intentionalRevive(2, 1, tag1, 3, tag2),
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
            Change.revive(0, 1, tag1, 0),
            Change.revive(3, 2, tag1, 1),
            Change.revive(7, 1, tag1, 3),
        ]);
        // TODO: test both tiebreak policies
        const insert = Change.insert(2, 1);
        const actual = rebase(revive, insert);
        const expected = composeAnonChanges([
            Change.revive(0, 1, tag1, 0),
            Change.revive(3, 2, tag1, 1),
            Change.revive(8, 1, tag1, 3),
        ]);
        assert.deepEqual(actual, expected);
    });

    it("conflicted revive ↷ insert", () => {
        const revive = Change.revive(0, 3, tag1, 0, tag2);
        const insert = Change.insert(1, 1);
        const actual = rebase(revive, insert);
        const expected = composeAnonChanges([
            Change.revive(0, 1, tag1, 0, tag2),
            Change.revive(2, 2, tag1, 1, tag2),
        ]);
        assert.deepEqual(actual, expected);
    });

    it("modify ↷ revive", () => {
        const mods = composeAnonChanges([
            Change.modify(0, TestChange.mint([0], 1)),
            Change.modify(3, TestChange.mint([0], 2)),
        ]);
        const revive = Change.revive(2, 1, tag1, 0);
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
        const revive = Change.revive(3, 1, tag1, 0);
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
        const revive = Change.revive(1, 1, tag1, 0);
        const actual = rebase(insert, revive);
        const expected = composeAnonChanges([Change.insert(0, 1, 1), Change.insert(4, 1, 2)]);
        assert.deepEqual(actual, expected);
    });

    it("reviveAA ↷ reviveB => BAA", () => {
        const reviveAA = Change.revive(0, 2, tag1, 1, undefined, [{ revision: tag2, offset: 1 }]);
        const reviveB = Change.revive(0, 1, tag2, 0);
        const expected = Change.revive(1, 2, tag1, 1, undefined, [{ revision: tag2, offset: 1 }]);
        const actual = rebase(reviveAA, reviveB);
        assert.deepEqual(actual, expected);
    });

    it("reviveAA ↷ reviveB => AAB", () => {
        const reviveAA = Change.revive(0, 2, tag1, 0, undefined, [{ revision: tag2, offset: 0 }]);
        const reviveB = Change.revive(0, 1, tag2, 0);
        const expected = Change.revive(0, 2, tag1, 0, undefined, [{ revision: tag2, offset: 0 }]);
        const actual = rebase(reviveAA, reviveB);
        assert.deepEqual(actual, expected);
    });

    it("reviveBB ↷ reviveA => BBA", () => {
        const reviveBB = Change.revive(0, 2, tag2, 0);
        const reviveA = Change.revive(0, 1, tag1, 2, undefined, [{ revision: tag2, offset: 2 }]);
        const expected = Change.revive(0, 2, tag2, 0);
        const actual = rebase(reviveBB, reviveA);
        assert.deepEqual(actual, expected);
    });

    // To fix this test we need to be able to compare lineage entries with detach indices.
    // See comments in RebaseQueue.pop
    it.skip("reviveBB ↷ reviveA => ABB", () => {
        const reviveBB = Change.revive(0, 2, tag2, 1);
        const reviveA = Change.revive(0, 1, tag1, 0, undefined, [{ revision: tag2, offset: 0 }]);
        const expected = Change.revive(1, 2, tag2, 1);
        const actual = rebase(reviveBB, reviveA);
        assert.deepEqual(actual, expected);
    });

    // To fix this test we need to be able to compare lineage entries with detach indices.
    // See comments in RebaseQueue.pop
    it.skip("reviveA ↷ reviveBB => BAB", () => {
        const reviveA = Change.revive(0, 1, tag1, 1, undefined, [{ revision: tag2, offset: 1 }]);
        const reviveBB = Change.revive(0, 2, tag2, 0);
        const expected = Change.revive(1, 1, tag1, 1, undefined, [{ revision: tag2, offset: 1 }]);
        const actual = rebase(reviveA, reviveBB);
        assert.deepEqual(actual, expected);
    });

    it("intentional revive ↷ same revive", () => {
        const reviveA = Change.intentionalRevive(0, 3, tag1, 1);
        const reviveB = Change.revive(0, 1, tag1, 2);
        const actual = rebase(reviveA, reviveB, tag2);
        const expected = composeAnonChanges([
            Change.intentionalRevive(0, 1, tag1, 1),
            Change.intentionalRevive(1, 1, tag1, 2, tag2),
            Change.intentionalRevive(2, 1, tag1, 3),
        ]);
        assert.deepEqual(actual, expected);
    });

    it("revive ↷ same revive (base within curr)", () => {
        const reviveA = Change.revive(0, 3, tag1, 1);
        const reviveB = Change.revive(0, 1, tag1, 2);
        const actual = rebase(reviveA, reviveB, tag2);
        const expected = composeAnonChanges([
            Change.revive(0, 1, tag1, 1),
            Change.revive(1, 1, tag1, 2, tag2),
            Change.revive(2, 1, tag1, 3),
        ]);
        assert.deepEqual(actual, expected);
    });

    it("revive ↷ same revive (curr within base)", () => {
        const reviveA = Change.revive(0, 1, tag1, 2);
        const reviveB = Change.revive(0, 3, tag1, 1);
        const actual = rebase(reviveA, reviveB, tag2);
        const expected = Change.revive(1, 1, tag1, 2, tag2);
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

    it("return-from + conflicted return-to ↷ move-out ", () => {
        const ret: SF.Changeset<never> = [
            {
                type: "ReturnTo",
                count: 1,
                id: brand(0),
                detachedBy: tag1,
                detachIndex: 0,
                conflictsWith: tag2,
            },
            10,
            {
                type: "ReturnFrom",
                count: 1,
                id: brand(0),
                detachedBy: tag1,
                isDstConflicted: true,
            },
        ];
        const move = Change.move(0, 1, 20);
        const actual = rebase(ret, move, tag3);
        const expected: SF.Changeset<never> = [
            {
                type: "ReturnTo",
                count: 1,
                id: brand(0),
                detachedBy: tag3,
                detachIndex: 0,
            },
            10,
            {
                type: "ReturnFrom",
                count: 1,
                id: brand(0),
                detachedBy: tag1,
            },
        ];
        normalizeMoveIds(actual);
        assert.deepEqual(actual, expected);
    });

    it("return ↷ related revive ", () => {
        const revive = Change.revive(0, 1, tag1, 0);
        const ret = Change.return(10, 1, 0, tag1);
        const actual = rebase(ret, revive, tag2);
        const expected: SF.Changeset<never> = [
            {
                type: "ReturnTo",
                count: 1,
                id: brand(0),
                detachedBy: tag1,
                detachIndex: 0,
                conflictsWith: tag2,
            },
            10,
            {
                type: "ReturnFrom",
                count: 1,
                id: brand(0),
                detachedBy: tag1,
                isDstConflicted: true,
            },
        ];
        normalizeMoveIds(actual);
        assert.deepEqual(actual, expected);
    });

    it("return ↷ return-from + conflicted return-to", () => {
        const ret1: SF.Changeset<never> = [
            {
                type: "ReturnFrom",
                count: 1,
                id: brand(0),
                detachedBy: tag1,
                isDstConflicted: true,
            },
            1,
            {
                type: "ReturnTo",
                count: 1,
                id: brand(0),
                detachedBy: tag1,
                detachIndex: 1,
                conflictsWith: tag2,
            },
        ];
        const ret2 = Change.return(0, 1, 10, tag3);
        const actual = rebase(ret2, ret1, brand(1));
        normalizeMoveIds(actual);
        assert.deepEqual(actual, ret2);
    });
});
