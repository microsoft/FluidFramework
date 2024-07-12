/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeJsonSchema } from "./jsonSchema.js";
import { toJsonSchema } from "./simpleSchemaToJsonSchema.js";
import { treeNodeApi } from "./treeNodeApi.js";
import { toSimpleTreeSchema } from "./treeNodeSchemaToSimpleSchema.js";
import type { TreeNode } from "./types.js";

// TODO: move to `treeNodeApi` once it is a namespace and this can remain `@internal` or `@alpha`
/**
 * TODO
 * @internal
 */
export function getJsonSchema(node: TreeNode): TreeJsonSchema {
	const simpleViewSchema = toSimpleTreeSchema(treeNodeApi.schema(node));
	return toJsonSchema(simpleViewSchema);
}
