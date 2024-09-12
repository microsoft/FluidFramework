/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { brand, fail } from "../../util/index.js";
import {
	type InsertableTypedNode,
	SchemaFactory,
	type TreeNode,
	type TreeNodeSchema,
	TreeViewConfiguration,
	createIdentifierIndex,
	getOrCreateInnerNode,
} from "../../simple-tree/index.js";
import { hydrate } from "./utils.js";
// eslint-disable-next-line import/no-internal-modules
import { createSimpleTreeIndex } from "../../simple-tree/api/identifierIndex.js";
import type { FlexTreeNode, TreeIndexNodes } from "../../feature-libraries/index.js";
import { getView } from "../utils.js";
import type { FieldKey, ITreeSubscriptionCursor } from "../../core/index.js";

function getFlexNode(node: TreeNode): FlexTreeNode {
	return getOrCreateInnerNode(node);
}

/** The field key under which the parentId node puts its identifier */
const parentKey: FieldKey = brand("parentKey");
/** The identifier of the parent node */
const parentId: FieldKey = brand("parentId");
/** The field key under which the childId node puts its identifier */
const childKey: FieldKey = brand("childKey");
/** The identifier of the child node */
const childId: FieldKey = brand("childId");

const schemaFactory = new SchemaFactory(undefined);
class IndexableChild extends schemaFactory.object("IndexableChild", {
	[childKey]: schemaFactory.identifier,
}) {}
class IndexableParent extends schemaFactory.object("IndexableParent", {
	[parentKey]: schemaFactory.identifier,
	child: schemaFactory.optional(IndexableChild),
}) {}

describe.only("simple tree indexes", () => {
	function createView(child?: IndexableChild) {
		const config = new TreeViewConfiguration({ schema: IndexableParent });
		const view = getView(config);
		view.initialize({ [parentKey]: parentId, child });

		return { view, parent: view.root };
	}

	function makeKeyFinder(schema: TreeNodeSchema) {
		if (
			schema.identifier === IndexableParent.identifier ||
			schema.identifier === IndexableChild.identifier
		) {
			return (node: ITreeSubscriptionCursor) => {
				node.enterField(
					schema.identifier === IndexableParent.identifier ? parentKey : childKey,
				);
				node.enterNode(0);
				const value = node.value;
				node.exitNode();
				node.exitField();
				assert(typeof value === "string");
				return value;
			};
		}
		return;
	}

	it("can index nodes", () => {
		const parent = hydrate(IndexableParent, {
			[parentKey]: parentId,
			child: { [childKey]: childId },
		});
		const node = getOrCreateInnerNode(parent);
		const context = node.context;
		const index = createSimpleTreeIndex(
			context,
			(s) => makeKeyFinder(s),
			() => 3,
			[IndexableParent, IndexableChild],
		);
		assert.equal(index.size, 2);

		// test that both keys have been indexed
		assert.equal(index.get(parentId), 3);
		assert.equal(index.get(childId), 3);
	});

	it("does not reify tree of nodes being scanned", () => {
		// TODO create simple tree with a child and make sure that the anchor to it doesn't have an actual node?
		const parent = hydrate(IndexableParent, {
			[parentKey]: parentId,
			child: { [childKey]: childId },
		});
		const node = getOrCreateInnerNode(parent);
		const context = node.context;
		
		const index = createSimpleTreeIndex(
			context,
			(s) => makeKeyFinder(s),
			() => 3,
			[IndexableParent, IndexableChild],
		);
	});

	it("filters out removed nodes", () => {
		const { parent } = createView(new IndexableChild({ [childKey]: childId }));
		const index = createSimpleTreeIndex<string, TreeIndexNodes<TreeNode>>(
			getFlexNode(parent).context,
			(schema) => makeKeyFinder(schema),
			(nodes) => nodes,
		);

		assert.equal(index.size, 2);
		assert.equal(index.get(parentId)?.length, 1);
		assert.equal(index.get(childId)?.length, 1);

		parent.child = undefined;

		assert.equal(index.size, 1);
		assert.equal(index.get(parentId)?.length, 1);
		assert.equal(index.get(childId), undefined);
	});
});

describe.only("identifier indexes", () => {
	function init(child?: InsertableTypedNode<typeof IndexableChild>) {
		const parent = hydrate(IndexableParent, { [parentKey]: parentId, child });
		const index = createIdentifierIndex(
			getFlexNode(parent).context ?? fail("nodes in index should be cooked"),
		);
		return { parent, index };
	}

	it("can look up nodes", () => {
		const { parent, index } = init({ [childKey]: childId });
		assert.equal(index.get(parentId), parent);
		const child = parent.child;
		assert(child !== undefined);
		assert.equal(index.get(childId), child);
		assert.equal(index.size, 2);
	});

	it("indexes newly inserted nodes", () => {
		const { parent, index } = init({ [childKey]: childId });
		parent.child = new IndexableChild({ [childKey]: `${childId}2` });
		assert.equal(index.get(parentId), parent);
		assert.equal(index.get(`${childId}2`), parent.child);
		assert.equal(index.get(childId), undefined);
	});

	it("does not index detached nodes", () => {
		const { parent, index } = init({ [childKey]: childId });
		const child = parent.child;
		assert(child !== undefined);
		assert.equal(index.get(childId), child);
		assert.equal(index.size, 2);
		parent.child = undefined;
		assert.equal(index.get(parentId), parent);
		assert.equal(index.get(childId), undefined);
		assert.equal(index.size, 1);
	});

	it("fail on lookup if two nodes have the same key", () => {
		const { index } = init({ [childKey]: parentId });
		assert.throws(() => index.get(parentId));
	});
});
