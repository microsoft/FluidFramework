/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */

import { strict as assert } from "assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils";

import {
	type AllowedTypes,
	Any,
	FieldKinds,
	cursorForJsonableTreeNode,
	cursorForJsonableTreeField,
} from "../../../feature-libraries";
import { FieldAnchor, FieldKey, rootFieldKey, UpPath } from "../../../core";
import { forestWithContent, flexTreeViewWithContent } from "../../utils";
import { leaf, leaf as leafDomain, SchemaBuilder } from "../../../domains";
import { brand } from "../../../util";
import {
	LazyField,
	LazyOptionalField,
	LazySequence,
	LazyValueField,
} from "../../../feature-libraries/flex-tree/lazyField";
import {
	getReadonlyContext,
	initializeCursor,
	readonlyTreeWithContent,
	rootFieldAnchor,
} from "./utils";

const detachedField: FieldKey = brand("detached");
const detachedFieldAnchor: FieldAnchor = { parent: undefined, fieldKey: detachedField };

/**
 * Test {@link LazyField} implementation.
 */
class TestLazyField<TTypes extends AllowedTypes> extends LazyField<
	typeof FieldKinds.optional,
	TTypes
> {}

describe("LazyField", () => {
	it("LazyField implementations do not allow edits to detached trees", () => {
		const builder = new SchemaBuilder({ scope: "lazyTree" });
		builder.object("empty", {});
		const schema = builder.intoSchema(SchemaBuilder.optional(Any));
		const forest = forestWithContent({ schema, initialTree: {} });
		const context = getReadonlyContext(forest, schema);
		const cursor = initializeCursor(context, detachedFieldAnchor);

		const sequenceField = new LazySequence(
			context,
			SchemaBuilder.sequence(Any),
			cursor,
			detachedFieldAnchor,
		);
		const optionalField = new LazyOptionalField(
			context,
			SchemaBuilder.optional(Any),
			cursor,
			detachedFieldAnchor,
		);
		const valueField = new LazyValueField(
			context,
			SchemaBuilder.required(Any),
			cursor,
			detachedFieldAnchor,
		);
		cursor.free();
		assert.throws(
			() => sequenceField.insertAt(0, [1]),
			(e: Error) =>
				validateAssertionError(
					e,
					/only allowed on fields with TreeStatus.InDocument status/,
				),
		);
		assert.throws(
			() => (optionalField.content = undefined),
			(e: Error) =>
				validateAssertionError(
					e,
					/only allowed on fields with TreeStatus.InDocument status/,
				),
		);
		assert.throws(
			() => (valueField.content = {}),
			(e: Error) =>
				validateAssertionError(
					e,
					/only allowed on fields with TreeStatus.InDocument status/,
				),
		);
	});

	it("is", () => {
		// #region Tree and schema initialization

		const builder = new SchemaBuilder({ scope: "test", libraries: [leafDomain.library] });
		const rootSchema = SchemaBuilder.optional(builder.object("object", {}));
		const schema = builder.intoSchema(rootSchema);

		// Note: this tree initialization is strictly to enable construction of the lazy field.
		// The test cases below are strictly in terms of the schema of the created fields.
		const { context, cursor } = readonlyTreeWithContent({ schema, initialTree: {} });

		// #endregion

		// #region OptionalField<Any>

		const anyOptionalField = new TestLazyField(
			context,
			SchemaBuilder.optional(Any),
			cursor,
			detachedFieldAnchor,
		);

		assert(anyOptionalField.is(SchemaBuilder.optional(Any)));

		assert(!anyOptionalField.is(SchemaBuilder.optional([])));
		assert(!anyOptionalField.is(SchemaBuilder.optional(leafDomain.boolean)));
		assert(!anyOptionalField.is(SchemaBuilder.required([])));
		assert(!anyOptionalField.is(SchemaBuilder.required(Any)));
		assert(!anyOptionalField.is(SchemaBuilder.required(leafDomain.boolean)));
		assert(!anyOptionalField.is(SchemaBuilder.sequence([])));
		assert(!anyOptionalField.is(SchemaBuilder.sequence(Any)));
		assert(!anyOptionalField.is(SchemaBuilder.sequence(leafDomain.boolean)));

		// #endregion

		// #region OptionalField<Primitive>

		const booleanOptionalField = new LazyOptionalField(
			context,
			SchemaBuilder.optional(leafDomain.boolean),
			cursor,
			detachedFieldAnchor,
		);

		assert(booleanOptionalField.is(SchemaBuilder.optional(leafDomain.boolean)));

		assert(!booleanOptionalField.is(SchemaBuilder.optional(Any)));
		assert(!booleanOptionalField.is(SchemaBuilder.optional(leafDomain.number)));
		assert(!booleanOptionalField.is(SchemaBuilder.required([])));
		assert(!booleanOptionalField.is(SchemaBuilder.required(Any)));
		assert(!booleanOptionalField.is(SchemaBuilder.required(leafDomain.boolean)));
		assert(!booleanOptionalField.is(SchemaBuilder.required(leafDomain.number)));
		assert(!booleanOptionalField.is(SchemaBuilder.sequence([])));
		assert(!booleanOptionalField.is(SchemaBuilder.sequence(Any)));
		assert(!booleanOptionalField.is(SchemaBuilder.sequence(leafDomain.boolean)));
		assert(!booleanOptionalField.is(SchemaBuilder.sequence(leafDomain.number)));
		assert(!booleanOptionalField.is(SchemaBuilder.optional([])));

		// #endregion
	});

	it("parent", () => {
		const builder = new SchemaBuilder({ scope: "test", libraries: [leafDomain.library] });
		const struct = builder.object("object", {
			foo: SchemaBuilder.optional(leafDomain.primitives),
		});
		const rootSchema = SchemaBuilder.optional(struct);
		const schema = builder.intoSchema(rootSchema);

		const { context, cursor } = readonlyTreeWithContent({
			schema,
			initialTree: {
				foo: "Hello world",
			},
		});

		const rootField = new TestLazyField(context, rootSchema, cursor, rootFieldAnchor);
		assert.equal(rootField.parent, undefined);

		const parentPath: UpPath = {
			parent: undefined,
			parentField: rootFieldKey,
			parentIndex: 0,
		};
		const parentAnchor = context.forest.anchors.track(parentPath);

		// Move cursor down to leaf field
		cursor.enterNode(0);
		cursor.enterField(brand("foo"));

		const leafField = new TestLazyField(
			context,
			SchemaBuilder.optional(leafDomain.primitives),
			cursor,
			{
				parent: parentAnchor,
				fieldKey: brand("foo"),
			},
		);
		assert.equal(leafField.parent, rootField.boxedAt(0));
	});
});

