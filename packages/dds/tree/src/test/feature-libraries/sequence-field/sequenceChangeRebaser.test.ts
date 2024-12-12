/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { describeStress, StressMode } from "@fluid-private/stochastic-test-utils";
import { assert } from "@fluidframework/core-utils/internal";
import { strict } from "node:assert";

import {
	type ChangesetLocalId,
	type RevisionInfo,
	type RevisionTag,
	type TaggedChange,
	emptyDelta,
	makeAnonChange,
	tagChange,
	tagRollbackInverse,
} from "../../../core/index.js";
import type { SequenceField as SF } from "../../../feature-libraries/index.js";
import type {
	BoundFieldChangeRebaser,
	ChildStateGenerator,
	FieldStateTree,
} from "../../exhaustiveRebaserUtils.js";
import { runExhaustiveComposeRebaseSuite } from "../../rebaserAxiomaticTests.js";
import { TestChange } from "../../testChange.js";
import { defaultRevisionMetadataFromChanges, mintRevisionTag } from "../../utils.js";
import {
	type IdAllocator,
	brand,
	idAllocatorFromMaxId,
	makeArray,
} from "../../../util/index.js";
import type {
	NodeId,
	RebaseRevisionMetadata,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/modular-schema/index.js";
// eslint-disable-next-line import/no-internal-modules
import { rebaseRevisionMetadataFromInfo } from "../../../feature-libraries/modular-schema/modularChangeFamily.js";
import { ChangesetWrapper } from "../../changesetWrapper.js";
import {
	areRebasable,
	assertChangesetsEqual,
	compose,
	invert,
	prune,
	rebaseOverChanges,
	rebaseTagged,
	composeShallow,
	invertDeep,
	rebaseDeepTagged,
	withoutTombstonesDeep,
	assertWrappedChangesetsEqual,
	composeDeep,
	pruneDeep,
	type WrappedChange,
	withoutTombstones,
	tagChangeInline,
	inlineRevision,
	toDeltaWrapped,
} from "./utils.js";
import { ChangeMaker as Change, MarkMaker as Mark } from "./testEdits.js";
import { deepFreeze } from "@fluidframework/test-runtime-utils/internal";

// TODO: Rename these to make it clear which ones are used in `testChanges`.
const tag0: RevisionTag = mintRevisionTag();
const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();
const tag3: RevisionTag = mintRevisionTag();
const tag4: RevisionTag = mintRevisionTag();
const tag5: RevisionTag = mintRevisionTag();
const tag6: RevisionTag = mintRevisionTag();
const tag7: RevisionTag = mintRevisionTag();
const tag8: RevisionTag = mintRevisionTag();

const id0: ChangesetLocalId = brand(0);

export interface IdRange {
	id: ChangesetLocalId;
	count: number;
}

function withAdjacentTombstones(
	marks: readonly SF.Mark[],
	type: SF.Mark["type"],
	maxId: number,
): SF.Mark[] {
	const hasEffectType = (m: SF.Mark): boolean => m.type === type;
	const output = [...marks];
	let markIdx = marks.findIndex(hasEffectType);
	assert(
		markIdx !== -1 && marks.slice(markIdx + 1).findIndex(hasEffectType) === -1,
		"Expected to find exactly one mark with the given type",
	);
	const mark = marks[markIdx];
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const cellId = mark.cellId!;
	const countBefore = cellId.localId;
	if (countBefore > 0) {
		output.splice(markIdx, 0, Mark.tomb(cellId.revision, brand(0), countBefore));
		markIdx += 1;
	}
	const countAfter = maxId + 1 - countBefore - mark.count;
	if (countAfter > 0) {
		output.splice(
			markIdx + 1,
			0,
			Mark.tomb(cellId.revision, brand(cellId.localId + mark.count), countAfter),
		);
	}
	return output;
}

const nodeId1: NodeId = { localId: brand(1) };
const nodeId2: NodeId = { localId: brand(2) };
const nodeId3: NodeId = { localId: brand(3) };

const testChanges: [
	string,
	(index: number, maxIndex: number) => ChangesetWrapper<SF.Changeset>,
][] = [
	[
		"NestedChange",
		(i) =>
			ChangesetWrapper.create(Change.modify(i, nodeId1), [nodeId1, TestChange.mint([], 1)]),
	],
	[
		"NestedChangeUnderRemovedNode",
		(i, max) =>
			ChangesetWrapper.create(
				[
					...(i > 0 ? [{ count: i }] : []),
					...withAdjacentTombstones(
						[Mark.modify(nodeId2, { revision: tag1, localId: brand(i) })],
						undefined,
						max,
					),
				],
				[nodeId2, TestChange.mint([], 1)],
			),
	],
	[
		"MInsert",
		(i) =>
			ChangesetWrapper.create(
				[
					...(i > 0 ? [Mark.skip(i)] : []),
					Mark.insert(1, brand(42), {
						changes: nodeId3,
					}),
				],
				[nodeId3, TestChange.mint([], 2)],
			),
	],
	[
		"Insert",
		(i) =>
			ChangesetWrapper.create(
				Change.insert(i, 2, undefined /* revision */, { localId: brand(42) }),
			),
	],
	["NoOp", (i) => ChangesetWrapper.create([])],
	[
		"TransientInsert",
		(i) =>
			ChangesetWrapper.create([
				...(i > 0 ? [Mark.skip(i)] : []),
				Mark.remove(1, brand(0), { cellId: { localId: brand(0) } }),
			]),
	],
	["Remove", (i) => ChangesetWrapper.create(Change.remove(i, 2, undefined /* revision */))],
	[
		"Revive",
		(i, max) =>
			ChangesetWrapper.create([
				Mark.skip(2),
				...withAdjacentTombstones(
					[Mark.revive(2, { revision: tag1, localId: brand(i) })],
					"Insert",
					max,
				),
			]),
	],
	[
		"TransientRevive",
		(i) =>
			ChangesetWrapper.create([
				...(i > 0 ? [Mark.skip(i)] : []),
				Mark.remove(1, brand(0), {
					cellId: {
						revision: tag1,
						localId: brand(0),
					},
				}),
			]),
	],
	[
		"Pin",
		(i) =>
			ChangesetWrapper.create(
				Change.pin(2, 2, { revision: tag2, localId: brand(i) }, undefined /* revision */),
			),
	],
	["MoveOut", (i) => ChangesetWrapper.create(Change.move(i, 2, 1, undefined /* revision */))],
	["MoveIn", (i) => ChangesetWrapper.create(Change.move(1, 2, i, undefined /* revision */))],
	[
		"ReturnFrom",
		(i, max) =>
			ChangesetWrapper.create(
				withAdjacentTombstones(
					Change.return(
						i,
						2,
						1,
						{ revision: tag3, localId: brand(i + 2) },
						{ revision: tag3, localId: brand(i) },
						undefined /* revision */,
					),
					"MoveIn",
					max,
				),
			),
	],
	[
		"ReturnTo",
		(i, max) =>
			ChangesetWrapper.create(
				withAdjacentTombstones(
					Change.return(
						1,
						2,
						i,
						{ revision: tag3, localId: brand(i + 2) },
						{ revision: tag3, localId: brand(i) },
						undefined /* revision */,
					),
					"MoveIn",
					max,
				),
			),
	],
];
deepFreeze(testChanges);

export function testRebaserAxioms() {
	describe("Rebaser Axioms", () => {
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
						// These cases are malformed because the test changes are missing tombstones to properly order the marks
						continue;
					}
					if (name1.startsWith("Return") && name2.startsWith("Return")) {
						// These cases are malformed because changesets have inconsistent description of empty cells locations
						continue;
					}
					it(`(${name1} ↷ ${name2}) ↷ ${name2}⁻¹ => ${name1}`, () => {
						const maxOffset = 4;
						for (let offset1 = 1; offset1 <= maxOffset; ++offset1) {
							for (let offset2 = 1; offset2 <= maxOffset; ++offset2) {
								const change1 = tagWrappedChangeInline(makeChange1(offset1, maxOffset), tag7);
								const change2 = tagWrappedChangeInline(makeChange2(offset2, maxOffset), tag5);
								if (!areRebasable(change1.change.fieldChange, change2.change.fieldChange)) {
									continue;
								}
								const inv = tagWrappedChangeInline(invertDeep(change2, tag6), tag6, tag5);
								const r1 = rebaseDeepTagged(change1, change2);
								const r2 = rebaseDeepTagged(r1, inv);

								assertWrappedChangesetsEqual(
									withoutTombstonesDeep(r2.change),
									withoutTombstonesDeep(change1.change),
								);
							}
						}
					});
				}
			}
		});

		// Hand-crafted version of the above tests to add coverage for returns
		it("Return ↷ [Return, Return⁻¹] === Return", () => {
			const move: SF.Changeset = Mark.move(1, { revision: tag0, localId: brand(0) });
			const r: SF.Changeset = invert(tagChange(move, tag0), tag3, false);
			const base1 = tagChange(r, tag1);
			const base2 = tagChange(invert(base1, tag2, true), tag2);
			const actual = rebaseOverChanges(tagChange(r, tag3), [base1, base2]);
			assertChangesetsEqual(actual.change, r);
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
						// These cases are malformed because the test changes are missing tombstones to properly order the marks
						continue;
					}
					if (name1.startsWith("Return") && name2.startsWith("Return")) {
						// These cases are malformed because changesets have inconsistent description of empty cells locations
						continue;
					}
					const title = `${name1} ↷ [${name2}), undo(${name2}] => ${name1}`;
					it(title, () => {
						const maxOffset = 4;
						for (let offset1 = 1; offset1 <= maxOffset; ++offset1) {
							for (let offset2 = 1; offset2 <= maxOffset; ++offset2) {
								const change1 = tagWrappedChangeInline(makeChange1(offset1, maxOffset), tag7);
								const change2 = tagWrappedChangeInline(makeChange2(offset2, maxOffset), tag5);
								if (!areRebasable(change1.change.fieldChange, change2.change.fieldChange)) {
									continue;
								}
								const inv = tagWrappedChangeInline(invertDeep(change2, tag6), tag6);
								const r1 = rebaseDeepTagged(change1, change2);
								const r2 = rebaseDeepTagged(r1, inv);
								assertWrappedChangesetsEqual(
									withoutTombstonesDeep(r2.change),
									withoutTombstonesDeep(change1.change),
								);
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
						// These cases are malformed because the test changes are missing tombstones to properly order the marks
						continue;
					}
					if (name1.startsWith("Return") && name2.startsWith("Return")) {
						// These cases are malformed because changesets have inconsistent description of empty cells locations
						continue;
					}
					it(title, () => {
						const maxOffset = 4;
						for (let offset1 = 1; offset1 <= maxOffset; ++offset1) {
							for (let offset2 = 1; offset2 <= maxOffset; ++offset2) {
								const change1 = tagWrappedChangeInline(makeChange1(offset1, maxOffset), tag8);
								const change2 = tagWrappedChangeInline(makeChange2(offset2, maxOffset), tag5);
								if (!areRebasable(change1.change.fieldChange, change2.change.fieldChange)) {
									continue;
								}
								const inverse2 = tagWrappedChangeInline(
									invertDeep(change2, tag6),
									tag6,
									change2.revision,
								);
								const r1 = rebaseDeepTagged(change1, change2);
								const r2 = rebaseDeepTagged(r1, inverse2);
								const r3 = rebaseDeepTagged(r2, change2);
								assertWrappedChangesetsEqual(
									withoutTombstonesDeep(r3.change),
									withoutTombstonesDeep(r1.change),
								);
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
					const taggedChange = tagWrappedChangeInline(change, tag5);
					const inv = invertDeep(taggedChange, tag6);
					const changes = [
						taggedChange,
						tagWrappedChangeInline(inv, tag6, taggedChange.revision),
					];
					const actual = composeDeep(changes);
					const delta = toDeltaWrapped(actual);
					strict.deepEqual(delta, emptyDelta);
				});
			}
		});

		describe("A⁻¹ ○ A === ε", () => {
			for (const [name, makeChange] of testChanges) {
				it(`${name}⁻¹ ○ ${name} === ε`, () => {
					const change = makeChange(0, 0);
					const taggedChange = tagWrappedChangeInline(change, tag5);
					const inv = tagWrappedChangeInline(
						invertDeep(taggedChange, tag6),
						tag6,
						taggedChange.revision,
					);
					const changes = [inv, taggedChange];
					const actual = composeDeep(changes);
					const delta = toDeltaWrapped(actual);
					strict.deepEqual(delta, emptyDelta);
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

			const tombstoneFreeTestChanges = shallowTestChanges.filter(
				(change) => !changesTargetingDetached.has(change[0]),
			);

			for (const [nameA, makeChange1] of shallowTestChanges) {
				for (const [nameB, makeChange2] of shallowTestChanges) {
					for (const [nameC, makeChange3] of tombstoneFreeTestChanges) {
						const title = `${nameA} ↷ [${nameB}, ${nameC}]`;
						if (changesTargetingDetached.has(nameA) && changesTargetingDetached.has(nameB)) {
							// Some of these tests are malformed as the change targeting the older cell
							// should have tombstones describing its position relative to the newer cell.
						} else {
							it(title, () => {
								const a = tagWrappedChangeInline(makeChange1(1, 1), tag5);
								const b = tagWrappedChangeInline(makeChange2(1, 1), tag6);
								const c = tagWrappedChangeInline(makeChange3(1, 1), tag7);
								const a2 = rebaseDeepTagged(a, b);
								const rebasedIndividually = rebaseDeepTagged(a2, c).change;
								const bc = composeDeep([b, c]);
								const rebasedOverComposition = rebaseDeepTagged(
									a,
									makeAnonChange(bc),
									rebaseRevisionMetadataFromInfo(
										[{ revision: tag6 }, { revision: tag7 }, { revision: tag5 }],
										tag5,
										[tag6, tag7],
									),
								);

								assertWrappedChangesetsEqual(
									rebasedOverComposition.change,
									rebasedIndividually,
								);
							});
						}
					}
				}
			}
		});
	});
}

interface NodeState {
	/**
	 * Unique ID associated with the node.
	 */
	id: number;
	/**
	 * The list of intentions that have been applied to this subtree.
	 * This is used to generate new nested changes for a node.
	 */
	nested: number[];
}

interface TestState {
	/**
	 * Represents the state of the sequence field.
	 */
	currentState: NodeState[];
	config: TestConfig;
}

interface TestConfig {
	/**
	 * The maximum length that the sequence should be as part of the test.
	 */
	maxLength: number;
	/**
	 * An array of node counts to operate on. For instance, passing [1, 3] would generate inserts, moves, and
	 * removes that operate on one node at a time and then 3 nodes at a time.
	 */
	numNodes: number[];
	allocator: IdAllocator;
}

type SequenceFieldTestState = FieldStateTree<TestState, WrappedChange>;

/**
 * See {@link ChildStateGenerator}
 */
const generateChildStates: ChildStateGenerator<TestState, WrappedChange> = function* (
	state: SequenceFieldTestState,
	tagFromIntention: (intention: number) => RevisionTag,
	mintIntention: () => number,
): Iterable<SequenceFieldTestState> {
	const { currentState, config } = state.content;

	// TODO: support for undoing earlier edits
	// Undo the most recent edit
	if (state.mostRecentEdit !== undefined) {
		assert(state.parent?.content !== undefined, "Must have parent state to undo");
		const undoIntention = mintIntention();
		const undoTag = tagFromIntention(undoIntention);
		const invertedEdit = invertDeep(state.mostRecentEdit.changeset, undoTag);
		yield {
			content: state.parent.content,
			mostRecentEdit: {
				changeset: tagWrappedChangeInline(invertedEdit, undoTag),
				intention: undoIntention,
				description: `Undo(${state.mostRecentEdit.description})`,
			},
			parent: state,
		};
	}

	for (const nodeCount of config.numNodes) {
		// Insert nodeCount nodes
		if (nodeCount + currentState.length <= config.maxLength) {
			const inserted = makeArray(nodeCount, () => ({
				id: config.allocator.allocate(),
				nested: [],
			}));
			const insertedString = inserted.map((n) => n.id).join(",");
			for (let i = 0; i <= currentState.length; i += 1) {
				const insertIntention = mintIntention();
				const insertRevision = tagFromIntention(insertIntention);
				const newState = [...currentState];
				newState.splice(i, 0, ...inserted);
				yield {
					content: {
						currentState: newState,
						config,
					},
					mostRecentEdit: {
						changeset: tagWrappedChangeInline(
							ChangesetWrapper.create(Change.insert(i, nodeCount, insertRevision)),
							insertRevision,
						),
						intention: insertIntention,
						description: `Add(${insertedString}@${i})`,
					},
					parent: state,
				};
			}
		}

		const maxDetachIndex = currentState.length - nodeCount;

		// Remove nodeCount nodes
		for (let iSrc = 0; iSrc <= maxDetachIndex; iSrc += 1) {
			const stateWithoutDetached = [...currentState];
			const detached = stateWithoutDetached.splice(iSrc, nodeCount);
			const detachedString = detached.map((n) => n.id).join(",");
			const removeIntention = mintIntention();
			const removeRevision = tagFromIntention(removeIntention);
			yield {
				content: {
					currentState: stateWithoutDetached,
					config,
				},
				mostRecentEdit: {
					changeset: tagWrappedChangeInline(
						ChangesetWrapper.create(Change.remove(iSrc, nodeCount, removeRevision)),
						removeRevision,
					),
					intention: removeIntention,
					description: `Del(${detachedString})`,
				},
				parent: state,
			};

			// Move nodeCount nodes
			for (let iDst = 0; iDst <= currentState.length; iDst += 1) {
				const moveInIntention = mintIntention();
				const moveRevision = tagFromIntention(moveInIntention);
				const newState = [...stateWithoutDetached];
				let adjustedDst = iDst;
				if (adjustedDst > iSrc) {
					if (adjustedDst > iSrc + nodeCount) {
						adjustedDst -= nodeCount;
					} else {
						adjustedDst = iSrc;
					}
				}
				newState.splice(adjustedDst, 0, ...detached);
				yield {
					content: {
						currentState: newState,
						config,
					},
					mostRecentEdit: {
						changeset: tagWrappedChangeInline(
							ChangesetWrapper.create(Change.move(iSrc, nodeCount, iDst, moveRevision)),
							moveRevision,
						),
						intention: moveInIntention,
						description: `Mov(${detachedString})To${iDst}`,
					},
					parent: state,
				};
			}
		}
	}

	// Make nested changes to a node
	for (let i = 0; i < currentState.length; i += 1) {
		const modifyIntention = mintIntention();
		const nestedChange = config.allocator.allocate();
		const newState = [...currentState];
		const node = currentState[i];
		newState.splice(i, 1, { ...node, nested: [...node.nested, nestedChange] });
		const nodeId: NodeId = { localId: brand(0) };
		yield {
			content: {
				currentState: newState,
				config,
			},
			mostRecentEdit: {
				changeset: tagWrappedChangeInline(
					ChangesetWrapper.create(Change.modify(i, nodeId), [
						nodeId,
						TestChange.mint(node.nested, nestedChange),
					]),
					tagFromIntention(modifyIntention),
				),
				intention: modifyIntention,
				description: `Mod(${nestedChange}on${node.id})`,
			},
			parent: state,
		};
	}
};

const fieldRebaser: BoundFieldChangeRebaser<WrappedChange> = {
	rebase: (
		change: TaggedChange<WrappedChange>,
		base: TaggedChange<WrappedChange>,
		metadata?: RebaseRevisionMetadata,
	): WrappedChange => rebaseDeepTagged(change, base, metadata).change,
	invert: invertDeep,
	compose: (change1, change2, metadata) => composeDeep([change1, change2], metadata),
	rebaseComposed: (metadata, change, ...baseChanges) => {
		const composedChanges = composeDeep(baseChanges, metadata);
		return rebaseDeepTagged(change, makeAnonChange(composedChanges), metadata).change;
	},
	inlineRevision: inlineRevisionWrapped,
	createEmpty: () => ChangesetWrapper.create([]),
	assertEqual: (change1, change2) => {
		if (change1 === undefined && change2 === undefined) {
			return true;
		}

		if (change1 === undefined || change2 === undefined) {
			return false;
		}

		const pruned1 = pruneDeep(change1.change);
		const pruned2 = pruneDeep(change2.change);

		return assertWrappedChangesetsEqual(pruned1, pruned2, true);
	},
	isEmpty: (change): boolean => {
		return withoutTombstonesDeep(pruneDeep(change)).fieldChange.length === 0;
	},
	assertChangesetsEquivalent: (change1, change2) => {
		const metadata = defaultRevisionMetadataFromChanges([change1, change2]);
		// We are composing the single changesets to inline the revision tags, as some are undefined.
		const pruned1 = pruneDeep(composeDeep([change1], metadata));
		const pruned2 = pruneDeep(composeDeep([change2], metadata));
		return assertWrappedChangesetsEqual(
			withoutTombstonesDeep(pruned1),
			withoutTombstonesDeep(pruned2),
			true,
		);
	},
};

export function testStateBasedRebaserAxioms() {
	describeStress("State-based Rebaser Axioms", function ({ stressMode }) {
		this.timeout(stressMode !== StressMode.Short ? 80_000 : 5000);
		const allocator = idAllocatorFromMaxId();
		const startingLength = 2;
		const startingState: NodeState[] = makeArray(startingLength, () => ({
			id: allocator.allocate(),
			nested: [],
		}));
		runExhaustiveComposeRebaseSuite(
			[
				{
					content: {
						currentState: startingState,
						config: { maxLength: 7, numNodes: [2], allocator },
					},
				},
			],
			generateChildStates,
			fieldRebaser,
			{
				groupSubSuites: true,
				numberOfEditsToVerifyAssociativity: stressMode !== StressMode.Short ? 4 : 3,
				skipRebaseOverCompose: false,
			},
		);
	});
}

export function testSandwichRebasing() {
	describe("Sandwich Rebasing", () => {
		it("Nested inserts rebasing", () => {
			const insertA = tagChangeInline(Change.insert(0, 2, tag1), tag1);
			const insertB = tagChangeInline(Change.insert(1, 1, tag2), tag2);
			const inverseA = tagChangeInline(
				invert(insertA, undefined /* revision */),
				tag3,
				insertA.revision,
			);
			const insertB2 = rebaseTagged(insertB, inverseA);
			const insertB3 = rebaseTagged(insertB2, insertA);
			assertChangesetsEqual(insertB3.change, insertB.change);
		});

		it("(Insert, remove) ↷ adjacent insert", () => {
			const insertT = tagChangeInline(Change.insert(0, 1, tag1), tag1);
			const insertA = tagChangeInline(Change.insert(0, 1, tag2), tag2);
			const removeB = tagChangeInline(Change.remove(0, 1, tag3), tag3);
			const insertA2 = rebaseTagged(insertA, insertT);
			const inverseA = tagChangeInline(
				invert(insertA, undefined /* revision */),
				tag4,
				insertA.revision,
			);
			const removeB2 = rebaseOverChanges(removeB, [inverseA, insertT, insertA2]);
			assertChangesetsEqual(removeB2.change, removeB.change);
		});

		it("Nested inserts composition", () => {
			const insertA = tagChangeInline(Change.insert(0, 2, tag1), tag1);
			const insertB = tagChangeInline(Change.insert(1, 1, tag2), tag2);
			const inverseA = tagChangeInline(
				invert(insertA, undefined /* revision */),
				tag3,
				insertA.revision,
			);
			const inverseB = tagChangeInline(
				invert(insertB, undefined /* revision */),
				tag4,
				insertB.revision,
			);

			const composed = compose([inverseB, inverseA, insertA, insertB]);
			assertChangesetsEqual(composed, []);
		});

		it("Nested inserts ↷ adjacent insert", () => {
			const insertX = tagChangeInline(Change.insert(0, 1, tag1), tag1);
			const insertA = tagChangeInline(Change.insert(1, 2, tag2), tag2);
			const insertB = tagChangeInline(Change.insert(2, 1, tag4), tag4);
			const inverseA = tagChangeInline(
				invert(insertA, undefined /* revision */),
				tag3,
				insertA.revision,
			);
			const insertA2 = rebaseTagged(insertA, insertX);
			const insertB2 = rebaseTagged(insertB, inverseA);
			const insertB3 = rebaseTagged(insertB2, insertX);
			const insertB4 = rebaseTagged(insertB3, insertA2);
			assertChangesetsEqual(
				insertB4.change,
				tagChangeInline(Change.insert(3, 1, tag4), tag4).change,
			);
		});

		it("[Remove AC, Revive AC] ↷ Insert B", () => {
			const addB = tagChangeInline(Change.insert(1, 1, tag1), tag1);
			const delAC = tagChangeInline(Change.remove(0, 2, tag2), tag2);
			const revAC = tagChangeInline(
				Change.revive(0, 2, { revision: tag2, localId: id0 }, tag4),
				tag4,
			);
			const delAC2 = rebaseTagged(delAC, addB);
			const invDelAC = invert(delAC, tag3);
			const revAC2 = rebaseTagged(revAC, tagChangeInline(invDelAC, tag3, delAC2.revision));
			const revAC3 = rebaseTagged(revAC2, addB);
			const revAC4 = rebaseTagged(revAC3, delAC2);
			// The rebased versions of the local edits should still cancel-out
			const actual = compose([delAC2, revAC4]);
			assertChangesetsEqual(actual, []);
		});

		it("sandwich rebase [move, undo]", () => {
			const move = tagChangeInline(Change.move(1, 1, 0, tag1), tag1);
			const undo = tagChangeInline(invert(move, tag2, false), tag2);
			const moveRollback = tagChangeInline(invert(move, tag3, true), tag3, tag1);
			const rebasedUndo = rebaseOverChanges(undo, [moveRollback, move]);
			assertChangesetsEqual(rebasedUndo.change, undo.change);
		});

		it("remove ↷ two inverse inserts", () => {
			// Given a branch with three changes:
			// A: Insert x at index 0
			// B: Insert y at index 0
			// C: Remove y
			// This test simulates rebasing C back to the trunk.

			const changeC = tagChangeInline([Mark.remove(1, brand(0))], tag3);

			const rollbackTag2 = mintRevisionTag();
			const changeB = tagChangeInline([Mark.insert(1, brand(0))], tag2);
			const inverseB = tagChangeInline(invert(changeB, rollbackTag2), rollbackTag2, tag2);

			const rollbackTag1 = mintRevisionTag();
			const changeA = tagChangeInline([Mark.insert(1, brand(0))], tag1);
			const inverseA = tagChangeInline(invert(changeA, rollbackTag1), rollbackTag1, tag1);

			const revInfos: RevisionInfo[] = [
				{ revision: rollbackTag2, rollbackOf: tag2 },
				{ revision: rollbackTag1, rollbackOf: tag1 },
				{ revision: tag1 },
				{ revision: tag2 },
			];

			const cRebasedToTrunk = rebaseOverChanges(changeC, [inverseB, inverseA], revInfos);
			const expected = [
				Mark.remove(1, brand(0), {
					cellId: { revision: tag2, localId: brand(0) },
					revision: tag3,
				}),
				Mark.tomb(tag1),
			];
			assertChangesetsEqual(cRebasedToTrunk.change, expected);
		});

		it("[insert, insert] ↷ insert", () => {
			const insertT = tagChangeInline([Mark.insert(1, brand(0))], tag1);
			const insertA = tagChangeInline([Mark.insert(1, brand(0))], tag2);
			const insertA2 = rebaseOverChanges(insertA, [insertT]);
			const inverseA = tagChangeInline(invert(insertA, tag4), tag4, tag2);
			const insertB = tagChangeInline([{ count: 1 }, Mark.insert(1, brand(0))], tag3);
			const insertB2 = rebaseOverChanges(insertB, [inverseA, insertT, insertA2]);
			const expected = [{ count: 1 }, Mark.insert(1, { revision: tag3, localId: brand(0) })];
			assertChangesetsEqual(insertB2.change, expected);
		});

		it("[revive, insert] ↷ no change", () => {
			const reviveA = tagChangeInline(
				[Mark.revive(2, { revision: tag1, localId: brand(0) })],
				tag2,
			);
			const insertB = tagChangeInline([Mark.skip(1), Mark.insert(1, brand(0))], tag3);
			const inverseA = tagChangeInline(invert(reviveA, tag4), tag4, tag2);
			const insertB2 = rebaseOverChanges(insertB, [inverseA, reviveA]);
			const expected = [Mark.skip(1), Mark.insert(1, { revision: tag3, localId: brand(0) })];

			assertChangesetsEqual(insertB2.change, expected);
		});
	});
}

export function testSandwichComposing() {
	describe("Sandwich composing", () => {
		it("insert ↷ redundant remove", () => {
			const insertA = tagChangeInline([Mark.insert(1, { localId: brand(0) })], tag3);
			const uninsertA = tagChangeInline(invert(insertA, tag4), tag4, tag3);
			const redundantRemoveT = tagChangeInline(
				[Mark.remove(1, brand(0), { cellId: { revision: tag1, localId: brand(0) } })],
				tag2,
			);

			const composed = compose([uninsertA, redundantRemoveT, insertA]);
			const expected = [
				Mark.skip(1),
				Mark.remove(
					1,
					{ revision: tag2, localId: brand(0) },
					{ cellId: { revision: tag1, localId: brand(0) } },
				),
			];

			assertChangesetsEqual(composed, expected);
		});

		it("[insert, insert] ↷ adjacent remove", () => {
			const removeT = tagChangeInline([Mark.remove(1, brand(0))], tag1);
			const insertA = tagChangeInline([Mark.skip(1), Mark.insert(1, brand(0))], tag2);
			const insertA2 = rebaseTagged(insertA, removeT);
			const inverseA = tagChangeInline(invert(insertA, tag4), tag4, tag2);
			const insertB = tagChangeInline([Mark.skip(1), Mark.insert(1, brand(0))], tag3);
			const insertB2 = rebaseOverChanges(insertB, [inverseA, removeT, insertA2]);
			const TAB = compose([removeT, insertA2, insertB2]);
			const AiTAB = compose(
				[inverseA, makeAnonChange(TAB)],
				[
					{ revision: tag4, rollbackOf: tag2 },
					{ revision: tag1 },
					{ revision: tag2 },
					{ revision: tag3 },
				],
			);

			const expected = [
				Mark.remove(1, { revision: tag1, localId: brand(0) }),
				Mark.insert(1, { revision: tag3, localId: brand(0) }),
			];

			assertChangesetsEqual(AiTAB, expected);
		});

		it("[removeB, reviveB, reviveA] ↷ []", () => {
			// Note: this test presupposes the existence of a cell A, located before cell B, emptied by tag1
			const removeB = tagChangeInline([Mark.remove(1, brand(1))], tag2);
			const reviveB = tagChangeInline(
				[Mark.revive(1, { revision: tag2, localId: brand(1) })],
				tag3,
			);
			const reviveA = tagChangeInline(
				[Mark.revive(1, { revision: tag1, localId: brand(0) })],
				tag4,
			);
			const inverseRemoveB = tagChangeInline(invert(removeB, tag5), tag5, removeB.revision);
			const inverseReviveB = tagChangeInline(invert(reviveB, tag6), tag6, reviveB.revision);
			const inverseReviveA = tagChangeInline(invert(reviveA, tag7), tag7, reviveA.revision);

			// The composition computation is broken up is steps that force us down more challenging code paths.
			// Specifically, the composition of reviveB with the composition of parts 3 to 6.
			const sandwichParts3to6 = compose([inverseRemoveB, removeB, reviveB, reviveA]);
			const sandwichParts2to6 = compose([inverseReviveB, makeAnonChange(sandwichParts3to6)]);
			const sandwichParts1to6 = compose([inverseReviveA, makeAnonChange(sandwichParts2to6)]);
			assertChangesetsEqual(sandwichParts1to6, []);
		});

		it("[move, move, modify, move] ↷ [del]", () => {
			const nodeId: NodeId = { localId: brand(4) };
			const [mo1, mi1] = Mark.move(1, brand(1));
			const move1 = tagChangeInline([mi1, mo1], tag1);
			const [mo2, mi2] = Mark.move(1, brand(2));
			const move2 = tagChangeInline([mi2, mo2], tag2);
			const mod = tagChangeInline([Mark.modify(nodeId)], tag3);
			const [mo3, mi3] = Mark.move(1, brand(3));
			const move3 = tagChangeInline([mi3, mo3], tag4);
			const del = tagChangeInline([Mark.remove(1, brand(0))], tag0);
			const return1 = tagChangeInline(invert(move1, tag5), tag5, move1.revision);
			const return2 = tagChangeInline(invert(move2, tag6), tag6, move2.revision);
			const unMod = tagChangeInline(invert(mod, tag7), tag7, mod.revision);
			const return3 = tagChangeInline(invert(move3, tag8), tag8, move3.revision);
			const move1Rebased = rebaseTagged(move1, del);
			const changes = [return3, unMod, return2, return1, del, move1Rebased, move2, mod, move3];

			const sandwich = composeShallow(changes);
			const pruned = prune(sandwich, (id) => undefined);
			const noTombstones = withoutTombstones(pruned);
			assertChangesetsEqual(noTombstones, []);
		});
	});
}

export function testComposedSandwichRebasing() {
	describe("Composed sandwich rebasing", () => {
		it("Nested inserts ↷ []", () => {
			const insertA = tagChangeInline(Change.insert(0, 2, tag1), tag1);
			const insertB = tagChangeInline(Change.insert(1, 1, tag2), tag2);
			const inverseA = tagChangeInline(invert(insertA, tag3), tag3, insertA.revision);
			const sandwich = compose([inverseA, insertA]);
			const insertB2 = rebaseTagged(insertB, makeAnonChange(sandwich));
			assertChangesetsEqual(insertB2.change, insertB.change);
		});
	});
}

export function testExamples() {
	describe("Examples", () => {
		it("a detach can end up with neighboring tombstones", () => {
			const revive = tagChangeInline(
				[Mark.revive(1, { revision: tag1, localId: brand(0) })],
				tag3,
			);
			const concurrentRemove = tagChangeInline([Mark.remove(1, brand(42))], tag2);
			const rebasedRevive = rebaseTagged(revive, concurrentRemove);
			const redetach = invert(rebasedRevive, tag4);
			const expected = [
				Mark.remove(1, brand(0), {
					idOverride: { revision: tag1, localId: brand(0) },
					revision: tag4,
				}),
				Mark.tomb(tag2, brand(42)),
			];
			assertChangesetsEqual(redetach, expected);
		});
	});
}

function tagWrappedChangeInline(
	change: WrappedChange,
	revision: RevisionTag,
	rollbackOf?: RevisionTag,
): TaggedChange<WrappedChange> {
	const inlined = inlineRevisionWrapped(change, revision);
	return rollbackOf !== undefined
		? tagRollbackInverse(inlined, revision, rollbackOf)
		: tagChange(inlined, revision);
}

function inlineRevisionWrapped(change: WrappedChange, revision: RevisionTag): WrappedChange {
	return ChangesetWrapper.inlineRevision(change, revision, inlineRevision);
}
