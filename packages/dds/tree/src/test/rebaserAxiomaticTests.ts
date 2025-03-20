/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type RevisionMetadataSource,
	type RevisionTag,
	type TaggedChange,
	makeAnonChange,
	mapTaggedChange,
	tagChange,
	tagRollbackInverse,
} from "../core/index.js";
// eslint-disable-next-line import/no-internal-modules
import { rebaseRevisionMetadataFromInfo } from "../feature-libraries/modular-schema/index.js";
import { fail } from "../util/index.js";

import {
	type BoundFieldChangeRebaser,
	type ChildStateGenerator,
	type FieldStateTree,
	type NamedChangeset,
	generatePossibleSequenceOfEdits,
	makeIntentionMinter,
} from "./exhaustiveRebaserUtils.js";
import { defaultRevInfosFromChanges, defaultRevisionMetadataFromChanges } from "./utils.js";

interface ExhaustiveSuiteOptions {
	skipRebaseOverCompose?: boolean;
	groupSubSuites?: boolean;
	numberOfEditsToRebase?: number;
	numberOfEditsToRebaseOver?: number;
	numberOfEditsToVerifyAssociativity?: number;
}

const defaultSuiteOptions: Required<ExhaustiveSuiteOptions> = {
	/**
	 * Some FieldKinds don't pass this suite and can override this option to skip it.
	 */
	skipRebaseOverCompose: false,
	/**
	 * Runs sub-suites as an individual test to reduce test discovery time
	 */
	groupSubSuites: false,
	numberOfEditsToRebase: 2,
	numberOfEditsToRebaseOver: 2,
	numberOfEditsToVerifyAssociativity: 4,
};

/**
 * Rebases `change` over all edits in `rebasePath`.
 * @param rebase - The rebase function to use.
 * @param change - The change to rebase
 * @param rebasePath - The edits to rebase over.
 * Must contain all the prior edits from the branch that `change` comes from.
 * For example, if `change` is B in branch [A, B, C], being rebased over edits [X, Y],
 * then `rebasePath` must be [A⁻¹, X, Y, A'].
 */
function rebaseTagged<TChangeset>(
	rebase: BoundFieldChangeRebaser<TChangeset>["rebase"],
	change: TaggedChange<TChangeset>,
	rebasePath: TaggedChange<TChangeset>[],
): TaggedChange<TChangeset> {
	let currChange = change;
	const revisionInfo = defaultRevInfosFromChanges([...rebasePath, change]);
	for (const base of rebasePath) {
		const metadata = rebaseRevisionMetadataFromInfo(revisionInfo, change.revision, [
			base.revision,
		]);
		currChange = tagChange(rebase(currChange, base, metadata), currChange.revision);
	}

	return currChange;
}

