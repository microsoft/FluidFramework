/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SchemaBuilder, leaf, nodeKeyField, nodeKeySchema } from "../../../domains/index.js";
import {
	LocalNodeKey,
	NodeKeyManager,
	StableNodeKey,
	createMockNodeKeyManager,
	nodeKeyFieldKey,
} from "../../../feature-libraries/index.js";
import { flexTreeWithContent } from "../../utils.js";

const builder = new SchemaBuilder({
	scope: "EditableTree Node Keys",
	libraries: [nodeKeySchema],
});
const childNodeSchema = builder.object("ChildNode", {
	...nodeKeyField,
	name: leaf.string,
});

const parentNodeSchema = builder.object("ParentNode", {
	...nodeKeyField,
	children: builder.sequence(childNodeSchema),
});
const schema = builder.intoSchema(parentNodeSchema);

// TODO: this can probably be removed once daesun's stuff goes in
function addKey(view: NodeKeyManager, key: LocalNodeKey): { [nodeKeyFieldKey]: StableNodeKey } {
	return {
		[nodeKeyFieldKey]: view.stabilizeNodeKey(key),
	};
}

describe("editable-tree: node keys", () => {
	/** Creates or populates a view with a parent node and two children, each with node keys */
	function initializeView() {
		const nodeKeyManager = createMockNodeKeyManager();
		const parentKey = nodeKeyManager.generateLocalNodeKey();
		const childAKey = nodeKeyManager.generateLocalNodeKey();
		const childBKey = nodeKeyManager.generateLocalNodeKey();
		const typedView = flexTreeWithContent(
			{
				initialTree: {
					children: [
						{
							name: "childA",
							...addKey(nodeKeyManager, childAKey),
						},
						{
							name: "childB",
							...addKey(nodeKeyManager, childBKey),
						},
					],
					...addKey(nodeKeyManager, parentKey),
				},
				schema,
			},
			{ nodeKeyManager },
		);

		assert.equal(typedView.context.nodeKeys.map.size, 3);
		return {
			view: typedView,
			parentKey,
			childAKey,
			childBKey,
		};
	}

	it("can read local node keys", () => {
		const { view, parentKey, childAKey, childBKey } = initializeView();
		const parentNode = view.content;
		const childA = parentNode.children.at(0);
		const childB = parentNode.children.at(1);
		// We know how the test tree looks so these should not be undefined.
		assert(childA !== undefined, "Tried to access node that doesn't exist (index 0)");
		assert(childB !== undefined, "Tried to access node that doesn't exist (index 1)");
		assert.equal(parentNode.localNodeKey, parentKey);
		assert.equal(childA.localNodeKey, childAKey);
		assert.equal(childB.localNodeKey, childBKey);
	});

	it("can read stable node keys", async () => {
		const { view, parentKey, childAKey, childBKey } = initializeView();
		const parentNode = view.content;
		const childA = parentNode.children.at(0);
		const childB = parentNode.children.at(1);
		// We know how the test tree looks so these should not be undefined.
		assert(childA !== undefined, "Tried to access node that doesn't exist (index 0)");
		assert(childB !== undefined, "Tried to access node that doesn't exist (index 1)");
		assert.equal(
			parentNode[nodeKeyFieldKey].stableNodeKey,
			view.context.nodeKeys.stabilize(parentKey),
		);
		assert.equal(
			childA[nodeKeyFieldKey].stableNodeKey,
			view.context.nodeKeys.stabilize(childAKey),
		);
		assert.equal(
			childB[nodeKeyFieldKey].stableNodeKey,
			view.context.nodeKeys.stabilize(childBKey),
		);
	});

	it("cannot set node keys", () => {
		const { view } = initializeView();
		const parentNode = view.content;
		assert.throws(
			// @ts-expect-error Can not mutate keys.
			() => (parentNode[nodeKeyFieldKey] = view.nodeKey.stabilize(view.nodeKey.generate())),
		);
	});
});
