/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeJsonSchema } from "./jsonSchema.js";
import type { TreeNodeSchema } from "./schemaTypes.js";
import { toJsonSchema } from "./simpleSchemaToJsonSchema.js";
import { toSimpleTreeSchema } from "./treeNodeSchemaToSimpleSchema.js";

// TODO: move to `treeNodeApi` once it is a namespace and this can remain `@internal` or `@alpha`
/**
 * TODO
 * @internal
 */
export function getJsonSchema(schema: TreeNodeSchema): TreeJsonSchema {
	const simpleViewSchema = toSimpleTreeSchema(schema);
	return toJsonSchema(simpleViewSchema);
}
