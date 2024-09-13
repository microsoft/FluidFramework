/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type TreeNodeSchema, walkAllowedTypes, type SchemaVisitor } from "./core/index.js";

import { type ImplicitFieldSchema, normalizeFieldSchema } from "./schemaTypes.js";

export function walkFieldSchema(
	schema: ImplicitFieldSchema,
	visitor: SchemaVisitor,
	visitedSet: Set<TreeNodeSchema> = new Set(),
): void {
	walkAllowedTypes(normalizeFieldSchema(schema).allowedTypeSet, visitor, visitedSet);
}
