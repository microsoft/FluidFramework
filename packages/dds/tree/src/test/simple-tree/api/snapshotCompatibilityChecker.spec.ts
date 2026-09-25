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

import { currentVersion, FluidClientVersion } from "../../../codec/index.js";
import { pkgVersion } from "../../../packageVersion.js";
import {
	checkCompatibility,
	importCompatibilitySchemaSnapshot,
	exportCompatibilitySchemaSnapshot,
	type SnapshotFileSystem,
	snapshotSchemaCompatibility,
	getCompatibility,
	// eslint-disable-next-line import-x/no-internal-modules -- Allow importing file which is being tested.
} from "../../../simple-tree/api/snapshotCompatibilityChecker.js";
import {
	normalizeFieldSchema,
	SchemaFactory,
	SchemaFactoryAlpha,
	TreeViewConfiguration,
	TreeViewConfigurationAlpha,
	SchemaFactoryBeta,
	StagedSchemaUpgradePolicy,
	stringSchema,
	numberSchema,
	allowUnused,
} from "../../../simple-tree/index.js";
import { testSchema } from "../../testTrees.js";
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
		assert(snapshot !== null && typeof snapshot === "object" && "version" in snapshot);
		assert.equal(snapshot.version, 2);
		const parsedView = importCompatibilitySchemaSnapshot(snapshot);

		const normalizedView = normalizeFieldSchema(parsedView.schema);

		assert.equal(normalizedView.allowedTypeSet.size, 1);
		assert.equal(
			normalizedView.allowedTypesIdentifiers.has("com.fluidframework.leaf.string"),
			true,
		);
	});

	describe("parse and snapshot preserve test schemas", () => {
		for (const testCase of testSchema) {
			it(testCase.name, () => {
				// Every test schema, including staged optional fields, must equal its snapshot.
				const originalView = new TreeViewConfigurationAlpha({
					schema: testCase.schema,
					preventAmbiguity: !testCase.ambiguous,
				});
				const snapshot = exportCompatibilitySchemaSnapshot(originalView);
				const parsedView = importCompatibilitySchemaSnapshot(snapshot);

				const result = getCompatibility(originalView, parsedView);
				assert.equal(result.currentViewOfSnapshotDocument.isEquivalent, true);
				assert.equal(result.snapshotViewOfCurrentDocument.isEquivalent, true);
				assert.equal(result.identicalCompatibility, true);
			});
		}
	});

	describe("snapshot format versions", () => {
		it("keeps the version 1 format unchanged", () => {
			const factory = new SchemaFactory("test");
			class User extends factory.object("User", {
				userName: factory.required(factory.string, { key: "name" }),
			}) {}

			assert.deepEqual(
				exportCompatibilitySchemaSnapshot(
					new TreeViewConfiguration({ schema: User }),
					FluidClientVersion.v2_117,
				),
				{
					version: 1,
					root: {
						kind: 1,
						simpleAllowedTypes: {
							"test.User": { isStaged: false },
						},
					},
					definitions: {
						"com.fluidframework.leaf.string": {
							leaf: {
								kind: 3,
								leafKind: 1,
							},
						},
						"test.User": {
							object: {
								kind: 2,
								fields: {
									userName: {
										kind: 1,
										simpleAllowedTypes: {
											"com.fluidframework.leaf.string": { isStaged: false },
										},
										storedKey: "name",
									},
								},
								allowUnknownOptionalFields: false,
							},
						},
					},
				},
			);
		});

		it("rejects staged optional fields when writing version 1", () => {
			const schema = SchemaFactoryAlpha.stagedOptional(SchemaFactoryAlpha.number);
			const view = new TreeViewConfigurationAlpha({ schema });

			assert.throws(
				() => exportCompatibilitySchemaSnapshot(view, FluidClientVersion.v2_117),
				validateUsageError(
					`Staged optional fields require oldestSupportedClientVersion to be at least ${currentVersion}.`,
				),
			);
		});

		for (const [name, schema] of [
			["root field", SchemaFactoryAlpha.stagedOptional(SchemaFactoryAlpha.number)],
			[
				"object field",
				new SchemaFactoryAlpha("test").objectAlpha("Object", {
					field: SchemaFactoryAlpha.stagedOptional(SchemaFactoryAlpha.number),
				}),
			],
		] as const) {
			it(`round-trips staged optional ${name} in version 2`, () => {
				const originalView = new TreeViewConfigurationAlpha({ schema });
				const snapshot = exportCompatibilitySchemaSnapshot(originalView, currentVersion);
				const parsedView = importCompatibilitySchemaSnapshot(snapshot);

				assert.equal(getCompatibility(originalView, parsedView).identicalCompatibility, true);
			});
		}
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

		const combinedCompatibility = getCompatibility(currentViewSchema, oldViewSchema);
		assert.equal(combinedCompatibility.currentViewOfSnapshotDocument.isEquivalent, false);
		assert.equal(combinedCompatibility.snapshotViewOfCurrentDocument.isEquivalent, true);
	});

	it("SnapshotFileSystem", () => {
		// Validate example for how to use implement SnapshotFileSystem using node fs and path modules works.
		allowUnused<requireAssignableTo<typeof nodeFileSystem, SnapshotFileSystem>>();
	});

	describe("snapshotSchemaCompatibility", () => {
		describe("example from docs", () => {
			const factory = new SchemaFactory("test");

			class Point extends factory.object("Point", {
				x: factory.number,
				y: factory.number,
				z: factory.optional(factory.number),
			}) {}

			const config = new TreeViewConfiguration({ schema: Point });
			const snapshotDirectory = path.join(testSrcPath, "schemaSnapshots", "example");

			// This test is included in the docs for snapshotSchemaCompatibility, and should be kept in sync with it.
			it("schema compatibility", () => {
				snapshotSchemaCompatibility({
					schema: config,
					fileSystem: { ...fs, ...path },
					version: pkgVersion,
					minVersionForCollaboration: "2.0.0",
					mode: process.argv.includes("--snapshot") ? "update" : "assert",
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
					snapshotSchemaCompatibility({
						version: "2.0.0",
						schema: new TreeViewConfiguration({ schema: Point2D }), // Using the schema from v1 as v2, so should fail
						fileSystem: nodeFileSystem,
						minVersionForCollaboration: "1.0.0",
						mode: "assert",
						snapshotDirectory,
					}),
				validateError(`Schema compatibility check failed:
 - Snapshot for current version "2.0.0" is out of date: schema has changed since latest existing snapshot version "2.0.0". If this is expected, snapshotSchemaCompatibility can be rerun in "update" mode to update or create the snapshot.
 - Current version "2.0.0" cannot upgrade documents from "2.0.0".
Snapshots in: "${testSrcPath}/schemaSnapshots/point"
Snapshots exist for versions: [
	"1.0.0",
	"2.0.0"
].`),
			);

			assert.throws(
				() =>
					snapshotSchemaCompatibility({
						version: "2.0.0",
						schema: new TreeViewConfiguration({ schema: [] }), // Schema invalid for all versions, so should fail
						fileSystem: nodeFileSystem,
						minVersionForCollaboration: "1.0.0",
						mode: "assert",
						snapshotDirectory,
					}),
				validateError(`Schema compatibility check failed:
 - Snapshot for current version "2.0.0" is out of date: schema has changed since latest existing snapshot version "2.0.0". If this is expected, snapshotSchemaCompatibility can be rerun in "update" mode to update or create the snapshot.
 - Current version "2.0.0" cannot upgrade documents from "1.0.0".
 - Historical version "1.0.0" cannot view documents from "2.0.0": these versions are expected to be able to collaborate due to the selected minVersionForCollaboration "1.0.0".
 - Current version "2.0.0" cannot upgrade documents from "2.0.0".
Snapshots in: "${testSrcPath}/schemaSnapshots/point"
Snapshots exist for versions: [
	"1.0.0",
	"2.0.0"
].`),
			);

			assert.throws(
				() =>
					snapshotSchemaCompatibility({
						version: "2.0.0",
						schema: new TreeViewConfiguration({ schema: Point3D }),
						fileSystem: nodeFileSystem,
						minVersionForCollaboration: "1.0.0", // Due to not using allowUnknownOptionalFields, these cannot collaborate, so should fail
						mode: "assert",
						snapshotDirectory,
					}),
				validateError(`Schema compatibility check failed:
 - Historical version "1.0.0" cannot view documents from "2.0.0": these versions are expected to be able to collaborate due to the selected minVersionForCollaboration "1.0.0".
Snapshots in: "${testSrcPath}/schemaSnapshots/point"
Snapshots exist for versions: [
	"1.0.0",
	"2.0.0"
].`),
			);

			// Avoids all the above tested issues, and matches saved snapshot, so should pass
			snapshotSchemaCompatibility({
				version: "2.0.0",
				schema: new TreeViewConfiguration({ schema: Point3D }),
				fileSystem: nodeFileSystem,
				minVersionForCollaboration: "2.0.0",
				mode: "assert",
				snapshotDirectory,
			});
		});

		it("property keys do not impact schema compatibility snapshots", () => {
			const factory = new SchemaFactory("test");

			class Original extends factory.object("User", {
				userName: factory.required(factory.string, { key: "name" }),
			}) {}

			class Renamed extends factory.object("User", {
				displayName: factory.required(factory.string, { key: "name" }),
			}) {}

			class ChangedStoredKey extends factory.object("User", {
				displayName: factory.string,
			}) {}

			const original = new TreeViewConfiguration({ schema: Original });
			const renamed = new TreeViewConfiguration({ schema: Renamed });
			const changedStoredKey = new TreeViewConfiguration({ schema: ChangedStoredKey });

			assert.deepEqual(
				exportCompatibilitySchemaSnapshot(original),
				exportCompatibilitySchemaSnapshot(renamed),
			);
			assert.equal(getCompatibility(renamed, original).identicalCompatibility, true);
			assert.equal(getCompatibility(changedStoredKey, original).identicalCompatibility, false);
		});

		it("rejects duplicate stored keys in version 1 snapshots", () => {
			assert.throws(
				() =>
					importCompatibilitySchemaSnapshot({
						version: 1,
						root: {
							kind: 1,
							simpleAllowedTypes: {
								"test.User": { isStaged: false },
							},
						},
						definitions: {
							"com.fluidframework.leaf.string": {
								leaf: {
									kind: 3,
									leafKind: 1,
								},
							},
							"test.User": {
								object: {
									kind: 2,
									fields: {
										firstProperty: {
											kind: 1,
											simpleAllowedTypes: {
												"com.fluidframework.leaf.string": { isStaged: false },
											},
											storedKey: "name",
										},
										secondProperty: {
											kind: 1,
											simpleAllowedTypes: {
												"com.fluidframework.leaf.string": { isStaged: false },
											},
											storedKey: "name",
										},
									},
									allowUnknownOptionalFields: false,
								},
							},
						},
					}),
				validateUsageError(/duplicate stored key "name"/),
			);
		});

		it("asserts and normalizes version 1 snapshots", () => {
			const snapshotDirectory = "dir";
			const [fileSystem, snapshots] = inMemorySnapshotFileSystem();
			const factory = new SchemaFactory("test");

			class Original extends factory.object("User", {
				userName: factory.required(factory.string, { key: "name" }),
			}) {}

			class Renamed extends factory.object("User", {
				displayName: factory.required(factory.string, { key: "name" }),
			}) {}

			const renamed = new TreeViewConfiguration({ schema: Renamed });
			const version1Snapshot = exportCompatibilitySchemaSnapshot(
				new TreeViewConfiguration({ schema: Original }),
				FluidClientVersion.v2_117,
			);
			snapshots.set("1.0.0.json", JSON.stringify(version1Snapshot));

			snapshotSchemaCompatibility({
				version: "1.0.0",
				schema: renamed,
				fileSystem,
				minVersionForCollaboration: "1.0.0",
				mode: "assert",
				snapshotDirectory,
				rejectSchemaChangesWithNoVersionChange: true,
				snapshotUnchangedVersions: true,
			});

			snapshotSchemaCompatibility({
				version: "2.0.0",
				schema: renamed,
				fileSystem,
				minVersionForCollaboration: "1.0.0",
				mode: "normalize",
				snapshotDirectory,
			});

			assert.deepEqual([...snapshots.keys()], ["1.0.0.json"]);
			assert.deepEqual(
				JSON.parse(snapshots.get("1.0.0.json") ?? assert.fail("missing snapshot")),
				exportCompatibilitySchemaSnapshot(renamed),
			);
		});

		it("does not normalize a snapshot with a compatibility change", () => {
			const snapshotDirectory = "dir";
			const [fileSystem, snapshots] = inMemorySnapshotFileSystem();
			const factory = new SchemaFactory("test");

			class Original extends factory.object("User", {
				userName: factory.required(factory.string, { key: "name" }),
			}) {}

			class ChangedStoredKey extends factory.object("User", {
				displayName: factory.string,
			}) {}

			const version1Snapshot = exportCompatibilitySchemaSnapshot(
				new TreeViewConfiguration({ schema: Original }),
				FluidClientVersion.v2_117,
			);
			const originalSnapshotText = JSON.stringify(version1Snapshot);
			snapshots.set("1.0.0.json", originalSnapshotText);

			assert.throws(
				() =>
					snapshotSchemaCompatibility({
						version: "1.0.0",
						schema: new TreeViewConfiguration({ schema: ChangedStoredKey }),
						fileSystem,
						minVersionForCollaboration: "1.0.0",
						mode: "normalize",
						snapshotDirectory,
					}),
				/cannot be normalized because its schema has changed/,
			);
			assert.equal(snapshots.get("1.0.0.json"), originalSnapshotText);
		});

		it("does not normalize when historical compatibility validation fails", () => {
			const snapshotDirectory = "dir";
			const [fileSystem, snapshots] = inMemorySnapshotFileSystem();
			const factory = new SchemaFactory("test");

			class Historical extends factory.object("User", {
				value: factory.string,
			}) {}

			class Current extends factory.object("User", {
				value: factory.number,
			}) {}

			snapshots.set(
				"1.0.0.json",
				JSON.stringify(
					exportCompatibilitySchemaSnapshot(new TreeViewConfiguration({ schema: Historical })),
				),
			);
			const version1CurrentSnapshot = JSON.stringify(
				exportCompatibilitySchemaSnapshot(
					new TreeViewConfiguration({ schema: Current }),
					FluidClientVersion.v2_117,
				),
			);
			snapshots.set("2.0.0.json", version1CurrentSnapshot);

			assert.throws(
				() =>
					snapshotSchemaCompatibility({
						version: "2.0.0",
						schema: new TreeViewConfiguration({ schema: Current }),
						fileSystem,
						minVersionForCollaboration: "2.0.0",
						mode: "normalize",
						snapshotDirectory,
					}),
				/Cannot upgrade documents from "1.0.0"/i,
			);
			assert.equal(snapshots.get("2.0.0.json"), version1CurrentSnapshot);
		});

		// Tests the various operations a user of the snapshotSchemaCompatibility function might perform across various versions of their codebase.
		it("workflow over time", () => {
			const snapshotDirectory = "dir";
			const [fileSystem, snapshots] = inMemorySnapshotFileSystem();

			const factory = new SchemaFactoryBeta("assert");

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

			// The first time they use snapshotSchemaCompatibility, no snapshot will exist, and it must error suggesting a snapshot be created using update.
			assert.throws(
				() =>
					snapshotSchemaCompatibility({
						version: "1.0.0",
						schema: new TreeViewConfiguration({ schema: Point1 }),
						fileSystem,
						minVersionForCollaboration: "1.0.0",
						mode: "assert",
						snapshotDirectory,
					}),
				validateError(
					`Schema compatibility check failed:
 - No snapshots found. If this is expected, snapshotSchemaCompatibility can be rerun in "update" mode to update or create the snapshot.
Snapshots in: "dir"
Snapshots exist for versions: [].`,
				),
			);

			// Confirm no snapshots were created during the failed test above since it was in test mode.
			assert.deepEqual([...snapshots.keys()], []);

			// Update, as directed by the error message, to create the initial snapshot.
			snapshotSchemaCompatibility({
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
			snapshotSchemaCompatibility({
				version: "1.0.0",
				schema: new TreeViewConfiguration({ schema: Point1 }),
				fileSystem,
				minVersionForCollaboration: "1.0.0",
				mode: "assert",
				snapshotDirectory,
			});

			// Point2 has allowUnknownOptionalFields but is otherwise equivalent to Point1, so it should not a compatibility error.
			// It should however error due to the snapshot not being up to date.
			// This verifies that the implementation correctly considers these schemas equivalent.
			assert.throws(
				() =>
					snapshotSchemaCompatibility({
						version: "1.0.0",
						schema: new TreeViewConfiguration({ schema: Point2 }),
						fileSystem,
						minVersionForCollaboration: "1.0.0",
						mode: "assert",
						snapshotDirectory,
					}),
				validateError(`Schema compatibility check failed:
 - Snapshot for current version "1.0.0" is out of date: schema has changed since latest existing snapshot version "1.0.0". If this is expected, snapshotSchemaCompatibility can be rerun in "update" mode to update or create the snapshot.
Snapshots in: "dir"
Snapshots exist for versions: [
	"1.0.0"
].`),
			);

			// If the change was desired, a new snapshot can be taken to include it in 2.0.0:
			snapshotSchemaCompatibility({
				version: "2.0.0",
				schema: new TreeViewConfiguration({ schema: Point2 }),
				fileSystem,
				minVersionForCollaboration: "1.0.0",
				mode: "update",
				snapshotDirectory,
			});

			assert.deepEqual([...snapshots.keys()], ["1.0.0.json", "2.0.0.json"]);

			snapshotSchemaCompatibility({
				version: "2.0.0",
				schema: new TreeViewConfiguration({ schema: Point2 }),
				fileSystem,
				minVersionForCollaboration: "1.0.0",
				mode: "assert",
				snapshotDirectory,
			});

			// Now we can make a breaking schema change, dropping support for collaboration with 1.0.0 by moving to Point3.
			// In this case the developer did not realize it is a breaking change, and so the test notifies them of the issue:
			assert.throws(
				() =>
					snapshotSchemaCompatibility({
						version: "3.0.0",
						schema: new TreeViewConfiguration({ schema: Point3 }),
						fileSystem,
						minVersionForCollaboration: "1.0.0",
						mode: "update",
						snapshotDirectory,
					}),
				validateError(`Schema compatibility check failed:
 - Historical version "1.0.0" cannot view documents from "3.0.0": these versions are expected to be able to collaborate due to the selected minVersionForCollaboration "1.0.0".
Snapshots in: "dir"
Snapshots exist for versions: [
	"1.0.0",
	"2.0.0"
].`),
			);

			assert.deepEqual([...snapshots.keys()], ["1.0.0.json", "2.0.0.json", "3.0.0.json"]);

			// In this case the developer is ok with dropping support for collaboration with 1.0.0,
			// so they update minVersionForCollaboration to 2.0.0 acknowledging the break.
			snapshotSchemaCompatibility({
				version: "3.0.0",
				schema: new TreeViewConfiguration({ schema: Point3 }),
				fileSystem,
				minVersionForCollaboration: "2.0.0",
				mode: "assert",
				snapshotDirectory,
			});

			// If they go to publish patch or minor versions, the snapshots should not need updating (since  snapshotUnchangedVersions is false) as confirmed by this test:
			snapshotSchemaCompatibility({
				version: "3.1.0",
				schema: new TreeViewConfiguration({ schema: Point3 }),
				fileSystem,
				minVersionForCollaboration: "2.0.0",
				mode: "assert",
				snapshotDirectory,
			});

			// If the app developers specifically want to snapshot every version's schema, they can require that with `snapshotUnchangedVersions: true` as validated here:
			assert.throws(
				() =>
					snapshotSchemaCompatibility({
						version: "3.1.0",
						schema: new TreeViewConfiguration({ schema: Point3 }),
						fileSystem,
						minVersionForCollaboration: "2.0.0",
						mode: "assert",
						snapshotDirectory,
						snapshotUnchangedVersions: true,
					}),
				validateError(`Schema compatibility check failed:
 - No snapshot found for version "3.1.0": snapshotUnchangedVersions is true, so every version must be snapshotted. If this is expected, snapshotSchemaCompatibility can be rerun in "update" mode to update or create the snapshot.
Snapshots in: "dir"
Snapshots exist for versions: [
	"1.0.0",
	"2.0.0",
	"3.0.0"
].`),
			);

			// Here we confirm that even when running update, no new snapshot is taken if the schema is unchanged and snapshotUnchangedVersions is false.
			snapshotSchemaCompatibility({
				version: "3.1.0",
				schema: new TreeViewConfiguration({ schema: Point3 }),
				fileSystem,
				minVersionForCollaboration: "2.0.0",
				mode: "update",
				snapshotDirectory,
			});

			assert.deepEqual([...snapshots.keys()], ["1.0.0.json", "2.0.0.json", "3.0.0.json"]);

			// But if snapshotUnchangedVersions is true, a new snapshot is taken even though the schema is unchanged.
			snapshotSchemaCompatibility({
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

			// Confirm that tests pass with "assert" mode and snapshotUnchangedVersions true.
			snapshotSchemaCompatibility({
				version: "3.1.0",
				schema: new TreeViewConfiguration({ schema: Point3 }),
				fileSystem,
				minVersionForCollaboration: "2.0.0",
				mode: "assert",
				snapshotDirectory,
				snapshotUnchangedVersions: true,
			});

			// Confirm that when using snapshotUnchangedVersions, it is an error if minVersionForCollaboration is a version between snapshots
			// since in that mode it is assumed every released version has a snapshot.
			assert.throws(
				() =>
					snapshotSchemaCompatibility({
						version: "3.1.0",
						schema: new TreeViewConfiguration({ schema: Point3 }),
						fileSystem,
						minVersionForCollaboration: "2.1.0",
						mode: "assert",
						snapshotDirectory,
						snapshotUnchangedVersions: true,
					}),
				validateError(`Schema compatibility check failed:
 - Using snapshotUnchangedVersions: a snapshot of the exact minVersionForCollaboration "2.1.0" is required. No snapshot found.
Snapshots in: "dir"
Snapshots exist for versions: [
	"1.0.0",
	"2.0.0",
	"3.0.0",
	"3.1.0"
].`),
			);

			// Final sanity check that everything is left in a good state.
			snapshotSchemaCompatibility({
				version: "3.1.0",
				schema: new TreeViewConfiguration({ schema: Point3 }),
				fileSystem,
				minVersionForCollaboration: "2.1.0",
				mode: "assert",
				snapshotDirectory,
			});
		});

		it("invalid versions", () => {
			const snapshotDirectory = "dir";
			const [fileSystem] = inMemorySnapshotFileSystem();

			assert.throws(
				() =>
					snapshotSchemaCompatibility({
						version: "3.1.0x",
						schema: new TreeViewConfiguration({ schema: [] }),
						fileSystem,
						minVersionForCollaboration: "2.1.0",
						mode: "assert",
						snapshotDirectory,
					}),
				validateUsageError(`Invalid version: "3.1.0x". Must be a valid semver version.`),
			);

			assert.throws(
				() =>
					snapshotSchemaCompatibility({
						version: "3.1.0",
						schema: new TreeViewConfiguration({ schema: [] }),
						fileSystem,
						minVersionForCollaboration: "2.1",
						mode: "assert",
						snapshotDirectory,
					}),
				validateUsageError(
					`Invalid minVersionForCollaboration: "2.1". Must be a valid semver version.`,
				),
			);

			assert.throws(
				() =>
					snapshotSchemaCompatibility({
						version: "3.1.0",
						schema: new TreeViewConfiguration({ schema: [] }),
						fileSystem,
						minVersionForCollaboration: "3.1.1",
						mode: "assert",
						snapshotDirectory,
					}),
				validateUsageError(
					`Invalid minVersionForCollaboration: "3.1.1". Must be less than or equal to current version "3.1.0".`,
				),
			);

			assert.throws(
				() =>
					snapshotSchemaCompatibility({
						version: "1.0.0-beta",
						schema: new TreeViewConfiguration({ schema: [] }),
						fileSystem,
						minVersionForCollaboration: "1.0.0",
						mode: "assert",
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

			const factory = new SchemaFactoryBeta("assert");

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

			snapshotSchemaCompatibility({
				version: "1",
				schema: new TreeViewConfiguration({ schema: Point1 }),
				fileSystem,
				minVersionForCollaboration: "1",
				mode: "update",
				snapshotDirectory,
				versionComparer,
			});

			snapshotSchemaCompatibility({
				version: "1.5",
				schema: new TreeViewConfiguration({ schema: Point1 }),
				fileSystem,
				minVersionForCollaboration: "1",
				mode: "update",
				snapshotDirectory,
				versionComparer,
			});

			snapshotSchemaCompatibility({
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
					snapshotSchemaCompatibility({
						version: "3",
						schema: new TreeViewConfiguration({ schema: Point3 }),
						fileSystem,
						minVersionForCollaboration: "1",
						mode: "assert",
						snapshotDirectory,
						versionComparer,
					}),
				validateError(
					`Schema compatibility check failed:
 - Snapshot for current version "3" is out of date: schema has changed since latest existing snapshot version "2". If this is expected, snapshotSchemaCompatibility can be rerun in "update" mode to update or create the snapshot.
 - Historical version "1" cannot view documents from "3": these versions are expected to be able to collaborate due to the selected minVersionForCollaboration "1".
Snapshots in: "dir"
Snapshots exist for versions: [
	"1",
	"2"
].`,
				),
			);

			snapshotSchemaCompatibility({
				version: "3",
				schema: new TreeViewConfiguration({ schema: Point3 }),
				fileSystem,
				minVersionForCollaboration: "2",
				mode: "update",
				snapshotDirectory,
				versionComparer,
			});

			snapshotSchemaCompatibility({
				version: "4",
				schema: new TreeViewConfiguration({ schema: Point3 }),
				fileSystem,
				minVersionForCollaboration: "2",
				mode: "assert",
				snapshotDirectory,
				versionComparer,
			});

			// Confirm no snapshots were created during the failed test above since it was in test mode.
			assert.deepEqual([...snapshots.keys()], ["1.json", "2.json", "3.json"]);
		});

		it("custom snapshot file name format", () => {
			const snapshotDirectory = "dir";
			const [fileSystem, snapshots] = inMemorySnapshotFileSystem();
			const snapshotFileNameFormat = {
				prefix: "point-schema-",
				suffix: "-snapshot",
			};
			const schema = new TreeViewConfiguration({ schema: [] });

			snapshotSchemaCompatibility({
				version: "1.0.0",
				schema,
				fileSystem,
				minVersionForCollaboration: "1.0.0",
				mode: "update",
				snapshotDirectory,
				snapshotFileNameFormat,
				snapshotUnchangedVersions: true,
			});

			snapshots.set("unrelated.json", "{}");

			snapshotSchemaCompatibility({
				version: "2.0.0",
				schema,
				fileSystem,
				minVersionForCollaboration: "1.0.0",
				mode: "update",
				snapshotDirectory,
				snapshotFileNameFormat,
				snapshotUnchangedVersions: true,
			});

			assert.deepEqual(
				[...snapshots.keys()],
				[
					"point-schema-1.0.0-snapshot.json",
					"unrelated.json",
					"point-schema-2.0.0-snapshot.json",
				],
			);
		});

		it("rejects invalid characters in custom snapshot file name format", () => {
			const [fileSystem] = inMemorySnapshotFileSystem();
			const schema = new TreeViewConfiguration({ schema: [] });

			for (const [property, value] of [
				["prefix", "schema/"],
				["prefix", "schema\\"],
				["prefix", "schema\0"],
				["prefix", "schema\u0001"],
				["suffix", "<snapshot"],
				["suffix", ">snapshot"],
				["suffix", ":snapshot"],
				["suffix", '"snapshot'],
				["suffix", "|snapshot"],
				["suffix", "?snapshot"],
				["suffix", "*snapshot"],
			] as const) {
				assert.throws(
					() =>
						snapshotSchemaCompatibility({
							version: "1.0.0",
							schema,
							fileSystem,
							minVersionForCollaboration: "1.0.0",
							mode: "update",
							snapshotDirectory: "dir",
							snapshotFileNameFormat: { [property]: value },
						}),
					validateUsageError(
						`Invalid snapshotFileNameFormat.${property}: ${JSON.stringify(value)}. Must not contain ASCII control characters or any of <>:"/\\|?*.`,
					),
				);
			}
		});

		it("snapshotUnchangedVersions", () => {
			const snapshotDirectory = "dir";
			const [fileSystem] = inMemorySnapshotFileSystem();

			snapshotSchemaCompatibility({
				version: "1.0.0",
				schema: new TreeViewConfiguration({ schema: [] }),
				fileSystem,
				minVersionForCollaboration: "1.0.0",
				mode: "update",
				snapshotDirectory,
				snapshotUnchangedVersions: true,
			});

			assert.throws(
				() =>
					snapshotSchemaCompatibility({
						version: "2.0.0",
						schema: new TreeViewConfiguration({ schema: [] }),
						fileSystem,
						minVersionForCollaboration: "1.0.0",
						mode: "assert",
						snapshotDirectory,
						snapshotUnchangedVersions: true,
					}),
				validateError(`Schema compatibility check failed:
 - No snapshot found for version "2.0.0": snapshotUnchangedVersions is true, so every version must be snapshotted. If this is expected, snapshotSchemaCompatibility can be rerun in "update" mode to update or create the snapshot.
Snapshots in: "dir"
Snapshots exist for versions: [
	"1.0.0"
].`),
			);

			assert.throws(
				() =>
					snapshotSchemaCompatibility({
						version: "2.0.0",
						schema: new TreeViewConfiguration({ schema: [] }),
						fileSystem,
						minVersionForCollaboration: "1.5.0",
						mode: "assert",
						snapshotDirectory,
						snapshotUnchangedVersions: true,
					}),
				validateError(`Schema compatibility check failed:
 - No snapshot found for version "2.0.0": snapshotUnchangedVersions is true, so every version must be snapshotted. If this is expected, snapshotSchemaCompatibility can be rerun in "update" mode to update or create the snapshot.
 - Using snapshotUnchangedVersions: a snapshot of the exact minVersionForCollaboration "1.5.0" is required. No snapshot found.
Snapshots in: "dir"
Snapshots exist for versions: [
	"1.0.0"
].`),
			);
		});

		it("minVersionForCollaboration between snapshots", () => {
			const snapshotDirectory = "dir";
			const [fileSystem] = inMemorySnapshotFileSystem();

			snapshotSchemaCompatibility({
				version: "1.0.0",
				schema: new TreeViewConfiguration({ schema: [] }),
				fileSystem,
				minVersionForCollaboration: "1.0.0",
				mode: "update",
				snapshotDirectory,
			});

			snapshotSchemaCompatibility({
				version: "2.0.0",
				schema: new TreeViewConfiguration({ schema: [] }),
				fileSystem,
				minVersionForCollaboration: "1.5.0",
				mode: "assert",
				snapshotDirectory,
			});

			assert.throws(
				() =>
					snapshotSchemaCompatibility({
						version: "2.0.0",
						schema: new TreeViewConfiguration({ schema: [] }),
						fileSystem,
						minVersionForCollaboration: "1.5.0",
						mode: "assert",
						snapshotDirectory,
						snapshotUnchangedVersions: true,
					}),
				validateError(`Schema compatibility check failed:
 - No snapshot found for version "2.0.0": snapshotUnchangedVersions is true, so every version must be snapshotted. If this is expected, snapshotSchemaCompatibility can be rerun in "update" mode to update or create the snapshot.
 - Using snapshotUnchangedVersions: a snapshot of the exact minVersionForCollaboration "1.5.0" is required. No snapshot found.
Snapshots in: "dir"
Snapshots exist for versions: [
	"1.0.0"
].`),
			);

			assert.throws(
				() =>
					snapshotSchemaCompatibility({
						version: "2.0.0",
						schema: new TreeViewConfiguration({ schema: [SchemaFactory.number] }),
						fileSystem,
						minVersionForCollaboration: "1.5.0",
						mode: "assert",
						snapshotDirectory,
					}),
				validateError(`Schema compatibility check failed:
 - Snapshot for current version "2.0.0" is out of date: schema has changed since latest existing snapshot version "1.0.0". If this is expected, snapshotSchemaCompatibility can be rerun in "update" mode to update or create the snapshot.
 - Historical version "1.5.0" cannot view documents from "2.0.0": these versions are expected to be able to collaborate due to the selected minVersionForCollaboration "1.5.0".
Snapshots in: "dir"
Snapshots exist for versions: [
	"1.0.0"
].
Due to snapshotUnchangedVersions being false and minVersionForCollaboration ("1.5.0") not having an exact snapshot, the last snapshot before that version (which is "1.0.0") is being also being checked as if it is version "1.5.0".`),
			);

			snapshotSchemaCompatibility({
				version: "2.0.0",
				schema: new TreeViewConfiguration({ schema: [SchemaFactory.number] }),
				fileSystem,
				minVersionForCollaboration: "2.0.0",
				mode: "update",
				snapshotDirectory,
			});

			assert.throws(
				() =>
					snapshotSchemaCompatibility({
						version: "2.0.0",
						schema: new TreeViewConfiguration({ schema: [SchemaFactory.number] }),
						fileSystem,
						minVersionForCollaboration: "1.5.0",
						mode: "update",
						snapshotDirectory,
					}),
				validateError(`Schema compatibility check failed:
 - Historical version "1.5.0" cannot view documents from "2.0.0": these versions are expected to be able to collaborate due to the selected minVersionForCollaboration "1.5.0".
Snapshots in: "dir"
Snapshots exist for versions: [
	"1.0.0",
	"2.0.0"
].
Due to snapshotUnchangedVersions being false and minVersionForCollaboration ("1.5.0") not having an exact snapshot, the last snapshot before that version (which is "1.0.0") is being also being checked as if it is version "1.5.0".`),
			);
		});

		it("rejectVersionsWithNoSchemaChange", () => {
			const snapshotDirectory = "dir";
			const [fileSystem, snapshots] = inMemorySnapshotFileSystem();

			snapshotSchemaCompatibility({
				version: "1.0.0",
				schema: new TreeViewConfiguration({ schema: [] }),
				fileSystem,
				minVersionForCollaboration: "1.0.0",
				mode: "update",
				snapshotDirectory,
				rejectVersionsWithNoSchemaChange: true,
			});

			assert.throws(
				() =>
					snapshotSchemaCompatibility({
						version: "2.0.0",
						schema: new TreeViewConfiguration({ schema: [] }),
						fileSystem,
						minVersionForCollaboration: "1.0.0",
						mode: "assert",
						snapshotDirectory,
						rejectVersionsWithNoSchemaChange: true,
					}),
				validateError(`Schema compatibility check failed:
Rejecting version change ("1.0.0" to "2.0.0") due to rejectVersionsWithNoSchemaChange being set.
Snapshots in: "dir"
Snapshots exist for versions: [
	"1.0.0"
].`),
			);

			assert.deepEqual([...snapshots.keys()], ["1.0.0.json"]);

			snapshotSchemaCompatibility({
				version: "2.0.0",
				schema: new TreeViewConfiguration({ schema: [SchemaFactory.number] }),
				fileSystem,
				minVersionForCollaboration: "2.0.0",
				mode: "update",
				snapshotDirectory,
				rejectVersionsWithNoSchemaChange: true,
			});

			assert.deepEqual([...snapshots.keys()], ["1.0.0.json", "2.0.0.json"]);
		});

		it("rejectSchemaChangesWithNoVersionChange", () => {
			const snapshotDirectory = "dir";
			const [fileSystem] = inMemorySnapshotFileSystem();

			snapshotSchemaCompatibility({
				version: "1.0.0",
				schema: new TreeViewConfiguration({ schema: [] }),
				fileSystem,
				minVersionForCollaboration: "1.0.0",
				mode: "update",
				snapshotDirectory,
				rejectSchemaChangesWithNoVersionChange: true,
			});

			assert.throws(
				() =>
					snapshotSchemaCompatibility({
						version: "1.0.0",
						schema: new TreeViewConfiguration({ schema: [SchemaFactory.number] }),
						fileSystem,
						minVersionForCollaboration: "1.0.0",
						mode: "update",
						snapshotDirectory,
						rejectSchemaChangesWithNoVersionChange: true,
					}),
				validateError(`Schema compatibility check failed:
Rejecting schema change without version change due to existing  non-equivalent snapshot for version ("1.0.0" due to rejectSchemaChangesWithNoVersionChange being set.
Snapshots in: "dir"
Snapshots exist for versions: [
	"1.0.0"
].`),
			);

			snapshotSchemaCompatibility({
				version: "2.0.0",
				schema: new TreeViewConfiguration({ schema: [SchemaFactory.number] }),
				fileSystem,
				minVersionForCollaboration: "2.0.0",
				mode: "update",
				snapshotDirectory,
				rejectSchemaChangesWithNoVersionChange: true,
			});
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

	it("getCompatibility handles staged schema symmetrically", () => {
		const factory = new SchemaFactoryBeta("test");
		const stagedString = factory.staged(factory.string);
		const stagedSchema = factory.optional(factory.types([factory.number, stagedString]));
		const enabledSchema = factory.optional([factory.number, factory.string]);

		const result = getCompatibility(
			/* current: */ new TreeViewConfiguration({ schema: enabledSchema }),
			/* previous: */ new TreeViewConfiguration({ schema: stagedSchema }),
		);

		assert.equal(result.currentViewOfSnapshotDocument.isEquivalent, false);
		assert.equal(result.snapshotViewOfCurrentDocument.isEquivalent, true);
		assert.equal(result.identicalCompatibility, false);
	});

	it("getCompatibility distinguishes identical view schema with different staged policies", () => {
		const factory = new SchemaFactoryBeta("test");
		const stagedString = factory.staged(factory.string);
		const stringUpgrade = stagedString.metadata.stagedSchemaUpgrade;
		assert(stringUpgrade !== undefined);
		const schema = factory.optional(factory.types([factory.number, stagedString]));
		const enabledConfig = new TreeViewConfigurationAlpha({
			schema,
			stagedUpgradePolicy: StagedSchemaUpgradePolicy.enabledStagedUpgrades(stringUpgrade),
		});
		const restrictiveConfig = new TreeViewConfiguration({ schema });

		const result = getCompatibility(
			/* current: */ enabledConfig,
			/* previous: */ restrictiveConfig,
		);

		assert.equal(result.currentViewOfSnapshotDocument.isEquivalent, false);
		assert.equal(result.snapshotViewOfCurrentDocument.isEquivalent, true);
		assert.equal(result.identicalCompatibility, false);
	});

	it("checkCompatibility uses the stored schema configuration's staged upgrade policy", () => {
		const factory = new SchemaFactoryBeta("test");
		const stagedString = factory.staged(factory.string);
		const stringUpgrade = stagedString.metadata.stagedSchemaUpgrade;
		assert(stringUpgrade !== undefined);
		const stagedSchema = factory.optional(factory.types([factory.number, stagedString]));
		const enabledSchema = factory.optional([factory.number, factory.string]);
		const storedSchemaConfig = new TreeViewConfigurationAlpha({
			schema: stagedSchema,
			stagedUpgradePolicy: StagedSchemaUpgradePolicy.enabledStagedUpgrades(stringUpgrade),
		});

		const result = checkCompatibility(
			storedSchemaConfig,
			new TreeViewConfiguration({ schema: enabledSchema }),
		);

		assert.equal(result.isEquivalent, true);
	});

	it("checkCompatibility uses the viewing configuration's staged upgrade policy", () => {
		const factory = new SchemaFactoryBeta("test");
		const stagedString = factory.staged(factory.string);
		const stagedSchema = factory.optional(factory.types([factory.number, stagedString]));
		const enabledSchema = factory.optional([factory.number, factory.string]);
		const view = new TreeViewConfigurationAlpha({
			schema: stagedSchema,
			stagedUpgradePolicy: {
				includeAlreadyEnabledUpgrades: false,
				includeStaged: () => false,
				includeStagedOptional: () => false,
			},
		});

		const result = checkCompatibility(
			new TreeViewConfiguration({ schema: enabledSchema }),
			view,
		);

		assert.equal(result.canView, true);
		assert.equal(result.canUpgrade, false);
		assert.equal(result.isEquivalent, false);
	});
});
