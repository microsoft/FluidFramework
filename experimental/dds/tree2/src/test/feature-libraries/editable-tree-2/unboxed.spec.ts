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
	Sequence,
	TreeSchema,
	TypedSchemaCollection,
	ValueFieldKind,
} from "../../../feature-libraries";
import { Context } from "../../../feature-libraries/editable-tree-2/context";
import {
	unboxedField,
	unboxedTree,
	unboxedUnion,
} from "../../../feature-libraries/editable-tree-2/unboxed";
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
	fieldSchema: FieldSchema<Optional, [TreeSchema<"leaf">]>;
	context: Context;
	cursor: ITreeSubscriptionCursor;
} {
	const builder = new SchemaBuilder("test");
	const leafSchema = builder.leaf("leaf", kind);
	const rootSchema = SchemaBuilder.fieldOptional(leafSchema);
	const schema = builder.intoDocumentSchema(rootSchema);

	const { context, cursor } = initializeTreeWithContent(schema, initialTree);

	return {
		fieldSchema: rootSchema,
		context,
		cursor,
	};
}

/**
 * Creates a tree whose root node contains a single (value) leaf field.
 * Also initializes a cursor and moves that cursor to the tree's root field.
 *
 * @returns The initialized tree, cursor, and associated context.
 */
function createValueLeafTree(
	kind: ValueSchema,
	initialTree:
		| SchemaAware.TypedField<FieldSchema, SchemaAware.ApiMode.Flexible>
		| readonly ITreeCursorSynchronous[]
		| ITreeCursorSynchronous,
): {
	fieldSchema: FieldSchema<ValueFieldKind, [TreeSchema<"leaf">]>;
	context: Context;
	cursor: ITreeSubscriptionCursor;
} {
	const builder = new SchemaBuilder("test");
	const leafSchema = builder.leaf("leaf", kind);
	const rootSchema = SchemaBuilder.field(FieldKinds.value, leafSchema);
	const schema = builder.intoDocumentSchema(rootSchema);

	const { context, cursor } = initializeTreeWithContent(schema, initialTree);

	return {
		fieldSchema: rootSchema,
		context,
		cursor,
	};
}

/**
 * Creates a tree whose root node contains a single (sequence) leaf field.
 * Also initializes a cursor and moves that cursor to the tree's root field.
 *
 * @returns The initialized tree, cursor, and associated context.
 */
function createSequenceLeafTree(
	kind: ValueSchema,
	initialTree:
		| SchemaAware.TypedField<FieldSchema, SchemaAware.ApiMode.Flexible>
		| readonly ITreeCursorSynchronous[]
		| ITreeCursorSynchronous,
): {
	fieldSchema: FieldSchema<Sequence, [TreeSchema<"leaf">]>;
	context: Context;
	cursor: ITreeSubscriptionCursor;
} {
	const builder = new SchemaBuilder("test");
	const leafSchema = builder.leaf("leaf", kind);
	const rootSchema = SchemaBuilder.fieldSequence(leafSchema);
	const schema = builder.intoDocumentSchema(rootSchema);

	const { context, cursor } = initializeTreeWithContent(schema, initialTree);

	return {
		fieldSchema: rootSchema,
		context,
		cursor,
	};
}

