/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */

import { strict as assert } from "node:assert";

import {
	type FieldAnchor,
	type ITreeSubscriptionCursor,
	TreeNavigationResult,
	rootFieldKey,
} from "../../../core/index.js";
import {
	SchemaBuilder,
	leaf,
	leaf as leafDomain,
	singleJsonCursor,
	typedJsonCursor,
} from "../../../domains/index.js";
import type { Context } from "../../../feature-libraries/flex-tree/context.js";
import {
	unboxedField,
	unboxedTree,
	unboxedUnion,
} from "../../../feature-libraries/flex-tree/unboxed.js";
import {
	Any,
	FieldKinds,
	type FlexAllowedTypes,
	type FlexFieldKind,
	FlexFieldSchema,
} from "../../../feature-libraries/index.js";
import type { TreeContent } from "../../../shared-tree/index.js";

import { contextWithContentReadonly } from "./utils.js";

const rootFieldAnchor: FieldAnchor = { parent: undefined, fieldKey: rootFieldKey };

/**
 * Creates a cursor from the provided `context` and moves it to the provided `anchor`.
 */
function initializeCursor(context: Context, anchor: FieldAnchor): ITreeSubscriptionCursor {
	const cursor = context.checkout.forest.allocateCursor();

	assert.equal(
		context.checkout.forest.tryMoveCursorToField(anchor, cursor),
		TreeNavigationResult.Ok,
	);
	return cursor;
}

/**
 * Initializes a test tree, context, and cursor, and moves the cursor to the tree's root.
 *
 * @returns The initialized context and cursor.
 */
function initializeTreeWithContent<Kind extends FlexFieldKind, Types extends FlexAllowedTypes>(
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
			const builder = new SchemaBuilder({ scope: "test" });
			const fieldSchema = SchemaBuilder.optional(leafDomain.number);
			const schema = builder.intoSchema(fieldSchema);

			const { context, cursor } = initializeTreeWithContent({
				schema,
				initialTree: undefined,
			});

			assert.equal(unboxedField(context, fieldSchema, cursor), undefined);
		});

		it("With value (leaf)", () => {
			const builder = new SchemaBuilder({ scope: "test" });
			const fieldSchema = SchemaBuilder.optional(leafDomain.number);
			const schema = builder.intoSchema(fieldSchema);

			const { context, cursor } = initializeTreeWithContent({
				schema,
				initialTree: singleJsonCursor(42),
			});

			assert.equal(unboxedField(context, fieldSchema, cursor), 42);
		});
	});

	it("Required field (object)", () => {
		const builder = new SchemaBuilder({ scope: "test" });
		const objectSchema = builder.objectRecursive("object", {
			name: SchemaBuilder.required(leafDomain.string),
			child: FlexFieldSchema.createUnsafe(FieldKinds.optional, [() => objectSchema]),
		});
		const fieldSchema = SchemaBuilder.optional(objectSchema);
		const schema = builder.intoSchema(fieldSchema);

		const initialTree = typedJsonCursor({
			[typedJsonCursor.type]: objectSchema,
			name: "Foo",
			child: {
				[typedJsonCursor.type]: objectSchema,
				name: "Bar",
			},
		});

		const { context, cursor } = initializeTreeWithContent({ schema, initialTree });

		const unboxed = unboxedField(context, fieldSchema, cursor);
		assert(unboxed !== undefined);
		assert.equal(unboxed.schema, objectSchema);
		assert.equal(unboxed.name, "Foo");

		const unboxedChild = unboxed.child;
		assert(unboxedChild !== undefined);
		assert.equal(unboxedChild.schema, objectSchema);
		assert.equal(unboxedChild.name, "Bar");
		assert.equal(unboxedChild.child, undefined);
	});

	it("Sequence field", () => {
		const builder = new SchemaBuilder({ scope: "test" });
		const fieldSchema = SchemaBuilder.sequence(leafDomain.string);
		const schema = builder.intoSchema(fieldSchema);

		const { context, cursor } = initializeTreeWithContent({
			schema,
			initialTree: ["Hello", "world"].map((c) => singleJsonCursor(c)),
		});

		const unboxed = unboxedField(context, fieldSchema, cursor);

		assert.deepEqual([...unboxed], ["Hello", "world"]);
	});

	it("Schema: Any", () => {
		const builder = new SchemaBuilder({ scope: "test" });
		const fieldSchema = SchemaBuilder.optional(Any);
		const schema = builder.intoSchema(fieldSchema);

		const { context, cursor } = initializeTreeWithContent({
			schema,
			initialTree: singleJsonCursor(42),
		});

		// Type is not known based on schema, so node will not be unboxed.
		const unboxed = unboxedField(context, fieldSchema, cursor);
		assert(unboxed !== undefined);
		assert.equal(unboxed.schema, leaf.number);
		assert.equal(unboxed.value, 42);
	});
});

