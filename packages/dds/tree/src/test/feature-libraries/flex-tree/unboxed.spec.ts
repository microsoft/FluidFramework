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
} from "../../../domains/index.js";
import type { Context } from "../../../feature-libraries/flex-tree/context.js";
import { unboxedTree, unboxedUnion } from "../../../feature-libraries/flex-tree/unboxed.js";
import {
	Any,
	type FlexAllowedTypes,
	type FlexFieldKind,
	type FlexTreeNode,
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
		const unboxed = unboxedUnion(context, fieldSchema, cursor) as FlexTreeNode;
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
		const unboxed = unboxedUnion(context, fieldSchema, cursor) as FlexTreeNode;
		assert.equal(unboxed.schema, leaf.string);
		assert.equal(unboxed.value, "Hello world");
	});
});
