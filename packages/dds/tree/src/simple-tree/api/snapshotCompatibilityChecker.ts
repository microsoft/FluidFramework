/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as semver from "semver-ts";
import { fail } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type { JsonCompatibleReadOnly } from "../../util/index.js";
import { toInitialSchema } from "../toStoredSchema.js";
import { TreeViewConfigurationAlpha, TreeViewConfiguration } from "./configuration.js";
import { createTreeSchema } from "../treeSchema.js";
import { SchemaCompatibilityTester } from "./schemaCompatibilityTester.js";
import { generateSchemaFromSimpleSchema } from "./schemaFromSimple.js";
import {
	decodeSchemaCompatibilitySnapshot,
	encodeSchemaCompatibilitySnapshot,
} from "./simpleSchemaCodec.js";
import type { SchemaCompatibilityStatus } from "./tree.js";

/**
 * Compute the compatibility of using `view` to {@link ViewableTree.viewWith | view a tree} who's {@link ITreeAlpha.exportSimpleSchema | stored schema} could be derived from `viewWhichCreatedStoredSchema` via either {@link TreeView.initialize} or {@link TreeView.upgradeSchema}.
 *
 * @remarks See {@link SchemaCompatibilityStatus} for details on the compatibility results.
 *
 * @example This example demonstrates checking the compatibility of a historical schema against a current schema.
 * In this case, the historical schema is a Point2D object with x and y fields, while the current schema is a Point3D object
 * that adds an optional z field.
 *
 * ```ts
 * // This snapshot is assumed to be the same as Point3D, except missing `z`.
 * const encodedSchema = JSON.parse(fs.readFileSync("PointSchema.json", "utf8"));
 * const oldViewSchema = importCompatibilitySchemaSnapshot(encodedSchema);
 *
 * // Build the current view schema
 * class Point3D extends factory.object("Point", {
 * 	x: factory.number,
 * 	y: factory.number,
 *
 * 	// The current schema has a new optional field that was not present on Point2D
 * 	z: factory.optional(factory.number),
 * }) {}
 * const currentViewSchema = new TreeViewConfiguration({ schema: Point3D });
 *
 * // Check to see if the document created by the historical view schema can be opened with the current view schema
 * const backwardsCompatibilityStatus = checkCompatibility(oldViewSchema, currentViewSchema);
 *
 * // z is not present in Point2D, so the schema must be upgraded
 * assert.equal(backwardsCompatibilityStatus.canView, false);
 *
 * // The schema can be upgraded to add the new optional field
 * assert.equal(backwardsCompatibilityStatus.canUpgrade, true);
 *
 * // Test what the old version of the application would do with a tree using the new schema:
 * const forwardsCompatibilityStatus = checkCompatibility(currentViewSchema, oldViewSchema);
 *
 * // If the old schema set allowUnknownOptionalFields, this would be true, but since it did not,
 * // this assert will fail, detecting the forwards compatibility break:
 * // this means these two versions of the application cannot collaborate on content using these schema.
 * assert.equal(forwardsCompatibilityStatus.canView, true);
 * ```
 *
 * @param viewWhichCreatedStoredSchema - From which to derive the stored schema, as if it initialized or upgraded a tree via {@link TreeView}.
 * @param view - The view being tested to see if it could view tree created or initialized using `viewWhichCreatedStoredSchema`.
 * @returns The compatibility status.
 *
 * @privateRemarks
 * TODO: a simple high level API for snapshot based schema compatibility checking should replace the need to export this.
 *
 * @alpha
 */
export function checkCompatibility(
	viewWhichCreatedStoredSchema: TreeViewConfiguration,
	view: TreeViewConfiguration,
): Omit<SchemaCompatibilityStatus, "canInitialize"> {
	const viewAsAlpha = new TreeViewConfigurationAlpha({ schema: view.schema });
	const stored = toInitialSchema(viewWhichCreatedStoredSchema.schema);
	const tester = new SchemaCompatibilityTester(viewAsAlpha);
	return tester.checkCompatibility(stored);
}

