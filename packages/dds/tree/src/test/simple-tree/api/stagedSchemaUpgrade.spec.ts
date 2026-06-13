/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createIdCompressor } from "@fluidframework/id-compressor/internal";

import { asAlpha } from "../../../api.js";
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
	type ValidateRecursiveSchema,
} from "../../../simple-tree/index.js";
import { TestSchemaRepository, TestTreeProviderLite } from "../../utils.js";

// Some documentation links to this file on GitHub: renaming it may break those links.

describe("runtime schema upgrade API", () => {
	const stagedString = SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string);
	const stringUpgrade = stagedString.metadata.stagedSchemaUpgrade;
	assert(stringUpgrade !== undefined);

	// Schema B: number or string (string is staged)
	const schemaB = SchemaFactoryAlpha.optional(
		SchemaFactoryAlpha.types([SchemaFactoryAlpha.number, stagedString]),
	);

	it("initialize can enable a staged schema upgrade", () => {
		const view = independentView(
			new TreeViewConfigurationAlpha({
				schema: schemaB,
			}),
		);

		view.initialize("test", { enableFooUpgrade: stringUpgrade });

		assert.equal(view.root, "test");
	});

	it("initialize without upgrades keeps staged schema upgrades disabled", () => {
		const view = independentView(
			new TreeViewConfigurationAlpha({
				schema: schemaB,
			}),
		);

		assert.throws(() => view.initialize("test"));
	});
});

