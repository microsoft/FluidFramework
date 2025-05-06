/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { ValueSchema } from "../../core/index.js";
import { copyProperty, hasSingle, type Mutable } from "../../util/index.js";
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
} from "../simpleSchema.js";
import { NodeKind, type TreeNodeSchema } from "../core/index.js";
import type { TreeSchema } from "./configuration.js";
import type { TreeSchemaEncodingOptions } from "./getJsonSchema.js";
import { ObjectNodeSchema } from "../objectNodeTypes.js";
import { ArrayNodeSchema } from "../arrayNodeTypes.js";
import { MapNodeSchema } from "../mapNodeTypes.js";
import { LeafNodeSchema } from "../leafNodeSchema.js";

/**
 * Generates a JSON Schema representation from a simple tree schema.
 * @remarks
 * This expects the data to be in the {@link ConciseTree} format.
 *
 * This cannot handle the case where the root is undefined since undefined is not a concept in JSON.
 * This also cannot handle {@link SchemaStatics.handle} since they also are not supported in JSON.
 *
 * @internal
 */
export function toJsonSchema(
	schema: TreeSchema,
	options: Required<TreeSchemaEncodingOptions>,
): JsonTreeSchema {
	const definitions = convertDefinitions(schema.definitions, options);

	const allowedTypes: JsonSchemaRef[] = [];
	for (const allowedType of schema.root.allowedTypesIdentifiers) {
		allowedTypes.push(createSchemaRef(allowedType));
	}

	// TODO: deduplicate field handling logic from convertObjectNodeSchema: at least include metadata's description.
	// TODO: maybe account for consider schema.kind, or just take in ImplicitAllowedTypes
	// TODO: handle case where allowedTypes is empty.
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
	definitions: ReadonlyMap<string, TreeNodeSchema>,
	options: Required<TreeSchemaEncodingOptions>,
): Record<string, JsonNodeSchema> {
	const result: Record<string, JsonNodeSchema> = {};
	for (const [key, value] of definitions) {
		result[key] = convertNodeSchema(value, options);
	}
	return result;
}

/**
 * Converts an input {@link SimpleNodeSchema} to a {@link JsonNodeSchema}.
 *
 * @remarks Caches the result on the input schema for future calls.
 */
function convertNodeSchema(
	schema: TreeNodeSchema,
	options: Required<TreeSchemaEncodingOptions>,
): JsonNodeSchema {
	if (schema instanceof ArrayNodeSchema) {
		return convertArrayNodeSchema(schema);
	} else if (schema instanceof MapNodeSchema) {
		return convertMapNodeSchema(schema);
	} else if (schema instanceof ObjectNodeSchema) {
		return convertObjectNodeSchema(schema, options);
	} else if (schema instanceof LeafNodeSchema) {
		return convertLeafNodeSchema(schema);
	}
	throw new TypeError(`Unknown node schema kind: ${schema.kind}`);
}

function convertArrayNodeSchema(schema: SimpleArrayNodeSchema): JsonArrayNodeSchema {
	const allowedTypes: JsonSchemaRef[] = [];
	schema.allowedTypesIdentifiers.forEach((type) => {
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

	copyProperty(schema.metadata, "description", output);

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

export function convertObjectNodeSchema(
	schema: ObjectNodeSchema,
	options: Required<TreeSchemaEncodingOptions>,
): JsonObjectNodeSchema {
	const properties: Record<string, JsonFieldSchema> = {};
	const required: string[] = [];
	for (const [propertyKey, fieldSchema] of schema.fields) {
		const key = options.useStoredKeys ? fieldSchema.storedKey : propertyKey;
		const allowedTypes: JsonSchemaRef[] = [];
		for (const allowedType of fieldSchema.allowedTypesIdentifiers) {
			allowedTypes.push(createSchemaRef(allowedType));
		}

		const output: Mutable<JsonFieldSchema> = hasSingle(allowedTypes)
			? allowedTypes[0]
			: {
					anyOf: allowedTypes,
				};

		copyProperty(fieldSchema.metadata, "description", output);
		properties[key] = output;

		if (fieldSchema.kind !== FieldKind.Optional) {
			if (
				options.requireFieldsWithDefaults ||
				fieldSchema.props?.defaultProvider === undefined
			) {
				required.push(key);
			}
		}
	}

	const transformedNode: Mutable<JsonObjectNodeSchema> = {
		type: "object",
		_treeNodeSchemaKind: NodeKind.Object,
		properties,
		required,
		additionalProperties: false,
	};

	copyProperty(schema.metadata, "description", transformedNode);

	return transformedNode;
}

function convertMapNodeSchema(schema: SimpleMapNodeSchema): JsonMapNodeSchema {
	const allowedTypes: JsonSchemaRef[] = [];
	schema.allowedTypesIdentifiers.forEach((type) => {
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

	copyProperty(schema.metadata, "description", output);

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
