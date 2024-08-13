/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */

import { strict as assert } from "assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import {
	type FieldAnchor,
	type FieldKey,
	type UpPath,
	rootFieldKey,
} from "../../../core/index.js";
import {
	SchemaBuilder,
	leaf,
	leaf as leafDomain,
	singleJsonCursor,
	typedJsonCursor,
} from "../../../domains/index.js";
import { isFreedSymbol } from "../../../feature-libraries/flex-tree/lazyEntity.js";
import {
	LazyField,
	LazyOptionalField,
	LazySequence,
	LazyValueField,
} from "../../../feature-libraries/flex-tree/lazyField.js";
import {
	Any,
	FieldKinds,
	type FlexAllowedTypes,
	FlexFieldSchema,
	cursorForJsonableTreeNode,
	SchemaBuilderBase,
	mapTreeFromCursor,
} from "../../../feature-libraries/index.js";
import { brand, disposeSymbol } from "../../../util/index.js";
import { flexTreeViewWithContent, forestWithContent } from "../../utils.js";

import {
	getReadonlyContext,
	initializeCursor,
	readonlyTreeWithContent,
	rootFieldAnchor,
} from "./utils.js";

const detachedField: FieldKey = brand("detached");
const detachedFieldAnchor: FieldAnchor = { parent: undefined, fieldKey: detachedField };

/**
 * Test {@link LazyField} implementation.
 */
class TestLazyField<TTypes extends FlexAllowedTypes> extends LazyField<
	typeof FieldKinds.optional,
	TTypes
> {}

