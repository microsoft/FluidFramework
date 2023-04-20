/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SequenceField as SF } from "../../../feature-libraries";
import { mintRevisionTag, RevisionTag, tagChange, tagRollbackInverse } from "../../../core";
import { TestChange } from "../../testChange";
import { deepFreeze } from "../../utils";
import {
	checkDeltaEquality,
	compose,
	composeAnonChanges,
	continuingAllocator,
	invert,
	normalizeMoveIds,
	rebaseTagged,
	toDelta,
} from "./utils";
import { ChangeMaker as Change } from "./testEdits";

const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();
const tag3: RevisionTag = mintRevisionTag();
const tag4: RevisionTag = mintRevisionTag();
const tag5: RevisionTag = mintRevisionTag();
const tag6: RevisionTag = mintRevisionTag();
const tag7: RevisionTag = mintRevisionTag();
const tag8: RevisionTag = mintRevisionTag();

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
	["ConflictedRevive", (i) => Change.revive(2, 2, tag2, i, undefined, tag3)],
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
								const change1 = tagChange(makeChange1(offset1), tag7);
								const change2 = tagChange(makeChange2(offset2), tag5);
								if (!SF.areRebasable(change1.change, change2.change)) {
									continue;
								}
								// TODO: test with a non-rollback inverse once lineage offsets are comparable to
								// revive indices (TASK:3167)
								const inv = tagRollbackInverse(invert(change2), tag6, tag5);
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
	 * It is different from the above in two ways:
	 * - The undo(B) changeset bears a different RevisionTag than B
	 * - The inverse produced by undo(B) is not a rollback
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
								const change1 = tagChange(makeChange1(offset1), tag7);
								const change2 = tagChange(makeChange2(offset2), tag5);
								if (!SF.areRebasable(change1.change, change2.change)) {
									continue;
								}
								const inv = tagChange(invert(change2), tag6);
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
							const change1 = tagChange(makeChange1(offset1), tag8);
							const change2 = tagChange(makeChange2(offset2), tag5);
							if (!SF.areRebasable(change1.change, change2.change)) {
								continue;
							}
							const inverse2 = tagRollbackInverse(
								invert(change2),
								tag6,
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
				const taggedChange = tagChange(change, tag1);
				const inv = invert(taggedChange);
				const changes = [
					taggedChange,
					tagRollbackInverse(inv, tag2, taggedChange.revision),
				];
				const actual = compose(changes);
				const delta = toDelta(actual);
				assert.deepEqual(delta, []);
			});
		}
	});

	describe("A⁻¹ ○ A === ε", () => {
		for (const [name, makeChange] of testChanges) {
			it(`${name}⁻¹ ○ ${name} === ε`, () => {
				const tracker = new SF.DetachedNodeTracker();
				const change = makeChange(0);
				const taggedChange = tagChange(change, tag1);
				const inv = tagRollbackInverse(invert(taggedChange), tag2, taggedChange.revision);
				tracker.apply(taggedChange);
				tracker.apply(inv);
				const updatedChange = tracker.update(
					taggedChange,
					continuingAllocator([taggedChange]),
				);
				const changes = [inv, updatedChange];
				const actual = compose(changes);
				const delta = toDelta(actual);
				assert.deepEqual(delta, []);
			});
		}
	});
});

