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
	checkSchemaCompatibility,
	extractPersistedSchema,
	SchemaFactoryAlpha,
	schemaStatics,
	StagedSchemaUpgradePolicy,
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

	// Schema with a staged string type: number or string (string is staged)
	const schemaWithStagedType = SchemaFactoryAlpha.optional(
		SchemaFactoryAlpha.types([SchemaFactoryAlpha.number, stagedString]),
	);

	it("initialize can enable a staged schema upgrade", () => {
		const view = independentView(
			new TreeViewConfigurationAlpha({
				schema: schemaWithStagedType,
				stagedUpgradePolicy: StagedSchemaUpgradePolicy.enabledStagedUpgrades(stringUpgrade),
			}),
		);

		view.initialize("test");

		assert.equal(view.root, "test");
	});

	it("initialize can enable a staged schema upgrade via stagedUpgradePolicy", () => {
		const enabled = new Set([stringUpgrade]);
		const view = independentView(
			new TreeViewConfigurationAlpha({
				schema: schemaWithStagedType,
				stagedUpgradePolicy: {
					includeStaged: (upgrade) => enabled.has(upgrade),
					includeStagedOptional: (upgrade) => enabled.has(upgrade),
				},
			}),
		);

		view.initialize("test");

		assert.equal(view.root, "test");
	});

	it("initialize without upgrades keeps staged schema upgrades disabled", () => {
		const view = independentView(
			new TreeViewConfigurationAlpha({
				schema: schemaWithStagedType,
			}),
		);

		assert.throws(() => view.initialize("test"));
	});
});

