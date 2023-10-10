/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */

import { strict as assert } from "node:assert";

import {
	FieldAnchor,
	ITreeSubscriptionCursor,
	TreeNavigationResult,
	rootFieldKey,
} from "../../../core";
import { leaf as leafDomain } from "../../../domains";
import {
	AllowedTypes,
	Any,
	FieldKind,
	FieldKinds,
	FieldSchema,
	SchemaBuilder,
} from "../../../feature-libraries";
import { Context } from "../../../feature-libraries/editable-tree-2/context";
import {
	unboxedField,
	unboxedTree,
	unboxedUnion,
} from "../../../feature-libraries/editable-tree-2/unboxed";
import { type TreeContent } from "../../../shared-tree";
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

describe("unboxedField", () => {
	describe("Optional field", () => {
		it("No value", () => {
			const builder = new SchemaBuilder({ scope: "test", libraries: [leafDomain.library] });
			const fieldSchema = SchemaBuilder.fieldOptional(leafDomain.number);
			const schema = builder.toDocumentSchema(fieldSchema);

			const { context, cursor } = initializeTreeWithContent({
				schema,
				initialTree: undefined,
			});

			assert.equal(unboxedField(context, fieldSchema, cursor), undefined);
		});

		it("With value (leaf)", () => {
			const builder = new SchemaBuilder({ scope: "test", libraries: [leafDomain.library] });
			const fieldSchema = SchemaBuilder.fieldOptional(leafDomain.number);
			const schema = builder.toDocumentSchema(fieldSchema);

			const { context, cursor } = initializeTreeWithContent({
				schema,
				initialTree: 42,
			});

			assert.equal(unboxedField(context, fieldSchema, cursor), 42);
		});
	});

	it("Value field (struct)", () => {
		const builder = new SchemaBuilder({ scope: "test", libraries: [leafDomain.library] });
		const structSchema = builder.structRecursive("struct", {
			name: SchemaBuilder.fieldRequired(leafDomain.string),
			child: FieldSchema.createUnsafe(FieldKinds.optional, [() => structSchema]),
		});
		const fieldSchema = SchemaBuilder.fieldOptional(structSchema);
		const schema = builder.toDocumentSchema(fieldSchema);

		const initialTree = {
			name: "Foo",
			child: {
				name: "Bar",
				child: undefined,
			},
		};

		const { context, cursor } = initializeTreeWithContent({ schema, initialTree });

		const unboxed = unboxedField(context, fieldSchema, cursor);
		assert(unboxed !== undefined);
		assert.equal(unboxed.type, "test.struct");
		assert.equal(unboxed.name, "Foo");

		const unboxedChild = unboxed.child;
		assert(unboxedChild !== undefined);
		assert.equal(unboxedChild.type, "test.struct");
		assert.equal(unboxedChild.name, "Bar");
		assert.equal(unboxedChild.child, undefined);
	});

	it("Sequence field", () => {
		const builder = new SchemaBuilder({ scope: "test", libraries: [leafDomain.library] });
		const fieldSchema = SchemaBuilder.fieldSequence(leafDomain.string);
		const schema = builder.toDocumentSchema(fieldSchema);

		const { context, cursor } = initializeTreeWithContent({
			schema,
			initialTree: ["Hello", "world"],
		});

		const unboxed = unboxedField(context, fieldSchema, cursor);

		assert.deepEqual(unboxed.asArray, ["Hello", "world"]);
	});

	it("Schema: Any", () => {
		const builder = new SchemaBuilder({ scope: "test", libraries: [leafDomain.library] });
		const fieldSchema = SchemaBuilder.fieldOptional(Any);
		const schema = builder.toDocumentSchema(fieldSchema);

		const { context, cursor } = initializeTreeWithContent({ schema, initialTree: 42 });

		// Type is not known based on schema, so node will not be unboxed.
		const unboxed = unboxedField(context, fieldSchema, cursor);
		assert(unboxed !== undefined);
		assert.equal(unboxed.type, "com.fluidframework.leaf.number");
		assert.equal(unboxed.value, 42);
	});
});

