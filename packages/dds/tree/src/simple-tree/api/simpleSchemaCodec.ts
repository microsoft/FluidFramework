/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase, transformMapValues } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	DiscriminatedUnionDispatcher,
	extractJsonValidator,
	FormatValidatorNoOp,
	type FormatValidator,
} from "../../codec/index.js";
import type { ValueSchema } from "../../core/index.js";
import { objectToMap, type JsonCompatibleReadOnly } from "../../util/index.js";
import { createSchemaUpgrade, NodeKind, SchemaUpgrade } from "../core/index.js";
import type { FieldKind } from "../fieldSchema.js";
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
import * as FormatV1 from "../simpleSchemaFormatV1.js";
import * as Format from "../simpleSchemaFormatV2.js";

/**
 * Encodes the compatibility impacting subset of simple schema (view or stored) into a serializable format.
 *
 * @remarks The JSON-compatible schema returned from this method is only intended for use in snapshots/comparisons of schemas.
 * It is not possible to reconstruct a full schema (including metadata and persistedMetadata) from the encoded format.
 * @param treeSchema - The tree schema to convert.
 * @returns A serializable representation of the schema.
 *
 * @privateRemarks
 * Encodes to {@link Format.SimpleTreeSchemaFormat}.
 *
 * TODO: a simple high level API for snapshot based schema compatibility checking should replace the need to export this.
 *
 * @alpha
 */
