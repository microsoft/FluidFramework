/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	independentInitializedView,
	createIndependentTreeAlpha,
	createIndependentTreeBeta,
	// eslint-disable-next-line import/no-internal-modules
} from "../../shared-tree/independentView.js";
import {
	extractPersistedSchema,
	FieldKind,
	SchemaFactory,
	SchemaFactoryAlpha,
	TreeViewConfiguration,
	TreeViewConfigurationAlpha,
} from "../../simple-tree/index.js";
import { ForestTypeExpensiveDebug, TreeAlpha } from "../../shared-tree/index.js";
import { ajvValidator } from "../codec/index.js";
import { FluidClientVersion } from "../../codec/index.js";
import { testIdCompressor } from "../utils.js";

describe("independentView", () => {
	describe("independentInitializedView", () => {
		// Regression test for debug forest erroring during initialization due to being out of schema.
		it("debug forest", () => {
			const config = new TreeViewConfigurationAlpha({ schema: SchemaFactory.number });
			const view = independentInitializedView(
				config,
				{
					forest: ForestTypeExpensiveDebug,
					jsonValidator: ajvValidator,
				},
				{
					schema: extractPersistedSchema(config.schema, FluidClientVersion.v2_0, () => true),
					tree: TreeAlpha.exportCompressed(1, {
						minVersionForCollab: FluidClientVersion.v2_0,
					}),
					idCompressor: testIdCompressor,
				},
			);
			assert.equal(view.root, 1);
		});
	});

	describe("createIndependentTreeAlpha", () => {
		it("uninitialized: minimal", () => {
			const tree = createIndependentTreeAlpha({
				forest: ForestTypeExpensiveDebug,
				idCompressor: testIdCompressor,
			});
			const emptySchema = tree.exportSimpleSchema();
			assert.deepEqual(emptySchema.definitions, new Map());
			assert.equal(emptySchema.root.kind, FieldKind.Optional);
			assert.deepEqual(emptySchema.root.simpleAllowedTypes, new Map());
			assert.equal(tree.exportVerbose(), undefined);

			const config = new TreeViewConfigurationAlpha({ schema: SchemaFactory.number });

			const view = tree.viewWith(config);
			assert(view.compatibility.canInitialize);
			view.initialize(1);
			assert.equal(view.root, 1);

			assert.equal(tree.exportVerbose(), 1);
			const filledSchema = tree.exportSimpleSchema();
			assert.equal(filledSchema.root.kind, FieldKind.Required);
			assert.deepEqual(
				filledSchema.root.simpleAllowedTypes,
				new Map([[SchemaFactory.number.identifier, { isStaged: undefined }]]),
			);

			view.dispose();
		});

		it("uninitialized: staged schema upgrade", () => {
			const tree = createIndependentTreeAlpha({
				forest: ForestTypeExpensiveDebug,
				idCompressor: testIdCompressor,
			});

			const beforeConfig = new TreeViewConfigurationAlpha({ schema: SchemaFactory.number });
			const stagedConfig = new TreeViewConfigurationAlpha({
				schema: SchemaFactoryAlpha.types([
					SchemaFactory.number,
					SchemaFactoryAlpha.staged(SchemaFactory.string),
				]),
			});
			const afterConfig = new TreeViewConfigurationAlpha({
				schema: [SchemaFactory.number, SchemaFactory.string],
			});

			// Initialize tree
			{
				const view = tree.viewWith(beforeConfig);
				assert(view.compatibility.canInitialize);
				view.initialize(1);
				assert.equal(tree.exportVerbose(), 1);
				const filledSchema = tree.exportSimpleSchema();
				assert.equal(filledSchema.root.kind, FieldKind.Required);
				assert.deepEqual(
					filledSchema.root.simpleAllowedTypes,
					new Map([[SchemaFactory.number.identifier, { isStaged: undefined }]]),
				);

				view.dispose();
			}

			// Open with schema that has change staged
			{
				const view = tree.viewWith(stagedConfig);
				assert.equal(view.root, 1);
				assert.throws(() => {
					view.root = "x";
				}, /does not conform to schema/);
				view.dispose();

				const filledSchema = tree.exportSimpleSchema();
				assert.deepEqual(
					filledSchema.root.simpleAllowedTypes,
					// This is stored schema, so it does not include the staged type.
					new Map([[SchemaFactory.number.identifier, { isStaged: undefined }]]),
				);
			}

			// Do schema upgrade
			{
				const view = tree.viewWith(afterConfig);
				assert.equal(view.compatibility.canView, false);
				assert(view.compatibility.canUpgrade);
				view.upgradeSchema();
				view.root = "y";

				assert.equal(tree.exportVerbose(), "y");
				const filledSchema = tree.exportSimpleSchema();
				assert.deepEqual(
					filledSchema.root.simpleAllowedTypes,
					new Map([
						[SchemaFactory.number.identifier, { isStaged: undefined }],
						[SchemaFactory.string.identifier, { isStaged: undefined }],
					]),
				);

				view.dispose();
			}

			// Confirm tree is still readable with version that had staged schema.
			{
				const view = tree.viewWith(stagedConfig);
				assert.equal(view.root, "y");
				view.dispose();
			}

			// Tree cannot be read with original version.
			{
				const view = tree.viewWith(beforeConfig);
				assert.equal(view.compatibility.canView, false);
				assert.equal(view.compatibility.canUpgrade, false);
				view.dispose();
			}
		});

		it("initialized", () => {
			const minVersionForCollab = FluidClientVersion.v2_0;
			const config = new TreeViewConfigurationAlpha({ schema: SchemaFactory.number });
			const tree = createIndependentTreeAlpha({
				forest: ForestTypeExpensiveDebug,
				jsonValidator: ajvValidator,
				content: {
					schema: extractPersistedSchema(config.schema, minVersionForCollab, () => true),
					tree: TreeAlpha.exportCompressed(1, {
						minVersionForCollab,
					}),
					idCompressor: testIdCompressor,
				},
			});

			const view = tree.viewWith(config);
			assert.equal(view.root, 1);
		});

		it("oddly allowed jsonValidator", () => {
			const config = new TreeViewConfigurationAlpha({ schema: SchemaFactory.number });
			const tree = createIndependentTreeAlpha({
				forest: ForestTypeExpensiveDebug,
				// This does nothing, and is not part of the allowed input type.
				// Usually this would fail with "Object literal may only specify known properties"
				// but in this case there is no error.
				// This is fine as it works, and the jsonValidator is simply unnecessary and unused when not providing content, but seems odd.
				jsonValidator: ajvValidator,
			});

			const view = tree.viewWith(config);
			assert.equal(view.compatibility.canInitialize, true);
		});
	});

	it("createIndependentTreeBeta", () => {
		const tree = createIndependentTreeBeta();
		const view = tree.viewWith(
			new TreeViewConfigurationAlpha({ schema: SchemaFactory.number }),
		);
		view.initialize(42);
		assert.equal(view.root, 42);
		view.dispose();
	});

	it("staged schema example", () => {
		const tree = createIndependentTreeBeta();

		const stagedConfig = new TreeViewConfiguration({
			schema: SchemaFactoryAlpha.types([
				SchemaFactory.number,
				SchemaFactoryAlpha.staged(SchemaFactory.string),
			]),
		});
		const afterConfig = new TreeViewConfigurationAlpha({
			schema: [SchemaFactory.number, SchemaFactory.string],
		});

		// Initialize tree
		{
			const view = tree.viewWith(stagedConfig);
			view.initialize(1);
			view.dispose();
		}

		// Do schema upgrade
		{
			const view = tree.viewWith(afterConfig);
			view.upgradeSchema();
			view.root = "A";
			view.dispose();
		}

		// Can still view tree with staged schema
		{
			const view = tree.viewWith(stagedConfig);
			assert.equal(view.root, "A");
			view.dispose();
		}
	});
});