describe("LazyOptionalField", () => {
	const builder = new SchemaBuilder({ scope: "test", libraries: [leafDomain.library] });
	const rootSchema = SchemaBuilder.optional(leafDomain.number);
	const schema = builder.intoSchema(rootSchema);

	describe("Field with value", () => {
		const { context, cursor } = readonlyTreeWithContent({ schema, initialTree: 42 });
		const field = new LazyOptionalField(context, rootSchema, cursor, rootFieldAnchor);

		it("atIndex", () => {
			assert.equal(field.atIndex(0), 42);
		});

		it("boxedAt", () => {
			const boxedResult = field.boxedAt(0);
			assert.equal(boxedResult.type, leafDomain.number.name);
			assert.equal(boxedResult.value, 42);
		});

		it("length", () => {
			assert.equal(field.length, 1);
		});

		it("map", () => {
			assert.deepEqual(
				field.map((value) => value),
				[42],
			);
		});

		it("mapBoxed", () => {
			const mapResult = field.mapBoxed((value) => value);
			assert.equal(mapResult.length, 1);
			assert.equal(mapResult[0].value, 42);
		});
	});

	describe("Field without value", () => {
		const { context, cursor } = readonlyTreeWithContent({
			schema,
			initialTree: undefined,
		});
		const field = new LazyOptionalField(context, rootSchema, cursor, rootFieldAnchor);

		it("atIndex", () => {
			// Invalid to request the value if there isn't one.
			assert.throws(() => field.atIndex(0));
		});

		it("boxedAt", () => {
			// Invalid to request the value if there isn't one.
			assert.throws(() => field.boxedAt(0));
		});

		it("length", () => {
			assert.equal(field.length, 0);
		});

		it("map", () => {
			assert.deepEqual(
				field.map((value) => value),
				[],
			);
		});

		it("mapBoxed", () => {
			assert.deepEqual(
				field.mapBoxed((value) => value),
				[],
			);
		});
	});

	it("content", () => {
		const view = flexTreeViewWithContent({
			schema,
			initialTree: 5,
		});
		assert.equal(view.editableTree.content, 5);
		view.editableTree.content = 6;
		assert.equal(view.editableTree.content, 6);
		view.editableTree.content = undefined;
		assert.equal(view.editableTree.content, undefined);
		view.editableTree.content = cursorForJsonableTreeNode({
			type: leaf.string.name,
			value: 7,
		});
		assert.equal(view.editableTree.content, 7);
	});
});

