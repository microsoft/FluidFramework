/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */

import { strict as assert, fail } from "node:assert";

import {
	type Anchor,
	type AnchorNode,
	EmptyKey,
	type FieldKey,
	type ITreeSubscriptionCursor,
	type MapTree,
	rootFieldKey,
} from "../../../core/index.js";
import type { Context } from "../../../feature-libraries/flex-tree/context.js";
import { LazyTreeNode } from "../../../feature-libraries/flex-tree/lazyNode.js";
import type { FlexTreeField, FlexTreeNode } from "../../../feature-libraries/index.js";

import { readonlyTreeWithContent } from "./utils.js";
import { cursorFromInsertable, SchemaFactory } from "../../../simple-tree/index.js";
import { singleJsonCursor } from "../../json/index.js";
import { stringSchema } from "../../../simple-tree/leafNodeSchema.js";
import { brand } from "../../../util/index.js";
import { JsonAsTree } from "../../../jsonDomainSchema.js";

/**
 * Test {@link LazyTreeNode} implementation.
 */
class TestLazyTree extends LazyTreeNode {}

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
		it("parent", () => {
			const schemaFactory = new SchemaFactory("test");
			const ParentNode = schemaFactory.map("map", schemaFactory.string);

			const { context, cursor } = readonlyTreeWithContent({
				schema: ParentNode,
				initialTree: cursorFromInsertable(ParentNode, { [EmptyKey]: "test" }),
			});
			cursor.enterNode(0);

			const { anchor, anchorNode } = createAnchors(context, cursor);

			const node = new TestLazyTree(
				context,
				brand(ParentNode.identifier),
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
				const { context, cursor } = readonlyTreeWithContent({
					schema: JsonAsTree.JsonObject,
					initialTree: singleJsonCursor({}),
				});
				cursor.enterNode(0);
				const { anchor, anchorNode } = createAnchors(context, cursor);
				const node = new TestLazyTree(
					context,
					brand(JsonAsTree.JsonObject.identifier),
					cursor,
					anchorNode,
					anchor,
				);
				assert.deepEqual([...node.keys()], []);
			}
			{
				const { context, cursor } = readonlyTreeWithContent({
					schema: JsonAsTree.JsonObject,
					initialTree: singleJsonCursor({ x: 5 }),
				});
				cursor.enterNode(0);
				const { anchor, anchorNode } = createAnchors(context, cursor);
				const node = new TestLazyTree(
					context,
					brand(JsonAsTree.JsonObject.identifier),
					cursor,
					anchorNode,
					anchor,
				);
				assert.deepEqual([...node.keys()], ["x"]);
			}
		});

		it("leaf", () => {
			const { context, cursor } = readonlyTreeWithContent({
				schema: stringSchema,
				initialTree: singleJsonCursor("Hello world"),
			});
			cursor.enterNode(0);

			const { anchor, anchorNode } = createAnchors(context, cursor);

			const node = new LazyTreeNode(
				context,
				brand(stringSchema.identifier),
				cursor,
				anchorNode,
				anchor,
			);

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

	return { fields, type: node.schema, value: node.value };
}