describe("SequenceField - Sandwich Rebasing", () => {
	it("Nested inserts rebasing", () => {
		const insertA = tagChange(Change.insert(0, 2), tag1);
		const insertB = tagChange(Change.insert(1, 1), tag2);
		const inverseA = tagRollbackInverse(invert(insertA), tag3, insertA.revision);
		const insertB2 = rebaseTagged(insertB, inverseA);
		const insertB3 = rebaseTagged(insertB2, insertA);
		assert.deepEqual(insertB3.change, insertB.change);
	});

	it("Nested inserts composition", () => {
		const insertA = tagChange(Change.insert(0, 2), tag1);
		const insertB = tagChange(Change.insert(1, 1), tag2);
		const inverseA = tagRollbackInverse(invert(insertA), tag3, insertA.revision);
		const inverseB = tagRollbackInverse(invert(insertB), tag4, insertB.revision);

		const composed = compose([inverseB, inverseA, insertA, insertB]);
		assert.deepEqual(composed, []);
	});

	it("Nested inserts ↷ adjacent insert", () => {
		const insertX = tagChange(Change.insert(0, 1), tag1);
		const insertA = tagChange(Change.insert(1, 2), tag2);
		const insertB = tagChange(Change.insert(2, 1), tag4);
		const inverseA = tagRollbackInverse(invert(insertA), tag3, insertA.revision);
		const insertA2 = rebaseTagged(insertA, insertX);
		const insertB2 = rebaseTagged(insertB, inverseA);
		const insertB3 = rebaseTagged(insertB2, insertX);
		const insertB4 = rebaseTagged(insertB3, insertA2);
		assert.deepEqual(insertB4.change, Change.insert(3, 1));
	});

	it("[Delete ABC, Revive ABC] ↷ Delete B", () => {
		const delB = tagChange(Change.delete(1, 1), tag1);
		const delABC = tagChange(Change.delete(0, 3), tag2);
		const revABC = tagChange(Change.revive(0, 3, tag2, 0), tag4);
		const delABC2 = rebaseTagged(delABC, delB);
		const invDelABC = tagRollbackInverse(invert(delABC), tag3, delABC2.revision);
		const revABC2 = rebaseTagged(revABC, invDelABC);
		const revABC3 = rebaseTagged(revABC2, delB);
		const revABC4 = rebaseTagged(revABC3, delABC2);
		// The rebased versions of the local edits should still cancel-out
		const actual = compose([delABC2, revABC4]);
		const delta = toDelta(actual);
		assert.deepEqual(delta, []);
	});

	it.skip("[Move ABC, Return ABC] ↷ Delete B", () => {
		const delB = tagChange(Change.delete(1, 1), tag1);
		const movABC = tagChange(Change.move(0, 3, 1), tag2);
		const retABC = tagChange(Change.return(1, 3, 0, tag2), tag4);
		const movABC2 = rebaseTagged(movABC, delB);
		const invMovABC = invert(movABC);
		const retABC2 = rebaseTagged(retABC, tagRollbackInverse(invMovABC, tag3, movABC2.revision));
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
		// The rebased versions of the local edits should still cancel-out
		const actual = compose([movABC2, retABC4]);
		const delta = toDelta(actual);
		assert.deepEqual(delta, []);
	});

	it("[Delete AC, Revive AC] ↷ Insert B", () => {
		const addB = tagChange(Change.insert(1, 1), tag1);
		const delAC = tagChange(Change.delete(0, 2), tag2);
		const revAC = tagChange(Change.revive(0, 2, tag2, 0), tag4);
		const delAC2 = rebaseTagged(delAC, addB);
		const invDelAC = invert(delAC);
		const revAC2 = rebaseTagged(revAC, tagRollbackInverse(invDelAC, tag3, delAC2.revision));
		const revAC3 = rebaseTagged(revAC2, addB);
		const revAC4 = rebaseTagged(revAC3, delAC2);
		// The rebased versions of the local edits should still cancel-out
		const actual = compose([delAC2, revAC4]);
		const delta = toDelta(actual);
		assert.deepEqual(delta, []);
	});

	// See bug 4104
	it.skip("sandwich rebase [move, undo]", () => {
		const move = tagChange(Change.move(1, 1, 0), tag1);
		const moveInverse = invert(move);
		const undo = tagChange(moveInverse, tag2);
		const moveRollback = tagRollbackInverse(moveInverse, tag3, tag1);
		const rebasedUndo = rebaseTagged(undo, moveRollback, move);
		assert.deepEqual(rebasedUndo, undo);
	});
});
