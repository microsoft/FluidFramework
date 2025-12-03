/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import { normalizeFieldSchema, type ImplicitFieldSchema } from "../fieldSchema.js";
import type {
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
import {
	ArrayNodeSchema,
	MapNodeSchema,
	ObjectNodeSchema,
	RecordNodeSchema,
} from "../node-kinds/index.js";
import { walkFieldSchema } from "../walkFieldSchema.js";
import { LeafNodeSchema } from "../leafNodeSchema.js";

/**
 * Converts an {@link ImplicitFieldSchema} to a "simple" schema representation.
 *
 * @param schema - The schema to convert
 * @param copySchemaObjects - If true, TreeNodeSchema and FieldSchema are copied into plain JavaScript objects. Either way, custom metadata is referenced and not copied.
 *
 * @remarks
 * Given that the Schema types used in {@link ImplicitFieldSchema} already implement the {@link SimpleNodeSchema} interfaces, there are limited use-cases for this function.
 * One possible use-case is converting schema to a more serialization friendly format.
 * This format however is not JSON compatible due to use of Maps and Sets,
 * but it it does not rely on cyclic object references for handling recursive schema and instead uses the `definitions` map.
 *
 * @privateRemarks
 * TODO: once SimpleTreeSchema is stable, {@link TreeViewConfiguration} could implement {@link SimpleTreeSchema} directly.
 * That would provide the non-copying alternative that could expose the value type of the definitions map as {@link TreeNodeSchema}.
 */
export function toSimpleTreeSchema(
	schema: ImplicitFieldSchema,
	copySchemaObjects: boolean,
): SimpleTreeSchema {
	const normalizedSchema = normalizeFieldSchema(schema);
	const definitions = new Map<string, SimpleNodeSchema>();
	walkFieldSchema(normalizedSchema, {
		node: (nodeSchema) => {
			// The set of node kinds is extensible, but the typing of SimpleNodeSchema is not, so we need to check that the schema is one of the known kinds.
			assert(
				nodeSchema instanceof ArrayNodeSchema ||
					nodeSchema instanceof MapNodeSchema ||
					nodeSchema instanceof LeafNodeSchema ||
					nodeSchema instanceof ObjectNodeSchema ||
					nodeSchema instanceof RecordNodeSchema,
				0xb60 /* Invalid schema */,
			);
			const outSchema = copySchemaObjects ? copySimpleNodeSchema(nodeSchema) : nodeSchema;
			definitions.set(nodeSchema.identifier, outSchema);
		},
	});

	return {
		root: copySchemaObjects
			? ({
					simpleAllowedTypes: normalizedSchema.simpleAllowedTypes,
					kind: normalizedSchema.kind,
					metadata: normalizedSchema.metadata,
					persistedMetadata: normalizedSchema.persistedMetadata,
				} satisfies SimpleFieldSchema)
			: normalizedSchema,
		definitions,
	};
}

/**
 * Copies a {@link SimpleNodeSchema} into a new plain JavaScript object.
 *
 * @remarks Caches the result on the input schema for future calls.
 */
export function copySimpleNodeSchema(schema: SimpleNodeSchema): SimpleNodeSchema {
	const kind = schema.kind;
	switch (kind) {
		case NodeKind.Leaf:
			return copySimpleLeafSchema(schema);
		case NodeKind.Array:
		case NodeKind.Map:
		case NodeKind.Record:
			return copySimpleSchemaWithAllowedTypes(schema);
		case NodeKind.Object:
			return copySimpleObjectSchema(schema);
		default:
			unreachableCase(kind);
	}
}

function copySimpleLeafSchema(schema: SimpleLeafNodeSchema): SimpleLeafNodeSchema {
	return {
		kind: NodeKind.Leaf,
		leafKind: schema.leafKind,
		metadata: schema.metadata,
		persistedMetadata: schema.persistedMetadata,
	};
}

function copySimpleSchemaWithAllowedTypes(
	schema: SimpleMapNodeSchema | SimpleArrayNodeSchema | SimpleRecordNodeSchema,
): SimpleMapNodeSchema | SimpleArrayNodeSchema | SimpleRecordNodeSchema {
	return {
		kind: schema.kind,
		simpleAllowedTypes: schema.simpleAllowedTypes,
		metadata: schema.metadata,
		persistedMetadata: schema.persistedMetadata,
	};
}

function copySimpleObjectSchema(schema: SimpleObjectNodeSchema): SimpleObjectNodeSchema {
	const fields: Map<string, SimpleObjectFieldSchema> = new Map();
	for (const [propertyKey, field] of schema.fields) {
		// field already is a SimpleObjectFieldSchema, but copy the subset of the properties needed by this interface to get a clean simple object.
		const simpleField = {
			kind: field.kind,
			simpleAllowedTypes: field.simpleAllowedTypes,
			metadata: field.metadata,
			persistedMetadata: field.persistedMetadata,
			storedKey: field.storedKey,
		};

		fields.set(propertyKey, simpleField);
	}

	const simpleObject = {
		kind: NodeKind.Object,
		fields,
		metadata: schema.metadata,
		persistedMetadata: schema.persistedMetadata,
		allowUnknownOptionalFields: schema.allowUnknownOptionalFields,
	} satisfies SimpleObjectNodeSchema;

	return simpleObject;
}

/**
 * Creates a copy of a SimpleTreeSchema without metadata fields. This is useful for comparing deserialized view schemas with in-memory schemas.
 * metadata and persistedMetadata are not relevant for schema compatibility checks and are not serialized by the Simple Schema serializer.
 * @see {@link simpleSchemaSerializer.ts} for the serialization logic.
 *
 * @param schema - The SimpleTreeSchema to remove fields from.
 * @param fieldsToRemove - An object specifying which fields to remove.
 * @returns A new SimpleTreeSchema without the specified fields.
 */
export function copySimpleTreeSchemaWithoutMetadata(
	schema: SimpleTreeSchema,
): SimpleTreeSchema {
	const definitions = new Map<string, SimpleNodeSchema>();

	for (const [identifier, nodeSchema] of schema.definitions.entries()) {
		const kind = nodeSchema.kind;
		switch (kind) {
			case NodeKind.Array:
			case NodeKind.Map:
			case NodeKind.Record:
			case NodeKind.Leaf: {
				const outputNodeSchema = {
					...nodeSchema,
					metadata: {},
					persistedMetadata: undefined,
				};
				definitions.set(identifier, outputNodeSchema);
				break;
			}
			case NodeKind.Object: {
				const outputFields = new Map<string, SimpleObjectFieldSchema>();
				for (const [propertyKey, fieldSchema] of nodeSchema.fields.entries()) {
					const outputField: SimpleObjectFieldSchema = {
						...fieldSchema,
						metadata: {},
						persistedMetadata: undefined,
					};
					outputFields.set(propertyKey, outputField);
				}
				const outputNodeSchema = {
					...nodeSchema,
					metadata: {},
					persistedMetadata: undefined,
					fields: outputFields,
				};
				definitions.set(identifier, outputNodeSchema);
				break;
			}
			default:
				unreachableCase(kind);
		}
	}

	return {
		root: {
			kind: schema.root.kind,
			simpleAllowedTypes: schema.root.simpleAllowedTypes,
			metadata: {},
			persistedMetadata: undefined,
		},
		definitions,
	};
}
