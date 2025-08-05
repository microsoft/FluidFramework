/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { createIdCompressor } from "@fluidframework/id-compressor/internal";

import {
	extractPersistedSchema,
	SchemaCompatibilityTester,
	SchemaFactoryAlpha,
	schemaStatics,
	toUpgradeSchema,
	TreeViewConfiguration,
	TreeViewConfigurationAlpha,
} from "../../../simple-tree/index.js";
import { TestSchemaRepository, TestTreeProviderLite } from "../../utils.js";
import { defaultSchemaPolicy } from "../../../feature-libraries/index.js";
import { storedEmptyFieldSchema } from "../../../core/index.js";
import {
	independentInitializedView,
	independentView,
	TreeAlpha,
	type ViewContent,
} from "../../../shared-tree/index.js";
import { typeboxValidator } from "../../../external-utilities/index.js";
import { FluidClientVersion } from "../../../codec/index.js";

// Some documentation links to this file on GitHub: renaming it may break those links.

describe("staged schema upgrade", () => {
	const factory = new SchemaFactoryAlpha("upgrade");

	// schema A: only number allowed
	const schemaA = factory.optional([SchemaFactoryAlpha.number]);

	// schema B: number or string (string is staged)
	const schemaB = factory.optional([
		SchemaFactoryAlpha.number,
		SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
	]);

	// schema C: number or string, both fully allowed
	const schemaC = factory.optional([SchemaFactoryAlpha.number, SchemaFactoryAlpha.string]);

	it("using user apis", () => {
		const provider = new TestTreeProviderLite(3);

		const [treeA, treeB, treeC] = provider.trees;

		const synchronizeTrees = () => {
			provider.synchronizeMessages();
		};

		// initialize with schema A
		const configA = new TreeViewConfiguration({
			schema: schemaA,
		});
		const viewA = treeA.viewWith(configA);
		viewA.initialize(5);
		synchronizeTrees();

		assert.deepEqual(viewA.root, 5);

		// view second tree with schema B
		const configB = new TreeViewConfiguration({
			schema: schemaB,
		});
		const viewB = treeB.viewWith(configB);
		// check that we can read the tree
		assert.deepEqual(viewB.root, 5);
		// upgrade to schema B: this is a no-op
		viewB.upgradeSchema();
		synchronizeTrees();

		// check view A can read the document
		assert.deepEqual(viewA.root, 5);
		// check view B cannot write strings to the root
		assert.throws(() => {
			viewB.root = "test";
		});

		// view third tree with schema C
		const configC = new TreeViewConfiguration({
			schema: schemaC,
		});
		const viewC = treeC.viewWith(configC);
		// upgrade to schema C and change the root to a string
		viewC.upgradeSchema();
		viewC.root = "test";
		synchronizeTrees();

		// view A is now incompatible with the stored schema
		assert.equal(viewA.compatibility.canView, false);
		assert.deepEqual(viewB.root, "test");
		assert.deepEqual(viewC.root, "test");
	});

	it("using user apis: minimal example", () => {
		// This top section of this example uses APIs not available to customers.
		// TODO: We should ensure the customer facing APIs make writing tests like this easy, and update this test to use them.
		const provider = new TestTreeProviderLite(3);
		const [treeA, treeB, treeC] = provider.trees;
		const synchronizeTrees = () => {
			provider.synchronizeMessages();
		};

		// Initialize with schema A.
		const configA = new TreeViewConfiguration({
			schema: schemaA,
		});
		const viewA = treeA.viewWith(configA);
		viewA.initialize(5);

		synchronizeTrees();

		assert.deepEqual(viewA.root, 5);

		// View same document in a second tree using schema B.
		const configB = new TreeViewConfiguration({
			schema: schemaB,
		});
		const viewB = treeB.viewWith(configB);
		// B cannot write strings to the root.
		assert.throws(() => (viewB.root = "test"));

		// View same document with third tree using schema C.
		const configC = new TreeViewConfiguration({
			schema: schemaC,
		});
		const viewC = treeC.viewWith(configC);
		// Upgrade to schema C
		viewC.upgradeSchema();
		// Use the newly enabled schema.
		viewC.root = "test";

		synchronizeTrees();

		// View A is now incompatible with the stored schema:
		assert.equal(viewA.compatibility.canView, false);

		// View B can still read the document, and now sees the string root which relies on the staged schema.
		assert.deepEqual(viewB.root, "test");
	});

	it("using independent view user apis", () => {
		// initialize with schema A
		const configA = new TreeViewConfigurationAlpha({
			schema: schemaA,
		});

		const viewA = independentView(configA, {});
		viewA.initialize(5);

		assert.deepEqual(viewA.root, 5);

		// view second tree with schema B
		const configB = new TreeViewConfigurationAlpha({
			schema: schemaB,
		});

		// TODO: this is a legacy API: we need a stable alternative.
		const idCompressor = createIdCompressor();

		const content: ViewContent = {
			tree: TreeAlpha.exportCompressed(viewA.root, {
				idCompressor,

				// TODO: this should use the framework level options, not this packages temporary placeholder
				oldestCompatibleClient: FluidClientVersion.v2_0,
			}),

			// TODO: we need a way to get the stored schema from independent views. Allow constructing a ViewAbleTree instead of a view directly (maybe an independentTree API?)?
			schema: extractPersistedSchema(configA.schema, FluidClientVersion.v2_0, () => false),
			idCompressor,
		};

		const viewB = independentInitializedView(
			configB,
			{ jsonValidator: typeboxValidator },
			content,
		);
		// check that we can read the tree
		assert.deepEqual(viewB.root, 5);

		// check view A can read the document
		assert.deepEqual(viewA.root, 5);
		// check view B cannot write strings to the root
		assert.throws(() => {
			viewB.root = "test";
		});

		// view third tree with schema C
		const configC = new TreeViewConfigurationAlpha({
			schema: schemaC,
		});

		const viewC = independentInitializedView(
			configC,
			{ jsonValidator: typeboxValidator },
			content,
		);

		assert.equal(viewC.compatibility.canView, false);
		// upgrade to schema C and change the root to a string
		viewC.upgradeSchema();
		viewC.root = "test";
	});

	it("using the schema compatibility tester", () => {
		// start with an empty document:
		const stored = new TestSchemaRepository(defaultSchemaPolicy);
		assert(stored.tryUpdateRootFieldSchema(storedEmptyFieldSchema));

		let view = new SchemaCompatibilityTester(
			new TreeViewConfigurationAlpha({ schema: schemaA }),
		);

		// open document, and check its compatibility with our application
		const compat = view.checkCompatibility(stored);
		assert.deepEqual(compat, { canView: false, canUpgrade: true, isEquivalent: false });
		assert(stored.tryUpdateRootFieldSchema(toUpgradeSchema(schemaA).rootFieldSchema));
		assert(stored.tryUpdateTreeSchema(schemaStatics.number));

		// view schema is A
		assert.deepEqual(view.checkCompatibility(stored), {
			canView: true,
			canUpgrade: true,
			isEquivalent: true,
		});

		// view schema is B (includes staged string)
		view = new SchemaCompatibilityTester(new TreeViewConfigurationAlpha({ schema: schemaB }));
		assert.deepEqual(view.checkCompatibility(stored), {
			canView: true,
			canUpgrade: true,
			isEquivalent: true,
		});

		// upgrade stored to schema B (no-op)
		assert(stored.tryUpdateRootFieldSchema(toUpgradeSchema(schemaB).rootFieldSchema));

		// nothing has changed, so compatibility is the same
		assert.deepEqual(view.checkCompatibility(stored), {
			canView: true,
			canUpgrade: true,
			isEquivalent: true,
		});

		// view schema now wants full support for string (not just staged)
		view = new SchemaCompatibilityTester(new TreeViewConfigurationAlpha({ schema: schemaC }));
		assert.deepEqual(view.checkCompatibility(stored), {
			canView: false,
			canUpgrade: true,
			isEquivalent: false,
		});

		// to full schema C
		assert(stored.tryUpdateRootFieldSchema(toUpgradeSchema(schemaC).rootFieldSchema));
		assert(stored.tryUpdateTreeSchema(schemaStatics.string));

		// validate C is now fully supported
		view = new SchemaCompatibilityTester(new TreeViewConfigurationAlpha({ schema: schemaC }));
		assert.deepEqual(view.checkCompatibility(stored), {
			canView: true,
			canUpgrade: true,
			isEquivalent: true,
		});

		// TODO: TestSchemaRepository is not great for this. Also this does not test view against the future schema versions.
	});
});
