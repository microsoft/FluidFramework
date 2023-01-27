/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SequenceField as SF } from "../../../feature-libraries";
import { RevisionTag, tagChange, tagInverse } from "../../../core";
import { brand } from "../../../util";
import { TestChange } from "../../testChange";
import { deepFreeze } from "../../utils";
import {
    checkDeltaEquality,
    composeAnonChanges,
    continuingAllocator,
    normalizeMoveIds,
    rebaseTagged,
    toDelta,
} from "./utils";
import { ChangeMaker as Change } from "./testEdits";

const tag1: RevisionTag = brand(41);
const tag2: RevisionTag = brand(42);
const tag3: RevisionTag = brand(43);
const tag4: RevisionTag = brand(44);

const testChanges: [string, (index: number) => SF.Changeset<TestChange>][] = [
    ["SetValue", (i) => Change.modify(i, TestChange.mint([], 1))],
    [
        "MInsert",
        (i) =>
            composeAnonChanges([Change.insert(i, 1, 42), Change.modify(i, TestChange.mint([], 2))]),
    ],
    ["Insert", (i) => Change.insert(i, 2, 42)],
    ["Delete", (i) => Change.delete(i, 2)],
    ["Revive", (i) => Change.revive(2, 2, tag1, i)],
    ["ConflictedRevive", (i) => Change.revive(2, 2, tag2, i, tag3)],
    ["MoveOut", (i) => Change.move(i, 2, 1)],
    ["MoveIn", (i) => Change.move(1, 2, i)],
    ["ReturnFrom", (i) => Change.return(i, 2, 1, tag4)],
    ["ReturnTo", (i) => Change.return(1, 2, i, tag4)],
];
deepFreeze(testChanges);

