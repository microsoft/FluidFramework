/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getOrCreate } from "../../util/index.js";
import type { TreeNodeSchema } from "../core/index.js";
import type { ImplicitFieldSchema } from "../schemaTypes.js";
import type { SimpleTreeSchema } from "../simpleSchema.js";
import { toSimpleTreeSchema } from "./viewSchemaToSimpleSchema.js";

/**
 * Cache in which the results of {@link getSimpleSchema} saved.
 */
const simpleSchemaCache = new WeakMap<TreeNodeSchema, SimpleTreeSchema>();

/**
 * Creates a {@link SimpleTreeSchema} from the provided {@link ImplicitFieldSchema}.
 *
 * @remarks
 * This provides easy access by identifier to any schema transitively referenced by the input schema via {@link SimpleTreeSchema.definitions}.
 *
 * Caches the result on the input schema for future calls.
 *
 * @privateRemarks
 * In the future, we may wish to move this to a more discoverable API location.
 * For now, while still an experimental API, it is surfaced as a free function.
 *
 * If the main use for this is the "definitions" map, we should provide a better way to access it (that doesn't type erase the TreeNodeSchema down to SimpleNodeSchema).
 * TODO: Having TreeViewConfiguration implement SimpleTreeSchema directly but with more specific types would be a good way to do this.
 *
 * Note that all TreeNodeSchema get a {@link Context} cached on them as part of one time initialization which contains a map from identifier to all transitively referenced schema.
 * Perhaps exposing access to that would cover this use-case as well.
 *
 * TODO: does having this caching layer add value? Maybe this wrapper around toSimpleTreeSchema should be removed.
 *
 * If the main use for this is the "definitions" map, we should provide a better way to access it (that doesn't type erase the TreeNodeSchema down to SimpleNodeSchema).
 * TODO: Having TreeViewConfiguration implement SimpleTreeSchema directly but with more specific types would be a good way to do this.
 *
 * Note that all TreeNodeSchema get a {@link Context} cached on them as part of one time initialization which contains a map from identifier to all transitively referenced schema.
 * Perhaps exposing access to that would cover this use-case as well.
 *
 * TODO: does having this caching layer add value? Maybe this wrapper around toSimpleTreeSchema should be removed.
 *
 * @alpha
 */
export function getSimpleSchema(schema: ImplicitFieldSchema): SimpleTreeSchema {
	return getOrCreate(simpleSchemaCache, schema, () => toSimpleTreeSchema(schema, false));
}
