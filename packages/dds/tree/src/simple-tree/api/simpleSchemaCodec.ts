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
import { unreachableCase, transformMapValues } from "@fluidframework/core-utils/internal";
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
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import * as Format from "../simpleSchemaFormatV1.js";
import {
	DiscriminatedUnionDispatcher,
	extractJsonValidator,
	FormatValidatorNoOp,
	type FormatValidator,
} from "../../codec/index.js";

/**
 * Encodes a simple schema (view or stored) into a serializable format.
 * @remarks The JSON-compatible schema returned from this method is only intended for use in snapshots/comparisons of schemas.
 * It is not possible to reconstruct a full schema (including metadata and persistedMetadata) from the encoded format.
 * @param treeSchema - The tree schema to convert.
 * @returns A serializable representation of the schema.
 *
 * @alpha
 */
export function encodeSimpleSchema(simpleSchema: SimpleTreeSchema): JsonCompatibleObject {
	// Convert types to serializable forms
	const encodedDefinitions: Format.SimpleSchemaDefinitionsFormat = {};

	for (const [identifier, schema] of simpleSchema.definitions) {
		const encodedDefinition = encodeNodeSchema(schema);
		encodedDefinitions[identifier] = encodedDefinition;
	}

	const encodedSchema: Format.SimpleTreeSchemaFormat = {
		version: Format.SimpleSchemaFormatVersion.v1,
		root: encodeField(simpleSchema.root),
		definitions: encodedDefinitions,
	};

	return encodedSchema;
}

/**
 * Decodes a JSON-compatible schema into a simple schema.
 * @param encodedSchema - The encoded schema to decode.
 * @param validator - The format validator to use to validate the encoded schema.
 * @returns A decoded simple schema.
 * @throws Will throw a usage error if the encoded schema is not in the expected format.
 *
 * @alpha
 */
export function decodeSimpleSchema(
	encodedSchema: JsonCompatibleObject,
	validator?: FormatValidator,
): SimpleTreeSchema {
	const effectiveValidator = validator ?? FormatValidatorNoOp;
	const compiledValidator = extractJsonValidator(effectiveValidator).compile(
		Format.SimpleTreeSchemaFormat,
	);
	if (!compiledValidator.check(encodedSchema)) {
		throw new UsageError(
			"The provided simple schema is not valid according to the schema format.",
		);
	}

	return {
		root: decodeSimpleFieldSchema(encodedSchema.root),
		definitions: new Map(
			transformMapValues(objectToMap(encodedSchema.definitions), (value, key) => {
				if (value === undefined || !isJsonObject(value)) {
					throw new UsageError(`Expected node schema for definition ${key}`);
				}
				return decodeNodeSchema(value);
			}),
		),
	};
}

/**
 * Encodes a node schema to a serializable object.
 * @param schema - The node schema to convert.
 * @returns A serializable representation of the node schema.
 */
function encodeNodeSchema(schema: SimpleNodeSchema): Format.SimpleNodeSchemaUnionFormat {
	const kind = schema.kind;
	switch (kind) {
		case NodeKind.Leaf:
			return { leaf: encodeLeafNode(schema) };
		case NodeKind.Array:
			return { array: encodeContainerNode(schema) };
		case NodeKind.Map:
			return { map: encodeContainerNode(schema) };
		case NodeKind.Record:
			return { record: encodeContainerNode(schema) };
		case NodeKind.Object:
			return { object: encodeObjectNode(schema) };
		default: {
			unreachableCase(kind);
		}
	}
}

/**
 * Encodes a leaf node schema to a serializable object.
 * @param schema - The leaf node schema to convert.
 * @returns A serializable representation of the leaf node schema.
 */
function encodeLeafNode(schema: SimpleLeafNodeSchema): Format.SimpleLeafNodeSchemaFormat {
	return {
		kind: schema.kind,
		leafKind: schema.leafKind,
	};
}

/**
 * Encodes a container node schema (a simple schema that is a Map, Array, or Record) to a serializable object.
 * @param schema - The container node schema to convert.
 * @returns A serializable representation of the container node schema. Includes the `kind` for disambiguation between different
 * container kinds.
 */
function encodeContainerNode(
	schema: SimpleArrayNodeSchema | SimpleMapNodeSchema | SimpleRecordNodeSchema,
):
	| Format.SimpleArrayNodeSchemaFormat
	| Format.SimpleMapNodeSchemaFormat
	| Format.SimpleRecordNodeSchemaFormat {
	return {
		kind: schema.kind,
		simpleAllowedTypes: encodeSimpleAllowedTypes(schema.simpleAllowedTypes),
	};
}