describe("LazyField", () => {
	it("LazyField implementations do not allow edits to detached trees", () => {
		const builder = new SchemaBuilder({ scope: "lazyTree" });
		builder.object("empty", {});
		const schema = builder.intoSchema(FlexFieldSchema.create(FieldKinds.optional, [Any]));
		const forest = forestWithContent({ schema, initialTree: singleJsonCursor({}) });
		const context = getReadonlyContext(forest, schema);
		const cursor = initializeCursor(context, detachedFieldAnchor);

		const optionalField = new LazyOptionalField(
			context,
			FlexFieldSchema.create(FieldKinds.optional, [Any]),
			cursor,
			detachedFieldAnchor,
		);
		const valueField = new LazyValueField(
			context,
			FlexFieldSchema.create(FieldKinds.required, [Any]),
			cursor,
			detachedFieldAnchor,
		);
		cursor.free();
		assert.throws(
			() => optionalField.editor.set(undefined, optionalField.length === undefined),
			(e: Error) =>
				validateAssertionError(e, /only allowed on fields with TreeStatus.InDocument status/),
		);
		assert.throws(
			() => valueField.editor.set(mapTreeFromCursor(singleJsonCursor({}))),
			(e: Error) =>
				validateAssertionError(e, /only allowed on fields with TreeStatus.InDocument status/),
		);
	});

	it("is", () => {
		// #region Tree and schema initialization

		const builder = new SchemaBuilder({ scope: "test", libraries: [leafDomain.library] });
		const rootSchema = FlexFieldSchema.create(FieldKinds.optional, [
			builder.object("object", {}),
		]);
		const schema = builder.intoSchema(rootSchema);

		// Note: this tree initialization is strictly to enable construction of the lazy field.
		// The test cases below are strictly in terms of the schema of the created fields.
		const { context, cursor } = readonlyTreeWithContent({
			schema,
			initialTree: singleJsonCursor({}),
		});

		// #endregion

		// #region OptionalField<Any>

		const anyOptionalField = new TestLazyField(
			context,
			FlexFieldSchema.create(FieldKinds.optional, [Any]),
			cursor,
			detachedFieldAnchor,
		);

		assert(anyOptionalField.is(FlexFieldSchema.create(FieldKinds.optional, [Any])));

		assert(!anyOptionalField.is(FlexFieldSchema.create(FieldKinds.optional, [])));
		assert(
			!anyOptionalField.is(FlexFieldSchema.create(FieldKinds.optional, [leafDomain.boolean])),
		);
		assert(!anyOptionalField.is(FlexFieldSchema.create(FieldKinds.required, [])));
		assert(!anyOptionalField.is(FlexFieldSchema.create(FieldKinds.required, [Any])));
		assert(
			!anyOptionalField.is(FlexFieldSchema.create(FieldKinds.required, [leafDomain.boolean])),
		);
		assert(!anyOptionalField.is(FlexFieldSchema.create(FieldKinds.sequence, [])));
		assert(!anyOptionalField.is(FlexFieldSchema.create(FieldKinds.sequence, [Any])));
		assert(
			!anyOptionalField.is(FlexFieldSchema.create(FieldKinds.sequence, [leafDomain.boolean])),
		);

		// #endregion

		// #region OptionalField<Primitive>

		const booleanOptionalField = new LazyOptionalField(
			context,
			FlexFieldSchema.create(FieldKinds.optional, [leafDomain.boolean]),
			cursor,
			detachedFieldAnchor,
		);

		assert(
			booleanOptionalField.is(
				FlexFieldSchema.create(FieldKinds.optional, [leafDomain.boolean]),
			),
		);

		assert(!booleanOptionalField.is(FlexFieldSchema.create(FieldKinds.optional, [Any])));
		assert(
			!booleanOptionalField.is(
				FlexFieldSchema.create(FieldKinds.optional, [leafDomain.number]),
			),
		);
		assert(!booleanOptionalField.is(FlexFieldSchema.create(FieldKinds.required, [])));
		assert(!booleanOptionalField.is(FlexFieldSchema.create(FieldKinds.required, [Any])));
		assert(
			!booleanOptionalField.is(
				FlexFieldSchema.create(FieldKinds.required, [leafDomain.boolean]),
			),
		);
		assert(
			!booleanOptionalField.is(
				FlexFieldSchema.create(FieldKinds.required, [leafDomain.number]),
			),
		);
		assert(!booleanOptionalField.is(FlexFieldSchema.create(FieldKinds.sequence, [])));
		assert(!booleanOptionalField.is(FlexFieldSchema.create(FieldKinds.sequence, [Any])));
		assert(
			!booleanOptionalField.is(
				FlexFieldSchema.create(FieldKinds.sequence, [leafDomain.boolean]),
			),
		);
		assert(
			!booleanOptionalField.is(
				FlexFieldSchema.create(FieldKinds.sequence, [leafDomain.number]),
			),
		);
		assert(!booleanOptionalField.is(FlexFieldSchema.create(FieldKinds.optional, [])));

		// #endregion
	});

	it("parent", () => {
		const builder = new SchemaBuilder({ scope: "test", libraries: [leafDomain.library] });
		const struct = builder.object("object", {
			foo: FlexFieldSchema.create(FieldKinds.optional, leafDomain.primitives),
		});
		const rootSchema = FlexFieldSchema.create(FieldKinds.optional, [struct]);
		const schema = builder.intoSchema(rootSchema);

		const { context, cursor } = readonlyTreeWithContent({
			schema,
			initialTree: typedJsonCursor({
				[typedJsonCursor.type]: struct,
				foo: "Hello world",
			}),
		});

		const rootField = new TestLazyField(context, rootSchema, cursor, rootFieldAnchor);
		assert.equal(rootField.parent, undefined);

		const parentPath: UpPath = {
			parent: undefined,
			parentField: rootFieldKey,
			parentIndex: 0,
		};
		const parentAnchor = context.checkout.forest.anchors.track(parentPath);

		// Move cursor down to leaf field
		cursor.enterNode(0);
		cursor.enterField(brand("foo"));

		const leafField = new TestLazyField(
			context,
			FlexFieldSchema.create(FieldKinds.optional, leafDomain.primitives),
			cursor,
			{
				parent: parentAnchor,
				fieldKey: brand("foo"),
			},
		);
		assert.equal(leafField.parent, rootField.boxedAt(0));
	});

	it("Disposes when context is disposed", () => {
		const builder = new SchemaBuilderBase(FieldKinds.required, {
			scope: "LazyField",
			libraries: [leafDomain.library],
		});
		builder.object("empty", {});
		const schema = builder.intoSchema(FlexFieldSchema.create(FieldKinds.optional, [Any]));
		const forest = forestWithContent({ schema, initialTree: singleJsonCursor({}) });
		const context = getReadonlyContext(forest, schema);
		const cursor = initializeCursor(context, detachedFieldAnchor);

		const field = new LazyOptionalField(
			context,
			FlexFieldSchema.create(FieldKinds.optional, [Any]),
			cursor,
			detachedFieldAnchor,
		);

		assert(!field[isFreedSymbol]());
		context[disposeSymbol]();
		assert(field[isFreedSymbol]());
	});

	it("Disposes when parent is disposed", () => {
		const builder = new SchemaBuilderBase(FieldKinds.required, {
			scope: "LazyField",
			libraries: [leafDomain.library],
		});
		const Holder = builder.object("holder", { f: leafDomain.number });
		const schema = builder.intoSchema(FlexFieldSchema.create(FieldKinds.optional, [Any]));
		const forest = forestWithContent({
			schema,
			initialTree: typedJsonCursor({ [typedJsonCursor.type]: Holder, f: 5 }),
		});
		const context = getReadonlyContext(forest, schema);

		const holder = [...context.root.boxedIterator()][0];
		assert(holder.is(Holder));
		const field = holder.boxedF;
		assert(field instanceof LazyField);

		assert(!field[isFreedSymbol]());
		const v = forest.anchors.acquireVisitor();
		v.destroy(rootFieldKey, 1);
		assert(field[isFreedSymbol]());

		// Should not double free.
		context[disposeSymbol]();
	});

	it("Disposes when context then parent is disposed", () => {
		const builder = new SchemaBuilderBase(FieldKinds.required, {
			scope: "LazyField",
			libraries: [leafDomain.library],
		});
		const Holder = builder.object("holder", { f: leafDomain.number });
		const schema = builder.intoSchema(FlexFieldSchema.create(FieldKinds.optional, [Any]));
		const forest = forestWithContent({
			schema,
			initialTree: typedJsonCursor({ [typedJsonCursor.type]: Holder, f: 5 }),
		});
		const context = getReadonlyContext(forest, schema);

		const holder = [...context.root.boxedIterator()][0];
		assert(holder.is(Holder));
		const field = holder.boxedF;
		assert(field instanceof LazyField);

		assert(!field[isFreedSymbol]());
		context[disposeSymbol]();
		assert(field[isFreedSymbol]());
		// Should not double free.
		const v = forest.anchors.acquireVisitor();
		v.destroy(rootFieldKey, 1);
	});
});