describe("unboxedTree", () => {
	it("Leaf", () => {
		const builder = new SchemaBuilder({ scope: "test", libraries: [leafDomain.library] });
		const schema = builder.toDocumentSchema(leafDomain.string);

		const { context, cursor } = initializeTreeWithContent({
			schema,
			initialTree: "Hello world",
		});
		cursor.enterNode(0); // Root node field has 1 node; move into it

		assert.equal(unboxedTree(context, leafDomain.string, cursor), "Hello world");
	});

	it("Map", () => {
		const builder = new SchemaBuilder({ scope: "test", libraries: [leafDomain.library] });
		const mapSchema = builder.map("map", SchemaBuilder.fieldOptional(leafDomain.string));
		const rootSchema = SchemaBuilder.fieldOptional(mapSchema);
		const schema = builder.toDocumentSchema(rootSchema);

		const { context, cursor } = initializeTreeWithContent({
			schema,
			initialTree: {
				foo: "Hello",
				bar: "world",
			},
		});
		cursor.enterNode(0); // Root node field has 1 node; move into it

		const unboxed = unboxedTree(context, mapSchema, cursor);
		assert.equal(unboxed.size, 2);
		assert.equal(unboxed.get("foo"), "Hello");
		assert.equal(unboxed.get("bar"), "world");
	});

	it("Struct", () => {
		const builder = new SchemaBuilder({ scope: "test", libraries: [leafDomain.library] });
		const structSchema = builder.structRecursive("struct", {
			name: SchemaBuilder.fieldRequired(leafDomain.string),
			child: FieldSchema.createUnsafe(FieldKinds.optional, [() => structSchema]),
		});
		const rootSchema = SchemaBuilder.fieldOptional(structSchema);
		const schema = builder.toDocumentSchema(rootSchema);

		const initialTree = {
			name: "Foo",
			child: {
				name: "Bar",
				child: undefined,
			},
		};

		const { context, cursor } = initializeTreeWithContent({ schema, initialTree });
		cursor.enterNode(0); // Root node field has 1 node; move into it

		const unboxed = unboxedTree(context, structSchema, cursor);

		assert.equal(unboxed.name, "Foo");
		assert(unboxed.child !== undefined);
		assert.equal(unboxed.child.name, "Bar");
		assert.equal(unboxed.child.child, undefined);
	});
});

describe("unboxedUnion", () => {
	it("Any", () => {
		const builder = new SchemaBuilder({ scope: "test", libraries: [leafDomain.library] });
		const fieldSchema = SchemaBuilder.fieldOptional(Any);
		const schema = builder.toDocumentSchema(fieldSchema);

		const { context, cursor } = initializeTreeWithContent({ schema, initialTree: 42 });
		cursor.enterNode(0); // Root node field has 1 node; move into it

		// Type is not known based on schema, so node will not be unboxed.
		const unboxed = unboxedUnion(context, fieldSchema, cursor);
		assert.equal(unboxed.type, "com.fluidframework.leaf.number");
		assert.equal(unboxed.value, 42);
	});

	it("Single type", () => {
		const builder = new SchemaBuilder({ scope: "test", libraries: [leafDomain.library] });
		const fieldSchema = SchemaBuilder.fieldRequired(leafDomain.boolean);
		const schema = builder.toDocumentSchema(fieldSchema);

		const { context, cursor } = initializeTreeWithContent({
			schema,
			initialTree: false,
		});
		cursor.enterNode(0); // Root node field has 1 node; move into it

		assert.equal(unboxedUnion(context, fieldSchema, cursor), false);
	});

	it("Multi-type", () => {
		const builder = new SchemaBuilder({ scope: "test", libraries: [leafDomain.library] });
		const fieldSchema = SchemaBuilder.fieldOptional(leafDomain.string, leafDomain.handle);
		const schema = builder.toDocumentSchema(fieldSchema);

		const { context, cursor } = initializeTreeWithContent({
			schema,
			initialTree: "Hello world",
		});
		cursor.enterNode(0); // Root node field has 1 node; move into it

		// Type is not known based on schema, so node will not be unboxed.
		const unboxed = unboxedUnion(context, fieldSchema, cursor);
		assert.equal(unboxed.type, "com.fluidframework.leaf.string");
		assert.equal(unboxed.value, "Hello world");
	});
});
