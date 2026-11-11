/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { walkAllowedTypes, type SchemaVisitor } from "./core/index.js";
import { type ImplicitFieldSchema, normalizeFieldSchema } from "./fieldSchema.js";

/**
 * Traverses all {@link TreeNodeSchema} schema reachable from `schema`, applying the visitor pattern.
 * @internal
 */
export function walkFieldSchema(schema: ImplicitFieldSchema, visitor: SchemaVisitor): void {
	walkAllowedTypes(normalizeFieldSchema(schema).allowedTypesFull.evaluate(), visitor);
}
