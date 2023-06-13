/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	ContextuallyTypedNodeDataObject,
	FieldChangeHandler,
	IdAllocator,
	NodeChangeset,
	NodeReviver,
	jsonableTreeFromCursor,
	singleTextCursor,
	valueSymbol,
	cursorFromContextualData,
	SchemaBuilder,
} from "../../feature-libraries";
// Allow import from file being tested.
// eslint-disable-next-line import/no-internal-modules
import * as FieldKinds from "../../feature-libraries/defaultFieldKinds";
// eslint-disable-next-line import/no-internal-modules
import * as FieldKindsTypes from "../../feature-libraries/defaultFieldChangeTypes";
import {
	makeAnonChange,
	RevisionTag,
	TaggedChange,
	Delta,
	mintRevisionTag,
	ValueSchema,
	tagChange,
	tagRollbackInverse,
} from "../../core";
import { JsonCompatibleReadOnly } from "../../util";
import {
	assertMarkListEqual,
	defaultRevisionMetadataFromChanges,
	fakeTaggedRepair as fakeRepair,
	makeEncodingTestSuite,
} from "../utils";
import { IJsonCodec } from "../../codec";

const builder = new SchemaBuilder("defaultFieldKinds tests");
const nodeSchema = builder.objectRecursive("Node", {
	value: ValueSchema.String,
	local: { foo: SchemaBuilder.fieldRecursive(FieldKinds.optional, () => nodeSchema) },
});

const schemaData = builder.intoLibrary();

const tree1ContextuallyTyped: ContextuallyTypedNodeDataObject = {
	[valueSymbol]: "value1",
	foo: { [valueSymbol]: "value3" },
};

// TODO: This file is mainly working with in memory representations.
// Therefore it should not be using JsonableTrees.
// The usages of this (and other JsonableTrees) such as ValueChangeset should be changed to use
// a tree format intended for in memory use, such as Cursor or MapTree.
// TODO: Figure out issue with deepfreezing here
const tree1 = jsonableTreeFromCursor(
	cursorFromContextualData(
		{
			schema: schemaData,
		},
		new Set([nodeSchema.name]),
		tree1ContextuallyTyped,
	),
);

const tree2 = { type: nodeSchema.name, value: "value2" };
const nodeChange1: NodeChangeset = { valueChange: { value: "value3" } };
const nodeChange2: NodeChangeset = { valueChange: { value: "value4" } };
const nodeChange3: NodeChangeset = { valueChange: { value: "value5" } };

const unexpectedDelegate = () => assert.fail("Should not be called");
const idAllocator: IdAllocator = unexpectedDelegate;

const crossFieldManager = {
	get: unexpectedDelegate,
	getOrCreate: unexpectedDelegate,
	addDependency: unexpectedDelegate,
	invalidate: unexpectedDelegate,
};

const deltaFromChild1 = (child: NodeChangeset): Delta.Modify => {
	assert.deepEqual(child, nodeChange1);
	return { type: Delta.MarkType.Modify, setValue: "value3" };
};

const deltaFromChild2 = (child: NodeChangeset): Delta.Modify => {
	assert.deepEqual(child, nodeChange2);
	return { type: Delta.MarkType.Modify, setValue: "value4" };
};

const encodedChild = "encoded child";

const childCodec1: IJsonCodec<NodeChangeset> = {
	encode: (change: NodeChangeset) => {
		assert.deepEqual(change, nodeChange1);
		return encodedChild;
	},
	decode: (encodedChange: JsonCompatibleReadOnly) => {
		assert.equal(encodedChange, encodedChild);
		return nodeChange1;
	},
};

const childComposer1_2 = (changes: TaggedChange<NodeChangeset>[]): NodeChangeset => {
	assert(changes.length === 2);
	assert.deepEqual(
		changes.map((c) => c.change),
		[nodeChange1, nodeChange2],
	);
	return nodeChange3;
};