export function encodeSchemaCompatibilitySnapshot(
	simpleSchema: SimpleTreeSchema,
): JsonCompatibleReadOnly {
	// Convert types to serializable forms
	const encodedDefinitions: Format.SimpleSchemaDefinitionsFormat = {};

	for (const [identifier, schema] of simpleSchema.definitions) {
		const encodedDefinition = encodeNodeSchema(schema);
		encodedDefinitions[identifier] = encodedDefinition;
	}

	const encodedSchema: Format.SimpleTreeSchemaFormat = {
		version: Format.SimpleSchemaFormatVersion.v2,
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
 * @privateRemarks
 * If a validator is not provided, this implicitly performs an unsafe type conversion:
 * this is something our user facing APIs generally avoid doing, and should be reconsidered before stabilizing.
 *
 * TODO: a simple high level API for snapshot based schema compatibility checking should replace the need to export this.
 *
 * @alpha
 */
export function decodeSchemaCompatibilitySnapshot(
	encodedSchema: JsonCompatibleReadOnly,
	validator?: FormatValidator,
): SimpleTreeSchema {
	const effectiveValidator = validator ?? FormatValidatorNoOp;
	const jsonValidator = extractJsonValidator(effectiveValidator);
	const formatVersion = getFormatVersion(encodedSchema);
	if (formatVersion === Format.SimpleSchemaFormatVersion.v2) {
		const currentFormatValidator = jsonValidator.compile(Format.SimpleTreeSchemaFormat);
		if (currentFormatValidator.check(encodedSchema)) {
			return decodeCurrentFormat(encodedSchema);
		}
	} else if (formatVersion === FormatV1.SimpleSchemaFormatVersion.v1) {
		const previousFormatValidator = jsonValidator.compile(FormatV1.SimpleTreeSchemaFormat);
		if (previousFormatValidator.check(encodedSchema)) {
			return decodeCurrentFormat(upgradeFormat(encodedSchema));
		}
	}

	throw new UsageError(
		"The provided simple schema is not valid according to the schema format.",
	);
}

/**
 * Gets the format version from an encoded schema, if present.
 */
function getFormatVersion(encodedSchema: JsonCompatibleReadOnly): number | undefined {
	if (
		encodedSchema !== null &&
		typeof encodedSchema === "object" &&
		!Array.isArray(encodedSchema) &&
		"version" in encodedSchema &&
		typeof encodedSchema.version === "number"
	) {
		return encodedSchema.version;
	}
	return undefined;
}

/**
 * Decodes a schema that uses the current persisted format.
 */
function decodeCurrentFormat(encodedSchema: Format.SimpleTreeSchemaFormat): SimpleTreeSchema {
	return {
		root: decodeSimpleFieldSchema(encodedSchema.root),
		definitions: new Map(
			transformMapValues(objectToMap(encodedSchema.definitions), (value, key) => {
				return decodeNodeSchema(value);
			}),
		),
	};
}

/**
 * Upgrades a version 1 schema to the current persisted format.
 */
function upgradeFormat(
	encodedSchema: FormatV1.SimpleTreeSchemaFormat,
): Format.SimpleTreeSchemaFormat {
	const definitions: Format.SimpleSchemaDefinitionsFormat = {};
	for (const [identifier, schema] of Object.entries(encodedSchema.definitions)) {
		if (schema.object === undefined) {
			definitions[identifier] = schema;
			continue;
		}

		const fieldEntries: [string, Format.SimpleFieldSchemaFormat][] = [];
		const storedKeys = new Set<string>();
		for (const field of Object.values(schema.object.fields)) {
			const { storedKey, ...fieldSchema } = field;
			if (storedKeys.has(storedKey)) {
				throw new UsageError(
					`The provided simple schema contains duplicate stored key ${JSON.stringify(storedKey)}.`,
				);
			}
			storedKeys.add(storedKey);
			fieldEntries.push([storedKey, fieldSchema]);
		}
		definitions[identifier] = {
			object: {
				...schema.object,
				fields: Object.fromEntries(fieldEntries),
			},
		};
	}

	return {
		version: Format.SimpleSchemaFormatVersion.v2,
		root: encodedSchema.root,
		definitions,
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
		case NodeKind.Leaf: {
			return { leaf: encodeLeafNode(schema) };
		}
		case NodeKind.Array: {
			return { array: encodeContainerNode(schema) };
		}
		case NodeKind.Map: {
			return { map: encodeContainerNode(schema) };
		}
		case NodeKind.Record: {
			return { record: encodeContainerNode(schema) };
		}
		case NodeKind.Object: {
			return { object: encodeObjectNode(schema) };
		}
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
		const isStaged = attributes.isStaged instanceof SchemaUpgrade ? true : attributes.isStaged;
		encodedAllowedTypes[identifier] = { isStaged };
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
	return {
		kind: schema.kind,
		fields: Object.fromEntries(
			Array.from(schema.fields.values(), (fieldSchema) => [
				fieldSchema.storedKey,
				encodeField(fieldSchema),
			]),
		),
		allowUnknownOptionalFields: schema.allowUnknownOptionalFields,
	};
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
 */
function decodeLeafNode(
	encodedLeafSchema: Format.SimpleLeafNodeSchemaFormat,
): SimpleLeafNodeSchema {
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
 */
function decodeObjectNode(
	encodedObjectSchema: Format.SimpleObjectNodeSchemaFormat,
): SimpleObjectNodeSchema {
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
 */
function decodeObjectFields(
	encodedFields: Format.SimpleObjectFieldSchemasFormat,
): ReadonlyMap<string, SimpleObjectFieldSchema> {
	const fields = new Map<string, SimpleObjectFieldSchema>();
	for (const [storedKey, fieldSchema] of Object.entries(encodedFields)) {
		fields.set(storedKey, decodeObjectField(fieldSchema, storedKey));
	}
	return fields;
}

/**
 * Decodes a {@link SimpleObjectFieldSchema} from a JSON-compatible object.
 * @param encodedField - The encoded field schema.
 * @returns The decoded simple object field schema.
 */
function decodeObjectField(
	encodedField: Format.SimpleFieldSchemaFormat,
	storedKey: string,
): SimpleObjectFieldSchema {
	const baseField = decodeSimpleFieldSchema(encodedField);
	return {
		...baseField,
		storedKey,
	};
}

/**
 * Decodes a {@link SimpleFieldSchema} from a JSON-compatible object.
 * @param encodedField - The encoded field schema.
 * @returns The decoded simple field schema.
 */
function decodeSimpleFieldSchema(
	encodedField: Format.SimpleFieldSchemaFormat,
): SimpleFieldSchema {
	return {
		kind: encodedField.kind as FieldKind,
		simpleAllowedTypes: decodeSimpleAllowedTypes(encodedField.simpleAllowedTypes),
		// We cannot encode persistedMetadata or metadata, so we explicitly set them to empty values when decoding.
		persistedMetadata: undefined,
		metadata: {},
	};
}

/**
 * Decodes a simple allowed types map from a JSON-compatible object.
 * @param encodedAllowedTypes - The encoded simple allowed types.
 * @returns A map of the decoded simple allowed types.
 */
function decodeSimpleAllowedTypes(
	encodedAllowedTypes: Format.SimpleAllowedTypesFormat,
): ReadonlyMap<string, SimpleAllowedTypeAttributes> {
	const untypedMap = objectToMap(encodedAllowedTypes);

	const simpleAllowedTypes = transformMapValues(
		untypedMap,
		(value): SimpleAllowedTypeAttributes => {
			const isStaged = value.isStaged === true ? createSchemaUpgrade() : value.isStaged;
			return { isStaged };
		},
	);

	return simpleAllowedTypes;
}
