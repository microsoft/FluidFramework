/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail, transformMapValues } from "@fluidframework/core-utils/internal";
import { selectVersionRoundedDown } from "@fluidframework/runtime-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import * as semver from "semver-ts";

import type { JsonCompatibleReadOnly } from "../../util/index.js";
import { toInitialSchema } from "../toStoredSchema.js";
import { createTreeSchema } from "../treeSchema.js";

import { TreeViewConfigurationAlpha, TreeViewConfiguration } from "./configuration.js";
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
 * The file system methods required by {@link snapshotSchemaCompatibility}.
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
 */
export interface CombinedSchemaCompatibilityStatus {
	/**
	 * How a {@link TreeView} using the current schema would report its compatibility with the historical snapshot.
	 */
	readonly currentViewOfSnapshotDocument: Omit<SchemaCompatibilityStatus, "canInitialize">;
	/**
	 * How a {@link TreeView} using the snapshotted schema would report its compatibility with a document created with the current schema.
	 */
	readonly snapshotViewOfCurrentDocument: Omit<SchemaCompatibilityStatus, "canInitialize">;

	/**
	 * True if and only if the schema have identical compatibility.
	 * @remarks
	 * This includes producing the equivalent stored schema (which currentViewOfSnapshotDocument and snapshotViewOfCurrentDocument also measure)
	 * as well as equivalent compatibility with potential future schema changes beyond just those in these two schema.
	 *
	 * This includes compatibility with all potential future schema changes.
	 * For example two schema different only in compatibility with future optional fields via allow unknown optional fields or staged schema
	 * would be considered non-equivalent, even though they are forwards and backwards compatible with each other, and both status above report them as equivalent
	 * since they would produce the same stored schema upon schema upgrade.
	 */
	readonly identicalCompatibility: boolean;
}

/**
 * The options for {@link snapshotSchemaCompatibility}.
 * @input
 * @alpha
 */
export interface SnapshotSchemaCompatibilityOptions {
	/**
	 * Directory where historical schema snapshots are stored.
	 * @remarks
	 * As the contents of this directory (specifically historical snapshots) cannot be regenerated,
	 * a directory appropriate for test data should be used.
	 * Generally this means that this directory should be versioned like code,
	 * and not erased when regenerating snapshots.
	 *
	 * This directory will be created if it does not already exist.
	 * All ".json" files in this directory will be treated as schema snapshots.
	 * It is recommended to use a dedicated directory for each {@link snapshotSchemaCompatibility} powered test.
	 *
	 * This can use any path syntax supported by the provided {@link SnapshotSchemaCompatibilityOptions.fileSystem}.
	 */
	readonly snapshotDirectory: string;

	/**
	 * How the `snapshotDirectory` is accessed.
	 */
	readonly fileSystem: SnapshotFileSystem;

	/**
	 * The current view schema.
	 */
	readonly schema: TreeViewConfiguration;

