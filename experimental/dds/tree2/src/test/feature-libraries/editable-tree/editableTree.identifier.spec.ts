/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	SchemaBuilder,
	localNodeKeySymbol,
	getField,
	createMockNodeKeyManager,
	StableNodeKey,
	LocalNodeKey,
} from "../../../feature-libraries";
import { nodeKeySchema } from "../../../domains";
import { ISharedTreeView, createSharedTreeView } from "../../../shared-tree";
import { AllowedUpdateType, GlobalFieldKeySymbol, ValueSchema, symbolFromKey } from "../../../core";
import { brand } from "../../../util";

const { field: nodeKeyField, schema: nodeKeyLibrary } = nodeKeySchema();
const stableNodeKeySymbol = symbolFromKey(nodeKeyField.key);

const builder = new SchemaBuilder("EditableTree Node Keys", nodeKeyLibrary);
const stringSchema = builder.primitive("string", ValueSchema.String);
const childNodeSchema = builder.object("ChildNode", {
	local: {
		name: SchemaBuilder.fieldValue(stringSchema),
	},
	global: [nodeKeyField],
});

const parentNodeSchema = builder.object("ParentNode", {
	local: {
		children: SchemaBuilder.fieldSequence(childNodeSchema),
	},
	global: [nodeKeyField],
});
const rootField = SchemaBuilder.fieldValue(parentNodeSchema);
const schema = builder.intoDocumentSchema(rootField);

// TODO: this can probably be removed once daesun's stuff goes in
function addKey(
	view: ISharedTreeView,
	key: LocalNodeKey,
): { [keySymbol: GlobalFieldKeySymbol]: StableNodeKey } {
	return {
		[symbolFromKey(nodeKeyField.key)]: view.nodeKey.stabilize(key),
	};
}

describe("editable-tree: node keys", () => {
	/** Creates or populates a view with a parent node and two children, each with node keys */
	function initializeView(
		view = createSharedTreeView({ nodeKeyManager: createMockNodeKeyManager() }),
	) {
		const parentKey = view.nodeKey.generate();
		const childAKey = view.nodeKey.generate();
		const childBKey = view.nodeKey.generate();
		const typedView = view.schematize({
			initialTree: {
				children: [
					{
						name: "childA",
						...addKey(view, childAKey),
					},
					{
						name: "childB",
						...addKey(view, childBKey),
					},
				],
				...addKey(view, parentKey),
			},
			schema,
			allowedSchemaModifications: AllowedUpdateType.None,
		});

		assert.equal(typedView.nodeKey.map.size, 3);
		return {
			view: typedView,
			parentKey,
			childAKey,
			childBKey,
		};
	}

	it("can read local node keys", () => {
		const { view, parentKey, childAKey, childBKey } = initializeView();
		const typedRootField = view.context.root;
		const parentNode = typedRootField.getNode(0);
		const childA = parentNode[getField](brand("children")).getNode(0);
		const childB = parentNode[getField](brand("children")).getNode(1);
		assert.equal(parentNode[localNodeKeySymbol], parentKey);
		assert.equal(childA[localNodeKeySymbol], childAKey);
		assert.equal(childB[localNodeKeySymbol], childBKey);
	});

	it("can read stable node keys", async () => {
		const { view, parentKey, childAKey, childBKey } = initializeView();
		const typedRootField = view.context.root;
		const parentNode = typedRootField.getNode(0);
		const childA = parentNode[getField](brand("children")).getNode(0);
		const childB = parentNode[getField](brand("children")).getNode(1);
		assert.equal(
			parentNode[symbolFromKey(nodeKeyField.key)],
			view.nodeKey.stabilize(parentKey),
		);
		assert.equal(childA[symbolFromKey(nodeKeyField.key)], view.nodeKey.stabilize(childAKey));
		assert.equal(childB[symbolFromKey(nodeKeyField.key)], view.nodeKey.stabilize(childBKey));
	});

	it("cannot set node keys", () => {
		const { view } = initializeView();
		const typedRootField = view.context.root;
		const parentNode = typedRootField.getNode(0);
		assert.throws(
			() =>
				(parentNode[stableNodeKeySymbol] = view.nodeKey.stabilize(view.nodeKey.generate())),
		);
	});
});