export function runExhaustiveComposeRebaseSuite<TContent, TChangeset>(
	initialStates: FieldStateTree<TContent, TChangeset>[],
	generateChildStates: ChildStateGenerator<TContent, TChangeset>,
	fieldRebaser: BoundFieldChangeRebaser<TChangeset>,
	options?: ExhaustiveSuiteOptions,
) {
	const assertDeepEqual = getDefaultedEqualityAssert(fieldRebaser);
	const definedOptions = { ...defaultSuiteOptions, ...options };

	// To limit combinatorial explosion, we test 'rebasing over a compose is equivalent to rebasing over the individual edits'
	// by:
	// - Rebasing a single edit over N sequential edits
	// - Rebasing N sequential edits over a single edit, sandwich-rebasing style
	//   (meaning [A, B, C] ↷ D involves B ↷ compose([A⁻¹, D, A']) and C ↷ compose([B⁻¹, A⁻¹, D, A', B']))
	const {
		numberOfEditsToRebaseOver,
		numberOfEditsToRebase,
		numberOfEditsToVerifyAssociativity,
		groupSubSuites,
	} = definedOptions;

	// Skip the "Rebase over compose" suite if specified to in the suite options.
	const rebaseOverComposeDescribe = definedOptions.skipRebaseOverCompose
		? describe.skip
		: describe;

	const [outerFixture, innerFixture] = groupSubSuites
		? [it, (title: string, fn: () => void) => fn()]
		: [describe, it];

	rebaseOverComposeDescribe("Rebase over compose", () => {
		for (const initialState of initialStates) {
			const intentionMinter = makeIntentionMinter();
			outerFixture(`starting with contents ${JSON.stringify(initialState.content)}`, () => {
				const localEdits = Array.from(
					generatePossibleSequenceOfEdits(
						initialState,
						generateChildStates,
						1,
						"local-rev-",
						intentionMinter,
					),
				);
				const trunkEdits = Array.from(
					generatePossibleSequenceOfEdits(
						initialState,
						generateChildStates,
						numberOfEditsToRebaseOver,
						"trunk-rev-",
						intentionMinter,
					),
				);
				for (const [{ description: name, changeset: edit }] of localEdits) {
					for (const namedEditsToRebaseOver of trunkEdits) {
						const title = `Rebase ${name} over compose ${JSON.stringify(
							namedEditsToRebaseOver.map(({ description }) => description),
						)}`;

						innerFixture(title, () => {
							rebaseOverSinglesVsRebaseOverCompositions<TChangeset>(
								edit,
								namedEditsToRebaseOver,
								fieldRebaser,
							);
						});
					}
				}
			});
		}
	});

	describe("Composed sandwich rebase over single edit", () => {
		for (const initialState of initialStates) {
			outerFixture(`starting with contents ${JSON.stringify(initialState.content)}`, () => {
				const intentionMinter = makeIntentionMinter();
				const localEdits = Array.from(
					generatePossibleSequenceOfEdits(
						initialState,
						generateChildStates,
						numberOfEditsToRebase,
						"local-rev-",
						intentionMinter,
					),
				);
				const trunkEdits = Array.from(
					generatePossibleSequenceOfEdits(
						initialState,
						generateChildStates,
						1,
						"trunk-rev-",
						intentionMinter,
					),
				);
				for (const namedSourceEdits of localEdits) {
					for (const [{ description: name, changeset: namedEditToRebaseOver }] of trunkEdits) {
						const title = `Rebase ${JSON.stringify(
							namedSourceEdits.map(({ description }) => description),
						)} over ${name}`;

						innerFixture(title, () => {
							const editToRebaseOver = namedEditToRebaseOver;
							const sourceEdits = namedSourceEdits.map(({ changeset }) => changeset);

							const rollbacks = sourceEdits.map((change) => rollback(fieldRebaser, change));
							rollbacks.reverse();

							const rebasedEditsWithoutCompose = sandwichRebaseWithoutCompose(
								sourceEdits,
								rollbacks,
								editToRebaseOver,
								fieldRebaser,
							);

							const rebasedEditsWithCompose = sandwichRebaseWithCompose(
								sourceEdits,
								rollbacks,
								editToRebaseOver,
								fieldRebaser,
							);

							for (let i = 0; i < rebasedEditsWithoutCompose.length; i++) {
								assertDeepEqual(rebasedEditsWithoutCompose[i], rebasedEditsWithCompose[i]);
							}

							// TODO: consider testing the compose associativity with the `rebasedEditsWithoutCompose` as well.
							const allTaggedEdits = [
								...rollbacks,
								editToRebaseOver,
								...rebasedEditsWithCompose,
							];
							verifyComposeAssociativity(allTaggedEdits, fieldRebaser);
						});
					}
				}
			});
		}
	});

	describe("rebaseLeftDistributivity: A ↷ (B ○ C) = (A ↷ B) ↷ C", () => {
		for (const initialState of initialStates) {
			const intentionMinter = makeIntentionMinter();
			outerFixture(`starting with contents ${JSON.stringify(initialState.content)}`, () => {
				const localEdits = Array.from(
					generatePossibleSequenceOfEdits(
						initialState,
						generateChildStates,
						1,
						"local-rev-",
						intentionMinter,
					),
				);
				const trunkEdits = Array.from(
					generatePossibleSequenceOfEdits(
						initialState,
						generateChildStates,
						2,
						"trunk-rev-",
						intentionMinter,
					),
				);
				for (const [{ description: name, changeset: edit }] of localEdits) {
					for (const namedEditsToRebaseOver of trunkEdits) {
						const title = `Rebase ${name} over edits for left distributivity ${JSON.stringify(
							namedEditsToRebaseOver.map(({ description }) => description),
						)}`;

						innerFixture(title, () => {
							verifyRebaseLeftDistributivity<TChangeset>(
								edit,
								namedEditsToRebaseOver,
								fieldRebaser,
							);
						});
					}
				}
			});
		}
	});

	describe.skip("rebaseRightDistributivity: (A ○ B) ↷ C = (A ↷ C) ○ (B ↷ (A⁻¹ ○ C ○ (A ↷ C)))", () => {
		for (const initialState of initialStates) {
			const intentionMinter = makeIntentionMinter();
			outerFixture(`starting with contents ${JSON.stringify(initialState.content)}`, () => {
				const localEdits = Array.from(
					generatePossibleSequenceOfEdits(
						initialState,
						generateChildStates,
						2,
						"local-rev-",
						intentionMinter,
					),
				);
				const trunkEdits = Array.from(
					generatePossibleSequenceOfEdits(
						initialState,
						generateChildStates,
						1,
						"trunk-rev-",
						intentionMinter,
					),
				);
				for (const [
					{ description: name1, changeset: edit1 },
					{ description: name2, changeset: edit2 },
				] of localEdits) {
					for (const namedEditsToRebaseOver of trunkEdits) {
						const title = `Rebase ${name1} and ${name2} over edits to check for right distributivity ${JSON.stringify(
							namedEditsToRebaseOver[0].description,
						)}`;

						innerFixture(title, () => {
							verifyRebaseRightDistributivity<TChangeset>(
								[edit1, edit2],
								namedEditsToRebaseOver[0],
								fieldRebaser,
							);
						});
					}
				}
			});
		}
	});

	describe("rebaseOverUndoRedoPair: ((A ↷ B) ↷ B⁻¹) ↷ B = A ↷ B", () => {
		for (const initialState of initialStates) {
			const intentionMinter = makeIntentionMinter();
			outerFixture(`starting with contents ${JSON.stringify(initialState.content)}`, () => {
				const localEdits = Array.from(
					generatePossibleSequenceOfEdits(
						initialState,
						generateChildStates,
						1,
						"local-rev-",
						intentionMinter,
					),
				);
				const trunkEdits = Array.from(
					generatePossibleSequenceOfEdits(
						initialState,
						generateChildStates,
						1,
						"trunk-rev-",
						intentionMinter,
					),
				);
				for (const [{ description: name, changeset: edit }] of localEdits) {
					for (const namedEditsToRebaseOver of trunkEdits) {
						const title = `Rebase ${name} over undo redo pair ${JSON.stringify(
							namedEditsToRebaseOver.map(({ description }) => description),
						)}`;

						innerFixture(title, () => {
							verifyRebaseOverUndoRedoPair<TChangeset>(
								edit,
								namedEditsToRebaseOver[0],
								fieldRebaser,
							);
						});
					}
				}
			});
		}
	});

	describe("rebaseOverDoUndoPairIsNoOp: (A ↷ B) ↷ B⁻¹ = A", () => {
		for (const initialState of initialStates) {
			const intentionMinter = makeIntentionMinter();
			outerFixture(`starting with contents ${JSON.stringify(initialState.content)}`, () => {
				const localEdits = Array.from(
					generatePossibleSequenceOfEdits(
						initialState,
						generateChildStates,
						1,
						"local-rev-",
						intentionMinter,
					),
				);
				const trunkEdits = Array.from(
					generatePossibleSequenceOfEdits(
						initialState,
						generateChildStates,
						1,
						"trunk-rev-",
						intentionMinter,
					),
				);
				for (const [{ description: name, changeset: edit }] of localEdits) {
					for (const namedEditsToRebaseOver of trunkEdits) {
						const title = `Rebase ${name} over do undo pair ${JSON.stringify(
							namedEditsToRebaseOver.map(({ description }) => description),
						)}`;

						innerFixture(title, () => {
							verifyRebaseOverDoUndoPairIsNoOp<TChangeset>(
								edit,
								namedEditsToRebaseOver[0],
								fieldRebaser,
							);
						});
					}
				}
			});
		}
	});

	describe("rebaseOverEmpty: A ↷ ε = A", () => {
		for (const initialState of initialStates) {
			const intentionMinter = makeIntentionMinter();
			outerFixture(`starting with contents ${JSON.stringify(initialState.content)}`, () => {
				const localEdits = Array.from(
					generatePossibleSequenceOfEdits(
						initialState,
						generateChildStates,
						1,
						"local-rev-",
						intentionMinter,
					),
				);
				for (const [{ description: name, changeset: edit }] of localEdits) {
					const title = `Rebase ${name} over empty change`;

					innerFixture(title, () => {
						verifyRebaseOverEmpty<TChangeset>(edit, fieldRebaser);
					});
				}
			});
		}
	});

	describe("rebaseEmpty: ε ↷ A = ε", () => {
		for (const initialState of initialStates) {
			const intentionMinter = makeIntentionMinter();
			outerFixture(`starting with contents ${JSON.stringify(initialState.content)}`, () => {
				const trunkEdits = Array.from(
					generatePossibleSequenceOfEdits(
						initialState,
						generateChildStates,
						1,
						"trunk-rev-",
						intentionMinter,
					),
				);
				for (const [{ description: name, changeset: edit }] of trunkEdits) {
					const title = `Rebase empty change over ${name}`;

					innerFixture(title, () => {
						verifyRebaseEmpty<TChangeset>(edit, fieldRebaser);
					});
				}
			});
		}
	});

	describe("Compose associativity", () => {
		for (const initialState of initialStates) {
			outerFixture(`starting with contents ${JSON.stringify(initialState.content)}`, () => {
				for (const namedSourceEdits of generatePossibleSequenceOfEdits(
					initialState,
					generateChildStates,
					numberOfEditsToVerifyAssociativity,
					"rev-",
				)) {
					const title = `for ${JSON.stringify(
						namedSourceEdits.map(({ description }) => description),
					)}`;

					// Note that this test case doesn't verify associativity of rollback inverses.
					// That's covered some by "Composed sandwich rebase over single edit"
					innerFixture(title, () => {
						const edits = namedSourceEdits.map(({ changeset }) => changeset);
						verifyComposeAssociativity(edits, fieldRebaser);
					});
				}
			});
		}
	});

	describe("composeWithEmpty: A ○ ε = ε ○ A = A", () => {
		for (const initialState of initialStates) {
			outerFixture(`starting with contents ${JSON.stringify(initialState.content)}`, () => {
				for (const namedSourceEdits of generatePossibleSequenceOfEdits(
					initialState,
					generateChildStates,
					1,
					"rev-",
				)) {
					const title = `for ${JSON.stringify(
						namedSourceEdits.map(({ description }) => description),
					)}`;

					innerFixture(title, () => {
						const edit = namedSourceEdits[0].changeset;
						verifyComposeWithEmptyIsNoOp(edit, fieldRebaser);
					});
				}
			});
		}
	});

	describe("composeWithInverse: A ○ A⁻¹ = ε", () => {
		for (const initialState of initialStates) {
			outerFixture(`starting with contents ${JSON.stringify(initialState.content)}`, () => {
				for (const namedSourceEdits of generatePossibleSequenceOfEdits(
					initialState,
					generateChildStates,
					1,
					"rev-",
				)) {
					const title = `for ${JSON.stringify(
						namedSourceEdits.map(({ description }) => description),
					)}`;

					innerFixture(title, () => {
						const edit = namedSourceEdits[0].changeset;
						verifyComposeWithInverseEqualsEmpty(edit, fieldRebaser);
					});
				}
			});
		}
	});
}

