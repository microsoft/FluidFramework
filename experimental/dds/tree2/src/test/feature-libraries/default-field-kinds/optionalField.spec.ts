/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	ContextuallyTypedNodeDataObject,
	FieldChangeHandler,
	FieldKinds,
	IdAllocator,
	NodeChangeset,
	NodeReviver,
	SchemaBuilder,
	cursorFromContextualData,
	jsonableTreeFromCursor,
	singleTextCursor,
	valueSymbol,
} from "../../../feature-libraries";
import {
	makeAnonChange,
	RevisionTag,
	TaggedChange,
	Delta,
	mintRevisionTag,
	tagChange,
	tagRollbackInverse,
	FieldKey,
	ValueSchema,
	JsonableTree,
	ITreeCursor,
} from "../../../core";
import { JsonCompatibleReadOnly, brand } from "../../../util";
import {
	assertMarkListEqual,
	defaultRevisionMetadataFromChanges,
	fakeTaggedRepair as fakeRepair,
	makeEncodingTestSuite,
} from "../../utils";
import {
	OptionalFieldEditor,
	optionalChangeHandler,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/default-field-kinds/optionalField";
// eslint-disable-next-line import/no-internal-modules
import { OptionalChangeset } from "../../../feature-libraries/default-field-kinds/defaultFieldChangeTypes";
import { IJsonCodec } from "../../../codec";

const builder = new SchemaBuilder("defaultFieldKinds tests");
const nodeSchema = builder.objectRecursive("Node", {
	value: ValueSchema.String,
	local: { foo: SchemaBuilder.fieldRecursive(FieldKinds.optional, () => nodeSchema) },
});

const testNode = builder.leaf("TestNode", ValueSchema.String);

const schemaData = builder.intoLibrary();

const tree1ContextuallyTyped: ContextuallyTypedNodeDataObject = {
	[valueSymbol]: "value1",
	foo: { [valueSymbol]: "value3" },
};

/**
 * Arbitrary tree with value `s`
 */
function testTree(s: string): JsonableTree {
	return jsonableTreeFromCursor(testTreeCursor(s));
}

/**
 * Arbitrary tree with value `s`
 */
function testTreeCursor(s: string): ITreeCursor {
	return cursorFromContextualData({ schema: schemaData }, new Set([testNode.name]), s);
}

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
const fooKey: FieldKey = brand("foo");
const nodeChange1: NodeChangeset = {
	fieldChanges: new Map([
		[
			fooKey,
			{
				fieldKind: FieldKinds.optional.identifier,
				change: brand({ type: nodeSchema.name, value: "value3" }),
			},
		],
	]),
};
const nodeChange2: NodeChangeset = {
	fieldChanges: new Map([
		[
			fooKey,
			{
				fieldKind: FieldKinds.optional.identifier,
				change: brand({ type: nodeSchema.name, value: "value4" }),
			},
		],
	]),
};
const nodeChange3: NodeChangeset = {
	fieldChanges: new Map([
		[
			fooKey,
			{
				fieldKind: FieldKinds.optional.identifier,
				change: brand({ type: nodeSchema.name, value: "value5" }),
			},
		],
	]),
};

const unexpectedDelegate = () => assert.fail("Should not be called");
const idAllocator: IdAllocator = unexpectedDelegate;

const crossFieldManager = {
	get: unexpectedDelegate,
	set: unexpectedDelegate,
	addDependency: unexpectedDelegate,
	invalidate: unexpectedDelegate,
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
						content: [singleTextCursor({ type: nodeSchema.name, value: "value3" })],
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
						content: [singleTextCursor({ type: nodeSchema.name, value: "value4" })],
					},
				],
			],
		]),
	};
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

describe("Optional field changesets", () => {
	const fieldHandler: FieldChangeHandler<OptionalChangeset> = optionalChangeHandler;
	const editor: OptionalFieldEditor = fieldHandler.editor as OptionalFieldEditor;

	const change1: TaggedChange<OptionalChangeset> = tagChange(
		{
			fieldChange: {
				id: brand(1),
				newContent: { set: tree1, changes: nodeChange1 },
				wasEmpty: true,
			},
		},
		mintRevisionTag(),
	);

	const change2: TaggedChange<OptionalChangeset> = tagChange(
		editor.set(singleTextCursor(tree2), false, brand(2)),
		mintRevisionTag(),
	);

	const revertChange2: TaggedChange<OptionalChangeset> = tagChange(
		{
			fieldChange: {
				id: brand(2),
				newContent: {
					revert: singleTextCursor(tree1),
					changeId: { revision: change2.revision, localId: brand(2) },
				},
				wasEmpty: false,
			},
		},
		mintRevisionTag(),
	);

	/**
	 * Represents what change2 would have been had it been concurrent with change1.
	 */
	const change2PreChange1: TaggedChange<OptionalChangeset> = tagChange(
		editor.set(singleTextCursor(tree2), true, brand(2)),
		change2.revision,
	);

	/**
	 * Represents the outcome of composing change1 and change2.
	 */
	const change1And2: TaggedChange<OptionalChangeset> = makeAnonChange({
		fieldChange: {
			id: brand(2),
			revision: change2.revision,
			newContent: { set: tree2 },
			wasEmpty: true,
		},
	});

	const change4: TaggedChange<OptionalChangeset> = tagChange(
		editor.buildChildChange(0, nodeChange2),
		mintRevisionTag(),
	);

	it("can be created", () => {
		const actual: OptionalChangeset = editor.set(testTreeCursor("x"), true, brand(42));
		const expected: OptionalChangeset = {
			fieldChange: { id: brand(42), newContent: { set: testTree("x") }, wasEmpty: true },
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
		assert.deepEqual(composed, change1And2.change);
	});

	it("can compose child changes", () => {
		const expected: OptionalChangeset = {
			fieldChange: {
				id: brand(1),
				revision: change1.revision,
				wasEmpty: true,
				newContent: { set: tree1, changes: nodeChange3 },
			},
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

		const expected: OptionalChangeset = {
			fieldChange: { id: brand(1), wasEmpty: false },
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
					change2PreChange1.change,
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
			const baseChange: OptionalChangeset = { childChange: nodeChange1 };
			const changeToRebase: OptionalChangeset = { childChange: nodeChange2 };

			const childRebaser = (
				change: NodeChangeset | undefined,
				base: NodeChangeset | undefined,
			): NodeChangeset | undefined => {
				assert.deepEqual(change, nodeChange2);
				assert.deepEqual(base, nodeChange1);
				return nodeChange3;
			};

			const expected: OptionalChangeset = { childChange: nodeChange3 };

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
			const deletion = tagChange(editor.set(undefined, false, brand(1)), tag1);
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
				fields: new Map([
					[
						fooKey,
						[
							{ type: Delta.MarkType.Delete, count: 1 },
							{
								type: Delta.MarkType.Insert,
								content: [
									singleTextCursor({ type: nodeSchema.name, value: "value3" }),
								],
							},
						],
					],
				]),
			},
		];

		assertMarkListEqual(fieldHandler.intoDelta(change1.change, deltaFromChild1), expected);
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
								content: [
									singleTextCursor({ type: nodeSchema.name, value: "value4" }),
								],
							},
						],
					],
				]),
			},
		];

		assertMarkListEqual(fieldHandler.intoDelta(change4.change, deltaFromChild2), expected);
	});

	describe("Encoding", () => {
		const encodingTestData: [string, OptionalChangeset][] = [
			["change", change1.change],
			["with repair data", revertChange2.change],
		];

		makeEncodingTestSuite(fieldHandler.codecsFactory(childCodec1), encodingTestData);
	});
});