/**
 * Returns a JSON compatible representation of the tree schema for snapshot compatibility checking.
 *
 * Snapshots can be loaded by the same or newer package versions, but not necessarily older versions.
 *
 * @see {@link importCompatibilitySchemaSnapshot} which loads these snapshots.
 *
 * @param config - The schema to snapshot. Only the schema field of the `TreeViewConfiguration` is used.
 * @returns The JSON representation of the schema.
 *
 * @example This example creates and persists a snapshot of a Point2D schema.
 *
 * ```ts
 * const schemaFactory = new SchemaFactory("test");
 * class Point2D extends schemaFactory.object("Point", {
 * 	x: factory.number,
 * 	y: factory.number,
 * }) {}
 * const viewSchema = new TreeViewConfiguration({ schema: Point2D });
 * const encodedSchema = JSON.stringify(exportCompatibilitySchemaSnapshot(viewSchema));
 * fs.writeFileSync("PointSchema.json", encodedSchema);
 * ```
 *
 * @privateRemarks
 * TODO: a simple high level API for snapshot based schema compatibility checking should replace the need to export this.
 *
 * @alpha
 */
export function exportCompatibilitySchemaSnapshot(
	config: Pick<TreeViewConfiguration, "schema">,
): JsonCompatibleReadOnly {
	const treeSchema = createTreeSchema(config.schema);
	return encodeSchemaCompatibilitySnapshot(treeSchema);
}

/**
 * Parse the format exported by {@link exportCompatibilitySchemaSnapshot} into a schema.
 *
 * Can load snapshots created by the same or older package versions, but not necessarily newer versions.
 *
 * @see {@link exportCompatibilitySchemaSnapshot} which creates these snapshots.
 *
 * @param config - The JSON representation of the schema.
 * @returns The schema. Only the schema field of the {@link TreeViewConfiguration} is populated.
 * @throws Will throw a usage error if the encoded schema is not in the expected format.
 *
 * @example This example loads and parses a snapshot of a Point2D schema.
 *
 * ```ts;
 * const oldViewSchema = importCompatibilitySchemaSnapshot(fs.readFileSync("PointSchema.json", "utf8"));
 * ```
 * @privateRemarks
 * TODO: a simple high level API for snapshot based schema compatibility checking should replace the need to export this.
 * @alpha
 */
export function importCompatibilitySchemaSnapshot(
	config: JsonCompatibleReadOnly,
): TreeViewConfiguration {
	const simpleSchema = decodeSchemaCompatibilitySnapshot(config);
	const viewSchema = generateSchemaFromSimpleSchema(simpleSchema);

	// We construct a TreeViewConfiguration here with the default parameters. The default set of validation parameters are fine for
	// a schema produced by `generateSchemaFromSimpleSchema`.
	return new TreeViewConfiguration({ schema: viewSchema.root });
}

/**
 * The file system methods required by {@link checkSchemaCompatibilitySnapshots}.
 * @remarks
 * Implemented by both Node.js `fs` and `path` modules, but other implementations can be provided as needed.
 *
 * @example
 * ```typescript
 * import path from "node:path";
 * import fs from "node:fs";
 *
 * const nodeFileSystem: SnapshotFileSystem = {
 * 	...fs,
 * 	...path,
 * };
 * ```
 *
 * @privateRemarks
 * This interface is designed to be compatible with both Node.js `fs` and `path` modules. It is needed to avoid direct dependencies
 * on Node.js APIs in the core library code, allowing for greater portability and easier testing.
 *
 * @input
 * @alpha
 */
export interface SnapshotFileSystem {
	writeFileSync(file: string, data: string, options: { encoding: "utf8" }): void;

	// We include the encoding here to match the function overload for readFileSync that returns a string.
	readFileSync(file: string, encoding: "utf8"): string;
	mkdirSync(dir: string, options: { recursive: true }): void;
	readdirSync(dir: string): readonly string[];
	join(parentPath: string, childPath: string): string;
}

/**
 * The combined compatibility status for both backwards and forwards compatibility checks.
 * @privateRemarks
 * TODO: what is forward and backwards here seems reversed. Either add docs which phrase things in a way this makes sense or swap them.
 */
export interface CombinedSchemaCompatibilityStatus {
	/**
	 * How a {@link TreeView} using the current schema would report its compatibility with the historical snapshot.
	 */
	readonly backwardsCompatibilityStatus: Omit<SchemaCompatibilityStatus, "canInitialize">;
	/**
	 * How a {@link TreeView} using the the snapshotted schema would report its compatibility with a document created with the current schema.
	 */
	readonly forwardsCompatibilityStatus: Omit<SchemaCompatibilityStatus, "canInitialize">;
}

/**
 * The options for {@link checkSchemaCompatibilitySnapshots}.
 * @input
 * @alpha
 */
