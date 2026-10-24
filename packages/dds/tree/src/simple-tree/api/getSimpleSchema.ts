/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Unchanged } from "../core/index.js";
import type { ImplicitFieldSchema } from "../fieldSchema.js";
import type { SchemaType, SimpleTreeSchema } from "../simpleSchema.js";
import { transformSimpleSchema } from "../toStoredSchema.js";
import { getSchemaDerivedData } from "../treeSchema.js";

/**
 * Copies the schema structure from an {@link ImplicitFieldSchema} into a {@link SimpleTreeSchema} with plain JavaScript objects and maps.
 *
 * @remarks
 * See also {@link TreeViewConfigurationAlpha} which implements {@link SimpleTreeSchema} as a way to get a `SimpleTreeSchema` without copying the node and field schema and without losing as much type information.
 * Each call creates new schema objects and maps.
 * Custom metadata and persisted metadata values are retained by reference, not deep-copied.
 *
 * @privateRemarks
 * In the future, we may wish to move this to a more discoverable API location.
 * For now, while still an experimental API, it is surfaced as a free function.
 *
 * Reuses the internal schema-derived graph without initializing node contexts.
 * The returned simple schema is copied on every call; it is not the shared graph.
 * Consider accepting a precomputed schema graph directly instead of requiring an implicit root.
 *
 * @alpha
 */
export function getSimpleSchema(
	schema: ImplicitFieldSchema,
): SimpleTreeSchema<SchemaType.View> {
	const { treeSchema } = getSchemaDerivedData(schema);
	return transformSimpleSchema(treeSchema, Unchanged);
}