function sandwichRebaseWithCompose<TChangeset>(
	sourceEdits: TaggedChange<TChangeset>[],
	rollbacks: TaggedChange<TChangeset>[],
	editToRebaseOver: TaggedChange<TChangeset>,
	fieldRebaser: BoundFieldChangeRebaser<TChangeset>,
): TaggedChange<TChangeset>[] {
	const rebasedEditsWithCompose: TaggedChange<TChangeset>[] = [];
	let compositionScope: TaggedChange<TChangeset>[] = [editToRebaseOver];
	let currentComposedEdit = editToRebaseOver;
	// This needs to be used to pass an updated RevisionMetadataSource to rebase.
	for (let i = 0; i < sourceEdits.length; i++) {
		const edit = sourceEdits[i];
		const rebasePath = [
			...rollbacks.slice(sourceEdits.length - i),
			editToRebaseOver,
			...sourceEdits.slice(0, i),
		];
		const rebaseMetadata = rebaseRevisionMetadataFromInfo(
			defaultRevInfosFromChanges([...rebasePath, edit]),
			edit.revision,
			[editToRebaseOver.revision],
		);
		const rebasedEdit = tagChange(
			fieldRebaser.rebaseComposed(rebaseMetadata, edit, currentComposedEdit),
			edit.revision,
		);
		rebasedEditsWithCompose.push(rebasedEdit);
		compositionScope = [
			rollbacks[sourceEdits.length - i - 1],
			...compositionScope,
			rebasedEdit,
		];
		const composeMetadata = defaultRevisionMetadataFromChanges(compositionScope);
		currentComposedEdit = makeAnonChange(
			fieldRebaser.compose(
				rollbacks[sourceEdits.length - i - 1],
				currentComposedEdit,
				composeMetadata,
			),
		);

		currentComposedEdit = makeAnonChange(
			fieldRebaser.compose(currentComposedEdit, rebasedEdit, composeMetadata),
		);
	}
	return rebasedEditsWithCompose;
}

