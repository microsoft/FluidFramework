/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { CrossFieldManager, NodeChangeset, NodeReviver } from "../../../feature-libraries";
import {
	makeAnonChange,
	RevisionTag,
	TaggedChange,
	Delta,
	mintRevisionTag,
	tagChange,
	tagRollbackInverse,
} from "../../../core";
import { IdAllocator, brand } from "../../../util";
import {
	assertMarkListEqual,
	defaultRevisionMetadataFromChanges,
	fakeTaggedRepair as fakeRepair,
} from "../../utils";
import {
	optionalChangeRebaser,
	optionalFieldEditor,
	optionalFieldIntoDelta,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/default-field-kinds/optionalField";
// eslint-disable-next-line import/no-internal-modules
import { OptionalChangeset } from "../../../feature-libraries/default-field-kinds/defaultFieldChangeTypes";
import { changesetForChild, fooKey, testTree, testTreeCursor } from "./fieldKindTestUtils";

/**
 * A change to a child encoding as a simple placeholder string.
 * This change has no actual meaning, and can be used in tests where the type of child change in not relevant.
 */
const arbitraryChildChange = changesetForChild("arbitraryChildChange");

const nodeChange1 = changesetForChild("nodeChange1");
const nodeChange2 = changesetForChild("nodeChange2");

const failIdAllocator: IdAllocator = () => assert.fail("Should not allocate ids");
const failChildComposer = (_: TaggedChange<NodeChangeset>[]) =>
	assert.fail("Should not compose children");

const failCrossFieldManager: CrossFieldManager = {
	get: () => assert.fail("Should query CrossFieldManager"),
	set: () => assert.fail("Should modify CrossFieldManager"),
};

const deltaFromChild1 = (child: NodeChangeset): Delta.Modify => {
	assert.deepEqual(child, nodeChange1);
	return {
		type: Delta.MarkType.Modify,
		fields: new Map([
			[
				fooKey,
				[
					{ type: Delta.MarkType.Delete, count: 1 },
					{
						type: Delta.MarkType.Insert,
						content: [testTreeCursor("nodeChange1")],
					},
				],
			],
		]),
	};
};

const deltaFromChild2 = (child: NodeChangeset): Delta.Modify => {
	assert.deepEqual(child, nodeChange2);
	return {
		type: Delta.MarkType.Modify,
		fields: new Map([
			[
				fooKey,
				[
					{ type: Delta.MarkType.Delete, count: 1 },
					{
						type: Delta.MarkType.Insert,
						content: [testTreeCursor("nodeChange2")],
					},
				],
			],
		]),
	};
};

const change1: TaggedChange<OptionalChangeset> = tagChange(
	{
		fieldChange: {
			id: brand(1),
			newContent: { set: testTree("tree1"), changes: nodeChange1 },
			wasEmpty: true,
		},
	},
	mintRevisionTag(),
);

const change2: TaggedChange<OptionalChangeset> = tagChange(
	optionalFieldEditor.set(testTreeCursor("tree2"), false, brand(2)),
	mintRevisionTag(),
);

const revertChange2: OptionalChangeset = {
	fieldChange: {
		id: brand(2),
		newContent: {
			revert: testTreeCursor("tree1"),
			changeId: { revision: mintRevisionTag(), localId: brand(2) },
		},
		wasEmpty: false,
	},
};

/**
 * Represents what change2 would have been had it been concurrent with change1.
 */
const change2PreChange1: TaggedChange<OptionalChangeset> = tagChange(
	optionalFieldEditor.set(testTreeCursor("tree2"), true, brand(2)),
	change2.revision,
);

const change4: TaggedChange<OptionalChangeset> = tagChange(
	optionalFieldEditor.buildChildChange(0, nodeChange2),
	mintRevisionTag(),
);

// TODO: unit test standalone functions from optionalField.ts
describe("optionalField", () => {
	// TODO: more editor tests
	describe("editor", () => {
		it("can be created", () => {
			const actual: OptionalChangeset = optionalFieldEditor.set(
				testTreeCursor("x"),
				true,
				brand(42),
			);
			const expected: OptionalChangeset = {
				fieldChange: { id: brand(42), newContent: { set: testTree("x") }, wasEmpty: true },
			};
			assert.deepEqual(actual, expected);
		});
	});

	describe("optionalChangeRebaser", () => {
		it("can be composed", () => {
			const composed = optionalChangeRebaser.compose(
				[change1, change2],
				failChildComposer,
				failIdAllocator,
				failCrossFieldManager,
				defaultRevisionMetadataFromChanges([change1, change2]),
			);

			const change1And2: OptionalChangeset = {
				fieldChange: {
					id: brand(2),
					revision: change2.revision,
					newContent: { set: testTree("tree2") },
					wasEmpty: true,
				},
			};

			assert.deepEqual(composed, change1And2);
		});

		it("can compose child changes", () => {
			const expected: OptionalChangeset = {
				fieldChange: {
					id: brand(1),
					revision: change1.revision,
					wasEmpty: true,
					newContent: { set: testTree("tree1"), changes: arbitraryChildChange },
				},
			};

			assert.deepEqual(
				optionalChangeRebaser.compose(
					[change1, change4],
					(changes: TaggedChange<NodeChangeset>[]): NodeChangeset => {
						assert.deepEqual(
							changes.map((c) => c.change),
							[nodeChange1, nodeChange2],
						);
						return arbitraryChildChange;
					},
					failIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([change1, change4]),
				),
				expected,
			);
		});

		it("can be inverted", () => {
			const childInverter = (change: NodeChangeset) => {
				assert.deepEqual(change, nodeChange1);
				return nodeChange2;
			};

			const expected: OptionalChangeset = {
				fieldChange: { id: brand(1), wasEmpty: false },
				childChange: nodeChange2,
			};

			const repair: NodeReviver = (revision: RevisionTag, index: number, count: number) => {
				assert.equal(revision, change1.revision);
				assert.equal(index, 0);
				assert.equal(count, 1);
				return [testTreeCursor("tree1")];
			};

			assert.deepEqual(
				optionalChangeRebaser.invert(
					change1,
					childInverter,
					repair,
					failIdAllocator,
					failCrossFieldManager,
				),
				expected,
			);
		});

		describe("Rebasing", () => {
			it("can be rebased", () => {
				const childRebaser = (
					_change: NodeChangeset | undefined,
					_base: NodeChangeset | undefined,
				) => assert.fail("Should not be called");
				assert.deepEqual(
					optionalChangeRebaser.rebase(
						change2PreChange1.change,
						change1,
						childRebaser,
						failIdAllocator,
						failCrossFieldManager,
						defaultRevisionMetadataFromChanges([change1]),
					),
					change2.change,
				);
			});

			it("can rebase child change", () => {
				const baseChange: OptionalChangeset = { childChange: nodeChange1 };
				const changeToRebase: OptionalChangeset = { childChange: nodeChange2 };

				const childRebaser = (
					change: NodeChangeset | undefined,
					base: NodeChangeset | undefined,
				): NodeChangeset | undefined => {
					assert.deepEqual(change, nodeChange2);
					assert.deepEqual(base, nodeChange1);
					return arbitraryChildChange;
				};

				const expected: OptionalChangeset = { childChange: arbitraryChildChange };

				assert.deepEqual(
					optionalChangeRebaser.rebase(
						changeToRebase,
						makeAnonChange(baseChange),
						childRebaser,
						failIdAllocator,
						failCrossFieldManager,
						defaultRevisionMetadataFromChanges([]),
					),
					expected,
				);
			});

			it("can rebase a child change over a delete and revive of target node", () => {
				const tag1 = mintRevisionTag();
				const tag2 = mintRevisionTag();
				const changeToRebase = optionalFieldEditor.buildChildChange(0, nodeChange1);
				const deletion = tagChange(
					optionalFieldEditor.set(undefined, false, brand(1)),
					tag1,
				);
				const revive = tagRollbackInverse(
					optionalChangeRebaser.invert(
						deletion,
						() => assert.fail("Should not need to invert children"),
						fakeRepair,
						failIdAllocator,
						failCrossFieldManager,
					),
					tag2,
					tag1,
				);

				const childRebaser = (
					nodeChange: NodeChangeset | undefined,
					baseNodeChange: NodeChangeset | undefined,
				) => {
					assert(baseNodeChange === undefined);
					assert(nodeChange === nodeChange1);
					return nodeChange;
				};

				const changeToRebase2 = optionalChangeRebaser.rebase(
					changeToRebase,
					deletion,
					childRebaser,
					failIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([deletion]),
				);

				const changeToRebase3 = optionalChangeRebaser.rebase(
					changeToRebase2,
					revive,
					childRebaser,
					failIdAllocator,
					failCrossFieldManager,
					defaultRevisionMetadataFromChanges([revive]),
				);

				assert.deepEqual(changeToRebase3, changeToRebase);
			});
		});
	});

	describe("optionalFieldIntoDelta", () => {
		it("can be converted to a delta when field was empty", () => {
			const expected: Delta.MarkList = [
				{
					type: Delta.MarkType.Insert,
					content: [testTreeCursor("tree1")],
					fields: new Map([
						[
							fooKey,
							[
								{ type: Delta.MarkType.Delete, count: 1 },
								{
									type: Delta.MarkType.Insert,
									content: [testTreeCursor("nodeChange1")],
								},
							],
						],
					]),
				},
			];

			assertMarkListEqual(optionalFieldIntoDelta(change1.change, deltaFromChild1), expected);
		});

		it("can be converted to a delta when restoring content", () => {
			const expected: Delta.MarkList = [
				{ type: Delta.MarkType.Delete, count: 1 },
				{ type: Delta.MarkType.Insert, content: [testTreeCursor("tree1")] },
			];

			const actual = optionalFieldIntoDelta(revertChange2, deltaFromChild1);
			assertMarkListEqual(actual, expected);
		});

		it("can be converted to a delta with only child changes", () => {
			const expected: Delta.MarkList = [
				{
					type: Delta.MarkType.Modify,
					fields: new Map([
						[
							fooKey,
							[
								{ type: Delta.MarkType.Delete, count: 1 },
								{
									type: Delta.MarkType.Insert,
									content: [testTreeCursor("nodeChange2")],
								},
							],
						],
					]),
				},
			];

			assertMarkListEqual(optionalFieldIntoDelta(change4.change, deltaFromChild2), expected);
		});
	});
});