// TODO: Refactor these tests to support moves
describe("SequenceField - Rebaser Axioms", () => {
    /**
     * This test simulates rebasing over an do-inverse pair.
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
                                const tracker = new SF.DetachedNodeTracker();
                                const change1 = tagChange(makeChange1(offset1), brand(1));
                                const change2 = tagChange(makeChange2(offset2), brand(2));
                                if (!SF.areRebasable(change1.change, change2.change)) {
                                    continue;
                                }
                                const inv = tagInverse(
                                    SF.invert(change2, TestChange.invert),
                                    change2.revision,
                                );
                                const r1 = rebaseTagged(change1, change2);
                                tracker.apply(change2);
                                const r2 = rebaseTagged(r1, inv);
                                tracker.apply(inv);
                                const change1Updated = tracker.update(
                                    change1,
                                    continuingAllocator([change1]),
                                );
                                normalizeMoveIds(r2.change);
                                normalizeMoveIds(change1Updated.change);
                                checkDeltaEquality(r2.change, change1Updated.change);
                            }
                        }
                    });
                }
            }
        }
    });

    /**
     * This test simulates rebasing over an do-undo pair.
     * It is different from the above in that the undo(B) changeset bears a different RevisionTag than B.
     * TODO: Reactivate and fix tests.
     */
    describe.skip("A ↷ [B, undo(B)] => A", () => {
        for (const [name1, makeChange1] of testChanges) {
            for (const [name2, makeChange2] of testChanges) {
                const title = `${name1} ↷ [${name2}), undo(${name2}] => ${name1}`;
                if (
                    name2 === "Delete" &&
                    ["SetValue", "Delete", "MoveOut", "MoveIn", "ReturnFrom", "ReturnTo"].includes(
                        name1,
                    )
                ) {
                    it.skip(title, () => {
                        /**
                         * These cases are currently disabled because marks that affect existing content are removed
                         * instead of muted when rebased over the deletion of that content.
                         * This prevents us from then reinstating the mark when rebasing over the revive.
                         */
                    });
                } else {
                    it(title, () => {
                        for (let offset1 = 1; offset1 <= 4; ++offset1) {
                            for (let offset2 = 1; offset2 <= 4; ++offset2) {
                                const tracker = new SF.DetachedNodeTracker();
                                const change1 = tagChange(makeChange1(offset1), brand(1));
                                const change2 = tagChange(makeChange2(offset2), brand(2));
                                if (!SF.areRebasable(change1.change, change2.change)) {
                                    continue;
                                }
                                const inv = tagChange(
                                    SF.invert(change2, TestChange.invert),
                                    brand(3),
                                );
                                const r1 = rebaseTagged(change1, change2);
                                tracker.apply(change2);
                                const r2 = rebaseTagged(r1, inv);
                                tracker.apply(inv);
                                const change1Updated = tracker.update(
                                    change1,
                                    continuingAllocator([change1]),
                                );
                                normalizeMoveIds(r2.change);
                                normalizeMoveIds(change1Updated.change);
                                checkDeltaEquality(r2.change, change1Updated.change);
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
                            const tracker = new SF.DetachedNodeTracker();
                            const change1 = tagChange(makeChange1(offset1), brand(1));
                            const change2 = tagChange(makeChange2(offset2), brand(2));
                            if (!SF.areRebasable(change1.change, change2.change)) {
                                continue;
                            }
                            const inverse2 = tagInverse(
                                SF.invert(change2, TestChange.invert),
                                change2.revision,
                            );
                            const r1 = rebaseTagged(change1, change2);
                            tracker.apply(change2);
                            normalizeMoveIds(r1.change);
                            const r2 = rebaseTagged(r1, inverse2);
                            tracker.apply(inverse2);
                            // We need to update change2 to ensure it refers to detached nodes by the detach
                            // that last affected them.
                            const change2Updated = tracker.update(
                                change2,
                                continuingAllocator([change2]),
                            );
                            const r3 = rebaseTagged(r2, change2Updated);
                            tracker.apply(change2Updated);
                            normalizeMoveIds(r3.change);
                            // We need to update r1 to ensure it refers to detached nodes by the detach
                            // that last affected them. This is for comparison only.
                            const r1Updated = tracker.update(r1, continuingAllocator([r1]));
                            normalizeMoveIds(r1Updated.change);
                            assert.deepEqual(r3, r1Updated);
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
                    continuingAllocator(changes),
                );
                const delta = toDelta(actual);
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
                    const tracker = new SF.DetachedNodeTracker();
                    const change = makeChange(0);
                    const taggedChange = tagChange(change, brand(1));
                    const inv = tagInverse(
                        SF.invert(taggedChange, TestChange.invert),
                        taggedChange.revision,
                    );
                    tracker.apply(taggedChange);
                    tracker.apply(inv);
                    const updatedChange = tracker.update(
                        taggedChange,
                        continuingAllocator([taggedChange]),
                    );
                    const changes = [inv, updatedChange];
                    const actual = SF.compose(
                        changes,
                        TestChange.compose,
                        continuingAllocator(changes),
                    );
                    const delta = toDelta(actual);
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

    it("[Delete ABC, Revive ABC] ↷ Delete B", () => {
        const delB = tagChange(Change.delete(1, 1), brand(1));
        const delABC = tagChange(Change.delete(0, 3), brand(2));
        const revABC = tagChange(Change.revive(0, 3, brand(2), 0), brand(3));
        const delABC2 = rebaseTagged(delABC, delB);
        const invDelABC = SF.invert(delABC, TestChange.invert);
        const revABC2 = rebaseTagged(revABC, tagInverse(invDelABC, delABC2.revision));
        const revABC3 = rebaseTagged(revABC2, delB);
        const revABC4 = rebaseTagged(revABC3, delABC2);
        const actual = SF.compose(
            [delABC2, revABC4],
            TestChange.compose,
            continuingAllocator([delABC2, revABC4]),
        );
        const delta = toDelta(actual);
        assert.deepEqual(delta, []);
    });

    it.skip("[Move ABC, Return ABC] ↷ Delete B", () => {
        const delB = tagChange(Change.delete(1, 1), brand(1));
        const movABC = tagChange(Change.move(0, 3, 1), brand(2));
        const retABC = tagChange(Change.return(1, 3, 0, brand(2)), brand(3));
        const movABC2 = rebaseTagged(movABC, delB);
        const invMovABC = SF.invert(movABC, TestChange.invert);
        const retABC2 = rebaseTagged(retABC, tagInverse(invMovABC, movABC2.revision));
        const retABC3 = rebaseTagged(retABC2, delB);
        // This next rebase fails for two reasons:
        // 1: The current rebase code assumes new attach marks will always be independent.
        // This is violated by the needs of sandwich rebasing: the ReturnFrom of retABC3
        // needs to be matched up with the MoveIn of movABC2 for it to no longer be conflicted.
        // 2: The 2nd count of movABC2 is interpreted as overlapping with
        // the second ReturnFrom (which corresponds to the deleted node B) when it should to be
        // interpreted as overlapping with the third ReturnFrom.
        // This will be easier to rectify once movABC2 carries (conflicted) marks for B as opposed to those marks
        // being deleted when rebasing over the deleted of B.
        const retABC4 = rebaseTagged(retABC3, movABC2);
        const actual = SF.compose(
            [movABC2, retABC4],
            TestChange.compose,
            continuingAllocator([movABC2, retABC4]),
        );
        const delta = toDelta(actual);
        assert.deepEqual(delta, []);
    });

    it("[Delete AC, Revive AC] ↷ Insert B", () => {
        const addB = tagChange(Change.insert(1, 1), brand(1));
        const delAC = tagChange(Change.delete(0, 2), brand(2));
        const revAC = tagChange(Change.revive(0, 2, brand(2), 0), brand(3));
        const delAC2 = rebaseTagged(delAC, addB);
        const invDelAC = SF.invert(delAC, TestChange.invert);
        const revAC2 = rebaseTagged(revAC, tagInverse(invDelAC, delAC2.revision));
        const revAC3 = rebaseTagged(revAC2, addB);
        const revAC4 = rebaseTagged(revAC3, delAC2);
        const actual = SF.compose(
            [delAC2, revAC4],
            TestChange.compose,
            continuingAllocator([delAC2, revAC4]),
        );
        const delta = toDelta(actual);
        assert.deepEqual(delta, []);
    });
});
