/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	CrossFieldManager,
	NodeChangeset,
	RevisionMetadataSource,
	singleTextCursor,
} from "../../../feature-libraries";
import {
	ChangesetLocalId,
	Delta,
	makeAnonChange,
	RevisionTag,
	tagChange,
	TaggedChange,
	tagRollbackInverse,
	TreeSchemaIdentifier,
} from "../../../core";
// TODO: Throughout this file, we use TestChange as the child change type.
// This is the same approach used in sequenceChangeRebaser.spec.ts, but it requires casting in this file
// since OptionalChangeset is not generic over the child changeset type.
// Search this file for "as any" and "as NodeChangeset"
import { TestChange } from "../../testChange";
import { deepFreeze, defaultRevisionMetadataFromChanges, isDeltaVisible } from "../../utils";
import { brand, fakeIdAllocator, idAllocatorFromMaxId } from "../../../util";
import {
	optionalChangeRebaser,
	optionalFieldEditor,
	optionalFieldIntoDelta,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/default-field-kinds/optionalField";
// eslint-disable-next-line import/no-internal-modules
import { OptionalChangeset } from "../../../feature-libraries/default-field-kinds/defaultFieldChangeTypes";

type RevisionTagMinter = () => RevisionTag;

interface OptionalFieldTestState {
	contents: string | undefined;
	mostRecentEdit?: NamedChangeset;
	parent?: OptionalFieldTestState;
}

interface NamedChangeset {
	changeset: TaggedChange<OptionalChangeset>;
	intention: number;
	description: string;
}

function makeRevisionTagMinter(prefix = "rev"): RevisionTagMinter {
	// Rather than use UUIDs, allocate these sequentially for an easier time debugging tests.
	let currentRevision = 0;
	return () => `${prefix}${currentRevision++}` as RevisionTag;
}

function makeIntentionMinter(): () => number {
	let intent = 0;
	return () => intent++;
}

const type: TreeSchemaIdentifier = brand("Node");
const mintRevisionTag = makeRevisionTagMinter();
const tags: RevisionTag[] = Array.from({ length: 7 }, mintRevisionTag);
const [tag1, tag2, tag3, tag4, tag5, tag6] = tags;

const OptionalChange = {
	set(value: string | undefined, wasEmpty: boolean, id: ChangesetLocalId = brand(0)) {
		return optionalFieldEditor.set(
			value !== undefined ? singleTextCursor({ type, value }) : undefined,
			wasEmpty,
			id,
		);
	},

	buildChildChange(childChange: TestChange) {
		return optionalFieldEditor.buildChildChange(0, childChange as NodeChangeset);
	},
};

const failCrossFieldManager: CrossFieldManager = {
	get: () => assert.fail("Should not query CrossFieldManager"),
	set: () => assert.fail("Should not modify CrossFieldManager"),
};

function toDelta(change: OptionalChangeset, revision?: RevisionTag): Delta.MarkList {
	return optionalFieldIntoDelta(tagChange(change, revision), (childChange) =>
		TestChange.toDelta(tagChange(childChange as TestChange, revision)),
	);
}

function getMaxId(...changes: OptionalChangeset[]): ChangesetLocalId | undefined {
	let max: ChangesetLocalId | undefined;
	const ingest = (candidate: ChangesetLocalId | undefined) => {
		if (max === undefined || (candidate !== undefined && candidate > max)) {
			max = candidate;
		}
	};

	for (const change of changes) {
		ingest(change.fieldChange?.id);
		// Child changes do not need to be ingested for this test file, as TestChange (which is used as a child)
		// doesn't have any `ChangesetLocalId`s.
	}

	return max;
}

function invert(change: TaggedChange<OptionalChangeset>): OptionalChangeset {
	return optionalChangeRebaser.invert(
		change,
		TestChange.invert as any,
		// Optional fields should not generate IDs during invert
		fakeIdAllocator,
		failCrossFieldManager,
	);
}

function rebase(
	change: OptionalChangeset,
	base: TaggedChange<OptionalChangeset>,
): OptionalChangeset {
	deepFreeze(change);
	deepFreeze(base);

	const metadata = defaultRevisionMetadataFromChanges([base, makeAnonChange(change)]);
	const moveEffects = failCrossFieldManager;
	const idAllocator = idAllocatorFromMaxId(getMaxId(change, base.change));
	return optionalChangeRebaser.rebase(
		change,
		base,
		TestChange.rebase as any,
		idAllocator,
		moveEffects,
		metadata,
		undefined,
	);
}

function rebaseTagged(
	change: TaggedChange<OptionalChangeset>,
	...baseChanges: TaggedChange<OptionalChangeset>[]
): TaggedChange<OptionalChangeset> {
	let currChange = change;
	for (const base of baseChanges) {
		currChange = tagChange(rebase(currChange.change, base), currChange.revision);
	}

	return currChange;
}

function rebaseComposed(
	metadata: RevisionMetadataSource,
	change: TaggedChange<OptionalChangeset>,
	...baseChanges: TaggedChange<OptionalChangeset>[]
): TaggedChange<OptionalChangeset> {
	baseChanges.forEach((base) => deepFreeze(base));
	deepFreeze(change);

	const composed = compose(baseChanges);
	const moveEffects = failCrossFieldManager;
	const idAllocator = idAllocatorFromMaxId(getMaxId(composed));
	return tagChange(
		optionalChangeRebaser.rebase(
			change.change,
			// TODO: Is anon change good enough here?
			makeAnonChange(composed),
			TestChange.rebase as any,
			idAllocator,
			moveEffects,
			metadata,
			undefined,
		),
		change.revision,
	);
}

function compose(changes: TaggedChange<OptionalChangeset>[]): OptionalChangeset {
	const moveEffects = failCrossFieldManager;
	const idAllocator = idAllocatorFromMaxId(getMaxId(...changes.map((c) => c.change)));
	return optionalChangeRebaser.compose(
		changes,
		TestChange.compose as any,
		idAllocator,
		moveEffects,
		defaultRevisionMetadataFromChanges(changes),
	);
}

function getInputContext(state: OptionalFieldTestState): number[] {
	const inputContext: number[] = [];
	for (
		let current: OptionalFieldTestState | undefined = state;
		current?.mostRecentEdit !== undefined;
		current = current.parent
	) {
		inputContext.push(current.mostRecentEdit.intention);
	}
	inputContext.reverse();
	return inputContext;
}

interface FieldStateUpTree<TContent, TChangeset> {
	content: TContent;
	mostRecentEdit?: NamedChangeset;
	parent?: FieldStateUpTree<TContent, TChangeset>;
}

function* generateChildStates(
	state: OptionalFieldTestState,
	tagFromIntention: (intention: number) => RevisionTag,
	mintIntention: () => number,
): Iterable<OptionalFieldTestState> {
	// Valid operations:
	// - set to a new value
	// - set to undefined
	// - change child

	const inputContext = getInputContext(state);
	if (state.contents !== undefined) {
		// Make a change to the child
		const changeChildIntention = mintIntention();
		yield {
			contents: state.contents,
			mostRecentEdit: {
				changeset: tagChange(
					OptionalChange.buildChildChange(
						TestChange.mint(inputContext, changeChildIntention),
					),
					tagFromIntention(changeChildIntention),
				),
				intention: changeChildIntention,
				description: `ChildChange${changeChildIntention}`,
			},
			parent: state,
		};

		const setUndefinedIntention = mintIntention();
		yield {
			contents: undefined,
			mostRecentEdit: {
				changeset: tagChange(
					OptionalChange.set(undefined, false),
					tagFromIntention(setUndefinedIntention),
				),
				intention: setUndefinedIntention,
				description: "Delete",
			},
			parent: state,
		};
	}

	for (const value of ["A", "B"]) {
		const setIntention = mintIntention();
		// Using length of the input context guarantees set operations generated at different times also have different
		// values, which should tend to be easier to debug
		const newContents = `${value},${inputContext.length}`;
		yield {
			contents: newContents,
			mostRecentEdit: {
				changeset: tagChange(
					OptionalChange.set(newContents, state.contents === undefined),
					tagFromIntention(setIntention),
				),
				intention: setIntention,
				description: `Set${value},${inputContext.length}`,
			},
			parent: state,
		};
	}

	if (state.mostRecentEdit !== undefined) {
		const undoIntention = mintIntention();
		yield {
			contents: state.parent?.contents,
			mostRecentEdit: {
				changeset: tagChange(
					invert(state.mostRecentEdit.changeset),
					tagFromIntention(undoIntention),
				),
				// TODO: Invert/TestChange has some funky logic around negative intentions being used
				// for inverses. The handling of intention/revision here might need to be updated.
				// e.g. Should this be -state.mostRecentEdit.intention?
				intention: undoIntention,
				description: `Undo:${state.mostRecentEdit.description}`,
			},
			parent: state,
		};
	}
}

function* walkOptionalFieldTestStateTree(
	initialState: OptionalFieldTestState,
	depth: number,
	tagFromIntention: (intention: number) => RevisionTag,
	mintIntention: () => number,
): Iterable<OptionalFieldTestState> {
	yield initialState;
	if (depth > 0) {
		for (const childState of generateChildStates(
			initialState,
			tagFromIntention,
			mintIntention,
		)) {
			yield* walkOptionalFieldTestStateTree(
				childState,
				depth - 1,
				tagFromIntention,
				mintIntention,
			);
		}
	}
}

function* generatePossibleSequenceOfEdits(
	initialState: OptionalFieldTestState,
	numberOfEdits: number,
	tagPrefix: string,
): Iterable<NamedChangeset[]> {
	for (const state of walkOptionalFieldTestStateTree(
		initialState,
		numberOfEdits,
		(intention: number) => `${tagPrefix}${intention}` as RevisionTag,
		makeIntentionMinter(),
	)) {
		const edits: NamedChangeset[] = [];
		for (
			let current: OptionalFieldTestState | undefined = state;
			current?.mostRecentEdit !== undefined;
			current = current.parent
		) {
			edits.push(current.mostRecentEdit);
		}

		if (edits.length === numberOfEdits) {
			edits.reverse();
			yield edits;
		}
	}
}

function runSingleEditRebaseAxiomSuite(initialState: OptionalFieldTestState) {
	const testChanges: [string, OptionalChangeset][] = Array.from(
		generatePossibleSequenceOfEdits(initialState, 1, "rev"),
		// TODO: Use generated tags rather than mint new ones.
		([{ description, changeset }]) => [description, changeset.change],
	);
	deepFreeze(testChanges);

	/**
	 * This test simulates rebasing over an do-inverse pair.
	 */
	describe("A ↷ [B, B⁻¹] === A", () => {
		for (const [name1, untaggedChange1] of testChanges) {
			for (const [name2, untaggedChange2] of testChanges) {
				it(`(${name1} ↷ ${name2}) ↷ ${name2}⁻¹ => ${name1}`, () => {
					const change1 = tagChange(untaggedChange1, tag5);
					const change2 = tagChange(untaggedChange2, tag3);
					const inv = tagRollbackInverse(invert(change2), tag4, tag3);
					const r1 = rebaseTagged(change1, change2);
					const r2 = rebaseTagged(r1, inv);
					assert.deepEqual(r2.change, change1.change);
				});
			}
		}
	});

	/**
	 * This test simulates rebasing over an do-undo pair.
	 * It is different from the above in two ways:
	 * - The undo(B) changeset bears a different RevisionTag than B
	 * - The inverse produced by undo(B) is not a rollback
	 */
	describe("A ↷ [B, undo(B)] => A", () => {
		for (const [name1, untaggedChange1] of testChanges) {
			for (const [name2, untaggedChange2] of testChanges) {
				const title = `${name1} ↷ [${name2}, undo(${name2})] => ${name1}`;
				it(title, () => {
					const change1 = tagChange(untaggedChange1, tag5);
					const change2 = tagChange(untaggedChange2, tag3);
					const inv = tagChange(invert(change2), tag4);
					const r1 = rebaseTagged(change1, change2);
					const r2 = rebaseTagged(r1, inv);
					assert.deepEqual(r2.change, change1.change);
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
		for (const [name1, untaggedChange1] of testChanges) {
			for (const [name2, untaggedChange2] of testChanges) {
				const title = `${name1} ↷ [${name2}, ${name2}⁻¹, ${name2}] => ${name1} ↷ ${name2}`;
				it(title, () => {
					const change1 = tagChange(untaggedChange1, tag6);
					const change2 = tagChange(untaggedChange2, tag3);
					const inverse2 = tagRollbackInverse(invert(change2), tag4, change2.revision);
					const r1 = rebaseTagged(change1, change2);
					const r2 = rebaseTagged(r1, inverse2);
					const r3 = rebaseTagged(r2, change2);
					assert.deepEqual(r3.change, r1.change);
				});
			}
		}
	});

	describe("A ○ A⁻¹ === ε", () => {
		for (const [name, change] of testChanges) {
			if (["SetA", "SetB", "SetUndefined"].includes(name)) {
				// TODO:AB#4622: OptionalChangeset should obey group axioms, but the current compose implementation does not
				// cancel changes from inverses, and in some cases the representation isn't sufficient for doing so.
				// Set operations fail to satisfy this test because they generate explicit deltas which set the trait to be
				// the previous value, rather than noops.
				continue;
			}

			it(`${name} ○ ${name}⁻¹ === ε`, () => {
				const taggedChange = tagChange(change, tag1);
				const inv = invert(taggedChange);
				const changes = [
					taggedChange,
					tagRollbackInverse(inv, tag2, taggedChange.revision),
				];
				const actual = compose(changes);
				const delta = toDelta(actual);
				assert.equal(isDeltaVisible(delta), false);
			});
		}
	});

	describe("A⁻¹ ○ A === ε", () => {
		for (const [name, change] of testChanges) {
			if (["SetA", "SetB", "SetUndefined"].includes(name)) {
				// TODO:AB#4622: OptionalChangeset should obey group axioms, but the current compose implementation does not
				// cancel changes from inverses, and in some cases the representation isn't sufficient for doing so.
				// Set operations fail to satisfy this test because they generate explicit deltas which set the trait to be
				// the previous value, rather than noops.
				continue;
			}
			it(`${name}⁻¹ ○ ${name} === ε`, () => {
				const taggedChange = tagChange(change, tag1);
				const inv = tagRollbackInverse(invert(taggedChange), tag2, taggedChange.revision);
				const changes = [inv, taggedChange];
				const actual = compose(changes);
				const delta = toDelta(actual);
				assert.equal(isDeltaVisible(delta), false);
			});
		}
	});

	describe("A ↷ [B, B⁻¹, C] === A ↷ compose([B, B⁻¹, C])", () => {
		for (const [nameA, changeA] of testChanges) {
			for (const [nameB, changeB] of testChanges) {
				for (const [nameC, changeC] of testChanges) {
					// if (!(nameA === "ChangeChild" && nameB === "SetA" && nameC === "ChangeChild")) {
					// 	continue;
					// }

					it(`${nameA} ↷ [${nameB}, ${nameB}⁻¹, ${nameC}] === ${nameA} ↷ compose([${nameB}, ${nameB}⁻¹, ${nameC}])`, () => {
						const taggedChangeA = tagChange(changeA, tag1);
						const taggedChangeB = tagChange(changeB, tag2);
						const taggedChangeC = tagChange(changeC, tag3);
						const invB = tagRollbackInverse(
							invert(taggedChangeB),
							tag4,
							taggedChangeB.revision,
						);
						const changes = [taggedChangeB, invB, taggedChangeC];
						const r1 = rebaseTagged(taggedChangeA, ...changes);
						const metadata = defaultRevisionMetadataFromChanges([
							...changes,
							taggedChangeA,
						]);
						const rebaseOverCompose = rebaseComposed(
							metadata,
							taggedChangeA,
							...changes,
						);
						assert.deepEqual(r1.change, rebaseOverCompose.change);
					});
				}
			}
		}
	});
}

describe.only("OptionalField - Rebaser Axioms", () => {
	describe.only("Using valid edits from an undefined field", () => {
		runSingleEditRebaseAxiomSuite({ contents: undefined });
	});

	describe.only("Using valid edits from a field with content", () => {
		runSingleEditRebaseAxiomSuite({ contents: "A" });
	});

	// To limit combinatorial explosion, we test 'rebasing over a compose is equivalent to rebasing over the individual edits'
	// by:
	// - Rebasing a single edit over N sequential edits
	// - Rebasing N sequential edits over a single edit, sandwich-rebasing style
	//   (meaning [A, B, C] ↷ D involves B ↷ compose([A⁻¹, D, A]) and C ↷ compose([B⁻¹, A⁻¹, D, A, B]))
	describe("Rebase over compose exhaustive", () => {
		for (const initialState of [{ contents: undefined }, { contents: "A" }]) {
			describe(`starting with contents ${initialState.contents}`, () => {
				for (const [
					{ description: name, changeset: edit },
				] of generatePossibleSequenceOfEdits(initialState, 1, "local-rev-")) {
					for (const namedEditsToRebaseOver of generatePossibleSequenceOfEdits(
						initialState,
						2,
						"trunk-rev-",
					)) {
						const title = `Rebase ${name} over compose ${JSON.stringify(
							namedEditsToRebaseOver.map(({ description }) => description),
						)}`;

						// if (
						// 	title !== 'Rebase ChildChange 0 over compose ["Set undefined","Set 1"]'
						// ) {
						// 	continue;
						// }
						it(title, () => {
							const editsToRebaseOver = namedEditsToRebaseOver.map(
								({ changeset }) => changeset,
							);
							const rebaseWithoutCompose = rebaseTagged(edit, ...editsToRebaseOver);
							const metadata = defaultRevisionMetadataFromChanges([
								...editsToRebaseOver,
								edit,
							]);
							const rebaseWithCompose = rebaseComposed(
								metadata,
								edit,
								...editsToRebaseOver,
							);
							assert.deepEqual(rebaseWithCompose.change, rebaseWithoutCompose.change);
						});
					}
				}
			});
		}
	});

	describe("Sandwich rebase over compose exhaustive", () => {
		for (const initialState of [{ contents: undefined }, { contents: "A" }]) {
			describe(`starting with contents ${initialState.contents}`, () => {
				for (const namedSourceEdits of generatePossibleSequenceOfEdits(
					initialState,
					2,
					"local-rev-",
				)) {
					for (const [
						{ description: name, changeset: namedEditToRebaseOver },
					] of generatePossibleSequenceOfEdits(initialState, 1, "trunk-rev-")) {
						const title = `Rebase ${JSON.stringify(
							namedSourceEdits.map(({ description }) => description),
						)} over ${name}`;

						// if (title !== 'Rebase ["Set 0","ChildChange 1"] over Set 0') {
						// 	continue;
						// }
						it(title, () => {
							const editToRebaseOver = namedEditToRebaseOver;
							const sourceEdits = namedSourceEdits.map(({ changeset }) => changeset);

							const inverses = sourceEdits.map((change) =>
								tagRollbackInverse(
									invert(change),
									`rollback-${change.revision}` as RevisionTag,
									change.revision,
								),
							);

							const rebasedEditsWithoutCompose: TaggedChange<OptionalChangeset>[] =
								[];
							const rebasedEditsWithCompose: TaggedChange<OptionalChangeset>[] = [];

							for (let i = 0; i < sourceEdits.length; i++) {
								const edit = sourceEdits[i];
								const editsToRebaseOver = [
									...inverses.slice(0, i),
									editToRebaseOver,
									...rebasedEditsWithoutCompose,
								];
								rebasedEditsWithoutCompose.push(
									rebaseTagged(edit, ...editsToRebaseOver),
								);
							}

							let currentComposedEdit = editToRebaseOver;
							// This needs to be used to pass an updated RevisionMetadataSource to rebase.
							const allTaggedEdits = [...inverses, editToRebaseOver];
							for (let i = 0; i < sourceEdits.length; i++) {
								const metadata = defaultRevisionMetadataFromChanges(allTaggedEdits);
								const edit = sourceEdits[i];
								const rebasedEdit = rebaseComposed(
									metadata,
									edit,
									currentComposedEdit,
								);
								rebasedEditsWithCompose.push(rebasedEdit);
								currentComposedEdit = makeAnonChange(
									compose([inverses[i], currentComposedEdit, rebasedEdit]),
								);
								allTaggedEdits.push(rebasedEdit);
							}

							for (let i = 0; i < rebasedEditsWithoutCompose.length; i++) {
								assert.deepEqual(
									rebasedEditsWithoutCompose[i].change,
									rebasedEditsWithCompose[i].change,
								);
							}
						});
					}
				}
			});
		}
	});
});