describe("staged allowed type upgrade", () => {
	// Schema A: only number allowed
	const schemaA = SchemaFactoryAlpha.optional([SchemaFactoryAlpha.number]);

	const stagedString = SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string);
	const stringUpgrade = stagedString.metadata.stagedSchemaUpgrade;
	assert(stringUpgrade !== undefined);

	// Schema B: number or string (string is staged)
	const schemaB = SchemaFactoryAlpha.optional(
		SchemaFactoryAlpha.types([SchemaFactoryAlpha.number, stagedString]),
	);

	// Schema C: number or string, both fully allowed
	const schemaC = SchemaFactoryAlpha.optional([
		SchemaFactoryAlpha.number,
		SchemaFactoryAlpha.string,
	]);

	it("using user apis", () => {
		const provider = new TestTreeProviderLite(4);

		const [treeA, treeB1, treeB2, treeB3] = provider.trees;

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

		const viewB2 = asAlpha(treeB2.viewWith(configB));
		viewB2.upgradeSchema({ enableFooUpgrade: stringUpgrade });
		viewB2.root = "test";
		synchronizeTrees();

		// view A is now incompatible with the stored schema
		assert.equal(viewA.compatibility.canView, false);
		// After the failed write on viewB1, we treat TreeB1 and its view as potentially unsafe to use and instead create a new view from TreeB2.
		const viewB3 = treeB3.viewWith(configB);
		assert.deepEqual(viewB3.root, "test");
		assert.deepEqual(viewB2.root, "test");
	});

	it("using user apis: minimal example", () => {
		// This top section of this example uses APIs not available to customers.
		// TODO: We should ensure the customer facing APIs make writing tests like this easy, and update this test to use them.
		const provider = new TestTreeProviderLite(3);
		const [treeA, treeB1, treeB2] = provider.trees;
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

		const viewB2 = asAlpha(treeB2.viewWith(configB));
		viewB2.upgradeSchema({ enableFooUpgrade: stringUpgrade });
		// Use the newly enabled schema.
		viewB2.root = "test";

		synchronizeTrees();

		// View A is now incompatible with the stored schema:
		assert.equal(viewA.compatibility.canView, false);

		// Views based on schema B can still read the document, and now see the string root which relies on the staged schema.
		assert.deepEqual(viewB2.root, "test");
	});

	it("supports removing the staged allowed type wrapper after full migration", () => {
		const provider = new TestTreeProviderLite(3);
		const [treeA, treeB, treeC] = provider.trees;

		const viewA = treeA.viewWith(new TreeViewConfiguration({ schema: schemaA }));
		viewA.initialize(5);
		provider.synchronizeMessages();

		const viewB = asAlpha(treeB.viewWith(new TreeViewConfiguration({ schema: schemaB })));
		viewB.upgradeSchema({ enableFooUpgrade: stringUpgrade });
		viewB.root = "test";
		provider.synchronizeMessages();

		const viewC = treeC.viewWith(new TreeViewConfiguration({ schema: schemaC }));
		assert.equal(viewC.compatibility.isEquivalent, true);
		viewC.upgradeSchema();
		assert.equal(viewC.root, "test");
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

	it("checks compatibility through staged allowed type rollout", () => {
		// SchemaCompatibilityTester only checks compatibility against a supplied stored schema.
		// It does not run the TreeView.upgradeSchema path, so this test simulates each stored
		// schema state directly.
		const stored = new TestSchemaRepository(defaultSchemaPolicy);
		assert(stored.tryUpdateRootFieldSchema(storedEmptyFieldSchema));

		const expectCompatibility = (
			schema: typeof schemaA | typeof schemaB | typeof schemaC,
			expected: ReturnType<SchemaCompatibilityTester["checkCompatibility"]>,
		): void => {
			const view = new SchemaCompatibilityTester(new TreeViewConfigurationAlpha({ schema }));
			assert.deepEqual(view.checkCompatibility(stored), expected);
		};

		expectCompatibility(schemaA, {
			canView: false,
			canUpgrade: true,
			isEquivalent: false,
		});

		assert(stored.tryUpdateRootFieldSchema(toUpgradeSchema(schemaA).rootFieldSchema));
		assert(stored.tryUpdateTreeSchema(schemaStatics.number));

		// Schema A is equivalent to the initial stored schema.
		expectCompatibility(schemaA, {
			canView: true,
			canUpgrade: true,
			isEquivalent: true,
		});

		// Schema B can view schema A and its default upgrade remains a no-op because the
		// string allowed type is still staged.
		expectCompatibility(schemaB, {
			canView: true,
			canUpgrade: true,
			isEquivalent: true,
		});
		assert(stored.tryUpdateRootFieldSchema(toUpgradeSchema(schemaB).rootFieldSchema));
		expectCompatibility(schemaB, {
			canView: true,
			canUpgrade: true,
			isEquivalent: true,
		});

		// Schema C represents the code-cleanup state where the staged wrapper has been removed.
		// It is not compatible until the stored schema also allows strings.
		expectCompatibility(schemaC, {
			canView: false,
			canUpgrade: true,
			isEquivalent: false,
		});

		assert(stored.tryUpdateRootFieldSchema(toUpgradeSchema(schemaC).rootFieldSchema));
		assert(stored.tryUpdateTreeSchema(schemaStatics.string));

		expectCompatibility(schemaC, {
			canView: true,
			canUpgrade: true,
			isEquivalent: true,
		});
	});
});

describe("staged optional upgrade", () => {
	// Schema A: required number (the "before" state of the migration)
	const schemaA = SchemaFactoryAlpha.required(SchemaFactoryAlpha.number);

	// Schema B: staged optional number (deployed during the rollout period)
	const schemaB = SchemaFactoryAlpha.stagedOptional(SchemaFactoryAlpha.number);
	const optionalUpgrade = schemaB.isStagedOptional;
	assert(optionalUpgrade !== false);

	// Schema C: fully optional number (the "after" state once all clients are updated)
	const schemaC = SchemaFactoryAlpha.optional([SchemaFactoryAlpha.number]);

	it("using user apis", () => {
		const provider = new TestTreeProviderLite(4);
		const [treeA, treeB1, treeB2, treeB3] = provider.trees;
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

		const viewB2 = asAlpha(treeB2.viewWith(configB));
		viewB2.upgradeSchema({ enableFooUpgrade: optionalUpgrade });
		viewB2.root = undefined;
		synchronizeTrees();

		// Schema A clients are now incompatible (required vs optional stored)
		assert.equal(viewA.compatibility.canView, false);

		// Schema B clients can still view the document (optional stored matches staged optional view)
		const viewB3 = treeB3.viewWith(configB);
		assert.deepEqual(viewB3.root, undefined);
	});

	it("supports removing the staged optional marker after full migration", () => {
		const provider = new TestTreeProviderLite(3);
		const [treeA, treeB, treeC] = provider.trees;

		const viewA = treeA.viewWith(new TreeViewConfiguration({ schema: schemaA }));
		viewA.initialize(5);
		provider.synchronizeMessages();

		const viewB = asAlpha(treeB.viewWith(new TreeViewConfiguration({ schema: schemaB })));
		viewB.upgradeSchema({ enableFooUpgrade: optionalUpgrade });
		viewB.root = undefined;
		provider.synchronizeMessages();

		const viewC = treeC.viewWith(new TreeViewConfiguration({ schema: schemaC }));
		assert.equal(viewC.compatibility.isEquivalent, true);
		viewC.upgradeSchema();
		assert.equal(viewC.root, undefined);
	});

	it("checks compatibility through staged optional rollout", () => {
		// SchemaCompatibilityTester only checks compatibility against a supplied stored schema.
		// It does not run the TreeView.upgradeSchema path, so this test simulates each stored
		// schema state directly.
		const stored = new TestSchemaRepository(defaultSchemaPolicy, toUpgradeSchema(schemaA));

		const expectCompatibility = (
			schema: typeof schemaA | typeof schemaB | typeof schemaC,
			expected: ReturnType<SchemaCompatibilityTester["checkCompatibility"]>,
		): void => {
			const view = new SchemaCompatibilityTester(new TreeViewConfigurationAlpha({ schema }));
			assert.deepEqual(view.checkCompatibility(stored), expected);
		};

		// Schema A is equivalent to the initial required-number stored schema.
		expectCompatibility(schemaA, {
			canView: true,
			canUpgrade: true,
			isEquivalent: true,
		});

		// Schema B can view the required stored schema and its default upgrade remains a no-op
		// because the optional field kind is still staged.
		expectCompatibility(schemaB, {
			canView: true,
			canUpgrade: true,
			isEquivalent: true,
		});
		assert(stored.tryUpdateRootFieldSchema(toUpgradeSchema(schemaB).rootFieldSchema));
		expectCompatibility(schemaB, {
			canView: true,
			canUpgrade: true,
			isEquivalent: true,
		});

		// Schema C represents the code-cleanup state where the staged optional marker has been
		// removed. It is not compatible until the stored schema also has an optional root.
		expectCompatibility(schemaC, {
			canView: false,
			canUpgrade: true,
			isEquivalent: false,
		});

		assert(stored.tryUpdateRootFieldSchema(toUpgradeSchema(schemaC).rootFieldSchema));

		expectCompatibility(schemaC, {
			canView: true,
			canUpgrade: true,
			isEquivalent: true,
		});

		// Schema B after full upgrade can view the optional stored schema, but its default
		// upgrade target is required, which is no longer a valid upgrade from optional stored.
		expectCompatibility(schemaB, {
			canView: true,
			canUpgrade: false,
			isEquivalent: false,
		});

		// Schema A is no longer compatible with optional stored schema.
		expectCompatibility(schemaA, {
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

	it("works with stagedOptionalRecursive in a recursive schema", () => {
		const sf = new SchemaFactoryAlpha("stagedOptionalRecursiveTest");

		// A recursive node whose `child` field goes through the staged optional migration.
		// Schema A: child is required (the "before" state).
		class NodeA extends sf.objectRecursiveAlpha("TreeNode", {
			value: sf.number,
			child: sf.optionalRecursive([() => NodeA]),
		}) {}
		{
			type _check = ValidateRecursiveSchema<typeof NodeA>;
		}

		// Schema B: child is stagedOptionalRecursive (during the rollout period).
		class NodeB extends sf.objectRecursiveAlpha("TreeNode", {
			value: sf.number,
			child: sf.stagedOptionalRecursive([() => NodeB]),
		}) {}
		{
			type _check = ValidateRecursiveSchema<typeof NodeB>;
		}

		// Verify unhydrated construction works for both present and absent child.
		const withChild = new NodeB({
			value: 1,
			child: new NodeB({ value: 2, child: undefined }),
		});
		assert(withChild instanceof NodeB);
		assert.equal(withChild.value, 1);

		const withoutChild = new NodeB({ value: 3, child: undefined });
		assert(withoutChild instanceof NodeB);

		const omittedChild = new NodeB({ value: 4 });
		assert(omittedChild instanceof NodeB);
	});
});