function sandwichRebaseWithoutCompose<TChangeset>(
	sourceEdits: TaggedChange<TChangeset>[],
	rollbacks: TaggedChange<TChangeset>[],
	editToRebaseOver: TaggedChange<TChangeset>,
	fieldRebaser: BoundFieldChangeRebaser<TChangeset>,
): TaggedChange<TChangeset>[] {
	const rebasedEditsWithoutCompose: TaggedChange<TChangeset>[] = [];
	for (let i = 0; i < sourceEdits.length; i++) {
		const edit = sourceEdits[i];
		const rebasePath = [
			...rollbacks.slice(sourceEdits.length - i),
			editToRebaseOver,
			...rebasedEditsWithoutCompose,
		];
		rebasedEditsWithoutCompose.push(rebaseTagged(fieldRebaser.rebase, edit, rebasePath));
	}
	return rebasedEditsWithoutCompose;
}

function rebaseOverSinglesVsRebaseOverCompositions<TChangeset>(
	edit: TaggedChange<TChangeset>,
	namedEditsToRebaseOver: NamedChangeset<TChangeset>[],
	fieldRebaser: BoundFieldChangeRebaser<TChangeset>,
) {
	const editsToRebaseOver = namedEditsToRebaseOver.map(({ changeset }) => changeset);

	// Rebase over each base edit individually
	const rebaseWithoutCompose = rebaseTagged(
		fieldRebaser.rebase,
		edit,
		editsToRebaseOver,
	).change;

	// Rebase over the composition of base edits
	const metadata = rebaseRevisionMetadataFromInfo(
		defaultRevInfosFromChanges([...editsToRebaseOver, edit]),
		edit.revision,
		editsToRebaseOver.map(({ revision }) => revision),
	);
	const rebaseWithCompose = fieldRebaser.rebaseComposed(metadata, edit, ...editsToRebaseOver);

	const assertDeepEqual = getDefaultedEqualityAssert(fieldRebaser);
	assertDeepEqual(
		tagChange(rebaseWithCompose, edit.revision),
		tagChange(rebaseWithoutCompose, edit.revision),
	);
}