describe("LazyValueField", () => {
	const builder = new SchemaBuilder({ scope: "test", libraries: [leafDomain.library] });
	const rootSchema = SchemaBuilder.required(leafDomain.string);
	const schema = builder.intoSchema(rootSchema);

	const initialTree = "Hello world";

	const { context, cursor } = readonlyTreeWithContent({ schema, initialTree });

	const field = new LazyValueField(context, rootSchema, cursor, rootFieldAnchor);

	it("atIndex", () => {
		assert.equal(field.atIndex(0), initialTree);
	});

	it("boxedAt", () => {
		const boxedResult = field.boxedAt(0);
		assert.equal(boxedResult.type, leafDomain.string.name);
		assert.equal(boxedResult.value, initialTree);
	});

	it("length", () => {
		assert.equal(field.length, 1);
	});

	it("map", () => {
		assert.deepEqual(
			field.map((value) => value),
			[initialTree],
		);
	});

	it("mapBoxed", () => {
		const mapResult = field.mapBoxed((value) => value);
		assert.equal(mapResult.length, 1);
		assert.equal(mapResult[0].value, initialTree);
	});

	it("content", () => {
		const view = flexTreeViewWithContent({
			schema,
			initialTree: "X",
		});
		assert.equal(view.editableTree.content, "X");
		view.editableTree.content = "Y";
		assert.equal(view.editableTree.content, "Y");
		const zCursor = cursorForJsonableTreeNode({ type: leaf.string.name, value: "Z" });
		view.editableTree.content = zCursor;
		assert.equal(view.editableTree.content, "Z");
	});
});

