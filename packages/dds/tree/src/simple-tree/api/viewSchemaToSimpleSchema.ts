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
			const outSchema = copySchemaObjects
				? copySimpleNodeSchema(nodeSchema, SimpleSchemaCopyMode.SimpleSchema)
				: nodeSchema;
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

// TODO: Remove?
/**
 * Specifies which fields are included when copying a Simple Schema.
 */
export enum SimpleSchemaCopyMode {
	// TODO: Rename
	SimpleSchema,
	ViewCompatibilitySchema,
}

/**
 * Copies a {@link SimpleNodeSchema} into a new plain JavaScript object.
 *
 * @remarks Caches the result on the input schema for future calls.
 */
export function copySimpleNodeSchema(
	schema: SimpleNodeSchema,
	copyMode: SimpleSchemaCopyMode,
): SimpleNodeSchema {
	const kind = schema.kind;
	switch (kind) {
		case NodeKind.Leaf:
			return copySimpleLeafSchema(schema, copyMode);
		case NodeKind.Array:
		case NodeKind.Map:
		case NodeKind.Record:
			return copySimpleSchemaWithAllowedTypes(schema, copyMode);
		case NodeKind.Object:
			return copySimpleObjectSchema(schema, copyMode);
		default:
			unreachableCase(kind);
	}
}

function copySimpleLeafSchema(
	schema: SimpleLeafNodeSchema,
	copyMode: SimpleSchemaCopyMode,
): SimpleLeafNodeSchema {
	switch (copyMode) {
		case SimpleSchemaCopyMode.SimpleSchema:
			return {
				kind: NodeKind.Leaf,
				leafKind: schema.leafKind,
				metadata: schema.metadata,
				persistedMetadata: schema.persistedMetadata,
			};
		case SimpleSchemaCopyMode.ViewCompatibilitySchema:
			return {
				kind: NodeKind.Leaf,
				leafKind: schema.leafKind,
				// Don't include metadata or persistedMetadata in view compatibility schema.
				metadata: {},
				persistedMetadata: undefined,
			};
		default:
			unreachableCase(copyMode);
	}
}

function copySimpleSchemaWithAllowedTypes(
	schema: SimpleMapNodeSchema | SimpleArrayNodeSchema | SimpleRecordNodeSchema,
	copyMode: SimpleSchemaCopyMode,
): SimpleMapNodeSchema | SimpleArrayNodeSchema | SimpleRecordNodeSchema {
	switch (copyMode) {
		case SimpleSchemaCopyMode.SimpleSchema:
			return {
				kind: schema.kind,
				simpleAllowedTypes: schema.simpleAllowedTypes,
				metadata: schema.metadata,
				persistedMetadata: schema.persistedMetadata,
			};
		case SimpleSchemaCopyMode.ViewCompatibilitySchema:
			return {
				kind: schema.kind,
				simpleAllowedTypes: schema.simpleAllowedTypes,
				// Don't include metadata or persistedMetadata in view compatibility schema.
				metadata: {},
				persistedMetadata: undefined,
			};
		default:
			unreachableCase(copyMode);
	}
}

function copySimpleObjectSchema(
	schema: SimpleObjectNodeSchema,
	copyMode: SimpleSchemaCopyMode,
): SimpleObjectNodeSchema {
	const fields: Map<string, SimpleObjectFieldSchema> = new Map();
	for (const [propertyKey, field] of schema.fields) {
		// field already is a SimpleObjectFieldSchema, but copy the subset of the properties needed by this interface to get a clean simple object.
		let simpleField: SimpleObjectFieldSchema;

		switch (copyMode) {
			case SimpleSchemaCopyMode.SimpleSchema:
				simpleField = {
					kind: field.kind,
					simpleAllowedTypes: field.simpleAllowedTypes,
					metadata: field.metadata,
					persistedMetadata: field.persistedMetadata,
					storedKey: field.storedKey,
				};
				break;

			case SimpleSchemaCopyMode.ViewCompatibilitySchema:
				simpleField = {
					kind: field.kind,
					simpleAllowedTypes: field.simpleAllowedTypes,
					// Don't include metadata or persistedMetadata in view compatibility schema.
					metadata: {},
					persistedMetadata: undefined,
					storedKey: field.storedKey,
				};
				break;

			default:
				unreachableCase(copyMode);
		}

		fields.set(propertyKey, simpleField);
	}

	let simpleObject: SimpleObjectNodeSchema;

	switch (copyMode) {
		case SimpleSchemaCopyMode.SimpleSchema:
			simpleObject = {
				kind: NodeKind.Object,
				fields,
				metadata: schema.metadata,
				persistedMetadata: schema.persistedMetadata,
			};
			break;

		case SimpleSchemaCopyMode.ViewCompatibilitySchema:
			simpleObject = {
				kind: NodeKind.Object,
				fields,
				// Don't include metadata or persistedMetadata in view compatibility schema.
				metadata: {},
				persistedMetadata: undefined,
				allowUnknownOptionalFields: schema.allowUnknownOptionalFields,
			};
			break;

		default:
			unreachableCase(copyMode);
	}

	return simpleObject;
}
