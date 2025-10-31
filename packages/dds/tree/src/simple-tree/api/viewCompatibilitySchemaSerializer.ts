/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	isJsonObject,
	objectToMap,
	type JsonCompatible,
	type JsonCompatibleObject,
} from "../../util/index.js";
import { fail, unreachableCase, assert } from "@fluidframework/core-utils/internal";
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
	SimpleTreeSchema,
} from "../simpleSchema.js";
import { NodeKind } from "../core/index.js";
import type { FieldKind } from "../fieldSchema.js";
import type { ValueSchema } from "../../core/index.js";

/**
 * Converts a view schema to a serializable format for compatibility testing.
 * @remarks The JSON-compatible schema returned from this method is only intended for use in snapshots/comparisons of view schemas.
 * It is not possible to reconstruct a full view schema from the serialized format.
 * @param treeSchema - The tree schema to convert.
 * @returns A serializable representation of the view schema.
 */
export function serializeCompatibilitySchema(simpleSchema: SimpleTreeSchema): JsonCompatible {
	// Convert types to serializable forms
	const serializableDefinitions = new Map<string, JsonCompatible>();

	for (const [identifier, schema] of simpleSchema.definitions) {
		const serializableDefinition = serializeNodeSchema(schema);
		serializableDefinitions.set(identifier, serializableDefinition);
	}

	const serializedSchema = {
		root: serializeField(simpleSchema.root),
		definitions: mapToRecord(serializableDefinitions),
	} as unknown as JsonCompatible;

	return serializedSchema;
}

/**
 * Deserializes a JSON-compatible schema into a view schema for compatibility testing.
 * @param serializedSchema - The serialized schema to deserialize.
 * @returns A deserialized view schema.
 */
export function deserializeCompatibilitySchema(
	serializedSchema: JsonCompatible,
): SimpleTreeSchema {
	assert(isJsonObject(serializedSchema), "Expected object for serializedSchema");
	const serializedSchemaAsObject = serializedSchema as JsonCompatibleObject;

	assert(
		isJsonObject(serializedSchemaAsObject.root ?? fail("Expected root field")),
		"Expected object for root field schema",
	);
	const serializedRoot = serializedSchemaAsObject.root as JsonCompatibleObject;

	assert(
		isJsonObject(serializedSchemaAsObject.definitions ?? fail("Expected definitions field")),
		"Expected object for definitions field",
	);
	const serializedDefinitions = serializedSchemaAsObject.definitions as JsonCompatibleObject;

	return {
		root: deserializeSimpleFieldSchema(serializedRoot),
		definitions: new Map(
			transformMapValues(objectToMap(serializedDefinitions), (value, key) => {
				assert(
					isJsonObject(value ?? fail(`Expected node schema for definition ${key}`)),
					"Expected object for node schema in definitions",
				);
				return deserializeNodeSchema(value as JsonCompatibleObject);
			}),
		),
	};
}

/**
 * Converts a node schema to a serializable object.
 * @param schema - The node schema to convert.
 * @returns A serializable representation of the node schema.
 */