export interface SchemaCompatibilitySnapshotsOptions {
	/**
	 * Directory where historical schema snapshots are stored.
	 */
	readonly snapshotDirectory: string;
	/**
	 * How the `snapshotDirectory` is accessed.
	 */
	readonly fileSystem: SnapshotFileSystem;
	/**
	 * The current application or library version.
	 */
	readonly version: string;
	/**
	 * The current view schema.
	 */
	readonly schema: TreeViewConfiguration;
	/**
	 * The minimum application version that the current version is expected to be able to collaborate with.
	 */
	readonly minVersionForCollaboration: string;
	/**
	 * The mode of operation, either "test" or "update".
	 */
	readonly mode: "test" | "update";
}

/**
 * Check a `currentViewSchema` for compatibility with a collection of historical schema snapshots stored in `snapshotDirectory`.
 * @remarks
 * This is intended for use in snapshot based schema compatibility tests.
 * Every shared tree based component or application with a schema is recommended to use this to verify schema compatibility across versions.
 *
 * Schema snapshots should be added to `snapshotDirectory` using this function in "update" mode whenever the schema changes in a compatibility impacting way or a new version about to be released is getting prepared for release (and thus `appVersion` changes).
 *
 * This will throw an exception if any snapshotted schema would result in documents that cannot be viewed (after using {@link TreeView.upgradeSchema}), or if any schema with a version greater than or equal to `minAppVersionForCollaboration` cannot view documents created with the `currentViewSchema`.
 *
 * @alpha
 */
export function checkSchemaCompatibilitySnapshots(
	options: SchemaCompatibilitySnapshotsOptions,
): void {
	const checker = new SnapshotCompatibilityChecker(
		options.snapshotDirectory,
		options.fileSystem,
	);
	const {
		version: currentVersion,
		schema: currentViewSchema,
		mode,
		minVersionForCollaboration,
	} = options;
	if (semver.valid(currentVersion) === null) {
		throw new UsageError(
			`Invalid app version: ${currentVersion}. Must be a valid semver version.`,
		);
	}

	const compatibilityMap = checker.getCompatibility(currentViewSchema);
	if (mode === "test") {
		if (!compatibilityMap.has(currentVersion)) {
			throw new UsageError(`No snapshot found for version ${currentVersion}`);
		}
	} else {
		if (mode !== "update") {
			throw new UsageError(`Invalid mode: ${mode}. Must be either "test" or "update".`);
		}
		checker.writeSchemaSnapshot(currentVersion, currentViewSchema);
	}

	const compatibilityErrors: string[] = [];

	{
		const currentSnapshot = checker.readSchemaSnapshotRaw(currentVersion);
		const current = exportCompatibilitySchemaSnapshot(currentViewSchema);

		if (JSON.stringify(currentSnapshot) !== JSON.stringify(current)) {
			if (mode === "test") {
				fail("expected just written snapshot to match");
			} else {
				compatibilityErrors.push(
					`Current schema snapshot for version ${JSON.stringify(
						currentVersion,
					)} does not match expected snapshot. Run in "update" mode again to rewrite the snapshot to review the differences.`,
				);
			}
		}
	}

	for (const [snapshotVersion, compatibility] of compatibilityMap) {
		if (semver.valid(snapshotVersion) === null) {
			throw new UsageError(
				`Snapshot version ${JSON.stringify(snapshotVersion)} is not a valid semver version: rename or remove the snapshot file.`,
			);
		}

		// Current should be able to view all versions.
		if (!compatibility.backwardsCompatibilityStatus.canUpgrade) {
			compatibilityErrors.push(
				`Current version ${JSON.stringify(currentVersion)} cannot upgrade documents from ${JSON.stringify(snapshotVersion)}.`,
			);
		}

		if (semver.eq(snapshotVersion, currentVersion)) {
			if (currentVersion !== snapshotVersion) {
				throw new UsageError(
					`Snapshot version ${JSON.stringify(snapshotVersion)} is semantically equal but not string equal to appVersion ${JSON.stringify(snapshotVersion)}: this is not supported.`,
				);
			}
			if (
				compatibility.backwardsCompatibilityStatus.isEquivalent === false ||
				compatibility.forwardsCompatibilityStatus.isEquivalent === false
			) {
				compatibilityErrors.push(
					`Current version ${JSON.stringify(snapshotVersion)} expected to be equivalent to its snapshot.`,
				);
			}
		} else if (semver.gt(snapshotVersion, currentVersion)) {
			throw new UsageError(
				`Snapshot version ${JSON.stringify(snapshotVersion)} is from a version greater than the current app version ${JSON.stringify(currentVersion)}. This is currently unexpected and not supported: appVersion is expected to increase monotonically.`,
			);
		} else if (semver.lt(snapshotVersion, currentVersion)) {
			// Collaboration with this version is expected to work.
			if (semver.gte(snapshotVersion, minVersionForCollaboration)) {
				// Check that the historical version can view documents from the current version, since collaboration with this one is expected to work.
				if (!compatibility.forwardsCompatibilityStatus.canView) {
					compatibilityErrors.push(
						`Historical version ${JSON.stringify(snapshotVersion)} cannot view documents from ${JSON.stringify(currentVersion)}: these versions are expected to be able to collaborate due to minAppVersionForCollaboration being ${JSON.stringify(minVersionForCollaboration)} but they cannot.`,
					);
				}
			} else {
				// This is the case where the historical version is less than the minimum version for collaboration.
				// No additional validation is needed here currently, since forwards document compat from these versions is already tested above (since it applies to all snapshots).
			}
		} else {
			throw new UsageError(
				`Unexpected semver comparison result between snapshot version ${JSON.stringify(snapshotVersion)} and app version ${JSON.stringify(currentVersion)}.`,
			);
		}
	}

	if (compatibilityErrors.length > 0) {
		throw new Error(
			`Schema compatibility check failed:\n${compatibilityErrors
				.map((e) => ` - ${e}`)
				.join("\n")}`,
		);
	}
}

