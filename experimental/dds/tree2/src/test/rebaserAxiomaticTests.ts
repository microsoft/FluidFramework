/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { makeAnonChange, RevisionTag, tagChange, TaggedChange, tagRollbackInverse } from "../core";
import { fail } from "../util";
// eslint-disable-next-line import/no-internal-modules
import { rebaseRevisionMetadataFromInfo } from "../feature-libraries/modular-schema";
import { defaultRevInfosFromChanges, defaultRevisionMetadataFromChanges } from "./utils";
import {
	FieldStateTree,
	generatePossibleSequenceOfEdits,
	ChildStateGenerator,
	BoundFieldChangeRebaser,
	makeIntentionMinter,
	NamedChangeset,
} from "./exhaustiveRebaserUtils";

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
									`rollback-${change.revision}` as RevisionTag,
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
				[rollbacks[sourceEdits.length - i - 1], currentComposedEdit, rebasedEdit],
				composeMetadata,
			),
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
	const singlyComposed = makeAnonChange(fieldRebaser.compose(edits, metadata));
	const leftPartialCompositions: TaggedChange<TChangeset>[] = [
		edits.at(0) ?? fail("Expected at least one edit"),
	];
	for (let i = 1; i < edits.length; i++) {
		leftPartialCompositions.push(
			makeAnonChange(
				fieldRebaser.compose(
					[
						leftPartialCompositions.at(-1) ?? fail("Expected at least one edit"),
						edits[i],
					],
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
					[
						edits[i],
						rightPartialCompositions.at(-1) ?? fail("Expected at least one edit"),
					],
					metadata,
				),
			),
		);
	}

	const assertDeepEqual = getDefaultedEqualityAssert(fieldRebaser);
	assertDeepEqual(leftPartialCompositions.at(-1), singlyComposed);
	assertDeepEqual(rightPartialCompositions.at(-1), singlyComposed);
}

function getDefaultedEqualityAssert<TChangeset>(fieldRebaser: BoundFieldChangeRebaser<TChangeset>) {
	return fieldRebaser.assertEqual ?? ((a, b) => assert.deepEqual(a, b));
}
