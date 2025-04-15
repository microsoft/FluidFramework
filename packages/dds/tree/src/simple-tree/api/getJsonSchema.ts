/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { JsonTreeSchema } from "./jsonSchema.js";
import type { ImplicitAllowedTypes } from "../schemaTypes.js";
import { toJsonSchema } from "./simpleSchemaToJsonSchema.js";
import type { TreeEncodingOptions } from "./customTree.js";
import { TreeViewConfigurationAlpha } from "./tree.js";

/**
 * Options for how to interpret or encode a tree when schema information is available.
 * @alpha
 */
export interface TreeSchemaEncodingOptions extends TreeEncodingOptions {
	/**
	 * If true, fields with default providers (like {@link SchemaFactory.identifier}) will be required.
	 * If false, they will be optional.
	 * @remarks
	 * Has no effect on {@link NodeKind}s other than {@link NodeKind.Object}.
	 * @defaultValue false.
	 */
	readonly requireFieldsWithDefaults?: boolean;
}

/**
 * Creates a {@link https://json-schema.org/ | JSON Schema} representation of the provided {@link TreeNodeSchema}.
 *
 * @remarks
 * Useful when communicating the schema to external libraries or services.
 * Caches the result for future calls.
 *
 * @example
 *
 * A Shared Tree schema like the following:
 *
 * ```typescript
 * class MyObject extends schemaFactory.object("MyObject", {
 * 	foo: schemaFactory.number,
 * 	bar: schemaFactory.optional(schemaFactory.string),
 * });
 * ```
 *
 * Will yield JSON Schema like the following:
 *
 * ```json
 * {
 * 	"$defs": {
 * 		"com.fluidframework.leaf.string": {
 * 			"type": "string",
 * 		},
 * 		"com.fluidframework.leaf.number": {
 * 			"type": "number",
 * 		},
 * 		"com.myapp.MyObject": {
 * 			"type": "object",
 * 			"properties": {
 * 				"foo": { "$ref": "com.fluidframework.leaf.number" },
 * 				"bar": { "$ref": "com.fluidframework.leaf.string" },
 * 			},
 * 			"required": ["foo"],
 * 		},
 * 	},
 * 	"$ref": "#/$defs/com.myapp.MyObject",
 * }
 * ```
 *
 * @privateRemarks In the future, we may wish to move this to a more discoverable API location.
 * For now, while still an experimental API, it is surfaced as a free function.
 *
 * TODO:
 * This API should allow generating JSON schema for the whole matrix of combinations:
 *
 * 1. VerboseTree and (Done) ConciseTree
 * 2. (Done) With and without requiring values with defaults (for insertion vs reading)
 * 3. (Done) Using stored keys and property keys.
 *
 * This takes in `ImplicitAllowedTypes` since underlying `toJsonSchema` can't handle optional roots.
 *
 * @alpha
 */
export function getJsonSchema(
	schema: ImplicitAllowedTypes,
	options: Required<TreeSchemaEncodingOptions>,
): JsonTreeSchema {
	const treeSchema = new TreeViewConfigurationAlpha({ schema });
	return toJsonSchema(treeSchema, options);
}
