/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	createIndependentTreeCheckout,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../shared-tree/independentView.js";
import { exportSimpleSchema, ForestTypeExpensiveDebug } from "../../shared-tree/sharedTree.js";
import { createViewableTreeAlpha } from "../../shared-tree/viewableTree.js";
import {
	FieldKind,
	NodeKind,
	SchemaFactory,
	TreeViewConfigurationAlpha,
	type SimpleLeafNodeSchema,
	type SimpleTreeSchema,
} from "../../simple-tree/index.js";
import { testIdCompressor } from "../utils.js";
import { ValueSchema } from "../../core/index.js";

describe("createViewableTreeAlpha", () => {
	it("exposes checkout views, content, and schema", () => {
		const checkout = createIndependentTreeCheckout({
			forest: ForestTypeExpensiveDebug,
			idCompressor: testIdCompressor,
		});
		const tree = createViewableTreeAlpha(checkout, () =>
			exportSimpleSchema(checkout.storedSchema),
		);

		// Validate uninitialized state
		assert.equal(tree.exportVerbose(), undefined);
		const emptySchema = tree.exportSimpleSchema();
		assert.deepEqual(emptySchema.definitions, new Map());
		assert.equal(emptySchema.root.kind, FieldKind.Optional);
		assert.deepEqual(emptySchema.root.simpleAllowedTypes, new Map());

		const config = new TreeViewConfigurationAlpha({ schema: SchemaFactory.number });
		const view = tree.viewWith(config);
		assert(view.compatibility.canInitialize);

		// Initialize
		view.initialize(1);

		// Validate initialized state
		assert.equal(view.root, 1);
		assert.equal(tree.exportVerbose(), 1);

		const filledSchema = tree.exportSimpleSchema();
		const expected: SimpleTreeSchema = {
			root: {
				kind: FieldKind.Required,
				simpleAllowedTypes: new Map([
					["com.fluidframework.leaf.number", { isStaged: undefined }],
				]),
				metadata: {},
				persistedMetadata: undefined,
			},
			definitions: new Map([
				[
					"com.fluidframework.leaf.number",
					{
						kind: NodeKind.Leaf,
						leafKind: ValueSchema.Number,
						metadata: {},
						persistedMetadata: undefined,
					} satisfies SimpleLeafNodeSchema,
				],
			]),
		};
		assert.deepEqual(filledSchema, expected);

		view.dispose();
	});
});
