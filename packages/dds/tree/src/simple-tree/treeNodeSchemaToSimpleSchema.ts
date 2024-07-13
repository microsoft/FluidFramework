/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import {
	FieldKind,
	NodeKind,
	normalizeFieldSchema,
	type FieldSchema,
	type ImplicitAllowedTypes,
	type TreeNodeSchema,
} from "./schemaTypes.js";
import type {
	SimpleArrayNodeSchema,
	SimpleFieldSchema,
	SimpleFieldSchemaKind,
	SimpleLeafNodeSchema,
	SimpleLeafSchemaKind,
	SimpleMapNodeSchema,
	SimpleNodeSchema,
	SimpleObjectNodeSchema,
	SimpleTreeSchema,
} from "./simpleSchema.js";
import { isObjectNodeSchema, type ObjectNodeSchema } from "./objectNode.js";
import { ValueSchema } from "../core/index.js";
import { fail } from "../util/index.js";

// TODOs:
// - Cache results on view schema to avoid redundant recomputation

export function toSimpleTreeSchema(schema: ImplicitAllowedTypes): SimpleTreeSchema {
	const normalizedSchema = normalizeFieldSchema(schema);

	const allowedTypes = allowedTypesFromFieldSchema(normalizedSchema);

	const definitions = new Map<string, SimpleNodeSchema>();
	populateSchemaDefinitionsForField(normalizedSchema, definitions);

	// TODO: recursive walk of schema to populate definitions

	return {
		allowedTypes,
		definitions,
	};
}

// Note: shallow
function toSimpleNodeSchema(schema: TreeNodeSchema): SimpleNodeSchema {
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
			assert(isObjectNodeSchema(schema), "Expected object schema");
			return objectSchemaToSimpleSchema(schema);
		}
		default: {
			fail(`Unrecognized node kind: ${kind}.`);
		}
	}
}

// TODO: stronger type
function leafSchemaToSimpleSchema(schema: TreeNodeSchema): SimpleLeafNodeSchema {
	return {
		kind: "leaf",
		type: leafKindFromValueSchema(schema.info as ValueSchema),
	};
}

// TODO: stronger type
function arraySchemaToSimpleSchema(schema: TreeNodeSchema): SimpleArrayNodeSchema {
	const fieldSchema = normalizeFieldSchema(schema.info as ImplicitAllowedTypes);
	const allowedTypes = allowedTypesFromFieldSchema(fieldSchema);
	return {
		kind: "array",
		allowedTypes,
	};
}

// TODO: stronger type
function mapSchemaToSimpleSchema(schema: TreeNodeSchema): SimpleMapNodeSchema {
	const fieldSchema = normalizeFieldSchema(schema.info as ImplicitAllowedTypes);
	const allowedTypes = allowedTypesFromFieldSchema(fieldSchema);
	return {
		kind: "map",
		allowedTypes,
	};
}

function objectSchemaToSimpleSchema(schema: ObjectNodeSchema): SimpleObjectNodeSchema {
	const fields: Record<string, SimpleFieldSchema> = {};
	for (const [key, field] of schema.fields) {
		fields[key] = fieldSchemaToSimpleSchema(field);
	}
	return {
		kind: "object",
		fields,
	};
}

function fieldSchemaToSimpleSchema(schema: FieldSchema): SimpleFieldSchema {
	const kind = fieldKindToSimpleFieldKind(schema.kind);
	const allowedTypes = allowedTypesFromFieldSchema(schema);
	return {
		kind,
		allowedTypes,
	};
}

function fieldKindToSimpleFieldKind(fieldKind: FieldKind): SimpleFieldSchemaKind {
	switch (fieldKind) {
		case FieldKind.Optional: {
			return "optional";
		}
		case FieldKind.Required: {
			return "required";
		}
		case FieldKind.Identifier: {
			return "identifier";
		}
		default: {
			unreachableCase(fieldKind);
		}
	}
}

function allowedTypesFromFieldSchema(schema: FieldSchema): Set<string> {
	const allowedTypes = new Set<string>();
	for (const type of schema.allowedTypeSet) {
		allowedTypes.add(type.identifier);
	}
	return allowedTypes;
}

function leafKindFromValueSchema(schema: ValueSchema): SimpleLeafSchemaKind {
	switch (schema) {
		case ValueSchema.String: {
			return "string";
		}
		case ValueSchema.Number: {
			return "number";
		}
		case ValueSchema.Boolean: {
			return "boolean";
		}
		case ValueSchema.Null: {
			return "null";
		}
		case ValueSchema.FluidHandle: {
			return "fluid-handle";
		}
		default: {
			unreachableCase(schema);
		}
	}
}

function populateSchemaDefinitionsForField(
	schema: FieldSchema,
	definitions: Map<string, SimpleNodeSchema>,
): void {
	for (const child of schema.allowedTypeSet) {
		populateSchemaDefinitionsForNode(child, definitions);
	}
}

// Note: recursive
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
			// TODO: typeguard

			// Recursively populate definitions for allowed map children
			const fieldSchema = normalizeFieldSchema(schema.info as ImplicitAllowedTypes);
			populateSchemaDefinitionsForField(fieldSchema, definitions);
			break;
		}
		case NodeKind.Array: {
			// TODO: typeguard

			// Recursively populate definitions for allowed map children
			const fieldSchema = normalizeFieldSchema(schema.info as ImplicitAllowedTypes);
			populateSchemaDefinitionsForField(fieldSchema, definitions);
			break;
		}
		case NodeKind.Object: {
			assert(isObjectNodeSchema(schema), "Expected object schema");
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