function verifyComposeAssociativity<TChangeset>(
	edits: TaggedChange<TChangeset>[],
	fieldRebaser: BoundFieldChangeRebaser<TChangeset>,
) {
	const metadata = defaultRevisionMetadataFromChanges(edits);
	const singlyComposed = makeAnonChange(composeArray(fieldRebaser, edits, metadata));
	const leftPartialCompositions: TaggedChange<TChangeset>[] = [
		edits.at(0) ?? fail("Expected at least one edit"),
	];
	for (let i = 1; i < edits.length; i++) {
		leftPartialCompositions.push(
			makeAnonChange(
				fieldRebaser.compose(
					leftPartialCompositions.at(-1) ?? fail("Expected at least one edit"),
					edits[i],
					metadata,
				),
			),
		);
	}

	const rightPartialCompositions: TaggedChange<TChangeset>[] = [
		edits.at(-1) ?? fail("Expected at least one edit"),
	];
	for (let i = edits.length - 2; i >= 0; i--) {
		rightPartialCompositions.push(
			makeAnonChange(
				fieldRebaser.compose(
					edits[i],
					rightPartialCompositions.at(-1) ?? fail("Expected at least one edit"),
					metadata,
				),
			),
		);
	}

	const assertDeepEqual = getDefaultedEqualityAssert(fieldRebaser);
	assertDeepEqual(leftPartialCompositions.at(-1), singlyComposed);
	assertDeepEqual(rightPartialCompositions.at(-1), singlyComposed);
}

const emptyRevisionTag = "empty" as unknown as RevisionTag;

