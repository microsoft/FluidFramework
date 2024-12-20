/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import {
	normalizeFieldSchema,
	type FieldSchema,
	type ImplicitAllowedTypes,
	type ImplicitFieldSchema,
} from "../schemaTypes.js";
import type {
	SimpleArrayNodeSchema,
	SimpleFieldSchema,
	SimpleLeafNodeSchema,
	SimpleMapNodeSchema,
	SimpleNodeSchema,
	SimpleObjectNodeSchema,
	SimpleTreeSchema,
} from "./simpleSchema.js";
import type { ValueSchema } from "../../core/index.js";
import { copyProperty, getOrCreate, type Mutable } from "../../util/index.js";
import { isObjectNodeSchema, type ObjectNodeSchema } from "../objectNodeTypes.js";
import { NodeKind, type TreeNodeSchema } from "../core/index.js";

/**
 * Converts a "view" schema to a "simple" schema representation.
 */
export function toSimpleTreeSchema(schema: ImplicitFieldSchema): SimpleTreeSchema {
	const normalizedSchema = normalizeFieldSchema(schema);

	const allowedTypes = allowedTypesFromFieldSchema(normalizedSchema);

	const definitions = new Map<string, SimpleNodeSchema>();
	populateSchemaDefinitionsForField(normalizedSchema, definitions);

	const output: Mutable<SimpleTreeSchema> = {
		kind: normalizedSchema.kind,
		allowedTypes,
		definitions,
	};

	copyProperty(normalizedSchema, "metadata", output);
	return output;
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
	};
}

// TODO: Use a stronger type for array schemas once one is available (see object schema handler for an example).
function arraySchemaToSimpleSchema(schema: TreeNodeSchema): SimpleArrayNodeSchema {
	const fieldSchema = normalizeFieldSchema(schema.info as ImplicitAllowedTypes);
	const allowedTypes = allowedTypesFromFieldSchema(fieldSchema);
	return {
		kind: NodeKind.Array,
		allowedTypes,
	};
}

// TODO: Use a stronger type for map schemas once one is available (see object schema handler for an example).
function mapSchemaToSimpleSchema(schema: TreeNodeSchema): SimpleMapNodeSchema {
	const fieldSchema = normalizeFieldSchema(schema.info as ImplicitAllowedTypes);
	const allowedTypes = allowedTypesFromFieldSchema(fieldSchema);
	return {
		kind: NodeKind.Map,
		allowedTypes,
	};
}

function objectSchemaToSimpleSchema(schema: ObjectNodeSchema): SimpleObjectNodeSchema {
	const fields: Record<string, SimpleFieldSchema> = {};
	for (const [key, field] of schema.fields) {
		fields[key] = fieldSchemaToSimpleSchema(field);
	}
	return {
		kind: NodeKind.Object,
		fields,
	};
}

/**
 * Private symbol under which the results of {@link toSimpleNodeSchema} are cached on an input {@link TreeNodeSchema}.
 */
const simpleFieldSchemaCacheSymbol = Symbol("simpleFieldSchemaCache");

function fieldSchemaToSimpleSchema(schema: FieldSchema): SimpleFieldSchema {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if ((schema as any)[simpleFieldSchemaCacheSymbol] !== undefined) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return (schema as any)[simpleFieldSchemaCacheSymbol] as SimpleFieldSchema;
	}

	const allowedTypes = allowedTypesFromFieldSchema(schema);
	const result: Mutable<SimpleFieldSchema> = {
		kind: schema.kind,
		allowedTypes,
	};

	copyProperty(schema, "metadata", result);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(schema as any)[simpleFieldSchemaCacheSymbol] = result;

	return result;
}

function allowedTypesFromFieldSchema(schema: FieldSchema): Set<string> {
	const allowedTypes = new Set<string>();
	for (const type of schema.allowedTypeSet) {
		allowedTypes.add(type.identifier);
	}
	return allowedTypes;
}

/**
 * Recursively populates `definitions` by walking the input field schema tree.
 */
function populateSchemaDefinitionsForField(
	schema: FieldSchema,
	definitions: Map<string, SimpleNodeSchema>,
): void {
	for (const child of schema.allowedTypeSet) {
		populateSchemaDefinitionsForNode(child, definitions);
	}
}

/**
 * Recursively populates `definitions` by walking the input node schema tree.
 */
function populateSchemaDefinitionsForNode(
	schema: TreeNodeSchema,
	definitions: Map<string, SimpleNodeSchema>,
): void {
	if (definitions.has(schema.identifier)) {
		// If the definition has already been populated, no need to recurse.
		return;
	}

	// Populate definition for this schema
	definitions.set(schema.identifier, toSimpleNodeSchema(schema));

	// Recurse into children to populate definitions for them
	const kind = schema.kind;
	switch (kind) {
		case NodeKind.Leaf: {
			// Leaf node, so no need to recurse
			break;
		}
		case NodeKind.Map: {
			// TODO: Utilize a map schema type-guard once one exists (see object case for an example).

			// Recursively populate definitions for allowed map children
			const fieldSchema = normalizeFieldSchema(schema.info as ImplicitAllowedTypes);
			populateSchemaDefinitionsForField(fieldSchema, definitions);
			break;
		}
		case NodeKind.Array: {
			// TODO: Utilize an array schema type-guard once one exists (see object case for an example).

			// Recursively populate definitions for allowed map children
			const fieldSchema = normalizeFieldSchema(schema.info as ImplicitAllowedTypes);
			populateSchemaDefinitionsForField(fieldSchema, definitions);
			break;
		}
		case NodeKind.Object: {
			assert(isObjectNodeSchema(schema), 0xa07 /* Expected object schema */);
			for (const [, field] of schema.fields) {
				populateSchemaDefinitionsForField(field, definitions);
			}
			break;
		}
		default: {
			unreachableCase(kind);
		}
	}
}