describe("staged allowed type upgrade", () => {
	// Base schema: only number allowed
	const baseSchema = SchemaFactoryAlpha.optional([SchemaFactoryAlpha.number]);

	const stagedString = SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string);
	const stringUpgrade = stagedString.metadata.stagedSchemaUpgrade;
	assert(stringUpgrade !== undefined);

	// Schema with staged type: number or string (string is staged)
	const schemaWithStagedType = SchemaFactoryAlpha.optional(
		SchemaFactoryAlpha.types([SchemaFactoryAlpha.number, stagedString]),
	);

	// Fully migrated schema: number or string, both fully allowed
	const fullyMigratedSchema = SchemaFactoryAlpha.optional([
		SchemaFactoryAlpha.number,
		SchemaFactoryAlpha.string,
	]);

	it("using user apis", () => {
		const provider = new TestTreeProviderLite(4);

		const [treeBase, treeStaged1, treeStaged2, treeStaged3] = provider.trees;

		const synchronizeTrees = () => {
			provider.synchronizeMessages();
		};

		// initialize with baseSchema
		const configBase = new TreeViewConfiguration({
			schema: baseSchema,
		});
		const viewBase = treeBase.viewWith(configBase);
		viewBase.initialize(5);
		synchronizeTrees();

		assert.deepEqual(viewBase.root, 5);

		// view second tree with schemaWithStagedType
		const configStaged = new TreeViewConfiguration({
			schema: schemaWithStagedType,
		});
		const viewStaged1 = treeStaged1.viewWith(configStaged);
		// check that we can read the tree
		assert.deepEqual(viewStaged1.root, 5);
		// upgrade to schemaWithStagedType: this is a no-op
		viewStaged1.upgradeSchema();
		synchronizeTrees();

		// check baseSchema view can read the document
		assert.deepEqual(viewBase.root, 5);
		// check schemaWithStagedType view cannot write strings to the root
		assert.throws(() => {
			viewStaged1.root = "test";
		});

		const viewStaged2 = treeStaged2.viewWith(
			new TreeViewConfigurationAlpha({
				schema: schemaWithStagedType,
				stagedUpgradePolicy: StagedSchemaUpgradePolicy.enabledStagedUpgrades(stringUpgrade),
			}),
		);
		viewStaged2.upgradeSchema();
		viewStaged2.root = "test";
		synchronizeTrees();

		// baseSchema view is now incompatible with the stored schema
		assert.equal(viewBase.compatibility.canView, false);
		// After the failed write on viewStaged1, we treat treeStaged1 and its view as potentially unsafe to use and instead create a new view from treeStaged2.
		const viewStaged3 = treeStaged3.viewWith(configStaged);
		assert.deepEqual(viewStaged3.root, "test");
		assert.deepEqual(viewStaged2.root, "test");
	});

	it("using user apis: minimal example", () => {
		// This top section of this example uses APIs not available to customers.
		// TODO: We should ensure the customer facing APIs make writing tests like this easy, and update this test to use them.
		const provider = new TestTreeProviderLite(3);
		const [treeBase, treeStaged1, treeStaged2] = provider.trees;
		const synchronizeTrees = () => {
			provider.synchronizeMessages();
		};

		// Initialize with baseSchema.
		const configBase = new TreeViewConfiguration({
			schema: baseSchema,
		});
		const viewBase = treeBase.viewWith(configBase);
		viewBase.initialize(5);

		// Since we are running all the different versions of the app in the same process making changes synchronously,
		// an explicit flush is needed to make them available to each other.
		synchronizeTrees();

		assert.deepEqual(viewBase.root, 5);

		// View the same document with a second tree using schemaWithStagedType.
		const configStaged = new TreeViewConfiguration({
			schema: schemaWithStagedType,
		});
		const viewStaged1 = treeStaged1.viewWith(configStaged);
		// B cannot write strings to the root.
		assert.throws(() => (viewStaged1.root = "test"));

		const viewStaged2 = treeStaged2.viewWith(
			new TreeViewConfigurationAlpha({
				schema: schemaWithStagedType,
				stagedUpgradePolicy: StagedSchemaUpgradePolicy.enabledStagedUpgrades(stringUpgrade),
			}),
		);
		viewStaged2.upgradeSchema();
		// Use the newly enabled schema.
		viewStaged2.root = "test";

		synchronizeTrees();

		// baseSchema view is now incompatible with the stored schema:
		assert.equal(viewBase.compatibility.canView, false);

		// Views based on schemaWithStagedType views can still read the document, and now see the string root which relies on the staged schema.
		assert.deepEqual(viewStaged2.root, "test");
	});

	it("supports removing the staged allowed type wrapper after full migration", () => {
		const provider = new TestTreeProviderLite(3);
		const [treeBase, treeStaged, treeMigrated] = provider.trees;

		const viewBase = treeBase.viewWith(new TreeViewConfiguration({ schema: baseSchema }));
		viewBase.initialize(5);
		provider.synchronizeMessages();

		const viewStaged = treeStaged.viewWith(
			new TreeViewConfigurationAlpha({
				schema: schemaWithStagedType,
				stagedUpgradePolicy: StagedSchemaUpgradePolicy.enabledStagedUpgrades(stringUpgrade),
			}),
		);
		viewStaged.upgradeSchema();
		viewStaged.root = "test";
		provider.synchronizeMessages();

		const viewMigrated = treeMigrated.viewWith(
			new TreeViewConfiguration({ schema: fullyMigratedSchema }),
		);
		assert.equal(viewMigrated.compatibility.isEquivalent, true);
		viewMigrated.upgradeSchema();
		assert.equal(viewMigrated.root, "test");
	});

	it("using independent view user apis", () => {
		// initialize with baseSchema
		const configBase = new TreeViewConfigurationAlpha({
			schema: baseSchema,
		});

		const viewBase = independentView(configBase);
		viewBase.initialize(5);

		assert.deepEqual(viewBase.root, 5);

		// view second tree with schemaWithStagedType
		const configStaged = new TreeViewConfigurationAlpha({
			schema: schemaWithStagedType,
		});

		// TODO: this is a legacy API: we need a stable alternative.
		const idCompressor = createIdCompressor();

		const content: ViewContent = {
			tree: TreeAlpha.exportCompressed(viewBase.root, {
				idCompressor,

				// TODO: this should use the framework level options, not this packages temporary placeholder
				minVersionForCollab: FluidClientVersion.v2_0,
			}),

			// TODO: we need a way to get the stored schema from independent views. Allow constructing a ViewAbleTree instead of a view directly (maybe an independentTree API?)?
			schema: extractPersistedSchema(configBase.schema, FluidClientVersion.v2_0, () => false),
			idCompressor,
		};

		const viewStaged = independentInitializedView(
			configStaged,
			{ jsonValidator: FormatValidatorBasic },
			content,
		);
		// check that we can read the tree
		assert.deepEqual(viewStaged.root, 5);

		// check baseSchema view can read the document
		assert.deepEqual(viewBase.root, 5);
		// check schemaWithStagedType view cannot write strings to the root
		assert.throws(() => {
			viewStaged.root = "test";
		});

		// view third tree with fullyMigratedSchema
		const configMigrated = new TreeViewConfigurationAlpha({
			schema: fullyMigratedSchema,
		});

		const viewMigrated = independentInitializedView(
			configMigrated,
			{ jsonValidator: FormatValidatorBasic },
			content,
		);

		assert.equal(viewMigrated.compatibility.canView, false);
		// upgrade to fullyMigratedSchema and change the root to a string
		viewMigrated.upgradeSchema();
		viewMigrated.root = "test";
	});

	it("checks compatibility through staged allowed type rollout", () => {
		// checkSchemaCompatibility only checks compatibility against a supplied stored schema.
		// It does not run the TreeView.upgradeSchema path, so this test simulates each stored
		// schema state directly.
		const stored = new TestSchemaRepository(defaultSchemaPolicy);
		assert(stored.tryUpdateRootFieldSchema(storedEmptyFieldSchema));

		const expectCompatibility = (
			schema: typeof baseSchema | typeof schemaWithStagedType | typeof fullyMigratedSchema,
			expected: ReturnType<typeof checkSchemaCompatibility>,
		): void => {
			assert.deepEqual(
				checkSchemaCompatibility(new TreeViewConfigurationAlpha({ schema }), stored),
				expected,
			);
		};

		expectCompatibility(baseSchema, {
			canView: false,
			canUpgrade: true,
			isEquivalent: false,
		});

		assert(stored.tryUpdateRootFieldSchema(toUpgradeSchema(baseSchema).rootFieldSchema));
		assert(stored.tryUpdateTreeSchema(schemaStatics.number));

		// baseSchema is equivalent to the initial stored schema.
		expectCompatibility(baseSchema, {
			canView: true,
			canUpgrade: true,
			isEquivalent: true,
		});

		// schemaWithStagedType can view baseSchema and its default upgrade remains a no-op because the
		// string allowed type is still staged.
		expectCompatibility(schemaWithStagedType, {
			canView: true,
			canUpgrade: true,
			isEquivalent: true,
		});
		assert(
			stored.tryUpdateRootFieldSchema(toUpgradeSchema(schemaWithStagedType).rootFieldSchema),
		);
		expectCompatibility(schemaWithStagedType, {
			canView: true,
			canUpgrade: true,
			isEquivalent: true,
		});

		// fullyMigratedSchema represents the code-cleanup state where the staged wrapper has been removed.
		// It is not compatible until the stored schema also allows strings.
		expectCompatibility(fullyMigratedSchema, {
			canView: false,
			canUpgrade: true,
			isEquivalent: false,
		});

		assert(
			stored.tryUpdateRootFieldSchema(toUpgradeSchema(fullyMigratedSchema).rootFieldSchema),
		);
		assert(stored.tryUpdateTreeSchema(schemaStatics.string));

		expectCompatibility(fullyMigratedSchema, {
			canView: true,
			canUpgrade: true,
			isEquivalent: true,
		});
	});
});

