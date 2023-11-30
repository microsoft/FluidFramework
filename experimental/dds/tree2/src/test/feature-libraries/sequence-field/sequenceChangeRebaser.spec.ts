/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SequenceField as SF } from "../../../feature-libraries";
import {
	ChangesetLocalId,
	makeAnonChange,
	emptyFieldChanges,
	mintRevisionTag,
	RevisionTag,
	tagChange,
	tagRollbackInverse,
	RevisionInfo,
} from "../../../core";
import { ChildStateGenerator, FieldStateTree } from "../../exhaustiveRebaserUtils";
import { runExhaustiveComposeRebaseSuite } from "../../rebaserAxiomaticTests";
import { TestChange } from "../../testChange";
import { deepFreeze } from "../../utils";
import { brand } from "../../../util";
// eslint-disable-next-line import/no-internal-modules
import { rebaseRevisionMetadataFromInfo } from "../../../feature-libraries/modular-schema/modularChangeFamily";
import {
	compose,
	invert,
	rebaseOverChanges,
	rebaseOverComposition,
	rebaseTagged,
	toDelta,
	withNormalizedLineage,
	withoutLineage,
	rebase,
} from "./utils";
import { ChangeMaker as Change, MarkMaker as Mark, TestChangeset } from "./testEdits";

// TODO: Rename these to make it clear which ones are used in `testChanges`.
const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();
const tag3: RevisionTag = mintRevisionTag();
const tag4: RevisionTag = mintRevisionTag();
const tag5: RevisionTag = mintRevisionTag();
const tag6: RevisionTag = mintRevisionTag();
const tag7: RevisionTag = mintRevisionTag();
const tag8: RevisionTag = mintRevisionTag();

const id0: ChangesetLocalId = brand(0);

function generateAdjacentCells(maxId: number): SF.IdRange[] {
	return [{ id: brand(0), count: maxId + 1 }];
}

