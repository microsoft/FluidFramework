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
import {
	flexTreeSlot,
	type FlexTreeNode,
	type TreeIndexNodes,
} from "../../feature-libraries/index.js";
import { getView } from "../utils.js";
import {
	rootFieldKey,
	type FieldKey,
	type ITreeSubscriptionCursor,
	type UpPath,
} from "../../core/index.js";

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
		const parent = hydrate(IndexableParent, {
			[parentKey]: parentId,
			child: { [childKey]: childId },
		});
		const node = getOrCreateInnerNode(parent);
		const context = node.context;

		const index = createSimpleTreeIndex(
			context,
			(s) => makeKeyFinder(s),
			(nodes) => nodes,
			[IndexableParent, IndexableChild],
		);

		assert(context.isHydrated());
		const { forest } = context.checkout;
		const path: UpPath = {
			parent: {
				parent: undefined,
				parentField: rootFieldKey,
				parentIndex: 0,
			},
			parentField: brand("child"),
			parentIndex: 0,
		};
		const anchor = forest.anchors.track(path);
		const anchorNode =
			forest.anchors.locate(anchor) ?? fail("should be able to find anchor to child");
		assert.equal(anchorNode.slots.has(flexTreeSlot), false);

		const children = index.get(childId);
		assert.equal(children?.length, 1);
		assert.equal(children[0], parent.child);
		assert.equal(anchorNode.slots.has(flexTreeSlot), true);
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

	// TODO change the event we're using to update the index so that this works
	it.skip("updates when values fields are updated", () => {
		class OtherIndexableChild extends schemaFactory.object("IndexableChild", {
			other: schemaFactory.string,
		}) {}
		class OtherIndexableParent extends schemaFactory.object("IndexableParent", {
			child: schemaFactory.optional(OtherIndexableChild),
			other: schemaFactory.string,
		}) {}
		const config = new TreeViewConfiguration({ schema: OtherIndexableParent });
		const view = getView(config);
		view.initialize({ other: parentId, child: new OtherIndexableChild({ other: childId }) });
		const parent = view.root;
		const index = createSimpleTreeIndex(
			getFlexNode(parent).context,
			(schema) => (node: ITreeSubscriptionCursor) => {
				node.enterField(brand("other"));
				node.firstNode();
				const value = node.value;
				node.exitNode();
				node.exitField();
				assert(typeof value === "string");
				return value;
			},
			(nodes) => nodes.length,
			[OtherIndexableChild, OtherIndexableParent],
		);

		const child = parent.child;
		assert(child !== undefined);
		assert.equal(index.get(childId), 1);
		assert.equal(index.size, 2);

		child.other = parentId;
		assert.equal(index.get(parentId), 2);
		assert.equal(index.size, 1);
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
