/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import fs from "node:fs";

import type { requireAssignableTo } from "@fluidframework/build-tools";
import { validateError } from "@fluidframework/test-runtime-utils/internal";

import {
	checkCompatibility,
	importCompatibilitySchemaSnapshot,
	exportCompatibilitySchemaSnapshot,
	type SnapshotFileSystem,
	SnapshotCompatibilityChecker,
	checkSchemaCompatibilitySnapshots,
	// Allow importing file which is being tested.
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../simple-tree/api/snapshotCompatibilityChecker.js";

import {
	normalizeFieldSchema,
	SchemaFactory,
	TreeViewConfiguration,
	SchemaFactoryBeta,
	stringSchema,
	numberSchema,
	allowUnused,
} from "../../../simple-tree/index.js";
import { strict as assert } from "node:assert";
import { testSrcPath } from "../../testSrcPath.cjs";

const nodeFileSystem = {
	...fs,
	...path,
};

describe("snapshotCompatibilityChecker", () => {
	it("parse and snapshot can roundtrip schema", () => {
		const factory = new SchemaFactory("test");
		const Schema = factory.optional(factory.string, {});

		const view = new TreeViewConfiguration({ schema: Schema });
		const snapshot = exportCompatibilitySchemaSnapshot(view);
		const parsedView = importCompatibilitySchemaSnapshot(snapshot);

		const normalizedView = normalizeFieldSchema(parsedView.schema);

		assert.equal(normalizedView.allowedTypeSet.size, 1);
		assert.equal(
			normalizedView.allowedTypesIdentifiers.has("com.fluidframework.leaf.string"),
			true,
		);
	});

	function checkCompatibilityDetectsUpgradeableSchemas(roundtripSnapshot: boolean): void {
		const factory = new SchemaFactory("test");

		// The past view schema, for the purposes of illustration. This wouldn't normally appear as a concrete schema in the test
		// checking compatibility, but rather would be loaded from a snapshot.
		class Point2D extends factory.object("Point", {
			x: factory.number,
			y: factory.number,
		}) {}

		// This is the same as Point3D, except missing `z`.
		let oldViewSchema: TreeViewConfiguration = new TreeViewConfiguration({ schema: Point2D });

		// If roundtripSnapshot is true, store the old schema as a JSON string and then load it.
		if (roundtripSnapshot) {
			const encodedSchema = JSON.stringify(exportCompatibilitySchemaSnapshot(oldViewSchema));
			oldViewSchema = importCompatibilitySchemaSnapshot(JSON.parse(encodedSchema));
		}

		// Build the current view schema
		class Point3D extends factory.object("Point", {
			x: factory.number,
			y: factory.number,

			// The current schema has a new optional field that was not present on Point2D
			z: factory.optional(factory.number),
		}) {}
		const currentViewSchema = new TreeViewConfiguration({ schema: Point3D });

		// Check to see if the document created by the historical view schema can be opened with the current view schema
		const backwardsCompatibilityStatus = checkCompatibility(oldViewSchema, currentViewSchema);

		// z is not present in Point2D, so the schema must be upgraded
		assert.equal(backwardsCompatibilityStatus.canView, false);

		// The schema can be upgraded to add the new optional field
		assert.equal(backwardsCompatibilityStatus.canUpgrade, true);

		// Test what the old version of the application would do with a tree using the new schema:
		const forwardsCompatibilityStatus = checkCompatibility(currentViewSchema, oldViewSchema);

		// If the old schema set allowUnknownOptionalFields, this would be true, but since it did not,
		// we assert that there is forwards compatibility break:
		// this means these two versions of the application cannot collaborate on content using these schema.
		assert.equal(forwardsCompatibilityStatus.canView, false);
	}

	it("checkCompatibility detects upgradeable schemas", () => {
		checkCompatibilityDetectsUpgradeableSchemas(false);
	});

	it("checkCompatibility detects upgradeable schemas - snapshot test", () => {
		checkCompatibilityDetectsUpgradeableSchemas(true);
	});

	it("checkCompatibility: allowUnknownOptionalFields", () => {
		const factory = new SchemaFactoryBeta("test");

		// Point2D is constructed with allowUnknownOptionalFields, so it can read Point3D trees
		// even though it does not know about the optional field `z`.
		class Point2D extends factory.object(
			"Point",
			{
				x: factory.number,
				y: factory.number,
			},
			{ allowUnknownOptionalFields: true },
		) {}
		class Point3D extends factory.object("Point", {
			x: factory.number,
			y: factory.number,
			z: factory.optional(factory.number),
		}) {}

		const oldViewSchema = new TreeViewConfiguration({ schema: Point2D });
		const currentViewSchema = new TreeViewConfiguration({ schema: Point3D });

		// Check to see if a document created with the current view schema can be opened with the historical view schema
		const backwardsCompatibilityStatus = checkCompatibility(oldViewSchema, currentViewSchema);

		// The current view schema has a superset of the fields on the old view schema, so the schema must be upgraded to add the new
		// optional field `z`.
		assert.equal(backwardsCompatibilityStatus.canView, false);
		assert.equal(backwardsCompatibilityStatus.canUpgrade, true);

		// Test what the old version of the application would do with a tree using the new schema:
		const forwardsCompatibilityStatus = checkCompatibility(currentViewSchema, oldViewSchema);

		// Content created with the current schema can be viewed by the old schema due to allowUnknownOptionalFields
		assert.equal(forwardsCompatibilityStatus.canView, true);
	});

	it("checkCompatibility: staged schema", () => {
		const factory = new SchemaFactoryBeta("test");
		const oldSchema = factory.optional(
			factory.types([numberSchema, factory.staged(stringSchema)]),
		);
		const currentSchema = factory.optional([stringSchema, numberSchema]);

		const oldViewSchema = new TreeViewConfiguration({ schema: oldSchema });
		const currentViewSchema = new TreeViewConfiguration({ schema: currentSchema });

		// Check to see if the document created by the historical view schema can be opened with the current view schema
		const backwardsCompatibilityStatus = checkCompatibility(oldViewSchema, currentViewSchema);

		// The current view schema has a superset of the non-staged allowed types on the old schema, and therefore the old
		// stored schema must be upgraded before it can be viewed.
		assert.equal(backwardsCompatibilityStatus.canView, false);
		assert.equal(backwardsCompatibilityStatus.canUpgrade, true);

		// Check to see if a document created with the current view schema can be opened with the historical view schema
		const forwardsCompatibilityStatus = checkCompatibility(currentViewSchema, oldViewSchema);

		// The current schema's string schema is supported by the old schema's staged string schema
		assert.equal(forwardsCompatibilityStatus.canView, true);
	});

	it("SnapshotFileSystem", () => {
		allowUnused<requireAssignableTo<typeof nodeFileSystem, SnapshotFileSystem>>();
	});

	describe("checkSchemaCompatibilitySnapshots", () => {
		it("write current view schema snapshot", () => {
			const snapshotDirectory = path.join(testSrcPath, "schemaSnapshots", "point");

			const factory = new SchemaFactory("test");

			class Point2D extends factory.object("Point", {
				x: factory.number,
				y: factory.number,
			}) {}

			class Point3D extends factory.object("Point", {
				x: factory.number,
				y: factory.number,
				z: factory.optional(factory.number),
			}) {}

			assert.throws(
				() =>
					checkSchemaCompatibilitySnapshots({
						version: "2.0.0",
						schema: new TreeViewConfiguration({ schema: Point2D }), // Using the schema from v1 as v2, so should fail
						fileSystem: nodeFileSystem,
						minVersionForCollaboration: "1.0.0",
						mode: "test",
						snapshotDirectory,
					}),
				validateError(`Schema compatibility check failed:
 - Current schema snapshot for version "2.0.0" does not match expected snapshot. Run in "update" mode again to rewrite the snapshot to review the differences.
 - Current version "2.0.0" cannot upgrade documents from "2.0.0".
 - Current version "2.0.0" expected to be equivalent to its snapshot.`),
			);

			assert.throws(
				() =>
					checkSchemaCompatibilitySnapshots({
						version: "2.0.0",
						schema: new TreeViewConfiguration({ schema: Point3D }),
						fileSystem: nodeFileSystem,
						minVersionForCollaboration: "1.0.0", // Due to not using allowUnknownOptionalFields, these cannot collaborate, so should fail
						mode: "test",
						snapshotDirectory,
					}),
				validateError(`Schema compatibility check failed:
 - Historical version "1.0.0" cannot view documents from "2.0.0": these versions are expected to be able to collaborate due to minAppVersionForCollaboration being "1.0.0" but they cannot.`),
			);

			checkSchemaCompatibilitySnapshots({
				version: "2.0.0",
				schema: new TreeViewConfiguration({ schema: Point3D }),
				fileSystem: nodeFileSystem,
				minVersionForCollaboration: "2.0.0",
				mode: "test",
				snapshotDirectory,
			});
		});

		it("workflow over time", () => {
			const snapshotDirectory = "dir";
			const snapshots = new Map<string, string>();

			// Trivial in-memory file system for testing.
			const fileSystem: SnapshotFileSystem = {
				writeFileSync(file: string, data: string, options: { encoding: "utf8" }): void {
					snapshots.set(file, data);
				},
				readFileSync(file: string, encoding: "utf8"): string {
					return snapshots.get(file) ?? assert.fail(`File not found: ${file}`);
				},
				mkdirSync(dir: string, options: { recursive: true }): void {},
				readdirSync(dir: string): readonly string[] {
					return [...snapshots.keys()];
				},
				join(parentPath: string, childPath: string): string {
					return childPath;
				},
			};

			const factory = new SchemaFactoryBeta("test");

			class Point1 extends factory.object("Point", {
				x: factory.number,
				y: factory.number,
			}) {}

			class Point2 extends factory.object(
				"Point",
				{
					x: factory.number,
					y: factory.number,
				},
				{ allowUnknownOptionalFields: true },
			) {}

			class Point3 extends factory.object("Point", {
				x: factory.number,
				y: factory.number,
				z: factory.optional(factory.number),
			}) {}

			assert.throws(
				() =>
					checkSchemaCompatibilitySnapshots({
						version: "1.0.0",
						schema: new TreeViewConfiguration({ schema: Point1 }),
						fileSystem,
						minVersionForCollaboration: "1.0.0",
						mode: "test",
						snapshotDirectory,
					}),
				validateError("No snapshot found for version 1.0.0"),
			);

			assert.deepEqual([...snapshots.keys()], []);

			checkSchemaCompatibilitySnapshots({
				version: "1.0.0",
				schema: new TreeViewConfiguration({ schema: Point1 }),
				fileSystem,
				minVersionForCollaboration: "1.0.0",
				mode: "update",
				snapshotDirectory,
			});

			assert.deepEqual([...snapshots.keys()], ["1.0.0.json"]);

			checkSchemaCompatibilitySnapshots({
				version: "1.0.0",
				schema: new TreeViewConfiguration({ schema: Point1 }),
				fileSystem,
				minVersionForCollaboration: "1.0.0",
				mode: "test",
				snapshotDirectory,
			});

			assert.throws(
				() =>
					checkSchemaCompatibilitySnapshots({
						version: "1.0.0",
						schema: new TreeViewConfiguration({ schema: Point2 }),
						fileSystem,
						minVersionForCollaboration: "1.0.0",
						mode: "test",
						snapshotDirectory,
					}),
				validateError(`Schema compatibility check failed:
 - Current schema snapshot for version "1.0.0" does not match expected snapshot. Run in "update" mode again to rewrite the snapshot to review the differences.`),
			);

			checkSchemaCompatibilitySnapshots({
				version: "2.0.0",
				schema: new TreeViewConfiguration({ schema: Point2 }),
				fileSystem,
				minVersionForCollaboration: "1.0.0",
				mode: "update",
				snapshotDirectory,
			});

			assert.deepEqual([...snapshots.keys()], ["1.0.0.json", "2.0.0.json"]);

			checkSchemaCompatibilitySnapshots({
				version: "2.0.0",
				schema: new TreeViewConfiguration({ schema: Point2 }),
				fileSystem,
				minVersionForCollaboration: "1.0.0",
				mode: "test",
				snapshotDirectory,
			});

			assert.throws(
				() =>
					checkSchemaCompatibilitySnapshots({
						version: "3.0.0",
						schema: new TreeViewConfiguration({ schema: Point3 }),
						fileSystem,
						minVersionForCollaboration: "1.0.0",
						mode: "update",
						snapshotDirectory,
					}),
				validateError(`Schema compatibility check failed:
 - Historical version "1.0.0" cannot view documents from "3.0.0": these versions are expected to be able to collaborate due to minAppVersionForCollaboration being "1.0.0" but they cannot.`),
			);

			assert.deepEqual([...snapshots.keys()], ["1.0.0.json", "2.0.0.json", "3.0.0.json"]);

			checkSchemaCompatibilitySnapshots({
				version: "3.0.0",
				schema: new TreeViewConfiguration({ schema: Point3 }),
				fileSystem,
				minVersionForCollaboration: "2.0.0",
				mode: "test",
				snapshotDirectory,
			});
		});

		it("check current view schema against historical persisted schemas", () => {
			const checker = new SnapshotCompatibilityChecker(
				path.join(testSrcPath, "schemaSnapshots", "point"),
				nodeFileSystem,
			);

			const factory = new SchemaFactory("test");

			class Point3D extends factory.object("Point", {
				x: factory.number,
				y: factory.number,
				z: factory.optional(factory.number),
			}) {}

			const results = checker.getCompatibility(new TreeViewConfiguration({ schema: Point3D }));

			assert.equal(results.size, 2);

			const resultV1 = results.get("1.0.0");
			assert(resultV1 !== undefined);
			assert.equal(resultV1.backwardsCompatibilityStatus.canView, false);
			assert.equal(resultV1.backwardsCompatibilityStatus.canUpgrade, true);
			assert.equal(resultV1.forwardsCompatibilityStatus.canView, false);

			const resultV2 = results.get("2.0.0");
			assert(resultV2 !== undefined);
			assert.equal(resultV2.backwardsCompatibilityStatus.canView, true);
			assert.equal(resultV2.backwardsCompatibilityStatus.canUpgrade, true);
			assert.equal(resultV2.forwardsCompatibilityStatus.canView, true);
		});
	});
});
