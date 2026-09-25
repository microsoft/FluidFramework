/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase, transformMapValues } from "@fluidframework/core-utils/internal";
import type { OldestSupportedClientVersion } from "@fluidframework/runtime-definitions/internal";
import { lowestMinVersionForCollab } from "@fluidframework/runtime-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	currentVersion,
	DiscriminatedUnionDispatcher,
	FormatValidatorNoOp,
	type FormatValidator,
	VersionDispatchingCodecBuilder,
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
import * as FormatV2 from "../simpleSchemaFormatV2.js";

const simpleSchemaFormatV2MinVersion = "3.2.0" satisfies OldestSupportedClientVersion;

const simpleSchemaCodecBuilder = VersionDispatchingCodecBuilder.build(
	"SimpleSchemaCompatibilitySnapshot",
	[
		{
			minVersionForCollab: lowestMinVersionForCollab,
			formatVersion: FormatV1.SimpleSchemaFormatVersion.v1,
			codec: {
				encode: encodeSchemaV1,
				decode: (data: FormatV1.SimpleTreeSchemaFormat) => decodeSchema(upgradeFormat(data)),
				schema: FormatV1.SimpleTreeSchemaFormat,
			},
		},
		{
			minVersionForCollab: simpleSchemaFormatV2MinVersion,
			formatVersion: FormatV2.SimpleSchemaFormatVersion.v2,
			codec: {
				encode: encodeSchemaV2,
				decode: decodeSchema,
				schema: FormatV2.SimpleTreeSchemaFormat,
			},
		},
	],
);

/**
 * Encodes the compatibility impacting subset of simple schema (view or stored) into a serializable format.
 *
 * @remarks The JSON-compatible schema returned from this method is only intended for use in snapshots/comparisons of schemas.
 * It is not possible to reconstruct a full schema (including metadata and persistedMetadata) from the encoded format.
 * @param simpleSchema - The tree schema to convert.
 * @param oldestSupportedClientVersion - The oldest Fluid Framework client version that must be able to read the snapshot.
 * Defaults to the current Fluid Framework version.
 * @returns A serializable representation of the schema.
 *
 * @privateRemarks
 * Encodes to the newest supported simple schema format for the requested client version.
 *
 * TODO: a simple high level API for snapshot based schema compatibility checking should replace the need to export this.
 *
 * @alpha
 */
export function encodeSchemaCompatibilitySnapshot(
	simpleSchema: SimpleTreeSchema,
	oldestSupportedClientVersion: OldestSupportedClientVersion = currentVersion,
): JsonCompatibleReadOnly {
	const codec = simpleSchemaCodecBuilder.build({
		minVersionForCollab: oldestSupportedClientVersion,
		jsonValidator: FormatValidatorNoOp,
	});
	return codec.encode(simpleSchema, undefined);
}

function encodeSchemaV1(simpleSchema: SimpleTreeSchema): FormatV1.SimpleTreeSchemaFormat {
	const encodedDefinitions: FormatV1.SimpleSchemaDefinitionsFormat = {};
	for (const [identifier, schema] of simpleSchema.definitions) {
		encodedDefinitions[identifier] = encodeNodeSchemaV1(schema);
	}

	return {
		version: FormatV1.SimpleSchemaFormatVersion.v1,
		root: encodeFieldV1(simpleSchema.root),
		definitions: encodedDefinitions,
	};
}

function encodeSchemaV2(simpleSchema: SimpleTreeSchema): FormatV2.SimpleTreeSchemaFormat {
	const encodedDefinitions: FormatV2.SimpleSchemaDefinitionsFormat = {};
	for (const [identifier, schema] of simpleSchema.definitions) {
		encodedDefinitions[identifier] = encodeNodeSchemaV2(schema);
	}

	return {
		version: FormatV2.SimpleSchemaFormatVersion.v2,
		root: encodeFieldV2(simpleSchema.root),
		definitions: encodedDefinitions,
	};
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
	const codec = simpleSchemaCodecBuilder.buildDecoder({
		jsonValidator: validator ?? FormatValidatorNoOp,
	});
	return codec.decode(encodedSchema, undefined);
}

/**
 * Decodes a schema that uses the current persisted format.
 */
function decodeSchema(encodedSchema: FormatV2.SimpleTreeSchemaFormat): SimpleTreeSchema {
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
): FormatV2.SimpleTreeSchemaFormat {
	const definitions: FormatV2.SimpleSchemaDefinitionsFormat = {};
	for (const [identifier, schema] of Object.entries(encodedSchema.definitions)) {
		if (schema.object === undefined) {
			definitions[identifier] = schema;
			continue;
		}

		const fields: FormatV2.SimpleObjectFieldSchemasFormat = {};
		const storedKeys = new Set<string>();
		for (const field of Object.values(schema.object.fields)) {
			const { storedKey, ...fieldSchema } = field;
			if (storedKeys.has(storedKey)) {
				throw new UsageError(
					`The provided simple schema contains duplicate stored key ${JSON.stringify(storedKey)}.`,
				);
			}
			storedKeys.add(storedKey);
			fields[storedKey] = fieldSchema;
		}
		definitions[identifier] = {
			object: {
				...schema.object,
				fields,
			},
		};
	}

	return {
		version: FormatV2.SimpleSchemaFormatVersion.v2,
		root: encodedSchema.root,
		definitions,
	};
}

