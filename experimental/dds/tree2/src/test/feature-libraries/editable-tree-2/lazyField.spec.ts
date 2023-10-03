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
		describe("is", () => {
			it("Field schema: Any", () => {
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

				const field = new LazyOptionalField(
					context,
					SchemaBuilder.fieldOptional(Any),
					cursor,
					detachedFieldAnchor,
				);

				// Positive cases
				assert(field.is(SchemaBuilder.fieldOptional(Any)));

				// Negative cases
				assert(!field.is(SchemaBuilder.fieldOptional()));
				assert(!field.is(SchemaBuilder.fieldOptional(leafDomain.boolean)));
				assert(!field.is(SchemaBuilder.fieldValue(Any)));
				assert(!field.is(SchemaBuilder.fieldSequence(Any)));
				assert(
					!field.is(
						SchemaBuilder.fieldRecursive(FieldKinds.value, recursiveStructSchema),
					),
				);
			});

			it("Field schema: Primitive", () => {
				// #region Tree and schema initialization

				const builder = new SchemaBuilder("test", undefined, leafDomain.library);
				const booleanLeafSchema = builder.leaf("bool", ValueSchema.Boolean);
				const numberLeafSchema = builder.leaf("number", ValueSchema.Number);
				const recursiveStructSchema = builder.structRecursive("recursiveStruct", {
					flag: SchemaBuilder.fieldValue(booleanLeafSchema),
					child: SchemaBuilder.fieldRecursive(
						FieldKinds.optional,
						() => recursiveStructSchema,
					),
				});
				const rootSchema = SchemaBuilder.fieldOptional(builder.struct("struct", {}));
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent({ schema, initialTree: {} });

				// #endregion

				const field = new LazyOptionalField(
					context,
					SchemaBuilder.fieldOptional(booleanLeafSchema),
					cursor,
					detachedFieldAnchor,
				);

				// Positive cases
				assert(field.is(SchemaBuilder.fieldOptional(booleanLeafSchema)));

				// Negative cases
				assert(!field.is(SchemaBuilder.fieldValue(Any)));
				assert(!field.is(SchemaBuilder.fieldValue(booleanLeafSchema)));
				assert(!field.is(SchemaBuilder.fieldValue(numberLeafSchema)));
				assert(!field.is(SchemaBuilder.fieldSequence(Any)));
				assert(!field.is(SchemaBuilder.fieldSequence(booleanLeafSchema)));
				assert(!field.is(SchemaBuilder.fieldSequence(numberLeafSchema)));
				assert(
					!field.is(
						SchemaBuilder.fieldRecursive(FieldKinds.value, recursiveStructSchema),
					),
				);
			});

			it("Field schema: Struct", () => {
				// #region Tree and schema initialization

				const builder = new SchemaBuilder("test", undefined, leafDomain.library);
				const booleanLeafSchema = builder.leaf("bool", ValueSchema.Boolean);
				const numberLeafSchema = builder.leaf("number", ValueSchema.Number);
				const structLeafSchema = builder.struct("struct", {
					foo: SchemaBuilder.fieldValue(booleanLeafSchema),
					bar: SchemaBuilder.fieldOptional(numberLeafSchema),
				});
				const recursiveStructSchema = builder.structRecursive("recursiveStruct", {
					flag: SchemaBuilder.fieldValue(booleanLeafSchema),
					child: SchemaBuilder.fieldRecursive(
						FieldKinds.optional,
						() => recursiveStructSchema,
					),
				});
				const rootSchema = SchemaBuilder.fieldOptional(structLeafSchema);
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent({ schema, initialTree: {} });

				// #endregion

				const field = new LazyOptionalField(
					context,
					SchemaBuilder.fieldOptional(structLeafSchema),
					cursor,
					detachedFieldAnchor,
				);

				// Positive cases
				assert(field.is(SchemaBuilder.fieldOptional(structLeafSchema)));

				// Negative cases
				assert(!field.is(SchemaBuilder.fieldValue(Any)));
				assert(!field.is(SchemaBuilder.fieldValue(structLeafSchema)));
				assert(!field.is(SchemaBuilder.fieldValue(booleanLeafSchema)));
				assert(!field.is(SchemaBuilder.fieldSequence(Any)));
				assert(!field.is(SchemaBuilder.fieldSequence(structLeafSchema)));
				assert(!field.is(SchemaBuilder.fieldSequence(booleanLeafSchema)));
				assert(
					!field.is(
						SchemaBuilder.fieldRecursive(FieldKinds.value, recursiveStructSchema),
					),
				);
			});

			// TODO: Fluid Handle test
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

			it("Struct field", () => {
				const builder = new SchemaBuilder("test", undefined, leafDomain.library);
				const leafSchema = builder.struct("struct", {
					foo: SchemaBuilder.fieldValue(leafDomain.boolean),
					bar: SchemaBuilder.fieldOptional(leafDomain.number),
				});
				const rootSchema = SchemaBuilder.fieldOptional(leafSchema);
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent({
					schema,
					initialTree: {
						foo: true,
						bar: 42,
					},
				});

				const field = new LazyOptionalField(
					context,
					SchemaBuilder.fieldOptional(leafSchema),
					cursor,
					rootFieldAnchor,
				);

				const mapResult = field.map((value) => value);

				assert.equal(mapResult.length, 1);
				assert.equal(mapResult[0].foo, true);
				assert.equal(mapResult[0].bar, 42);
			});
		});

		describe("mapBoxed", () => {
			it("No value", () => {
				const field = createOptionalLeafTree(ValueSchema.String, undefined);

				const mapResult = field.mapBoxed((value) => value);
				assert.deepEqual(mapResult, []);
			});

			it("Primitive field", () => {
				const field = createOptionalLeafTree(ValueSchema.Number, 42);

				const mapResult = field.mapBoxed((value) => value);
				assert.equal(mapResult.length, 1);
				assert.equal(mapResult[0].value, 42);
			});

			it("Struct field", () => {
				const builder = new SchemaBuilder("test", undefined, leafDomain.library);
				const leafSchema = builder.struct("struct", {
					foo: SchemaBuilder.fieldValue(leafDomain.boolean),
					bar: SchemaBuilder.fieldOptional(leafDomain.number),
				});
				const rootSchema = SchemaBuilder.fieldOptional(leafSchema);
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent({
					schema,
					initialTree: {
						foo: false,
						bar: 42,
					},
				});

				const field = new LazyOptionalField(
					context,
					SchemaBuilder.fieldOptional(leafSchema),
					cursor,
					rootFieldAnchor,
				);

				const mapResult = field.mapBoxed((value) => value);

				assert.equal(mapResult.length, 1);
				assert.equal(mapResult[0].foo, false);
				assert.equal(mapResult[0].bar, 42);
			});
		});
	});

	describe("LazyValueField", () => {
		describe("is", () => {
			it("Field schema: Any", () => {
				// #region Tree and schema initialization

				const builder = new SchemaBuilder("test", undefined, leafDomain.library);
				const recursiveStructSchema = builder.structRecursive("recursiveStruct", {
					flag: SchemaBuilder.fieldValue(leafDomain.boolean),
					child: SchemaBuilder.fieldRecursive(
						FieldKinds.optional,
						() => recursiveStructSchema,
					),
				});
				const rootSchema = SchemaBuilder.fieldValue(leafDomain.boolean);
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent({
					schema,
					initialTree: true,
				});

				// #endregion

				const field = new LazyValueField(
					context,
					SchemaBuilder.fieldValue(Any),
					cursor,
					detachedFieldAnchor,
				);

				// Positive cases
				assert(field.is(SchemaBuilder.fieldValue(Any)));

				// Negative cases
				assert(!field.is(SchemaBuilder.fieldOptional()));
				assert(!field.is(SchemaBuilder.fieldOptional(leafDomain.boolean)));
				assert(!field.is(SchemaBuilder.fieldSequence(Any)));
				assert(
					!field.is(
						SchemaBuilder.fieldRecursive(FieldKinds.value, recursiveStructSchema),
					),
				);
				assert(!field.is(SchemaBuilder.fieldOptional(Any)));
			});

			it("Field schema: Primitive", () => {
				// #region Tree and schema initialization

				const builder = new SchemaBuilder("test", undefined, leafDomain.library);
				const recursiveStructSchema = builder.structRecursive("recursiveStruct", {
					flag: SchemaBuilder.fieldValue(leafDomain.boolean),
					child: SchemaBuilder.fieldRecursive(
						FieldKinds.optional,
						() => recursiveStructSchema,
					),
				});
				const rootSchema = SchemaBuilder.fieldValue(leafDomain.boolean);
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent({
					schema,
					initialTree: false,
				});

				// #endregion

				const field = new LazyValueField(context, rootSchema, cursor, detachedFieldAnchor);

				// Positive cases
				assert(field.is(SchemaBuilder.fieldValue(leafDomain.boolean)));

				// Negative cases
				assert(!field.is(SchemaBuilder.fieldValue(Any)));
				assert(!field.is(SchemaBuilder.fieldOptional(Any)));
				assert(!field.is(SchemaBuilder.fieldOptional(leafDomain.number)));
				assert(!field.is(SchemaBuilder.fieldSequence(Any)));
				assert(!field.is(SchemaBuilder.fieldSequence(leafDomain.boolean)));
				assert(!field.is(SchemaBuilder.fieldSequence(leafDomain.number)));
				assert(
					field.is(SchemaBuilder.fieldRecursive(FieldKinds.value, recursiveStructSchema)),
				); // TODO: this is wrong
				assert(!field.is(SchemaBuilder.fieldOptional(leafDomain.boolean)));
			});

			it("Field schema: Struct", () => {
				// #region Tree and schema initialization

				const builder = new SchemaBuilder("test", undefined, leafDomain.library);
				const structLeafSchema = builder.struct("struct", {
					foo: SchemaBuilder.fieldValue(leafDomain.boolean),
					bar: SchemaBuilder.fieldOptional(leafDomain.number),
				});
				const recursiveStructSchema = builder.structRecursive("recursiveStruct", {
					flag: SchemaBuilder.fieldValue(leafDomain.boolean),
					child: SchemaBuilder.fieldRecursive(
						FieldKinds.optional,
						() => recursiveStructSchema,
					),
				});
				const rootSchema = SchemaBuilder.fieldValue(structLeafSchema);
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent({
					schema,
					initialTree: {
						foo: false,
					},
				});

				// #endregion

				const field = new LazyValueField(context, rootSchema, cursor, detachedFieldAnchor);

				// Positive cases
				assert(field.is(SchemaBuilder.fieldValue(structLeafSchema)));

				// Negative cases
				assert(field.is(SchemaBuilder.fieldValue(leafDomain.boolean))); // TODO: this is wrong
				assert(!field.is(SchemaBuilder.fieldSequence(Any)));
				assert(!field.is(SchemaBuilder.fieldSequence(structLeafSchema)));
				assert(!field.is(SchemaBuilder.fieldSequence(leafDomain.boolean)));
				assert(
					field.is(SchemaBuilder.fieldRecursive(FieldKinds.value, recursiveStructSchema)),
				); // TODO: this is wrong
				assert(!field.is(SchemaBuilder.fieldOptional(structLeafSchema)));
			});

			// TODO: Fluid Handle test
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

		describe("map", () => {
			it("Primitive field", () => {
				const field = createValueLeafTree(ValueSchema.String, "Hello world");

				assert.deepEqual(
					field.map((value) => value),
					["Hello world"],
				);
			});

			it("Struct field", () => {
				const builder = new SchemaBuilder("test", undefined, leafDomain.library);
				const leafSchema = builder.struct("struct", {
					foo: SchemaBuilder.fieldValue(leafDomain.boolean),
					bar: SchemaBuilder.fieldOptional(leafDomain.number),
				});
				const rootSchema = SchemaBuilder.fieldValue(leafSchema);
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent({
					schema,
					initialTree: {
						foo: true,
						bar: 42,
					},
				});

				const field = new LazyValueField(context, rootSchema, cursor, rootFieldAnchor);

				const mapResult = field.map((value) => value);

				assert.equal(mapResult.length, 1);
				assert.equal(mapResult[0].foo, true);
				assert.equal(mapResult[0].bar, 42);
			});
		});

		describe("mapBoxed", () => {
			it("Primitive field", () => {
				const field = createValueLeafTree(ValueSchema.Number, 42);

				const mapResult = field.mapBoxed((value) => value);
				assert.equal(mapResult.length, 1);
				assert.equal(mapResult[0].value, 42);
			});

			it("Struct field", () => {
				const builder = new SchemaBuilder("test", undefined, leafDomain.library);
				const leafSchema = builder.struct("struct", {
					foo: SchemaBuilder.fieldValue(leafDomain.boolean),
					bar: SchemaBuilder.fieldOptional(leafDomain.number),
				});
				const rootSchema = SchemaBuilder.fieldValue(leafSchema);
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent({
					schema,
					initialTree: {
						foo: false,
						bar: 42,
					},
				});

				const field = new LazyValueField(context, rootSchema, cursor, rootFieldAnchor);

				const mapResult = field.mapBoxed((value) => value);

				assert.equal(mapResult.length, 1);
				assert.equal(mapResult[0].foo, false);
				assert.equal(mapResult[0].bar, 42);
			});
		});
	});
});
