/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */

import { strict as assert } from "node:assert";

import {
	FieldAnchor,
	ITreeCursorSynchronous,
	ITreeSubscriptionCursor,
	TreeNavigationResult,
	ValueSchema,
	rootFieldKey,
} from "../../../core";
import {
	AllowedTypes,
	Any,
	FieldKind,
	FieldKinds,
	FieldSchema,
	Optional,
	SchemaAware,
	SchemaBuilder,
	TreeSchema,
	TypedSchemaCollection,
} from "../../../feature-libraries";
import { Context } from "../../../feature-libraries/editable-tree-2/context";
import { unboxedField, unboxedTree } from "../../../feature-libraries/editable-tree-2/unboxed";
import { brand } from "../../../util";
import { contextWithContentReadonly } from "./utils";

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
	schema: TypedSchemaCollection,
	initialTree?:
		| SchemaAware.TypedField<FieldSchema, SchemaAware.ApiMode.Flexible>
		| readonly ITreeCursorSynchronous[]
		| ITreeCursorSynchronous,
): {
	context: Context;
	cursor: ITreeSubscriptionCursor;
} {
	const context = contextWithContentReadonly({ schema, initialTree });
	const cursor = initializeCursor(context, rootFieldAnchor);

	return {
		context,
		cursor,
	};
}

/**
 * Creates a tree whose root node contains a single (optional) leaf field.
 * Also initializes a cursor and moves that cursor to the tree's root field.
 *
 * @returns The initialized tree, cursor, and associated context.
 */
function createOptionalLeafTree(
	kind: ValueSchema,
	initialTree:
		| SchemaAware.TypedField<FieldSchema, SchemaAware.ApiMode.Flexible>
		| readonly ITreeCursorSynchronous[]
		| ITreeCursorSynchronous,
): {
	treeSchema: FieldSchema<Optional, [TreeSchema<"leaf">]>;
	context: Context;
	cursor: ITreeSubscriptionCursor;
} {
	const builder = new SchemaBuilder("test");
	const leafSchema = builder.leaf("leaf", kind);
	const rootSchema = SchemaBuilder.fieldOptional(leafSchema);
	const schema = builder.intoDocumentSchema(rootSchema);

	const { context, cursor } = initializeTreeWithContent(schema, initialTree);

	return {
		treeSchema: rootSchema,
		context,
		cursor,
	};
}

