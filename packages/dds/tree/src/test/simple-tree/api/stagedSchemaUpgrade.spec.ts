/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createIdCompressor } from "@fluidframework/id-compressor/internal";

import { FluidClientVersion } from "../../../codec/index.js";
import { storedEmptyFieldSchema } from "../../../core/index.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
import { defaultSchemaPolicy } from "../../../feature-libraries/index.js";
import {
	independentInitializedView,
	independentView,
	TreeAlpha,
	type ViewContent,
} from "../../../shared-tree/index.js";
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

// Some documentation links to this file on GitHub: renaming it may break those links.

describe("staged allowed type upgrade", () => {
	// Schema A: only number allowed
	const schemaA = SchemaFactoryAlpha.optional([SchemaFactoryAlpha.number]);

	// Schema B: number or string (string is staged)
	const schemaB = SchemaFactoryAlpha.optional(
		SchemaFactoryAlpha.types([
			SchemaFactoryAlpha.number,
			SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
		]),
	);

	// Schema C: number or string, both fully allowed
	const schemaC = SchemaFactoryAlpha.optional([
		SchemaFactoryAlpha.number,
		SchemaFactoryAlpha.string,
	]);

	it("using user apis", () => {
		const provider = new TestTreeProviderLite(4);

		const [treeA, treeB1, treeB2, treeC] = provider.trees;

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
		const viewB1 = treeB1.viewWith(configB);
		// check that we can read the tree
		assert.deepEqual(viewB1.root, 5);
		// upgrade to schema B: this is a no-op
		viewB1.upgradeSchema();
		synchronizeTrees();

		// check view A can read the document
		assert.deepEqual(viewA.root, 5);
		// check view B cannot write strings to the root
		assert.throws(() => {
			viewB1.root = "test";
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
		// After the failed write on viewB1, we treat TreeB1 and its view as potentially unsafe to use and instead create a new view from TreeB2.
		const viewB2 = treeB2.viewWith(configB);
		assert.deepEqual(viewB2.root, "test");
		assert.deepEqual(viewC.root, "test");
	});

	it("using user apis: minimal example", () => {
		// This top section of this example uses APIs not available to customers.
		// TODO: We should ensure the customer facing APIs make writing tests like this easy, and update this test to use them.
		const provider = new TestTreeProviderLite(4);
		const [treeA, treeB1, treeB2, treeC] = provider.trees;
		const synchronizeTrees = () => {
			provider.synchronizeMessages();
		};

		// Initialize with schema A.
		const configA = new TreeViewConfiguration({
			schema: schemaA,
		});
		const viewA = treeA.viewWith(configA);
		viewA.initialize(5);

		// Since we are running all the different versions of the app in the same process making changes synchronously,
		// an explicit flush is needed to make them available to each other.
		synchronizeTrees();

		assert.deepEqual(viewA.root, 5);

		// View the same document with a second tree using schema B.
		const configB = new TreeViewConfiguration({
			schema: schemaB,
		});
		const viewB1 = treeB1.viewWith(configB);
		// B cannot write strings to the root.
		assert.throws(() => (viewB1.root = "test"));

		// View the same document with a third tree using schema C.
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

		// Views based on schema B can still read the document, and now see the string root which relies on the staged schema.
		// After the failed write on viewB1, we treat TreeB1 and its view as potentially unsafe to use and instead create a new view from TreeB2.
		const viewB2 = treeB2.viewWith(configB);
		assert.deepEqual(viewB2.root, "test");
	});

	it("using independent view user apis", () => {
		// initialize with schema A
		const configA = new TreeViewConfigurationAlpha({
			schema: schemaA,
		});

		const viewA = independentView(configA);
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
				minVersionForCollab: FluidClientVersion.v2_0,
			}),

			// TODO: we need a way to get the stored schema from independent views. Allow constructing a ViewAbleTree instead of a view directly (maybe an independentTree API?)?
			schema: extractPersistedSchema(configA.schema, FluidClientVersion.v2_0, () => false),
			idCompressor,
		};

		const viewB = independentInitializedView(
			configB,
			{ jsonValidator: FormatValidatorBasic },
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
			{ jsonValidator: FormatValidatorBasic },
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

describe("staged optional upgrade", () => {
	// Schema A: required number (the "before" state of the migration)
	const schemaA = SchemaFactoryAlpha.required(SchemaFactoryAlpha.number);

	// Schema B: staged optional number (deployed during the rollout period)
	const schemaB = SchemaFactoryAlpha.stagedOptional(SchemaFactoryAlpha.number);

	// Schema C: fully optional number (the "after" state once all clients are updated)
	const schemaC = SchemaFactoryAlpha.optional([SchemaFactoryAlpha.number]);

	it("using user apis", () => {
		const provider = new TestTreeProviderLite(4);
		const [treeA, treeB1, treeB2, treeC] = provider.trees;
		const synchronizeTrees = () => {
			provider.synchronizeMessages();
		};

		// Initialize with schema A (required number)
		const configA = new TreeViewConfiguration({ schema: schemaA });
		const viewA = treeA.viewWith(configA);
		viewA.initialize(5);
		synchronizeTrees();

		assert.deepEqual(viewA.root, 5);

		// View with schema B (staged optional) — can read the document
		const configB = new TreeViewConfiguration({ schema: schemaB });
		const viewB1 = treeB1.viewWith(configB);
		assert.deepEqual(viewB1.root, 5);

		// Upgrade with B is a no-op — stored schema stays as required(number)
		viewB1.upgradeSchema();
		synchronizeTrees();

		// Old clients (schema A) can still view
		assert.deepEqual(viewA.root, 5);

		// Schema B cannot write undefined to the root — stored schema is still required
		assert.throws(() => {
			viewB1.root = undefined;
		});

		// View with schema C, upgrade to optional, and clear the root
		const configC = new TreeViewConfiguration({ schema: schemaC });
		const viewC = treeC.viewWith(configC);
		viewC.upgradeSchema();
		viewC.root = undefined;
		synchronizeTrees();

		// Schema A clients are now incompatible (required vs optional stored)
		assert.equal(viewA.compatibility.canView, false);

		// Schema B clients can still view the document (optional stored matches staged optional view)
		const viewB2 = treeB2.viewWith(configB);
		assert.deepEqual(viewB2.root, undefined);
	});

	it("using the schema compatibility tester", () => {
		// Start with stored schema A (required number)
		const stored = new TestSchemaRepository(defaultSchemaPolicy, toUpgradeSchema(schemaA));

		// View A: can view, can upgrade (no-op), is equivalent
		let view = new SchemaCompatibilityTester(
			new TreeViewConfigurationAlpha({ schema: schemaA }),
		);
		assert.deepEqual(view.checkCompatibility(stored), {
			canView: true,
			canUpgrade: true,
			isEquivalent: true,
		});

		// View B (staged optional): can view required stored, upgrade is a no-op
		view = new SchemaCompatibilityTester(new TreeViewConfigurationAlpha({ schema: schemaB }));
		assert.deepEqual(view.checkCompatibility(stored), {
			canView: true,
			canUpgrade: true,
			isEquivalent: true,
		});

		// Upgrading with B is a no-op — stored stays required
		assert(stored.tryUpdateRootFieldSchema(toUpgradeSchema(schemaB).rootFieldSchema));
		assert.deepEqual(view.checkCompatibility(stored), {
			canView: true,
			canUpgrade: true,
			isEquivalent: true,
		});

		// View C (fully optional) cannot yet view a required stored field
		view = new SchemaCompatibilityTester(new TreeViewConfigurationAlpha({ schema: schemaC }));
		assert.deepEqual(view.checkCompatibility(stored), {
			canView: false,
			canUpgrade: true,
			isEquivalent: false,
		});

		// Upgrade stored to optional (schema C)
		assert(stored.tryUpdateRootFieldSchema(toUpgradeSchema(schemaC).rootFieldSchema));

		// View C is now compatible and equivalent
		assert.deepEqual(view.checkCompatibility(stored), {
			canView: true,
			canUpgrade: true,
			isEquivalent: true,
		});

		// View B after full upgrade: can view (optional kinds match), but upgrade target
		// is required which is no longer a valid upgrade from optional stored
		view = new SchemaCompatibilityTester(new TreeViewConfigurationAlpha({ schema: schemaB }));
		assert.deepEqual(view.checkCompatibility(stored), {
			canView: true,
			canUpgrade: false,
			isEquivalent: false,
		});

		// View A (required) is no longer compatible with optional stored
		view = new SchemaCompatibilityTester(new TreeViewConfigurationAlpha({ schema: schemaA }));
		assert.deepEqual(view.checkCompatibility(stored), {
			canView: false,
			canUpgrade: false,
			isEquivalent: false,
		});
	});

	it("allows constructing unhydrated nodes with an empty staged optional field", () => {
		const sf = new SchemaFactoryAlpha("stagedOptionalConstructionTest");
		class Foo extends sf.objectAlpha("Foo", { value: sf.number }) {}
		class Obj extends sf.objectAlpha("Obj", { foo: sf.stagedOptional(Foo) }) {}

		// Analogous to new SomeObj({ staged_field: new StagedType() }) for staged allowed types:
		// constructing an unhydrated node with the staged value provided is allowed.
		const nodeWithValue = new Obj({ foo: new Foo({ value: 42 }) });
		assert(nodeWithValue instanceof Obj);

		// Analogous to constructing with the staged type omitted or explicitly undefined:
		// the field is Optional in the view schema, so construction succeeds.
		// (Insertion into a Required stored field would fail, just as inserting a staged type fails.)
		const nodeOmitted = new Obj({});
		assert(nodeOmitted instanceof Obj);

		const nodeUndefined = new Obj({ foo: undefined });
		assert(nodeUndefined instanceof Obj);
	});
});