/**
 * The high-level API for checking snapshot compatibility and generating new snapshots.
 */
export class SnapshotCompatibilityChecker {
	public constructor(
		/**
		 * Directory where historical schema snapshots are stored.
		 */
		private readonly snapshotDirectory: string,
		/**
		 * How the `snapshotDirectory` is accessed.
		 */
		private readonly fileSystemMethods: SnapshotFileSystem,
	) {}

	/**
	 * Gets the compatibility of the current view schema against historical snapshots.
	 * @param currentViewSchema - The current view schema.
	 * @returns A map of snapshot names to their combined compatibility status.
	 */
	public getCompatibility(
		currentViewSchema: TreeViewConfiguration,
	): Map<string, CombinedSchemaCompatibilityStatus> {
		const previousViewSchemas = this.readAllSchemaSnapshots();

		const compatibilityStatuses: Map<string, CombinedSchemaCompatibilityStatus> = new Map();

		for (const [name, previousViewSchema] of previousViewSchemas) {
			const backwardsCompatibilityStatus = checkCompatibility(
				previousViewSchema,
				currentViewSchema,
			);

			const forwardsCompatibilityStatus = checkCompatibility(
				currentViewSchema,
				previousViewSchema,
			);

			compatibilityStatuses.set(name, {
				backwardsCompatibilityStatus,
				forwardsCompatibilityStatus,
			});
		}

		return compatibilityStatuses;
	}

	public writeSchemaSnapshot(snapshotName: string, viewSchema: TreeViewConfiguration): void {
		const snapshot = exportCompatibilitySchemaSnapshot(viewSchema);
		const fullPath = this.fileSystemMethods.join(
			this.snapshotDirectory,
			`${snapshotName}.json`,
		);
		this.ensureSnapshotDirectoryExists();
		this.fileSystemMethods.writeFileSync(fullPath, JSON.stringify(snapshot, undefined, 2), {
			encoding: "utf8",
		});
	}

	public readSchemaSnapshot(snapshotName: string): TreeViewConfiguration {
		const snapshot = this.readSchemaSnapshotRaw(snapshotName);
		return importCompatibilitySchemaSnapshot(snapshot);
	}

	public readSchemaSnapshotRaw(snapshotName: string): JsonCompatibleReadOnly {
		const fullPath = this.fileSystemMethods.join(
			this.snapshotDirectory,
			`${snapshotName}.json`,
		);
		const snapshot = JSON.parse(
			this.fileSystemMethods.readFileSync(fullPath, "utf8"),
		) as JsonCompatibleReadOnly;
		return snapshot;
	}

	public readAllSchemaSnapshots(): Map<string, TreeViewConfiguration> {
		this.ensureSnapshotDirectoryExists();
		const files = this.fileSystemMethods.readdirSync(this.snapshotDirectory);
		const snapshots: Map<string, TreeViewConfiguration> = new Map();
		for (const file of files) {
			if (file.endsWith(".json")) {
				const snapshotName = file.slice(0, ".json".length * -1);
				snapshots.set(snapshotName, this.readSchemaSnapshot(snapshotName));
			}
		}
		return snapshots;
	}

	public ensureSnapshotDirectoryExists(): void {
		this.fileSystemMethods.mkdirSync(this.snapshotDirectory, { recursive: true });
	}
}
