/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
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

	it("using user apis", () => {
		const provider = new TestTreeProviderLite(3);

		// initialize with schema A
		const configA = new TreeViewConfiguration({
			schema: schemaA,
		});
		const viewA = provider.trees[0].viewWith(configA);
		viewA.initialize(5);
		provider.synchronizeMessages();

		assert.deepEqual(viewA.root, 5);

		// view second tree with schema B
		const configB = new TreeViewConfiguration({
			schema: schemaB,
		});
		const viewB = provider.trees[1].viewWith(configB);
		// check that we can read the tree
		assert.deepEqual(viewB.root, 5);
		// upgrade to schema B
		viewB.upgradeSchema();
		provider.synchronizeMessages();

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
		const viewC = provider.trees[2].viewWith(configC);
		// upgrade to schema C and change the root to a string
		viewC.upgradeSchema();
		viewC.root = "test";
		provider.synchronizeMessages();

		// view A is now incompatible with the stored schema
		assert.equal(viewA.compatibility.canView, false);
		assert.deepEqual(viewB.root, "test");
		assert.deepEqual(viewC.root, "test");
	});
});
