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
 * Copies data from {@link ImplicitFieldSchema} to create a {@link SimpleTreeSchema} out of new plain JavaScript objects, Sets and Maps.
 *
 * @remarks
 * See also {@link TreeViewConfigurationAlpha} which implements {@link SimpleTreeSchema} as a way to get a `SimpleTreeSchema` without copying the node and field schema and without losing as much type information.
 *
 * @privateRemarks
 * In the future, we may wish to move this to a more discoverable API location.
 * For now, while still an experimental API, it is surfaced as a free function.
 *
 * Reuses the internal schema-derived graph without initializing node contexts.
 * The returned simple schema is copied on every call; it is not the shared graph.
 *
 * @alpha
 */
export function getSimpleSchema(
	schema: ImplicitFieldSchema,
): SimpleTreeSchema<SchemaType.View> {
	const { treeSchema } = getSchemaDerivedData(schema);
	return transformSimpleSchema(treeSchema, Unchanged);
}
