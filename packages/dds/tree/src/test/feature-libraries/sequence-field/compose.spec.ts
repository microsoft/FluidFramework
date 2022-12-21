/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { RevisionTag } from "../../../core";
import { SequenceField as SF } from "../../../feature-libraries";
import { makeAnonChange, tagChange, TaggedChange } from "../../../rebase";
import { TreeSchemaIdentifier } from "../../../schema-stored";
import { brand } from "../../../util";
import { TestChange } from "../../testChange";
import { deepFreeze } from "../../utils";
import { cases, ChangeMaker as Change, TestChangeset } from "./testEdits";
import { getMaxIdTagged, normalizeMoveIds } from "./utils";

const type: TreeSchemaIdentifier = brand("Node");
const tag1: RevisionTag = brand(1);
const tag2: RevisionTag = brand(2);
const tag3: RevisionTag = brand(3);
const tag4: RevisionTag = brand(4);

function compose(changes: TaggedChange<TestChangeset>[]): TestChangeset {
    changes.forEach(deepFreeze);
    return SF.compose(
        changes,
        TestChange.compose,
        TestChange.newIdAllocator(getMaxIdTagged(changes)),
    );
}

function composeNoVerify(changes: TaggedChange<TestChangeset>[]): TestChangeset {
    changes.forEach(deepFreeze);
    return SF.compose(
        changes,
        (cs: TaggedChange<TestChange>[]) => TestChange.compose(cs, false),
        TestChange.newIdAllocator(getMaxIdTagged(changes)),
    );
}

function shallowCompose(changes: TaggedChange<SF.Changeset>[]): SF.Changeset {
    changes.forEach(deepFreeze);
    return SF.sequenceFieldChangeRebaser.compose(
        changes,
        (children) => {
            assert(children.length === 1, "Should only have one child to compose");
            return children[0].change;
        },
        TestChange.newIdAllocator(getMaxIdTagged(changes)),
    );
}