function verifyComposeWithInverseEqualsEmpty<TChangeset>(
	edit: TaggedChange<TChangeset>,
	fieldRebaser: BoundFieldChangeRebaser<TChangeset>,
) {
	const metadata = defaultRevisionMetadataFromChanges([edit]);

	const change = tagChange(edit.change, edit.revision);
	const changeset = fieldRebaser.compose(change, rollback(fieldRebaser, change), metadata);
	assert(fieldRebaser.isEmpty !== undefined);
	fieldRebaser.isEmpty(changeset);
}

function verifyComposeWithEmptyIsNoOp<TChangeset>(
	edit: TaggedChange<TChangeset>,
	fieldRebaser: BoundFieldChangeRebaser<TChangeset>,
) {
	const metadata = defaultRevisionMetadataFromChanges([edit]);

	const emptyChange = tagChange(fieldRebaser.createEmpty(), emptyRevisionTag);
	const changeset = fieldRebaser.compose(edit, emptyChange, metadata);
	const changeset2 = fieldRebaser.compose(emptyChange, edit, metadata);

	const composedEditWithEmpty = tagChange(changeset, edit.revision);
	const composedEmptyWithEdit = tagChange(changeset2, edit.revision);
	assert(fieldRebaser.assertChangesetsEquivalent !== undefined);
	fieldRebaser.assertChangesetsEquivalent(composedEditWithEmpty, edit);
	fieldRebaser.assertChangesetsEquivalent(composedEmptyWithEdit, edit);
}

function verifyRebaseLeftDistributivity<TChangeset>(
	edit: TaggedChange<TChangeset>,
	namedEditsToRebaseOver: NamedChangeset<TChangeset>[],
	fieldRebaser: BoundFieldChangeRebaser<TChangeset>,
) {
	const assertDeepEqual = getDefaultedEqualityAssert(fieldRebaser);
	assert(namedEditsToRebaseOver.length >= 2, "expected at least 2 edits");
	const editsToRebaseOver = namedEditsToRebaseOver.map(({ changeset }) => changeset);
	const revInfo = defaultRevInfosFromChanges([...editsToRebaseOver, edit]);

	const editB = editsToRebaseOver[0];
	const editC = editsToRebaseOver[1];
	const rebaseMetaData = rebaseRevisionMetadataFromInfo(revInfo, edit.revision, [
		editB.revision,
		editC.revision,
	]);
	const actualChange = tagChange(
		fieldRebaser.rebaseComposed(rebaseMetaData, edit, editB, editC),
		edit.revision,
	);
	let expectedChangeset: TChangeset = edit.change;
	for (const editToRebaseOver of editsToRebaseOver) {
		expectedChangeset = fieldRebaser.rebase(
			mapTaggedChange(edit, expectedChangeset),
			editToRebaseOver,
		);
	}
	const expectedChange = tagChange(expectedChangeset, edit.revision);

	assertDeepEqual(actualChange, expectedChange);
}

function verifyRebaseRightDistributivity<TChangeset>(
	edits: TaggedChange<TChangeset>[],
	namedEditToRebaseOver: NamedChangeset<TChangeset>,
	fieldRebaser: BoundFieldChangeRebaser<TChangeset>,
) {
	const assertDeepEqual = getDefaultedEqualityAssert(fieldRebaser);
	assert(edits.length >= 2, "expected at least 2 edits");
	const editToRebaseOver = namedEditToRebaseOver.changeset;
	const metadata = defaultRevisionMetadataFromChanges([editToRebaseOver]);
	const editA = edits[0];
	const editB = edits[1];
	const editC = {
		change: editToRebaseOver.change,
		revision: namedEditToRebaseOver.changeset.revision,
		metadata,
	};

	// (A ○ B) ↷ C
	const actualChange = rebaseTagged(
		fieldRebaser.rebase,
		makeAnonChange(fieldRebaser.compose(editA, editB)),
		[editC],
	);

	const editRebasedOverC = rebaseTagged(fieldRebaser.rebase, editA, [editC]);
	const invertedEdit = rollback(fieldRebaser, editA);

	// (A ↷ C) ○ (B ↷ (A⁻¹ ○ C ○ (A ↷ C)))
	const expectedChange = makeAnonChange(
		fieldRebaser.compose(
			editRebasedOverC,
			rebaseTagged(fieldRebaser.rebase, editB, [
				makeAnonChange(
					fieldRebaser.compose(
						makeAnonChange(fieldRebaser.compose(invertedEdit, editC)),
						editRebasedOverC,
					),
				),
			]),
		),
	);

	assertDeepEqual(actualChange, expectedChange);
}

