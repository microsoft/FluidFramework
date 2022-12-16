/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SequenceField as SF } from "../../../feature-libraries";
import { RevisionTag, tagChange, tagInverse } from "../../../rebase";
import { brand } from "../../../util";
import { TestChange } from "../../testChange";
import { deepFreeze, fakeRepair } from "../../utils";
import {
    checkDeltaEquality,
    composeAnonChanges,
    getMaxIdTagged,
    normalizeMoveIds,
    rebaseTagged,
} from "./utils";
import { ChangeMaker as Change } from "./testEdits";

const detachedBy: RevisionTag = brand(41);

const testChanges: [string, (index: number) => SF.Changeset<TestChange>][] = [
    ["SetValue", (i) => Change.modify(i, TestChange.mint([], 1))],
    [
        "MInsert",
        (i) =>
            composeAnonChanges([Change.insert(i, 1, 42), Change.modify(i, TestChange.mint([], 2))]),
    ],
    ["Insert", (i) => Change.insert(i, 2, 42)],
    ["Delete", (i) => Change.delete(i, 2)],
    ["Revive", (i) => Change.revive(i, 2, 0, detachedBy)],
    ["MoveOut", (i) => Change.move(i, 2, 1)],
    ["MoveIn", (i) => Change.move(1, 2, i)],
    ["ReturnFrom", (i) => Change.return(i, 2, 1, detachedBy, 0)],
    ["ReturnTo", (i) => Change.return(1, 2, i, detachedBy, 0)],
];
deepFreeze(testChanges);

