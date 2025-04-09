/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ImplicitFieldSchema } from "../schemaTypes.js";
import type { SimpleTreeSchema } from "../simpleSchema.js";
import { toSimpleTreeSchema } from "./viewSchemaToSimpleSchema.js";

/**
 * Copies data from {@link ImplicitFieldSchema} to create  a {@link SimpleTreeSchema} out of new plain JavaScript objects, Sets and Maps.
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
 * @internal
 */
export function getSimpleSchema(schema: ImplicitFieldSchema): SimpleTreeSchema {
	return toSimpleTreeSchema(schema, true);
}