function serializeNodeSchema(schema: SimpleNodeSchema): JsonCompatibleObject {
	const kind = schema.kind;
	switch (kind) {
		case NodeKind.Leaf:
			return serializeLeafNode(schema);
		case NodeKind.Array:
		case NodeKind.Map:
		case NodeKind.Record:
			return serializeContainerNode(schema);
		case NodeKind.Object:
			return serializeObjectNode(schema);
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
function serializeLeafNode(schema: SimpleLeafNodeSchema): JsonCompatibleObject {
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
function serializeContainerNode(
	schema: SimpleArrayNodeSchema | SimpleMapNodeSchema | SimpleRecordNodeSchema,
): JsonCompatibleObject {
	return {
		kind: schema.kind,
		simpleAllowedTypes: serializeSimpleAllowedTypes(schema.simpleAllowedTypes),
	};
}

/**
 * Converts a simple allowed types map to a serializable object. Needed because JSON serialization does not support Maps.
 * @param simpleAllowedTypes - The simple allowed types map to convert.
 * @returns A serializable representation of the simple allowed types.
 */
function serializeSimpleAllowedTypes(
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
function serializeObjectNode(schema: SimpleObjectNodeSchema): JsonCompatibleObject {
	const serializableFields: Record<string, JsonCompatible> = {};
	for (const [fieldKey, fieldSchema] of schema.fields) {
		serializableFields[fieldKey] = serializeObjectField(fieldSchema);
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
function serializeObjectField(fieldSchema: SimpleObjectFieldSchema): JsonCompatibleObject {
	const serializableField = serializeField(fieldSchema);
	serializableField.storedKey = fieldSchema.storedKey;
	return serializableField;
}

/**
 * Converts a field schema to a serializable object.
 * @param fieldSchema - The field schema to convert.
 * @returns A serializable representation of the field schema.
 */
function serializeField(fieldSchema: SimpleFieldSchema): JsonCompatibleObject {
	return {
		kind: fieldSchema.kind,
		simpleAllowedTypes: serializeSimpleAllowedTypes(fieldSchema.simpleAllowedTypes),
	};
}

/**
 * Deserializes a node schema from a JSON-compatible object.
 * @param serializedNodeSchema - The serialized node schema to deserialize.
 * @returns The deserialized node schema.
 */
function deserializeNodeSchema(
	serializedNodeSchema: JsonCompatibleObject,
):
	| SimpleLeafNodeSchema
	| SimpleArrayNodeSchema
	| SimpleMapNodeSchema
	| SimpleRecordNodeSchema
	| SimpleObjectNodeSchema {
	const kind = serializedNodeSchema.kind as NodeKind;

	switch (kind) {
		case NodeKind.Array:
		case NodeKind.Map:
		case NodeKind.Record:
			return deserializeContainerNode(serializedNodeSchema);
		case NodeKind.Leaf:
			return deserializeLeafNode(serializedNodeSchema);
		case NodeKind.Object:
			return deserializeObjectNode(serializedNodeSchema);
		default:
			unreachableCase(kind);
	}
}

/**
 * Deserializes a container node schema (array, map, record) from a JSON-compatible object.
 * @param serializedContainerSchema - The serialized schema to deserialize.
 * @returns The deserialized container node schema.
 */
function deserializeContainerNode(
	serializedContainerSchema: JsonCompatibleObject,
): SimpleArrayNodeSchema | SimpleMapNodeSchema | SimpleRecordNodeSchema {
	return {
		kind: serializedContainerSchema.kind as NodeKind.Array | NodeKind.Map | NodeKind.Record,
		simpleAllowedTypes: deserializeSimpleAllowedTypes(
			serializedContainerSchema.simpleAllowedTypes as JsonCompatibleObject,
		),
		persistedMetadata: undefined,
		metadata: {},
	};
}

/**
 * Deserializes a leaf node schema from a JSON-compatible object.
 * @param serializedLeafSchema - The serialized leaf node schema.
 * @returns The deserialized leaf node schema.
 */
function deserializeLeafNode(
	serializedLeafSchema: JsonCompatibleObject,
): SimpleLeafNodeSchema {
	return {
		kind: NodeKind.Leaf,
		leafKind: (serializedLeafSchema.leafKind ?? fail("Missing leafKind")) as ValueSchema,
		persistedMetadata: undefined,
		metadata: {},
	};
}

/**
 * Deserializes a object node schema from a JSON-compatible object.
 * @param serializedObjectSchema - The serialized object node schema.
 * @returns The deserialized object node schema.
 */
function deserializeObjectNode(
	serializedObjectSchema: JsonCompatibleObject,
): SimpleObjectNodeSchema {
	return {
		kind: NodeKind.Object,
		fields: deserializeObjectFields(serializedObjectSchema.fields ?? fail("Missing fields")),
		allowUnknownOptionalFields: (serializedObjectSchema.allowUnknownOptionalFields ??
			fail("Missing allowUnknownOptionalFields")) as boolean,
		persistedMetadata: undefined,
		metadata: {},
	};
}

/**
 * Deserializes a map of object fields from a JSON-compatible object.
 * @param serializedFields - The serialized fields.
 * @returns A map of the deserialized object fields.
 */
function deserializeObjectFields(
	serializedFields: JsonCompatible,
): ReadonlyMap<string, SimpleObjectFieldSchema> {
	assert(isJsonObject(serializedFields), "Expected object for serializedFields");

	const fields = new Map<string, SimpleObjectFieldSchema>();
	for (const [fieldKey, fieldSchema] of Object.entries(
		serializedFields as JsonCompatibleObject,
	)) {
		fields.set(fieldKey, deserializeObjectField(fieldSchema as JsonCompatibleObject));
	}
	return fields;
}

/**
 * Deserializes a {@link SimpleObjectFieldSchema} from a JSON-compatible object.
 * @param serializedField - The serialized field schema.
 * @returns The deserialized simple object field schema.
 */
function deserializeObjectField(
	serializedField: JsonCompatibleObject,
): SimpleObjectFieldSchema {
	const baseField = deserializeSimpleFieldSchema(serializedField);
	return {
		...baseField,
		storedKey: serializedField.storedKey as string,
	};
}

/**
 * Deserializes a {@link SimpleFieldSchema} from a JSON-compatible object.
 * @param serializedField - The serialized field schema.
 * @returns The deserialized simple field schema.
 */
function deserializeSimpleFieldSchema(
	serializedField: JsonCompatibleObject,
): SimpleFieldSchema {
	return {
		kind: serializedField.kind as FieldKind,
		simpleAllowedTypes: deserializeSimpleAllowedTypes(
			serializedField.simpleAllowedTypes as JsonCompatibleObject,
		),
		persistedMetadata: undefined,
		metadata: {},
	};
}

/**
 * Deserializes a simple allowed types map from a JSON-compatible object.
 * @param serializedAllowedTypes - The serialized simple allowed types.
 * @returns A map of the deserialized simple allowed types.
 */
function deserializeSimpleAllowedTypes(
	serializedAllowedTypes: JsonCompatible,
): ReadonlyMap<string, SimpleAllowedTypeAttributes> {
	assert(isJsonObject(serializedAllowedTypes), "Expected object for simpleAllowedTypes");
	const untypedMap = objectToMap(serializedAllowedTypes as JsonCompatibleObject);

	const simpleAllowedTypes = transformMapValues(untypedMap, (value) => {
		return {
			isStaged: (value as JsonCompatibleObject).isStaged as boolean | undefined,
		} satisfies SimpleAllowedTypeAttributes;
	});

	return simpleAllowedTypes;
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

/**
 * Transform the values of a Map using the provided transform function.
 * @param map - The map to transform.
 * @param transformValue - A method for transforming values in the map.
 * @returns A new map with the transformed values.
 */
function transformMapValues<Key, InputValue, OutputValue>(
	map: Map<Key, InputValue>,
	transformValue: (value: InputValue, key: Key) => OutputValue,
): Map<Key, OutputValue> {
	return new Map(
		Array.from(map.entries()).map(([key, value]) => [key, transformValue(value, key)]),
	);
}
