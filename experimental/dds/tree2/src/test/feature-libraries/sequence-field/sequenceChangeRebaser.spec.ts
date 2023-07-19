/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	ChangesetLocalId,
	SequenceField as SF,
	singleTextCursor,
} from "../../../feature-libraries";
import {
	mintRevisionTag,
	RevisionTag,
	tagChange,
	tagRollbackInverse,
	TreeSchemaIdentifier,
} from "../../../core";
import { TestChange } from "../../testChange";
import { deepFreeze, isDeltaVisible } from "../../utils";
import { brand } from "../../../util";
import {
	checkDeltaEquality,
	compose,
	composeAnonChanges,
	invert,
	rebaseTagged,
	toDelta,
} from "./utils";
import { ChangeMaker as Change } from "./testEdits";

const type: TreeSchemaIdentifier = brand("Node");
const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();
const tag3: RevisionTag = mintRevisionTag();
const tag4: RevisionTag = mintRevisionTag();
const tag5: RevisionTag = mintRevisionTag();
const tag6: RevisionTag = mintRevisionTag();
const tag7: RevisionTag = mintRevisionTag();
const tag8: RevisionTag = mintRevisionTag();

const id0: ChangesetLocalId = brand(0);

/**
 * @returns Lineage for a mark of `length` targeting cells emptied in `revision`.
 * Assumes `revision` detaches a contiguous block of cells of length `max + 1` which start with ID 0 and have contiguous IDs.
 * `id` is the ID of the first cell in the block of the mark with this lineage.
 */
function generateLineage(
	revision: RevisionTag,
	id: ChangesetLocalId,
	length: number,
	max: number,
): SF.LineageEvent[] {
	const result: SF.LineageEvent[] = [];
	if (id > 0) {
		result.push({ revision, id: brand(0), count: id, offset: id });
	}

	const nextId = brand<ChangesetLocalId>((id as number) + length);
	if (nextId <= max) {
		result.push({ revision, id: nextId, count: max - nextId, offset: 0 });
	}

	return result;
}

