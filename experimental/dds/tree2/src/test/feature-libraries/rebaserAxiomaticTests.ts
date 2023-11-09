/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	makeAnonChange,
	RevisionTag,
	tagChange,
	TaggedChange,
	tagRollbackInverse,
} from "../../core";
import { defaultRevisionMetadataFromChanges } from "../utils";

import {
	FieldStateTree,
	generatePossibleSequenceOfEdits,
	ChildStateGenerator,
	BoundFieldChangeRebaser,
} from "./exhaustiveRebaserUtils";
import { fail } from "../../util";
import {
	ContentId,
	OptionalChangeset,
} from "../../feature-libraries/default-field-kinds/defaultFieldChangeTypes";

export function runExhaustiveComposeRebaseSuite<TContent, TChangeset>(
	initialStates: FieldStateTree<TContent, TChangeset>[],
	generateChildStates: ChildStateGenerator<TContent, TChangeset>,
	{ rebase, rebaseComposed, invert, compose, assertEqual }: BoundFieldChangeRebaser<TChangeset>,
) {
	const assertDeepEqual = assertEqual ?? ((a, b) => assert.deepEqual(a, b));
	function rebaseTagged(
		change: TaggedChange<TChangeset>,
		...baseChanges: TaggedChange<TChangeset>[]
	): TaggedChange<TChangeset> {
		let currChange = change;
		const metadata = defaultRevisionMetadataFromChanges([change, ...baseChanges]);
		for (const base of baseChanges) {
			currChange = tagChange(rebase(currChange.change, base, metadata), currChange.revision);
		}

		return currChange;
	}

	function verifyComposeAssociativity(edits: TaggedChange<TChangeset>[]) {
		const metadata = defaultRevisionMetadataFromChanges(edits);
		const singlyComposed = makeAnonChange(compose(edits, metadata));
		const leftPartialCompositions: TaggedChange<TChangeset>[] = [
			edits.at(0) ?? fail("Expected at least one edit"),
		];
		for (let i = 1; i < edits.length; i++) {
			leftPartialCompositions.push(
				makeAnonChange(
					compose(
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
					compose(
						[
							edits[i],
							rightPartialCompositions.at(-1) ?? fail("Expected at least one edit"),
						],
						metadata,
					),
				),
			);
		}

		try {
			assertDeepEqual(leftPartialCompositions.at(-1), singlyComposed);
			assertDeepEqual(rightPartialCompositions.at(-1), singlyComposed);
		} catch (error) {
			throw error;
		}
	}
	// To limit combinatorial explosion, we test 'rebasing over a compose is equivalent to rebasing over the individual edits'
	// by:
	// - Rebasing a single edit over N sequential edits
	// - Rebasing N sequential edits over a single edit, sandwich-rebasing style
	//   (meaning [A, B, C] ↷ D involves B ↷ compose([A⁻¹, D, A']) and C ↷ compose([B⁻¹, A⁻¹, D, A', B']))
	const numberOfEditsToRebaseOver = 3;
	const numberOfEditsToRebase = 3; //numberOfEditsToRebaseOver;
	const numberOfEditsToVerifyAssociativity = 5;

	describe("Rebase over compose", () => {
		for (const initialState of initialStates) {
			describe(`starting with contents ${JSON.stringify(initialState.content)}`, () => {
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

						// if (
						// 	title !==
						// 	'Rebase ChildChange1 over compose ["SetB,0","ChildChange79","ChildChange80"]'
						// ) {
						// 	continue;
						// }
						// continue;

						// if (
						// 	title !==
						// 	'Rebase ChildChange1 over compose ["SetB,0","Undo:SetB,0","ChildChange102"]'
						// ) {
						// 	continue;
						// }

						it(title, () => {
							const editsToRebaseOver = namedEditsToRebaseOver.map(
								({ changeset }) => changeset,
							);
							const rebaseWithoutCompose = rebaseTagged(
								edit,
								...editsToRebaseOver,
							).change;
							const metadata = defaultRevisionMetadataFromChanges([
								...editsToRebaseOver,
								edit,
							]);
							const rebaseWithCompose = rebaseComposed(
								metadata,
								edit.change,
								...editsToRebaseOver,
							);
							try {
								assertDeepEqual(
									tagChange(rebaseWithCompose, undefined),
									tagChange(rebaseWithoutCompose, undefined),
								);
							} catch (error) {
								throw error;
							}
						});
					}
				}
			});
		}
	});

	describe("Composed sandwich rebase over single edit", () => {
		for (const initialState of initialStates) {
			describe(`starting with contents ${JSON.stringify(initialState.content)}`, () => {
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

						// This test case motivates compose dropping changes with no associated revision
						// (though not totally convinced that change is good)
						// if (
						// 	title !==
						// 	'Rebase ["ChildChange1","ChildChange2","ChildChange3"] over Delete'
						// ) {
						// 	continue;
						// }

						// if (title !== 'Rebase ["SetB,0","SetB,1"] over Delete') {
						// 	continue;
						// }

						// if (title !== 'Rebase ["ChildChange1","SetB,1"] over SetA,0') {
						// 	continue;
						// }

						// if (title !== 'Rebase ["ChildChange1","ChildChange2"] over Delete') {
						// 	continue;
						// }

						// if (title !== 'Rebase ["Delete","Undo:Delete"] over ChildChange1') {
						// 	continue;
						// }

						// if (title !== 'Rebase ["SetA,0","ChildChange2"] over SetA,0') {
						// 	continue;
						// }

						// if (
						// 	title !==
						// 	'Rebase ["SetB,0","ChildChange79","ChildChange80"] over ChildChange1'
						// ) {
						// 	continue;
						// }

						// if (
						// 	title !==
						// 	'Rebase ["SetA,0","Undo:SetA,0","ChildChange73"] over ChildChange1'
						// ) {
						// 	continue;
						// }

						if (title !== 'Rebase ["SetB,0","SetA,1","Undo:SetA,1"] over SetA,0') {
							continue;
						}

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
							inverses.reverse();

							const rebasedEditsWithoutCompose: TaggedChange<TChangeset>[] = [];
							const rebasedEditsWithCompose: TaggedChange<TChangeset>[] = [];

							for (let i = 0; i < sourceEdits.length; i++) {
								const edit = sourceEdits[i];
								const editsToRebaseOver = [
									...inverses.slice(sourceEdits.length - i),
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
								let metadata = defaultRevisionMetadataFromChanges(allTaggedEdits);
								const edit = sourceEdits[i];
								const rebasedEdit = tagChange(
									rebaseComposed(metadata, edit.change, currentComposedEdit),
									edit.revision,
								);
								rebasedEditsWithCompose.push(rebasedEdit);
								allTaggedEdits.push(rebasedEdit);
								metadata = defaultRevisionMetadataFromChanges(allTaggedEdits);
								currentComposedEdit = makeAnonChange(
									compose(
										[
											inverses[sourceEdits.length - i - 1],
											currentComposedEdit,
											rebasedEdit,
										],
										metadata,
									),
								);
							}

							for (let i = 0; i < rebasedEditsWithoutCompose.length; i++) {
								try {
									assertDeepEqual(
										rebasedEditsWithoutCompose[i],
										rebasedEditsWithCompose[i],
									);
								} catch (error) {
									throw error;
								}
							}

							// verifyComposeAssociativity(allTaggedEdits);
						});
					}
				}
			});
		}
	});

	describe("Compose associativity", () => {
		for (const initialState of initialStates) {
			describe(`starting with contents ${JSON.stringify(initialState.content)}`, () => {
				for (const namedSourceEdits of generatePossibleSequenceOfEdits(
					initialState,
					generateChildStates,
					numberOfEditsToVerifyAssociativity,
					"rev-",
				)) {
					const title = `for ${JSON.stringify(
						namedSourceEdits.map(({ description }) => description),
					)}`;

					// if (title !== 'for ["SetA,0","ChildChange2","Delete"]') {
					// 	continue;
					// }

					// if (title !== 'for ["ChildChange1","SetB,1","ChildChange19"]') {
					// 	continue;
					// }

					// if (
					// 	title !==
					// 	'for ["SetB,0","Undo:SetB,0","SetB,2","Undo:SetB,2","ChildChange2227"]'
					// ) {
					// 	continue;
					// }

					// if (title !== 'for ["ChildChange1","SetB,1","Undo:SetB,1","SetB,3"]') {
					// 	continue;
					// }

					// if (title !== 'for ["Delete","SetB,1","SetB,2","Delete","Undo:Delete"]') {
					// 	continue;
					// }

					// Note that this test case doesn't verify associativity of rollback inverses.
					// That's covered some by "Composed sandwich rebase over single edit"
					it(title, () => {
						const edits = namedSourceEdits.map(({ changeset }) => changeset);
						verifyComposeAssociativity(edits);
					});

					// TODO: build id should be normalized with attach id.
				}
			});
		}
	});
}
