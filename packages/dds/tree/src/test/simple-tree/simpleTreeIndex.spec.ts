/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { brand, fail } from "../../util/index.js";
import {
	SchemaFactory,
	type TreeNode,
	type TreeNodeSchema,
	TreeViewConfiguration,
	createSimpleTreeIndex,
} from "../../simple-tree/index.js";
import {
	flexTreeSlot,
	type TreeIndexKey,
	type TreeIndexNodes,
} from "../../feature-libraries/index.js";
import { getView } from "../utils.js";
import { rootFieldKey, type FieldKey, type UpPath } from "../../core/index.js";

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
	childKey: schemaFactory.identifier,
}) {}
class IndexableParent extends schemaFactory.object("IndexableParent", {
	parentKey: schemaFactory.identifier,
	child: schemaFactory.optional(IndexableChild),
}) {}

function isStringKey(key: TreeIndexKey): key is string {
	return typeof key === "string";
}

function createView(child?: IndexableChild) {
	const config = new TreeViewConfiguration({ schema: IndexableParent });
	const view = getView(config);
	view.initialize(new IndexableParent({ parentKey: parentId, child }));

	return { view, parent: view.root };
}

describe("simple tree indexes", () => {
	function indexer(schema: TreeNodeSchema) {
		if (
			schema.identifier === IndexableParent.identifier ||
			schema.identifier === IndexableChild.identifier
		) {
			return schema.identifier === IndexableParent.identifier ? parentKey : childKey;
		}
		return;
	}

	it("can index nodes", () => {
		const { view } = createView(new IndexableChild({ childKey: childId }));
		const index = createSimpleTreeIndex(
			view,
			(s) => indexer(s),
			() => 3,
			isStringKey,
			[IndexableParent, IndexableChild],
		);
		assert.equal(index.size, 2);

		// test that both keys have been indexed
		assert.equal(index.get(parentId), 3);
		assert.equal(index.get(childId), 3);
	});

	it("does not reify tree of nodes being scanned", () => {
		const { view, parent } = createView(new IndexableChild({ childKey: childId }));
		const index = createSimpleTreeIndex(
			view,
			(s) => indexer(s),
			(nodes) => nodes,
			isStringKey,
			[IndexableParent, IndexableChild],
		);

		const { forest } = view.checkout;
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
		const { view, parent } = createView(new IndexableChild({ childKey: childId }));
		const index = createSimpleTreeIndex<
			typeof IndexableParent,
			string,
			TreeIndexNodes<TreeNode>
		>(
			view,
			(schema) => indexer(schema),
			(nodes) => nodes,
			isStringKey,
		);

		assert.equal(index.size, 2);
		assert.equal(index.get(parentId)?.length, 1);
		assert.equal(index.get(childId)?.length, 1);

		parent.child = undefined;

		assert.equal(index.size, 1);
		assert.equal(index.get(parentId)?.length, 1);
		assert.equal(index.get(childId), undefined);
	});

	it("updates when values fields are updated", () => {
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
			view,
			(schema) => "other",
			(nodes) => nodes.length,
			isStringKey,
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

	it("can be defined using a map of schemas to field keys", () => {
		const { view } = createView(new IndexableChild({ childKey: childId }));
		const index = createSimpleTreeIndex(
			view,
			new Map<TreeNodeSchema, string>([
				[IndexableParent, parentKey],
				[IndexableChild, childKey],
			]),
			() => 3,
			isStringKey,
			[IndexableParent, IndexableChild],
		);
		assert.equal(index.size, 2);

		// test that both keys have been indexed
		assert.equal(index.get(parentId), 3);
		assert.equal(index.get(childId), 3);
	});
});
