/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { JsonCompatibleReadOnly } from "../../util/index.js";
import { toStoredSchema } from "../toStoredSchema.js";
import { TreeViewConfigurationAlpha, TreeViewConfiguration } from "./configuration.js";
import { SchemaCompatibilityTester } from "./schemaCompatibilityTester.js";
import { generateSchemaFromSimpleSchema } from "./schemaFromSimple.js";
import { decodeSimpleSchema, encodeSimpleSchema } from "./simpleSchemaCodec.js";
import type { SchemaCompatibilityStatus } from "./tree.js";
import { toSimpleTreeSchema } from "./viewSchemaToSimpleSchema.js";

// TODO: Something more type-safe
/**
 * The JSON representation of a tree schema used for snapshot compatibility checking.
 *
 * @alpha
 */
export type JsonViewSchema = JsonCompatibleReadOnly;

/**
 * Checks the compatibility of the view schema that created the document against the view schema being used to open it.
 * 
 * @remarks See {@link SchemaCompatibilityStatus} for details on the compatibility results.
 * 
 * @example This example demonstrates checking the compatibility of a historical schema against a current schema.
 * In this case, the historical schema is a Point2D object with x and y fields, while the current schema is a Point3D object
 * that adds an optional z field.
 * 
 * ```ts
 * // Build the current view schema
 * const schemaFactory = new SchemaFactory("test");
 * class Point3D extends schemaFactory.object("Point", {
 *    x: factory.number,
 *    y: factory.number,
 *
 *	  // The current schema has a new optional field that was not present on Point2D
 *	  z: factory.optional(factory.number),
 * }) {}
 * const oldViewSchema = parseCompatibilitySchema(fs.readFileSync("Point2D.json"));
 * 
 * // Check to see if the document created by the historical view schema can be opened with the current view schema
 * const compatibilityStatus = checkCompatibility(oldViewSchema, currentViewSchema);
 * 
 * // z is not present in Point2D, so the schema must be upgraded
 * assert.equal(compatibilityStatus.canView, false);
 * 
 * // The schema can be upgraded to add the new optional field
 * assert.equal(compatibilityStatus.canUpgrade, true);
 * ```
 *
 * @param viewWhichCreatedDocument - The view schema which was used to create the document.
 * @param view - The view schema being used to read the document.
 * @returns The compatibility status.
 *
 * @alpha
 */
export function checkCompatibility(
	viewWhichCreatedDocument: TreeViewConfiguration,
	view: TreeViewConfiguration,
): Omit<SchemaCompatibilityStatus, "canInitialize"> {
	const viewAsAlpha = new TreeViewConfigurationAlpha({ schema: view.schema });
	const stored = toStoredSchema(viewWhichCreatedDocument.schema, {
		includeStaged: () => true,
	});
	const tester = new SchemaCompatibilityTester(viewAsAlpha);
	return tester.checkCompatibility(stored);
}

/**
 * Returns a JSON representation of the tree schema for snapshot compatibility checking.
 * @param config - The schema to snapshot.
 * @returns The JSON representation of the schema.
 * 
 * @example This example creates and persists a snapshot of a Point2D schema.
 * 
 * ```ts
 * const schemaFactory = new SchemaFactory("test");
 * class Point2D extends schemaFactory.object("Point", {
 *    x: factory.number,
 *    y: factory.number,
 * }) {}
 * const viewSchema = new TreeViewConfiguration({ schema: Point2D });
 * fs.writeFileSync("Point2D.json", snapshotCompatibilitySchema(viewSchema));
 * ```
 *
 * @alpha
 */
export function snapshotCompatibilitySchema(config: TreeViewConfiguration): JsonViewSchema {
	const simpleSchema = toSimpleTreeSchema(config.schema, true);
	return encodeSimpleSchema(simpleSchema);
}

/**
 * Parse a JSON representation of a tree schema into a concrete schema.
 * @param config - The JSON representation of the schema.
 * @returns The schema.
 * 
 * @example This example loads and parses a snapshot of a Point2D schema.
 * 
 * ```ts
 * const oldViewSchema = parseCompatibilitySchema(fs.readFileSync("Point2D.json"));
 * ```
 *
 * @alpha
 */
export function parseCompatibilitySchema(config: JsonViewSchema): TreeViewConfiguration {
	const simpleSchema = decodeSimpleSchema(config);
	const viewSchema = generateSchemaFromSimpleSchema(simpleSchema);
	return new TreeViewConfiguration({ schema: viewSchema.root });
}
