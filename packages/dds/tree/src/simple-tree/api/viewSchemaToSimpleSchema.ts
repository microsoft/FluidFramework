/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { normalizeFieldSchema, type ImplicitFieldSchema } from "../schemaTypes.js";
import type {
	SimpleNodeSchema,
	SimpleNodeSchemaBase,
	SimpleTreeSchema,
} from "../simpleSchema.js";
import type { NodeKind } from "../core/index.js";
import { walkFieldSchema } from "../walkFieldSchema.js";

/**
 * Converts a "view" schema to a "simple" schema representation.
 * @remarks
 * Since the TreeNodeSchema types implements the simple schema interfaces, this does not have to copy the schema themselves.
 */
export function toSimpleTreeSchema(schema: ImplicitFieldSchema): SimpleTreeSchema {
	const normalizedSchema = normalizeFieldSchema(schema);
	const definitions = new Map<string, SimpleNodeSchema>();
	walkFieldSchema(normalizedSchema, {
		node: (nodeSchema) => {
			definitions.set(
				nodeSchema.identifier,
				nodeSchema as SimpleNodeSchemaBase<NodeKind> as SimpleNodeSchema,
			);
		},
	});

	return {
		kind: normalizedSchema.kind,
		allowedTypesIdentifiers: normalizedSchema.allowedTypesIdentifiers,
		definitions,
		metadata: normalizedSchema.metadata,
	};
}
