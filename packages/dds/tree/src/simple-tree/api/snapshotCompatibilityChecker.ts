/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as semver from "semver-ts";
import { assert, transformMapValues } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { selectVersionRoundedDown } from "@fluidframework/runtime-utils/internal";
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
 * const nodeFileSystem: SnapshotFileSystem = { ...fs, ...path };
 * ```
 *
 * @privateRemarks
 * This interface is designed to be compatible with Node.js `fs` and `path` modules.
 * It is needed to avoid direct dependencies on Node.js APIs in the core library code,
 * allowing for greater portability and easier testing.
 *
 * @input
 * @alpha
 */
export interface SnapshotFileSystem {
	/**
	 * Writes a UTF-8 encoded file to disk, replacing the file if it already exists.
	 *
	 * @param file - Path to the file to write.
	 * @param data - String data to be written.
	 * @param options - Options specifying that the encoding is UTF-8.
	 */
	writeFileSync(file: string, data: string, options: { encoding: "utf8" }): void;

	/**
	 * Reads a UTF-8 encoded file from disk and returns its contents as a string.
	 *
	 * @param file - Path to the file to read.
	 * @param encoding - The text encoding to use when reading the file. Must be `"utf8"`.
	 * @returns The contents of the file as a string.
	 */
	// We include the encoding here to match the function overload for readFileSync that returns a string.
	readFileSync(file: string, encoding: "utf8"): string;

	/**
	 * How a {@link TreeView} using the snapshotted schema would report its compatibility with a document created with the current schema.
	 *
	 * @param dir - Path of the directory to create.
	 * @param options - Options indicating that creation should be recursive.
	 */
	mkdirSync(dir: string, options: { recursive: true }): void;

	/**
	 * Reads the contents of a directory.
	 *
	 * @param dir - Path of the directory to read.
	 * @returns An array of names of the directory entries.
	 */
	readdirSync(dir: string): readonly string[];

	/**
	 * Joins two path segments into a single path string.
	 *
	 * @param parentPath - The directory path.
	 * @param childPath - Filename within `parentPath` directory.
	 * @returns The combined path string.
	 */
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
	 * How a {@link TreeView} using the snapshotted schema would report its compatibility with a document created with the current schema.
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
	 * The minimum version that the current version is expected to be able to collaborate with.
	 */
	readonly minVersionForCollaboration: string;
	/**
	 * When true, every version must be snapshotted, and an increased version number will require a new snapshot.
	 * @remarks
	 * If this is true, it is assumed there is a snapshot for every release, and thus it is required that the `minVersionForCollaboration` refer to a version which has a snapshot.
	 * When this is not true, versions without snapshots are assumed to have the same schema as the latest previous version which has a snapshot, and thus `minVersionForCollaboration`
	 * can refer to versions between snapshots and will get its schema from the preceding version.
	 */
	readonly snapshotUnchangedVersions?: true;
	/**
	 * The mode of operation, either "test" or "update".
	 */
	readonly mode: "test" | "update";
}

/**
 * Check `currentViewSchema` for compatibility with a collection of historical schema snapshots stored in `snapshotDirectory`.
 * @remarks
 * This is intended for use in snapshot based schema compatibility tests.
 * Every shared tree based component or application with a schema is recommended to use this to verify schema compatibility across versions.
 *
 * Schema snapshots should be added to `snapshotDirectory` using this function in "update" mode whenever the schema changes in a compatibility impacting way
 * (or when `snapshotUnchangedVersions` is true and a new version about to be released is getting prepared for release (and thus `version` changed)).
 *
 * This will throw an exception if any snapshotted schema would result in documents that cannot be viewed (after using {@link TreeView.upgradeSchema}), or if any schema with a version greater than or equal to `minVersionForCollaboration` cannot view documents created with the `currentViewSchema`.
 * See {@link TreeView.compatibility} for more information.
 *
 * Proper use of this utility should do a good job at detecting schema compatibility issues,
 * however it currently does not do a good job of explaining exactly what change to the schema is causing the compatibility issues.
 * This is a known limitation that will be improved in future releases.
 * These improvements, as well as other changes, may change the exact messages produced by this function in the error cases: no stability of these messages should be assumed.
 *
 * For now, locating what change broke compatibility is likely best discovered by making small schema changes one at a time and updating the snapshot and reviewing the diffs.
 * Details for what kinds of changes are breaking and in which ways can be found in the documentation for {@link TreeView.compatibility} and
 * {@link https://fluidframework.com/docs/data-structures/tree/schema-evolution/ | schema-evolution}.
 *
 * This utility does not enforce anything with respect to API compatibility, or special semantics for major, minor, or patch versions.
 * Libraries which export schema for use by others will need to take special care to ensure the stability contract they offer their users aligns which what is validated by this utility.
 *
 * This utility only tests compatibility of the historical snapshots against the current schema: it does not test them against each-other.
 * Generally any historical schema should have been tested against the ones before them at the time they were current.
 * If for some reason a version of a schema made it into production that was not compatible with a previous version,
 * that can still be represented here (but may require manually generating a snapshot for that version)
 * and this will still allow testing that all historical version can be upgraded to the current one.
 * If a sufficiently incompatible historical schema were used in production, it may be impossible to make a single schema which can accommodate all of them:
 * this utility can be used to confirm that is the case, as well as to avoid the problem in the first place by testing schema before each one is deployed.
 *
 * @example Mocha test which validates the current `config` is can collaborate with all historical version back to 2.0.0, and load and update any versions older than that.
 * ```typescript
 * it("schema compatibility", () => {
 * 	checkSchemaCompatibilitySnapshots({
 * 		version: pkgVersion,
 * 		schema: config,
 * 		fileSystem: { ...fs, ...path },
 * 		minVersionForCollaboration: "2.0.0",
 * 		mode: process.argv.includes("--snapshot") ? "update" : "test",
 * 		snapshotDirectory,
 * 	});
 * });
 * ```
 * @privateRemarks
 * Use of this within this package for libraries released as part of it should use {@link testSchemaCompatibilitySnapshots} instead.
 *
 * TODO: this uses the format defined in simpleSchemaCodec.ts.
 * Currently this does not include any versioning information in the snapshot format itself.
 * This would make it hard to do things like upgrade to a new format (perhaps for better diffs, or to support new features) in the future.
 * That code should probably be migrated to a proper versioned codec with a schema and validation.
 * This utility can directly depend on the typebox-validator and inject that as this code should not be bundle size sensitive.
 * This should be addressed before this reached beta stability.
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
		snapshotUnchangedVersions,
	} = options;
	if (semver.valid(currentVersion) === null) {
		throw new UsageError(
			`Invalid app version: ${JSON.stringify(currentVersion)}. Must be a valid semver version.`,
		);
	}
	if (semver.valid(minVersionForCollaboration) === null) {
		throw new UsageError(
			`Invalid app version: ${JSON.stringify(minVersionForCollaboration)}. Must be a valid semver version.`,
		);
	}
	if (!semver.lte(minVersionForCollaboration, currentVersion)) {
		throw new UsageError(
			`Invalid app version: ${JSON.stringify(minVersionForCollaboration)}. Must be less than or equal to current version ${JSON.stringify(currentVersion)}.`,
		);
	}

	if (mode !== "test" && mode !== "update") {
		throw new UsageError(
			`Invalid mode: ${JSON.stringify(mode)}. Must be either "test" or "update".`,
		);
	}

	const currentEncodedForSnapshotting = exportCompatibilitySchemaSnapshot(currentViewSchema);
	const snapshots = checker.readAllSchemaSnapshots();

	const compatibilityErrors: string[] = [];

	function updatableError(message: string): void {
		assert(mode === "test", "updatableError should only be called in test mode");
		compatibilityErrors.push(
			`${message} If this is expected, checkSchemaCompatibilitySnapshots can be rerun in "update" mode to update the snapshot.`,
		);
	}

	if (snapshotUnchangedVersions === true) {
		if (mode === "update") {
			checker.writeSchemaSnapshot(currentVersion, currentEncodedForSnapshotting);
			snapshots.set(currentVersion, currentViewSchema);
		} else {
			const currentRead = snapshots.get(currentVersion);
			if (currentRead === undefined) {
				updatableError(
					`No snapshot found for version ${JSON.stringify(currentVersion)}: snapshotUnchangedVersions is true, so every version must be snapshotted.`,
				);
			} else if (
				JSON.stringify(exportCompatibilitySchemaSnapshot(currentRead)) !==
				JSON.stringify(currentEncodedForSnapshotting)
			) {
				updatableError(
					`Snapshot for current version ${JSON.stringify(currentVersion)} is out of date.`,
				);
			}
		}
	} else {
		const entries = [...snapshots];
		const latestSnapshot = entries[entries.length - 1];
		if (latestSnapshot === undefined) {
			if (mode === "update") {
				checker.writeSchemaSnapshot(currentVersion, currentEncodedForSnapshotting);
				snapshots.set(currentVersion, currentViewSchema);
			} else {
				updatableError(`No snapshots found.`);
			}
		} else {
			if (semver.lte(latestSnapshot[0], currentVersion)) {
				// Check to see if schema in snapshot is the same as the latest existing snapshot.
				const oldString = JSON.stringify(exportCompatibilitySchemaSnapshot(latestSnapshot[1]));
				const currentString = JSON.stringify(currentEncodedForSnapshotting);
				if (oldString !== currentString) {
					// Schema has changed: must create new snapshot.
					if (mode === "update") {
						checker.writeSchemaSnapshot(currentVersion, currentEncodedForSnapshotting);
						snapshots.set(currentVersion, currentViewSchema);
					} else {
						updatableError(
							`Snapshot for current version ${JSON.stringify(currentVersion)} is out of date: schema has changed since latest existing snapshot version ${JSON.stringify(latestSnapshot[0])}.`,
						);
					}
				}
			} else {
				throw new UsageError(
					`Current version ${JSON.stringify(currentVersion)} is less than latest existing snapshot version ${JSON.stringify(latestSnapshot[0])}: version is expected to increase monotonically.`,
				);
			}
		}
	}

	const compatibilityMap = transformMapValues(snapshots, (snapshot) =>
		getCompatibility(currentViewSchema, snapshot),
	);

	let selectedMinVersionForCollaborationSnapshot:
		| undefined
		| readonly [string, CombinedSchemaCompatibilityStatus];

	if (snapshotUnchangedVersions === true) {
		const minSnapshot = compatibilityMap.get(minVersionForCollaboration);
		if (minSnapshot === undefined) {
			compatibilityErrors.push(
				`Using snapshotUnchangedVersions: a snapshot of the exact minVersionForCollaboration ${JSON.stringify(minVersionForCollaboration)} is required. No snapshot found.`,
			);
		} else {
			selectedMinVersionForCollaborationSnapshot = [minVersionForCollaboration, minSnapshot];
		}
	} else {
		selectedMinVersionForCollaborationSnapshot = selectVersionRoundedDown(
			minVersionForCollaboration,
			compatibilityMap,
		);
		if (selectedMinVersionForCollaborationSnapshot === undefined) {
			compatibilityErrors.push(
				`No snapshot found with version less than or equal to minVersionForCollaboration ${JSON.stringify(minVersionForCollaboration)}.`,
			);
		}
	}

	for (const [snapshotVersion, compatibility] of compatibilityMap) {
		// Current should be able to view all versions.
		if (!compatibility.backwardsCompatibilityStatus.canUpgrade) {
			compatibilityErrors.push(
				`Current version ${JSON.stringify(currentVersion)} cannot upgrade documents from ${JSON.stringify(snapshotVersion)}.`,
			);
		}

		if (semver.eq(snapshotVersion, currentVersion)) {
			if (currentVersion !== snapshotVersion) {
				throw new UsageError(
					`Snapshot version ${JSON.stringify(snapshotVersion)} is semantically equal but not string equal to current version ${JSON.stringify(currentVersion)}: this is not supported.`,
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
		} else if (semver.lt(snapshotVersion, currentVersion)) {
			if (selectedMinVersionForCollaborationSnapshot === undefined) {
				assert(
					compatibilityErrors.length > 0,
					"expected compatibility errors for missing min collab version snapshot",
				);
			} else {
				// Collaboration with this version is expected to work.
				if (semver.gte(snapshotVersion, selectedMinVersionForCollaborationSnapshot[0])) {
					// Check that the historical version can view documents from the current version, since collaboration with this one is expected to work.
					if (!compatibility.forwardsCompatibilityStatus.canView) {
						const message = `Historical version ${JSON.stringify(snapshotVersion)} cannot view documents from ${JSON.stringify(currentVersion)}: these versions are expected to be able to collaborate due to the selected minVersionForCollaboration snapshot version being ${JSON.stringify(selectedMinVersionForCollaborationSnapshot[0])}.`;
						compatibilityErrors.push(
							selectedMinVersionForCollaborationSnapshot[0] === minVersionForCollaboration
								? message
								: `${message} The specified minVersionForCollaboration is ${JSON.stringify(minVersionForCollaboration)} which was rounded down to an existing snapshot.`,
						);
					}
				} else {
					// This is the case where the historical version is less than the minimum version for collaboration.
					// No additional validation is needed here currently, since forwards document compat from these versions is already tested above (since it applies to all snapshots).
				}
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

	public writeSchemaSnapshot(snapshotName: string, snapshot: JsonCompatibleReadOnly): void {
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

	/**
	 * Returns all schema snapshots stored in the snapshot directory, sorted in order of increasing version.
	 */
	public readAllSchemaSnapshots(): Map<string, TreeViewConfiguration> {
		this.ensureSnapshotDirectoryExists();
		const files = this.fileSystemMethods.readdirSync(this.snapshotDirectory);
		const versions: string[] = [];
		for (const file of files) {
			if (file.endsWith(".json")) {
				const snapshotName = file.slice(0, ".json".length * -1);
				versions.push(snapshotName);
			}
		}
		// Ensures that errors are in a consistent and friendly order, independent of file system order.
		versions.sort((a, b) => semver.compare(a, b));

		const snapshots: Map<string, TreeViewConfiguration> = new Map();
		for (const version of versions) {
			snapshots.set(version, this.readSchemaSnapshot(version));
		}
		return snapshots;
	}

	public ensureSnapshotDirectoryExists(): void {
		this.fileSystemMethods.mkdirSync(this.snapshotDirectory, { recursive: true });
	}
}

/**
 * Gets the compatibility of the current view schema against a historical snapshot.
 * @param currentViewSchema - The current view schema.
 * @param previousViewSchema - The historical view schema.
 * @returns The combined compatibility status.
 */
export function getCompatibility(
	currentViewSchema: TreeViewConfiguration,
	previousViewSchema: TreeViewConfiguration,
): CombinedSchemaCompatibilityStatus {
	const backwardsCompatibilityStatus = checkCompatibility(
		previousViewSchema,
		currentViewSchema,
	);

	const forwardsCompatibilityStatus = checkCompatibility(
		currentViewSchema,
		previousViewSchema,
	);

	return {
		backwardsCompatibilityStatus,
		forwardsCompatibilityStatus,
	};
}