	/**
	 * The version of the next release of the application or library.
	 * @remarks
	 * Can use any format supported by {@link SnapshotSchemaCompatibilityOptions.versionComparer}.
	 * Only compared against the version from previous snapshots (taken from this version when they were created by setting `mode` to "update") and the `minVersionForCollaboration`.
	 *
	 * Typically `minVersionForCollaboration` should be set to the oldest version currently in use, so it's helpful to use a version which can be easily measured to tell if clients are still using it.
	 * It is also important that this version increases with every new versions of the application or library that is released (and thus might persist content which needs to be supported).
	 *
	 * Often the easiest way to ensure this is to simply use the version of the package or application itself, and set the `minVersionForCollaboration` based on telemetry about which versions are still in use.
	 * To do this, it is recommended that this version be programmatically derived from the application version rather than hard coded inline.
	 * For example, reading it from the `package.json` or some other source of truth can be done to ensure it is kept up to date, and thus snapshots always have the correct version.
	 * The version used should typically be the next production version (whose formats must be supported long term) that would be released from the branch of the code being worked on.
	 * This usually means that the correct version to use is the same version that would be used when releasing the application or library, but with any prerelease version tags removed.
	 * If an automated way to keep this version up to date is not used, be very careful when reviewing changes to snapshot files to ensure the version is correct.
	 * If incorrectly versioned snapshots were committed accidentally, rename the snapshot files to have the correct version, and restore the old files from, version control.
	 *
	 * It is possible to use a different versioning scheme, for example one specific to the schema in question.
	 * This can be done robustly as long as care is taken to ensure the version increases such that every released version has a unique snapshot,
	 * and `minVersionForCollaboration` is set appropriately using the same versioning scheme.
	 * {@link SnapshotSchemaCompatibilityOptions.rejectVersionsWithNoSchemaChange} and
	 * {@link SnapshotSchemaCompatibilityOptions.rejectSchemaChangesWithNoVersionChange}
	 * can be used to help enforce the expected relationship between version changes and schema changes in such cases.
	 */
	readonly nextReleaseVersion: string;

	/**
	 * The minimum version that the current version is expected to be able to collaborate with.
	 * @remarks
	 * Can use any format supported by {@link SnapshotSchemaCompatibilityOptions.versionComparer}.
	 *
	 * This defines a range of versions whose schema must be forwards compatible with trees using the current schema:
	 * Any schema from snapshots with a version greater than or equal to this must be able to view documents created with the current schema.
	 * This means that if the current `schema` is used to create a {@link TreeView}, then {@link TreeView.upgradeSchema} is used, the older clients,
	 * all the way back to this `minVersionForCollaboration` will be able to view and edit the tree using their schema and thus collaborate.
	 *
	 * Typically applications will attempt to manage their deployment/update schedule such that all versions concurrently deployed can
	 * collaborate to avoid users losing access to documents when other users upgrade the schema.
	 * Such applications can set this to the oldest version currently deployed,
	 * then rely on {@link snapshotSchemaCompatibility} to verify that no schema changes are made which would break collaboration with that (or newer) versions.
	 *
	 * This is the same approach used by {@link @fluidframework/runtime-definitions#MinimumVersionForCollab}
	 * except that type is specifically for use with the version of the Fluid Framework client packages,
	 * and this corresponds to whatever versioning scheme is used with {@link SnapshotSchemaCompatibilityOptions.nextReleaseVersion}.
	 */
	readonly minVersionForCollaboration: string;

	/**
	 * A comparison function for version strings.
	 * @remarks
	 * A comparison function like that provided to {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort#comparefn | Array.sort}.
	 * This is used to partition snapshots into those less than `minVersionForCollaboration` and those greater than or equal to it, as well as to sanity check `version` against the versions of the snapshots.
	 * If not provided, the ordering is defined by {@link https://semver.org/#spec-item-11|semver}.
	 * @returns A negative number if `a` is less than `b`, zero if they are equal, or a positive number if `a` is greater than `b`.
	 */
	readonly versionComparer?: (a: string, b: string) => number;

	/**
	 * When true, every version must be snapshotted, and an increased version number will require a new snapshot.
	 * @remarks
	 * If this is true, it is assumed there is a snapshot for every release, and thus it is required that the `minVersionForCollaboration` refer to a version which has a snapshot.
	 * When this is not true, versions without snapshots are assumed to have the same schema as the latest previous version which has a snapshot, and thus `minVersionForCollaboration`
	 * can refer to versions between snapshots and will get its schema from the preceding version.
	 */
	readonly snapshotUnchangedVersions?: true;

