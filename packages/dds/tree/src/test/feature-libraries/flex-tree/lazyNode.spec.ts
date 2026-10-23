/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import-x/no-internal-modules */

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
import { Context } from "../../../feature-libraries/flex-tree/context.js";
import { LazyTreeNode } from "../../../feature-libraries/flex-tree/lazyNode.js";
import { withObservation } from "../../../feature-libraries/flex-tree/observer.js";
import type { FlexTreeField, FlexTreeNode } from "../../../feature-libraries/index.js";
import { JsonAsTree } from "../../../jsonDomainSchema.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	getInnerNode,
} from "../../../simple-tree/index.js";
import {
	createIndependentTreeAlpha,
	ForestTypeOptimized,
	ForestTypeReference,
	Tree,
} from "../../../shared-tree/index.js";
import { stringSchema } from "../../../simple-tree/leafNodeSchema.js";
import { brand, disposeSymbol } from "../../../util/index.js";

import { readonlyTreeWithContent } from "./utils.js";

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
	for (const [name, forest] of [
		["ChunkedForest", ForestTypeOptimized],
		["ObjectForest", ForestTypeReference],
	] as const) {
		it(`cached parents follow moves and removal without cursor recovery (${name})`, () => {
			const sf = new SchemaFactory("cached-parents");
			class Item extends sf.object("Item", { value: sf.number }) {}
			class Items extends sf.array("Items", Item) {}
			class Root extends sf.object("Root", { left: Items, right: Items }) {}
			const view = createIndependentTreeAlpha({ forest }).viewWith(
				new TreeViewConfiguration({ schema: Root }),
			);
			view.initialize({ left: [{ value: 1 }, { value: 2 }], right: [] });
			const root = view.root;
			const item = root.left[1];
			const node = getInnerNode(item);
			assert(node instanceof LazyTreeNode);
			const originalField = node.parentField.parent;
			root.right.moveToStart(1, root.left);
			const rightNode = getInnerNode(root.right);
			const destination = rightNode.getBoxed(EmptyKey);
			for (const entity of node.context.withCursors) entity.prepareForEdit();
			let observations = 0;
			withObservation(
				{
					observeNodeDeep: () => assert.fail("unexpected deep observation"),
					observeNodeFields: () => assert.fail("unexpected fields observation"),
					observeNodeField: () => assert.fail("unexpected field observation"),
					observeParentOf: (observed) => {
						assert.equal(observed, node);
						observations++;
					},
				},
				() => {
					assert.deepEqual(node.parentField, { parent: destination, index: 0 });
					assert.equal(destination.parent, rightNode);
				},
			);
			assert.equal(observations, 1);
			assert.equal(node.context.withCursors.size, 0);
			assert.notEqual(destination, originalField);
			assert.equal(Tree.parent(item), root.right);
			assert.equal(Tree.key(item), 0);
			root.right.removeAt(0);
			assert.equal(Tree.parent(item), undefined);
			const checkout = node.context.checkout;
			view.dispose();
			assert.throws(() => node.parentField);
			assert.throws(() => destination.parent);
			checkout.dispose();
		});

		it(`cached fields preserve observation, emptiness and lifetime (${name})`, () => {
			const sf = new SchemaFactory("cached-fields");
			class Item extends sf.object("Item", { value: sf.optional(sf.number) }) {}
			const view = createIndependentTreeAlpha({ forest }).viewWith(
				new TreeViewConfiguration({ schema: Item }),
			);
			view.initialize({});
			const node = getInnerNode(view.root);
			assert(node instanceof LazyTreeNode);
			const key: FieldKey = brand("value");
			const field = node.getBoxed(key);
			for (const entity of node.context.withCursors) entity.prepareForEdit();
			let observations = 0;
			withObservation(
				{
					observeNodeDeep: () => {},
					observeNodeFields: () => {},
					observeParentOf: () => {},
					observeNodeField: (observed, observedKey) => {
						assert.equal(observed, node);
						assert.equal(observedKey, key);
						observations++;
					},
				},
				() => assert.equal(node.getBoxed(key), field),
			);
			assert.equal(observations, 1);
			assert.equal(node.context.withCursors.size, 0);
			assert.equal(node.tryGetField(key), undefined);
			view.root.value = 1;
			assert.equal(node.tryGetField(key), field);
			view.root.value = undefined;
			assert.equal(node.getBoxed(key), field);
			assert.equal(node.tryGetField(key), undefined);
			const checkout = node.context.checkout;
			view.dispose();
			assert.throws(() => node.getBoxed(key));
			checkout.dispose();
		});
	}

	it("cached fields preserve current reads but reject recovery in a broken forest", () => {
		const { context, cursor } = readonlyTreeWithContent({
			schema: JsonAsTree.JsonObject,
			initialTree: { x: 1 },
		});
		const node = context.root.boxedAt(0);
		assert(node !== undefined);
		const field = node.getBoxed(brand("x"));
		const breaker = context.checkout.forest.breaker;
		assert.throws(() => breaker.break(new Error("test break")), /test break/);
		assert.equal(node.getBoxed(brand("x")), field);
		assert(node instanceof LazyTreeNode);
		node.prepareForEdit();
		assert.throws(() => node.getBoxed(brand("x")), /invalid state/);
		breaker.clearError();
		cursor.free();
		context[disposeSymbol]();
	});

	it("does not reuse fields from a disposed context on the same anchors", () => {
		const { context, cursor } = readonlyTreeWithContent({
			schema: JsonAsTree.JsonObject,
			initialTree: { x: 1 },
		});
		const node = context.root.boxedAt(0);
		assert(node instanceof LazyTreeNode);
		const key: FieldKey = brand("x");
		const field = node.getBoxed(key);
		const forest = context.checkout.forest;
		const retainedAnchor = forest.anchors.track(node.anchorNode);
		cursor.free();
		context[disposeSymbol]();
		const replacement = new Context(
			context.schemaPolicy,
			context.checkout,
			context.nodeKeyManager,
		);
		const replacementNode = replacement.root.boxedAt(0);
		assert(replacementNode instanceof LazyTreeNode);
		assert.equal(replacementNode.anchorNode, forest.anchors.locate(retainedAnchor));
		assert.notEqual(replacementNode.getBoxed(key), field);
		assert.throws(() => node.getBoxed(key));
		replacement[disposeSymbol]();
		forest.anchors.forget(retainedAnchor);
	});

	describe("LazyNode", () => {
		it("parent", () => {
			const schemaFactory = new SchemaFactory("test");
			const ParentNode = schemaFactory.map("map", schemaFactory.string);

			const { context, cursor } = readonlyTreeWithContent({
				schema: ParentNode,
				initialTree: { [EmptyKey]: "test" },
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
					initialTree: {},
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
					initialTree: { x: 5 },
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
				initialTree: "Hello world",
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
	for (const child of field) {
		results.push(nodeToMapTree(child));
	}
	return results;
}

function nodeToMapTree(node: FlexTreeNode): MapTree {
	const fields: Map<FieldKey, MapTree[]> = new Map();
	for (const field of node) {
		fields.set(field.key, fieldToMapTree(field));
	}

	return { fields, type: node.type, value: node.value };
}
