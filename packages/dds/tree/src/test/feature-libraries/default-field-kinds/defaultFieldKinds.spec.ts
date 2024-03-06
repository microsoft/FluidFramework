/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "assert";
import {
	FieldChangeHandler,
	NodeChangeset,
	CrossFieldManager,
} from "../../../feature-libraries/index.js";
import {
	ValueFieldEditor,
	valueChangeHandler,
	valueFieldEditor,
	// Allow import from file being tested.
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/default-schema/defaultFieldKinds.js";
import { makeAnonChange, tagChange } from "../../../core/index.js";
import { brand, fakeIdAllocator, idAllocatorFromMaxId } from "../../../util/index.js";
import { defaultRevisionMetadataFromChanges, mintRevisionTag } from "../../utils.js";
// eslint-disable-next-line import/no-internal-modules
import { OptionalChangeset } from "../../../feature-libraries/optional-field/index.js";
import { changesetForChild } from "../fieldKindTestUtils.js";
// eslint-disable-next-line import/no-internal-modules
import { Change, assertEqual, assertTaggedEqual } from "../optional-field/optionalFieldUtils.js";
// eslint-disable-next-line import/no-internal-modules
import { rebaseRevisionMetadataFromInfo } from "../../../feature-libraries/modular-schema/index.js";

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

const childComposer1_2 = (
	change1: NodeChangeset | undefined,
	change2: NodeChangeset | undefined,
): NodeChangeset => {
	assert(change1 !== undefined && change2 !== undefined);
	assert.deepEqual(change1, nodeChange1);
	assert.deepEqual(change2, nodeChange2);
	return arbitraryChildChange;
};

describe("defaultFieldKinds", () => {
	describe("valueFieldEditor.set", () => {
		it("valueFieldEditor.set", () => {
			const expected = Change.atOnce(
				Change.clear("self", brand(1)),
				Change.move(brand(41), "self"),
			);
			assertEqual(
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

		const childChange1 = Change.child(nodeChange1);
		const childChange2 = Change.child(nodeChange2);
		const childChange3 = Change.child(arbitraryChildChange);

		const change1 = tagChange(
			fieldHandler.editor.set({ detach: brand(1), fill: brand(41) }),
			mintRevisionTag(),
		);
		const change2 = tagChange(
			fieldHandler.editor.set({ detach: brand(2), fill: brand(42) }),
			mintRevisionTag(),
		);

		const change1WithChildChange = Change.atOnce(
			Change.clear("self", brand(1)),
			Change.move(brand(41), "self"),
			Change.childAt(brand(41), nodeChange1),
		);

		/**
		 * Represents the outcome of composing change1 and change2.
		 */
		const change1And2 = makeAnonChange(
			Change.atOnce(
				Change.move(
					{ localId: brand(41), revision: change1.revision },
					{ localId: brand(2), revision: change2.revision },
				),
				Change.clear("self", { localId: brand(1), revision: change1.revision }),
				Change.move({ localId: brand(42), revision: change2.revision }, "self"),
			),
		);

		const simpleChildComposer = (
			a: NodeChangeset | undefined,
			b: NodeChangeset | undefined,
		) => {
			assert(a === undefined || b === undefined);
			return a ?? b ?? fail("Expected a defined node changeset");
		};

		describe("correctly composes", () => {
			it("two field changes", () => {
				const composed = fieldHandler.rebaser.compose(
					change1,
					change2,
					simpleChildComposer,
					fakeIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([change1, change2]),
				);

				assertTaggedEqual(makeAnonChange(composed), change1And2);
			});

			it("a field change and a child change", () => {
				const taggedChildChange1 = tagChange(childChange1, mintRevisionTag());
				const expected = Change.atOnce(
					Change.move({ localId: brand(41), revision: change1.revision }, "self"),
					Change.clear("self", { localId: brand(1), revision: change1.revision }),
					Change.childAt({ localId: brand(41), revision: change1.revision }, nodeChange1),
				);
				const actual = fieldHandler.rebaser.compose(
					change1,
					taggedChildChange1,
					simpleChildComposer,
					fakeIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([change1, taggedChildChange1]),
				);
				assertEqual(actual, expected);
			});

			it("a child change and a field change", () => {
				const actual = fieldHandler.rebaser.compose(
					makeAnonChange(childChange1),
					change1,
					simpleChildComposer,
					fakeIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([change1]),
				);
				const expected2 = Change.atOnce(
					Change.move({ localId: brand(41), revision: change1.revision }, "self"),
					Change.clear("self", { localId: brand(1), revision: change1.revision }),
					Change.child(nodeChange1),
				);
				assertEqual(actual, expected2);
			});

			it("two child changes", () => {
				assertEqual(
					fieldHandler.rebaser.compose(
						makeAnonChange(childChange1),
						makeAnonChange(childChange2),
						childComposer1_2,
						fakeIdAllocator,
						failCrossFieldManager,
						defaultRevisionMetadataFromChanges([]),
					),
					childChange3,
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
				idAllocatorFromMaxId(),
				failCrossFieldManager,
				defaultRevisionMetadataFromChanges([taggedChange]),
			);

			const expected = Change.atOnce(
				Change.clear("self", { localId: brand(41), revision: taggedChange.revision }),
				Change.move({ localId: brand(1), revision: taggedChange.revision }, "self"),
				Change.child(nodeChange2),
			);
			assertEqual(inverted, expected);
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