	/**
	 * When true, it is an error if a new a snapshot for a new version would be created, but the schema compatibility is identical to the previous snapshot.
	 * @remarks
	 * This prevents creating a snapshot with the same schema compatibility results as the previous one.
	 *
	 * Applications and libraries which do not have versioned releases can make up a version specific to the compatibility of the schema, and use this option to help ensure they manage that version correctly.
	 * Such cases can also opt into {@link SnapshotSchemaCompatibilityOptions.rejectSchemaChangesWithNoVersionChange} if they want additional strictness.
	 */
	readonly rejectVersionsWithNoSchemaChange?: true;

	/**
	 * When true, it is an error if a schema change occurs without a corresponding version change.
	 * @remarks
	 * This disables overwriting existing snapshots.
	 * This option is recommended if the {@link SnapshotSchemaCompatibilityOptions.nextReleaseVersion} is not automatically updated ahead of releasing a version which must be supported.
	 * If updating the snapshot is still desired, the preceding one which needs to be overwritten can be manually deleted before running the update.
	 *
	 * This option does not impact the behavior of assert mode (other than impacting what error is given).
	 * This option simply makes update mode more strict, converting cases that would overwrite a snapshot in place into errors.
	 */
	readonly rejectSchemaChangesWithNoVersionChange?: true;

	/**
	 * The mode of operation, either "assert" or "update".
	 * @remarks
	 * Both modes will throw errors if any compatibility issues are detected (but after updating snapshots in "update" mode so the diff can be used to help debug).
	 *
	 * In "assert" mode, an error is additionally thrown if the latest snapshot is not up to date (meaning "update" mode would make a change).
	 *
	 * In "update" mode, a new snapshot is created if the current schema differs from the latest existing snapshot.
	 * If {@link SnapshotSchemaCompatibilityOptions.rejectVersionsWithNoSchemaChange} or
	 * {@link SnapshotSchemaCompatibilityOptions.rejectSchemaChangesWithNoVersionChange} disallows the update, an error is thrown instead.
	 *
	 * It is recommended that "assert" mode be used in automated tests to verify schema compatibility,
	 * and "update" mode only be used manually to update snapshots when making schema or version changes.
	 *
	 * @privateRemarks
	 * Modes we might want to add in the future:
	 * - normalize: update the latest snapshot (or maybe all of them) to the latest encoded format.
	 * - some mode like assert but returns information instead of throwing.
	 */
	readonly mode: "assert" | "update";
}

