/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeJsonSchema } from "./jsonSchema.js";
import type { TreeNodeSchema } from "./schemaTypes.js";
import { toJsonSchema } from "./simpleSchemaToJsonSchema.js";
import { toSimpleTreeSchema } from "./treeNodeSchemaToSimpleSchema.js";

// TODO: move to `treeNodeApi` once it is a namespace and this can remain `@internal` or `@alpha`
// TODO: cache the results on the tree schema for faster repeat access.
/**
 * Creates a {@link https://json-schema.org/ | JSON Schema} representation of the provided {@link TreeNodeSchema}.
 *
 * @remarks Useful when communicating the schema to external libraries or services.
 *
 * @alpha
 */
export function getJsonSchema(schema: TreeNodeSchema): TreeJsonSchema {
	const simpleViewSchema = toSimpleTreeSchema(schema);
	return toJsonSchema(simpleViewSchema);
}
