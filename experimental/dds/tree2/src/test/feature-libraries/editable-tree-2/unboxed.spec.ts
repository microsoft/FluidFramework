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
import { unboxedField } from "../../../feature-libraries/editable-tree-2/unboxed";
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
 * Creates a tree whose root node contains a single leaf field.
 * Also initializes a cursor and moves that cursor to the tree's root.
 *
 * @returns The initialized tree, cursor, and associated context.
 */
function createLeafTree(
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

describe("unboxed unit tests", () => {
	describe("unboxedField", () => {
		describe("Optional", () => {
			it("No value", () => {
				const { treeSchema, context, cursor } = createLeafTree(
					ValueSchema.Number,
					undefined,
				);
				assert.equal(unboxedField(context, treeSchema, cursor), undefined);
			});

			it("Boolean", () => {
				const { treeSchema, context, cursor } = createLeafTree(ValueSchema.Boolean, true);
				assert.equal(unboxedField(context, treeSchema, cursor), true);
			});

			it("Number", () => {
				const { treeSchema, context, cursor } = createLeafTree(ValueSchema.Number, 42);
				assert.equal(unboxedField(context, treeSchema, cursor), 42);
			});

			it("String", () => {
				const { treeSchema, context, cursor } = createLeafTree(
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

				const result = unboxedField(context, rootSchema, cursor);

				assert(result !== undefined);
				assert.equal(result.foo, "Hello world");
				assert.equal(result.bar.length, 3);
				assert.equal(result.bar.at(0), true);
				assert.equal(result.bar.at(1), false);
				assert.equal(result.bar.at(2), true);
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

				const result = unboxedField(context, rootSchema, cursor);

				assert(result !== undefined);
				assert.equal(result.name, "Foo");
				assert(result.child !== undefined);
				assert.equal(result.child.name, "Bar");
				assert.equal(result.child.child, undefined);
			});

			it("Union", () => {
				const builder = new SchemaBuilder("test");
				const stringLeafSchema = builder.leaf("string", ValueSchema.String);
				const booleanLeafSchema = builder.leaf("boolean", ValueSchema.Boolean);
				const rootSchema = SchemaBuilder.fieldOptional(stringLeafSchema, booleanLeafSchema);
				const schema = builder.intoDocumentSchema(rootSchema);

				const initialTree = true;

				const { context, cursor } = initializeTreeWithContent(schema, initialTree);

				const result = unboxedField(context, rootSchema, cursor);

				assert(result !== undefined);
				assert.equal(result.type, "boolean");
				assert.equal(result.value, true);
			});
		});
	});

	describe("unboxedTree", () => {
		// TODO
	});
	describe("unboxedUnion", () => {
		// TODO
	});
});
