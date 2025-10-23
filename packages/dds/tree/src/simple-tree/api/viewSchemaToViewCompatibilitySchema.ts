/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import { NodeKind } from "../core/index.js";
import type {
	SimpleArrayNodeSchema,
	SimpleLeafNodeSchema,
	SimpleMapNodeSchema,
	SimpleNodeSchema,
	SimpleObjectFieldSchema,
	SimpleObjectNodeSchema,
	SimpleRecordNodeSchema,
	SimpleTreeSchema,
} from "../simpleSchema.js";
import type { TreeSchema } from "./configuration.js";
import { LeafNodeSchema } from "../leafNodeSchema.js";
import {
	ArrayNodeSchema,
	MapNodeSchema,
	ObjectNodeSchema,
	RecordNodeSchema,
} from "../node-kinds/index.js";

/**
 * Convert a stored schema to a SimpleSchema and preserve information needed for compatibility testing.
 *
 * @param schema - The stored schema to convert.
 * @param copySchemaObjects - If true, copies the contents of the schema into new objects.
 * @returns The converted SimpleTreeSchema.
 *
 * @alpha
 */
export function toViewCompatibilityTreeSchema(
	schema: TreeSchema,
	copySchemaObjects: boolean,
): SimpleTreeSchema {
	const definitions = new Map<string, SimpleNodeSchema>();

	// Walk the node definitions and convert them one by one. Recurse into fields used in compatibility checks.
	for (const nodeSchema of schema.definitions.values()) {
		// TODO: Move this assert to a common location so it can be used from both SimpleSchema builders.
		// The set of node kinds is extensible, but the typing of SimpleNodeSchema is not, so we need to check that the schema is one of the known kinds.
		assert(
			nodeSchema instanceof ArrayNodeSchema ||
				nodeSchema instanceof MapNodeSchema ||
				nodeSchema instanceof LeafNodeSchema ||
				nodeSchema instanceof ObjectNodeSchema ||
				nodeSchema instanceof RecordNodeSchema,
			// TODO: New error code.
			0xb60 /* Invalid schema */,
		);

		// TODO: Do we need walkNodeSchema to recurse into fields in this context?
		// Probably not: we are walking all schema definitions unconditionally without worrying about tree order.
		// It is probably enough to just walk the fields of object schema here.

		// Read properties that are needed for compatibility and copy them to a SimpleNodeSchema.
		// TODO: Refactor copy methods to avoid duplication with viewSchemaToSimpleSchema.
		// TODO: Does anything need to be done outside of `copyNodeSchema`? Are there any properties on TreeNodeSchema or the root field that need to be handled?
		const simpleNodeSchema = copySchemaObjects ? copyNodeSchema(nodeSchema) : nodeSchema;
		definitions.set(nodeSchema.identifier, simpleNodeSchema);
	}

	return {
		root: copySchemaObjects
			? {
					kind: schema.root.kind,
					allowedTypesIdentifiers: schema.root.allowedTypesIdentifiers,
					metadata: schema.root.metadata,
					persistedMetadata: schema.root.persistedMetadata,
					stagedSchemaUpgrades: schema.root.stagedSchemaUpgrades,
				}
			: schema.root, // TODO: Convert the root field
		definitions,
	};
}

/**
 * Copies a {@link SimpleNodeSchema} into a new plain JavaScript object.
 *
 * @remarks Caches the result on the input schema for future calls.
 */
function copyNodeSchema(schema: SimpleNodeSchema): SimpleNodeSchema {
	const kind = schema.kind;
	switch (kind) {
		case NodeKind.Leaf:
			return copyLeafSchema(schema);
		case NodeKind.Array:
		case NodeKind.Map:
		case NodeKind.Record:
			return copySchemaWithAllowedTypes(schema);
		case NodeKind.Object:
			return copyObjectSchema(schema);
		default:
			unreachableCase(kind);
	}
}

function copyLeafSchema(schema: SimpleLeafNodeSchema): SimpleLeafNodeSchema {
	return {
		kind: NodeKind.Leaf,
		leafKind: schema.leafKind,
		metadata: schema.metadata,
		persistedMetadata: schema.persistedMetadata,
	};
}

function copySchemaWithAllowedTypes(
	schema: SimpleMapNodeSchema | SimpleArrayNodeSchema | SimpleRecordNodeSchema,
): SimpleMapNodeSchema | SimpleArrayNodeSchema | SimpleRecordNodeSchema {
	return {
		kind: schema.kind,
		allowedTypesIdentifiers: schema.allowedTypesIdentifiers,
		metadata: schema.metadata,
		persistedMetadata: schema.persistedMetadata,
	};
}

function copyObjectSchema(schema: SimpleObjectNodeSchema): SimpleObjectNodeSchema {
	const fields: Map<string, SimpleObjectFieldSchema> = new Map();
	for (const [propertyKey, field] of schema.fields) {
		// field already is a SimpleObjectFieldSchema, but copy the subset of the properties needed by this interface to get a clean simple object.
		fields.set(propertyKey, {
			kind: field.kind,
			allowedTypesIdentifiers: field.allowedTypesIdentifiers,
			metadata: field.metadata,
			persistedMetadata: field.persistedMetadata,
			storedKey: field.storedKey,
			stagedSchemaUpgrades: field.stagedSchemaUpgrades,
		});
	}

	return {
		kind: NodeKind.Object,
		fields,
		metadata: schema.metadata,
		persistedMetadata: schema.persistedMetadata,
		allowUnknownOptionalFields: schema.allowUnknownOptionalFields,
	};
}
