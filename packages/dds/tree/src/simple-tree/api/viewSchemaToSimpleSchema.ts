/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import {
	normalizeAllowedTypes,
	normalizeFieldSchema,
	type ImplicitAllowedTypes,
	type ImplicitFieldSchema,
} from "../schemaTypes.js";
import type {
	SimpleArrayNodeSchema,
	SimpleLeafNodeSchema,
	SimpleMapNodeSchema,
	SimpleNodeSchema,
	SimpleObjectFieldSchema,
	SimpleObjectNodeSchema,
	SimpleTreeSchema,
} from "../simpleSchema.js";
import type { ValueSchema } from "../../core/index.js";
import { getOrCreate } from "../../util/index.js";
import { isObjectNodeSchema, type ObjectNodeSchema } from "../objectNodeTypes.js";
import { NodeKind, type TreeNodeSchema } from "../core/index.js";
import { walkFieldSchema } from "../walkFieldSchema.js";

/**
 * Converts a "view" schema to a "simple" schema representation.
 * @remarks
 * Even when the TreeNodeSchema types implements the simple schema interfaces, this copies out the minimal data to implement SimpleTreeSchema in plain objects.
 */
export function toSimpleTreeSchema(schema: ImplicitFieldSchema): SimpleTreeSchema {
	const normalizedSchema = normalizeFieldSchema(schema);
	const definitions = new Map<string, SimpleNodeSchema>();
	walkFieldSchema(normalizedSchema, {
		node: (nodeSchema) => {
			definitions.set(nodeSchema.identifier, toSimpleNodeSchema(nodeSchema));
		},
	});

	return {
		kind: normalizedSchema.kind,
		allowedTypesIdentifiers: normalizedSchema.allowedTypesIdentifiers,
		definitions,
		metadata: normalizedSchema.metadata,
	};
}

/**
 * Cache in which the results of {@link toSimpleNodeSchema} are saved.
 */
const simpleNodeSchemaCache = new WeakMap<TreeNodeSchema, SimpleNodeSchema>();

/**
 * Creates a {@link SimpleNodeSchema} from a {@link TreeNodeSchema}.
 *
 * @remarks Caches the result on the input schema for future calls.
 */
function toSimpleNodeSchema(schema: TreeNodeSchema): SimpleNodeSchema {
	return getOrCreate(simpleNodeSchemaCache, schema, () => {
		const kind = schema.kind;
		switch (kind) {
			case NodeKind.Leaf: {
				return leafSchemaToSimpleSchema(schema);
			}
			case NodeKind.Map: {
				return mapSchemaToSimpleSchema(schema);
			}
			case NodeKind.Array: {
				return arraySchemaToSimpleSchema(schema);
			}
			case NodeKind.Object: {
				assert(isObjectNodeSchema(schema), 0xa06 /* Expected object schema */);
				return objectSchemaToSimpleSchema(schema);
			}
			default: {
				unreachableCase(kind);
			}
		}
	});
}

// TODO: Use a stronger type for leaf schemas once one is available (see object schema handler for an example).
function leafSchemaToSimpleSchema(schema: TreeNodeSchema): SimpleLeafNodeSchema {
	return {
		kind: NodeKind.Leaf,
		leafKind: schema.info as ValueSchema,
		metadata: schema.metadata,
	};
}

// TODO: Use a stronger type for array schemas once one is available (see object schema handler for an example).
function arraySchemaToSimpleSchema(schema: TreeNodeSchema): SimpleArrayNodeSchema {
	return {
		kind: NodeKind.Array,
		allowedTypesIdentifiers: identifiersFromAllowedTypes(schema.info as ImplicitAllowedTypes),
		metadata: schema.metadata,
	};
}

// TODO: Use a stronger type for map schemas once one is available (see object schema handler for an example).
function mapSchemaToSimpleSchema(schema: TreeNodeSchema): SimpleMapNodeSchema {
	return {
		kind: NodeKind.Map,
		allowedTypesIdentifiers: identifiersFromAllowedTypes(schema.info as ImplicitAllowedTypes),
		metadata: schema.metadata,
	};
}

function objectSchemaToSimpleSchema(schema: ObjectNodeSchema): SimpleObjectNodeSchema {
	const fields: Map<string, SimpleObjectFieldSchema> = new Map();
	for (const [propertyKey, field] of schema.fields) {
		// field already is a SimpleObjectFieldSchema, but copy the subset of the properties needed by this interface to get a clean simple object.
		fields.set(propertyKey, {
			kind: field.kind,
			allowedTypesIdentifiers: field.allowedTypesIdentifiers,
			metadata: field.metadata,
			storedKey: field.storedKey,
		});
	}

	return {
		kind: NodeKind.Object,
		fields,
		metadata: schema.metadata,
	};
}

function identifiersFromAllowedTypes(schema: ImplicitAllowedTypes): ReadonlySet<string> {
	const allowed = normalizeAllowedTypes(schema);
	return new Set([...allowed].map((type) => type.identifier));
}
