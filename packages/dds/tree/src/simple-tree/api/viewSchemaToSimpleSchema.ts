/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import { normalizeFieldSchema, type ImplicitFieldSchema } from "../schemaTypes.js";
import type {
	SimpleArrayNodeSchema,
	SimpleLeafNodeSchema,
	SimpleMapNodeSchema,
	SimpleNodeSchema,
	SimpleObjectFieldSchema,
	SimpleObjectNodeSchema,
	SimpleTreeSchema,
} from "../simpleSchema.js";
import { getOrCreate } from "../../util/index.js";
import { isObjectNodeSchema } from "../objectNodeTypes.js";
import { NodeKind, type TreeNodeSchema } from "../core/index.js";
import { walkFieldSchema } from "../walkFieldSchema.js";
import { ArrayNodeSchema } from "../arrayNodeTypes.js";
import { LeafNodeSchema } from "../leafNodeSchema.js";
import { MapNodeSchema } from "../mapNodeTypes.js";

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
				assert(schema instanceof LeafNodeSchema, "Invalid schema");
				return copySimpleLeafSchema(schema);
			}
			case NodeKind.Array:
			case NodeKind.Map: {
				assert(
					schema instanceof ArrayNodeSchema || schema instanceof MapNodeSchema,
					"Invalid schema",
				);
				return copySimpleMapOrArraySchema(schema);
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

function copySimpleLeafSchema(schema: SimpleLeafNodeSchema): SimpleLeafNodeSchema {
	return {
		kind: NodeKind.Leaf,
		leafKind: schema.leafKind,
		metadata: schema.metadata,
	};
}

function copySimpleMapOrArraySchema(
	schema: SimpleMapNodeSchema | SimpleArrayNodeSchema,
): SimpleMapNodeSchema | SimpleArrayNodeSchema {
	return {
		kind: schema.kind,
		allowedTypesIdentifiers: schema.allowedTypesIdentifiers,
		metadata: schema.metadata,
	};
}

function objectSchemaToSimpleSchema(schema: SimpleObjectNodeSchema): SimpleObjectNodeSchema {
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
