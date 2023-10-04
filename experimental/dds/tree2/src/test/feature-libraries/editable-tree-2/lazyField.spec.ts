/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */

import { strict as assert } from "assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils";

import { TreeContent } from "../../../shared-tree";
import {
	type AllowedTypes,
	Any,
	type FieldKind,
	FieldKinds,
	FieldSchema,
	SchemaAware,
	SchemaBuilder,
	TreeSchema,
} from "../../../feature-libraries";
import {
	FieldAnchor,
	FieldKey,
	type ITreeCursorSynchronous,
	type ITreeSubscriptionCursor,
	rootFieldKey,
	TreeNavigationResult,
	ValueSchema,
	UpPath,
} from "../../../core";
import { forestWithContent } from "../../utils";
import { leaf as leafDomain } from "../../../domains";
import { brand } from "../../../util";
import { type Context } from "../../../feature-libraries/editable-tree-2/context";
import {
	LazyOptionalField,
	LazySequence,
	LazyValueField,
} from "../../../feature-libraries/editable-tree-2/lazyField";
import { contextWithContentReadonly, getReadonlyContext } from "./utils";

const detachedField: FieldKey = brand("detached");
const detachedFieldAnchor: FieldAnchor = { parent: undefined, fieldKey: detachedField };
const rootFieldAnchor: FieldAnchor = { parent: undefined, fieldKey: rootFieldKey };

/**
 * Creates a cursor from the provided `context` and moves it to the provided `anchor`.
 */
function initializeCursor(context: Context, anchor: FieldAnchor): ITreeSubscriptionCursor {
	const cursor = context.forest.allocateCursor();

	assert.equal(context.forest.tryMoveCursorToField(anchor, cursor), TreeNavigationResult.Ok);
	return cursor;
}

/**
 * Initializes a test tree, context, and cursor, and moves the cursor to the tree's root.
 *
 * @returns The initialized context and cursor.
 */
function initializeTreeWithContent<Kind extends FieldKind, Types extends AllowedTypes>(
	treeContent: TreeContent,
): {
	context: Context;
	cursor: ITreeSubscriptionCursor;
} {
	const context = contextWithContentReadonly(treeContent);
	const cursor = initializeCursor(context, rootFieldAnchor);

	return {
		context,
		cursor,
	};
}

