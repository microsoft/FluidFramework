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
 * @alpha
 */
export function parseCompatibilitySchema(config: JsonViewSchema): TreeViewConfiguration {
	const simpleSchema = decodeSimpleSchema(config);
	const viewSchema = generateSchemaFromSimpleSchema(simpleSchema);
	return new TreeViewConfiguration({ schema: viewSchema.root });
}