const testChanges: [string, (index: number, maxIndex: number) => SF.Changeset<TestChange>][] = [
	["NestedChange", (i) => Change.modify(i, TestChange.mint([], 1))],
	[
		"NestedChangeUnderRemovedNode",
		(i, max) => [
			...(i > 0 ? [{ count: i }] : []),
			Mark.modify(TestChange.mint([], 1), {
				revision: tag1,
				localId: brand(i),
				adjacentCells: generateAdjacentCells(max),
			}),
		],
	],
	[
		"MInsert",
		(i) => [
			...(i > 0 ? [Mark.skip(i)] : []),
			Mark.insert(1, brand(42), { changes: TestChange.mint([], 2) }),
		],
	],
	["Insert", (i) => Change.insert(i, 2, brand(42))],
	["NoOp", (i) => []],
	[
		"TransientInsert",
		(i) => [
			...(i > 0 ? [Mark.skip(i)] : []),
			Mark.delete(1, brand(0), { cellId: { localId: brand(0) } }),
		],
	],
	["Delete", (i) => Change.delete(i, 2)],
	[
		"Revive",
		(i, max) =>
			Change.revive(2, 2, {
				revision: tag1,
				localId: brand(i),
				adjacentCells: generateAdjacentCells(max),
			}),
	],
	[
		"TransientRevive",
		(i) => [
			...(i > 0 ? [Mark.skip(i)] : []),
			Mark.delete(1, brand(0), {
				cellId: {
					revision: tag1,
					localId: brand(0),
				},
			}),
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
				revision: tag3,
				localId: brand(i),
				adjacentCells: generateAdjacentCells(max),
			}),
	],
	[
		"ReturnTo",
		(i, max) =>
			Change.return(1, 2, i, {
				revision: tag3,
				localId: brand(i),
				adjacentCells: generateAdjacentCells(max),
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
					(name1.startsWith("Revive") && name2.startsWith("ReturnTo")) ||
					(name1.startsWith("ReturnTo") && name2.startsWith("Revive")) ||
					(name1.startsWith("Transient") && name2.startsWith("Transient")) ||
					(name1.endsWith("UnderRemovedNode") && name2.startsWith("Return")) ||
					(name1.startsWith("Return") && name2.endsWith("UnderRemovedNode")) ||
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
							const change1 = tagChange(makeChange1(offset1, maxOffset), tag7);
							const change2 = tagChange(makeChange2(offset2, maxOffset), tag5);
							if (!SF.areRebasable(change1.change, change2.change)) {
								continue;
							}
							const inv = tagRollbackInverse(invert(change2), tag6, tag5);
							const r1 = rebaseTagged(change1, change2);
							const r2 = rebaseTagged(r1, inv);

							const r2NoLineage = withoutLineage(r2.change);
							// We do not expect exact equality because r2 may have accumulated some lineage.
							assert.deepEqual(r2NoLineage, change1.change);
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
					(name1.startsWith("Revive") && name2.startsWith("ReturnTo")) ||
					(name1.startsWith("ReturnTo") && name2.startsWith("Revive")) ||
					(name1.startsWith("Transient") && name2.startsWith("Transient")) ||
					(name1.startsWith("Return") && name2.startsWith("Transient")) ||
					(name1.endsWith("UnderRemovedNode") && name2.startsWith("Return")) ||
					(name1.startsWith("Return") && name2.endsWith("UnderRemovedNode")) ||
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
							const change1 = tagChange(makeChange1(offset1, maxOffset), tag7);
							const change2 = tagChange(makeChange2(offset2, maxOffset), tag5);
							if (!SF.areRebasable(change1.change, change2.change)) {
								continue;
							}
							const inv = tagChange(invert(change2), tag6);
							const r1 = rebaseTagged(change1, change2);
							const r2 = rebaseTagged(r1, inv);
							assert.deepEqual(withoutLineage(r2.change), change1.change);
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
					(name1.startsWith("Revive") && name2.startsWith("ReturnTo")) ||
					(name1.startsWith("ReturnTo") && name2.startsWith("Revive")) ||
					(name1.endsWith("UnderRemovedNode") && name2.startsWith("Return")) ||
					(name1.startsWith("Return") && name2.endsWith("UnderRemovedNode")) ||
					((name1.startsWith("Transient") || name2.startsWith("Transient")) &&
						(name1.startsWith("Return") || name2.startsWith("Return")))
				) {
					// These cases are malformed because the test changes are missing lineage to properly order the marks
					continue;
				}
				it(title, () => {
					const maxOffset = 4;
					for (let offset1 = 1; offset1 <= maxOffset; ++offset1) {
						for (let offset2 = 1; offset2 <= maxOffset; ++offset2) {
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
							const r2 = rebaseTagged(r1, inverse2);
							const r3 = rebaseTagged(r2, change2);
							assert.deepEqual(withoutLineage(r3.change), withoutLineage(r1.change));
						}
					}
				});
			}
		}
	});

	describe("A ○ A⁻¹ === ε", () => {
		for (const [name, makeChange] of testChanges) {
			it(`${name} ○ ${name}⁻¹ === ε`, () => {
				const change = makeChange(0, 0);
				const taggedChange = tagChange(change, tag5);
				const inv = invert(taggedChange);
				const changes = [
					taggedChange,
					tagRollbackInverse(inv, tag6, taggedChange.revision),
				];
				const actual = compose(changes);
				const delta = toDelta(actual);
				assert.deepEqual(delta, emptyFieldChanges);
			});
		}
	});

	describe("A⁻¹ ○ A === ε", () => {
		for (const [name, makeChange] of testChanges) {
			it(`${name}⁻¹ ○ ${name} === ε`, () => {
				const tracker = new SF.DetachedNodeTracker();
				const change = makeChange(0, 0);
				const taggedChange = tagChange(change, tag5);
				const inv = tagRollbackInverse(invert(taggedChange), tag6, taggedChange.revision);
				tracker.apply(taggedChange);
				tracker.apply(inv);
				const changes = [inv, taggedChange];
				const actual = compose(changes);
				const delta = toDelta(actual);
				assert.deepEqual(delta, emptyFieldChanges);
			});
		}
	});

	describe("(A ↷ B) ↷ C === A ↷ (B ○ C)", () => {
		// TODO: Support testing changesets with node changes.
		// Currently node changes in B and C will incorrectly have the same input context, which is not correct.
		const shallowTestChanges = testChanges.filter(
			(change) => !["NestedChange", "MInsert"].includes(change[0]),
		);

		const changesTargetingDetached = new Set([
			"Revive",
			"TransientRevive",
			"ConflictedRevive",
			"ReturnFrom",
			"ReturnTo",
			"NestedChangeUnderRemovedNode",
		]);

		const lineageFreeTestChanges = shallowTestChanges.filter(
			(change) => !changesTargetingDetached.has(change[0]),
		);

		for (const [nameA, makeChange1] of shallowTestChanges) {
			for (const [nameB, makeChange2] of shallowTestChanges) {
				for (const [nameC, makeChange3] of lineageFreeTestChanges) {
					const title = `${nameA} ↷ [${nameB}, ${nameC}]`;
					if (
						changesTargetingDetached.has(nameA) &&
						changesTargetingDetached.has(nameB)
					) {
						// Some of these tests are malformed as the change targeting the older cell
						// should have lineage describing its position relative to the newer cell.
					} else {
						it(title, () => {
							const a = tagChange(makeChange1(1, 1), tag5);
							const b = tagChange(makeChange2(1, 1), tag6);
							const c = tagChange(makeChange3(1, 1), tag7);
							const a2 = rebaseTagged(a, b);
							const rebasedIndividually = rebaseTagged(a2, c).change;
							const bc = compose([b, c]);
							const rebasedOverComposition = rebaseOverComposition(
								a.change,
								bc,
								rebaseRevisionMetadataFromInfo(
									[{ revision: tag6 }, { revision: tag7 }, { revision: tag5 }],
									[tag6, tag7],
								),
							);

							const normalizedComposition =
								withNormalizedLineage(rebasedOverComposition);

							const normalizedIndividual = withNormalizedLineage(rebasedIndividually);
							assert.deepEqual(normalizedComposition, normalizedIndividual);
						});
					}
				}
			}
		}
	});
});

