/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import {
	EmptyKey,
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	type ValueSchema,
} from "../core/index.js";
import { FieldKind, NodeKind } from "../simple-tree/index.js";
import { fail } from "../util/index.js";

/**
 * TODO
 * @internal
 */
export interface JsonableTreeSchema {
	/**
	 * Maps all registered node schemas based on their unique IDs.
	 */
	definitions: Record<TreeNodeSchemaIdentifier, JsonableStoredNodeSchema>;

	/**
	 * The field schema for the root of the tree.
	 */
	rootSchema: JsonableStoredFieldSchema;
}

/**
 * TODO
 * @internal
 */
export interface JsonableStoredNodeSchemaBase {
	readonly kind: NodeKind; // TODO: string representation
	readonly id: TreeNodeSchemaIdentifier;
}

/**
 * TODO
 * @internal
 */
export interface JsonableStoredObjectNodeSchema extends JsonableStoredNodeSchemaBase {
	readonly kind: NodeKind.Object;
	readonly fields: Record<TreeNodeSchemaIdentifier, JsonableStoredFieldSchema>;
}

/**
 * TODO
 * @internal
 */
export interface JsonableStoredArrayNodeSchema extends JsonableStoredNodeSchemaBase {
	readonly kind: NodeKind.Array;
	readonly allowedTypes: readonly TreeNodeSchemaIdentifier[];
}

/**
 * TODO
 * @internal
 */
export interface JsonableStoredMapNodeSchema extends JsonableStoredNodeSchemaBase {
	readonly kind: NodeKind.Map;
	readonly allowedTypes: readonly TreeNodeSchemaIdentifier[];
}

/**
 * TODO
 * @internal
 */
export interface JsonableStoredLeafNodeSchema extends JsonableStoredNodeSchemaBase {
	readonly kind: NodeKind.Leaf;
	readonly type: ValueSchema;
}

/**
 * TODO
 * @internal
 */
export type JsonableStoredNodeSchema =
	| JsonableStoredLeafNodeSchema
	| JsonableStoredMapNodeSchema
	| JsonableStoredArrayNodeSchema
	| JsonableStoredObjectNodeSchema;

/**
 * TODO
 * @internal
 */
export interface JsonableStoredFieldSchema {
	readonly kind: FieldKind; // TODO: string representation
	readonly allowedTypes: readonly TreeNodeSchemaIdentifier[];
}

// TODO: cache entries based on identifiers to prevent infinite recursion

/**
 * TODO
 */
export function toJsonableFieldSchema(
	fieldSchema: TreeFieldStoredSchema,
): JsonableStoredFieldSchema {
	const allowedTypes: TreeNodeSchemaIdentifier[] = [];
	for (const type of fieldSchema.types ?? []) {
		allowedTypes.push(type);
	}
	return {
		kind: FieldKind.Optional, // TODO: actually get this from the schema
		allowedTypes,
	};
}

function toJsonableNodeSchema(
	schemaMap: ReadonlyMap<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>,
	type: TreeNodeSchemaIdentifier,
): JsonableStoredNodeSchema {
	const nodeSchema = schemaMap.get(type);
	assert(nodeSchema !== undefined, "Encountered a schema type without a definition.");
	if (nodeSchema instanceof ObjectNodeStoredSchema) {
		return toJsonableObjectNodeSchema(nodeSchema, type);
	} else if (nodeSchema instanceof MapNodeStoredSchema) {
		return toJsonableMapNodeSchema(nodeSchema, type);
	} else if (nodeSchema instanceof LeafNodeStoredSchema) {
		return toJsonableLeafNodeSchema(nodeSchema, type);
	} else {
		fail("Encountered an unknown node schema type.");
	}
}

function toJsonableObjectNodeSchema(
	schema: ObjectNodeStoredSchema,
	schemaIdentifier: TreeNodeSchemaIdentifier,
): JsonableStoredObjectNodeSchema | JsonableStoredArrayNodeSchema {
	if (schema.objectNodeFields.size === 1 && schema.objectNodeFields.has(EmptyKey)) {
		// Array case
		const allowedTypes: TreeNodeSchemaIdentifier[] = [];
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		for (const type of schema.objectNodeFields.get(EmptyKey)!.types ?? []) {
			allowedTypes.push(type);
		}
		return {
			id: schemaIdentifier,
			kind: NodeKind.Array,
			allowedTypes,
		} satisfies JsonableStoredArrayNodeSchema;
	} else {
		// Object case
		const fields: Record<string, JsonableStoredFieldSchema> = {};
		for (const [fieldKey, fieldSchema] of schema.objectNodeFields) {
			fields[fieldKey] = toJsonableFieldSchema(fieldSchema);
		}
		return {
			id: schemaIdentifier,
			kind: NodeKind.Object,
			fields,
		} satisfies JsonableStoredObjectNodeSchema;
	}
}

function toJsonableMapNodeSchema(
	schema: MapNodeStoredSchema,
	schemaIdentifier: TreeNodeSchemaIdentifier,
): JsonableStoredMapNodeSchema {
	const allowedTypes: TreeNodeSchemaIdentifier[] = [];
	for (const type of schema.mapFields.types ?? []) {
		allowedTypes.push(type);
	}
	return {
		id: schemaIdentifier,
		kind: NodeKind.Map,
		allowedTypes,
	};
}

function toJsonableLeafNodeSchema(
	schema: LeafNodeStoredSchema,
	schemaIdentifier: TreeNodeSchemaIdentifier,
): JsonableStoredLeafNodeSchema {
	return {
		id: schemaIdentifier,
		kind: NodeKind.Leaf,
		type: schema.leafValue,
	};
}
