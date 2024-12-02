/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { ValueSchema } from "../../core/index.js";
import { getOrCreate, hasSingle, type Mutable } from "../../util/index.js";
import type {
	JsonArrayNodeSchema,
	JsonFieldSchema,
	JsonSchemaRef,
	JsonRefPath,
	JsonLeafNodeSchema,
	JsonMapNodeSchema,
	JsonNodeSchema,
	JsonObjectNodeSchema,
	JsonTreeSchema,
	JsonLeafSchemaType,
} from "./jsonSchema.js";
import { FieldKind } from "../schemaTypes.js";
import type {
	SimpleArrayNodeSchema,
	SimpleLeafNodeSchema,
	SimpleMapNodeSchema,
	SimpleNodeSchema,
	SimpleObjectNodeSchema,
	SimpleTreeSchema,
} from "./simpleSchema.js";
import { NodeKind } from "../core/index.js";

/**
 * Generates a JSON Schema representation from a simple tree schema.
 * @internal
 */
export function toJsonSchema(schema: SimpleTreeSchema): JsonTreeSchema {
	const definitions = convertDefinitions(schema.definitions);

	const allowedTypes: JsonSchemaRef[] = [];
	for (const allowedType of schema.allowedTypes) {
		allowedTypes.push(createSchemaRef(allowedType));
	}

	return hasSingle(allowedTypes)
		? {
				...allowedTypes[0],
				$defs: definitions,
			}
		: {
				$defs: definitions,
				anyOf: allowedTypes,
			};
}

function convertDefinitions(
	definitions: ReadonlyMap<string, SimpleNodeSchema>,
): Record<string, JsonNodeSchema> {
	const result: Record<string, JsonNodeSchema> = {};
	for (const [key, value] of definitions) {
		result[key] = convertNodeSchema(value);
	}
	return result;
}

/**
 * Private symbol under which the results of {@link convertNodeSchema} are cached on an input {@link SimpleNodeSchema}.
 */
const nodeJsonSchemaCache = new WeakMap<SimpleNodeSchema, JsonNodeSchema>();

/**
 * Converts an input {@link SimpleNodeSchema} to a {@link JsonNodeSchema}.
 *
 * @remarks Caches the result on the input schema for future calls.
 */
function convertNodeSchema(schema: SimpleNodeSchema): JsonNodeSchema {
	return getOrCreate(nodeJsonSchemaCache, schema, () => {
		switch (schema.kind) {
			case NodeKind.Array:
				return convertArrayNodeSchema(schema);
			case NodeKind.Leaf:
				return convertLeafNodeSchema(schema);
			case NodeKind.Map:
				return convertMapNodeSchema(schema);
			case NodeKind.Object:
				return convertObjectNodeSchema(schema);
			default:
				throw new TypeError(`Unknown node schema kind: ${(schema as SimpleNodeSchema).kind}`);
		}
	});
}

function convertArrayNodeSchema(schema: SimpleArrayNodeSchema): JsonArrayNodeSchema {
	const allowedTypes: JsonSchemaRef[] = [];
	schema.allowedTypes.forEach((type) => {
		allowedTypes.push(createSchemaRef(type));
	});

	const items: JsonFieldSchema = hasSingle(allowedTypes)
		? allowedTypes[0]
		: { anyOf: allowedTypes };

	const output: Mutable<JsonArrayNodeSchema> = {
		type: "array",
		_treeNodeSchemaKind: NodeKind.Array,
		items,
	};

	// Only include "description" property if it is present in the input.
	if (schema.metadata?.description !== undefined) {
		output.description = schema.metadata.description;
	}

	return output;
}

function convertLeafNodeSchema(schema: SimpleLeafNodeSchema): JsonLeafNodeSchema {
	let type: JsonLeafSchemaType;
	switch (schema.leafKind) {
		case ValueSchema.String:
			type = "string";
			break;
		case ValueSchema.Number:
			type = "number";
			break;
		case ValueSchema.Boolean:
			type = "boolean";
			break;
		case ValueSchema.Null:
			type = "null";
			break;
		case ValueSchema.FluidHandle:
			throw new UsageError("Fluid handles are not supported via JSON Schema.");
		default:
			unreachableCase(schema.leafKind);
	}

	return {
		type,
		_treeNodeSchemaKind: NodeKind.Leaf,
	};
}

function convertObjectNodeSchema(schema: SimpleObjectNodeSchema): JsonObjectNodeSchema {
	const properties: Record<string, JsonFieldSchema> = {};
	const required: string[] = [];
	for (const [key, fieldSchema] of Object.entries(schema.fields)) {
		const allowedTypes: JsonSchemaRef[] = [];
		for (const allowedType of fieldSchema.allowedTypes) {
			allowedTypes.push(createSchemaRef(allowedType));
		}

		const output: Mutable<JsonFieldSchema> = hasSingle(allowedTypes)
			? allowedTypes[0]
			: {
					anyOf: allowedTypes,
				};

		// Only include "description" property if it is present in the input.
		if (fieldSchema.metadata?.description !== undefined) {
			output.description = fieldSchema.metadata.description;
		}

		properties[key] = output;

		if (fieldSchema.kind === FieldKind.Required) {
			required.push(key);
		}
	}

	const transformedNode: Mutable<JsonObjectNodeSchema> = {
		type: "object",
		_treeNodeSchemaKind: NodeKind.Object,
		properties,
		required,
		additionalProperties: false,
	};

	// Only include "description" property if it is present in the input.
	if (schema.metadata?.description !== undefined) {
		transformedNode.description = schema.metadata.description;
	}

	return transformedNode;
}

function convertMapNodeSchema(schema: SimpleMapNodeSchema): JsonMapNodeSchema {
	const allowedTypes: JsonSchemaRef[] = [];
	schema.allowedTypes.forEach((type) => {
		allowedTypes.push(createSchemaRef(type));
	});

	const output: Mutable<JsonMapNodeSchema> = {
		type: "object",
		_treeNodeSchemaKind: NodeKind.Map,
		patternProperties: {
			"^.*$": hasSingle(allowedTypes)
				? allowedTypes[0]
				: {
						anyOf: allowedTypes,
					},
		},
	};

	// Only include "description" property if it is present in the input.
	if (schema.metadata?.description !== undefined) {
		output.description = schema.metadata.description;
	}

	return output;
}

function createSchemaRef(schemaId: string): JsonSchemaRef {
	return {
		"$ref": createRefPath(schemaId),
	};
}

function createRefPath(schemaId: string): JsonRefPath {
	return `#/$defs/${schemaId}`;
}