function verifyRebaseOverUndoRedoPair<TChangeset>(
	edit: TaggedChange<TChangeset>,
	namedEditToRebaseOver: NamedChangeset<TChangeset>,
	fieldRebaser: BoundFieldChangeRebaser<TChangeset>,
) {
	const assertDeepEqual = getDefaultedEqualityAssert(fieldRebaser);
	const editB = namedEditToRebaseOver.changeset;

	const inverseEditB = rollback(fieldRebaser, editB);

	// ((A ↷ B) ↷ B⁻¹) ↷ B
	const actualChange = tagChange(
		fieldRebaser.rebase(
			mapTaggedChange(
				edit,
				fieldRebaser.rebase(
					mapTaggedChange(edit, fieldRebaser.rebase(edit, editB)),
					inverseEditB,
				),
			),
			editB,
		),
		edit.revision,
	);

	// A ↷ B
	const expectedChange = tagChange(fieldRebaser.rebase(edit, editB), edit.revision);
	assertDeepEqual(actualChange, expectedChange);
}

function verifyRebaseOverDoUndoPairIsNoOp<TChangeset>(
	edit: TaggedChange<TChangeset>,
	namedEditToRebaseOver: NamedChangeset<TChangeset>,
	fieldRebaser: BoundFieldChangeRebaser<TChangeset>,
) {
	const assertDeepEqual = getDefaultedEqualityAssert(fieldRebaser);
	const editB = namedEditToRebaseOver.changeset;

	const invertedEditB = rollback(fieldRebaser, editB);
	// (A ↷ B) ↷ B⁻¹
	const actualChange = tagChange(
		fieldRebaser.rebase(
			mapTaggedChange(edit, fieldRebaser.rebase(edit, editB)),
			invertedEditB,
		),
		edit.revision,
	);

	const expectedChange = tagChange(edit.change, edit.revision);
	if (fieldRebaser.assertChangesetsEquivalent !== undefined) {
		fieldRebaser.assertChangesetsEquivalent(actualChange, expectedChange);
	} else {
		assertDeepEqual(actualChange, expectedChange);
	}
}

function verifyRebaseOverEmpty<TChangeset>(
	edit: TaggedChange<TChangeset>,
	fieldRebaser: BoundFieldChangeRebaser<TChangeset>,
) {
	const emptyChange = tagChange(fieldRebaser.createEmpty(), emptyRevisionTag);
	const actualChange = tagChange(fieldRebaser.rebase(edit, emptyChange), edit.revision);
	const expectedChange = tagChange(edit.change, edit.revision);
	const assertDeepEqual = getDefaultedEqualityAssert(fieldRebaser);
	assertDeepEqual(actualChange, expectedChange);
}

function verifyRebaseEmpty<TChangeset>(
	edit: TaggedChange<TChangeset>,
	fieldRebaser: BoundFieldChangeRebaser<TChangeset>,
) {
	const emptyChange = tagChange(fieldRebaser.createEmpty(), emptyRevisionTag);
	const actualChange = rebaseTagged(fieldRebaser.rebase, emptyChange, [edit]);
	assert(fieldRebaser.isEmpty !== undefined);
	assert(fieldRebaser.isEmpty(actualChange.change));
}

function getDefaultedEqualityAssert<TChangeset>(
	fieldRebaser: BoundFieldChangeRebaser<TChangeset>,
) {
	return fieldRebaser.assertEqual ?? ((a, b) => assert.deepEqual(a, b));
}

function composeArray<TChangeset>(
	fieldRebaser: BoundFieldChangeRebaser<TChangeset>,
	changes: TaggedChange<TChangeset>[],
	metadata: RevisionMetadataSource,
): TChangeset {
	let composed: TChangeset = fieldRebaser.createEmpty();
	for (const change of changes) {
		composed = fieldRebaser.compose(makeAnonChange(composed), change, metadata);
	}

	return composed;
}

function rollback<TChangeset>(
	fieldRebaser: BoundFieldChangeRebaser<TChangeset>,
	change: TaggedChange<TChangeset>,
): TaggedChange<TChangeset> {
	const revision = `rollback-${change.revision}` as unknown as RevisionTag;
	return tagRollbackInverse(
		fieldRebaser.inlineRevision(fieldRebaser.invert(change, revision, true), revision),
		revision,
		change.revision,
	);
}
