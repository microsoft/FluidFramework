/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	createIdCompressor,
	SerializationVersion,
} from "@fluidframework/id-compressor/internal";

import { asAlpha } from "../../../api.js";
import { FluidClientVersion } from "../../../codec/index.js";
import { storedEmptyFieldSchema } from "../../../core/index.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
import { defaultSchemaPolicy } from "../../../feature-libraries/index.js";
import {
	independentInitializedView,
	createIndependentTreeViewAlpha,
	TreeAlpha,
	type ViewContent,
} from "../../../shared-tree/index.js";
import {
	checkSchemaCompatibility,
	extractPersistedSchema,
	type ImplicitFieldSchema,
	SchemaFactoryAlpha,
	type SchemaUpgrade,
	type StagedUpgradeStatus,
	StagedSchemaUpgradePolicy,
	toUpgradeSchema,
	TreeViewConfiguration,
	TreeViewConfigurationAlpha,
	type ValidateRecursiveSchema,
} from "../../../simple-tree/index.js";
import { expectSchemaEqual, TestSchemaRepository, TestTreeProviderLite } from "../../utils.js";

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
		const view = createIndependentTreeViewAlpha(
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
		const view = createIndependentTreeViewAlpha(
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
		const view = createIndependentTreeViewAlpha(
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

	it("preserves an already enabled allowed type during a default no-op upgrade", () => {
		const provider = new TestTreeProviderLite(3);
		const [treeBase, treeEnabled, treeDefault] = provider.trees;

		const viewBase = treeBase.viewWith(new TreeViewConfiguration({ schema: baseSchema }));
		viewBase.initialize(5);
		provider.synchronizeMessages();

		const viewEnabled = treeEnabled.viewWith(
			new TreeViewConfigurationAlpha({
				schema: schemaWithStagedType,
				stagedUpgradePolicy: StagedSchemaUpgradePolicy.enabledStagedUpgrades(stringUpgrade),
			}),
		);
		viewEnabled.upgradeSchema();
		viewEnabled.dispose();
		provider.synchronizeMessages();

		const viewDefault = treeDefault.viewWith(
			new TreeViewConfigurationAlpha({ schema: schemaWithStagedType }),
		);
		assert.equal(viewDefault.compatibility.canUpgrade, true);
		assert.equal(viewDefault.compatibility.isEquivalent, true);

		const sequenceNumber = provider.sequenceNumber;
		viewDefault.upgradeSchema();
		provider.synchronizeMessages();
		assert.equal(provider.sequenceNumber, sequenceNumber);
		viewDefault.root = "still enabled";
		assert.equal(viewDefault.root, "still enabled");
	});

	it("using independent view user apis", () => {
		// initialize with baseSchema
		const configBase = new TreeViewConfigurationAlpha({
			schema: baseSchema,
		});

		const viewBase = createIndependentTreeViewAlpha(configBase);
		viewBase.initialize(5);

		assert.deepEqual(viewBase.root, 5);

		// view second tree with schemaWithStagedType
		const configStaged = new TreeViewConfigurationAlpha({
			schema: schemaWithStagedType,
		});

		// TODO: this is a legacy API: we need a stable alternative.
		const idCompressor = createIdCompressor(SerializationVersion.V3);

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
		const stored = new TestSchemaRepository(defaultSchemaPolicy);
		assert(stored.tryUpdateRootFieldSchema(storedEmptyFieldSchema));

		const { discrepancies: _discrepancies, ...compatibility } = checkSchemaCompatibility(
			new TreeViewConfigurationAlpha({ schema: baseSchema }),
			stored,
		);
		assert.deepEqual(compatibility, {
			canView: false,
			canUpgrade: true,
			isEquivalent: false,
			enabledUpgrades: new Map(),
		});

		checkStagedRolloutCompatibility({
			baseSchema,
			stagedSchema: schemaWithStagedType,
			fullyMigratedSchema,
			upgrade: stringUpgrade,
		});
	});

	it("can query staged allowed type upgrade enablement", () => {
		const before = createIndependentTreeViewAlpha(
			new TreeViewConfigurationAlpha({
				schema: baseSchema,
			}),
		);
		before.initialize(5);
		assert.equal(before.isStagedUpgradeEnabled(stringUpgrade), "disabled");

		const during = createIndependentTreeViewAlpha(
			new TreeViewConfigurationAlpha({
				schema: schemaWithStagedType,
			}),
		);
		during.initialize(5);
		assert.equal(during.isStagedUpgradeEnabled(stringUpgrade), "disabled");

		const enabled = createIndependentTreeViewAlpha(
			new TreeViewConfigurationAlpha({
				schema: schemaWithStagedType,
				stagedUpgradePolicy: StagedSchemaUpgradePolicy.enabledStagedUpgrades(stringUpgrade),
			}),
		);
		enabled.initialize("test");
		assert.equal(enabled.isStagedUpgradeEnabled(stringUpgrade), "enabled");
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

	it("can query staged optional upgrade enablement", () => {
		const before = createIndependentTreeViewAlpha(
			new TreeViewConfigurationAlpha({
				schema: requiredSchema,
			}),
		);
		before.initialize(5);
		assert.equal(before.isStagedUpgradeEnabled(optionalUpgrade), "disabled");

		const during = createIndependentTreeViewAlpha(
			new TreeViewConfigurationAlpha({
				schema: stagedOptionalSchema,
			}),
		);
		during.initialize(5);
		assert.equal(during.isStagedUpgradeEnabled(optionalUpgrade), "disabled");

		const enabled = createIndependentTreeViewAlpha(
			new TreeViewConfigurationAlpha({
				schema: stagedOptionalSchema,
				stagedUpgradePolicy: StagedSchemaUpgradePolicy.enabledStagedUpgrades(optionalUpgrade),
			}),
		);
		enabled.initialize(undefined);
		assert.equal(enabled.isStagedUpgradeEnabled(optionalUpgrade), "enabled");
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

	it("preserves already enabled optionality during a default no-op upgrade", () => {
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

		// A new view without the upgrade token must preserve optionality already stored in the document.
		const viewStagedDefault = treeOptional.viewWith(
			new TreeViewConfigurationAlpha({ schema: stagedOptionalSchema }),
		);
		assert.equal(viewStagedDefault.compatibility.canUpgrade, true);
		assert.equal(viewStagedDefault.compatibility.isEquivalent, true);
		const sequenceNumber = provider.sequenceNumber;
		viewStagedDefault.upgradeSchema();
		provider.synchronizeMessages();
		assert.equal(provider.sequenceNumber, sequenceNumber);
		viewStagedDefault.root = undefined;
		assert.equal(viewStagedDefault.root, undefined);
	});

	it("can include already enabled upgrades in upgradeSchema", () => {
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
		viewStaged.dispose();
		provider.synchronizeMessages();

		const viewStagedPreserving = treeOptional.viewWith(
			new TreeViewConfigurationAlpha({
				schema: stagedOptionalSchema,
				stagedUpgradePolicy: StagedSchemaUpgradePolicy.restrictive,
			}),
		);
		assert.equal(viewStagedPreserving.compatibility.canUpgrade, true);
		assert.doesNotThrow(() => viewStagedPreserving.upgradeSchema());
	});

	it("checks compatibility through staged optional rollout", () => {
		checkStagedRolloutCompatibility({
			baseSchema: requiredSchema,
			stagedSchema: stagedOptionalSchema,
			fullyMigratedSchema: optionalSchema,
			upgrade: optionalUpgrade,
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

describe("older clients retaining newer document types while enabling staged additions", () => {
	it("preserves array entry types while enabling unassigned priorities", () => {
		const factory = new SchemaFactoryAlpha("arrayPriorityRollout");
		const stagedUnassigned = factory.staged(factory.null);
		const upgrade = stagedUnassigned.metadata.stagedSchemaUpgrade;
		assert(upgrade !== undefined);
		class Before extends factory.array(
			"Priorities",
			factory.types([factory.number, factory.staged(factory.string), stagedUnassigned]),
		) {}

		// Fully enable string priorities in the later schema, without shipping the staged `null` alternative.
		class After extends factory.array("Priorities", [factory.number, factory.string]) {}

		// The older client selects only the `null` token; its candidate must also retain the newer document's strings.
		class Expected extends factory.array("Priorities", [
			factory.number,
			factory.string,
			factory.null,
		]) {}
		const provider = new TestTreeProviderLite(2);
		const [documentTree, upgradingTree] = provider.trees;
		const creator = documentTree.viewWith(new TreeViewConfiguration({ schema: After }));
		creator.initialize(["high", 1]);
		provider.synchronizeMessages();
		creator.dispose();

		// Both older clients support the staged types, but only the upgrading client explicitly enables `null`.
		const observer = documentTree.viewWith(new TreeViewConfiguration({ schema: Before }));
		const older = upgradingTree.viewWith(
			new TreeViewConfigurationAlpha({
				schema: Before,
				stagedUpgradePolicy: StagedSchemaUpgradePolicy.enabledStagedUpgrades(upgrade),
			}),
		);

		assert.equal(older.compatibility.canView, true);
		assert.equal(older.compatibility.canUpgrade, true);
		assert.equal(older.compatibility.isEquivalent, false);
		older.upgradeSchema();
		provider.synchronizeMessages();

		// Verify the actual applied union on both clients, not just the upgrader's compatibility result.
		for (const tree of provider.trees) {
			expectSchemaEqual(tree.kernel.checkout.storedSchema, toUpgradeSchema(Expected));
		}
		assert.deepEqual([...older.root], ["high", 1]);
		older.root.insertAtEnd("low", null);
		provider.synchronizeMessages();
		assert.deepEqual([...observer.root], ["high", 1, "low", null]);
		assert.equal(observer.compatibility.isEquivalent, true);
	});

	it("preserves map entry types while enabling unassigned priorities", () => {
		const factory = new SchemaFactoryAlpha("mapPriorityRollout");
		const stagedUnassigned = factory.staged(factory.null);
		const upgrade = stagedUnassigned.metadata.stagedSchemaUpgrade;
		assert(upgrade !== undefined);
		class Before extends factory.map(
			"Priorities",
			factory.types([factory.number, factory.staged(factory.string), stagedUnassigned]),
		) {}

		// Fully enable string priorities in the later schema, without shipping the staged `null` alternative.
		class After extends factory.map("Priorities", [factory.number, factory.string]) {}

		// The older client selects only the `null` token; its candidate must also retain the newer document's strings.
		class Expected extends factory.map("Priorities", [
			factory.number,
			factory.string,
			factory.null,
		]) {}
		const provider = new TestTreeProviderLite(2);
		const [documentTree, upgradingTree] = provider.trees;
		const creator = documentTree.viewWith(new TreeViewConfiguration({ schema: After }));
		creator.initialize({ primary: "high", fallback: 1 });
		provider.synchronizeMessages();
		creator.dispose();

		// Both older clients support the staged types, but only the upgrading client explicitly enables `null`.
		const observer = documentTree.viewWith(new TreeViewConfiguration({ schema: Before }));
		const older = upgradingTree.viewWith(
			new TreeViewConfigurationAlpha({
				schema: Before,
				stagedUpgradePolicy: StagedSchemaUpgradePolicy.enabledStagedUpgrades(upgrade),
			}),
		);

		assert.equal(older.compatibility.canView, true);
		assert.equal(older.compatibility.canUpgrade, true);
		assert.equal(older.compatibility.isEquivalent, false);
		older.upgradeSchema();
		provider.synchronizeMessages();

		// Verify the actual applied union on both clients and exercise writes using both retained and newly enabled types.
		for (const tree of provider.trees) {
			expectSchemaEqual(tree.kernel.checkout.storedSchema, toUpgradeSchema(Expected));
		}
		assert.equal(older.root.get("primary"), "high");
		older.root.set("primary", "low");
		older.root.set("unassigned", null);
		provider.synchronizeMessages();
		assert.equal(observer.root.get("primary"), "low");
		assert.equal(observer.root.get("fallback"), 1);
		assert.equal(observer.root.get("unassigned"), null);
		assert.equal(observer.compatibility.isEquivalent, true);
	});
});

describe("optional field removal during staged upgrades", () => {
	it("lets an older client restore its optional field while preserving newer fields and permissions", () => {
		const factory = new SchemaFactoryAlpha("taskRollout");

		class Before extends factory.object("Task", {
			priority: factory.types([factory.number, factory.staged(factory.string)]),
			estimatedHours: factory.stagedOptional(factory.number),
			isApproved: factory.optional(factory.boolean),
		}) {}

		// Fully enable string priorities and optional effort estimates, retire approval, and add notes in the later schema.
		class After extends factory.object("Task", {
			notes: factory.optional(factory.string),
			priority: [factory.number, factory.string],
			estimatedHours: factory.optional(factory.number),
		}) {}

		// The older client restores `isApproved` while retaining the newer document's notes and enabled staged permissions.
		class Expected extends factory.object("Task", {
			notes: factory.optional(factory.string),
			priority: [factory.number, factory.string],
			estimatedHours: factory.optional(factory.number),
			isApproved: factory.optional(factory.boolean),
		}) {}
		const provider = new TestTreeProviderLite(2);
		const [treeBefore, treeAfter] = provider.trees;
		const newer = treeAfter.viewWith(new TreeViewConfiguration({ schema: After }));
		newer.initialize({ notes: "Discuss with the reviewer", priority: "high" });
		provider.synchronizeMessages();

		const older = treeBefore.viewWith(
			new TreeViewConfigurationAlpha({
				schema: Before,
				stagedUpgradePolicy: StagedSchemaUpgradePolicy.restrictive,
			}),
		);

		// The older view needs approval restored before it can write the field; its unknown notes and staged declarations must not block that upgrade.
		assert.equal(older.compatibility.canView, false);
		assert.equal(older.compatibility.canUpgrade, true);
		older.upgradeSchema();
		provider.synchronizeMessages();
		expectSchemaEqual(treeBefore.kernel.checkout.storedSchema, toUpgradeSchema(Expected));
		assert.equal(older.compatibility.isEquivalent, true);

		// The older client uses the stored permissions and restored approval field; the newer client still sees its notes.
		older.root.priority = "urgent";
		older.root.estimatedHours = 4;
		older.root.estimatedHours = undefined;
		older.root.isApproved = true;
		provider.synchronizeMessages();
		assert.equal(older.root.isApproved, true);
		assert.equal(newer.root.priority, "urgent");
		assert.equal(newer.root.estimatedHours, undefined);
		assert.equal(newer.root.notes, "Discuss with the reviewer");
	});

	it("preserves shared-token upgrades only at their existing locations until explicitly enabled", () => {
		const factory = new SchemaFactoryAlpha("partialTaskRollout");

		const stagedString = factory.staged(factory.string);
		const stringUpgrade = stagedString.metadata.stagedSchemaUpgrade;
		assert(stringUpgrade !== undefined);
		const stagedHours = factory.stagedOptional(factory.number);
		const optionalUpgrade = stagedHours.isStagedOptional;
		assert(optionalUpgrade !== false);

		class Before extends factory.object("Task", {
			priority: factory.required(factory.types([factory.number, stagedString]), {
				key: "primaryPriority",
			}),
			fallbackPriority: factory.types([factory.number, stagedString]),
			primaryHours: stagedHours,
			fallbackHours: stagedHours,
			isApproved: factory.optional(factory.boolean),
		}) {}

		// Fully enable the primary fields' staged changes, leave fallback fields numeric and required, and retire approval.
		// Rename `priority` to its stored key, so the older view must map the field back to its own property name.
		class After extends factory.object("Task", {
			primaryPriority: [factory.number, factory.string],
			fallbackPriority: factory.number,
			primaryHours: factory.optional(factory.number),
			fallbackHours: factory.number,
		}) {}

		// The older view restores approval and retains the newer document's primary permissions without changing fallback fields.
		class Expected extends factory.object("Task", {
			primaryPriority: [factory.number, factory.string],
			fallbackPriority: factory.number,
			primaryHours: factory.optional(factory.number),
			fallbackHours: factory.number,
			isApproved: factory.optional(factory.boolean),
		}) {}
		const provider = new TestTreeProviderLite(3);
		const [treeBefore, treeAfter, treeObserver] = provider.trees;
		const newer = treeAfter.viewWith(new TreeViewConfiguration({ schema: After }));
		newer.initialize({ primaryPriority: "high", fallbackPriority: 1, fallbackHours: 2 });
		provider.synchronizeMessages();
		const older = asAlpha(
			treeBefore.viewWith(new TreeViewConfigurationAlpha({ schema: Before })),
		);
		assert.equal(older.isStagedUpgradeEnabled(stringUpgrade), "partial");
		assert.equal(older.isStagedUpgradeEnabled(optionalUpgrade), "partial");
		assert.equal(older.compatibility.canUpgrade, true);
		older.upgradeSchema();
		provider.synchronizeMessages();
		expectSchemaEqual(treeBefore.kernel.checkout.storedSchema, toUpgradeSchema(Expected));

		// Preserving one location must not enable the token at another location.
		assert.equal(older.isStagedUpgradeEnabled(stringUpgrade), "partial");
		assert.equal(older.isStagedUpgradeEnabled(optionalUpgrade), "partial");
		assert.throws(() => {
			older.root.fallbackPriority = "low";
		});
		assert.throws(() => {
			older.root.fallbackHours = undefined;
		});
		older.root.priority = "urgent";
		older.root.primaryHours = undefined;
		older.root.isApproved = true;
		provider.synchronizeMessages();
		assert.equal(newer.root.primaryPriority, "urgent");
		assert.equal(newer.root.primaryHours, undefined);

		// Both clients now have safe no-op candidates, despite their different declarations.
		const root = older.root;
		const sequenceNumber = provider.sequenceNumber;
		let schemaChanges = 0;
		const unsubscribe = older.events.on("schemaChanged", () => schemaChanges++);
		try {
			for (let round = 0; round < 2; round++) {
				newer.upgradeSchema();
				older.upgradeSchema();
				provider.synchronizeMessages();
			}
			assert.equal(provider.sequenceNumber, sequenceNumber);
			assert.equal(schemaChanges, 0);
			assert.equal(older.root, root);
		} finally {
			unsubscribe();
		}

		// Keep another older client open with a restrictive policy while its peer enables the remaining locations.
		const observer = asAlpha(
			treeObserver.viewWith(new TreeViewConfigurationAlpha({ schema: Before })),
		);
		assert.equal(observer.isStagedUpgradeEnabled(stringUpgrade), "partial");
		assert.equal(observer.isStagedUpgradeEnabled(optionalUpgrade), "partial");

		// Enabling the tokens explicitly may introduce the remaining permissions at the fallback fields.
		older.dispose();
		const enabled = asAlpha(
			treeBefore.viewWith(
				new TreeViewConfigurationAlpha({
					schema: Before,
					stagedUpgradePolicy: StagedSchemaUpgradePolicy.enabledStagedUpgrades(
						stringUpgrade,
						optionalUpgrade,
					),
				}),
			),
		);
		enabled.upgradeSchema();
		assert.equal(enabled.isStagedUpgradeEnabled(stringUpgrade), "enabled");
		assert.equal(enabled.isStagedUpgradeEnabled(optionalUpgrade), "enabled");
		enabled.root.fallbackPriority = "low";
		enabled.root.fallbackHours = undefined;
		assert.equal(enabled.root.fallbackPriority, "low");
		assert.equal(enabled.root.fallbackHours, undefined);
		provider.synchronizeMessages();

		// The existing observer must recompute both statuses and accept the newly enabled values after the remote schema update.
		assert.equal(observer.isStagedUpgradeEnabled(stringUpgrade), "enabled");
		assert.equal(observer.isStagedUpgradeEnabled(optionalUpgrade), "enabled");
		assert.equal(observer.root.fallbackPriority, "low");
		assert.equal(observer.root.fallbackHours, undefined);
		observer.root.fallbackPriority = "urgent";
		observer.root.fallbackHours = 3;
		observer.root.fallbackHours = undefined;
		provider.synchronizeMessages();
		assert.equal(enabled.root.fallbackPriority, "urgent");
		assert.equal(enabled.root.fallbackHours, undefined);

		// Despite its restrictive policy, the observer's candidate now preserves the remotely enabled permissions as a no-op.
		assert.equal(observer.compatibility.canUpgrade, true);
		assert.equal(observer.compatibility.isEquivalent, true);
		const observerRoot = observer.root;
		const sequenceAfterEnablement = provider.sequenceNumber;
		let observerSchemaChanges = 0;
		const unsubscribeObserver = observer.events.on(
			"schemaChanged",
			() => observerSchemaChanges++,
		);
		try {
			observer.upgradeSchema();
			provider.synchronizeMessages();
			assert.equal(provider.sequenceNumber, sequenceAfterEnablement);
			assert.equal(observerSchemaChanges, 0);
			assert.equal(observer.root, observerRoot);
		} finally {
			unsubscribeObserver();
		}
	});

	it("retains a node definition without enabling its staged use by another field", () => {
		const factory = new SchemaFactoryAlpha("structuredEstimates");

		class OldEstimate extends factory.object("EffortEstimate", {
			hours: factory.number,
		}) {}
		class Before extends factory.object("Task", {
			detailedEstimate: factory.optional(OldEstimate),
			estimate: factory.number,
		}) {}

		// Add an optional approval flag without changing the stored `EffortEstimate` identifier or numeric `hours`.
		class NewEstimate extends factory.object("EffortEstimate", {
			hours: factory.number,
			isApproved: factory.optional(factory.boolean),
		}) {}
		const stagedEstimate = factory.staged(NewEstimate);
		const upgrade = stagedEstimate.metadata.stagedSchemaUpgrade;
		assert(upgrade !== undefined);

		// Remove `detailedEstimate` and stage structured values for `estimate`, which otherwise remains numeric.
		class After extends factory.object("Task", {
			estimate: factory.types([factory.number, stagedEstimate]),
		}) {}

		// The retained field needs the view's `NewEstimate` definition, but the disabled staged change must leave `estimate` numeric.
		class Expected extends factory.object("Task", {
			detailedEstimate: factory.optional(NewEstimate),
			estimate: factory.number,
		}) {}
		const provider = new TestTreeProviderLite(2);
		const [treeBefore, treeAfter] = provider.trees;
		const before = treeBefore.viewWith(new TreeViewConfiguration({ schema: Before }));
		before.initialize({ detailedEstimate: { hours: 4 }, estimate: 4 });
		provider.synchronizeMessages();

		const after = asAlpha(
			treeAfter.viewWith(
				new TreeViewConfigurationAlpha({
					schema: After,
					stagedUpgradePolicy: StagedSchemaUpgradePolicy.restrictive,
				}),
			),
		);
		assert.equal(after.compatibility.canUpgrade, true);
		after.upgradeSchema();
		provider.synchronizeMessages();

		// Applying the candidate must preserve the old estimate while adding the new definition's approval field.
		expectSchemaEqual(treeAfter.kernel.checkout.storedSchema, toUpgradeSchema(Expected));
		assert.equal(before.root.detailedEstimate?.hours, 4);
		assert.equal(after.compatibility.isEquivalent, true);

		// Retaining a definition is not permission to use it at the staged location.
		assert.equal(after.isStagedUpgradeEnabled(upgrade), "disabled");
		assert.throws(() => {
			after.root.estimate = new NewEstimate({ hours: 6 });
		});
	});
});

function checkStagedRolloutCompatibility({
	baseSchema,
	stagedSchema,
	fullyMigratedSchema,
	upgrade,
}: {
	baseSchema: ImplicitFieldSchema;
	stagedSchema: ImplicitFieldSchema;
	fullyMigratedSchema: ImplicitFieldSchema;
	upgrade: SchemaUpgrade;
}): void {
	// checkSchemaCompatibility only checks compatibility against a supplied stored schema.
	// It does not run the TreeView.upgradeSchema path, so this test simulates each stored
	// schema state directly.
	const stored = new TestSchemaRepository(defaultSchemaPolicy, toUpgradeSchema(baseSchema));
	const expectCompatibility = (
		schema: ImplicitFieldSchema,
		expected: Omit<
			ReturnType<typeof checkSchemaCompatibility>,
			"enabledUpgrades" | "discrepancies"
		> & {
			enabledUpgrades?: ReadonlyMap<SchemaUpgrade, StagedUpgradeStatus>;
		},
	): void => {
		const { discrepancies: _discrepancies, ...compatibility } = checkSchemaCompatibility(
			new TreeViewConfigurationAlpha({ schema }),
			stored,
		);
		assert.deepEqual(compatibility, { enabledUpgrades: new Map(), ...expected });
	};

	// baseSchema is equivalent to the initial stored schema.
	expectCompatibility(baseSchema, {
		canView: true,
		canUpgrade: true,
		isEquivalent: true,
	});

	// stagedSchema can view baseSchema and its default upgrade remains a no-op because the
	// allowed type or optional field kind is still staged.
	expectCompatibility(stagedSchema, {
		canView: true,
		canUpgrade: true,
		isEquivalent: true,
	});
	expectCompatibility(fullyMigratedSchema, {
		canView: false,
		canUpgrade: true,
		isEquivalent: false,
	});

	assert(stored.tryUpdateRootFieldSchema(toUpgradeSchema(stagedSchema).rootFieldSchema));
	expectCompatibility(baseSchema, {
		canView: true,
		canUpgrade: true,
		isEquivalent: true,
	});
	expectCompatibility(stagedSchema, {
		canView: true,
		canUpgrade: true,
		isEquivalent: true,
	});

	// fullyMigratedSchema represents the code-cleanup state where the staged marker has been removed.
	// It is not compatible until the stored schema also includes the upgrade.
	expectCompatibility(fullyMigratedSchema, {
		canView: false,
		canUpgrade: true,
		isEquivalent: false,
	});

	assert(
		stored.tryUpdateRootFieldSchema(toUpgradeSchema(fullyMigratedSchema).rootFieldSchema),
	);
	for (const schema of new TreeViewConfigurationAlpha({
		schema: fullyMigratedSchema,
	}).definitions.values()) {
		assert(stored.tryUpdateTreeSchema(schema));
	}

	// baseSchema is no longer compatible with the fully migrated stored schema.
	expectCompatibility(baseSchema, {
		canView: false,
		canUpgrade: false,
		isEquivalent: false,
	});

	// The staged view preserves the already-enabled permissions, so its upgrade is now a no-op.
	expectCompatibility(stagedSchema, {
		canView: true,
		canUpgrade: true,
		isEquivalent: true,
		enabledUpgrades: new Map([[upgrade, "enabled"]]),
	});
	expectCompatibility(fullyMigratedSchema, {
		canView: true,
		canUpgrade: true,
		isEquivalent: true,
	});
}