interface TestState {
	/**
	 * The current length of the sequence being edited
	 */
	length: number;
	/**
	 * The highest index that will be iterated to to generate inserts, deletes, and moves
	 */
	maxIndex: number;
	/**
	 * An array of node counts to operate on. For instance, passing [1, 3] would generate inserts, moves, and
	 * deletes that operate on one node at a time and then 3 nodes at a time.
	 */
	numNodes: number[];
}

type SequenceFieldTestState = FieldStateTree<TestState, TestChangeset>;

/**
 * See {@link ChildStateGenerator}
 */
const generateChildStates: ChildStateGenerator<TestState, TestChangeset> = function* (
	state: SequenceFieldTestState,
	tagFromIntention: (intention: number) => RevisionTag,
	mintIntention: () => number,
): Iterable<SequenceFieldTestState> {
	const { numNodes, maxIndex } = state.content;
	const iterationCap = Math.min(maxIndex, state.content.length);

	// Undo the most recent edit
	if (state.mostRecentEdit !== undefined) {
		assert(state.parent?.content !== undefined, "Must have parent state to undo");
		const undoIntention = mintIntention();
		const invertedEdit = invert(state.mostRecentEdit.changeset);
		yield {
			content: state.parent.content,
			mostRecentEdit: {
				changeset: tagChange(invertedEdit, tagFromIntention(undoIntention)),
				intention: undoIntention,
				description: `Undo:${state.mostRecentEdit.description}`,
			},
			parent: state,
		};
	}

	for (const nodeCount of numNodes) {
		for (let i = 0; i <= iterationCap; i++) {
			// Insert nodeCount nodes
			const insertIntention = mintIntention();
			yield {
				content: {
					length: state.content.length + nodeCount,
					maxIndex,
					numNodes,
				},
				mostRecentEdit: {
					changeset: tagChange(
						Change.insert(i, nodeCount),
						tagFromIntention(insertIntention),
					),
					intention: insertIntention,
					description: `Insert${nodeCount}${nodeCount === 1 ? "Node" : "Nodes"}At${i}`,
				},
				parent: state,
			};

			// Don't generate deletes past the length of the sequence
			if (i + nodeCount <= state.content.length) {
				// Delete nodeCount nodes
				const deleteIntention = mintIntention();
				yield {
					content: {
						length: state.content.length - nodeCount,
						maxIndex,
						numNodes,
					},
					mostRecentEdit: {
						changeset: tagChange(
							Change.delete(i, nodeCount),
							tagFromIntention(deleteIntention),
						),
						intention: deleteIntention,
						description: `Delete${nodeCount}${
							nodeCount === 1 ? "Node" : "Nodes"
						}At${i}`,
					},
					parent: state,
				};
			}

			// Only generate moves when we're moving less than the length of the whole sequence
			if (state.content.length > nodeCount) {
				// MoveIn nodeCount nodes
				const moveInIntention = mintIntention();
				yield {
					content: state.content,
					mostRecentEdit: {
						changeset: tagChange(
							Change.move(1, nodeCount, i),
							tagFromIntention(moveInIntention),
						),
						intention: moveInIntention,
						description: `MoveIn${nodeCount}${
							nodeCount === 1 ? "Node" : "Nodes"
						}From1To${i}`,
					},
					parent: state,
				};

				// MoveOut nodeCount nodes
				const moveOutIntention = mintIntention();
				yield {
					content: state.content,
					mostRecentEdit: {
						changeset: tagChange(
							Change.move(i, nodeCount, 1),
							tagFromIntention(moveOutIntention),
						),
						intention: moveOutIntention,
						description: `MoveOut${nodeCount}${
							nodeCount === 1 ? "Node" : "Nodes"
						}From${i}To1`,
					},
					parent: state,
				};
			}
		}
	}
};

