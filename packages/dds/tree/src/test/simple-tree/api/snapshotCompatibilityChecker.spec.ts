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
import { ValueSchema } from "../../../core/index.js";
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
	createTreeSchema,
	encodeSchemaCompatibilitySnapshot,
	FieldKind,
	NodeKind,
	getSchemaUpgradeCandidate,
	toInitialSchema,
} from "../../../simple-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- Count discovery rather than just comparing snapshot contents.
import { getTreeNodeSchemaPrivateData } from "../../../simple-tree/core/index.js";
import { testSchema } from "../../testTrees.js";
import { testSrcPath } from "../../testSrcPath.cjs";
import { expectSchemaEqual, inMemorySnapshotFileSystem } from "../../utils.js";

const nodeFileSystem = {
	...fs,
	...path,
};

describe("snapshotCompatibilityChecker", () => {
	it("exports fresh snapshots without rediscovering a configured schema", () => {
		const sf = new SchemaFactoryAlpha("snapshotReuse");
		class Child extends sf.object("Child", { value: sf.stagedOptional(sf.number) }) {}
		class Root extends sf.object("Root", { child: Child }) {}
		const config = new TreeViewConfigurationAlpha({ schema: Root });
		const expected = encodeSchemaCompatibilitySnapshot(createTreeSchema(Root));
		let reads = 0;
		for (const node of [Root, Child]) {
			const data = getTreeNodeSchemaPrivateData(node);
			const types = data.childAllowedTypes;
			Object.defineProperty(data, "childAllowedTypes", {
				get() {
					reads++;
					return types;
				},
			});
		}
		const first = exportCompatibilitySchemaSnapshot(config);
		const second = exportCompatibilitySchemaSnapshot({ schema: Root });
		assert.equal(reads, 0);
		assert.notStrictEqual(first, second);
		assert.equal(JSON.stringify(first), JSON.stringify(expected));
		assert.equal(JSON.stringify(second), JSON.stringify(expected));
	});

	it("accepts existing snapshots with unsorted definitions without changing compatibility", () => {
		const snapshot = {
			version: 1,
			root: {
				kind: FieldKind.Required,
				simpleAllowedTypes: {
					[stringSchema.identifier]: { isStaged: false },
					[numberSchema.identifier]: { isStaged: false },
				},
			},
			definitions: {
				[stringSchema.identifier]: {
					leaf: { kind: NodeKind.Leaf, leafKind: ValueSchema.String },
				},
				[numberSchema.identifier]: {
					leaf: { kind: NodeKind.Leaf, leafKind: ValueSchema.Number },
				},
			},
		};
		const current = new TreeViewConfigurationAlpha({
			schema: [stringSchema, numberSchema],
		});
		const original = importCompatibilitySchemaSnapshot(snapshot);
		const regenerated = importCompatibilitySchemaSnapshot(
			exportCompatibilitySchemaSnapshot(current),
		);

		for (const parsed of [original, regenerated]) {
			const result = getCompatibility(current, parsed);
			assert.equal(result.currentViewOfSnapshotDocument.canView, true);
			assert.equal(result.snapshotViewOfCurrentDocument.canView, true);
			assert.equal(result.identicalCompatibility, true);
		}
		assert.deepEqual(Object.keys(snapshot.definitions), [
			stringSchema.identifier,
			numberSchema.identifier,
		]);
	});

	it("parse and snapshot can roundtrip schema", () => {
		const factory = new SchemaFactoryAlpha("test");
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

	describe("parse and snapshot preserve test schemas", () => {
		// TODO:AB#82814: Preserve staged optionality in the snapshot format and reconstruction before enabling these cases.
		const stagedOptionalTestCases = new Set([
			"hasStagedOptionalField",
			"stagedOptionalRoot",
			"nestedStagedOptional",
		]);

		for (const testCase of testSchema) {
			// Staged-optional fields currently round-trip as ordinary optional fields, changing initialization and compatibility.
			const test = stagedOptionalTestCases.has(testCase.name) ? it.skip : it;
			test(testCase.name, () => {
				// Every test schema, including staged optional fields, must equal its snapshot.
				const originalView = new TreeViewConfigurationAlpha({
					schema: testCase.schema,
					preventAmbiguity: !testCase.ambiguous,
				});
				const snapshot = exportCompatibilitySchemaSnapshot(originalView);
				const parsedView = importCompatibilitySchemaSnapshot(snapshot);

				const result = getCompatibility(originalView, parsedView);
				assert.equal(result.currentViewOfSnapshotDocument.canView, true);
				assert.equal(result.snapshotViewOfCurrentDocument.canView, true);
				assert.equal(result.identicalCompatibility, true);
			});
		}
	});

	function checkCompatibilityDetectsUpgradeableSchemas(roundtripSnapshot: boolean): void {
		const factory = new SchemaFactoryAlpha("test");

		// The past view schema, for the purposes of illustration. This wouldn't normally appear as a concrete schema in the test
		// checking compatibility, but rather would be loaded from a snapshot.
		class Point2D extends factory.objectAlpha(
			"Point",
			{
				x: factory.number,
				y: factory.number,
			},
			{ allowUnknownOptionalFields: false },
		) {}

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

		// Point2D explicitly disallows unknown optional fields, so it cannot view or safely upgrade newer documents.
		assert.equal(forwardsCompatibilityStatus.canView, false);
		assert.equal(forwardsCompatibilityStatus.canUpgrade, false);
	}

	it("checkCompatibility detects upgradeable schemas", () => {
		checkCompatibilityDetectsUpgradeableSchemas(false);
	});

	it("checkCompatibility detects upgradeable schemas - snapshot test", () => {
		checkCompatibilityDetectsUpgradeableSchemas(true);
	});

	/**
	 * V1 permits an optional numeric root and stages strings without enabling them.
	 * V2 fully enables strings at the same root.
	 *
	 * Compare each view against documents initialized by the other version using the default restrictive policy.
	 * V2 must upgrade V1 documents before it can write strings; V1 can already read V2 documents through its staged declaration.
	 * V1's upgrade must remain permitted because it preserves the enabled string type.
	 * The snapshots still differ: new V1 documents exclude strings while new V2 documents allow them.
	 */
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

		// Historical documents allow only numbers; the current view must add string support, so its upgrade is not a no-op.
		assert.equal(combinedCompatibility.currentViewOfSnapshotDocument.canView, false);
		assert.equal(combinedCompatibility.currentViewOfSnapshotDocument.canUpgrade, true);

		// Current documents already allow strings. The historical view supports them through staging and preserves that enabled upgrade.
		// Its upgrade therefore leaves the stored schema unchanged.
		assert.equal(combinedCompatibility.snapshotViewOfCurrentDocument.canView, true);
		assert.equal(combinedCompatibility.snapshotViewOfCurrentDocument.canUpgrade, true);
		assert.equal(combinedCompatibility.identicalCompatibility, false);
	});

	/**
	 * V1 stages strings at both `primaryPriority` and `fallbackPriority` using one shared token.
	 * V2 fully enables strings only at `primaryPriority` and leaves `fallbackPriority` numeric (removing the staged string support).
	 *
	 * Export and reconstruct V1, then compare its compatibility with V2 against the results from the original V1 declaration.
	 * Reconstruction must preserve both directional compatibility results even though it does not preserve shared token identity.
	 * V1's upgrade candidate for a V2 document must retain primary strings without enabling fallback strings.
	 * V2 must be able to upgrade V1 documents, and snapshot validation must accept the rollout with V1 still in the collaboration window.
	 */
	it("preserves partially enabled staged types after reconstructing the historical snapshot", () => {
		const factory = new SchemaFactoryBeta("partialPrioritySnapshot");

		const stagedString = factory.staged(factory.string);
		const stagedPriorities = factory.types([factory.number, stagedString]);
		class TaskV1 extends factory.object("Task", {
			primaryPriority: stagedPriorities,
			fallbackPriority: stagedPriorities,
		}) {}

		// Fully enable strings only at the primary field; the fallback field remains numeric.
		class TaskV2 extends factory.object("Task", {
			primaryPriority: [factory.number, factory.string],
			fallbackPriority: factory.number,
		}) {}
		const originalHistorical = new TreeViewConfiguration({ schema: TaskV1 });
		const historical = importCompatibilitySchemaSnapshot(
			structuredClone(exportCompatibilitySchemaSnapshot(originalHistorical)),
		);
		const current = new TreeViewConfiguration({ schema: TaskV2 });
		const result = getCompatibility(current, historical);

		// Reconstruction must preserve the directional flags, even though snapshotting does not preserve token identity.
		const originalResult = getCompatibility(current, originalHistorical);
		for (const direction of [
			"currentViewOfSnapshotDocument",
			"snapshotViewOfCurrentDocument",
		] as const) {
			for (const flag of ["canView", "canUpgrade"] as const) {
				assert.equal(result[direction][flag], originalResult[direction][flag]);
			}
		}

		// The older view retains primary strings without enabling them at the fallback field.
		// Compare the candidate directly so accidentally enabling fallback strings cannot pass as a no-op.
		assert.equal(result.snapshotViewOfCurrentDocument.canView, true);
		assert.equal(result.snapshotViewOfCurrentDocument.canUpgrade, true);
		const stored = toInitialSchema(current.schema);
		expectSchemaEqual(
			getSchemaUpgradeCandidate(
				createTreeSchema(historical.schema),
				stored,
				StagedSchemaUpgradePolicy.restrictive,
			),
			stored,
		);

		// The later view still needs to add primary string support to documents created by the earlier restrictive schema.
		assert.equal(result.currentViewOfSnapshotDocument.canView, false);
		assert.equal(result.currentViewOfSnapshotDocument.canUpgrade, true);

		assert.equal(result.identicalCompatibility, false);

		const [fileSystem] = inMemorySnapshotFileSystem();
		snapshotSchemaCompatibility({
			schema: historical,
			fileSystem,
			version: "1.0.0",
			minVersionForCollaboration: "1.0.0",
			mode: "update",
			snapshotDirectory: "partialPrioritySnapshot",
		});
		for (const mode of ["update", "assert"] as const) {
			snapshotSchemaCompatibility({
				schema: current,
				fileSystem,
				version: "2.0.0",
				minVersionForCollaboration: "1.0.0",
				mode,
				snapshotDirectory: "partialPrioritySnapshot",
			});
		}
	});

	/**
	 * V1 permits numeric and string `priority` values.
	 * V2 removes string support entirely rather than retaining it as a staged alternative.
	 *
	 * Record V1's snapshot, then validate V2 with V1 both inside and outside the collaboration window.
	 * V2 must reject documents whose stored schema permits strings; composition cannot make an unsupported type readable.
	 * Excluding V1 clients from collaboration must not waive V2's obligation to support documents they already created.
	 */
	it("rejects current clients that can neither view nor upgrade historical documents regardless of the collaboration window", () => {
		const factory = new SchemaFactory("incompatibleTaskPriorityRollback");

		class TaskV1 extends factory.object("Task", {
			title: factory.string,
			priority: [factory.number, factory.string],
		}) {}

		// Remove support for string priorities entirely, rather than leaving them staged for existing documents.
		class TaskV2 extends factory.object("Task", {
			title: factory.string,
			priority: factory.number,
		}) {}
		const historical = new TreeViewConfiguration({ schema: TaskV1 });
		const current = new TreeViewConfiguration({ schema: TaskV2 });
		const result = getCompatibility(current, historical);

		// Historical documents may contain string priorities that the current view cannot read or preserve through an upgrade.
		assert.equal(result.currentViewOfSnapshotDocument.canView, false);
		assert.equal(result.currentViewOfSnapshotDocument.canUpgrade, false);

		const [fileSystem] = inMemorySnapshotFileSystem();
		snapshotSchemaCompatibility({
			schema: historical,
			fileSystem,
			version: "1.0.0",
			minVersionForCollaboration: "1.0.0",
			mode: "update",
			snapshotDirectory: "incompatibleTaskPriorityRollback",
		});

		// Dropping older clients from the collaboration window must not drop support for their existing documents.
		for (const minVersionForCollaboration of ["1.0.0", "2.0.0"]) {
			assert.throws(
				() =>
					snapshotSchemaCompatibility({
						schema: current,
						fileSystem,
						version: "2.0.0",
						minVersionForCollaboration,
						mode: "update",
						snapshotDirectory: "incompatibleTaskPriorityRollback",
					}),
				/Current version "2.0.0" cannot upgrade documents from "1.0.0"/,
			);
		}
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

		/**
		 * The saved V1 snapshot describes a two-dimensional point that rejects unknown optional fields.
		 * The saved V2 snapshot adds optional `z`.
		 *
		 * Validate several declarations as V2 without updating the saved snapshots.
		 * Reusing V1's declaration or a schema with no allowed root types must report stale or incompatible schema.
		 * The correct V2 declaration must still be rejected while strict V1 clients remain in the collaboration window.
		 * It must pass when the window starts at V2 and the declaration matches the saved snapshot.
		 */
		it("write current view schema snapshot", () => {
			const snapshotDirectory = path.join(testSrcPath, "schemaSnapshots", "point");

			const factory = new SchemaFactoryBeta("test");

			class Point2D extends factory.object(
				"Point",
				{
					x: factory.number,
					y: factory.number,
				},
				{ allowUnknownOptionalFields: false },
			) {}

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
						schema: new TreeViewConfiguration({ schema: [] }), // Cannot view or upgrade historical documents with this schema.
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

		// Tests the various operations a user of the snapshotSchemaCompatibility function might perform across various versions of their codebase.
		it("workflow over time", () => {
			const snapshotDirectory = "dir";
			const [fileSystem, snapshots] = inMemorySnapshotFileSystem();

			const factory = new SchemaFactoryBeta("assert");

			// For this scenario the application will evolve through three versions of a Point schema across 3 versions of the app.

			class Point1 extends factory.object(
				"Point",
				{
					x: factory.number,
					y: factory.number,
				},
				{ allowUnknownOptionalFields: false },
			) {}

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

			class Point1 extends factory.object(
				"Point",
				{
					x: factory.number,
					y: factory.number,
				},
				{ allowUnknownOptionalFields: false },
			) {}

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
			assert.equal(snapshots.get("point-schema-1.0.0-snapshot.json")?.endsWith("\n"), true);
			assert.equal(snapshots.get("point-schema-2.0.0-snapshot.json")?.endsWith("\n"), true);
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

	describe("getCompatibility", () => {
		/**
		 * V1 declares a two-dimensional point and permits unknown optional fields by default.
		 * V2 adds optional `z`.
		 *
		 * Compare V2 with V1 and with itself.
		 * V2 must upgrade V1 documents before it can write `z`.
		 * V1 can read V2 documents while treating `z` as an unknown optional field.
		 * Identical V2 declarations must permit both viewing and upgrading.
		 */
		it("evolving a schema by adding an optional field", () => {
			const factory = new SchemaFactoryBeta("test");

			// Initial version of `Point` only has x and y coordinates (2D point).
			class Point2D extends factory.object("Point", {
				x: factory.number,
				y: factory.number,
			}) {}

			// Updated version of `Point` adds an optional z coordinate (3D point).
			class Point3D extends factory.object("Point", {
				x: factory.number,
				y: factory.number,
				z: factory.optional(factory.number), // New
			}) {}

			{
				const result = getCompatibility(
					/* current */ new TreeViewConfiguration({ schema: Point3D }),
					/* previous */ new TreeViewConfiguration({ schema: Point2D }),
				);

				// V2 needs the stored schema to permit writes to `z` before its view can be used, even though `z` is optional.
				// Adding that optional field is a safe upgrade of a V1 document.
				assert.equal(result.currentViewOfSnapshotDocument.canView, false);
				assert.equal(result.currentViewOfSnapshotDocument.canUpgrade, true);

				// V1 can already read and edit V2 documents while treating `z` as an unknown optional field.
				assert.equal(result.snapshotViewOfCurrentDocument.canView, true);
			}

			{
				const result = getCompatibility(
					/* current */ new TreeViewConfiguration({ schema: Point3D }),
					/* previous */ new TreeViewConfiguration({ schema: Point3D }),
				);

				// Both views declare the same fields, so documents can be viewed in either direction without an upgrade.
				// Explicit upgrade requests are also permitted and require no stored-schema change.
				assert.equal(result.currentViewOfSnapshotDocument.canView, true);
				assert.equal(result.currentViewOfSnapshotDocument.canUpgrade, true);
				assert.equal(result.snapshotViewOfCurrentDocument.canView, true);
				assert.equal(result.snapshotViewOfCurrentDocument.canUpgrade, true);
			}

			// TODO: once we add support for removal of optional fields, we should test that scenario here as well.
		});

		/**
		 * Declare `Item.value` as staged optional, then export and reconstruct that same schema from a snapshot.
		 * Reconstruction currently turns the staged-optional field into an ordinary optional field.
		 *
		 * Compare the original and reconstructed configurations.
		 * The original view can read and preserve optionality in documents created by the reconstructed view.
		 * The reconstructed view must upgrade the original configuration's required field before viewing.
		 * Identical exported snapshots must not be used to assume that both directions have the same compatibility.
		 */
		it("reports directional compatibility even when snapshots are identical", () => {
			const factory = new SchemaFactoryAlpha("test");
			class Item extends factory.object("Item", {
				value: factory.stagedOptional(factory.string),
			}) {}
			const config = new TreeViewConfigurationAlpha({ schema: Item });
			const snapshot = importCompatibilitySchemaSnapshot(
				exportCompatibilitySchemaSnapshot(config),
			);

			const result = getCompatibility(config, snapshot);

			// The staged view can read and preserve the snapshot's already-optional field.
			assert.equal(result.currentViewOfSnapshotDocument.canView, true);
			assert.equal(result.currentViewOfSnapshotDocument.canUpgrade, true);

			// The imported view needs the current document's field upgraded from required to optional.
			assert.equal(result.snapshotViewOfCurrentDocument.canView, false);
			assert.equal(result.snapshotViewOfCurrentDocument.canUpgrade, true);

			// Both views export the same snapshot despite their different staging behavior.
			assert.equal(result.identicalCompatibility, true);
		});

		/**
		 * Use the same staged root schema in two configurations: one restrictive and one that enables strings.
		 *
		 * The enabled configuration should need to upgrade numeric-only documents, while the restrictive configuration should read and preserve enabled strings.
		 * The comparison should distinguish the configurations' initialization behavior despite their identical view declarations.
		 * This remains skipped because the helpers ignore configured policies and snapshots currently record only the view schema.
		 *
		 * @privateRemarks
		 * TODO:AB#82814: Honor configured policies and distinguish them in snapshots before enabling this test.
		 */
		it.skip("distinguishes identical view schema with different staged policies", () => {
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

			// With the policies applied, the current view must upgrade the previous document to enable strings.
			assert.equal(result.currentViewOfSnapshotDocument.canView, false);
			assert.equal(result.currentViewOfSnapshotDocument.canUpgrade, true);

			// The previous view can read and retain the enabled strings with its restrictive policy.
			assert.equal(result.snapshotViewOfCurrentDocument.canView, true);
			assert.equal(result.snapshotViewOfCurrentDocument.canUpgrade, true);
			assert.equal(result.identicalCompatibility, false);
		});
	});

	describe("checkCompatibility", () => {
		/**
		 * V1 stages string root values and enables them through its configured policy.
		 * V2 declares the same strings as an ordinary allowed type.
		 *
		 * Compare a document created by V1's enabled configuration with the V2 view.
		 * V2 should already be able to view the document, and upgrading should remain permitted.
		 * This remains skipped because the helper derives a restrictive document schema instead of honoring V1's configured policy.
		 *
		 * @privateRemarks
		 * TODO:AB#82814: Honor the stored schema configuration's staged upgrade policy before enabling this test.
		 */
		it.skip("uses the stored schema configuration's staged upgrade policy", () => {
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

			assert.equal(result.canView, true);
			assert.equal(result.canUpgrade, true);
		});

		/**
		 * V1 declares an empty `Task` object.
		 * V2 adds staged-optional `estimatedHours` and explicitly enables its optionality through the viewing configuration.
		 *
		 * Compare a V1 document with the configured V2 view.
		 * V2 should need an upgrade before viewing, and its policy should make adding the field safe by allowing it to be absent.
		 * This remains skipped because the helper ignores the viewing policy and instead attempts to add a required field.
		 *
		 * @privateRemarks
		 * TODO:AB#82814: Honor the viewing configuration's staged upgrade policy before enabling this test.
		 */
		it.skip("uses the viewing configuration's staged upgrade policy", () => {
			const factory = new SchemaFactoryAlpha("test");
			class TaskV1 extends factory.object("Task", {}) {}
			const estimatedHours = factory.stagedOptional(factory.number);
			const optionalUpgrade = estimatedHours.isStagedOptional;
			assert(optionalUpgrade !== false && optionalUpgrade !== undefined);
			class TaskV2 extends factory.object("Task", { estimatedHours }) {}

			// Adding a required field is unsafe; enabling its staged optionality makes the upgrade possible.
			const view = new TreeViewConfigurationAlpha({
				schema: TaskV2,
				stagedUpgradePolicy: StagedSchemaUpgradePolicy.enabledStagedUpgrades(optionalUpgrade),
			});

			const result = checkCompatibility(new TreeViewConfiguration({ schema: TaskV1 }), view);

			assert.equal(result.canView, false);
			assert.equal(result.canUpgrade, true);
		});
	});
});
