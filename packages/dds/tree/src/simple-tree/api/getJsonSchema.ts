/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { JsonTreeSchema } from "./jsonSchema.js";
import type { ImplicitFieldSchema } from "../schemaTypes.js";
import { toJsonSchema } from "./simpleSchemaToJsonSchema.js";
import { getSimpleSchema } from "./getSimpleSchema.js";
import { getOrCreate } from "../../util/index.js";
import type { TreeNodeSchema } from "../core/index.js";

/**
 * Cache in which the results of {@link getJsonSchema} are saved.
 */
const jsonSchemaCache = new WeakMap<TreeNodeSchema, JsonTreeSchema>();

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
 * 1. VerboseTree and ConciseTree
 * 2. With and without requiring values with defaults (for insertion vs reading)
 * 3. Using stored keys and property keys
 *
 * This current API seems to give ConciseTree with property keys and ignoring default values.
 *
 *
 * @alpha
 */
export function getJsonSchema(schema: ImplicitFieldSchema): JsonTreeSchema {
	return getOrCreate(jsonSchemaCache, schema, () => {
		const simpleSchema = getSimpleSchema(schema);
		return toJsonSchema(simpleSchema);
	});
}