/**
 * Encodes a simple allowed types map to a serializable object. Needed because JSON serialization does not support Maps.
 * @param simpleAllowedTypes - The simple allowed types map to convert.
 * @returns A serializable representation of the simple allowed types.
 */
function encodeSimpleAllowedTypes(
	simpleAllowedTypes: ReadonlyMap<string, SimpleAllowedTypeAttributes>,
): Format.SimpleAllowedTypesFormat {
	const encodedAllowedTypes: Format.SimpleAllowedTypesFormat = {};
	for (const [identifier, attributes] of simpleAllowedTypes) {
		encodedAllowedTypes[identifier] = {
			isStaged: attributes.isStaged,
		};
	}
	return encodedAllowedTypes;
}

/**
 * Encodes an object node schema to a serializable object.
 * @param schema - The object node schema to convert.
 * @returns A serializable representation of the object node schema.
 */
function encodeObjectNode(
	schema: SimpleObjectNodeSchema,
): Format.SimpleObjectNodeSchemaFormat {
	const encodedFields: Format.SimpleObjectFieldSchemasFormat = {};
	for (const [fieldKey, fieldSchema] of schema.fields) {
		encodedFields[fieldKey] = encodeObjectField(fieldSchema);
	}

	return {
		kind: schema.kind,
		fields: encodedFields,
		allowUnknownOptionalFields: schema.allowUnknownOptionalFields,
	};
}

/**
 * Encodes an object field schema to a serializable object.
 * @param fieldSchema - The object field schema to convert.
 * @returns A serializable representation of the object field schema.
 */
function encodeObjectField(
	fieldSchema: SimpleObjectFieldSchema,
): Format.SimpleObjectFieldSchemaFormat {
	const encodedField = encodeField(fieldSchema);
	return { ...encodedField, storedKey: fieldSchema.storedKey };
}

/**
 * Encodes a field schema to a serializable object.
 * @param fieldSchema - The field schema to convert.
 * @returns A serializable representation of the field schema.
 */
function encodeField(fieldSchema: SimpleFieldSchema): Format.SimpleFieldSchemaFormat {
	return {
		kind: fieldSchema.kind,
		simpleAllowedTypes: encodeSimpleAllowedTypes(fieldSchema.simpleAllowedTypes),
	};
}

const decodeNodeSchemaDispatcher: DiscriminatedUnionDispatcher<
	Format.SimpleNodeSchemaUnionFormat,
	[],
	| SimpleLeafNodeSchema
	| SimpleArrayNodeSchema
	| SimpleMapNodeSchema
	| SimpleRecordNodeSchema
	| SimpleObjectNodeSchema
> = new DiscriminatedUnionDispatcher({
	leaf: decodeLeafNode,
	array: decodeContainerNode,
	map: decodeContainerNode,
	record: decodeContainerNode,
	object: decodeObjectNode,
});

/**
 * Decodes a node schema from a JSON-compatible object.
 * @param encodedNodeSchema - The encoded node schema to decode.
 * @returns The decoded node schema.
 */
function decodeNodeSchema(
	encodedNodeSchema: Format.SimpleNodeSchemaUnionFormat,
):
	| SimpleLeafNodeSchema
	| SimpleArrayNodeSchema
	| SimpleMapNodeSchema
	| SimpleRecordNodeSchema
	| SimpleObjectNodeSchema {
	return decodeNodeSchemaDispatcher.dispatch(encodedNodeSchema);
}

/**
 * Decodes a container node schema (array, map, record) from a JSON-compatible object.
 * @param encodedContainerSchema - The encoded schema to decode.
 * @returns The decoded container node schema.
 */
function decodeContainerNode(
	encodedContainerSchema:
		| Format.SimpleArrayNodeSchemaFormat
		| Format.SimpleMapNodeSchemaFormat
		| Format.SimpleRecordNodeSchemaFormat,
): SimpleArrayNodeSchema | SimpleMapNodeSchema | SimpleRecordNodeSchema {
	return {
		kind: encodedContainerSchema.kind as NodeKind.Array | NodeKind.Map | NodeKind.Record,
		simpleAllowedTypes: decodeSimpleAllowedTypes(encodedContainerSchema.simpleAllowedTypes),
		// We cannot encode persistedMetadata or metadata, so we explicitly set them to empty values.
		persistedMetadata: undefined,
		metadata: {},
	};
}

/**
 * Decodes a leaf node schema from a JSON-compatible object.
 * @param encodedLeafSchema - The encoded leaf node schema.
 * @returns The decoded leaf node schema.
 * @throws Will throw a usage error if the encoded leaf schema is not in the expected format.
 */
