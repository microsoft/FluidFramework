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
export interface JsonableStoredNodeSchema {
	readonly kind: NodeKind;
	readonly name: string;
}

/**
 * TODO
 * @internal
 */
export interface JsonableStoredObjectNodeSchema extends JsonableStoredNodeSchema {
	readonly kind: NodeKind.Object;
	readonly fields: Record<string, JsonableStoredFieldSchema>;
}

/**
 * TODO
 * @internal
 */
export interface JsonableStoredArrayNodeSchema extends JsonableStoredNodeSchema {
	readonly kind: NodeKind.Array;
	readonly allowedTypes: readonly JsonableStoredNodeSchema[];
}

/**
 * TODO
 * @internal
 */
export interface JsonableStoredMapNodeSchema extends JsonableStoredNodeSchema {
	readonly kind: NodeKind.Map;
	readonly allowedTypes: readonly JsonableStoredNodeSchema[];
}

/**
 * TODO
 * @internal
 */
export interface JsonableStoredLeafNodeSchema extends JsonableStoredNodeSchema {
	readonly kind: NodeKind.Leaf;
	readonly type: ValueSchema;
}

/**
 * TODO
 * @internal
 */
export type JsonableStoredNodeSchemas =
	| JsonableStoredLeafNodeSchema
	| JsonableStoredMapNodeSchema
	| JsonableStoredArrayNodeSchema
	| JsonableStoredObjectNodeSchema;

/**
 * TODO
 * @internal
 */
export interface JsonableStoredFieldSchema {
	readonly kind: FieldKind;
	readonly allowedTypes: readonly JsonableStoredNodeSchema[];
}

// TODO: cache entries based on identifiers to prevent infinite recursion

/**
 * TODO
 */
export function toJsonableFieldSchema(
	schemaMap: ReadonlyMap<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>,
	fieldSchema: TreeFieldStoredSchema,
): JsonableStoredFieldSchema {
	const allowedTypes: JsonableStoredNodeSchema[] = [];
	for (const type of fieldSchema.types ?? []) {
		allowedTypes.push(toJsonableNodeSchema(schemaMap, type));
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
		return toJsonableObjectNodeSchema(schemaMap, nodeSchema, type);
	} else if (nodeSchema instanceof MapNodeStoredSchema) {
		return toJsonableMapNodeSchema(schemaMap, nodeSchema, type);
	} else if (nodeSchema instanceof LeafNodeStoredSchema) {
		return toJsonableLeafNodeSchema(schemaMap, nodeSchema, type);
	} else {
		fail("Encountered an unknown node schema type.");
	}
}

function toJsonableObjectNodeSchema(
	schemaMap: ReadonlyMap<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>,
	schema: ObjectNodeStoredSchema,
	schemaIdentifier: TreeNodeSchemaIdentifier,
): JsonableStoredObjectNodeSchema | JsonableStoredArrayNodeSchema {
	if (schema.objectNodeFields.size === 1 && schema.objectNodeFields.has(EmptyKey)) {
		// Array case
		const allowedTypes: JsonableStoredNodeSchema[] = [];
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		for (const type of schema.objectNodeFields.get(EmptyKey)!.types ?? []) {
			allowedTypes.push(toJsonableNodeSchema(schemaMap, type));
		}
		return {
			name: schemaIdentifier,
			kind: NodeKind.Array,
			allowedTypes,
		} satisfies JsonableStoredArrayNodeSchema;
	} else {
		// Object case
		const fields: Record<string, JsonableStoredFieldSchema> = {};
		for (const [fieldKey, fieldSchema] of schema.objectNodeFields) {
			fields[fieldKey] = toJsonableFieldSchema(schemaMap, fieldSchema);
		}
		return {
			name: schemaIdentifier,
			kind: NodeKind.Object,
			fields,
		} satisfies JsonableStoredObjectNodeSchema;
	}
}

function toJsonableMapNodeSchema(
	schemaMap: ReadonlyMap<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>,
	nodeSchema: MapNodeStoredSchema,
	type: TreeNodeSchemaIdentifier,
): JsonableStoredNodeSchema {
	throw new Error("Function not implemented.");
}

function toJsonableLeafNodeSchema(
	schemaMap: ReadonlyMap<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>,
	nodeSchema: LeafNodeStoredSchema,
	type: TreeNodeSchemaIdentifier,
): JsonableStoredNodeSchema {
	throw new Error("Function not implemented.");
}