describe("Value field changesets", () => {
	const fieldHandler: FieldChangeHandler<
		FieldKindsTypes.ValueChangeset,
		FieldKinds.ValueFieldEditor
	> = FieldKinds.value.changeHandler;

	const change1WithChildChange: FieldKindsTypes.ValueChangeset = {
		value: { set: tree1 },
		changes: nodeChange1,
	};
	const childChange1: FieldKindsTypes.ValueChangeset = { changes: nodeChange1 };
	const childChange2: FieldKindsTypes.ValueChangeset = { changes: nodeChange2 };
	const childChange3: FieldKindsTypes.ValueChangeset = { changes: nodeChange3 };

	const change1 = tagChange(fieldHandler.editor.set(singleTextCursor(tree1)), mintRevisionTag());
	const change2 = tagChange(fieldHandler.editor.set(singleTextCursor(tree2)), mintRevisionTag());

	const revertChange2: FieldKindsTypes.ValueChangeset = {
		value: { revert: singleTextCursor(tree1), revision: change2.revision },
	};

	const simpleChildComposer = (changes: TaggedChange<NodeChangeset>[]) => {
		assert.equal(changes.length, 1);
		return changes[0].change;
	};

	it("can be created", () => {
		const expected: FieldKindsTypes.ValueChangeset = { value: { set: tree1 } };
		assert.deepEqual(change1.change, expected);
	});

	it("can be composed", () => {
		const composed = fieldHandler.rebaser.compose(
			[change1, change2],
			simpleChildComposer,
			idAllocator,
			crossFieldManager,
			defaultRevisionMetadataFromChanges([change1, change2]),
		);

		assert.deepEqual(composed, change2.change);
	});

	it("can be composed with child changes", () => {
		const taggedChildChange1 = tagChange(childChange1, mintRevisionTag());
		assert.deepEqual(
			fieldHandler.rebaser.compose(
				[change1, taggedChildChange1],
				simpleChildComposer,
				idAllocator,
				crossFieldManager,
				defaultRevisionMetadataFromChanges([change1, taggedChildChange1]),
			),
			change1WithChildChange,
		);

		const expected: FieldKindsTypes.ValueChangeset = {
			value: { set: tree1 },
			changes: nodeChange1,
		};

		assert.deepEqual(change1WithChildChange, expected);
		assert.deepEqual(
			fieldHandler.rebaser.compose(
				[makeAnonChange(childChange1), change1],
				simpleChildComposer,
				idAllocator,
				crossFieldManager,
				defaultRevisionMetadataFromChanges([change1]),
			),
			change1.change,
		);

		assert.deepEqual(
			fieldHandler.rebaser.compose(
				[makeAnonChange(childChange1), makeAnonChange(childChange2)],
				childComposer1_2,
				idAllocator,
				crossFieldManager,
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
			idAllocator,
			crossFieldManager,
		);

		assert.deepEqual(inverted.changes, nodeChange2);
	});

	it("can be rebased", () => {
		const childRebaser = () => assert.fail("Should not be called");

		assert.deepEqual(
			fieldHandler.rebaser.rebase(
				change2.change,
				makeAnonChange(change1WithChildChange),
				childRebaser,
				idAllocator,
				crossFieldManager,
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
			return nodeChange3;
		};

		const baseChange = fieldHandler.editor.buildChildChange(0, nodeChange1);
		const changeToRebase = fieldHandler.editor.buildChildChange(0, nodeChange2);

		assert.deepEqual(
			fieldHandler.rebaser.rebase(
				changeToRebase,
				makeAnonChange(baseChange),
				childRebaser,
				idAllocator,
				crossFieldManager,
				defaultRevisionMetadataFromChanges([]),
			),
			childChange3,
		);
	});

	it("can be converted to a delta when overwriting content", () => {
		const expected: Delta.MarkList = [
			{ type: Delta.MarkType.Delete, count: 1 },
			{
				type: Delta.MarkType.Insert,
				content: [singleTextCursor(tree1)],
				setValue: "value3",
			},
		];

		const delta = fieldHandler.intoDelta(change1WithChildChange, deltaFromChild1);
		assertMarkListEqual(delta, expected);
	});

	it("can be converted to a delta when restoring content", () => {
		const expected: Delta.MarkList = [
			{ type: Delta.MarkType.Delete, count: 1 },
			{ type: Delta.MarkType.Insert, content: [singleTextCursor(tree1)] },
		];

		const actual = fieldHandler.intoDelta(revertChange2, deltaFromChild1);
		assertMarkListEqual(actual, expected);
	});

	const encodingTestData: [string, FieldKindsTypes.ValueChangeset][] = [
		["with child change", change1WithChildChange],
		["with repair data", revertChange2],
	];

	makeEncodingTestSuite(fieldHandler.codecsFactory(childCodec1), encodingTestData);
});

describe("Optional field changesets", () => {
	const fieldHandler: FieldChangeHandler<FieldKindsTypes.OptionalChangeset> =
		FieldKinds.optional.changeHandler;
	const editor: FieldKinds.OptionalFieldEditor =
		fieldHandler.editor as FieldKinds.OptionalFieldEditor;

	const change1: TaggedChange<FieldKindsTypes.OptionalChangeset> = tagChange(
		{
			fieldChange: { newContent: { set: tree1, changes: nodeChange1 }, wasEmpty: true },
		},
		mintRevisionTag(),
	);

	const change2: TaggedChange<FieldKindsTypes.OptionalChangeset> = tagChange(
		editor.set(singleTextCursor(tree2), false),
		mintRevisionTag(),
	);

	const revertChange2: TaggedChange<FieldKindsTypes.OptionalChangeset> = tagChange(
		{
			fieldChange: {
				newContent: { revert: singleTextCursor(tree1), revision: change2.revision },
				wasEmpty: false,
			},
		},
		mintRevisionTag(),
	);

	const change3: TaggedChange<FieldKindsTypes.OptionalChangeset> = tagChange(
		editor.set(singleTextCursor(tree2), true),
		mintRevisionTag(),
	);
	const change4: TaggedChange<FieldKindsTypes.OptionalChangeset> = tagChange(
		editor.buildChildChange(0, nodeChange2),
		mintRevisionTag(),
	);

	it("can be created", () => {
		const actual: FieldKindsTypes.OptionalChangeset = editor.set(singleTextCursor(tree1), true);
		const expected: FieldKindsTypes.OptionalChangeset = {
			fieldChange: { newContent: { set: tree1 }, wasEmpty: true },
		};
		assert.deepEqual(actual, expected);
	});

	it("can be composed", () => {
		const childComposer = (_: TaggedChange<NodeChangeset>[]) =>
			assert.fail("Should not be called");
		const composed = fieldHandler.rebaser.compose(
			[change1, change2],
			childComposer,
			idAllocator,
			crossFieldManager,
			defaultRevisionMetadataFromChanges([change1, change2]),
		);
		assert.deepEqual(composed, change3.change);
	});

	it("can compose child changes", () => {
		const expected: FieldKindsTypes.OptionalChangeset = {
			fieldChange: { wasEmpty: true, newContent: { set: tree1, changes: nodeChange3 } },
		};

		assert.deepEqual(
			fieldHandler.rebaser.compose(
				[change1, change4],
				childComposer1_2,
				idAllocator,
				crossFieldManager,
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

		const expected: FieldKindsTypes.OptionalChangeset = {
			fieldChange: { wasEmpty: false },
			childChange: nodeChange2,
		};

		const repair: NodeReviver = (revision: RevisionTag, index: number, count: number) => {
			assert.equal(revision, change1.revision);
			assert.equal(index, 0);
			assert.equal(count, 1);
			return [singleTextCursor(tree1)];
		};

		assert.deepEqual(
			fieldHandler.rebaser.invert(
				change1,
				childInverter,
				repair,
				idAllocator,
				crossFieldManager,
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
				fieldHandler.rebaser.rebase(
					change3.change,
					change1,
					childRebaser,
					idAllocator,
					crossFieldManager,
					defaultRevisionMetadataFromChanges([change1]),
				),
				change2.change,
			);
		});

		it("can rebase child change", () => {
			const baseChange: FieldKindsTypes.OptionalChangeset = { childChange: nodeChange1 };
			const changeToRebase: FieldKindsTypes.OptionalChangeset = { childChange: nodeChange2 };

			const childRebaser = (
				change: NodeChangeset | undefined,
				base: NodeChangeset | undefined,
			): NodeChangeset | undefined => {
				assert.deepEqual(change, nodeChange2);
				assert.deepEqual(base, nodeChange1);
				return nodeChange3;
			};

			const expected: FieldKindsTypes.OptionalChangeset = { childChange: nodeChange3 };

			assert.deepEqual(
				fieldHandler.rebaser.rebase(
					changeToRebase,
					makeAnonChange(baseChange),
					childRebaser,
					idAllocator,
					crossFieldManager,
					defaultRevisionMetadataFromChanges([]),
				),
				expected,
			);
		});

		it("can rebase a child change over a delete and revive of target node", () => {
			const tag1 = mintRevisionTag();
			const tag2 = mintRevisionTag();
			const changeToRebase = editor.buildChildChange(0, nodeChange1);
			const deletion = tagChange(editor.set(undefined, false), tag1);
			const revive = tagRollbackInverse(
				fieldHandler.rebaser.invert(
					deletion,
					() => assert.fail("Should not need to invert children"),
					fakeRepair,
					idAllocator,
					crossFieldManager,
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

			const changeToRebase2 = fieldHandler.rebaser.rebase(
				changeToRebase,
				deletion,
				childRebaser,
				idAllocator,
				crossFieldManager,
				defaultRevisionMetadataFromChanges([deletion]),
			);

			const changeToRebase3 = fieldHandler.rebaser.rebase(
				changeToRebase2,
				revive,
				childRebaser,
				idAllocator,
				crossFieldManager,
				defaultRevisionMetadataFromChanges([revive]),
			);

			assert.deepEqual(changeToRebase3, changeToRebase);
		});
	});

	it("can be converted to a delta when field was empty", () => {
		const expected: Delta.MarkList = [
			{
				type: Delta.MarkType.Insert,
				content: [singleTextCursor(tree1)],
				setValue: "value3",
			},
		];

		assertMarkListEqual(fieldHandler.intoDelta(change1.change, deltaFromChild1), expected);
	});

	it("can be converted to a delta when replacing content", () => {
		const expected: Delta.MarkList = [
			{ type: Delta.MarkType.Delete, count: 1 },
			{ type: Delta.MarkType.Insert, content: [singleTextCursor(tree2)] },
		];

		assertMarkListEqual(fieldHandler.intoDelta(change2.change, deltaFromChild1), expected);
	});

	it("can be converted to a delta when restoring content", () => {
		const expected: Delta.MarkList = [
			{ type: Delta.MarkType.Delete, count: 1 },
			{ type: Delta.MarkType.Insert, content: [singleTextCursor(tree1)] },
		];

		const actual = fieldHandler.intoDelta(revertChange2.change, deltaFromChild1);
		assertMarkListEqual(actual, expected);
	});

	it("can be converted to a delta with only child changes", () => {
		const expected: Delta.MarkList = [{ type: Delta.MarkType.Modify, setValue: "value4" }];

		assertMarkListEqual(fieldHandler.intoDelta(change4.change, deltaFromChild2), expected);
	});

	describe("Encoding", () => {
		const encodingTestData: [string, FieldKindsTypes.OptionalChangeset][] = [
			["change", change1.change],
			["with repair data", revertChange2.change],
		];

		makeEncodingTestSuite(fieldHandler.codecsFactory(childCodec1), encodingTestData);
	});
});