describe("LazyOptionalField", () => {
	const builder = new SchemaBuilder({ scope: "test", libraries: [leafDomain.library] });
	const rootSchema = FlexFieldSchema.create(FieldKinds.optional, [leafDomain.number]);
	const schema = builder.intoSchema(rootSchema);

	describe("Field with value", () => {
		const { context, cursor } = readonlyTreeWithContent({
			schema,
			initialTree: singleJsonCursor(42),
		});
		const field = new LazyOptionalField(context, rootSchema, cursor, rootFieldAnchor);

		it("atIndex", () => {
			assert.equal(field.atIndex(0), 42);
		});

		it("boxedAt", () => {
			const boxedResult = field.boxedAt(0) ?? assert.fail();
			assert.equal(boxedResult.schema, leafDomain.number);
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
			assert.equal(field.boxedAt(0), undefined);
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
			initialTree: singleJsonCursor(5),
		});
		assert.equal(view.flexTree.content, 5);
		view.flexTree.editor.set(
			mapTreeFromCursor(singleJsonCursor(6)),
			view.flexTree.length === 0,
		);
		assert.equal(view.flexTree.content, 6);
		view.flexTree.editor.set(undefined, view.flexTree.length === 0);
		assert.equal(view.flexTree.content, undefined);
		view.flexTree.editor.set(
			mapTreeFromCursor(
				cursorForJsonableTreeNode({
					type: leaf.string.name,
					value: 7,
				}),
			),
			view.flexTree.length === 0,
		);
		assert.equal(view.flexTree.content, 7);
	});
});

describe("LazyValueField", () => {
	const builder = new SchemaBuilder({ scope: "test", libraries: [leafDomain.library] });
	const rootSchema = FlexFieldSchema.create(FieldKinds.required, [leafDomain.string]);
	const schema = builder.intoSchema(rootSchema);

	const initialTree = "Hello world";

	const { context, cursor } = readonlyTreeWithContent({
		schema,
		initialTree: singleJsonCursor(initialTree),
	});

	const field = new LazyValueField(context, rootSchema, cursor, rootFieldAnchor);

	it("atIndex", () => {
		assert.equal(field.atIndex(0), initialTree);
	});

	it("boxedAt", () => {
		const boxedResult = field.boxedAt(0) ?? assert.fail();
		assert.equal(boxedResult.schema, leafDomain.string);
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
			initialTree: singleJsonCursor("X"),
		});
		assert.equal(view.flexTree.content, "X");
		view.flexTree.editor.set(mapTreeFromCursor(singleJsonCursor("Y")));
		assert.equal(view.flexTree.content, "Y");
		const zCursor = cursorForJsonableTreeNode({ type: leaf.string.name, value: "Z" });
		view.flexTree.editor.set(mapTreeFromCursor(zCursor));
		assert.equal(view.flexTree.content, "Z");
	});
});

describe("LazySequence", () => {
	const builder = new SchemaBuilder({ scope: "test", libraries: [leafDomain.library] });
	const rootSchema = FlexFieldSchema.create(FieldKinds.sequence, [leafDomain.number]);
	const schema = builder.intoSchema(rootSchema);

	/**
	 * Creates a tree with a sequence of numbers at the root, and returns the sequence
	 */
	function testSequence(data: number[]) {
		const { context, cursor } = readonlyTreeWithContent({
			schema,
			initialTree: data.map((n) => singleJsonCursor(n)),
		});
		return new LazySequence(context, rootSchema, cursor, rootFieldAnchor);
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
		const boxedResult0 = sequence.boxedAt(0) ?? assert.fail();
		assert.equal(boxedResult0.schema, leafDomain.number);
		assert.equal(boxedResult0.value, 37);

		const boxedResult1 = sequence.boxedAt(1) ?? assert.fail();
		assert.equal(boxedResult1.schema, leafDomain.number);
		assert.equal(boxedResult1.value, 42);

		const boxedResultNeg1 = sequence.boxedAt(-1) ?? assert.fail();
		assert.equal(boxedResultNeg1.schema, leafDomain.number);
		assert.equal(boxedResultNeg1.value, 42);

		assert.equal(sequence.boxedAt(2), undefined);
		assert.equal((sequence.boxedAt(-2) ?? assert.fail()).value, 37);
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
		assert.equal(mapResult[0].schema, leafDomain.number);
		assert.equal(mapResult[0].value, 37);
		assert.equal(mapResult[1].schema, leafDomain.number);
		assert.equal(mapResult[1].value, 42);
	});

	it("asArray", () => {
		const sequence = testSequence([37, 42]);
		const array = [...sequence];
		assert.deepEqual(array, [37, 42]);
	});
});
