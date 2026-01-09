/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
 * The file system methods required by {@link SnapshotCompatibilityChecker}.
 *
 * @privateRemarks
 * This interface is designed to be compatible with both Node.js `fs` and `path` modules. It is needed to avoid direct dependencies
 * on Node.js APIs in the core library code, allowing for greater portability and easier testing.
 *
 * @alpha
 */
export interface IFileSystemMethods {
	writeFileSync: (file: string, data: string, options?: { encoding?: "utf8" }) => void;

	// We include the encoding here to match the function overload for readFileSync that returns a string.
	readFileSync: (file: string, encoding: "utf8") => string;
	mkdirSync: (
		dir: string,
		options?: {
			// Allow users to specify nested directories be created if they do not exist.
			recursive: true;
		},
	) => void;
	readdirSync: (dir: string) => string[];
	join: (parentPath: string, childPath: string) => string;
	basename: (path: string, ext?: string) => string;
}

/**
 * The combined compatibility status for both backwards and forwards compatibility checks.
 *
 * @alpha
 */
export interface CombinedSchemaCompatibilityStatus {
	snapshotName: string;
	backwardsCompatibilityStatus: Omit<SchemaCompatibilityStatus, "canInitialize">;
	forwardsCompatibilityStatus: Omit<SchemaCompatibilityStatus, "canInitialize">;
}

/**
 * The high-level API for checking snapshot compatibility and generating new snapshots.
 *
 * @alpha
 */
export class SnapshotCompatibilityChecker {
	public constructor(
		private readonly snapshotDirectory: string,
		private readonly fileSystemMethods: IFileSystemMethods,
	) {}

	public checkCompatibility(
		appVersion: string,
		currentViewSchema: TreeViewConfiguration,
		mode: "test" | "update",
	): Map<string, CombinedSchemaCompatibilityStatus> {
		const previousViewSchemas = this.readAllSchemaSnapshots();
		if (!previousViewSchemas.has(appVersion)) {
			if (mode === "test") {
				throw new UsageError(`No snapshot found for version ${appVersion}`);
			} else if (mode === "update") {
				this.writeSchemaSnapshot(appVersion, currentViewSchema);
			}
		}

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
				snapshotName: name,
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
		this.fileSystemMethods.writeFileSync(fullPath, JSON.stringify(snapshot), {
			encoding: "utf8",
		});
	}

	public readSchemaSnapshot(snapshotName: string): TreeViewConfiguration {
		const fullPath = this.fileSystemMethods.join(
			this.snapshotDirectory,
			`${snapshotName}.json`,
		);
		const snapshot = JSON.parse(
			this.fileSystemMethods.readFileSync(fullPath, "utf8"),
		) as JsonCompatibleReadOnly;
		return importCompatibilitySchemaSnapshot(snapshot);
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

	private ensureSnapshotDirectoryExists(): void {
		this.fileSystemMethods.mkdirSync(this.snapshotDirectory, { recursive: true });
	}
}