describe("unboxed unit tests", () => {
	describe("unboxedField", () => {
		describe("Optional field", () => {
			it("No value", () => {
				const { fieldSchema, context, cursor } = createOptionalLeafTree(
					ValueSchema.Number,
					undefined,
				);
				assert.equal(unboxedField(context, fieldSchema, cursor), undefined);
			});

			it("Boolean", () => {
				const { fieldSchema, context, cursor } = createOptionalLeafTree(
					ValueSchema.Boolean,
					true,
				);
				assert.equal(unboxedField(context, fieldSchema, cursor), true);
			});

			it("Number", () => {
				const { fieldSchema, context, cursor } = createOptionalLeafTree(
					ValueSchema.Number,
					42,
				);
				assert.equal(unboxedField(context, fieldSchema, cursor), 42);
			});

			it("String", () => {
				const { fieldSchema, context, cursor } = createOptionalLeafTree(
					ValueSchema.String,
					"Hello world",
				);
				assert.equal(unboxedField(context, fieldSchema, cursor), "Hello world");
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

		describe("Value field", () => {
			it("Boolean", () => {
				const { fieldSchema, context, cursor } = createValueLeafTree(
					ValueSchema.Boolean,
					true,
				);
				assert.equal(unboxedField(context, fieldSchema, cursor), true);
			});

			it("Number", () => {
				const { fieldSchema, context, cursor } = createValueLeafTree(
					ValueSchema.Number,
					42,
				);
				assert.equal(unboxedField(context, fieldSchema, cursor), 42);
			});

			it("String", () => {
				const { fieldSchema, context, cursor } = createValueLeafTree(
					ValueSchema.String,
					"Hello world",
				);
				assert.equal(unboxedField(context, fieldSchema, cursor), "Hello world");
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
				const rootSchema = SchemaBuilder.field(FieldKinds.value, structSchema);
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
				const rootSchema = SchemaBuilder.field(FieldKinds.value, structSchema);
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
				const rootSchema = SchemaBuilder.field(
					FieldKinds.optional,
					stringLeafSchema,
					booleanLeafSchema,
				);
				const schema = builder.intoDocumentSchema(rootSchema);

				const initialTree = true;

				const { context, cursor } = initializeTreeWithContent(schema, initialTree);

				const unboxed = unboxedField(context, rootSchema, cursor);

				// Field type is not known, so node will not be unboxed
				assert(unboxed !== undefined);
				assert.equal(unboxed.type, "boolean");
				assert.equal(unboxed.value, true);
			});
		});

		describe("Sequence field", () => {
			it("Boolean", () => {
				const { fieldSchema, context, cursor } = createSequenceLeafTree(
					ValueSchema.Boolean,
					[true, false, true],
				);

				const unboxed = unboxedField(context, fieldSchema, cursor);
				assert.deepEqual(unboxed.asArray, [true, false, true]);
			});

			it("Number", () => {
				const { fieldSchema, context, cursor } = createSequenceLeafTree(
					ValueSchema.Number,
					[1, 1, 2, 3, 5],
				);

				const unboxed = unboxedField(context, fieldSchema, cursor);

				assert.deepEqual(unboxed.asArray, [1, 1, 2, 3, 5]);
			});

			it("String", () => {
				const { fieldSchema, context, cursor } = createSequenceLeafTree(
					ValueSchema.String,
					["Hello", "world"],
				);

				const unboxed = unboxedField(context, fieldSchema, cursor);

				assert.deepEqual(unboxed.asArray, ["Hello", "world"]);
			});

			// TODO: Fluid Handle

			it("Struct", () => {
				const builder = new SchemaBuilder("test");
				const stringLeafSchema = builder.leaf("string", ValueSchema.String);
				const booleanLeafSchema = builder.leaf("boolean", ValueSchema.Boolean);
				const structSchema = builder.struct("struct", {
					foo: SchemaBuilder.fieldValue(stringLeafSchema),
					bar: SchemaBuilder.fieldOptional(booleanLeafSchema),
				});
				const rootSchema = SchemaBuilder.fieldSequence(structSchema);
				const schema = builder.intoDocumentSchema(rootSchema);

				const initialTree = [
					{
						foo: "Hello",
					},
					{
						foo: "world",
						bar: true,
					},
				];
				const { context, cursor } = initializeTreeWithContent(schema, initialTree);

				const unboxed = unboxedField(context, rootSchema, cursor);

				assert.equal(unboxed.length, 2);

				const item0 = unboxed.at(0);
				assert.equal(item0.foo, "Hello");
				assert.equal(item0.bar, undefined);

				const item1 = unboxed.at(1);
				assert.equal(item1.foo, "world");
				assert.equal(item1.bar, true);
			});

			it("Recursive struct", () => {
				const builder = new SchemaBuilder("test");
				const stringLeafSchema = builder.leaf("string", ValueSchema.String);
				const structSchema = builder.structRecursive("struct", {
					name: SchemaBuilder.fieldValue(stringLeafSchema),
					child: SchemaBuilder.fieldRecursive(FieldKinds.optional, () => structSchema),
				});
				const rootSchema = SchemaBuilder.fieldSequence(structSchema);
				const schema = builder.intoDocumentSchema(rootSchema);

				const initialTree = [
					{
						name: "Foo",
						child: undefined,
					},
					{
						name: "Bar",
						child: {
							name: "Baz",
							child: undefined,
						},
					},
				];
				const { context, cursor } = initializeTreeWithContent(schema, initialTree);

				const unboxed = unboxedField(context, rootSchema, cursor);

				assert(unboxed !== undefined);
				assert.equal(unboxed.length, 2);

				const item0 = unboxed.at(0);
				assert.equal(item0.name, "Foo");
				assert.equal(item0.child, undefined);

				const item1 = unboxed.at(1);
				assert.equal(item1.name, "Bar");
				assert(item1.child !== undefined);
				assert.equal(item1.child.name, "Baz");
				assert.equal(item1.child.child, undefined);
			});

			it("Union", () => {
				const builder = new SchemaBuilder("test");
				const stringLeafSchema = builder.leaf("string", ValueSchema.String);
				const booleanLeafSchema = builder.leaf("boolean", ValueSchema.Boolean);
				const rootSchema = SchemaBuilder.fieldSequence(stringLeafSchema, booleanLeafSchema);
				const schema = builder.intoDocumentSchema(rootSchema);

				const initialTree = ["Hello", true, "world"];
				const { context, cursor } = initializeTreeWithContent(schema, initialTree);

				const unboxed = unboxedField(context, rootSchema, cursor);

				assert.equal(unboxed.length, 3);

				// Field type is not known, so nodes will not be unboxed
				const item0 = unboxed.at(0);
				assert.equal(item0.type, "string");
				assert.equal(item0.value, "Hello");

				const item1 = unboxed.at(1);
				assert.equal(item1.type, "boolean");
				assert.equal(item1.value, true);

				const item2 = unboxed.at(2);
				assert.equal(item2.type, "string");
				assert.equal(item2.value, "world");
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

			it("Recursive", () => {
				const builder = new SchemaBuilder("test");
				const stringLeafSchema = builder.leaf("string", ValueSchema.String);
				const booleanLeafSchema = builder.leaf("boolean", ValueSchema.Boolean);
				const mapSchema = builder.mapRecursive(
					"map",
					SchemaBuilder.fieldRecursive(
						FieldKinds.optional,
						stringLeafSchema,
						booleanLeafSchema,
						() => mapSchema,
					),
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

				// Map value type is not known, so nodes will not be unboxed.
				const fooEntry = unboxed.get(brand("foo"));
				assert(fooEntry !== undefined);
				assert.equal(fooEntry.type, "string");
				assert.equal(fooEntry.value, "Hello world");

				const barEntry = unboxed.get(brand("bar"));
				assert(barEntry !== undefined);
				assert.equal(barEntry.type, "boolean");
				assert.equal(barEntry.value, true);
			});
		});
	});
	describe("unboxedUnion", () => {
		describe("Value field", () => {
			it("Single type", () => {
				const { fieldSchema, context, cursor } = createValueLeafTree(
					ValueSchema.String,
					"Hello world",
				);

				// TODO: if we don't do this, unboxedUnion returns undefined, rather than failing. Expected?
				cursor.firstNode(); // Root node field has 1 node; move into it

				assert.equal(unboxedUnion(context, fieldSchema, cursor), "Hello world");
			});

			it("Union type", () => {
				const builder = new SchemaBuilder("test");
				const stringLeafSchema = builder.leaf("string", ValueSchema.String);
				const fluidHandleLeafSchema = builder.leaf("handle", ValueSchema.FluidHandle);
				const rootSchema = SchemaBuilder.field(
					FieldKinds.value,
					stringLeafSchema,
					fluidHandleLeafSchema,
				);
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent(schema, "Hello world");
				cursor.firstNode(); // Root node field has 1 node; move into it

				const unboxed = unboxedUnion(context, rootSchema, cursor);
				assert.equal(unboxed.type, "string");
				assert.equal(unboxed.value, "Hello world");
			});
		});

		describe("Optional field", () => {
			it("Single type", () => {
				const { fieldSchema, context, cursor } = createOptionalLeafTree(
					ValueSchema.Boolean,
					true,
				);

				// TODO: if we don't do this, unboxedUnion returns undefined, rather than failing. Expected?
				cursor.firstNode(); // Root node field has 1 node; move into it

				assert.equal(unboxedUnion(context, fieldSchema, cursor), true);
			});

			it("Union type", () => {
				const builder = new SchemaBuilder("test");
				const stringLeafSchema = builder.leaf("string", ValueSchema.String);
				const fluidHandleLeafSchema = builder.leaf("handle", ValueSchema.FluidHandle);
				const rootSchema = SchemaBuilder.fieldOptional(
					stringLeafSchema,
					fluidHandleLeafSchema,
				);
				const schema = builder.intoDocumentSchema(rootSchema);

				const { context, cursor } = initializeTreeWithContent(schema, "Hello world");
				cursor.firstNode(); // Root node field has 1 node; move into it

				const unboxed = unboxedUnion(context, rootSchema, cursor);
				assert.equal(unboxed.type, "string");
				assert.equal(unboxed.value, "Hello world");
			});
		});
	});
});
