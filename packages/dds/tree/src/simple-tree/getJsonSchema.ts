/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeJsonSchema } from "./jsonSchema.js";
import type { TreeNodeSchema } from "./schemaTypes.js";
import { toJsonSchema } from "./simpleSchemaToJsonSchema.js";
import { getSimpleSchema } from "./getSimpleSchema.js";

/**
 * Private symbol under which the results of {@link getJsonSchema} are cached on an input {@link TreeNodeSchema}.
 */
const jsonSchemaCacheSymbol = Symbol("jsonSchemaCache");

/**
 * Creates a {@link https://json-schema.org/ | JSON Schema} representation of the provided {@link TreeNodeSchema}.
 *
 * @remarks
 * Useful when communicating the schema to external libraries or services.
 * Caches the result on the input schema for future calls.
 *
 * @example
 *
 * A Shared Tree schema like...
 *
 * ```typescript
 * class MyObject extends schemaFactory.object("MyObject", {
 * 	foo: schemaFactory.number,
 * 	bar: schemaFactory.optional(schemaFactory.string),
 * });
 * ```
 *
 * ...will yield JSON Schema like...
 * ```json
 * {
 * 	$defs: [
 * 		"com.fluidframework.leaf.string": {
 * 			type: "string",
 * 		},
 * 		"com.fluidframework.leaf.number": {
 * 			type: "number",
 * 		},
 * 		"com.myapp.MyObject": {
 * 			type: "object",
 * 			properties: {
 * 				"foo": { $ref: "com.fluidframework.leaf.number" },
 * 				"bar": { $ref: "com.fluidframework.leaf.string" },
 * 			},
 * 			required: ["foo"],
 * 		},
 * 	],
 * 	anyOf: [ { $ref: "#/$defs/com.myapp.MyObject" } ],
 * }
 * ```
 *
 * @privateRemarks In the future, we may wish to move this to a more discoverable API location.
 * For now, while still an experimental API, it is surfaced as a free function.
 *
 * @alpha
 */
export function getJsonSchema(schema: TreeNodeSchema): TreeJsonSchema {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if ((schema as any)[jsonSchemaCacheSymbol] !== undefined) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return (schema as any)[jsonSchemaCacheSymbol] as TreeJsonSchema;
	}

	const simpleSchema = getSimpleSchema(schema);
	const jsonSchema = toJsonSchema(simpleSchema);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(schema as any)[jsonSchemaCacheSymbol] = jsonSchema;

	return jsonSchema;
}
