/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SequenceField as SF } from "../../../feature-libraries";
import { makeAnonChange, RevisionTag, tagChange } from "../../../rebase";
import { TreeSchemaIdentifier } from "../../../schema-stored";
import { brand } from "../../../util";
import { TestChange } from "../../testChange";
import { deepFreeze } from "../../utils";
import {
    cases,
    checkDeltaEquality,
    createDeleteChangeset,
    createInsertChangeset,
    rebaseTagged,
    TestChangeset,
} from "./utils";

const type: TreeSchemaIdentifier = brand("Node");
const detachedBy: RevisionTag = brand(41);
const detachedBy2: RevisionTag = brand(42);

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
        const childChangeA = TestChange.mint([0], 1);
        const childChangeB = TestChange.mint([0], 2);
        const childChangeC = TestChange.mint([0, 1], 2);
        const change1: TestChangeset = [{ type: "Modify", changes: childChangeA }];
        const change2: TestChangeset = [{ type: "Modify", changes: childChangeB }];
        const expected: TestChangeset = [{ type: "Modify", changes: childChangeC }];
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
        const revive: TestChangeset = [
            { type: "Revive", id: 1, count: 2, detachedBy, detachIndex: 0 },
            2,
            { type: "Revive", id: 2, count: 2, detachedBy, detachIndex: 2 },
            4,
            { type: "Revive", id: 3, count: 2, detachedBy, detachIndex: 4 },
        ];
        const mods: TestChangeset = [
            { type: "Modify", changes: TestChange.mint([0], 1) },
            2,
            { type: "Modify", changes: TestChange.mint([0], 2) },
            4,
            { type: "Modify", changes: TestChange.mint([0], 3) },
        ];
        const actual = rebase(revive, mods);
        assert.deepEqual(actual, revive);
    });

    it("modify ↷ delete", () => {
        const mods: TestChangeset = [
            { type: "Modify", changes: TestChange.mint([0], 1) },
            2,
            { type: "Modify", changes: TestChange.mint([0], 2) },
            4,
            { type: "Modify", changes: TestChange.mint([0], 3) },
        ];
        const deletion: TestChangeset = [1, { type: "Delete", id: 1, count: 3 }];
        const actual = rebase(mods, deletion);
        const expected: TestChangeset = [
            // Set at an earlier index is unaffected by a delete at a later index
            { type: "Modify", changes: TestChange.mint([0], 1) },
            // Set as the same index as a delete is muted by the delete
            4,
            // Set at a later index moves to an earlier index due to a delete at an earlier index
            { type: "Modify", changes: TestChange.mint([0], 3) },
        ];
        assert.deepEqual(actual, expected);
    });

    it("insert ↷ delete", () => {
        const insert: TestChangeset = [
            { type: "Insert", id: 1, content: [{ type, value: 1 }] },
            2,
            { type: "Insert", id: 2, content: [{ type, value: 2 }] },
            4,
            { type: "Insert", id: 3, content: [{ type, value: 3 }] },
        ];
        const deletion: TestChangeset = [1, { type: "Delete", id: 1, count: 3 }];
        const actual = rebase(insert, deletion);
        const expected: TestChangeset = [
            // Earlier insert is unaffected
            { type: "Insert", id: 1, content: [{ type, value: 1 }] },
            1, // Overlapping insert has its index reduced
            { type: "Insert", id: 2, content: [{ type, value: 2 }] },
            2, // Later insert has its index reduced
            { type: "Insert", id: 3, content: [{ type, value: 3 }] },
        ];
        assert.deepEqual(actual, expected);
    });

    it("revive ↷ delete", () => {
        const revive: TestChangeset = [
            { type: "Revive", id: 1, count: 1, detachedBy, detachIndex: 0 },
            2,
            { type: "Revive", id: 2, count: 1, detachedBy, detachIndex: 1 },
            4,
            { type: "Revive", id: 3, count: 1, detachedBy, detachIndex: 2 },
        ];
        const deletion: TestChangeset = [1, { type: "Delete", id: 1, count: 3 }];
        const actual = rebase(revive, deletion);
        const expected: TestChangeset = [
            // Earlier revive is unaffected
            { type: "Revive", id: 1, count: 1, detachedBy, detachIndex: 0 },
            1, // Overlapping revive has its index reduced
            { type: "Revive", id: 2, count: 1, detachedBy, detachIndex: 1 },
            2, // Later revive has its index reduced
            { type: "Revive", id: 3, count: 1, detachedBy, detachIndex: 2 },
        ];
        assert.deepEqual(actual, expected);
    });

    it("delete ↷ overlapping delete", () => {
        // Deletes ---DEFGH--
        const deleteA: TestChangeset = [3, { type: "Delete", id: 2, count: 5 }];
        // Deletes --CD-F-HI
        const deleteB: TestChangeset = [
            2,
            { type: "Delete", id: 1, count: 2 },
            1,
            { type: "Delete", id: 2, count: 1 },
            1,
            { type: "Delete", id: 2, count: 2 },
        ];
        const actual = rebase(deleteA, deleteB);
        // Deletes --E-G
        const expected: TestChangeset = [2, { type: "Delete", id: 2, count: 2 }];
        assert.deepEqual(actual, expected);
    });

    it("delete ↷ earlier delete", () => {
        // Deletes ---DE
        const deleteA: TestChangeset = [3, { type: "Delete", id: 2, count: 2 }];
        // Deletes AB--
        const deleteB: TestChangeset = [{ type: "Delete", id: 1, count: 2 }];
        const actual = rebase(deleteA, deleteB);
        // Deletes -DE
        const expected: TestChangeset = [1, { type: "Delete", id: 2, count: 2 }];
        assert.deepEqual(actual, expected);
    });

    it("delete ↷ later delete", () => {
        // Deletes AB--
        const deleteA: TestChangeset = [{ type: "Delete", id: 1, count: 2 }];
        // Deletes ---DE
        const deleteB: TestChangeset = [2, { type: "Delete", id: 2, count: 2 }];
        const actual = rebase(deleteA, deleteB);
        assert.deepEqual(actual, deleteA);
    });

    it("modify ↷ insert", () => {
        const mods: TestChangeset = [
            { type: "Modify", changes: TestChange.mint([0], 1) },
            2,
            { type: "Modify", changes: TestChange.mint([0], 2) },
        ];
        const insert: TestChangeset = [2, { type: "Insert", id: 1, content: [{ type, value: 2 }] }];
        const expected: TestChangeset = [
            // Modify at earlier index is unaffected
            { type: "Modify", changes: TestChange.mint([0], 1) },
            3,
            // Modify at later index has its index increased
            { type: "Modify", changes: TestChange.mint([0], 2) },
        ];
        const actual = rebase(mods, insert);
        assert.deepEqual(actual, expected);
    });

    it("delete ↷ insert", () => {
        // Deletes A-CD-E
        const deletion: TestChangeset = [
            { type: "Delete", id: 1, count: 1 },
            1,
            { type: "Delete", id: 1, count: 2 },
            1,
            { type: "Delete", id: 1, count: 1 },
        ];
        // Inserts between C and D
        const insert: TestChangeset = [3, { type: "Insert", id: 1, content: [{ type, value: 2 }] }];
        const expected: TestChangeset = [
            // Delete with earlier index is unaffected
            { type: "Delete", id: 1, count: 1 },
            1,
            { type: "Delete", id: 1, count: 1 },
            1, // Delete at overlapping index is split
            { type: "Delete", id: 1, count: 1 },
            1,
            // Delete at later index has its index increased
            { type: "Delete", id: 1, count: 1 },
        ];
        const actual = rebase(deletion, insert);
        assert.deepEqual(actual, expected);
    });

    it("insert ↷ insert", () => {
        const insertA: TestChangeset = [
            { type: "Insert", id: 1, content: [{ type, value: 1 }] },
            2,
            { type: "Insert", id: 2, content: [{ type, value: 2 }] },
        ];
        const insertB: TestChangeset = [
            1,
            { type: "Insert", id: 3, content: [{ type, value: 3 }] },
        ];
        const actual = rebase(insertA, insertB);
        const expected: TestChangeset = [
            { type: "Insert", id: 1, content: [{ type, value: 1 }] },
            3,
            { type: "Insert", id: 2, content: [{ type, value: 2 }] },
        ];
        assert.deepEqual(actual, expected);
    });

    it("revive ↷ insert", () => {
        const revive: TestChangeset = [
            { type: "Revive", id: 1, count: 1, detachedBy, detachIndex: 0 },
            2,
            { type: "Revive", id: 2, count: 2, detachedBy, detachIndex: 1 },
            2,
            { type: "Revive", id: 3, count: 1, detachedBy, detachIndex: 3 },
        ];
        const insert: TestChangeset = [
            2,
            // TODO: test both tiebreak policies
            { type: "Insert", id: 3, content: [{ type, value: 3 }] },
        ];
        const actual = rebase(revive, insert);
        const expected: TestChangeset = [
            { type: "Revive", id: 1, count: 1, detachedBy, detachIndex: 0 },
            2,
            { type: "Revive", id: 2, count: 2, detachedBy, detachIndex: 1 },
            3,
            { type: "Revive", id: 3, count: 1, detachedBy, detachIndex: 3 },
        ];
        assert.deepEqual(actual, expected);
    });

    it("modify ↷ revive", () => {
        const mods: TestChangeset = [
            { type: "Modify", changes: TestChange.mint([0], 1) },
            2,
            { type: "Modify", changes: TestChange.mint([0], 2) },
        ];
        const revive: TestChangeset = [
            2,
            { type: "Revive", id: 1, count: 1, detachedBy, detachIndex: 0 },
        ];
        const expected: TestChangeset = [
            // Modify at earlier index is unaffected
            { type: "Modify", changes: TestChange.mint([0], 1) },
            3,
            // Modify at later index has its index increased
            { type: "Modify", changes: TestChange.mint([0], 2) },
        ];
        const actual = rebase(mods, revive);
        assert.deepEqual(actual, expected);
    });

    it("delete ↷ revive", () => {
        // Deletes A-CD-E
        const deletion: TestChangeset = [
            { type: "Delete", id: 1, count: 1 },
            1,
            { type: "Delete", id: 1, count: 2 },
            1,
            { type: "Delete", id: 1, count: 1 },
        ];
        // Revives content between C and D
        const revive: TestChangeset = [
            3,
            { type: "Revive", id: 1, count: 1, detachedBy, detachIndex: 0 },
        ];
        const expected: TestChangeset = [
            // Delete with earlier index is unaffected
            { type: "Delete", id: 1, count: 1 },
            1,
            { type: "Delete", id: 1, count: 1 },
            1, // Delete at overlapping index is split
            { type: "Delete", id: 1, count: 1 },
            1,
            // Delete at later index has its index increased
            { type: "Delete", id: 1, count: 1 },
        ];
        const actual = rebase(deletion, revive);
        assert.deepEqual(actual, expected);
    });

    it("insert ↷ revive", () => {
        const insert: TestChangeset = [
            { type: "Insert", id: 1, content: [{ type, value: 1 }] },
            2,
            { type: "Insert", id: 2, content: [{ type, value: 2 }] },
        ];
        const revive: TestChangeset = [
            1,
            { type: "Revive", id: 1, count: 1, detachedBy, detachIndex: 0 },
        ];
        const actual = rebase(insert, revive);
        const expected: TestChangeset = [
            { type: "Insert", id: 1, content: [{ type, value: 1 }] },
            3,
            { type: "Insert", id: 2, content: [{ type, value: 2 }] },
        ];
        assert.deepEqual(actual, expected);
    });

    it("revive ↷ different revive", () => {
        const reviveA: TestChangeset = [
            { type: "Revive", id: 1, count: 1, detachedBy, detachIndex: 0 },
            2,
            { type: "Revive", id: 2, count: 2, detachedBy, detachIndex: 1 },
            2,
            { type: "Revive", id: 3, count: 1, detachedBy, detachIndex: 3 },
        ];
        const reviveB: TestChangeset = [
            2,
            { type: "Revive", id: 1, count: 1, detachedBy: detachedBy2, detachIndex: 0 },
        ];
        const actual = rebase(reviveA, reviveB);
        const expected: TestChangeset = [
            { type: "Revive", id: 1, count: 1, detachedBy, detachIndex: 0 },
            2,
            { type: "Revive", id: 2, count: 2, detachedBy, detachIndex: 1 },
            3,
            { type: "Revive", id: 3, count: 1, detachedBy, detachIndex: 3 },
        ];
        assert.deepEqual(actual, expected);
    });

    // TODO: update rebase to detect overlap of revives
    it.skip("revive ↷ same revive", () => {
        const reviveA: TestChangeset = [
            { type: "Revive", id: 1, count: 1, detachedBy, detachIndex: 0 },
            2,
            { type: "Revive", id: 2, count: 2, detachedBy, detachIndex: 1 },
            2,
            { type: "Revive", id: 3, count: 1, detachedBy, detachIndex: 3 },
        ];
        const reviveB: TestChangeset = [
            2,
            { type: "Revive", id: 1, count: 1, detachedBy, detachIndex: 1 },
        ];
        const actual = rebase(reviveA, reviveB);
        const expected: TestChangeset = [
            { type: "Revive", id: 1, count: 1, detachedBy, detachIndex: 0 },
            2,
            { type: "Revive", id: 2, count: 1, detachedBy, detachIndex: 2 },
            3,
            { type: "Revive", id: 3, count: 1, detachedBy, detachIndex: 3 },
        ];
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
