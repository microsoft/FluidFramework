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
} from "../../../feature-libraries/default-field-kinds/defaultFieldKinds";
import {
	makeAnonChange,
	TaggedChange,
	mintRevisionTag,
	tagChange,
	ChangesetLocalId,
} from "../../../core";
import { IdAllocator, brand } from "../../../util";
import { defaultRevisionMetadataFromChanges, fakeTaggedRepair as fakeRepair } from "../../utils";
// eslint-disable-next-line import/no-internal-modules
import { OptionalChangeset } from "../../../feature-libraries/default-field-kinds/defaultFieldChangeTypes";
import { changesetForChild, testTree, testTreeCursor } from "./fieldKindTestUtils";

/**
 * A change to a child encoding as a simple placeholder string.
 * This change has no actual meaning, and can be used in tests where the type of child change in not relevant.
 */
const arbitraryChildChange = changesetForChild("arbitraryChildChange");

const nodeChange1 = changesetForChild("nodeChange1");
const nodeChange2 = changesetForChild("nodeChange2");

const failIdAllocator: IdAllocator = () => assert.fail("Should not allocate ids");

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
				fieldChange: {
					newContent: { set: testTree("tree1") },
					id: brand(1),
					wasEmpty: false,
				},
			};
			assert.deepEqual(valueFieldEditor.set(testTreeCursor("tree1"), brand(1)), expected);
		});
	});

	// TODO:
	// These tests are covering value field usage patterns of optional field's rebaser (which value field uses).
	// These patterns should be covered in the optional field tests and not be needed here (except perhaps for a minimal integration test).
	describe("value field rebaser", () => {
		const fieldHandler: FieldChangeHandler<OptionalChangeset, ValueFieldEditor> =
			valueChangeHandler;

		const childChange1: OptionalChangeset = { childChanges: [["self", nodeChange1]] };
		const childChange2: OptionalChangeset = { childChanges: [["self", nodeChange2]] };
		const childChange3: OptionalChangeset = { childChanges: [["self", arbitraryChildChange]] };

		const change1 = tagChange(
			fieldHandler.editor.set(testTreeCursor("tree1"), brand(1)),
			mintRevisionTag(),
		);
		const change2 = tagChange(
			fieldHandler.editor.set(testTreeCursor("tree2"), brand(2)),
			mintRevisionTag(),
		);

		const change1WithChildChange: OptionalChangeset = {
			fieldChange: {
				newContent: { set: testTree("tree1"), changes: nodeChange1 },
				wasEmpty: false,
				id: brand(1),
				revision: change1.revision,
			},
		};

		/**
		 * Represents the outcome of composing change1 and change2.
		 */
		const change1And2: TaggedChange<OptionalChangeset> = makeAnonChange({
			fieldChange: {
				id: brand(2),
				revision: change2.revision,
				newContent: { set: testTree("tree2") },
				wasEmpty: false,
			},
		});

		const simpleChildComposer = (changes: TaggedChange<NodeChangeset>[]) => {
			assert.equal(changes.length, 1);
			return changes[0].change;
		};

		it("can be composed", () => {
			const composed = fieldHandler.rebaser.compose(
				[change1, change2],
				simpleChildComposer,
				failIdAllocator,
				failCrossFieldManager,
				defaultRevisionMetadataFromChanges([change1, change2]),
			);

			assert.deepEqual(composed, change1And2.change);
		});

		it("can be composed with child changes", () => {
			const taggedChildChange1 = tagChange(childChange1, mintRevisionTag());
			assert.deepEqual(
				fieldHandler.rebaser.compose(
					[change1, taggedChildChange1],
					simpleChildComposer,
					failIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([change1, taggedChildChange1]),
				),
				change1WithChildChange,
			);

			const composition = fieldHandler.rebaser.compose(
				[makeAnonChange(childChange1), change1],
				simpleChildComposer,
				failIdAllocator,
				failCrossFieldManager,
				defaultRevisionMetadataFromChanges([change1]),
			);
			assert.deepEqual(composition, {
				fieldChange: { ...change1.change.fieldChange, revision: change1.revision },
				childChanges: [
					[
						{ revision: change1.revision, localId: brand<ChangesetLocalId>(1) },
						nodeChange1,
					],
				],
			});

			assert.deepEqual(
				fieldHandler.rebaser.compose(
					[makeAnonChange(childChange1), makeAnonChange(childChange2)],
					childComposer1_2,
					failIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([]),
				),
				childChange3,
			);
		});

		it("can invert children", () => {
			const childInverter = (child: NodeChangeset): NodeChangeset => {
				assert.deepEqual(child, nodeChange1);
				return nodeChange2;
			};

			const inverted = fieldHandler.rebaser.invert(
				{ revision: mintRevisionTag(), change: change1WithChildChange },
				childInverter,
				fakeRepair,
				failIdAllocator,
				failCrossFieldManager,
			);

			assert.deepEqual(inverted.childChanges, [["self", nodeChange2]]);
		});

		it("can be rebased", () => {
			const childRebaser = () => assert.fail("Should not be called");

			assert.deepEqual(
				fieldHandler.rebaser.rebase(
					change2.change,
					makeAnonChange(change1WithChildChange),
					childRebaser,
					failIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([]),
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
					failIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([]),
				),
				childChange3,
			);
		});
	});
});