describe("unboxedTree", () => {
	it("Leaf", () => {
		const builder = new SchemaBuilder({ scope: "test" });
		const schema = builder.intoSchema(leafDomain.string);

		const { context, cursor } = initializeTreeWithContent({
			schema,
			initialTree: singleJsonCursor("Hello world"),
		});
		cursor.enterNode(0); // Root node field has 1 node; move into it

		assert.equal(unboxedTree(context, leafDomain.string, cursor), "Hello world");
	});

	it("ObjectNode", () => {
		const builder = new SchemaBuilder({ scope: "test" });
		const objectSchema = builder.objectRecursive("object", {
			name: SchemaBuilder.required(leafDomain.string),
			child: FlexFieldSchema.createUnsafe(FieldKinds.optional, [() => objectSchema]),
		});
		const rootSchema = builder.optional(objectSchema);
		const schema = builder.intoSchema(rootSchema);

		const initialTree = typedJsonCursor({
			[typedJsonCursor.type]: objectSchema,
			name: "Foo",
			child: {
				[typedJsonCursor.type]: objectSchema,
				name: "Bar",
			},
		});

		const { context, cursor } = initializeTreeWithContent({ schema, initialTree });
		cursor.enterNode(0); // Root node field has 1 node; move into it

		const unboxed = unboxedTree(context, objectSchema, cursor);

		assert.equal(unboxed.name, "Foo");
		assert(unboxed.child !== undefined);
		assert.equal(unboxed.child.name, "Bar");
		assert.equal(unboxed.child.child, undefined);
	});
});

describe("unboxedUnion", () => {
	it("Any", () => {
		const builder = new SchemaBuilder({ scope: "test" });
		const fieldSchema = SchemaBuilder.optional(Any);
		const schema = builder.intoSchema(fieldSchema);

		const { context, cursor } = initializeTreeWithContent({
			schema,
			initialTree: singleJsonCursor(42),
		});
		cursor.enterNode(0); // Root node field has 1 node; move into it

		// Type is not known based on schema, so node will not be unboxed.
		const unboxed = unboxedUnion(context, fieldSchema, cursor);
		assert.equal(unboxed.schema, leaf.number);
		assert.equal(unboxed.value, 42);
	});

	it("Single type", () => {
		const builder = new SchemaBuilder({ scope: "test" });
		const fieldSchema = SchemaBuilder.required(leafDomain.boolean);
		const schema = builder.intoSchema(fieldSchema);

		const { context, cursor } = initializeTreeWithContent({
			schema,
			initialTree: singleJsonCursor(false),
		});
		cursor.enterNode(0); // Root node field has 1 node; move into it

		assert.equal(unboxedUnion(context, fieldSchema, cursor), false);
	});

	it("Multi-type", () => {
		const builder = new SchemaBuilder({ scope: "test" });
		const fieldSchema = SchemaBuilder.optional([leafDomain.string, leafDomain.handle]);
		const schema = builder.intoSchema(fieldSchema);

		const { context, cursor } = initializeTreeWithContent({
			schema,
			initialTree: singleJsonCursor("Hello world"),
		});
		cursor.enterNode(0); // Root node field has 1 node; move into it

		// Type is not known based on schema, so node will not be unboxed.
		const unboxed = unboxedUnion(context, fieldSchema, cursor);
		assert.equal(unboxed.schema, leaf.string);
		assert.equal(unboxed.value, "Hello world");
	});
});
