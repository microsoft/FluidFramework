/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getOrCreate } from "../../util/index.js";
import type { TreeNodeSchema } from "../core/index.js";
import type { ImplicitFieldSchema } from "../schemaTypes.js";
import type { SimpleTreeSchema } from "./simpleSchema.js";
import { toSimpleTreeSchema } from "./viewSchemaToSimpleSchema.js";

/**
 * Cache in which the results of {@link getSimpleSchema} saved.
 */
const simpleSchemaCache = new WeakMap<TreeNodeSchema, SimpleTreeSchema>();

/**
 * Creates a simplified representation of the provided {@link TreeNodeSchema}.
 *
 * @remarks Caches the result on the input schema for future calls.
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
 * ```typescript
 * {
 * 	definitions: [
 * 		["com.fluidframework.leaf.number", {
 * 			kind: "leaf",
 * 			type: "number",
 * 		}],
 * 		["com.fluidframework.leaf.string", {
 * 			kind: "leaf",
 * 			type: "string",
 * 		}],
 * 		["com.myapp.MyObject", {
 * 			kind: "object",
 * 			fields: {
 * 				foo: {
 * 					kind: "required",
 * 					allowedTypes: ["com.fluidframework.leaf.number"]
 * 				},
 * 				bar: {
 * 					kind: "optional",
 * 					allowedTypes: ["com.fluidframework.leaf.string"]
 * 				},
 * 			},
 * 		}],
 * 	],
 * 	allowedTypes: ["com.myapp.MyObject"],
 * }
 * ```
 *
 * @privateRemarks In the future, we may wish to move this to a more discoverable API location.
 * For now, while still an experimental API, it is surfaced as a free function.
 *
 * @internal
 */
export function getSimpleSchema(schema: ImplicitFieldSchema): SimpleTreeSchema {
	return getOrCreate(simpleSchemaCache, schema, () => toSimpleTreeSchema(schema));
}