describe("LazySequence", () => {
	const builder = new SchemaBuilder({ scope: "test", libraries: [leafDomain.library] });
	const rootSchema = SchemaBuilder.sequence(leafDomain.number);
	const schema = builder.intoSchema(rootSchema);

	/**
	 * Creates a tree with a sequence of numbers at the root, and returns the sequence
	 */
	function testSequence(data: number[]) {
		const { context, cursor } = readonlyTreeWithContent({
			schema,
			initialTree: data,
		});
		return new LazySequence(context, rootSchema, cursor, rootFieldAnchor);
	}

	function testMutableSequence(data: number[]) {
		const view = flexTreeViewWithContent({
			schema,
			initialTree: data,
		});
		return view.editableTree;
	}

	it("atIndex", () => {
		const sequence = testSequence([37, 42]);
		assert.equal(sequence.length, 2);
		assert.equal(sequence.atIndex(0), 37);
		assert.equal(sequence.atIndex(1), 42);
		assert.throws(() => sequence.atIndex(2));
	});

	it("at", () => {
		const sequence = testSequence([37, 42]);
		assert.equal(sequence.length, 2);
		assert.equal(sequence.at(0), 37);
		assert.equal(sequence.at(1), 42);
		assert.equal(sequence.at(-1), 42); // Negative index > -sequence.length
		assert.equal(sequence.at(-2), 37); // Negative index > -sequence.length
		assert.equal(sequence.at(2), undefined); // Positive index >= sequence.length
		assert.equal(sequence.at(-3), undefined); // Negative index < -sequence.length
	});

	it("boxedAt", () => {
		const sequence = testSequence([37, 42]);
		const boxedResult0 = sequence.boxedAt(0);
		assert.equal(boxedResult0.type, leafDomain.number.name);
		assert.equal(boxedResult0.value, 37);

		const boxedResult1 = sequence.boxedAt(1);
		assert.equal(boxedResult1.type, leafDomain.number.name);
		assert.equal(boxedResult1.value, 42);

		assert.throws(() => sequence.boxedAt(2));
	});

	it("length", () => {
		assert.equal(testSequence([]).length, 0);
		assert.equal(testSequence([37, 42]).length, 2);
	});

	it("map", () => {
		const sequence = testSequence([1, 2]);
		const mapResult = sequence.map((value) => value * 2);
		assert.deepEqual(mapResult, [2, 4]);
	});

	it("mapBoxed", () => {
		const sequence = testSequence([37, 42]);
		const mapResult = sequence.mapBoxed((value) => value);
		assert.equal(mapResult.length, 2);
		assert.equal(mapResult[0].type, leafDomain.number.name);
		assert.equal(mapResult[0].value, 37);
		assert.equal(mapResult[1].type, leafDomain.number.name);
		assert.equal(mapResult[1].value, 42);
	});

	it("asArray", () => {
		const sequence = testSequence([37, 42]);
		const array = sequence.asArray;
		assert.deepEqual(array, [37, 42]);
	});

	describe("insertAt", () => {
		it("basic use", () => {
			const sequence = testMutableSequence([]);
			assert.deepEqual(sequence.asArray, []);
			sequence.insertAt(0, []);
			assert.deepEqual(sequence.asArray, []);
			sequence.insertAt(0, [10]);
			assert.deepEqual(sequence.asArray, [10]);
			sequence.insertAt(0, [11]);
			assert.deepEqual(sequence.asArray, [11, 10]);
			sequence.insertAt(1, [12]);
			assert.deepEqual(sequence.asArray, [11, 12, 10]);
			sequence.insertAt(3, [13]);
			assert.deepEqual(sequence.asArray, [11, 12, 10, 13]);
			sequence.insertAt(1, [1, 2, 3]);
			assert.deepEqual(sequence.asArray, [11, 1, 2, 3, 12, 10, 13]);
			assert.throws(
				() => sequence.insertAt(-1, []),
				(e: Error) => validateAssertionError(e, /index/),
			);
			assert.throws(
				() => sequence.insertAt(0.5, []),
				(e: Error) => validateAssertionError(e, /index/),
			);
			assert.throws(
				() => sequence.insertAt(NaN, []),
				(e: Error) => validateAssertionError(e, /index/),
			);
			assert.throws(
				() => sequence.insertAt(Number.POSITIVE_INFINITY, []),
				(e: Error) => validateAssertionError(e, /index/),
			);
			assert.throws(
				() => sequence.insertAt(8, []),
				(e: Error) => validateAssertionError(e, /index/),
			);
		});

		it("with cursors", () => {
			const sequence = testMutableSequence([]);
			assert.deepEqual(sequence.asArray, []);
			sequence.insertAt(0, cursorForJsonableTreeField([]));
			assert.deepEqual(sequence.asArray, []);
			sequence.insertAt(
				0,
				cursorForJsonableTreeField([{ type: leaf.number.name, value: 10 }]),
			);
			assert.deepEqual(sequence.asArray, [10]);
			sequence.insertAt(
				0,
				cursorForJsonableTreeField([
					{ type: leaf.number.name, value: 11 },
					{ type: leaf.number.name, value: 12 },
				]),
			);
			assert.deepEqual(sequence.asArray, [11, 12, 10]);
		});
	});
});
