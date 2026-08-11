/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Unchanged } from "../core/index.js";
import type { ImplicitFieldSchema } from "../fieldSchema.js";
import type { SchemaType, SimpleTreeSchema } from "../simpleSchema.js";
import { transformSimpleSchema } from "../toStoredSchema.js";
import { createTreeSchema } from "../treeSchema.js";

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
 * Note that all TreeNodeSchema get a {@link Context} cached on them as part of one time initialization which contains a map from identifier to all transitively referenced schema.
 * Perhaps exposing access to that would cover this use-case as well.
 *
 * @alpha
 */
export function getSimpleSchema(
	schema: ImplicitFieldSchema,
): SimpleTreeSchema<SchemaType.View> {
	// Convert the input into a TreeSchema: This API should probably be updated to take in a TreeSchema directly
	// (and maybe a clean way to make TreeSchema from ImplicitFieldSchema other than TreeViewConfigurationAlpha should be provided).
	const treeSchema = createTreeSchema(schema);
	// Do the actual copy into clean simple schema objects.
	return transformSimpleSchema(treeSchema, Unchanged);
}
