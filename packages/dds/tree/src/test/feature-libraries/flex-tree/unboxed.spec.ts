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
import { leaf, leaf as leafDomain, singleJsonCursor } from "../../../domains/index.js";
import type { Context } from "../../../feature-libraries/flex-tree/context.js";
import { unboxedTree, unboxedUnion } from "../../../feature-libraries/flex-tree/unboxed.js";
import type {
	FlexAllowedTypes,
	FlexFieldKind,
	FlexTreeNode,
} from "../../../feature-libraries/index.js";
import type { TreeContent } from "../../../shared-tree/index.js";

import { contextWithContentReadonly } from "./utils.js";
import { SchemaFactory, toFlexSchema } from "../../../simple-tree/index.js";
import { stringSchema } from "../../../simple-tree/leafNodeSchema.js";

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
		const schema = toFlexSchema(stringSchema);

		const { context, cursor } = initializeTreeWithContent({
			schema,
			initialTree: singleJsonCursor("Hello world"),
		});
		cursor.enterNode(0); // Root node field has 1 node; move into it

		assert.equal(unboxedTree(context, leafDomain.string, cursor), "Hello world");
	});
});

describe("unboxedUnion", () => {
	it("Single type", () => {
		const builder = new SchemaFactory("test");
		const fieldSchema = builder.required(builder.boolean);
		const schema = toFlexSchema(fieldSchema);

		const { context, cursor } = initializeTreeWithContent({
			schema,
			initialTree: singleJsonCursor(false),
		});
		cursor.enterNode(0); // Root node field has 1 node; move into it

		assert.equal(unboxedUnion(context, schema.rootFieldSchema, cursor), false);
	});

	it("Multi-type", () => {
		const builder = new SchemaFactory("test");
		const fieldSchema = builder.optional([builder.string, builder.handle]);
		const schema = toFlexSchema(fieldSchema);

		const { context, cursor } = initializeTreeWithContent({
			schema,
			initialTree: singleJsonCursor("Hello world"),
		});
		cursor.enterNode(0); // Root node field has 1 node; move into it

		// Type is not known based on schema, so node will not be unboxed.
		const unboxed = unboxedUnion(context, schema.rootFieldSchema, cursor) as FlexTreeNode;
		assert.equal(unboxed.schema, leaf.string);
		assert.equal(unboxed.value, "Hello world");
	});
});