describe("staged optional upgrade", () => {
	// Required number (the "before" state of the migration)
	const requiredSchema = SchemaFactoryAlpha.required(SchemaFactoryAlpha.number);

	// Staged optional number (deployed during the rollout period)
	const stagedOptionalSchema = SchemaFactoryAlpha.stagedOptional(SchemaFactoryAlpha.number);
	const optionalUpgrade = stagedOptionalSchema.isStagedOptional;
	assert(optionalUpgrade !== false);

	// Fully optional number (the "after" state once all clients are updated)
	const optionalSchema = SchemaFactoryAlpha.optional([SchemaFactoryAlpha.number]);

	it("using user apis", () => {
		const provider = new TestTreeProviderLite(4);
		const [treeRequired, treeStaged1, treeStaged2, treeStaged3] = provider.trees;
		const synchronizeTrees = () => {
			provider.synchronizeMessages();
		};

		// Initialize with requiredSchema
		const configRequired = new TreeViewConfiguration({ schema: requiredSchema });
		const viewRequired = treeRequired.viewWith(configRequired);
		viewRequired.initialize(5);
		synchronizeTrees();

		assert.deepEqual(viewRequired.root, 5);

		// View with stagedOptionalSchema — can read the document
		const configStaged = new TreeViewConfiguration({ schema: stagedOptionalSchema });
		const viewStaged1 = treeStaged1.viewWith(configStaged);
		assert.deepEqual(viewStaged1.root, 5);

		// Upgrade with B is a no-op — stored schema stays as required(number)
		viewStaged1.upgradeSchema();
		synchronizeTrees();

		// Old clients (requiredSchema) can still view
		assert.deepEqual(viewRequired.root, 5);

		// stagedOptionalSchema cannot write undefined to the root — stored schema is still required
		assert.throws(() => {
			viewStaged1.root = undefined;
		});

		const viewStaged2 = treeStaged2.viewWith(
			new TreeViewConfigurationAlpha({
				schema: stagedOptionalSchema,
				stagedUpgradePolicy: StagedSchemaUpgradePolicy.enabledStagedUpgrades(optionalUpgrade),
			}),
		);
		viewStaged2.upgradeSchema();
		viewStaged2.root = undefined;
		synchronizeTrees();

		// requiredSchema clients are now incompatible (required vs optional stored)
		assert.equal(viewRequired.compatibility.canView, false);

		// stagedOptionalSchema clients can still view the document (optional stored matches staged optional view)
		const viewStaged3 = treeStaged3.viewWith(configStaged);
		assert.deepEqual(viewStaged3.root, undefined);
	});

	it("supports removing the staged optional marker after full migration", () => {
		const provider = new TestTreeProviderLite(3);
		const [treeRequired, treeStaged, treeOptional] = provider.trees;

		const viewRequired = treeRequired.viewWith(
			new TreeViewConfiguration({ schema: requiredSchema }),
		);
		viewRequired.initialize(5);
		provider.synchronizeMessages();

		const viewStaged = treeStaged.viewWith(
			new TreeViewConfigurationAlpha({
				schema: stagedOptionalSchema,
				stagedUpgradePolicy: StagedSchemaUpgradePolicy.enabledStagedUpgrades(optionalUpgrade),
			}),
		);
		viewStaged.upgradeSchema();
		viewStaged.root = undefined;
		provider.synchronizeMessages();

		const viewOptional = treeOptional.viewWith(
			new TreeViewConfiguration({ schema: optionalSchema }),
		);
		assert.equal(viewOptional.compatibility.isEquivalent, true);
		viewOptional.upgradeSchema();
		assert.equal(viewOptional.root, undefined);
	});

	it("throws when a view without upgrades tries to upgradeSchema on a document already upgraded by another view", () => {
		const provider = new TestTreeProviderLite(3);
		const [treeRequired, treeStaged, treeOptional] = provider.trees;

		const viewRequired = treeRequired.viewWith(
			new TreeViewConfiguration({ schema: requiredSchema }),
		);
		viewRequired.initialize(5);
		provider.synchronizeMessages();

		// View with upgrade enabled — upgrades the document.
		const viewStaged = treeStaged.viewWith(
			new TreeViewConfigurationAlpha({
				schema: stagedOptionalSchema,
				stagedUpgradePolicy: StagedSchemaUpgradePolicy.enabledStagedUpgrades(optionalUpgrade),
			}),
		);
		viewStaged.upgradeSchema();
		viewStaged.dispose();
		provider.synchronizeMessages();

		// A new view without the upgrade token cannot upgrade further — the stored schema already has the upgrade
		// and the new target (without the token) would narrow it.
		const viewStagedNarrow = treeOptional.viewWith(
			new TreeViewConfigurationAlpha({ schema: stagedOptionalSchema }),
		);
		assert.throws(
			() => viewStagedNarrow.upgradeSchema(),
			/cannot be upgraded to the requested schema/,
		);
	});

	it("checks compatibility through staged optional rollout", () => {
		// checkSchemaCompatibility only checks compatibility against a supplied stored schema.
		// It does not run the TreeView.upgradeSchema path, so this test simulates each stored
		// schema state directly.
		const stored = new TestSchemaRepository(
			defaultSchemaPolicy,
			toUpgradeSchema(requiredSchema),
		);

		const expectCompatibility = (
			schema: typeof requiredSchema | typeof stagedOptionalSchema | typeof optionalSchema,
			expected: ReturnType<typeof checkSchemaCompatibility>,
		): void => {
			assert.deepEqual(
				checkSchemaCompatibility(new TreeViewConfigurationAlpha({ schema }), stored),
				expected,
			);
		};

		// baseSchema is equivalent to the initial required-number stored schema.
		expectCompatibility(requiredSchema, {
			canView: true,
			canUpgrade: true,
			isEquivalent: true,
		});

		// stagedOptionalSchema can view the required stored schema and its default upgrade remains a no-op
		// because the optional field kind is still staged.
		expectCompatibility(stagedOptionalSchema, {
			canView: true,
			canUpgrade: true,
			isEquivalent: true,
		});
		assert(
			stored.tryUpdateRootFieldSchema(toUpgradeSchema(stagedOptionalSchema).rootFieldSchema),
		);
		expectCompatibility(stagedOptionalSchema, {
			canView: true,
			canUpgrade: true,
			isEquivalent: true,
		});

		// fullyMigratedSchema represents the code-cleanup state where the staged optional marker has been
		// removed. It is not compatible until the stored schema also has an optional root.
		expectCompatibility(optionalSchema, {
			canView: false,
			canUpgrade: true,
			isEquivalent: false,
		});

		assert(stored.tryUpdateRootFieldSchema(toUpgradeSchema(optionalSchema).rootFieldSchema));

		expectCompatibility(optionalSchema, {
			canView: true,
			canUpgrade: true,
			isEquivalent: true,
		});

		// stagedOptionalSchema after full upgrade can view the optional stored schema, but its default
		// upgrade target is required, which is no longer a valid upgrade from optional stored.
		expectCompatibility(stagedOptionalSchema, {
			canView: true,
			canUpgrade: false,
			isEquivalent: false,
		});

		// requiredSchema is no longer compatible with optional stored schema.
		expectCompatibility(requiredSchema, {
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
