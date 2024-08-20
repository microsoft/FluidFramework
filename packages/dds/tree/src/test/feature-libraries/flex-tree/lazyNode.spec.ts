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
import {
	SchemaBuilder,
	leaf as leafDomain,
	singleJsonCursor,
	typedJsonCursor,
} from "../../../domains/index.js";
import type { Context } from "../../../feature-libraries/flex-tree/context.js";
import { LazyTreeNode } from "../../../feature-libraries/flex-tree/lazyNode.js";
import {
	Any,
	type FlexAllowedTypes,
	type FlexFieldKind,
	type FlexTreeField,
	type FlexTreeNode,
	type FlexTreeNodeSchema,
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
			// #region Create schemas

			const schemaBuilder = new SchemaBuilder({
				scope: "testShared",
			});

			const structNodeSchema = schemaBuilder.object("object", {});
			const mapNodeAnySchema = schemaBuilder.map("mapAny", SchemaBuilder.optional(Any));

			const schema = schemaBuilder.intoSchema(mapNodeAnySchema);

			// #endregion

			const { context, cursor } = initializeTreeWithContent({
				schema,
				initialTree: singleJsonCursor({}),
			});
			cursor.enterNode(0);

			const { anchor, anchorNode } = createAnchors(context, cursor);

			const node = new TestLazyTree(context, mapNodeAnySchema, cursor, anchorNode, anchor);

			assert(node.is(mapNodeAnySchema));
			assert(!node.is(structNodeSchema));
		});

		it("parent", () => {
			const schemaBuilder = new SchemaBuilder({
				scope: "test",
				libraries: [leafDomain.library],
			});
			const fieldNodeSchema = schemaBuilder.map(
				"map",
				SchemaBuilder.optional(leafDomain.string),
			);
			const schema = schemaBuilder.intoSchema(fieldNodeSchema);

			const { context, cursor } = initializeTreeWithContent({
				schema,
				initialTree: typedJsonCursor({
					[typedJsonCursor.type]: fieldNodeSchema,
					[EmptyKey]: "Hello world",
				}),
			});
			cursor.enterNode(0);

			const { anchor, anchorNode } = createAnchors(context, cursor);

			const node = new TestLazyTree(context, fieldNodeSchema, cursor, anchorNode, anchor);
			const { index, parent } = node.parentField;
			assert.equal(index, 0);
			assert.equal(parent.key, rootFieldKey);
		});

		it("keys", () => {
			const schemaBuilder = new SchemaBuilder({
				scope: "testShared",
			});
			const mapNodeAnySchema = schemaBuilder.map("mapAny", SchemaBuilder.optional(Any));

			const schema = schemaBuilder.intoSchema(mapNodeAnySchema);

			{
				const { context, cursor } = initializeTreeWithContent({
					schema,
					initialTree: singleJsonCursor({}),
				});
				cursor.enterNode(0);
				const { anchor, anchorNode } = createAnchors(context, cursor);
				const node = new TestLazyTree(context, mapNodeAnySchema, cursor, anchorNode, anchor);
				assert.deepEqual([...node.keys()], []);
			}
			{
				const { context, cursor } = initializeTreeWithContent({
					schema,
					initialTree: singleJsonCursor({ x: 5 }),
				});
				cursor.enterNode(0);
				const { anchor, anchorNode } = createAnchors(context, cursor);
				const node = new TestLazyTree(context, mapNodeAnySchema, cursor, anchorNode, anchor);
				assert.deepEqual([...node.keys()], ["x"]);
			}
		});

		it("leaf", () => {
			const schemaBuilder = new SchemaBuilder({
				scope: "test",
				libraries: [leafDomain.library],
			});
			const schema = schemaBuilder.intoSchema(leafDomain.string);

			const { context, cursor } = initializeTreeWithContent({
				schema,
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
