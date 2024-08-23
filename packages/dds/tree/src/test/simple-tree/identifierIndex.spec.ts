/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import type { FieldKey } from "../../core/index.js";
import { brand, fail } from "../../util/index.js";
import {
	type InsertableTypedNode,
	SchemaFactory,
	type TreeNode,
	createIdentifierIndex,
} from "../../simple-tree/index.js";
import { hydrate } from "./utils.js";
// eslint-disable-next-line import/no-internal-modules
import { createSimpleTreeIndex } from "../../simple-tree/identifierIndex.js";
import type { FlexTreeNode } from "../../feature-libraries/index.js";
// eslint-disable-next-line import/no-internal-modules
import { tryGetInnerNode } from "../../simple-tree/proxyBinding.js";

function getFlexNode(node: TreeNode) {
	return tryGetInnerNode(parent) ?? fail("nodes in index should be cooked");
}

describe("Simple-Tree Indexes", () => {
	/** The field key under which the parentId node puts its identifier */
	const parentKey: FieldKey = brand("parentKey");
	/** The identifier of the parent node */
	const parentId = "parentId";
	/** The field key under which the childId node puts its identifier */
	const childKey: FieldKey = brand("childKey");
	/** The identifier of the child node */
	const childId = "childId";

	const schemaFactory = new SchemaFactory(undefined);
	class IndexableChild extends schemaFactory.object("IndexableChild", {
		[childKey]: schemaFactory.identifier,
	}) {}
	class IndexableParent extends schemaFactory.object("IndexableParent", {
		[parentKey]: schemaFactory.identifier,
		child: schemaFactory.optional(IndexableChild),
	}) {}

	function init(child?: InsertableTypedNode<typeof IndexableChild>) {
		const parent = hydrate(IndexableParent, { [parentKey]: parentId, child });
		const index = createIdentifierIndex(getFlexNode(parent).context);
		return { parent, index };
	}

	it("can", () => {
		const parent = hydrate(IndexableParent, {
			[parentKey]: parentId,
			child: { [childKey]: childId },
		});
		const { context }: FlexTreeNode = tryGetInnerNode(parent) ?? fail("nodes in index should be cooked");
		const index = createSimpleTreeIndex(
			context,
			(s) => {
				return undefined;
			},
			() => 3,
			[IndexableParent, IndexableChild],
		);
	});

	it("can look up nodes", () => {
		const { parent, index } = init({ [childKey]: childId });
		assert.equal(index.get(parentId), parent);
		const child = parent.child;
		assert(child !== undefined);
		assert.equal(index.get(childId), child);
		assert.equal(index.size, 2);
		parent.child = undefined;
		assert.equal(index.get(parentId), parent);
		assert.equal(index.get(childId), undefined);
		assert.equal(index.size, 1);
		parent.child = new IndexableChild({ [childKey]: `${childId}2` });
		assert.equal(index.get(parentId), parent);
		assert.equal(index.get(`${childId}2`), parent.child);
		assert.equal(index.size, 2);
	});

	it("fail on lookup if two nodes have the same key", () => {});

	it("do not reify tree of nodes being scanned");

	it("filters out removed nodes", () => {
		const parent = createParent();
		const index = new SimpleTreeIndex(getFlexNode(parent).context, (schemaId) => {
			if (schemaId === IndexableParent.identifier || schemaId === IndexableChild.identifier) {
				return (node) => {
					node.enterField(schemaId === IndexableParent.identifier ? parentKey : childKey);
					node.enterNode(0);
					const value = node.value;
					node.exitNode();
					node.exitField();
					assert(typeof value === "string");
					return value;
				};
			}
		});
		assert.equal(index.size, 2);
		assert.equal(index.get(parentKey)?.size, 1);
		assert.equal(index.get(childKey)?.size, 1);
	});
});
