/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeNodeSchema } from "./schemaTypes.js";
import type { SimpleTreeSchema } from "./simpleSchema.js";
import { toSimpleTreeSchema } from "./viewSchemaToSimpleSchema.js";

/**
 * Private symbol under which the results of {@link getSimpleSchema} are cached on an input {@link TreeNodeSchema}.
 */
const simpleSchemaCacheSymbol = Symbol("simpleSchemaCache");

/**
 * Creates a simplified representation of the provided {@link TreeNodeSchema}.
 *
 * @remarks Caches the result on the input schema for future calls.
 *
 * @privateRemarks In the future, we may wish to move this to a more discoverable API location.
 * For now, while still an experimental API, it is surfaced as a free function.
 */
export function getSimpleSchema(schema: TreeNodeSchema): SimpleTreeSchema {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if ((schema as any)[simpleSchemaCacheSymbol] !== undefined) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return (schema as any)[simpleSchemaCacheSymbol] as SimpleTreeSchema;
	}

	const simpleSchema = toSimpleTreeSchema(schema);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(schema as any)[simpleSchemaCacheSymbol] = simpleSchema;

	return simpleSchema;
}