function decodeLeafNode(
	encodedLeafSchema: Format.SimpleLeafNodeSchemaFormat,
): SimpleLeafNodeSchema {
	if (encodedLeafSchema.leafKind === undefined) {
		throw new UsageError("Expected leafKind for leaf node schema");
	}

	return {
		kind: NodeKind.Leaf,
		leafKind: encodedLeafSchema.leafKind as ValueSchema,
		// We cannot encode persistedMetadata or metadata, so we explicitly set them to empty values.
		persistedMetadata: undefined,
		metadata: {},
	};
}

/**
 * Decodes a object node schema from a JSON-compatible object.
 * @param encodedObjectSchema - The encoded object node schema.
 * @returns The decoded object node schema.
 * @throws Will throw a usage error if the encoded object schema is not in the expected format.
 */
function decodeObjectNode(
	encodedObjectSchema: Format.SimpleObjectNodeSchemaFormat,
): SimpleObjectNodeSchema {
	if (encodedObjectSchema.fields === undefined) {
		throw new UsageError("Expected fields for object node schema");
	}

	return {
		kind: NodeKind.Object,
		fields: decodeObjectFields(encodedObjectSchema.fields),
		// It is possible for allowUnknownOptionalFields to be undefined. This happens when serializing a Simple Schema derived
		// from a stored schema.
		allowUnknownOptionalFields: encodedObjectSchema.allowUnknownOptionalFields,
		// We cannot encode persistedMetadata or metadata, so we explicitly set them to empty values when decoding.
		persistedMetadata: undefined,
		metadata: {},
	};
}

/**
 * Decodes a map of object fields from a JSON-compatible object.
 * @param encodedFields - The encoded fields.
 * @returns A map of the decoded object fields.
 * @throws Will throw a usage error if the encoded fields are not in the expected format.
 */
function decodeObjectFields(
	encodedFields: Format.SimpleObjectFieldSchemasFormat,
): ReadonlyMap<string, SimpleObjectFieldSchema> {
	if (!isJsonObject(encodedFields)) {
		throw new UsageError("Expected object for encodedFields");
	}

	const fields = new Map<string, SimpleObjectFieldSchema>();
	for (const [fieldKey, fieldSchema] of Object.entries(
		encodedFields as JsonCompatibleObject,
	)) {
		fields.set(fieldKey, decodeObjectField(fieldSchema as JsonCompatibleObject));
	}
	return fields;
}

/**
 * Decodes a {@link SimpleObjectFieldSchema} from a JSON-compatible object.
 * @param encodedField - The encoded field schema.
 * @returns The decoded simple object field schema.
 */
function decodeObjectField(encodedField: JsonCompatibleObject): SimpleObjectFieldSchema {
	const baseField = decodeSimpleFieldSchema(encodedField);
	return {
		...baseField,
		storedKey: encodedField.storedKey as string,
	};
}

/**
 * Decodes a {@link SimpleFieldSchema} from a JSON-compatible object.
 * @param encodedField - The encoded field schema.
 * @returns The decoded simple field schema.
 */
function decodeSimpleFieldSchema(encodedField: JsonCompatibleObject): SimpleFieldSchema {
	return {
		kind: encodedField.kind as FieldKind,
		simpleAllowedTypes: decodeSimpleAllowedTypes(
			encodedField.simpleAllowedTypes as JsonCompatibleObject,
		),
		// We cannot encode persistedMetadata or metadata, so we explicitly set them to empty values when decoding.
		persistedMetadata: undefined,
		metadata: {},
	};
}

/**
 * Decodes a simple allowed types map from a JSON-compatible object.
 * @param encodedAllowedTypes - The encoded simple allowed types.
 * @returns A map of the decoded simple allowed types.
 * @throws Will throw a usage error if the encoded allowed types are not in the expected format.
 */
function decodeSimpleAllowedTypes(
	encodedAllowedTypes: JsonCompatible,
): ReadonlyMap<string, SimpleAllowedTypeAttributes> {
	if (!isJsonObject(encodedAllowedTypes)) {
		throw new UsageError("Expected object for encodedAllowedTypes");
	}
	const untypedMap = objectToMap(encodedAllowedTypes as JsonCompatibleObject);

	const simpleAllowedTypes = transformMapValues(untypedMap, (value) => {
		return {
			isStaged: (value as JsonCompatibleObject).isStaged as boolean | undefined,
		} satisfies SimpleAllowedTypeAttributes;
	});

	return simpleAllowedTypes;
}
