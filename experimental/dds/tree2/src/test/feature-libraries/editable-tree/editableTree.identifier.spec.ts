/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	FieldKinds,
	SchemaBuilder,
	compressedNodeIdentifierSymbol,
	getField,
} from "../../../feature-libraries";
import { nodeIdentifierSchema } from "../../../domains";
import { createSharedTreeView } from "../../../shared-tree";
import { AllowedUpdateType, ValueSchema, symbolFromKey } from "../../../core";
import { brand } from "../../../util";
import { TestTreeProvider } from "../../utils";

const { field: nodeIdentifierField, schema: nodeIdentifierLibrary } = nodeIdentifierSchema();
const nodeIdentifierSymbol = symbolFromKey(nodeIdentifierField.key);

const builder = new SchemaBuilder("EditableTree NodeIdentifiers", nodeIdentifierLibrary);
const stringSchema = builder.primitive("string", ValueSchema.String);
const childNodeSchema = builder.object("ChildNode", {
	local: {
		name: SchemaBuilder.field(FieldKinds.value, stringSchema),
	},
	global: [nodeIdentifierField],
});

const parentNodeSchema = builder.object("ParentNode", {
	local: {
		children: SchemaBuilder.field(FieldKinds.sequence, childNodeSchema),
	},
	global: [nodeIdentifierField],
});
const rootField = SchemaBuilder.field(FieldKinds.value, parentNodeSchema);
const schema = builder.intoDocumentSchema(rootField);

describe("editable-tree: identifiers", () => {
	/** Creates or populates a view with a parent node and two children, each with node identifiers */
	function initializeView(view = createSharedTreeView()) {
		const parentIdentifier = view.nodeIdentifier.generate();
		const childAIdentifier = view.nodeIdentifier.generate();
		const childBIdentifier = view.nodeIdentifier.generate();
		const typedView = view.schematize({
			initialTree: {
				children: [
					{
						name: "childA",
						[nodeIdentifierSymbol]: childAIdentifier,
					},
					{
						name: "childB",
						[nodeIdentifierSymbol]: childBIdentifier,
					},
				],
				[nodeIdentifierSymbol]: parentIdentifier,
			},
			schema,
			allowedSchemaModifications: AllowedUpdateType.None,
		});

		assert.equal(typedView.nodeIdentifier.map.size, 3);
		return {
			view: typedView,
			parentIdentifier,
			childAIdentifier,
			childBIdentifier,
		};
	}

	it("can read identifiers", () => {
		const { view, parentIdentifier, childAIdentifier, childBIdentifier } = initializeView();
		const typedRootField = view.context.root;
		const parentNode = typedRootField.getNode(0);
		const childA = parentNode[getField](brand("children")).getNode(0);
		const childB = parentNode[getField](brand("children")).getNode(1);
		assert.equal(parentNode[nodeIdentifierSymbol], parentIdentifier);
		assert.equal(childA[nodeIdentifierSymbol], childAIdentifier);
		assert.equal(childB[nodeIdentifierSymbol], childBIdentifier);
	});

	it("can read compressed identifiers", async () => {
		const { view, parentIdentifier, childAIdentifier, childBIdentifier } = initializeView(
			// A TestTreeProvider is required here in order to provide an IdCompressor
			(await TestTreeProvider.create(1)).trees[0],
		);
		const typedRootField = view.context.root;
		const parentNode = typedRootField.getNode(0);
		const childA = parentNode[getField](brand("children")).getNode(0);
		const childB = parentNode[getField](brand("children")).getNode(1);
		assert.equal(
			parentNode[compressedNodeIdentifierSymbol],
			view.nodeIdentifier.compress(parentIdentifier),
		);
		assert.equal(
			childA[compressedNodeIdentifierSymbol],
			view.nodeIdentifier.compress(childAIdentifier),
		);
		assert.equal(
			childB[compressedNodeIdentifierSymbol],
			view.nodeIdentifier.compress(childBIdentifier),
		);
	});

	it("cannot set identifiers", () => {
		const { view } = initializeView();
		const typedRootField = view.context.root;
		const parentNode = typedRootField.getNode(0);
		assert.throws(() => (parentNode[nodeIdentifierSymbol] = view.nodeIdentifier.generate()));
	});
});