/**
 * Encodes a node schema to a serializable object.
 * @param schema - The node schema to convert.
 * @returns A serializable representation of the node schema.
 */
function encodeNodeSchemaV1(schema: SimpleNodeSchema): FormatV1.SimpleNodeSchemaUnionFormat {
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
			return { object: encodeObjectNodeV1(schema) };
		}
		default: {
			unreachableCase(kind);
		}
	}
}

function encodeNodeSchemaV2(schema: SimpleNodeSchema): FormatV2.SimpleNodeSchemaUnionFormat {
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
			return { object: encodeObjectNodeV2(schema) };
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
function encodeLeafNode(schema: SimpleLeafNodeSchema): FormatV1.SimpleLeafNodeSchemaFormat {
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
	| FormatV1.SimpleArrayNodeSchemaFormat
	| FormatV1.SimpleMapNodeSchemaFormat
	| FormatV1.SimpleRecordNodeSchemaFormat {
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
): FormatV1.SimpleAllowedTypesFormat {
	const encodedAllowedTypes: FormatV1.SimpleAllowedTypesFormat = {};
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
function encodeObjectNodeV1(
	schema: SimpleObjectNodeSchema,
): FormatV1.SimpleObjectNodeSchemaFormat {
	const encodedFields: FormatV1.SimpleObjectFieldSchemasFormat = {};
	for (const [propertyKey, fieldSchema] of schema.fields) {
		encodedFields[propertyKey] = {
			...encodeFieldV1(fieldSchema),
			storedKey: fieldSchema.storedKey,
		};
	}

	return {
		kind: schema.kind,
		fields: encodedFields,
		allowUnknownOptionalFields: schema.allowUnknownOptionalFields,
	};
}

/**
 * Encodes an object node schema using stored keys.
 */
function encodeObjectNodeV2(
	schema: SimpleObjectNodeSchema,
): FormatV2.SimpleObjectNodeSchemaFormat {
	const encodedFields: FormatV2.SimpleObjectFieldSchemasFormat = {};
	for (const fieldSchema of schema.fields.values()) {
		// Property keys are view-schema metadata, so this intentionally preserves only the stored key.
		encodedFields[fieldSchema.storedKey] = encodeFieldV2(fieldSchema);
	}

	return {
		kind: schema.kind,
		fields: encodedFields,
		allowUnknownOptionalFields: schema.allowUnknownOptionalFields,
	};
}

function encodeFieldV1(fieldSchema: SimpleFieldSchema): FormatV1.SimpleFieldSchemaFormat {
	if (fieldSchema.isStagedOptional !== undefined && fieldSchema.isStagedOptional !== false) {
		throw new UsageError(
			`Staged optional fields require oldestSupportedClientVersion to be at least ${simpleSchemaFormatV2MinVersion}.`,
		);
	}
	return {
		kind: fieldSchema.kind,
		simpleAllowedTypes: encodeSimpleAllowedTypes(fieldSchema.simpleAllowedTypes),
	};
}

function encodeFieldV2(fieldSchema: SimpleFieldSchema): FormatV2.SimpleFieldSchemaFormat {
	const isStagedOptional =
		fieldSchema.isStagedOptional !== undefined && fieldSchema.isStagedOptional !== false;
	return {
		kind: fieldSchema.kind,
		simpleAllowedTypes: encodeSimpleAllowedTypes(fieldSchema.simpleAllowedTypes),
		...(isStagedOptional ? { isStagedOptional: true } : {}),
	};
}

const decodeNodeSchemaDispatcher: DiscriminatedUnionDispatcher<
	FormatV2.SimpleNodeSchemaUnionFormat,
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
	encodedNodeSchema: FormatV2.SimpleNodeSchemaUnionFormat,
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
		| FormatV1.SimpleArrayNodeSchemaFormat
		| FormatV1.SimpleMapNodeSchemaFormat
		| FormatV1.SimpleRecordNodeSchemaFormat,
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
	encodedLeafSchema: FormatV1.SimpleLeafNodeSchemaFormat,
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
	encodedObjectSchema: FormatV2.SimpleObjectNodeSchemaFormat,
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
	encodedFields: FormatV2.SimpleObjectFieldSchemasFormat,
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
	encodedField: FormatV2.SimpleFieldSchemaFormat,
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
	encodedField: FormatV2.SimpleFieldSchemaFormat,
): SimpleFieldSchema {
	const isStagedOptional =
		encodedField.isStagedOptional === true ? createSchemaUpgrade() : undefined;
	return {
		kind: encodedField.kind as FieldKind,
		simpleAllowedTypes: decodeSimpleAllowedTypes(encodedField.simpleAllowedTypes),
		...(isStagedOptional === undefined ? {} : { isStagedOptional }),
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
	encodedAllowedTypes: FormatV1.SimpleAllowedTypesFormat,
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
