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
import {
	FieldStateTree,
	getInputContext,
	generatePossibleSequenceOfEdits,
} from "./exhaustiveRebaserUtils";

type RevisionTagMinter = () => RevisionTag;

function makeRevisionTagMinter(prefix = "rev"): RevisionTagMinter {
	// Rather than use UUIDs, allocate these sequentially for an easier time debugging tests.
	let currentRevision = 0;
	return () => `${prefix}${currentRevision++}` as RevisionTag;
}

const type: TreeSchemaIdentifier = brand("Node");
const mintRevisionTag = makeRevisionTagMinter();
const tag1 = mintRevisionTag();

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

type OptionalFieldTestState = FieldStateTree<string | undefined, OptionalChangeset>;

function* generateChildStates(
	state: OptionalFieldTestState,
	tagFromIntention: (intention: number) => RevisionTag,
	mintIntention: () => number,
): Iterable<OptionalFieldTestState> {
	const inputContext = getInputContext(state);
	if (state.content !== undefined) {
		const changeChildIntention = mintIntention();
		yield {
			content: state.content,
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
			content: undefined,
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
			content: newContents,
			mostRecentEdit: {
				changeset: tagChange(
					OptionalChange.set(newContents, state.content === undefined),
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
			content: state.parent?.content,
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

/**
 * Runs a suite of axiomatic tests which use combinations of single edits that are valid to apply from an initial state.
 */
function runSingleEditRebaseAxiomSuite(initialState: OptionalFieldTestState) {
	const singleTestChanges = (prefix: string) =>
		generatePossibleSequenceOfEdits(initialState, generateChildStates, 1, prefix);

	/**
	 * This test simulates rebasing over an do-inverse pair.
	 */
	describe("A ↷ [B, B⁻¹] === A", () => {
		for (const [{ description: name1, changeset: change1 }] of singleTestChanges("A")) {
			for (const [{ description: name2, changeset: change2 }] of singleTestChanges("B")) {
				it(`(${name1} ↷ ${name2}) ↷ ${name2}⁻¹ => ${name1}`, () => {
					const inv = tagRollbackInverse(invert(change2), tag1, change2.revision);
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
		for (const [{ description: name1, changeset: change1 }] of singleTestChanges("A")) {
			for (const [{ description: name2, changeset: change2 }] of singleTestChanges("B")) {
				const title = `${name1} ↷ [${name2}, undo(${name2})] => ${name1}`;
				it(title, () => {
					const inv = tagChange(invert(change2), tag1);
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
		for (const [{ description: name1, changeset: change1 }] of singleTestChanges("A")) {
			for (const [{ description: name2, changeset: change2 }] of singleTestChanges("B")) {
				const title = `${name1} ↷ [${name2}, ${name2}⁻¹, ${name2}] => ${name1} ↷ ${name2}`;
				it(title, () => {
					const inverse2 = tagRollbackInverse(invert(change2), tag1, change2.revision);
					const r1 = rebaseTagged(change1, change2);
					const r2 = rebaseTagged(r1, inverse2);
					const r3 = rebaseTagged(r2, change2);
					assert.deepEqual(r3.change, r1.change);
				});
			}
		}
	});

	describe("A ○ A⁻¹ === ε", () => {
		for (const [{ description: name, changeset: change }] of singleTestChanges("A")) {
			if (
				initialState.content !== undefined &&
				["SetA,0", "SetB,0", "Delete"].includes(name)
			) {
				// TODO:AB#4622: OptionalChangeset should obey group axioms, but the current compose implementation does not
				// cancel changes from inverses, and in some cases the representation isn't sufficient for doing so.
				// Set operations fail to satisfy this test because they generate explicit deltas which set the trait to be
				// the previous value, rather than noops.
				continue;
			}

			it(`${name} ○ ${name}⁻¹ === ε`, () => {
				const inv = invert(change);
				const actual = compose([change, tagRollbackInverse(inv, tag1, change.revision)]);
				const delta = toDelta(actual);
				assert.equal(isDeltaVisible(delta), false);
			});
		}
	});

	describe("A⁻¹ ○ A === ε", () => {
		for (const [{ description: name, changeset: change }] of singleTestChanges("A")) {
			if (["SetA,0", "SetB,0"].includes(name)) {
				// TODO:AB#4622: OptionalChangeset should obey group axioms, but the current compose implementation does not
				// cancel changes from inverses, and in some cases the representation isn't sufficient for doing so.
				// Set operations fail to satisfy this test because they generate explicit deltas which set the trait to be
				// the previous value, rather than noops.
				continue;
			}
			it(`${name}⁻¹ ○ ${name} === ε`, () => {
				const inv = tagRollbackInverse(invert(change), tag1, change.revision);
				const actual = compose([inv, change]);
				const delta = toDelta(actual);
				assert.equal(isDeltaVisible(delta), false);
			});
		}
	});
}

describe("OptionalField - Rebaser Axioms", () => {
	describe("Using valid edits from an undefined field", () => {
		runSingleEditRebaseAxiomSuite({ content: undefined });
	});

	describe("Using valid edits from a field with content", () => {
		runSingleEditRebaseAxiomSuite({ content: "A" });
	});

	// To limit combinatorial explosion, we test 'rebasing over a compose is equivalent to rebasing over the individual edits'
	// by:
	// - Rebasing a single edit over N sequential edits
	// - Rebasing N sequential edits over a single edit, sandwich-rebasing style
	//   (meaning [A, B, C] ↷ D involves B ↷ compose([A⁻¹, D, A]) and C ↷ compose([B⁻¹, A⁻¹, D, A, B]))
	const numberOfEditsToRebaseOver = 2;
	const numberOfEditsToRebase = numberOfEditsToRebaseOver;

	describe.skip("Rebase over compose exhaustive", () => {
		for (const initialState of [{ content: undefined }, { content: "A" }]) {
			describe(`starting with contents ${initialState.content}`, () => {
				for (const [
					{ description: name, changeset: edit },
				] of generatePossibleSequenceOfEdits(
					initialState,
					generateChildStates,
					1,
					"local-rev-",
				)) {
					for (const namedEditsToRebaseOver of generatePossibleSequenceOfEdits(
						initialState,
						generateChildStates,
						numberOfEditsToRebaseOver,
						"trunk-rev-",
					)) {
						const title = `Rebase ${name} over compose ${JSON.stringify(
							namedEditsToRebaseOver.map(({ description }) => description),
						)}`;

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

	describe.skip("Sandwich rebase over compose exhaustive", () => {
		for (const initialState of [{ content: undefined }, { content: "A" }]) {
			describe(`starting with contents ${initialState.content}`, () => {
				for (const namedSourceEdits of generatePossibleSequenceOfEdits(
					initialState,
					generateChildStates,
					numberOfEditsToRebase,
					"local-rev-",
				)) {
					for (const [
						{ description: name, changeset: namedEditToRebaseOver },
					] of generatePossibleSequenceOfEdits(
						initialState,
						generateChildStates,
						1,
						"trunk-rev-",
					)) {
						const title = `Rebase ${JSON.stringify(
							namedSourceEdits.map(({ description }) => description),
						)} over ${name}`;

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