/**
 * Check `currentViewSchema` for compatibility with a collection of historical schema snapshots stored in `snapshotDirectory`.
 *
 * @throws Throws errors if the input version strings (including those in snapshot file names) are not valid semver versions when using default semver version comparison.
 * @throws Throws errors if the input version strings (including those in snapshot file names) are not ordered as expected (current being the highest, and `minVersionForCollaboration` corresponding to the current version or a lower snapshotted version).
 * @throws In `test` mode, throws an error if there is not an up to date snapshot for the current version.
 * @throws Throws an error if any snapshotted schema cannot be upgraded to the current schema.
 * @throws Throws an error if any snapshotted schema with a version greater than or equal to `minVersionForCollaboration` cannot view documents created with the current schema.
 * @remarks
 * This is intended for use in snapshot-based schema compatibility tests.
 * Every SharedTree-based component or application with a schema is recommended to use this to verify schema compatibility across versions.
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
 * Unlike some other snapshot based testing tools, this stores more than just the current snapshot: historical snapshots are retained as well.
 * Retention of these additional historical snapshots, whose content can't be regenerated from the current schema, is necessary to properly test compatibility across versions.
 * Since there is content in the snapshots which cannot be regenerated, tools which assume all snapshotted content can be regenerated cannot be used here.
 * This means that tools like Jest's built in snapshot testing are not suitable for this purpose.
 * These snapshots behave partly like test data, and partly like snapshots.
 * Typically the easiest way to manage this is to place {@link SnapshotSchemaCompatibilityOptions.snapshotDirectory} inside a directory appropriate for test data,
 * and use node to provide the filesystem access via {@link SnapshotSchemaCompatibilityOptions.fileSystem}.
 *
 * For now, locating what change broke compatibility is likely best discovered by making small schema changes one at a time and updating the snapshot and reviewing the diffs.
 * Details for what kinds of changes are breaking and in which ways can be found in the documentation for {@link TreeView.compatibility} and
 * {@link https://fluidframework.com/docs/data-structures/tree/schema-evolution/ | schema-evolution}.
 *
 * This utility does not enforce anything with respect to API compatibility, or special semantics for major, minor, or patch versions.
 * Libraries which export schema for use by others will need to take special care to ensure the stability contract they offer their users aligns which what is validated by this utility.
 *
 * This utility only tests compatibility of the historical snapshots against the current schema; it does not test them against each-other.
 * Generally any historical schema should have been tested against the ones before them at the time they were current.
 * If for some reason a version of a schema made it into production that was not compatible with a previous version,
 * that can still be represented here (but may require manually generating a snapshot for that version)
 * and this will still allow testing that all historical version can be upgraded to the current one.
 * If a sufficiently incompatible historical schema were used in production, it may be impossible to make a single schema which can accommodate all of them:
 * this utility can be used to confirm that is the case, as well as to avoid the problem in the first place by testing schema before each one is deployed.
 *
 * @example Mocha test which validates the current `config` can collaborate with all historical version back to 2.0.0, and load and update any versions older than that.
 * ```typescript
 * it("schema compatibility", () => {
 * 	snapshotSchemaCompatibility({
 * 		version: pkgVersion,
 * 		schema: config,
 * 		fileSystem: { ...fs, ...path },
 * 		minVersionForCollaboration: "2.0.0",
 * 		mode: process.argv.includes("--snapshot") ? "update" : "test",
 * 		snapshotDirectory,
 * 	});
 * });
 * ```
 * @example Complete Mocha test file
 * ```typescript
 * import fs from "node:fs";
 * import path from "node:path";
 *
 * import { snapshotSchemaCompatibility } from "@fluidframework/tree/alpha";
 *
 * // The TreeViewConfiguration the application uses, which contains the application's schema.
 * import { treeViewConfiguration } from "./schema.js";
 * // The next version of the application which will be released.
 * import { packageVersion } from "./version.js";
 *
 * // Provide some way to run the check in "update" mode when updating snapshots is intended.
 * const regenerateSnapshots = process.argv.includes("--snapshot");
 *
 * // Setup the actual test. In this case using Mocha syntax.
 * describe("schema", () => {
 * 	it("schema compatibility", () => {
 * 		// Select a path to save the snapshots in.
 * 		// This will depend on how your application organizes its test data.
 * 		const snapshotDirectory = path.join(
 * 			import.meta.dirname,
 * 			"../../../src/test/schema-snapshots",
 * 		);
 * 		snapshotSchemaCompatibility({
 * 			snapshotDirectory,
 * 			fileSystem: { ...fs, ...path },
 * 			version: packageVersion,
 * 			schema: treeViewConfiguration,
 * 			minVersionForCollaboration: "2.0.0",
 * 			mode: regenerateSnapshots ? "update" : "test",
 * 		});
 * 	});
 * });
 * ```
 * @privateRemarks
 * Use of this function within this package (for schema libraries released as part of this package) should use {@link testSchemaCompatibilitySnapshots} instead.
 *
 * This uses the format defined in simpleSchemaCodec.ts.
 * This does include versioning information in the snapshot format,
 * but it would be nice to better unify how we do that versioning and format validation with our codecs.
 *
 * See snapshotCompatibilityChecker.example.mts for the large example included above.
 * @alpha
 */
