/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ZodType } from "zod";
import type { TreeNodeSchema } from "./schemaTypes.js";
import { toSimpleTreeSchema } from "./treeNodeSchemaToSimpleSchema.js";
import { toZodSchema } from "./simpleSchemaToZod.js";

// TODO: move to `treeNodeApi` once it is a namespace and this can remain `@internal` or `@alpha`
/**
 * TODO
 * @internal
 */
export function getZodSchema(schema: TreeNodeSchema): ZodType {
	const simpleViewSchema = toSimpleTreeSchema(schema);
	return toZodSchema(simpleViewSchema);
}
