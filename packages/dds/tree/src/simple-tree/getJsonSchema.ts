/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { JsonTreeSchema } from "./jsonSchema.js";
import type { TreeNodeSchema } from "./schemaTypes.js";
import { toJsonSchema } from "./simpleSchemaToJsonSchema.js";
import { getSimpleSchema } from "./getSimpleSchema.js";
import { transformWithWeakMapCache } from "../util/index.js";

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
 * 	"anyOf": [ { "$ref": "#/$defs/com.myapp.MyObject" } ],
 * }
 * ```
 *
 * @privateRemarks In the future, we may wish to move this to a more discoverable API location.
 * For now, while still an experimental API, it is surfaced as a free function.
 *
 * @alpha
 */
export function getJsonSchema(schema: TreeNodeSchema): JsonTreeSchema {
	return transformWithWeakMapCache(schema, jsonSchemaCache, (_schema) => {
		const simpleSchema = getSimpleSchema(_schema);
		return toJsonSchema(simpleSchema);
	});
}