const testChanges: [string, (index: number, maxIndex: number) => SF.Changeset<TestChange>][] = [
	["NestedChange", (i) => Change.modify(i, TestChange.mint([], 1))],
	[
		"MInsert",
		(i) =>
			composeAnonChanges([Change.insert(i, 1, 42), Change.modify(i, TestChange.mint([], 2))]),
	],
	["Insert", (i) => Change.insert(i, 2, 42)],
	[
		"TransientInsert",
		(i) => [
			{ count: i },
			{
				type: "Insert",
				content: [singleTextCursor({ type, value: 1 })],
				id: brand(0),
				transientDetach: { revision: tag1, localId: brand(0) },
			},
		],
	],
	["Delete", (i) => Change.delete(i, 2)],
	[
		"Revive",
		(i, max) =>
			Change.revive(2, 2, {
				revision: tag1,
				localId: brand(i),
				lineage: generateLineage(tag1, brand(i), 2, max),
			}),
	],
	[
		"TransientRevive",
		(i) => [
			{ count: i },
			{
				type: "Revive",
				count: 1,
				cellId: { revision: tag1, localId: brand(0) },
				content: [singleTextCursor({ type, value: 1 })],
				transientDetach: { revision: tag1, localId: brand(0) },
			},
		],
	],
	[
		"ConflictedRevive",
		(i) => Change.redundantRevive(2, 2, { revision: tag2, localId: brand(i) }),
	],
	["MoveOut", (i) => Change.move(i, 2, 1)],
	["MoveIn", (i) => Change.move(1, 2, i)],
	[
		"ReturnFrom",
		(i, max) =>
			Change.return(i, 2, 1, {
				revision: tag4,
				localId: brand(i),
				lineage: generateLineage(tag4, brand(i), 2, max),
			}),
	],
	[
		"ReturnTo",
		(i, max) =>
			Change.return(1, 2, i, {
				revision: tag4,
				localId: brand(i),
				lineage: generateLineage(tag4, brand(1), 2, max),
			}),
	],
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
					(name1.startsWith("Transient") && name2.startsWith("Transient")) ||
					(name1.startsWith("Return") && name2.startsWith("Transient")) ||
					(name1.startsWith("Transient") && name2.startsWith("Return"))
				) {
					// These cases are malformed because the test changes are missing lineage to properly order the marks
					continue;
				}
				it(`(${name1} ↷ ${name2}) ↷ ${name2}⁻¹ => ${name1}`, () => {
					const maxOffset = 4;
					for (let offset1 = 1; offset1 <= maxOffset; ++offset1) {
						for (let offset2 = 1; offset2 <= maxOffset; ++offset2) {
							const tracker = new SF.DetachedNodeTracker();
							const change1 = tagChange(makeChange1(offset1, maxOffset), tag7);
							const change2 = tagChange(makeChange2(offset2, maxOffset), tag5);
							if (!SF.areRebasable(change1.change, change2.change)) {
								continue;
							}
							const inv = tagRollbackInverse(invert(change2), tag6, tag5);
							const r1 = rebaseTagged(change1, change2);
							tracker.apply(change2);
							const r2 = rebaseTagged(r1, inv);
							tracker.apply(inv);
							const change1Updated = tracker.update(change1);
							checkDeltaEquality(r2.change, change1Updated.change);
						}
					}
				});
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
	describe("A ↷ [B, undo(B)] => A", () => {
		for (const [name1, makeChange1] of testChanges) {
			for (const [name2, makeChange2] of testChanges) {
				if (
					(name1.startsWith("Transient") && name2.startsWith("Transient")) ||
					(name1.startsWith("Return") && name2.startsWith("Transient")) ||
					(name1.startsWith("Transient") && name2.startsWith("Return"))
				) {
					// These cases are malformed because the test changes are missing lineage to properly order the marks
					continue;
				}
				const title = `${name1} ↷ [${name2}), undo(${name2}] => ${name1}`;
				it(title, () => {
					const maxOffset = 4;
					for (let offset1 = 1; offset1 <= maxOffset; ++offset1) {
						for (let offset2 = 1; offset2 <= maxOffset; ++offset2) {
							const tracker = new SF.DetachedNodeTracker();
							const change1 = tagChange(makeChange1(offset1, maxOffset), tag7);
							const change2 = tagChange(makeChange2(offset2, maxOffset), tag5);
							if (!SF.areRebasable(change1.change, change2.change)) {
								continue;
							}
							const inv = tagChange(invert(change2), tag6);
							const r1 = rebaseTagged(change1, change2);
							tracker.apply(change2);
							const r2 = rebaseTagged(r1, inv);
							tracker.apply(inv);
							const change1Updated = tracker.update(change1);
							checkDeltaEquality(r2.change, change1Updated.change);
						}
					}
				});
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
				const title = `${name1} ↷ [${name2}, ${name2}⁻¹, ${name2}] => ${name1} ↷ ${name2}`;
				if (
					(name1.startsWith("Transient") || name2.startsWith("Transient")) &&
					(name1.startsWith("Return") || name2.startsWith("Return"))
				) {
					// These cases are malformed because the test changes are missing lineage to properly order the marks
					continue;
				}
				if (name2 === "Revive") {
					it.skip(title, () => {
						/**
						 * These cases are currently disabled because `change2Updated` will be a conflicted revive,
						 * as the nodes it is targeting have been last detached by `inverse2`.
						 * Since `change2Updated` will does have the same effect as `change2`, rebasing over it will not take `r3` back to `r1`.
						 * This will be fixed by restoring the previous detach ID when "unreviving" a node.
						 */
					});
				} else {
					it(title, () => {
						const maxOffset = 4;
						for (let offset1 = 1; offset1 <= maxOffset; ++offset1) {
							for (let offset2 = 1; offset2 <= maxOffset; ++offset2) {
								const tracker = new SF.DetachedNodeTracker();
								const change1 = tagChange(makeChange1(offset1, maxOffset), tag8);
								const change2 = tagChange(makeChange2(offset2, maxOffset), tag5);
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
								const r2 = rebaseTagged(r1, inverse2);
								tracker.apply(inverse2);
								// We need to update change2 to ensure it refers to detached nodes by the detach
								// that last affected them.
								// TODO: This should not be necessary, as in a real sandwich rebase, this step would not happen.
								const change2Updated = tracker.update(change2);
								const r3 = rebaseTagged(r2, change2Updated);
								tracker.apply(change2Updated);
								// We need to update r1 to ensure it refers to detached nodes by the detach
								// that last affected them. This is for comparison only.
								const r1Updated = tracker.update(r1);
								assert.deepEqual(r3, r1Updated);
								// assert.deepEqual(r3, r1);
							}
						}
					});
				}
			}
		}
	});

	describe("A ○ A⁻¹ === ε", () => {
		for (const [name, makeChange] of testChanges) {
			it(`${name} ○ ${name}⁻¹ === ε`, () => {
				const change = makeChange(0, 0);
				const taggedChange = tagChange(change, tag1);
				const inv = invert(taggedChange);
				const changes = [
					taggedChange,
					tagRollbackInverse(inv, tag2, taggedChange.revision),
				];
				const actual = compose(changes);
				const delta = toDelta(actual);
				assert.deepEqual(isDeltaVisible(delta), false);
			});
		}
	});

	describe("A⁻¹ ○ A === ε", () => {
		for (const [name, makeChange] of testChanges) {
			it(`${name}⁻¹ ○ ${name} === ε`, () => {
				const tracker = new SF.DetachedNodeTracker();
				const change = makeChange(0, 0);
				const taggedChange = tagChange(change, tag1);
				const inv = tagRollbackInverse(invert(taggedChange), tag2, taggedChange.revision);
				tracker.apply(taggedChange);
				tracker.apply(inv);
				// TODO: Use the original change instead once composes handles this correctly.
				const updatedChange = tracker.update(taggedChange);
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
		const revABC = tagChange(Change.revive(0, 3, { revision: tag2, localId: id0 }), tag4);
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

	it("[Move ABC, Return ABC] ↷ Delete B", () => {
		const delB = tagChange(Change.delete(1, 1), tag1);
		const movABC = tagChange(Change.move(0, 3, 1), tag2);
		const retABC = tagChange(Change.return(1, 3, 0, { revision: tag2, localId: id0 }), tag4);
		const movABC2 = rebaseTagged(movABC, delB);
		const invMovABC = invert(movABC);
		const retABC2 = rebaseTagged(retABC, tagRollbackInverse(invMovABC, tag3, movABC2.revision));
		const retABC3 = rebaseTagged(retABC2, delB);
		const retABC4 = rebaseTagged(retABC3, movABC2);
		// The rebased versions of the local edits should still cancel-out
		const actual = compose([movABC2, retABC4]);
		const delta = toDelta(actual);
		assert.deepEqual(delta, []);
	});

	it("[Delete AC, Revive AC] ↷ Insert B", () => {
		const addB = tagChange(Change.insert(1, 1), tag1);
		const delAC = tagChange(Change.delete(0, 2), tag2);
		const revAC = tagChange(Change.revive(0, 2, { revision: tag2, localId: id0 }), tag4);
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