export function snapshotSchemaCompatibility(
	options: SnapshotSchemaCompatibilityOptions,
): void {
	const checker = new SnapshotCompatibilityChecker(
		options.snapshotDirectory,
		options.fileSystem,
	);
	const {
		nextReleaseVersion: currentVersion,
		schema: currentViewSchema,
		mode,
		minVersionForCollaboration,
		snapshotUnchangedVersions,
		rejectVersionsWithNoSchemaChange,
		rejectSchemaChangesWithNoVersionChange,
	} = options;

	const validateVersion =
		options.versionComparer === undefined ? semver.valid : (v: string) => v;
	const versionComparer = options.versionComparer ?? semver.compare;

	if (validateVersion(currentVersion) === null) {
		throw new UsageError(
			`Invalid version: ${JSON.stringify(currentVersion)}. Must be a valid semver version.`,
		);
	}
	if (validateVersion(minVersionForCollaboration) === null) {
		throw new UsageError(
			`Invalid minVersionForCollaboration: ${JSON.stringify(minVersionForCollaboration)}. Must be a valid semver version.`,
		);
	}

	if (versionComparer(minVersionForCollaboration, currentVersion) > 0) {
		throw new UsageError(
			`Invalid minVersionForCollaboration: ${JSON.stringify(minVersionForCollaboration)}. Must be less than or equal to current version ${JSON.stringify(currentVersion)}.`,
		);
	}

	if (mode !== "assert" && mode !== "update") {
		throw new UsageError(
			`Invalid mode: ${JSON.stringify(mode)}. Must be either "assert" or "update".`,
		);
	}

	const currentEncodedForSnapshotting = exportCompatibilitySchemaSnapshot(currentViewSchema);
	const snapshots = checker.readAllSchemaSnapshots(versionComparer);

	const compatibilityErrors: string[] = [];

	const contextNotes: string[] = [];

	function errorWithContext(message: string): Error {
		return new Error(
			[
				"Schema compatibility check failed:",
				message,
				`Snapshots in: ${JSON.stringify(options.snapshotDirectory)}`,
				`Snapshots exist for versions: ${JSON.stringify([...snapshots.keys()], undefined, "\t")}.`,
				...contextNotes,
			].join("\n"),
		);
	}

	const compatibilityMap = transformMapValues(snapshots, (snapshot) =>
		getCompatibility(currentViewSchema, snapshot),
	);

	// Either:
	// - false: no update needed
	// - the updateError message (update in update mode, error otherwise)
	// - an error if the update is disallowed by the flags
	let wouldUpdate: false | string | Error;

	// Set wouldUpdate
	{
		const latestSnapshot = [...snapshots][snapshots.size - 1];
		if (latestSnapshot === undefined) {
			wouldUpdate = `No snapshots found.`;
		} else {
			const latestCompatibility =
				compatibilityMap.get(latestSnapshot[0]) ?? fail("missing compatibilityMap entry");

			const schemaChange = !latestCompatibility.identicalCompatibility;
			const versionChange = versionComparer(latestSnapshot[0], currentVersion) !== 0;

			if (rejectVersionsWithNoSchemaChange === true && versionChange && !schemaChange) {
				wouldUpdate = errorWithContext(
					`Rejecting version change (${JSON.stringify(latestSnapshot[0])} to ${JSON.stringify(currentVersion)}) due to rejectVersionsWithNoSchemaChange being set.`,
				);
			} else if (
				rejectSchemaChangesWithNoVersionChange === true &&
				schemaChange &&
				!versionChange
			) {
				wouldUpdate = errorWithContext(
					`Rejecting schema change without version change due to existing  non-equivalent snapshot for version (${JSON.stringify(latestSnapshot[0])} due to rejectSchemaChangesWithNoVersionChange being set.`,
				);
			} else if (snapshotUnchangedVersions === true) {
				const currentRead = snapshots.get(currentVersion);
				if (currentRead === undefined) {
					wouldUpdate = `No snapshot found for version ${JSON.stringify(currentVersion)}: snapshotUnchangedVersions is true, so every version must be snapshotted.`;
				} else if (
					JSON.stringify(exportCompatibilitySchemaSnapshot(currentRead)) ===
					JSON.stringify(currentEncodedForSnapshotting)
				) {
					wouldUpdate = false;
				} else {
					wouldUpdate = `Snapshot for current version ${JSON.stringify(currentVersion)} is out of date.`;
				}
			} else {
				if (versionComparer(latestSnapshot[0], currentVersion) <= 0) {
					wouldUpdate = schemaChange
						? `Snapshot for current version ${JSON.stringify(currentVersion)} is out of date: schema has changed since latest existing snapshot version ${JSON.stringify(latestSnapshot[0])}.`
						: false;
				} else {
					wouldUpdate = errorWithContext(
						`Current version ${JSON.stringify(currentVersion)} is less than latest existing snapshot version ${JSON.stringify(latestSnapshot[0])}: version is expected to increase monotonically.`,
					);
				}
			}

			if (!schemaChange && (snapshotUnchangedVersions !== true || !versionChange)) {
				// eslint-disable-next-line unicorn/no-lonely-if
				if (
					JSON.stringify(exportCompatibilitySchemaSnapshot(latestSnapshot[1])) !==
					JSON.stringify(currentEncodedForSnapshotting)
				) {
					// Schema are compatibility wise equivalent, but differ in some way (excluding json formatting).
					// TODO: add a "normalize" mode, which do an update only in this case (or maybe even normalize json formatting as well and just always rewrite when !schemaChange)
					// This would be useful to minimize diffs from future schema changes.
					// This would be particularly useful if adding a second version of the format used in the snapshots.
				}
			}
		}
	}

	if (wouldUpdate !== false) {
		if (wouldUpdate instanceof Error) {
			throw wouldUpdate;
		}
		if (mode === "update") {
			checker.writeSchemaSnapshot(currentVersion, currentEncodedForSnapshotting);
			// Update so errors below will reflect the new snapshot.
			compatibilityMap.set(
				currentVersion,
				getCompatibility(currentViewSchema, currentViewSchema),
			);
		} else {
			compatibilityErrors.push(
				`${wouldUpdate} If this is expected, snapshotSchemaCompatibility can be rerun in "update" mode to update or create the snapshot.`,
			);

			// This case could update compatibilityMap as well, but it would hide some information about how the existing snapshot might be incompatible with the proposed new one.
			// This lost information could be annoying if the user's intention was not to edit the schema (which is what we assume in assert mode),
			// especially once we produce more detailed error messages that can help users understand what changed in the schema.
		}
	}

	// Add compatibilityErrors and contextNotes as needed regarding minVersionForCollaboration.
	// This is only done when minVersionForCollaboration is not the current version to avoid extra noise in "assert" mode
	// (which is the only case that could error when minVersionForCollaboration === currentVersion).
	if (minVersionForCollaboration !== currentVersion) {
		if (snapshotUnchangedVersions === true) {
			const minSnapshot = compatibilityMap.get(minVersionForCollaboration);
			if (minSnapshot === undefined) {
				compatibilityErrors.push(
					`Using snapshotUnchangedVersions: a snapshot of the exact minVersionForCollaboration ${JSON.stringify(minVersionForCollaboration)} is required. No snapshot found.`,
				);
			}
		} else {
			const selectedMinVersionForCollaborationSnapshot = selectVersionRoundedDown(
				minVersionForCollaboration,
				compatibilityMap,
				versionComparer,
			);
			if (selectedMinVersionForCollaborationSnapshot === undefined) {
				compatibilityErrors.push(
					`No snapshot found with version less than or equal to minVersionForCollaboration ${JSON.stringify(minVersionForCollaboration)}.`,
				);
			} else {
				// Add an entry to ensure that the version which spans from before until after the cutoff for collaboration is included in the compatibility checks.
				compatibilityMap.set(
					minVersionForCollaboration,
					selectedMinVersionForCollaborationSnapshot[1],
				);
				contextNotes.push(
					`Due to snapshotUnchangedVersions being false and minVersionForCollaboration (${JSON.stringify(minVersionForCollaboration)}) not having an exact snapshot, the last snapshot before that version (which is ${JSON.stringify(
						selectedMinVersionForCollaborationSnapshot[0],
					)}) is being also being checked as if it is version ${JSON.stringify(minVersionForCollaboration)}.`,
				);
			}
		}
	}

	// Compare all snapshots against the current schema, using the compatibilityMap.
	for (const [snapshotVersion, compatibility] of compatibilityMap) {
		// Current should be able to view all versions.
		if (!compatibility.currentViewOfSnapshotDocument.canUpgrade) {
			compatibilityErrors.push(
				`Current version ${JSON.stringify(currentVersion)} cannot upgrade documents from ${JSON.stringify(snapshotVersion)}.`,
			);
		}

		const versionComparisonToCurrent = versionComparer(snapshotVersion, currentVersion);
		if (versionComparisonToCurrent === 0) {
			if (currentVersion !== snapshotVersion) {
				throw errorWithContext(
					`Snapshot version ${JSON.stringify(snapshotVersion)} is semantically equal but not string equal to current version ${JSON.stringify(currentVersion)}: this is not supported.`,
				);
			}
			if (compatibility.identicalCompatibility === false) {
				assert(
					wouldUpdate !== false,
					"there should have been an error for the snapshot being out of date",
				);
			}
		} else if (versionComparisonToCurrent < 0) {
			// Collaboration with this version is expected to work.
			if (versionComparer(snapshotVersion, minVersionForCollaboration) >= 0) {
				// Check that the historical version can view documents from the current version, since collaboration with this one is expected to work.
				if (!compatibility.snapshotViewOfCurrentDocument.canView) {
					compatibilityErrors.push(
						`Historical version ${JSON.stringify(snapshotVersion)} cannot view documents from ${JSON.stringify(currentVersion)}: these versions are expected to be able to collaborate due to the selected minVersionForCollaboration ${JSON.stringify(minVersionForCollaboration)}.`,
					);
				}
			} else {
				// This is the case where the historical version is less than the minimum version for collaboration.
				// No additional validation is needed here currently, since forwards document compat from these versions is already tested above (since it applies to all snapshots).
			}
		} else {
			compatibilityErrors.push(
				`Snapshot exists for version ${JSON.stringify(snapshotVersion)} which is greater than the current version ${JSON.stringify(currentVersion)}. This is not supported.`,
			);
		}
	}

	if (compatibilityErrors.length > 0) {
		throw errorWithContext(compatibilityErrors.map((e) => ` - ${e}`).join("\n"));
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
		this.fileSystemMethods.writeFileSync(fullPath, JSON.stringify(snapshot, undefined, "\t"), {
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
	public readAllSchemaSnapshots(
		compare: (a: string, b: string) => number,
	): Map<string, TreeViewConfiguration> {
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
		versions.sort(compare);

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

	assert(
		backwardsCompatibilityStatus.isEquivalent === forwardsCompatibilityStatus.isEquivalent,
		"equality should be symmetric",
	);

	// This relies on exportCompatibilitySchemaSnapshot being well normalized, and not differing for non-significant changes.
	const identicalCompatibility =
		JSON.stringify(exportCompatibilitySchemaSnapshot(currentViewSchema)) ===
		JSON.stringify(exportCompatibilitySchemaSnapshot(previousViewSchema));

	if (identicalCompatibility) {
		assert(
			backwardsCompatibilityStatus.isEquivalent,
			"identicalCompatibility should have equivalent stored schema",
		);
	}

	return {
		currentViewOfSnapshotDocument: backwardsCompatibilityStatus,
		snapshotViewOfCurrentDocument: forwardsCompatibilityStatus,
		identicalCompatibility,
	};
}
