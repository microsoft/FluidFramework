/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import { ExtensibleUnionNode } from "../extensibleUnionNode.js";
import { Tree, TreeAlpha } from "../shared-tree/index.js";
import {
	allowUnused,
	KeyEncodingOptions,
	SchemaFactoryBeta,
	snapshotSchemaCompatibility,
	TreeBeta,
	TreeViewConfiguration,
} from "../simple-tree/index.js";
import type { requireAssignableTo } from "../util/index.js";

import { testSchemaCompatibilitySnapshots } from "./snapshots/index.js";
import { inMemorySnapshotFileSystem, TestTreeProviderLite } from "./utils.js";

describe("extensibleUnionNode", () => {
	it("examples", () => {
		const sf = new SchemaFactoryBeta("extensibleUnionNodeExample.items");
		class ItemA extends sf.object("A", { x: sf.string }) {}
		class ItemB extends sf.object("B", { x: sf.number }) {}

		class AnyItem extends ExtensibleUnionNode.createSchema(
			[ItemA, ItemB], // Future versions may add more members here
			sf,
			"ExtensibleUnion",
		) {}
		// Instances of the union are created using `create`.
		const anyItem = AnyItem.create(new ItemA({ x: "hello" }));
		// Reading the content from the union is done via the `union` property,
		// which can be `undefined` to handle the case where a future version of this schema allows a type unknown to the current version.
		const childNode: ItemA | ItemB | undefined = anyItem.union;
		// To determine which member of the union was present, its schema can be inspected:
		const aSchema = Tree.schema(childNode ?? assert.fail("No child"));
		assert.equal(aSchema, ItemA);
	});

	// Other cases covered as part of other tests, since they are non-trivial to produce those cases for minimal tests.
	it("isValid: known type case", () => {
		const sf = new SchemaFactoryBeta("extensibleUnionNodeExample.items");
		class AnyItem extends ExtensibleUnionNode.createSchema(
			[sf.string],
			sf,
			"ExtensibleUnion",
		) {}
		const anyItem = AnyItem.create("hello");
		assert(anyItem.isValid());
	});

	// Test that this packages doesn't make any schema changes.
	it("compatibility", () => {
		// Test schema compatibility for an example schema using extensibleUnionNode.
		const currentViewSchema = new TreeViewConfiguration({
			schema: ExtensibleUnionNode.createSchema(
				[SchemaFactoryBeta.number, SchemaFactoryBeta.string],
				new SchemaFactoryBeta("extensibleUnionNode-example"),
				"ExtensibleUnion",
			),
		});
		testSchemaCompatibilitySnapshots(
			currentViewSchema,
			"2.83.0",
			"extensibleUnionNode-example",
		);
	});

	// Test that users of ExtensibleUnionNode can evolve their schema over time.
	it("workflow over time", () => {
		const snapshotDirectory = "dir";
		const [fileSystem] = inMemorySnapshotFileSystem();

		const factory = new SchemaFactoryBeta("test");

		class A extends factory.object("A", {}) {}
		class B extends factory.object("B", {}) {}
		class C extends factory.object("C", {}) {}

		const a = ExtensibleUnionNode.createSchema([A], factory, "ExtensibleUnion");

		// Create the initial snapshot.
		snapshotSchemaCompatibility({
			version: "1.0.0",
			schema: new TreeViewConfiguration({ schema: a }),
			fileSystem,
			minVersionForCollaboration: "1.0.0",
			mode: "update",
			snapshotDirectory,
		});

		const b = ExtensibleUnionNode.createSchema([A, B], factory, "ExtensibleUnion");

		snapshotSchemaCompatibility({
			version: "2.0.0",
			schema: new TreeViewConfiguration({ schema: b }),
			fileSystem,
			minVersionForCollaboration: "1.0.0",
			mode: "update",
			snapshotDirectory,
		});

		const c = ExtensibleUnionNode.createSchema([A, B, C], factory, "ExtensibleUnion");

		snapshotSchemaCompatibility({
			version: "3.0.0",
			schema: new TreeViewConfiguration({ schema: c }),
			fileSystem,
			minVersionForCollaboration: "1.0.0",
			mode: "update",
			snapshotDirectory,
		});

		// c is compatible to collaborate with 1 and 2.
		snapshotSchemaCompatibility({
			version: "3.0.0",
			schema: new TreeViewConfiguration({ schema: c }),
			fileSystem,
			minVersionForCollaboration: "1.0.0",
			mode: "assert",
			snapshotDirectory,
		});
	});

	it("empty case union", () => {
		const factory = new SchemaFactoryBeta("test");
		class AUnion extends ExtensibleUnionNode.createSchema([], factory, "ExtensibleUnion") {}
		allowUnused<requireAssignableTo<Parameters<typeof AUnion.create>[0], never>>();
	});

	it("invalid data cases", () => {
		const factory = new SchemaFactoryBeta("test");
		class A extends factory.object("A", {}) {}
		class B extends factory.object("B", {}) {}
		class Union extends ExtensibleUnionNode.createSchema([A, B], factory, "ExtensibleUnion") {}

		// Create a malformed ExtensibleUnionNode with no children.
		const missingChild = TreeBeta.importConcise(Union, {});
		assert(!missingChild.isValid());
		assert.throws(() => missingChild.union, validateUsageError(/invalid state/));

		// Create a malformed ExtensibleUnionNode with two children.
		const a = TreeBeta.exportConcise(Union.create(new A({})));
		const b = TreeBeta.exportConcise(Union.create(new B({})));
		assert(typeof a === "object");
		assert(typeof b === "object");
		const twoChildren = TreeBeta.importConcise(Union, {
			...a,
			...b,
		});
		assert(!twoChildren.isValid());
		assert.throws(() => twoChildren.union, validateUsageError(/invalid state/));
	});

	it("export to import", () => {
		const factory = new SchemaFactoryBeta("test");
		class Union extends ExtensibleUnionNode.createSchema(
			[SchemaFactoryBeta.string],
			factory,
			"ExtensibleUnion",
		) {}

		const original = Union.create("x");

		const exported = TreeAlpha.exportVerbose(original, {
			keys: KeyEncodingOptions.allStoredKeys,
		});

		const importKnown = TreeAlpha.importVerbose(Union, exported, {
			keys: KeyEncodingOptions.knownStoredKeys,
		});

		assert.equal(importKnown.union, "x");
		class UnionUnknown extends ExtensibleUnionNode.createSchema(
			[],
			factory,
			"ExtensibleUnion",
		) {}

		assert.throws(() => {
			TreeAlpha.importVerbose(UnionUnknown, exported, {
				// We disallow (including at compile time) allStoredKeys for imports: there is no way for this to be lossless currently:
				keys: KeyEncodingOptions.knownStoredKeys,
			});
		}, validateUsageError(
			`Field "com.fluidframework.leaf.string" is not defined in the schema "com.fluidframework.extensibleUnionNode<test>.ExtensibleUnion".`,
		));
	});

	it("runtime cross version collab", () => {
		const provider = new TestTreeProviderLite(2);
		const [treeBefore, treeAfter] = provider.trees;

		const factory = new SchemaFactoryBeta("test");

		class AUnion extends ExtensibleUnionNode.createSchema(
			[SchemaFactoryBeta.string],
			factory,
			"ExtensibleUnion",
		) {}
		class ABUnion extends ExtensibleUnionNode.createSchema(
			[SchemaFactoryBeta.string, SchemaFactoryBeta.number],
			factory,
			"ExtensibleUnion",
		) {}

		const viewBefore = treeBefore.viewWith(new TreeViewConfiguration({ schema: AUnion }));
		const viewAfter = treeAfter.viewWith(new TreeViewConfiguration({ schema: ABUnion }));

		// Test initialization and schema upgrades collab as expected
		viewBefore.initialize(AUnion.create("A"));
		provider.synchronizeMessages();
		assert(viewAfter.compatibility.canView === false);
		viewAfter.upgradeSchema();
		assert.equal(viewAfter.root.union, "A");

		// Do an edit to introduce a type the before view does not know about
		viewAfter.root = ABUnion.create(2);
		provider.synchronizeMessages();
		assert.equal(viewBefore.root.union, undefined);

		// Capture this node with unknown contents in a clone to test the contents are preserved in it.
		// This is more testing that clone works in this case as a bit of an integration test.
		const cloneUnknown = TreeBeta.clone<typeof AUnion>(viewBefore.root);
		assert.equal(cloneUnknown.union, undefined);

		// Overwrite the root with something not equal to the clone so we can tell if the clone applied correctly.
		viewAfter.root = ABUnion.create("y");
		provider.synchronizeMessages();

		// Set root to clone
		assert.equal(viewBefore.root.union, "y");
		viewBefore.root = cloneUnknown;
		provider.synchronizeMessages();
		assert.equal(viewAfter.root.union, 2); // From clone

		// Since this test has produced a node in the unknown configuration (which is hard to do in a simple test),
		// as part of this test,
		// test exporting with unknown entry, and importing where field is known
		const exportUnknown = TreeAlpha.exportVerbose(cloneUnknown, {
			keys: KeyEncodingOptions.allStoredKeys,
		});

		const importUnknown = TreeAlpha.importVerbose(ABUnion, exportUnknown, {
			keys: KeyEncodingOptions.knownStoredKeys,
		});

		assert(importUnknown.isValid());
		assert.equal(importUnknown.union, 2);
	});
});