describe("LazyField", () => {
	it("LazyField implementations do not allow edits to detached trees", () => {
		const builder = new SchemaBuilder("lazyTree");
		builder.struct("empty", {});
		const schema = builder.intoDocumentSchema(SchemaBuilder.fieldOptional(Any));
		const forest = forestWithContent({ schema, initialTree: {} });
		const context = getReadonlyContext(forest, schema);
		const cursor = initializeCursor(context, detachedFieldAnchor);

		const sequenceField = new LazySequence(
			context,
			SchemaBuilder.fieldSequence(Any),
			cursor,
			detachedFieldAnchor,
		);
		const optionalField = new LazyOptionalField(
			context,
			SchemaBuilder.fieldOptional(Any),
			cursor,
			detachedFieldAnchor,
		);
		const valueField = new LazyValueField(
			context,
			SchemaBuilder.fieldValue(Any),
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
			() => optionalField.setContent(undefined),
			(e: Error) =>
				validateAssertionError(
					e,
					/only allowed on fields with TreeStatus.InDocument status/,
				),
		);
		assert.throws(
			() => valueField.setContent({}),
			(e: Error) =>
				validateAssertionError(
					e,
					/only allowed on fields with TreeStatus.InDocument status/,
				),
		);
	});

	describe("LazyOptionalField", () => {
		it("is", () => {
			// #region Tree and schema initialization

			const builder = new SchemaBuilder("test", undefined, leafDomain.library);
			const recursiveStructSchema = builder.structRecursive("recursiveStruct", {
				flag: SchemaBuilder.fieldValue(leafDomain.boolean),
				child: SchemaBuilder.fieldRecursive(
					FieldKinds.optional,
					() => recursiveStructSchema,
				),
			});
			const rootSchema = SchemaBuilder.fieldOptional(builder.struct("struct", {}));
			const schema = builder.intoDocumentSchema(rootSchema);

			const { context, cursor } = initializeTreeWithContent({ schema, initialTree: {} });

			// #endregion

			// #region OptionalField<Any>

			const anyOptionalField = new LazyOptionalField(
				context,
				SchemaBuilder.fieldOptional(Any),
				cursor,
				detachedFieldAnchor,
			);

			// Positive cases
			assert(anyOptionalField.is(SchemaBuilder.fieldOptional(Any)));

			// Negative cases
			assert(!anyOptionalField.is(SchemaBuilder.fieldOptional()));
			assert(!anyOptionalField.is(SchemaBuilder.fieldOptional(leafDomain.boolean)));
			assert(!anyOptionalField.is(SchemaBuilder.fieldValue()));
			assert(!anyOptionalField.is(SchemaBuilder.fieldValue(Any)));
			assert(!anyOptionalField.is(SchemaBuilder.fieldValue(leafDomain.boolean)));
			assert(!anyOptionalField.is(SchemaBuilder.fieldSequence()));
			assert(!anyOptionalField.is(SchemaBuilder.fieldSequence(Any)));
			assert(!anyOptionalField.is(SchemaBuilder.fieldSequence(leafDomain.boolean)));
			assert(
				!anyOptionalField.is(
					SchemaBuilder.fieldRecursive(FieldKinds.value, recursiveStructSchema),
				),
			);

			// #endregion

			// #region OptionalField<Primitive>

			const primitiveOptionalField = new LazyOptionalField(
				context,
				SchemaBuilder.fieldOptional(leafDomain.boolean),
				cursor,
				detachedFieldAnchor,
			);

			assert(primitiveOptionalField.is(SchemaBuilder.fieldOptional(leafDomain.boolean)));
			assert(!primitiveOptionalField.is(SchemaBuilder.fieldOptional(Any)));
			assert(primitiveOptionalField.is(SchemaBuilder.fieldOptional(leafDomain.number))); // TODO: this is presumably wrong
			assert(!primitiveOptionalField.is(SchemaBuilder.fieldValue()));
			assert(!primitiveOptionalField.is(SchemaBuilder.fieldValue(Any)));
			assert(!primitiveOptionalField.is(SchemaBuilder.fieldValue(leafDomain.boolean)));
			assert(!primitiveOptionalField.is(SchemaBuilder.fieldValue(leafDomain.number)));
			assert(!primitiveOptionalField.is(SchemaBuilder.fieldSequence()));
			assert(!primitiveOptionalField.is(SchemaBuilder.fieldSequence(Any)));
			assert(!primitiveOptionalField.is(SchemaBuilder.fieldSequence(leafDomain.boolean)));
			assert(!primitiveOptionalField.is(SchemaBuilder.fieldSequence(leafDomain.number)));
			assert(
				!primitiveOptionalField.is(
					SchemaBuilder.fieldRecursive(FieldKinds.value, recursiveStructSchema),
				),
			);
			assert(primitiveOptionalField.is(SchemaBuilder.fieldOptional()));

			// #endregion
		});

		describe("at", () => {
			it("Unboxes", () => {
				const builder = new SchemaBuilder("test", undefined, leafDomain.library);
				const rootSchema = SchemaBuilder.fieldOptional(leafDomain.number);
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent({ schema, initialTree: 42 });

				const field = new LazyOptionalField(context, rootSchema, cursor, rootFieldAnchor);

				assert.equal(field.at(0), 42);
			});
		});

		it("boxedAt", () => {
			const builder = new SchemaBuilder("test", undefined, leafDomain.library);
			const rootSchema = SchemaBuilder.fieldOptional(leafDomain.string);
			const schema = builder.intoDocumentSchema(rootSchema);

			const { context, cursor } = initializeTreeWithContent({
				schema,
				initialTree: "Hello world",
			});

			const field = new LazyOptionalField(context, rootSchema, cursor, rootFieldAnchor);

			const boxedResult = field.boxedAt(0);
			assert.equal(boxedResult.type, leafDomain.string.name);
			assert.equal(boxedResult.value, "Hello world");
		});

		it("parent", () => {
			const builder = new SchemaBuilder("test", undefined, leafDomain.library);
			const struct = builder.struct("struct", {
				foo: SchemaBuilder.fieldOptional(...leafDomain.primitives),
			});
			const rootSchema = SchemaBuilder.fieldOptional(struct);
			const schema = builder.intoDocumentSchema(rootSchema);

			const { context, cursor } = initializeTreeWithContent({
				schema,
				initialTree: {
					foo: "Hello world",
				},
			});

			const rootField = new LazyOptionalField(context, rootSchema, cursor, rootFieldAnchor);
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

			const leafField = new LazyOptionalField(
				context,
				SchemaBuilder.fieldOptional(...leafDomain.primitives),
				cursor,
				{
					parent: parentAnchor,
					fieldKey: brand("foo"),
				},
			);
			assert.equal(leafField.parent, rootField.boxedAt(0));
		});

		describe("length", () => {
			it("No value", () => {
				const builder = new SchemaBuilder("test", undefined, leafDomain.library);
				const numberLeafSchema = builder.leaf("number", ValueSchema.Number);
				const rootSchema = SchemaBuilder.fieldOptional(numberLeafSchema);
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent({
					schema,
					initialTree: undefined,
				});

				const field = new LazyOptionalField(
					context,
					SchemaBuilder.fieldOptional(Any),
					cursor,
					rootFieldAnchor,
				);

				assert.equal(field.length, 0);
			});

			it("With value", () => {
				const builder = new SchemaBuilder("test", undefined, leafDomain.library);
				const numberLeafSchema = builder.leaf("number", ValueSchema.Number);
				const rootSchema = SchemaBuilder.fieldOptional(numberLeafSchema);
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent({ schema, initialTree: 42 });

				const field = new LazyOptionalField(
					context,
					SchemaBuilder.fieldOptional(numberLeafSchema),
					cursor,
					rootFieldAnchor,
				);

				assert.equal(field.length, 1);
			});
		});

		/**
		 * Creates a tree whose root node contains a single (optional) leaf field.
		 * Also initializes a cursor and moves that cursor to the tree's root field.
		 *
		 * @returns The root node's field.
		 */
		function createOptionalLeafTree(
			kind: ValueSchema,
			initialTree?:
				| SchemaAware.TypedField<FieldSchema, SchemaAware.ApiMode.Flexible>
				| readonly ITreeCursorSynchronous[]
				| ITreeCursorSynchronous,
		): LazyOptionalField<[TreeSchema<"leaf">]> {
			const builder = new SchemaBuilder("test");
			const leafSchema = builder.leaf("leaf", kind);
			const rootSchema = SchemaBuilder.fieldOptional(leafSchema);
			const schema = builder.intoDocumentSchema(rootSchema);

			const { context, cursor } = initializeTreeWithContent({ schema, initialTree });

			return new LazyOptionalField(
				context,
				SchemaBuilder.fieldOptional(leafSchema),
				cursor,
				rootFieldAnchor,
			);
		}

		describe("map", () => {
			it("No value", () => {
				const field = createOptionalLeafTree(ValueSchema.Number, undefined);

				assert.deepEqual(
					field.map((value) => value),
					[],
				);
			});

			it("Primitive field", () => {
				const field = createOptionalLeafTree(ValueSchema.Boolean, false);

				assert.deepEqual(
					field.map((value) => value),
					[false],
				);
			});
		});

		describe("mapBoxed", () => {
			it("No value", () => {
				const field = createOptionalLeafTree(ValueSchema.String, undefined);

				const mapResult = field.mapBoxed((value) => value);
				assert.deepEqual(mapResult, []);
			});

			it("With value", () => {
				const field = createOptionalLeafTree(ValueSchema.Number, 42);

				const mapResult = field.mapBoxed((value) => value);
				assert.equal(mapResult.length, 1);
				assert.equal(mapResult[0].value, 42);
			});
		});
	});

	describe("LazyValueField", () => {
		it("is", () => {
			// #region Tree and schema initialization

			const builder = new SchemaBuilder("test", undefined, leafDomain.library);
			const recursiveStructSchema = builder.structRecursive("recursiveStruct", {
				flag: SchemaBuilder.fieldValue(leafDomain.boolean),
				child: SchemaBuilder.fieldRecursive(
					FieldKinds.optional,
					() => recursiveStructSchema,
				),
			});
			const rootSchema = SchemaBuilder.fieldValue(builder.struct("struct", {}));
			const schema = builder.intoDocumentSchema(rootSchema);

			const { context, cursor } = initializeTreeWithContent({
				schema,
				initialTree: {},
			});

			// #endregion

			// #region ValueField<Any>

			const anyValueField = new LazyValueField(
				context,
				SchemaBuilder.fieldValue(Any),
				cursor,
				detachedFieldAnchor,
			);

			assert(anyValueField.is(SchemaBuilder.fieldValue(Any)));
			assert(!anyValueField.is(SchemaBuilder.fieldValue()));
			assert(!anyValueField.is(SchemaBuilder.fieldValue(leafDomain.boolean)));
			assert(!anyValueField.is(SchemaBuilder.fieldOptional()));
			assert(!anyValueField.is(SchemaBuilder.fieldOptional(leafDomain.boolean)));
			assert(!anyValueField.is(SchemaBuilder.fieldSequence()));
			assert(!anyValueField.is(SchemaBuilder.fieldSequence(Any)));
			assert(!anyValueField.is(SchemaBuilder.fieldSequence(leafDomain.boolean)));
			assert(
				!anyValueField.is(
					SchemaBuilder.fieldRecursive(FieldKinds.value, recursiveStructSchema),
				),
			);
			assert(!anyValueField.is(SchemaBuilder.fieldOptional(Any)));

			// #endregion

			// #region ValueField<Primitive>

			const primitiveValueField = new LazyValueField(
				context,
				SchemaBuilder.fieldValue(leafDomain.boolean),
				cursor,
				detachedFieldAnchor,
			);

			assert(primitiveValueField.is(SchemaBuilder.fieldValue(leafDomain.boolean)));
			assert(!primitiveValueField.is(SchemaBuilder.fieldValue(Any)));
			assert(!primitiveValueField.is(SchemaBuilder.fieldOptional()));
			assert(!primitiveValueField.is(SchemaBuilder.fieldOptional(Any)));
			assert(!primitiveValueField.is(SchemaBuilder.fieldOptional(leafDomain.number)));
			assert(!primitiveValueField.is(SchemaBuilder.fieldSequence()));
			assert(!primitiveValueField.is(SchemaBuilder.fieldSequence(Any)));
			assert(!primitiveValueField.is(SchemaBuilder.fieldSequence(leafDomain.boolean)));
			assert(!primitiveValueField.is(SchemaBuilder.fieldSequence(leafDomain.number)));
			assert(
				primitiveValueField.is(
					SchemaBuilder.fieldRecursive(FieldKinds.value, recursiveStructSchema),
				),
			); // TODO: this is presumably wrong
			assert(primitiveValueField.is(SchemaBuilder.fieldValue()));
			assert(primitiveValueField.is(SchemaBuilder.fieldValue(leafDomain.number))); // TODO: this is presumably wrong
			assert(!primitiveValueField.is(SchemaBuilder.fieldOptional(leafDomain.boolean)));

			// #endregion
		});

		describe("at", () => {
			it("Unboxes", () => {
				const builder = new SchemaBuilder("test", undefined, leafDomain.library);
				const rootSchema = SchemaBuilder.fieldValue(leafDomain.number);
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent({ schema, initialTree: 42 });

				const field = new LazyValueField(context, rootSchema, cursor, rootFieldAnchor);

				assert.equal(field.at(0), 42);
			});
		});

		it("boxedAt", () => {
			const builder = new SchemaBuilder("test", undefined, leafDomain.library);
			const rootSchema = SchemaBuilder.fieldValue(leafDomain.string);
			const schema = builder.intoDocumentSchema(rootSchema);

			const { context, cursor } = initializeTreeWithContent({
				schema,
				initialTree: "Hello world",
			});

			const field = new LazyValueField(context, rootSchema, cursor, rootFieldAnchor);

			const boxedResult = field.boxedAt(0);
			assert.equal(boxedResult.type, leafDomain.string.name);
			assert.equal(boxedResult.value, "Hello world");
		});

		it("length", () => {
			const builder = new SchemaBuilder("test", undefined, leafDomain.library);
			const rootSchema = SchemaBuilder.fieldValue(leafDomain.number);
			const schema = builder.intoDocumentSchema(rootSchema);

			const { context, cursor } = initializeTreeWithContent({ schema, initialTree: 42 });

			const field = new LazyValueField(context, rootSchema, cursor, rootFieldAnchor);

			assert.equal(field.length, 1);
		});

		/**
		 * Creates a tree whose root node contains a single (required) leaf field.
		 * Also initializes a cursor and moves that cursor to the tree's root field.
		 *
		 * @returns The root node's field.
		 */
		function createValueLeafTree(
			kind: ValueSchema,
			initialTree?:
				| SchemaAware.TypedField<FieldSchema, SchemaAware.ApiMode.Flexible>
				| readonly ITreeCursorSynchronous[]
				| ITreeCursorSynchronous,
		): LazyValueField<[TreeSchema<"leaf">]> {
			const builder = new SchemaBuilder("test");
			const leafSchema = builder.leaf("leaf", kind);
			const rootSchema = SchemaBuilder.fieldValue(leafSchema);
			const schema = builder.intoDocumentSchema(rootSchema);

			const { context, cursor } = initializeTreeWithContent({ schema, initialTree });

			return new LazyValueField(context, rootSchema, cursor, rootFieldAnchor);
		}

		it("map", () => {
			const field = createValueLeafTree(ValueSchema.String, "Hello world");

			assert.deepEqual(
				field.map((value) => value),
				["Hello world"],
			);
		});

		it("mapBoxed", () => {
			const field = createValueLeafTree(ValueSchema.Number, 42);

			const mapResult = field.mapBoxed((value) => value);
			assert.equal(mapResult.length, 1);
			assert.equal(mapResult[0].value, 42);
		});
	});

	describe("LazySequence", () => {
		it("is", () => {
			// #region Tree and schema initialization

			const builder = new SchemaBuilder("test", undefined, leafDomain.library);
			const recursiveStructSchema = builder.structRecursive("recursiveStruct", {
				flag: SchemaBuilder.fieldValue(leafDomain.boolean),
				child: SchemaBuilder.fieldRecursive(
					FieldKinds.optional,
					() => recursiveStructSchema,
				),
			});
			const rootSchema = SchemaBuilder.fieldOptional(builder.struct("struct", {}));
			const schema = builder.intoDocumentSchema(rootSchema);

			const { context, cursor } = initializeTreeWithContent({ schema, initialTree: {} });

			// #endregion

			// #region Sequence<Any>

			const anySequence = new LazySequence(
				context,
				SchemaBuilder.fieldSequence(Any),
				cursor,
				detachedFieldAnchor,
			);

			// Positive cases
			assert(anySequence.is(SchemaBuilder.fieldSequence(Any)));

			// Negative cases
			assert(!anySequence.is(SchemaBuilder.fieldOptional()));
			assert(!anySequence.is(SchemaBuilder.fieldOptional(Any)));
			assert(!anySequence.is(SchemaBuilder.fieldOptional(leafDomain.boolean)));
			assert(!anySequence.is(SchemaBuilder.fieldValue()));
			assert(!anySequence.is(SchemaBuilder.fieldValue(Any)));
			assert(!anySequence.is(SchemaBuilder.fieldValue(leafDomain.boolean)));
			assert(!anySequence.is(SchemaBuilder.fieldSequence(leafDomain.boolean)));
			assert(!anySequence.is(SchemaBuilder.fieldSequence()));
			assert(
				!anySequence.is(
					SchemaBuilder.fieldRecursive(FieldKinds.value, recursiveStructSchema),
				),
			);

			// #endregion

			// #region Sequence<Primitive>

			const primitiveSequence = new LazySequence(
				context,
				SchemaBuilder.fieldSequence(leafDomain.boolean),
				cursor,
				detachedFieldAnchor,
			);

			// Positive cases
			assert(primitiveSequence.is(SchemaBuilder.fieldSequence(leafDomain.boolean)));

			// Negative cases
			assert(!primitiveSequence.is(SchemaBuilder.fieldOptional()));
			assert(!primitiveSequence.is(SchemaBuilder.fieldOptional(Any)));
			assert(!primitiveSequence.is(SchemaBuilder.fieldOptional(leafDomain.boolean)));
			assert(!primitiveSequence.is(SchemaBuilder.fieldValue()));
			assert(!primitiveSequence.is(SchemaBuilder.fieldValue(Any)));
			assert(!primitiveSequence.is(SchemaBuilder.fieldValue(leafDomain.boolean)));
			assert(
				!primitiveSequence.is(
					SchemaBuilder.fieldRecursive(FieldKinds.value, recursiveStructSchema),
				),
			);

			// #endregion
		});

		describe("at", () => {
			it("Unboxes", () => {
				const builder = new SchemaBuilder("test", undefined, leafDomain.library);
				const rootSchema = SchemaBuilder.fieldSequence(leafDomain.number);
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent({
					schema,
					initialTree: [37, 42],
				});

				const sequence = new LazySequence(context, rootSchema, cursor, rootFieldAnchor);

				assert.equal(sequence.length, 2);
				assert.equal(sequence.at(0), 37);
				assert.equal(sequence.at(1), 42);
			});
		});

		it("boxedAt", () => {
			const builder = new SchemaBuilder("test", undefined, leafDomain.library);
			const rootSchema = SchemaBuilder.fieldSequence(leafDomain.string);
			const schema = builder.intoDocumentSchema(rootSchema);

			const { context, cursor } = initializeTreeWithContent({
				schema,
				initialTree: ["Hello", "world"],
			});

			const sequence = new LazySequence(context, rootSchema, cursor, rootFieldAnchor);

			const boxedResult0 = sequence.boxedAt(0);
			assert.equal(boxedResult0.type, leafDomain.string.name);
			assert.equal(boxedResult0.value, "Hello");

			const boxedResult1 = sequence.boxedAt(1);
			assert.equal(boxedResult1.type, leafDomain.string.name);
			assert.equal(boxedResult1.value, "world");
		});

		describe("length", () => {
			it("Empty", () => {
				const builder = new SchemaBuilder("test", undefined, leafDomain.library);
				const rootSchema = SchemaBuilder.fieldSequence(leafDomain.number);
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent({
					schema,
					initialTree: [],
				});

				const sequence = new LazySequence(context, rootSchema, cursor, rootFieldAnchor);

				assert.equal(sequence.length, 0);
			});

			it("Non-empty", () => {
				const builder = new SchemaBuilder("test", undefined, leafDomain.library);
				const rootSchema = SchemaBuilder.fieldSequence(leafDomain.number);
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent({
					schema,
					initialTree: [37, 42],
				});

				const sequence = new LazySequence(context, rootSchema, cursor, rootFieldAnchor);

				assert.equal(sequence.length, 2);
			});
		});

		describe("map", () => {
			it("Empty", () => {
				const builder = new SchemaBuilder("test", undefined, leafDomain.library);
				const rootSchema = SchemaBuilder.fieldSequence(leafDomain.boolean);
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent({
					schema,
					initialTree: [],
				});

				const sequence = new LazySequence(context, rootSchema, cursor, rootFieldAnchor);

				const mapResult = sequence.map((value) => value);
				assert.equal(mapResult.length, 0);
			});

			it("Non-empty", () => {
				const builder = new SchemaBuilder("test", undefined, leafDomain.library);
				const rootSchema = SchemaBuilder.fieldSequence(leafDomain.boolean);
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent({
					schema,
					initialTree: [true, false],
				});

				const sequence = new LazySequence(context, rootSchema, cursor, rootFieldAnchor);

				const mapResult = sequence.map((value) => value);
				assert.equal(mapResult.length, 2);
				assert.equal(mapResult[0], true);
				assert.equal(mapResult[1], false);
			});
		});

		describe("mapBoxed", () => {
			it("Empty", () => {
				const builder = new SchemaBuilder("test", undefined, leafDomain.library);
				const rootSchema = SchemaBuilder.fieldSequence(leafDomain.boolean);
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent({
					schema,
					initialTree: [],
				});

				const sequence = new LazySequence(context, rootSchema, cursor, rootFieldAnchor);

				const mapResult = sequence.mapBoxed((value) => value);
				assert.equal(mapResult.length, 0);
			});

			it("Non-empty", () => {
				const builder = new SchemaBuilder("test", undefined, leafDomain.library);
				const rootSchema = SchemaBuilder.fieldSequence(leafDomain.boolean);
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent({
					schema,
					initialTree: [true, false],
				});

				const sequence = new LazySequence(context, rootSchema, cursor, rootFieldAnchor);

				const mapResult = sequence.mapBoxed((value) => value);
				assert.equal(mapResult.length, 2);
				assert.equal(mapResult[0].type, leafDomain.boolean.name);
				assert.equal(mapResult[0].value, true);
				assert.equal(mapResult[1].type, leafDomain.boolean.name);
				assert.equal(mapResult[1].value, false);
			});
		});

		describe("asArray", () => {
			it("Empty", () => {
				const builder = new SchemaBuilder("test", undefined, leafDomain.library);
				const rootSchema = SchemaBuilder.fieldSequence(leafDomain.string);
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent({
					schema,
					initialTree: [],
				});

				const sequence = new LazySequence(context, rootSchema, cursor, rootFieldAnchor);

				const array = sequence.asArray;
				assert.equal(array.length, 0);
			});

			it("Non-empty", () => {
				const builder = new SchemaBuilder("test", undefined, leafDomain.library);
				const rootSchema = SchemaBuilder.fieldSequence(leafDomain.string);
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent({
					schema,
					initialTree: ["Hello", "world"],
				});

				const sequence = new LazySequence(context, rootSchema, cursor, rootFieldAnchor);

				const array = sequence.asArray;
				assert.equal(array.length, 2);
				assert.equal(array[0], "Hello");
				assert.equal(array[1], "world");
			});
		});
	});
});
