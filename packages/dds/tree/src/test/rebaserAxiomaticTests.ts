/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SessionSpaceCompressedId } from "@fluidframework/id-compressor";
import {
	makeAnonChange,
	RevisionMetadataSource,
	RevisionTag,
	tagChange,
	TaggedChange,
	tagRollbackInverse,
} from "../core/index.js";
import { fail } from "../util/index.js";
// eslint-disable-next-line import/no-internal-modules
import { rebaseRevisionMetadataFromInfo } from "../feature-libraries/modular-schema/index.js";
import { defaultRevInfosFromChanges, defaultRevisionMetadataFromChanges } from "./utils.js";
import {
	FieldStateTree,
	generatePossibleSequenceOfEdits,
	ChildStateGenerator,
	BoundFieldChangeRebaser,
	makeIntentionMinter,
	NamedChangeset,
} from "./exhaustiveRebaserUtils.js";

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
	const revisionInfo = defaultRevInfosFromChanges(rebasePath);
	for (const base of rebasePath) {
		const metadata = rebaseRevisionMetadataFromInfo(revisionInfo, [base.revision]);
		currChange = tagChange(rebase(currChange.change, base, metadata), currChange.revision);
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
					for (const [
						{ description: name, changeset: namedEditToRebaseOver },
					] of trunkEdits) {
						const title = `Rebase ${JSON.stringify(
							namedSourceEdits.map(({ description }) => description),
						)} over ${name}`;

						innerFixture(title, () => {
							const editToRebaseOver = namedEditToRebaseOver;
							const sourceEdits = namedSourceEdits.map(({ changeset }) => changeset);

							const rollbacks = sourceEdits.map((change) =>
								tagRollbackInverse(
									fieldRebaser.invert(change),
									`rollback-${change.revision}` as unknown as RevisionTag,
									change.revision,
								),
							);
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
								assertDeepEqual(
									rebasedEditsWithoutCompose[i],
									rebasedEditsWithCompose[i],
								);
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
								namedEditsToRebaseOver,
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
								namedEditsToRebaseOver,
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
						const edits = namedSourceEdits.map(({ changeset }) => changeset);
						verifyComposeWithEmptyIsNoOp(edits, fieldRebaser);
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
						const edits = namedSourceEdits.map(({ changeset }) => changeset);
						verifyComposeWithInverseEqualsEmpty(edits, fieldRebaser);
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
			defaultRevInfosFromChanges(rebasePath),
			[editToRebaseOver.revision],
		);
		const rebasedEdit = tagChange(
			fieldRebaser.rebaseComposed(rebaseMetadata, edit.change, currentComposedEdit),
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
	rollbacks: TaggedChange<any>[],
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
	const rebaseWithoutCompose = rebaseTagged(fieldRebaser.rebase, edit, editsToRebaseOver).change;

	// Rebase over the composition of base edits
	const metadata = rebaseRevisionMetadataFromInfo(
		defaultRevInfosFromChanges(editsToRebaseOver),
		editsToRebaseOver.map(({ revision }) => revision),
	);
	const rebaseWithCompose = fieldRebaser.rebaseComposed(
		metadata,
		edit.change,
		...editsToRebaseOver,
	);

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

function verifyComposeWithInverseEqualsEmpty<TChangeset>(
	edits: TaggedChange<TChangeset>[],
	fieldRebaser: BoundFieldChangeRebaser<TChangeset>,
) {
	const metadata = defaultRevisionMetadataFromChanges(edits);

	for (const edit of edits) {
		const change = tagChange(edit.change, edit.revision);
		const changeset = fieldRebaser.compose(
			change,
			tagChange(fieldRebaser.invert(change), change.revision),
			metadata,
		);
		const actualChange = makeAnonChange(changeset);
		assert(fieldRebaser.isEmpty !== undefined);
		assert(fieldRebaser.isEmpty(actualChange.change));
	}
}

function verifyComposeWithEmptyIsNoOp<TChangeset>(
	edits: TaggedChange<TChangeset>[],
	fieldRebaser: BoundFieldChangeRebaser<TChangeset>,
) {
	const metadata = defaultRevisionMetadataFromChanges(edits);
	const assertDeepEqual = getDefaultedEqualityAssert(fieldRebaser);
	for (const edit of edits) {
		const emptyChange = tagChange(
			// fieldRebaser.compose([]),
			fieldRebaser.createEmpty(),
			"test" as unknown as SessionSpaceCompressedId,
		);
		const changeset = fieldRebaser.compose(edit, emptyChange, metadata);
		const actualChange = makeAnonChange(changeset);
		assertDeepEqual(actualChange, makeAnonChange(edit.change));
	}
}

function verifyRebaseLeftDistributivity<TChangeset>(
	edit: TaggedChange<TChangeset>,
	namedEditsToRebaseOver: NamedChangeset<TChangeset>[],
	fieldRebaser: BoundFieldChangeRebaser<TChangeset>,
) {
	const assertDeepEqual = getDefaultedEqualityAssert(fieldRebaser);
	assert(namedEditsToRebaseOver.length === 2, "expected at least 2 edits");
	const editsToRebaseOver = namedEditsToRebaseOver.map(({ changeset }) => changeset);
	const revInfo = defaultRevInfosFromChanges(editsToRebaseOver);

	const editB = editsToRebaseOver[0];
	const editC = editsToRebaseOver[1];
	const rebaseMetaData = rebaseRevisionMetadataFromInfo(revInfo, [
		editB.revision,
		editC.revision,
	]);
	const actualChange = makeAnonChange(
		fieldRebaser.rebaseComposed(rebaseMetaData, edit.change, editB, editC),
	);

	const expectedChange = fieldRebaser.rebase(fieldRebaser.rebase(edit.change, editB), editC);

	assertDeepEqual(actualChange, makeAnonChange(expectedChange));
}

function verifyRebaseRightDistributivity<TChangeset>(
	edits: TaggedChange<TChangeset>[],
	namedEditToRebaseOver: NamedChangeset<TChangeset>,
	fieldRebaser: BoundFieldChangeRebaser<TChangeset>,
) {
	const assertDeepEqual = getDefaultedEqualityAssert(fieldRebaser);
	assert(edits.length === 2, "expected 2 edits");
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
	const invertedEdit = tagRollbackInverse(fieldRebaser.invert(editA), undefined, editA.revision);
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
	namedEditsToRebaseOver: NamedChangeset<TChangeset>[],
	fieldRebaser: BoundFieldChangeRebaser<TChangeset>,
) {
	const assertDeepEqual = getDefaultedEqualityAssert(fieldRebaser);
	assert(namedEditsToRebaseOver.length === 1, "expected just 1 edit");
	const editsToRebaseOver = namedEditsToRebaseOver.map(({ changeset }) => changeset);
	// const editB = tagChange(
	// 	fieldRebaser.compose([editsToRebaseOver[0]]),
	// 	editsToRebaseOver[0].revision,
	// );
	const editB = { change: editsToRebaseOver[0].change, revision: editsToRebaseOver[0].revision };

	const inverseEditB = fieldRebaser.invert(editB);

	// ((A ↷ B) ↷ B⁻¹) ↷ B
	const actualChange = makeAnonChange(
		fieldRebaser.rebase(
			fieldRebaser.rebase(
				fieldRebaser.rebase(edit.change, editB),
				tagChange(inverseEditB, editB.revision),
			),
			editB,
		),
	);

	// A ↷ B
	const expectedChange = makeAnonChange(fieldRebaser.rebase(edit.change, editB));
	assertDeepEqual(actualChange, expectedChange);
}

function verifyRebaseOverDoUndoPairIsNoOp<TChangeset>(
	edit: TaggedChange<TChangeset>,
	namedEditsToRebaseOver: NamedChangeset<TChangeset>[],
	fieldRebaser: BoundFieldChangeRebaser<TChangeset>,
) {
	const assertDeepEqual = getDefaultedEqualityAssert(fieldRebaser);
	assert(namedEditsToRebaseOver.length === 1, "expected just 1 edit");
	const editsToRebaseOver = namedEditsToRebaseOver.map(({ changeset }) => changeset);

	const editB = { change: editsToRebaseOver[0].change, revision: editsToRebaseOver[0].revision };

	const invertedEditB = fieldRebaser.invert(editB);
	// (A ↷ B) ↷ B⁻¹
	const actualChange = makeAnonChange(
		fieldRebaser.rebase(
			fieldRebaser.rebase(edit.change, editB),
			tagChange(invertedEditB, editB.revision),
		),
	);

	const expectedChange = makeAnonChange(edit.change);
	if (fieldRebaser.compareWithoutTombstones !== undefined) {
		fieldRebaser.compareWithoutTombstones(actualChange.change, expectedChange.change);
	} else {
		assertDeepEqual(actualChange, expectedChange);
	}
}

function verifyRebaseOverEmpty<TChangeset>(
	edit: TaggedChange<TChangeset>,
	fieldRebaser: BoundFieldChangeRebaser<TChangeset>,
) {
	const emptyChange = tagChange(
		// fieldRebaser.compose([]),
		fieldRebaser.createEmpty(),
		"test" as unknown as SessionSpaceCompressedId,
	);

	const actualChange = makeAnonChange(fieldRebaser.rebase(edit.change, emptyChange));
	assert(fieldRebaser.isEmpty !== undefined);
	assert(fieldRebaser.isEmpty(actualChange.change));
}

function verifyRebaseEmpty<TChangeset>(
	edit: TaggedChange<TChangeset>,
	fieldRebaser: BoundFieldChangeRebaser<TChangeset>,
) {
	const emptyChange = tagChange(
		fieldRebaser.createEmpty(),
		"test" as unknown as SessionSpaceCompressedId,
	);

	const actualChange = makeAnonChange(fieldRebaser.rebase(emptyChange.change, edit));

	assert(fieldRebaser.isEmpty !== undefined);
	assert(fieldRebaser.isEmpty(actualChange.change));
}

function getDefaultedEqualityAssert<TChangeset>(fieldRebaser: BoundFieldChangeRebaser<TChangeset>) {
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
