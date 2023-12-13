/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { FieldChangeHandler, NodeChangeset, CrossFieldManager } from "../../../feature-libraries";
import {
	ValueFieldEditor,
	valueChangeHandler,
	valueFieldEditor,
	// Allow import from file being tested.
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/default-schema/defaultFieldKinds";
import { makeAnonChange, TaggedChange, mintRevisionTag, tagChange } from "../../../core";
import { brand, fakeIdAllocator } from "../../../util";
import { defaultRevisionMetadataFromChanges } from "../../utils";
// eslint-disable-next-line import/no-internal-modules
import { OptionalChangeset } from "../../../feature-libraries/optional-field";
import { changesetForChild } from "../fieldKindTestUtils";
// eslint-disable-next-line import/no-internal-modules
import { assertEqual } from "../optional-field/optionalFieldUtils";
// eslint-disable-next-line import/no-internal-modules
import { rebaseRevisionMetadataFromInfo } from "../../../feature-libraries/modular-schema";

/**
 * A change to a child encoding as a simple placeholder string.
 * This change has no actual meaning, and can be used in tests where the type of child change in not relevant.
 */
const arbitraryChildChange = changesetForChild("arbitraryChildChange");

const nodeChange1 = changesetForChild("nodeChange1");
const nodeChange2 = changesetForChild("nodeChange2");

const failCrossFieldManager: CrossFieldManager = {
	get: () => assert.fail("Should not query CrossFieldManager"),
	set: () => assert.fail("Should not modify CrossFieldManager"),
};

const childComposer1_2 = (changes: TaggedChange<NodeChangeset>[]): NodeChangeset => {
	assert(changes.length === 2);
	assert.deepEqual(
		changes.map((c) => c.change),
		[nodeChange1, nodeChange2],
	);
	return arbitraryChildChange;
};

describe("defaultFieldKinds", () => {
	describe("valueFieldEditor.set", () => {
		it("valueFieldEditor.set", () => {
			const expected: OptionalChangeset = {
				moves: [
					[{ localId: brand(41) }, "self", "nodeTargeting"],
					["self", { localId: brand(1) }, "cellTargeting"],
				],
				childChanges: [],
			};
			assert.deepEqual(
				valueFieldEditor.set({
					detach: brand(1),
					fill: brand(41),
				}),
				expected,
			);
		});
	});

	// TODO:
	// These tests are covering value field usage patterns of optional field's rebaser (which value field uses).
	// These patterns should be covered in the optional field tests and not be needed here (except perhaps for a minimal integration test).
	describe("value field rebaser", () => {
		const fieldHandler: FieldChangeHandler<OptionalChangeset, ValueFieldEditor> =
			valueChangeHandler;

		const childChange1: OptionalChangeset = {
			moves: [],
			childChanges: [["self", nodeChange1]],
		};
		const childChange2: OptionalChangeset = {
			moves: [],
			childChanges: [["self", nodeChange2]],
		};
		const childChange3: OptionalChangeset = {
			moves: [],
			childChanges: [["self", arbitraryChildChange]],
		};

		const change1 = tagChange(
			fieldHandler.editor.set({ detach: brand(1), fill: brand(41) }),
			mintRevisionTag(),
		);
		const change2 = tagChange(
			fieldHandler.editor.set({ detach: brand(2), fill: brand(42) }),
			mintRevisionTag(),
		);

		const change1WithChildChange: OptionalChangeset = {
			moves: [
				[{ localId: brand(41) }, "self", "nodeTargeting"],
				["self", { localId: brand(1) }, "cellTargeting"],
			],
			childChanges: [[{ localId: brand(41) }, nodeChange1]],
		};

		/**
		 * Represents the outcome of composing change1 and change2.
		 */
		const change1And2: TaggedChange<OptionalChangeset> = makeAnonChange({
			moves: [
				[
					{ localId: brand(41), revision: change1.revision },
					{ localId: brand(2), revision: change2.revision },
					"nodeTargeting",
				],
				["self", { localId: brand(1), revision: change1.revision }, "cellTargeting"],
				[{ localId: brand(42), revision: change2.revision }, "self", "nodeTargeting"],
			],
			childChanges: [],
		});

		const simpleChildComposer = (changes: TaggedChange<NodeChangeset>[]) => {
			assert.equal(changes.length, 1);
			return changes[0].change;
		};

		describe("correctly composes", () => {
			it("two field changes", () => {
				const composed = fieldHandler.rebaser.compose(
					[change1, change2],
					simpleChildComposer,
					fakeIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([change1, change2]),
				);

				assertEqual(makeAnonChange(composed), change1And2);
			});

			it("a field change and a child change", () => {
				const taggedChildChange1 = tagChange(childChange1, mintRevisionTag());
				const expected: OptionalChangeset = {
					moves: [
						[
							{ localId: brand(41), revision: change1.revision },
							"self",
							"nodeTargeting",
						],
						[
							"self",
							{ localId: brand(1), revision: change1.revision },
							"cellTargeting",
						],
					],
					childChanges: [
						[{ localId: brand(41), revision: change1.revision }, nodeChange1],
					],
				};
				const actual = fieldHandler.rebaser.compose(
					[change1, taggedChildChange1],
					simpleChildComposer,
					fakeIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([change1, taggedChildChange1]),
				);
				assertEqual(makeAnonChange(actual), makeAnonChange(expected));
			});

			it("a child change and a field change", () => {
				const actual = fieldHandler.rebaser.compose(
					[makeAnonChange(childChange1), change1],
					simpleChildComposer,
					fakeIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([change1]),
				);
				const expected2: OptionalChangeset = {
					moves: [
						[
							{ localId: brand(41), revision: change1.revision },
							"self",
							"nodeTargeting",
						],
						[
							"self",
							{ localId: brand(1), revision: change1.revision },
							"cellTargeting",
						],
					],
					childChanges: [["self", nodeChange1]],
				};
				assertEqual(makeAnonChange(actual), makeAnonChange(expected2));
			});

			it("two child changes", () => {
				assertEqual(
					makeAnonChange(
						fieldHandler.rebaser.compose(
							[makeAnonChange(childChange1), makeAnonChange(childChange2)],
							childComposer1_2,
							fakeIdAllocator,
							failCrossFieldManager,
							defaultRevisionMetadataFromChanges([]),
						),
					),
					makeAnonChange(childChange3),
				);
			});
		});

		it("can invert children", () => {
			const childInverter = (child: NodeChangeset): NodeChangeset => {
				assert.deepEqual(child, nodeChange1);
				return nodeChange2;
			};

			const taggedChange = { revision: mintRevisionTag(), change: change1WithChildChange };
			const inverted = fieldHandler.rebaser.invert(
				taggedChange,
				childInverter,
				fakeIdAllocator,
				failCrossFieldManager,
				defaultRevisionMetadataFromChanges([taggedChange]),
			);

			assertEqual(
				makeAnonChange(inverted),
				makeAnonChange({
					moves: [
						[
							{ localId: brand(1), revision: taggedChange.revision },
							"self",
							"nodeTargeting",
						],
						[
							"self",
							{ localId: brand(41), revision: taggedChange.revision },
							"cellTargeting",
						],
					],
					childChanges: [["self", nodeChange2]],
				}),
			);
		});

		it("can be rebased", () => {
			const childRebaser = () => assert.fail("Should not be called");

			assert.deepEqual(
				fieldHandler.rebaser.rebase(
					change2.change,
					makeAnonChange(change1WithChildChange),
					childRebaser,
					fakeIdAllocator,
					failCrossFieldManager,
					rebaseRevisionMetadataFromInfo([], []),
				),
				change2.change,
			);
		});

		it("can rebase child changes", () => {
			const childRebaser = (
				change: NodeChangeset | undefined,
				base: NodeChangeset | undefined,
			) => {
				assert.deepEqual(change, nodeChange2);
				assert.deepEqual(base, nodeChange1);
				return arbitraryChildChange;
			};

			const baseChange = fieldHandler.editor.buildChildChange(0, nodeChange1);
			const changeToRebase = fieldHandler.editor.buildChildChange(0, nodeChange2);

			assert.deepEqual(
				fieldHandler.rebaser.rebase(
					changeToRebase,
					makeAnonChange(baseChange),
					childRebaser,
					fakeIdAllocator,
					failCrossFieldManager,
					rebaseRevisionMetadataFromInfo([], []),
				),
				childChange3,
			);
		});
	});
});