describe.only("unboxed unit tests", () => {
	describe("unboxedField", () => {
		describe("Optional", () => {
			it("No value", () => {
				const { treeSchema, context, cursor } = createOptionalLeafTree(
					ValueSchema.Number,
					undefined,
				);
				assert.equal(unboxedField(context, treeSchema, cursor), undefined);
			});

			it("Boolean", () => {
				const { treeSchema, context, cursor } = createOptionalLeafTree(
					ValueSchema.Boolean,
					true,
				);
				assert.equal(unboxedField(context, treeSchema, cursor), true);
			});

			it("Number", () => {
				const { treeSchema, context, cursor } = createOptionalLeafTree(
					ValueSchema.Number,
					42,
				);
				assert.equal(unboxedField(context, treeSchema, cursor), 42);
			});

			it("String", () => {
				const { treeSchema, context, cursor } = createOptionalLeafTree(
					ValueSchema.String,
					"Hello world",
				);
				assert.equal(unboxedField(context, treeSchema, cursor), "Hello world");
			});

			// TODO: Fluid Handle

			it("Struct", () => {
				const builder = new SchemaBuilder("test");
				const stringLeafSchema = builder.leaf("string", ValueSchema.String);
				const booleanLeafSchema = builder.leaf("boolean", ValueSchema.Boolean);
				const structSchema = builder.struct("struct", {
					foo: SchemaBuilder.fieldValue(stringLeafSchema),
					bar: SchemaBuilder.fieldSequence(booleanLeafSchema),
				});
				const rootSchema = SchemaBuilder.fieldOptional(structSchema);
				const schema = builder.intoDocumentSchema(rootSchema);

				const initialTree = {
					foo: "Hello world",
					bar: [true, false, true],
				};

				const { context, cursor } = initializeTreeWithContent(schema, initialTree);

				const unboxed = unboxedField(context, rootSchema, cursor);

				assert(unboxed !== undefined);
				assert.equal(unboxed.foo, "Hello world");
				assert.equal(unboxed.bar.length, 3);
				assert.equal(unboxed.bar.at(0), true);
				assert.equal(unboxed.bar.at(1), false);
				assert.equal(unboxed.bar.at(2), true);
			});

			it("Recursive struct", () => {
				const builder = new SchemaBuilder("test");
				const stringLeafSchema = builder.leaf("string", ValueSchema.String);
				const structSchema = builder.structRecursive("struct", {
					name: SchemaBuilder.fieldValue(stringLeafSchema),
					child: SchemaBuilder.fieldRecursive(FieldKinds.optional, () => structSchema),
				});
				const rootSchema = SchemaBuilder.fieldOptional(structSchema);
				const schema = builder.intoDocumentSchema(rootSchema);

				const initialTree = {
					name: "Foo",
					child: {
						name: "Bar",
						child: undefined,
					},
				};

				const { context, cursor } = initializeTreeWithContent(schema, initialTree);

				const unboxed = unboxedField(context, rootSchema, cursor);

				assert(unboxed !== undefined);
				assert.equal(unboxed.name, "Foo");
				assert(unboxed.child !== undefined);
				assert.equal(unboxed.child.name, "Bar");
				assert.equal(unboxed.child.child, undefined);
			});

			it("Union", () => {
				const builder = new SchemaBuilder("test");
				const stringLeafSchema = builder.leaf("string", ValueSchema.String);
				const booleanLeafSchema = builder.leaf("boolean", ValueSchema.Boolean);
				const rootSchema = SchemaBuilder.fieldOptional(stringLeafSchema, booleanLeafSchema);
				const schema = builder.intoDocumentSchema(rootSchema);

				const initialTree = true;

				const { context, cursor } = initializeTreeWithContent(schema, initialTree);

				const unboxed = unboxedField(context, rootSchema, cursor);

				assert(unboxed !== undefined);
				assert.equal(unboxed.type, "boolean");
				assert.equal(unboxed.value, true);
			});
		});
	});

	describe("unboxedTree", () => {
		describe("Struct", () => {
			it("Simple", () => {
				const builder = new SchemaBuilder("test");
				const stringLeafSchema = builder.leaf("string", ValueSchema.String);
				const structSchema = builder.struct("struct", {
					foo: SchemaBuilder.fieldValue(stringLeafSchema),
				});
				const rootSchema = SchemaBuilder.fieldOptional(structSchema);
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent(schema, {
					foo: "Hello world",
				});
				cursor.firstNode(); // Root node field has 1 node; move into it

				const unboxed = unboxedTree(context, structSchema, cursor);
				assert.equal(unboxed.foo, "Hello world");
			});

			it("Property schema: Any", () => {
				const builder = new SchemaBuilder("test");
				builder.leaf("string", ValueSchema.String);
				const structSchema = builder.struct("struct", {
					foo: SchemaBuilder.fieldValue(Any),
				});
				const rootSchema = SchemaBuilder.fieldOptional(structSchema);
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent(schema, {
					foo: "Hello world",
				});
				cursor.firstNode(); // Root node field has 1 node; move into it

				const unboxed = unboxedTree(context, structSchema, cursor);
				assert.equal(unboxed.foo.type, "string");
				assert.equal(unboxed.foo.value, "Hello world");
			});

			it("Recursive", () => {
				const builder = new SchemaBuilder("test");
				const stringLeafSchema = builder.leaf("string", ValueSchema.String);
				const structSchema = builder.structRecursive("struct", {
					name: SchemaBuilder.fieldValue(stringLeafSchema),
					child: SchemaBuilder.fieldRecursive(FieldKinds.optional, () => structSchema),
				});
				const rootSchema = SchemaBuilder.fieldOptional(structSchema);
				const schema = builder.intoDocumentSchema(rootSchema);

				const initialTree = {
					name: "Foo",
					child: {
						name: "Bar",
						child: undefined,
					},
				};

				const { context, cursor } = initializeTreeWithContent(schema, initialTree);
				cursor.firstNode(); // Root node field has 1 node; move into it

				const unboxed = unboxedTree(context, structSchema, cursor);

				assert.equal(unboxed.name, "Foo");
				assert(unboxed.child !== undefined);
				assert.equal(unboxed.child.name, "Bar");
				assert.equal(unboxed.child.child, undefined);
			});
		});

		describe("Map", () => {
			it("Empty", () => {
				const builder = new SchemaBuilder("test");
				const mapSchema = builder.map("map", SchemaBuilder.fieldOptional(Any));
				const rootSchema = SchemaBuilder.fieldOptional(mapSchema);
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent(schema, {});
				cursor.firstNode(); // Root node field has 1 node; move into it

				const unboxed = unboxedTree(context, mapSchema, cursor);
				assert.equal(unboxed.size, 0);
			});

			it("Single type", () => {
				const builder = new SchemaBuilder("test");
				const stringLeafSchema = builder.leaf("string", ValueSchema.String);
				const mapSchema = builder.map("map", SchemaBuilder.fieldOptional(stringLeafSchema));
				const rootSchema = SchemaBuilder.fieldOptional(mapSchema);
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent(schema, {
					foo: "Hello",
					bar: "world",
				});
				cursor.firstNode(); // Root node field has 1 node; move into it

				const unboxed = unboxedTree(context, mapSchema, cursor);
				assert.equal(unboxed.size, 2);
				assert.equal(unboxed.get(brand("foo")), "Hello");
				assert.equal(unboxed.get(brand("bar")), "world");
			});

			it("Any type", () => {
				const builder = new SchemaBuilder("test");
				builder.leaf("string", ValueSchema.String);
				const mapSchema = builder.map("map", SchemaBuilder.fieldOptional(Any));
				const rootSchema = SchemaBuilder.fieldOptional(mapSchema);
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent(schema, {
					foo: "Hello",
					bar: "world",
				});
				cursor.firstNode(); // Root node field has 1 node; move into it

				const unboxed = unboxedTree(context, mapSchema, cursor);
				assert.equal(unboxed.size, 2);

				const foo = unboxed.get(brand("foo"));
				assert(foo !== undefined);
				assert.equal(foo.type, "string");
				assert.equal(foo.value, "Hello");

				const bar = unboxed.get(brand("bar"));
				assert(bar !== undefined);
				assert.equal(bar.type, "string");
				assert.equal(bar.value, "world");
			});

			it("Union type", () => {
				const builder = new SchemaBuilder("test");
				const stringLeafSchema = builder.leaf("string", ValueSchema.String);
				const booleanLeafSchema = builder.leaf("boolean", ValueSchema.Boolean);
				const mapSchema = builder.map(
					"map",
					SchemaBuilder.fieldOptional(stringLeafSchema, booleanLeafSchema),
				);
				const rootSchema = SchemaBuilder.fieldOptional(mapSchema);
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent(schema, {
					foo: "Hello world",
					bar: true,
				});
				cursor.firstNode(); // Root node field has 1 node; move into it

				const unboxed = unboxedTree(context, mapSchema, cursor);
				assert.equal(unboxed.size, 2);

				const foo = unboxed.get(brand("foo"));
				assert(foo !== undefined);
				assert.equal(foo.type, "string");
				assert.equal(foo.value, "Hello world");

				const bar = unboxed.get(brand("bar"));
				assert(bar !== undefined);
				assert.equal(bar.type, "boolean");
				assert.equal(bar.value, true);
			});

			// it("Recursive", () => {
			// 	const builder = new SchemaBuilder("test");
			// 	const stringLeafSchema = builder.leaf("string", ValueSchema.String);
			// 	const booleanLeafSchema = builder.leaf("boolean", ValueSchema.Boolean);
			// 	const mapSchema = builder.mapRecursive(
			// 		"map",
			// 		SchemaBuilder.fieldRecursive(FieldKinds.optional, [
			// 			stringLeafSchema,
			// 			booleanLeafSchema,
			// 			() => mapSchema,
			// 		]),
			// 	);
			// 	const rootSchema = SchemaBuilder.fieldOptional(mapSchema);
			// 	const schema = builder.intoDocumentSchema(rootSchema);

			// 	const { context, cursor } = initializeTreeWithContent(schema, {
			// 		foo: "Hello world",
			// 		bar: true,
			// 	});
			// cursor.firstNode(); // Root node field has 1 node; move into it

			// 	const unboxed = unboxedTree(context, mapSchema, cursor);
			// 	assert.equal(unboxed.size, 2);
			// 	assert.equal(unboxed.get(brand("foo")), "Hello world");
			// 	assert.equal(unboxed.get(brand("bar")), true);
			// });
		});
	});
	describe("unboxedUnion", () => {
		// TODO
	});
});
