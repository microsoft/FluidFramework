/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";

import type { requireAssignableTo } from "@fluidframework/build-tools";
import {
	validateError,
	validateUsageError,
} from "@fluidframework/test-runtime-utils/internal";

import { pkgVersion } from "../../../packageVersion.js";
import {
	checkCompatibility,
	importCompatibilitySchemaSnapshot,
	exportCompatibilitySchemaSnapshot,
	type SnapshotFileSystem,
	checkSchemaCompatibilitySnapshots,
	getCompatibility,
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
import { testSrcPath } from "../../testSrcPath.cjs";
import { inMemorySnapshotFileSystem } from "../../utils.js";

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
		// Validate example for how to use implement SnapshotFileSystem using node fs and path modules works.
		allowUnused<requireAssignableTo<typeof nodeFileSystem, SnapshotFileSystem>>();
	});

	describe("checkSchemaCompatibilitySnapshots", () => {
		describe("example from docs", () => {
			const factory = new SchemaFactory("test");

			class Point extends factory.object("Point", {
				x: factory.number,
				y: factory.number,
				z: factory.optional(factory.number),
			}) {}

			const config = new TreeViewConfiguration({ schema: Point });
			const snapshotDirectory = path.join(testSrcPath, "schemaSnapshots", "point");

			// This test is included in the docs for checkSchemaCompatibilitySnapshots, and should be kept in sync with it.
			it("schema compatibility", () => {
				checkSchemaCompatibilitySnapshots({
					version: pkgVersion,
					schema: config,
					fileSystem: { ...fs, ...path },
					minVersionForCollaboration: "2.0.0",
					mode: process.argv.includes("--snapshot") ? "update" : "test",
					snapshotDirectory,
				});
			});
		});

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
 - Snapshot for current version "2.0.0" is out of date: schema has changed since latest existing snapshot version "2.0.0". If this is expected, checkSchemaCompatibilitySnapshots can be rerun in "update" mode to update the snapshot.
 - Current version "2.0.0" cannot upgrade documents from "2.0.0".
 - Current version "2.0.0" expected to be equivalent to its snapshot.
Snapshots in: "${testSrcPath}/schemaSnapshots/point".
Snapshots exist for versions: [
  "1.0.0",
  "2.0.0"
].`),
			);

			assert.throws(
				() =>
					checkSchemaCompatibilitySnapshots({
						version: "2.0.0",
						schema: new TreeViewConfiguration({ schema: [] }), // Schema invalid for all versions, so should fail
						fileSystem: nodeFileSystem,
						minVersionForCollaboration: "1.0.0",
						mode: "test",
						snapshotDirectory,
					}),
				validateError(`Schema compatibility check failed:
 - Snapshot for current version "2.0.0" is out of date: schema has changed since latest existing snapshot version "2.0.0". If this is expected, checkSchemaCompatibilitySnapshots can be rerun in "update" mode to update the snapshot.
 - Current version "2.0.0" cannot upgrade documents from "1.0.0".
 - Historical version "1.0.0" cannot view documents from "2.0.0": these versions are expected to be able to collaborate due to the selected minVersionForCollaboration snapshot version being "1.0.0".
 - Current version "2.0.0" cannot upgrade documents from "2.0.0".
 - Current version "2.0.0" expected to be equivalent to its snapshot.
Snapshots in: "${testSrcPath}/schemaSnapshots/point".
Snapshots exist for versions: [
  "1.0.0",
  "2.0.0"
].`),
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
 - Historical version "1.0.0" cannot view documents from "2.0.0": these versions are expected to be able to collaborate due to the selected minVersionForCollaboration snapshot version being "1.0.0".
Snapshots in: "${testSrcPath}/schemaSnapshots/point".
Snapshots exist for versions: [
  "1.0.0",
  "2.0.0"
].`),
			);

			// Avoids all the above tested issues, and matches saved snapshot, so should pass
			checkSchemaCompatibilitySnapshots({
				version: "2.0.0",
				schema: new TreeViewConfiguration({ schema: Point3D }),
				fileSystem: nodeFileSystem,
				minVersionForCollaboration: "2.0.0",
				mode: "test",
				snapshotDirectory,
			});
		});

		// Tests the various operations a user of the checkSchemaCompatibilitySnapshots function might perform across various versions of their codebase.
		it("workflow over time", () => {
			const snapshotDirectory = "dir";
			const [fileSystem, snapshots] = inMemorySnapshotFileSystem();

			const factory = new SchemaFactoryBeta("test");

			// For this scenario the application will evolve through three versions of a Point schema across 3 versions of the app.

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

			// The first time they use checkSchemaCompatibilitySnapshots, no snapshot will exist, and it must error suggesting a snapshot be created using update.
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
				validateError(
					`Schema compatibility check failed:
 - No snapshots found. If this is expected, checkSchemaCompatibilitySnapshots can be rerun in "update" mode to update the snapshot.
 - No snapshot found with version less than or equal to minVersionForCollaboration "1.0.0".
Snapshots in: "dir".
Snapshots exist for versions: [].`,
				),
			);

			// Confirm no snapshots were created during the failed test above since it was in test mode.
			assert.deepEqual([...snapshots.keys()], []);

			// Update, as directed by the error message, to create the initial snapshot.
			checkSchemaCompatibilitySnapshots({
				version: "1.0.0",
				schema: new TreeViewConfiguration({ schema: Point1 }),
				fileSystem,
				minVersionForCollaboration: "1.0.0",
				mode: "update",
				snapshotDirectory,
			});

			// Confirm the snapshot for v1.0.0 was created.
			assert.deepEqual([...snapshots.keys()], ["1.0.0.json"]);

			// Now that the snapshot exists, test should pass.
			// This would be the first state the app author would commit, and would be released as 1.0.0.
			checkSchemaCompatibilitySnapshots({
				version: "1.0.0",
				schema: new TreeViewConfiguration({ schema: Point1 }),
				fileSystem,
				minVersionForCollaboration: "1.0.0",
				mode: "test",
				snapshotDirectory,
			});

			// If a developer accidentally changed the schema leading up to the 1.0.0 release, the test catches it like this:
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
 - Snapshot for current version "1.0.0" is out of date: schema has changed since latest existing snapshot version "1.0.0". If this is expected, checkSchemaCompatibilitySnapshots can be rerun in "update" mode to update the snapshot.
Snapshots in: "dir".
Snapshots exist for versions: [
  "1.0.0"
].`),
			);

			// If the change was desired, a new snapshot can be taken to include it in 2.0.0:
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

			// Now we can make a breaking schema change, dropping support for collaboration with 1.0.0 by moving to Point3.
			// In this case the developer did not realize it is a breaking change, and so the test notifies them of the issue:
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
 - Historical version "1.0.0" cannot view documents from "3.0.0": these versions are expected to be able to collaborate due to the selected minVersionForCollaboration snapshot version being "1.0.0".
Snapshots in: "dir".
Snapshots exist for versions: [
  "1.0.0",
  "2.0.0",
  "3.0.0"
].`),
			);

			assert.deepEqual([...snapshots.keys()], ["1.0.0.json", "2.0.0.json", "3.0.0.json"]);

			// In this case the developer is ok with dropping support for collaboration with 1.0.0,
			// so they update minVersionForCollaboration to 2.0.0 acknowledging the break.
			checkSchemaCompatibilitySnapshots({
				version: "3.0.0",
				schema: new TreeViewConfiguration({ schema: Point3 }),
				fileSystem,
				minVersionForCollaboration: "2.0.0",
				mode: "test",
				snapshotDirectory,
			});

			// If they go to publish patch or minor versions, the snapshots should not need updating (since  snapshotUnchangedVersions is false) as confirmed by this test:
			checkSchemaCompatibilitySnapshots({
				version: "3.1.0",
				schema: new TreeViewConfiguration({ schema: Point3 }),
				fileSystem,
				minVersionForCollaboration: "2.0.0",
				mode: "test",
				snapshotDirectory,
			});

			// If the app developers specifically want to snapshot every version's schema, they can require that with `snapshotUnchangedVersions: true` as validated here:
			assert.throws(
				() =>
					checkSchemaCompatibilitySnapshots({
						version: "3.1.0",
						schema: new TreeViewConfiguration({ schema: Point3 }),
						fileSystem,
						minVersionForCollaboration: "2.0.0",
						mode: "test",
						snapshotDirectory,
						snapshotUnchangedVersions: true,
					}),
				validateError(`Schema compatibility check failed:
 - No snapshot found for version "3.1.0": snapshotUnchangedVersions is true, so every version must be snapshotted. If this is expected, checkSchemaCompatibilitySnapshots can be rerun in "update" mode to update the snapshot.
Snapshots in: "dir".
Snapshots exist for versions: [
  "1.0.0",
  "2.0.0",
  "3.0.0"
].`),
			);

			// Here we confirm that even when running update, no new snapshot is taken if the schema is unchanged and snapshotUnchangedVersions is false.
			checkSchemaCompatibilitySnapshots({
				version: "3.1.0",
				schema: new TreeViewConfiguration({ schema: Point3 }),
				fileSystem,
				minVersionForCollaboration: "2.0.0",
				mode: "update",
				snapshotDirectory,
			});

			assert.deepEqual([...snapshots.keys()], ["1.0.0.json", "2.0.0.json", "3.0.0.json"]);

			// But if snapshotUnchangedVersions is true, a new snapshot is taken even though the schema is unchanged.
			checkSchemaCompatibilitySnapshots({
				version: "3.1.0",
				schema: new TreeViewConfiguration({ schema: Point3 }),
				fileSystem,
				minVersionForCollaboration: "2.0.0",
				mode: "update",
				snapshotDirectory,
				snapshotUnchangedVersions: true,
			});

			assert.deepEqual(
				[...snapshots.keys()],
				["1.0.0.json", "2.0.0.json", "3.0.0.json", "3.1.0.json"],
			);

			// Confirm that tests pass with "test" mode and snapshotUnchangedVersions true.
			checkSchemaCompatibilitySnapshots({
				version: "3.1.0",
				schema: new TreeViewConfiguration({ schema: Point3 }),
				fileSystem,
				minVersionForCollaboration: "2.0.0",
				mode: "test",
				snapshotDirectory,
				snapshotUnchangedVersions: true,
			});

			// Confirm that when using snapshotUnchangedVersions, it is an error if minVersionForCollaboration is a version between snapshots
			// since in that mode it is assumed every released version has a snapshot.
			assert.throws(
				() =>
					checkSchemaCompatibilitySnapshots({
						version: "3.1.0",
						schema: new TreeViewConfiguration({ schema: Point3 }),
						fileSystem,
						minVersionForCollaboration: "2.1.0",
						mode: "test",
						snapshotDirectory,
						snapshotUnchangedVersions: true,
					}),
				validateError(`Schema compatibility check failed:
 - Using snapshotUnchangedVersions: a snapshot of the exact minVersionForCollaboration "2.1.0" is required. No snapshot found.
Snapshots in: "dir".
Snapshots exist for versions: [
  "1.0.0",
  "2.0.0",
  "3.0.0",
  "3.1.0"
].`),
			);

			// Final sanity check that everything is left in a good state.
			checkSchemaCompatibilitySnapshots({
				version: "3.1.0",
				schema: new TreeViewConfiguration({ schema: Point3 }),
				fileSystem,
				minVersionForCollaboration: "2.1.0",
				mode: "test",
				snapshotDirectory,
			});
		});

		it("invalid versions", () => {
			const snapshotDirectory = "dir";
			const [fileSystem] = inMemorySnapshotFileSystem();

			assert.throws(
				() =>
					checkSchemaCompatibilitySnapshots({
						version: "3.1.0x",
						schema: new TreeViewConfiguration({ schema: [] }),
						fileSystem,
						minVersionForCollaboration: "2.1.0",
						mode: "test",
						snapshotDirectory,
					}),
				validateUsageError(`Invalid version: "3.1.0x". Must be a valid semver version.`),
			);

			assert.throws(
				() =>
					checkSchemaCompatibilitySnapshots({
						version: "3.1.0",
						schema: new TreeViewConfiguration({ schema: [] }),
						fileSystem,
						minVersionForCollaboration: "2.1",
						mode: "test",
						snapshotDirectory,
					}),
				validateUsageError(
					`Invalid minVersionForCollaboration: "2.1". Must be a valid semver version.`,
				),
			);

			assert.throws(
				() =>
					checkSchemaCompatibilitySnapshots({
						version: "3.1.0",
						schema: new TreeViewConfiguration({ schema: [] }),
						fileSystem,
						minVersionForCollaboration: "3.1.1",
						mode: "test",
						snapshotDirectory,
					}),
				validateUsageError(
					`Invalid minVersionForCollaboration: "3.1.1". Must be less than or equal to current version "3.1.0".`,
				),
			);

			assert.throws(
				() =>
					checkSchemaCompatibilitySnapshots({
						version: "1.0.0-beta",
						schema: new TreeViewConfiguration({ schema: [] }),
						fileSystem,
						minVersionForCollaboration: "1.0.0",
						mode: "test",
						snapshotDirectory,
					}),
				validateUsageError(
					`Invalid minVersionForCollaboration: "1.0.0". Must be less than or equal to current version "1.0.0-beta".`,
				),
			);
		});

		it("custom versionComparer", () => {
			const snapshotDirectory = "dir";
			const [fileSystem, snapshots] = inMemorySnapshotFileSystem();

			const factory = new SchemaFactoryBeta("test");

			const versionComparer = (a: string, b: string): number => {
				// Simple numeric comparer for versions like "1", "2.5", "3" etc.
				return Number.parseFloat(a) - Number.parseFloat(b);
			};

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

			checkSchemaCompatibilitySnapshots({
				version: "1",
				schema: new TreeViewConfiguration({ schema: Point1 }),
				fileSystem,
				minVersionForCollaboration: "1",
				mode: "update",
				snapshotDirectory,
				versionComparer,
			});

			checkSchemaCompatibilitySnapshots({
				version: "1.5",
				schema: new TreeViewConfiguration({ schema: Point1 }),
				fileSystem,
				minVersionForCollaboration: "1",
				mode: "update",
				snapshotDirectory,
				versionComparer,
			});

			checkSchemaCompatibilitySnapshots({
				version: "2",
				schema: new TreeViewConfiguration({ schema: Point2 }),
				fileSystem,
				minVersionForCollaboration: "1",
				mode: "update",
				snapshotDirectory,
				versionComparer,
			});

			assert.throws(
				() =>
					checkSchemaCompatibilitySnapshots({
						version: "3",
						schema: new TreeViewConfiguration({ schema: Point3 }),
						fileSystem,
						minVersionForCollaboration: "1",
						mode: "test",
						snapshotDirectory,
						versionComparer,
					}),
				validateError(
					`Schema compatibility check failed:
 - Snapshot for current version "3" is out of date: schema has changed since latest existing snapshot version "2". If this is expected, checkSchemaCompatibilitySnapshots can be rerun in "update" mode to update the snapshot.
 - Historical version "1" cannot view documents from "3": these versions are expected to be able to collaborate due to the selected minVersionForCollaboration snapshot version being "1".
Snapshots in: "dir".
Snapshots exist for versions: [
  "1",
  "2"
].`,
				),
			);

			checkSchemaCompatibilitySnapshots({
				version: "3",
				schema: new TreeViewConfiguration({ schema: Point3 }),
				fileSystem,
				minVersionForCollaboration: "2",
				mode: "update",
				snapshotDirectory,
				versionComparer,
			});

			checkSchemaCompatibilitySnapshots({
				version: "4",
				schema: new TreeViewConfiguration({ schema: Point3 }),
				fileSystem,
				minVersionForCollaboration: "2",
				mode: "test",
				snapshotDirectory,
				versionComparer,
			});

			// Confirm no snapshots were created during the failed test above since it was in test mode.
			assert.deepEqual([...snapshots.keys()], [1, 2, 3]);
		});
	});

	it("getCompatibility", () => {
		const factory = new SchemaFactoryBeta("test");

		class Point2D extends factory.object("Point", {
			x: factory.number,
			y: factory.number,
		}) {}

		class Point2DAllow extends factory.object(
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

		{
			const result = getCompatibility(
				new TreeViewConfiguration({ schema: Point3D }),
				new TreeViewConfiguration({ schema: Point2D }),
			);
			assert.equal(result.currentViewOfSnapshotDocument.canView, false);
			assert.equal(result.currentViewOfSnapshotDocument.canUpgrade, true);
			assert.equal(result.snapshotViewOfCurrentDocument.canView, false);
			assert.equal(result.snapshotViewOfCurrentDocument.canUpgrade, false);
		}

		{
			const result = getCompatibility(
				new TreeViewConfiguration({ schema: Point3D }),
				new TreeViewConfiguration({ schema: Point2DAllow }),
			);
			assert.equal(result.currentViewOfSnapshotDocument.canView, false);
			assert.equal(result.currentViewOfSnapshotDocument.canUpgrade, true);
			assert.equal(result.snapshotViewOfCurrentDocument.canView, true);
			assert.equal(result.snapshotViewOfCurrentDocument.canUpgrade, false);
		}

		{
			const result = getCompatibility(
				new TreeViewConfiguration({ schema: Point3D }),
				new TreeViewConfiguration({ schema: Point3D }),
			);
			assert.equal(result.currentViewOfSnapshotDocument.canView, true);
			assert.equal(result.currentViewOfSnapshotDocument.canUpgrade, true);
			assert.equal(result.snapshotViewOfCurrentDocument.canView, true);
			assert.equal(result.snapshotViewOfCurrentDocument.canUpgrade, true);
		}
	});
});
