/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { ExtensibleSchemaUnion } from "../extensibleSchemaUnion.js";
import { Tree } from "../shared-tree/index.js";
import {
	checkSchemaCompatibilitySnapshots,
	SchemaFactoryBeta,
	TreeViewConfiguration,
} from "../simple-tree/index.js";

import { testSchemaCompatibilitySnapshots } from "./snapshots/index.js";
import { inMemorySnapshotFileSystem } from "./utils.js";

describe("extensibleSchemaUnion", () => {
	it("examples", () => {
		const sf = new SchemaFactoryBeta("extensibleSchemaUnionExample.items");
		class ItemA extends sf.object("A", { x: sf.string }) {}
		class ItemB extends sf.object("B", { x: sf.number }) {}

		class AnyItem extends ExtensibleSchemaUnion.extensibleSchemaUnion(
			[ItemA, ItemB], // Future versions may add more members here
			sf,
			"ExtensibleUnion",
		) {}
		// Instances of the union are created using `create`.
		const anyItem = AnyItem.create(new ItemA({ x: "hello" }));
		// Reading the content from the union is done via `child`,
		// which can be `undefined` to handle the case where a future version of this schema allows a type unknown to the current version.
		const childNode: ItemA | ItemB | undefined = anyItem.child;
		// To determine which member of the union was present, its schema can be inspected:
		const aSchema = Tree.schema(childNode ?? assert.fail("No child"));
		assert.equal(aSchema, ItemA);
	});

	// Test that this packages doesn't make any schema changes.
	it("compatibility", () => {
		// Test schema compatibility for an example schema using extensibleSchemaUnion.
		const currentViewSchema = new TreeViewConfiguration({
			schema: ExtensibleSchemaUnion.extensibleSchemaUnion(
				[SchemaFactoryBeta.number, SchemaFactoryBeta.string],
				new SchemaFactoryBeta("extensibleSchemaUnion-example"),
				"ExtensibleUnion",
			),
		});
		testSchemaCompatibilitySnapshots(
			currentViewSchema,
			"2.82.0",
			"extensibleSchemaUnion-example",
		);
	});

	// Test that users of ExtensibleSchemaUnion can evolve their schema over time.
	it("workflow over time", () => {
		const snapshotDirectory = "dir";
		const [fileSystem] = inMemorySnapshotFileSystem();

		const factory = new SchemaFactoryBeta("test");

		class A extends factory.object("A", {}) {}
		class B extends factory.object("B", {}) {}
		class C extends factory.object("C", {}) {}

		const a = ExtensibleSchemaUnion.extensibleSchemaUnion([A], factory, "ExtensibleUnion");

		// Create the initial snapshot.
		checkSchemaCompatibilitySnapshots({
			version: "1.0.0",
			schema: new TreeViewConfiguration({ schema: a }),
			fileSystem,
			minVersionForCollaboration: "1.0.0",
			mode: "update",
			snapshotDirectory,
		});

		const b = ExtensibleSchemaUnion.extensibleSchemaUnion([A, B], factory, "ExtensibleUnion");

		checkSchemaCompatibilitySnapshots({
			version: "2.0.0",
			schema: new TreeViewConfiguration({ schema: b }),
			fileSystem,
			minVersionForCollaboration: "1.0.0",
			mode: "update",
			snapshotDirectory,
		});

		const c = ExtensibleSchemaUnion.extensibleSchemaUnion(
			[A, B, C],
			factory,
			"ExtensibleUnion",
		);

		checkSchemaCompatibilitySnapshots({
			version: "3.0.0",
			schema: new TreeViewConfiguration({ schema: c }),
			fileSystem,
			minVersionForCollaboration: "1.0.0",
			mode: "update",
			snapshotDirectory,
		});

		// c is compatible to collaborate with 1 and 2.
		checkSchemaCompatibilitySnapshots({
			version: "3.0.0",
			schema: new TreeViewConfiguration({ schema: c }),
			fileSystem,
			minVersionForCollaboration: "1.0.0",
			mode: "test",
			snapshotDirectory,
		});
	});
});