// TODO: Refactor these tests to support moves
describe("SequenceField - Rebaser Axioms", () => {
    /**
     * This test simulates rebasing over an do-undo pair.
     */
    describe("A ↷ [B, B⁻¹] === A", () => {
        for (const [name1, makeChange1] of testChanges) {
            for (const [name2, makeChange2] of testChanges) {
                if (
                    name2 === "Delete" &&
                    ["SetValue", "Delete", "MoveOut", "MoveIn", "ReturnFrom", "ReturnTo"].includes(
                        name1,
                    )
                ) {
                    it.skip(`(${name1} ↷ ${name2}) ↷ ${name2}⁻¹ => ${name1}`, () => {
                        /**
                         * These cases are currently disabled because marks that affect existing content are removed
                         * instead of muted when rebased over the deletion of that content.
                         * This prevents us from then reinstating the mark when rebasing over the revive.
                         */
                    });
                } else {
                    it(`(${name1} ↷ ${name2}) ↷ ${name2}⁻¹ => ${name1}`, () => {
                        for (let offset1 = 1; offset1 <= 4; ++offset1) {
                            for (let offset2 = 1; offset2 <= 4; ++offset2) {
                                const change1 = tagChange(makeChange1(offset1), brand(1));
                                const change2 = tagChange(makeChange2(offset2), brand(2));
                                const inv = tagInverse(
                                    SF.invert(change2, TestChange.invert),
                                    change2.revision,
                                );
                                const r1 = rebaseTagged(change1, change2);
                                const r2 = rebaseTagged(r1, inv);
                                normalizeMoveIds(r2.change);
                                checkDeltaEquality(r2.change, change1.change);
                            }
                        }
                    });
                }
            }
        }
    });

    /**
     * This test simulates sandwich rebasing:
     * a change is first rebased over the inverse of a change it took for granted
     * then rebased over the updated version of that change (the same as the original in our case).
     *
     * The first rebase (A ↷ B) is purely for the purpose of manufacturing a change to which we can
     * apply the inverse of some change.
     */
    describe("(A ↷ B) ↷ [B⁻¹, B] === A ↷ B", () => {
        for (const [name1, makeChange1] of testChanges) {
            for (const [name2, makeChange2] of testChanges) {
                it(`${name1} ↷ [${name2}, ${name2}⁻¹, ${name2}] => ${name1} ↷ ${name2}`, () => {
                    for (let offset1 = 1; offset1 <= 4; ++offset1) {
                        for (let offset2 = 1; offset2 <= 4; ++offset2) {
                            const change1 = tagChange(makeChange1(offset1), brand(1));
                            const change2 = tagChange(makeChange2(offset2), brand(2));
                            const inverse2 = tagInverse(
                                SF.invert(change2, TestChange.invert),
                                change2.revision,
                            );
                            const r1 = rebaseTagged(change1, change2);
                            normalizeMoveIds(r1.change);
                            const r2 = rebaseTagged(r1, inverse2);
                            const r3 = rebaseTagged(r2, change2);
                            normalizeMoveIds(r3.change);
                            assert.deepEqual(r3, r1);
                        }
                    }
                });
            }
        }
    });

    describe("A ○ A⁻¹ === ε", () => {
        for (const [name, makeChange] of testChanges) {
            it(`${name} ○ ${name}⁻¹ === ε`, () => {
                const change = makeChange(0);
                const taggedChange = tagChange(change, brand(1));
                const inv = SF.invert(taggedChange, TestChange.invert);
                const changes = [taggedChange, tagInverse(inv, taggedChange.revision)];
                const actual = SF.compose(
                    changes,
                    TestChange.compose,
                    TestChange.newIdAllocator(getMaxIdTagged(changes)),
                );
                const delta = SF.sequenceFieldToDelta(actual, TestChange.toDelta, fakeRepair);
                assert.deepEqual(delta, []);
            });
        }
    });

    describe("A⁻¹ ○ A === ε", () => {
        for (const [name, makeChange] of testChanges) {
            if (name === "Insert" || name === "MInsert") {
                // A⁻¹ ○ A === ε cannot be true for Insert/MInsert:
                // Re-inserting nodes after deleting them is different from not having deleted them in the first place.
                // We may reconsider this in the future in order to minimize the deltas produced when rebasing local changes.
            } else {
                it(`${name}⁻¹ ○ ${name} === ε`, () => {
                    const change = makeChange(0);
                    const taggedChange = tagChange(change, brand(1));
                    const inv = SF.invert(taggedChange, TestChange.invert);
                    const changes = [tagInverse(inv, taggedChange.revision), taggedChange];
                    const actual = SF.compose(
                        changes,
                        TestChange.compose,
                        TestChange.newIdAllocator(getMaxIdTagged(changes)),
                    );
                    const delta = SF.sequenceFieldToDelta(actual, TestChange.toDelta, fakeRepair);
                    assert.deepEqual(delta, []);
                });
            }
        }
    });
});

describe("SequenceField - Sandwich Rebasing", () => {
    it("Nested inserts", () => {
        const insertA = tagChange(Change.insert(0, 2), brand(1));
        const insertB = tagChange(Change.insert(1, 1), brand(2));
        const inverseA = SF.invert(insertA, TestChange.invert);
        const insertB2 = rebaseTagged(insertB, tagInverse(inverseA, insertA.revision));
        const insertB3 = rebaseTagged(insertB2, insertA);
        assert.deepEqual(insertB3.change, insertB.change);
    });

    it("Nested inserts ↷ adjacent insert", () => {
        const insertX = tagChange(Change.insert(0, 1), brand(1));
        const insertA = tagChange(Change.insert(1, 2), brand(2));
        const insertB = tagChange(Change.insert(2, 1), brand(3));
        const inverseA = SF.invert(insertA, TestChange.invert);
        const insertA2 = rebaseTagged(insertA, insertX);
        const insertB2 = rebaseTagged(insertB, tagInverse(inverseA, insertA.revision));
        const insertB3 = rebaseTagged(insertB2, insertX);
        const insertB4 = rebaseTagged(insertB3, insertA2);
        assert.deepEqual(insertB4.change, Change.insert(3, 1));
    });
});
