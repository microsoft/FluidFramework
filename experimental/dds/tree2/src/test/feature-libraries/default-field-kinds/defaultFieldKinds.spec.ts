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
	jsonableTreeFromCursor,
	singleTextCursor,
	valueSymbol,
	cursorFromContextualData,
	SchemaBuilder,
} from "../../../feature-libraries";
// Allow import from file being tested.
// eslint-disable-next-line import/no-internal-modules
import * as FieldKinds from "../../../feature-libraries/default-field-kinds/defaultFieldKinds";
import {
	makeAnonChange,
	TaggedChange,
	Delta,
	mintRevisionTag,
	ValueSchema,
	tagChange,
	FieldKey,
} from "../../../core";
import { JsonCompatibleReadOnly, brand } from "../../../util";
import {
	assertMarkListEqual,
	defaultRevisionMetadataFromChanges,
	fakeTaggedRepair as fakeRepair,
	makeEncodingTestSuite,
} from "../../utils";
import { IJsonCodec } from "../../../codec";
// eslint-disable-next-line import/no-internal-modules
import { OptionalChangeset } from "../../../feature-libraries/default-field-kinds/defaultFieldChangeTypes";

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
	const fieldHandler: FieldChangeHandler<OptionalChangeset, FieldKinds.ValueFieldEditor> =
		FieldKinds.value.changeHandler;

	const childChange1: OptionalChangeset = { childChange: nodeChange1 };
	const childChange2: OptionalChangeset = { childChange: nodeChange2 };
	const childChange3: OptionalChangeset = { childChange: nodeChange3 };

	const change1 = tagChange(
		fieldHandler.editor.set(singleTextCursor(tree1), brand(1)),
		mintRevisionTag(),
	);
	const change2 = tagChange(
		fieldHandler.editor.set(singleTextCursor(tree2), brand(2)),
		mintRevisionTag(),
	);

	const change1WithChildChange: OptionalChangeset = {
		fieldChange: {
			newContent: { set: tree1, changes: nodeChange1 },
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
			newContent: { set: tree2 },
			wasEmpty: false,
		},
	});

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

	const simpleChildComposer = (changes: TaggedChange<NodeChangeset>[]) => {
		assert.equal(changes.length, 1);
		return changes[0].change;
	};

	it("can be created", () => {
		const expected: OptionalChangeset = {
			fieldChange: { newContent: { set: tree1 }, id: brand(1), wasEmpty: false },
		};
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

		assert.deepEqual(composed, change1And2.change);
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

		const composition = fieldHandler.rebaser.compose(
			[makeAnonChange(childChange1), change1],
			simpleChildComposer,
			idAllocator,
			crossFieldManager,
			defaultRevisionMetadataFromChanges([change1]),
		);
		assert.deepEqual(composition, {
			fieldChange: { ...change1.change.fieldChange, revision: change1.revision },
			childChange: nodeChange1,
		});

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

		assert.deepEqual(inverted.childChange, nodeChange2);
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

	it("can be converted to a delta when restoring content", () => {
		const expected: Delta.MarkList = [
			{ type: Delta.MarkType.Delete, count: 1 },
			{ type: Delta.MarkType.Insert, content: [singleTextCursor(tree1)] },
		];

		const actual = fieldHandler.intoDelta(revertChange2.change, deltaFromChild1);
		assertMarkListEqual(actual, expected);
	});

	const encodingTestData: [string, OptionalChangeset][] = [
		["with child change", change1WithChildChange],
		["with repair data", revertChange2.change],
	];

	makeEncodingTestSuite(fieldHandler.codecsFactory(childCodec1), encodingTestData);
});
