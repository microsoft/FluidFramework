/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */

import { strict as assert, fail } from "assert";

import {
	type Anchor,
	type AnchorNode,
	EmptyKey,
	type FieldAnchor,
	type FieldKey,
	type ITreeSubscriptionCursor,
	type MapTree,
	TreeNavigationResult,
	rootFieldKey,
} from "../../../core/index.js";
import { leaf as leafDomain, singleJsonCursor } from "../../../domains/index.js";
import type { Context } from "../../../feature-libraries/flex-tree/context.js";
import { LazyTreeNode } from "../../../feature-libraries/flex-tree/lazyNode.js";
import type {
	FlexAllowedTypes,
	FlexFieldKind,
	FlexTreeField,
	FlexTreeNode,
	FlexTreeNodeSchema,
} from "../../../feature-libraries/index.js";
import type { TreeContent } from "../../../shared-tree/index.js";

import { contextWithContentReadonly } from "./utils.js";
import {
	cursorFromInsertable,
	SchemaFactory,
	toFlexSchema,
} from "../../../simple-tree/index.js";
import { getFlexSchema } from "../../../simple-tree/toFlexSchema.js";
import { JsonArray, JsonObject } from "../../utils.js";
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

/**
 * Test {@link LazyTreeNode} implementation.
 */
class TestLazyTree<TSchema extends FlexTreeNodeSchema> extends LazyTreeNode<TSchema> {}

/**
 * Creates an {@link Anchor} and an {@link AnchorNode} for the provided cursor's location.
 */
function createAnchors(
	context: Context,
	cursor: ITreeSubscriptionCursor,
): { anchor: Anchor; anchorNode: AnchorNode } {
	const anchor = context.checkout.forest.anchors.track(cursor.getPath() ?? fail());
	const anchorNode = context.checkout.forest.anchors.locate(anchor) ?? fail();

	return { anchor, anchorNode };
}

describe("LazyNode", () => {
	describe("LazyNode", () => {
		it("is", () => {
			const { context, cursor } = initializeTreeWithContent({
				schema: toFlexSchema(JsonObject),
				initialTree: singleJsonCursor({}),
			});
			cursor.enterNode(0);

			const { anchor, anchorNode } = createAnchors(context, cursor);

			const node = new TestLazyTree(
				context,
				getFlexSchema(JsonObject),
				cursor,
				anchorNode,
				anchor,
			);

			assert(node.is(getFlexSchema(JsonObject)));
			assert(!node.is(getFlexSchema(JsonArray)));
		});

		it("parent", () => {
			const schemaBuilder = new SchemaFactory("test");
			const ParentNode = schemaBuilder.map("map", schemaBuilder.string);

			const { context, cursor } = initializeTreeWithContent({
				schema: toFlexSchema(ParentNode),
				initialTree: cursorFromInsertable(ParentNode, { [EmptyKey]: "test" }),
			});
			cursor.enterNode(0);

			const { anchor, anchorNode } = createAnchors(context, cursor);

			const node = new TestLazyTree(
				context,
				getFlexSchema(ParentNode),
				cursor,
				anchorNode,
				anchor,
			);
			const { index, parent } = node.parentField;
			assert.equal(index, 0);
			assert.equal(parent.key, rootFieldKey);
		});

		it("keys", () => {
			{
				const { context, cursor } = initializeTreeWithContent({
					schema: toFlexSchema(JsonObject),
					initialTree: singleJsonCursor({}),
				});
				cursor.enterNode(0);
				const { anchor, anchorNode } = createAnchors(context, cursor);
				const node = new TestLazyTree(
					context,
					getFlexSchema(JsonObject),
					cursor,
					anchorNode,
					anchor,
				);
				assert.deepEqual([...node.keys()], []);
			}
			{
				const { context, cursor } = initializeTreeWithContent({
					schema: toFlexSchema(JsonObject),
					initialTree: singleJsonCursor({ x: 5 }),
				});
				cursor.enterNode(0);
				const { anchor, anchorNode } = createAnchors(context, cursor);
				const node = new TestLazyTree(
					context,
					getFlexSchema(JsonObject),
					cursor,
					anchorNode,
					anchor,
				);
				assert.deepEqual([...node.keys()], ["x"]);
			}
		});

		it("leaf", () => {
			const { context, cursor } = initializeTreeWithContent({
				schema: toFlexSchema(stringSchema),
				initialTree: singleJsonCursor("Hello world"),
			});
			cursor.enterNode(0);

			const { anchor, anchorNode } = createAnchors(context, cursor);

			const node = new LazyTreeNode(context, leafDomain.string, cursor, anchorNode, anchor);

			assert.equal(node.value, "Hello world");
		});
	});
});

function fieldToMapTree(field: FlexTreeField): MapTree[] {
	const results: MapTree[] = [];
	for (const child of field.boxedIterator()) {
		results.push(nodeToMapTree(child));
	}
	return results;
}

function nodeToMapTree(node: FlexTreeNode): MapTree {
	const fields: Map<FieldKey, MapTree[]> = new Map();
	for (const field of node.boxedIterator()) {
		fields.set(field.key, fieldToMapTree(field));
	}

	return { fields, type: node.schema.name, value: node.value };
}