describe.skip("SequenceField - State-based Rebaser Axioms", () => {
	runExhaustiveComposeRebaseSuite(
		[{ content: { length: 4, numNodes: [1, 3], maxIndex: 2 } }],
		generateChildStates,
		{
			rebase,
			invert,
			compose: (changes, metadata) => compose(changes),
			rebaseComposed: (metadata, change, ...baseChanges) => {
				const composedChanges = compose(baseChanges);
				return rebase(change, makeAnonChange(composedChanges));
			},
			assertEqual: (change1, change2) => {
				if (change1 === undefined && change2 === undefined) {
					return true;
				}

				if (change1 === undefined || change2 === undefined) {
					return false;
				}

				return assert.deepEqual(
					withoutLineage(change1.change),
					withoutLineage(change2.change),
				);
			},
		},
		{
			groupSubSuites: true,
		},
	);
});

describe("SequenceField - Sandwich Rebasing", () => {
	it("Nested inserts rebasing", () => {
		const insertA = tagChange(Change.insert(0, 2), tag1);
		const insertB = tagChange(Change.insert(1, 1), tag2);
		const inverseA = tagRollbackInverse(invert(insertA), tag3, insertA.revision);
		const insertB2 = rebaseTagged(insertB, inverseA);
		const insertB3 = rebaseTagged(insertB2, insertA);
		assert.deepEqual(withoutLineage(insertB3.change), insertB.change);
	});

	it("(Insert, delete) ↷ adjacent insert", () => {
		const insertT = tagChange(Change.insert(0, 1), tag1);
		const insertA = tagChange(Change.insert(0, 1), tag2);
		const deleteB = tagChange(Change.delete(0, 1), tag3);
		const insertA2 = rebaseTagged(insertA, insertT);
		const inverseA = tagRollbackInverse(invert(insertA), tag4, insertA.revision);
		const deleteB2 = rebaseOverChanges(deleteB, [inverseA, insertT, insertA2]);
		assert.deepEqual(deleteB2.change, deleteB.change);
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
		assert.deepEqual(withoutLineage(insertB4.change), Change.insert(3, 1));
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
		assert.deepEqual(delta, emptyFieldChanges);
	});

	// See bug 4104
	it.skip("sandwich rebase [move, undo]", () => {
		const move = tagChange(Change.move(1, 1, 0), tag1);
		const moveInverse = invert(move);
		const undo = tagChange(moveInverse, tag2);
		const moveRollback = tagRollbackInverse(moveInverse, tag3, tag1);
		const rebasedUndo = rebaseOverChanges(undo, [moveRollback, move]);
		assert.deepEqual(rebasedUndo, undo);
	});

	it("delete ↷ two inverse inserts", () => {
		// Given a branch with three changes:
		// A: Insert x at index 0
		// B: Insert y at index 0
		// C: Delete y
		// This test simulates rebasing C back to the trunk.

		const changeC = tagChange([Mark.delete(1, brand(0))], tag3);

		const rollbackTag2 = mintRevisionTag();
		const changeB = tagChange([Mark.insert(1, brand(0))], tag2);
		const inverseB = tagRollbackInverse(invert(changeB), rollbackTag2, tag2);

		const rollbackTag1 = mintRevisionTag();
		const changeA = tagChange([Mark.insert(1, brand(0))], tag1);
		const inverseA = tagRollbackInverse(invert(changeA), rollbackTag1, tag1);

		const revInfos: RevisionInfo[] = [
			{ revision: rollbackTag2, rollbackOf: tag2 },
			{ revision: rollbackTag1, rollbackOf: tag1 },
			{ revision: tag1 },
			{ revision: tag2 },
		];

		const cRebasedToTrunk = rebaseOverChanges(changeC, [inverseB, inverseA], revInfos);
		const expected = [
			Mark.delete(1, brand(0), {
				cellId: {
					revision: tag2,
					localId: brand(0),
					adjacentCells: [{ id: brand(0), count: 1 }],
					lineage: [{ revision: tag1, id: brand(0), count: 1, offset: 0 }],
				},
			}),
		];
		assert.deepEqual(cRebasedToTrunk.change, expected);
	});

	it("[insert, insert] ↷ insert", () => {
		const insertT = tagChange([Mark.insert(1, brand(0))], tag1);
		const insertA = tagChange([Mark.insert(1, brand(0))], tag2);
		const insertA2 = rebaseOverChanges(insertA, [insertT]);
		const inverseA = tagRollbackInverse(invert(insertA), tag4, tag2);
		const insertB = tagChange([{ count: 1 }, Mark.insert(1, brand(0))], tag3);
		const insertB2 = rebaseOverChanges(insertB, [inverseA, insertT, insertA2]);
		const expected = [{ count: 1 }, Mark.insert(1, brand(0))];
		assert.deepEqual(insertB2.change, expected);
	});
});

describe("SequenceField - Composed sandwich rebasing", () => {
	it("Nested inserts ↷ []", () => {
		const insertA = tagChange(Change.insert(0, 2), tag1);
		const insertB = tagChange(Change.insert(1, 1), tag2);
		const inverseA = tagRollbackInverse(invert(insertA), tag3, insertA.revision);
		const sandwich = compose([inverseA, insertA]);
		const insertB2 = rebaseTagged(insertB, makeAnonChange(sandwich));
		assert.deepEqual(insertB2.change, insertB.change);
	});
});
