/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { JsonCompatible, JsonCompatibleObject } from "../../util/index.js";
import type { TreeSchema } from "./configuration.js";
import { toViewCompatibilityTreeSchema } from "./viewSchemaToViewCompatibilitySchema.js";
import { fail, unreachableCase } from "@fluidframework/core-utils/internal";
import type {
	SimpleAllowedTypeAttributes,
	SimpleArrayNodeSchema,
	SimpleFieldSchema,
	SimpleLeafNodeSchema,
	SimpleMapNodeSchema,
	SimpleNodeSchema,
	SimpleObjectFieldSchema,
	SimpleObjectNodeSchema,
	SimpleRecordNodeSchema,
} from "../simpleSchema.js";
import { NodeKind } from "../core/index.js";

/**
 * Converts a view schema to a serializable format for compatibility testing.
 * @remarks The JSON-compatible schema returned from this method is only intended for use in snapshots/comparisons of view schemas.
 * It is not possible to reconstruct a full view schema from the serialized format.
 * @param treeSchema - The tree schema to convert.
 * @returns A serializable representation of the view schema.
 */
export function toSerializableCompatibilitySchema(treeSchema: TreeSchema): JsonCompatible {
	const simpleSchema = toViewCompatibilityTreeSchema(
		treeSchema,
		// Copying strips out references to metadata and other non-essential information.
		true,
	);

	// Convert types to serializable forms
	const serializableDefinitions = new Map<string, JsonCompatible>();

	for (const [identifier, schema] of simpleSchema.definitions) {
		const serializableDefinition = nodeSchemaToSerializable(schema);
		serializableDefinitions.set(identifier, serializableDefinition);
	}

	const serializableSchema = {
		root: toSerializableField(simpleSchema.root),
		definitions: mapToRecord(serializableDefinitions),
	} as unknown as JsonCompatible;

	return serializableSchema;
}

/**
 * Converts a node schema to a serializable object.
 * @param schema - The node schema to convert.
 * @returns A serializable representation of the node schema.
 */
function nodeSchemaToSerializable(schema: SimpleNodeSchema): JsonCompatibleObject {
	const kind = schema.kind;
	switch (kind) {
		case NodeKind.Leaf:
			return leafNodeToSerializable(schema);
		case NodeKind.Array:
		case NodeKind.Map:
		case NodeKind.Record:
			return containerNodeToSerializable(schema);
		case NodeKind.Object:
			return objectNodeToSerializable(schema);
		default: {
			unreachableCase(kind);
		}
	}
}

/**
 * Converts a leaf node schema to a serializable object.
 * @param schema - The leaf node schema to convert.
 * @returns A serializable representation of the leaf node schema.
 */
function leafNodeToSerializable(schema: SimpleLeafNodeSchema): JsonCompatibleObject {
	return {
		kind: schema.kind,
		leafKind: schema.leafKind,
	};
}

/**
 * Converts a container node schema to a serializable object.
 * @param schema - The container node schema to convert.
 * @returns A serializable representation of the container node schema. Includes the `kind` for disambiguation between different
 * container kinds.
 */
function containerNodeToSerializable(
	schema: SimpleArrayNodeSchema | SimpleMapNodeSchema | SimpleRecordNodeSchema,
): JsonCompatibleObject {
	return {
		kind: schema.kind,
		simpleAllowedTypes: simpleAllowedTypesToSerializable(schema.simpleAllowedTypes),
	};
}

/**
 * Converts a simple allowed types map to a serializable object. Needed because JSON serialization does not support Maps.
 * @param simpleAllowedTypes - The simple allowed types map to convert.
 * @returns A serializable representation of the simple allowed types.
 */
function simpleAllowedTypesToSerializable(
	simpleAllowedTypes: ReadonlyMap<string, SimpleAllowedTypeAttributes>,
): JsonCompatibleObject {
	const serializableAllowedTypes: JsonCompatibleObject = {};
	for (const [identifier, attributes] of simpleAllowedTypes) {
		serializableAllowedTypes[identifier] = {
			...attributes,
		};
	}
	return serializableAllowedTypes;
}

/**
 * Converts an object node schema to a serializable object.
 * @param schema - The object node schema to convert.
 * @returns A serializable representation of the object node schema.
 */
function objectNodeToSerializable(schema: SimpleObjectNodeSchema): JsonCompatibleObject {
	const serializableFields: Record<string, JsonCompatible> = {};
	for (const [fieldKey, fieldSchema] of schema.fields) {
		serializableFields[fieldKey] = toSerializableObjectField(fieldSchema);
	}

	return {
		kind: schema.kind,
		fields: serializableFields,
		allowUnknownOptionalFields: schema.allowUnknownOptionalFields,
	};
}

/**
 * Converts an object field schema to a serializable object.
 * @param fieldSchema - The object field schema to convert.
 * @returns A serializable representation of the object field schema.
 */
function toSerializableObjectField(
	fieldSchema: SimpleObjectFieldSchema,
): JsonCompatibleObject {
	const serializableField = toSerializableField(fieldSchema);
	serializableField.storedKey = fieldSchema.storedKey;
	return serializableField;
}

/**
 * Converts a field schema to a serializable object.
 * @param fieldSchema - The field schema to convert.
 * @returns A serializable representation of the field schema.
 */
function toSerializableField(fieldSchema: SimpleFieldSchema): JsonCompatibleObject {
	return {
		kind: fieldSchema.kind,
		simpleAllowedTypes: simpleAllowedTypesToSerializable(fieldSchema.simpleAllowedTypes),
	};
}

/**
 * Convert a Map to a Record for serialization.
 * @remarks This is needed because the JSON serializer does not support Maps.
 * It is possible that the keys may not be stringify-able types, so this method is a best-effort implementation and its output
 * should only be used in snapshots or debugging scenarios.
 * @param map - The Map to convert.
 * @returns A Record with the contents of the Map.
 */
function mapToRecord<Key, Value>(map: ReadonlyMap<Key, Value>): Record<string, Value> {
	const resultObject: Record<string, Value> = {};
	const sortedKeys = Array.from(map.keys()).sort();

	for (const key of sortedKeys) {
		const value =
			map.get(key) ?? fail("Invalid map: key present in keys() but not found in map.");
		resultObject[`${key}`] = value;
	}

	return resultObject;
}