describe("SequenceField - Compose", () => {
    describe("associativity of triplets", () => {
        const entries = Object.entries(cases);
        for (const a of entries) {
            for (const b of entries) {
                for (const c of entries) {
                    it(`((${a[0]}, ${b[0]}), ${c[0]}) === (${a[0]}, (${b[0]}, ${c[0]}))`, () => {
                        const ab = composeNoVerify([makeAnonChange(a[1]), makeAnonChange(b[1])]);
                        const left = composeNoVerify([makeAnonChange(ab), makeAnonChange(c[1])]);
                        const bc = composeNoVerify([makeAnonChange(b[1]), makeAnonChange(c[1])]);
                        const right = composeNoVerify([makeAnonChange(a[1]), makeAnonChange(bc)]);

                        normalizeMoveIds(left);
                        normalizeMoveIds(right);
                        assert.deepEqual(left, right);
                    });
                }
            }
        }
    });

    it("no changes", () => {
        const actual = shallowCompose([]);
        assert.deepEqual(actual, cases.no_change);
    });

    it("Does not leave empty mark lists and fields", () => {
        const insertion = Change.insert(0, 1);
        const deletion = Change.delete(0, 1);
        const actual = shallowCompose([makeAnonChange(insertion), makeAnonChange(deletion)]);
        assert.deepEqual(actual, cases.no_change);
    });

    it("insert ○ modify", () => {
        const insert = Change.insert(0, 2);
        const modify = Change.modify(0, TestChange.mint([], 42));
        const expected: TestChangeset = [
            {
                type: "Insert",
                content: [{ type, value: 0 }],
                changes: TestChange.mint([], 42),
            },
            { type: "Insert", content: [{ type, value: 1 }] },
        ];
        const actual = compose([makeAnonChange(insert), makeAnonChange(modify)]);
        assert.deepEqual(actual, expected);
    });

    it("modify insert ○ modify", () => {
        const childChangeA = TestChange.mint([0], 1);
        const childChangeB = TestChange.mint([0, 1], 2);
        const childChangeAB = TestChange.compose([
            makeAnonChange(childChangeA),
            makeAnonChange(childChangeB),
        ]);
        const insert: TestChangeset = [
            {
                type: "Insert",
                revision: tag1,
                content: [{ type, value: 1 }],
                changes: childChangeA,
            },
        ];
        const modify = Change.modify(0, childChangeB);
        const expected: TestChangeset = [
            {
                type: "Insert",
                revision: tag1,
                content: [{ type, value: 1 }],
                changes: childChangeAB,
            },
        ];
        const actual = compose([makeAnonChange(insert), makeAnonChange(modify)]);
        assert.deepEqual(actual, expected);
    });

    it("delete ○ modify", () => {
        const deletion = Change.delete(0, 3);
        const modify = Change.modify(0, { valueChange: { value: 2 } });
        const expected: SF.Changeset = [
            { type: "Delete", count: 3 },
            {
                type: "Modify",
                changes: { valueChange: { value: 2 } },
            },
        ];
        const actual = shallowCompose([makeAnonChange(deletion), makeAnonChange(modify)]);
        assert.deepEqual(actual, expected);
    });

    it("revive ○ modify", () => {
        const revive = Change.revive(0, 3, 0, tag1);
        const modify = Change.modify(0, { valueChange: { value: 2 } });
        const expected: SF.Changeset = [
            {
                type: "Revive",
                count: 1,
                detachedBy: tag1,
                detachIndex: 0,
                changes: { valueChange: { value: 2 } },
            },
            { type: "Revive", count: 2, detachedBy: tag1, detachIndex: 1 },
        ];
        const actual = shallowCompose([makeAnonChange(revive), makeAnonChange(modify)]);
        assert.deepEqual(actual, expected);
    });

    it("revive and modify ○ modify", () => {
        const childChangeA = TestChange.mint([0], 1);
        const childChangeB = TestChange.mint([0, 1], 2);
        const childChangeAB = TestChange.compose([
            makeAnonChange(childChangeA),
            makeAnonChange(childChangeB),
        ]);
        const revive: TestChangeset = [
            {
                type: "Revive",
                count: 1,
                detachedBy: tag1,
                detachIndex: 0,
                changes: childChangeA,
            },
        ];
        const modify: TestChangeset = [
            {
                type: "Modify",
                changes: childChangeB,
            },
        ];
        const expected: TestChangeset = [
            {
                type: "Revive",
                count: 1,
                detachedBy: tag1,
                detachIndex: 0,
                changes: childChangeAB,
            },
        ];
        const actual = compose([makeAnonChange(revive), makeAnonChange(modify)]);
        assert.deepEqual(actual, expected);
    });

    it("modify ○ modify", () => {
        const childChangeA = TestChange.mint([0], 1);
        const childChangeB = TestChange.mint([0, 1], 2);
        const childChangeAB = TestChange.compose([
            makeAnonChange(childChangeA),
            makeAnonChange(childChangeB),
        ]);
        const modifyA = Change.modify(0, childChangeA);
        const modifyB = Change.modify(0, childChangeB);
        const expected: TestChangeset = [
            {
                type: "Modify",
                changes: childChangeAB,
            },
        ];
        const actual = compose([makeAnonChange(modifyA), makeAnonChange(modifyB)]);
        assert.deepEqual(actual, expected);
    });

    it("insert ○ delete (within insert)", () => {
        const insert = Change.insert(0, 3, 1);
        const deletion = Change.delete(1, 1);
        const actual = shallowCompose([makeAnonChange(insert), makeAnonChange(deletion)]);
        const expected: SF.Changeset = [
            {
                type: "Insert",
                content: [
                    { type, value: 1 },
                    { type, value: 3 },
                ],
            },
        ];
        assert.deepEqual(actual, expected);
    });

    it("insert ○ move (within insert)", () => {
        const insert = Change.insert(0, 3, 1);
        const move = Change.move(1, 1, 0);
        const actual = shallowCompose([makeAnonChange(insert), makeAnonChange(move)]);
        const expected: SF.Changeset = [
            {
                type: "Insert",
                content: [
                    { type, value: 2 },
                    { type, value: 1 },
                    { type, value: 3 },
                ],
            },
        ];
        assert.deepEqual(actual, expected);
    });

    it("insert ○ delete (across inserts)", () => {
        const insert: SF.Changeset = [
            {
                type: "Insert",
                revision: tag1,
                content: [
                    { type, value: 1 },
                    { type, value: 2 },
                ],
            },
            {
                type: "Insert",
                revision: tag2,
                content: [
                    { type, value: 3 },
                    { type, value: 4 },
                ],
            },
            {
                type: "Insert",
                revision: tag1,
                content: [
                    { type, value: 5 },
                    { type, value: 6 },
                ],
            },
        ];
        const deletion = Change.delete(1, 4);
        const actual = shallowCompose([makeAnonChange(insert), makeAnonChange(deletion)]);
        const expected: SF.Changeset = [
            {
                type: "Insert",
                revision: tag1,
                content: [
                    { type, value: 1 },
                    { type, value: 6 },
                ],
            },
        ];
        assert.deepEqual(actual, expected);
    });

    it("insert ○ move (across inserts)", () => {
        const insert: SF.Changeset = [
            {
                type: "Insert",
                revision: tag1,
                content: [
                    { type, value: 1 },
                    { type, value: 2 },
                ],
            },
            {
                type: "Insert",
                revision: tag2,
                content: [
                    { type, value: 3 },
                    { type, value: 4 },
                ],
            },
            {
                type: "Insert",
                revision: tag1,
                content: [
                    { type, value: 5 },
                    { type, value: 6 },
                ],
            },
        ];
        const move = Change.move(1, 4, 0);
        const actual = shallowCompose([makeAnonChange(insert), makeAnonChange(move)]);
        const expected: SF.Changeset = [
            {
                type: "Insert",
                revision: tag1,
                content: [{ type, value: 2 }],
            },
            {
                type: "Insert",
                revision: tag2,
                content: [
                    { type, value: 3 },
                    { type, value: 4 },
                ],
            },
            {
                type: "Insert",
                revision: tag1,
                content: [
                    { type, value: 5 },
                    { type, value: 1 },
                    { type, value: 6 },
                ],
            },
        ];
        assert.deepEqual(actual, expected);
    });

    it("modify ○ delete", () => {
        const modify = Change.modify(0, { valueChange: { value: 1 } });
        const deletion = Change.delete(0, 1);
        const actual = shallowCompose([makeAnonChange(modify), makeAnonChange(deletion)]);
        assert.deepEqual(actual, deletion);
    });

    it("delete ○ delete", () => {
        // Deletes ABC-----IJKLM
        const deleteA: SF.Changeset = [
            { type: "Delete", count: 3 },
            5,
            { type: "Delete", count: 5 },
        ];
        // Deletes DEFG--OP
        const deleteB: SF.Changeset = [
            { type: "Delete", count: 4 },
            2,
            { type: "Delete", count: 2 },
        ];
        const actual = shallowCompose([tagChange(deleteA, tag1), tagChange(deleteB, tag2)]);
        // Deletes ABCDEFG-IJKLMNOP
        const expected: SF.Changeset = [
            { type: "Delete", revision: tag1, count: 3 },
            { type: "Delete", revision: tag2, count: 4 },
            1,
            { type: "Delete", revision: tag1, count: 5 },
            1,
            { type: "Delete", revision: tag2, count: 2 },
        ];
        assert.deepEqual(actual, expected);
    });

    it("revive ○ delete", () => {
        const revive = Change.revive(0, 5, 0, tag1);
        const deletion: SF.Changeset = [
            1,
            { type: "Delete", count: 1 },
            1,
            { type: "Delete", count: 3 },
        ];
        const actual = shallowCompose([makeAnonChange(revive), makeAnonChange(deletion)]);
        const expected: SF.Changeset = [
            { type: "Revive", count: 1, detachedBy: tag1, detachIndex: 0 },
            { type: "Revive", count: 1, detachedBy: tag1, detachIndex: 2 },
            { type: "Delete", count: 1 },
        ];
        assert.deepEqual(actual, expected);
    });

    it("revive and modify ○ delete", () => {
        const revive: SF.Changeset = [
            {
                type: "Revive",
                count: 1,
                revision: tag1,
                detachedBy: tag1,
                detachIndex: 0,
                changes: { valueChange: { value: 1 } },
            },
        ];
        const deletion: SF.Changeset = [{ type: "Delete", revision: tag3, count: 2 }];
        const actual = shallowCompose([makeAnonChange(revive), makeAnonChange(deletion)]);
        const expected: SF.Changeset = [{ type: "Delete", revision: tag3, count: 1 }];
        assert.deepEqual(actual, expected);
    });

    it("modify ○ insert", () => {
        const modify = Change.modify(0, { valueChange: { value: 1 } });
        const insert = Change.insert(0, 1, 2);
        const expected: SF.Changeset = [
            { type: "Insert", content: [{ type, value: 2 }] },
            {
                type: "Modify",
                changes: { valueChange: { value: 1 } },
            },
        ];
        const actual = shallowCompose([makeAnonChange(modify), makeAnonChange(insert)]);
        assert.deepEqual(actual, expected);
    });

    it("delete ○ insert", () => {
        const deletion = Change.delete(0, 3);
        const insert = Change.insert(0, 1, 2);
        // TODO: test with merge-right policy as well
        const expected: SF.Changeset = [
            { type: "Insert", content: [{ type, value: 2 }] },
            { type: "Delete", count: 3 },
        ];
        const actual = shallowCompose([makeAnonChange(deletion), makeAnonChange(insert)]);
        assert.deepEqual(actual, expected);
    });

    it("revive ○ insert", () => {
        const revive = Change.revive(0, 5, 0, tag1);
        const insert = Change.insert(0, 1, 2);
        // TODO: test with merge-right policy as well
        const expected: SF.Changeset = [
            { type: "Insert", content: [{ type, value: 2 }] },
            { type: "Revive", count: 5, detachedBy: tag1, detachIndex: 0 },
        ];
        const actual = shallowCompose([makeAnonChange(revive), makeAnonChange(insert)]);
        assert.deepEqual(actual, expected);
    });

    it("insert ○ insert", () => {
        const insertA: SF.Changeset = [
            { type: "Insert", revision: tag1, content: [{ type, value: 1 }] },
            2,
            {
                type: "Insert",
                revision: tag2,
                content: [
                    { type, value: 2 },
                    { type, value: 3 },
                ],
            },
        ];
        const insertB: SF.Changeset = [
            { type: "Insert", revision: tag3, content: [{ type, value: 3 }] },
            4,
            { type: "Insert", revision: tag4, content: [{ type, value: 4 }] },
        ];
        const actual = shallowCompose([makeAnonChange(insertA), makeAnonChange(insertB)]);
        const expected: SF.Changeset = [
            { type: "Insert", revision: tag3, content: [{ type, value: 3 }] },
            { type: "Insert", revision: tag1, content: [{ type, value: 1 }] },
            2,
            { type: "Insert", revision: tag2, content: [{ type, value: 2 }] },
            { type: "Insert", revision: tag4, content: [{ type, value: 4 }] },
            { type: "Insert", revision: tag2, content: [{ type, value: 3 }] },
        ];
        assert.deepEqual(actual, expected);
    });

    it("modify ○ revive", () => {
        const modify = Change.modify(0, { valueChange: { value: 1 } });
        const revive = Change.revive(0, 2, 0, tag1);
        const expected: SF.Changeset = [
            { type: "Revive", count: 2, detachedBy: tag1, detachIndex: 0 },
            {
                type: "Modify",
                changes: { valueChange: { value: 1 } },
            },
        ];
        const actual = shallowCompose([makeAnonChange(modify), makeAnonChange(revive)]);
        assert.deepEqual(actual, expected);
    });

    it("delete ○ revive", () => {
        const deletion = Change.delete(0, 3);
        const revive = Change.revive(0, 2, 0, tag1);
        // TODO: test with merge-right policy as well
        const expected: SF.Changeset = [
            { type: "Revive", count: 2, detachedBy: tag1, detachIndex: 0 },
            { type: "Delete", count: 3 },
        ];
        const actual = shallowCompose([makeAnonChange(deletion), makeAnonChange(revive)]);
        assert.deepEqual(actual, expected);
    });

    it("revive ○ revive", () => {
        const reviveA = Change.revive(0, 2, 0, tag1);
        const reviveB = Change.revive(0, 3, 0, tag2);
        // TODO: test with merge-right policy as well
        const expected: SF.Changeset = [
            { type: "Revive", count: 3, detachedBy: tag2, detachIndex: 0 },
            { type: "Revive", count: 2, detachedBy: tag1, detachIndex: 0 },
        ];
        const actual = shallowCompose([makeAnonChange(reviveA), makeAnonChange(reviveB)]);
        assert.deepEqual(actual, expected);
    });

    it("insert ○ revive", () => {
        const insert: SF.Changeset = [
            { type: "Insert", revision: tag1, content: [{ type, value: 1 }] },
            2,
            {
                type: "Insert",
                revision: tag2,
                content: [
                    { type, value: 2 },
                    { type, value: 3 },
                ],
            },
        ];
        const revive: SF.Changeset = [
            { type: "Revive", revision: tag3, count: 1, detachedBy: tag1, detachIndex: 0 },
            4,
            { type: "Revive", revision: tag4, count: 1, detachedBy: tag1, detachIndex: 0 },
        ];
        const actual = shallowCompose([makeAnonChange(insert), makeAnonChange(revive)]);
        const expected: SF.Changeset = [
            { type: "Revive", revision: tag3, count: 1, detachedBy: tag1, detachIndex: 0 },
            { type: "Insert", revision: tag1, content: [{ type, value: 1 }] },
            2,
            { type: "Insert", revision: tag2, content: [{ type, value: 2 }] },
            { type: "Revive", revision: tag4, count: 1, detachedBy: tag1, detachIndex: 0 },
            { type: "Insert", revision: tag2, content: [{ type, value: 3 }] },
        ];
        assert.deepEqual(actual, expected);
    });

    it("move ○ delete", () => {
        const move = Change.move(1, 1, 3);
        const deletion = Change.delete(3, 1);
        const expected = Change.delete(1, 1);
        const actual = shallowCompose([makeAnonChange(move), makeAnonChange(deletion)]);
        assert.deepEqual(actual, expected);
    });
});
